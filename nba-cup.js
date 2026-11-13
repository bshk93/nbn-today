// NBA Cup standings — the group stage and the quarterfinal bracket it seeds,
// on the NBA's rules. Drawn by the NBA Cup tab on /standings and the
// homepage card while the Cup is on.
//
// Nothing is stored. A Cup game is a schedule game with note "NBA Cup" (the
// schedule is the NBA's own, so the 60 group games come tagged), and the
// groups are read off those games: each team's four Cup opponents are its
// group of five. A game is matched to its box score on date + both teams,
// unordered, like the stats committee's worklist.
//
// NBA rules:
//   - Six groups of five, three per conference; each team plays its group once.
//   - Group winners and one wild card per conference (the best second-place
//     team) reach the quarterfinals. Winners are seeds 1–3 by the criteria
//     below without head-to-head; the wild card is seed 4. 1 v 4, 2 v 3, the
//     higher seed at home.
//   - Ties in a group: head-to-head among the tied teams, then group-stage
//     point differential, then group-stage points scored, then last regular
//     season's record. A step that separates some of the teams restarts the
//     rest at head-to-head. Wild cards and winner seeding skip head-to-head.
//   - An overtime game counts as a zero margin (`ot` from GET
//     /api/boxscores/games). Its points still count toward points scored,
//     since the box scores can't split regulation from overtime.
//   - The last step, a random draw, is left as alphabetical.
//
// Pure apart from load(), so tests/nba-cup.test.js can pin it without a
// browser.
(function (global) {
  const EAST = new Set(['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DET', 'IND',
    'MIA', 'MIL', 'NYK', 'ORL', 'PHI', 'TOR', 'WAS']);
  const NOTE = 'NBA Cup';
  // The bracket is still to play for this long after the last group night
  // (the real one ends in mid-December), so the homepage card stays up.
  const KNOCKOUT_DAYS = 21;

  const confOf = t => (EAST.has(t) ? 'East' : 'West');
  const pairKey = (date, a, b) => `${date}|${[a, b].sort().join('|')}`;

  // schedule: [{date, away_team, home_team, note}]; results: [{date,
  // home_team, away_team, home_score, away_score, ot?}]; prior: {TEAM: {w, l}}
  // for last regular season. Returns the whole picture, or null when the
  // schedule has no Cup games.
  function compute(schedule, results, prior = {}) {
    const cup = (schedule || []).filter(g => g.note === NOTE);
    if (!cup.length) return null;

    const byPair = new Map();
    for (const r of results || []) {
      if (r.gametype && r.gametype !== 'REG') continue;
      byPair.set(pairKey(r.date, r.home_team, r.away_team), r);
    }

    // Each game, with its result once there is a box score.
    const games = cup.map(g => {
      const r = byPair.get(pairKey(g.date, g.home_team, g.away_team));
      if (!r) return { date: g.date, home: g.home_team, away: g.away_team, played: false };
      // Scores by team, whichever way round the box score has the teams.
      const pts = { [r.home_team]: +r.home_score, [r.away_team]: +r.away_score };
      return {
        date: g.date, home: g.home_team, away: g.away_team, played: true,
        homePts: pts[g.home_team], awayPts: pts[g.away_team], ot: +r.ot || 0,
      };
    });

    // Groups: connected components of the Cup games.
    const adj = new Map();
    for (const g of games) {
      if (!adj.has(g.home)) adj.set(g.home, new Set());
      if (!adj.has(g.away)) adj.set(g.away, new Set());
      adj.get(g.home).add(g.away);
      adj.get(g.away).add(g.home);
    }
    const seen = new Set();
    const comps = [];
    for (const t of [...adj.keys()].sort()) {
      if (seen.has(t)) continue;
      const comp = [];
      const stack = [t];
      while (stack.length) {
        const u = stack.pop();
        if (seen.has(u)) continue;
        seen.add(u);
        comp.push(u);
        stack.push(...adj.get(u));
      }
      comps.push(comp.sort());
    }

    // Groups named A, B, C within each conference, in the order of their
    // first team alphabetically. The NBA names them at the draw; we can't.
    const groups = [];
    for (const conf of ['East', 'West']) {
      comps.filter(c => confOf(c[0]) === conf).forEach((teams, i) => {
        const set = new Set(teams);
        const gg = games.filter(g => set.has(g.home));
        groups.push({
          conf, name: `${conf} ${String.fromCharCode(65 + i)}`, teams,
          games: gg,
          complete: gg.every(g => g.played),
          rows: rankGroup(teams, gg, prior),
        });
      });
    }

    const played = games.filter(g => g.played).length;
    const dates = [...new Set(cup.map(g => g.date))].sort();
    return {
      games, groups, played, total: games.length, prior,
      final: played === games.length,
      firstDate: dates[0], lastDate: dates[dates.length - 1], dates,
      bracket: { East: bracket(groups.filter(g => g.conf === 'East'), prior),
                 West: bracket(groups.filter(g => g.conf === 'West'), prior) },
    };
  }

  // One team's line over a set of games: W, L, margin (OT games count 0),
  // points scored.
  function line(team, games) {
    const r = { team, w: 0, l: 0, diff: 0, pf: 0, pa: 0, gp: 0, left: 0 };
    for (const g of games) {
      if (g.home !== team && g.away !== team) continue;
      if (!g.played) { r.left++; continue; }
      const mine = g.home === team ? g.homePts : g.awayPts;
      const theirs = g.home === team ? g.awayPts : g.homePts;
      r.gp++;
      if (mine > theirs) r.w++; else r.l++;
      r.pf += mine;
      r.pa += theirs;
      if (!g.ot) r.diff += mine - theirs;
    }
    return r;
  }

  // 0–0 reads as .500, so an unplayed team sits between winning and losing records.
  const pct = r => (r.gp ? r.w / r.gp : 0.5);
  const priorPct = (prior, t) => {
    const p = prior[t];
    return p && (+p.w + +p.l) ? +p.w / (+p.w + +p.l) : 0;
  };

  // Splits `teams` (all level so far) by a numeric key, higher first, and
  // breaks each still-level subgroup with `rest`. Returns teams in order.
  function splitBy(teams, key, rest) {
    const buckets = new Map();
    for (const t of teams) {
      const k = key(t);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(t);
    }
    const order = [...buckets.keys()].sort((a, b) => b - a);
    return order.flatMap(k => rest(buckets.get(k), buckets.size > 1));
  }

  // Orders teams level on record. withH2H: start at head-to-head (within a
  // group). A step that separates anyone sends each smaller tie back to the
  // start; one that separates nobody passes the whole tie to the next step.
  function breakTie(teams, lines, games, prior, withH2H) {
    if (teams.length < 2) return teams;
    const steps = [];
    if (withH2H) {
      steps.push(tied => {
        const set = new Set(tied);
        const among = games.filter(g => set.has(g.home) && set.has(g.away));
        return t => pct(line(t, among));
      });
    }
    steps.push(() => t => lines[t].diff);
    steps.push(() => t => lines[t].pf);
    steps.push(() => t => priorPct(prior, t));

    const run = (tied, i) => {
      if (tied.length < 2) return tied;
      if (i >= steps.length) return [...tied].sort();
      const key = steps[i](tied);
      return splitBy(tied, key, (sub, separated) =>
        separated ? breakTie(sub, lines, games, prior, withH2H) : run(sub, i + 1));
    };
    return run(teams, 0);
  }

  // A group's table, best first.
  function rankGroup(teams, games, prior) {
    const lines = Object.fromEntries(teams.map(t => [t, line(t, games)]));
    const order = splitBy(teams, t => pct(lines[t]), sub => breakTie(sub, lines, games, prior, true));
    return order.map(t => lines[t]);
  }

  // Ranks rows from different groups: record, then margin, points, last
  // season. No head-to-head, since they haven't played each other.
  function rankAcross(rows, prior) {
    const lines = Object.fromEntries(rows.map(r => [r.team, r]));
    return splitBy(rows.map(r => r.team), t => pct(lines[t]),
      sub => breakTie(sub, lines, [], prior, false)).map(t => lines[t]);
  }

  // A conference's quarterfinals as things stand: [[1, 4], [2, 3]], each a
  // row with seed, group name and `wildcard`.
  function bracket(groups, prior) {
    if (groups.length < 2 || groups.some(g => g.rows.length < 2)) return null;
    const winners = rankAcross(groups.map(g => g.rows[0]), prior);
    const wild = rankAcross(groups.map(g => g.rows[1]), prior)[0];
    const groupOf = t => groups.find(g => g.teams.includes(t)).name;
    const seeds = [...winners, wild].map((r, i) => ({ ...r, seed: i + 1, group: groupOf(r.team), wildcard: i === winners.length }));
    return { seeds, games: [[seeds[0], seeds[3]], [seeds[1], seeds[2]]] };
  }

  // The second-place teams in a conference, as the wild-card race reads.
  function wildcardRace(cup, conf) {
    return rankAcross(cup.groups.filter(g => g.conf === conf).map(g => g.rows[1]).filter(Boolean), cup.prior);
  }

  // Each team's place right now: 'winner' (leads its group), 'wildcard'
  // (leads its conference's second-place teams), or ''. `cup.bracket` decides.
  function status(cup) {
    const out = {};
    for (const conf of ['East', 'West']) {
      const b = cup.bracket[conf];
      if (!b) continue;
      for (const s of b.seeds) out[s.team] = s.wildcard ? 'wildcard' : 'winner';
    }
    return out;
  }

  // Whether the homepage should show the Cup: from the first Cup night until
  // KNOCKOUT_DAYS after the last.
  function isActive(cup, today) {
    if (!cup || !today) return false;
    const end = new Date(cup.lastDate + 'T12:00:00Z');
    end.setUTCDate(end.getUTCDate() + KNOCKOUT_DAYS);
    return today >= cup.firstDate && today <= end.toISOString().slice(0, 10);
  }

  // "26-27" → "25-26".
  const prevSeason = s => {
    const m = /^(\d\d)-(\d\d)$/.exec(s || '');
    if (!m) return null;
    const p = n => String((+n + 99) % 100).padStart(2, '0');
    return `${p(m[1])}-${p(m[2])}`;
  };

  // Last season's records from standings-history.csv rows.
  function priorFrom(rows, season) {
    const prev = prevSeason(season);
    const out = {};
    for (const r of rows || []) if (r.SEASON === prev) out[r.TEAM] = { w: +r.W, l: +r.L };
    return out;
  }

  // Fetches what compute() needs. `standings` (parsed standings-history.csv
  // rows) and `schedule` (GET /api/schedule) may be passed in by a page
  // that already has them.
  async function load({ schedule, standings } = {}) {
    const j = u => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const sched = schedule || await j('/api/schedule');
    if (!sched || !Array.isArray(sched.games) || !sched.games.some(g => g.note === NOTE)) return null;
    const rows = standings || await fetch('/standings/standings-history.csv')
      .then(r => (r.ok ? r.text() : '')).catch(() => '')
      .then(text => {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const hdr = lines[0].split(',');
        return lines.slice(1).map(l => Object.fromEntries(l.split(',').map((c, i) => [hdr[i], c])));
      });
    const results = await j(`/api/boxscores/games?season=${encodeURIComponent(sched.season)}`) || [];
    const cup = compute(sched.games, results, priorFrom(rows, sched.season));
    if (cup) cup.season = sched.season;
    return cup;
  }

  global.NbaCup = { compute, load, status, wildcardRace, isActive, priorFrom, prevSeason, confOf, NOTE };
})(typeof window !== 'undefined' ? window : globalThis);
