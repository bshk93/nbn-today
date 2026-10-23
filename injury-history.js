// A player's injury history, folded out of GET /api/injuries/history's change
// log — the Health tile on /players and the /players/injuries sub-page.
//
// The log is one event per change: `new` opens an injury, `changed` updates
// it, `healed` closes it. A `healed` with no `new` before it is an injury the
// log only saw the end of; it has no start, so no length and no games missed.
//
// Games missed are counted from appearances, never from report dates: a game
// inside the injury that the player has no box score line for. Reports come
// at the end of a stream day, so an injury reported on a day he played in
// doesn't cost him that game, and one healed on a day he sat out does. A Hurt
// (not Out) player can still play; those games are `playedThrough`.
//
// Pure, so tests/injury-history.test.js can pin it without a browser.
(function (global) {
  const DAY = 86400000;
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
  const isOut = s => /^out$/i.test(s || '');

  // The July 1 league year, as /league-time.js has it.
  function seasonOf(date) {
    const [y, m] = date.split('-').map(Number);
    const start = m >= 7 ? y : y - 1;
    return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
  }

  // events: the API's list, newest first. Returns the injuries oldest first:
  // {start, end, closed, team, teams[{from, team}], status, worst, injury,
  //  duration, ovr, ovr_delta, reports[{date, kind, status, injury, duration, ovr, ovr_delta}]}.
  // `end` is null while the injury is current; `teams` is who he was on from
  // each date, for a player traded mid-injury.
  function fold(events) {
    const out = [];
    let open = null;
    const report = (e, s) => ({ date: e.date, kind: e.kind, status: s.status, injury: s.injury,
                                duration: s.duration, ovr: s.ovr, ovr_delta: s.ovr_delta });
    const stint = (e, s, start) => ({
      start, end: null, closed: null, team: e.team, teams: [{ from: start, team: e.team }],
      status: s.status, worst: s.status, injury: s.injury, duration: s.duration,
      ovr: s.ovr, ovr_delta: s.ovr_delta, reports: [],
    });
    [...(events || [])].reverse().forEach(e => {
      const a = e.after || {}, b = e.before || {};
      if (e.kind === 'new' || (e.kind === 'changed' && !open)) {
        open = stint(e, a, e.date);
        open.reports.push(report(e, a));
        out.push(open);
      } else if (e.kind === 'changed') {
        Object.assign(open, { status: a.status, injury: a.injury || open.injury, duration: a.duration,
                              ovr: a.ovr, ovr_delta: a.ovr_delta });
        if (e.team && e.team !== open.team) { open.team = e.team; open.teams.push({ from: e.date, team: e.team }); }
        if (isOut(a.status)) open.worst = a.status;
        open.reports.push(report(e, a));
      } else if (e.kind === 'healed') {
        if (!open) { open = stint(e, b, null); out.push(open); }
        open.end = e.date;
        open.closed = e.closed || null;
        open = null;
      }
    });
    return out;
  }

  // teamGames: {TEAM: [{date}]}, every game that team played (the box score
  // index). played: the player's game log dates, a Set or array. today: an ISO
  // date, where a current injury runs to. Returns {missed, playedThrough},
  // both null for an injury with no start.
  function gamesMissed(stint, teamGames, played, today) {
    if (!stint.start) return { missed: null, playedThrough: null };
    const seen = played instanceof Set ? played : new Set(played || []);
    const last = stint.end || today;
    let missed = 0, playedThrough = 0;
    stint.teams.forEach((seg, i) => {
      const from = i ? seg.from : stint.start;
      const next = stint.teams[i + 1];
      const until = next ? next.from : null;   // exclusive: the next team has that day
      const dates = new Set((teamGames[seg.team] || []).map(g => g.date));
      dates.forEach(d => {
        if (d < from || d > last || (until && d >= until)) return;
        if (seen.has(d)) playedThrough++; else missed++;
      });
    });
    return { missed, playedThrough };
  }

  // stints from fold(), each with .missed from gamesMissed (or null when the
  // games aren't known). Returns the career line.
  function summary(stints, today) {
    let missed = 0, missedKnown = false, daysOut = 0, longest = null;
    stints.forEach(s => {
      if (s.missed != null) { missed += s.missed; missedKnown = true; }
      if (!s.start) return;
      const n = days(s.start, s.end || today);
      daysOut += n;
      if (!longest || n > longest.days) longest = { days: n, stint: s };
    });
    return {
      count: stints.length,
      missed: missedKnown ? missed : null,
      days: daysOut,
      longest,
      current: stints.find(s => !s.end) || null,
      last: stints.length ? stints[stints.length - 1] : null,
    };
  }

  // Length of one injury in days (to today while current), or null.
  const length = (s, today) => (s.start ? days(s.start, s.end || today) : null);

  global.InjuryHistory = { fold, gamesMissed, summary, length, seasonOf, isOut };
})(typeof window !== 'undefined' ? window : globalThis);
