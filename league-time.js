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
