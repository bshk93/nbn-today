// Player rate stats (USG%, AST%, REB%, STL%, BLK%, TOV%) from a player's own
// totals plus the game context of his stint.
//
// The context comes from /players/player-advanced.csv (nbn-api
// stats_build/advanced.py): his team's and the opponent's totals summed over
// the games he played, plus those games' possessions. It is sums, not
// percentages, so a traded player's stints add together (`addContext`) and the
// rate is computed once from the total. Every formula is Basketball-Reference's,
// with the team totals taken over his games rather than the team's season.
//
// Possessions are an estimate: the box scores have no team turnovers. That
// only touches STL%. See advanced.py's docstring.
//
// Pinned by tests/advanced-stats.test.js.

(function (global) {
  const CONTEXT = ['G', 'TM_MIN', 'TM_FGM', 'TM_FGA', 'TM_FTA', 'TM_TOV', 'TM_OREB',
                   'TM_DREB', 'OPP_FGA', 'OPP_3PA', 'OPP_OREB', 'OPP_DREB', 'POSS'];

  // A CSV row → numbers.
  function parseContext(row) {
    const out = {};
    CONTEXT.forEach(k => { out[k] = +row[k] || 0; });
    return out;
  }

  // Two stints → one. Either side may be missing.
  function addContext(a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return { ...a };
    const out = {};
    CONTEXT.forEach(k => { out[k] = (a[k] || 0) + (b[k] || 0); });
    return out;
  }

  const div = (n, d) => (d > 0 ? n / d : null);

  // `p` is the player's totals: MIN FGM FGA 3PA FTA TOV OREB DREB AST STL BLK.
  // Returns fractions (0.253, not 25.3), null where a denominator is zero.
  function player(p, c) {
    const out = {
      tov: div(p.TOV, p.FGA + 0.44 * p.FTA + p.TOV),
      par3: div(p['3PA'], p.FGA),
      ftr: div(p.FTA, p.FGA),
      usg: null, ast: null, orb: null, drb: null, trb: null, stl: null, blk: null,
    };
    if (!c || !(c.TM_MIN > 0) || !(p.MIN > 0)) return out;
    // His share of the team's floor time over his games: 1.0 is all 48.
    const share = p.MIN / (c.TM_MIN / 5);
    out.usg = div(p.FGA + 0.44 * p.FTA + p.TOV, share * (c.TM_FGA + 0.44 * c.TM_FTA + c.TM_TOV));
    out.ast = div(p.AST, share * c.TM_FGM - p.FGM);
    out.orb = div(p.OREB, share * (c.TM_OREB + c.OPP_DREB));
    out.drb = div(p.DREB, share * (c.TM_DREB + c.OPP_OREB));
    out.trb = div(p.OREB + p.DREB, share * (c.TM_OREB + c.TM_DREB + c.OPP_OREB + c.OPP_DREB));
    out.stl = div(p.STL, share * c.POSS);
    out.blk = div(p.BLK, share * (c.OPP_FGA - c.OPP_3PA));
    return out;
  }

  // What each stat means, for column tooltips.
  const HELP = {
    usg:  'Usage: the share of his team\'s plays he finished (a shot, free throws or a turnover) while on the floor',
    ast:  'Assist %: the share of his teammates\' field goals he assisted while on the floor',
    tov:  'Turnover %: turnovers per 100 of his plays',
    orb:  'Offensive rebound %: the share of available offensive rebounds he grabbed while on the floor',
    drb:  'Defensive rebound %: the share of available defensive rebounds he grabbed while on the floor',
    trb:  'Rebound %: the share of all available rebounds he grabbed while on the floor',
    stl:  'Steal %: steals per 100 opponent possessions while on the floor (possessions are estimated)',
    blk:  'Block %: the share of opponent two-point attempts he blocked while on the floor',
    par3: '3-point attempt rate: the share of his shots that were threes',
    ftr:  'Free throw rate: free throw attempts per field goal attempt',
  };

  // Win Shares, BPM and VORP come computed from /players/player-value.csv
  // (nbn-api stats_build/player_value.py); only their tooltips live here.
  const VALUE_HELP = {
    ws:   'Win Shares: wins he produced, offense plus defense. A team\'s add up to about its wins (the points-per-win rate is fitted to NBN, where margins run wider than the NBA\'s)',
    ws48: 'Win Shares per 48 minutes. League average is about .100',
    obpm: 'Offensive Box Plus/Minus: points per 100 possessions he adds on offense over an average player, estimated from the box score',
    dbpm: 'Defensive Box Plus/Minus: the same on defense (BPM minus OBPM). The box score sees little defense, so read it loosely',
    bpm:  'Box Plus/Minus: points per 100 possessions he adds over an average player (0.0). A team\'s players add up to its net rating',
    vorp: 'Value Over Replacement Player: BPM above replacement level (-2.0), scaled by his share of the team\'s minutes over a season',
  };

  global.AdvancedStats = { CONTEXT, parseContext, addContext, player, HELP, VALUE_HELP };
})(typeof window !== 'undefined' ? window : globalThis);
