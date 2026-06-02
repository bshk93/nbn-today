(function () {
  // Infer season from URL: /awards/25-26/results/ → '25-26'
  const SEASON = location.pathname.split('/').filter(Boolean)[1];

  document.title = SEASON + ' Awards — NBN';
  { const _f = document.createElement('link'); _f.rel = 'icon'; _f.href = '/logo.png'; document.head.appendChild(_f); }

  { const _s = document.createElement('style'); _s.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #111827;
      color: #f3f4f6;
      min-height: 100vh;
      padding: 2rem 1rem 4rem;
    }

    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .page { max-width: 1060px; margin: 0 auto; }

    .nav { margin-bottom: 1.75rem; font-size: 0.875rem; color: #9ca3af; }
    .nav a { color: #9ca3af; }
    .nav a:hover { color: #f3f4f6; }

    header { margin-bottom: 1.75rem; }
    header h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.02em; }
    header p { color: #9ca3af; margin-top: 0.4rem; font-size: 0.9rem; }

    .awards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .award-section-full { margin-bottom: 1.5rem; }

    .award-heading {
      font-size: 0.75rem; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: #9ca3af; margin-bottom: 0.5rem;
    }

    .table-wrap {
      background: #1f2937; border: 1px solid #374151;
      border-radius: 12px; overflow-x: auto;
    }

    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; white-space: nowrap; }

    thead th {
      padding: 0.65rem 1rem; text-align: left;
      font-size: 0.7rem; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: #6b7280; border-bottom: 1px solid #374151;
    }
    thead th.right { text-align: right; }

    tbody tr { border-bottom: 1px solid #283141; transition: background 0.1s; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: #263244; }

    td { padding: 0.65rem 1rem; color: #d1d5db; }
    td.player-name { font-weight: 600; color: #f3f4f6; }
    td.right { text-align: right; font-variant-numeric: tabular-nums; }
    td.muted { color: #6b7280; }
    td.pts { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: #f3f4f6; }

    .no-data { padding: 2rem; text-align: center; color: #6b7280; font-size: 0.875rem; }

    #status { text-align: center; padding: 3rem; color: #6b7280; font-size: 0.9rem; }

    /* Podium display for major awards */
    .podium { display: flex; gap: 0.5rem; margin-bottom: 0.6rem; }
    .podium-slot {
      flex: 1; border: 1px solid #374151; border-radius: 8px;
      padding: 0.6rem 0.75rem; min-width: 0;
    }
    .podium-slot.rank-1 { border-color: #92400e; background: #18160a; }
    .podium-slot.rank-2 { border-color: #4b5563; background: #14181f; }
    .podium-slot.rank-3 { border-color: #78350f; background: #17130e; }
    .podium-slot.empty  { border-style: dashed; border-color: #283141; background: transparent; }
    .podium-rank {
      font-size: 0.6rem; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.2rem;
    }
    .rank-1 .podium-rank { color: #f59e0b; }
    .rank-2 .podium-rank { color: #9ca3af; }
    .rank-3 .podium-rank { color: #b45309; }
    .podium-name {
      font-size: 0.85rem; font-weight: 700; color: #f3f4f6;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .podium-slot.empty .podium-name { color: #374151; font-style: italic; font-weight: 400; }
    .podium-pts { font-size: 0.72rem; color: #6b7280; margin-top: 0.15rem; }

    /* Tier row coloring for team award tables */
    tbody tr.tier-gold   td { background: #18160a; }
    tbody tr.tier-gold   td.player-name { color: #f59e0b; }
    tbody tr.tier-silver td { background: #14181f; }
    tbody tr.tier-silver td.player-name { color: #9ca3af; }
    tbody tr.tier-bronze td { background: #17130e; }
    tbody tr.tier-bronze td.player-name { color: #b45309; }

    /* Ballot tracker */
    .ballot-tracker { margin-top: 2.5rem; padding-top: 2rem; border-top: 1px solid #1f2937; }
    .ballot-tracker-heading {
      font-size: 0.75rem; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: #6b7280; margin-bottom: 0.75rem;
    }
    .ballot-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .ballot-chip {
      font-size: 0.72rem; font-weight: 600;
      letter-spacing: 0.04em; padding: 0.2rem 0.55rem; border-radius: 4px;
      cursor: default;
    }
    .ballot-chip.in      { background: #1e3a5f; color: #93c5fd; }
    .ballot-chip.partial { background: #2d2008; color: #f59e0b; border: 1px solid #78350f; }
    .ballot-chip.out     { background: #1f2937; color: #4b5563; border: 1px solid #374151; }

    /* Floating tooltip for partial ballots */
    #ballot-tooltip {
      position: fixed; z-index: 100; pointer-events: none;
      background: #1f2937; border: 1px solid #374151; border-radius: 6px;
      padding: 0.45rem 0.65rem;
      font-size: 0.75rem; color: #d1d5db; line-height: 1.5;
      white-space: pre; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      opacity: 0; transition: opacity 0.1s;
    }
    #ballot-tooltip.visible { opacity: 1; }
    #ballot-tooltip.wide {
      white-space: normal; min-width: 340px; max-width: 520px; padding: 0.6rem 0.75rem;
    }
    .btt-header {
      font-weight: 700; color: #f3f4f6; margin-bottom: 0.5rem; padding-bottom: 0.4rem;
      border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
    }
    .btt-team { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .btt-state { font-size: 0.63rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 0.1rem 0.4rem; border-radius: 3px; flex-shrink: 0; }
    .btt-state-in      { background: #1e3a5f; color: #93c5fd; }
    .btt-state-partial { background: #2d2008; color: #f59e0b; border: 1px solid #78350f; }
    .btt-state-out     { background: #1f2937; color: #4b5563; border: 1px solid #374151; }
    .btt-awards { display: flex; flex-direction: column; gap: 0.3rem; }
    .btt-award { display: flex; gap: 0.5rem; align-items: flex-start; }
    .btt-label { font-size: 0.63rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; min-width: 64px; padding-top: 0.07rem; flex-shrink: 0; }
    .btt-picks { color: #d1d5db; font-size: 0.75rem; line-height: 1.4; }
    .btt-picks em { color: #4b5563; font-style: normal; }
    .btt-tiers { display: flex; flex-direction: column; gap: 0.15rem; }
    .btt-tier { font-size: 0.75rem; color: #d1d5db; line-height: 1.4; }
    .btt-tier-label { font-size: 0.63rem; font-weight: 600; color: #6b7280; min-width: 28px; display: inline-block; }
    .btt-empty { color: #4b5563; font-style: italic; font-size: 0.78rem; margin-top: 0.25rem; }
  `; document.head.appendChild(_s); }

  document.body.innerHTML = `
    <div class="page">
      <nav class="nav" id="page-nav"><a href="/awards/">← Awards</a></nav>
      <header>
        <h1>${SEASON} Season Awards</h1>
        <p id="page-sub">Loading…</p>
      </header>
      <div id="awards-container">
        <div id="status">Loading…</div>
      </div>
    </div>
    <div id="ballot-tooltip"></div>
  `;

  const TEAM_ROLES = new Set([
    'atl','bkn','bos','cha','chi','cle','dal','den','det','gsw',
    'hou','ind','lac','lal','mem','mia','mil','min','nop','nyk',
    'okc','orl','phi','phx','por','sac','sas','tor','uta','was',
  ]);

  const AWARDS = [
    { key: 'MVP',         label: 'MVP',         maxRank: 3, scoring: [5,3,1], playerCol: 'Player'    },
    { key: 'DPOY',        label: 'DPOY',        maxRank: 3, scoring: [5,3,1], playerCol: 'Player'    },
    { key: 'ROTY',        label: 'ROTY',        maxRank: 3, scoring: [5,3,1], playerCol: 'Player'    },
    { key: '6MOY',        label: '6MOY',        maxRank: 3, scoring: [5,3,1], playerCol: 'Player'    },
    { key: 'MIP',         label: 'MIP',         maxRank: 3, scoring: [5,3,1], playerCol: 'Player'    },
    { key: 'FOTY',        label: 'FOTY',        maxRank: 3, scoring: [5,3,1], playerCol: 'Franchise' },
    { key: 'COTY',        label: 'COTY',        maxRank: 3, scoring: [5,3,1], playerCol: 'Franchise' },
    { key: 'All-NBN',     label: 'All-NBN',     maxRank: 3, scoring: [5,3,1], playerCol: 'Player', teamVote: true, tierSize: 5, numTiers: 3 },
    { key: 'All-Defense', label: 'All-Defense', maxRank: 2, scoring: [5,3],   playerCol: 'Player', teamVote: true, tierSize: 5, numTiers: 2 },
    { key: 'All-Rookie',  label: 'All-Rookie',  maxRank: 2, scoring: [5,3],   playerCol: 'Player', teamVote: true, tierSize: 5, numTiers: 2 },
  ];

  const TEAMS = {
    ATL:'Atlanta Hawks', BKN:'Brooklyn Nets', BOS:'Boston Celtics', CHA:'Charlotte Hornets',
    CHI:'Chicago Bulls', CLE:'Cleveland Cavaliers', DAL:'Dallas Mavericks', DEN:'Denver Nuggets',
    DET:'Detroit Pistons', GSW:'Golden State Warriors', HOU:'Houston Rockets', IND:'Indiana Pacers',
    LAC:'LA Clippers', LAL:'Los Angeles Lakers', MEM:'Memphis Grizzlies', MIA:'Miami Heat',
    MIL:'Milwaukee Bucks', MIN:'Minnesota Timberwolves', NOP:'New Orleans Pelicans',
    NYK:'New York Knicks', OKC:'Oklahoma City Thunder', ORL:'Orlando Magic',
    PHI:'Philadelphia 76ers', PHX:'Phoenix Suns', POR:'Portland Trail Blazers',
    SAC:'Sacramento Kings', SAS:'San Antonio Spurs', TOR:'Toronto Raptors',
    UTA:'Utah Jazz', WAS:'Washington Wizards',
  };

  function displayNameFromBio(bios, slug) {
    const bio = bios[slug];
    if (!bio) return slug;
    const name = bio.name || slug;
    if (!name.includes(',')) return name;
    const [last, first] = name.split(',').map(s => s.trim());
    return `${first} ${last}`;
  }

  function aggregateAward(ballots, bios, award) {
    const map = new Map();
    const TIER = 5;
    const isTeamAward = award.key === 'FOTY' || award.key === 'COTY';
    Object.values(ballots).forEach(teamBallot => {
      const picks = teamBallot[award.key];
      if (!picks) return;
      picks.forEach((slug, idx) => {
        if (!slug) return;
        const rank = award.teamVote ? Math.floor(idx / TIER) + 1 : idx + 1;
        if (rank < 1 || rank > award.maxRank) return;
        if (!map.has(slug)) map.set(slug, new Array(award.maxRank).fill(0));
        map.get(slug)[rank - 1]++;
      });
    });
    return [...map.entries()]
      .map(([slug, counts]) => ({
        slug,
        player: isTeamAward ? (TEAMS[slug] || slug) : displayNameFromBio(bios, slug),
        counts,
        pts: counts.reduce((sum, c, i) => sum + c * (award.scoring[i] || 0), 0),
      }))
      .sort((a, b) => b.pts !== a.pts ? b.pts - a.pts : (b.counts[0] || 0) - (a.counts[0] || 0));
  }

  function rankLabel(i, teamVote) {
    return ['1st', '2nd', '3rd'][i] + (teamVote ? ' Team' : '');
  }

  function buildTable(award, data, tierSize, numTiers) {
    const table = document.createElement('table');
    const hr = table.createTHead().insertRow();

    const thP = document.createElement('th');
    thP.textContent = award.playerCol;
    hr.appendChild(thP);

    for (let i = 0; i < award.maxRank; i++) {
      const th = document.createElement('th');
      th.className = 'right';
      th.textContent = rankLabel(i, award.teamVote);
      hr.appendChild(th);
    }

    const thPts = document.createElement('th');
    thPts.className = 'right';
    thPts.textContent = 'Pts';
    hr.appendChild(thPts);

    const tbody = table.createTBody();
    data.forEach(({ player, counts, pts }, idx) => {
      const tr = tbody.insertRow();
      if (tierSize && numTiers) {
        const tier = Math.floor(idx / tierSize);
        if (tier === 0) tr.className = 'tier-gold';
        else if (tier === 1) tr.className = 'tier-silver';
        else if (tier === 2) tr.className = 'tier-bronze';
      }

      const tdP = tr.insertCell();
      tdP.className = 'player-name';
      tdP.textContent = player;

      counts.forEach(c => {
        const td = tr.insertCell();
        td.className = 'right muted';
        td.textContent = c > 0 ? c : '—';
      });

      const tdPts = tr.insertCell();
      tdPts.className = 'pts';
      tdPts.textContent = pts;
    });

    return table;
  }

  function buildPodium(data) {
    const podium = document.createElement('div');
    podium.className = 'podium';
    ['1st', '2nd', '3rd'].forEach((label, i) => {
      const slot = document.createElement('div');
      const entry = data[i];
      slot.className = `podium-slot rank-${i + 1}${entry ? '' : ' empty'}`;
      const rankEl = document.createElement('div');
      rankEl.className = 'podium-rank';
      rankEl.textContent = label;
      const nameEl = document.createElement('div');
      nameEl.className = 'podium-name';
      nameEl.textContent = entry ? entry.player : 'No votes yet';
      slot.appendChild(rankEl);
      slot.appendChild(nameEl);
      if (entry) {
        const ptsEl = document.createElement('div');
        ptsEl.className = 'podium-pts';
        ptsEl.textContent = `${entry.pts} pts`;
        slot.appendChild(ptsEl);
      }
      podium.appendChild(slot);
    });
    return podium;
  }

  function buildMajorSection(award, data) {
    const section = document.createElement('div');

    const h2 = document.createElement('h2');
    h2.className = 'award-heading';
    h2.textContent = award.label;
    section.appendChild(h2);

    section.appendChild(buildPodium(data));

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    if (data.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'no-data';
      msg.textContent = 'No votes recorded yet.';
      wrap.appendChild(msg);
    } else {
      wrap.appendChild(buildTable(award, data));
    }
    section.appendChild(wrap);
    return section;
  }

  function buildTeamSection(award, data) {
    const section = document.createElement('div');
    section.className = 'award-section-full';

    const h2 = document.createElement('h2');
    h2.className = 'award-heading';
    h2.textContent = award.label;
    section.appendChild(h2);

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    if (data.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'no-data';
      msg.textContent = 'No votes recorded yet.';
      wrap.appendChild(msg);
    } else {
      wrap.appendChild(buildTable(award, data, award.tierSize, award.numTiers));
    }
    section.appendChild(wrap);
    return section;
  }

  function awardExpectedSize(aw) {
    return (aw.tierSize && aw.numTiers) ? aw.tierSize * aw.numTiers : aw.maxRank;
  }

  function ballotState(teamBallot) {
    const complete = AWARDS.every(aw => {
      const picks = teamBallot[aw.key];
      if (!picks) return false;
      return picks.filter(p => p).length >= awardExpectedSize(aw);
    });
    return complete ? 'in' : 'partial';
  }

  function missingAwards(teamBallot) {
    return AWARDS
      .filter(aw => {
        const picks = teamBallot[aw.key];
        if (!picks) return true;
        return picks.filter(p => p).length < awardExpectedSize(aw);
      })
      .map(aw => aw.label);
  }

  const tooltip = document.getElementById('ballot-tooltip');

  function showTooltip(chip, lines) {
    tooltip.textContent = lines.join('\n');
    tooltip.classList.add('visible');
    positionTooltip(chip);
  }

  function positionTooltip(chip) {
    const rect = chip.getBoundingClientRect();
    const tt = tooltip.getBoundingClientRect();
    let top = rect.top - tt.height - 6;
    let left = rect.left + rect.width / 2 - tt.width / 2;
    if (top < 4) top = rect.bottom + 6;
    if (left < 4) left = 4;
    if (left + tt.width > window.innerWidth - 4) left = window.innerWidth - tt.width - 4;
    tooltip.style.top  = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  function hideTooltip() { tooltip.classList.remove('visible', 'wide'); }

  function buildBallotHTML(abb, teamBallot, bios) {
    const state = teamBallot ? ballotState(teamBallot) : 'out';
    const stateLabel = { in: 'Complete', partial: 'Partial', out: 'Not submitted' }[state];
    const teamName = TEAMS[abb] || abb;
    let html = `<div class="btt-header"><span class="btt-team">${teamName}</span><span class="btt-state btt-state-${state}">${stateLabel}</span></div>`;
    if (!teamBallot) return html + '<div class="btt-empty">No ballot submitted yet.</div>';
    html += '<div class="btt-awards">';
    AWARDS.forEach(aw => {
      const picks = teamBallot[aw.key] || [];
      const isTeamAward = aw.key === 'FOTY' || aw.key === 'COTY';
      html += `<div class="btt-award"><span class="btt-label">${aw.label}</span>`;
      if (aw.tierSize && aw.numTiers) {
        html += '<div class="btt-tiers">';
        for (let t = 0; t < aw.numTiers; t++) {
          const tierPicks = picks.slice(t * aw.tierSize, (t + 1) * aw.tierSize)
            .filter(p => p)
            .map(slug => isTeamAward ? (TEAMS[slug] || slug) : displayNameFromBio(bios, slug));
          html += `<div class="btt-tier"><span class="btt-tier-label">${['1st','2nd','3rd'][t]}</span>${tierPicks.length ? tierPicks.join(', ') : '<em>—</em>'}</div>`;
        }
        html += '</div>';
      } else {
        const names = picks.slice(0, aw.maxRank).map(slug =>
          slug ? (isTeamAward ? (TEAMS[slug] || slug) : displayNameFromBio(bios, slug)) : null
        );
        const parts = names.map((n, i) => n ? `${['1st','2nd','3rd'][i]}: ${n}` : null).filter(Boolean);
        html += `<span class="btt-picks">${parts.length ? parts.join(' · ') : '<em>—</em>'}</span>`;
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function buildBallotTracker(ballots, bios, isBod) {
    const section = document.createElement('div');
    section.className = 'ballot-tracker';

    const completeCount = Object.values(ballots).filter(b => ballotState(b) === 'in').length;
    const partialCount  = Object.values(ballots).filter(b => ballotState(b) === 'partial').length;
    const totalTeams    = Object.keys(TEAMS).length;

    const heading = document.createElement('div');
    heading.className = 'ballot-tracker-heading';
    heading.textContent = `Ballots — ${completeCount} complete · ${partialCount} incomplete · ${totalTeams - completeCount - partialCount} pending`;
    section.appendChild(heading);

    const chips = document.createElement('div');
    chips.className = 'ballot-chips';
    Object.keys(TEAMS).sort().forEach(abb => {
      const chip = document.createElement('span');
      const state = ballots[abb] ? ballotState(ballots[abb]) : 'out';
      chip.className = `ballot-chip ${state}`;
      chip.textContent = abb;

      if (isBod) {
        chip.style.cursor = 'pointer';
        chip.addEventListener('mouseenter', () => {
          tooltip.innerHTML = buildBallotHTML(abb, ballots[abb] || null, bios);
          tooltip.classList.add('wide', 'visible');
          positionTooltip(chip);
        });
        chip.addEventListener('mousemove',  () => positionTooltip(chip));
        chip.addEventListener('mouseleave', hideTooltip);
      } else if (state === 'partial') {
        const missing = missingAwards(ballots[abb]);
        chip.addEventListener('mouseenter', () => showTooltip(chip, ['Missing:', ...missing.map(l => `  ${l}`)]));
        chip.addEventListener('mousemove',  () => positionTooltip(chip));
        chip.addEventListener('mouseleave', hideTooltip);
      }

      chips.appendChild(chip);
    });
    section.appendChild(chips);
    return section;
  }

  function render(ballots, bios, isBod) {
    const container = document.getElementById('awards-container');
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'awards-grid';
    AWARDS.slice(0, 7).forEach(aw => {
      grid.appendChild(buildMajorSection(aw, aggregateAward(ballots, bios, aw)));
    });
    container.appendChild(grid);

    AWARDS.slice(7).forEach(aw => {
      container.appendChild(buildTeamSection(aw, aggregateAward(ballots, bios, aw)));
    });

    container.appendChild(buildBallotTracker(ballots, bios, isBod));
  }

  async function fetchAndRender(token, isBod) {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    try {
      const [ballotsRes, biosRes] = await Promise.all([
        fetch(`/api/awards-ballots/${SEASON}`, { headers, cache: 'no-store' }),
        fetch('/api/players'),
      ]);
      if (!ballotsRes.ok) throw new Error(ballotsRes.statusText);
      const [ballots, bios] = await Promise.all([ballotsRes.json(), biosRes.ok ? biosRes.json() : {}]);
      render(ballots, bios, isBod);
      document.getElementById('page-sub').textContent = 'Live voting results — updates automatically.';
    } catch {
      const c = document.getElementById('awards-container');
      if (c) c.innerHTML = '<div id="status">Failed to load voting data.</div>';
    }
  }

  async function checkAccess() {
    let config = {};
    try {
      const r = await fetch('/api/awards-config');
      if (r.ok) config = await r.json();
    } catch {}
    if ((config[SEASON] || {}).revealed) return { allowed: true, token: null, isBod: false };

    const token = localStorage.getItem('nbn_token');
    if (token) {
      try {
        const r = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (r.ok) {
          const me = await r.json();
          const roles = me.roles || [];
          if (roles.some(role => TEAM_ROLES.has(role))) {
            document.getElementById('page-nav').innerHTML =
              '<a href="/awards/">← Awards</a> · <a href="/awards/' + SEASON + '/vote/">My Ballot →</a>';
          }
          const isBod = roles.some(role => role === 'bod' || role === 'admin');
          if (isBod) return { allowed: true, token, isBod: true };
        }
      } catch {}
    }
    return { allowed: false, token: null, isBod: false };
  }

  checkAccess().then(({ allowed, token, isBod }) => {
    if (allowed) {
      fetchAndRender(token, isBod);
      setInterval(() => fetchAndRender(token, isBod), 60_000);
    } else {
      document.getElementById('awards-container').innerHTML =
        '<div id="status">Awards for this season have not been released yet.</div>';
    }
  });

  { const _s = document.createElement('script'); _s.src = '/nav.js'; document.head.appendChild(_s); }
  { const _s = document.createElement('script'); _s.src = '/token-badge.js'; document.head.appendChild(_s); }
})();
