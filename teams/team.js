// =============================================================================
// FUNCTION INDEX (teams/team.js)
// =============================================================================
// Constants & boot
//   TEAMS                     1   abbr → full team name
//   RETIRED_JERSEYS          34   per-team retired number records
//
// Parsing & formatting utilities
//   parseCSV                348   CSV text → array of row objects
//   parseLine               359   handles quoted fields
//   fmtPct                  371   decimal → "56.1%"
//   fmtSigned               376   signed decimal with +/- prefix
//   sv                      382   safe numeric value from row field
//   formatSalary            389   "$37,000,000" display
//   displayNameFromBio      399   "LAST, FIRST" → "First Last"
//   calcAge                 409   ISO dob → age string
//   parseCapHolds           495   legacy CSV cap-holds string → object
//   currentSeasonYr         506   infers current season year
//   parseSalaryNum          515   "$37,000,000" → 37000000
//   fmtDollars              521   number → "$37.0M"
//
// Cap & roster logic
//   computeMleType          525   determines MLE type from team salary
//   mleTypeLabel            533   MLE type → display label
//   renderHardCapBanner     537   injects hard cap warning banner
//   renderExceptionsSection 547   renders MLE/BAE exceptions panel
//
// Table builders
//   buildTable              414   generic sortable table (used by owners page too)
//   buildRosterTable        588   renders the Roster section with salary/cap data
//   bioPlayerName           960   slug → display name from bios
//   buildPicksTable         1036  renders the Draft Picks section
//   makeSeasonRenderCell   1069   season history cell renderer (badges, playoff coloring)
//   buildTimeline          1112   season timeline component
//   buildPersonnelSection  1137   franchise personnel history (tenures + records)
//
// Player cell rendering
//   playerSlug             1138   name → slug
//   renderPlayerCell       1142   renders player name/photo/pos badge cell
//   applyCapHoldColor      1178   colors cap-hold cells by type
//
// Edit mode & auth
//   promptToken            1185   modal to enter/store bearer token
//   withToken              1216   wraps fn with stored token
//   makeSelect             1222   <select> helper
//   nextSalaryYear         1237   "25-26" → "26-27"
//   prevSalaryYear         1242   "26-27" → "25-26"
//   makeEditCell           1247   creates editable cell (text/select/salary/cap-hold)
//   buildEditableGrid      1336   full in-place editable table grid
//   rosterCellConfig       1482   cell config map for roster editing
//   enterEditMode          1510   swaps read view for edit grid
//   setupPicksEditable     1614   wires edit mode for picks table
//   setupJerseyEditable    1809   wires jersey number editing
//   setupEditable          1945   wires edit mode for roster table
// =============================================================================

const TEAMS = {
  ATL: "Atlanta Hawks",
  BKN: "Brooklyn Nets",
  BOS: "Boston Celtics",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
};

const RETIRED_JERSEYS = {
  HOU: [{ no: 13, player: 'James Harden',        date: '2024-02-09' }],
  LAC: [{ no: 15, player: 'Cam Payne',            date: '2024-02-08' }],
  SAC: [{ no: 17, player: 'Aleksej Pokusevski',   date: '2024-02-10' }],
};

const abbr = location.pathname.replace(/\/$/, "").split("/").pop().toUpperCase();
const name = TEAMS[abbr] || "Unknown Team";
const slug = abbr.toLowerCase();

document.title = `${abbr} — NBN`;

{ const _favicon = document.createElement('link'); _favicon.rel = 'icon'; _favicon.href = '/logo.png'; document.head.appendChild(_favicon); }

