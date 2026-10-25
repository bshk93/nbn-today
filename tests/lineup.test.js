// Unit tests for computeStartingFive in teams/lineup.js — the starting five
// behind Roster Settings' Auto-sort, the Overview tab, /preview
// and the homepage slate when a team has saved no rotation.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/lineup.test.js
//
// What is pinned:
//   - Each position gets its best eligible player.
//   - A slot isn't stranded by a dual-eligible player taking an earlier one.
//   - Two players who could swap stay at their own positions when the swap
//     changes nothing else (a C and a PF; a PG and a SG). Before this, the
//     better one always took the earlier slot.
//   - More total OVR still beats position fit.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const g = { console };
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'teams', 'lineup.js'), 'utf8')
  + '\nthis.computeStartingFive = computeStartingFive;', g);

let failed = 0;
function check(label, got, want) {
  if (got === want) { console.log(`ok   ${label}`); return; }
  failed++;
  console.log(`FAIL ${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`);
}
const p = (slug, OVR, _posList, _primary) => ({ slug, OVR, _posList, _primary });
const five = players => g.computeStartingFive(players).map(x => (x ? x.slug : '—')).join(' ');

check('best player at each position',
  five([p('pg', 90, ['PG']), p('pg2', 80, ['PG']), p('sg', 85, ['SG']), p('sf', 84, ['SF']), p('pf', 83, ['PF']), p('c', 82, ['C'])]),
  'pg sg sf pf c');

check('a dual-eligible player does not strand C',
  five([p('pg', 90, ['PG']), p('sg', 85, ['SG']), p('sf', 84, ['SF']), p('big', 88, ['PF', 'C']), p('pf', 70, ['PF'])]),
  'pg sg sf pf big');

// OKC: Embiid (C) and Hachimura (PF) can each play PF and C.
check('a C and a PF who could swap stay at C and PF',
  five([p('pg', 97, ['PG', 'SG']), p('sg', 91, ['SG', 'SF']), p('sf', 81, ['SF', 'PF']),
        p('embiid', 91, ['PF', 'C'], 'C'), p('hachimura', 79, ['SF', 'PF', 'C'], 'PF')]),
  'pg sg sf hachimura embiid');

// NOP: Reaves (SG) and Harden (PG) can each play PG and SG.
check('a PG and a SG who could swap stay at PG and SG',
  five([p('reaves', 88, ['PG', 'SG', 'SF'], 'SG'), p('harden', 87, ['PG', 'SG'], 'PG'),
        p('sf', 83, ['SF']), p('pf', 79, ['PF']), p('c', 78, ['C'])]),
  'harden reaves sf pf c');

check('without _primary, the first listed position counts as primary',
  five([p('pg', 90, ['PG']), p('sg', 85, ['SG']), p('sf', 84, ['SF']), p('c1', 91, ['C', 'PF']), p('pf1', 79, ['PF', 'C'])]),
  'pg sg sf pf1 c1');

check('more total OVR still beats position fit',
  five([p('pg', 80, ['PG', 'SG'], 'PG'), p('star', 95, ['PG', 'SG'], 'PG'), p('sg', 70, ['SG'], 'SG'),
        p('sf', 80, ['SF']), p('pf', 80, ['PF']), p('c', 80, ['C'])]),
  'star pg sf pf c');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
