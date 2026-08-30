// cap-health.js — how to read a team's cap position, in one place.
//
// Two vocabularies live here, both of which existed in more than one form
// before this file did:
//
// 1. **The standing rules** — where a team sits against § 1.3/1.4's cap and
//    aprons, its own hard cap, and § 2.1/2.1a/2.2's roster limits. These were
//    written inside `setupWhatIfMode`'s closure in teams/team.js, which meant
//    the real roster never got them: a team could sit a player under the
//    § 2.1 floor all season and the only surface that would have said so was
//    a hypothetical one you had to opt into.
// 2. **The reconciliation vocabulary** — the category labels and colours for
//    build/poopoo.py's sheet-vs-site diffs, which /poopoo owned privately.
//    A team page showing an owner their own diffs has to name them the same
//    way the committee's page does, or the two surfaces describe the same row
//    with different words.
//
// **This file does no cap math.** It is handed Team Salary on both bases,
// already computed by whoever called it — `computeCapSummary` in team.js on a
// team page, `GET /api/cap-history/current` for anything looking at all 30
// teams — and it compares those figures to thresholds. Same invariant the API's
// fact sheets hold (nbn-api's "the fact sheet must never do its own cap math"):
// a surface that recomputes can show a team room the validator never credited.
//
// Loaded by teams/team.js (injected <script> + awaited promise, like
// teams/lineup.js) and by poopoo/index.html (plain <script>). Kept free of
// dependencies so a page needs nothing else to use it.

