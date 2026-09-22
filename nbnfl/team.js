// Shared script for NBNFL team pages (nbnfl/{ABBR}/index.html). Mirrors the
// teams/team.js pattern: a thin per-team shell loads this file, which infers
// the team abbreviation from the URL and injects the whole page. Adding a
// new team later is a new 3-line shell (see nbnfl/CIN/index.html), no new
// script — the team list itself comes from the API, not a hardcoded map here.
const abbr = location.pathname.replace(/\/$/, "").split("/").pop().toUpperCase();

{ const _favicon = document.createElement('link'); _favicon.rel = 'icon'; _favicon.href = '/logo.png'; document.head.appendChild(_favicon); }

{ const _s = document.createElement('style'); _s.textContent = `
  @import url("/css/theme.css");
  @import url("/css/nav-chrome.css");
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--font-sans);
    background: var(--bg-page);
    color: var(--text-primary);
    min-height: 100vh;
    padding: 2rem 1rem 4rem;
  }
  .page { max-width: 1000px; margin: 0 auto; }
  .nav { margin-bottom: 1.5rem; font-size: 0.875rem; }
  .nav a { color: var(--text-muted); text-decoration: none; }
  .nav a:hover { color: var(--text-primary); }

  header { margin-bottom: 1.5rem; }
  header h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.02em; }
  header p { color: var(--text-muted); margin-top: 0.4rem; font-size: 0.88rem; }

  section { margin-bottom: 2.5rem; }
  section h2 { font-size: 1.15rem; font-weight: 600; margin-bottom: 0.9rem; }
  .empty { color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0; }

  /* ── record strip ─────────────────────────────────────────────── */
  .record-strip { display: flex; flex-wrap: wrap; gap: 1.5rem; background: var(--bg-card);
    border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; }
  .record-stat { min-width: 70px; }
  .record-stat .label { font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 0.2rem; }
  .record-stat .value { font-size: 1.2rem; font-weight: 700; font-variant-numeric: tabular-nums; }

  /* ── division table ───────────────────────────────────────────── */
  table.standings { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  table.standings th, table.standings td { padding: 0.35rem 0.5rem; text-align: right; }
  table.standings th:first-child, table.standings td:first-child { text-align: left; }
  table.standings th { color: var(--text-muted); font-weight: 600; font-size: 0.68rem; text-transform: uppercase; }
  table.standings tbody tr { border-bottom: 1px solid var(--border); }
  table.standings tbody tr.this-team { background: var(--bg-subtle); font-weight: 700; }
  table.standings td.team { font-weight: 600; }

  /* ── scores ───────────────────────────────────────────────────── */
  .week-group { margin-bottom: 1.1rem; }
  .week-group h4 { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 0.4rem; }
  .game-row { display: flex; align-items: center; justify-content: space-between;
    padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
  .game-row .matchup { display: flex; align-items: center; gap: 0.5rem; }
  .game-row .score { font-weight: 700; font-variant-numeric: tabular-nums; }
  .game-row .win { color: var(--success); }

  /* ── leaders ──────────────────────────────────────────────────── */
  .leader-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; }
  .leader-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.9rem; }
  .leader-card h4 { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 0.6rem; }
  .leader-row { display: flex; justify-content: space-between; font-size: 0.82rem; padding: 0.2rem 0; }
  .leader-row .value { font-weight: 700; font-variant-numeric: tabular-nums; }
`; document.head.appendChild(_s); }

document.body.innerHTML = `
  <div class="page">
    <nav class="nav"><a href="/nbnfl/">← NBNFL</a></nav>
    <header id="team-header">
      <h1 id="team-title">Loading…</h1>
      <p id="team-sub"></p>
    </header>

    <section id="record-section" style="display:none">
      <h2>Record</h2>
      <div class="record-strip" id="record-strip"></div>
    </section>

    <section id="division-section" style="display:none">
      <h2>Division</h2>
      <div id="division-table"></div>
    </section>

    <section id="schedule-section">
      <h2>Schedule &amp; Results</h2>
      <div id="schedule"></div>
    </section>

    <section id="leaders-section">
      <h2>Team Leaders</h2>
      <div id="leaders" class="leader-grid"></div>
    </section>
  </div>
`;

const _navScript = document.createElement('script');
_navScript.src = '/nav.js';
document.head.appendChild(_navScript);

const _badgeScript = document.createElement('script');
_badgeScript.src = '/token-badge.js';
_badgeScript.onload = function () { window.__nbnBadge && window.__nbnBadge(); };
document.head.appendChild(_badgeScript);

