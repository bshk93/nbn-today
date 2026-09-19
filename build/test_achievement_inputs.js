// Does build/achievement-notify.js still read files that exist?
//
//     node build/test_achievement_inputs.js
//
// This exists because of a failure nothing caught for a month. The derived
// CSVs used to be in the repo as tracked symlinks; when the data moved out to
// NBS_DATA_DIR the job kept reading them from the checkout, and from that day
// it died with ENOENT on every 10-minute run. It awarded nothing for six weeks.
// Nothing noticed, because the only symptom was an exception in its own
// journal — no Discord output, no page that goes blank, and "no achievements
// were awarded" looks exactly like "nobody unlocked anything".
//
// So the thing to pin is not the awarding logic (that was always fine) but the
// contract between the job and the data directory:
//
//   1. every path in INPUTS resolves to a real, non-empty file
//   2. the engine can actually consume them end to end and produce tiers
//
// (2) matters as much as (1): a renamed column leaves every path present and
// scores off it at nothing, which is the same silent failure wearing a
// different hat. A loose "did we get any tiers at all" floor does not catch
// that — the other four inputs carry it over the line on their own — so each
// CSV is also checked for the one column the engine joins it on.
//
// Reads live data, like build/smoke_test.py, and fails loudly rather than
// skipping if it isn't there — being unable to see the data is the bug.

const fs = require('fs');
const job = require('./achievement-notify.js');

let failed = 0;
function check(name, cond, detail) {
  if (!cond) failed++;
  console.log(`  [${cond ? 'ok' : 'FAIL'}] ${name}${!cond && detail ? ` — ${detail}` : ''}`);
}

console.log('achievement job inputs');

// ── 1. Every declared input is on disk and has something in it ─────────────
const names = Object.keys(job.INPUTS);
check('INPUTS is not empty', names.length > 0);

for (const key of names) {
  const p = job.INPUTS[key];
  let size = -1;
  try { size = fs.statSync(p).size; } catch (e) { /* stays -1 */ }
  check(`${key} exists and is non-empty`, size > 0,
    size === -1 ? `missing: ${p}` : `empty: ${p}`);
}

// ── 2. Each CSV still has the column the engine joins it on ────────────────
//
// One per file, and only the join key — this is not a schema mirror, it is the
// single rename that would silently remove that whole input from scoring.
// Verified against members/achievements.js: prepare() keys standings by SEASON,
// player_seasons by SLUG, awards by SLUG/AWARD; computeAchData looks a member
// up by `owner` in owner_stats and by `OWNER` in h2h-owners.
const JOIN_COLUMN = {
  ownerStatsCsv:    'owner',
  standingsCsv:     'SEASON',
  awardsCsv:        'SLUG',
  playerSeasonsCsv: 'SLUG',
  h2hOwnersCsv:     'OWNER',
};

for (const key of Object.keys(JOIN_COLUMN)) {
  const want = JOIN_COLUMN[key];
  let header = '';
  try {
    header = fs.readFileSync(job.INPUTS[key], 'utf8').split('\n', 1)[0];
  } catch (e) { /* the existence check above already reported this */ }
  const cols = header.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  check(`${key} still has its "${want}" column`, cols.includes(want),
    `header starts: ${cols.slice(0, 4).join(', ')}`);
}

// ── 3. The engine consumes them and produces real tiers ────────────────────
//
// Thresholds are deliberately loose. This is not asserting who has what — a
// trade or a title legitimately changes that every week. It is asserting that
// the pipeline produces *something*, which is the state the ENOENT bug and a
// silent schema break both fail to reach.
let scored = null;
try {
  const members = JSON.parse(fs.readFileSync(job.INPUTS.members, 'utf8'));
  scored = job.scoreAll(job.buildShared(), members);
} catch (e) {
  check('buildShared() + scoreAll() run without throwing', false, e.message);
}

if (scored) {
  check('buildShared() + scoreAll() run without throwing', true);
  const withTenure = Object.keys(scored).length;
  check('scores at least 20 members with a tenure', withTenure >= 20, `got ${withTenure}`);

  const unlocked = Object.values(scored).reduce((n, m) => n + Object.keys(m).length, 0);
  check('members hold at least 100 achievement tiers between them', unlocked >= 100,
    `got ${unlocked}`);

  // Every id the job would award against has to be one the engine still
  // defines, or `label()` throws mid-run — after some awards have been paid
  // and the snapshot advanced, which is the worst place for it to fail.
  const NBNAch = require('../members/achievements.js');
  const defined = new Set(NBNAch.ACHIEVEMENTS.map(a => a.id));
  const orphan = [...new Set(Object.values(scored).flatMap(m => Object.keys(m)))]
    .filter(id => !defined.has(id));
  check('every scored achievement id is still defined', orphan.length === 0,
    `orphaned: ${orphan.join(', ')}`);
}

console.log();
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log('all achievement input checks passed');
