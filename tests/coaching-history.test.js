// Unit tests for CoachingSettings.diffVersions in coaching-config.js — the
// "what changed" line on each version in the Coaching tab's History.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/coaching-history.test.js
//
// What is pinned:
//   - A team's first version has nothing to compare, so no changes.
//   - Every changed field and pool value is listed, with was → now.
//   - Minutes compare by player, not by slot: swapping two players lists
//     those two, not every slot between them.
//   - A player who left or joined the rotation shows as "not listed".
//   - An optional field left blank reads as the playbook default.

const path = require('path');
const CS = require(path.join(__dirname, '..', 'coaching-config.js'));

let fails = 0;
function check(name, cond) {
  console.log(`  [${cond ? 'ok' : 'FAIL'}] ${name}`);
  if (!cond) fails++;
}

const m = (slug, minutes, res) => ({ slug, minutes, res: !!res });
const V1 = { active_system: 'Pace & Space', bench_depth: 10, help_defense: '',
  off_def_ratings: { offense: 90, defense: 70 } };
const M1 = { PG: m('young', 34), SG: m('poole', 30), SF: m('kuzma', 32), 6: m('george', 20), 7: m('bagley', 0, true) };

check('a first version has no changes', CS.diffVersions(null, { values: V1, minutes: M1 }).length === 0);
check('the same version twice has no changes',
  CS.diffVersions({ values: V1, minutes: M1 }, { values: V1, minutes: M1 }).length === 0);

const V2 = { ...V1, active_system: 'Triangle', help_defense: 60, off_def_ratings: { offense: 85, defense: 75 } };
const d = CS.diffVersions({ values: V1, minutes: M1 }, { values: V2, minutes: M1 });
const by = Object.fromEntries(d.map(x => [x.label, x]));
check('a select change is listed', by['Active System'] && by['Active System'].was === 'Pace & Space' && by['Active System'].now === 'Triangle');
check('a blank optional field reads as the playbook default',
  by['Help Defense'] && by['Help Defense'].was === 'Playbook default' && by['Help Defense'].now === '60');
check('pool values carry their pool', by['Offense / Defense Ratings: Offense'] && by['Offense / Defense Ratings: Defense']);
check('nothing unchanged is listed', d.length === 4);

const M2 = { PG: m('young', 34), SG: m('george', 28), SF: m('kuzma', 33), 6: m('poole', 22), 7: m('bagley', 0, true) };
const p = CS.diffVersions({ values: V1, minutes: M1 }, { values: V1, minutes: M2 }, { resolveName: s => s.toUpperCase() });
check('a swap lists the two players and the minutes change, nothing else',
  p.length === 3 && p.every(x => x.player) && p.map(x => x.label).sort().join() === 'GEORGE,KUZMA,POOLE');
const g = p.find(x => x.label === 'GEORGE');
check('slot and minutes read together', g.was === '6th · 20 min' && g.now === 'SG · 28 min');
check('reserve reads as RES', CS.diffVersions({ values: V1, minutes: { 7: m('bagley', 12) } },
  { values: V1, minutes: M1 }).find(x => x.label === 'bagley').now === '7th · RES');

const M3 = { ...M1, 8: m('kispert', 10) };
delete M3[6];
const q = CS.diffVersions({ values: V1, minutes: M1 }, { values: V1, minutes: M3 });
check('a player who joined or left reads as not listed',
  q.find(x => x.label === 'kispert').was === 'not listed' && q.find(x => x.label === 'george').now === 'not listed');

if (fails) { console.error(`${fails} failed`); process.exit(1); }
console.log('coaching-history: all pass');
