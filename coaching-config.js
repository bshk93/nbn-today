// coaching-config.js — the 2K coach-profile vocabulary, in one place.
//
// A team's own role fills this in on their team page (Coaching tab, teams/team.js)
// and a streamer enters it into the game from /committees/stream. Both
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
// its 1,000-ball total (committees/pdc/index.html's myBallot).
//
// Any group, field or pool can carry a `note`: help text shown as an ⓘ
// tooltip next to its label, in both the edit form and the read view.
//
// Loaded by teams/team.js the same dynamic-inject-and-await-a-promise way as
// contract.js/cap-health.js (team pages are bodyless shells), and by
// committees/stream/index.html via a plain <script> tag.

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
      // `optional`: a blank field means "keep the playbook's default", so it
      // is stored as '' rather than forced to a number.
      key: 'coaching_options', label: 'Coaching Options', optional: true,
      note: 'Each Playbook comes with default coaching option values.\n'
        + 'If you want to change any of the values, enter them here.\n'
        + 'If you want to keep the default, leave the value blank.',
      fields: [
        { key: 'help_defense', label: 'Help Defense', type: 'slider', min: 0, max: 100 },
        { key: 'run_plays_frequency', label: 'Run Plays Frequency', type: 'slider', min: 0, max: 100 },
        { key: 'zone_usage_frequency', label: 'Zone Usage Frequency', type: 'slider', min: 0, max: 100 },
        { key: 'bench_depth', label: 'Bench Depth', type: 'slider', min: 5, max: 15,
          note: 'How many players deep you want your rotations' },
        { key: 'bench_utilization', label: 'Bench Utilization', type: 'slider', min: 0, max: 100 },
        { key: 'lineup_performance_factor', label: 'Lineup Performance Factor', type: 'slider', min: 0, max: 100,
          note: 'Takes into account how the current lineup is performing when determining substitutions' },
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
  //
  // `oneFieldMax` lets exactly one field in the pool go past its own `max`, up
  // to this value. System Proficiencies: every system has a floor of 50, there
  // are 100 points on top of the floors (8 x 50 + 100 = 500), one system may
  // go to 90 and the rest top out at 80.
  const systemNote = (summary, positives, negatives) =>
    `${summary}\n\nPositives: ${positives}\nNegatives: ${negatives}`;

  const POINT_BUY_POOLS = [
    {
      key: 'system_proficiencies', label: 'System Proficiencies', budget: 500, oneFieldMax: 90,
      note: 'Each System has a floor of 50 points.\n'
        + 'You have 100 additional points to assign as you please.\n'
        + 'You can raise one system to a max of 90.\n'
        + 'The max for everything else is 80.',
      fields: [
        { key: 'balanced', label: 'Balanced', min: 50, max: 80, note: systemNote(
          'Focuses on the overall game and even shot distribution',
          'Limits turnovers',
          'Solid all around but doesn\'t excel at one thing') },
        { key: 'grit_and_grind', label: 'Grit and Grind', min: 50, max: 80, note: systemNote(
          'Emphasis on slowing the game down, playing tough and punishing inside play',
          'Tempo limits opponents, physical style wears down offenses',
          'Decreases comeback chances from a large deficit') },
        { key: 'pace_and_space', label: 'Pace & Space', min: 50, max: 80, note: systemNote(
          'Uses continuous ball and player movement to extend the defense, allowing spacing for 3-pointers and drives',
          'Increased 3-point opportunities, spreads the opposing defense',
          'Sacrifices strength and size, not ideal for isolation players') },
        { key: 'perimeter_centric', label: 'Perimeter Centric', min: 50, max: 80, note: systemNote(
          'Emphasizes a spaced floor with four perimeter shooters and lots of pick and roll',
          'Creates mismatches in favor of stretch bigs',
          'Poor defense against bigs, poor rebounding') },
        { key: 'post_centric', label: 'Post Centric', min: 50, max: 80, note: systemNote(
          'Emphasizes players with size and strength, who prefer to pound the ball inside',
          'Creates mismatches with poor inside defenders, creates open outside shots, more free throws',
          'Limited 3-point attempts, slower tempo') },
        { key: 'triangle', label: 'Triangle', min: 50, max: 80, note: systemNote(
          'Ensures a balanced, freelance approach that utilizes the talents of superstar scorers',
          'Enhanced rebounding, spacing for post and high-post opportunities, facilitates ball movement and isolation scoring',
          'Does not create many 3-point opportunities, requires players with high basketball IQ, does not create early scoring opportunities') },
        { key: 'seven_seconds_or_less', label: 'Seven Seconds or Less', min: 50, max: 80, note: systemNote(
          'Forces tempo with quick shots from the key or three',
          'Many early scoring chances, emphasis on more points per possession',
          'Can translate into poor defensive focus, often outrebounded') },
        { key: 'defense', label: 'Defense', min: 50, max: 80, note: systemNote(
          'Emphasizes making each possession tough, creating fast-break chances with pressure defense',
          'Improved defensive rebounding, great defense',
          'Lack of offensive consistency, increased foul chances') },
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

  // The fields sitting above their own `max` (only possible with oneFieldMax).
  function poolRaisedFields(pool, poolValues) {
    poolValues = poolValues || {};
    return pool.fields.filter(f => (Number(poolValues[f.key]) || 0) > f.max);
  }

  // The highest value a field may take right now: oneFieldMax if no other
  // field in the pool is already using that one slot, else its own max.
  function fieldMax(pool, field, poolValues) {
    if (!pool.oneFieldMax) return field.max;
    const others = poolRaisedFields(pool, poolValues).filter(f => f.key !== field.key);
    return others.length ? field.max : pool.oneFieldMax;
  }

  // Everything wrong with one pool, as display strings. Empty = usable as-is.
  function poolIssues(pool, poolValues) {
    poolValues = poolValues || {};
    const issues = [];
    if (poolRemaining(pool, poolValues) !== 0) {
      issues.push(`${pool.label}: ${poolTotal(pool, poolValues)}/${pool.budget}`);
    }
    pool.fields.forEach(f => {
      const v = Number(poolValues[f.key]) || 0;
      const hardMax = pool.oneFieldMax || f.max;
      if (v < f.min) issues.push(`${pool.label}: ${f.label} below ${f.min}`);
      if (v > hardMax) issues.push(`${pool.label}: ${f.label} above ${hardMax}`);
    });
    const raised = poolRaisedFields(pool, poolValues);
    if (raised.length > 1) {
      issues.push(`${pool.label}: only one can go above ${raised[0].max} (${raised.map(f => f.label).join(', ')})`);
    }
    return issues;
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

  const isBlank = v => v === undefined || v === null || v === '';

  // What an untouched field starts at: blank for selects and for an optional
  // group's sliders (blank = playbook default), the floor for other sliders.
  function emptyFieldValue(group, field) {
    return field.type === 'slider' && !group.optional ? (field.min || 0) : '';
  }

  function emptyValues() {
    const values = {};
    FIELD_GROUPS.forEach(g => g.fields.forEach(f => { values[f.key] = emptyFieldValue(g, f); }));
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
    const minutes = (record && record.minutes) || {};
    const issues = valuesIssues((record && record.values) || {});
    if (minutesRemaining(minutes) !== 0) {
      issues.push(`Player Minutes: ${minutesTotal(minutes)}/${MINUTES_BUDGET}`);
    }
    return issues;
  }

  // The part of validityIssues that the Coaching tab's edit form controls:
  // every field and pool, but not the minutes grid (edited elsewhere).
  function valuesIssues(values) {
    const issues = [];
    FIELD_GROUPS.forEach(g => g.fields.forEach(f => {
      const raw = values[f.key];
      if (f.type !== 'slider' || isBlank(raw)) return;
      if (Number(raw) < f.min || Number(raw) > f.max) issues.push(`${f.label}: ${raw} (allowed ${f.min}–${f.max})`);
    }));
    POINT_BUY_POOLS.forEach(pool => issues.push(...poolIssues(pool, values[pool.key])));
    return issues;
  }

  // ── Read-only rendering, shared by the team page's Coaching tab and the
  // streamer dashboard on /committees/stream so the vocabulary and its display
  // logic stay in this one file rather than duplicated between team.js and
  // committees/stream/index.html. `opts.resolveName(slug)` is optional —
  // without it, the minutes table falls back to showing the raw slug.
  function fieldValueLabel(field, raw, group) {
    if (isBlank(raw)) return group && group.optional ? 'Playbook default' : '—';
    return String(raw);
  }

  // ── Notes: an ⓘ next to a label that shows the schema's `note` text. Hover
  // on a pointer device, tap to toggle on touch. One popup at a time, attached
  // to <body> so the multi-column card grid can't clip it.
  let tipEl = null, tipAnchor = null;
  function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; tipAnchor = null; } }
  function showTip(anchor, text) {
    hideTip();
    const tip = document.createElement('div');
    tip.setAttribute('role', 'tooltip');
    tip.style.cssText = 'position:absolute;z-index:1000;max-width:300px;padding:0.5rem 0.65rem;'
      + 'background:var(--bg-card,#181818);border:1px solid var(--border,#333);border-radius:6px;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,0.35);color:var(--text-secondary,#ccc);'
      + 'font-size:0.75rem;font-weight:400;line-height:1.4;white-space:pre-line;pointer-events:none';
    tip.textContent = text;
    document.body.appendChild(tip);
    const r = anchor.getBoundingClientRect();
    let left = r.left + r.width / 2 - tip.offsetWidth / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tip.offsetWidth - 6));
    let top = r.top - tip.offsetHeight - 8;
    if (top < 4) top = r.bottom + 8;
    tip.style.left = `${left + window.scrollX}px`;
    tip.style.top = `${top + window.scrollY}px`;
    tipEl = tip;
    tipAnchor = anchor;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => { if (tipEl && !e.target.closest('.cs-note')) hideTip(); });
    window.addEventListener('scroll', hideTip, { passive: true });
  }

  function noteIcon(text) {
    const icon = document.createElement('span');
    icon.className = 'cs-note';
    icon.textContent = 'ⓘ';
    icon.tabIndex = 0;
    icon.setAttribute('aria-label', text);
    icon.style.cssText = 'margin-left:0.35rem;color:var(--text-muted,#888);cursor:help;font-weight:400;font-size:0.85em';
    if (window.matchMedia('(hover: none)').matches) {
      icon.addEventListener('click', e => {
        e.stopPropagation();
        if (tipAnchor === icon) hideTip(); else showTip(icon, text);
      });
    } else {
      icon.addEventListener('mouseenter', () => showTip(icon, text));
      icon.addEventListener('mouseleave', hideTip);
      icon.addEventListener('focus', () => showTip(icon, text));
      icon.addEventListener('blur', hideTip);
    }
    return icon;
  }

  // A label element with the item's note attached, if it has one.
  function labelWithNote(text, note, cssText) {
    const l = document.createElement('span');
    l.style.cssText = cssText || '';
    l.textContent = text;
    if (note) l.appendChild(noteIcon(note));
    return l;
  }

  function row(label, value, note) {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;justify-content:space-between;gap:1rem;padding:0.3rem 0;font-size:0.85rem;border-bottom:1px solid var(--border-subtle,#2a2a2a)';
    const l = labelWithNote(label, note, 'color:var(--text-muted,#888)');
    const v = document.createElement('span');
    v.style.cssText = 'color:var(--text-primary,#eee);font-weight:600;text-align:right';
    v.textContent = value;
    r.appendChild(l);
    r.appendChild(v);
    return r;
  }

  function groupCard(title, note) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card,#181818);border:1px solid var(--border,#333);border-radius:12px;padding:0.9rem 1rem;margin-bottom:0.9rem';
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:700;font-size:0.95rem;margin-bottom:0.4rem';
    h.textContent = title;
    if (note) h.appendChild(noteIcon(note));
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
      const card = groupCard(group.label, group.note);
      group.fields.forEach(f => card.appendChild(row(f.label, fieldValueLabel(f, values[f.key], group), f.note)));
      cardsWrap.appendChild(card);
    });

    POINT_BUY_POOLS.forEach(pool => {
      const poolValues = values[pool.key] || {};
      const card = groupCard(pool.label, pool.note);
      pool.fields.forEach(f => card.appendChild(row(f.label, fieldValueLabel(f, poolValues[f.key]), f.note)));
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
    poolTotal, poolRemaining, poolIssues, fieldMax, valuesIssues, minutesTotal, minutesRemaining, validityIssues,
    emptyValues, emptyFieldValue, emptyMinutes, renderReadOnly, labelWithNote, noteIcon,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.CoachingSettings;
  }
})(typeof window !== 'undefined' ? window : globalThis);
