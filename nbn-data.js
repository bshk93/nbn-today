// nbn-data.js — the small helpers every page kept writing its own copy of.
//
// By 2026-11 the same few functions had been pasted into dozens of pages: an
// HTML escaper in ~50 files (in five slightly different forms, some of which
// left quotes or apostrophes unescaped), the 30-team name map in 13, a CSV
// parser in 12. Copies drift, and one that escapes less than the others is a
// bug waiting for a player name with an apostrophe in it. One copy lives here.
//
// Loaded as a classic script in each page's <head>, right after
// theme-boot.js, so it is ready before any page script runs; the browser
// fetches the two in parallel. Everything hangs off one global, `NBN`, so it
// can never collide with a page's own top-level names. A page that wants the
// short names writes `const esc = NBN.esc;`.
//
// build/check_dup_helpers.py (in the pre-commit hook) fails a commit that
// defines one of these again in a page. tests/nbn-data.test.js pins them.
//
// Not loaded on the 30 team shells, which load only teams/team.js; team.js
// keeps its own copies until its rewrite.
(function (global) {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Text → safe HTML, for element content and quoted attributes alike.
   *  null and undefined become '' rather than the words. */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  }

  /** One CSV line → its fields. Double quotes group commas; they are not
   *  kept. (The CSVs the build writes never escape a quote inside a field.) */
  function parseLine(line) {
    const out = [];
    let cur = '', quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  /** CSV text → an array of {header: value} rows, every value trimmed. */
  function parseCSV(text) {
    const lines = String(text).trim().split('\n');
    const headers = parseLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = parseLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
      return row;
    });
  }

  /** Abbreviation → full name, for all 30 teams. */
  const TEAMS = Object.freeze({
    ATL: 'Atlanta Hawks', BKN: 'Brooklyn Nets', BOS: 'Boston Celtics',
    CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers',
    DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons',
    GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
    LAC: 'LA Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies',
    MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves',
    NOP: 'New Orleans Pelicans', NYK: 'New York Knicks', OKC: 'Oklahoma City Thunder',
    ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
    POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs',
    TOR: 'Toronto Raptors', UTA: 'Utah Jazz', WAS: 'Washington Wizards',
  });

  global.NBN = Object.freeze({ esc, parseLine, parseCSV, TEAMS });
  if (typeof module !== 'undefined') module.exports = global.NBN;
})(typeof window !== 'undefined' ? window : globalThis);
