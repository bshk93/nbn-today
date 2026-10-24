// The award race on /awards/race — a formula ladder for MVP, DPOY, ROTY, MIP
// and 6MOY from the season's stats so far. Not a vote and not a prediction of
// one: a transparent formula, which the page checks against every past winner
// it can and prints the score.
//
// The formulas were picked by backtesting on 20-21 to 25-26 (2026-10-21):
//   MVP   Game Score per game × √(team win %)                      5 of 6
//   DPOY  (STL + BLK + 0.15·REB) per 36 × √(MPG/36) × win%^0.3      6 of 6
//   ROTY  Game Score per game, players in their first NBN season   6 of 6
//         (20-21, the league's first, falls back to that draft class)
//   MIP   Game Score per game, up on last season (20+ games then)  3 of 5
//   6MOY  Game Score per game, more games off the bench than started —
//         starts are only recorded from 26-27, so this one has no history.
//
// Pure, so tests/award-race.test.js can pin it without a browser.
(function (global) {
  const AWARDS = [
    { key: 'MVP',  label: 'Most Valuable Player' },
    { key: 'DPOY', label: 'Defensive Player of the Year' },
    { key: 'ROTY', label: 'Rookie of the Year' },
    { key: '6MOY', label: 'Sixth Man of the Year' },
    { key: 'MIP',  label: 'Most Improved Player' },
  ];

  const prevSeason = s => {
    const a = +s.slice(0, 2) - 1;
    return `${String(a).padStart(2, '0')}-${String(a + 1).padStart(2, '0')}`;
  };

  // One line per player for a season: totals across teams, the team he played
  // for most recently, and his team win % weighted by games with each team.
  // `rows` are player_seasons.csv rows; `pct` maps "season|TEAM" → win %.
  function players(rows, season, pct) {
    const out = new Map();
    rows.forEach(r => {
      if (r.SEASON !== season) return;
      const k = r.SLUG || r.PLAYER;
      const g = +r.G || 0;
      let p = out.get(k);
      if (!p) {
        p = { slug: r.SLUG, name: r.PLAYER, team: r.TEAM, teams: [], last: '', draftYear: r.NBN_DFT_YR,
              draftRound: r.NBN_DFT_R, draftPick: r.NBN_DFT_P,
              G: 0, MIN: 0, PTS: 0, REB: 0, AST: 0, STL: 0, BLK: 0, GMSC: 0, winG: 0 };
        out.set(k, p);
      }
      ['G', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'GMSC'].forEach(f => { p[f] += +r[f] || 0; });
      const tp = pct[`${season}|${r.TEAM}`];
      p.winG += g * (tp == null ? 0.5 : tp);
      p.teams.push(r.TEAM);
      if ((r.LAST_DATE || '') >= p.last) { p.last = r.LAST_DATE || ''; p.team = r.TEAM; }
    });
    out.forEach(p => {
      p.gmscPg = p.G ? p.GMSC / p.G : 0;
      p.win = p.G ? p.winG / p.G : 0.5;
      p.mpg = p.G ? p.MIN / p.G : 0;
    });
    return [...out.values()];
  }

  // A player qualifies with at least half the games of the season's leader.
  const qualifies = list => {
    const most = Math.max(0, ...list.map(p => p.G));
    return list.filter(p => p.G > 0 && p.G >= most / 2);
  };

  const SCORE = {
    MVP:  p => p.gmscPg * Math.sqrt(p.win),
    DPOY: p => p.MIN ? (p.STL + p.BLK + 0.15 * p.REB) / p.MIN * 36 * Math.sqrt(p.mpg / 36) * Math.pow(p.win, 0.3) : 0,
    ROTY: p => p.gmscPg,
    '6MOY': p => p.gmscPg,
    MIP:  p => p.gmscPg - p.prevGmscPg,
  };

  // The ladder for one award: [{...player, score}] best first.
  // opts.starts: GET /api/game-starters/counts for the season —
  // {players: {slug: {gs}}, team_games_known: {TEAM: n}}. 6MOY is empty
  // without it.
  function ladder(key, rows, season, pct, opts = {}) {
    let list = qualifies(players(rows, season, pct));
    if (key === 'ROTY') {
      // A rookie is in his first NBN season, drafted that year or not. In the
      // league's first season everyone is, so there it's that year's draft class.
      const played = rows.filter(r => r.SEASON < season && +r.G > 0);
      if (played.length) {
        const before = new Set(played.map(r => r.SLUG || r.PLAYER));
        list = list.filter(p => !before.has(p.slug || p.name));
      } else {
        const yr = String(2000 + +season.slice(0, 2));
        list = list.filter(p => String(p.draftYear) === yr);
      }
    } else if (key === 'MIP') {
      const prev = new Map(players(rows, prevSeason(season), pct).map(p => [p.slug || p.name, p]));
      list = list.filter(p => { const q = prev.get(p.slug || p.name); return q && q.G >= 20; })
        .map(p => ({ ...p, prevGmscPg: prev.get(p.slug || p.name).gmscPg }));
    } else if (key === '6MOY') {
      const st = opts.starts;
      if (!st || !st.team_games_known) return [];
      // Only games whose starters are known count: his games, capped by how
      // many of his teams' games have known starters. A sixth man came off the
      // bench in more of those than he started, as in the NBA: half is a split
      // role, and 1 start of 2 put starters at the top of the race. A player
      // with no starts isn't in `players`.
      list = list.map(p => {
        const known = Math.min(p.G, p.teams.reduce((n, t) => n + (st.team_games_known[t] || 0), 0));
        return { ...p, gs: ((st.players || {})[p.slug] || {}).gs || 0, known };
      }).filter(p => p.known > 0 && p.gs < p.known / 2);
    }
    return list.map(p => ({ ...p, score: SCORE[key](p) }))
      .sort((a, b) => b.score - a.score);
  }

  global.AwardRace = { AWARDS, ladder, players, prevSeason };
})(typeof window !== 'undefined' ? window : globalThis);
