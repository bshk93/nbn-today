// Unit tests for /nba-cup.js — the NBA Cup group standings and quarterfinal
// bracket on /standings and the homepage.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/nba-cup.test.js
//
// What is pinned:
//   - Groups are read off the Cup games; non-Cup games are ignored.
//   - A box score matches its game whichever way round it has the teams.
//   - Head-to-head breaks a group tie; a three-way tie that head-to-head
//     splits restarts the rest at head-to-head.
//   - An overtime game counts as a zero margin.
//   - Group winners are seeded without head-to-head; the wild card is the best
//     second-place team and plays the 1 seed.
//   - Last season's record is the last tiebreaker.
//   - The homepage window runs from the first Cup night to 21 days after the last.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const g = { console };
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'nba-cup.js'), 'utf8'), g);
const C = g.NbaCup;

let failed = 0;
function eq(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log(`ok   ${name}`); return; }
  failed++;
  console.log(`FAIL ${name}: got ${a}, want ${b}`);
}

// Round-robin groups of five, one game per pair, all on one date per pair index.
const GROUPS = {
  EA: ['ATL', 'BOS', 'CHA', 'CHI', 'WAS'],
  EB: ['BKN', 'DET', 'MIL', 'ORL', 'TOR'],
  EC: ['CLE', 'IND', 'MIA', 'NYK', 'PHI'],
  WA: ['DAL', 'DEN', 'HOU', 'PHX', 'UTA'],
  WB: ['GSW', 'LAL', 'POR', 'SAC', 'SAS'],
  WC: ['LAC', 'MEM', 'MIN', 'NOP', 'OKC'],
};
const schedule = [];
for (const teams of Object.values(GROUPS)) {
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    schedule.push({ date: '2026-11-0' + (1 + ((i + j) % 4)), home_team: teams[i], away_team: teams[j], note: 'NBA Cup' });
  }
}
schedule.push({ date: '2026-11-02', home_team: 'ATL', away_team: 'LAL', note: '' });

// results: [winner, loser, winPts, losePts, ot?] — the date comes from the schedule.
function res(list) {
  return list.map(([w, l, wp, lp, ot]) => {
    const s = schedule.find(x => x.note && ((x.home_team === w && x.away_team === l) || (x.home_team === l && x.away_team === w)));
    if (!s) throw new Error(`no game ${w} ${l}`);
    // Box scores keyed the other way round to the schedule, half the time.
    return wp % 2
      ? { date: s.date, home_team: w, away_team: l, home_score: wp, away_score: lp, ot: ot || 0, gametype: 'REG' }
      : { date: s.date, home_team: l, away_team: w, home_score: lp, away_score: wp, ot: ot || 0, gametype: 'REG' };
  });
}
const order = (cup, name) => cup.groups.find(x => x.name === name).rows.map(r => r.team);

let cup = C.compute(schedule, [], {});
eq('six groups', cup.groups.map(x => x.teams.join(' ')), Object.values(GROUPS).map(t => t.join(' ')));
eq('named by conference', cup.groups.map(x => x.name), ['East A', 'East B', 'East C', 'West A', 'West B', 'West C']);
eq('60 games, non-Cup ignored', cup.total, 60);
eq('nothing played', [cup.played, cup.final], [0, false]);
eq('no schedule Cup games is null', C.compute([{ date: '2026-11-01', home_team: 'ATL', away_team: 'BOS', note: '' }], [], {}), null);

// A box score keyed either way round counts.
cup = C.compute(schedule, res([['BOS', 'ATL', 110, 100], ['ATL', 'CHA', 111, 100]]), {});
eq('either way round', cup.played, 2);
eq('record and margin', (({ w, l, diff, pf }) => ({ w, l, diff, pf }))(cup.groups[0].rows.find(r => r.team === 'ATL')), { w: 1, l: 1, diff: 1, pf: 211 });

// Two-way tie broken head-to-head, even against a better margin.
cup = C.compute(schedule, res([
  ['BOS', 'ATL', 101, 100],
  ['ATL', 'CHA', 140, 100], ['ATL', 'CHI', 140, 100], ['ATL', 'WAS', 140, 100],
  ['BOS', 'CHA', 101, 100], ['BOS', 'CHI', 101, 100], ['WAS', 'BOS', 101, 100],
]), {});
eq('head-to-head beats margin', order(cup, 'East A').slice(0, 2), ['BOS', 'ATL']);

