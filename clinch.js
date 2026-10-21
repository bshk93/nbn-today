// Clinch and elimination marks for a conference's standings — the x / pi / e
// beside a team on /standings.
//
// Seeds 1–6 go straight to the playoffs and 7–10 play in (the format
// nbn-api/routers/playoff_odds.py models). A mark is mathematical, never a
// projection: it holds whatever happens in every game left.
//
// Tiebreakers are not modelled, so a tie always goes against the team being
// marked. That makes every mark conservative — a team can be safe a game or
// two before it is marked, but is never marked when it isn't. Games the other
// teams play against each other are not used either, for the same reason.
//
// Pure, so tests/clinch.test.js can pin it without a browser.
(function (global) {
  const PLAYOFF = 6;   // seeds 1–6
  const PLAY_IN = 10;  // seeds 7–10

  // teams: one conference, [{team, w, l, games}] where `games` is the season's
  // total. Returns {TEAM: 'z' | 'x' | 'pi' | 'e' | ''}.
  function marks(teams) {
    const t = teams.map(r => ({ ...r, max: r.w + Math.max(0, r.games - r.w - r.l) }));
    const out = {};
    for (const a of t) {
      const others = t.filter(b => b.team !== a.team);
      // Teams that could still finish level with or ahead of A at worst.
      const threats = others.filter(b => b.max >= a.w).length;
      // Teams already beyond the most A can reach.
      const ahead = others.filter(b => b.w > a.max).length;
      out[a.team] = threats < 1 ? 'z'
        : threats < PLAYOFF ? 'x'
        : threats < PLAY_IN ? 'pi'
        : ahead >= PLAY_IN ? 'e'
        : '';
    }
    return out;
  }

  const LABELS = {
    z:  'Clinched the 1 seed',
    x:  'Clinched a playoff spot',
    pi: 'Clinched at least the play-in',
    e:  'Eliminated',
  };

  global.Clinch = { marks, LABELS, PLAYOFF, PLAY_IN };
})(typeof window !== 'undefined' ? window : globalThis);
