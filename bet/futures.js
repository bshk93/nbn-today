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
    .fut-form { display: flex; flex-direction: column; gap: 0.55rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    .fut-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.55rem; }
    @media (max-width: 600px) { .fut-table .hide-sm { display: none; } }
    .fut-form .hint { font-size: 0.72rem; color: var(--text-muted); }
  `;
  let cssDone = false;
  let ctx = null;
  let root = null;
  let markets = [];
  let showForm = false;
  const selected = {};        // market id → outcome id
  const side = {};            // market id → 'buy' | 'sell'

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nby = (n, d = 0) => 'NB¥' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = p => (Math.round(p * 10) / 10).toFixed(1) + '%';
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
      ${done ? '' : `<div class="fut-explain">A share pays <strong>${nby(m.payout)}</strong> if its outcome happens and nothing if not, so the price is the market's odds.
        Buying pushes a price up; selling pushes it down. Sell any time before the market closes.
        ${Math.round(m.fee * 100)}% fee on each trade. Up to ${nby(m.max_stake)} in per member, net of sales.</div>`}`;

    const pos = (me && m.positions[me]) || {};
    const acct = (me && m.accounts[me]) || null;
    if (acct) {
      const priceOf = Object.fromEntries(m.outcomes.map(o => [o.id, o.price]));
      const value = done ? 0 : Object.entries(pos).reduce((s, [oid, sh]) => s + sh * priceOf[oid], 0);
      const net = acct.spent - acct.received;
      const paid = (m.status === 'settled' && m.winner && pos[m.winner]) ? pos[m.winner] * m.payout : 0;
      const line = document.createElement('div');
      line.className = 'fut-mine';
      line.innerHTML = done
        ? `You put in ${nby(net, 2)} net${paid ? ` and were paid <strong>${nby(paid, 2)}</strong>` : ''}.`
        : `Your shares are worth about <strong>${nby(value, 2)}</strong> at current prices. You've put in ${nby(net, 2)} net.`;
      el.appendChild(line);
    }

    el.appendChild(table(m, pos, done));
    if (m.trading && ctx.user()) el.appendChild(tradePanel(m, pos));
    else if (m.trading) el.insertAdjacentHTML('beforeend', '<div class="fut-meta" style="margin-top:0.6rem">Sign in to trade.</div>');

    el.appendChild(houseLine(m));
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
      <th class="num hide-sm">Shares out</th><th class="num">You hold</th></tr></thead>`;
    const tb = t.createTBody();
    rows.forEach(r => {
      const tr = tb.insertRow();
      if (selected[m.id] === r.id) tr.className = 'sel';
      if (m.status === 'settled' && m.winner === r.id) tr.className = 'win';
      const chg = r.price - r.open;
      const held = pos[r.id] || 0;
      tr.innerHTML = `
        <td>${m.status === 'settled' && m.winner === r.id ? '🏆 ' : ''}${esc(r.label)}</td>
        <td class="num price">${pct(r.price)}<span class="fut-bar" style="width:${Math.max(2, r.price / maxP * 48)}px"></span></td>
        <td class="num ${Math.abs(chg) < 0.05 ? '' : chg > 0 ? 'up' : 'down'}">${Math.abs(chg) < 0.05 ? '—' : (chg > 0 ? '▲ ' : '▼ ') + Math.abs(chg).toFixed(1)}</td>
        <td class="num hide-sm">${r.shares_out ? r.shares_out.toFixed(1) : '—'}</td>
        <td class="num">${held ? held.toFixed(2) : ''}</td>`;
      if (!done) tr.onclick = () => { selected[m.id] = r.id; draw(); };
    });
    wrap.appendChild(t);
    return wrap;
  }

  // ── Buying and selling ─────────────────────────────────────────────────────

  function tradePanel(m, pos) {
    const box = document.createElement('div');
    box.className = 'fut-trade';
    if (!selected[m.id]) selected[m.id] = [...m.outcomes].sort((a, b) => b.price - a.price)[0].id;
    const s = side[m.id] || 'buy';
    const oid = selected[m.id];
    const held = pos[oid] || 0;

    const opts = [...m.outcomes].sort((a, b) => a.label.localeCompare(b.label))
      .map(o => `<option value="${o.id}" ${o.id === oid ? 'selected' : ''}>${esc(o.label)} — ${pct(o.price)}</option>`).join('');
    box.innerHTML = `
      <div class="fut-trade-row">
        <div class="ui-segmented">
          <button class="${s === 'buy' ? 'active' : ''}" data-side="buy">Buy</button>
          <button class="${s === 'sell' ? 'active' : ''}" data-side="sell">Sell</button>
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
    box.querySelector('.fut-oid').onchange = e => { selected[m.id] = e.target.value; draw(); };
    const allBtn = box.querySelector('.fut-all');
    if (allBtn) allBtn.onclick = () => { amt.value = held.toFixed(4); requote(); };

    async function requote() {
      quote = null;
      go.disabled = true;
      err.textContent = '';
      const v = parseFloat(amt.value);
      if (!(v > 0)) { qEl.textContent = ''; return; }
      if (s === 'sell' && v > held + 1e-6) { qEl.textContent = ''; err.textContent = `You hold ${held.toFixed(2)} shares.`; return; }
      try {
        const q = await api(`/api/markets/${m.id}/quote`, {
          method: 'POST',
          body: JSON.stringify({ outcome_id: oid, side: s, [s === 'buy' ? 'spend' : 'shares']: v }),
        });
        if (parseFloat(amt.value) !== v) return;   // typed on since
        quote = q;
        qEl.innerHTML = s === 'buy'
          ? `<strong>${q.shares.toFixed(2)} shares</strong> at ${q.avg_price.toFixed(2)} each · price ${pct(q.price_before)} → ${pct(q.price_after)}
             · ${nby(q.cost, 2)} + ${nby(q.fee, 2)} fee = <strong>${nby(q.total, 2)}</strong> · pays <strong>${nby(q.pays_if_wins, 2)}</strong> if it wins`
          : `Get <strong>${nby(q.total, 2)}</strong> (${nby(q.proceeds, 2)} − ${nby(q.fee, 2)} fee) · ${q.avg_price.toFixed(2)} a share
             · price ${pct(q.price_before)} → ${pct(q.price_after)}`;
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
          ? { outcome_id: oid, spend: quote.cost, min_shares: quote.shares - 1e-4 }
          : { outcome_id: oid, shares: parseFloat(amt.value), min_proceeds: quote.total - 0.01 };
        const r = await api(`/api/markets/${m.id}/${s}`, { method: 'POST', body: JSON.stringify(body) });
        replace(r.market);
        await ctx.refreshBalance();
        draw();
      } catch (e) {
        err.textContent = e.message;
        requote();
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
        const rows = h.trades.slice().reverse().slice(0, 100);
        body.className = 'ui-table-wrap';
        body.innerHTML = rows.length ? `<table class="ui-table ui-table--dense"><thead><tr><th>When</th><th>Member</th><th></th>
          <th>Outcome</th><th class="num">Shares</th><th class="num">NB¥</th></tr></thead><tbody>${rows.map(t => `<tr>
          <td>${when(t.ts)}</td><td>${esc(t.member)}</td><td>${t.side === 'buy' ? 'Bought' : 'Sold'}</td>
          <td>${esc(label[t.outcome_id] || '?')}</td><td class="num">${t.shares.toFixed(2)}</td><td class="num">${t.cash.toFixed(2)}</td>
          </tr>`).join('')}</tbody></table>` : '<div class="fut-meta">No trades yet.</div>';
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
          Leave every weight blank to open all outcomes level. Nothing opens under 1%.</div>
        <div class="ui-table-wrap"><table class="ui-table ui-table--dense fm-outs">
          <thead><tr><th>Outcome</th><th class="num">Weight</th><th class="num">Opens at</th><th></th></tr></thead>
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
        <label class="ui-label">Max in per member <input class="ui-input" id="fm-stake" type="number" value="500" min="1" step="50"></label>
        <label class="ui-label">Closes (optional) <input class="ui-input" id="fm-close" type="datetime-local"></label>
      </div>
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

    function rows() {
      return [...tbody.rows].map(tr => ({
        tr,
        label: tr.querySelector('.fm-label').value.trim(),
        team: tr.dataset.team || null,
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
          rs.forEach((r, i) => { r.tr.querySelector('.fm-pct').textContent = pct(pv.prices[i]); });
          $('fm-hint').textContent = `${rs.length} outcomes. The most this market can create is about ${nby(pv.max_mint)}. `
            + `Moving an outcome from 10% to 20% costs about ${nby(pv.move_10_to_20)}.`;
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
        const m = await api('/api/markets', {
          method: 'POST', body: JSON.stringify({
            title: $('fm-title').value, description: $('fm-desc').value,
            outcomes: rows().map(r => ({ label: r.label, team: r.team, open_price: r.w === '' ? null : parseFloat(r.w) })),
            b: parseFloat($('fm-b').value), fee: parseFloat($('fm-fee').value) / 100,
            max_stake: parseFloat($('fm-stake').value),
            closes_at: close ? new Date(close).toISOString() : null,
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
