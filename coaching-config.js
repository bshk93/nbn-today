// coaching-config.js — the 2K coach-profile vocabulary, in one place.
//
// A team's own role fills this in on their team page (Coaching tab, teams/team.js)
// and a streamer enters it into the game from the dashboard on /schedule. Both
// consumers read this file rather than hardcoding fields, because the field/option
// list is coupled to whatever 2K build the league is on and *will* change between
// seasons — editing the arrays below is meant to be the entire migration.
//
// Transcribed from the league's legacy coach-settings sheet (one tab per team,
// a shared tab of valid option values). Two things that sheet had are
// deliberately not modeled here: jersey selection (the sheet's own option list
// for it was incomplete) and the "Team Scoreboard" grade table (a computed
// display, not an input).
//
// The server (nbn-api's routers/coaching_settings.py) stores whatever shape a
// team submits and validates none of it — this file is the only schema that
// exists, and it lives in the browser on purpose. Point-buy/minutes totals are
// enforced here, client-side, the same way the § 4.4 PDC ballot widget enforces
// its 1,000-ball total (pdc/index.html's myBallot).
//
// Loaded by teams/team.js the same dynamic-inject-and-await-a-promise way as
// contract.js/cap-health.js (team pages are bodyless shells), and by
// schedule/index.html via a plain <script> tag.

