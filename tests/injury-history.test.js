// Unit tests for /injury-history.js — the Health tile on /players and the
// /players/injuries sub-page.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/injury-history.test.js
//
// What is pinned:
//   - new / changed / healed fold into one injury each, oldest first.
//   - A healed with no new is an injury with no start.
//   - An injury with no healed is current.
//   - Games missed counts games without a box score line, never report dates;
//     a game he played in is "played through".
//   - A mid-injury trade counts each team's games from its own date.
//   - An injury's text is placed on the body, with its side; a name suffix the
//     Discord backfill read as an injury ("Iii") is no injury.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const g = { console };
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'injury-history.js'), 'utf8'), g);
const { fold, gamesMissed, summary, length, seasonOf, locate, expectedDays, severity } = g.InjuryHistory;

let failed = 0;
function eq(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log(`ok   ${name}`); return; }
  failed++;
  console.log(`FAIL ${name}: got ${a}, want ${b}`);
}

const ev = (date, kind, team, s) => ({ date, kind, team, [kind === 'healed' ? 'before' : 'after']: s });
const hurt = { status: 'Hurt', injury: 'Sprained Ankle', duration: 'Day-to-Day', ovr: 80, ovr_delta: -3 };
const out  = { status: 'Out', injury: 'Sprained Ankle', duration: '1-2 Weeks', ovr: 78, ovr_delta: -5 };

{
  // Newest first, as the API sends it.
  const s = fold([
    ev('2026-01-20', 'healed', 'ORL', out),
    ev('2026-01-12', 'changed', 'ORL', out),
    ev('2026-01-10', 'new', 'ORL', hurt),
  ]);
  eq('one injury from new/changed/healed', s.length, 1);
  eq('starts on the new', s[0].start, '2026-01-10');
  eq('ends on the healed', s[0].end, '2026-01-20');
  eq('takes the last status', s[0].status, 'Out');
  eq('worst is Out once it was Out', s[0].worst, 'Out');
  eq('keeps every report', s[0].reports.map(r => r.date), ['2026-01-10', '2026-01-12']);
  eq('length in days', length(s[0], '2026-10-01'), 10);
}

{
  const s = fold([ev('2025-11-15', 'healed', 'BOS', hurt)]);
  eq('a healed alone is an injury', s.length, 1);
  eq('with no start', s[0].start, null);
  eq('and no length', length(s[0], '2026-10-01'), null);
  eq('and no games missed', gamesMissed(s[0], { BOS: [{ date: '2025-11-14' }] }, [], '2026-10-01').missed, null);
}

{
  const s = fold([ev('2026-10-22', 'new', 'PHI', hurt), ev('2026-03-31', 'healed', 'ORL', out), ev('2026-03-16', 'new', 'ORL', out)]);
  eq('two injuries, oldest first', s.map(x => x.start), ['2026-03-16', '2026-10-22']);
  const sum = summary(s, '2026-10-25');
  eq('the open one is current', sum.current && sum.current.start, '2026-10-22');
  eq('days counts the current one to today', sum.days, 15 + 3);
  eq('longest', sum.longest.days, 15);
  eq('missed is unknown until counted', sum.missed, null);
}

{
  // Injured on the 10th, healed on the 14th; team plays the 10th, 12th, 14th, 16th.
  const s = fold([ev('2026-01-14', 'healed', 'ORL', hurt), ev('2026-01-10', 'new', 'ORL', hurt)])[0];
  const games = { ORL: ['2026-01-08', '2026-01-10', '2026-01-12', '2026-01-14', '2026-01-16'].map(date => ({ date })) };
  eq('played the day he got hurt, sat the rest',
     gamesMissed(s, games, ['2026-01-08', '2026-01-10', '2026-01-16'], '2026-10-01'), { missed: 2, playedThrough: 1 });
  eq('played through every game', gamesMissed(s, games, ['2026-01-10', '2026-01-12', '2026-01-14'], '2026-10-01'),
     { missed: 0, playedThrough: 3 });
}

{
  // Still hurt: runs to today, not past it.
  const s = fold([ev('2026-01-10', 'new', 'ORL', out)])[0];
  const games = { ORL: ['2026-01-11', '2026-01-13', '2026-01-20'].map(date => ({ date })) };
  eq('a current injury counts to today', gamesMissed(s, games, [], '2026-01-15'), { missed: 2, playedThrough: 0 });
}

{
  // Traded mid-injury: ORL's games until the 15th, PHI's from it.
  const s = fold([
    ev('2026-01-20', 'healed', 'PHI', out),
    ev('2026-01-15', 'changed', 'PHI', out),
    ev('2026-01-10', 'new', 'ORL', out),
  ])[0];
  eq('the trade is recorded', s.teams.map(t => t.team), ['ORL', 'PHI']);
  const games = {
    ORL: ['2026-01-11', '2026-01-15', '2026-01-18'].map(date => ({ date })),
    PHI: ['2026-01-12', '2026-01-16', '2026-01-19'].map(date => ({ date })),
  };
  eq('each team counts only its own stretch', gamesMissed(s, games, [], '2026-10-01'), { missed: 3, playedThrough: 0 });
}

eq('season turns over on July 1', [seasonOf('2026-06-30'), seasonOf('2026-07-01')], ['25-26', '26-27']);

{
  const at = t => { const l = locate(t); return l && [l.part, l.side]; };
  eq('knee, left', at('Hyperextended Left Knee'), ['knee', 'L']);
  eq('achilles is the ankle', at('Ruptured Achilles'), ['ankle', null]);
  eq('a finger is the hand', at('Sprained Right Finger'), ['hand', 'R']);
  eq('left hand fracture', at('Left Hand Fracture'), ['hand', 'L']);
  eq('an eye is the head, which has no side', at('Poked In The Eye'), ['head', null]);
  eq('hamstring is the thigh, not the leg', at('Strained Left Hamstring'), ['thigh', 'L']);
  eq('lower back', at('Lower Back Spasms'), ['back', null]);
  eq('flu is an illness', at('Flu'), ['illness', null]);
  eq('nowhere known', at('Bruised Ego'), null);
  eq('nothing', at(null), null);
  eq('a name suffix is no injury', at('Iii'), null);
  const s = fold([ev('2026-01-10', 'new', 'ORL', { ...hurt, injury: 'Ii' })])[0];
  eq('and fold drops it', s.injury, null);
}

{
  eq('expected days', ['Day-to-Day', 'Day-To-Day', '1-2 Weeks', '4-6 Weeks', '6-8 Months', 'Season', '', null].map(expectedDays),
     [1, 1, 7, 28, 180, 180, null, null]);
  const st = (start, end, duration) => ({ start, end, duration });
  eq('a day-to-day that cleared in 4 days is minor', severity(st('2026-01-10', '2026-01-14', 'Day-to-Day'), '2026-10-01'), 1);
  eq('15 days is moderate', severity(st('2026-03-16', '2026-03-31', '1-2 Weeks'), '2026-10-01'), 2);
  eq('a fresh 4-6 week injury is serious from day one', severity(st('2026-09-30', null, '4-6 Weeks'), '2026-10-01'), 3);
  eq('a ruptured achilles is severe', severity(st('2025-11-01', '2026-06-18', '6-8 Months'), '2026-10-01'), 4);
  eq('the actual length wins when longer', severity(st('2026-01-01', '2026-03-15', 'Day-to-Day'), '2026-10-01'), 4);
  eq('no start, no duration: minor', severity(st(null, '2026-01-14', null), '2026-10-01'), 1);
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
