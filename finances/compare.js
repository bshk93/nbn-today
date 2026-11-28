// Compare franchises: up to eight share prices on one chart, as NB¥ or as the
// change since opening night. Used by the Market tab of /finances
// (finances/market.js), which hands over the run's teams (with the figures it
// has already worked out: mkt, ...) and the daily history.
//
//   FinCompare.mount(el, { teams, history, events, a: 'PHX' })
//   FinCompare.set('PHX')        // add PHX to the chart and scroll to it
//
// The set is kept in the URL as ?vs=PHX,LAL,BOS (replaceState: it is a view,
// not an item), so a comparison can be linked. The page's own url() keeps it.
(function () {
  const MAX = 8;
  const css = `
  .cmp { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.85rem 1.1rem; margin-bottom: 1.5rem; }
  .cmp-hdr { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.6rem; }
  .cmp-title { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .cmp-modes { display: flex; gap: 2px; background: var(--bg-page); border-radius: var(--radius-sm); padding: 2px; }
  .cmp-modes button { background: none; border: none; color: var(--text-muted); padding: 0.2rem 0.55rem; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--text-xs); font-weight: 600; }
  .cmp-modes button.active { background: var(--border); color: var(--text-primary); }
  .cmp-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; margin-bottom: 0.5rem; }
  .cmp-chip { display: inline-flex; align-items: center; gap: 0.35rem; background: var(--bg-page); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.1rem 0.25rem 0.1rem 0.55rem; font-size: var(--text-sm); }
  .cmp-chip i { display: inline-block; width: 0.9rem; height: 0; border-top: 3px solid; }
  .cmp-chip b { font-family: var(--font-mono); font-weight: 600; font-size: var(--text-xs); }
  .cmp-chip button { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0 0.25rem; font-size: var(--text-sm); line-height: 1; }
  .cmp-chip button:hover { color: var(--text-primary); }
  .cmp-chips select { height: 26px; font-size: var(--text-sm); }
  .cmp-chart { position: relative; height: 300px; touch-action: pan-y; }
  @media (max-width: 640px) { .cmp-chart { height: 230px; } }
  .cmp .up { color: var(--market-positive); }
  .cmp .dn { color: var(--danger); }
  `;

  function injectCss() {
    if (document.getElementById('cmp-css')) return;
    const s = document.createElement('style');
    s.id = 'cmp-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };
  const pct = (v, dp = 1) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dp) + '%';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : '';
  const px = x => x.market ?? x.price;
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // Each line takes its team's chart colour, then its accent, then a spare,
  // whichever is first far enough from every colour already on the chart
  // (BOS and MIL are both green).
  const SPARE = ['sky', 'pink', 'amber', 'teal', 'violet', 'orange', 'lime', 'slate'];
  function colours(list) {
    const C = window.NBN_TEAM_COLORS || {};
    const spare = SPARE.map(n => cssVar('--cat-' + n));
    const rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
    const far = (c, used) => rgb(c) && used.every(u => Math.hypot(...rgb(c).map((v, i) => v - rgb(u)[i])) >= 90);
    const used = [];
    for (const t of list) {
      const c = [(C[t] || {}).chart, (C[t] || {}).accent, ...spare].find(x => far(x, used)) || spare[used.length % spare.length];
      used.push(c);
    }
    return used;
  }

  let state = null;

  function mount(el, opts) {
    injectCss();
    const teams = opts.teams || [];
    const byTeam = Object.fromEntries(teams.map(t => [t.team, t]));
    const history = opts.history || [];
    const events = opts.events || {};
    const abbrs = teams.map(t => t.team).sort();
    let chart = null;

    for (const t of teams) {
      const first = history.find(d => d.teams[t.team]);
      t.since = first ? (t.mkt / px(first.teams[t.team]) - 1) * 100 : null;
    }

    // ?vs= first; otherwise the team the page asked for and the nearest
    // market cap, the franchise it is most often weighed against.
    const fromUrl = [...new Set((new URLSearchParams(location.search).get('vs') || '').toUpperCase().split(','))].filter(t => byTeam[t]).slice(0, MAX);
    const byCap = [...teams].sort((x, y) => y.mcap - x.mcap).map(t => t.team);
    const nearest = a => { const i = byCap.indexOf(a); return byCap[i === 0 ? 1 : i - 1]; };
    let picked = fromUrl;
    if (!picked.length && byCap.length) {
      const a = byTeam[opts.a] ? opts.a : byCap[0];
      picked = [a, nearest(a)].filter(Boolean);
    }
    let mode = 'pct';

    function saveUrl() {
      const p = new URLSearchParams(location.search);
      if (picked.length) p.set('vs', picked.join(',')); else p.delete('vs');
      const q = String(p).replace(/%2C/gi, ',');
      history_replace(`${location.pathname}${q ? '?' + q : ''}${location.hash}`);
    }

    function render() {
      const cols = colours(picked);
      const chips = picked.map((t, i) => {
        const T = byTeam[t];
        return `<span class="cmp-chip" data-team="${t}"><i style="border-color:${cols[i]}"></i><a href="/teams/${t}/">${t}</a>
          <b>NB¥${T.mkt.toFixed(2)}</b> <b class="${cls(T.since)}">${pct(T.since)}</b>
          <button data-remove="${t}" title="Remove ${t}" aria-label="Remove ${t}">×</button></span>`;
      }).join('');
      const left = abbrs.filter(t => !picked.includes(t));
      const add = picked.length < MAX && left.length
        ? `<select class="ui-select" data-add aria-label="Add a team"><option value="">+ Add team</option>${left.map(t => `<option value="${t}">${t}</option>`).join('')}</select>`
        : '';
      el.innerHTML = `<div class="cmp" id="compare">
        <div class="cmp-hdr">
          <span class="cmp-title">Compare</span>
          <div class="cmp-modes">
            <button data-mode="pct" class="${mode === 'pct' ? 'active' : ''}" title="Change since opening night">% change</button>
            <button data-mode="yen" class="${mode === 'yen' ? 'active' : ''}" title="Share price">NB¥</button>
          </div>
        </div>
        <div class="cmp-chips">${chips}${add}</div>
        ${history.length >= 2 && picked.length ? `<div class="cmp-chart"><canvas aria-label="Share prices by day: ${picked.join(', ')}"></canvas></div>` : ''}
      </div>`;
      drawChart(cols);
    }

    function drawChart(cols) {
      const canvas = el.querySelector('canvas');
      if (chart) { chart.destroy(); chart = null; }
      if (!canvas || typeof Chart === 'undefined') return;
      const days = history.filter(d => picked.some(t => d.teams[t]));
      const base = t => { const d = days.find(x => x.teams[t]); return d ? px(d.teams[t]) : null; };
      const datasets = picked.map((t, i) => {
        const b0 = base(t);
        return {
          label: t, borderColor: cols[i], borderWidth: 2, tension: 0.15, spanGaps: true,
          pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: cols[i],
          data: days.map(d => !d.teams[t] ? null : mode === 'pct' ? (px(d.teams[t]) / b0 - 1) * 100 : px(d.teams[t])),
        };
      });
      const fmtY = v => mode === 'pct' ? pct(v) : 'NB¥' + v.toFixed(2);
      chart = new Chart(canvas, {
        type: 'line',
        data: { labels: days.map(d => shortDate(d.date)), datasets },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              itemSort: (x, y) => (y.raw ?? -Infinity) - (x.raw ?? -Infinity),
              callbacks: {
                label: c => `${c.dataset.label}  ${c.raw == null ? '—' : fmtY(c.raw)}`,
                afterBody: items => {
                  const d = days[items[0].dataIndex];
                  return picked.flatMap(t => ((events[t] || {})[d.date] || []).map(e => `${t}: ${e}`));
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: cssVar('--text-dim'), maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } }, grid: { display: false }, border: { display: false } },
            y: { position: 'right', ticks: { color: cssVar('--text-dim'), maxTicksLimit: 5, font: { size: 10 }, callback: v => mode === 'pct' ? pct(Number(v), 0) : '¥' + Number(v).toFixed(0) },
                 grid: { color: ctx => mode === 'pct' && ctx.tick.value === 0 ? cssVar('--text-dim') : cssVar('--border-subtle') }, border: { display: false } },
          },
        },
      });
    }

    // Hovering a chip brings its line forward.
    function highlight(team) {
      if (!chart) return;
      for (const ds of chart.data.datasets) ds.borderWidth = !team ? 2 : ds.label === team ? 3.5 : 1;
      chart.update('none');
    }

    el.addEventListener('change', e => {
      const s = e.target.closest('[data-add]');
      if (!s || !s.value || picked.includes(s.value) || picked.length >= MAX) return;
      picked.push(s.value);
      saveUrl(); render();
    });
    el.addEventListener('click', e => {
      const r = e.target.closest('[data-remove]');
      if (r) { picked = picked.filter(t => t !== r.dataset.remove); saveUrl(); render(); return; }
      const m = e.target.closest('[data-mode]');
      if (m && m.dataset.mode !== mode) { mode = m.dataset.mode; render(); }
    });
    el.addEventListener('mouseover', e => { const c = e.target.closest('.cmp-chip'); if (c) highlight(c.dataset.team); });
    el.addEventListener('mouseout', e => { const c = e.target.closest('.cmp-chip'); if (c && !c.contains(e.relatedTarget)) highlight(null); });
    window.addEventListener('resize', () => { if (chart) chart.resize(); });

    state = {
      set(team) {
        if (!byTeam[team]) return;
        if (!picked.includes(team)) {
          if (picked.length >= MAX) picked.pop();
          picked.push(team);
          saveUrl(); render();
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    };
    render();
  }

  // window.history, not the module's price history.
  function history_replace(u) {
    if (new URL(u, location.href).href !== location.href) window.history.replaceState(window.history.state, '', u);
  }

  window.FinCompare = { mount, set: team => state && state.set(team) };
})();
