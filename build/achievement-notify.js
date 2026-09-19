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
//
// Env:
//   DRY_RUN=1            print would-be awards instead of granting
//   NBN_ACH_STATE        override the snapshot path (for testing)
//   NBN_API_BASE         override the API base URL (default http://127.0.0.1:8001)
//
// Run on a timer (see nbn-achievements.timer). Cheap: ~1s, all from disk.

const fs = require('fs');
const NBNAch = require('/home/skim/projects/nbn-today/members/achievements.js');

const DATA = '/var/lib/nothing-but-stats';
const REPO = '/home/skim/projects/nbn-today';
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
  const txns = rj(`${DATA}/transactions.json`);
  return NBNAch.prepare({
    ownerStatsCsv: rd(`${REPO}/data/owner_stats.csv`),
    standingsCsv: rd(`${REPO}/standings/standings-history.csv`),
    bios: rj(`${DATA}/player-bios.json`),
    awardsCsv: rd(`${REPO}/players/player_awards.csv`),
    allTxns: Array.isArray(txns) ? txns : (txns.transactions || []),
    playerSeasonsCsv: rd(`${REPO}/players/player_seasons.csv`),
    h2hOwnersCsv: rd(`${REPO}/data/h2h-owners.csv`),
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
    body: JSON.stringify({ member, delta, reason }),
  });
  if (!res.ok) throw new Error(`adjust ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();   // { member, old_balance, new_balance, delta, reason }
}

function label(ev) {
  const ach = NBNAch.ACHIEVEMENTS.find(a => a.id === ev.id);
  const tier = ach.tiers[ev.tier];
  const tiered = ach.tiers.length > 1;
  return `${ach.name}${tiered ? ` (${tier.label})` : ''}`;
}

(async () => {
  const members = rj(`${DATA}/members.json`);
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

    let newBal;
    try {
      const r = await award(token, ev.name, amount, reason);
      newBal = r.new_balance;
    } catch (e) {
      console.error(`award failed for ${ev.name}/${ev.id}:`, e.message);
      continue;   // snapshot NOT advanced → retry next run
    }
    // Advance the snapshot immediately so a crash can't re-award.
    state[ev.name] = state[ev.name] || {};
    state[ev.name][ev.id] = ev.tier;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    granted++;
    console.log(`Awarded NB¥${amount} to ${ev.name} — ${label(ev)} (balance NB¥${newBal})`);
    await sleep(150);   // gentle pacing on the local API
  }
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Processed ${events.length} event(s), ${granted} awarded.`);
})().catch(e => { console.error('achievement-award failed:', e); process.exit(1); });
