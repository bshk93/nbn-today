// The homepage Power Rankings card's rules: which ranking to show, and each
// team's form.
//
// The card shows the newest voted edition while it is fresh, and a ranking by
// the playoff-odds model's team rating once it isn't. The voted rankings are
// written by hand and can go a long time without a new edition. The model is
// rerun every hour, so the computed ranking is never stale.
//
// Pure, so tests/power-rank.test.js can pin it without a browser.
(function (global) {
  const FRESH_DAYS = 30;

  const dayNum = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;

  // The newest published edition, if it was published within `maxDays` of
  // `today` (YYYY-MM-DD); otherwise null.
  function pick(editions, today, maxDays = FRESH_DAYS) {
    const pub = (editions || []).filter(e => e && e.published_at && String(e.published_at).slice(0, 10) <= today)
      .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
    const latest = pub[pub.length - 1];
    if (!latest) return null;
    return dayNum(today) - dayNum(String(latest.published_at).slice(0, 10)) <= maxDays ? latest : null;
  }

  // Standard competition ranks (1, 2, 2, 4) by rating, highest first.
  // Equal ratings share a rank, the same as a voted edition's ties.
  function ranks(ratings) {
    const teams = Object.keys(ratings).filter(t => typeof ratings[t] === 'number')
      .sort((a, b) => ratings[b] - ratings[a] || a.localeCompare(b));
    const out = {};
    teams.forEach((t, i) => {
      const prev = teams[i - 1];
      out[t] = prev !== undefined && ratings[prev] === ratings[t] ? out[prev] : i + 1;
    });
    return out;
  }

  // Rows in a voted edition's `final` shape ({team, rank, tied, prev, move})
  // from the odds run's teams and the ratings a week earlier. A team missing
  // from the earlier ratings gets prev null, which shows as "new".
  function computed(oddsTeams, prevRatings) {
    const now = {};
    for (const t of oddsTeams || []) if (t && typeof t.rating === 'number') now[t.team] = t.rating;
    const rank = ranks(now);
    const hasPrev = prevRatings && Object.keys(prevRatings).length > 0;
    const before = hasPrev ? ranks(prevRatings) : {};
    const count = {};
    for (const t in rank) count[rank[t]] = (count[rank[t]] || 0) + 1;
    return Object.keys(rank).sort((a, b) => rank[a] - rank[b] || a.localeCompare(b)).map(team => {
      const prev = hasPrev ? (before[team] ?? null) : undefined;
      return {
        team, rank: rank[team], tied: count[rank[team]] > 1,
        prev, move: prev == null ? 0 : prev - rank[team],
      };
    });
  }

  // { streak: 'W4', last10: '8–2', games: 14 } from /api/boxscores/games rows, regular
  // season only, through `until` (YYYY-MM-DD) if given. Null with no games.
  function form(games, team, until) {
    const mine = (games || []).filter(g => g && g.gametype !== 'PLAYOFF'
        && (g.home_team === team || g.away_team === team)
        && g.home_score !== g.away_score && (!until || g.date <= until))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!mine.length) return null;
    const won = mine.map(g => (g.home_team === team) === (g.home_score > g.away_score));
    let n = 1;
    while (n < won.length && won[n] === won[0]) n++;
    const ten = won.slice(0, 10);
    const w = ten.filter(Boolean).length;
    return { streak: (won[0] ? 'W' : 'L') + n, last10: `${w}–${ten.length - w}`, games: won.length };
  }

  global.PowerRank = { pick, computed, form, ranks, FRESH_DAYS };
})(typeof window !== 'undefined' ? window : globalThis);