const CATEGORY_FIELDS = ['passing', 'rushing', 'receiving', 'defense', 'kicking'];
const CATEGORY_LABELS = { passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', defense: 'Defense', kicking: 'Kicking' };
const PRIMARY_STAT = { passing: 'yds', rushing: 'yds', receiving: 'yds', defense: 'sacks', kicking: 'fgm' };
const PRIMARY_LABEL = { passing: 'pass yds', rushing: 'rush yds', receiving: 'rec yds', defense: 'sacks', kicking: 'FG made' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderRecord(row) {
  const strip = document.getElementById('record-strip');
  strip.innerHTML = '';
  const stats = [
    ['W', row.wins], ['L', row.losses], ['T', row.ties],
    ['PF', row.pf], ['PA', row.pa], ['Diff', row.diff > 0 ? `+${row.diff}` : row.diff],
  ];
  for (const [label, value] of stats) {
    const stat = el('div', 'record-stat');
    stat.appendChild(el('div', 'label', label));
    stat.appendChild(el('div', 'value', String(value)));
    strip.appendChild(stat);
  }
  document.getElementById('record-section').style.display = '';
}

function renderDivision(rows) {
  const root = document.getElementById('division-table');
  root.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'standings';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th><th>Diff</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (r.abbr === abbr) tr.className = 'this-team';
    const diff = r.diff > 0 ? `+${r.diff}` : r.diff;
    tr.innerHTML = `<td class="team">${r.abbr} ${r.name}</td><td>${r.wins}</td><td>${r.losses}</td>` +
      `<td>${r.ties}</td><td>${r.pf}</td><td>${r.pa}</td><td>${diff}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  root.appendChild(table);
  document.getElementById('division-section').style.display = '';
}

function renderSchedule(games) {
  const root = document.getElementById('schedule');
  root.innerHTML = '';
  if (!games.length) { root.appendChild(el('div', 'empty', 'No games entered yet.')); return; }
  const byWeek = new Map();
  for (const g of games) {
    const key = `${g.season} — Week ${g.week}`;
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(g);
  }
  // list_games() already sorts by (season, week, date), so weeks arrive in order.
  for (const [label, weekGames] of byWeek) {
    const group = el('div', 'week-group');
    group.appendChild(el('h4', null, label));
    for (const g of weekGames) {
      const row = el('div', 'game-row');
      const matchup = el('span', 'matchup');
      const awayWin = g.away_score > g.home_score;
      const homeWin = g.home_score > g.away_score;
      matchup.innerHTML =
        `<span class="${awayWin ? 'win' : ''}">${g.away}</span> @ <span class="${homeWin ? 'win' : ''}">${g.home}</span>`;
      row.appendChild(matchup);
      row.appendChild(el('span', 'score', `${g.away_score} – ${g.home_score}`));
      group.appendChild(row);
    }
    root.appendChild(group);
  }
}

// Same aggregation as GET /api/nbnfl/leaders, scoped to this team's own stat
// lines — a game's `stats` array holds both teams' players, so this filters
// to abbr before summing.
function renderLeaders(games) {
  const totals = new Map();
  for (const g of games) {
    for (const line of (g.stats || [])) {
      if (line.team !== abbr) continue;
      const primary = PRIMARY_STAT[line.category];
      if (!primary) continue;
      const key = `${line.category} ${line.player}`;
      totals.set(key, (totals.get(key) || 0) + (line.stats?.[primary] || 0));
    }
  }
  const byCategory = Object.fromEntries(CATEGORY_FIELDS.map(c => [c, []]));
  for (const [key, value] of totals) {
    const [category, player] = key.split(' ');
    byCategory[category].push({ player, value });
  }

  const root = document.getElementById('leaders');
  root.innerHTML = '';
  for (const category of CATEGORY_FIELDS) {
    const rows = byCategory[category].sort((a, b) => b.value - a.value).slice(0, 5);
    const card = el('div', 'leader-card');
    card.appendChild(el('h4', null, `${CATEGORY_LABELS[category]} — ${PRIMARY_LABEL[category]}`));
    if (!rows.length) {
      card.appendChild(el('div', 'empty', 'No data yet.'));
    } else {
      for (const r of rows) {
        const row = el('div', 'leader-row');
        row.appendChild(el('span', null, r.player));
        row.appendChild(el('span', 'value', String(r.value)));
        card.appendChild(row);
      }
    }
    root.appendChild(card);
  }
}

(async function init() {
  const [teamsData, standingsData, games] = await Promise.all([
    fetch('/api/nbnfl/teams').then(r => r.json()),
    fetch('/api/nbnfl/standings').then(r => r.json()),
    fetch(`/api/nbnfl/games?team=${abbr}`).then(r => r.json()),
  ]);

  const info = teamsData.teams.find(t => t.abbr === abbr);
  if (!info) {
    document.getElementById('team-title').textContent = 'Unknown team';
    document.getElementById('team-sub').textContent = `No NBNFL team with abbreviation "${abbr}".`;
    document.getElementById('schedule-section').style.display = 'none';
    document.getElementById('leaders-section').style.display = 'none';
    return;
  }

  document.getElementById('team-title').textContent = `${info.name}`;
  document.getElementById('team-sub').textContent = `${abbr} · ${info.conference} ${info.division}`;

  const divisionRows = standingsData?.[info.conference]?.[info.division] || [];
  const thisRow = divisionRows.find(r => r.abbr === abbr);
  if (thisRow) renderRecord(thisRow);
  if (divisionRows.length) renderDivision(divisionRows);

  renderSchedule(games);
  renderLeaders(games);
})();
