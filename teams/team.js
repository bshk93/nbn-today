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

document.head.insertAdjacentHTML("beforeend", `<style>
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
</style>`);

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

function renderSeasonCell(td, col, row) {
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
}

function renderPlayerCell(td, col, row) {
  td.textContent = col.display ? col.display(row) : (row[col.key] ?? '—');
}

(async () => {
  const seasonsWrap = document.getElementById('seasons-wrap');
  const playersWrap = document.getElementById('players-wrap');

  const [sr, pr] = await Promise.allSettled([
    fetch(`/${slug}-seasons.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/${slug}-players.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
  ]);

  if (sr.status === 'fulfilled') {
    seasonsWrap.innerHTML = '';
    seasonsWrap.appendChild(buildTable(SEASON_COLS, parseCSV(sr.value), 'SEASON', 1, renderSeasonCell));
  } else {
    seasonsWrap.innerHTML = '<div class="status">Failed to load season data.</div>';
  }

  if (pr.status === 'fulfilled') {
    playersWrap.innerHTML = '';
    playersWrap.appendChild(buildTable(PLAYER_COLS, parseCSV(pr.value), 'GMSC_TOT', -1, renderPlayerCell));
  } else {
    playersWrap.innerHTML = '<div class="status">Failed to load player data.</div>';
  }
})();
