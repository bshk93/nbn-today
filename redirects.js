// Old URLs → where they live now.
//
// Pages that moved used to leave a folder behind holding a one-line redirect
// page (22 of them by 2026-11). Those folders are gone; nginx serves 404.html
// for any path that doesn't exist, and 404.html asks this table first, so an
// old link in Discord still lands on the right page.
//
// A moved page goes here, not in a stub folder. One catch: this only works
// where the old folder is gone entirely. A folder that still has real pages
// under it (awards/24-25/ keeps results/ and vote/) answers 403, not 404,
// without an index.html, so such a folder keeps its own stub.
//
// Each entry: [old path, new path, what to carry over]. `keep` lists which of
// the old URL's query and hash survive, matching what the old stub did.
// Pinned by tests/redirects.test.js.
(function (global) {
  const STAT_HIGHS = { p: 'P', r: 'R', a: 'A', s: 'S', b: 'B', '3pm': '3PM' };
  const STAT_TOTALS = { p: 'PTS', r: 'REB', a: 'AST', s: 'STL', b: 'BLK', '3pm': '3PM' };

  const TABLE = [
    ['/pdc/',           '/committees/pdc/',          'search hash'],
    ['/stream/',        '/committees/stream/',       'search hash'],
    ['/schedule/',      '/calendar/',                'search hash'],
    ['/trade-sim/',     '/transaction-sim/',         'search hash'],
    ['/trade-retros/',  '/frivolities/#retros',      ''],
    ['/pickem/',        '/bet/#pickem',              'search'],
    ['/rookie-scale/',  '/cap-settings/#rookie-scale', ''],
    ['/invest/fair/',   '/finances/',                'search'],
    ['/nbyen-economy/', '/nbyen/',                   ''],
    ['/nbnfl/CIN/',     '/nbnfl/',                   ''],
  ];
  for (const [k, v] of Object.entries(STAT_HIGHS)) TABLE.push([`/stats/highs/${k}/`, `/stats/highs/?stat=${v}`, 'hash']);
  for (const [k, v] of Object.entries(STAT_TOTALS)) TABLE.push([`/stats/totals/${k}/`, `/stats/totals/?stat=${v}`, 'hash']);

  const BY_PATH = new Map(TABLE.map(([from, to, keep]) => [from, { to, keep }]));

  /** The new URL for an old one, or null. `/pdc`, `/pdc/` and
   *  `/pdc/index.html` all match, case-insensitively for the stat pages. */
  function nbnRedirect(pathname, search, hash) {
    let p = String(pathname || '').replace(/index\.html?$/i, '');
    if (!p.endsWith('/')) p += '/';
    const hit = BY_PATH.get(p) || BY_PATH.get(p.toLowerCase());
    if (!hit) return null;
    const keep = hit.keep.split(' ');
    let [base, frag] = hit.to.split('#');
    const qs = keep.includes('search') ? String(search || '').replace(/^\?/, '') : '';
    if (qs) base += (base.includes('?') ? '&' : '?') + qs;
    frag = keep.includes('hash') && hash ? String(hash).replace(/^#/, '') : frag;
    return frag ? `${base}#${frag}` : base;
  }

  global.nbnRedirect = nbnRedirect;
  global.NBN_REDIRECTS = TABLE;
  if (typeof module !== 'undefined') module.exports = { nbnRedirect, TABLE };
})(typeof window !== 'undefined' ? window : globalThis);
