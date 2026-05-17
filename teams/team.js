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
  .tl-runnerup   { border-color: #6b7280; }
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
      <h2 class="section-title">Roster</h2>
      <div class="table-wrap" id="roster-wrap"><div class="status">Loading…</div></div>
    </section>
    <section>
      <h2 class="section-title">Draft Picks</h2>
      <div class="table-wrap" id="picks-wrap"><div class="status">Loading…</div></div>
    </section>
    <section>
      <h2 class="section-title">Season History</h2>
      <div class="timeline" id="timeline-wrap"></div>
      <div class="table-wrap" id="seasons-wrap"><div class="status">Loading…</div></div>
    </section>
    <section>
      <h2 class="section-title">All-Time Top Players</h2>
      <p class="section-sub">Regular season · ranked by total Game Score</p>
      <div class="table-wrap" id="players-wrap"><div class="status">Loading…</div></div>
    </section>
  </div>
`;

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

function buildRosterTable(rows) {
  if (!rows.length) return null;
  const salaryKeys = Object.keys(rows[0]).filter(k => /^\d{2}-\d{2}$/.test(k));
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
    const t = buildRosterTable(parseCSV(rr.value));
    if (t) rosterWrap.appendChild(t);
    else rosterWrap.innerHTML = '<div class="status">No roster data.</div>';
  } else {
    rosterWrap.innerHTML = '<div class="status">Failed to load roster data.</div>';
  }

  if (pkr.status === 'fulfilled') {
    picksWrap.innerHTML = '';
    const t = buildPicksTable(parseCSV(pkr.value));
    if (t) picksWrap.appendChild(t);
    else picksWrap.innerHTML = '<div class="status">No picks data.</div>';
  } else {
    picksWrap.innerHTML = '<div class="status">Failed to load picks data.</div>';
  }
})();
