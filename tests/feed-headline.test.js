// Unit tests for FeedTypes.headline in /feed-types.js — the line the homepage
// feed shows for a ledger entry, built from its details rather than the
// office-facing `description`.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/feed-headline.test.js
//
// What is pinned:
//   - The common moves read as a sentence naming the team and player.
//   - Office bookkeeping (a hard-cap correction) stays out of the public feed.
//   - A type this file doesn't know falls back to its description, so a new
//     ledger type still shows up instead of vanishing.
//   - A trade names every team and says who got what.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const g = { console };
g.window = g;
vm.createContext(g);
for (const f of ['contract.js', 'feed-types.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), g);
}

const NAMES = { 'conley-mike': 'Mike Conley', 'hayes-jaxson': 'Jaxson Hayes', 'clayton-walter': 'Walter Clayton',
  'walker-lonnie': 'Lonnie Walker', 'paul-chris': 'Chris Paul', 'smith-dru': 'Dru Smith' };
const ctx = {
  esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  name: slug => NAMES[slug] || slug,
  team: abbr => `[${abbr}]`,
};
const text = h => h && h.html.replace(/<[^>]+>/g, '');

let failed = 0;
function check(label, got, want) {
  if (got === want) { console.log(`ok   ${label}`); return; }
  failed++;
  console.log(`FAIL ${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`);
}
const H = t => g.FeedTypes.headline(t, ctx);

const sign = H({ type: 'sign', description: 'FA round ffa-07aa84 — offer #195 won the ballot',
  details: { player: 'conley-mike', team: 'mil', contract: { type: 'player', salaries: { '26-27': '$2449421' }, cap_holds: { '27-28': 'UFA' } } } });
check('sign: headline', text(sign), '[MIL] sign Mike Conley');
check('sign: contract line', sign.sub, '1 yr, $2.4M');

const trade = H({ type: 'trade', description: 'Trade 52', details: {
  teams: ['LAL', 'UTA'],
  transfers: [
    { from_team: 'UTA', to_team: 'LAL', assets: [{ type: 'pick', year: 2027, round: 2, orig: 'ATL' }] },
    { from_team: 'LAL', to_team: 'UTA', assets: [{ type: 'player', slug: 'hayes-jaxson' }, { type: 'player', slug: 'clayton-walter' }] },
  ] } });
check('trade: headline', text(trade), '[LAL] and [UTA] make a trade');
check('trade: who got what', trade.sub, 'LAL get 2027 ATL 2nd · UTA get Jaxson Hayes and Walter Clayton');

const waive = H({ type: 'waiver_clear', description: '', details: { player: 'walker-lonnie', released_by: 'SAC', outcome: 'unclaimed' } });
check('waivers: an empty description still reads', text(waive), 'Lonnie Walker clears waivers');

const release = H({ type: 'release', details: { player: 'walker-lonnie', team: 'SAC', dead_cap: { '26-27': '$3,506,659', '27-28': '$3,700,321' } } });
check('release: dead cap summed', release.sub, '$7.2M dead cap');

check('retirement reads as one', text(H({ type: 'void_player', details: { player: 'paul-chris', team: 'ORL', reason: 'Retired in real life (§ 5.1)' } })), 'Chris Paul retires');

const os = H({ type: 'offer_sheet_decision', details: { player: 'smith-dru', outcome: 'not_matched', offering_team: 'SAC', retaining_team: 'HOU', contract: {} } });
check('offer sheet not matched', text(os), 'Dru Smith heads to [SAC]');

check('hard-cap bookkeeping is hidden', H({ type: 'set_hard_cap_level', description: 'Clear DEN …', details: { team: 'DEN' } }), null);
check('unknown type falls back to its description',
  text(H({ type: 'something_new', description: 'A new kind of move', details: { player: 'conley-mike' } })), 'A new kind of move');
check('names are escaped', text(H({ type: 'renounce', details: { player: '<b>x', team: 'CHA' } })), '[CHA] renounce their rights to &lt;b>x');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
