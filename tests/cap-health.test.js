// Unit tests for /cap-health.js — the standing rules behind the team page's
// Cap Health card, What-If Mode's warnings, and (next) the league-wide board.
//
// Pure: no browser, no network, no data files. That is what makes it safe to
// run from the pre-commit hook, unlike tests/frontend/run.js.
//
//     node tests/cap-health.test.js
//
// What is being pinned is the rulebook, not the rendering:
//
//   - § 1.3/1.4 — the cap counts free-agent holds, the aprons and a hard cap
//     do not. Comparing the wrong figure to the wrong line is this file's
//     easiest possible bug and would silently credit a team with room.
//   - § 1.4 — a hard cap is a violation; being over the cap or an apron is a
//     position most of the league is in. One salary warning, most severe only.
//   - § 2.1 — the 14-player floor applies year-round; the ceiling is 15 in
//     season and 20 in the offseason, and nothing on the site says which one
//     binds today, so being over 15 in August must not read as a breach.
//   - A threshold of 0 means "not entered yet", not "every team is over it".
//     27-28 onward are on file as literal zeros.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'cap-health.js'), 'utf8');
const sandbox = { window: {}, console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const CH = sandbox.window.CapHealth;

let failed = 0;
function check(name, cond) {
  if (!cond) failed++;
  console.log(`  [${cond ? 'ok' : 'FAIL'}] ${name}`);
}
function group(name) { console.log(name); }

// Real 26-27 figures, so a wrong comparison shows up as a wrong dollar amount
// rather than as an abstract failure.
const LEVELS = { '26-27': { cap: 164961000, apron1: 209015000, apron2: 221686000 },
                 '27-28': { cap: 0, apron1: 0, apron2: 0 } };
const base = {
  season: '26-27', capLevels: LEVELS, teamState: null,
  standardCount: 15, twoWayCount: 0, erc: { deficiency: 0, charge: 0 },
};
const row = (out, key) => out.rows.find(r => r.key === key);
const codes = out => out.warnings.map(w => w.code);

group('an unset threshold is unknown, not exceeded');
{
  const out = CH.standing({ ...base, season: '27-28', teamSalaryFull: 300e6, teamSalaryExHolds: 300e6 });
  check('known(0) is null', CH.known(0) === null);
  check('known(null) is null', CH.known(null) === null);
  check('known(164961000) is itself', CH.known(164961000) === 164961000);
  check('cap row reads unknown', row(out, 'cap').tone === 'unknown');
  check('apron rows read unknown', row(out, 'apron1').tone === 'unknown' && row(out, 'apron2').tone === 'unknown');
  check('a $300M team triggers no warning in an unpriced season', codes(out).length === 0);
}

group('§ 1.3/1.4 — the cap counts holds, the aprons do not');
{
  // Full 210M, of which 5M is free-agent holds: over the cap on both bases,
  // but over the first apron only if the holds are wrongly counted.
  const out = CH.standing({ ...base, teamSalaryFull: 210e6, teamSalaryExHolds: 205e6 });
  check('cap compared on the full basis', row(out, 'cap').note === 'over by $45,039,000');
  check('first apron compared ex-holds, so the team is under it', row(out, 'apron1').tone === 'under');
  check('and says how far below, ex-holds', row(out, 'apron1').note === '$4,015,000 below');
  check('the holds are named on the salary row', row(out, 'salary').note === '$5,000,000 of that is free-agent holds');
  check('only the cap warning fires', codes(out).join() === 'over_cap');
}

group('one salary warning, the most severe line crossed');
{
  const over2 = CH.standing({ ...base, teamSalaryFull: 230e6, teamSalaryExHolds: 230e6 });
  check('over the second apron reports only that', codes(over2).join() === 'over_apron2');
  check('the cap row still shows the position', row(over2, 'cap').tone === 'over');
  const over1 = CH.standing({ ...base, teamSalaryFull: 215e6, teamSalaryExHolds: 215e6 });
  check('over the first apron reports only that', codes(over1).join() === 'over_apron1');
  const under = CH.standing({ ...base, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6 });
  check('under everything reports nothing', codes(under).length === 0);
  check('and says how much room, on the full basis', row(under, 'cap').note === '$14,961,000 of room');
}

group('§ 1.4 — a hard cap is a violation, an apron is a position');
{
  const hc = { hard_cap: 'first_apron' };
  const over = CH.standing({ ...base, teamState: hc, teamSalaryFull: 212e6, teamSalaryExHolds: 212e6 });
  check('exceeding it is a violation', over.warnings[0].severity === 'violation');
  check('and only it is reported', codes(over).join() === 'hard_cap_exceeded');
  check('named with its apron and its overage',
    over.warnings[0].text === "Violates this team's Hard Cap (First Apron) by $2,985,000");
  check('the row is toned as a violation', row(over, 'hard_cap').tone === 'violation');

  const under = CH.standing({ ...base, teamState: hc, teamSalaryFull: 179118525, teamSalaryExHolds: 179118525 });
  check('under it is room, not a warning', row(under, 'hard_cap').note === '$29,896,475 of room');
  check('and the only warning is the ordinary over-the-cap note', codes(under).join() === 'over_cap');
  check('no hard cap row when the team has no hard cap',
    row(CH.standing({ ...base, teamSalaryFull: 179118525, teamSalaryExHolds: 179118525 }), 'hard_cap') === undefined);

  const hc2 = CH.standing({ ...base, teamState: { hard_cap: 'second_apron' }, teamSalaryFull: 230e6, teamSalaryExHolds: 230e6 });
  check('a second-apron hard cap outranks the apron note it sits on',
    codes(hc2).join() === 'hard_cap_exceeded');
}

group('§ 2.1 — the floor binds year-round, the ceiling depends on the phase');
{
  const at = n => CH.standing({ ...base, standardCount: n, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6 });
  check('14 is at the floor, not under it', at(14).warnings.length === 0);
  check('and says so', row(at(14), 'roster').note === 'at the § 2.1 floor of 14');
  check('13 is below the floor', codes(at(13)).join() === 'roster_below_min');
  check('the floor warning says it applies year-round',
    /applies year-round/.test(at(13).warnings[0].text));
  check('15 is clean', at(15).warnings.length === 0);
  check('16 is a caution, not a violation', at(16).warnings[0].severity === 'caution');
  check('and is described as a trim owed, not a breach',
    /legal now, but 1 must go before opening night/.test(at(16).warnings[0].text));
  check('21 is over the offseason ceiling too, and is a violation',
    at(21).warnings[0].severity === 'violation' && codes(at(21)).join() === 'roster_over_offseason_max');
}

group('§ 2.1a — the Empty Roster Charge floor is 12, not 14');
{
  const eleven = CH.standing({
    ...base, standardCount: 11, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6,
    erc: { deficiency: 1, charge: 1157153 },
  });
  check('11 is both below the floor and charged',
    codes(eleven).join() === 'roster_below_min,empty_roster_charge');
  check('the charge is quoted from the caller, not recomputed',
    /charged \$1,157,153 against Team Salary/.test(eleven.warnings[1].text));
  const twelve = CH.standing({ ...base, standardCount: 12, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6 });
  check('12 is below § 2.1 but not charged', codes(twelve).join() === 'roster_below_min');
}

group('§ 2.2 — three two-way slots');
{
  const ok = CH.standing({ ...base, standardCount: 14, twoWayCount: 3, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6 });
  check('three is fine', ok.warnings.length === 0);
  check('two-ways are shown beside the standard count', row(ok, 'roster').value === '14/15 + 3/3 two-way');
  const over = CH.standing({ ...base, standardCount: 14, twoWayCount: 4, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6 });
  check('four is a violation', codes(over).join() === 'two_way_over_max');
  check('two-ways do not count toward the § 2.1 floor',
    CH.standing({ ...base, standardCount: 13, twoWayCount: 3, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6 })
      .warnings.some(w => w.code === 'roster_below_min'));
}

group('every warning states itself twice — full, and at a glance');
{
  // The homepage renders these as chips, where the full § citation is a
  // paragraph in a pill. Both registers live in this module so the short one
  // cannot become a second, drifting phrasing of the same rule.
  const cases = [
    { opts: { standardCount: 16 }, code: 'roster_trim_owed',  short: '16 players (reg. season max 15)' },
    { opts: { standardCount: 13 }, code: 'roster_below_min',  short: '13 players (min 14)' },
    { opts: { standardCount: 21 }, code: 'roster_over_offseason_max', short: '21 players (offseason max 20)' },
    { opts: { standardCount: 14, twoWayCount: 4 }, code: 'two_way_over_max', short: '4 two-way (max 3)' },
  ];
  cases.forEach(c => {
    const out = CH.standing({ ...base, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6, ...c.opts });
    const w = out.warnings.find(x => x.code === c.code);
    check(`${c.code} has a short form`, !!(w && w.short));
    check(`${c.code} reads "${c.short}"`, w.short === c.short);
    check(`${c.code}'s short form is shorter than its text`, w.short.length < w.text.length);
  });

  const salary = CH.standing({ ...base, teamSalaryFull: 210e6, teamSalaryExHolds: 210e6 });
  check('salary warnings carry one too', salary.warnings.every(w => !!w.short));
  check('and the short form uses the caller\'s formatter',
    /«/.test(CH.standing({ ...base, teamSalaryFull: 210e6, teamSalaryExHolds: 210e6,
                           fmt: v => `«${v}»` }).warnings[0].short));

  const erc = CH.standing({
    ...base, standardCount: 11, teamSalaryFull: 150e6, teamSalaryExHolds: 150e6,
    erc: { deficiency: 1, charge: 1157153 },
  });
  check('the empty-roster charge keeps its dollar figure when shortened',
    erc.warnings.find(w => w.code === 'empty_roster_charge').short === '1 empty slot · $1,157,153 charge');
}

group('the caller supplies the formatter');
{
  const out = CH.standing({ ...base, teamSalaryFull: 210e6, teamSalaryExHolds: 210e6, fmt: v => `«${v}»` });
  check('used for row notes', row(out, 'cap').note === 'over by «45039000»');
  check('used for warning text', /«/.test(out.warnings[0].text));
}

group('diff vocabulary');
{
  check('every ordered category has metadata',
    CH.DIFF_ORDER.every(c => CH.DIFF_CATEGORIES[c] && CH.DIFF_CATEGORIES[c].label));
  check('every category is ordered',
    Object.keys(CH.DIFF_CATEGORIES).every(c => CH.DIFF_ORDER.includes(c)));
  check('an unknown category still renders', CH.diffMeta('brand_new').label === 'brand_new');
  const sorted = CH.sortDiffs([
    { category: 'player_extra', field: 'B' },
    { category: 'player_team_conflict', field: 'Z' },
    { category: 'aggregate', field: 'A' },
    { category: 'brand_new', field: 'C' },
  ]);
  check('sorted worst-first, unknown last',
    sorted.map(d => d.category).join() === 'player_team_conflict,aggregate,player_extra,brand_new');
  check('ties break on the field name',
    CH.sortDiffs([{ category: 'aggregate', field: 'Z' }, { category: 'aggregate', field: 'A' }])
      .map(d => d.field).join() === 'A,Z');
}

console.log();
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log('all cap-health checks passed');
