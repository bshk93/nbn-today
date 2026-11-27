// Market map: every franchise as a tile, sized by market cap and coloured by
// its move over a window, the way a stock market heatmap reads.
// Used by the Market tab of /finances (finances/market.js).
//
//   FinHeatmap.mount(el, {
//     teams:  [{ team: 'ATL', mcap: 4.1e9, price: 136.6 }],          // today
//     series: { ATL: [{ date: '2026-10-21', price: 152.1 }, ...] },  // oldest first
//     end:    '2026-10-28',                                          // the day windows end on
//     notes:  { ATL: { '2026-10-28': ['L by 1 v MIA'] } },           // shown on 1D tiles
//     onPick: team => {},                                            // a tile was clicked
//   })
//
// Tiles are laid out with the squarified treemap (Bruls, Huizing and van Wijk),
// so they stay close to square. Colour is the market's green/red, which is weak
// for red-green colour blindness, so every tile also prints its move signed.
(function () {
  const WINDOWS = [
    { key: '1D', days: 1, label: 'day' },
    { key: '7D', days: 7, label: 'last 7 days' },
    { key: '14D', days: 14, label: 'last 14 days' },
    { key: 'Season', days: Infinity, label: 'season' },
  ];

  const css = `
  .hm { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.85rem 1.1rem; margin-bottom: 1.5rem; }
  .hm-hdr { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
  .hm-title { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .hm-title span { color: var(--text-dim); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .hm-wins { display: flex; gap: 2px; background: var(--bg-page); border-radius: var(--radius-sm); padding: 2px; }
  .hm-wins button { background: none; border: none; color: var(--text-muted); padding: 0.2rem 0.55rem; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--text-xs); font-weight: 600; }
  .hm-wins button.active { background: var(--border); color: var(--text-primary); }
  .hm-map { position: relative; height: 380px; }
  @media (max-width: 640px) { .hm-map { height: 300px; } }
  .hm-tile { position: absolute; box-sizing: border-box; border: 1px solid var(--bg-card); border-radius: var(--radius-sm); overflow: hidden;
             display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 2px;
             background: var(--bg-page); color: var(--text-primary); cursor: pointer; text-align: center; line-height: 1.15; }
  .hm-tile:hover { outline: 2px solid var(--text-muted); outline-offset: -2px; z-index: 1; }
  .hm-tile .t { font-family: var(--font-display, inherit); font-weight: 700; letter-spacing: 0.02em; }
  .hm-tile .p { font-family: var(--font-mono); font-weight: 600; font-size: var(--text-xs); }
  .hm-tile .s { font-size: var(--text-xs); color: var(--text-secondary); font-family: var(--font-mono); }
  .hm-tile .n { font-size: var(--text-xs); color: var(--text-secondary); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
  .hm-key { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.5rem; font-size: var(--text-xs); color: var(--text-muted); }
  .hm-scale { display: flex; align-items: center; gap: 2px; font-family: var(--font-mono); }
  .hm-scale i { display: block; width: 1.4rem; height: 8px; border-radius: var(--radius-sm); }
  `;

  function injectCss() {
    if (document.getElementById('hm-css')) return;
    const s = document.createElement('style');
    s.id = 'hm-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const esc = NBN.esc;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };
  const fmt = (p, dp = 1) => (p > 0 ? '▲ +' : p < 0 ? '▼ ' : '') + p.toFixed(dp) + '%';
  const bn = v => 'NB¥' + (v / 1e9).toFixed(2) + 'B';

  // Same tint as the daily moves: strength by size against the window's
  // biggest move, so a quiet window still shows its shape.
  function tint(p, scale) {
    if (!p) return '';
    const a = Math.min(1, Math.abs(p) / scale);
    const c = p > 0 ? 'var(--market-positive)' : 'var(--danger)';
    return `background: color-mix(in srgb, ${c} ${Math.round(10 + a * 50)}%, var(--bg-page))`;
  }

  // Squarified treemap. items are sorted biggest first, each with .v; returns
  // them with x, y, w, h filling the w × h box.
  function squarify(items, w, h) {
    const total = items.reduce((s, i) => s + i.v, 0);
    const k = w * h / total;
    const rest = items.map(i => ({ ...i, a: i.v * k }));
    const out = [];
    let box = { x: 0, y: 0, w, h }, row = [];
    const worst = (r, side) => {
      const s = r.reduce((t, i) => t + i.a, 0);
      const hi = Math.max(...r.map(i => i.a)), lo = Math.min(...r.map(i => i.a));
      return Math.max(side * side * hi / (s * s), (s * s) / (side * side * lo));
    };
    const lay = r => {
      const s = r.reduce((t, i) => t + i.a, 0);
      if (box.w >= box.h) {
        const cw = s / box.h;
        let y = box.y;
        for (const i of r) { const ih = i.a / cw; out.push({ ...i, x: box.x, y, w: cw, h: ih }); y += ih; }
        box = { x: box.x + cw, y: box.y, w: box.w - cw, h: box.h };
      } else {
        const rh = s / box.w;
        let x = box.x;
        for (const i of r) { const iw = i.a / rh; out.push({ ...i, x, y: box.y, w: iw, h: rh }); x += iw; }
        box = { x: box.x, y: box.y + rh, w: box.w, h: box.h - rh };
      }
    };
    while (rest.length) {
      const side = Math.min(box.w, box.h);
      if (!row.length || worst([...row, rest[0]], side) <= worst(row, side)) row.push(rest.shift());
      else { lay(row); row = []; }
    }
    if (row.length) lay(row);
    return out;
  }

  // Each team's change over the window ending on `end`.
  function changes(series, end, days) {
    const out = {};
    let from = null;
    for (const [team, pts] of Object.entries(series)) {
      const upto = pts.filter(p => p.date <= end);
      if (upto.length < 2) continue;
      const first = upto[Math.max(0, upto.length - 1 - days)], last = upto[upto.length - 1];
      if (!(first.price > 0)) continue;
      out[team] = (last.price / first.price - 1) * 100;
      if (!from || first.date < from) from = first.date;
    }
    return { pct: out, from };
  }

  function mount(el, opts) {
    injectCss();
    const teams = (opts.teams || []).filter(t => t.mcap > 0);
    const series = opts.series || {};
    const notes = opts.notes || {};
    const end = opts.end;
    let win = WINDOWS[0];

    function tiles(map) {
      const W = map.clientWidth, H = map.clientHeight;
      if (!W || !H) return '';
      const { pct, from } = changes(series, end, win.days);
      const vals = Object.values(pct);
      const scale = Math.max(0.5, ...vals.map(Math.abs));
      const items = [...teams].sort((a, b) => b.mcap - a.mcap).map(t => ({ ...t, v: t.mcap }));
      const span = win.days === 1 ? shortDate(end) : `${win.label}, ${shortDate(from || end)} to ${shortDate(end)}`;
      return squarify(items, W, H).map(r => {
        const p = pct[r.team];
        const big = r.w > 90 && r.h > 70, mid = r.w > 46 && r.h > 38;
        const size = Math.max(11, Math.min(26, Math.sqrt(r.w * r.h) / 5));
        const note = win.days === 1 ? ((notes[r.team] || {})[end] || []).join(' · ') : '';
        const tip = `${r.team} · NB¥${r.price.toFixed(2)} · ${p == null ? 'no change' : fmt(p, 2)} (${span}) · market cap ${bn(r.mcap)}${note ? ' · ' + note : ''}`;
        return `<div class="hm-tile" data-team="${r.team}" role="button" tabindex="0" title="${esc(tip)}" aria-label="${esc(tip)}"
            style="left:${r.x.toFixed(1)}px;top:${r.y.toFixed(1)}px;width:${r.w.toFixed(1)}px;height:${r.h.toFixed(1)}px;${p == null ? '' : tint(p, scale)}">
          <span class="t" style="font-size:${size.toFixed(0)}px">${r.team}</span>
          ${mid && p != null ? `<span class="p">${fmt(p)}</span>` : ''}
          ${big ? `<span class="s">NB¥${r.price.toFixed(2)}</span>` : ''}
          ${big && note ? `<span class="n">${esc(note)}</span>` : ''}
        </div>`;
      }).join('') + `<span hidden data-scale="${scale.toFixed(1)}"></span>`;
    }

    function render() {
      if (!end || !teams.length) { el.innerHTML = ''; return; }
      const label = win.days === 1 ? shortDate(end) : `${win.label} to ${shortDate(end)}`;
      el.innerHTML = `<div class="hm">
        <div class="hm-hdr">
          <span class="hm-title">Market map <span>(${esc(label)})</span></span>
          <div class="hm-wins">${WINDOWS.map(w => `<button data-win="${w.key}" class="${w === win ? 'active' : ''}">${w.key}</button>`).join('')}</div>
        </div>
        <div class="hm-map"></div>
        <div class="hm-key"><span>Size is market cap. Click a team to open it.</span><span class="hm-scale"></span></div>
      </div>`;
      draw();
    }

    function draw() {
      const map = el.querySelector('.hm-map');
      if (!map) return;
      map.innerHTML = tiles(map);
      const s = map.querySelector('[data-scale]');
      // The key: five steps of the same tint the tiles use, biggest fall to biggest rise.
      const k = s ? Number(s.dataset.scale) : 0;
      el.querySelector('.hm-scale').innerHTML = s ? `−${s.dataset.scale}% ${[-1, -0.5, 0, 0.5, 1].map(f => `<i style="${tint(f * k, k) || 'background: var(--bg-page)'}"></i>`).join('')} +${s.dataset.scale}%` : '';
    }

    el.addEventListener('click', e => {
      const b = e.target.closest('[data-win]');
      if (b) { win = WINDOWS.find(w => w.key === b.dataset.win) || win; render(); return; }
      const t = e.target.closest('.hm-tile');
      if (t && opts.onPick) opts.onPick(t.dataset.team);
    });
    el.addEventListener('keydown', e => {
      const t = e.target.closest('.hm-tile');
      if (t && (e.key === 'Enter' || e.key === ' ') && opts.onPick) { e.preventDefault(); opts.onPick(t.dataset.team); }
    });
    // The layout depends on the box, and the box is 0 wide while the tab is hidden.
    let w = 0;
    new ResizeObserver(() => {
      const map = el.querySelector('.hm-map');
      if (map && map.clientWidth !== w) { w = map.clientWidth; draw(); }
    }).observe(el);
    render();
  }

  window.FinHeatmap = { mount, squarify };
})();
