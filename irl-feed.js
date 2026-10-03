// IRL feed — real-world game logs and injury news for the players on one
// fantasy roster, from ESPN via /api/irl (nbn-api routers/irl.py). Kept apart
// from NBN's own stats on purpose: it shares no data, table or build step
// with them. Mounted by /nbnfl in its IRL tab:
//
//   IrlFeed.mount(container, { sport: 'nfl', roster: 'CIN' })
//
// Two views: a newest-first feed of one-line summaries (a player's columns
// depend on their role, so a feed of sentences works where one table can't),
// and one player's full log, a table per season with their own columns.
(function () {
  const DAYS_PER_PAGE = 21;
  const TZ = 'America/New_York';   // US leagues date their games in Eastern time
  const POS_ORDER = ['QB', 'RB', 'FB', 'WR', 'TE', 'DE', 'DT', 'NT', 'LB', 'OLB', 'ILB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB', 'PK', 'K', 'P',
                     'PG', 'SG', 'G', 'SF', 'PF', 'F', 'C'];
  const TYPE_LABEL = { post: 'Playoffs', playin: 'Play-In' };

  const CSS = `
    .irl-controls { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-4); }
    .irl-controls .ui-select { width: auto; max-width: 100%; }
    .irl-updated { color: var(--text-muted); font-size: var(--text-xs); }

    .irl-day { margin-bottom: var(--space-5); }
    .irl-day-head {
      display: flex; align-items: baseline; gap: var(--space-2);
      font-weight: 600; font-size: var(--text-sm); color: var(--text-secondary);
      padding-bottom: var(--space-1); border-bottom: 1px solid var(--border); margin-bottom: var(--space-1);
    }
    .irl-day-head .sub { color: var(--text-muted); font-weight: 400; }

    .irl-item { border-bottom: 1px solid var(--border-subtle); }
    .irl-row {
      display: grid; grid-template-columns: 2rem minmax(0, 13rem) minmax(0, 9rem) minmax(0, 1fr);
      align-items: center; gap: var(--space-3);
      padding: var(--space-2) var(--space-1); cursor: pointer;
    }
    .irl-row:hover { background: var(--bg-subtle); }
    .irl-shot { width: 2rem; height: 2rem; border-radius: 50%; object-fit: cover; background: var(--bg-subtle); }
    .irl-who { min-width: 0; }
    .irl-who .name { font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .irl-who .meta { font-size: var(--text-xs); color: var(--text-muted); }
    .irl-game { font-size: var(--text-sm); color: var(--text-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .irl-res-W { color: var(--success); font-weight: 700; }
    .irl-res-L { color: var(--danger); font-weight: 700; }
    .irl-res-T { color: var(--text-muted); font-weight: 700; }
    .irl-line { font-size: var(--text-sm); color: var(--text-primary); font-variant-numeric: tabular-nums; }
    .irl-line.none { color: var(--text-muted); }
    .irl-item.injury .irl-line { color: var(--text-secondary); }
    .irl-detail { padding: 0 var(--space-1) var(--space-3) calc(2rem + var(--space-4)); }
    .irl-detail .ui-table-wrap { margin-top: var(--space-1); }
    .irl-comment { font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; }
    .irl-more { display: flex; justify-content: center; margin: var(--space-4) 0; }

    .irl-card { display: flex; gap: var(--space-4); align-items: center; padding: var(--space-4); margin-bottom: var(--space-4); }
    .irl-card .irl-shot { width: 4rem; height: 4rem; }
    .irl-card .name { font-size: var(--text-lg); font-weight: 700; }
    .irl-card .meta { color: var(--text-muted); font-size: var(--text-sm); }
    .irl-season { margin-bottom: var(--space-5); }
    .irl-season .ui-table th.grp { text-align: center; border-bottom: 1px solid var(--border-subtle); }
    .irl-season .ui-table .grp-start, .irl-detail .ui-table .grp-start { border-left: 1px solid var(--border-subtle); }
    .irl-detail .ui-table th.grp { text-align: center; border-bottom: 1px solid var(--border-subtle); }
    .irl-season .ui-table tr.totals td { font-weight: 600; border-top: 1px solid var(--border); }

    .irl-source { color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--space-6); }

    @media (max-width: 640px) {
      .irl-row { grid-template-columns: 2rem minmax(0, 1fr) auto; }
      .irl-row .irl-line { grid-column: 2 / -1; }
      .irl-detail { padding-left: var(--space-1); }
    }`;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── dates ──────────────────────────────────────────────────────────
  const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayLabelFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const shortDateFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
  const stampFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const dayKey = iso => dayKeyFmt.format(new Date(iso));

  // ── one-line summaries ─────────────────────────────────────────────
  // Built from whichever of these ESPN keys the line has, skipping zeros.
  const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
  const pair = v => String(v ?? '').split('-').map(num);   // "15-22" → [15, 22]

  function summarize(s) {
    const parts = [];
    const has = k => k in s;
    const add = (k, unit) => { if (num(s[k])) parts.push(`${s[k]} ${unit}`); };
    // A passer's `sacks` and `interceptions` are ones taken or thrown; a
    // defender's are ones made. Same keys, so tell them apart here.
    const isPasser = has('passingAttempts');

    // football
    if (isPasser && num(s.passingAttempts)) {
      parts.push(`${s.completions}/${s.passingAttempts}, ${s.passingYards} pass yds`);
      add('passingTouchdowns', 'pass TD'); add('interceptions', 'INT');
    }
    if (num(s.rushingAttempts)) {
      parts.push(`${s.rushingAttempts} car, ${s.rushingYards} rush yds`);
      add('rushingTouchdowns', 'rush TD');
    }
    if (num(s.receptions) || num(s.receivingTargets)) {
      parts.push(`${s.receptions} rec, ${s.receivingYards} yds` + (has('receivingTargets') ? ` (${s.receivingTargets} tgt)` : ''));
      add('receivingTouchdowns', 'rec TD');
    }
    if (!isPasser) {
      add('totalTackles', 'tkl'); add('sacks', 'sk'); add('interceptions', 'INT');
      add('interceptionTouchdowns', 'INT TD'); add('passesDefended', 'PD');
      add('fumblesForced', 'FF'); add('fumblesRecovered', 'FR');
    }
    const fg = s['fieldGoalsMade-fieldGoalAttempts'];
    if (fg != null && pair(fg)[1]) parts.push(`FG ${fg.replace('-', '/')}` + (num(s.longFieldGoalMade) ? ` (long ${s.longFieldGoalMade})` : ''));
    const xp = s['extraPointsMade-extraPointAttempts'];
    if (xp != null && pair(xp)[1]) parts.push(`XP ${xp.replace('-', '/')}`);
    if (num(s.punts)) parts.push(`${s.punts} punts, ${s.grossAvgPuntYards} avg` + (num(s.puntsInside20) ? `, ${s.puntsInside20} inside 20` : ''));
    add('fumblesLost', 'fum lost');

    // basketball
    if (has('points')) {
      parts.push(`${s.points} pts, ${s.totalRebounds} reb, ${s.assists} ast`);
      add('steals', 'stl'); add('blocks', 'blk');
      const fgm = s['fieldGoalsMade-fieldGoalsAttempted'];
      if (fgm) parts.push(`${fgm.replace('-', '/')} FG`);
      if (has('minutes')) parts.push(`${s.minutes} min`);
    }
    return parts.join(' · ');
  }

  const posRank = p => { const i = POS_ORDER.indexOf(p); return i < 0 ? 99 : i; };

  function weekLabel(g) {
    if (g.type !== 'reg') return g.note || TYPE_LABEL[g.type] || '';
    return g.week ? `Week ${g.week}` : '';
  }

  function gameCell(g) {
    const score = g.team_score != null ? ` ${g.team_score}–${g.opp_score}` : '';
    const res = g.result ? `<span class="irl-res-${esc(g.result)}">${esc(g.result)}</span>${esc(score)}` : '';
    return `${esc(g.team)} ${esc(g.at_vs)} ${esc(g.opp)} · ${res}`;
  }

  function injuryText(inj) {
    const parts = [inj.status, inj.detail].filter(Boolean);
    if (inj.return_date) parts.push(`est. return ${shortDateFmt.format(new Date(inj.return_date))}`);
    return parts.join(' · ');
  }

  function statTable(columns, games, { dateCol = true, totals = [] } = {}) {
    if (!columns.length) return `<div class="ui-empty">No stats recorded.</div>`;
    // Group header row ("Passing", "Rushing") when the columns have groups.
    const groups = [];
    columns.forEach((c, i) => {
      const last = groups[groups.length - 1];
      if (last && last.name === c.group) last.span++;
      else groups.push({ name: c.group, span: 1, start: i });
    });
    const starts = new Set(groups.slice(1).map(g => g.start));
    const lead = dateCol ? 2 : 0;
    const grpRow = groups.some(g => g.name)
      ? `<tr>${lead ? `<th colspan="${lead}"></th>` : ''}${groups.map((g, i) =>
          `<th class="grp${i ? ' grp-start' : ''}" colspan="${g.span}">${esc(g.name || '')}</th>`).join('')}</tr>` : '';
    const head = `<tr>${dateCol ? '<th>Date</th><th>Game</th>' : ''}${columns.map((c, i) =>
      `<th class="num${starts.has(i) ? ' grp-start' : ''}" title="${esc(c.key)}">${esc(c.label)}</th>`).join('')}</tr>`;
    const cells = st => columns.map((c, i) => `<td class="num${starts.has(i) ? ' grp-start' : ''}">${esc(st[c.key] ?? '')}</td>`).join('');
    const rows = games.map(g => `<tr>${dateCol
      ? `<td>${esc(shortDateFmt.format(new Date(g.date)))}${g.type !== 'reg' ? ` <span class="ui-badge">${esc(TYPE_LABEL[g.type] || g.type)}</span>` : ''}</td><td>${gameCell(g)}</td>`
      : ''}${cells(g.stats)}</tr>`).join('');
    const tot = totals.map(t => `<tr class="totals">${dateCol
      ? `<td colspan="2">${esc((TYPE_LABEL[t.type] ? TYPE_LABEL[t.type] + ' ' : '') + t.label)}</td>` : ''}${cells(t.stats)}</tr>`).join('');
    return `<div class="ui-table-wrap"><table class="ui-table ui-table--dense"><thead>${grpRow}${head}</thead><tbody>${rows}${tot}</tbody></table></div>`;
  }

  function mount(root, { sport, roster }) {
    if (!document.getElementById('irl-feed-css')) {
      const st = document.createElement('style');
      st.id = 'irl-feed-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.innerHTML = `
      <div class="irl-controls">
        <select class="ui-select" data-irl="player" aria-label="Player"></select>
        <span class="irl-updated" data-irl="updated"></span>
      </div>
      <div data-irl="content"><div class="ui-loading">Loading…</div></div>
      <p class="irl-source">Real-world stats and injury news from ESPN, refreshed hourly. Nothing here touches NBNFL stats.</p>`;
    const $ = k => root.querySelector(`[data-irl="${k}"]`);
    const state = { data: null, player: '', days: DAYS_PER_PAGE, open: new Set() };

    // Players with a stat line, in position order. A lineman or long snapper
    // never has one; they stay in the roster file but not on the page.
    const shown = () => state.data.players.filter(p => p.has_stats && p.bio)
      .sort((a, b) => posRank(a.bio.pos) - posRank(b.bio.pos) || a.bio.name.localeCompare(b.bio.name));

    function who(p) {
      return `<img class="irl-shot" src="${esc(p.bio.headshot || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="irl-who"><div class="name">${esc(p.bio.name)}</div><div class="meta">${esc(`${p.bio.pos} · ${p.bio.team || 'FA'}`)}</div></div>`;
    }

    function feedItems() {
      const items = [];
      for (const p of shown()) {
        for (const s of p.seasons) {
          for (const g of s.games) items.push({ kind: 'game', date: g.date, p, s, g, id: `${p.espn_id}:${g.id}` });
        }
        const inj = p.bio.injury;
        if (inj && inj.date) items.push({ kind: 'injury', date: inj.date, p, inj, id: `${p.espn_id}:inj` });
      }
      // Newest day first; within a day injury news, then position order.
      items.sort((a, b) => {
        const d = dayKey(b.date).localeCompare(dayKey(a.date));
        if (d) return d;
        if (a.kind !== b.kind) return a.kind === 'injury' ? -1 : 1;
        return posRank(a.p.bio.pos) - posRank(b.p.bio.pos) || a.p.bio.name.localeCompare(b.p.bio.name);
      });
      return items;
    }

    function gameItem({ p, s, g, id }) {
      const line = summarize(g.stats);
      const empty = Object.keys(g.stats).length ? 'No stats of note' : 'Played — no stats recorded';
      return `<div class="irl-item" data-id="${esc(id)}">
        <div class="irl-row">
          ${who(p)}
          <div class="irl-game">${gameCell(g)}</div>
          <div class="irl-line${line ? '' : ' none'}">${esc(line || empty)}</div>
        </div>
        ${state.open.has(id) ? `<div class="irl-detail">${statTable(s.columns, [g], { dateCol: false })}</div>` : ''}
      </div>`;
    }

    function injuryItem({ p, inj, id }) {
      return `<div class="irl-item injury" data-id="${esc(id)}">
        <div class="irl-row">
          ${who(p)}
          <div class="irl-game"><span class="ui-badge ui-badge--danger">${esc(inj.abbr || 'Injury')}</span></div>
          <div class="irl-line">${esc(injuryText(inj))}</div>
        </div>
        ${state.open.has(id) && inj.comment ? `<div class="irl-detail"><div class="irl-comment">${esc(inj.comment)}</div></div>` : ''}
      </div>`;
    }

    function renderFeed() {
      const items = feedItems();
      if (!items.length) { $('content').innerHTML = `<div class="ui-empty">No games yet.</div>`; return; }
      const days = [];
      for (const it of items) {
        const k = dayKey(it.date);
        if (!days.length || days[days.length - 1].key !== k) days.push({ key: k, date: it.date, items: [] });
        days[days.length - 1].items.push(it);
      }
      const html = days.slice(0, state.days).map(d => {
        const weeks = [...new Set(d.items.filter(i => i.kind === 'game').map(i => weekLabel(i.g)).filter(Boolean))];
        return `<section class="irl-day">
          <div class="irl-day-head">${esc(dayLabelFmt.format(new Date(d.date)))}${weeks.length ? `<span class="sub">${esc(weeks.join(' · '))}</span>` : ''}</div>
          ${d.items.map(it => it.kind === 'game' ? gameItem(it) : injuryItem(it)).join('')}
        </section>`;
      }).join('');
      const more = days.length > state.days
        ? `<div class="irl-more"><button class="ui-btn ui-btn--ghost" data-irl="more">Show older</button></div>` : '';
      $('content').innerHTML = html + more;
      if (more) $('more').addEventListener('click', () => { state.days += DAYS_PER_PAGE; renderFeed(); });
      $('content').querySelectorAll('.irl-row').forEach(row => row.addEventListener('click', () => {
        const id = row.parentElement.dataset.id;
        state.open.has(id) ? state.open.delete(id) : state.open.add(id);
        renderFeed();
      }));
    }

    function renderPlayer(p) {
      const b = p.bio;
      const meta = [b.pos, b.team_name || 'Free agent', b.jersey ? `#${b.jersey}` : '', b.age ? `age ${b.age}` : '', b.experience]
        .filter(Boolean).join(' · ');
      const inj = b.injury
        ? `<div class="meta"><span class="ui-badge ui-badge--danger">${esc(b.injury.abbr || 'Injury')}</span> ${esc(injuryText(b.injury))}</div>
           ${b.injury.comment ? `<div class="irl-comment">${esc(b.injury.comment)}</div>` : ''}` : '';
      const card = `<div class="ui-card irl-card">
        <img class="irl-shot" src="${esc(b.headshot || '')}" alt="" onerror="this.style.visibility='hidden'">
        <div><div class="name">${esc(b.name)}</div><div class="meta">${esc(meta)}</div>${inj}</div>
      </div>`;
      // Totals are ESPN's for the whole season, so only shown when no games
      // were trimmed off (`max_games` unset).
      const seasons = p.seasons.filter(s => s.games.length).map(s =>
        `<section class="irl-season"><h3 class="ui-section-title">${esc(s.label)}</h3>
          ${statTable(s.columns, s.games, { totals: state.data.max_games == null ? s.totals : [] })}</section>`).join('');
      $('content').innerHTML = card + (seasons || `<div class="ui-empty">No games in the seasons kept here.</div>`);
    }

    function render() {
      const p = state.player && state.data.players.find(x => x.espn_id === state.player);
      p ? renderPlayer(p) : renderFeed();
    }

    (async () => {
      try {
        const r = await fetch(`/api/irl/${encodeURIComponent(sport)}/${encodeURIComponent(roster)}`);
        if (!r.ok) throw new Error(r.status);
        state.data = await r.json();
      } catch (e) {
        $('content').innerHTML = `<div class="ui-empty">Couldn’t load the IRL stats.</div>`;
        return;
      }
      $('player').innerHTML = `<option value="">All players</option>` + shown().map(p =>
        `<option value="${esc(p.espn_id)}">${esc(p.bio.name)} · ${esc(p.bio.pos)}</option>`).join('');
      $('player').addEventListener('change', e => {
        state.player = e.target.value; state.days = DAYS_PER_PAGE; state.open.clear();
        render();
      });
      $('updated').textContent = state.data.updated_at ? `Updated ${stampFmt.format(new Date(state.data.updated_at))}` : '';
      render();
    })();
  }

  window.IrlFeed = { mount, summarize };
})();
