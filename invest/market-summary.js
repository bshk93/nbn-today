// Market Summary: the top five risers and fallers over a chosen window, with a
// sparkline each. Used by the hidden /invest/fair (Wall Street 2), whose prices
// are one row per day. /invest has its own per-game version (computeMovers in
// invest/index.html); this is the same look, drawn from daily rows.
//
//   MarketSummary.mount(el, {
//     title:  'Market Summary',
//     end:    '2026-10-28',                       // the day the windows end on
//     series: { ATL: [{ date: '2026-10-21', price: 152.1 }, ...] },  // oldest first
//     notes:  { ATL: { '2026-10-28': 'L by 1 v MIA' } },             // shown on the 1-day cards
//   })
//
// Colour is the market's green/red, and every move is also printed signed, so
// colour is never the only cue.
(function () {
  const WINDOWS = [
    { key: '1D', days: 1 },
    { key: '7D', days: 7, label: 'last 7 days' },
    { key: '14D', days: 14, label: 'last 14 days' },
    { key: 'Season', days: Infinity, label: 'season' },
  ];

  const css = `
  .ms { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.85rem 1.1rem; margin-bottom: 1.5rem; }
  .ms-hdr { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
  .ms-title { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .ms-title span { color: var(--text-dim); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .ms-wins { display: flex; gap: 2px; background: var(--bg-page); border-radius: var(--radius-sm); padding: 2px; }
  .ms-wins button { background: none; border: none; color: var(--text-muted); padding: 0.2rem 0.55rem; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--text-xs); font-weight: 600; }
  .ms-wins button.active { background: var(--border); color: var(--text-primary); }
  .ms-wins button:hover:not(.active) { color: var(--text-secondary); }
  .ms-row { font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; margin: 0.1rem 0 0.3rem; }
  .ms-row.up { color: var(--market-positive); }
  .ms-row.dn { color: var(--danger); margin-top: 0.55rem; }
  /* Five cards across; on a phone they keep their size and scroll sideways. */
  .ms-grid { display: grid; grid-template-columns: repeat(5, minmax(84px, 1fr)); gap: 0.35rem; overflow-x: auto; scrollbar-width: none; }
  .ms-grid::-webkit-scrollbar { display: none; }
  .ms-card { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.45rem 0.4rem; background: var(--bg-page); border-radius: var(--radius-sm); text-align: center; }
  .ms-card .logo { width: 22px; height: 22px; object-fit: contain; }
  .ms-card .abbr { font-size: var(--text-xs); font-weight: 700; }
  .ms-card .pct { font-size: var(--text-xs); font-family: var(--font-mono); font-weight: 600; }
  .ms-card .pct.up, .ms-spark.up { color: var(--market-positive); }
  .ms-card .pct.dn, .ms-spark.dn { color: var(--danger); }
  .ms-card .sub { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono); }
  .ms-card .note { font-size: var(--text-xs); color: var(--text-muted); line-height: 1.25; }
  .ms-spark { width: 100%; height: 22px; margin: 0.1rem 0; overflow: visible; }
  .ms-spark path { fill: none; stroke: currentColor; stroke-width: 1.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  `;

  function injectCss() {
    if (document.getElementById('ms-css')) return;
    const s = document.createElement('style');
    s.id = 'ms-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };

  // Each team's change from `days` rows before `end` to `end`.
  function movers(series, end, days) {
    const out = [];
    for (const [team, pts] of Object.entries(series)) {
      const upto = pts.filter(p => p.date <= end);
      if (upto.length < 2) continue;
      const last = upto[upto.length - 1];
      const first = upto[Math.max(0, upto.length - 1 - days)];
      if (!(first.price > 0)) continue;
      out.push({ team, abs: last.price - first.price, pct: (last.price / first.price - 1) * 100, from: first.date, path: upto });
    }
    out.sort((a, b) => b.pct - a.pct);
    return { risers: out.slice(0, 5), fallers: out.slice(-5).reverse(), from: out[0]?.from };
  }

  // The window's price path, at least the last ten days so a one-day move
  // still shows where it came from.
  function spark(path, days, cls) {
    const ys = path.slice(-(Math.min(Math.max(days, 10), path.length - 1) + 1)).map(p => p.price);
    if (ys.length < 2) return '';
    const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
    const d = ys.map((v, i) => `${i ? 'L' : 'M'}${(i / (ys.length - 1) * 60).toFixed(1)},${(20 - (v - lo) / span * 20).toFixed(1)}`).join('');
    return `<svg class="ms-spark ${cls}" viewBox="0 0 60 20" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function mount(el, opts) {
    injectCss();
    const series = opts.series || {};
    const notes = opts.notes || {};
    const end = opts.end;
    let win = WINDOWS[0];

    function card(m) {
      const cls = m.pct > 0 ? 'up' : m.pct < 0 ? 'dn' : '';
      const sign = m.abs > 0 ? '+' : m.abs < 0 ? '−' : '';
      const note = win.days === 1 ? ((notes[m.team] || {})[end] || []).join(' · ') : '';
      return `<div class="ms-card" title="${esc(m.team)} ${esc(shortDate(m.from))} to ${esc(shortDate(end))}">
        <img class="logo" src="/logos/sm/logo-${m.team.toLowerCase()}.webp" alt="" onerror="this.style.visibility='hidden'">
        <span class="abbr">${m.team}</span>
        ${spark(m.path, win.days, cls)}
        <span class="pct ${cls}">${m.pct > 0 ? '▲ +' : m.pct < 0 ? '▼ ' : ''}${m.pct.toFixed(1)}%</span>
        <span class="sub">${sign}¥${Math.abs(m.abs).toFixed(2)}</span>
        ${note ? `<span class="note">${esc(note)}</span>` : ''}
      </div>`;
    }

    function render() {
      if (!end) { el.innerHTML = ''; return; }
      const { risers, fallers } = movers(series, end, win.days);
      if (!risers.length) {
        el.innerHTML = `<div class="ms"><div class="ui-empty">No price history yet this season.</div></div>`;
        return;
      }
      const label = win.days === 1 ? shortDate(end) : `${win.label} to ${shortDate(end)}`;
      el.innerHTML = `<div class="ms">
        <div class="ms-hdr">
          <span class="ms-title">${esc(opts.title || 'Market Summary')} <span>(${esc(label)})</span></span>
          <div class="ms-wins">${WINDOWS.map(w => `<button data-win="${w.key}" class="${w === win ? 'active' : ''}">${w.key}</button>`).join('')}</div>
        </div>
        <div class="ms-row up">▲ Risers</div>
        <div class="ms-grid">${risers.map(card).join('')}</div>
        <div class="ms-row dn">▼ Fallers</div>
        <div class="ms-grid">${fallers.map(card).join('')}</div>
      </div>`;
    }

    el.addEventListener('click', e => {
      const b = e.target.closest('[data-win]');
      if (!b) return;
      win = WINDOWS.find(w => w.key === b.dataset.win) || win;
      render();
    });
    render();
  }

  window.MarketSummary = { mount, movers };
})();
