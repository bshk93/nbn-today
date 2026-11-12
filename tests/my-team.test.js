// Unit tests for the pure half of /my-team.js — the "your team and your
// players" callouts.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/my-team.test.js
//
// What is pinned:
//   - Team links match in either case, with or without a trailing slash, and
//     never another team or a page that merely starts with the letters.
//   - Player links match on ?p= for any /players/ page, and only for a slug
//     on the roster.
//   - data-team / data-slug and the explicit data-mine-* hooks match.
//   - The painted scope is the nearest data-mine-scope / tr / li, else the
//     element itself; the sidebar, nav, identity bands and data-mine-off never.
//   - Your own team page is recognised (it is never marked).
//   - Roster CSVs read their SLUG column in any position.

const path = require('path');
const M = require(path.join(__dirname, '..', 'my-team.js'));

let failed = 0, passed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else { failed++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

// A tiny element: tag, attributes, and a parent chain for closest().
function el(tag, attrs = {}, parent = null, classes = []) {
  const node = {
    tagName: tag.toUpperCase(), attrs, parent, classes,
    getAttribute(n) { return n in attrs ? attrs[n] : null; },
    matchesOne(sel) {
      sel = sel.trim();
      const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
      if (a) return a[2] === undefined ? a[1] in attrs : attrs[a[1]] === a[2];
      if (sel.startsWith('.')) return classes.includes(sel.slice(1));
      return node.tagName === sel.toUpperCase();
    },
    closest(sel) {
      const parts = sel.split(',');
      for (let n = node; n; n = n.parent) if (parts.some(p => n.matchesOne(p))) return n;
      return null;
    },
  };
  return node;
}

const slugs = new Set(['tatum-jayson', 'brown-jaylen']);
const T = 'BOS';
const cls = (attrs, tag = 'a') => M.classify(el(tag, attrs), T, slugs);

// ── Team links ───────────────────────────────────────────────────────────────
eq('team link upper', cls({ href: '/teams/BOS/' }), 'team');
eq('team link lower', cls({ href: '/teams/bos/' }), 'team');
eq('team link no slash', cls({ href: '/teams/BOS' }), 'team');
eq('team link with hash', cls({ href: '/teams/BOS/#schedule' }), 'team');
eq('team link absolute', cls({ href: 'https://nbn.today/teams/bos/' }), 'team');
eq('other team', cls({ href: '/teams/DEN/' }), null);
eq('longer segment is not a team', cls({ href: '/teams/BOSX/' }), null);
eq('team link on a non-anchor is ignored', cls({ href: '/teams/BOS/' }, 'div'), null);

// ── Player links ─────────────────────────────────────────────────────────────
eq('roster player', cls({ href: '/players/?p=tatum-jayson' }), 'player');
eq('roster player, sub-page', cls({ href: '/players/ratings/?p=brown-jaylen' }), 'player');
eq('encoded slug', cls({ href: '/players/?p=tatum%2Djayson' }), 'player');
eq('not on the roster', cls({ href: '/players/?p=jokic-nikola' }), null);
eq('players index, no p', cls({ href: '/players/' }), null);

// ── Attribute hooks ──────────────────────────────────────────────────────────
eq('data-team', cls({ 'data-team': 'BOS' }, 'div'), 'team');
eq('data-team lower', cls({ 'data-team': 'bos' }, 'div'), 'team');
eq('data-team other', cls({ 'data-team': 'MIA' }, 'div'), null);
eq('data-mine-team', cls({ 'data-mine-team': 'BOS' }, 'span'), 'team');
eq('data-slug', cls({ 'data-slug': 'tatum-jayson' }, 'tr'), 'player');
eq('data-mine-slug', cls({ 'data-mine-slug': 'brown-jaylen' }, 'div'), 'player');
eq('data-slug off roster', cls({ 'data-slug': 'curry-stephen' }, 'tr'), null);
eq('no team means nothing', M.classify(el('a', { href: '/teams/BOS/' }), null, slugs), null);
eq('array slugs work too', M.classify(el('a', { href: '/players/?p=tatum-jayson' }), T, ['tatum-jayson']), 'player');

// ── Scope ────────────────────────────────────────────────────────────────────
{
  const table = el('table');
  const tr = el('tr', {}, table);
  const td = el('td', {}, tr);
  const a = el('a', { href: '/teams/BOS/' }, td);
  eq('scope is the row', M.scopeFor(a) === tr, true);

  const ul = el('ul');
  const li = el('li', {}, ul);
  const a2 = el('a', {}, li);
  eq('scope is the list item', M.scopeFor(a2) === li, true);

  const card = el('div', { 'data-mine-scope': '' });
  const inner = el('li', {}, card);           // the nearest wins
  const a3 = el('a', {}, inner);
  eq('nearest scope wins', M.scopeFor(a3) === inner, true);
  const a4 = el('a', {}, card);
  eq('data-mine-scope', M.scopeFor(a4) === card, true);

  const p = el('p');
  const a5 = el('a', {}, p);
  eq('bare link is its own scope', M.scopeFor(a5) === a5, true);

  const btnRow = el('div', { role: 'button' });
  const span = el('span', { 'data-team': 'BOS' }, btnRow);
  eq('role=button is a row', M.scopeFor(span) === btnRow, true);
  const rowLink = el('a', { href: '/x/' }, el('div'));
  const inLink = el('span', { 'data-team': 'BOS' }, rowLink);
  eq('span inside a link paints the link', M.scopeFor(inLink) === rowLink, true);

  const side = el('aside', {}, null, ['sidebar']);
  eq('sidebar never', M.scopeFor(el('a', {}, el('li', {}, side))), null);
  const nav = el('nav');
  eq('nav never', M.scopeFor(el('a', {}, nav)), null);
  const band = el('header', { 'data-team': 'BOS' }, null, ['ui-header']);
  eq('identity band never', M.scopeFor(band), null);
  const off = el('section', { 'data-mine-off': '' });
  eq('data-mine-off never', M.scopeFor(el('a', {}, el('tr', {}, off))), null);
  // A work page (committee dashboards, worklists) opts out on <body>.
  const offPage = el('body', { 'data-mine-off': '' });
  eq('data-mine-off on body never', M.scopeFor(el('a', {}, el('li', {}, el('main', {}, offPage)))), null);
}

// ── Own team page ────────────────────────────────────────────────────────────
eq('own team page', M.isOwnTeamPage('/teams/bos/', 'BOS'), true);
eq('own team page upper', M.isOwnTeamPage('/teams/BOS/', 'BOS'), true);
eq('another team page', M.isOwnTeamPage('/teams/den/', 'BOS'), false);
eq('not a team page', M.isOwnTeamPage('/standings/', 'BOS'), false);

// ── Roster CSV ───────────────────────────────────────────────────────────────
eq('slug-only roster', M.rosterSlugs('SLUG\ntatum-jayson\nbrown-jaylen\n'), ['tatum-jayson', 'brown-jaylen']);
eq('crlf and quotes', M.rosterSlugs('"SLUG"\r\n"tatum-jayson"\r\n'), ['tatum-jayson']);
eq('slug in another column', M.rosterSlugs('PLAYER,SLUG\nTatum,tatum-jayson\n'), ['tatum-jayson']);
eq('no slug column', M.rosterSlugs('PLAYER\nTatum\n'), []);
eq('empty', M.rosterSlugs(''), []);

// ── Style choice ─────────────────────────────────────────────────────────────
eq('default is team colour', M.parseStyle(null).mode, 'team');
eq('old "on" is team colour', M.parseStyle('on').mode, 'team');
eq('off', M.parseStyle('off').mode, 'off');
eq('star', M.parseStyle('star').mode, 'star');
eq('a swatch', [M.parseStyle('c:teal').mode, M.parseStyle('c:teal').swatch.token], ['color', '--cat-teal']);
eq('an unknown swatch falls back to team', M.parseStyle('c:mauve').mode, 'team');
eq('junk falls back to team', M.parseStyle('c:<script>').mode, 'team');
eq('swatches are theme tokens, never a literal', M.SWATCHES.every(w => /^--[a-z-]+$/.test(w.token)), true);
eq('no red or green swatch (danger / success)', M.SWATCHES.some(w => /danger|success/.test(w.token)), false);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
