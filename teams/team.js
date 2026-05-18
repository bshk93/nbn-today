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
  .row-dead td   { opacity: 0.45; font-style: italic; }
  .picks-acquired td.type-badge { color: #60a5fa; }
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
  .picks-own-traded td { opacity: 0.5; }
  td.cap-ufa        { background: hsl(45,  60%, 20%); color: hsl(45,  90%, 72%); }
  td.cap-rfa        { background: hsl(25,  60%, 20%); color: hsl(25,  90%, 72%); }
  td.cap-player-opt { background: hsl(120, 50%, 17%); color: hsl(120, 75%, 68%); }
  td.cap-team-opt   { background: hsl(210, 55%, 20%); color: hsl(210, 75%, 70%); }
  td.cap-non-gtd    { color: #4b5563; text-decoration: line-through; }
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
`; document.head.appendChild(_s); }

document.body.innerHTML = `
  <div class="page">
    <nav class="nav"><a href="/teams">← Teams</a></nav>
    <div class="team-header">
      <img src="/logos/logo-${slug}.png" alt="${name} logo">
      <h1>${name}</h1>
      <span class="abbr">${abbr}</span>
    </div>
    <section>
      <h2 class="section-title">Season History</h2>
      <div class="timeline" id="timeline-wrap"></div>
      <div class="table-wrap" id="seasons-wrap"><div class="status">Loading…</div></div>
    </section>
    <section id="retired-section" style="display:none">
      <h2 class="section-title">Retired Numbers</h2>
      <div class="retired-banners" id="retired-banners"></div>
    </section>
    <section>
      <h2 class="section-title" id="roster-title">Roster</h2>
      <div class="table-wrap" id="roster-wrap"><div class="status">Loading…</div></div>
    </section>
    <section>
      <h2 class="section-title" id="picks-title">Draft Picks</h2>
      <div class="table-wrap" id="picks-wrap"><div class="status">Loading…</div></div>
    </section>
    <section>
      <h2 class="section-title">All-Time Top Players</h2>
      <p class="section-sub">Regular season · ranked by total Game Score</p>
      <div class="table-wrap" id="players-wrap"><div class="status">Loading…</div></div>
    </section>
  </div>
`;

const _badgeScript = document.createElement('script');
_badgeScript.src = '/token-badge.js';
_badgeScript.onload = function () { window.__nbnBadge && window.__nbnBadge(); };
document.head.appendChild(_badgeScript);

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

function parseCapHolds(str) {
  const map = {};
  if (!str) return map;
  str.split(',').forEach(pair => {
    const [yr, type] = pair.split(':');
    if (yr && type) map[yr] = type;
  });
  return map;
}

function currentSeasonYr() {
  const now = new Date();
  const y = now.getFullYear() % 100;
  const m = now.getMonth() + 1;
  return m < 7
    ? `${String(y - 1).padStart(2, '0')}-${String(y).padStart(2, '0')}`
    : `${String(y).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function buildRosterTable(rows) {
  if (!rows.length) return null;
  const curYr = currentSeasonYr();
  const salaryKeys = Object.keys(rows[0]).filter(k => /^\d{2}-\d{2}$/.test(k) && k >= curYr);
  const ovrVals = rows.map(r => parseFloat(r.OVR)).filter(v => !isNaN(v));
  const ovrMin = Math.min(...ovrVals), ovrMax = Math.max(...ovrVals);

  const cols = [
    { key: 'PLAYER', label: 'Player',   cls: 'bold',         sortField: 'PLAYER', defaultDir:  1 },
    { key: 'POS',    label: 'Pos',      cls: 'muted center', sortField: 'POS',    defaultDir:  1 },
    { key: 'AGE',    label: 'Age',      cls: 'right',        sortField: 'AGE',    defaultDir:  1 },
    { key: 'OVR',    label: 'OVR',      cls: 'right bold',   sortField: 'OVR',    defaultDir: -1 },
    ...salaryKeys.map((k, i) => ({
      key: k, label: k, cls: 'right' + (i === 0 ? ' div-left' : ''),
      sortField: k, defaultDir: -1,
      display: r => r[k] && r[k] !== '' ? r[k] : '—',
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

      if (col.key === 'OVR') {
        const n = parseFloat(row.OVR);
        td.textContent = isNaN(n) ? '—' : String(n);
        if (!isNaN(n) && ovrMax > ovrMin) {
          const t = (n - ovrMin) / (ovrMax - ovrMin);
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

  // Build legend only if any row has cap hold data
  const hasCapData = rows.some(r => r.CAP_HOLDS && r.CAP_HOLDS.trim() !== '');
  if (!hasCapData) return table;

  const allTypes = new Set();
  rows.forEach(r => {
    Object.values(parseCapHolds(r.CAP_HOLDS || '')).forEach(t => allTypes.add(t));
  });

  const legend = document.createElement('div');
  legend.className = 'cap-legend';
  const SWATCH_COLORS = {
    UFA:        'hsl(45,  60%, 35%)',
    RFA:        'hsl(25,  60%, 35%)',
    PLAYER_OPT: 'hsl(120, 50%, 30%)',
    TEAM_OPT:   'hsl(210, 55%, 35%)',
    NON_GTD:    '#374151',
  };
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

  const wrap = document.createElement('div');
  wrap.appendChild(table);
  wrap.appendChild(legend);
  return wrap;
}

function buildPicksTable(rows) {
  if (!rows.length) return null;

  const table = document.createElement('table');
  const thead = table.createTHead();
  const hr = thead.insertRow();
  [
    { label: 'Year',  cls: '' },
    { label: 'Round', cls: '' },
    { label: 'Team',  cls: 'muted' },
    { label: 'Type',  cls: 'muted' },
  ].forEach(({ label, cls }) => {
    const th = document.createElement('th');
    th.textContent = label;
    hr.appendChild(th);
  });

  const tbody = table.createTBody();
  let lastSection = null;
  const SECTION_LABELS = { own: 'Original Picks', acquired: 'Acquired Picks' };

  rows.forEach(row => {
    const section = row.TYPE;
    if (section !== lastSection) {
      const sep = tbody.insertRow();
      sep.className = 'subheader';
      const td = sep.insertCell();
      td.colSpan = 4;
      td.textContent = SECTION_LABELS[section] ?? section;
      lastSection = section;
    }

    const tr = tbody.insertRow();
    const isTraded = row.TYPE === 'own' && row.TEAM !== 'Own';
    if (isTraded) tr.className = 'picks-own-traded';
    if (row.TYPE === 'acquired') tr.className = 'picks-acquired';

    const cells = [
      row.YEAR,
      row.ROUND,
      isTraded ? `→ ${row.TEAM}` : row.TYPE === 'acquired' ? `from ${row.TEAM}` : '—',
      isTraded ? 'Traded away' : row.TYPE === 'acquired' ? 'Acquired' : 'Own',
    ];
    cells.forEach((text, i) => {
      const td = tr.insertCell();
      if (i === 3) td.className = 'type-badge';
      td.textContent = text;
    });
  });

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
    if (vals.length > 1) ranges[key] = { min: Math.min(...vals), max: Math.max(...vals) };
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
        const { min, max } = ranges[col.key];
        const t = max === min ? 0.5 : (n - min) / (max - min);
        const hue = Math.round(t * 120);
        td.style.background = `hsl(${hue}, 55%, 18%)`;
        td.style.color = `hsl(${hue}, 80%, 72%)`;
      }
    }
  };
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

function makeEditCell(header, value, config) {
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

  const table = document.createElement('table');
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  const emptyTh = document.createElement('th');
  emptyTh.style.cssText = 'width:28px;padding:0 0.4rem';
  headerRow.appendChild(emptyTh);
  mutableHeaders.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
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
      const { td, getValue, capHoldRef } = makeEditCell(h, data[h] ?? '', cellConfig[h]);
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

function rosterCellConfig(headers) {
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

function picksCellConfig() {
  return {
    ROUND: { type: 'select', options: ['1st', '2nd'] },
    TYPE:  { type: 'select', options: ['own', 'acquired'] },
  };
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
  if (salaryYears.length && cellConfig.CAP_HOLDS) {
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

(async () => {
  const seasonsWrap = document.getElementById('seasons-wrap');
  const playersWrap = document.getElementById('players-wrap');
  const rosterWrap  = document.getElementById('roster-wrap');
  const picksWrap   = document.getElementById('picks-wrap');

  const [sr, pr, rr, pkr] = await Promise.allSettled([
    fetch(`/${slug}-seasons.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/${slug}-players.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/${slug}-roster.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/${slug}-picks.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
  ]);

  if (sr.status === 'fulfilled') {
    seasonsWrap.innerHTML = '';
    const seasonRows = parseCSV(sr.value);
    buildTimeline(seasonRows);
    seasonsWrap.appendChild(buildTable(SEASON_COLS, seasonRows, 'SEASON', 1, makeSeasonRenderCell(seasonRows)));
  } else {
    seasonsWrap.innerHTML = '<div class="status">Failed to load season data.</div>';
  }

  if (pr.status === 'fulfilled') {
    playersWrap.innerHTML = '';
    playersWrap.appendChild(buildTable(PLAYER_COLS, parseCSV(pr.value), 'GMSC_TOT', -1, renderPlayerCell));
  } else {
    playersWrap.innerHTML = '<div class="status">Failed to load player data.</div>';
  }

  if (rr.status === 'fulfilled') {
    rosterWrap.innerHTML = '';
    const rosterRows = parseCSV(rr.value);
    const rosterHeaders = parseLine(rr.value.trim().split('\n')[0]);
    const t = buildRosterTable(rosterRows);
    if (t) rosterWrap.appendChild(t);
    else rosterWrap.innerHTML = '<div class="status">No roster data.</div>';
    setupEditable('roster-title', 'roster-wrap', rosterHeaders, rosterRows, `/roster/${abbr}`, buildRosterTable, rosterCellConfig(rosterHeaders));
  } else {
    rosterWrap.innerHTML = '<div class="status">Failed to load roster data.</div>';
  }

  if (pkr.status === 'fulfilled') {
    picksWrap.innerHTML = '';
    const picksRows = parseCSV(pkr.value);
    const picksHeaders = parseLine(pkr.value.trim().split('\n')[0]);
    const t = buildPicksTable(picksRows);
    if (t) picksWrap.appendChild(t);
    else picksWrap.innerHTML = '<div class="status">No picks data.</div>';
    setupEditable('picks-title', 'picks-wrap', picksHeaders, picksRows, `/picks/${abbr}`, buildPicksTable, picksCellConfig());
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
