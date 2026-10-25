// Unit tests for AwardRace.ladder in /award-race.js — the formula ladders on
// /awards/race.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/award-race.test.js
//
// What is pinned:
//   - A player needs half the games of the season's leader to qualify.
//   - A traded player is one line, credited to his latest team, with his
//     win % weighted by games with each team.
//   - ROTY takes players in their first NBN season, drafted that year or not,
//     falling back to the draft class in the league's first season; each
//     carries his draft slot (the homepage's Rookie Watch shows it); MIP needs 20 games last season.
//   - 6MOY counts only games with known starters, and is empty without them;
//     a sixth man started fewer than half of them (exactly half is out).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const g = {};
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'award-race.js'), 'utf8'), g);
const { ladder, players } = g.AwardRace;

let failed = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { console.log(`ok   ${name}`); return; }
  failed++;
  console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const row = (slug, season, team, G, GMSC, extra = {}) => ({
  SLUG: slug, PLAYER: slug.toUpperCase(), SEASON: season, TEAM: team, G: String(G), MIN: String(G * 30),
  PTS: String(G * 20), REB: String(G * 5), AST: String(G * 5), STL: String(G), BLK: String(G),
  GMSC: String(GMSC), LAST_DATE: extra.last || '2026-01-01', NBN_DFT_YR: 'dft' in extra ? extra.dft : '2020',
  NBN_DFT_R: extra.rnd || '', NBN_DFT_P: extra.pick || '',
});
const pct = { '26-27|AAA': 0.75, '26-27|BBB': 0.25, '25-26|AAA': 0.5 };

const rows = [
  row('star', '26-27', 'AAA', 10, 200),
  row('bench', '26-27', 'BBB', 10, 150),
  row('cameo', '26-27', 'AAA', 4, 120),                                   // under half of 10: out
  row('traded', '26-27', 'AAA', 4, 60, { last: '2026-01-01' }),
  row('traded', '26-27', 'BBB', 6, 90, { last: '2026-02-01' }),
  row('rook', '26-27', 'BBB', 10, 100, { dft: '2026', rnd: '1', pick: '3' }),
  row('star', '25-26', 'AAA', 70, 1050),                                  // 15/g → 20/g
  row('bench', '25-26', 'AAA', 10, 50),                                   // only 10 games
  row('traded', '25-26', 'BBB', 5, 25),                                   // played before: no rookie
];
const rookieRows = [...rows,
  row('lateDebut', '26-27', 'AAA', 10, 80, { dft: '2025' }),               // drafted last year, first season now
  row('udfa', '26-27', 'BBB', 10, 70, { dft: '' }),                       // undrafted, first season now
];

eq('half the leader’s games to qualify', ladder('MVP', rows, '26-27', pct).map(p => p.slug).includes('cameo'), false);
const t = players(rows, '26-27', pct).find(p => p.slug === 'traded');
eq('a traded player is one line', [t.G, t.GMSC], [10, 150]);
eq('credited to his latest team', t.team, 'BBB');
eq('win % weighted by games with each team', t.win, (4 * 0.75 + 6 * 0.25) / 10);
eq('MVP weights by win %', ladder('MVP', rows, '26-27', pct)[0].slug, 'star');
eq('ROTY is everyone in his first NBN season', ladder('ROTY', rookieRows, '26-27', pct).map(p => p.slug), ['rook', 'lateDebut', 'udfa']);
eq('the league’s first season falls back to its draft class',
  ladder('ROTY', [...rows.filter(r => r.SEASON === '26-27'), row('vet', '26-27', 'AAA', 10, 300, { dft: '2015' })], '26-27', pct).map(p => p.slug), ['rook']);
eq('a rookie carries his draft slot', (({ draftRound, draftPick }) => [draftRound, draftPick])(ladder('ROTY', rows, '26-27', pct)[0]), ['1', '3']);
eq('MIP needs 20 games last season', ladder('MIP', rows, '26-27', pct).map(p => p.slug), ['star']);
eq('6MOY is empty with no starts data', ladder('6MOY', rows, '26-27', pct), []);

const starts = { players: { star: { gs: 10 }, traded: { gs: 2 }, rook: { gs: 5 } }, team_games_known: { AAA: 10, BBB: 10 } };
const six = ladder('6MOY', rows, '26-27', pct, { starts });
eq('6MOY: more off the bench than started, never-starters included; half is out', six.map(p => p.slug), ['bench', 'traded']);
eq('6MOY: known games capped at his own', six.find(p => p.slug === 'traded').known, 10);
const none = ladder('6MOY', rows, '26-27', pct, { starts: { players: {}, team_games_known: {} } });
eq('6MOY: no known starters, nobody qualifies', none, []);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
