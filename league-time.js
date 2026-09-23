// League time — one shared timezone for every civil date on the site.
//
// A transaction date, a deadline, the league-year rollover: these are labels on
// a league business day, not instants. They need one shared zone or they're
// ambiguous — two GMs would otherwise file the same trade on different days.
// The league is mostly US-based and real NBA transactions are reported in ET,
// so Eastern is the league day.
//
// This replaces `new Date().toISOString().slice(0, 10)`, which was used all over
// the site to mean "today". It doesn't: toISOString() converts to UTC first, so
// every evening after 8pm ET it returned tomorrow's date. Nobody was getting
// their own local date either — everyone was getting UTC.
//
// Instants (a transaction's created_at audit stamp) stay UTC and are NOT this
// file's business. Only civil dates belong here.

const NBN_LEAGUE_TZ = 'America/New_York';

// IANA zone, not a fixed -5 offset, so DST is handled.
// 'en-CA' formats as YYYY-MM-DD natively.
const _nbnDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: NBN_LEAGUE_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Today's date in league time, as "YYYY-MM-DD". */
function nbnToday() {
  return _nbnDateFmt.format(new Date());
}

/** Format a Date instant as its league-time civil date, "YYYY-MM-DD". */
function nbnFormatDate(d) {
  return _nbnDateFmt.format(d);
}

const _nbnDateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: NBN_LEAGUE_TZ,
  year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

/**
 * Format a Date instant for display in league time, with the zone labeled
 * (e.g. "Aug 1, 2026, 8:04 PM EDT"). Labeled deliberately: a deadline should be
 * readable off the page without the viewer doing timezone math.
 */
function nbnFormatDateTime(d) {
  return _nbnDateTimeFmt.format(d);
}

// ── Seasons ───────────────────────────────────────────────────────────────
// A season is 'YY-YY' ('26-27'). The league year rolls over on July 1
// (nbn-api/season_clock.py), and a season can be overridden per year in
// league-state.json — which is why the real answer comes from the API, and the
// date rule is only the fallback when the API can't be reached.
//
// Pages used to hardcode the current season and quietly went stale every July.
// Ask here instead.

/** '25-26' shifted by n seasons: nbnSeasonShift('25-26', 1) === '26-27'. */
function nbnSeasonShift(season, n) {
  const y = parseInt(season.slice(0, 2), 10) + n;
  const yy = v => String(((v % 100) + 100) % 100).padStart(2, '0');
  return `${yy(y)}-${yy(y + 1)}`;
}

/** The season a league-time civil date falls in, by the July 1 rule. */
function nbnSeasonForDate(date) {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 7 ? y : y - 1;
  return nbnSeasonShift(`${String(start % 100).padStart(2, '0')}-00`, 0);
}

let _nbnCurrentSeason = null;
/** The current league year, from GET /api/league-year. Cached per page load. */
function nbnCurrentSeason() {
  if (!_nbnCurrentSeason) {
    _nbnCurrentSeason = fetch('/api/league-year')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => d.current_season || nbnSeasonForDate(nbnToday()))
      .catch(() => nbnSeasonForDate(nbnToday()));
  }
  return _nbnCurrentSeason;
}
