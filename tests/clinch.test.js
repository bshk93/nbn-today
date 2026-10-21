// Unit tests for Clinch.marks in /clinch.js — the x / pi / e marks on
// /standings.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/clinch.test.js
//
// What is pinned:
//   - Nothing is marked at the start of a season.
//   - A tie goes against the team being marked, both ways.
//   - The thresholds are seeds 6 and 10, and the 1 seed gets its own mark.
//   - A finished season marks everyone.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const g = { console };
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'clinch.js'), 'utf8'), g);
const { marks } = g.Clinch;

let failed = 0;
function eq(name, got, want) {
  if (got === want) { console.log(`ok   ${name}`); return; }
  failed++;
  console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// 15 teams, T0..T14, each with the given [w, l]; 80 games each.
const conf = rows => rows.map(([w, l], i) => ({ team: 'T' + i, w, l, games: 80 }));

{
  const m = marks(conf(Array(15).fill([0, 0])));
  eq('opening night marks nobody', Object.values(m).filter(Boolean).length, 0);
}

{
  // T0 has won 60 and lost none; nobody else can get past 59.
  const rows = [[60, 0], ...Array(14).fill([20, 21])];
  rows[1] = [21, 59]; // max 21
  const m = marks(conf(rows));
  eq('runaway leader clinches the 1 seed', m.T0, 'z');
}

{
  // T0 at 50 wins. Five others can still reach 50 (tie), the rest can't.
  const rows = [[50, 20]];
  for (let i = 0; i < 5; i++) rows.push([40, 30]);   // max 50
  for (let i = 0; i < 9; i++) rows.push([30, 41]);   // max 39
  const m = marks(conf(rows));
  eq('five possible ties is still a clinched top 6', m.T0, 'x');
  rows[6] = [40, 30];                                 // a sixth team can tie
  eq('six possible ties is not', marks(conf(rows)).T0, 'pi');
}

{
  // T14 can reach at most 30. Ten teams already have 31: eliminated.
  const rows = Array(10).fill([31, 30]);
  rows.push([25, 40], [25, 40], [25, 40], [25, 40], [20, 50]);
  const m = marks(conf(rows));
  eq('ten teams out of reach eliminates', m.T14, 'e');
  // Nine out of reach and one level is not elimination: the tie could go either way.
  rows[9] = [30, 31];
  eq('a reachable tie is not elimination', marks(conf(rows)).T14, '');
}

{
  // A finished season: every team is marked by its place.
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push([65 - i * 3, 15 + i * 3]);
  const m = marks(conf(rows));
  eq('finished: 1st', m.T0, 'z');
  eq('finished: 6th', m.T5, 'x');
  eq('finished: 7th', m.T6, 'pi');
  eq('finished: 10th', m.T9, 'pi');
  eq('finished: 11th', m.T10, 'e');
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
