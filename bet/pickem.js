// Pick'em on /bet — the Pick'em tab.
//
// Each game day, pick a PG, SG, SF, PF, C and a sixth man from the teams
// playing. The rules, the scoring, the lock and the prizes are all the API's
// (nbn-api/routers/pickem.py); this file draws what GET /api/pickem/{date}
// returns and saves a lineup with PUT. It does no scoring of its own.
//
// Mounted by bet/index.html: Pickem.render(container, ctx), where ctx is
// { token, user() → {name, roles} | null, refreshBalance() }. The day shown is
// ?date= in the URL, so a link can point at one.
(function () {
  const PK_CSS = `
    .pk-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-3); }
    .pk-day { display: flex; align-items: center; gap: var(--space-2); }
    .pk-date { font-weight: 600; color: var(--text-primary); min-width: 9.5rem; text-align: center; }
    .pk-status { margin-bottom: var(--space-3); font-size: var(--text-sm); color: var(--text-muted); }
    .pk-status strong { color: var(--text-primary); }
    .pk-games { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
    .pk-game { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.55rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: var(--text-xs); color: var(--text-secondary); background: var(--bg-card); }
    .pk-game img, .pk-logo { width: 16px; height: 16px; object-fit: contain; flex-shrink: 0; }
    .pk-game.final { color: var(--text-muted); }

    .pk-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3); }
    .pk-slot { display: grid; grid-template-columns: 2.6rem 1fr auto; align-items: center; gap: var(--space-2); padding: var(--space-3); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; text-align: left; font: inherit; color: inherit; min-width: 0; }
    .pk-slot:hover, .pk-slot.open { border-color: var(--accent); }
    .pk-slot:disabled { cursor: default; }
    .pk-slot:disabled:hover { border-color: var(--border); }
    .pk-pos { font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; color: var(--text-muted); text-align: center; }
    .pk-who { min-width: 0; }
    .pk-name { font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pk-empty { color: var(--text-dim); font-style: italic; }
    .pk-meta { font-size: var(--text-xs); color: var(--text-muted); display: flex; align-items: center; gap: 0.3rem; }
    .pk-fp { font-family: var(--font-display); font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
    .pk-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
    .pk-msg { font-size: var(--text-sm); color: var(--text-muted); }
    .pk-msg.err { color: var(--danger, var(--danger-light)); }

    .pk-picker { grid-column: 1 / -1; min-width: 0; padding: var(--space-3); background: var(--bg-card); border: 1px solid var(--accent); border-radius: var(--radius); }
    .pk-picker-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
    .pk-picker-head .ui-input { flex: 1; min-width: 10rem; }
    .pk-list { max-height: 26rem; overflow-y: auto; }
    .pk-list table { width: 100%; }
    .pk-list tr { cursor: pointer; }
    .pk-list tr.taken { opacity: 0.45; }
    .pk-list td.num { text-align: right; font-variant-numeric: tabular-nums; }

    .pk-entry { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: var(--space-2); }
    .pk-entry summary { display: grid; grid-template-columns: 1.8rem 1fr auto; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); cursor: pointer; list-style: none; }
    .pk-entry summary::-webkit-details-marker { display: none; }
    .pk-rank { font-family: var(--font-display); font-weight: 700; color: var(--text-muted); text-align: center; }
    .pk-entry.lead .pk-rank { color: var(--gold); }
    .pk-member { font-weight: 600; color: var(--text-primary); }
    .pk-entry.mine .pk-member::after { content: ' (you)'; font-weight: 400; color: var(--text-muted); }
    .pk-entry-body { padding: 0 var(--space-3) var(--space-3); }
    .pk-entry-body table { width: 100%; }
    .pk-entry-body td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .pk-line { font-size: var(--text-xs); color: var(--text-muted); }

    .pk-how { margin-top: var(--space-5); font-size: var(--text-xs); color: var(--text-muted); line-height: 1.6; }
    .pk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-4); }
    .pk-grid section { min-width: 0; }
    .pk-table td.num, .pk-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .pk-wins { font-size: var(--text-sm); }
    .pk-wins li { padding: 0.2rem 0; color: var(--text-secondary); }
    .pk-wins a { color: var(--text-primary); }
    @media (max-width: 520px) {
      .pk-date { min-width: 0; }
      .pk-slots { grid-template-columns: 1fr; }
      .pk-picker-head .ui-select { flex: 1; }
      .pk-list .col-pos, .pk-list .col-ovr { display: none; }
    }
  `;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C', '6TH'];
  const SLOT_LABEL = { '6TH': '6th' };
  const logo = t => `<img class="pk-logo" src="/logos/sm/logo-${esc(String(t).toLowerCase())}.webp" alt="" onerror="this.style.visibility='hidden'">`;
  const fmt = v => (v == null ? '—' : (+v).toFixed(1));
  const name = raw => (typeof nbnPlayerName === 'function' ? nbnPlayerName(raw) : raw);

  let ctx = null, root = null, cssDone = false;
  let view = 'day';        // 'day' | 'standings'
  let date = null;
  let day = null;          // GET /api/pickem/{date}
  let draft = {};          // slot -> slug, the lineup being edited
  let openSlot = null;
  let gameDays = null;     // every date on the schedule, for ← →

  const me = () => (ctx.user() || {}).name || null;
  const canReopen = () => ((ctx.user() || {}).roles || []).some(r => ['streamer', 'bod', 'admin'].includes(r));
  const authHeaders = () => (ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {});
  const $ = sel => root.querySelector(sel);

  function shiftDate(d, n) {
    const t = new Date(d + 'T12:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }
  function dateLabel(d) {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  async function loadGameDays() {
    if (gameDays) return gameDays;
    const sched = await fetch('/api/schedule').then(r => (r.ok ? r.json() : null)).catch(() => null);
    gameDays = [...new Set(((sched && sched.games) || []).map(g => g.date))].sort();
    return gameDays;
  }

  /** The day to open on: ?date=, else today, else the next game day. */
  async function defaultDate() {
    const want = new URLSearchParams(location.search).get('date');
    if (want) return want;
    const today = nbnToday();
    const days = await loadGameDays();
    return days.includes(today) || !days.length ? today : (days.find(d => d > today) || today);
  }

  async function render(container, context) {
    ctx = context;
    root = container;
    if (!cssDone) {
      const st = document.createElement('style');
      st.textContent = PK_CSS;
      document.head.appendChild(st);
      cssDone = true;
    }
    if (!date) date = await defaultDate();
    root.innerHTML = `
      <div class="pk-bar">
        <div class="ui-segmented" role="tablist">
          <button data-view="day" class="${view === 'day' ? 'active' : ''}">Lineups</button>
          <button data-view="standings" class="${view === 'standings' ? 'active' : ''}">Standings</button>
        </div>
        <div class="pk-day" id="pk-day-nav" ${view === 'day' ? '' : 'hidden'}>
          <button class="ui-btn ui-btn--sm ui-btn--ghost" id="pk-prev" aria-label="Previous game day">←</button>
          <span class="pk-date" id="pk-date-label"></span>
          <button class="ui-btn ui-btn--sm ui-btn--ghost" id="pk-next" aria-label="Next game day">→</button>
        </div>
      </div>
      <div id="pk-body"><div class="ui-loading">Loading…</div></div>
      <p class="pk-how">
        Pick one player for each position, plus a sixth man who can play anywhere. A player fits a position if it's his 2K primary or his secondary.
        Your whole lineup locks when the day's stream goes live (or when a box score for the day comes in, or at midnight ET at the latest), and nobody sees anyone else's until then.
        Scoring: points 1, threes +0.5, rebounds 1.25, assists 1.5, steals 2, blocks 2, turnovers −0.5, double-double +1.5, triple-double +3 more.
        Scores fill in as box scores are uploaded.
        Prizes: NB¥100 to each day's winner once all its box scores are in, and NB¥1,000 to the season's winner. Tied winners each get the full prize.
      </p>`;
    root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; render(root, ctx); });
    $('#pk-prev').onclick = () => stepDay(-1);
    $('#pk-next').onclick = () => stepDay(1);
    if (view === 'standings') return loadStandings();
    return loadDay();
  }

  async function stepDay(n) {
    const days = await loadGameDays();
    const later = n > 0 ? days.find(d => d > date) : [...days].reverse().find(d => d < date);
    setDate(later || shiftDate(date, n));
  }

  // Pushed, so Back steps back through the days you looked at.
  function dateToUrl(d) {
    const q = new URLSearchParams(location.search);
    if (d === nbnToday()) q.delete('date'); else q.set('date', d);
    const url = location.pathname + (q.toString() ? `?${q}` : '') + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.pushState(null, '', url);
  }

  function setDate(d) {
    date = d;
    dateToUrl(d);
    loadDay();
  }

  async function loadDay() {
    $('#pk-date-label').textContent = dateLabel(date);
    const el = $('#pk-body');
    el.innerHTML = '<div class="ui-loading">Loading…</div>';
    const r = await fetch(`/api/pickem/${date}`, { headers: authHeaders() });
    if (!r.ok) { el.innerHTML = `<div class="ui-empty">Couldn’t load ${esc(date)}.</div>`; return; }
    day = await r.json();
    const mine = day.entries.find(e => e.member === me());
    draft = mine ? { ...mine.lineup } : {};
    openSlot = null;
    renderDay();
  }

  function player(slug) {
    return day.players.find(p => p.slug === slug) || { slug, name: day.names[slug] || slug, positions: [] };
  }

  function renderDay() {
    const el = $('#pk-body');
    if (!day.games.length) {
      el.innerHTML = '<div class="ui-empty">No games this day. Use the arrows to find a game day.</div>';
      return;
    }
    const lockedWhen = day.locked && day.locked_because !== 'the day ended'
      ? ` Locked ${esc(nbnFormatDateTime(new Date(day.locked_at)))}, when ${esc(day.locked_because)}.` : '';
    const status = day.final ? `<strong>Final.</strong>${lockedWhen}`
      : day.locked ? `<strong>Locked.</strong>${lockedWhen} Scores fill in as box scores are uploaded (${day.games.filter(g => g.final).length} of ${day.games.length} in).`
      : `<strong>Open</strong> until the stream goes live. ${day.entry_count} lineup${day.entry_count === 1 ? '' : 's'} set so far${day.entrants && day.entrants.length ? `: ${day.entrants.map(esc).join(', ')}` : ''}.`
        + (day.reopened.length ? ` Reopened by ${esc(day.reopened[day.reopened.length - 1].by)} after a stream that wasn’t the games.` : '');
    // No tip times: the schedule's are the real NBA ones, not when our games are played.
    const games = day.games.map(g => `<span class="pk-game${g.final ? ' final' : ''}">${logo(g.away)}${esc(g.away)} @ ${logo(g.home)}${esc(g.home)}</span>`).join('');
    const reopen = canReopen() && day.lock_why === 'stream'
      ? ` <button class="ui-btn ui-btn--sm ui-btn--ghost" id="pk-reopen" title="${esc(day.lock_stream && day.lock_stream.title ? `Locked by: ${day.lock_stream.title}` : '')}">Not today's games? Reopen</button>` : '';
    el.innerHTML = `<p class="pk-status">${status}${reopen}</p><div class="pk-games">${games}</div>
      ${day.locked ? renderBoard() : renderBuilder()}`;
    wireDay();
  }

  function renderBuilder() {
    if (!me()) return '<div class="ui-empty">Sign in (top right) to set a lineup.</div>';
    const slot = s => {
      const p = draft[s] && player(draft[s]);
      return `<button class="pk-slot${openSlot === s ? ' open' : ''}" data-slot="${s}">
        <span class="pk-pos">${SLOT_LABEL[s] || s}</span>
        <span class="pk-who">${p
          ? `<div class="pk-name">${esc(name(p.name))}</div>
             <div class="pk-meta">${logo(p.team)}${esc(p.team)} ${p.home ? 'vs' : '@'} ${esc(p.opp)} · ${esc(p.positions.join('/'))}</div>`
          : '<div class="pk-empty">Pick a player</div>'}</span>
        <span class="pk-fp">${p ? fmt(p.fp_avg) : ''}</span>
      </button>`;
    };
    const full = SLOTS.every(s => draft[s]);
    const saved = day.entries.find(e => e.member === me());
    // The list opens right under the slot it fills, so on a phone it isn't
    // five cards below where you tapped.
    return `<div class="pk-slots">${SLOTS.map(s => slot(s) + (s === openSlot ? renderPicker() : '')).join('')}</div>
      <div class="pk-actions">
        <button class="ui-btn ui-btn--primary" id="pk-save" ${full ? '' : 'disabled'}>${saved ? 'Update lineup' : 'Save lineup'}</button>
        <button class="ui-btn ui-btn--ghost" id="pk-clear">Clear</button>
        <span class="pk-msg" id="pk-msg">${saved ? `Saved ${esc(nbnFormatDateTime(new Date(saved.saved_at)))}.` : 'The number on each card is his fantasy points per game this season.'}</span>
      </div>`;
  }

  // The rows are filled by fillPicker, so typing doesn't rebuild the input.
  function renderPicker() {
    return `<div class="pk-picker">
      <div class="pk-picker-head">
        <strong>${openSlot === '6TH' ? 'Sixth man (any position)' : openSlot}</strong>
        <input class="ui-input" id="pk-search" placeholder="Search players or teams" autocomplete="off">
        <select class="ui-select" id="pk-sort" aria-label="Sort">
          <option value="fp">Sort by FP/game</option><option value="ovr">Sort by OVR</option>
        </select>
        ${draft[openSlot] ? '<button class="ui-btn ui-btn--sm ui-btn--ghost" id="pk-unpick">Empty this slot</button>' : ''}
        <button class="ui-btn ui-btn--sm ui-btn--ghost" id="pk-close">Close</button>
      </div>
      <div class="pk-list ui-table-wrap"><table class="ui-table ui-table--dense"><thead><tr>
        <th>Player</th><th>Game</th><th class="col-pos">Pos</th><th class="num col-ovr">OVR</th><th class="num">FP/G</th>
      </tr></thead><tbody id="pk-pick-rows"></tbody></table></div>
    </div>`;
  }

  function fillPicker() {
    const body = $('#pk-pick-rows');
    if (!body) return;
    const q = ($('#pk-search').value || '').trim().toLowerCase();
    const by = $('#pk-sort').value;
    const used = new Set(SLOTS.filter(s => s !== openSlot).map(s => draft[s]));
    const list = day.players
      .filter(p => openSlot === '6TH' || p.positions.includes(openSlot))
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase() === q || p.opp.toLowerCase() === q
                   || name(p.name).toLowerCase().includes(q))
      .sort((a, b) => by === 'ovr' ? (b.ovr || 0) - (a.ovr || 0) : (b.fp_avg ?? -1) - (a.fp_avg ?? -1) || (b.ovr || 0) - (a.ovr || 0));
    body.innerHTML = list.map(p => `<tr data-slug="${esc(p.slug)}" class="${used.has(p.slug) ? 'taken' : ''}"
        title="${used.has(p.slug) ? 'Already in your lineup — picking him here moves him' : ''}">
      <td>${esc(name(p.name))}${p.type === 'two-way' ? ' <span class="ui-badge">2W</span>' : ''}</td>
      <td><span class="pk-meta">${logo(p.team)}${esc(p.team)} ${p.home ? 'vs' : '@'} ${esc(p.opp)}</span></td>
      <td class="col-pos">${esc(p.positions.join('/') || '—')}</td>
      <td class="num col-ovr">${p.ovr ?? '—'}</td>
      <td class="num">${p.gp ? fmt(p.fp_avg) : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="ui-empty">Nobody matches.</td></tr>';
  }

  function wireDay() {
    root.querySelectorAll('.pk-slot').forEach(b => b.onclick = () => {
      openSlot = openSlot === b.dataset.slot ? null : b.dataset.slot;
      renderDay();
    });
    const search = $('#pk-search');
    if (search) {
      fillPicker();
      search.oninput = fillPicker;
      $('#pk-sort').onchange = fillPicker;
      $('#pk-close').onclick = () => { openSlot = null; renderDay(); };
      const unpick = $('#pk-unpick');
      if (unpick) unpick.onclick = () => { delete draft[openSlot]; renderDay(); };
      $('#pk-pick-rows').onclick = e => {
        const tr = e.target.closest('tr[data-slug]');
        if (!tr) return;
        // Picking someone already elsewhere in the lineup moves him here.
        for (const s of SLOTS) if (draft[s] === tr.dataset.slug) delete draft[s];
        draft[openSlot] = tr.dataset.slug;
        openSlot = SLOTS.find(s => !draft[s]) || null;
        renderDay();
      };
      if (window.matchMedia('(min-width: 700px)').matches) search.focus({ preventScroll: true });
      $('.pk-slot.open').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    const reopenBtn = $('#pk-reopen');
    if (reopenBtn) reopenBtn.onclick = async () => {
      const r = await fetch(`/api/pickem/${date}/reopen`, { method: 'POST', headers: authHeaders() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.detail || `Couldn’t reopen (${r.status}).`);
      }
      loadDay();
    };
    const save = $('#pk-save');
    if (save) save.onclick = saveLineup;
    const clear = $('#pk-clear');
    if (clear) clear.onclick = () => { draft = {}; openSlot = 'PG'; renderDay(); };
  }

  async function saveLineup() {
    const msg = $('#pk-msg');
    msg.className = 'pk-msg';
    msg.textContent = 'Saving…';
    const r = await fetch(`/api/pickem/${date}/entry`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineup: draft }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      msg.className = 'pk-msg err';
      msg.textContent = d.detail || `Couldn’t save (${r.status}).`;
      return;
    }
    await loadDay();
  }

  function renderBoard() {
    if (!day.entries.length) return '<div class="ui-empty">Nobody set a lineup this day.</div>';
    let rank = 0, prev = null;
    return day.entries.map((e, i) => {
      if (e.score.total !== prev) { rank = i + 1; prev = e.score.total; }
      const rows = SLOTS.map(s => {
        const v = e.score.slots[s];
        const p = player(v.slug);
        const l = v.line;
        return `<tr><td class="pk-pos">${SLOT_LABEL[s] || s}</td>
          <td><a href="/players/?p=${encodeURIComponent(v.slug)}">${esc(name(p.name))}</a>
            <div class="pk-line">${l ? `${l.m} min · ${l.p} pts · ${l.r} reb · ${l.a} ast · ${l.s} stl · ${l.b} blk · ${l['3pm']} 3PM · ${l.to} TO` : 'No box score line yet'}</div></td>
          <td class="num pk-fp">${fmt(v.fp)}</td></tr>`;
      }).join('');
      return `<details class="pk-entry${rank === 1 && e.score.total > 0 ? ' lead' : ''}${e.member === me() ? ' mine' : ''}"${e.member === me() ? ' open' : ''}>
        <summary><span class="pk-rank">${rank}</span><span class="pk-member">${esc(e.member)}</span><span class="pk-fp">${fmt(e.score.total)}</span></summary>
        <div class="pk-entry-body"><table class="ui-table ui-table--dense"><tbody>${rows}</tbody></table></div>
      </details>`;
    }).join('');
  }

  async function loadStandings() {
    const el = $('#pk-body');
    const r = await fetch('/api/pickem');
    if (!r.ok) { el.innerHTML = '<div class="ui-empty">Couldn’t load the standings.</div>'; return; }
    const st = await r.json();
    if (!st.days.length) { el.innerHTML = `<div class="ui-empty">No locked days yet in ${esc(st.season)}.</div>`; return; }
    const table = (rows, cols) => `<div class="ui-table-wrap"><table class="ui-table ui-table--dense pk-table">
      <thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.get(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const week = st.weeks[0];
    const prize = k => (st.prizes[k] ? ` <span class="ui-badge ui-badge--accent">NB¥${st.prizes[k].toLocaleString()} to the winner</span>` : '');
    el.innerHTML = `<div class="pk-grid">
      <section><h2 class="ui-section-title">Season ${esc(st.season)}${prize('season')}</h2>
        ${table(st.season_totals, [
          { label: '#', get: (r, i) => i + 1 },
          { label: 'Member', get: r => esc(r.member) },
          { label: 'Total', num: true, get: r => fmt(r.total) },
          { label: 'Days', num: true, get: r => r.days },
          { label: 'Avg', num: true, get: r => fmt(r.total / r.days) },
          { label: 'Day wins', num: true, get: r => r.day_wins },
          { label: 'Best', num: true, get: r => fmt(r.best) },
        ])}</section>
      <section><h2 class="ui-section-title">Week of ${esc(dateLabel(week.week_of))}${prize('week')}</h2>
        ${table(week.scores, [
          { label: '#', get: (r, i) => i + 1 },
          { label: 'Member', get: r => esc(r.member) },
          { label: 'Total', num: true, get: r => fmt(r.total) },
        ])}
        <h2 class="ui-section-title">Daily winners${prize('day')}</h2>
        <ul class="pk-wins">${st.days.slice(0, 14).map(d => `<li><a href="?date=${d.date}#pickem" data-date="${d.date}">${esc(dateLabel(d.date))}</a>:
          ${d.winners.length ? esc(d.winners.join(', ')) : 'no scores yet'}${d.scores[0] ? ` · ${fmt(d.scores[0].total)}` : ''}${d.final ? '' : ' (in progress)'}</li>`).join('')}</ul>
      </section></div>`;
    el.querySelectorAll('a[data-date]').forEach(a => a.onclick = e => {
      e.preventDefault();
      view = 'day';
      date = a.dataset.date;
      dateToUrl(date);
      render(root, ctx);
    });
  }

  /** Today's slate for the Action view: GET /api/pickem/{date} as-is. */
  async function today(context) {
    ctx = context;
    const d = await defaultDate();
    const r = await fetch(`/api/pickem/${d}`, { headers: authHeaders() });
    return r.ok ? r.json() : null;
  }

  // Back/forward: the page re-renders the tab, and the day comes from ?date=
  // (none means today, or the next game day).
  window.Pickem = { render, today, showDate: d => { date = d || null; view = 'day'; } };
})();
