(function () {
  const { statKey, csvPath } = window.PAGE_CONFIG;

  let sortField = 'RANK';
  let sortDir = 1;

  const STAT_COLS = [
    { key: 'P',   label: 'PTS' },
    { key: 'R',   label: 'REB' },
    { key: 'A',   label: 'AST' },
    { key: 'S',   label: 'STL' },
    { key: 'B',   label: 'BLK' },
    { key: '3PM', label: '3PM' },
  ];

  const STAT_KEYS = new Set(STAT_COLS.map(s => s.key));

  const ROUND_NAMES = { '1': 'R1', '2': 'R2', '3': 'Conf Finals', '4': 'Finals' };

  function roundGameLabel(row) {
    if (row.gametype !== 'PLAYOFF' || !row.ROUND || row.ROUND === 'NA') return '';
    const r = ROUND_NAMES[row.ROUND] || `R${row.ROUND}`;
    return `${r} · G${row.GAME}`;
  }

  const COLS = [
    { key: 'RANK',   label: '#',      cls: 'right muted', numeric: true,  defaultDir:  1 },
    { key: 'PLAYER', label: 'Player', cls: 'player-name', numeric: false, defaultDir:  1 },
    { key: 'TEAM',   label: 'Tm',     cls: 'center',      numeric: false, defaultDir:  1 },
    { key: 'OPP',    label: 'Opp',    cls: 'center muted',numeric: false, defaultDir:  1 },
    { key: 'SEASON', label: 'Season', cls: 'muted',       numeric: false, defaultDir:  1 },
    { key: 'ROUND_GAME', label: 'Round', cls: 'center muted', numeric: false, defaultDir: 1 },
    { key: 'DATE',   label: 'Date',   cls: 'muted',       numeric: false, defaultDir:  1 },
    ...STAT_COLS.map(s => ({
      key: s.key,
      label: s.label,
      cls: 'right ' + (s.key === statKey ? 'stat-primary' : 'stat-sec'),
      numeric: true,
      defaultDir: -1,
    })),
  ];

  function playerSlug(name) {
    return name.toLowerCase().replace(/, /g, '-').replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
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

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = parseLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = parseLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    });
  }

  function sortVal(row, field) {
    if (field === 'ROUND_GAME') {
      const round = parseInt(row.ROUND, 10);
      const game = parseInt(row.GAME, 10);
      return (row.gametype === 'PLAYOFF' && !isNaN(round) && !isNaN(game)) ? round * 100 + game : -Infinity;
    }
    const v = row[field];
    if (v === undefined || v === '' || v === 'NA') {
      return (STAT_KEYS.has(field) || field === 'RANK') ? -Infinity : '';
    }
    const n = parseFloat(v);
    return isNaN(n) ? v.toLowerCase() : n;
  }

  function sortRows(rows) {
    return [...rows].sort((a, b) => {
      const va = sortVal(a, sortField);
      const vb = sortVal(b, sortField);
      if (va < vb) return sortDir === 1 ? -1 : 1;
      if (va > vb) return sortDir === 1 ? 1 : -1;
      return 0;
    });
  }

  let allRows = [];
  let tbody;
  let thEls = [];

  function updateHeaders() {
    thEls.forEach((th, i) => {
      const active = COLS[i].key === sortField;
      th.dataset.active = active;
      th.querySelector('.sort-arrow').textContent = active ? (sortDir === -1 ? '↓' : '↑') : '';
    });
  }

  function rebuildBody() {
    const sorted = sortRows(allRows);
    tbody.innerHTML = '';
    sorted.forEach(row => {
      const tr = tbody.insertRow();
      COLS.forEach(col => {
        const td = tr.insertCell();
        td.className = col.cls;
        if (col.key === 'PLAYER') {
          const a = document.createElement('a');
          a.href = `/players/?p=${playerSlug(row.PLAYER)}`;
          a.textContent = row.PLAYER;
          td.appendChild(a);
        } else if (col.key === 'ROUND_GAME') {
          td.textContent = roundGameLabel(row);
        } else {
          td.textContent = row[col.key] ?? '';
        }
      });
    });
  }

  function buildTable(rows) {
    allRows = rows;
    const wrap = document.getElementById('table-wrap');
    const table = document.createElement('table');

    const thead = table.createTHead();
    const hr = thead.insertRow();
    COLS.forEach(col => {
      const th = document.createElement('th');
      col.cls.split(' ').forEach(c => c && th.classList.add(c));
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      th.appendChild(document.createTextNode(col.label));
      th.appendChild(arrow);
      th.dataset.active = col.key === sortField;
      th.addEventListener('click', () => {
        if (sortField === col.key) {
          sortDir *= -1;
        } else {
          sortField = col.key;
          sortDir = col.defaultDir;
        }
        updateHeaders();
        rebuildBody();
      });
      thEls.push(th);
      hr.appendChild(th);
    });

    tbody = table.createTBody();
    wrap.innerHTML = '';
    wrap.appendChild(table);
    updateHeaders();
    rebuildBody();
  }

  fetch(csvPath)
    .then(r => { if (!r.ok) throw new Error(); return r.text(); })
    .then(text => buildTable(parseCSV(text)))
    .catch(() => {
      document.getElementById('table-wrap').innerHTML = '<div id="status">Failed to load data.</div>';
    });
})();
