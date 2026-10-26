// A player's injury history, folded out of GET /api/injuries/history's change
// log — the Health tile on /stats/players and the /stats/players/injuries sub-page.
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

  // The #injury-report backfill read some name suffixes as the injury
  // ("Iii" for Robert Williams III), so a bare suffix is no injury at all.
  const injuryText = t => (t && !/^\s*(i{1,3}|iv|jr\.?|sr\.?)\s*$/i.test(t) ? t : null);

  // Where on the body an injury is, read from 2K's own wording ("Hyperextended
  // Left Knee"). First match wins, so the specific words come before the
  // general ones (achilles before leg). An illness has no place on the body.
  // `pair` parts have a left and a right; the rest are one region.
  const PARTS = [
    ['illness',  'Illness',   false, /\b(flu|ill|illness|sick|virus|viral|covid|cold|migraine|fatigue|dehydrat)/],
    ['head',     'Head',      false, /\b(head|concussion|eyes?|face|facial|nose|nasal|jaw|mouth|tooth|teeth|ears?|orbital|lips?)\b/],
    ['neck',     'Neck',      false, /\bneck/],
    ['ankle',    'Ankle',     true,  /\b(ankle|achilles)/],
    ['knee',     'Knee',      true,  /\b(knee|acl|mcl|lcl|pcl|menisc|patell)/],
    ['foot',     'Foot',      true,  /\b(foot|feet|toe|heel|plantar|arch)/],
    ['hand',     'Hand',      true,  /\b(hand|finger|thumb|knuckle|palm|pinky)/],
    ['wrist',    'Wrist',     true,  /\bwrist/],
    ['elbow',    'Elbow',     true,  /\belbow/],
    ['forearm',  'Forearm',   true,  /\bforearm/],
    ['shoulder', 'Shoulder',  true,  /\b(shoulder|rotator|clavicle|collarbone|labrum)/],
    ['arm',      'Upper arm', true,  /\b(bicep|tricep|upper arm|humerus|arm)/],
    ['chest',    'Chest',     false, /\b(chest|rib|pectoral|sternum)/],
    ['back',     'Back',      false, /\b(back|spine|spinal|lumbar|disc|disk)/],
    ['abdomen',  'Abdomen',   false, /\b(abdom|oblique|stomach|core|appendi)/],
    ['hip',      'Hip',       true,  /\b(hip|groin|pelvi|glute|adductor|tailbone)/],
    ['thigh',    'Thigh',     true,  /\b(thigh|quad|hamstring|femur)/],
    ['leg',      'Lower leg', true,  /\b(shin|calf|fibula|tibia|leg)/],
  ];

  // {part, label, side: 'L' | 'R' | null, pair} for an injury's text, or null
  // when there is none or it names nowhere we know.
  function locate(text) {
    const t = (injuryText(text) || '').toLowerCase();
    if (!t) return null;
    const hit = PARTS.find(([, , , re]) => re.test(t));
    if (!hit) return null;
    const [part, label, pair] = hit;
    const side = !pair ? null : /\bleft\b/.test(t) ? 'L' : /\bright\b/.test(t) ? 'R' : null;
    return { part, label, side, pair };
  }

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
    const report = (e, s) => ({ date: e.date, kind: e.kind, status: s.status, injury: injuryText(s.injury),
                                duration: s.duration, ovr: s.ovr, ovr_delta: s.ovr_delta });
    const stint = (e, s, start) => ({
      start, end: null, closed: null, team: e.team, teams: [{ from: start, team: e.team }],
      status: s.status, worst: s.status, injury: injuryText(s.injury), duration: s.duration,
      ovr: s.ovr, ovr_delta: s.ovr_delta, reports: [],
    });
    [...(events || [])].reverse().forEach(e => {
      const a = e.after || {}, b = e.before || {};
      if (e.kind === 'new' || (e.kind === 'changed' && !open)) {
        open = stint(e, a, e.date);
        open.reports.push(report(e, a));
        out.push(open);
      } else if (e.kind === 'changed') {
        Object.assign(open, { status: a.status, injury: injuryText(a.injury) || open.injury, duration: a.duration,
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

  // 2K's expected duration in days, at its low end: "Day-to-Day" 1,
  // "2-4 Weeks" 14, "6-8 Months" 180, "Season" 180. null when it says nothing.
  function expectedDays(duration) {
    const t = (duration || '').toLowerCase();
    if (/day.to.day/.test(t)) return 1;
    if (/season|year/.test(t)) return 180;
    const m = t.match(/(\d+)(?:\s*-\s*\d+)?\s*(day|week|month)/);
    return m ? +m[1] * { day: 1, week: 7, month: 30 }[m[2]] : null;
  }

  // How bad an injury was, by its length: the days it lasted, or 2K's
  // expected duration when that is longer (a fresh injury hasn't run its
  // course). 1 Minor (under a week), 2 Moderate (1-3 weeks), 3 Serious
  // (3-8 weeks), 4 Severe (8 weeks or more).
  const SEVERITY = ['', 'Minor', 'Moderate', 'Serious', 'Severe'];
  function severity(s, today) {
    const d = Math.max(length(s, today) || 0, expectedDays(s.duration) || 0);
    return d < 7 ? 1 : d < 21 ? 2 : d < 56 ? 3 : 4;
  }

  global.InjuryHistory = { fold, gamesMissed, summary, length, seasonOf, isOut, locate, PARTS, expectedDays, severity, SEVERITY };
})(typeof window !== 'undefined' ? window : globalThis);
