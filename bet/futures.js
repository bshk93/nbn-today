// Futures markets on /bet — the Futures tab.
//
// A share of an outcome pays NB¥100 if it happens, so its price reads as a
// percentage. Nobody sets prices: the API's market maker (LMSR, in
// nbn-api/routers/markets.py) moves them as members buy and sell. This file
// does no pricing math of its own — every number shown before a trade is a
// POST /api/markets/{id}/quote, the same function the trade runs.
//
// Mounted by bet/index.html: Futures.render(container, ctx), where ctx is
// { token, user(), isBookie(), refreshBalance(), balance() }.
(function () {
  const FUT_CSS = `
    .fut-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    .fut-card.done { background: var(--bg-subtle); border-color: var(--border-dark); }
    .fut-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.3rem; }
    .fut-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
    .fut-meta { font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.6rem; }
    .fut-desc { font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.6rem; }
    .fut-explain { font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.8rem; }
    .fut-mine { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.6rem; }
    .fut-mine strong { color: var(--gold); }
    .fut-table td.price { font-weight: 700; color: var(--text-primary); }
    .fut-table td.up { color: var(--market-positive); }
    .fut-table td.down { color: var(--danger); }
    .fut-table tr.sel td { background: var(--bg-subtle); }
    .fut-table tr.win td { color: var(--gold); font-weight: 700; }
    .fut-table tbody tr { cursor: pointer; }
    .fut-bar { display: inline-block; height: 6px; border-radius: 3px; background: var(--market-positive); vertical-align: middle; margin-left: 0.4rem; opacity: 0.7; }
    .fut-trade { display: flex; flex-direction: column; gap: 0.5rem; background: var(--bg-page); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 0.9rem; margin: 0.8rem 0 0.5rem; }
    .fut-trade-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .fut-trade-row .ui-input { width: 8rem; }
    .fut-quote { font-size: 0.78rem; color: var(--text-secondary); min-height: 1.1em; }
    .fut-quote strong { color: var(--text-primary); }
    .fut-err { font-size: 0.75rem; color: var(--danger); }
    .fut-admin { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--border); }
    .fut-house { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; }
    .fut-trades { margin-top: 0.6rem; font-size: 0.78rem; }
    .fut-trades summary { cursor: pointer; color: var(--text-muted); }
    .fut-trades td.up { color: var(--market-positive); }
    .fut-trades td.holds { white-space: normal; min-width: 9rem; color: var(--text-muted); }
    @media (max-width: 520px) { .fut-trades .narrow-hide { display: none; } }
    .fut-trades td.down { color: var(--danger); }
    .fut-form { display: flex; flex-direction: column; gap: 0.55rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    .fut-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.55rem; }
    /* Price chart. Three highlighted series in the dataviz reference palette's
       first three slots — the only ones that stay distinct as every pair
       (lines cross), validated against the default dark surface, the tinted
       team surfaces and white. Dark steps by default; light steps on the two
       light themes. Everything else is a grey context line. */
    .fut-chart { --s1: #3987e5; --s2: #d95926; --s3: #199e70; position: relative; margin: 0.2rem 0 0.8rem; }
    :root[data-theme="nbn-today-light"] .fut-chart, :root[data-theme="lavender-rose"] .fut-chart { --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; }
    .fut-chart svg { display: block; width: 100%; overflow: visible; touch-action: pan-y; }
    .fut-chart svg:focus { outline: none; }
    .fut-chart svg:focus-visible { outline: 1px solid var(--border); outline-offset: 2px; }
    .fut-legend { display: flex; flex-wrap: wrap; gap: 0.25rem 0.9rem; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.3rem; align-items: center; }
    .fut-legend .key { display: inline-block; width: 14px; height: 2px; border-radius: 1px; vertical-align: middle; margin-right: 0.35rem; }
    .fut-legend .note { color: var(--text-muted); }
    .fut-legend strong { color: var(--text-primary); font-weight: 600; }
    .fut-tip { position: absolute; top: 0; pointer-events: none; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
      padding: 0.4rem 0.55rem; font-size: 0.72rem; color: var(--text-secondary); white-space: nowrap; box-shadow: 0 2px 8px var(--shadow-color, rgba(0,0,0,.3)); display: none; z-index: 2; }
    .fut-tip .when { color: var(--text-muted); margin-bottom: 0.2rem; }
    .fut-tip .row { display: flex; align-items: center; gap: 0.4rem; }
    .fut-tip .row b { color: var(--text-primary); font-weight: 600; margin-left: auto; padding-left: 0.8rem; font-variant-numeric: tabular-nums; }
    .fut-tip .trade { color: var(--text-muted); margin-top: 0.25rem; border-top: 1px solid var(--border); padding-top: 0.25rem; }
    .fut-form .hint { font-size: 0.72rem; color: var(--text-muted); }
  `;
  let cssDone = false;
  let ctx = null;
  let root = null;
  let markets = [];
  let showForm = false;
  const histCache = {};       // market id → { count, h } — refetched when trade_count moves
  const slotOf = {};          // market id → { outcome id → 0|1|2 }, so a colour follows its outcome
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (root && root.isConnected && markets.length) draw(); }, 200);
  });
  const selected = {};        // market id → outcome id
  const side = {};            // market id → 'buy' | 'sell'
  const contract = {};        // market id → 'yes' | 'no'

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nby = (n, d = 0) => 'NB¥' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  // A share pays NB¥100, so its price in NB¥ is also its odds in percent.
  const px = p => 'NB¥' + (Math.round(p * 100) / 100).toFixed(2);
  const when = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const teamName = abbr => (typeof TEAM_LIST !== 'undefined' && TEAM_LIST[abbr]) || abbr;

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
    const res = await fetch(path, { ...opts, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    return body;
  }

  async function render(container, context) {
    ctx = context;
    root = container;
    if (!cssDone) {
      const st = document.createElement('style');
      st.textContent = FUT_CSS;
      document.head.appendChild(st);
      cssDone = true;
    }
    root.innerHTML = '<span class="loading">Loading…</span>';
    try { markets = await api('/api/markets'); }
    catch (e) { root.innerHTML = `<div class="empty-state">Couldn't load markets: ${esc(e.message)}</div>`; return; }
    draw();
  }

  function draw() {
    root.innerHTML = '';
    if (ctx.isBookie()) {
      const btn = document.createElement('button');
      btn.className = 'ui-btn ui-btn--sm';
      btn.textContent = showForm ? 'Cancel new market' : '+ New market';
      btn.style.marginBottom = '0.8rem';
      btn.onclick = () => { showForm = !showForm; draw(); };
      root.appendChild(btn);
      if (showForm) root.appendChild(newMarketForm());
    }
    const live = markets.filter(m => m.status === 'open' || m.status === 'locked');
    const done = markets.filter(m => m.status === 'settled' || m.status === 'voided');
    if (!markets.length) {
      root.insertAdjacentHTML('beforeend', '<div class="empty-state">No futures markets yet.</div>');
      return;
    }
    if (!live.length) root.insertAdjacentHTML('beforeend', '<div class="empty-state">No markets trading right now.</div>');
    live.forEach(m => root.appendChild(card(m)));
    done.forEach(m => root.appendChild(card(m)));
  }

  function replace(m) {
    const i = markets.findIndex(x => x.id === m.id);
    if (i !== -1) markets[i] = m;
  }

  // ── A market ───────────────────────────────────────────────────────────────

  function card(m) {
    const me = ctx.user()?.name;
    const done = m.status === 'settled' || m.status === 'voided';
    const el = document.createElement('div');
    el.className = 'fut-card' + (done ? ' done' : '');

    const badge = m.status === 'voided' ? ['Voided', 'ui-badge--warning']
      : m.status === 'settled' ? ['Settled', '']
      : m.trading ? ['Trading', 'ui-badge--success']
      : m.status === 'locked' ? ['Locked', 'ui-badge--accent'] : ['Closed', 'ui-badge--accent'];
    const meta = [`Opened by ${esc(m.created_by)} · ${when(m.created_at)}`];
    if (m.closes_at && !done) meta.push(`${m.trading ? 'Closes' : 'Closed'} ${when(m.closes_at)}`);
    if (done && m.settled_at) meta.push(`${m.status === 'voided' ? 'Voided' : 'Settled'} ${when(m.settled_at)}`);
    meta.push(`${m.trade_count} trade${m.trade_count === 1 ? '' : 's'}`);
    el.innerHTML = `
      <div class="fut-head"><div class="fut-title">📈 ${esc(m.title)}</div>
        <span class="ui-badge ${badge[1]}">${badge[0]}</span></div>
      <div class="fut-meta">${meta.join(' · ')}</div>
      ${m.description ? `<div class="fut-desc">${esc(m.description)}</div>` : ''}
      ${done ? '' : `<div class="fut-explain">A <strong>Yes</strong> share pays <strong>${nby(m.payout)}</strong> if its outcome happens, and a <strong>No</strong> share pays ${nby(m.payout)} if it doesn't.
        A Yes price is also the market's odds: NB¥23 means 23%. Buying Yes pushes it up, buying No pushes it down. Sell any time before the market closes.
        You can't bet No on a team you work for. ${Math.round(m.fee * 100)}% fee on each trade.${m.max_stake != null ? ` Up to ${nby(m.max_stake)} in per member, net of sales.` : ''}</div>`}`;

    const pos = (me && m.positions[me]) || {};
    const acct = (me && m.accounts[me]) || null;
    if (acct) {
      const { value, net, paid } = standing(m, me);
      const line = document.createElement('div');
      line.className = 'fut-mine';
      line.innerHTML = done
        ? `You put in ${nby(net, 2)} net${paid ? ` and were paid <strong>${nby(paid, 2)}</strong>` : ''}.`
        : `Your shares are worth about <strong>${nby(value, 2)}</strong> at current prices. You've put in ${nby(net, 2)} net.`;
      el.appendChild(line);
    }

    el.appendChild(priceChart(m));
    el.appendChild(table(m, pos, done));
    if (m.trading && ctx.user()) el.appendChild(tradePanel(m, pos));
    else if (m.trading) el.insertAdjacentHTML('beforeend', '<div class="fut-meta" style="margin-top:0.6rem">Sign in to trade.</div>');

    el.appendChild(houseLine(m));
    el.appendChild(leaderboard(m));
    el.appendChild(tradesLog(m));
    if (ctx.isBookie() && !done) el.appendChild(adminBar(m));
    return el;
  }

  function table(m, pos, done) {
    const rows = m.outcomes.map((o, i) => ({ ...o, open: m.open_prices[i] }))
      .sort((a, b) => (b.id === m.winner) - (a.id === m.winner) || b.price - a.price);
    const maxP = Math.max(...rows.map(r => r.price));
    const wrap = document.createElement('div');
    wrap.className = 'ui-table-wrap';
    const t = document.createElement('table');
    t.className = 'ui-table ui-table--dense fut-table';
    t.innerHTML = `<thead><tr><th>Outcome</th><th class="num">Price</th><th class="num">Since open</th>
      <th class="num">You hold</th></tr></thead>`;
    const tb = t.createTBody();
    rows.forEach(r => {
      const tr = tb.insertRow();
      if (selected[m.id] === r.id) tr.className = 'sel';
      if (m.status === 'settled' && m.winner === r.id) tr.className = 'win';
      const chg = r.price - r.open;
      const h = pos[r.id] || {};
      const held = [h.yes ? `${h.yes.toFixed(2)} Yes` : '', h.no ? `${h.no.toFixed(2)} No` : ''].filter(Boolean).join(', ');
      tr.innerHTML = `
        <td>${m.status === 'settled' && m.winner === r.id ? '🏆 ' : ''}${esc(r.label)}</td>
        <td class="num price">${px(r.price)}<span class="fut-bar" style="width:${Math.max(2, r.price / maxP * 48)}px"></span></td>
        <td class="num ${Math.abs(chg) < 0.05 ? '' : chg > 0 ? 'up' : 'down'}">${Math.abs(chg) < 0.05 ? '—' : (chg > 0 ? '▲ ' : '▼ ') + Math.abs(chg).toFixed(2)}</td>
        <td class="num">${held}</td>`;
      if (!done) tr.onclick = () => { selected[m.id] = r.id; draw(); };
    });
    wrap.appendChild(t);
    return wrap;
  }

  // ── Price chart ────────────────────────────────────────────────────────────
  // Each outcome's price after every trade (GET /api/markets/{id}/history),
  // drawn as steps since a price holds until the next trade. Three outcomes
  // are highlighted — the winner once settled, else the one selected in the
  // table or trade panel, then the current favourites — and the rest are grey
  // context you can click. The table below is the full, exact view.

  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  };

  function priceChart(m) {
    const wrap = document.createElement('div');
    wrap.className = 'fut-chart';
    const cached = histCache[m.id];
    if (cached && cached.count === m.trade_count) {
      requestAnimationFrame(() => renderChart(wrap, m, cached.h));
    } else {
      wrap.innerHTML = '<div class="fut-meta">Loading price history…</div>';
      api(`/api/markets/${m.id}/history`).then(h => {
        histCache[m.id] = { count: m.trade_count, h };
        renderChart(wrap, m, h);
      }).catch(() => { wrap.innerHTML = ''; });
    }
    return wrap;
  }

  function highlights(m) {
    const byPrice = [...m.outcomes].sort((a, b) => b.price - a.price).map(o => o.id);
    const lead = m.status === 'settled' ? m.winner : selected[m.id];
    const ids = [...new Set([lead, ...byPrice].filter(Boolean))].slice(0, 3);
    // Keep each survivor's colour; newcomers take the free slots.
    const prev = slotOf[m.id] || {};
    const next = {};
    ids.filter(id => id in prev).forEach(id => { next[id] = prev[id]; });
    const free = [0, 1, 2].filter(sl => !Object.values(next).includes(sl));
    ids.filter(id => !(id in next)).forEach(id => { next[id] = free.shift(); });
    slotOf[m.id] = next;
    return ids;
  }

  function renderChart(wrap, m, h) {
    const W = wrap.clientWidth;
    if (!W) return;
    wrap.innerHTML = '';
    const pts = h.prices;
    if (!pts.length) return;
    const idx = Object.fromEntries(m.outcomes.map((o, i) => [o.id, i]));
    const byId = Object.fromEntries(m.outcomes.map(o => [o.id, o]));
    const hi = highlights(m);
    const colour = id => `var(--s${slotOf[m.id][id] + 1})`;
    const short = o => o.team || (o.label.length > 12 ? o.label.slice(0, 11) + '…' : o.label);

    // Legend: always present, since identity can't rest on colour.
    const others = m.outcomes.length - hi.length;
    const legend = document.createElement('div');
    legend.className = 'fut-legend';
    legend.innerHTML = hi.map(id => `<span><span class="key" style="background:${colour(id)}"></span>${esc(byId[id].label)} <strong>${px(byId[id].price)}</strong></span>`).join('')
      + (others ? `<span class="note">Grey: the other ${others}. Click a line or a row to highlight it.</span>` : '');
    wrap.appendChild(legend);

    // Right margin fits the longest end label (11px text, ~6.5px a character).
    const lastP = pts[pts.length - 1].p;
    const endText = id => `${short(byId[id])} ${px(lastP[idx[id]])}`;
    const H = 200, mt = 8, mb = 22, ml = 42;
    const mr = 16 + Math.ceil(Math.max(...hi.map(id => endText(id).length)) * 6.5);
    const pw = Math.max(40, W - ml - mr), ph = H - mt - mb;
    const t0 = Date.parse(m.created_at);
    const end = m.settled_at || (m.closes_at && m.closes_at < new Date().toISOString() ? m.closes_at : null);
    const t1 = Math.max(end ? Date.parse(end) : Date.now(), Date.parse(pts[pts.length - 1].ts), t0 + 60000);
    const X = t => ml + (Date.parse(t) - t0) / (t1 - t0) * pw;
    const top = Math.max(...pts.flatMap(r => r.p));
    const step = [5, 10, 20, 25, 50].find(s => top * 1.08 <= s * 4) || 25;
    const yMax = Math.min(100, Math.ceil(top * 1.08 / step) * step);
    const Y = v => mt + ph - v / yMax * ph;

    const svg = svgEl('svg', { height: H, viewBox: `0 0 ${W} ${H}`, tabindex: 0, role: 'img',
      'aria-label': `Price history of ${m.title}. ${hi.map(id => `${byId[id].label} ${px(byId[id].price)}`).join(', ')}. Use the arrow keys to step through trades.` });

    // Gridlines and axes: hairline, recessive.
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      svg.appendChild(svgEl('line', { x1: ml, x2: ml + pw, y1: Y(v), y2: Y(v), stroke: 'var(--border)', 'stroke-width': 1 }));
      const t = svgEl('text', { x: ml - 6, y: Y(v) + 3.5, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--text-muted)' });
      t.textContent = 'NB¥' + v;
      svg.appendChild(t);
    }
    const spanDays = (t1 - t0) / 86400000;
    const fmtT = ms => spanDays < 2
      ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const nTicks = pw < 260 ? 2 : 4;
    for (let k = 0; k <= nTicks; k++) {
      const ms = t0 + (t1 - t0) * k / nTicks;
      const t = svgEl('text', { x: ml + pw * k / nTicks, y: H - 6, 'font-size': 10, fill: 'var(--text-muted)',
        'text-anchor': k === 0 ? 'start' : k === nTicks ? 'end' : 'middle' });
      t.textContent = fmtT(ms);
      svg.appendChild(t);
    }

    // A step path for one outcome, held flat to the end of the window.
    const path = i => {
      let d = `M${X(pts[0].ts).toFixed(1)},${Y(pts[0].p[i]).toFixed(1)}`;
      for (let k = 1; k < pts.length; k++) d += `H${X(pts[k].ts).toFixed(1)}V${Y(pts[k].p[i]).toFixed(1)}`;
      return d + `H${(ml + pw).toFixed(1)}`;
    };

    const done = m.status === 'settled' || m.status === 'voided';
    m.outcomes.forEach((o, i) => {
      if (hi.includes(o.id)) return;
      const d = path(i);
      svg.appendChild(svgEl('path', { d, fill: 'none', stroke: 'var(--text-dim)', 'stroke-width': 1, opacity: 0.45 }));
      if (!done) {
        const hit = svgEl('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 10, style: 'cursor:pointer' });
        const tl = svgEl('title'); tl.textContent = `${o.label} — ${px(o.price)}`; hit.appendChild(tl);
        hit.addEventListener('click', () => { selected[m.id] = o.id; draw(); });
        svg.appendChild(hit);
      }
    });
    // Highlighted lines on top, 2px, with a ringed end-dot.
    hi.forEach(id => {
      svg.appendChild(svgEl('path', { d: path(idx[id]), fill: 'none', stroke: colour(id), 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });
    hi.forEach(id => {
      svg.appendChild(svgEl('circle', { cx: ml + pw, cy: Y(lastP[idx[id]]), r: 4, fill: colour(id),
        stroke: 'var(--bg-card)', 'stroke-width': 2 }));
    });
    // End labels in text ink, nudged apart so they never stack.
    const labels = hi.map(id => ({ id, y: Y(lastP[idx[id]]) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 13);
    const over = labels.length ? labels[labels.length - 1].y - (mt + ph) : 0;
    if (over > 0) labels.forEach(l => { l.y -= over; });
    labels.forEach(l => {
      const t = svgEl('text', { x: ml + pw + 9, y: l.y + 3.5, 'font-size': 11, fill: 'var(--text-secondary)' });
      t.textContent = endText(l.id);
      svg.appendChild(t);
    });

    // Crosshair: snaps to the nearest trade; one readout lists every highlighted line.
    const cross = svgEl('line', { y1: mt, y2: mt + ph, stroke: 'var(--text-muted)', 'stroke-width': 1, visibility: 'hidden' });
    svg.appendChild(cross);
    const dots = hi.map(id => {
      const c = svgEl('circle', { r: 4, fill: colour(id), stroke: 'var(--bg-card)', 'stroke-width': 2, visibility: 'hidden' });
      svg.appendChild(c);
      return c;
    });
    const tip = document.createElement('div');
    tip.className = 'fut-tip';
    const label = Object.fromEntries(m.outcomes.map(o => [o.id, o.label]));
    let at = -1;
    function show(k) {
      at = Math.max(0, Math.min(pts.length - 1, k));
      const x = X(pts[at].ts);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      hi.forEach((id, j) => { dots[j].setAttribute('cx', x); dots[j].setAttribute('cy', Y(pts[at].p[idx[id]])); dots[j].setAttribute('visibility', 'visible'); });
      const tr = at > 0 ? h.trades[at - 1] : null;
      const when = new Date(pts[at].ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      tip.innerHTML = `<div class="when">${at === 0 ? 'Opened' : when}</div>`
        + hi.map(id => ({ id, v: pts[at].p[idx[id]] })).sort((a, b) => b.v - a.v)
          .map(r => `<div class="row"><span class="key" style="display:inline-block;width:10px;height:2px;background:${colour(r.id)}"></span>${esc(byId[r.id].label)}<b>${px(r.v)}</b></div>`).join('')
        + (tr ? `<div class="trade">${esc(tr.member)} ${tr.side === 'buy' ? 'bought' : 'sold'} ${tr.shares.toFixed(1)} ${tr.contract === 'no' ? 'No on ' : ''}${esc(label[tr.outcome_id] || '?')}</div>` : '');
      tip.style.display = 'block';
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(W - tw, x + 12 + tw > W ? x - tw - 12 : x + 12)) + 'px';
      tip.style.top = (legend.offsetHeight + 4) + 'px';
    }
    function hide() {
      at = -1;
      cross.setAttribute('visibility', 'hidden');
      dots.forEach(d => d.setAttribute('visibility', 'hidden'));
      tip.style.display = 'none';
    }
    const nearest = clientX => {
      const r = svg.getBoundingClientRect();
      const x = (clientX - r.left) * (W / r.width);
      let best = 0;
      pts.forEach((p, k) => { if (Math.abs(X(p.ts) - x) < Math.abs(X(pts[best].ts) - x)) best = k; });
      return best;
    };
    const zone = svgEl('rect', { x: ml, y: mt, width: pw, height: ph, fill: 'transparent', 'pointer-events': 'none' });
    svg.insertBefore(zone, svg.firstChild);
    svg.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const x = (e.clientX - r.left) * (W / r.width);
      if (x < ml - 4 || x > ml + pw + 4) return hide();
      show(nearest(e.clientX));
    });
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        show(at < 0 ? pts.length - 1 : at + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === 'Escape') hide();
    });
    svg.addEventListener('blur', hide);

    wrap.appendChild(svg);
    wrap.appendChild(tip);
  }

  // ── Buying and selling ─────────────────────────────────────────────────────

  function tradePanel(m, pos) {
    const box = document.createElement('div');
    box.className = 'fut-trade';
    if (!selected[m.id]) selected[m.id] = [...m.outcomes].sort((a, b) => b.price - a.price)[0].id;
    const s = side[m.id] || 'buy';
    const ct = contract[m.id] || 'yes';
    const oid = selected[m.id];
    const held = (pos[oid] || {})[ct] || 0;

    const opts = [...m.outcomes].sort((a, b) => a.label.localeCompare(b.label))
      .map(o => `<option value="${o.id}" ${o.id === oid ? 'selected' : ''}>${esc(o.label)} — ${px(o.price)}</option>`).join('');
    box.innerHTML = `
      <div class="fut-trade-row">
        <div class="ui-segmented">
          <button class="${s === 'buy' ? 'active' : ''}" data-side="buy">Buy</button>
          <button class="${s === 'sell' ? 'active' : ''}" data-side="sell">Sell</button>
        </div>
        <div class="ui-segmented">
          <button class="${ct === 'yes' ? 'active' : ''}" data-ct="yes">Yes</button>
          <button class="${ct === 'no' ? 'active' : ''}" data-ct="no">No</button>
        </div>
        <select class="ui-select fut-oid">${opts}</select>
      </div>
      <div class="fut-trade-row">
        <input class="ui-input fut-amt" type="number" min="0" step="${s === 'buy' ? '1' : '0.01'}"
          placeholder="${s === 'buy' ? 'NB¥ to spend' : 'Shares to sell'}">
        ${s === 'sell' ? `<button class="ui-btn ui-btn--sm ui-btn--ghost fut-all" ${held ? '' : 'disabled'}>All (${held.toFixed(2)})</button>` : ''}
        <button class="ui-btn ui-btn--primary ui-btn--sm fut-go" disabled>${s === 'buy' ? 'Buy' : 'Sell'}</button>
      </div>
      <div class="fut-quote"></div>
      <div class="fut-err"></div>`;

    const amt = box.querySelector('.fut-amt');
    const go = box.querySelector('.fut-go');
    const qEl = box.querySelector('.fut-quote');
    const err = box.querySelector('.fut-err');
    let quote = null;
    let timer = null;

    box.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { side[m.id] = b.dataset.side; draw(); });
    box.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { contract[m.id] = b.dataset.ct; draw(); });
    box.querySelector('.fut-oid').onchange = e => { selected[m.id] = e.target.value; draw(); };
    const allBtn = box.querySelector('.fut-all');
    if (allBtn) allBtn.onclick = () => { amt.value = held.toFixed(4); requote(); };

    async function requote() {
      quote = null;
      go.disabled = true;
      err.textContent = '';
      const v = parseFloat(amt.value);
      if (!(v > 0)) { qEl.textContent = ''; return; }
      if (s === 'sell' && v > held + 1e-6) { qEl.textContent = ''; err.textContent = `You hold ${held.toFixed(2)} ${ct === 'yes' ? 'Yes' : 'No'} shares.`; return; }
      try {
        const q = await api(`/api/markets/${m.id}/quote`, {
          method: 'POST',
          body: JSON.stringify({ outcome_id: oid, side: s, contract: ct, [s === 'buy' ? 'spend' : 'shares']: v }),
        });
        if (parseFloat(amt.value) !== v) return;   // typed on since
        quote = q;
        qEl.innerHTML = s === 'buy'
          ? `<strong>${q.shares.toFixed(2)} ${ct === 'yes' ? 'Yes' : 'No'} shares</strong> at ${px(q.avg_price)} each · price ${px(q.price_before)} → ${px(q.price_after)}
             · ${nby(q.cost, 2)} + ${nby(q.fee, 2)} fee = <strong>${nby(q.total, 2)}</strong> · pays <strong>${nby(q.pays_if_right, 2)}</strong> if it ${ct === 'yes' ? 'happens' : "doesn't happen"}`
          : `Get <strong>${nby(q.total, 2)}</strong> (${nby(q.proceeds, 2)} − ${nby(q.fee, 2)} fee) · ${px(q.avg_price)} a share
             · price ${px(q.price_before)} → ${px(q.price_after)}`;
        go.disabled = false;
      } catch (e) { qEl.textContent = ''; err.textContent = e.message; }
    }
    amt.oninput = () => { clearTimeout(timer); timer = setTimeout(requote, 250); };

    go.onclick = async () => {
      if (!quote) return;
      go.disabled = true;
      err.textContent = '';
      try {
        const body = s === 'buy'
          ? { outcome_id: oid, contract: ct, spend: quote.cost, min_shares: quote.shares - 1e-4 }
          : { outcome_id: oid, contract: ct, shares: parseFloat(amt.value), min_proceeds: quote.total - 0.01 };
        const r = await api(`/api/markets/${m.id}/${s}`, { method: 'POST', body: JSON.stringify(body) });
        replace(r.market);
        await ctx.refreshBalance();
        draw();
      } catch (e) {
        // Requote first (the price may have moved), then show why it failed —
        // requote clears the error line.
        await requote();
        err.textContent = e.message;
      }
    };
    return box;
  }

  // ── What it did to the money supply ────────────────────────────────────────

  function houseLine(m) {
    const el = document.createElement('div');
    el.className = 'fut-house';
    const h = m.house;
    if (m.status === 'settled') {
      el.textContent = h.net <= 0
        ? `This market created ${nby(-h.net)} (paid out ${nby(h.paid_out)}, ${nby(h.fees_burned)} in fees burned).`
        : `This market took ${nby(h.net)} out of circulation (paid out ${nby(h.paid_out)}, ${nby(h.fees_burned)} in fees burned).`;
    } else if (m.status === 'voided') {
      el.textContent = `Voided. ${nby(h.refunded, 2)} refunded.`;
    } else {
      el.textContent = `The most this market can create is ${nby(m.max_mint)}, if the longest shot at opening wins and the market saw it coming. `
        + `${nby(h.fees_burned, 2)} in fees burned so far.`;
    }
    return el;
  }

  // One member's standing in a market. Open: shares valued at current prices
  // (what they'd be worth if the market ended at today's odds, not what
  // selling them all at once would fetch, since a big sale moves the price).
  // Settled: what they were paid. Voided: refunded in full, so no profit.
  function standing(m, member) {
    const pos = m.positions[member] || {};
    const acct = m.accounts[member] || { spent: 0, received: 0 };
    const priceOf = Object.fromEntries(m.outcomes.map(o => [o.id, o.price]));
    const net = acct.spent - acct.received;
    const open = m.status === 'open' || m.status === 'locked';
    const value = !open ? 0 : Object.entries(pos).reduce((s, [oid, h]) =>
      s + (h.yes || 0) * priceOf[oid] + (h.no || 0) * (m.payout - priceOf[oid]), 0);
    const paid = m.status !== 'settled' ? 0 : Object.entries(pos).reduce((s, [oid, h]) =>
      s + (oid === m.winner ? (h.yes || 0) : (h.no || 0)) * m.payout, 0);
    const pl = m.status === 'voided' ? 0 : value + paid - net;
    return { pos, net, value, paid, pl };
  }

  function leaderboard(m) {
    const names = Object.keys(m.accounts);
    const d = document.createElement('details');
    d.className = 'fut-trades';
    d.innerHTML = `<summary>Leaderboard (${names.length} trader${names.length === 1 ? '' : 's'})</summary>`;
    if (!names.length) {
      d.insertAdjacentHTML('beforeend', '<div class="fut-meta">No trades yet.</div>');
      return d;
    }
    const me = ctx.user()?.name;
    const label = Object.fromEntries(m.outcomes.map(o => [o.id, o.team || o.label]));
    const open = m.status === 'open' || m.status === 'locked';
    const rows = names.map(n => ({ n, ...standing(m, n) })).sort((a, b) => b.pl - a.pl || a.n.localeCompare(b.n));
    const holds = pos => Object.entries(pos).flatMap(([oid, h]) => [
      h.yes ? `${h.yes.toFixed(1)} ${esc(label[oid])}` : '',
      h.no ? `${h.no.toFixed(1)} No ${esc(label[oid])}` : '',
    ]).filter(Boolean).join(', ') || '—';
    const signed = v => (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + nby(v, 2);
    const wrap = document.createElement('div');
    wrap.className = 'ui-table-wrap';
    wrap.innerHTML = `<table class="ui-table ui-table--dense"><thead><tr><th class="num">#</th><th>Member</th>
      ${open ? '<th class="narrow-hide">Holds</th>' : ''}<th class="num narrow-hide">Put in</th><th class="num">${open ? 'Worth now' : m.status === 'settled' ? 'Paid' : 'Refunded'}</th>
      <th class="num">Profit</th></tr></thead><tbody>${rows.map((r, i) => `<tr${r.n === me ? ' style="font-weight:600"' : ''}>
      <td class="num">${i + 1}</td><td>${esc(r.n)}</td>${open ? `<td class="holds narrow-hide">${holds(r.pos)}</td>` : ''}
      <td class="num narrow-hide">${r.net < -0.005 ? '−' : ''}${nby(r.net, 2)}</td><td class="num">${nby(open ? r.value : m.status === 'settled' ? r.paid : r.net, 2)}</td>
      <td class="num ${r.pl > 0.005 ? 'up' : r.pl < -0.005 ? 'down' : ''}">${signed(r.pl)}</td></tr>`).join('')}</tbody></table>
      ${open ? '<div class="fut-meta" style="margin-top:0.3rem">"Worth now" values shares at current odds. Selling a big position would move the price, so it would fetch a little less.</div>' : ''}`;
    d.appendChild(wrap);
    return d;
  }

  function tradesLog(m) {
    const d = document.createElement('details');
    d.className = 'fut-trades';
    d.innerHTML = `<summary>Trades (${m.trade_count})</summary><div class="loading">Loading…</div>`;
    d.addEventListener('toggle', async () => {
      if (!d.open || d.dataset.loaded) return;
      d.dataset.loaded = '1';
      const body = d.querySelector('div');
      try {
        const h = await api(`/api/markets/${m.id}/history`);
        const label = Object.fromEntries(m.outcomes.map(o => [o.id, o.label]));
        const idx = Object.fromEntries(m.outcomes.map((o, i) => [o.id, i]));
        // h.prices[0] is the opening; the price after trade k is h.prices[k + 1].
        const rows = h.trades.map((t, k) => ({ ...t, after: h.prices[k + 1]?.p[idx[t.outcome_id]] })).reverse().slice(0, 100);
        body.className = 'ui-table-wrap';
        body.innerHTML = rows.length ? `<table class="ui-table ui-table--dense"><thead><tr><th>When</th><th>Member</th><th></th>
          <th>Outcome</th><th class="num">Shares</th><th class="num">NB¥</th><th class="num">Price after</th></tr></thead><tbody>${rows.map(t => `<tr>
          <td>${when(t.ts)}</td><td>${esc(t.member)}</td><td>${t.side === 'buy' ? 'Bought' : 'Sold'}</td>
          <td>${t.contract === 'no' ? 'No on ' : ''}${esc(label[t.outcome_id] || '?')}</td><td class="num">${t.shares.toFixed(2)}</td><td class="num">${t.cash.toFixed(2)}</td>
          <td class="num">${t.after != null ? px(t.after) : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="fut-meta">No trades yet.</div>';
      } catch (e) { body.textContent = e.message; }
    });
    return d;
  }

  // ── Bookie controls ────────────────────────────────────────────────────────

  function adminBar(m) {
    const bar = document.createElement('div');
    bar.className = 'fut-admin';
    const act = async (path, confirmMsg) => {
      if (confirmMsg && !confirm(confirmMsg)) return;
      try {
        const r = await api(`/api/markets/${m.id}/${path}`, { method: 'POST', body: path.startsWith('settle') ? JSON.stringify({ winner: winSel.value }) : undefined });
        replace(r);
        await ctx.refreshBalance();
        draw();
      } catch (e) { alert(e.message); }
    };
    const btn = (txt, cls, fn) => { const b = document.createElement('button'); b.className = `ui-btn ui-btn--sm ${cls}`; b.textContent = txt; b.onclick = fn; bar.appendChild(b); };
    if (m.status === 'open') btn('Lock trading', 'ui-btn--ghost', () => act('lock'));
    else btn('Reopen trading', 'ui-btn--ghost', () => act('unlock'));
    const winSel = document.createElement('select');
    winSel.className = 'ui-select';
    winSel.innerHTML = '<option value="">Winner…</option>' + [...m.outcomes].sort((a, b) => a.label.localeCompare(b.label))
      .map(o => `<option value="${o.id}">${esc(o.label)}</option>`).join('');
    bar.appendChild(winSel);
    btn('Settle', 'ui-btn--primary', () => {
      if (!winSel.value) return alert('Pick the winner first.');
      const lbl = winSel.selectedOptions[0].textContent;
      act('settle', `Settle "${m.title}" with ${lbl} as the winner? Every ${lbl} share pays ${nby(m.payout)}. This can't be undone.`);
    });
    btn('Void', 'ui-btn--danger', () => act('void', `Void "${m.title}"? Everyone gets back what they put in, net of sales.`));
    return bar;
  }

  function newMarketForm() {
    const f = document.createElement('div');
    f.className = 'fut-form';
    f.innerHTML = `
      <label class="ui-label">Title <input class="ui-input" id="fm-title" placeholder="Who wins the 2027 title?"></label>
      <label class="ui-label">Description <textarea class="ui-textarea" id="fm-desc" rows="2" placeholder="How it's decided."></textarea></label>
      <div>
        <div class="ui-label">Outcomes and opening odds</div>
        <div class="hint">Weights can be any numbers: percentages, or just "this team is twice as likely as that one".
          Leave every weight blank to open all outcomes level. Nothing opens under NB¥1.</div>
        <div class="ui-table-wrap"><table class="ui-table ui-table--dense fm-outs">
          <thead><tr><th>Outcome</th><th class="num">Weight</th><th class="num">Opening price</th><th></th></tr></thead>
          <tbody></tbody></table></div>
        <div class="fut-trade-row" style="margin-top:0.4rem">
          <button class="ui-btn ui-btn--sm ui-btn--ghost" id="fm-add" type="button">+ Add outcome</button>
          <button class="ui-btn ui-btn--sm ui-btn--ghost" id="fm-teams" type="button">Fill with all 30 teams</button>
          <button class="ui-btn ui-btn--sm ui-btn--ghost" id="fm-level" type="button">Clear weights</button>
        </div>
        <div class="hint" id="fm-source"></div>
      </div>
      <div class="fut-form-grid">
        <label class="ui-label">Liquidity (b) <input class="ui-input" id="fm-b" type="number" value="1500" min="100" max="20000" step="100"></label>
        <label class="ui-label">Fee % <input class="ui-input" id="fm-fee" type="number" value="2" min="0" max="10" step="0.5"></label>
        <label class="ui-label">Max in per member <input class="ui-input" id="fm-stake" type="number" min="1" step="50" placeholder="No cap"></label>
        <label class="ui-label">Closes <input class="ui-input" id="fm-close" type="datetime-local" required></label>
      </div>
      <div class="hint">Set the close before the result could be known — for a title, before the deciding game.
        Trading stops then on its own. A market still open once the answer is out sells the winner cheap to whoever notices first.</div>
      <div class="hint" id="fm-hint"></div>
      <div><button class="ui-btn ui-btn--primary ui-btn--sm" id="fm-go">Open market</button> <span class="fut-err" id="fm-err"></span></div>`;
    const $ = id => f.querySelector('#' + id);
    const tbody = f.querySelector('.fm-outs tbody');

    function addRow(label = '', team = null, weight = '') {
      const tr = tbody.insertRow();
      if (team) tr.dataset.team = team;
      tr.innerHTML = `<td><input class="ui-input fm-label" value="${esc(label)}" placeholder="Outcome"></td>
        <td class="num"><input class="ui-input fm-w" type="number" min="0" step="any" value="${esc(weight)}" style="width:6rem"></td>
        <td class="num fm-pct"></td>
        <td><button class="ui-btn ui-btn--sm ui-btn--ghost fm-del" type="button" title="Remove">×</button></td>`;
      tr.querySelector('.fm-label').oninput = () => { delete tr.dataset.team; preview(); };
      tr.querySelector('.fm-w').oninput = preview;
      tr.querySelector('.fm-del').onclick = () => { tr.remove(); preview(); };
    }

    // A typed outcome that names a team ("Boston Celtics", "BOS") is linked
    // to it, so the own-team rule applies whether or not "Fill" was used.
    function teamFor(label) {
      const L = label.toLowerCase();
      const list = typeof TEAM_LIST !== 'undefined' ? TEAM_LIST : {};
      return Object.keys(list).find(k => k.toLowerCase() === L || list[k].toLowerCase() === L) || null;
    }

    function rows() {
      return [...tbody.rows].map(tr => ({
        tr,
        label: tr.querySelector('.fm-label').value.trim(),
        team: tr.dataset.team || teamFor(tr.querySelector('.fm-label').value.trim()),
        w: tr.querySelector('.fm-w').value.trim(),
      })).filter(r => r.label);
    }

    // The opening prices come from POST /api/markets/preview, the same
    // normalizing and 1% floor create applies, so what's shown is what opens.
    let timer = null;
    function preview() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const rs = rows();
        tbody.querySelectorAll('.fm-pct').forEach(td => { td.textContent = ''; });
        $('fm-hint').textContent = '';
        if (rs.length < 2) return;
        const ws = rs.map(r => r.w === '' ? null : parseFloat(r.w));
        try {
          const pv = await api('/api/markets/preview', {
            method: 'POST', body: JSON.stringify({ open_prices: ws, b: parseFloat($('fm-b').value) || 1500 }),
          });
          rs.forEach((r, i) => { r.tr.querySelector('.fm-pct').textContent = px(pv.prices[i]); });
          $('fm-hint').textContent = `${rs.length} outcomes. The most this market can create is about ${nby(pv.max_mint)}. `
            + `Moving an outcome from NB¥10 to NB¥20 costs about ${nby(pv.move_10_to_20)}.`;
        } catch (e) { $('fm-hint').textContent = e.message; }
      }, 250);
    }

    $('fm-add').onclick = () => { addRow(); tbody.lastElementChild.querySelector('.fm-label').focus(); };
    // Teams come pre-weighted from the latest published power rankings
    // (GET /api/markets/seeds/power-rankings — the weighting lives there).
    // With no edition published, they fill in level.
    $('fm-teams').onclick = async () => {
      tbody.innerHTML = '';
      let seed = null;
      try { seed = await api('/api/markets/seeds/power-rankings'); } catch {}
      const abbrs = Object.keys(typeof TEAM_LIST !== 'undefined' ? TEAM_LIST : {});
      if (seed) abbrs.sort((a, b) => (seed.teams[a]?.avg ?? 99) - (seed.teams[b]?.avg ?? 99));
      abbrs.forEach(k => addRow(teamName(k), k, seed?.teams[k]?.weight ?? ''));
      $('fm-source').innerHTML = seed
        ? `Weights from <a href="/news/view/?id=${encodeURIComponent(seed.source.id)}" target="_blank">${esc(seed.source.title)}</a>`
          + ` (${when(seed.source.published_at)}), by each team's average ballot rank. Edit any of them, or clear them for level odds.`
        : 'No published power rankings yet, so every team opens level.';
      preview();
    };
    $('fm-level').onclick = () => { tbody.querySelectorAll('.fm-w').forEach(i => { i.value = ''; }); $('fm-source').textContent = ''; preview(); };
    $('fm-b').addEventListener('input', preview);
    addRow(); addRow();

    $('fm-go').onclick = async () => {
      const btn = $('fm-go');
      btn.disabled = true;
      $('fm-err').textContent = '';
      try {
        const close = $('fm-close').value;
        if (!close) throw new Error('Set a close time.');
        const m = await api('/api/markets', {
          method: 'POST', body: JSON.stringify({
            title: $('fm-title').value, description: $('fm-desc').value,
            outcomes: rows().map(r => ({ label: r.label, team: r.team, open_price: r.w === '' ? null : parseFloat(r.w) })),
            b: parseFloat($('fm-b').value), fee: parseFloat($('fm-fee').value) / 100,
            max_stake: $('fm-stake').value ? parseFloat($('fm-stake').value) : null,
            closes_at: new Date(close).toISOString(),
          }),
        });
        markets.unshift(m);
        showForm = false;
        draw();
      } catch (e) { $('fm-err').textContent = e.message; btn.disabled = false; }
    };
    return f;
  }

  window.Futures = { render };
})();
