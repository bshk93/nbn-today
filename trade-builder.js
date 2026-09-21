// trade-builder.js — the multi-team trade construction UI, extracted from
// transaction-sim/index.html's trade mode so any page can host it, not just
// the simulator. One implementation: team/asset selection, exceptions/TPE,
// sign-and-trade terms, live /api/validate/trade checks, .xlsx export,
// Google Sheets publish, and Submit to TRC — nothing trimmed from what the
// simulator's trade mode already does.
//
// Usage: TradeBuilder.mount(containerEl, { presetTeams: ['PHX'] }) — injects
// its own styles (once) and markup into containerEl, wires everything up,
// and returns once initial data (bios, OVRs, league year) has loaded.
// Depends on two globals the host page must load as plain <script> tags,
// same as transaction-sim does: /league-time.js (nbnToday/nbnFormatDateTime)
// and /transaction-sim/xlsx.js (XLSXMini). Mount only one instance per page —
// like the page this was extracted from, it's a singleton by construction
// (fixed element ids), not a repeatable component.

(function () {
  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .tb-teams-container { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem; align-items: flex-start; }
      .tb-team-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; flex: 1 1 280px; min-width: 260px; max-width: 360px; }
      .tb-team-panel-header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 0.6rem; }
      .tb-team-sel { flex: 1; background: var(--bg-page); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 0.9rem; padding: 0.35rem 0.5rem; font-family: inherit; outline: none; cursor: pointer; }
      .tb-team-sel:focus { border-color: var(--accent); }
      .tb-team-logo { width: 24px; height: 24px; object-fit: contain; }
      .tb-remove-team-btn { flex-shrink: 0; background: none; border: none; color: var(--text-muted); font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 0.1rem 0.3rem; border-radius: 4px; }
      .tb-remove-team-btn:hover { color: var(--danger); background: var(--danger-bg); }
      .tb-exc-sel { width: 100%; margin-top: 0.5rem; background: var(--bg-page); border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); font-size: 0.78rem; padding: 0.3rem 0.5rem; font-family: inherit; outline: none; cursor: pointer; display: none; }
      .tb-exc-sel:focus { border-color: var(--accent); }
      .tb-exc-sel option { color: var(--text-primary); }
      .tb-panel-body { padding: 0.5rem 0; max-height: 400px; overflow-y: auto; }
      .tb-panel-section-label { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); padding: 0.5rem 1rem 0.2rem; }
      .tb-trade-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 1rem; cursor: pointer; transition: background 0.08s; flex-wrap: wrap; }
      .tb-trade-row:hover { background: var(--bg-hover); }
      .tb-trade-row input[type=checkbox] { accent-color: var(--market-positive); flex-shrink: 0; width: 14px; height: 14px; cursor: pointer; }
      .tb-trade-row-name { flex: 1; font-size: 0.85rem; color: var(--text-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .tb-trade-row-meta { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }
      .tb-trade-row.checked .tb-trade-row-name { color: var(--text-primary); font-weight: 600; }
      .tb-trade-row.checked .tb-trade-row-meta { color: var(--market-positive); }
      .tb-panel-empty, .tb-panel-loading { padding: 1.25rem 1rem; font-size: 0.82rem; color: var(--text-muted); text-align: center; }
      .tb-dest-sel { width: 100%; margin-top: 0.15rem; background: var(--bg-page); border: 1px solid #f59e0b55; border-radius: 5px; color: var(--gold); font-size: 0.74rem; padding: 0.2rem 0.35rem; font-family: inherit; cursor: pointer; }
      .tb-dest-sel.unset { border-color: #f8717199; color: var(--danger-light); }
      .tb-add-team-row { margin-bottom: 1.25rem; }
      .tb-add-team-btn { background: var(--bg-card); border: 1px dashed var(--text-dim); border-radius: 8px; color: var(--text-muted); font-size: 0.82rem; padding: 0.5rem 1rem; cursor: pointer; font-family: inherit; }
      .tb-add-team-btn:hover { border-color: var(--text-muted); color: var(--text-secondary); }
      .tb-add-team-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .tb-type-badge { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.05rem 0.35rem; border-radius: 4px; margin-right: 0.4rem; flex-shrink: 0; }
      .tb-type-player      { background: var(--bg-card); color: var(--accent-light); }
      .tb-type-two-way     { background: var(--bg-card); color: var(--purple-light); }
      .tb-type-draft-rights { background: var(--bg-card); color: #fcd34d; }
      .tb-type-cap-hold    { background: var(--gold-bg); color: var(--danger-alt); }
      .tb-type-dead        { background: var(--danger-bg); color: var(--danger); }
      .tb-sat-form { margin: 0.2rem 1rem 0.6rem; padding: 0.6rem 0.7rem; background: var(--bg-page); border: 1px solid #f59e0b55; border-radius: 8px; width: 100%; }
      .tb-sat-form-title { font-size: 0.7rem; font-weight: 700; color: var(--gold); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
      .tb-sat-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; flex-wrap: wrap; }
      .tb-sat-row label { font-size: 0.72rem; color: var(--text-muted); flex-shrink: 0; }
      .tb-sat-row select, .tb-sat-row input[type=number] { background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px; color: var(--text-primary); font-size: 0.78rem; padding: 0.25rem 0.4rem; font-family: inherit; }
      .tb-sat-salary-input { width: 110px; }
      .tb-sat-salary-label { font-size: 0.68rem; color: var(--text-muted); margin-right: 0.15rem; }
      .tb-check-status { text-align: center; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.25rem; min-height: 1.1rem; }
      .tb-check-status.evaluating { color: var(--text-muted); }
      .tb-check-status.err { color: var(--danger); }
      .tb-results { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
      .tb-results-header { padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
      .tb-results-header .tb-rh-title { flex: 1; min-width: 0; }
      .tb-export-btn { flex-shrink: 0; background: var(--bg-page); border: 1px solid var(--border); border-radius: 6px; color: var(--text-secondary); font-family: inherit; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.3rem 0.7rem; cursor: pointer; }
      .tb-export-btn:hover { border-color: var(--accent); color: var(--text-primary); }
      .tb-export-btn.primary { border-color: var(--accent); color: var(--link); }
      .tb-export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .tb-export-status { padding: 0 1.25rem; font-size: 0.8rem; color: var(--text-muted); text-transform: none; letter-spacing: 0; font-weight: 400; }
      .tb-export-status:not(:empty) { padding: 0.6rem 1.25rem; border-bottom: 1px solid var(--border); }
      .tb-export-status a { color: var(--link); font-weight: 600; }
      .tb-export-status.err { color: var(--danger); }
      .tb-results-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
      .tb-result-col { padding: 1rem 1.25rem; border-left: 1px solid var(--border); }
      .tb-result-col:first-child { border-left: none; }
      .tb-result-team { font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; }
      .tb-result-row { display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.35rem; color: var(--text-secondary); }
      .tb-result-row .label { color: var(--text-muted); }
      .tb-result-divider { border: none; border-top: 1px solid var(--border); margin: 0.6rem 0; }
      .tb-result-note { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.4rem; line-height: 1.5; }
      .tb-results-summary { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border); font-size: 0.82rem; color: var(--text-muted); }
      .tb-results-summary strong { color: var(--text-primary); }
      .tb-vc-list { border-top: 1px solid var(--border); padding: 0.7rem 1.25rem; display: flex; flex-direction: column; gap: 0.35rem; }
      .tb-vc-row { display: flex; gap: 0.5rem; font-size: 0.82rem; line-height: 1.45; align-items: flex-start; }
      .tb-vc-icon { flex-shrink: 0; font-weight: 700; width: 1rem; text-align: center; }
      .tb-vc-row.pass { color: var(--text-secondary); }    .tb-vc-row.pass .tb-vc-icon { color: var(--success); }
      .tb-vc-row.warning { color: #fcd34d; } .tb-vc-row.warning .tb-vc-icon { color: var(--gold); }
      .tb-vc-row.error { color: var(--danger-light); }   .tb-vc-row.error .tb-vc-icon { color: var(--danger); }
    `;
    document.head.appendChild(style);
  }

  const TEAMS = {
    ATL:"Atlanta Hawks",BKN:"Brooklyn Nets",BOS:"Boston Celtics",CHA:"Charlotte Hornets",
    CHI:"Chicago Bulls",CLE:"Cleveland Cavaliers",DAL:"Dallas Mavericks",DEN:"Denver Nuggets",
    DET:"Detroit Pistons",GSW:"Golden State Warriors",HOU:"Houston Rockets",IND:"Indiana Pacers",
    LAC:"LA Clippers",LAL:"Los Angeles Lakers",MEM:"Memphis Grizzlies",MIA:"Miami Heat",
    MIL:"Milwaukee Bucks",MIN:"Minnesota Timberwolves",NOP:"New Orleans Pelicans",NYK:"New York Knicks",
    OKC:"Oklahoma City Thunder",ORL:"Orlando Magic",PHI:"Philadelphia 76ers",PHX:"Phoenix Suns",
    POR:"Portland Trail Blazers",SAC:"Sacramento Kings",SAS:"San Antonio Spurs",TOR:"Toronto Raptors",
    UTA:"Utah Jazz",WAS:"Washington Wizards",
  };
  const _FA_HOLD_TYPES = ['UFA', 'RFA'];
  const BLOCK_W = 5;
  const BLOCK_COL_W = [17, 11, 8, 12, 12];
  const HC_LABEL = { first_apron: 'First Apron', second_apron: 'Second Apron' };
  const EXC_META = {
    ntmle:          ['Non-Taxpayer MLE',    'ntmle_amount'],
    tmle:           ['Taxpayer MLE',        'tmle_amount'],
    room_exception: ['Room Exception',      'room_amount'],
    bae:            ['Bi-Annual Exception', 'bae_amount'],
  };
  const _THRU_FLAG = { PLAYER_OPT: 'PO', TEAM_OPT: 'TO', NON_GTD: 'NG' };

  async function mount(container, opts) {
    opts = opts || {};
    injectStyles();

    // ── Per-mount state ──────────────────────────────────────────────────────
    let allBios = {}, allOvr = {};
    let rosterData = {}, picksData = {}, tpeData = {};
    let teamSlots = [];      // ordered array of slot ids, e.g. ['t1', 't2', 't3']
    let slotTeam = {};       // slotId -> abbr ('' if unset)
    let nextSlotId = 1;
    let selections = {};     // slotId -> { players: Map<slug, destAbbr|null>, picks: Map<pickKey, destAbbr|null> }
    let signTerms = {};      // slug -> { years, salaries: [y1,y2,...], birdType, method }
    let LEAGUE_YEAR = null;
    let lastResult = null;
    let me = { name: null, roles: [], owner_of: [] };
    let validateTimer = null;
    let validateSeq = 0;

    container.innerHTML = `
      <div class="tb-teams-container" id="tb-teams-container"></div>
      <div class="tb-add-team-row"><button type="button" class="tb-add-team-btn" id="tb-add-team-btn">+ Add another team</button></div>
      <div class="tb-check-status" id="tb-check-status">Select at least two teams and pick assets — the rubric evaluates live.</div>
      <div class="tb-results" id="tb-results" style="display:none"></div>
    `;

    // ── Shared utilities ─────────────────────────────────────────────────────

    async function loadMe() {
      const token = localStorage.getItem('nbn_token');
      try {
        me = await fetch('/api/auth/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then(r => r.json());
        me.owner_of = me.owner_of || [];
      } catch (e) {
        me = { name: null, roles: [], owner_of: [] };
      }
    }

    function parseSalaryNum(v) {
      if (!v) return 0;
      const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
      return isNaN(n) ? 0 : Math.round(n);
    }

    function fmtM(n) {
      if (!n) return '$0';
      return '$' + (n / 1e6).toFixed(1) + 'M';
    }

    function displayName(raw) {
      if (!raw) return '';
      const [last, first] = raw.split(', ');
      const tc = s => s.toLowerCase().replace(/(^|[\s\-'’])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
      return first ? `${tc(first)} ${tc(last)}` : tc(last);
    }

    function curYr() {
      if (LEAGUE_YEAR) return LEAGUE_YEAR;
      const now = new Date(), y = now.getFullYear() % 100, m = now.getMonth() + 1;
      return m < 7 ? `${String(y-1).padStart(2,'0')}-${String(y).padStart(2,'0')}` : `${String(y).padStart(2,'0')}-${String((y+1)%100).padStart(2,'0')}`;
    }

    function seasonAfter(s) {
      const [a, b] = s.split('-').map(Number);
      return `${String((a + 1) % 100).padStart(2, '0')}-${String((b + 1) % 100).padStart(2, '0')}`;
    }

    function typeLabel(p) {
      if (p.capHold) return `Cap Hold (${p.capHold})`;
      if (p.type === 'two-way') return 'Two-Way';
      if (p.type === 'draft-rights') return 'Draft Rights';
      if (p.type === 'dead') return 'Dead Cap';
      return 'Player';
    }

    function typeBadgeClass(p) {
      if (p.capHold) return 'tb-type-cap-hold';
      if (p.type === 'two-way') return 'tb-type-two-way';
      if (p.type === 'draft-rights') return 'tb-type-draft-rights';
      if (p.type === 'dead') return 'tb-type-dead';
      return 'tb-type-player';
    }

    function parseCSV(text) {
      if (typeof window.parseCSV === 'function') return window.parseCSV(text);
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      return lines.slice(1).map(line => {
        const vals = []; let cur = '', inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; } else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; } else { cur += ch; }
        }
        vals.push(cur.trim());
        const obj = {}; headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return obj;
      });
    }

    // ── Team slot management ─────────────────────────────────────────────────

    function otherAssignedTeams(excludeSlotId) {
      return teamSlots
        .filter(id => id !== excludeSlotId && slotTeam[id])
        .map(id => slotTeam[id]);
    }

    function rebuildTeamSelectOptions() {
      teamSlots.forEach(slotId => {
        const sel = document.getElementById(`tb-sel-${slotId}`);
        if (!sel) return;
        const taken = new Set(otherAssignedTeams(slotId));
        const current = slotTeam[slotId] || '';
        sel.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = '— Select team —';
        sel.appendChild(placeholder);
        Object.entries(TEAMS).sort(([,a],[,b]) => a.localeCompare(b)).forEach(([abbr, name]) => {
          if (taken.has(abbr) && abbr !== current) return;
          const opt = document.createElement('option');
          opt.value = abbr; opt.textContent = name;
          sel.appendChild(opt);
        });
        sel.value = current;
      });
      const anyUnassigned = Object.values(TEAMS).length > teamSlots.filter(id => slotTeam[id]).length;
      document.getElementById('tb-add-team-btn').disabled = !anyUnassigned;
    }

    function addTeamSlot(abbr) {
      const slotId = `t${nextSlotId++}`;
      teamSlots.push(slotId);
      slotTeam[slotId] = '';
      selections[slotId] = { players: new Map(), picks: new Map() };

      const card = document.createElement('div');
      card.className = 'tb-team-panel';
      card.id = `tb-panel-${slotId}`;
      card.innerHTML = `
        <div class="tb-team-panel-header">
          <img class="tb-team-logo" id="tb-logo-${slotId}" src="" alt="" style="display:none">
          <select class="tb-team-sel" id="tb-sel-${slotId}"><option value="">— Select team —</option></select>
          <button type="button" class="tb-remove-team-btn" id="tb-rm-${slotId}" title="Remove team">✕</button>
        </div>
        <select class="tb-exc-sel" id="tb-exc-${slotId}">
          <option value="">No exception used</option>
          <option value="ntmle">Non-Taxpayer MLE</option>
          <option value="tmle">Taxpayer MLE</option>
          <option value="room_exception">Room Exception</option>
          <option value="bae">Bi-Annual Exception</option>
        </select>
        <div class="tb-panel-body" id="tb-body-${slotId}"><div class="tb-panel-empty">Select a team to see their roster.</div></div>
      `;
      document.getElementById('tb-teams-container').appendChild(card);

      document.getElementById(`tb-sel-${slotId}`).addEventListener('change', e => loadTeam(slotId, e.target.value));
      document.getElementById(`tb-exc-${slotId}`).addEventListener('change', updateCheckBtn);
      document.getElementById(`tb-rm-${slotId}`).addEventListener('click', () => removeTeamSlot(slotId));

      if (abbr) {
        document.getElementById(`tb-sel-${slotId}`).value = abbr;
        loadTeam(slotId, abbr);
      }
      updateRemoveButtons();
      return slotId;
    }

    function removeTeamSlot(slotId) {
      if (teamSlots.length <= 2) return;
      teamSlots = teamSlots.filter(id => id !== slotId);
      delete slotTeam[slotId];
      delete selections[slotId];
      document.getElementById(`tb-panel-${slotId}`)?.remove();
      updateRemoveButtons();
      rebuildTeamSelectOptions();
      renderAllPanels();
      updateCheckBtn();
    }

    function updateRemoveButtons() {
      const show = teamSlots.length > 2;
      teamSlots.forEach(slotId => {
        const btn = document.getElementById(`tb-rm-${slotId}`);
        if (btn) btn.style.visibility = show ? 'visible' : 'hidden';
      });
    }

    async function loadTeam(slotId, abbr) {
      const body = document.getElementById(`tb-body-${slotId}`);
      const logo = document.getElementById(`tb-logo-${slotId}`);
      const exc = document.getElementById(`tb-exc-${slotId}`);
      exc.value = '';
      slotTeam[slotId] = abbr || '';
      selections[slotId] = { players: new Map(), picks: new Map() };

      if (!abbr) {
        body.innerHTML = '<div class="tb-panel-empty">Select a team to see their roster.</div>';
        logo.style.display = 'none'; exc.style.display = 'none';
        rebuildTeamSelectOptions(); renderAllPanels(); updateCheckBtn();
        return;
      }

      logo.src = `/logos/logo-${abbr.toLowerCase()}.png`;
      logo.alt = abbr; logo.style.display = '';
      exc.style.display = 'block';
      body.innerHTML = '<div class="tb-panel-loading">Loading…</div>';

      const yr = curYr();
      const [rosterText, picksJson, tpeJson] = await Promise.all([
        fetch(`/data/${abbr.toLowerCase()}-roster.csv`).then(r => r.ok ? r.text() : '').catch(() => ''),
        fetch(`/api/picks/${abbr}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/trade-exceptions/${abbr}`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);

      const roster = rosterText ? parseCSV(rosterText) : [];
      rosterData[abbr] = roster.map(r => {
        const bio = allBios[r.SLUG] || {};
        const sal = parseSalaryNum((bio.salaries || {})[yr]);
        const holdType = (bio.cap_holds || {})[yr];
        const capHold = _FA_HOLD_TYPES.includes(holdType) ? holdType : null;
        return { slug: r.SLUG, ovr: allOvr[r.SLUG] || 0, name: bio.name || r.SLUG, salary: sal, type: bio.type || 'player', capHold, pos: (bio.pos || []).join('/') };
      }).filter(r => r.type !== 'dead').sort((a, b) => b.ovr - a.ovr);

      picksData[abbr] = dedupeByGroup(
        picksJson.filter(p => !p.player && !p.legacy && !p.frozen),
        abbr
      ).sort((a, b) => a.year - b.year || a.round - b.round);

      tpeData[abbr] = (Array.isArray(tpeJson) ? tpeJson : []).filter(e => !e.expired && e.remaining > 0);
      populateExceptionSelect(slotId, abbr);

      rebuildTeamSelectOptions();
      renderAllPanels();
      updateCheckBtn();
    }

    function populateExceptionSelect(slotId, abbr) {
      const sel = document.getElementById(`tb-exc-${slotId}`);
      Array.from(sel.options).forEach(o => { if (o.value.startsWith('tpe:')) o.remove(); });
      (tpeData[abbr] || []).forEach(e => {
        const opt = document.createElement('option');
        opt.value = `tpe:${e.id}`;
        opt.textContent = `TPE: ${fmtM(e.remaining)} remaining (exp. ${e.expires_date})`;
        sel.appendChild(opt);
      });
    }

    function pickKey(p) { return `${p.year}-${p.round}-${p.orig}`; }

    function dedupeByGroup(picks, teamAbbr) {
      const groups = new Map();
      const out = [];
      picks.forEach(p => {
        if (!p.group_id) { out.push(p); return; }
        if (!groups.has(p.group_id)) groups.set(p.group_id, []);
        groups.get(p.group_id).push(p);
      });
      groups.forEach(members => {
        const leaves = members[0].leaves || [];
        const myLeafCount = leaves.filter(l => l.team === teamAbbr).length;
        if (myLeafCount > 1) { out.push(...members); return; }
        out.push(members.find(p => p.orig === teamAbbr) || members[0]);
      });
      return out;
    }

    function pickLeafId(p, teamAbbr) {
      const mine = (p.leaves || []).filter(l => l.team === teamAbbr);
      return mine.length === 1 ? mine[0].leaf_id : null;
    }

    function pickLabel(p, teamAbbr) {
      const rnd = p.round === 1 ? '1st' : '2nd';
      const base = `${p.year} ${rnd}`;
      const mine = (p.leaves || []).filter(l => l.team === teamAbbr);
      if (mine.length) {
        const desc = mine.map(l => l.description).join(' / ');
        return `${base} · ${p.orig} orig · ${desc}`;
      }
      if (p.orig !== teamAbbr) return `${base} · from ${p.orig}`;
      return base;
    }

    function defaultYear1(slug) {
      const bio = allBios[slug] || {};
      const seasons = Object.keys(bio.salaries || {}).filter(s => s < curYr()).sort();
      return seasons.length ? parseSalaryNum(bio.salaries[seasons[seasons.length - 1]]) : 3000000;
    }

    function ensureSignTerms(slug) {
      if (signTerms[slug]) return signTerms[slug];
      const y1 = defaultYear1(slug) || 3000000;
      const maxStep = Math.round(y1 * 0.05);
      signTerms[slug] = {
        years: 3,
        salaries: [y1, y1 + maxStep, y1 + 2 * maxStep],
        birdType: 'EQVFA',
        method: '',
      };
      return signTerms[slug];
    }

    function buildSignForm(slug, slotId, teamAbbr, yr) {
      const terms = ensureSignTerms(slug);
      const wrap = document.createElement('div');
      wrap.className = 'tb-sat-form';

      const title = document.createElement('div');
      title.className = 'tb-sat-form-title';
      title.textContent = `Sign-and-Trade Terms — ${displayName((allBios[slug] || {}).name || slug)}`;
      wrap.appendChild(title);

      const row1 = document.createElement('div'); row1.className = 'tb-sat-row';
      const yrsLabel = document.createElement('label'); yrsLabel.textContent = 'Years:';
      const yrsSel = document.createElement('select');
      [3, 4].forEach(n => {
        const opt = document.createElement('option'); opt.value = n; opt.textContent = `${n} years`;
        if (terms.years === n) opt.selected = true;
        yrsSel.appendChild(opt);
      });
      yrsSel.addEventListener('change', () => {
        const n = +yrsSel.value;
        const maxStep = Math.round(terms.salaries[0] * 0.05);
        while (terms.salaries.length < n) terms.salaries.push(terms.salaries[terms.salaries.length - 1] + maxStep);
        terms.salaries.length = n;
        terms.years = n;
        renderPanel(slotId, teamAbbr, yr);
        updateCheckBtn();
      });

      const birdLabel = document.createElement('label'); birdLabel.textContent = 'Bird rights:';
      const birdSel = document.createElement('select');
      [['EQVFA', 'Early Bird (EQVFA)'], ['QVFA', 'Full Bird (QVFA)']].forEach(([v, t]) => {
        const opt = document.createElement('option'); opt.value = v; opt.textContent = t;
        if (terms.birdType === v) opt.selected = true;
        birdSel.appendChild(opt);
      });
      birdSel.addEventListener('change', () => { terms.birdType = birdSel.value; updateCheckBtn(); });

      const methodLabel = document.createElement('label'); methodLabel.textContent = 'Funded by:';
      const methodSel = document.createElement('select');
      [['', 'Cap space'], ['room_exception', 'Room Exception'], ['bae', 'Bi-Annual Exception']].forEach(([v, t]) => {
        const opt = document.createElement('option'); opt.value = v; opt.textContent = t;
        if (terms.method === v) opt.selected = true;
        methodSel.appendChild(opt);
      });
      methodSel.addEventListener('change', () => { terms.method = methodSel.value; updateCheckBtn(); });

      row1.appendChild(yrsLabel); row1.appendChild(yrsSel);
      row1.appendChild(birdLabel); row1.appendChild(birdSel);
      row1.appendChild(methodLabel); row1.appendChild(methodSel);
      wrap.appendChild(row1);

      const row2 = document.createElement('div'); row2.className = 'tb-sat-row';
      let season = yr;
      for (let i = 0; i < terms.years; i++) {
        const sLabel = document.createElement('span'); sLabel.className = 'tb-sat-salary-label'; sLabel.textContent = `${season}:`;
        const input = document.createElement('input');
        input.type = 'number'; input.className = 'tb-sat-salary-input'; input.step = '1000';
        input.value = terms.salaries[i] || 0;
        const idx = i;
        input.addEventListener('input', () => { terms.salaries[idx] = +input.value || 0; updateCheckBtn(); });
        row2.appendChild(sLabel); row2.appendChild(input);
        season = seasonAfter(season);
      }
      wrap.appendChild(row2);

      return wrap;
    }

    function renderAllPanels() {
      teamSlots.forEach(slotId => {
        const abbr = slotTeam[slotId];
        if (abbr) renderPanel(slotId, abbr, curYr());
      });
    }

    function buildDestSelect(slotId, others, selMap, key) {
      if (others.length <= 1) {
        selMap.set(key, others[0] || null);
        return null;
      }
      if (selMap.get(key) && !others.includes(selMap.get(key))) selMap.set(key, null);
      const dest = document.createElement('select');
      dest.className = 'tb-dest-sel' + (selMap.get(key) ? '' : ' unset');
      const placeholder = document.createElement('option');
      placeholder.value = ''; placeholder.textContent = '→ choose destination…';
      dest.appendChild(placeholder);
      others.forEach(ab => {
        const opt = document.createElement('option'); opt.value = ab; opt.textContent = `→ ${TEAMS[ab] || ab}`;
        dest.appendChild(opt);
      });
      dest.value = selMap.get(key) || '';
      dest.addEventListener('click', e => e.stopPropagation());
      dest.addEventListener('change', () => {
        selMap.set(key, dest.value || null);
        dest.classList.toggle('unset', !dest.value);
        updateCheckBtn();
      });
      return dest;
    }

    function renderPanel(slotId, abbr, yr) {
      const body = document.getElementById(`tb-body-${slotId}`);
      body.innerHTML = '';
      const roster = rosterData[abbr] || [];
      const picks = picksData[abbr] || [];
      const others = otherAssignedTeams(slotId);
      const sel = selections[slotId];

      if (!roster.length && !picks.length) { body.innerHTML = '<div class="tb-panel-empty">No roster data.</div>'; return; }

      if (roster.length) {
        const lbl = document.createElement('div'); lbl.className = 'tb-panel-section-label'; lbl.textContent = 'Players'; body.appendChild(lbl);
        roster.forEach(p => {
          const row = document.createElement('label');
          row.className = 'tb-trade-row' + (sel.players.has(p.slug) ? ' checked' : '');
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = sel.players.has(p.slug);
          cb.addEventListener('change', () => {
            if (cb.checked) sel.players.set(p.slug, sel.players.get(p.slug) || null);
            else sel.players.delete(p.slug);
            row.classList.toggle('checked', cb.checked);
            renderPanel(slotId, abbr, yr);
            updateCheckBtn();
          });
          const badge = document.createElement('span'); badge.className = `tb-type-badge ${typeBadgeClass(p)}`; badge.textContent = typeLabel(p);
          const nameSpan = document.createElement('span'); nameSpan.className = 'tb-trade-row-name'; nameSpan.textContent = displayName(p.name);
          const meta = document.createElement('span'); meta.className = 'tb-trade-row-meta';
          meta.textContent = `${p.pos ? p.pos + ' · ' : ''}${p.salary ? fmtM(p.salary) : 'no sal'}`;
          row.appendChild(cb); row.appendChild(badge); row.appendChild(nameSpan); row.appendChild(meta);
          body.appendChild(row);

          if (sel.players.has(p.slug)) {
            const dest = buildDestSelect(slotId, others, sel.players, p.slug);
            if (dest) body.appendChild(dest);
            if (p.capHold) body.appendChild(buildSignForm(p.slug, slotId, abbr, yr));
          }
        });
      }

      if (picks.length) {
        const lbl = document.createElement('div'); lbl.className = 'tb-panel-section-label'; lbl.textContent = 'Draft Picks'; body.appendChild(lbl);
        picks.forEach(p => {
          const key = pickKey(p);
          const row = document.createElement('label');
          row.className = 'tb-trade-row' + (sel.picks.has(key) ? ' checked' : '');
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = sel.picks.has(key);
          cb.addEventListener('change', () => {
            if (cb.checked) sel.picks.set(key, sel.picks.get(key) || null);
            else sel.picks.delete(key);
            row.classList.toggle('checked', cb.checked);
            renderPanel(slotId, abbr, yr);
            updateCheckBtn();
          });
          const nameSpan = document.createElement('span'); nameSpan.className = 'tb-trade-row-name'; nameSpan.textContent = pickLabel(p, abbr);
          row.appendChild(cb); row.appendChild(nameSpan);
          body.appendChild(row);

          if (sel.picks.has(key)) {
            const dest = buildDestSelect(slotId, others, sel.picks, key);
            if (dest) body.appendChild(dest);
          }
        });
      }
    }

    // ── Live trade check ─────────────────────────────────────────────────────

    function updateCheckBtn() {
      clearTimeout(validateTimer);
      validateTimer = setTimeout(runCheck, 250);
    }

    function setStatus(msg, cls) {
      const el = document.getElementById('tb-check-status');
      el.className = 'tb-check-status' + (cls ? ' ' + cls : '');
      el.textContent = msg;
    }

    function buildTransfers() {
      const grouped = new Map();
      teamSlots.forEach(slotId => {
        const from = slotTeam[slotId];
        if (!from) return;
        const sel = selections[slotId];
        sel.players.forEach((destAbbr, slug) => {
          if (!destAbbr) return;
          const key = `${from}→${destAbbr}`;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push({ type: 'player', slug });
        });
        sel.picks.forEach((destAbbr, pkey) => {
          if (!destAbbr) return;
          const p = (picksData[from] || []).find(x => pickKey(x) === pkey);
          if (!p) return;
          const asset = { type: 'pick', year: p.year, round: p.round, orig: p.orig };
          const leafId = pickLeafId(p, from);
          if (leafId) asset.leaf_id = leafId;
          const key = `${from}→${destAbbr}`;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(asset);
        });
      });
      return Array.from(grouped.entries()).map(([key, assets]) => {
        const [from_team, to_team] = key.split('→');
        return { from_team, to_team, assets };
      });
    }

    function unassignedCount() {
      let n = 0;
      teamSlots.forEach(slotId => {
        if (!slotTeam[slotId]) return;
        const sel = selections[slotId];
        sel.players.forEach(dest => { if (!dest) n++; });
        sel.picks.forEach(dest => { if (!dest) n++; });
      });
      return n;
    }

    async function runCheck() {
      const el = document.getElementById('tb-results');
      const abbrs = teamSlots.map(id => slotTeam[id]).filter(Boolean);

      if (abbrs.length < 2) {
        el.style.display = 'none';
        setStatus('Select at least two teams to evaluate a trade.');
        return;
      }

      const missing = unassignedCount();
      if (missing > 0) {
        el.style.display = 'none';
        setStatus(`Assign a destination for ${missing} selected asset${missing > 1 ? 's' : ''} (look for the "→" dropdown).`);
        return;
      }

      const transfers = buildTransfers();
      if (!transfers.length) {
        el.style.display = 'none';
        setStatus('Pick at least one player or pick to move.');
        return;
      }

      const exceptions = {};
      const tpe_usage = {};
      teamSlots.forEach(slotId => {
        const abbr = slotTeam[slotId];
        if (!abbr) return;
        const val = document.getElementById(`tb-exc-${slotId}`).value;
        if (!val) return;
        if (val.startsWith('tpe:')) tpe_usage[abbr] = val.slice(4);
        else exceptions[abbr] = val;
      });

      const sign_and_trade_players = [];
      const sign_and_trade_signings = [];
      teamSlots.forEach(slotId => {
        const abbr = slotTeam[slotId];
        if (!abbr) return;
        (rosterData[abbr] || []).forEach(p => {
          if (!p.capHold || !selections[slotId].players.has(p.slug)) return;
          const terms = ensureSignTerms(p.slug);
          const salaries = {};
          let season = curYr();
          for (let i = 0; i < terms.years; i++) { salaries[season] = `$${terms.salaries[i] || 0}`; season = seasonAfter(season); }
          sign_and_trade_players.push(p.slug);
          sign_and_trade_signings.push({
            player: p.slug, team: abbr,
            contract: { type: 'player', salaries },
            signing_method: terms.method || null,
            bird_rights_type: terms.birdType,
          });
        });
      });
      const is_sign_and_trade = sign_and_trade_players.length > 0;

      const seq = ++validateSeq;
      setStatus('Evaluating…', 'evaluating');

      const tradeBody = {
        transfers, exceptions, tpe_usage,
        is_sign_and_trade, sign_and_trade_players, sign_and_trade_signings,
      };

      try {
        const res = await fetch('/api/validate/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeBody),
        });
        if (seq !== validateSeq) return;
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          el.style.display = 'none';
          setStatus(`Validation error — ${d.detail || ('HTTP ' + res.status)}`, 'err');
          return;
        }
        setStatus('');
        renderResults(abbrs, await res.json(), tradeBody);
      } catch (e) {
        if (seq !== validateSeq) return;
        el.style.display = 'none';
        setStatus('Network error — could not reach the validator.', 'err');
      }
    }

    function renderResults(abbrs, data, tradeBody) {
      const el = document.getElementById('tb-results');
      el.style.display = '';

      const { legal, checks = [], fact_sheet = {} } = data;
      const cl = fact_sheet.cap_levels || {};
      const ICON = { error: '✗', warning: '⚠', pass: '✓' };

      const cols = abbrs.map(ab => factCol(ab, fact_sheet, cl)).join('');

      const myParties = abbrs.filter(ab => (me.owner_of || []).includes(ab));
      const trcBtn = myParties.length
        ? `<button type="button" class="tb-export-btn" id="tb-trc-btn" title="Send this trade to the Trade Request Committee for review">🤝 Submit to TRC</button>`
        : '';

      const checkRows = checks.map(c => {
        const kind = c.level === 'warning' ? 'warning' : (c.passed ? 'pass' : (c.level || 'error'));
        return `<div class="tb-vc-row ${kind}"><span class="tb-vc-icon">${ICON[kind] || '?'}</span><span>${c.message}</span></div>`;
      }).join('') || '<div class="tb-vc-row pass"><span class="tb-vc-icon">✓</span><span>No constraints triggered.</span></div>';

      el.innerHTML = `
        <div class="tb-results-header">
          <span class="tb-rh-title">Trade Analysis · season ${fact_sheet.season || curYr()} · ${abbrs.length} teams</span>
          <button type="button" class="tb-export-btn primary" id="tb-sheet-btn" title="Create a public Google Sheet of this trade">▤ Create Google Sheet</button>
          <button type="button" class="tb-export-btn" id="tb-export-btn" title="Download the same trade sheet as an .xlsx file">↓ .xlsx</button>
          ${trcBtn}
        </div>
        <div class="tb-export-status" id="tb-export-status"></div>
        <div class="tb-results-grid">${cols}</div>
        <div class="tb-vc-list">${checkRows}</div>
        <div class="tb-results-summary">
          ${legal
            ? '<strong style="color:var(--success)">✓ Trade is legal</strong> — every check the league office runs at submission passes.'
            : '<strong style="color:var(--danger)">✗ Trade is not legal</strong> — resolve the failed checks above. Warnings can be force-submitted by the office.'}
        </div>`;

      lastResult = { abbrs, data };
      document.getElementById('tb-export-btn').addEventListener('click', downloadTradeSheet);
      document.getElementById('tb-sheet-btn').addEventListener('click', publishTradeSheet);
      if (myParties.length) {
        document.getElementById('tb-trc-btn').addEventListener('click', () => {
          if (!legal) {
            const failedMsgs = checks.filter(c => !c.passed && c.level !== 'warning').map(c => `• ${c.message}`).join('\n')
              || '(no specific check message — see the results above)';
            const ok = confirm(`This trade fails legality checks and could not be applied as-is:\n\n${failedMsgs}\n\nSubmit to TRC anyway? The committee can still review and decide whether to finalize it.`);
            if (!ok) return;
          }
          submitToTRC(tradeBody);
        });
      }
    }

    function factCol(abbr, fs, cl) {
      const name = TEAMS[abbr] || abbr;
      const t = (fs.teams || {})[abbr];
      if (!t) {
        return `<div class="tb-result-col"><div class="tb-result-team">${name}</div>
          <div class="tb-result-note">No assets moving for this team.</div></div>`;
      }
      const proj = t.projected_salary_ex_holds ?? t.projected_salary;

      const hcLabel = HC_LABEL[t.hard_cap_level];
      const hcChip = hcLabel
        ? `<span style="font-size:0.68rem;font-weight:700;color:var(--danger);border:1px solid var(--danger);border-radius:4px;padding:0.05rem 0.35rem;margin-left:0.5rem;">HARD CAPPED · ${hcLabel}</span>`
        : `<span style="font-size:0.68rem;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;padding:0.05rem 0.35rem;margin-left:0.5rem;">not hard-capped</span>`;

      let hardCapRow = '';
      if (t.hard_cap_limit) {
        const over = proj >= t.hard_cap_limit;
        hardCapRow = `<div class="tb-result-row"><span class="label">vs ${hcLabel} (their hard cap)</span><span style="color:${over ? 'var(--danger)' : 'var(--success)'}">${over ? 'OVER by ' + fmtM(proj - t.hard_cap_limit) : fmtM(t.hard_cap_limit - proj) + ' room'}</span></div>`;
      }
      const leagueHC = cl.hard_cap || 0;
      const leagueRow = leagueHC
        ? `<div class="tb-result-row"><span class="label">vs League Hard Cap</span><span style="color:${proj >= leagueHC ? 'var(--danger)' : 'var(--text-muted)'}">${proj >= leagueHC ? 'OVER by ' + fmtM(proj - leagueHC) : fmtM(leagueHC - proj) + ' room'}</span></div>`
        : '';

      const ercRow = t.empty_roster_deficiency
        ? `<div class="tb-result-row"><span class="label">ERC (hard-cap math)</span><span style="color:var(--warning)">+${fmtM(t.empty_roster_charge)} (${t.empty_roster_deficiency} slot${t.empty_roster_deficiency > 1 ? 's' : ''})</span></div>`
        : '';

      return `<div class="tb-result-col">
        <div class="tb-result-team">${name}${hcChip}</div>
        <div class="tb-result-row"><span class="label">Current salary</span><span>${fmtM(t.current_salary)}</span></div>
        <div class="tb-result-row"><span class="label">Sending</span><span>${t.outgoing_salary ? fmtM(t.outgoing_salary) : '—'}</span></div>
        <div class="tb-result-row"><span class="label">Receiving</span><span>${t.incoming_salary ? fmtM(t.incoming_salary) : '—'}</span></div>
        ${ercRow}
        <hr class="tb-result-divider">
        <div class="tb-result-row"><span class="label">New salary</span><span><strong>${fmtM(proj)}</strong></span></div>
        ${hardCapRow}
        ${leagueRow}
        <div class="tb-result-row"><span class="label">Roster after</span><span>${t.standard_count_after}${t.empty_roster_deficiency ? ` (+${t.empty_roster_deficiency} ERC)` : ''} / 15</span></div>
      </div>`;
    }

    // ── Spreadsheet export ───────────────────────────────────────────────────

    function contractThru(slug, yr, satTerms) {
      if (satTerms) {
        let s = yr;
        for (let i = 1; i < satTerms.years; i++) s = seasonAfter(s);
        return s;
      }
      const bio = allBios[slug] || {};
      const seasons = Object.keys(bio.salaries || {})
        .filter(s => s >= yr && parseSalaryNum(bio.salaries[s]) > 0)
        .sort();
      if (!seasons.length) return '';
      const last = seasons[seasons.length - 1];
      const flag = _THRU_FLAG[(bio.cap_holds || {})[last]];
      return flag ? `${last} ${flag}` : last;
    }

    function collectExportBlocks() {
      const yr = curYr();
      const blocks = teamSlots.filter(id => slotTeam[id]).map(slotId => {
        const abbr = slotTeam[slotId];
        const sel = selections[slotId];

        const players = (rosterData[abbr] || [])
          .filter(p => sel.players.has(p.slug))
          .map(p => ({
            name: displayName(p.name) + (p.capHold ? ' (S&T)' : ''),
            to: sel.players.get(p.slug) || '?',
            salary: p.capHold ? ((signTerms[p.slug] || {}).salaries || [])[0] || 0 : p.salary,
            thru: contractThru(p.slug, yr, p.capHold ? signTerms[p.slug] : null),
          }));

        const picks = (picksData[abbr] || [])
          .filter(p => sel.picks.has(pickKey(p)))
          .map(p => {
            const mine = (p.leaves || []).filter(l => l.team === abbr);
            return {
              label: `${p.year} ${p.round === 1 ? '1st' : '2nd'}` + (p.orig !== abbr ? ` (${p.orig})` : ''),
              to: sel.picks.get(pickKey(p)) || '?',
              protections: mine.map(l => l.description).join(' / ')
                           || (p.protected ? `Top ${p.protected} protected` : ''),
            };
          });

        const excVal = document.getElementById(`tb-exc-${slotId}`)?.value || '';
        const exceptions = [];
        if (excVal.startsWith('tpe:')) {
          const tpe = (tpeData[abbr] || []).find(e => String(e.id) === excVal.slice(4));
          if (tpe) exceptions.push({ label: `Trade Exception (exp. ${tpe.expires_date})`, amount: tpe.remaining });
        } else if (EXC_META[excVal]) {
          exceptions.push({ label: EXC_META[excVal][0], key: EXC_META[excVal][1] });
        }

        return { abbr, players, picks, exceptions, playersIn: [], picksIn: [] };
      });

      const byAbbr = Object.fromEntries(blocks.map(b => [b.abbr, b]));
      blocks.forEach(src => {
        src.players.forEach(p => {
          byAbbr[p.to]?.playersIn.push({ name: p.name, from: src.abbr, salary: p.salary, thru: p.thru });
        });
        src.picks.forEach(p => {
          byAbbr[p.to]?.picksIn.push({ label: p.label, from: src.abbr, protections: p.protections });
        });
      });
      return blocks;
    }

    function checkVerdict(checks) {
      const S = window.XLSXMini.S;
      if (checks.some(c => !c.passed && (c.level || 'error') === 'error')) return ['INVALID', S.INVALID];
      if (checks.some(c => !c.passed || c.level === 'warning')) return ['WARNING', S.WARN];
      return ['VALID', S.VALID];
    }

    function buildTradeWorkbook() {
      if (!lastResult) return null;
      const { data } = lastResult;
      const S = window.XLSXMini.S, ref = window.XLSXMini.cellRef;
      const fs = data.fact_sheet || {}, cl = fs.cap_levels || {};
      const season = fs.season || curYr();
      const allChecks = data.checks || [];

      const blocks = collectExportBlocks();
      const nB = blocks.length;
      const lastCol = nB * BLOCK_W - 1;

      const rows = [], merges = [], rowHeights = {};
      const cols = [];
      for (let b = 0; b < nB; b++) cols.push(...BLOCK_COL_W);

      const put = (r, c, v, s) => {
        while (rows.length <= r) rows.push([]);
        rows[r][c] = { v: v === undefined || v === null ? '' : v, s };
      };
      const band = (r, c0, c1, v, s) => {
        for (let c = c0; c <= c1; c++) put(r, c, c === c0 ? v : '', s);
        if (c1 > c0) merges.push(`${ref(r, c0)}:${ref(r, c1)}`);
      };
      const bandRect = (r0, r1, c0, c1, v, s) => {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(r, c, (r === r0 && c === c0) ? v : '', s);
        merges.push(`${ref(r0, c0)}:${ref(r1, c1)}`);
      };

      const [verdictText, verdictStyle] = data.legal ? ['VALID', S.VALID] : ['INVALID', S.INVALID];
      bandRect(0, 2, 0, 1, verdictText, verdictStyle);
      bandRect(0, 2, 2, lastCol, 'NBN TRADE MACHINE', S.TITLE);
      [0, 1, 2].forEach(r => { rowHeights[r] = 22; });

      band(3, 0, lastCol,
           `${season} season · ${blocks.map(b => b.abbr).join(' / ')} · generated ${window.nbnFormatDateTime(new Date())}`,
           S.TEXT_CENTER);

      const nOut     = Math.max(1, ...blocks.map(b => b.players.length));
      const nIn      = Math.max(1, ...blocks.map(b => b.playersIn.length));
      const nPickOut = Math.max(1, ...blocks.map(b => b.picks.length));
      const nPickIn  = Math.max(1, ...blocks.map(b => b.picksIn.length));
      const nExc     = Math.max(1, ...blocks.map(b => b.exceptions.length));

      const teamNotes = {};
      blocks.forEach(b => {
        const suffix = '_' + b.abbr.toLowerCase();
        teamNotes[b.abbr] = allChecks
          .filter(c => (c.check || '').endsWith(suffix))
          .filter(c => !c.passed || c.level === 'warning')
          .map(c => c.message);
      });
      const nNotes = Math.max(1, ...Object.values(teamNotes).map(n => n.length));

      const R_TEAM    = 5;
      const R_OUT     = R_TEAM + 1;
      const R_IN      = R_OUT     + 1 + nOut     + 1;
      const R_PICKOUT = R_IN      + 1 + nIn      + 1;
      const R_PICKIN  = R_PICKOUT + 1 + nPickOut + 1;
      const R_EXC     = R_PICKIN  + 1 + nPickIn  + 1;
      const R_SUM     = R_EXC     + 1 + nExc     + 1;

      const exHolds = t => t.projected_salary_ex_holds ?? t.projected_salary;

      const SUMMARY = [
        ['Total Outgoing',  t => [t.outgoing_salary, S.MONEY]],
        ['Unaggregated',    t => [t.unaggregated_outgoing, S.MONEY]],
        ['Total Incoming',  t => [t.incoming_salary, S.MONEY]],
        ['Change',          t => [t.incoming_salary - t.outgoing_salary, S.MONEY]],
        ['Max Incoming',    t => t.max_incoming == null ? ['n/a', S.TEXT_CENTER] : [t.max_incoming, S.MONEY]],
        ['Need Aggregate',  t => [t.needs_aggregation ? 'Yes' : 'No', t.needs_aggregation ? S.WARN : S.TEXT_CENTER]],
        null,
        ['Current Salary',  t => [t.current_salary, S.MONEY]],
        ['New Salary',      t => [t.projected_salary, S.MONEY_BOLD]],
        ['Roster After',    t => [`${t.standard_count_after} / 15`, S.TEXT_CENTER]],
        ['Hard Capped At',  t => [HC_LABEL[t.hard_cap_level] || 'None', S.TEXT_CENTER]],
        ['Apron (Post)',    t => [HC_LABEL[t.apron_after] || 'None', S.TEXT_CENTER]],
        ['Cap Space',       t => cl.cap    == null ? ['n/a', S.TEXT_CENTER] : [cl.cap - t.projected_salary, S.MONEY]],
        ['Apron 1 Space',   t => cl.apron1 == null ? ['n/a', S.TEXT_CENTER] : [cl.apron1 - exHolds(t), S.MONEY]],
        ['Apron 2 Space',   t => cl.apron2 == null ? ['n/a', S.TEXT_CENTER] : [cl.apron2 - exHolds(t), S.MONEY]],
        null,
      ];

      blocks.forEach((blk, bi) => {
        const c0 = bi * BLOCK_W, cEnd = c0 + BLOCK_W - 1;
        const t = (fs.teams || {})[blk.abbr];
        const hasFacts = !!t;

        band(R_TEAM, c0, cEnd, `${blk.abbr} — ${TEAMS[blk.abbr] || blk.abbr}`, S.TEAM);
        rowHeights[R_TEAM] = 20;

        const playerSection = (rowAt, title, dirLabel, list, n) => {
          band(rowAt, c0, c0 + 1, title, S.SECTION);
          put(rowAt, c0 + 2, dirLabel, S.COL_HEAD);
          put(rowAt, c0 + 3, 'Salary', S.COL_HEAD);
          put(rowAt, c0 + 4, 'Thru', S.COL_HEAD);
          for (let i = 0; i < n; i++) {
            const r = rowAt + 1 + i, p = list[i];
            band(r, c0, c0 + 1, p ? p.name : '—', p ? S.TEXT : S.PLACEHOLDER);
            put(r, c0 + 2, p ? (p.to || p.from) : '', p ? S.TEXT_CENTER : S.PLACEHOLDER);
            put(r, c0 + 3, p ? p.salary : '', p ? S.MONEY : S.PLACEHOLDER);
            put(r, c0 + 4, p ? (p.thru || '—') : '', p ? S.TEXT_CENTER : S.PLACEHOLDER);
          }
        };
        playerSection(R_OUT, 'Players Out', 'To',   blk.players,   nOut);
        playerSection(R_IN,  'Players In',  'From', blk.playersIn, nIn);

        const pickSection = (rowAt, title, dirLabel, list, n) => {
          band(rowAt, c0, c0 + 1, title, S.SECTION);
          put(rowAt, c0 + 2, dirLabel, S.COL_HEAD);
          band(rowAt, c0 + 3, cEnd, 'Protections (if any)', S.COL_HEAD);
          for (let i = 0; i < n; i++) {
            const r = rowAt + 1 + i, p = list[i];
            band(r, c0, c0 + 1, p ? p.label : '—', p ? S.TEXT : S.PLACEHOLDER);
            put(r, c0 + 2, p ? (p.to || p.from) : '', p ? S.TEXT_CENTER : S.PLACEHOLDER);
            band(r, c0 + 3, cEnd, p ? (p.protections || 'None') : '', p ? S.TEXT : S.PLACEHOLDER);
          }
        };
        pickSection(R_PICKOUT, 'Picks Out', 'To',   blk.picks,   nPickOut);
        pickSection(R_PICKIN,  'Picks In',  'From', blk.picksIn, nPickIn);

        band(R_EXC, c0, c0 + 1, 'Trade Exceptions', S.SECTION);
        put(R_EXC, c0 + 2, '', S.COL_HEAD);
        band(R_EXC, c0 + 3, cEnd, 'Amount', S.COL_HEAD);
        for (let i = 0; i < nExc; i++) {
          const r = R_EXC + 1 + i, e = blk.exceptions[i];
          band(r, c0, c0 + 1, e ? e.label : '—', e ? S.TEXT : S.PLACEHOLDER);
          put(r, c0 + 2, '', e ? S.TEXT_CENTER : S.PLACEHOLDER);
          const amt = e ? (e.amount ?? cl[e.key]) : null;
          band(r, c0 + 3, cEnd, e ? (amt ?? 'n/a') : '', e ? (amt == null ? S.TEXT_CENTER : S.MONEY) : S.PLACEHOLDER);
        }

        SUMMARY.forEach((entry, i) => {
          const r = R_SUM + i;
          if (!entry) { band(r, c0, cEnd, '', S.DEFAULT); return; }
          const [label, valueOf] = entry;
          band(r, c0, c0 + 2, label, S.LABEL);
          const [v, st] = hasFacts ? valueOf(t) : ['—', S.PLACEHOLDER];
          band(r, c0 + 3, cEnd, v === undefined || v === null || Number.isNaN(v) ? '—' : v, st);
        });

        const suffix = '_' + blk.abbr.toLowerCase();
        const mine = allChecks.filter(c => (c.check || '').endsWith(suffix));
        const bucket = pre => mine.filter(c => pre.some(p => (c.check || '').startsWith(p)));
        const verdicts = [
          ['Salary Match', checkVerdict(bucket(['salary_matching_', 'apron2_aggregation_', 'apron1_contagion_']))],
          ['Hard Cap',     checkVerdict(bucket(['hard_cap_']))],
          ['Roster',       checkVerdict(bucket(['empty_roster_charge_', 'roster_']))],
          [`${blk.abbr} Result`, checkVerdict(mine)],
        ];
        verdicts.forEach(([label, [text, style]], i) => {
          const r = R_SUM + SUMMARY.length + i;
          band(r, c0, c0 + 2, label, S.LABEL);
          band(r, c0 + 3, cEnd, text, style);
        });

        const notes = teamNotes[blk.abbr] || [];
        const rNotesHead = R_SUM + SUMMARY.length + verdicts.length + 1;
        band(rNotesHead, c0, cEnd, 'Notes', S.SECTION);
        for (let i = 0; i < nNotes; i++) {
          const r = rNotesHead + 1 + i, msg = notes[i];
          band(r, c0, cEnd, msg || (i === 0 ? 'No constraints triggered.' : ''),
               msg ? S.NOTE : S.PLACEHOLDER);
          if (msg) {
            const lines = Math.max(1, Math.ceil(msg.length / 66));
            rowHeights[r] = Math.max(rowHeights[r] || 0, lines * 14 + 4);
          }
        }
      });

      const tradeSheet = { name: 'Trade', cols, rows, merges, rowHeights, freeze: 4 };

      const vRows = [
        [{ v: 'Validation checks', s: S.NOTE_HEAD }],
        [{ v: `${season} · ${data.legal ? 'LEGAL' : 'NOT LEGAL'} · generated ${window.nbnFormatDateTime(new Date())}`, s: S.TEXT }],
        [],
        [{ v: 'Result', s: S.COL_HEAD }, { v: 'Check', s: S.COL_HEAD }, { v: 'Detail', s: S.COL_HEAD }],
      ];
      (allChecks.length ? allChecks : [{ check: '—', passed: true, message: 'No constraints triggered.' }])
        .forEach(c => {
          const kind = c.level === 'warning' ? ['WARNING', S.WARN]
                     : c.passed ? ['PASS', S.VALID] : ['FAIL', S.INVALID];
          vRows.push([{ v: kind[0], s: kind[1] }, { v: c.check || '', s: S.TEXT }, { v: c.message || '', s: S.NOTE }]);
        });
      const validationSheet = { name: 'Validation', cols: [12, 34, 110], rows: vRows, merges: [], freeze: 4 };

      const money = n => (n == null ? 'not set' : '$' + n.toLocaleString());
      const rRows = [
        [{ v: `NBN salary-matching rules — ${season}`, s: S.NOTE_HEAD }],
        [{ v: 'Generated from the league rulebook (nbn.today/rulebook) and the live cap levels. Article/section numbers refer to the rulebook.', s: S.NOTE }],
        [],
        [{ v: 'Cap levels', s: S.COL_HEAD }, { v: 'Amount', s: S.COL_HEAD }],
        [{ v: 'Salary Cap', s: S.TEXT }, { v: money(cl.cap), s: S.TEXT }],
        [{ v: 'First Apron (§ 1.5)', s: S.TEXT }, { v: money(cl.apron1), s: S.TEXT }],
        [{ v: 'Second Apron (§ 1.5)', s: S.TEXT }, { v: money(cl.apron2), s: S.TEXT }],
        [{ v: 'League Hard Cap (§ 1.3)', s: S.TEXT }, { v: money(cl.hard_cap), s: S.TEXT }],
        [{ v: 'Non-Taxpayer MLE', s: S.TEXT }, { v: money(cl.ntmle_amount), s: S.TEXT }],
        [{ v: 'Taxpayer MLE', s: S.TEXT }, { v: money(cl.tmle_amount), s: S.TEXT }],
        [{ v: 'Room Exception', s: S.TEXT }, { v: money(cl.room_amount), s: S.TEXT }],
        [{ v: 'Bi-Annual Exception', s: S.TEXT }, { v: money(cl.bae_amount), s: S.TEXT }],
        [],
        [{ v: 'Below the First Apron — tiered matching (§ 4.2)', s: S.COL_HEAD }, { v: 'Max incoming', s: S.COL_HEAD }],
        [{ v: 'Outgoing $0 – $8,527,000', s: S.TEXT }, { v: '200% of outgoing + $250,000', s: S.TEXT }],
        [{ v: 'Outgoing $8,527,001 – $29,000,000', s: S.TEXT }, { v: 'Outgoing + $8,527,000', s: S.TEXT }],
        [{ v: 'Outgoing above $29,000,000', s: S.TEXT }, { v: '125% of outgoing + $250,000', s: S.TEXT }],
        [],
        [{ v: 'At or above the First Apron (§ 4.3)', s: S.TEXT }, { v: 'Outgoing + $250,000; no tiered matching', s: S.TEXT }],
        [{ v: 'At or above the Second Apron (§ 4.4)', s: S.TEXT }, { v: 'Outgoing + $250,000, and salaries may not be aggregated', s: S.TEXT }],
        [],
        [{ v: 'Contagion (§ 4.3 / § 4.4)', s: S.COL_HEAD }, { v: '', s: S.COL_HEAD }],
        [{ v: 'Below the First Apron, incoming > outgoing + $250,000', s: S.TEXT }, { v: 'Legal, but hard-caps the team at the First Apron for the rest of the season', s: S.NOTE }],
        [{ v: 'Below the Second Apron, aggregating two or more outgoing salaries', s: S.TEXT }, { v: 'Legal, but hard-caps the team at the Second Apron for the rest of the season', s: S.NOTE }],
        [],
        [{ v: 'Reading this sheet', s: S.COL_HEAD }, { v: '', s: S.COL_HEAD }],
        [{ v: 'Salary', s: S.TEXT }, { v: `Current-season (${season}) salary — the only figure the trade rules judge.`, s: S.NOTE }],
        [{ v: 'Thru', s: S.TEXT }, { v: 'Last season the player is under contract for. PO = that year is a player option, TO = team option, NG = non-guaranteed. Not part of any cap test; shown because an expiring deal and a long one at the same salary are very different assets.', s: S.NOTE }],
        [{ v: 'Notes', s: S.TEXT }, { v: 'Why a team’s verdict above is not a clean pass. The Validation tab lists every check, including the ones that passed.', s: S.NOTE }],
        [{ v: 'Unaggregated', s: S.TEXT }, { v: 'The largest single outgoing salary — what the team could send without combining salaries.', s: S.NOTE }],
        [{ v: 'Need Aggregate', s: S.TEXT }, { v: 'Yes when no single outgoing salary covers the incoming total on its own (§ 4.4).', s: S.NOTE }],
        [{ v: 'Cap Space', s: S.TEXT }, { v: 'Salary Cap minus projected salary, counting free-agent cap holds.', s: S.NOTE }],
        [{ v: 'Apron 1 / Apron 2 Space', s: S.TEXT }, { v: 'Apron minus projected salary excluding free-agent cap holds (§ 1.3/1.4), including any Empty Roster Charge (§ 2.1a).', s: S.NOTE }],
      ];
      const rulesSheet = { name: 'Rules', cols: [42, 72], rows: rRows, merges: [] };

      return {
        name: `NBN Trade — ${blocks.map(b => b.abbr).join(' / ')} — ${window.nbnToday()}`,
        filename: `NBN-Trade-${blocks.map(b => b.abbr).join('-')}-${window.nbnToday()}.xlsx`,
        sheets: [tradeSheet, validationSheet, rulesSheet],
      };
    }

    function setExportStatus(html, isErr) {
      const el = document.getElementById('tb-export-status');
      if (!el) return;
      el.className = 'tb-export-status' + (isErr ? ' err' : '');
      el.innerHTML = html;
    }

    async function downloadTradeSheet() {
      const wb = buildTradeWorkbook();
      if (wb) await window.XLSXMini.download(wb.filename, wb.sheets);
    }

    function promptForToken() {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000';
        overlay.innerHTML = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:1.5rem;width:360px;max-width:90vw">
          <h3 style="font-size:1rem;font-weight:700;margin-bottom:0.4rem;color:var(--text-primary)">Enter your token</h3>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem">This action needs a league member token. It will be saved in this browser.</p>
          <input type="password" placeholder="Paste token…" autocomplete="off" style="width:100%;background:var(--bg-page);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:0.875rem;font-family:var(--font-mono);padding:0.5rem 0.75rem;margin-bottom:1rem;box-sizing:border-box;outline:none">
          <div style="display:flex;gap:0.5rem;justify-content:flex-end">
            <button data-act="cancel" style="padding:0.35rem 0.8rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:inherit">Cancel</button>
            <button data-act="ok" style="padding:0.35rem 0.8rem;border:1px solid var(--accent);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--link);font-family:inherit">Continue</button>
          </div></div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('input');
        input.focus();
        const done = val => { overlay.remove(); resolve(val || null); };
        overlay.querySelector('[data-act=cancel]').addEventListener('click', () => done(null));
        overlay.querySelector('[data-act=ok]').addEventListener('click', () => {
          const v = input.value.trim();
          if (!v) return;
          localStorage.setItem('nbn_token', v);
          done(v);
        });
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') overlay.querySelector('[data-act=ok]').click();
          if (e.key === 'Escape') done(null);
        });
      });
    }

    async function publishTradeSheet() {
      const wb = buildTradeWorkbook();
      if (!wb) return;

      let token = localStorage.getItem('nbn_token');
      if (!token) {
        token = await promptForToken();
        if (!token) return;
      }

      const btn = document.getElementById('tb-sheet-btn');
      btn.disabled = true;
      setExportStatus('Creating Google Sheet…');

      try {
        const form = new FormData();
        form.append('file', await window.XLSXMini.build(wb.sheets), wb.filename);
        form.append('name', wb.name);

        const res = await fetch('/api/trade-sheet', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (res.status === 403 || res.status === 401) {
          localStorage.removeItem('nbn_token');
          setExportStatus('That token was rejected — click again to re-enter it.', true);
          return;
        }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setExportStatus(`Could not create the Sheet — ${d.detail || 'HTTP ' + res.status}. Use the .xlsx download instead.`, true);
          return;
        }
        const { url } = await res.json();
        setExportStatus(`Google Sheet created — <a href="${url}" target="_blank" rel="noopener">open it</a> · <span style="color:var(--text-dim)">anyone with the link can view</span>`);
        window.open(url, '_blank', 'noopener');
      } catch (e) {
        setExportStatus('Network error creating the Sheet. Use the .xlsx download instead.', true);
      } finally {
        btn.disabled = false;
      }
    }

    // Submits exactly the tradeBody /api/validate/trade was just called with —
    // no second construction of the payload — to the Trade Request Committee's
    // own endpoint. A request can be withdrawn, so this itself has no confirm
    // step; the illegal-trade confirm (if any) happens in the caller, before
    // this runs (§ trc-trade-pipeline.md decision 11).
    async function submitToTRC(tradeBody) {
      let token = localStorage.getItem('nbn_token');
      if (!token) {
        token = await promptForToken();
        if (!token) return;
      }

      const btn = document.getElementById('tb-trc-btn');
      btn.disabled = true;
      setExportStatus('Submitting to TRC…');
      let submitted = false;

      try {
        const res = await fetch('/api/trade-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(tradeBody),
        });
        if (res.status === 403 || res.status === 401) {
          localStorage.removeItem('nbn_token');
          setExportStatus('That token was rejected — click again to re-enter it.', true);
          return;
        }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          const detail = typeof d.detail === 'string' ? d.detail : (d.detail?.message || `HTTP ${res.status}`);
          setExportStatus(`Could not submit to TRC — ${detail}`, true);
          return;
        }
        const req = await res.json();
        setExportStatus(`Submitted to TRC as request #${req.number} — <a href="/committees/trc/" target="_blank" rel="noopener">track it</a>`);
        btn.textContent = '✓ Submitted';
        submitted = true;
        if (typeof opts.onSubmitted === 'function') opts.onSubmitted(req);
      } catch (e) {
        setExportStatus('Network error submitting to TRC.', true);
      } finally {
        if (!submitted) btn.disabled = false;
      }
    }

    // ── Boot ─────────────────────────────────────────────────────────────────

    let leagueYearJson;
    [allBios, allOvr, leagueYearJson] = await Promise.all([
      fetch('/api/players').then(r => r.ok ? r.json() : {}),
      fetch('/api/ovr/current').then(r => r.ok ? r.json() : {}),
      fetch('/api/league-year').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (leagueYearJson?.current_season) LEAGUE_YEAR = leagueYearJson.current_season;
    loadMe();   // fire-and-forget — only gates the Submit-to-TRC button, nothing blocks on it

    document.getElementById('tb-add-team-btn').addEventListener('click', () => { addTeamSlot(null); rebuildTeamSelectOptions(); });

    const preload = (opts.presetTeams && opts.presetTeams.length ? opts.presetTeams.slice() : [null, null]);
    while (preload.length < 2) preload.push(null);
    preload.forEach(abbr => addTeamSlot(abbr));
    rebuildTeamSelectOptions();
  }

  window.TradeBuilder = { mount };
})();
