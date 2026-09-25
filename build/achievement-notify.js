#!/usr/bin/env node
'use strict';

// Achievement NB¥ awarder.
//
// Achievements are computed statelessly (in the browser) from the underlying
// data, so there's no server-side "unlock event". This job recomputes every
// member's achievement tiers using the SAME engine the site uses
// (members/achievements.js — single source of truth, run here under Node),
// diffs against a stored snapshot, and awards NB¥ for each newly unlocked
// achievement or tier upgrade by calling the admin balance-adjust endpoint
// (which writes the balance + ledger under the API's lock).
//
// Design notes:
//   • Betting/investing achievements are excluded.
//   • First run (no snapshot yet) seeds the baseline silently — no awards.
//   • The snapshot is MONOTONIC: a member/achievement entry only advances after
//     a successful award, so awards can't double-fire and a failed award just
//     retries next run. Data corrections that drop a tier are absorbed silently
//     (never re-awarded if the tier is later regained).
//   • No Discord/webhook output — the ledger ("Achievement: …") is the record.
//   • Paused since the 2026-09 NB¥ reset: the API answers 423, and the unlock
//     is recorded without being paid, so nothing piles up for later.
//
// Env:
//   DRY_RUN=1            print would-be awards instead of granting
//   NBN_ACH_STATE        override the snapshot path (for testing)
//   NBN_API_BASE         override the API base URL (default http://127.0.0.1:8001)
//
// Run on a timer (see nbn-achievements.timer). Cheap: ~1s, all from disk.

const fs = require('fs');
const path = require('path');

// Resolved from this script, not hardcoded to the live checkout: the dev copy
// has to score with the dev engine, or testing a change to achievements.js here
// silently exercises the deployed one.
const NBNAch = require(path.join(__dirname, '..', 'members', 'achievements.js'));

const DATA = process.env.NBS_DATA_DIR || '/var/lib/nothing-but-stats';

// **Derived CSVs are not in the repo.** They were, as 149 tracked symlinks,
// until the data moved out to NBS_DATA_DIR; this job kept reading them from the
// checkout and so died with ENOENT on every single run from that day, awarding
// nothing and saying so only in its own journal. INPUTS exists so that can be
// asserted against instead of discovered — see build/test_achievement_inputs.js.
//
// Read through `public/`, the symlink view nginx serves, rather than `derived/`
// where the build writes: this job runs the same engine the site runs, so it
// should score off the same bytes the site displays. Same reasoning as
// build/smoke_test.py.
const SERVED = `${DATA}/public`;

const INPUTS = {
  ownerStatsCsv:    `${SERVED}/data/owner_stats.csv`,
  standingsCsv:     `${SERVED}/standings/standings-history.csv`,
  awardsCsv:        `${SERVED}/players/player_awards.csv`,
  playerSeasonsCsv: `${SERVED}/players/player_seasons.csv`,
  h2hOwnersCsv:     `${SERVED}/data/h2h-owners.csv`,
  bios:             `${DATA}/player-bios.json`,
  allTxns:          `${DATA}/transactions.json`,
  members:          `${DATA}/members.json`,
};

const STATE_FILE = process.env.NBN_ACH_STATE || `${DATA}/achievement-state.json`;
const API_BASE = process.env.NBN_API_BASE || 'http://127.0.0.1:8001';
const EXCLUDE_CATS = new Set(['betting', 'investing']);
const DRY_RUN = process.env.DRY_RUN === '1';

// NB¥ awarded per tier (scale: "Larger"), keyed by the tier's CSS class.
// Single-tier achievements use tier-on.
const REWARD = {
  'tier-bronze': 250,
  'tier-silver': 500,
  'tier-gold': 1000,
  'tier-on': 500,
};

