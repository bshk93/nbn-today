// Indexes: Wall Street's groups of teams (conferences, divisions, states, an
// owners' group), priced from the fair-value history instead of game margins.
// Used by the Market tab of /finances (finances/market.js).
//
//   FinIndexes.mount(el, {
//     series:  { ATL: [{ date: '2026-10-21', price: 152.1 }, ...] },  // oldest first
//     end:     '2026-10-28',                                          // the day windows end on
//     members: [...],          // GET /api/members/public, for the owner indexes
//     notes:   { ATL: { '2026-10-28': ['L by 1 v MIA'] } },           // what happened, for the hover card
//     onPick:  team => {},     // a team in an open index was clicked
//   })
//
// Clicking an index opens its price chart, drawn like a team's on the Market
// tab (the fv-* classes in finances/index.html): hover a day to see which of
// its teams moved it, and what happened to them.
//
// An index is built the way Wall Street builds its own (INDEXES and
// _inject_index_prices in nbn-api/routers/invest.py): it starts at 100 and
// each day moves by the average of its teams' moves that day, so every team
// counts the same whatever its price. An owner index counts a team only on
// days one of its owners held it. Keep the groups in step with invest.py.
(function () {
  const GROUPS = [
    { label: 'Eastern Conference', rows: [
      { ticker: 'EAST', name: 'Eastern Conference', teams: ['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL', 'NYK', 'ORL', 'PHI', 'TOR', 'WAS'] },
      { ticker: 'ATLC', name: 'Atlantic Division', div: true, teams: ['BOS', 'BKN', 'NYK', 'PHI', 'TOR'] },
      { ticker: 'CTRL', name: 'Central Division', div: true, teams: ['CHI', 'CLE', 'DET', 'IND', 'MIL'] },
      { ticker: 'SE', name: 'Southeast Division', div: true, teams: ['ATL', 'CHA', 'MIA', 'ORL', 'WAS'] },
    ] },
    { label: 'Western Conference', rows: [
      { ticker: 'WEST', name: 'Western Conference', teams: ['DAL', 'DEN', 'GSW', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NOP', 'OKC', 'PHX', 'POR', 'SAC', 'SAS', 'UTA'] },
      { ticker: 'NW', name: 'Northwest Division', div: true, teams: ['DEN', 'MIN', 'OKC', 'POR', 'UTA'] },
      { ticker: 'PAC', name: 'Pacific Division', div: true, teams: ['GSW', 'LAC', 'LAL', 'PHX', 'SAC'] },
      { ticker: 'SW', name: 'Southwest Division', div: true, teams: ['DAL', 'HOU', 'MEM', 'NOP', 'SAS'] },
    ] },
    { label: 'States', rows: [
      { ticker: 'TX', name: 'Texas', teams: ['DAL', 'HOU', 'SAS'] },
      { ticker: 'CA', name: 'California', teams: ['GSW', 'LAC', 'LAL', 'SAC'] },
    ] },
    { label: 'Owners', rows: [
      { ticker: 'AA', name: 'AA Group', owners: ['bryn', 'hkd', 'killerdawg7', 'KVL', 'Kman', 'AJGoh'] },
    ] },
  ];

  const WINDOWS = [
    { key: '1D', days: 1 },
    { key: '7D', days: 7 },
    { key: '14D', days: 14 },
    { key: 'Season', days: Infinity },
  ];

  const css = `
  .ix { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.85rem 1.1rem; margin-bottom: 1.5rem; }
  .ix-hdr { margin-bottom: 0.6rem; }
  .ix-title { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .ix-title span { color: var(--text-dim); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .ix-table td, .ix-table th { white-space: nowrap; }
  .ix-table .ix-grp td { background: var(--bg-page); color: var(--text-dim); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; padding-top: 0.3rem; padding-bottom: 0.3rem; }
  .ix-table tr.ix-row { cursor: pointer; }
  .ix-table tr.ix-row:hover td { background: var(--bg-hover, var(--bg-page)); }
  .ix-table tr.ix-row.div td:first-child { padding-left: 1.5rem; }
  .ix-table tr.ix-row:not(.div) .ix-name { font-weight: 700; }
  .ix-badge { font-size: var(--text-xs); font-weight: 700; font-family: var(--font-mono); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.05rem 0.3rem; color: var(--text-muted); margin-left: 0.4rem; }
  .ix-spark { display: block; }
  .ix-table tr.ix-row.open td { background: var(--bg-page); }
  .ix-detail > td { white-space: normal; padding: 0 !important; }
  .ix-detail-in { position: sticky; left: 0; box-sizing: border-box; padding: var(--space-3) var(--space-4); border-left: 3px solid var(--accent); }
  @media (max-width: 640px) { .ix-detail-in { padding: var(--space-3) var(--space-2); } }
  .ix-table tbody tr.ix-detail:hover > td { background: transparent; }
  .ix-tt-team { color: var(--text-primary); font-weight: 700; }
  .ix-tt-team small { color: var(--text-muted); font-weight: 400; }
  .ix-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; white-space: normal; }
  .ix-chip { display: inline-flex; align-items: center; gap: 0.35rem; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.2rem 0.45rem; font-size: var(--text-xs); cursor: pointer; background: var(--bg-page); color: var(--text-primary); }
  .ix-chip:hover { border-color: var(--text-muted); }
  .ix-chip img { width: 16px; height: 16px; object-fit: contain; }
  .ix-chip .m { font-family: var(--font-mono); color: var(--text-secondary); }
  .ix-note { margin-top: 0.5rem; font-size: var(--text-xs); color: var(--text-muted); }
  `;

  function injectCss() {
    if (document.getElementById('ix-css')) return;
    const s = document.createElement('style');
    s.id = 'ix-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const esc = NBN.esc;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };
  const fmt = (p, dp = 1) => p == null ? '—' : (p > 0 ? '▲ +' : p < 0 ? '▼ ' : '') + p.toFixed(dp) + '%';
  const cls = p => p > 0 ? 'up' : p < 0 ? 'dn' : '';

  // Each team's [first, last] day in an owner index, from the members' owner tenures.
  function ownerWindows(owners, members) {
    const want = new Set(owners.map(o => o.toLowerCase()));
    const out = [];
    for (const m of members || []) {
      if (!want.has(String(m.name).toLowerCase())) continue;
      for (const t of m.tenures || []) {
        if (t.position !== 'owner' || !t.team || !t.start) continue;
        out.push({ team: t.team.toUpperCase(), first: t.start, last: t.end || '9999-12-31' });
      }
    }
    return out;
  }

  // The index level on every day up to `end`: 100 on the first day, then
  // each day the average of its teams' moves since the day before.
  function levels(windows, prices, dates) {
    const pts = [{ date: dates[0], level: 100 }];
    let level = 100;
    for (let i = 1; i < dates.length; i++) {
      const d0 = dates[i - 1], d1 = dates[i], moves = [];
      for (const w of windows) {
        if (d1 < w.first || d1 > w.last) continue;
        const p = prices[w.team] || {};
        if (p[d0] > 0 && p[d1] > 0) moves.push({ team: w.team, r: p[d1] / p[d0] });
      }
      if (moves.length) level *= moves.reduce((a, m) => a + m.r, 0) / moves.length;
      pts.push({ date: d1, level, moves });
    }
    return pts;
  }

  const change = (pts, days) => {
    if (pts.length < 2) return null;
    const first = pts[Math.max(0, pts.length - 1 - days)], last = pts[pts.length - 1];
    return (last.level / first.level - 1) * 100;
  };

  function spark(pts) {
    if (pts.length < 2) return '';
    const W = 120, H = 26, v = pts.map(p => p.level);
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    const d = v.map((y, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 2 - (y - lo) / span * (H - 4)).toFixed(1)}`).join(' ');
    const c = v[v.length - 1] >= v[0] ? 'var(--market-positive)' : 'var(--danger)';
    return `<svg class="ix-spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${d}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  }

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  // A canvas gradient needs a plain colour, not color-mix().
  function rgba(hex, a) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
    if (!m) return 'transparent';
    const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }

  // The hover card for one day: the level, the day's move, and each team's
  // move that day with what happened to it, biggest first. A team's share of
  // the index's move is its own move over the number of teams.
  function tooltipHtml(r, i, notes) {
    const b = r.pts[i], a = r.pts[i - 1];
    const day = a ? (b.level / a.level - 1) * 100 : null;
    const dayName = new Date(b.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    let h = `<div class="fv-tt-hd"><span>${esc(dayName)}</span><b>${b.level.toFixed(2)}</b>${day == null ? '' : `<span class="${cls(day)}">${fmt(day, 2)}</span>`}</div>`;
    if (!a) return h + '<div class="fv-tt-note">First day: the index starts at 100</div>';
    const ms = (b.moves || []).map(m => ({ team: m.team, pct: (m.r - 1) * 100 }))
      .filter(m => Math.abs(m.pct) >= 0.005).sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct));
    if (!ms.length) return h + '<div class="fv-tt-note">No team moved</div>';
    const big = Math.max(...ms.map(m => Math.abs(m.pct)));
    h += '<div class="fv-tt-why">' + ms.slice(0, 6).map(m => {
      const ev = ((notes[m.team] || {})[b.date] || [])[0];
      return `<span class="lbl ix-tt-team">${m.team}${ev ? ` <small>${esc(ev.length > 34 ? ev.slice(0, 33) + '…' : ev)}</small>` : ''}</span>
      <span class="bar"><i class="${m.pct > 0 ? 'up' : 'dn'}" style="width:${Math.max(4, Math.abs(m.pct) / big * 100)}%"></i></span>
      <span class="val ${cls(m.pct)}">${fmt(m.pct, 2)}</span>`;
    }).join('') + '</div>';
    if (ms.length > 6) h += `<div class="fv-tt-note">and ${ms.length - 6} more</div>`;
    return h;
  }

  function drawChart(canvas, tt, r, notes) {
    if (typeof Chart === 'undefined') return null;
    const v = r.pts.map(p => p.level);
    const line = cssVar(v[v.length - 1] >= v[0] ? '--market-positive' : '--danger');
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: r.pts.map(p => shortDate(p.date)),
        datasets: [{
          data: v, borderColor: line, borderWidth: 2, tension: 0.15,
          pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: line,
          pointHoverBorderColor: cssVar('--bg-card'), pointHoverBorderWidth: 2,
          fill: 'start',
          backgroundColor: ({ chart: c }) => {
            const a = c.chartArea;
            if (!a) return 'transparent';
            const g = c.ctx.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, rgba(line, 0.22));
            g.addColorStop(1, rgba(line, 0));
            return g;
          },
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false, includeInvisible: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: ({ chart: c, tooltip: t }) => {
              if (!t.opacity || !t.dataPoints || !t.dataPoints.length) { tt.hidden = true; return; }
              const i = t.dataPoints[0].dataIndex;
              if (tt.dataset.i !== String(i)) { tt.innerHTML = tooltipHtml(r, i, notes); tt.dataset.i = i; }
              tt.hidden = false;
              const a = c.chartArea, x = t.caretX, w = tt.offsetWidth;
              tt.style.left = (x > (a.left + a.right) / 2 ? Math.max(0, x - w - 14) : Math.min(c.width - w, x + 14)) + 'px';
              tt.style.top = a.top + 'px';
            },
          },
        },
        scales: {
          x: { ticks: { color: cssVar('--text-dim'), maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } }, grid: { display: false }, border: { display: false } },
          y: { position: 'right', ticks: { color: cssVar('--text-dim'), maxTicksLimit: 5, font: { size: 10 }, callback: x => Number(x).toFixed(1) },
               grid: { color: cssVar('--border-subtle') }, border: { display: false } },
        },
      },
      plugins: [{
        id: 'ixCross',
        afterDatasetsDraw(c) {
          const act = c.getActiveElements()[0];
          if (!act) return;
          const { ctx, chartArea: a } = c;
          ctx.save();
          ctx.strokeStyle = cssVar('--text-muted');
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(act.element.x, a.top); ctx.lineTo(act.element.x, a.bottom); ctx.stroke();
          ctx.restore();
        },
      }],
    });
    canvas.addEventListener('mouseleave', () => { tt.hidden = true; });
    return chart;
  }

  function mount(el, opts) {
    injectCss();
    const notes = opts.notes || {};
    const end = opts.end, series = opts.series || {};
    if (!end) { el.innerHTML = ''; return; }
    const prices = {}, dateSet = new Set();
    for (const [team, pts] of Object.entries(series)) {
      prices[team] = {};
      for (const p of pts) if (p.date <= end) { prices[team][p.date] = p.price; dateSet.add(p.date); }
    }
    const dates = [...dateSet].sort();
    if (dates.length < 2) { el.innerHTML = ''; return; }

    const rows = [];
    for (const g of GROUPS) {
      for (const r of g.rows) {
        const windows = r.owners ? ownerWindows(r.owners, opts.members)
          : r.teams.map(team => ({ team, first: '', last: '9999-12-31' }));
        if (!windows.length) continue;
        const pts = levels(windows, prices, dates);
        const now = [...new Set(windows.filter(w => w.first <= end && end <= w.last).map(w => w.team))].sort();
        rows.push({ ...r, group: g.label, pts, now, moves: WINDOWS.map(w => change(pts, w.days)) });
      }
    }
    // A team's own moves over the same windows, for the open index's chips.
    const teamMove = (team, days) => {
      const pts = (series[team] || []).filter(p => p.date <= end);
      if (pts.length < 2) return null;
      const first = pts[Math.max(0, pts.length - 1 - days)], last = pts[pts.length - 1];
      return first.price > 0 ? (last.price / first.price - 1) * 100 : null;
    };

    let open = null, chart = null;
    function render() {
      if (chart) { chart.destroy(); chart = null; }
      let grp = null, body = '';
      for (const r of rows) {
        if (r.group !== grp) { grp = r.group; body += `<tr class="ix-grp"><td colspan="7">${esc(grp)}</td></tr>`; }
        const last = r.pts[r.pts.length - 1].level;
        body += `<tr class="ix-row ${r.div ? 'div' : ''} ${open === r.ticker ? 'open' : ''}" data-ix="${r.ticker}" title="${esc(r.now.join(', '))}">
          <td><span class="ix-name">${esc(r.name)}</span><span class="ix-badge">${r.ticker}</span></td>
          <td class="num mono">${last.toFixed(2)}</td>
          ${r.moves.map(m => `<td class="num mono ${cls(m)}">${fmt(m, 2)}</td>`).join('')}
          <td>${spark(r.pts)}</td>
        </tr>`;
        if (open === r.ticker) {
          const since = (last / 100 - 1) * 100;
          body += `<tr class="ix-detail"><td colspan="7"><div class="ix-detail-in">
            <div class="fv-read">
              <span class="fv-read-val">${last.toFixed(2)}</span>
              <span class="fv-read-chg ${cls(since)}">${fmt(since)}</span>
              <span class="fv-read-sub">since ${esc(shortDate(dates[0]))} · hover a day to see which teams moved it</span>
            </div>
            <div class="fv-chart"><canvas id="ix-canvas" aria-label="${esc(r.name)} index by day"></canvas><div class="fv-tt" id="ix-tt" hidden></div></div>
            <div class="ix-chips">${r.now.map(t => {
            const m = teamMove(t, 1);
            return `<span class="ix-chip" data-team="${t}" role="button" tabindex="0" title="Open ${t}"><img src="/logos/sm/logo-${t.toLowerCase()}.webp" alt="" onerror="this.style.display='none'"><b>${t}</b><span class="m ${cls(m)}">${fmt(m, 2)}</span><span class="m">· season ${fmt(teamMove(t, Infinity))}</span></span>`;
          }).join('')}</div></div></td></tr>`;
        }
      }
      el.innerHTML = `<div class="ix">
        <div class="ix-hdr"><span class="ix-title">Indexes <span>(to ${esc(shortDate(end))}, since ${esc(shortDate(dates[0]))} = 100)</span></span></div>
        <div class="ui-table-wrap"><table class="ui-table ui-table--dense ix-table">
          <thead><tr><th>Index</th><th class="num">Level</th>${WINDOWS.map(w => `<th class="num">${w.key}</th>`).join('')}<th aria-label="Trend"></th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
        <div class="ix-note">Wall Street's indexes, on these prices. Each starts at 100 and moves each day by the average of its teams' moves, so every team counts the same. AA Group counts a team only while one of its owners held it. Click an index to see its chart and teams.</div>
      </div>`;
      fit();
      const r = open && rows.find(x => x.ticker === open);
      if (r) chart = drawChart(el.querySelector('#ix-canvas'), el.querySelector('#ix-tt'), r, notes);
    }

    // The table scrolls sideways on a phone; hold the open chart to the
    // visible width, as the team rows do (fitDetail in finances/market.js).
    function fit() {
      const d = el.querySelector('.ix-detail-in'), wrap = el.querySelector('.ui-table-wrap');
      if (d && wrap) d.style.width = wrap.clientWidth + 'px';
    }
    let w = 0;
    new ResizeObserver(() => {
      const wrap = el.querySelector('.ui-table-wrap');
      if (wrap && wrap.clientWidth !== w) { w = wrap.clientWidth; fit(); if (chart) chart.resize(); }
    }).observe(el);

    el.addEventListener('click', e => {
      const chip = e.target.closest('.ix-chip');
      if (chip) { if (opts.onPick) opts.onPick(chip.dataset.team); return; }
      const tr = e.target.closest('tr.ix-row');
      if (!tr) return;
      open = open === tr.dataset.ix ? null : tr.dataset.ix;
      render();
    });
    el.addEventListener('keydown', e => {
      const chip = e.target.closest('.ix-chip');
      if (chip && (e.key === 'Enter' || e.key === ' ') && opts.onPick) { e.preventDefault(); opts.onPick(chip.dataset.team); }
    });
    render();
  }

  window.FinIndexes = { mount };
})();
