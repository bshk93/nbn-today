// Your team and your players, called out wherever they appear.
//
// A member with an open front-office tenure (nav.js's _fetchMyTeam) sees every
// row, card or link that names their team or a player on their current roster
// tinted in the team's colour with a bar on its left edge (§ Mine callout in
// css/components.css). It is the one implementation: pages don't mark rows
// themselves, they only *link* — the module finds `/teams/ABB/` and
// `/players/?p=<slug>` links, plus `data-team` / `data-slug` and the explicit
// `data-mine-team` / `data-mine-slug` hooks for markup that has no link. What
// gets painted is the closest `[data-mine-scope]`, `tr` or `li`, else the
// matched element itself.
//
// Loaded by nav.js (like ui-select.js), so no page includes it. A page that
// builds its own canvas or SVG reads window.NbnMine.isMine().
//
// Off switch: "Highlight my team" in the account menu (nbn_highlight_mine).
// Nothing is marked on your own team page, where every row would be.
//
// The pure half (classify, scopeFor) is pinned by tests/my-team.test.js.
(function (global) {
  const CACHE_KEY = 'nbn_mine_cache';      // {team, slugs, at}
  // How it looks, per browser: 'team' (the default: the team's colour),
  // 'c:<swatch>' (a colour of the member's choosing), 'star', or 'off'.
  // 'on', from before there was a choice, reads as 'team'.
  const TOGGLE_KEY = 'nbn_highlight_mine';
  // The colours on offer instead of the team's. Theme tokens, so each is set
  // for every theme; none of them red or green, which mean danger and success.
  const SWATCHES = [
    { id: 'blue', label: 'Blue', token: '--accent' },
    { id: 'sky', label: 'Sky', token: '--cat-sky' },
    { id: 'teal', label: 'Teal', token: '--cat-teal' },
    { id: 'violet', label: 'Violet', token: '--purple' },
    { id: 'gold', label: 'Gold', token: '--gold' },
    { id: 'orange', label: 'Orange', token: '--cat-orange' },
  ];
  const ROSTER_TTL_MS = 15 * 60 * 1000;
  const MATCH_SELECTOR = 'a[href*="/teams/"], a[href*="/players/"], [data-team], [data-slug], [data-mine-team], [data-mine-slug]';
  // Never marked: the sidebar and nav (the Teams panel would light up on
  // every page), identity bands (data-team there is a colour hook), and
  // anything a page opts out.
  const SKIP_SELECTOR = '[data-mine-off], .sidebar, nav, .ui-header';

  const TEAM_PATH = /^\/teams\/([a-z]{3})(?:[/?#]|$)/i;

  // ── Pure ──────────────────────────────────────────────────────────────────

  // What a link points at: {team} for a team page, {slug} for a player page
  // (any /players/ sub-page with ?p=), else null. Relative hrefs resolve
  // against `base`.
  function parseHref(href, base) {
    if (!href) return null;
    let url;
    try { url = new URL(href, base || 'https://nbn.today/'); } catch { return null; }
    const t = TEAM_PATH.exec(url.pathname);
    if (t) return { team: t[1].toUpperCase() };
    if (url.pathname.startsWith('/players/')) {
      const slug = url.searchParams.get('p');
      if (slug) return { slug };
    }
    return null;
  }

  // 'team' | 'player' | null for one element, given the member's team and
  // roster. Reads only tagName, getAttribute — so the tests can hand it
  // plain objects.
  function classify(el, team, slugs, base) {
    if (!team) return null;
    const attr = n => (el.getAttribute ? el.getAttribute(n) : null);
    const has = s => !!s && (slugs.has ? slugs.has(s) : slugs.includes(s));
    const mTeam = attr('data-mine-team') || attr('data-team');
    if (mTeam && mTeam.toUpperCase() === team) return 'team';
    const mSlug = attr('data-mine-slug') || attr('data-slug');
    if (has(mSlug)) return 'player';
    if (String(el.tagName).toUpperCase() === 'A') {
      const target = parseHref(attr('href'), base);
      if (target?.team === team) return 'team';
      if (target?.slug && has(target.slug)) return 'player';
    }
    return null;
  }

  // The element to paint for a match, or null when it sits somewhere that is
  // never marked: the nearest row (data-mine-scope, a table row, a list item,
  // or an element acting as one), else the link a matched span sits in, else
  // the element itself.
  const ROW_SELECTOR = '[data-mine-scope], tr, li, [role="row"], [role="button"]';
  function scopeFor(el) {
    if (el.closest(SKIP_SELECTOR)) return null;
    return el.closest(ROW_SELECTOR)
      || (el.parentElement || el.parent)?.closest?.('a')
      || el;
  }

  // Your own team page: /teams/BOS/ while you are BOS.
  function isOwnTeamPage(pathname, team) {
    const t = TEAM_PATH.exec(pathname || '');
    return !!(t && team && t[1].toUpperCase() === team);
  }

  // SLUGs from a roster CSV (SLUG-only since 2026-08; any column order).
  function rosterSlugs(csv) {
    const lines = String(csv || '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const head = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toUpperCase());
    const i = head.indexOf('SLUG');
    if (i < 0) return [];
    return lines.slice(1)
      .map(l => (l.split(',')[i] || '').trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }

  // The stored choice, normalised: {mode: 'team'|'color'|'star'|'off', swatch}.
  // Anything unknown, including an old 'on' or a swatch since removed, is 'team'.
  function parseStyle(raw) {
    if (raw === 'off' || raw === 'star') return { mode: raw, swatch: null };
    const m = /^c:([a-z]+)$/.exec(raw || '');
    const swatch = m && SWATCHES.find(w => w.id === m[1]);
    return swatch ? { mode: 'color', swatch } : { mode: 'team', swatch: null };
  }

  const pure = { parseHref, classify, scopeFor, isOwnTeamPage, rosterSlugs, parseStyle, SWATCHES, CACHE_KEY, TOGGLE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = pure;
  if (typeof document === 'undefined') return;

  // ── Browser ───────────────────────────────────────────────────────────────

  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private browsing */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* private browsing */ } },
  };
  const readCache = () => { try { return JSON.parse(store.get(CACHE_KEY) || 'null'); } catch { return null; } };

  let team = null;
  let slugs = new Set();
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });

  const style = () => parseStyle(store.get(TOGGLE_KEY));
  const enabled = () => style().mode !== 'off';
  const active = () => !!team && enabled() && !isOwnTeamPage(location.pathname, team);

  function paint(el) {
    const kind = classify(el, team, slugs, location.href);
    if (!kind) return;
    const scope = scopeFor(el);
    if (!scope) return;
    scope.classList.add('is-mine', kind === 'team' ? 'is-mine--team' : 'is-mine--player');
    if (scope === el && getComputedStyle(el).display === 'inline') scope.classList.add('is-mine--inline');
    // A row that clips its own overflow (a card) would cut off a star in the
    // gutter, so its star goes inside, in the corner.
    if (scope.tagName !== 'TR' && getComputedStyle(scope).overflow !== 'visible') scope.classList.add('is-mine--clip');
    // The star style's star, placed whatever the style so switching is
    // instant: absolutely positioned, so it never takes a grid or flex slot.
    // In a table it goes in the first cell, since a row can't hold it.
    const host = scope.tagName === 'TR' ? scope.cells[0] : scope;
    if (host && !host.querySelector(':scope > .is-mine-star')) {
      const star = document.createElement('span');
      star.className = 'ui-icon ui-icon--star is-mine-star';
      star.setAttribute('aria-hidden', 'true');
      host.prepend(star);
    }
  }

  function mark(node) {
    if (!team || !node || node.nodeType !== 1) return;
    if (node.matches(MATCH_SELECTOR)) paint(node);
    node.querySelectorAll(MATCH_SELECTOR).forEach(paint);
  }

  function clearMarks() {
    document.querySelectorAll('.is-mine--team, .is-mine--player').forEach(el =>
      el.classList.remove('is-mine', 'is-mine--team', 'is-mine--player', 'is-mine--inline', 'is-mine--clip'));
    document.querySelectorAll('.is-mine-star').forEach(el => el.remove());
  }

  function sync() {
    if (team) root.dataset.myTeam = team; else delete root.dataset.myTeam;
    root.classList.toggle('mine-on', active());
    const st = style();
    root.dataset.mineStyle = st.mode === 'star' ? 'star' : 'tint';
    // A chosen colour overrides the team's --mine-c (css/team-colors.css).
    if (st.mode === 'color') root.style.setProperty('--mine-c', `var(${st.swatch.token})`);
    else root.style.removeProperty('--mine-c');
  }

  function apply(nextTeam, nextSlugs) {
    const changed = nextTeam !== team || nextSlugs.length !== slugs.size || nextSlugs.some(s => !slugs.has(s));
    team = nextTeam || null;
    slugs = new Set(nextSlugs || []);
    sync();
    if (changed) {
      clearMarks();
      if (document.body) mark(document.body);
      document.dispatchEvent(new CustomEvent('nbn:mine', { detail: { team, slugs: [...slugs] } }));
    }
  }

  // Pages render after their fetches; one observer marks whatever lands.
  let pending = [];
  let timer = null;
  function watch() {
    new MutationObserver(records => {
      if (!team) return;
      for (const r of records) r.addedNodes.forEach(n => { if (n.nodeType === 1) pending.push(n); });
      if (pending.length && !timer) {
        timer = setTimeout(() => {
          const nodes = pending; pending = []; timer = null;
          nodes.forEach(n => { if (n.isConnected) mark(n); });
        }, 30);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  async function refresh() {
    const fetchTeam = typeof global._fetchMyTeam === 'function' ? global._fetchMyTeam : null;
    const nextTeam = fetchTeam ? await fetchTeam().catch(() => null) : null;
    if (!nextTeam) { store.del(CACHE_KEY); apply(null, []); return; }
    const cached = readCache();
    if (cached?.team === nextTeam && Date.now() - (cached.at || 0) < ROSTER_TTL_MS) {
      apply(nextTeam, cached.slugs || []);
      return;
    }
    let roster = cached?.team === nextTeam ? (cached.slugs || []) : [];
    try {
      const r = await fetch(`/data/${nextTeam.toLowerCase()}-roster.csv`);
      if (r.ok) roster = rosterSlugs(await r.text());
    } catch { /* keep what we had */ }
    store.set(CACHE_KEY, JSON.stringify({ team: nextTeam, slugs: roster, at: Date.now() }));
    apply(nextTeam, roster);
  }

  // 'team' | 'c:<swatch>' | 'star' | 'off'.
  function setStyle(value) {
    store.set(TOGGLE_KEY, value);
    sync();
    document.dispatchEvent(new CustomEvent('nbn:mine', { detail: { team, slugs: [...slugs] } }));
  }
  const setEnabled = on => setStyle(on ? 'team' : 'off');

  function isMine(x) {
    if (!team || !x) return false;
    return String(x).toUpperCase() === team || slugs.has(x);
  }

  global.NbnMine = {
    get team() { return team; },
    get slugs() { return [...slugs]; },
    isMine, enabled, setEnabled, refresh, ready,
    style, setStyle, SWATCHES,
    forget() { store.del(CACHE_KEY); },
  };

  function start() {
    // First paint from the cache, then check it against who is signed in.
    const cached = readCache();
    if (cached?.team) apply(cached.team, cached.slugs || []);
    watch();
    refresh().catch(() => {}).finally(() => resolveReady(global.NbnMine));
  }
  // Set the root flags before the body exists, so the first paint is right.
  const early = readCache();
  if (early?.team) { team = early.team; sync(); team = null; }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})(typeof window !== 'undefined' ? window : globalThis);