const rd = p => fs.readFileSync(p, 'utf8');
const rj = p => JSON.parse(rd(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildShared() {
  const txns = rj(INPUTS.allTxns);
  return NBNAch.prepare({
    ownerStatsCsv: rd(INPUTS.ownerStatsCsv),
    standingsCsv: rd(INPUTS.standingsCsv),
    bios: rj(INPUTS.bios),
    awardsCsv: rd(INPUTS.awardsCsv),
    allTxns: Array.isArray(txns) ? txns : (txns.transactions || []),
    playerSeasonsCsv: rd(INPUTS.playerSeasonsCsv),
    h2hOwnersCsv: rd(INPUTS.h2hOwnersCsv),
  });
}

// Current highest tier index per included achievement, per member with a tenure.
function scoreAll(shared, members) {
  const included = new Set(NBNAch.ACHIEVEMENTS.filter(a => !EXCLUDE_CATS.has(a.cat)).map(a => a.id));
  const out = {};
  for (const name in members) {
    const tenures = members[name].tenures || [];
    if (!tenures.length) continue;                       // skip non-GMs
    const ad = NBNAch.computeAchData({ name, ...members[name] }, shared, {});
    const ts = NBNAch.tierStatus(ad);
    const unlocked = {};
    for (const id in ts) if (included.has(id) && ts[id] >= 0) unlocked[id] = ts[id];
    out[name] = unlocked;
  }
  return out;
}

function adminToken(members) {
  for (const name in members) {
    const v = members[name];
    if ((v.roles || []).includes('admin') && v.token) return v.token;
  }
  return null;
}

async function award(token, member, delta, reason) {
  const res = await fetch(`${API_BASE}/api/bets/admin/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ member, delta, reason, kind: 'achievement' }),
  });
  // Achievement NB¥ is paused since the 2026-09 reset (routers/wallet.py).
  if (res.status === 423) return { paused: true };
  if (!res.ok) throw new Error(`adjust ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();   // { member, old_balance, new_balance, delta, reason }
}

function label(ev) {
  const ach = NBNAch.ACHIEVEMENTS.find(a => a.id === ev.id);
  const tier = ach.tiers[ev.tier];
  const tiered = ach.tiers.length > 1;
  return `${ach.name}${tiered ? ` (${tier.label})` : ''}`;
}

async function main() {
  const members = rj(INPUTS.members);
  const seedOnly = !fs.existsSync(STATE_FILE);
  const cur = scoreAll(buildShared(), members);

  if (seedOnly) {
    if (!DRY_RUN) fs.writeFileSync(STATE_FILE, JSON.stringify(cur));
    console.log(`Seeded baseline for ${Object.keys(cur).length} members; no awards.`);
    return;
  }

  const state = rj(STATE_FILE);
  const events = [];
  for (const name in cur) {
    const old = state[name] || {};
    for (const id in cur[name]) {
      const oldIdx = (id in old) ? old[id] : -1;
      if (cur[name][id] > oldIdx) events.push({ name, id, tier: cur[name][id], from: oldIdx });
    }
  }
  if (!events.length) { console.log('No new achievement upgrades.'); return; }

  const token = adminToken(members);
  if (!token && !DRY_RUN) { console.error('No admin token available to award NB¥; aborting.'); process.exit(1); }

  let granted = 0;
  for (const ev of events) {
    const ach = NBNAch.ACHIEVEMENTS.find(a => a.id === ev.id);
    const amount = REWARD[ach.tiers[ev.tier].tierClass] || 0;
    const reason = `Achievement: ${label(ev)}`;

    if (DRY_RUN) { console.log(`[dry-run] +NB¥${amount} ${ev.name} — ${label(ev)}`); continue; }

    let newBal, paused = false;
    try {
      const r = await award(token, ev.name, amount, reason);
      newBal = r.new_balance;
      paused = !!r.paused;
    } catch (e) {
      console.error(`award failed for ${ev.name}/${ev.id}:`, e.message);
      continue;   // snapshot NOT advanced → retry next run
    }
    // Advance the snapshot immediately so a crash can't re-award.
    state[ev.name] = state[ev.name] || {};
    state[ev.name][ev.id] = ev.tier;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    // Paused: the unlock is recorded but not paid, and never will be. Holding
    // the snapshot back instead would pile up every unlock since the reset and
    // pay them all at once the day achievements are switched back on.
    if (paused) { console.log(`Not paid (achievement NB¥ is paused): ${ev.name} — ${label(ev)}`); continue; }
    granted++;
    console.log(`Awarded NB¥${amount} to ${ev.name} — ${label(ev)} (balance NB¥${newBal})`);
    await sleep(150);   // gentle pacing on the local API
  }
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Processed ${events.length} event(s), ${granted} awarded.`);
}

// Required by build/test_achievement_inputs.js for INPUTS; guarded so that
// requiring this file can't score every member or post an award.
module.exports = { INPUTS, buildShared, scoreAll };

if (require.main === module) {
  main().catch(e => { console.error('achievement-award failed:', e); process.exit(1); });
}
