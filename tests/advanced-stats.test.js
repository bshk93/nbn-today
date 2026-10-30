// Unit tests for AdvancedStats in /advanced-stats.js — the player rate stats
// on /stats/seasons and player pages.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/advanced-stats.test.js
//
// What is pinned:
//   - The formulas, on numbers worked out by hand.
//   - A player on the floor every minute gets his plain share of the team.
//   - Two stints add as sums, so a combined line is the rate of the totals,
//     not the average of the two rates.
//   - No context, or no minutes, gives nulls rather than NaN or Infinity.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const g = { console };
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'advanced-stats.js'), 'utf8'), g);
const { player, addContext, parseContext } = g.AdvancedStats;

let failed = 0;
function near(name, got, want) {
  if (got !== null && want !== null && Math.abs(got - want) < 1e-9) { console.log(`ok   ${name}`); return; }
  if (got === want) { console.log(`ok   ${name}`); return; }
  failed++;
  console.log(`FAIL ${name}: got ${got}, want ${want}`);
}

// One 48-minute game. The team: 40 FGM, 85 FGA, 20 FTA, 12 TOV, 10 OREB,
// 33 DREB. The opponent: 88 FGA, 30 3PA, 9 OREB, 35 DREB. 98 possessions.
const ctx = parseContext({ G: '1', TM_MIN: '240', TM_FGM: '40', TM_FGA: '85', TM_FTA: '20',
  TM_TOV: '12', TM_OREB: '10', TM_DREB: '33', OPP_FGA: '88', OPP_3PA: '30',
  OPP_OREB: '9', OPP_DREB: '35', POSS: '98' });

// He played 24 of 48 minutes: half the floor time.
const half = { MIN: 24, FGM: 8, FGA: 17, '3PA': 5, FTA: 4, TOV: 2, OREB: 2, DREB: 5,
               AST: 4, STL: 1, BLK: 2 };
const r = player(half, ctx);
near('usage', r.usg, (17 + 0.44 * 4 + 2) / (0.5 * (85 + 0.44 * 20 + 12)));
near('assist % leaves his own makes out', r.ast, 4 / (0.5 * 40 - 8));
near('offensive rebound %', r.orb, 2 / (0.5 * (10 + 35)));
near('defensive rebound %', r.drb, 5 / (0.5 * (33 + 9)));
near('rebound %', r.trb, 7 / (0.5 * (10 + 33 + 9 + 35)));
near('steal % per possession', r.stl, 1 / (0.5 * 98));
near('block % of twos only', r.blk, 2 / (0.5 * (88 - 30)));
near('turnover % per play', r.tov, 2 / (17 + 0.44 * 4 + 2));
near('three-point rate', r.par3, 5 / 17);
near('free throw rate', r.ftr, 4 / 17);

// The whole game: his share is 1, so usage is his plays over the team's.
const full = player({ ...half, MIN: 48 }, ctx);
near('every minute: usage is a plain share', full.usg, (17 + 0.44 * 4 + 2) / (85 + 0.44 * 20 + 12));

// Two stints: totals, not an average of rates.
const a = parseContext({ G: 1, TM_MIN: 240, TM_FGM: 40, TM_FGA: 80, TM_FTA: 20, TM_TOV: 10,
  TM_OREB: 10, TM_DREB: 30, OPP_FGA: 85, OPP_3PA: 30, OPP_OREB: 10, OPP_DREB: 30, POSS: 95 });
const b = parseContext({ G: 3, TM_MIN: 720, TM_FGM: 120, TM_FGA: 270, TM_FTA: 60, TM_TOV: 36,
  TM_OREB: 30, TM_DREB: 99, OPP_FGA: 260, OPP_3PA: 90, OPP_OREB: 27, OPP_DREB: 105, POSS: 300 });
const both = addContext(a, b);
near('stints add their games', both.G, 4);
near('stints add their possessions', both.POSS, 395);
const p1 = { MIN: 30, FGM: 7, FGA: 15, '3PA': 4, FTA: 4, TOV: 2, OREB: 1, DREB: 6, AST: 5, STL: 1, BLK: 1 };
const p2 = { MIN: 60, FGM: 9, FGA: 20, '3PA': 6, FTA: 6, TOV: 3, OREB: 2, DREB: 9, AST: 6, STL: 2, BLK: 0 };
const sum = {};
Object.keys(p1).forEach(k => { sum[k] = p1[k] + p2[k]; });
near('combined usage is the rate of the totals',
  player(sum, both).usg,
  (35 + 0.44 * 10 + 5) / ((90 / (960 / 5)) * (350 + 0.44 * 80 + 46)));
near('a missing stint adds as nothing', addContext(null, a).TM_FGA, 80);

// Nothing to divide by.
const none = player(half, null);
near('no context: no usage', none.usg, null);
near('no context: turnover % still known', none.tov, r.tov);
near('no minutes: no usage', player({ ...half, MIN: 0 }, ctx).usg, null);
near('no shots: no three-point rate', player({ ...half, FGA: 0 }, ctx).par3, null);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall advanced-stats checks passed');