(function (global) {
  'use strict';

  const NO_PREFERENCE = 'No Preference';

  const SYSTEM_NAMES = [
    'Default', 'Balanced', 'Grit and Grind', 'Pace & Space', 'Perimeter Centric',
    'Post Centric', 'Triangle', 'Seven Seconds or Less', 'Defense',
  ];

  const NBA_TEAM_NAMES = [
    'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets',
    'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets',
    'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
    'Los Angeles Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Miami Heat',
    'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans',
    'New York Knicks', 'Oklahoma City Thunder', 'Orlando Magic', 'Philadelphia 76ers',
    'Phoenix Suns', 'Portland Trail Blazers', 'Sacramento Kings', 'San Antonio Spurs',
    'Toronto Raptors', 'Utah Jazz', 'Washington Wizards',
  ];

  const STYLE_OPTIONS = [
    'Athleticism', 'High IQ', 'Intangibles', 'Marketability', 'Shooting Post',
    'Shooting Mid', 'Shooting Three', 'Shot Creation', 'Size', 'Skills',
    'Toughness', 'Transition', 'Two-Way',
  ];

  const FIVE_POINT_SCALES = {
    offense_vs_defense: ['Heavily Offense', 'Leans Offense', 'Balanced', 'Leans Defense', 'Heavily Defense'],
    guards_vs_forwards: ['Heavily to Forwards', 'Slightly to Forwards', 'Balanced', 'Slightly to Guards', 'Heavily to Guards'],
    inside_vs_outside: ['Everything Inside', 'More Inside', 'Balanced', 'More Outside', 'Everything Outside'],
  };

  // Plain select/slider fields, grouped for rendering. Adding, removing, or
  // relabeling a field or option next season = edit these arrays only; no
  // render code anywhere references a field by name.
  const FIELD_GROUPS = [
    {
      key: 'points_of_emphasis', label: 'Points of Emphasis', fields: [
        { key: 'offensive_focus', label: 'Offensive Focus', type: 'select', options: [
          NO_PREFERENCE, 'Neutral Offensive Focus', 'Play Through Star', 'Get To The Basket',
          'Get Shooters Open', 'Feed the Post', 'Pick & Roll Offense',
        ]},
        { key: 'offensive_tempo', label: 'Offensive Tempo', type: 'select', options: [
          NO_PREFERENCE, 'Average Tempo', 'Shoot At Will', 'Patient Offense',
        ]},
        { key: 'offensive_rebounding', label: 'Offensive Rebounding', type: 'select', options: [
          NO_PREFERENCE, 'Some Crash, Others Get Back', 'Limit Transition', 'Crash Offensive Glass',
        ]},
        { key: 'defensive_focus', label: 'Defensive Focus', type: 'select', options: [
          NO_PREFERENCE, 'Neutral Defensive Focus', 'Limit Perimeter Shots', 'Protect the Paint',
        ]},
        { key: 'defensive_aggression', label: 'Defensive Aggression', type: 'select', options: [
          NO_PREFERENCE, 'Neutral Defensive Aggression', 'Aggressive Defense', 'Conservative Defense',
        ]},
        { key: 'defensive_rebounding', label: 'Defensive Rebounding', type: 'select', options: [
          NO_PREFERENCE, 'Some Crash, Others Run', 'Run in Transition', 'Crash Defensive Glass',
        ]},
      ],
    },
    {
      key: 'coach_style', label: 'Coach Style', fields: [
        { key: 'active_system', label: 'Active System', type: 'select', options: SYSTEM_NAMES },
        { key: 'preferred_system', label: 'Preferred System', type: 'select', options: SYSTEM_NAMES },
        { key: 'playbook', label: 'Playbook', type: 'select', options: ['Default', ...NBA_TEAM_NAMES] },
      ],
    },
    {
      key: 'coaching_options', label: 'Coaching Options', fields: [
        { key: 'help_defense', label: 'Help Defense', type: 'slider', min: 0, max: 100 },
        { key: 'run_plays_frequency', label: 'Run Plays Frequency', type: 'slider', min: 0, max: 100 },
        { key: 'zone_usage_frequency', label: 'Zone Usage Frequency', type: 'slider', min: 0, max: 100 },
        { key: 'bench_depth', label: 'Bench Depth', type: 'slider', min: 0, max: 100 },
        { key: 'bench_utilization', label: 'Bench Utilization', type: 'slider', min: 0, max: 100 },
        { key: 'lineup_performance_factor', label: 'Lineup Performance Factor', type: 'slider', min: 0, max: 100 },
      ],
    },
    {
      key: 'coach_tendencies', label: 'Coach Settings', fields: [
        { key: 'style_1', label: 'Style 1', type: 'select', options: STYLE_OPTIONS },
        { key: 'style_2', label: 'Style 2', type: 'select', options: STYLE_OPTIONS },
        { key: 'style_3', label: 'Style 3', type: 'select', options: STYLE_OPTIONS },
        { key: 'offense_vs_defense', label: 'Offense vs Defense', type: 'select', options: FIVE_POINT_SCALES.offense_vs_defense },
        { key: 'guards_vs_forwards', label: 'Guards vs Forwards', type: 'select', options: FIVE_POINT_SCALES.guards_vs_forwards },
        { key: 'inside_vs_outside', label: 'Inside vs Outside', type: 'select', options: FIVE_POINT_SCALES.inside_vs_outside },
      ],
    },
  ];

  // Budget-constrained pools — rendered with the pdc.html ballot widget's
  // range+number-pair-with-running-total shape (myBallot), parameterized by
  // `budget`/`fields` instead of that widget's hardcoded BALLOT_TOTAL/opts.
  const POINT_BUY_POOLS = [
    {
      key: 'system_proficiencies', label: 'System Proficiencies', budget: 500,
      fields: [
        { key: 'balanced', label: 'Balanced', min: 50, max: 90 },
        { key: 'grit_and_grind', label: 'Grit and Grind', min: 50, max: 90 },
        { key: 'pace_and_space', label: 'Pace & Space', min: 50, max: 90 },
        { key: 'perimeter_centric', label: 'Perimeter Centric', min: 50, max: 90 },
        { key: 'post_centric', label: 'Post Centric', min: 50, max: 90 },
        { key: 'triangle', label: 'Triangle', min: 50, max: 90 },
        { key: 'seven_seconds_or_less', label: 'Seven Seconds or Less', min: 50, max: 90 },
        { key: 'defense', label: 'Defense', min: 50, max: 90 },
      ],
    },
    {
      key: 'off_def_ratings', label: 'Offense / Defense Ratings', budget: 160,
      fields: [
        { key: 'offense', label: 'Offense', min: 0, max: 100 },
        { key: 'defense', label: 'Defense', min: 0, max: 100 },
      ],
    },
  ];

  // Player-minutes depth chart — kept separate from the groups/pools above
  // because it's joined against the team's actual roster at render time, not a
  // static option list. A slot's minutes count toward MINUTES_BUDGET; a slot
  // marked `res: true` (Reserve/inactive, the sheet's "RES") counts as 0
  // regardless of whatever number sits in its minutes field.
  const MINUTES_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
  const MINUTES_BUDGET = 240; // 5 starters x 48 minutes

  function poolTotal(pool, poolValues) {
    poolValues = poolValues || {};
    return pool.fields.reduce((n, f) => n + (Number(poolValues[f.key]) || 0), 0);
  }

  function poolRemaining(pool, poolValues) {
    return pool.budget - poolTotal(pool, poolValues);
  }

  function minutesTotal(minutes) {
    minutes = minutes || {};
    return MINUTES_SLOTS.reduce((n, slot) => {
      const row = minutes[slot];
      if (!row || row.res) return n;
      return n + (Number(row.minutes) || 0);
    }, 0);
  }

  function minutesRemaining(minutes) {
    return MINUTES_BUDGET - minutesTotal(minutes);
  }

  function emptyValues() {
    const values = {};
    FIELD_GROUPS.forEach(g => g.fields.forEach(f => { values[f.key] = f.type === 'slider' ? (f.min || 0) : ''; }));
    POINT_BUY_POOLS.forEach(pool => {
      const poolValues = {};
      pool.fields.forEach(f => { poolValues[f.key] = f.min || 0; });
      values[pool.key] = poolValues;
    });
    return values;
  }

  function emptyMinutes() {
    const minutes = {};
    MINUTES_SLOTS.forEach(slot => { minutes[slot] = { slug: '', minutes: 0, res: false }; });
    return minutes;
  }

  // A record (or a live in-progress {values, minutes} pair) is never blocked
  // from saving over an unbalanced point-buy pool or minutes grid — a team
  // should never lose partial work because one slider is off. Instead this is
  // the one place "unbalanced" is decided, so the edit form's warning, the
  // read view's warning, and the streamer dashboard's badge can never
  // disagree about which saved settings are actually usable as-is.
  function validityIssues(record) {
    const values = (record && record.values) || {};
    const minutes = (record && record.minutes) || {};
    const issues = [];
    POINT_BUY_POOLS.forEach(pool => {
      const poolValues = values[pool.key];
      if (poolRemaining(pool, poolValues) !== 0) {
        issues.push(`${pool.label}: ${poolTotal(pool, poolValues)}/${pool.budget}`);
      }
    });
    if (minutesRemaining(minutes) !== 0) {
      issues.push(`Player Minutes: ${minutesTotal(minutes)}/${MINUTES_BUDGET}`);
    }
    return issues;
  }

  // ── Read-only rendering, shared by the team page's Coaching tab and the
  // streamer dashboard on /schedule so the vocabulary and its display logic
  // stay in this one file rather than duplicated between team.js and
  // schedule/index.html. `opts.resolveName(slug)` is optional — without it,
  // the minutes table falls back to showing the raw slug.
  function fieldValueLabel(field, raw) {
    if (raw === undefined || raw === null || raw === '') return '—';
    return String(raw);
  }

  function row(label, value) {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;justify-content:space-between;gap:1rem;padding:0.3rem 0;font-size:0.85rem;border-bottom:1px solid var(--border-subtle,#2a2a2a)';
    const l = document.createElement('span');
    l.style.cssText = 'color:var(--text-muted,#888)';
    l.textContent = label;
    const v = document.createElement('span');
    v.style.cssText = 'color:var(--text-primary,#eee);font-weight:600;text-align:right';
    v.textContent = value;
    r.appendChild(l);
    r.appendChild(v);
    return r;
  }

  function groupCard(title) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card,#181818);border:1px solid var(--border,#333);border-radius:12px;padding:0.9rem 1rem;margin-bottom:0.9rem';
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:700;font-size:0.95rem;margin-bottom:0.4rem';
    h.textContent = title;
    card.appendChild(h);
    return card;
  }

  function renderReadOnly(container, record, opts) {
    opts = opts || {};
    container.innerHTML = '';

    const status = document.createElement('div');
    status.style.cssText = 'font-size:0.78rem;color:var(--text-muted,#888);margin-bottom:1rem';
    if (!record) {
      status.textContent = 'No coaching settings saved yet.';
      container.appendChild(status);
      return;
    }
    const savedLine = record.updated_at
      ? `Saved ${new Date(record.updated_at).toLocaleString()} by ${record.updated_by || 'unknown'}`
      : 'Not yet saved';
    const enteredLine = record.entered_at
      ? `Entered into the game ${new Date(record.entered_at).toLocaleString()} by ${record.entered_by}`
      : 'Not yet entered into the game';
    status.textContent = `${savedLine} · ${enteredLine}${record.pending ? ' · PENDING ENTRY' : ''}`;
    container.appendChild(status);

    const issues = validityIssues(record);
    if (issues.length) {
      const warn = document.createElement('div');
      warn.style.cssText = 'font-size:0.78rem;font-weight:700;color:var(--gold,#c9a227);margin:-0.5rem 0 1rem';
      warn.textContent = '⚠ Not balanced — ' + issues.join(' · ');
      container.appendChild(warn);
    }

    // Cards go in their own flow container, separate from the status/warning
    // lines above, so a page styling it as a multi-column layout (see
    // teams/team.js's `.cs-cards-grid`) doesn't pull those header lines into
    // the columns along with the cards.
    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'cs-cards-grid';
    container.appendChild(cardsWrap);

    const values = record.values || {};
    FIELD_GROUPS.forEach(group => {
      const card = groupCard(group.label);
      group.fields.forEach(f => card.appendChild(row(f.label, fieldValueLabel(f, values[f.key]))));
      cardsWrap.appendChild(card);
    });

    POINT_BUY_POOLS.forEach(pool => {
      const poolValues = values[pool.key] || {};
      const card = groupCard(pool.label);
      pool.fields.forEach(f => card.appendChild(row(f.label, fieldValueLabel(f, poolValues[f.key]))));
      card.appendChild(row('Total', `${poolTotal(pool, poolValues)} / ${pool.budget}`));
      cardsWrap.appendChild(card);
    });

    // `opts.skipMinutesCard` lets a caller that already renders minutes
    // itself, merged into a player-indexed table elsewhere on the page (the
    // team page's Roster Settings), skip the duplicate slot-indexed card
    // here. Default false — the streamer dashboard on /stream has no such
    // table and still needs this card as its only view of minutes.
    if (!opts.skipMinutesCard) {
      const minutes = record.minutes || {};
      const mCard = groupCard('Player Minutes');
      MINUTES_SLOTS.forEach(slot => {
        const m = minutes[slot];
        if (!m || (!m.slug && !m.minutes)) return;
        const name = m.slug ? ((opts.resolveName && opts.resolveName(m.slug)) || m.slug) : '—';
        mCard.appendChild(row(`${slot} — ${name}`, m.res ? 'RES' : String(m.minutes || 0)));
      });
      mCard.appendChild(row('Total', `${minutesTotal(minutes)} / ${MINUTES_BUDGET}`));
      cardsWrap.appendChild(mCard);
    }
  }

  global.CoachingSettings = {
    FIELD_GROUPS, POINT_BUY_POOLS, MINUTES_SLOTS, MINUTES_BUDGET,
    poolTotal, poolRemaining, minutesTotal, minutesRemaining, validityIssues,
    emptyValues, emptyMinutes, renderReadOnly,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.CoachingSettings;
  }
})(typeof window !== 'undefined' ? window : globalThis);
