// Unit tests for playerExperience in /contract.js — a player's own years of NBA
// experience, which the signing forms prefill. It mirrors `_years_exp_basis`
// in nbn-api/routers/transactions.py, and the cases below are the same ones
// nbn-api/tests/test_declared_experience.py pins there, so the two can't drift
// apart without one of them failing.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/player-experience.test.js

const { playerExperience } = require('../contract.js');

let fails = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  [${ok ? 'ok' : 'FAIL'}] ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) fails++;
}

const YAB = { draft_year: 2016, nba_experience: { years: 4, season: '26-27' } };
const LAST = { draft_year: 2016,
  contracts: [{ years_experience: 1, salaries: { '25-26': '$1' }, cap_holds: {} }] };

check('draft year alone: season minus draft year',
  playerExperience({ draft_year: 2016 }, '26-27'), { years: 10, source: '2016 draft year' });
check('bio figure beats the draft year', playerExperience(YAB, '26-27'), { years: 4, source: 'set on his bio' });
check('bio figure climbs a season', playerExperience(YAB, '28-29').years, 6);
check('bio figure counts back too', playerExperience(YAB, '24-25').years, 2);
check('never below 0', playerExperience(YAB, '18-19').years, 0);
check("last contract's figure beats the draft year",
  playerExperience(LAST, '26-27'), { years: 2, source: 'stated on his last contract' });
check("bio figure beats the last contract's",
  playerExperience({ ...LAST, nba_experience: { years: 5, season: '26-27' } }, '26-27').years, 5);
check('a trailing hold is not the first contract year',
  playerExperience({ contracts: [{ years_experience: 1,
    salaries: { '26-27': '$0', '27-28': '$1' }, cap_holds: { '26-27': 'RFA' } }] }, '28-29').years, 2);
check('nothing on file: null', playerExperience({}, '26-27'), null);
check('bio figure alone, no draft year',
  playerExperience({ nba_experience: { years: 7, season: '25-26' } }, '26-27').years, 8);

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