{ const _s = document.createElement('style'); _s.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #111827;
    color: #f3f4f6;
    min-height: 100vh;
    padding: 2rem 1rem 4rem;
  }
  .page { max-width: 1024px; margin: 0 auto; }
  .nav { margin-bottom: 2rem; font-size: 0.875rem; }
  .nav a { color: #9ca3af; text-decoration: none; }
  .nav a:hover { color: #f3f4f6; }
  .team-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin-bottom: 3rem;
  }
  .team-header img { width: 140px; height: 140px; object-fit: contain; }
  .team-header h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.02em; text-align: center; }
  .team-header .abbr { font-size: 0.9rem; color: #6b7280; letter-spacing: 0.08em; }
  section { margin-bottom: 3rem; }
  .section-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.25rem; }
  .section-sub { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.75rem; }
  .table-wrap {
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 12px;
    overflow-x: auto;
  }
  .status { text-align: center; padding: 3rem; color: #6b7280; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; white-space: nowrap; }
  thead th {
    padding: 0.7rem 1rem;
    text-align: left;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b7280;
    border-bottom: 1px solid #374151;
    cursor: pointer;
    user-select: none;
  }
  thead th:hover { color: #d1d5db; }
  thead th[data-active="true"] { color: #93c5fd; }
  thead th .sort-arrow { margin-left: 4px; opacity: 0; font-size: 0.65rem; }
  thead th[data-active="true"] .sort-arrow { opacity: 1; }
  thead th.right { text-align: right; }
  tbody tr { border-bottom: 1px solid #283141; transition: background 0.1s; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: #263244; }
  td { padding: 0.65rem 1rem; color: #d1d5db; }
  td.right { text-align: right; font-variant-numeric: tabular-nums; }
  td.muted { color: #6b7280; }
  td.bold { font-weight: 600; color: #f3f4f6; }
  td a { color: #60a5fa; text-decoration: none; }
  td a:hover { text-decoration: underline; }
  .badge {
    display: inline-block;
    margin-left: 0.35rem;
    font-size: 0.8rem;
    cursor: default;
    position: relative;
    vertical-align: middle;
  }
  .badge::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 5px);
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    border: 1px solid #374151;
    color: #d1d5db;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 10;
  }
  .badge:hover::after { opacity: 1; }
  .po-champion   { color: #fbbf24; font-weight: 600; }
  .po-runnerup   { color: #9ca3af; }
  .po-conffinals { color: #60a5fa; }
  .po-other      { color: #6b7280; }
  .po-missed     { color: #4b5563; }
  td.center      { text-align: center; }
  .timeline {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding: 0.5rem 0 0.75rem;
    margin-bottom: 0.75rem;
    scrollbar-width: thin;
    scrollbar-color: #374151 transparent;
  }
  .tl-card {
    flex-shrink: 0;
    width: 58px;
    background: #1f2937;
    border: 2px solid #283141;
    border-radius: 8px;
    padding: 0.45rem 0.25rem;
    text-align: center;
    cursor: default;
    transition: filter 0.1s;
  }
  .tl-card:hover { filter: brightness(1.15); }
  .tl-season { display: block; font-size: 0.6rem; color: #6b7280; letter-spacing: 0.03em; }
  .tl-wins   { display: block; font-size: 1.25rem; font-weight: 700; color: #f3f4f6; line-height: 1; margin: 0.2rem 0 0.15rem; }
  .tl-seed   { display: block; font-size: 0.62rem; color: #9ca3af; }
  .tl-champion   { border-color: #d97706; background: #1a1305; }
  .tl-champion .tl-wins { color: #fbbf24; }
  .tl-runnerup   { border-color: #cbd5e1; background: #141c26; }
  .tl-runnerup .tl-wins { color: #e2e8f0; }
  .tl-conffinals { border-color: #1d4ed8; }
  .tl-second     { border-color: #374151; }
  .tl-missed     { opacity: 0.55; }
  td.div-left    { border-left: 1px solid #374151; }
  .subheader td  {
    background: #161f2e;
    color: #6b7280;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 0.35rem 1rem;
    border-top: 1px solid #374151;
  }
  .row-twoway td { opacity: 0.6; }
  .row-dead td   { opacity: 0.45; font-style: italic; text-decoration: line-through; }
  .picks-acquired td   { color: #60a5fa; }
  .picks-traded td     { color: #6b7280; font-style: italic; }
  .picks-uncertain td  { color: #f59e0b; font-style: italic; }
  .retired-banners {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .retired-banner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 90px;
    padding: 0.85rem 0.5rem 0.7rem;
    background: #1f2937;
    border: 1px solid #374151;
    border-top: 3px solid #9ca3af;
    border-radius: 8px;
    gap: 0.2rem;
  }
  .retired-no   { font-size: 2rem; font-weight: 800; color: #f3f4f6; line-height: 1; letter-spacing: -0.03em; }
  .retired-name { font-size: 0.62rem; color: #9ca3af; text-align: center; line-height: 1.3; }
  .retired-date { font-size: 0.58rem; color: #4b5563; margin-top: 0.15rem; }
  td.cap-ufa        { background: hsl(45,  60%, 20%); color: hsl(45,  90%, 72%); }
  td.cap-rfa        { background: hsl(25,  60%, 20%); color: hsl(25,  90%, 72%); }
  td.cap-player-opt { background: hsl(120, 50%, 17%); color: hsl(120, 75%, 68%); }
  td.cap-team-opt   { background: hsl(210, 55%, 20%); color: hsl(210, 75%, 70%); }
  td.cap-non-gtd    { color: #4b5563; }
  .cap-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.25rem;
    padding: 0.6rem 1rem 0.75rem;
    font-size: 0.75rem;
    color: #9ca3af;
    border-top: 1px solid #283141;
  }
  .cap-legend-item { display: flex; align-items: center; gap: 0.35rem; }
  .cap-swatch {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  tfoot tr td { font-size: 0.8rem; padding: 0.3rem 0.6rem; color: #9ca3af; border-top: none; }
  tfoot tr.tfoot-divider td { border-top: 1px solid #374151; padding-top: 0.45rem; }
  tfoot tr.tfoot-total td { font-weight: 700; color: #d1d5db; }
  tfoot tr.tfoot-cap td { color: #6b7280; }
  tfoot tr.tfoot-cap.over .tfoot-diff { color: #f87171; }
  tfoot tr.tfoot-cap.under .tfoot-diff { color: #4ade80; }
  tfoot td.tfoot-label { color: #6b7280; }
  tfoot td.tfoot-count { color: #374151; font-size: 0.72rem; text-align: right; }
  tfoot tr.tfoot-hardcap td { padding-top: 0.4rem; }
  .hardcap-chip { display: inline-block; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.02em;
    padding: 0.05rem 0.35rem; border-radius: 3px; background: #422006; color: #fbbf24; border: 1px solid #854d0e; }
  .hardcap-chip.apron2 { background: #450a0a; color: #fca5a5; border-color: #991b1b; }
  .cap-edit-form {
    display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
    margin-top: 0.75rem; padding: 0.6rem 0.75rem;
    background: #1f2937; border: 1px solid #374151; border-radius: 8px;
    font-size: 0.8rem;
  }
  .cap-edit-form label { display: flex; flex-direction: column; gap: 0.2rem; color: #6b7280; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
  .cap-edit-form input { background: #111827; border: 1px solid #374151; border-radius: 4px; color: #f3f4f6; font-size: 0.82rem; font-family: inherit; padding: 0.25rem 0.4rem; width: 8rem; outline: none; }
  .cap-edit-form input:focus { border-color: #3b82f6; }
  .cap-edit-form select { background: #111827; border: 1px solid #374151; border-radius: 4px; color: #f3f4f6; font-size: 0.82rem; font-family: inherit; padding: 0.25rem 0.4rem; width: 8rem; outline: none; }
  .cap-edit-form select:focus { border-color: #3b82f6; }
  .cap-edit-form .form-divider { width: 100%; height: 1px; background: #374151; margin: 0.25rem 0; }
  .cap-edit-form .form-section-label { width: 100%; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #4b5563; letter-spacing: 0.05em; padding-top: 0.15rem; }
  .hard-cap-banner {
    background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px;
    padding: 0.6rem 1rem; font-size: 0.85rem; font-weight: 600; color: #f87171;
    margin-bottom: 1.25rem;
  }
  .hard-cap-banner.apron2 { background: #431407; border-color: #7c2d12; color: #fb923c; }
  .exceptions-card { background: #1f2937; border: 1px solid #374151; border-radius: 12px; padding: 0.85rem 1.25rem; font-size: 0.85rem; }
  .exceptions-row { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid #283141; gap: 1rem; }
  .exceptions-row:last-child { border-bottom: none; }
  .exc-label { color: #9ca3af; font-size: 0.78rem; }
  .exc-mle-type { font-size: 0.7rem; color: #6b7280; margin-left: 0.35rem; }
  .exc-remaining { color: #34d399; }
  .exc-used { color: #f87171; }
  .token-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .token-modal {
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 12px;
    padding: 1.5rem;
    width: 360px;
    max-width: 90vw;
  }
  .token-modal h3 { font-size: 1rem; font-weight: 700; margin-bottom: 0.4rem; }
  .token-modal p  { font-size: 0.8rem; color: #9ca3af; margin-bottom: 1rem; }
  .token-modal input {
    width: 100%;
    background: #111827;
    border: 1px solid #374151;
    border-radius: 6px;
    color: #f3f4f6;
    font-size: 0.875rem;
    font-family: monospace;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
    box-sizing: border-box;
  }
  .token-modal input:focus { outline: none; border-color: #3b82f6; }
  .token-modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .player-note {
    display: inline-flex; align-items: center;
    margin-left: 0.35rem; color: #b45309; cursor: default;
    position: relative; vertical-align: middle; transition: color 0.1s;
  }
  .player-note:hover { color: #fbbf24; }
  .player-note::after {
    content: attr(data-tip);
    position: absolute; bottom: calc(100% + 5px); left: 50%;
    transform: translateX(-50%);
    background: #1f2937; border: 1px solid #374151; color: #d1d5db;
    padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;
    white-space: pre-wrap; max-width: 240px;
    pointer-events: none; opacity: 0; transition: opacity 0.12s;
    z-index: 10; font-weight: normal;
  }
  .player-note:hover::after { opacity: 1; }

  /* NON_GTD salary cell tooltip */
  .sal-tip { position: relative; cursor: default; }
  .sal-tip::after {
    content: attr(data-tip);
    position: absolute; bottom: calc(100% + 5px); right: 0;
    background: #1f2937; border: 1px solid #374151; color: #d1d5db;
    padding: 0.35rem 0.65rem; border-radius: 5px; font-size: 0.75rem;
    white-space: pre; min-width: 160px; text-align: left;
    pointer-events: none; opacity: 0; transition: opacity 0.12s;
    z-index: 20; font-weight: normal; line-height: 1.6;
  }
  .sal-tip:hover::after { opacity: 1; }

  /* Tabs */
  .tabs {
    display: flex;
    border-bottom: 1px solid #374151;
    margin-bottom: 2rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #6b7280;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.6rem 1.25rem;
    font-family: inherit;
    transition: color 0.12s;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  .tab:hover { color: #d1d5db; }
  .tab.active { color: #f3f4f6; border-bottom-color: #3b82f6; font-weight: 600; }
  .tab-panel.hidden { display: none; }
  .hist-controls { margin-bottom: 1.5rem; }
  .hist-controls select {
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 6px;
    color: #f3f4f6;
    font-size: 0.875rem;
    padding: 0.4rem 0.75rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
  }
  .hist-controls select:focus { border-color: #3b82f6; }
`; document.head.appendChild(_s); }

document.body.innerHTML = `
  <div class="page">
    <nav class="nav"><a href="/teams">← Teams</a></nav>
    <div class="team-header">
      <img src="/logos/logo-${slug}.png" alt="${name} logo">
      <h1>${name}</h1>
      <span class="abbr">${abbr}</span>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="draft">Draft History</button>
      <button class="tab" data-tab="alltime">All-Time Players</button>
      <button class="tab" data-tab="history">Historical Rosters</button>
    </div>
    <div class="tab-panel" id="tab-overview">
      <section>
        <h2 class="section-title">Season History</h2>
        <div class="timeline" id="timeline-wrap"></div>
        <div class="table-wrap" id="seasons-wrap"><div class="status">Loading…</div></div>
      </section>
      <section id="personnel-section" style="display:none">
        <h2 class="section-title">Franchise Personnel</h2>
        <div class="table-wrap" id="personnel-wrap"></div>
      </section>
      <section id="retired-section" style="display:none">
        <h2 class="section-title">Retired Numbers</h2>
        <div class="retired-banners" id="retired-banners"></div>
      </section>
      <div id="hard-cap-banner" style="display:none"></div>
      <section>
        <h2 class="section-title" id="roster-title">Roster</h2>
        <div class="table-wrap" id="roster-wrap"><div class="status">Loading…</div></div>
        <div id="cap-edit-wrap"></div>
        <div id="dead-cap-edit-wrap"></div>
      </section>
      <section id="exceptions-section" style="display:none">
        <h2 class="section-title">Cap Exceptions</h2>
        <div id="exceptions-wrap" class="exceptions-card"></div>
      </section>
      <section>
        <h2 class="section-title" id="picks-title">Draft Picks</h2>
        <div class="table-wrap" id="picks-wrap"><div class="status">Loading…</div></div>
      </section>
    </div>
    <div class="tab-panel hidden" id="tab-draft">
      <section>
        <h2 class="section-title">Draft History</h2>
        <p class="section-sub">Players drafted by this franchise</p>
        <div class="table-wrap" id="drafted-wrap"><div class="status">Loading…</div></div>
      </section>
    </div>
    <div class="tab-panel hidden" id="tab-alltime">
      <section>
        <h2 class="section-title">All-Time Top Players</h2>
        <p class="section-sub">Regular season · ranked by total Game Score</p>
        <div class="table-wrap" id="players-wrap"><div class="status">Loading…</div></div>
      </section>
    </div>
    <div class="tab-panel hidden" id="tab-history">
      <section>
        <h2 class="section-title">Historical Rosters</h2>
        <p class="section-sub">Per-season stats for this franchise</p>
        <div class="hist-controls" id="hist-controls"></div>
        <div id="hist-roster-wrap"><div class="status">Select a season to view stats</div></div>
      </section>
    </div>
  </div>
`;

const _navScript = document.createElement('script');
_navScript.src = '/nav.js';
document.head.appendChild(_navScript);

const _badgeScript = document.createElement('script');
_badgeScript.src = '/token-badge.js';
_badgeScript.onload = function () { window.__nbnBadge && window.__nbnBadge(); };
document.head.appendChild(_badgeScript);

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function parseLine(line) {
  const out = [];
  let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; }
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

function fmtPct(v) {
  const n = parseFloat(v);
  return isNaN(n) ? '—' : n.toFixed(3);
}

function fmtSigned(v, decimals = 1) {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(decimals);
}

function sv(row, field) {
  const v = row[field];
  if (!v || v === 'NA') return -Infinity;
  const n = parseFloat(v);
  return isNaN(n) ? v : n;
}

function formatSalary(v) {
  if (!v && v !== 0) return '—';
  const s = String(v).trim();
  if (!s || s === '—') return '—';
  const digits = s.replace(/[$,\s]/g, '');
  const n = parseFloat(digits);
  if (isNaN(n)) return s;
  return '$' + Math.round(n).toLocaleString('en-US');
}

function buildNonGtdTip(year, guaranteed, guarantee_dates, guarantee_schedule) {
  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const sched    = (guarantee_schedule || {})[year];
  const gtdAmt   = (guaranteed || {})[year];
  const gtdDate  = (guarantee_dates || {})[year];
  const lines = ['Non-Guaranteed'];
  if (sched && sched.length) {
    sched.forEach(step => {
      if (!step.amount) {
        lines.push('→ Fully guaranteed' + (step.date ? ' ' + fmtDate(step.date) : ' at signing'));
      } else {
        lines.push('→ ' + formatSalary(step.amount) + ' vests' + (step.date ? ' ' + fmtDate(step.date) : ' at signing'));
      }
    });
  } else if (gtdAmt || gtdDate) {
    if (gtdAmt)  lines.push('→ ' + formatSalary(gtdAmt) + ' guaranteed');
    if (gtdDate) lines.push('→ Fully guaranteed ' + fmtDate(gtdDate));
  } else {
    lines.push('→ $0 guaranteed');
  }
  return lines.join('\n');
}

function displayNameFromBio(canonical) {
  if (!canonical) return '';
  const toTitle = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  if (canonical.includes(',')) {
    const [last, first] = canonical.split(',', 2);
    return toTitle(`${first.trim()} ${last.trim()}`);
  }
  return toTitle(canonical);
}

function calcAge(dob) {
  if (!dob) return '';
  return Math.floor((Date.now() - new Date(dob + 'T00:00:00').getTime()) / (365.25 * 24 * 3600 * 1000));
}

function buildTable(cols, rows, initSortField, initSortDir, renderCell) {
  let sortField = initSortField;
  let sortDir = initSortDir;

  const table = document.createElement('table');
  const thead = table.createTHead();
  const hr = thead.insertRow();

  cols.forEach(col => {
    const th = document.createElement('th');
    const arrow = document.createElement('span');
    arrow.className = 'sort-arrow';
    th.appendChild(document.createTextNode(col.label));
    th.appendChild(arrow);
    th.dataset.active = String(col.sortField === sortField);
    if (col.cls?.includes('right')) th.classList.add('right');
    th.addEventListener('click', () => {
      if (sortField === col.sortField) sortDir *= -1;
      else { sortField = col.sortField; sortDir = col.defaultDir; }
      hr.querySelectorAll('th').forEach(t => {
        t.dataset.active = 'false';
        t.querySelector('.sort-arrow').textContent = '↓';
      });
      th.dataset.active = 'true';
      th.querySelector('.sort-arrow').textContent = sortDir === -1 ? '↓' : '↑';
      rebuild();
    });
    hr.appendChild(th);
  });

  const activeIdx = cols.findIndex(c => c.sortField === sortField);
  if (activeIdx >= 0) {
    const activeTh = hr.querySelectorAll('th')[activeIdx];
    activeTh.querySelector('.sort-arrow').textContent = initSortDir === -1 ? '↓' : '↑';
  }

  const tbody = table.createTBody();

  function rebuild() {
    tbody.innerHTML = '';
    [...rows].sort((a, b) => {
      const va = sv(a, sortField), vb = sv(b, sortField);
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    }).forEach(row => {
      const tr = tbody.insertRow();
      cols.forEach(col => {
        const td = tr.insertCell();
        if (col.cls) col.cls.split(' ').forEach(c => c && td.classList.add(c));
        renderCell(td, col, row);
      });
    });
  }

  rebuild();
  return table;
}

const CAP_HOLD_CSS = {
  UFA:        'cap-ufa',
  RFA:        'cap-rfa',
  PLAYER_OPT: 'cap-player-opt',
  TEAM_OPT:   'cap-team-opt',
  NON_GTD:    'cap-non-gtd',
};

const CAP_HOLD_LABELS = {
  UFA:        'UFA Hold',
  RFA:        'RFA Hold',
  PLAYER_OPT: 'Player Option',
  TEAM_OPT:   'Team Option',
  NON_GTD:    'Non-Guaranteed',
};

const SWATCH_COLORS = {
  UFA:        'hsl(45,  60%, 35%)',
  RFA:        'hsl(25,  60%, 35%)',
  PLAYER_OPT: 'hsl(120, 50%, 30%)',
  TEAM_OPT:   'hsl(210, 55%, 35%)',
  NON_GTD:    '#374151',
};

function parseCapHolds(val) {
  if (val && typeof val === 'object') return val;
  const map = {};
  if (!val) return map;
  String(val).split(',').forEach(pair => {
    const [yr, type] = pair.split(':');
    if (yr && type) map[yr.trim()] = type.trim();
  });
  return map;
}

// The current league year (cap/contract clock). Set from GET /api/league-year at
// page load; falls back to the date-based season if that fetch fails. BOD advances
// it from Cap Settings; once set it drives every "current season" use on this page
// (roster first column, total salary, hard-cap banner, exceptions, trades).
let LEAGUE_YEAR = null;

function currentSeasonYr() {
  if (LEAGUE_YEAR) return LEAGUE_YEAR;
  const now = new Date();
  const y = now.getFullYear() % 100;
  const m = now.getMonth() + 1;
  return m < 7
    ? `${String(y - 1).padStart(2, '0')}-${String(y).padStart(2, '0')}`
    : `${String(y).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function parseSalaryNum(v) {
  if (!v && v !== 0) return 0;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

function fmtDollars(v) {
  return v ? '$' + Math.round(v).toLocaleString('en-US') : '$0';
}

function computeMleType(teamSalary, capLevels, season, teamState) {
  if (teamState?.mle_type) return teamState.mle_type;
  const cl = capLevels?.[season];
  if (!cl?.ntmle_amount) return null;
  if (cl.cap - teamSalary > cl.ntmle_amount) return 'room';
  if (cl.apron1 - teamSalary >= cl.ntmle_amount) return 'ntmle';
  return 'tmle';
}

function mleTypeLabel(type) {
  return { room: 'Room Exception', ntmle: 'Non-Taxpayer MLE', tmle: 'Taxpayer MLE' }[type] || '—';
}

function renderHardCapBanner(teamState) {
  const el = document.getElementById('hard-cap-banner');
  if (!teamState?.hard_cap) { el.style.display = 'none'; return; }
  const isApron2 = teamState.hard_cap === 'second_apron';
  el.className = 'hard-cap-banner' + (isApron2 ? ' apron2' : '');
  el.style.display = '';
  const reason = teamState.hard_cap_reason ? ` · ${teamState.hard_cap_reason}` : '';
  el.textContent = `⚠ Hard-Capped: ${isApron2 ? 'Second' : 'First'} Apron${reason}`;
}

function renderExceptionsSection(teamState, capLevels, teamSalary, season) {
  const section = document.getElementById('exceptions-section');
  const wrap = document.getElementById('exceptions-wrap');
  const cl = capLevels?.[season];
  if (!cl?.ntmle_amount && !cl?.bae_amount) { section.style.display = 'none'; return; }

  const mleType = computeMleType(teamSalary, capLevels, season, teamState);
  const mleTotal = mleType === 'tmle' ? (cl.tmle_amount || 0) : mleType === 'room' ? (cl.room_amount || 0) : (cl.ntmle_amount || 0);
  const mleUsed = teamState?.mle_used || 0;
  const mleRemaining = Math.max(0, mleTotal - mleUsed);
  const baeUsed = teamState?.bae_used;
  const baeAvail = teamState?.bae_available;

  wrap.innerHTML = '';

  if (mleType && mleTotal > 0) {
    const row = document.createElement('div');
    row.className = 'exceptions-row';
    const remCls = mleRemaining > 0 ? 'exc-remaining' : 'exc-used';
    row.innerHTML = `
      <span class="exc-label">MLE <span class="exc-mle-type">(${mleTypeLabel(mleType)})</span></span>
      <span>
        <span class="${remCls}">${fmtDollars(mleRemaining)} remaining</span>
        <span style="color:#4b5563;font-size:0.75rem"> / ${fmtDollars(mleTotal)}</span>
        ${mleUsed ? `<span style="color:#6b7280;font-size:0.72rem"> (${fmtDollars(mleUsed)} used)</span>` : ''}
      </span>`;
    wrap.appendChild(row);
  }

  if (baeAvail || baeUsed) {
    const row = document.createElement('div');
    row.className = 'exceptions-row';
    row.innerHTML = baeUsed
      ? `<span class="exc-label">BAE</span><span class="exc-used">Used · ${fmtDollars(cl.bae_amount)}</span>`
      : `<span class="exc-label">BAE</span><span class="exc-remaining">Available · ${fmtDollars(cl.bae_amount)}</span>`;
    wrap.appendChild(row);
  }

  section.style.display = wrap.children.length ? '' : 'none';
}

function buildRosterTable(rows, biosData, capLevels, currentOvr = {}, deadCapRows = [], seasonStates = {}) {
  if (!rows.length) return null;
  const curYr = currentSeasonYr();
  const hasSlug = 'SLUG' in rows[0] && !('PLAYER' in rows[0]);

  if (!hasSlug) {
    // ── Legacy format: CSV has PLAYER, POS, AGE, TYPE, CAP_HOLDS, salary cols ──
    const salaryKeys = Object.keys(rows[0]).filter(k => /^\d{2}-\d{2}$/.test(k) && k >= curYr);
    const ovrMin = 60, ovrMax = 99;

    const cols = [
      { key: 'PLAYER', label: 'Player',   cls: 'bold',         },
      { key: 'POS',    label: 'Pos',      cls: 'muted center', },
      { key: 'AGE',    label: 'Age',      cls: 'right',        },
      { key: 'OVR',    label: 'OVR',      cls: 'right bold',   },
      ...salaryKeys.map((k, i) => ({
        key: k, label: k, cls: 'right' + (i === 0 ? ' div-left' : ''),
        display: r => formatSalary(r[k]),
      })),
    ];

    const typeOrder = { player: 0, 'two-way': 1, dead: 2 };
    const sorted = [...rows].sort((a, b) => {
      const ta = typeOrder[a.TYPE] ?? 3, tb = typeOrder[b.TYPE] ?? 3;
      if (ta !== tb) return ta - tb;
      return (parseFloat(b.OVR) || 0) - (parseFloat(a.OVR) || 0);
    });

    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    cols.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.cls?.includes('right')) th.classList.add('right');
      hr.appendChild(th);
    });

    const tbody = table.createTBody();
    let lastType = null;
    const LABELS = { 'two-way': 'Two-Way Contracts', dead: 'Dead Cap' };

    sorted.forEach(row => {
      if (row.TYPE !== lastType && LABELS[row.TYPE]) {
        const sep = tbody.insertRow();
        sep.className = 'subheader';
        const td = sep.insertCell();
        td.colSpan = cols.length;
        td.textContent = LABELS[row.TYPE];
        lastType = row.TYPE;
      } else if (row.TYPE !== lastType) {
        lastType = row.TYPE;
      }

      const tr = tbody.insertRow();
      if (row.TYPE === 'two-way') tr.className = 'row-twoway';
      if (row.TYPE === 'dead')    tr.className = 'row-dead';

      const capMap = parseCapHolds(row.CAP_HOLDS);

      cols.forEach(col => {
        const td = tr.insertCell();
        col.cls?.split(' ').forEach(c => c && td.classList.add(c));

        if (col.key === 'PLAYER') {
          const a = document.createElement('a');
          a.href = `/players/?p=${playerSlug(row.PLAYER)}`;
          a.textContent = row.PLAYER;
          td.appendChild(a);
        } else if (col.key === 'OVR') {
          const n = parseFloat(row.OVR);
          td.textContent = isNaN(n) ? '—' : String(n);
          if (!isNaN(n)) {
            const t = Math.min(1, Math.max(0, (n - ovrMin) / (ovrMax - ovrMin)));
            const hue = Math.round(t * 120);
            td.style.background = `hsl(${hue}, 55%, 18%)`;
            td.style.color = `hsl(${hue}, 80%, 72%)`;
          }
        } else if (/^\d{2}-\d{2}$/.test(col.key)) {
          td.textContent = col.display ? col.display(row) : (row[col.key] || '—');
          const capType = capMap[col.key];
          if (capType && CAP_HOLD_CSS[capType]) td.classList.add(CAP_HOLD_CSS[capType]);
        } else if (col.display) {
          td.textContent = col.display(row);
        } else {
          td.textContent = row[col.key] ?? '—';
        }
      });
    });

    const hasCapData = rows.some(r => r.CAP_HOLDS && r.CAP_HOLDS.trim() !== '');
    if (!hasCapData) return table;

    const allTypes = new Set();
    rows.forEach(r => {
      Object.values(parseCapHolds(r.CAP_HOLDS || '')).forEach(t => allTypes.add(t));
    });

    const legend = document.createElement('div');
    legend.className = 'cap-legend';
    ['PLAYER_OPT', 'TEAM_OPT', 'UFA', 'RFA', 'NON_GTD'].forEach(type => {
      if (!allTypes.has(type)) return;
      const item = document.createElement('span');
      item.className = 'cap-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'cap-swatch';
      swatch.style.background = SWATCH_COLORS[type];
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(CAP_HOLD_LABELS[type]));
      legend.appendChild(item);
    });

    const legacyWrap = document.createElement('div');
    legacyWrap.appendChild(table);
    legacyWrap.appendChild(legend);
    return legacyWrap;
  }

  // ── New format: SLUG + TYPE, OVR from currentOvr, rest from biosData ────────
  biosData = biosData || {};

  const augmented = rows
    .map(row => {
      const bio = biosData[row.SLUG] || {};
      const _type = row.TYPE || bio.type || '';
      return {
        SLUG:       row.SLUG,
        OVR:        currentOvr[row.SLUG] ?? row.OVR ?? '',
        _name:      displayNameFromBio(bio.name || '') || row.SLUG || '—',
        _pos:       (bio.pos || []).join(' · ') || '—',
        _age:       calcAge(bio.dob),
        _type,
        _cap_holds:          bio.cap_holds || {},
        _salaries:           bio.salaries || {},
        _guaranteed:         bio.guaranteed || {},
        _guarantee_dates:    bio.guarantee_dates || {},
        _guarantee_schedule: bio.guarantee_schedule || {},
        _jersey:             bio.jersey_number ?? null,
        _notes:              bio.notes || '',
      };
    });

  deadCapRows.forEach(row => {
    const bio = biosData[row.SLUG] || {};
    const dcSals = {};
    Object.keys(row).forEach(k => { if (/^\d{2}-\d{2}$/.test(k) && row[k]) dcSals[k] = row[k]; });
    augmented.push({
      SLUG:       row.SLUG,
      OVR:        '',
      _name:      displayNameFromBio(bio.name || '') || row.SLUG || '—',
      _pos:       (bio.pos || []).join(' · ') || '—',
      _age:       calcAge(bio.dob),
      _type:      'dead',
      _cap_holds: {},
      _salaries:  dcSals,
      _jersey:    null,
      _notes:     bio.notes || '',
    });
  });

  const salaryKeySet = new Set();
  augmented.forEach(a => {
    Object.keys(a._salaries).forEach(k => { if (k >= curYr) salaryKeySet.add(k); });
  });
  const salaryKeys = [...salaryKeySet].sort();
  augmented.forEach(a => {
    salaryKeys.forEach(k => { a[`_s_${k}`] = a._salaries[k] || ''; });
  });

  const ovrMin = 60, ovrMax = 100;

  const cols = [
    { key: '_jersey', label: '#',      cls: 'right muted' },
    { key: '_name',   label: 'Player', cls: 'bold' },
    { key: '_pos',    label: 'Pos',    cls: 'muted center' },
    { key: '_age',    label: 'Age',    cls: 'right' },
    { key: 'OVR',     label: 'OVR',    cls: 'right bold' },
    ...salaryKeys.map((k, i) => ({
      key: `_s_${k}`, label: k, cls: 'right' + (i === 0 ? ' div-left' : ''),
    })),
  ];

  const typeOrder = { player: 0, 'two-way': 1, dead: 2 };
  const sorted = [...augmented].sort((a, b) => {
    const ta = typeOrder[a._type] ?? 3, tb = typeOrder[b._type] ?? 3;
    if (ta !== tb) return ta - tb;
    return (parseFloat(b.OVR) || 0) - (parseFloat(a.OVR) || 0);
  });

  const table = document.createElement('table');
  const thead = table.createTHead();
  const hr = thead.insertRow();
  cols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    if (col.cls?.includes('right')) th.classList.add('right');
    hr.appendChild(th);
  });

  const tbody = table.createTBody();
  let lastType = null;
  const LABELS = { 'two-way': 'Two-Way Contracts', dead: 'Dead Cap' };

  sorted.forEach(row => {
    if (row._type !== lastType && LABELS[row._type]) {
      const sep = tbody.insertRow();
      sep.className = 'subheader';
      const td = sep.insertCell();
      td.colSpan = cols.length;
      td.textContent = LABELS[row._type];
      lastType = row._type;
    } else if (row._type !== lastType) {
      lastType = row._type;
    }

    const tr = tbody.insertRow();
    if (row._type === 'two-way') tr.className = 'row-twoway';
    if (row._type === 'dead')    tr.className = 'row-dead';

    const capMap = parseCapHolds(row._cap_holds);

    cols.forEach(col => {
      const td = tr.insertCell();
      col.cls?.split(' ').forEach(c => c && td.classList.add(c));

      if (col.key === '_jersey') {
        td.textContent = row._jersey != null ? `#${row._jersey}` : '—';
      } else if (col.key === '_name') {
        if (row.SLUG) {
          const a = document.createElement('a');
          a.href = `/players/?p=${row.SLUG}`;
          a.textContent = row._name;
          td.appendChild(a);
        } else {
          td.appendChild(document.createTextNode(row._name));
        }
        if (row._notes) {
          const pip = document.createElement('span');
          pip.className = 'player-note';
          pip.dataset.tip = row._notes;
          pip.innerHTML = '<svg width="9" height="11" viewBox="0 0 9 11" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="8" height="10" rx="1" stroke="currentColor"/><line x1="2" y1="3.5" x2="7" y2="3.5" stroke="currentColor"/><line x1="2" y1="5.5" x2="7" y2="5.5" stroke="currentColor"/><line x1="2" y1="7.5" x2="5" y2="7.5" stroke="currentColor"/></svg>';
          td.appendChild(pip);
        }
      } else if (col.key === 'OVR') {
        const n = parseFloat(row.OVR);
        td.textContent = isNaN(n) ? '—' : String(n);
        if (!isNaN(n)) {
          const t = Math.min(1, Math.max(0, (n - ovrMin) / (ovrMax - ovrMin)));
          const hue = Math.round(t * 120);
          td.style.background = `hsl(${hue}, 55%, 18%)`;
          td.style.color = `hsl(${hue}, 80%, 72%)`;
        }
      } else if (col.key.startsWith('_s_')) {
        const k = col.key.slice(3);
        const capType = capMap[k];
        if (capType === 'NON_GTD' && row[col.key]) {
          const tipText = buildNonGtdTip(k, row._guaranteed, row._guarantee_dates, row._guarantee_schedule);
          const wrap = document.createElement('span');
          wrap.className = 'sal-tip';
          wrap.dataset.tip = tipText;
          wrap.textContent = formatSalary(row[col.key]);
          td.appendChild(wrap);
        } else {
          td.textContent = formatSalary(row[col.key]);
        }
        if (capType && CAP_HOLD_CSS[capType]) td.classList.add(CAP_HOLD_CSS[capType]);
      } else {
        td.textContent = row[col.key] ?? '—';
      }
    });
  });

  // ── Salary tfoot ─────────────────────────────────────────────────────────────
  if (salaryKeys.length) {
    const BUCKET_ORDER = ['Guaranteed', 'Player Option', 'Team Option', 'Non-Guaranteed', 'Two-Way', 'Dead Cap', 'UFA Hold', 'RFA Hold'];
    const nonSalCols = cols.length - salaryKeys.length;

    // per-year per-bucket totals
    const totals = {};
    BUCKET_ORDER.forEach(b => { totals[b] = {}; salaryKeys.forEach(k => { totals[b][k] = { amt: 0, count: 0 }; }); });
    const grandTotals = {};
    salaryKeys.forEach(k => { grandTotals[k] = 0; });

    augmented.forEach(a => {
      const capMap = parseCapHolds(a._cap_holds);
      salaryKeys.forEach(k => {
        const amt = parseSalaryNum(a._salaries[k]);
        if (!amt) return;
        const holdType = capMap[k];
        let bucket;
        if (a._type === 'dead')              bucket = 'Dead Cap';
        else if (a._type === 'two-way')      bucket = 'Two-Way';
        else if (holdType === 'PLAYER_OPT')  bucket = 'Player Option';
        else if (holdType === 'TEAM_OPT')    bucket = 'Team Option';
        else if (holdType === 'NON_GTD')     bucket = 'Non-Guaranteed';
        else if (holdType === 'UFA')         bucket = 'UFA Hold';
        else if (holdType === 'RFA')         bucket = 'RFA Hold';
        else                                 bucket = 'Guaranteed';
        totals[bucket][k].amt += amt;
        totals[bucket][k].count += 1;
        grandTotals[k] += amt;
      });
    });

    const anyData = salaryKeys.some(k => grandTotals[k] > 0);
    if (anyData) {
      const tfoot = table.createTFoot();

      function tfRow(cls) {
        const tr = tfoot.insertRow();
        if (cls) tr.className = cls;
        return tr;
      }
      function tfCell(tr, text, cls, colspan) {
        const td = tr.insertCell();
        td.textContent = text;
        if (cls) td.className = cls;
        if (colspan) td.colSpan = colspan;
        return td;
      }

      // bucket rows
      BUCKET_ORDER.forEach(name => {
        const hasAny = salaryKeys.some(k => totals[name][k].count > 0);
        if (!hasAny) return;
        const tr = tfRow('tfoot-bucket');
        tfCell(tr, name, 'tfoot-label', nonSalCols);
        salaryKeys.forEach(k => {
          const { amt, count } = totals[name][k];
          const td = tfCell(tr, amt ? formatSalary(amt) : '—', 'right');
          if (count) {
            const sup = document.createElement('sup');
            sup.textContent = count;
            sup.style.cssText = 'color:#374151;font-size:0.65rem;margin-left:2px';
            td.appendChild(sup);
          }
        });
      });

      // total row
      const totalTr = tfRow('tfoot-divider tfoot-total');
      tfCell(totalTr, 'Total', 'tfoot-label', nonSalCols);
      salaryKeys.forEach(k => tfCell(totalTr, grandTotals[k] ? formatSalary(grandTotals[k]) : '—', 'right'));

      // cap level rows
      if (capLevels) {
        const capDefs = [
          { label: 'Salary Cap', key: 'cap' },
          { label: '1st Apron',  key: 'apron1' },
          { label: '2nd Apron',  key: 'apron2' },
          { label: 'Hard Cap',   key: 'hard_cap' },
        ];
        capDefs.forEach(({ label, key }) => {
          const hasCap = salaryKeys.some(k => capLevels[k]?.[key]);
          if (!hasCap) return;
          const tr = tfRow('tfoot-cap');
          tfCell(tr, label, 'tfoot-label', nonSalCols);
          salaryKeys.forEach(k => {
            const val = capLevels[k]?.[key];
            if (!val) { tfCell(tr, '—', 'right'); return; }
            const diff = grandTotals[k] - val;
            const over = diff > 0;
            if (over) tr.classList.add('over'); else tr.classList.add('under');
            const td = tfCell(tr, formatSalary(val), 'right');
            const diffSpan = document.createElement('span');
            diffSpan.className = 'tfoot-diff';
            diffSpan.style.cssText = 'display:block;font-size:0.7rem;margin-top:0.1rem';
            diffSpan.textContent = over
              ? `+${formatSalary(diff)}`
              : `-${formatSalary(Math.abs(diff))}`;
            td.appendChild(diffSpan);
          });
        });
      }

      // per-season hard-cap status row
      const anyHardCap = salaryKeys.some(k => seasonStates[k]?.hard_cap);
      if (anyHardCap) {
        const tr = tfRow('tfoot-cap tfoot-hardcap');
        tfCell(tr, 'Hard-Capped', 'tfoot-label', nonSalCols);
        salaryKeys.forEach(k => {
          const hc = seasonStates[k]?.hard_cap;
          if (!hc) { tfCell(tr, '—', 'right'); return; }
          const td = tr.insertCell();
          td.className = 'right';
          const chip = document.createElement('span');
          chip.className = 'hardcap-chip' + (hc === 'second_apron' ? ' apron2' : '');
          chip.textContent = hc === 'second_apron' ? '2nd Apron' : '1st Apron';
          const reason = seasonStates[k]?.hard_cap_reason;
          if (reason) chip.title = reason;
          td.appendChild(chip);
        });
      }
    }
  }

  const allCapTypes = new Set();
  augmented.forEach(a => {
    Object.values(parseCapHolds(a._cap_holds || '')).forEach(t => allCapTypes.add(t));
  });
  const hasCapData = augmented.some(a => Object.keys(a._cap_holds || {}).length > 0);
  if (!hasCapData) return table;

  const legend = document.createElement('div');
  legend.className = 'cap-legend';
  ['PLAYER_OPT', 'TEAM_OPT', 'UFA', 'RFA', 'NON_GTD'].forEach(type => {
    if (!allCapTypes.has(type)) return;
    const item = document.createElement('span');
    item.className = 'cap-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'cap-swatch';
    swatch.style.background = SWATCH_COLORS[type];
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(CAP_HOLD_LABELS[type]));
    legend.appendChild(item);
  });

  const wrap = document.createElement('div');
  wrap.appendChild(table);
  wrap.appendChild(legend);
  return wrap;
}

function bioPlayerName(slug, bios) {
  if (!slug || !bios) return null;
  const bio = bios[slug];
  if (!bio) return null;
  const parts = bio.name.split(',');
  return parts.length === 2 ? `${parts[1].trim()} ${parts[0].trim()}` : bio.name;
}

function buildPicksTable(picks, teamAbbr, bios = {}, allPicks = []) {
  const sortPicks  = arr => [...arr].sort((a, b) => a.year - b.year || a.round - b.round);
  const isTBD      = p => p.owner === '?' || p.owner.includes('|');
  const own        = sortPicks(picks.filter(p => p.orig === teamAbbr && p.owner === teamAbbr));
  const uncertain  = sortPicks(picks.filter(p => isTBD(p)));
  const acquired   = sortPicks(picks.filter(p => p.orig !== teamAbbr && !isTBD(p)));
  const traded     = sortPicks(allPicks.filter(p => p.orig === teamAbbr && p.owner !== teamAbbr && !isTBD(p)));

  if (!own.length && !uncertain.length && !acquired.length && !traded.length) return null;

  const table = document.createElement('table');
  const thead = table.createTHead();
  const hr = thead.insertRow();
  ['Year', 'Rnd', 'Team', 'Pick', 'Player', 'Protection', 'Swap', 'Notes'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    if (label === 'Pick' || label === 'Year' || label === 'Rnd') th.classList.add('right');
    if (label === 'Team' || label === 'Player' || label === 'Protection' || label === 'Swap' || label === 'Notes') th.classList.add('muted');
    hr.appendChild(th);
  });

  const tbody = table.createTBody();

  const addSection = (label, rows, rowClass, teamCell) => {
    if (!rows.length) return;
    const sep = tbody.insertRow();
    sep.className = 'subheader';
    const td = sep.insertCell();
    td.colSpan = 8;
    td.textContent = label;

    rows.forEach(p => {
      const tr = tbody.insertRow();
      if (rowClass) tr.className = rowClass;

      const protLabel = p.protected != null ? `Top-${p.protected}` : '';
      const cells = [
        [String(p.year),                      'right',        ],
        [p.round === 1 ? '1st' : '2nd',       'right',        ],
        [teamCell(p),                          'muted center', ],
        [p.pick != null ? `#${p.pick}` : '—', 'right',        ],
        [bioPlayerName(p.player, bios) || '',  'muted',        ],
        [protLabel,                            'muted',        ],
        [p.swap_owner || '',                   'muted',        ],
        [p.notes || '',                        'muted',        ],
      ];
      cells.forEach(([text, cls]) => {
        const td = tr.insertCell();
        if (cls) cls.split(' ').forEach(c => td.classList.add(c));
        td.textContent = text;
      });
    });
  };

  addSection('Own Picks',           own,       null,              () => '—');
  addSection('Owner TBD',           uncertain, 'picks-uncertain',  p => p.owner === '?' ? '?' : p.owner.split('|').join(' | '));
  addSection('Acquired Picks',      acquired,  'picks-acquired',   p => p.orig);
  addSection('Traded Away',         traded,    'picks-traded',     p => p.owner);

  return table;
}

const SEASON_COLS = [
  { key: 'SEASON',         label: 'Season',  cls: 'bold',        sortField: 'SEASON',        defaultDir:  1 },
  { key: 'wl',             label: 'W–L',     cls: 'right',       sortField: 'PCT',           defaultDir: -1,
    display: r => `${r.W}–${r.L}` },
  { key: 'PCT',            label: 'W%',      cls: 'right muted', sortField: 'PCT',           defaultDir: -1,
    display: r => fmtPct(r.PCT) },
  { key: 'PPG',            label: 'PPG',     cls: 'right',       sortField: 'PPG',           defaultDir: -1 },
  { key: 'OPPG',           label: 'OPPG',    cls: 'right',       sortField: 'OPPG',          defaultDir:  1 },
  { key: 'DIFF',           label: '+/−',     cls: 'right',       sortField: 'DIFF',          defaultDir: -1,
    display: r => fmtSigned(r.DIFF) },
  { key: 'SEED',           label: 'Seed',    cls: 'right',       sortField: 'SEED_NUM',      defaultDir:  1,
    display: r => r.SEED || '—' },
  { key: 'OFF_RTG',        label: 'Off Rtg', cls: 'right',       sortField: 'OFF_RTG',       defaultDir: -1,
    display: r => fmtSigned(r.OFF_RTG, 2) },
  { key: 'DEF_RTG',        label: 'Def Rtg', cls: 'right',       sortField: 'DEF_RTG',       defaultDir: -1,
    display: r => fmtSigned(r.DEF_RTG, 2) },
  { key: 'PLAYOFF_RESULT', label: 'Playoffs', cls: '',           sortField: 'PLAYOFF_RESULT', defaultDir: -1 },
];

const PLAYER_COLS = [
  { key: 'PLAYER',   label: 'Player',  cls: 'bold',        sortField: 'PLAYER',   defaultDir:  1 },
  { key: 'GP',       label: 'GP',      cls: 'right',       sortField: 'GP',       defaultDir: -1 },
  { key: 'GMSC_TOT', label: 'GMSC',    cls: 'right',       sortField: 'GMSC_TOT', defaultDir: -1 },
  { key: 'GMSC_AVG', label: 'GMSC/G',  cls: 'right muted', sortField: 'GMSC_AVG', defaultDir: -1 },
  { key: 'PPG',      label: 'PPG',     cls: 'right',       sortField: 'PPG',      defaultDir: -1 },
  { key: 'RPG',      label: 'RPG',     cls: 'right',       sortField: 'RPG',      defaultDir: -1 },
  { key: 'APG',      label: 'APG',     cls: 'right',       sortField: 'APG',      defaultDir: -1 },
  { key: 'SPG',      label: 'SPG',     cls: 'right',       sortField: 'SPG',      defaultDir: -1 },
  { key: 'BPG',      label: 'BPG',     cls: 'right',       sortField: 'BPG',      defaultDir: -1 },
  { key: '3PMPG',    label: '3PM/G',   cls: 'right',       sortField: '3PMPG',    defaultDir: -1 },
  { key: 'SEASONS',  label: 'Seasons', cls: 'muted',       sortField: 'SEASONS',  defaultDir:  1 },
];

const PO_CLASS = {
  'Champion':     'po-champion',
  'Runner-Up':    'po-runnerup',
  'Conf Finals':  'po-conffinals',
  'Second Round': 'po-other',
  'First Round':  'po-other',
  'Missed':       'po-missed',
};

const SEASON_COLOR_COLS = new Set(['DIFF', 'OFF_RTG', 'DEF_RTG']);

function makeSeasonRenderCell(rows) {
  const ranges = {};
  SEASON_COLOR_COLS.forEach(key => {
    const vals = rows.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
    if (vals.length > 0) {
      const absMax = Math.max(...vals.map(Math.abs));
      ranges[key] = { absMax };
    }
  });

  return function(td, col, row) {
    if (col.key === 'SEASON') {
      td.appendChild(document.createTextNode(row.SEASON));
      if (row.FOTY === 'TRUE') {
        const b = document.createElement('span');
        b.className = 'badge'; b.dataset.tip = 'Franchise of the Year'; b.textContent = '⭐';
        td.appendChild(b);
      }
      if (row.COTY === 'TRUE') {
        const b = document.createElement('span');
        b.className = 'badge'; b.dataset.tip = 'Coach of the Year'; b.textContent = '🏅';
        td.appendChild(b);
      }
    } else if (col.key === 'PLAYOFF_RESULT') {
      const cls = PO_CLASS[row.PLAYOFF_RESULT];
      if (cls) td.classList.add(cls);
      td.textContent = row.PLAYOFF_RESULT || '—';
    } else if (col.display) {
      td.textContent = col.display(row);
    } else {
      td.textContent = row[col.key] ?? '—';
    }

    if (ranges[col.key]) {
      const n = parseFloat(row[col.key]);
      if (!isNaN(n)) {
        const { absMax } = ranges[col.key];
        const t = absMax === 0 ? 0.5 : Math.min(1, Math.max(0, n / absMax * 0.5 + 0.5));
        const hue = Math.round(t * 120);
        td.style.background = `hsl(${hue}, 55%, 18%)`;
        td.style.color = `hsl(${hue}, 80%, 72%)`;
      }
    }
  };
}

function buildPersonnelSection(members, allGames) {
  const POS_LABEL = { owner: 'Owner', gm: 'GM', coach: 'Coach' };

  const rows = [];
  for (const member of members) {
    for (const tenure of (member.tenures || [])) {
      if (tenure.team !== abbr || tenure.position === 'none') continue;

      const ts = tenure.start;
      const te = tenure.end ?? '9999-99-99';

      const games = allGames.filter(g =>
        g.date >= ts && g.date <= te &&
        (g.home_team === abbr || g.away_team === abbr)
      );

      let W = 0, L = 0;
      for (const g of games) {
        const won = g.home_team === abbr ? g.home_score > g.away_score : g.away_score > g.home_score;
        if (won) W++; else L++;
      }
      const pct    = W + L > 0 ? W / (W + L) : null;
      const active = tenure.end === null;

      rows.push({
        name: member.name, posLabel: POS_LABEL[tenure.position] || tenure.position,
        startDate: tenure.start, endDate: tenure.end,
        active, n: games.length, W, L, pct,
      });
    }
  }

  if (!rows.length) return;
  rows.sort((a, b) => a.startDate.localeCompare(b.startDate));

  function fmtTenureDate(iso) {
    const [y, m] = iso.split('-');
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  const section = document.getElementById('personnel-section');
  const wrap    = document.getElementById('personnel-wrap');

  const table = document.createElement('table');
  const hrow  = table.createTHead().insertRow();
  ['Name', 'Role', 'Tenure', 'W', 'L', 'PCT'].forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i >= 3) th.className = 'right';
    hrow.appendChild(th);
  });

  const tbody = table.createTBody();
  rows.forEach(row => {
    const tr = tbody.insertRow();

    const tdN = tr.insertCell(); tdN.className = 'bold';  tdN.textContent = row.name;
    const tdP = tr.insertCell(); tdP.className = 'muted'; tdP.textContent = row.posLabel;

    const tdS = tr.insertCell();
    tdS.textContent = fmtTenureDate(row.startDate) + ' – ' + (row.active ? 'Present' : fmtTenureDate(row.endDate));

    const tdW   = tr.insertCell(); tdW.className   = 'right'; tdW.textContent   = row.n ? row.W   : '—';
    const tdL   = tr.insertCell(); tdL.className   = 'right'; tdL.textContent   = row.n ? row.L   : '—';
    const tdPct = tr.insertCell(); tdPct.className = 'right'; tdPct.textContent = row.pct !== null ? fmtPct(row.pct) : '—';
  });

  wrap.appendChild(table);
  section.style.display = '';
}

function buildTimeline(rows) {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;
  const TL_CLASS = {
    'Champion':     'tl-champion',
    'Runner-Up':    'tl-runnerup',
    'Conf Finals':  'tl-conffinals',
    'Second Round': 'tl-second',
    'First Round':  'tl-second',
    'Missed':       'tl-missed',
  };
  const sorted = [...rows].sort((a, b) => (a.SEASON > b.SEASON ? 1 : -1));
  sorted.forEach(row => {
    const card = document.createElement('div');
    card.className = 'tl-card ' + (TL_CLASS[row.PLAYOFF_RESULT] || '');
    const tip = `${row.SEASON}: ${row.W}–${row.L} · ${row.SEED || '—'} · ${row.PLAYOFF_RESULT || '—'}`;
    card.title = tip;
    card.innerHTML = `
      <span class="tl-season">${row.SEASON}</span>
      <span class="tl-wins">${row.W}</span>
      <span class="tl-seed">${(row.SEED || '').replace('East-', 'E').replace('West-', 'W')}</span>
    `;
    wrap.appendChild(card);
  });
}

function playerSlug(name) {
  return name.toLowerCase().replace(/, /g, '-').replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
}

function renderPlayerCell(td, col, row) {
  if (col.key === 'PLAYER') {
    const a = document.createElement('a');
    a.href = `/players/?p=${playerSlug(row.PLAYER)}`;
    a.textContent = row.PLAYER;
    td.appendChild(a);
  } else {
    td.textContent = col.display ? col.display(row) : (row[col.key] ?? '—');
  }
}

// ── Edit mode ────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'nbn_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = t => localStorage.setItem(TOKEN_KEY, t);

const SEL_STYLE = 'background:#111827;border:1px solid #374151;border-radius:4px;color:#d1d5db;font-size:0.75rem;padding:0.15rem 0.3rem;font-family:inherit;cursor:pointer;outline:none';

const CAP_OPTIONS = [
  { value: '',           label: '—'          },
  { value: 'UFA',        label: 'UFA'        },
  { value: 'RFA',        label: 'RFA'        },
  { value: 'PLAYER_OPT', label: 'Player Opt' },
  { value: 'TEAM_OPT',   label: 'Team Opt'   },
  { value: 'NON_GTD',    label: 'Non-Gtd'    },
];

const CAP_HOLD_COLORS = {
  UFA:        { bg: 'hsl(45,60%,20%)',  color: 'hsl(45,90%,72%)'  },
  RFA:        { bg: 'hsl(25,60%,20%)',  color: 'hsl(25,90%,72%)'  },
  PLAYER_OPT: { bg: 'hsl(120,50%,17%)', color: 'hsl(120,75%,68%)' },
  TEAM_OPT:   { bg: 'hsl(210,55%,20%)', color: 'hsl(210,75%,70%)' },
  NON_GTD:    { bg: '#111827',           color: '#4b5563'          },
};

function applyCapHoldColor(sel) {
  const c = CAP_HOLD_COLORS[sel.value];
  sel.style.background = c ? c.bg : '#111827';
  sel.style.color = c ? c.color : '#d1d5db';
  sel.style.borderColor = c ? c.color.replace(/(\d+)%\)$/, m => m.replace(/\d+/, n => Math.round(n * 0.55))) : '#374151';
}

function promptToken(onSuccess) {
  const overlay = document.createElement('div');
  overlay.className = 'token-overlay';
  overlay.innerHTML = `
    <div class="token-modal">
      <h3>Access token required</h3>
      <p>Enter your committee token. It will be saved in this browser.</p>
      <input type="password" id="token-input" placeholder="Paste token…" autocomplete="off" />
      <div class="token-modal-actions">
        <button style="padding:0.35rem 0.8rem;border:1px solid #374151;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#d1d5db;font-family:inherit" id="tok-cancel">Cancel</button>
        <button style="padding:0.35rem 0.8rem;border:1px solid #3b82f6;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#60a5fa;font-family:inherit" id="tok-submit">Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#token-input');
  input.focus();
  overlay.querySelector('#tok-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#tok-submit').addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) return;
    setToken(val);
    overlay.remove();
    onSuccess(val);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') overlay.querySelector('#tok-submit').click();
    if (e.key === 'Escape') overlay.remove();
  });
}

function withToken(fn) {
  const t = getToken();
  if (t) { fn(t); return; }
  promptToken(fn);
}

function makeSelect(options, selectedValue) {
  const sel = document.createElement('select');
  sel.style.cssText = SEL_STYLE;
  options.forEach(opt => {
    const o = document.createElement('option');
    const v = typeof opt === 'string' ? opt : opt.value;
    const l = typeof opt === 'string' ? opt : opt.label;
    o.value = v;
    o.textContent = l;
    if (v === selectedValue) o.selected = true;
    sel.appendChild(o);
  });
  return sel;
}

function nextSalaryYear(yr) {
  const b = parseInt(yr.split('-')[1], 10);
  return `${String(b).padStart(2,'0')}-${String((b + 1) % 100).padStart(2,'0')}`;
}

function prevSalaryYear(yr) {
  const a = parseInt(yr.split('-')[0], 10);
  return `${String((a - 1 + 100) % 100).padStart(2,'0')}-${String(a).padStart(2,'0')}`;
}

function makeEditCell(header, value, config, pickerCtx) {
  const td = document.createElement('td');
  let getValue;
  let capHoldRef = null;

  if (config?.type === 'select') {
    const sel = makeSelect(config.options, value);
    td.style.cssText = 'padding:0.4rem 0.5rem;vertical-align:middle';
    td.appendChild(sel);
    getValue = () => sel.value;

  } else if (config?.type === 'cap-holds') {
    const holdMap = {};
    (value || '').split(',').forEach(pair => {
      const [yr, type] = pair.split(':');
      if (yr && type) holdMap[yr.trim()] = type.trim();
    });
    td.style.cssText = 'padding:0.4rem 0.5rem;vertical-align:middle';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.2rem 0.5rem;align-items:center';
    const selects = {};
    config.years.forEach(yr => {
      const lbl = document.createElement('span');
      lbl.textContent = yr;
      lbl.style.cssText = 'font-size:0.65rem;color:#6b7280;white-space:nowrap';
      const sel = makeSelect(CAP_OPTIONS, holdMap[yr] || '');
      applyCapHoldColor(sel);
      sel.addEventListener('change', () => applyCapHoldColor(sel));
      selects[yr] = sel;
      wrap.appendChild(lbl);
      wrap.appendChild(sel);
    });
    td.appendChild(wrap);
    capHoldRef = { wrap, selects };
    getValue = () => config.years
      .filter(yr => selects[yr].value !== '')
      .map(yr => `${yr}:${selects[yr].value}`)
      .join(',');

  } else if (config?.type === 'salary') {
    td.contentEditable = 'true';
    td.textContent = value;
    td.style.outline = 'none';
    td.addEventListener('focus', () => {
      td.style.background = '#263244';
      td.style.boxShadow = 'inset 0 0 0 1px #3b82f6';
    });
    td.addEventListener('blur', () => {
      td.style.background = '';
      td.style.boxShadow = '';
      const raw = td.textContent.replace(/[$,\s]/g, '');
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) td.textContent = '$' + n.toLocaleString('en-US');
      else if (raw === '') td.textContent = '';
    });
    getValue = () => td.textContent.trim();

  } else if (config?.type === 'player-picker') {
    const ctx = pickerCtx || {};
    const input = document.createElement('input');
    input.type = 'text';
    if (ctx.listId) input.setAttribute('list', ctx.listId);
    input.value = value && ctx.slugToDisplay ? (ctx.slugToDisplay.get(value) || value) : (value || '');
    input.style.cssText = 'background:#111827;border:1px solid #374151;border-radius:4px;color:#d1d5db;font-size:0.8rem;padding:0.2rem 0.4rem;font-family:inherit;width:180px;box-sizing:border-box';
    td.style.cssText = 'padding:0.4rem 0.5rem;vertical-align:middle';
    td.appendChild(input);
    getValue = () => {
      const typed = input.value.trim();
      return (ctx.nameToSlug && ctx.nameToSlug.get(typed.toLowerCase())) || '';
    };

  } else {
    td.contentEditable = 'true';
    td.textContent = value;
    td.style.outline = 'none';
    td.addEventListener('focus', () => {
      td.style.background = '#263244';
      td.style.boxShadow = 'inset 0 0 0 1px #3b82f6';
    });
    td.addEventListener('blur', () => {
      td.style.background = '';
      td.style.boxShadow = '';
    });
    getValue = () => td.textContent.trim();
  }

  return { td, getValue, capHoldRef };
}

function buildEditableGrid(headers, rows, cellConfig = {}) {
  const mutableHeaders = [...headers];
  const capHoldCells = [];

  // Build shared datalist for any player-picker column
  let pickerCtx = null;
  const pickerConf = Object.values(cellConfig).find(c => c?.type === 'player-picker');
  if (pickerConf) {
    const bios = pickerConf.biosData || {};
    const nameToSlug = new Map();
    const slugToDisplay = new Map();
    const listId = `nbn-pdl-${Date.now()}`;
    const dl = document.createElement('datalist');
    dl.id = listId;
    Object.entries(bios).sort(([, a], [, b]) => {
      return displayNameFromBio(a.name || '').localeCompare(displayNameFromBio(b.name || ''));
    }).forEach(([s, bio]) => {
      const dn = displayNameFromBio(bio.name || '');
      if (!dn) return;
      nameToSlug.set(dn.toLowerCase(), s);
      slugToDisplay.set(s, dn);
      const opt = document.createElement('option');
      opt.value = dn;
      dl.appendChild(opt);
    });
    document.body.appendChild(dl);
    pickerCtx = { listId, nameToSlug, slugToDisplay };
  }

  const table = document.createElement('table');
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  const emptyTh = document.createElement('th');
  emptyTh.style.cssText = 'width:28px;padding:0 0.4rem';
  headerRow.appendChild(emptyTh);
  mutableHeaders.forEach(h => {
    const th = document.createElement('th');
    th.textContent = cellConfig[h]?.label || h;
    headerRow.appendChild(th);
  });

  const tbody = table.createTBody();

  function makeRow(data = {}) {
    const tr = document.createElement('tr');
    const getters = [];

    const delTd = document.createElement('td');
    delTd.style.cssText = 'width:28px;padding:0 0.4rem;text-align:center;vertical-align:middle';
    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.style.cssText = 'background:none;border:none;color:#4b5563;cursor:pointer;font-size:1.1rem;line-height:1;padding:0;font-family:inherit';
    delBtn.onmouseenter = () => { delBtn.style.color = '#f87171'; };
    delBtn.onmouseleave = () => { delBtn.style.color = '#4b5563'; };
    delBtn.addEventListener('click', () => tr.remove());
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    mutableHeaders.forEach(h => {
      const { td, getValue, capHoldRef } = makeEditCell(h, data[h] ?? '', cellConfig[h], pickerCtx);
      getters.push(getValue);
      if (capHoldRef) capHoldCells.push(capHoldRef);
      tr.appendChild(td);
    });

    tr._getters = getters;
    return tr;
  }

  rows.forEach(row => tbody.appendChild(makeRow(row)));

  const addTr = document.createElement('tr');
  const addTd = document.createElement('td');
  addTd.colSpan = mutableHeaders.length + 1;
  addTd.style.cssText = 'padding:0.5rem 1rem;border-top:1px solid #374151';
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add row';
  addBtn.style.cssText = 'background:none;border:1px dashed #374151;border-radius:4px;color:#6b7280;cursor:pointer;font-size:0.8rem;padding:0.25rem 0.75rem;font-family:inherit';
  addBtn.onmouseenter = () => { addBtn.style.color = '#d1d5db'; addBtn.style.borderColor = '#9ca3af'; };
  addBtn.onmouseleave = () => { addBtn.style.color = '#6b7280'; addBtn.style.borderColor = '#374151'; };
  addBtn.addEventListener('click', () => tbody.insertBefore(makeRow({}), addTr));
  addTd.appendChild(addBtn);
  addTr.appendChild(addTd);
  tbody.appendChild(addTr);

  function addYearColumn(yr) {
    // Insert at the correct sorted position among salary year columns
    const rawIdx = mutableHeaders.findIndex(h => /^\d{2}-\d{2}$/.test(h) && h > yr);
    const insertAt = rawIdx === -1 ? mutableHeaders.length : rawIdx;

    mutableHeaders.splice(insertAt, 0, yr);
    cellConfig[yr] = { type: 'salary' };
    addTd.colSpan = mutableHeaders.length + 1;

    // Insert in CAP_HOLDS years list in sorted order
    if (cellConfig.CAP_HOLDS?.years) {
      const capYrs = cellConfig.CAP_HOLDS.years;
      const capIdx = capYrs.findIndex(y => y > yr);
      if (capIdx === -1) capYrs.push(yr);
      else capYrs.splice(capIdx, 0, yr);
    }

    // Add th at correct position (children[0] = emptyTh, so headers index i → children[i+1])
    const thRef = headerRow.children[insertAt + 1] || null;
    const th = document.createElement('th');
    th.textContent = yr;
    headerRow.insertBefore(th, thRef);

    // Add td to each existing data row at correct position
    [...tbody.rows].filter(tr => tr !== addTr).forEach(tr => {
      const { td, getValue } = makeEditCell(yr, '', { type: 'salary' });
      tr.insertBefore(td, tr.children[insertAt + 1] || null);
      tr._getters.splice(insertAt, 0, getValue);
    });

    // Add year select to each CAP_HOLDS cell in sorted order
    capHoldCells.forEach(({ wrap, selects }) => {
      const lbl = document.createElement('span');
      lbl.textContent = yr;
      lbl.style.cssText = 'font-size:0.65rem;color:#6b7280;white-space:nowrap';
      const sel = makeSelect(CAP_OPTIONS, '');
      applyCapHoldColor(sel);
      sel.addEventListener('change', () => applyCapHoldColor(sel));
      selects[yr] = sel;
      const posInNewYears = cellConfig.CAP_HOLDS.years.indexOf(yr);
      const wrapRef = wrap.children[posInNewYears * 2] || null;
      wrap.insertBefore(lbl, wrapRef);
      wrap.insertBefore(sel, wrapRef);
    });
  }

  function getRows() {
    return [...tbody.rows]
      .filter(tr => tr !== addTr)
      .map(tr => {
        const obj = {};
        tr._getters.forEach((get, i) => { obj[mutableHeaders[i]] = get(); });
        return obj;
      });
  }

  function getHeaders() { return [...mutableHeaders]; }

  return { table, getRows, getHeaders, addYearColumn };
}

function rosterCellConfig(headers, biosData = {}) {
  if (headers.includes('SLUG') && !headers.includes('PLAYER')) {
    const salaryYears = headers.filter(h => /^\d{2}-\d{2}$/.test(h));
    const config = {
      SLUG: { type: 'player-picker', biosData, label: 'Player' },
    };
    salaryYears.forEach(yr => { config[yr] = { type: 'salary' }; });
    return config;
  }
  const salaryYears = headers.filter(h => /^\d{2}-\d{2}$/.test(h));
  const config = {
    TYPE: { type: 'select', options: [
      { value: 'player',   label: 'Player'   },
      { value: 'two-way',  label: 'Two-Way'  },
      { value: 'dead',     label: 'Dead Cap' },
    ]},
    CAP_HOLDS: { type: 'cap-holds', years: salaryYears },
  };
  salaryYears.forEach(yr => { config[yr] = { type: 'salary' }; });
  return config;
}


function enterEditMode(wrapEl, headers, rows, apiPath, renderView, cellConfig = {}) {
  const { table, getRows, getHeaders, addYearColumn } = buildEditableGrid(headers, rows, cellConfig);

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid #3b82f6;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#60a5fa;font-family:inherit';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid #374151;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#d1d5db;font-family:inherit';

  const statusEl = document.createElement('span');
  statusEl.style.cssText = 'font-size:0.75rem;color:#6b7280;margin-left:auto';

  toolbar.appendChild(saveBtn);
  toolbar.appendChild(cancelBtn);

  const salaryYears = headers.filter(h => /^\d{2}-\d{2}$/.test(h));
  if (salaryYears.length && (cellConfig.CAP_HOLDS || cellConfig.SLUG)) {
    const YR_BTN = 'padding:0.35rem 0.8rem;border:1px solid #374151;border-radius:6px;font-size:0.8rem;font-weight:500;cursor:pointer;background:transparent;color:#9ca3af;font-family:inherit';
    const onYrEnter = e => { e.target.style.color = '#d1d5db'; e.target.style.borderColor = '#6b7280'; };
    const onYrLeave = e => { e.target.style.color = '#9ca3af'; e.target.style.borderColor = '#374151'; };

    let pendingPrevYr = prevSalaryYear(salaryYears[0]);
    const addPrevBtn = document.createElement('button');
    addPrevBtn.style.cssText = YR_BTN;
    addPrevBtn.onmouseenter = onYrEnter;
    addPrevBtn.onmouseleave = onYrLeave;
    const updatePrevLabel = () => { addPrevBtn.textContent = `+ ${pendingPrevYr}`; };
    updatePrevLabel();
    addPrevBtn.addEventListener('click', () => {
      addYearColumn(pendingPrevYr);
      pendingPrevYr = prevSalaryYear(pendingPrevYr);
      updatePrevLabel();
    });
    toolbar.appendChild(addPrevBtn);

    let pendingNextYr = nextSalaryYear(salaryYears[salaryYears.length - 1]);
    const addNextBtn = document.createElement('button');
    addNextBtn.style.cssText = YR_BTN;
    addNextBtn.onmouseenter = onYrEnter;
    addNextBtn.onmouseleave = onYrLeave;
    const updateNextLabel = () => { addNextBtn.textContent = `+ ${pendingNextYr}`; };
    updateNextLabel();
    addNextBtn.addEventListener('click', () => {
      addYearColumn(pendingNextYr);
      pendingNextYr = nextSalaryYear(pendingNextYr);
      updateNextLabel();
    });
    toolbar.appendChild(addNextBtn);
  }

  toolbar.appendChild(statusEl);

  const gridWrap = document.createElement('div');
  gridWrap.className = 'table-wrap';
  gridWrap.style.overflowX = 'auto';
  gridWrap.appendChild(table);

  wrapEl.innerHTML = '';
  wrapEl.appendChild(toolbar);
  wrapEl.appendChild(gridWrap);

  cancelBtn.addEventListener('click', () => renderView(rows));

  saveBtn.addEventListener('click', async () => {
    const updatedRows = getRows();
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    statusEl.textContent = 'Saving…';
    try {
      const res = await fetch(`/api${apiPath}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ headers: getHeaders(), rows: updatedRows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403) {
          localStorage.removeItem(TOKEN_KEY);
          statusEl.textContent = 'Invalid token — cleared. Try again.';
        } else {
          statusEl.textContent = `Error: ${err.detail || res.status}`;
        }
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        return;
      }
      statusEl.textContent = 'Saved!';
      setTimeout(() => renderView(updatedRows), 700);
    } catch {
      statusEl.textContent = 'Network error';
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}

function setupPicksEditable(titleId, wrapEl, picks, teamAbbr, bios = {}, allPicks = []) {
  const INP = 'background:#111827;border:1px solid #374151;border-radius:4px;color:#d1d5db;font-size:0.8rem;padding:0.2rem 0.4rem;font-family:inherit;width:100%';

  const playerOpts = [{ slug: '', label: '—' },
    ...Object.entries(bios)
      .map(([slug, bio]) => {
        const parts = bio.name.split(',');
        const label = parts.length === 2 ? `${parts[1].trim()} ${parts[0].trim()}` : bio.name;
        return { slug, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  ];

  function renderView(currentPicks) {
    wrapEl.innerHTML = '';
    const t = buildPicksTable(currentPicks, teamAbbr, bios, allPicks);
    if (t) wrapEl.appendChild(t);
    else wrapEl.innerHTML = '<div class="status">No picks on file.</div>';
    attachBtn(currentPicks);
  }

  function attachBtn(currentPicks) {
    const titleEl = document.getElementById(titleId);
    titleEl.querySelector('.section-edit-btn')?.remove();
    const btn = document.createElement('button');
    btn.className = 'section-edit-btn';
    btn.textContent = 'Edit';
    btn.style.cssText = 'font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid #374151;border-radius:4px;background:transparent;color:#6b7280;cursor:pointer;font-weight:500;margin-left:0.6rem;font-family:inherit;vertical-align:middle';
    btn.onmouseenter = () => { btn.style.color = '#d1d5db'; btn.style.borderColor = '#6b7280'; };
    btn.onmouseleave = () => { btn.style.color = '#6b7280'; btn.style.borderColor = '#374151'; };
    btn.addEventListener('click', () => withToken(() => enterPicksEdit(currentPicks)));
    titleEl.appendChild(btn);
  }

  function enterPicksEdit(currentPicks) {
    wrapEl.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid #3b82f6;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#60a5fa;font-family:inherit';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid #374151;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#d1d5db;font-family:inherit';

    const statusEl = document.createElement('span');
    statusEl.style.cssText = 'font-size:0.75rem;color:#6b7280;margin-left:auto';

    toolbar.appendChild(saveBtn);
    toolbar.appendChild(cancelBtn);
    toolbar.appendChild(statusEl);

    // Build editable table
    const gridWrap = document.createElement('div');
    gridWrap.className = 'table-wrap';
    gridWrap.style.overflowX = 'auto';

    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    ['Year', 'Rnd', 'Orig', 'Owner', 'Pick #', 'Player', 'Top-N Prot.', 'Swap Owner', 'Notes'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      hr.appendChild(th);
    });

    const teamOptions = Object.keys(TEAMS).sort();
    const rowGetters = [];

    const tbody = table.createTBody();
    currentPicks.forEach(p => {
      const tr = tbody.insertRow();

      // read-only: year, round, orig
      [String(p.year), p.round === 1 ? '1st' : '2nd', p.orig].forEach(v => {
        const td = tr.insertCell();
        td.textContent = v;
        td.style.color = '#6b7280';
      });

      // owner input (supports single team, pipe-separated candidates, or '?')
      const tdOwner = tr.insertCell();
      const inpOwner = document.createElement('input');
      inpOwner.type = 'text';
      inpOwner.style.cssText = INP;
      inpOwner.value = p.owner || '';
      inpOwner.placeholder = 'ATL or ATL|BKN or ?';
      inpOwner.style.textTransform = 'uppercase';
      tdOwner.appendChild(inpOwner);

      // pick number
      const tdPick = tr.insertCell();
      const inpPick = document.createElement('input');
      inpPick.type = 'number'; inpPick.min = '1'; inpPick.max = '60';
      inpPick.style.cssText = INP;
      if (p.pick != null) inpPick.value = p.pick;
      tdPick.appendChild(inpPick);

      // player
      const tdPlayer = tr.insertCell();
      const selPlayer = document.createElement('select');
      selPlayer.style.cssText = INP;
      playerOpts.forEach(({ slug, label }) => {
        const o = document.createElement('option');
        o.value = slug; o.textContent = label;
        if (slug === (p.player || '')) o.selected = true;
        selPlayer.appendChild(o);
      });
      tdPlayer.appendChild(selPlayer);

      // protected
      const tdProt = tr.insertCell();
      const inpProt = document.createElement('input');
      inpProt.type = 'number'; inpProt.min = '1'; inpProt.max = '30';
      inpProt.style.cssText = INP;
      if (p.protected != null) inpProt.value = p.protected;
      tdProt.appendChild(inpProt);

      // swap owner
      const tdSwap = tr.insertCell();
      const selSwap = document.createElement('select');
      selSwap.style.cssText = INP;
      [{ value: '', label: '—' }, ...teamOptions.map(t => ({ value: t, label: t }))].forEach(({ value, label }) => {
        const o = document.createElement('option');
        o.value = value; o.textContent = label;
        if (value === (p.swap_owner || '')) o.selected = true;
        selSwap.appendChild(o);
      });
      tdSwap.appendChild(selSwap);

      // notes
      const tdNotes = tr.insertCell();
      const inpNotes = document.createElement('input');
      inpNotes.type = 'text';
      inpNotes.style.cssText = INP;
      inpNotes.value = p.notes || '';
      tdNotes.appendChild(inpNotes);

      rowGetters.push(() => ({
        year: p.year, round: p.round, orig: p.orig,
        owner:      inpOwner.value.trim().toUpperCase() || p.orig,
        pick:       inpPick.value  ? parseInt(inpPick.value)  : null,
        player:     selPlayer.value || null,
        protected:  inpProt.value  ? parseInt(inpProt.value)  : null,
        swap_owner: selSwap.value  || null,
        notes:      inpNotes.value.trim(),
      }));
    });

    gridWrap.appendChild(table);
    wrapEl.appendChild(toolbar);
    wrapEl.appendChild(gridWrap);

    cancelBtn.addEventListener('click', () => renderView(currentPicks));

    saveBtn.addEventListener('click', async () => {
      const updated = rowGetters.map(g => g());
      saveBtn.disabled = true; cancelBtn.disabled = true;
      statusEl.textContent = 'Saving…';
      try {
        const token = getToken();
        let failed = null;
        for (const p of updated) {
          const r = await fetch(`/api/picks/${p.year}/${p.round}/${p.orig}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ owner: p.owner, pick: p.pick, player: p.player, protected: p.protected, swap_owner: p.swap_owner, notes: p.notes }),
          });
          if (!r.ok) { failed = r; break; }
        }
        if (failed) {
          if (failed.status === 403) { localStorage.removeItem(TOKEN_KEY); statusEl.textContent = 'Invalid token — cleared.'; }
          else statusEl.textContent = `Error ${failed.status}`;
          saveBtn.disabled = false; cancelBtn.disabled = false;
          return;
        }
        // Re-fetch to get server-computed conveys
        const fresh = await fetch(`/api/picks/${abbr}`).then(r => r.json());
        statusEl.textContent = 'Saved!';
        setTimeout(() => renderView(fresh), 700);
      } catch {
        statusEl.textContent = 'Network error';
        saveBtn.disabled = false; cancelBtn.disabled = false;
      }
    });
  }

  attachBtn(picks);
}

function setupJerseyEditable(titleId, wrapId, rosterRows, biosData, restoreView) {
  const hasSlug = rosterRows.length && 'SLUG' in rosterRows[0] && !('PLAYER' in rosterRows[0]);
  if (!hasSlug) return;

  const activeRows = rosterRows.filter(r => r.SLUG);
  if (!activeRows.length) return;

  const titleEl = document.getElementById(titleId);
  const btn = document.createElement('button');
  btn.className = 'jersey-edit-btn';
  btn.textContent = 'Edit #';
  btn.style.cssText = 'font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid #374151;border-radius:4px;background:transparent;color:#6b7280;cursor:pointer;font-weight:500;margin-left:0.4rem;font-family:inherit;vertical-align:middle';
  btn.onmouseenter = () => { btn.style.color = '#d1d5db'; btn.style.borderColor = '#6b7280'; };
  btn.onmouseleave = () => { btn.style.color = '#6b7280'; btn.style.borderColor = '#374151'; };
  btn.addEventListener('click', () => withToken(() => enterJerseyEdit()));
  titleEl.appendChild(btn);

  function enterJerseyEdit() {
    const wrapEl = document.getElementById(wrapId);

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid #3b82f6;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#60a5fa;font-family:inherit';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid #374151;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#d1d5db;font-family:inherit';

    const statusEl = document.createElement('span');
    statusEl.style.cssText = 'font-size:0.75rem;color:#6b7280;margin-left:auto';

    toolbar.appendChild(saveBtn);
    toolbar.appendChild(cancelBtn);
    toolbar.appendChild(statusEl);

    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    ['Player', '#'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      if (label === '#') th.classList.add('right');
      hr.appendChild(th);
    });

    const tbody = table.createTBody();
    const inputs = [];

    activeRows.forEach(row => {
      const bio = biosData[row.SLUG] || {};
      const name = displayNameFromBio(bio.name || '') || row.SLUG || '—';
      const jersey = bio.jersey_number ?? '';

      const tr = tbody.insertRow();
      const nameTd = tr.insertCell();
      nameTd.textContent = name;
      nameTd.className = 'bold';

      const numTd = tr.insertCell();
      numTd.className = 'right';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 2;
      input.pattern = '\\d{1,2}';
      input.value = jersey;
      input.placeholder = '—';
      input.style.cssText = 'width:3.5rem;background:#111827;border:1px solid #374151;border-radius:4px;color:#d1d5db;font-size:0.8rem;padding:0.2rem 0.4rem;font-family:inherit;text-align:right;outline:none';
      input.addEventListener('focus', () => { input.style.borderColor = '#3b82f6'; });
      input.addEventListener('blur',  () => { input.style.borderColor = '#374151'; });
      numTd.appendChild(input);

      inputs.push({ slug: row.SLUG, input, original: String(jersey) });
    });

    const gridWrap = document.createElement('div');
    gridWrap.className = 'table-wrap';
    gridWrap.style.overflowX = 'auto';
    gridWrap.appendChild(table);

    wrapEl.innerHTML = '';
    wrapEl.appendChild(toolbar);
    wrapEl.appendChild(gridWrap);

    cancelBtn.addEventListener('click', () => restoreView());

    saveBtn.addEventListener('click', async () => {
      const changed = inputs.filter(({ input, original }) => String(input.value.trim()) !== original);
      if (!changed.length) { restoreView(); return; }

      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      statusEl.textContent = 'Saving…';

      try {
        const token = getToken();
        const results = await Promise.all(changed.map(({ slug, input }) => {
          const val = input.value.trim();
          const jersey_number = val === '' ? null : val;
          return fetch(`/api/players/${slug}/jersey`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ jersey_number }),
          });
        }));

        const failed = results.find(r => !r.ok);
        if (failed) {
          if (failed.status === 403) {
            localStorage.removeItem(TOKEN_KEY);
            statusEl.textContent = 'Invalid token — cleared. Try again.';
          } else {
            const err = await failed.json().catch(() => ({}));
            statusEl.textContent = `Error: ${err.detail || failed.status}`;
          }
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          return;
        }

        statusEl.textContent = 'Saved!';
        setTimeout(() => location.reload(), 700);
      } catch {
        statusEl.textContent = 'Network error';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  }
}

function setupDeadCapEditable(wrapEl, deadCapRows, biosData, curYr, onSave) {
  if (!localStorage.getItem('nbn_token')) return;

  // Seasons to show: curYr + next 2, plus any already in data
  const seasons = new Set([curYr, nextSalaryYear(curYr), nextSalaryYear(nextSalaryYear(curYr))]);
  deadCapRows.forEach(r => Object.keys(r).forEach(k => { if (/^\d{2}-\d{2}$/.test(k)) seasons.add(k); }));
  const seasonList = [...seasons].sort();

  const editBtn = document.createElement('button');
  editBtn.className = 'edit-toggle-btn';
  editBtn.style.cssText = 'margin-top:0.5rem;font-size:0.72rem;padding:0.15rem 0.45rem';
  editBtn.textContent = 'Edit Dead Cap';
  wrapEl.appendChild(editBtn);

  let formEl = null;
  let formDl = null;

  editBtn.addEventListener('click', () => {
    if (formEl) { formEl.remove(); formEl = null; formDl?.remove(); formDl = null; editBtn.textContent = 'Edit Dead Cap'; return; }
    editBtn.textContent = 'Close';

    let rows = deadCapRows.map(r => ({ ...r }));

    const nameToSlug = new Map();
    const slugToDisplay = new Map();
    const dlId = `dc-pdl-${Date.now()}`;
    const dl = document.createElement('datalist');
    dl.id = dlId;
    Object.entries(biosData).sort(([, a], [, b]) =>
      displayNameFromBio(a.name || '').localeCompare(displayNameFromBio(b.name || ''))
    ).forEach(([slug, bio]) => {
      const dn = displayNameFromBio(bio.name || '');
      if (!dn) return;
      nameToSlug.set(dn.toLowerCase(), slug);
      slugToDisplay.set(slug, dn);
      const opt = document.createElement('option');
      opt.value = dn;
      dl.appendChild(opt);
    });
    document.body.appendChild(dl);
    formDl = dl;

    formEl = document.createElement('div');
    formEl.style.cssText = 'margin-top:0.75rem;background:#1f2937;border:1px solid #374151;border-radius:6px;padding:0.75rem;overflow-x:auto';

    function render() {
      formEl.innerHTML = '';

      const tbl = document.createElement('table');
      tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.8rem';
      const thead = tbl.createTHead();
      const hr = thead.insertRow();
      ['Player', ...seasonList, ''].forEach((lbl, i) => {
        const th = document.createElement('th');
        th.textContent = lbl;
        th.style.cssText = `padding:3px 8px;color:#9ca3af;text-align:${i === 0 ? 'left' : 'right'}`;
        hr.appendChild(th);
      });

      const tbody = tbl.createTBody();

      rows.forEach((row, ri) => {
        const tr = tbody.insertRow();
        // Player name
        const nameTd = tr.insertCell();
        const bio = biosData[row.SLUG] || {};
        nameTd.textContent = displayNameFromBio(bio.name || '') || row.SLUG;
        nameTd.style.cssText = 'padding:3px 8px';

        // Season amounts
        seasonList.forEach(s => {
          const td = tr.insertCell();
          td.style.cssText = 'padding:3px 6px;text-align:right';
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = row[s] || '';
          inp.placeholder = '—';
          inp.style.cssText = 'width:90px;text-align:right;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:3px;padding:2px 4px;font-size:0.75rem';
          inp.addEventListener('input', () => { row[s] = inp.value.trim(); });
          td.appendChild(inp);
        });

        // Delete
        const delTd = tr.insertCell();
        delTd.style.cssText = 'padding:3px 6px;text-align:right';
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.style.cssText = 'background:none;border:none;color:#ef4444;cursor:pointer;padding:0 4px';
        delBtn.addEventListener('click', () => { rows.splice(ri, 1); render(); });
        delTd.appendChild(delBtn);
      });

      // Add-entry row
      const addTr = tbody.insertRow();
      addTr.style.borderTop = '1px solid #374151';
      const addTd = addTr.insertCell();
      addTd.colSpan = seasonList.length + 2;
      addTd.style.cssText = 'padding:6px 8px';

      const nameInp = document.createElement('input');
      nameInp.type = 'text'; nameInp.placeholder = 'Player name';
      nameInp.setAttribute('list', dlId);
      nameInp.style.cssText = 'background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:3px;padding:2px 6px;font-size:0.75rem;width:160px;margin-right:6px';

      const seasonInp = document.createElement('input');
      seasonInp.type = 'text'; seasonInp.placeholder = '25-26';
      seasonInp.style.cssText = 'background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:3px;padding:2px 6px;font-size:0.75rem;width:70px;margin-right:6px';

      const amtInp = document.createElement('input');
      amtInp.type = 'text'; amtInp.placeholder = '$X,XXX,XXX';
      amtInp.style.cssText = 'background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:3px;padding:2px 6px;font-size:0.75rem;width:110px;margin-right:6px';

      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add';
      addBtn.style.cssText = 'background:#1d4ed8;color:#fff;border:none;border-radius:3px;padding:2px 8px;font-size:0.75rem;cursor:pointer';
      addBtn.addEventListener('click', () => {
        const typed = nameInp.value.trim();
        const slug = nameToSlug.get(typed.toLowerCase()) || '';
        const season = seasonInp.value.trim();
        const amt = amtInp.value.trim();
        if (!slug || !season || !amt) return;
        const existing = rows.find(r => r.SLUG === slug);
        if (existing) {
          existing[season] = amt;
        } else {
          rows.push({ SLUG: slug, [season]: amt });
          if (!seasons.has(season)) { seasons.add(season); seasonList.length = 0; [...seasons].sort().forEach(s => seasonList.push(s)); }
        }
        nameInp.value = ''; seasonInp.value = ''; amtInp.value = '';
        render();
      });

      addTd.append(nameInp, seasonInp, amtInp, addBtn);
      formEl.appendChild(tbl);

      // Save / Cancel
      const btns = document.createElement('div');
      btns.style.cssText = 'margin-top:0.5rem;display:flex;gap:0.5rem';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = 'background:#1d4ed8;color:#fff;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:0.75rem';
      saveBtn.addEventListener('click', () => {
        withToken(token => {
          const payload = rows
            .filter(r => r.SLUG && Object.keys(r).some(k => /^\d{2}-\d{2}$/.test(k) && r[k]))
            .map(r => {
              const out = { SLUG: r.SLUG };
              Object.keys(r).forEach(k => { if (/^\d{2}-\d{2}$/.test(k) && r[k]) out[k] = r[k]; });
              return out;
            });
          fetch(`/api/deadcap/${abbr}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          })
          .then(r => { if (!r.ok) throw r; return r.json(); })
          .then(() => {
            formEl.remove(); formEl = null; formDl?.remove(); formDl = null;
            editBtn.textContent = 'Edit Dead Cap';
            onSave(payload);
          })
          .catch(r => {
            if (r.status === 403) localStorage.removeItem('nbn_token');
            saveBtn.textContent = 'Error — retry';
            setTimeout(() => { saveBtn.textContent = 'Save'; }, 2000);
          });
        });
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'background:#374151;color:#e5e7eb;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:0.75rem';
      cancelBtn.addEventListener('click', () => { formEl.remove(); formEl = null; formDl?.remove(); formDl = null; editBtn.textContent = 'Edit Dead Cap'; });

      btns.append(saveBtn, cancelBtn);
      formEl.appendChild(btns);
    }

    render();
    wrapEl.appendChild(formEl);
  });
}

function setupEditable(titleId, wrapId, headers, rows, apiPath, buildView, cellConfig = {}) {
  function renderView(currentRows) {
    const wrapEl = document.getElementById(wrapId);
    wrapEl.innerHTML = '';
    const t = buildView(currentRows);
    if (t) wrapEl.appendChild(t);
    else wrapEl.innerHTML = '<div class="status">No data.</div>';
    attachEditBtn(currentRows);
  }

  function attachEditBtn(currentRows) {
    const titleEl = document.getElementById(titleId);
    titleEl.querySelector('.section-edit-btn')?.remove();
    const btn = document.createElement('button');
    btn.className = 'section-edit-btn';
    btn.textContent = 'Edit';
    btn.style.cssText = 'font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid #374151;border-radius:4px;background:transparent;color:#6b7280;cursor:pointer;font-weight:500;margin-left:0.6rem;font-family:inherit;vertical-align:middle';
    btn.onmouseenter = () => { btn.style.color = '#d1d5db'; btn.style.borderColor = '#6b7280'; };
    btn.onmouseleave = () => { btn.style.color = '#6b7280'; btn.style.borderColor = '#374151'; };
    btn.addEventListener('click', () => {
      withToken(() => {
        const wrapEl = document.getElementById(wrapId);
        enterEditMode(wrapEl, headers, currentRows, apiPath, renderView, cellConfig);
      });
    });
    titleEl.appendChild(btn);
  }

  attachEditBtn(rows);
}

function buildHistoricalRoster(allSeasons, teamAbbr, season) {
  const rows = allSeasons.filter(r => r.TEAM === teamAbbr && r.SEASON === season);
  if (!rows.length) return null;

  const augmented = rows.map(r => {
    const g   = Math.max(1, parseInt(r.G) || 1);
    const pg  = k => +(parseFloat(r[k]) || 0) / g;
    const fmt = k => Math.round(pg(k) * 10) / 10;
    return {
      ...r,
      _mpg:    fmt('MIN'),
      _ppg:    fmt('PTS'),
      _rpg:    fmt('REB'),
      _apg:    fmt('AST'),
      _spg:    fmt('STL'),
      _bpg:    fmt('BLK'),
      _3pmpg:  fmt('3PM'),
      _gmscpg: fmt('GMSC'),
    };
  });

  const HIST_COLS = [
    { key: 'PLAYER',  label: 'Player',  cls: 'bold',        sortField: 'PLAYER',  defaultDir:  1 },
    { key: 'G',       label: 'G',       cls: 'right',       sortField: 'G',       defaultDir: -1 },
    { key: '_mpg',    label: 'MPG',     cls: 'right muted', sortField: '_mpg',    defaultDir: -1 },
    { key: '_ppg',    label: 'PPG',     cls: 'right',       sortField: '_ppg',    defaultDir: -1 },
    { key: '_rpg',    label: 'RPG',     cls: 'right',       sortField: '_rpg',    defaultDir: -1 },
    { key: '_apg',    label: 'APG',     cls: 'right',       sortField: '_apg',    defaultDir: -1 },
    { key: '_spg',    label: 'SPG',     cls: 'right muted', sortField: '_spg',    defaultDir: -1 },
    { key: '_bpg',    label: 'BPG',     cls: 'right muted', sortField: '_bpg',    defaultDir: -1 },
    { key: '_3pmpg',  label: '3PM/G',   cls: 'right muted', sortField: '_3pmpg',  defaultDir: -1 },
    { key: '_gmscpg', label: 'GMSC/G',  cls: 'right',       sortField: '_gmscpg', defaultDir: -1 },
  ];

  return buildTable(HIST_COLS, augmented, '_gmscpg', -1, (td, col, row) => {
    if (col.key === 'PLAYER') {
      if (row.SLUG) {
        const a = document.createElement('a');
        a.href = `/players/?p=${row.SLUG}`;
        a.textContent = row.PLAYER;
        td.appendChild(a);
      } else {
        td.textContent = row.PLAYER || '—';
      }
    } else {
      td.textContent = row[col.key] ?? '—';
    }
  });
}

(async () => {
  const seasonsWrap  = document.getElementById('seasons-wrap');
  const playersWrap  = document.getElementById('players-wrap');
  const rosterWrap   = document.getElementById('roster-wrap');
  const picksWrap    = document.getElementById('picks-wrap');
  const draftedWrap  = document.getElementById('drafted-wrap');

  const [sr, pr, rr, pkr, biosr, capr, psr, ovrr, tsr, dcr, allpkr, memr, gamesr, lyr] = await Promise.allSettled([
    fetch(`/data/${slug}-seasons.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/data/${slug}-players.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/data/${slug}-roster.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/api/picks/${abbr}`).then(r => { if (!r.ok) throw r; return r.json(); }),
    fetch('/api/players').then(r => r.ok ? r.json() : {}),
    fetch('/api/cap-levels').then(r => r.ok ? r.json() : {}),
    fetch('/players/player_seasons.csv').then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch('/api/ovr/current').then(r => r.ok ? r.json() : {}),
    fetch(`/api/team-state/${abbr}`).then(r => r.ok ? r.json() : null),
    fetch(`/api/deadcap/${abbr}`).then(r => r.ok ? r.json() : []),
    fetch('/api/picks').then(r => r.ok ? r.json() : []),
    fetch('/api/members/public').then(r => r.ok ? r.json() : []),
    fetch('/api/boxscores/games').then(r => r.ok ? r.json() : []),
    fetch('/api/league-year').then(r => r.ok ? r.json() : null),
  ]);

  // Set the league year before any render so currentSeasonYr() is consistent everywhere.
  if (lyr.status === 'fulfilled' && lyr.value?.current_season) LEAGUE_YEAR = lyr.value.current_season;

  const biosData    = biosr.status === 'fulfilled' ? biosr.value : {};
  const capLevels   = capr.status === 'fulfilled'  ? capr.value  : {};
  const currentOvr  = ovrr.status === 'fulfilled'  ? ovrr.value  : {};
  const teamState   = tsr.status  === 'fulfilled'  ? tsr.value   : null;
  const seasonStates = teamState?.seasons || {};
  const deadCapRows = dcr.status  === 'fulfilled'  ? dcr.value : [];
  const membersData = memr.status  === 'fulfilled' ? memr.value  : [];
  const allGames    = gamesr.status === 'fulfilled' ? gamesr.value : [];

  let seasonRows = [];
  if (sr.status === 'fulfilled') {
    seasonsWrap.innerHTML = '';
    seasonRows = parseCSV(sr.value);
    buildTimeline(seasonRows);
    seasonsWrap.appendChild(buildTable(SEASON_COLS, seasonRows, 'SEASON', 1, makeSeasonRenderCell(seasonRows)));
  } else {
    seasonsWrap.innerHTML = '<div class="status">Failed to load season data.</div>';
  }

  buildPersonnelSection(membersData, allGames);

  if (pr.status === 'fulfilled') {
    playersWrap.innerHTML = '';
    playersWrap.appendChild(buildTable(PLAYER_COLS, parseCSV(pr.value), 'GMSC_TOT', -1, renderPlayerCell));
  } else {
    playersWrap.innerHTML = '<div class="status">Failed to load player data.</div>';
  }

  const allSeasons = psr.status === 'fulfilled' ? parseCSV(psr.value) : [];

  // Draft History tab
  {
    draftedWrap.innerHTML = '';
    if (allSeasons.length) {
      const draftTag = `(${abbr})`;
      const bySlug = {};
      for (const row of allSeasons) {
        if (!row.NBN_DFT_P.includes(draftTag)) continue;
        const s = row.SLUG.trim();
        if (!s) continue;
        if (!bySlug[s]) {
          const pickMatch = row.NBN_DFT_P.match(/Pick (\d+)/);
          const roundNum  = row.NBN_DFT_R === 'Round 2' ? 2 : 1;
          bySlug[s] = {
            SLUG:    s,
            PLAYER:  row.PLAYER,
            YEAR:    parseInt(row.NBN_DFT_YR) || 0,
            ROUND:   roundNum,
            PICK:    pickMatch ? parseInt(pickMatch[1]) : 0,
            PICK_LABEL: `R${roundNum} · #${pickMatch ? pickMatch[1] : '?'}`,
            _G:   0, _PTS: 0, _REB: 0, _AST: 0, _GMSC: 0,
          };
        }
        const g = parseInt(row.G) || 0;
        bySlug[s]._G    += g;
        bySlug[s]._PTS  += parseFloat(row.PTS)  || 0;
        bySlug[s]._REB  += parseFloat(row.REB)  || 0;
        bySlug[s]._AST  += parseFloat(row.AST)  || 0;
        bySlug[s]._GMSC += parseFloat(row.GMSC) || 0;
      }
      const draftedRows = Object.values(bySlug).map(p => ({
        ...p,
        GP:      p._G,
        GMSC_TOT: Math.round(p._GMSC * 10) / 10,
        PPG:     p._G ? Math.round(p._PTS  / p._G * 10) / 10 : 0,
        RPG:     p._G ? Math.round(p._REB  / p._G * 10) / 10 : 0,
        APG:     p._G ? Math.round(p._AST  / p._G * 10) / 10 : 0,
      }));
      draftedRows.sort((a, b) => a.YEAR - b.YEAR || a.PICK - b.PICK);

      const DRAFTED_COLS = [
        { key: 'PLAYER',    label: 'Player', cls: 'bold',        sortField: 'PLAYER',    defaultDir:  1 },
        { key: 'YEAR',      label: 'Year',   cls: 'right',       sortField: 'YEAR',      defaultDir:  1 },
        { key: 'PICK_LABEL',label: 'Pick',   cls: 'right muted', sortField: 'PICK',      defaultDir:  1 },
        { key: 'GP',        label: 'GP',     cls: 'right',       sortField: 'GP',        defaultDir: -1 },
        { key: 'GMSC_TOT',  label: 'GMSC',   cls: 'right',       sortField: 'GMSC_TOT',  defaultDir: -1 },
        { key: 'PPG',       label: 'PPG',    cls: 'right',       sortField: 'PPG',       defaultDir: -1 },
        { key: 'RPG',       label: 'RPG',    cls: 'right',       sortField: 'RPG',       defaultDir: -1 },
        { key: 'APG',       label: 'APG',    cls: 'right',       sortField: 'APG',       defaultDir: -1 },
      ];
      const renderDraftedCell = (td, col, row) => {
        if (col.key === 'PLAYER') {
          const a = document.createElement('a');
          a.href = `/players/?p=${row.SLUG}`;
          a.textContent = row.PLAYER;
          td.appendChild(a);
        } else {
          td.textContent = row[col.key] ?? '—';
        }
      };
      if (draftedRows.length) {
        draftedWrap.appendChild(buildTable(DRAFTED_COLS, draftedRows, 'YEAR', 1, renderDraftedCell));
      } else {
        draftedWrap.innerHTML = '<div class="status">No draft history found.</div>';
      }
    } else {
      draftedWrap.innerHTML = '<div class="status">Failed to load draft history.</div>';
    }
  }

  // Historical Rosters tab
  {
    const histWrap     = document.getElementById('hist-roster-wrap');
    const histControls = document.getElementById('hist-controls');
    const availableSeasons = [...new Set(allSeasons.filter(r => r.TEAM === abbr).map(r => r.SEASON))]
      .sort((a, b) => b.localeCompare(a));
    if (availableSeasons.length) {
      const sel = document.createElement('select');
      availableSeasons.forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s;
        sel.appendChild(o);
      });
      histControls.appendChild(sel);
      const renderHistSeason = season => {
        histWrap.innerHTML = '';
        const t = buildHistoricalRoster(allSeasons, abbr, season);
        if (t) {
          const wrap = document.createElement('div');
          wrap.className = 'table-wrap';
          wrap.appendChild(t);
          histWrap.appendChild(wrap);
        } else {
          histWrap.innerHTML = '<div class="status">No stats found for this season.</div>';
        }
      };
      sel.addEventListener('change', () => renderHistSeason(sel.value));
      renderHistSeason(availableSeasons[0]);
    } else {
      const histWrap = document.getElementById('hist-roster-wrap');
      histWrap.innerHTML = '<div class="status">No historical data available.</div>';
    }
  }

  const capEditWrap = document.getElementById('cap-edit-wrap');

  if (rr.status === 'fulfilled') {
    rosterWrap.innerHTML = '';
    const rosterRows = parseCSV(rr.value);
    const rosterHeaders = parseLine(rr.value.trim().split('\n')[0]);
    const t = buildRosterTable(rosterRows, biosData, capLevels, currentOvr, deadCapRows, seasonStates);
    if (t) rosterWrap.appendChild(t);
    else rosterWrap.innerHTML = '<div class="status">No roster data.</div>';

    // Hard cap banner + exceptions section
    const curYr = currentSeasonYr();
    let teamSalaryTotal = 0;
    rosterRows.forEach(row => {
      const bio = biosData[row.SLUG] || {};
      teamSalaryTotal += parseSalaryNum((bio.salaries || {})[curYr]);
    });
    deadCapRows.forEach(row => {
      teamSalaryTotal += parseSalaryNum(row[curYr] || '');
    });
    renderHardCapBanner(teamState);
    renderExceptionsSection(teamState, capLevels, teamSalaryTotal, curYr);

    setupEditable('roster-title', 'roster-wrap', rosterHeaders, rosterRows, `/roster/${abbr}`, rows => buildRosterTable(rows, biosData, capLevels, currentOvr, deadCapRows, seasonStates), rosterCellConfig(rosterHeaders, biosData));
    setupJerseyEditable('roster-title', 'roster-wrap', rosterRows, biosData, () => {
      const wrapEl = document.getElementById('roster-wrap');
      wrapEl.innerHTML = '';
      const t = buildRosterTable(rosterRows, biosData, capLevels, currentOvr, deadCapRows, seasonStates);
      if (t) wrapEl.appendChild(t);
      else wrapEl.innerHTML = '<div class="status">No roster data.</div>';
    });

    setupDeadCapEditable(
      document.getElementById('dead-cap-edit-wrap'),
      deadCapRows, biosData, currentSeasonYr(),
      newRows => {
        deadCapRows.length = 0;
        newRows.forEach(r => deadCapRows.push(r));
        rosterWrap.innerHTML = '';
        const t = buildRosterTable(rosterRows, biosData, capLevels, currentOvr, deadCapRows, seasonStates);
        if (t) rosterWrap.appendChild(t);
        else rosterWrap.innerHTML = '<div class="status">No roster data.</div>';
      }
    );

    // Cap numbers edit button (rosters role)
    const token = localStorage.getItem('nbn_token');
    if (token) {
      const season = currentSeasonYr();
      const editCapBtn = document.createElement('button');
      editCapBtn.className = 'edit-toggle-btn';
      editCapBtn.style.cssText = 'margin-top:0.75rem;font-size:0.72rem;padding:0.15rem 0.45rem';
      editCapBtn.textContent = 'Edit Team State';
      capEditWrap.appendChild(editCapBtn);

      let capFormEl = null;
      editCapBtn.addEventListener('click', () => {
        if (capFormEl) { capFormEl.remove(); capFormEl = null; editCapBtn.textContent = 'Edit Team State'; return; }
        capFormEl = document.createElement('div');
        capFormEl.className = 'cap-edit-form';

        const curState = teamState || {};

        // ── Per-season hard cap controls ──────────────────────────────────────
        // Seasons displayed in the roster table: any salary season >= current.
        const capSeasonSet = new Set([season]);
        rosterRows.forEach(r => {
          const bio = biosData[r.SLUG] || {};
          Object.keys(bio.salaries || {}).forEach(k => {
            if (/^\d{2}-\d{2}$/.test(k) && k >= season) capSeasonSet.add(k);
          });
        });
        deadCapRows.forEach(r => Object.keys(r).forEach(k => {
          if (/^\d{2}-\d{2}$/.test(k) && k >= season) capSeasonSet.add(k);
        }));
        const capSeasons = [...capSeasonSet].sort();

        const hcBlock = document.createElement('div');
        hcBlock.style.cssText = 'display:flex;flex-direction:column;gap:0.35rem;width:100%';
        const hcTitle = document.createElement('div');
        hcTitle.textContent = 'Hard Cap (per season)';
        hcTitle.style.cssText = 'font-size:0.72rem;color:#9ca3af;font-weight:600';
        hcBlock.appendChild(hcTitle);

        // season → { sel, reason } controls, for diffing on save
        const hcControls = {};
        capSeasons.forEach(s => {
          const st = seasonStates[s] || {};
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:0.4rem;align-items:center';
          const lbl = document.createElement('span');
          lbl.textContent = s;
          lbl.style.cssText = 'font-size:0.72rem;color:#6b7280;width:3.2rem';
          const sel = document.createElement('select');
          [['', 'None'], ['first_apron', 'First Apron'], ['second_apron', 'Second Apron']].forEach(([v, l]) => {
            const o = document.createElement('option');
            o.value = v; o.textContent = l;
            if (v === (st.hard_cap || '')) o.selected = true;
            sel.appendChild(o);
          });
          const reason = document.createElement('input');
          reason.type = 'text'; reason.placeholder = 'reason';
          reason.value = st.hard_cap_reason || '';
          reason.style.width = '12rem';
          row.appendChild(lbl); row.appendChild(sel); row.appendChild(reason);
          hcBlock.appendChild(row);
          hcControls[s] = { sel, reason };
        });
        capFormEl.appendChild(hcBlock);

        const fMleTypeLbl = document.createElement('label');
        fMleTypeLbl.textContent = 'MLE Type';
        const fMleType = document.createElement('select');
        [['', 'Auto (calculated)'], ['room', 'Room Exception'], ['ntmle', 'Non-Taxpayer MLE'], ['tmle', 'Taxpayer MLE']].forEach(([v, l]) => {
          const o = document.createElement('option');
          o.value = v; o.textContent = l;
          if (v === (curState.mle_type || '')) o.selected = true;
          fMleType.appendChild(o);
        });
        fMleTypeLbl.appendChild(fMleType);
        capFormEl.appendChild(fMleTypeLbl);

        const fMleUsedLbl = document.createElement('label');
        fMleUsedLbl.textContent = 'MLE Used ($)';
        const fMleUsed = document.createElement('input');
        fMleUsed.type = 'number'; fMleUsed.placeholder = '0';
        fMleUsed.value = curState.mle_used || 0;
        fMleUsedLbl.appendChild(fMleUsed);
        capFormEl.appendChild(fMleUsedLbl);

        const fBaeUsedLbl = document.createElement('label');
        fBaeUsedLbl.style.cssText = 'flex-direction:row;align-items:center;gap:0.4rem;cursor:pointer';
        const fBaeUsed = document.createElement('input');
        fBaeUsed.type = 'checkbox'; fBaeUsed.checked = !!curState.bae_used;
        fBaeUsedLbl.appendChild(fBaeUsed);
        fBaeUsedLbl.appendChild(document.createTextNode('BAE Used'));
        capFormEl.appendChild(fBaeUsedLbl);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'edit-btn edit-btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.style.cssText = 'align-self:flex-end;margin-top:0.6rem';
        const statusEl = document.createElement('span');
        statusEl.style.cssText = 'font-size:0.72rem;color:#ef4444;align-self:flex-end';
        capFormEl.appendChild(saveBtn);
        capFormEl.appendChild(statusEl);

        saveBtn.addEventListener('click', async () => {
          saveBtn.disabled = true; statusEl.textContent = 'Saving…';

          // One PUT per season that needs writing. Each season's MLE/BAE state is
          // preserved from its existing slot; only the current season's MLE/BAE
          // fields are editable here.
          const puts = [];
          capSeasons.forEach(s => {
            const st = seasonStates[s] || {};
            const newCap = hcControls[s].sel.value || null;
            const newReason = hcControls[s].reason.value.trim();
            const isCur = s === season;
            const capChanged = (st.hard_cap || null) !== newCap || (st.hard_cap_reason || '') !== newReason;
            if (!isCur && !capChanged) return;  // nothing to write for this season
            puts.push({
              season: s,
              body: {
                hard_cap: newCap,
                hard_cap_reason: newReason,
                mle_type: isCur ? (fMleType.value || null) : (st.mle_type || null),
                mle_used: isCur ? (+fMleUsed.value || 0) : (st.mle_used || 0),
                bae_used: isCur ? fBaeUsed.checked : !!st.bae_used,
              },
            });
          });

          try {
            for (const { season: s, body } of puts) {
              const resp = await fetch(`/api/team-state/${abbr}?season=${encodeURIComponent(s)}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              if (resp.status === 403) { statusEl.textContent = 'Not authorized.'; saveBtn.disabled = false; return; }
              if (!resp.ok) throw new Error(`Save failed for ${s}.`);
            }
            location.reload();
          } catch (e) {
            statusEl.textContent = e.message; saveBtn.disabled = false;
          }
        });

        editCapBtn.after(capFormEl);
        editCapBtn.textContent = 'Cancel';
      });
    }
  } else {
    rosterWrap.innerHTML = '<div class="status">Failed to load roster data.</div>';
  }

  if (pkr.status === 'fulfilled') {
    picksWrap.innerHTML = '';
    const allPicks = allpkr.status === 'fulfilled' ? allpkr.value : [];
    const t = buildPicksTable(pkr.value, abbr, biosData, allPicks);
    if (t) picksWrap.appendChild(t);
    else picksWrap.innerHTML = '<div class="status">No picks on file.</div>';
    setupPicksEditable('picks-title', picksWrap, pkr.value, abbr, biosData, allPicks);
  } else {
    picksWrap.innerHTML = '<div class="status">Failed to load picks data.</div>';
  }

  const retired = RETIRED_JERSEYS[abbr];
  if (retired?.length) {
    document.getElementById('retired-section').style.display = '';
    const bannersEl = document.getElementById('retired-banners');
    retired.forEach(({ no, player, date }) => {
      const banner = document.createElement('div');
      banner.className = 'retired-banner';
      const [y, m, d] = date.split('-');
      banner.innerHTML = `
        <span class="retired-no">${no}</span>
        <span class="retired-name">${player}</span>
        <span class="retired-date">Ret. ${y}</span>
      `;
      bannersEl.appendChild(banner);
    });
  }
})();