(function (global) {
  'use strict';

  // § 2.1 / § 2.1a / § 2.2. The 15-man limit is in-season; the offseason
  // ceiling is 20, and the site has no regular-season start date on file, so
  // nothing here can tell you which one binds today — see rosterLimits below.
  const ROSTER_MIN = 14;
  const ROSTER_MAX_IN_SEASON = 15;
  const ROSTER_MAX_OFFSEASON = 20;
  const ROSTER_CHARGE_MIN = 12;
  const TWO_WAY_MAX = 3;

  function _fmt(v) {
    return '$' + Math.round(Math.abs(v || 0)).toLocaleString('en-US');
  }

  // A threshold of 0 or null means "not entered for this season", not "zero
  // dollars". 27-28 onward are on file with cap/apron1/apron2 all literally 0;
  // read naively every team is over every line in those seasons. The API's
  // cap-history router normalises the same way, for the same reason.
  function known(level) {
    return level ? level : null;
  }

  // ---------------------------------------------------------------------------
  // Standing
  // ---------------------------------------------------------------------------

  // opts:
  //   season, capLevels          — the cap-levels map and which season to read
  //   teamState                  — for hard_cap ('first_apron'|'second_apron')
  //   teamSalaryFull             — Team Salary including free-agent holds (§ 3.2 basis)
  //   teamSalaryExHolds          — Team Salary excluding them (§ 1.3/1.4 basis)
  //   standardCount, twoWayCount — roster counts, standard slots and G-League slots
  //   erc                        — { deficiency, charge } from computeEmptyRosterCharge
  //   fmt                        — dollar formatter, so a caller keeps one of them
  //
  // Returns { rows, warnings }. `rows` is the standing table, in reading order.
  // `warnings` is every rule statement, each with a severity — callers filter:
  // a team page's always-visible card shows only 'violation' and 'caution',
  // since "over the Salary Cap" is the normal condition for most of the league
  // and the standing table already says it in dollars. What-If Mode shows all
  // of them, because there the whole point is what a hypothetical move crosses.
  function standing(opts) {
    const fmt = opts.fmt || _fmt;
    const cl = (opts.capLevels || {})[opts.season] || {};
    const full = opts.teamSalaryFull || 0;
    const exHolds = opts.teamSalaryExHolds || 0;
    const holds = full - exHolds;
    const cap = known(cl.cap);
    const apron1 = known(cl.apron1);
    const apron2 = known(cl.apron2);
    const hardCapKey = opts.teamState?.hard_cap === 'second_apron' ? 'apron2'
      : opts.teamState?.hard_cap === 'first_apron' ? 'apron1' : null;
    const hardCapLevel = hardCapKey ? known(cl[hardCapKey]) : null;

    const rows = [];
    const warnings = [];

    rows.push({
      key: 'salary', label: 'Team Salary', amount: full,
      note: holds ? `${fmt(holds)} of that is free-agent holds` : 'no free-agent holds',
      tone: 'plain',
    });

    // Against the cap, holds count (§ 3.2 — Room Exception eligibility is
    // Cap-based and still counts them). Against the aprons and a hard cap they
    // do not (§ 1.3/1.4). Comparing the wrong figure to the wrong line is the
    // single easiest mistake to make here, so each row names its own basis.
    if (cap === null) {
      rows.push({ key: 'cap', label: 'Salary Cap', amount: null,
        note: 'not set for this season yet', tone: 'unknown' });
    } else if (full > cap) {
      rows.push({ key: 'cap', label: 'Salary Cap', amount: cap,
        note: `over by ${fmt(full - cap)}`, tone: 'over' });
    } else {
      rows.push({ key: 'cap', label: 'Salary Cap', amount: cap,
        note: `${fmt(cap - full)} of room`, tone: 'under' });
    }

    [['apron1', 'First Apron', apron1], ['apron2', 'Second Apron', apron2]].forEach(([key, label, level]) => {
      if (level === null) {
        rows.push({ key, label, amount: null, note: 'not set for this season yet', tone: 'unknown' });
      } else if (exHolds > level) {
        rows.push({ key, label, amount: level, note: `over by ${fmt(exHolds - level)}`, tone: 'over' });
      } else {
        rows.push({ key, label, amount: level, note: `${fmt(level - exHolds)} below`, tone: 'under' });
      }
    });

    if (hardCapKey) {
      const label = `Hard Cap (${hardCapKey === 'apron2' ? 'Second' : 'First'} Apron)`;
      if (hardCapLevel === null) {
        rows.push({ key: 'hard_cap', label, amount: null,
          note: 'not set for this season yet', tone: 'unknown' });
      } else if (exHolds > hardCapLevel) {
        rows.push({ key: 'hard_cap', label, amount: hardCapLevel,
          note: `over by ${fmt(exHolds - hardCapLevel)}`, tone: 'violation' });
      } else {
        rows.push({ key: 'hard_cap', label, amount: hardCapLevel,
          note: `${fmt(hardCapLevel - exHolds)} of room`, tone: 'under' });
      }
    }

    // Exactly one salary warning, the most severe line crossed: anything over
    // the second apron is necessarily over the first and over the cap too, so
    // listing all three says one thing three times. Only the hard cap is a
    // violation rather than a position — § 1.4 makes it impassable, where being
    // over the cap or an apron is merely expensive, and is where most of the
    // league sits.
    const apronName = hardCapKey === 'apron2' ? 'Second' : 'First';
    if (hardCapLevel !== null && exHolds > hardCapLevel) {
      warnings.push({ code: 'hard_cap_exceeded', severity: 'violation',
        text: `Violates this team's Hard Cap (${apronName} Apron) by ${fmt(exHolds - hardCapLevel)}` });
    } else if (apron2 !== null && exHolds > apron2) {
      warnings.push({ code: 'over_apron2', severity: 'note',
        text: `Over the Second Apron by ${fmt(exHolds - apron2)}` });
    } else if (apron1 !== null && exHolds > apron1) {
      warnings.push({ code: 'over_apron1', severity: 'note',
        text: `Over the First Apron by ${fmt(exHolds - apron1)}` });
    } else if (cap !== null && full > cap) {
      warnings.push({ code: 'over_cap', severity: 'note',
        text: `Over the Salary Cap by ${fmt(full - cap)}` });
    }

    const standard = opts.standardCount || 0;
    const twoWay = opts.twoWayCount || 0;
    const limits = rosterLimits(standard, twoWay, opts.erc, fmt);
    rows.push(limits.row);
    limits.warnings.forEach(w => warnings.push(w));

    return { rows, warnings };
  }

  // § 2.1's floor is year-round and its ceiling is not: 15 in season, 20 in the
  // offseason. Nothing on the site records when the regular season starts, so
  // this deliberately does not guess which ceiling binds — being over 15 in
  // August is a trim owed, not a breach, and calling it a violation would cry
  // wolf on the 13 teams that are legitimately over it right now. Over 20 is
  // unambiguous in either phase.
  function rosterLimits(standard, twoWay, erc, fmt) {
    fmt = fmt || _fmt;
    const warnings = [];
    let tone = 'ok';
    let note;

    if (standard < ROSTER_CHARGE_MIN) {
      tone = 'violation';
      note = `below the ${ROSTER_MIN}-player minimum (§ 2.1)`;
      warnings.push({ code: 'roster_below_min', severity: 'violation',
        text: `${standard} standard players — below § 2.1's ${ROSTER_MIN}-player minimum, which applies year-round` });
      const charge = erc?.charge;
      warnings.push({ code: 'empty_roster_charge', severity: 'violation',
        text: charge
          ? `${erc.deficiency} empty slot${erc.deficiency === 1 ? '' : 's'} below § 2.1a's ${ROSTER_CHARGE_MIN}-player floor, charged ${fmt(charge)} against Team Salary`
          : `Below § 2.1a's ${ROSTER_CHARGE_MIN}-player floor — an Empty Roster Charge applies` });
    } else if (standard < ROSTER_MIN) {
      tone = 'violation';
      note = `below the ${ROSTER_MIN}-player minimum (§ 2.1)`;
      warnings.push({ code: 'roster_below_min', severity: 'violation',
        text: `${standard} standard players — below § 2.1's ${ROSTER_MIN}-player minimum, which applies year-round` });
    } else if (standard > ROSTER_MAX_OFFSEASON) {
      tone = 'violation';
      note = `over the ${ROSTER_MAX_OFFSEASON}-player offseason ceiling (§ 2.1)`;
      warnings.push({ code: 'roster_over_offseason_max', severity: 'violation',
        text: `${standard} standard players — over § 2.1's ${ROSTER_MAX_OFFSEASON}-player offseason ceiling` });
    } else if (standard > ROSTER_MAX_IN_SEASON) {
      tone = 'caution';
      note = `${standard - ROSTER_MAX_IN_SEASON} over the in-season limit of ${ROSTER_MAX_IN_SEASON}`;
      warnings.push({ code: 'roster_trim_owed', severity: 'caution',
        text: `${standard} standard players — § 2.1 allows ${ROSTER_MAX_OFFSEASON} in the offseason, so this is legal now, but ${standard - ROSTER_MAX_IN_SEASON} must go before opening night` });
    } else if (standard === ROSTER_MIN) {
      note = `at the § 2.1 floor of ${ROSTER_MIN}`;
    } else {
      note = `within § 2.1's ${ROSTER_MIN}–${ROSTER_MAX_IN_SEASON} in-season range`;
    }

    if (twoWay > TWO_WAY_MAX) {
      warnings.push({ code: 'two_way_over_max', severity: 'violation',
        text: `${twoWay} two-way players — § 2.2 allows ${TWO_WAY_MAX}` });
      if (tone === 'ok') tone = 'violation';
    }

    const label = twoWay ? `${standard} + ${twoWay} two-way` : `${standard}`;
    return { row: { key: 'roster', label: 'Roster', amount: null, value: label, note, tone }, warnings };
  }

  // ---------------------------------------------------------------------------
  // Reconciliation vocabulary — one naming of build/poopoo.py's diff categories
  // ---------------------------------------------------------------------------

  const DIFF_CATEGORIES = {
    aggregate:                { label: "Aggregate",         color: "var(--danger)", desc: "Guaranteed salary or hard-cap status disagrees at the team level." },
    mle:                      { label: "MLE",               color: "#38bdf8", desc: "Mid-level exception usage disagrees." },
    bae:                      { label: "BAE",               color: "#38bdf8", desc: "Bi-annual exception availability disagrees." },
    tpe:                      { label: "TPE",               color: "#38bdf8", desc: "Trade exception remaining amount disagrees." },
    player_salary:            { label: "Salary",            color: "var(--danger)", desc: "A signed player's real contract amount disagrees between sheet and site, for the current season." },
    player_future_years:      { label: "Future Salary",     color: "#fb923c", desc: "This player's salary or free-agent status disagrees with the sheet in one or more seasons beyond the current one. One row per player — every differing season is listed inside it." },
    player_hold:              { label: "Cap Hold",          color: "var(--danger-alt)", desc: "A free agent's cap-hold amount disagrees — both sides have computed a real number, they just don't match (e.g. a Bird-rights tier dispute)." },
    player_hold_uncalculated: { label: "Hold Not Calculated", color: "var(--gold-alt)", desc: "The site has never computed a real cap-hold amount for this free agent — it's sitting at a $1 placeholder. A known, systemic gap, not a fresh dispute.", grouped: true },
    player_status:            { label: "Status",            color: "#e879f9", desc: "One side treats this player as signed to a contract, the other as an unsigned free-agent hold." },
    player_team_conflict:     { label: "Team Conflict",     color: "#2dd4bf", desc: "Sheet and site disagree on which team currently holds this player's rights." },
    player_missing:           { label: "Missing on Site",   color: "#94a3b8", desc: "The sheet lists this player on this team; the site has no record of him on any roster." },
    player_extra:             { label: "Extra on Site",     color: "#94a3b8", desc: "The site has this player on the roster; the sheet doesn't list him anywhere in the league." },
    player_dead_cap_mismatch: { label: "Dead Cap Status",   color: "#e879f9", desc: "The sheet books this player as a flat Dead Cap charge; the site still carries him as an active roster entry with a real salary/hold. Likely a release/waive that happened but was never entered as a transaction on the site." },
    pick_signed:              { label: "Pick Signed Early", color: "#dc2626", desc: "The sheet still shows this pick as unsigned draft rights, but the site already has him fully signed to a contract (the 2026 mass-autosign bug, recurring)." },
  };

  // Severity order, worst first. A player on the wrong roster outranks a dollar
  // disagreement: one is a question about who is on your team, the other about
  // how much he costs.
  const DIFF_ORDER = [
    "pick_signed", "player_status", "player_dead_cap_mismatch", "player_team_conflict", "aggregate",
    "player_salary", "player_future_years", "player_hold", "mle", "bae", "tpe",
    "player_missing", "player_extra", "player_hold_uncalculated",
  ];

  function diffMeta(category) {
    return DIFF_CATEGORIES[category] || { label: category, color: 'var(--text-muted)', desc: '' };
  }

  function sortDiffs(diffs) {
    const rank = c => {
      const i = DIFF_ORDER.indexOf(c);
      return i === -1 ? DIFF_ORDER.length : i;
    };
    return (diffs || []).slice().sort((a, b) =>
      rank(a.category) - rank(b.category) ||
      String(a.field || '').localeCompare(String(b.field || '')));
  }

  global.CapHealth = {
    ROSTER_MIN, ROSTER_MAX_IN_SEASON, ROSTER_MAX_OFFSEASON, ROSTER_CHARGE_MIN, TWO_WAY_MAX,
    known, standing, rosterLimits,
    DIFF_CATEGORIES, DIFF_ORDER, diffMeta, sortDiffs,
  };
})(window);
