// Daily moves: what every team did on one day, and the last two weeks at a glance.
//
// Shared by /nbyen/invest (Wall Street, from GET /api/invest/daily) and the hidden
// /nbyen/invest/fair (fair value, from GET /api/fair-value/history). The page turns its
// data into one shape and this draws it:
//
//   DailyMoves.mount(el, {
//     title: 'Daily moves',
//     days:  ['2026-10-21', ...],                  // oldest first
//     teams: { ATL: { '2026-10-21': { pct: 0.42, note: 'W by 7 v CHA' } } },
//   })
//
// `pct` is a percentage (0.42 means +0.42%). A team with no entry for a day
// didn't move that day. Colour is the diverging green/red the market already
// uses, which is weak for red-green colour blindness (ΔE 6.5), so every move is
// also printed signed with an arrow: colour is never the only cue.
(function () {
  const WINDOW = 14;

  const css = `
  .dm { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.85rem 1.1rem; margin-bottom: 1.5rem; }
  .dm-hdr { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
  .dm-title { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .dm-nav { display: flex; align-items: center; gap: 0.35rem; }
  .dm-nav button { background: var(--bg-page); border: 1px solid var(--border); color: var(--text-secondary); border-radius: var(--radius-sm); width: 28px; height: 28px; cursor: pointer; font-size: var(--text-sm); }
  .dm-nav button:disabled { opacity: 0.35; cursor: default; }
  .dm-nav select { height: 28px; font-size: var(--text-sm); }
  .dm-views { display: flex; gap: 2px; background: var(--bg-page); border-radius: var(--radius-sm); padding: 2px; }
  .dm-views button { background: none; border: none; color: var(--text-muted); padding: 0.2rem 0.55rem; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--text-xs); font-weight: 600; }
  .dm-views button.active { background: var(--border); color: var(--text-primary); }
  .dm-sum { display: flex; flex-wrap: wrap; gap: 0.4rem 1.1rem; font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 0.7rem; }
  .dm-sum b { color: var(--text-primary); font-family: var(--font-mono); font-weight: 600; }
  .dm-list { display: grid; grid-template-columns: auto 3rem 1fr 4.6rem; align-items: center; gap: 2px 0.6rem; }
  .dm-list .logo { width: 20px; height: 20px; object-fit: contain; }
  .dm-list .abbr { font-weight: 700; font-size: var(--text-sm); }
  .dm-bar { position: relative; height: 18px; display: flex; align-items: center; }
  .dm-bar::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--border); }
  .dm-bar span { position: absolute; top: 4px; height: 10px; border-radius: var(--radius-sm); }
  .dm-bar .up { left: 50%; background: var(--market-positive); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
  .dm-bar .dn { right: 50%; background: var(--danger); border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
  .dm-bar em { position: absolute; top: 1px; line-height: 16px; font-style: normal; font-size: var(--text-xs); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 48%; }
  .dm-bar em.r { left: calc(50% + 6px); }
  .dm-bar em.l { right: calc(50% + 6px); }
  .dm-pct { font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 600; text-align: right; color: var(--text-primary); }
  .dm-gap { font-size: var(--text-xs); color: var(--text-dim); text-align: center; padding: 2px 0; }
  .dm-more { background: none; border: none; color: var(--accent-light); font-size: var(--text-xs); cursor: pointer; padding: 0.4rem 0 0; }
  .dm-idle { font-size: var(--text-xs); color: var(--text-muted); margin-top: 0.6rem; }
  .dm-heat-wrap { overflow-x: auto; }
  .dm-heat { border-collapse: separate; border-spacing: 2px; font-size: var(--text-xs); font-family: var(--font-mono); }
  .dm-heat th { color: var(--text-muted); font-weight: 600; padding: 0 2px; white-space: nowrap; cursor: pointer; }
  .dm-heat th.sel { color: var(--text-primary); text-decoration: underline; }
  .dm-heat th.team { text-align: left; cursor: default; font-family: var(--font-sans, inherit); }
  .dm-heat td { min-width: 2.6rem; height: 20px; text-align: center; border-radius: var(--radius-sm); color: var(--text-primary); cursor: pointer; }
  .dm-heat td.none { color: var(--text-dim); }
  .dm-heat td.sel { outline: 1px solid var(--text-muted); }
  .dm-heat td.tot { font-weight: 700; cursor: default; }
  .dm-note { font-size: var(--text-xs); color: var(--text-muted); margin-top: 0.5rem; }
  @media (max-width: 640px) { .dm-bar em { display: none; } }
  `;

  function injectCss() {
    if (document.getElementById('dm-css')) return;
    const s = document.createElement('style');
    s.id = 'dm-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (p, dp = 2) => (p > 0 ? '▲ +' : p < 0 ? '▼ ' : '') + p.toFixed(dp) + '%';
  const short = p => (p > 0 ? '+' : '') + p.toFixed(1);
  const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const colLabel = d => { const x = new Date(d + 'T12:00:00'); return `${x.getMonth() + 1}/${x.getDate()}`; };

  // Diverging tint: strength by size against the window's biggest move, so a
  // quiet fortnight still shows its shape. Near zero is untinted.
  function tint(p, scale) {
    if (!p) return '';
    const a = Math.min(1, Math.abs(p) / (scale || 1));
    const pct = Math.round(12 + a * 48);
    const c = p > 0 ? 'var(--market-positive)' : 'var(--danger)';
    return `background: color-mix(in srgb, ${c} ${pct}%, transparent)`;
  }

  // Compounded change over a list of daily percentages.
  const compound = ps => (ps.reduce((acc, p) => acc * (1 + p / 100), 1) - 1) * 100;

  function mount(el, opts) {
    injectCss();
    const days = opts.days || [];
    const teams = opts.teams || {};
    const tickers = Object.keys(teams).sort();
    const state = { i: days.length - 1, view: 'day', all: false };

    function moved(d) {
      return tickers.filter(t => teams[t][d]).map(t => ({ team: t, ...teams[t][d] }));
    }

    function header() {
      const opt = days.map((d, i) => `<option value="${i}"${i === state.i ? ' selected' : ''}>${esc(dayLabel(d))}</option>`).reverse().join('');
      return `<div class="dm-hdr">
        <span class="dm-title">${esc(opts.title || 'Daily moves')}</span>
        <div class="dm-nav">
          <button data-step="-1" ${state.i <= 0 ? 'disabled' : ''} aria-label="Previous day">‹</button>
          <select class="ui-select" aria-label="Day">${opt}</select>
          <button data-step="1" ${state.i >= days.length - 1 ? 'disabled' : ''} aria-label="Next day">›</button>
        </div>
        <div class="dm-views">
          <button data-view="day" class="${state.view === 'day' ? 'active' : ''}">Day</button>
          <button data-view="heat" class="${state.view === 'heat' ? 'active' : ''}">${WINDOW} days</button>
        </div>
      </div>`;
    }

    function dayView() {
      const d = days[state.i];
      const rows = moved(d).sort((a, b) => b.pct - a.pct);
      if (!rows.length) return '<div class="ui-empty">Nobody moved this day.</div>';
      const best = rows[0], worst = rows[rows.length - 1];
      const avg = rows.reduce((s, r) => s + r.pct, 0) / rows.length;
      const scale = Math.max(...rows.map(r => Math.abs(r.pct))) || 1;
      const idle = tickers.filter(t => !teams[t][d]);
      const logo = t => `<img class="logo" src="/logos/sm/logo-${t.toLowerCase()}.webp" alt="" onerror="this.style.visibility='hidden'">`;
      // The top and bottom five, unless asked for everyone.
      const SHOW = 5;
      const cut = !state.all && rows.length > SHOW * 2 + 2;
      const shown = cut ? [...rows.slice(0, SHOW), null, ...rows.slice(-SHOW)] : rows;
      const list = shown.map(r => {
        if (!r) return `<span></span><span></span><span class="dm-gap">${rows.length - SHOW * 2} more</span><span></span>`;
        const w = (Math.abs(r.pct) / scale * 50).toFixed(1);
        const bar = r.pct >= 0
          ? `<span class="up" style="width:${w}%"></span>${r.note ? `<em class="l">${esc(r.note)}</em>` : ''}`
          : `<span class="dn" style="width:${w}%"></span>${r.note ? `<em class="r">${esc(r.note)}</em>` : ''}`;
        return `${logo(r.team)}<span class="abbr">${r.team}</span>
          <div class="dm-bar" title="${esc(r.team)} ${esc(fmt(r.pct))}${r.note ? ' · ' + esc(r.note) : ''}">${bar}</div>
          <span class="dm-pct">${fmt(r.pct)}</span>`;
      }).join('');
      return `<div class="dm-sum">
          <span>Best <b>${best.team} ${fmt(best.pct)}</b></span>
          <span>Worst <b>${worst.team} ${fmt(worst.pct)}</b></span>
          <span>Average <b>${fmt(avg)}</b></span>
          <span><b>${rows.length}</b> of ${tickers.length} moved</span>
        </div>
        <div class="dm-list">${list}</div>
        ${rows.length > SHOW * 2 + 2 ? `<button class="dm-more" data-all>${state.all ? 'Show top and bottom five' : `Show all ${rows.length}`}</button>` : ''}
        ${idle.length ? `<div class="dm-idle">No move: ${idle.join(', ')}</div>` : ''}`;
    }

    function heatView() {
      const end = state.i;
      const span = days.slice(Math.max(0, end - WINDOW + 1), end + 1);
      const totals = Object.fromEntries(tickers.map(t => [t, compound(span.map(d => teams[t][d]?.pct || 0))]));
      const order = [...tickers].sort((a, b) => totals[b] - totals[a]);
      const scale = Math.max(0.01, ...span.flatMap(d => tickers.map(t => Math.abs(teams[t][d]?.pct || 0))));
      const totScale = Math.max(0.01, ...Object.values(totals).map(Math.abs));
      const head = span.map(d => `<th data-day="${days.indexOf(d)}" class="${d === days[end] ? 'sel' : ''}" title="${esc(dayLabel(d))}">${colLabel(d)}</th>`).join('');
      const body = order.map(t => {
        const cells = span.map(d => {
          const m = teams[t][d];
          const sel = d === days[end] ? ' sel' : '';
          if (!m) return `<td class="none${sel}" data-day="${days.indexOf(d)}" title="${t} · ${esc(dayLabel(d))} · no move">·</td>`;
          return `<td class="${sel.trim()}" data-day="${days.indexOf(d)}" style="${tint(m.pct, scale)}" title="${t} · ${esc(dayLabel(d))} · ${esc(fmt(m.pct))}${m.note ? ' · ' + esc(m.note) : ''}">${short(m.pct)}</td>`;
        }).join('');
        return `<tr><th class="team">${t}</th>${cells}<td class="tot" style="${tint(totals[t], totScale)}" title="${t} over these ${span.length} days: ${esc(fmt(totals[t]))}">${short(totals[t])}</td></tr>`;
      }).join('');
      return `<div class="dm-heat-wrap"><table class="dm-heat">
          <thead><tr><th class="team"></th>${head}<th>Total</th></tr></thead>
          <tbody>${body}</tbody></table></div>
        <div class="dm-note">Each cell is that day's move in %. Sorted by the total over the ${span.length} days shown. Click a day to open it.</div>`;
    }

    function render() {
      if (!days.length) {
        el.innerHTML = `<div class="dm">${header()}<div class="ui-empty">No moves yet this season.</div></div>`;
        return;
      }
      el.innerHTML = `<div class="dm">${header()}${state.view === 'day' ? dayView() : heatView()}</div>`;
    }

    el.addEventListener('click', e => {
      const step = e.target.closest('[data-step]');
      const view = e.target.closest('[data-view]');
      const day = e.target.closest('[data-day]');
      const all = e.target.closest('[data-all]');
      if (all) state.all = !state.all;
      else if (step) state.i = Math.max(0, Math.min(days.length - 1, state.i + Number(step.dataset.step)));
      else if (view) state.view = view.dataset.view;
      else if (day) { state.i = Number(day.dataset.day); state.view = 'day'; }
      else return;
      render();
    });
    el.addEventListener('change', e => {
      if (e.target.tagName === 'SELECT') { state.i = Number(e.target.value); render(); }
    });
    render();
  }

  window.DailyMoves = { mount, compound };
})();