// Three-way tie at 3-1 in a cycle (h2h all 1-1): margin decides.
const cycle = [
  ['ATL', 'BOS', 110, 100], ['BOS', 'CHA', 105, 100], ['CHA', 'ATL', 103, 100],
  ['ATL', 'CHI', 101, 100], ['ATL', 'WAS', 101, 100],
  ['BOS', 'CHI', 101, 100], ['BOS', 'WAS', 101, 100],
  ['CHA', 'CHI', 101, 100], ['CHA', 'WAS', 101, 100],
  ['CHI', 'WAS', 101, 100],
];
cup = C.compute(schedule, res(cycle), {});
// ATL +10-3+1+1 = 9, BOS -10+5+1+1 = -3, CHA -5+3+1+1 = 0
eq('cycle falls to margin', order(cup, 'East A'), ['ATL', 'CHA', 'BOS', 'CHI', 'WAS']);

// The same with ATL's win over BOS in overtime: it counts as zero, so
// ATL -1, BOS +7, CHA 0.
cup = C.compute(schedule, res(cycle.map(r => (r[0] === 'ATL' && r[1] === 'BOS' ? [...r, 1] : r))), {});
eq('overtime margin is zero', cup.groups[0].rows.find(r => r.team === 'ATL').diff, -1);
eq('so overtime reorders the cycle', order(cup, 'East A').slice(0, 3), ['BOS', 'CHA', 'ATL']);

// Five teams level at 2-2.
cup = C.compute(schedule, res([
  ['ATL', 'BOS', 101, 100], ['ATL', 'CHA', 101, 100], ['BOS', 'CHA', 101, 100],
  ['CHI', 'ATL', 130, 100], ['WAS', 'ATL', 130, 100],
  ['BOS', 'CHI', 101, 100], ['WAS', 'BOS', 101, 100],
  ['CHA', 'CHI', 150, 100], ['CHA', 'WAS', 150, 100],
  ['CHI', 'WAS', 101, 100],
]), {});
// CHI and WAS finish 2-2 as well, so it is a five-way tie whose head-to-head
// is the whole table: margin puts CHA (+98) first.
eq('five-way 2-2 goes to margin', order(cup, 'East A')[0], 'CHA');

// Last season breaks an otherwise dead tie.
cup = C.compute(schedule, res([['BOS', 'ATL', 101, 100], ['CHA', 'CHI', 101, 100]]), { BOS: { w: 20, l: 60 }, CHA: { w: 60, l: 20 } });
eq('last season breaks a dead tie', order(cup, 'East A').slice(0, 2), ['CHA', 'BOS']);

// Bracket: winners by record/margin without head-to-head, wild card plays 1.
const sweep = (teams, margin) => {
  const out = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) out.push([teams[i], teams[j], 100 + margin, 100]);
  return out;
};
cup = C.compute(schedule, res([...sweep(GROUPS.EA, 1), ...sweep(GROUPS.EB, 9), ...sweep(GROUPS.EC, 5),
  ...sweep(GROUPS.WA, 3), ...sweep(GROUPS.WB, 3), ...sweep(GROUPS.WC, 3)]), {});
eq('final when all played', cup.final, true);
const b = cup.bracket.East;
eq('winners seeded by margin', b.seeds.slice(0, 3).map(s => s.team), ['BKN', 'CLE', 'ATL']);
eq('wild card is the best second', [b.seeds[3].team, b.seeds[3].wildcard], ['DET', true]);
eq('1 v 4, 2 v 3', b.games.map(p => p.map(s => s.team)), [['BKN', 'DET'], ['CLE', 'ATL']]);
eq('status marks', [C.status(cup).BKN, C.status(cup).DET, C.status(cup).BOS], ['winner', 'wildcard', undefined]);
eq('wild-card race order', C.wildcardRace(cup, 'East').map(r => r.team), ['DET', 'IND', 'BOS']);

// Homepage window.
eq('not before the first night', C.isActive(cup, '2026-10-31'), false);
eq('on the first night', C.isActive(cup, '2026-11-01'), true);
eq('21 days after the last', C.isActive(cup, '2026-11-25'), true);
eq('then gone', C.isActive(cup, '2026-11-26'), false);
eq('prev season', [C.prevSeason('26-27'), C.prevSeason('00-01')], ['25-26', '99-00']);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
