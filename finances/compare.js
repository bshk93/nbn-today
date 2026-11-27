// Compare two franchises: their share prices on one chart, and their books and
// season side by side. Used by the Market tab of /finances (finances/market.js),
// which hands over the run's teams (with the figures it has already worked out:
// mkt, mcap, prem, day, ps, pe, hi, lo) and the daily history.
//
//   FinCompare.mount(el, { teams, history, events, a: 'PHX', b: 'LAL' })
//   FinCompare.set('PHX')        // make PHX the first team and scroll to it
//
// The pair is kept in the URL as ?vs=PHX,LAL (replaceState: it is a view, not
// an item), so a comparison can be linked. The page's own url() keeps it.
(function () {
  const css = `
  .cmp { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.85rem 1.1rem; margin-bottom: 1.5rem; }
  .cmp-hdr { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
  .cmp-title { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .cmp-pick { display: flex; align-items: center; gap: 0.4rem; }
  .cmp-pick select { height: 28px; font-size: var(--text-sm); }
  .cmp-pick button { background: var(--bg-page); border: 1px solid var(--border); color: var(--text-secondary); border-radius: var(--radius-sm); height: 28px; padding: 0 0.5rem; cursor: pointer; font-size: var(--text-sm); }
  .cmp-modes { display: flex; gap: 2px; background: var(--bg-page); border-radius: var(--radius-sm); padding: 2px; }
  .cmp-modes button { background: none; border: none; color: var(--text-muted); padding: 0.2rem 0.55rem; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--text-xs); font-weight: 600; }
  .cmp-modes button.active { background: var(--border); color: var(--text-primary); }
  .cmp-legend { display: flex; flex-wrap: wrap; gap: 0.3rem 1.2rem; font-size: var(--text-sm); margin-bottom: 0.4rem; }
  .cmp-legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
  .cmp-legend i { display: inline-block; width: 1.4rem; height: 0; border-top: 3px solid; }
  .cmp-legend i.dash { border-top-style: dashed; }
  .cmp-legend b { font-family: var(--font-mono); }
  .cmp-chart { position: relative; height: 260px; margin-bottom: var(--space-4); touch-action: pan-y; }
  @media (max-width: 640px) { .cmp-chart { height: 210px; } }
  .cmp-verdict { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 0.6rem; }
  .cmp-verdict b { color: var(--text-primary); }
  .cmp-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .cmp-table th, .cmp-table td { padding: 0.32rem 0.6rem; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
  .cmp-table thead th { color: var(--text-primary); font-weight: 700; }
  .cmp-table thead th img { width: 20px; height: 20px; object-fit: contain; vertical-align: middle; margin-right: 0.35rem; }
  .cmp-table td { font-family: var(--font-mono); text-align: right; width: 38%; color: var(--text-secondary); }
  .cmp-table th.lbl { color: var(--text-muted); font-weight: 600; text-align: center; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; }
  .cmp-table td.l { text-align: right; }
  .cmp-table td.r { text-align: left; }
  .cmp-table td.win { color: var(--text-primary); font-weight: 700; }
  .cmp-table td.win.l::after { content: ' ◀'; color: var(--text-muted); font-size: 0.7em; }
  .cmp-table td.win.r::before { content: '▶ '; color: var(--text-muted); font-size: 0.7em; }
  .cmp-table .up { color: var(--market-positive); }
  .cmp-table .dn { color: var(--danger); }
  .cmp-table tr.grp th { text-align: left; color: var(--text-dim); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; padding-top: 0.8rem; font-weight: 600; }
  .cmp-note { font-size: var(--text-xs); color: var(--text-muted); margin-top: 0.5rem; }
  `;

  function injectCss() {
    if (document.getElementById('cmp-css')) return;
    const s = document.createElement('style');
    s.id = 'cmp-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const esc = NBN.esc;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };
  const yen = (v, unit = 'M') => v == null ? '—' : (v < 0 ? '−' : '') + 'NB¥' + (Math.abs(v) / (unit === 'B' ? 1e9 : 1e6)).toFixed(unit === 'B' ? 2 : 0) + unit;
  const pct = (v, dp = 1) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dp) + '%';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : '';
  const prob = p => p == null ? '—' : p > 0 && p < 0.0005 ? '<0.1%' : (p * 100).toFixed(p >= 0.1 ? 0 : 1) + '%';
  const px = x => x.market ?? x.price;
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // The rows. `better` is which way is good for the franchise: 1 higher, -1
  // lower, 0 neither (a cheap share and a dear one are both arguments).
  const ROWS = [
    { grp: 'Share' },
    { label: 'Price', get: t => t.mkt, fmt: t => 'NB¥' + t.mkt.toFixed(2), better: 0 },
    { label: 'Day', get: t => t.day, fmt: t => `<span class="${cls(t.day)}">${pct(t.day, 2)}</span>`, better: 1 },
    { label: 'Season', get: t => t.since, fmt: t => `<span class="${cls(t.since)}">${pct(t.since)}</span>`, better: 1 },
    { label: 'Season range', get: () => null, fmt: t => `NB¥${t.lo.toFixed(2)} – ${t.hi.toFixed(2)}`, better: 0 },
    { label: 'Fair value', get: t => t.price, fmt: t => 'NB¥' + t.price.toFixed(2), better: 1 },
    { label: 'vs fair', get: t => t.prem, fmt: t => `<span class="${cls(t.prem)}">${pct(t.prem * 100)}</span>`, better: 0 },
    { label: 'Market cap', get: t => t.mcap, fmt: t => yen(t.mcap, 'B'), better: 1 },
    { label: 'P/E', get: t => t.pe, fmt: t => t.pe == null ? 'n/m' : t.pe.toFixed(0), better: 0 },
    { label: 'P/S', get: t => t.ps, fmt: t => t.ps == null ? '—' : t.ps.toFixed(1) + '×', better: 0 },
    { grp: 'Books, this season' },
    { label: 'Revenue', get: t => t.years[0].revenue, fmt: t => yen(t.years[0].revenue), better: 1 },
    { label: 'Payroll', get: t => t.years[0].payroll, fmt: t => yen(t.years[0].payroll), better: 0 },
    { label: 'Tax', get: t => t.years[0].tax, fmt: t => yen(t.years[0].tax), better: -1 },
    { label: 'Profit', get: t => t.years[0].profit, fmt: t => `<span class="${cls(t.years[0].profit)}">${(t.years[0].profit > 0 ? '+' : '') + yen(t.years[0].profit)}</span>`, better: 1 },
    { label: 'Market', get: t => t.years[0].market, fmt: t => t.years[0].market == null ? '—' : t.years[0].market.toFixed(2) + '×', better: 1 },
    { label: 'Buzz', get: t => t.years[0].buzz, fmt: t => t.years[0].buzz == null ? '—' : pct(t.years[0].buzz * 100, 0), better: 1 },
    { grp: 'On the court' },
    { label: 'W-L', get: t => t.w - t.l, fmt: t => `${t.w}-${t.l}`, better: 1 },
    { label: 'Proj W', get: t => t.years[0].proj_w, fmt: t => t.years[0].proj_w.toFixed(1), better: 1 },
    { label: 'Playoffs', get: t => t.years[0].playoffs, fmt: t => prob(t.years[0].playoffs), better: 1 },
    { label: 'Title', get: t => t.years[0].title, fmt: t => prob(t.years[0].title), better: 1 },
    { label: 'Strength', get: t => t.years[0].strength, fmt: t => t.years[0].strength == null ? '—' : t.years[0].strength.toFixed(1), better: 1 },
    { label: 'Stars', get: t => t.years[0].stars, fmt: t => String(t.years[0].stars ?? '—'), better: 1 },
    { grp: 'Next two seasons' },
    { label: 'Proj W', get: t => avg(t.years.slice(1).map(y => y.proj_w)), fmt: t => fx(avg(t.years.slice(1).map(y => y.proj_w)), 1), better: 1, tip: 'a season, on average' },
    { label: 'Profit', get: t => sum(t.years.slice(1).map(y => y.profit)), fmt: t => yen(sum(t.years.slice(1).map(y => y.profit))), better: 1, tip: 'the two together' },
  ];
  const sum = a => a.length ? a.reduce((s, v) => s + (v || 0), 0) : null;
  const avg = a => a.length ? sum(a) / a.length : null;
  const fx = (v, dp) => v == null ? '—' : v.toFixed(dp);

  // Two lines, each in its team's chart colour. When the two colours are close
  // (BOS and MIL are both green) the second team takes its accent instead; it
  // is dashed either way, so colour is never the only cue.
  function colours(a, b) {
    const C = window.NBN_TEAM_COLORS || {};
    const ca = (C[a] || {}).chart || cssVar('--accent');
    let cb = (C[b] || {}).chart || cssVar('--text-muted');
    const rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
    const dist = (x, y) => x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 999;
    if (dist(rgb(ca), rgb(cb)) < 90) {
      const alt = (C[b] || {}).accent;
      cb = alt && dist(rgb(ca), rgb(alt)) >= 90 ? alt : cssVar('--text-muted');
    }
    return [ca, cb];
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

    // ?vs= first, then what the page asked for; the second team defaults to
    // the nearest market cap, the franchise it is most often weighed against.
    const fromUrl = (new URLSearchParams(location.search).get('vs') || '').toUpperCase().split(',');
    const byCap = [...teams].sort((x, y) => y.mcap - x.mcap).map(t => t.team);
    const nearest = a => { const i = byCap.indexOf(a); return byCap[i === 0 ? 1 : i - 1]; };
    let a = byTeam[fromUrl[0]] ? fromUrl[0] : byTeam[opts.a] ? opts.a : byCap[0];
    let b = byTeam[fromUrl[1]] && fromUrl[1] !== a ? fromUrl[1] : nearest(a);
    let mode = 'pct';

    function saveUrl() {
      const p = new URLSearchParams(location.search);
      p.set('vs', `${a},${b}`);
      history_replace(`${location.pathname}?${String(p).replace(/%2C/gi, ',')}${location.hash}`);
    }

    function verdict(A, B) {
      let wa = 0, wb = 0;
      for (const r of ROWS) {
        if (!r.better) continue;
        const x = r.get(A), y = r.get(B);
        if (x == null || y == null || x === y) continue;
        ((x - y) * r.better > 0) ? wa++ : wb++;
      }
      const cheap = A.prem < B.prem ? A : B, dear = cheap === A ? B : A;
      const lead = wa === wb ? `<b>${A.team}</b> and <b>${B.team}</b> split it, ${wa} each`
        : `<b>${wa > wb ? A.team : B.team}</b> leads on ${Math.max(wa, wb)} of ${wa + wb}`;
      const vsFair = t => `${Math.abs(t.prem * 100).toFixed(1)}% ${t.prem < 0 ? 'under' : 'over'}`;
      return `${lead}. The market has <b>${cheap.team}</b> ${vsFair(cheap)} fair value and <b>${dear.team}</b> ${vsFair(dear)}.`;
    }

    function table(A, B) {
      const head = (t, al) => `<th style="text-align:${al}"><img src="/logos/sm/logo-${t.team.toLowerCase()}.webp" alt="" onerror="this.style.visibility='hidden'"><a href="/teams/${t.team}/">${t.team}</a></th>`;
      const body = ROWS.map(r => {
        if (r.grp) return `<tr class="grp"><th colspan="3">${esc(r.grp)}</th></tr>`;
        const x = r.get(A), y = r.get(B);
        const win = r.better && x != null && y != null && x !== y ? ((x - y) * r.better > 0 ? 'l' : 'r') : '';
        return `<tr><td class="l ${win === 'l' ? 'win' : ''}">${r.fmt(A)}</td>
          <th class="lbl"${r.tip ? ` title="${esc(r.tip)}"` : ''}>${esc(r.label)}</th>
          <td class="r ${win === 'r' ? 'win' : ''}">${r.fmt(B)}</td></tr>`;
      }).join('');
      return `<div class="ui-table-wrap"><table class="cmp-table">
        <thead><tr>${head(A, 'right')}<th></th>${head(B, 'left')}</tr></thead>
        <tbody>${body}</tbody></table></div>`;
    }

    function render() {
      const A = byTeam[a], B = byTeam[b];
      const opt = sel => abbrs.map(t => `<option value="${t}"${t === sel ? ' selected' : ''}>${t}</option>`).join('');
      const [ca, cb] = colours(a, b);
      el.innerHTML = `<div class="cmp" id="compare">
        <div class="cmp-hdr">
          <span class="cmp-title">Compare</span>
          <div class="cmp-pick">
            <select class="ui-select" data-side="a" aria-label="First franchise">${opt(a)}</select>
            <button data-swap title="Swap" aria-label="Swap the two teams">⇄</button>
            <select class="ui-select" data-side="b" aria-label="Second franchise">${opt(b)}</select>
          </div>
          <div class="cmp-modes">
            <button data-mode="pct" class="${mode === 'pct' ? 'active' : ''}" title="Change since opening night">% change</button>
            <button data-mode="yen" class="${mode === 'yen' ? 'active' : ''}" title="Share price">NB¥</button>
          </div>
        </div>
        <div class="cmp-legend">
          <span><i style="border-color:${ca}"></i>${a} <b>NB¥${A.mkt.toFixed(2)}</b> <b class="${cls(A.since)}">${pct(A.since)}</b></span>
          <span><i class="dash" style="border-color:${cb}"></i>${b} <b>NB¥${B.mkt.toFixed(2)}</b> <b class="${cls(B.since)}">${pct(B.since)}</b></span>
        </div>
        ${history.length >= 2 ? `<div class="cmp-chart"><canvas aria-label="${a} and ${b} share prices by day"></canvas></div>` : ''}
        <div class="cmp-verdict">${verdict(A, B)}</div>
        ${table(A, B)}
        <div class="cmp-note">◀ ▶ mark the better figure for the franchise. Price, payroll, vs fair and the ratios aren't marked: a cheap share and a dear one are both arguments.</div>
      </div>`;
      drawChart(ca, cb);
    }

    function drawChart(ca, cb) {
      const canvas = el.querySelector('canvas');
      if (chart) { chart.destroy(); chart = null; }
      if (!canvas || typeof Chart === 'undefined') return;
      const days = history.filter(d => d.teams[a] || d.teams[b]);
      const base = t => { const d = days.find(x => x.teams[t]); return d ? px(d.teams[t]) : null; };
      const ba = base(a), bb = base(b);
      const val = (d, t, b0) => !d.teams[t] ? null : mode === 'pct' ? (px(d.teams[t]) / b0 - 1) * 100 : px(d.teams[t]);
      const ds = (t, b0, c, dash) => ({
        label: t, data: days.map(d => val(d, t, b0)), borderColor: c, borderWidth: 2, borderDash: dash ? [6, 4] : [],
        tension: 0.15, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: c, spanGaps: true,
      });
      const fmtY = v => mode === 'pct' ? pct(v) : 'NB¥' + v.toFixed(2);
      chart = new Chart(canvas, {
        type: 'line',
        data: { labels: days.map(d => shortDate(d.date)), datasets: [ds(a, ba, ca, false), ds(b, bb, cb, true)] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: c => `${c.dataset.label}  ${c.raw == null ? '—' : fmtY(c.raw)}`,
                afterBody: items => {
                  const d = days[items[0].dataIndex];
                  return [a, b].flatMap(t => ((events[t] || {})[d.date] || []).map(e => `${t}: ${e}`));
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

    el.addEventListener('change', e => {
      const s = e.target.closest('[data-side]');
      if (!s) return;
      if (s.dataset.side === 'a') { if (s.value === b) b = a; a = s.value; }
      else { if (s.value === a) a = b; b = s.value; }
      saveUrl(); render();
    });
    el.addEventListener('click', e => {
      if (e.target.closest('[data-swap]')) { [a, b] = [b, a]; saveUrl(); render(); return; }
      const m = e.target.closest('[data-mode]');
      if (m && m.dataset.mode !== mode) { mode = m.dataset.mode; render(); }
    });
    window.addEventListener('resize', () => { if (chart) chart.resize(); });

    state = {
      set(team) {
        if (!byTeam[team]) return;
        if (team !== a) { if (team === b) b = a; a = team; saveUrl(); render(); }
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
