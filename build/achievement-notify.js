#!/usr/bin/env node
'use strict';

// Achievement unlock/upgrade notifier.
//
// Achievements are computed statelessly (in the browser) from the underlying
// data, so there's no server-side "unlock event". This job recomputes every
// member's achievement tiers using the SAME engine the site uses
// (members/achievements.js — single source of truth, run here under Node),
// diffs against a stored snapshot, and posts a Discord message for each newly
// unlocked achievement or tier upgrade.
//
// Design notes:
//   • Betting/investing achievements are excluded from notifications.
//   • First run (no snapshot yet) seeds the baseline silently — no flood.
//   • Only forward transitions fire (new unlock or higher tier); data
//     corrections that drop a tier are absorbed silently.
//   • Posts go to the same Discord webhook the newsroom uses.
//
// Env:
//   DRY_RUN=1            print would-be messages instead of posting
//   NBN_NEWS_WEBHOOK     override the Discord webhook URL
//
// Run on a timer (see nbn-achievements.timer). Cheap: ~1s, all from disk.

const fs = require('fs');
const NBNAch = require('/home/skim/projects/nbn-today/members/achievements.js');

const DATA = '/var/lib/nothing-but-stats';
const REPO = '/home/skim/projects/nbn-today';
const STATE_FILE = process.env.NBN_ACH_STATE || `${DATA}/achievement-state.json`;
const EXCLUDE_CATS = new Set(['betting', 'investing']);
const DRY_RUN = process.env.DRY_RUN === '1';

// Mirrors NEWS_WEBHOOK in nbn-api/routers/news.py.
const WEBHOOK = process.env.NBN_NEWS_WEBHOOK || (
  'https://discord.com/api/webhooks/1518995213979488406/' +
  'Uc1p3aAUOWhIkO7ToP26P02B0NJenZXQ06uDQwAKyXlPImV6J5ZbU6664wHc2UaE3srC'
);

const TIER_COLOR = {
  'tier-bronze': 0xcd7f32,
  'tier-silver': 0xc0c0c0,
  'tier-gold': 0xffd700,
  'tier-on': 0x22c55e,
};

const rd = p => fs.readFileSync(p, 'utf8');
const rj = p => JSON.parse(rd(p));

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
function scoreAll(shared) {
  const included = new Set(NBNAch.ACHIEVEMENTS.filter(a => !EXCLUDE_CATS.has(a.cat)).map(a => a.id));
  const members = rj(`${DATA}/members.json`);
  const out = {};
  for (const name in members) {
    const tenures = members[name].tenures || [];
    if (!tenures.length) continue;                       // skip non-GMs
    const ad = NBNAch.computeAchData({ name, tenures }, shared, {});
    const ts = NBNAch.tierStatus(ad);
    const unlocked = {};
    for (const id in ts) if (included.has(id) && ts[id] >= 0) unlocked[id] = ts[id];
    out[name] = unlocked;
  }
  return out;
}

function diff(prev, cur) {
  const events = [];
  for (const name in cur) {
    const old = prev[name] || {};
    for (const id in cur[name]) {
      const oldIdx = (id in old) ? old[id] : -1;
      if (cur[name][id] > oldIdx) events.push({ name, id, tier: cur[name][id], from: oldIdx });
    }
  }
  return events;
}

function embedFor(ev) {
  const ach = NBNAch.ACHIEVEMENTS.find(a => a.id === ev.id);
  const tier = ach.tiers[ev.tier];
  const tiered = ach.tiers.length > 1;
  const first = ev.from < 0;
  const sub = tier.sub ? ` _(${tier.sub})_` : '';
  const desc = first
    ? `**${ev.name}** unlocked **${ach.name}**${tiered ? ` — ${tier.label}` : ''}${sub}`
    : `**${ev.name}** leveled up **${ach.name}** to **${tier.label}**${sub}`;
  return {
    title: `${ach.icon} Achievement ${first ? 'Unlocked' : 'Upgraded'}`,
    url: `https://nbn.today/members/${encodeURIComponent(ev.name)}/`,
    color: TIER_COLOR[tier.tierClass] || 0x3b82f6,
    description: desc,
    footer: { text: 'Nothing But Net · nbn.today/members' },
  };
}

async function post(embed) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'NBN Achievements', avatar_url: 'https://nbn.today/logo.png', embeds: [embed] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const seedOnly = !fs.existsSync(STATE_FILE);
  const cur = scoreAll(buildShared());
  const prev = seedOnly ? {} : rj(STATE_FILE);
  const events = seedOnly ? [] : diff(prev, cur);

  if (!DRY_RUN) fs.writeFileSync(STATE_FILE, JSON.stringify(cur));

  if (seedOnly) {
    console.log(`Seeded baseline for ${Object.keys(cur).length} members; no notifications.`);
    return;
  }
  if (!events.length) { console.log('No new achievement upgrades.'); return; }

  for (const ev of events) {
    const embed = embedFor(ev);
    if (DRY_RUN) { console.log('[dry-run]', embed.description); continue; }
    try { await post(embed); } catch (e) { console.error('webhook failed:', e.message); }
    await sleep(1100);   // stay under Discord webhook rate limits
  }
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Processed ${events.length} achievement event(s).`);
})().catch(e => { console.error('achievement-notify failed:', e); process.exit(1); });
