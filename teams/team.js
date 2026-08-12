// =============================================================================
// FUNCTION INDEX (teams/team.js)
// =============================================================================
// Constants & boot
//   TEAMS                        76   abbr → full team name
//   RETIRED_JERSEYS             109   per-team retired number records
//   ratingsPopupReady           135   resolves once /ratings-popup.js has loaded
//   lineupReady                 148   resolves once /teams/lineup.js has loaded
//   contractReady               161   resolves once /contract.js has loaded
//   CAP_HOLD_CSS                730   cap-hold type → td class
//   CAP_HOLD_LABELS             738   cap-hold type → legend label
//   SWATCH_COLORS               746   cap-hold type → legend swatch color
//   CAP_HOLD_COLORS            1705   cap-hold type → text color
//   PO_CLASS                   1467   playoff result → css class
//
// Parsing & formatting utilities
//   parseCSV                    580   CSV text → array of row objects
//   parseLine                   591   handles quoted fields
//   fmtPct                      603   decimal → "56.1%"
//   fmtSigned                   608   signed decimal with +/- prefix
//   sv                          614   safe numeric value from row field
//   formatSalary                621   "$37,000,000" display
//   displayNameFromBio          658   "LAST, FIRST" → "First Last"
//   calcAge                     668   ISO dob → age string
//   fmtDate                     857   ISO date → short display date
//   parseCapHolds               754   legacy CSV cap-holds string → object
//   currentSeasonYr             771   infers current season year
//   parseSalaryNum              781   "$37,000,000" → 37000000
//   fmtDollars                  787   number → "$37.0M"
//
// Tooltips
//   _ttShow                     455   shows the shared tooltip element
//   _ttHide                     454   hides the shared tooltip element
//   attachTooltip               473   attaches a hover/focus tooltip to an element
//
// Cap & roster logic
//   computeMleType              791   determines MLE type from team salary
//   mleTypeLabel                802   MLE type → display label
//   renderHardCapBanner         806   injects hard cap warning banner
//   renderExceptionsSection     816   renders MLE/BAE exceptions panel
//   renderTradeExceptionsSection  866   renders the trade exceptions (TPE) panel
//   buildNonGtdTip              631   builds the non-guaranteed salary tooltip text
//
// Table builders
//   buildTable                  673   generic sortable table (used by owners page too)
//   enableRangeSum              826   Sheets-style drag/shift/ctrl-click column sum + floating bar
//   copyTableToClipboard              copies a table as TSV + HTML for pasting into Sheets
//   attachCopyBtn                     adds the "Copy" button next to a section title
//   computeStartingFive               best PG/SG/SF/PF/C lineup for the Rosters mode
//                                     — lives in teams/lineup.js, loaded above
//   buildRosterTable            893   renders the Roster section with salary/cap data
//   buildPicksTable            1365   renders the Draft Picks section (future picks only, no player yet)
//   makeSeasonRenderCell       1478   season history cell renderer (badges, playoff coloring)
//   buildTimeline              1631   season timeline component
//   buildPersonnelSection      1526   franchise personnel history (tenures + records)
//   buildHistoricalRoster      2706   renders an all-time roster table for a past season
//
// Player cell rendering
//   playerSlug                 1657   name → slug
//   makePlayerRenderCell       1661   renders player name/photo/pos badge cell + on-roster dot
//   applyCapHoldColor          1713   colors cap-hold cells by type
//
// Edit mode & auth
//   getToken                   1675   reads the stored bearer token
//   hasAuthRole                1683   true if the signed-in member holds a role
//   canEditRosters             1690   true if the member may edit this team
//   canEditTeamSettings                true only for the team's own role (jersey/secondary pos)
//   promptToken                1720   modal to enter/store bearer token
//   withToken                  1751   wraps fn with stored token
//   makeSelect                 1757   <select> helper
//   nextSalaryYear             1772   "25-26" → "26-27"
//   prevSalaryYear             1777   "26-27" → "25-26"
//   makeEditCell               1782   creates editable cell (text/select/salary/cap-hold)
//   buildEditableGrid          1871   full in-place editable table grid
//   rosterCellConfig           2017   cell config map for roster editing
//   enterEditMode              2041   swaps read view for edit grid
//   setupPicksEditable         2145   wires edit mode for picks table
//   setupTeamSettingsTab       3458   wires the Team Settings tab (jersey #, secondary pos)
//   setupEditable              2674   wires edit mode for roster table
//   setupDeadCapEditable       2490   wires edit mode for the dead cap table
// =============================================================================

const TEAMS = {
  ATL: "Atlanta Hawks",
  BKN: "Brooklyn Nets",
  BOS: "Boston Celtics",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
};

const RETIRED_JERSEYS = {
  HOU: [{ no: 13, player: 'James Harden',        date: '2024-02-09' }],
  LAC: [{ no: 15, player: 'Cam Payne',            date: '2024-02-08' }],
  SAC: [{ no: 17, player: 'Aleksej Pokusevski',   date: '2024-02-10' }],
};

const abbr = location.pathname.replace(/\/$/, "").split("/").pop().toUpperCase();
const TEAM_ABBRS = Object.keys(TEAMS);
const _teamIdx = TEAM_ABBRS.indexOf(abbr);
const prevAbbr = _teamIdx >= 0 ? TEAM_ABBRS[(_teamIdx - 1 + TEAM_ABBRS.length) % TEAM_ABBRS.length] : null;
const nextAbbr = _teamIdx >= 0 ? TEAM_ABBRS[(_teamIdx + 1) % TEAM_ABBRS.length] : null;
const name = TEAMS[abbr] || "Unknown Team";
const slug = abbr.toLowerCase();

document.title = `${abbr} — NBN`;

{ const _favicon = document.createElement('link'); _favicon.rel = 'icon'; _favicon.href = '/logo.png'; document.head.appendChild(_favicon); }

// Team pages are 11-line shells that load only this file, so shared modules are
// pulled in from here. Starts now, in parallel with the data fetches; the render
// awaits ratingsPopupReady so RatingsPopup is guaranteed defined by then. A load
// failure just means no popup — every call site guards on window.RatingsPopup.
const ratingsPopupReady = new Promise(resolve => {
  const _rp = document.createElement('script');
  _rp.src = '/ratings-popup.js';
  _rp.onload = resolve;
  _rp.onerror = resolve;
  document.head.appendChild(_rp);
});

// DEPTH_SLOTS / computeStartingFive — the Rosters mode's starting five. Unlike
// the popup above this is a hard dependency, not a nicety: the 'depth' branch of
// buildRosterTable calls it directly, so the render awaits this and a failure is
// logged rather than swallowed. Same file is loaded by anything else that needs
// a projected lineup, which is why it doesn't live in here any more.
const lineupReady = new Promise(resolve => {
  const _lu = document.createElement('script');
  _lu.src = '/teams/lineup.js';
  _lu.onload = resolve;
  _lu.onerror = () => { console.error('teams/lineup.js failed to load — depth chart unavailable'); resolve(); };
  document.head.appendChild(_lu);
});

// CONTRACT_TAGS / summarizeContract / the cap-hold vocabulary, shared with
// /pdc and /transactions so one deal reads the same everywhere. Hard dependency
// like lineup.js: the Rosters mode calls summarizeContract on every row.
const contractReady = new Promise(resolve => {
  const _ct = document.createElement('script');
  _ct.src = '/contract.js';
  _ct.onload = resolve;
  _ct.onerror = () => { console.error('/contract.js failed to load — contract shorthand unavailable'); resolve(); };
  document.head.appendChild(_ct);
});

{ const _s = document.createElement('style'); _s.textContent = `
  @import url("/css/theme.css");
  @import url("/css/nav-chrome.css");
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-page);
    color: var(--text-primary);
    min-height: 100vh;
    padding: 2rem 1rem 4rem;
  }
  /* Scales fluidly with viewport width instead of jumping at a breakpoint:
     stays at 1024px on laptop-class screens (anything ≤ ~1365px wide),
     then grows proportionally (75% of viewport) up to a 1600px ceiling
     for wide/ultrawide monitors. */
  .page { max-width: clamp(1024px, 75vw, 1600px); margin: 0 auto; }
  .nav { margin-bottom: 2rem; font-size: 0.875rem; }
  .nav a { color: var(--text-muted); text-decoration: none; }
  .nav a:hover { color: var(--text-primary); }
  .team-header-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    margin-bottom: 3rem;
  }
  .team-nav-btn {
    display: flex; align-items: center; justify-content: center;
    width: 2.5rem; height: 2.5rem; border-radius: 50%;
    background: transparent; border: 1px solid var(--border);
    color: var(--text-muted); font-size: 1.5rem; cursor: pointer;
    text-decoration: none; flex-shrink: 0; line-height: 1;
  }
  .team-nav-btn:hover { border-color: var(--text-muted); color: var(--text-secondary); }
  .team-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  .team-header img { width: 140px; height: 140px; object-fit: contain; }
  .team-header h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.02em; text-align: center; }
  section { margin-bottom: 3rem; }
  .section-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.25rem; }
  .section-sub { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem; }
  .table-wrap {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow-x: auto;
  }
  .status { text-align: center; padding: 3rem; color: var(--text-muted); font-size: 0.9rem; }
  .rec-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .rec-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 12px; padding: 0.9rem 1rem;
  }
  .rec-stat {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-muted); font-weight: 600; margin-bottom: 0.5rem;
  }
  .rec-top { display: flex; align-items: baseline; gap: 0.5rem; }
  .rec-top .val {
    font-size: 1.75rem; font-weight: 700; color: var(--accent-light);
    font-variant-numeric: tabular-nums; line-height: 1;
  }
  .rec-top .who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; font-weight: 600; }
  .rec-when { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem; }
  .rec-rest { margin-top: 0.6rem; border-top: 1px solid var(--border-subtle); padding-top: 0.4rem; }
  .rec-row { display: flex; gap: 0.5rem; font-size: 0.75rem; padding: 0.15rem 0; align-items: baseline; }
  .rec-row .val { font-variant-numeric: tabular-nums; color: var(--text-secondary); min-width: 2.6rem; }
  .rec-row .who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rec-row .when { margin-left: auto; color: var(--text-dim); white-space: nowrap; font-size: 0.7rem; }
  .rec-po { color: var(--gold); font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; white-space: nowrap; }
  thead th {
    padding: 0.7rem 1rem;
    text-align: left;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
  }
  thead th:hover { color: var(--text-secondary); }
  thead th[data-active="true"] { color: var(--accent-light); }
  thead th .sort-arrow { margin-left: 4px; opacity: 0; font-size: 0.65rem; }
  thead th[data-active="true"] .sort-arrow { opacity: 1; }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  tbody tr { border-bottom: 1px solid var(--border-subtle); transition: background 0.1s; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: var(--bg-hover); }
  tr.personnel-active td { background: var(--success-bg); }
  tr.personnel-active:hover td { background: var(--success-bg-hover); }
  tr.personnel-former { opacity: 0.45; }
  tr.personnel-former:hover { opacity: 0.8; }
  tr.personnel-divider td { padding: 0.2rem 1rem; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); background: var(--bg-page); border-top: 1px solid var(--border-subtle); }
  .cur-role { color: var(--success-light); }
  .cur-since { color: var(--success-light); }
  td { padding: 0.65rem 1rem; color: var(--text-secondary); }
  #roster-wrap table th:nth-child(2), #roster-wrap table td:nth-child(2),
  #roster-wrap table th:nth-child(3), #roster-wrap table td:nth-child(3),
  #roster-wrap table th:nth-child(4), #roster-wrap table td:nth-child(4) {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  @media (min-width: 641px) {
    #roster-wrap table th:first-child,
    #roster-wrap table td:first-child {
      position: sticky;
      left: 0;
      z-index: 1;
      background: var(--bg-card);
      border-right: 1px solid var(--border);
    }
    #roster-wrap table thead th:first-child { z-index: 2; }
    #roster-wrap table tbody tr:hover td:first-child { background: var(--bg-hover); }
  }
  td.right { text-align: right; font-variant-numeric: tabular-nums; }
  td.muted { color: var(--text-muted); }
  td.bold { font-weight: 600; color: var(--text-primary); }
  td a { color: var(--link); text-decoration: none; }
  td a:hover { text-decoration: underline; }
  .badge {
    display: inline-block;
    margin-left: 0.35rem;
    font-size: 0.8rem;
    cursor: pointer;
    vertical-align: middle;
  }
  .on-roster-dot {
    display: inline-block;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--success);
    margin-left: 0.4rem;
    vertical-align: middle;
    cursor: default;
  }
  .po-champion   { color: var(--gold); font-weight: 600; }
  .po-runnerup   { color: var(--text-muted); }
  .po-conffinals { color: var(--link); }
  .po-other      { color: var(--text-muted); }
  .po-missed     { color: var(--text-dim); }
  td.center      { text-align: center; }
  .timeline {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding: 0.5rem 0 0.75rem;
    margin-bottom: 0.75rem;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .tl-card {
    flex-shrink: 0;
    width: 58px;
    background: var(--bg-card);
    border: 2px solid var(--border-subtle);
    border-radius: 8px;
    padding: 0.45rem 0.25rem;
    text-align: center;
    cursor: default;
    transition: filter 0.1s;
  }
  .tl-card:hover { filter: brightness(1.15); }
  .tl-season { display: block; font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.03em; }
  .tl-wins   { display: block; font-size: 1.25rem; font-weight: 700; color: var(--text-primary); line-height: 1; margin: 0.2rem 0 0.15rem; }
  .tl-seed   { display: block; font-size: 0.62rem; color: var(--text-muted); }
  .tl-champion   { border-color: var(--champion-border); background: var(--champion-bg); }
  .tl-champion .tl-wins { color: var(--gold); }
  .tl-runnerup   { border-color: var(--runnerup-border); background: var(--runnerup-bg); }
  .tl-runnerup .tl-wins { color: var(--runnerup-text); }
  .tl-conffinals { border-color: var(--accent-dark); }
  .tl-second     { border-color: var(--border); }
  .tl-missed     { opacity: 0.55; }
  td.div-left    { border-left: 1px solid var(--border); }
  .subheader td  {
    background: var(--bg-subtle);
    color: var(--text-muted);
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 0.35rem 1rem;
    border-top: 1px solid var(--border);
  }
  .row-twoway td { opacity: 0.6; }
  .row-draft-rights td { opacity: 0.7; font-style: italic; }
  .row-dead td   { opacity: 0.45; font-style: italic; text-decoration: line-through; }
  .row-erc td    { opacity: 0.7; font-style: italic; color: var(--warning); }
  .row-empty-slot td { opacity: 0.5; font-style: italic; }
  td.depth-slot, th.depth-slot {
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em;
    color: var(--text-muted); width: 2.5rem;
  }
  .picks-acquired td   { color: var(--link); }
  .picks-traded td     { color: var(--text-muted); font-style: italic; }
  .picks-uncertain td  { color: var(--warning); font-style: italic; }
  .picks-legacy td     { color: var(--danger); font-style: italic; }
  .picks-legacy td:nth-child(7) { color: var(--text-secondary); font-style: normal; }
  .picks-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.25rem;
    padding: 0.6rem 1rem 0.75rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border-subtle);
  }
  .picks-legend-item { display: flex; align-items: center; gap: 0.35rem; }
  .picks-swatch {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .retired-banners {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .retired-banner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 90px;
    padding: 0.85rem 0.5rem 0.7rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-top: 3px solid var(--text-muted);
    border-radius: 8px;
    gap: 0.2rem;
  }
  .retired-no   { font-size: 2rem; font-weight: 800; color: var(--text-primary); line-height: 1; letter-spacing: -0.03em; }
  .retired-name { font-size: 0.62rem; color: var(--text-muted); text-align: center; line-height: 1.3; }
  .retired-date { font-size: 0.58rem; color: var(--text-dim); margin-top: 0.15rem; }
  td.cap-ufa        { background: hsl(45,  60%, 20%); color: hsl(45,  90%, 72%); }
  td.cap-rfa        { background: hsl(25,  60%, 20%); color: hsl(25,  90%, 72%); }
  td.cap-player-opt { background: hsl(120, 50%, 17%); color: hsl(120, 75%, 68%); }
  td.cap-team-opt   { background: hsl(210, 55%, 20%); color: hsl(210, 75%, 70%); }
  td.cap-non-gtd    { color: var(--text-dim); }
  td.cell-selected { position: relative; box-shadow: inset 0 0 0 2px var(--accent); }
  td.cell-selected::after {
    content: ''; position: absolute; inset: 0;
    background: rgba(59, 130, 246, 0.25); pointer-events: none;
  }
  .range-sum-bar {
    display: none; position: fixed; right: 1.25rem; bottom: 1.25rem;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.5rem 1rem; font-size: 0.82rem; color: var(--text-secondary);
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); z-index: 500;
    pointer-events: none; white-space: nowrap;
  }
  .range-sum-bar b { color: var(--text-primary); }
  .cap-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.25rem;
    padding: 0.6rem 1rem 0.75rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border-subtle);
  }
  .cap-legend-item { display: flex; align-items: center; gap: 0.35rem; }
  .cap-swatch {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  tfoot tr td { font-size: 0.8rem; padding: 0.3rem 0.6rem; color: var(--text-muted); border-top: none; }
  tfoot tr.tfoot-divider td { border-top: 1px solid var(--border); padding-top: 0.45rem; }
  tfoot tr.tfoot-total td { font-weight: 700; color: var(--text-secondary); }
  tfoot tr.tfoot-cap td { color: var(--text-muted); }
  tfoot tr.tfoot-cap.over .tfoot-diff { color: var(--danger); }
  tfoot tr.tfoot-cap.under .tfoot-diff { color: var(--success); }
  tfoot td.tfoot-label { color: var(--text-muted); }
  tfoot td.tfoot-count { color: var(--border); font-size: 0.72rem; text-align: right; }
  tfoot tr.tfoot-hardcap td { padding-top: 0.4rem; }
  .hardcap-chip { display: inline-block; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.02em;
    padding: 0.05rem 0.35rem; border-radius: 3px; background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-border); }
  .hardcap-chip.apron2 { background: var(--danger-bg); color: var(--danger-light); border-color: var(--danger-border-strong); }
  .cap-edit-form {
    display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
    margin-top: 0.75rem; padding: 0.6rem 0.75rem;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    font-size: 0.8rem;
  }
  .cap-edit-form label { display: flex; flex-direction: column; gap: 0.2rem; color: var(--text-muted); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
  .cap-edit-form input { background: var(--bg-page); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-size: 0.82rem; font-family: inherit; padding: 0.25rem 0.4rem; width: 8rem; outline: none; }
  .cap-edit-form input:focus { border-color: var(--accent); }
  .cap-edit-form select { background: var(--bg-page); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-size: 0.82rem; font-family: inherit; padding: 0.25rem 0.4rem; width: 8rem; outline: none; }
  .cap-edit-form select:focus { border-color: var(--accent); }
  .cap-edit-form .form-divider { width: 100%; height: 1px; background: var(--border); margin: 0.25rem 0; }
  .cap-edit-form .form-section-label { width: 100%; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.05em; padding-top: 0.15rem; }
  .hard-cap-banner {
    background: var(--danger-bg); border: 1px solid var(--danger-border); border-radius: 8px;
    padding: 0.6rem 1rem; font-size: 0.85rem; font-weight: 600; color: var(--danger);
    margin-bottom: 1.25rem;
  }
  .hard-cap-banner.apron2 { background: var(--danger-alt-bg); border-color: var(--danger-alt-border); color: var(--danger-alt); }
  .exceptions-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 0.85rem 1.25rem; font-size: 0.85rem; }
  .exceptions-row { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid var(--border-subtle); gap: 1rem; }
  .exceptions-row:last-child { border-bottom: none; }
  .exc-label { color: var(--text-muted); font-size: 0.78rem; }
  .exc-mle-type { font-size: 0.7rem; color: var(--text-muted); margin-left: 0.35rem; }
  .exc-remaining { color: var(--success); }
  .exc-used { color: var(--danger); }
  .whatif-enter-btn, .whatif-exit-btn {
    padding: 0.3rem 0.7rem; border: 1px solid var(--danger-border); border-radius: 6px;
    font-size: 0.75rem; font-weight: 600; cursor: pointer; background: transparent;
    color: var(--danger); font-family: inherit; white-space: nowrap;
  }
  .whatif-enter-btn:hover, .whatif-exit-btn:hover { background: var(--danger-bg); }
  .whatif-panel {
    border: 1px dashed var(--danger-border); border-radius: 10px;
    padding: 0.85rem 1rem; margin-top: 0.85rem;
    background: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--danger-bg) 10px, var(--danger-bg) 20px);
  }
  .whatif-panel > * + * { margin-top: 0.75rem; }
  .whatif-toolbar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .whatif-badge {
    display: inline-block; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.05em;
    text-transform: uppercase; padding: 0.2rem 0.55rem; border-radius: 4px;
    background: var(--danger-bg); color: var(--danger-light); border: 1px solid var(--danger-border-strong);
  }
  .whatif-add-input {
    background: var(--bg-page); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-primary); font-size: 0.8rem; padding: 0.3rem 0.55rem;
    font-family: inherit; min-width: 240px; outline: none;
  }
  .whatif-add-input:focus { border-color: var(--accent); }
  .whatif-row-action {
    font-size: 0.68rem; padding: 0.12rem 0.4rem; border: 1px solid var(--border); border-radius: 4px;
    background: var(--bg-card); color: var(--text-muted); cursor: pointer; font-family: inherit; margin-left: 0.3rem;
    white-space: nowrap;
  }
  .whatif-row-action:hover { color: var(--text-secondary); border-color: var(--text-muted); }
  .whatif-row-action.danger { color: var(--danger); border-color: var(--danger-border); }
  .whatif-row-action.danger:hover { background: var(--danger-bg); }
  .whatif-warning-line { color: var(--danger); font-size: 0.78rem; font-weight: 600; padding: 0.15rem 0; }
  .whatif-attr-heading { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 0.4rem; }
  .whatif-attr-heading-note { font-size: 0.7rem; font-weight: 500; text-transform: none; letter-spacing: normal; color: var(--text-dim); }
  #whatif-attr-impact table td, #whatif-attr-impact table th { padding: 0.35rem 0.75rem; font-size: 0.78rem; }
  .whatif-attr-delta-line { font-weight: 700; }
  .whatif-attr-ba-line { font-size: 0.68rem; color: var(--text-dim); font-weight: 400; margin-top: 0.1rem; }
  .whatif-attr-up   .whatif-attr-delta-line { color: var(--success); }
  .whatif-attr-down .whatif-attr-delta-line { color: var(--danger); }
  .whatif-attr-zero .whatif-attr-delta-line { color: var(--text-dim); }
  .whatif-attr-total-row td { font-weight: 700; border-bottom: 1px solid var(--border); }
  .whatif-attr-total-row td:first-child { color: var(--text-primary); }
  .whatif-attr-total-row .whatif-attr-delta-line { font-weight: 800; }
  .whatif-contract-form {
    display: flex; gap: 0.5rem; align-items: flex-end; flex-wrap: wrap;
    padding: 0.6rem 0.75rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    font-size: 0.8rem;
  }
  .whatif-contract-form label { display: flex; flex-direction: column; gap: 0.2rem; color: var(--text-muted); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
  .whatif-contract-form input, .whatif-contract-form select {
    background: var(--bg-page); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary);
    font-size: 0.82rem; font-family: inherit; padding: 0.25rem 0.4rem; width: 7.5rem; outline: none;
  }
  .whatif-contract-form input:focus, .whatif-contract-form select:focus { border-color: var(--accent); }
  .whatif-contract-year { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.3rem 0.5rem; border: 1px solid var(--border-subtle); border-radius: 6px; }
  .whatif-log { display: flex; flex-direction: column; gap: 0.3rem; }
  .whatif-log-entry {
    display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;
    font-size: 0.76rem; color: var(--text-secondary);
    background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;
    padding: 0.25rem 0.3rem 0.25rem 0.6rem;
  }
  .whatif-log-entry button {
    background: none; border: none; color: var(--text-dim); cursor: pointer;
    font-size: 1.05rem; line-height: 1; padding: 0 0.3rem; font-family: inherit;
  }
  .whatif-log-entry button:hover { color: var(--danger); }
  .token-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .token-modal {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    width: 360px;
    max-width: 90vw;
  }
  .token-modal h3 { font-size: 1rem; font-weight: 700; margin-bottom: 0.4rem; }
  .token-modal p  { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem; }
  .token-modal input {
    width: 100%;
    background: var(--bg-page);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: monospace;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
    box-sizing: border-box;
  }
  .token-modal input:focus { outline: none; border-color: var(--accent); }
  .token-modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

  /* ── Owner roster moves (per-player action menu) ─────────────────────────── */
  .move-btn {
    background: transparent; border: 1px solid var(--border); border-radius: 5px;
    color: var(--text-dim); cursor: pointer; font-family: inherit; font-size: 0.8rem;
    line-height: 1; padding: 0.2rem 0.4rem;
  }
  .move-btn:hover { color: var(--text-primary); border-color: var(--text-dim); }
  .move-menu {
    position: fixed; z-index: 1001; min-width: 220px;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.3rem; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  }
  .move-menu-head {
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--text-dim); padding: 0.3rem 0.5rem 0.35rem;
    border-bottom: 1px solid var(--border); margin-bottom: 0.25rem;
  }
  .move-menu button {
    display: block; width: 100%; text-align: left; background: none; border: none;
    border-radius: 5px; color: var(--text-secondary); cursor: pointer;
    font-family: inherit; font-size: 0.8rem; padding: 0.4rem 0.5rem;
  }
  .move-menu button:hover:not(:disabled) { background: var(--bg-page); color: var(--text-primary); }
  .move-menu button.danger:hover:not(:disabled) { color: var(--danger); }
  .move-menu button:disabled { color: var(--text-dim); cursor: default; opacity: 0.65; }
  /* Ineligible actions stay visible with their reason rather than disappearing —
     "why can't I renounce him?" is a rules question, and the menu is where it
     gets answered. */
  .move-menu-why {
    display: block; font-size: 0.68rem; color: var(--text-dim);
    padding: 0 0.5rem 0.35rem; margin-top: -0.2rem; white-space: normal;
  }
  .confirm-modal {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
    padding: 1.35rem; width: 520px; max-width: 92vw;
    max-height: 86vh; overflow-y: auto;
  }
  .confirm-modal h3 { font-size: 1rem; font-weight: 700; margin-bottom: 0.15rem; }
  .confirm-modal .sub { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.9rem; }
  .confirm-facts {
    border: 1px solid var(--border); border-radius: 8px;
    padding: 0.5rem 0.7rem; margin-bottom: 0.9rem;
  }
  .confirm-fact {
    display: flex; justify-content: space-between; gap: 1rem;
    font-size: 0.78rem; padding: 0.2rem 0;
  }
  .confirm-fact span:first-child { color: var(--text-muted); }
  .confirm-fact span:last-child  { font-variant-numeric: tabular-nums; font-weight: 600; }
  .confirm-check {
    font-size: 0.76rem; line-height: 1.4; padding: 0.4rem 0.55rem;
    border-radius: 6px; margin-bottom: 0.4rem; border: 1px solid transparent;
  }
  .confirm-check.ok    { color: var(--text-muted); }
  .confirm-check.warn  { color: hsl(45,90%,72%);  background: hsl(45,60%,12%);  border-color: hsl(45,60%,22%); }
  .confirm-check.error { color: hsl(0,85%,74%);   background: hsl(0,55%,12%);   border-color: hsl(0,55%,24%); }
  .confirm-modal input[type=text] {
    width: 100%; background: var(--bg-page); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text-primary); font-family: inherit;
    font-size: 0.85rem; padding: 0.45rem 0.65rem; margin-bottom: 0.9rem;
    box-sizing: border-box;
  }
  .confirm-modal input[type=text]:focus { outline: none; border-color: var(--accent); }
  .confirm-modal label {
    display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.3rem;
  }
  .confirm-actions { display: flex; gap: 0.5rem; justify-content: flex-end; align-items: center; }
  .confirm-actions .spacer { flex: 1; font-size: 0.75rem; color: var(--danger); }
  .btn-plain, .btn-danger, .btn-go {
    padding: 0.4rem 0.85rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600;
    cursor: pointer; background: transparent; font-family: inherit;
  }
  .btn-plain  { border: 1px solid var(--border); color: var(--text-secondary); }
  .btn-go     { border: 1px solid var(--accent); color: var(--link); }
  .btn-danger { border: 1px solid var(--danger); color: var(--danger); }
  .btn-danger:disabled, .btn-go:disabled { opacity: 0.4; cursor: not-allowed; }
  .block-flag { color: var(--gold); font-size: 0.7rem; margin-left: 0.3rem; }
  /* Open offer sheet (§ 3.15). Sits above the hard-cap banner because a pending
     offer changes what the team can spend and is waiting on somebody. */
  .offer-banner {
    border: 1px solid hsl(45,60%,26%); background: hsl(45,60%,9%);
    border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.9rem;
    font-size: 0.85rem; color: var(--text-secondary);
  }
  .offer-banner.overdue { border-color: var(--danger); background: hsl(0,55%,9%); }
  .offer-banner b { color: var(--text-primary); }
  .offer-banner .meta { display: block; margin-top: 0.2rem; font-size: 0.76rem; color: var(--text-muted); }
  .offer-banner .tag {
    color: var(--danger); font-weight: 700; font-size: 0.7rem;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  /* Only rendered when no token is stored. Without it a team owner who isn't on
     the committee has no way into their own tools: every other affordance that
     prompts for a token is itself gated on roles that require a token. */
  .team-signin-btn {
    background: transparent; border: 1px solid var(--border); border-radius: 6px;
    color: var(--text-muted); cursor: pointer; font-family: inherit;
    font-size: 0.72rem; padding: 0.25rem 0.6rem;
  }
  .team-signin-btn:hover { color: var(--text-primary); border-color: var(--text-dim); }
  .player-note {
    display: inline-flex; align-items: center;
    margin-left: 0.35rem; color: var(--gold-dim);
    vertical-align: middle; transition: color 0.1s;
  }
  .player-note:hover { color: var(--gold); }
  .roster-name-cell { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; }
  .roster-name-top { display: inline-flex; align-items: center; gap: 0.5rem; }
  .roster-avatar {
    flex: none; width: 26px; height: 26px; border-radius: 50%;
    overflow: hidden; background: var(--bg-card); border: 1px solid var(--border);
  }
  .roster-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
  .roster-avatar-empty {
    background:
      radial-gradient(circle at 50% 38%, var(--text-dim) 0 6px, transparent 7px),
      radial-gradient(ellipse 10px 7px at 50% 100%, var(--text-dim) 0 100%, transparent 0);
  }
  /* Top-10%-in-category badges, shown inline after the player name (same
     slot the jersey number tag used to occupy). Same muted color at both
     levels -- top-5% (elite) just gets a more visible outline, not a
     brighter fill or different hue, to stay quiet. */
  .attr-badges { display: inline-flex; align-items: center; gap: 0.2rem; flex: none; }
  .attr-badge {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 0 0.28rem; height: 14px; border-radius: 3px; flex: none;
    font-size: 0.56rem; font-weight: 700; letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums; cursor: help;
    color: var(--text-muted); background: rgba(107,114,128,0.08);
    box-shadow: 0 0 0 1px rgba(107,114,128,0.16);
  }
  .attr-badge-elite { box-shadow: 0 0 0 1px rgba(156,163,175,0.55); }
  .attr-legend .cap-legend-item { cursor: default; }
  .attr-legend-note { color: var(--text-dim); font-style: italic; margin-left: auto; }
  .attr-badge-legend { cursor: default; }

  /* NON_GTD salary cell tooltip */
  .sal-tip { cursor: pointer; }

  /* mobile-friendly tooltip popup (hover on pointer devices, tap-to-toggle on touch) */
  .tt-anchor { cursor: pointer; }
  .tt-popup {
    position: absolute; z-index: 500; max-width: 260px;
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary);
    padding: 0.35rem 0.6rem; border-radius: 5px; font-size: 0.75rem;
    white-space: pre-line; line-height: 1.5; text-align: left;
    pointer-events: none; box-shadow: 0 4px 14px rgba(0,0,0,0.45);
  }

  /* Tabs */
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    margin-bottom: 2rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.6rem 1.25rem;
    font-family: inherit;
    transition: color 0.12s;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  .tab:hover { color: var(--text-secondary); }
  .tab.active { color: var(--text-primary); border-bottom-color: var(--accent); font-weight: 600; }
  .tab-panel.hidden { display: none; }

  /* Roster table mode switch (Contracts / Stats / Ratings) */
  .roster-header-row {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.5rem;
  }
  .roster-header-row .section-title { margin-bottom: 0; }
  .mode-tabs { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; flex: none; }
  .mode-tab {
    background: none; border: none; color: var(--text-muted); cursor: pointer;
    font-size: 0.72rem; font-weight: 600; padding: 0.3rem 0.65rem;
    font-family: inherit; transition: color 0.12s, background 0.12s;
  }
  .mode-tab + .mode-tab { border-left: 1px solid var(--border); }
  .mode-tab:hover { color: var(--text-secondary); }
  .mode-tab.active { color: var(--text-primary); background: var(--bg-card); }
  .hist-controls { margin-bottom: 1.5rem; }
  .hist-controls select {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.875rem;
    padding: 0.4rem 0.75rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
  }
  .hist-controls select:focus { border-color: var(--accent); }
`; document.head.appendChild(_s); }

// Mobile-friendly tooltip: hover-to-show on pointer devices, tap-to-toggle on touch.
let _ttEl = null, _ttAnchor = null;
function _ttHide() { if (_ttEl) { _ttEl.remove(); _ttEl = null; _ttAnchor = null; } }
function _ttShow(anchor, text) {
  _ttHide();
  const tip = document.createElement('div');
  tip.className = 'tt-popup';
  tip.textContent = text;
  document.body.appendChild(tip);
  const r = anchor.getBoundingClientRect();
  let left = r.left + r.width / 2 - tip.offsetWidth / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - tip.offsetWidth - 6));
  let top = r.top - tip.offsetHeight - 8;
  if (top < 4) top = r.bottom + 8;
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${top + window.scrollY}px`;
  _ttEl = tip;
  _ttAnchor = anchor;
}
const _ttIsTouch = window.matchMedia('(hover: none)').matches;
document.addEventListener('click', e => { if (_ttEl && !e.target.closest('.tt-anchor')) _ttHide(); });
function attachTooltip(el, textOrFn) {
  el.classList.add('tt-anchor');
  const getText = () => (typeof textOrFn === 'function' ? textOrFn() : textOrFn);
  if (_ttIsTouch) {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const text = getText();
      if (!text) return;
      if (_ttAnchor === el) _ttHide(); else _ttShow(el, text);
    });
  } else {
    el.addEventListener('mouseenter', () => { const text = getText(); if (text) _ttShow(el, text); });
    el.addEventListener('mouseleave', _ttHide);
  }
}

document.body.innerHTML = `
  <div class="page">
    <nav class="nav"><a href="/teams">← Teams</a></nav>
    <div class="team-header-nav">
      ${prevAbbr ? `<a class="team-nav-btn" href="/teams/${prevAbbr}/" title="${TEAMS[prevAbbr]}" aria-label="Previous team">‹</a>` : ''}
      <div class="team-header">
        <img src="/logos/logo-${slug}.png" alt="${name} logo">
        <h1>${name}</h1>
      </div>
      ${nextAbbr ? `<a class="team-nav-btn" href="/teams/${nextAbbr}/" title="${TEAMS[nextAbbr]}" aria-label="Next team">›</a>` : ''}
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="overview">Roster</button>
      <button class="tab" data-tab="settings">Team Settings</button>
      <button class="tab" data-tab="franchise">Franchise</button>
      <button class="tab" data-tab="draft">Draft History</button>
      <button class="tab" data-tab="alltime">All-Time Players</button>
      <button class="tab" data-tab="history">Historical Rosters</button>
    </div>
    <div class="tab-panel" id="tab-overview">
      <div id="offer-sheet-banner" style="display:none"></div>
      <div id="hard-cap-banner" style="display:none"></div>
      <section>
        <div class="roster-header-row">
          <h2 class="section-title" id="roster-title">Roster</h2>
          <div class="mode-tabs" id="roster-mode-tabs">
            <button class="mode-tab active" data-mode="depth" type="button">Rosters</button>
            <button class="mode-tab" data-mode="contracts" type="button">Contracts</button>
            <button class="mode-tab" data-mode="stats" type="button">Stats</button>
            <button class="mode-tab" data-mode="ratings" type="button">Ratings</button>
          </div>
          <button id="whatif-enter-btn" class="whatif-enter-btn" type="button">What If Mode</button>
          <button id="team-signin-btn" class="team-signin-btn" type="button" style="display:none">Sign in</button>
        </div>
        <div class="table-wrap" id="roster-wrap"><div class="status">Loading…</div></div>
        <div id="cap-edit-wrap"></div>
        <div id="dead-cap-edit-wrap"></div>
        <div id="whatif-panel" class="whatif-panel" style="display:none">
          <div class="whatif-toolbar">
            <span class="whatif-badge">What If Mode — nothing here is saved</span>
            <span id="whatif-add-wrap"></span>
            <button id="whatif-exit-btn" class="whatif-exit-btn" type="button">Exit What If Mode</button>
          </div>
          <div id="whatif-log" class="whatif-log"></div>
          <div id="whatif-contract-form-slot"></div>
          <div class="table-wrap" id="whatif-roster-wrap"></div>
          <div id="whatif-warnings"></div>
          <div id="whatif-attr-impact-wrap" style="display:none">
            <div class="whatif-attr-heading">Attribute Impact <span class="whatif-attr-heading-note">— vs. your real roster, cap holds excluded</span></div>
            <div id="whatif-attr-impact" class="table-wrap"></div>
          </div>
          <div id="whatif-hard-cap-banner" style="display:none"></div>
          <div id="whatif-exceptions-section" style="display:none">
            <div id="whatif-exceptions-wrap" class="exceptions-card"></div>
          </div>
        </div>
      </section>
      <section id="exceptions-section" style="display:none">
        <h2 class="section-title">Cap Exceptions</h2>
        <div id="exceptions-wrap" class="exceptions-card"></div>
      </section>
      <section id="trade-exceptions-section" style="display:none">
        <h2 class="section-title">Trade Exceptions</h2>
        <div id="trade-exceptions-wrap" class="exceptions-card"></div>
      </section>
      <section>
        <h2 class="section-title" id="picks-title">Draft Picks</h2>
        <div class="table-wrap" id="picks-wrap"><div class="status">Loading…</div></div>
      </section>
    </div>
    <div class="tab-panel hidden" id="tab-settings">
      <section>
        <h2 class="section-title" id="team-settings-title">Team Settings</h2>
        <p class="section-sub">Jersey numbers and secondary positions. Primary position is scraped from 2K and can't be edited here.</p>
        <div class="table-wrap" id="team-settings-wrap"><div class="status">Loading…</div></div>
      </section>
    </div>
    <div class="tab-panel hidden" id="tab-franchise">
      <section>
        <h2 class="section-title">Season History</h2>
        <div class="timeline" id="timeline-wrap"></div>
        <div class="table-wrap" id="seasons-wrap"><div class="status">Loading…</div></div>
      </section>
      <section id="personnel-section" style="display:none">
        <h2 class="section-title">Franchise Personnel</h2>
        <div class="table-wrap" id="personnel-wrap"></div>
      </section>
      <section id="retired-section" style="display:none">
        <h2 class="section-title">Retired Numbers</h2>
        <div class="retired-banners" id="retired-banners"></div>
      </section>
    </div>
    <div class="tab-panel hidden" id="tab-draft">
      <section>
        <h2 class="section-title">Draft History</h2>
        <p class="section-sub">Players drafted by this franchise</p>
        <div class="table-wrap" id="drafted-wrap"><div class="status">Loading…</div></div>
      </section>
    </div>
    <div class="tab-panel hidden" id="tab-alltime">
      <section>
        <h2 class="section-title">All-Time Top Players</h2>
        <p class="section-sub">Regular season · ranked by total Game Score</p>
        <div class="table-wrap" id="players-wrap"><div class="status">Loading…</div></div>
      </section>
      <section>
        <h2 class="section-title">Franchise Records</h2>
        <p class="section-sub">Best single games in franchise history · regular season and playoffs</p>
        <div id="records-wrap"><div class="status">Loading…</div></div>
      </section>
    </div>
    <div class="tab-panel hidden" id="tab-history">
      <section>
        <h2 class="section-title">Historical Rosters</h2>
        <p class="section-sub">Per-season stats for this franchise</p>
        <div class="hist-controls" id="hist-controls"></div>
        <div id="hist-roster-wrap"><div class="status">Select a season to view stats</div></div>
      </section>
    </div>
  </div>
`;

const _navScript = document.createElement('script');
_navScript.src = '/nav.js';
document.head.appendChild(_navScript);

const _badgeScript = document.createElement('script');
_badgeScript.src = '/token-badge.js';
_badgeScript.onload = function () { window.__nbnBadge && window.__nbnBadge(); };
document.head.appendChild(_badgeScript);

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function parseLine(line) {
  const out = [];
  let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; }
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

function fmtPct(v) {
  const n = parseFloat(v);
  return isNaN(n) ? '—' : n.toFixed(3);
}

function fmtSigned(v, decimals = 1) {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(decimals);
}

function sv(row, field) {
  const v = row[field];
  if (!v || v === 'NA') return -Infinity;
  const n = parseFloat(v);
  return isNaN(n) ? v : n;
}

function formatSalary(v) {
  if (!v && v !== 0) return '—';
  const s = String(v).trim();
  if (!s || s === '—') return '—';
  const digits = s.replace(/[$,\s]/g, '');
  const n = parseFloat(digits);
  if (isNaN(n)) return s;
  return '$' + Math.round(n).toLocaleString('en-US');
}

function buildNonGtdTip(year, guaranteed, guarantee_dates, guarantee_schedule) {
  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const sched    = (guarantee_schedule || {})[year];
  const gtdAmt   = (guaranteed || {})[year];
  const gtdDate  = (guarantee_dates || {})[year];
  const lines = ['Non-Guaranteed'];
  if (sched && sched.length) {
    sched.forEach(step => {
      if (!step.amount) {
        lines.push('→ Fully guaranteed' + (step.date ? ' ' + fmtDate(step.date) : ' at signing'));
      } else {
        lines.push('→ ' + formatSalary(step.amount) + ' vests' + (step.date ? ' ' + fmtDate(step.date) : ' at signing'));
      }
    });
  } else if (gtdAmt || gtdDate) {
    if (gtdAmt)  lines.push('→ ' + formatSalary(gtdAmt) + ' guaranteed');
    if (gtdDate) lines.push('→ Fully guaranteed ' + fmtDate(gtdDate));
  } else {
    lines.push('→ $0 guaranteed');
  }
  return lines.join('\n');
}

function displayNameFromBio(canonical) {
  if (!canonical) return '';
  const toTitle = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  if (canonical.includes(',')) {
    const [last, first] = canonical.split(',', 2);
    return toTitle(`${first.trim()} ${last.trim()}`);
  }
  return toTitle(canonical);
}

function calcAge(dob) {
  if (!dob) return '';
  return Math.floor((Date.now() - new Date(dob + 'T00:00:00').getTime()) / (365.25 * 24 * 3600 * 1000));
}

function buildTable(cols, rows, initSortField, initSortDir, renderCell) {
  let sortField = initSortField;
  let sortDir = initSortDir;

  const table = document.createElement('table');
  const thead = table.createTHead();
  const hr = thead.insertRow();

  cols.forEach(col => {
    const th = document.createElement('th');
    const arrow = document.createElement('span');
    arrow.className = 'sort-arrow';
    th.appendChild(document.createTextNode(col.label));
    th.appendChild(arrow);
    th.dataset.active = String(col.sortField === sortField);
    if (col.cls?.includes('right')) th.classList.add('right');
    th.addEventListener('click', () => {
      if (sortField === col.sortField) sortDir *= -1;
      else { sortField = col.sortField; sortDir = col.defaultDir; }
      hr.querySelectorAll('th').forEach(t => {
        t.dataset.active = 'false';
        t.querySelector('.sort-arrow').textContent = '↓';
      });
      th.dataset.active = 'true';
      th.querySelector('.sort-arrow').textContent = sortDir === -1 ? '↓' : '↑';
      rebuild();
    });
    hr.appendChild(th);
  });

  const activeIdx = cols.findIndex(c => c.sortField === sortField);
  if (activeIdx >= 0) {
    const activeTh = hr.querySelectorAll('th')[activeIdx];
    activeTh.querySelector('.sort-arrow').textContent = initSortDir === -1 ? '↓' : '↑';
  }

  const tbody = table.createTBody();

  function rebuild() {
    tbody.innerHTML = '';
    [...rows].sort((a, b) => {
      const va = sv(a, sortField), vb = sv(b, sortField);
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    }).forEach(row => {
      const tr = tbody.insertRow();
      cols.forEach(col => {
        const td = tr.insertCell();
        if (col.cls) col.cls.split(' ').forEach(c => c && td.classList.add(c));
        renderCell(td, col, row);
      });
    });
  }

  rebuild();
  return table;
}

// Google-Sheets-style range selection: drag or shift-click down a single numeric
// column inside `container` to see the sum/avg/count of the selected cells in a
// floating bar. Ctrl/Cmd-click (or ctrl/cmd-drag) adds a non-contiguous block to
// the existing selection instead of replacing it, mirroring Sheets' multi-select.
// Delegated on `container` (not the table) so it keeps working across re-renders
// (mode switches, edits) without needing to be re-attached.
function enableRangeSum(container) {
  const bar = document.createElement('div');
  bar.className = 'range-sum-bar';
  document.body.appendChild(bar);

  let selectedCol = null;   // column index every selected cell must belong to
  let committed = new Set(); // cells locked in from prior, already-finished gestures
  let gesture = [];          // cells touched by the in-progress mouse gesture
  let anchor = null;         // start cell of the in-progress gesture
  let dragging = false;

  function dataRows() {
    const tbody = container.querySelector('table tbody');
    return tbody ? [...tbody.rows].filter(tr => !tr.classList.contains('subheader')) : [];
  }

  function eligibleTd(target) {
    const td = target.closest && target.closest('td.right');
    if (!td || !container.contains(td) || !td.closest('tbody')) return null;
    if (td.closest('tr').classList.contains('subheader')) return null;
    if (td.classList.contains('nosum')) return null;   // right-aligned but not a number
    return td;
  }

  function numFromCell(td) {
    let t = td.textContent.replace(/[$,%\s]/g, '');
    if (t[0] === '+') t = t.slice(1);
    if (t === '' || t === '—' || t === '-') return null;
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  }

  function blockBetween(fromTd, toTd) {
    if (toTd.cellIndex !== fromTd.cellIndex) return [fromTd];
    const rows = dataRows();
    const a = rows.indexOf(fromTd.closest('tr'));
    const b = rows.indexOf(toTd.closest('tr'));
    if (a === -1 || b === -1) return [fromTd];
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return rows.slice(lo, hi + 1).map(tr => tr.cells[fromTd.cellIndex]).filter(Boolean);
  }

  function currentSelection() {
    return new Set([...committed, ...gesture]);
  }

  function clearSelection() {
    container.querySelectorAll('td.cell-selected').forEach(td => td.classList.remove('cell-selected'));
    selectedCol = null;
    committed = new Set();
    gesture = [];
    anchor = null;
    dragging = false;
    bar.style.display = 'none';
  }

  function render() {
    container.querySelectorAll('td.cell-selected').forEach(td => td.classList.remove('cell-selected'));
    const all = currentSelection();
    all.forEach(td => td.classList.add('cell-selected'));
    if (all.size < 2) { bar.style.display = 'none'; return; }

    const nums = [...all].map(numFromCell).filter(n => n !== null);
    if (!nums.length) { bar.style.display = 'none'; return; }
    const isCurrency = [...all].some(td => td.textContent.includes('$'));
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    const fmt = n => isCurrency
      ? '$' + Math.round(n).toLocaleString('en-US')
      : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    bar.innerHTML = `Sum <b>${fmt(sum)}</b> &nbsp;·&nbsp; Avg <b>${fmt(avg)}</b> &nbsp;·&nbsp; Count <b>${nums.length}</b>`;
    bar.style.display = 'block';
  }

  container.addEventListener('mousedown', e => {
    const td = eligibleTd(e.target);
    if (!td) { clearSelection(); return; }
    e.preventDefault();

    const ctrlKey = e.ctrlKey || e.metaKey;
    const sameCol = selectedCol === td.cellIndex;

    if (e.shiftKey && anchor && sameCol) {
      // Plain shift-click always re-anchors to one contiguous block.
      committed = new Set();
      gesture = blockBetween(anchor, td);
      dragging = true;
      render();
      return;
    }

    if (ctrlKey && selectedCol !== null && sameCol) {
      // Fold whatever was selected before into `committed`, then start a new
      // block anchored at this cell that gets ADDED rather than replacing it.
      committed = currentSelection();
      anchor = td;
      gesture = [td];
      dragging = true;
      render();
      return;
    }

    // Plain click/drag: start a brand-new selection in this column.
    selectedCol = td.cellIndex;
    committed = new Set();
    anchor = td;
    gesture = [td];
    dragging = true;
    render();
  });

  container.addEventListener('mouseover', e => {
    if (!dragging || !anchor) return;
    const td = eligibleTd(e.target);
    if (!td || td.cellIndex !== selectedCol) return;
    gesture = blockBetween(anchor, td);
    render();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    committed = currentSelection();
    gesture = [];
    dragging = false;
  });
  document.addEventListener('mousedown', e => { if (!container.contains(e.target)) clearSelection(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') clearSelection(); });

  new MutationObserver(clearSelection).observe(container, { childList: true });
}

// Copies `table` to the clipboard as tab-separated text (plus an HTML table
// variant) so pasting into Google Sheets/Excel lands each cell in its own
// spreadsheet cell instead of one blob of text. Player-name cells resolve to
// just the link text (skipping avatar/badge/note clutter); footnote markup
// (`sup` player counts, cap-vs-total diff lines, the Guaranteed info badge)
// is stripped so it can't glue onto an adjacent number (e.g. "$50,000,0003").
function getCellText(td) {
  const clone = td.cloneNode(true);
  clone.querySelectorAll('sup, .tfoot-diff, .badge').forEach(el => el.remove());
  const a = clone.querySelector('a');
  const text = (a ? a.textContent : clone.textContent) || '';
  return text.replace(/\s+/g, ' ').trim();
}

function tableToTSV(table) {
  return [...table.querySelectorAll('tr')]
    .map(tr => [...tr.cells].map(td => getCellText(td).replace(/\t/g, ' ')).join('\t'))
    .join('\n');
}

function tableToHTML(table) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = [...table.querySelectorAll('tr')].map(tr => {
    const cells = [...tr.cells].map(td => {
      const tag = td.tagName.toLowerCase();
      const colspan = td.colSpan > 1 ? ` colspan="${td.colSpan}"` : '';
      return `<${tag}${colspan}>${esc(getCellText(td))}</${tag}>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table>${rows}</table>`;
}

async function copyTableToClipboard(table, btn) {
  const tsv = tableToTSV(table);
  const origLabel = btn.textContent;
  const flash = msg => { btn.textContent = msg; setTimeout(() => { btn.textContent = origLabel; }, 1400); };

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
          'text/html':  new Blob([tableToHTML(table)], { type: 'text/html' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(tsv);
    }
    flash('Copied!');
  } catch (err) {
    // Clipboard API needs a secure context + permission; fall back to the
    // old select-a-hidden-textarea-and-execCommand trick.
    try {
      const ta = document.createElement('textarea');
      ta.value = tsv;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      flash('Copied!');
    } catch (err2) {
      flash('Copy failed');
    }
  }
}

function attachCopyBtn(titleId, wrapId) {
  const titleEl = document.getElementById(titleId);
  if (!titleEl || titleEl.querySelector('.section-copy-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'section-copy-btn';
  btn.textContent = 'Copy';
  btn.style.cssText = 'font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text-muted);cursor:pointer;font-weight:500;margin-left:0.6rem;font-family:inherit;vertical-align:middle';
  btn.onmouseenter = () => { btn.style.color = 'var(--text-secondary)'; btn.style.borderColor = 'var(--text-muted)'; };
  btn.onmouseleave = () => { btn.style.color = 'var(--text-muted)'; btn.style.borderColor = 'var(--border)'; };
  btn.addEventListener('click', () => {
    const table = document.getElementById(wrapId)?.querySelector('table');
    if (table) copyTableToClipboard(table, btn);
  });
  titleEl.appendChild(btn);
}

const CAP_HOLD_CSS = {
  UFA:        'cap-ufa',
  RFA:        'cap-rfa',
  PLAYER_OPT: 'cap-player-opt',
  TEAM_OPT:   'cap-team-opt',
  NON_GTD:    'cap-non-gtd',
};

const CAP_HOLD_LABELS = {
  UFA:        'UFA Hold',
  RFA:        'RFA Hold',
  PLAYER_OPT: 'Player Option',
  TEAM_OPT:   'Team Option',
  NON_GTD:    'Non-Guaranteed',
};

const SWATCH_COLORS = {
  UFA:        'hsl(45,  60%, 35%)',
  RFA:        'hsl(25,  60%, 35%)',
  PLAYER_OPT: 'hsl(120, 50%, 30%)',
  TEAM_OPT:   'hsl(210, 55%, 35%)',
  NON_GTD:    'var(--border)',
};

// Thin alias for contract.js's parseCapHoldMap, kept because seven call sites
// here use the shorter name. Falls back to a local copy if contract.js hasn't
// loaded — a few of these run off CSV rows before the render awaits
// contractReady, and a missing shorthand is better than a broken roster table.
function parseCapHolds(val) {
  if (typeof parseCapHoldMap === 'function') return parseCapHoldMap(val);
  if (val && typeof val === 'object') return val;
  const map = {};
  if (!val) return map;
  String(val).split(',').forEach(pair => {
    const [yr, type] = pair.split(':');
    if (yr && type) map[yr.trim()] = type.trim();
  });
  return map;
}

// The current league year (cap/contract clock). Set from GET /api/league-year at
// page load; falls back to the date-based season if that fetch fails. BOD advances
// it from Cap Settings; once set it drives every "current season" use on this page
// (roster first column, total salary, hard-cap banner, exceptions, trades).
let LEAGUE_YEAR = null;

function currentSeasonYr() {
  if (LEAGUE_YEAR) return LEAGUE_YEAR;
  const now = new Date();
  const y = now.getFullYear() % 100;
  const m = now.getMonth() + 1;
  return m < 7
    ? `${String(y - 1).padStart(2, '0')}-${String(y).padStart(2, '0')}`
    : `${String(y).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function parseSalaryNum(v) {
  if (!v && v !== 0) return 0;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

function fmtDollars(v) {
  return v ? '$' + Math.round(v).toLocaleString('en-US') : '$0';
}

// Real, persisted Empty Roster Charge (rulebook § 2.1a) — distinct from the
// 14-player standard-roster minimum (§ 2.1) and from the trade-legality mock
// the backend runs against a 14-player floor (routers/transactions.py,
// _empty_roster_charge). The charge that actually shows on a team's roster
// and counts toward real Team Salary only kicks in below 12 players — this
// mirrors _is_standard_roster_slot's type filter (two-way/draft-rights/dead
// don't occupy a standard slot) but against the narrower 12-player floor.
const ROSTER_CHARGE_MIN = 12;
const ROSTER_EXEMPT_TYPES = new Set(['two-way', 'draft-rights', 'dead']);

function computeEmptyRosterCharge(rosterRows, biosData, capLevels, season) {
  const standardCount = rosterRows.filter(row => {
    const bio = biosData[row.SLUG] || {};
    const type = row.TYPE || bio.type || '';
    return !ROSTER_EXEMPT_TYPES.has(type);
  }).length;
  const deficiency = Math.max(0, ROSTER_CHARGE_MIN - standardCount);
  const rookieMin = (capLevels?.[season] || {}).min_salary_scale?.['0'] || 0;
  return { deficiency, rookieMin, charge: deficiency * rookieMin };
}

// Team salary totals (§ 1.3/1.4: teamSalaryExHolds excludes pure UFA/RFA
// free-agent holds for apron/hard-cap comparisons, teamSalaryFull keeps them
// for plain Cap/room checks) plus the real Empty Roster Charge. Shared by the
// real roster render and by What-If Mode, which calls this with a hypothetical
// rosterRows/deadCapRows + a merged biosData rather than the real ones.
function computeCapSummary(rosterRows, deadCapRows, biosData, capLevels, season) {
  const FA_HOLD_TYPES = ['UFA', 'RFA'];
  let teamSalaryFull = 0, teamSalaryExHolds = 0;
  rosterRows.forEach(row => {
    const bio = biosData[row.SLUG] || {};
    const sal = parseSalaryNum((bio.salaries || {})[season]);
    teamSalaryFull += sal;
    if (!FA_HOLD_TYPES.includes((bio.cap_holds || {})[season])) teamSalaryExHolds += sal;
  });
  deadCapRows.forEach(row => {
    const sal = parseSalaryNum(row[season] || '');
    teamSalaryFull += sal;
    teamSalaryExHolds += sal;
  });
  const erc = computeEmptyRosterCharge(rosterRows, biosData, capLevels, season);
  teamSalaryFull += erc.charge;
  teamSalaryExHolds += erc.charge;
  return { teamSalaryFull, teamSalaryExHolds, erc };
}

function computeMleType(teamSalaryFull, teamSalaryExHolds, capLevels, season, teamState) {
  // team-state.json's schema is the short "room" form, but a record written
  // by a declared `room_exception` signing_method stamped the long form
  // before that was normalized on write — accept both so an old record
  // doesn't fall through to '—' below.
  if (teamState?.mle_type) return teamState.mle_type === 'room_exception' ? 'room' : teamState.mle_type;
  const cl = capLevels?.[season];
  if (!cl?.ntmle_amount) return null;
  // Room Exception eligibility is Cap-based and still counts holds (§ 3.2);
  // NTMLE/TMLE eligibility is apron-based and excludes pure FA holds (§ 1.3/1.4).
  if (cl.cap - teamSalaryFull > cl.ntmle_amount) return 'room';
  if (cl.apron1 - teamSalaryExHolds >= cl.ntmle_amount) return 'ntmle';
  return 'tmle';
}

function mleTypeLabel(type) {
  return { room: 'Room Exception', ntmle: 'Non-Taxpayer MLE', tmle: 'Taxpayer MLE' }[type] || '—';
}

function renderHardCapBanner(teamState, el = document.getElementById('hard-cap-banner')) {
  if (!el) return;
  if (!teamState?.hard_cap) { el.style.display = 'none'; return; }
  const isApron2 = teamState.hard_cap === 'second_apron';
  el.className = 'hard-cap-banner' + (isApron2 ? ' apron2' : '');
  el.style.display = '';
  const reason = teamState.hard_cap_reason ? ` · ${teamState.hard_cap_reason}` : '';
  el.textContent = `⚠ Hard-Capped: ${isApron2 ? 'Second' : 'First'} Apron${reason}`;
}

// The undrafted draft-year horizon to reason about for § 7.2 — once every
// team's pick for a year is drafted (player set), that year drops out of the
// ledger entirely and would otherwise misread as a league-wide gap rather
// than a resolved past year.
function stepienYearRange(allPicks) {
  const years = (allPicks || []).filter(p => p.round === 1 && !p.player).map(p => p.year);
  if (!years.length) return null;
  return [Math.min(...years), Math.max(...years)];
}

// § 7.2 Stepien Rule is a restriction on trading, not a retroactive state —
// the league can't already be sitting in violation (the trade that would
// cause it gets blocked at submit time, see nbn-api's _check_stepien_rule),
// so a whole-team "are you currently in violation" check is close to
// pointless: it can only ever fire from a data-modeling gap, not a real one.
// What's actually useful to a GM is knowing WHICH of their picks they
// currently can't trade away — this returns the set of "{year}:{orig}" keys
// for picks that are the team's only claim on that draft year, with an
// already-empty year on one side, so trading it away in isolation would open
// a two-year gap right now. Mirrors the backend's per-trade simulation, just
// evaluated proactively per pick instead of only at trade-submit time.
function computeStepienLocked(teamPicks, allPicks, teamAbbr) {
  const locked = new Set();
  const range = stepienYearRange(allPicks);
  if (!range) return locked;
  const [lo, hi] = range;
  const round1 = (teamPicks || []).filter(p => p.round === 1 && !p.player);
  const have = new Set(round1.map(p => p.year));

  // A pick can carry a real but easy-to-miss claim: `ladder_fallback_of` on
  // a DIFFERENT pick names it as compensation if that pick's protection
  // ladder never resolves. `/api/picks/{team}` doesn't currently surface
  // this (its own owner/leaves match doesn't check ladder_fallback_of), so
  // `teamPicks` alone would silently miss real year coverage -- pull it
  // from the league-wide `allPicks` instead, which carries the raw field.
  // Not added to the claims map below (no visible row exists for it to
  // attach a lock flag to, a separate, pre-existing gap in the API's own
  // team filter) -- just credited toward `have` so it doesn't cause a
  // false lock on some OTHER real pick in a neighboring year.
  (allPicks || []).forEach(p => {
    if (p.round === 1 && !p.player && p.ladder_fallback_of?.to === teamAbbr) have.add(p.year);
  });

  // Two pick rows sharing the same group_id (a swap group / binary chain)
  // are ONE shared claim, not two independent ones -- trading either row
  // mutates the same underlying priority list / chain node (see nbn-api's
  // registry.handle_retrade), so a team can't give up one and "keep the
  // other." Group rows by claim before counting how many distinct claims a
  // team holds in a year, and lock every row in a claim together.
  const claims = new Map();
  round1.forEach(p => {
    const key = p.group_id || `solo:${p.year}:${p.orig}`;
    if (!claims.has(key)) claims.set(key, { year: p.year, rows: [] });
    claims.get(key).rows.push(p);
  });
  const countByYear = new Map();
  claims.forEach(c => countByYear.set(c.year, (countByYear.get(c.year) || 0) + 1));
  claims.forEach(c => {
    if (countByYear.get(c.year) > 1) return;   // another distinct claim still covers this year
    const prevMissing = c.year - 1 >= lo && !have.has(c.year - 1);
    const nextMissing = c.year + 1 <= hi && !have.has(c.year + 1);
    if (prevMissing || nextMissing) c.rows.forEach(p => locked.add(`${p.round}:${p.year}:${p.orig}`));
  });
  return locked;
}

function renderExceptionsSection(
  teamState, capLevels, teamSalaryFull, teamSalaryExHolds, season,
  section = document.getElementById('exceptions-section'),
  wrap = document.getElementById('exceptions-wrap'),
) {
  if (!section || !wrap) return;
  const cl = capLevels?.[season];
  if (!cl?.ntmle_amount && !cl?.bae_amount) { section.style.display = 'none'; return; }

  const mleType = computeMleType(teamSalaryFull, teamSalaryExHolds, capLevels, season, teamState);
  const mleTotal = mleType === 'tmle' ? (cl.tmle_amount || 0) : mleType === 'room' ? (cl.room_amount || 0) : (cl.ntmle_amount || 0);
  const mleUsed = teamState?.mle_used || 0;
  const mleRemaining = Math.max(0, mleTotal - mleUsed);
  const baeUsed = teamState?.bae_used;
  const baeAvail = teamState?.bae_available;

  wrap.innerHTML = '';

  if (mleType && mleTotal > 0) {
    const row = document.createElement('div');
    row.className = 'exceptions-row';
    const remCls = mleRemaining > 0 ? 'exc-remaining' : 'exc-used';
    row.innerHTML = `
      <span class="exc-label">MLE <span class="exc-mle-type">(${mleTypeLabel(mleType)})</span></span>
      <span>
        <span class="${remCls}">${fmtDollars(mleRemaining)} remaining</span>
        <span style="color:var(--text-dim);font-size:0.75rem"> / ${fmtDollars(mleTotal)}</span>
        ${mleUsed ? `<span style="color:var(--text-muted);font-size:0.72rem"> (${fmtDollars(mleUsed)} used)</span>` : ''}
      </span>`;
    wrap.appendChild(row);
  }

  if (baeAvail || baeUsed) {
    const row = document.createElement('div');
    row.className = 'exceptions-row';
    row.innerHTML = baeUsed
      ? `<span class="exc-label">BAE</span><span class="exc-used">Used · ${fmtDollars(cl.bae_amount)}</span>`
      : `<span class="exc-label">BAE</span><span class="exc-remaining">Available · ${fmtDollars(cl.bae_amount)}</span>`;
    wrap.appendChild(row);
  }

  section.style.display = wrap.children.length ? '' : 'none';
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Rulebook § 4.1a — banked when a team sends out more salary than it receives
// in a trade; not itself tradeable. Read-only for now: creation/consumption is
// manual (ported from the league's roster/cap spreadsheet), not computed from
// trade transactions.
function renderTradeExceptionsSection(exceptions) {
  const section = document.getElementById('trade-exceptions-section');
  const wrap = document.getElementById('trade-exceptions-wrap');
  wrap.innerHTML = '';

  const list = (exceptions || []).slice().sort((a, b) => a.expires_date.localeCompare(b.expires_date));
  if (!list.length) { section.style.display = 'none'; return; }

  list.forEach(exc => {
    const row = document.createElement('div');
    row.className = 'exceptions-row';
    if (exc.expired) row.style.opacity = '0.5';
    const remCls = !exc.expired && exc.remaining > 0 ? 'exc-remaining' : 'exc-used';
    const noteHtml = exc.note ? `<span class="exc-mle-type">(${exc.note})</span>` : '';
    row.innerHTML = `
      <span class="exc-label">TPE ${noteHtml}</span>
      <span>
        <span class="${remCls}">${fmtDollars(exc.remaining)} remaining</span>
        <span style="color:var(--text-dim);font-size:0.75rem"> / ${fmtDollars(exc.amount)}</span>
        <span style="color:var(--text-muted);font-size:0.72rem"> · ${exc.expired ? 'expired' : 'expires'} ${fmtDate(exc.expires_date)}</span>
      </span>`;
    wrap.appendChild(row);
  });

  section.style.display = '';
}

// Compact roster-table badges summarizing a player's standout 2K attributes.
// Each entry is a specific skill (not a whole ratings-popup category); score
// is the plain average of every attribute in the group (see
// computeAttrBadgeCutoffs for why the bronze/silver/gold bar is calibrated
// per group instead of one fixed number).
const ATTR_BADGE_GROUPS = [
  { label: 'S3', full: 'Scoring: 3PT',        keys: ['three_point_shot'] },
  { label: 'Sm', full: 'Scoring: Mid-Range',  keys: ['mid_range_shot'] },
  { label: 'Si', full: 'Scoring: Inside',     keys: ['layup', 'driving_dunk', 'standing_dunk', 'post_hook', 'post_fade', 'post_control', 'draw_foul'] },
  { label: 'Pa', full: 'Passing',             keys: ['pass_accuracy', 'pass_vision'] },
  { label: 'H',  full: 'Ballhandling',        keys: ['ball_handle', 'speed_with_ball'] },
  { label: 'IQ', full: 'IQ',                  keys: ['shot_iq', 'pass_iq', 'help_defense_iq'] },
  { label: 'Dp', full: 'Perimeter Defense',   keys: ['perimeter_defense', 'steal'] },
  { label: 'Di', full: 'Inside Defense',      keys: ['interior_defense', 'block'] },
  { label: 'R',  full: 'Rebounding',          keys: ['defensive_rebound', 'offensive_rebound'] },
  { label: 'A',  full: 'Athleticism',         keys: ['speed', 'strength', 'agility', 'vertical', 'hustle'] },
];

// A plain average across a 5-7 attribute group (e.g. Athleticism, Inside
// Finishing) regresses hard to the mean -- a real player is rarely elite at
// every sub-skill simultaneously -- so its raw scale sits far below a 1-2
// attribute group's. Rather than a fixed cut that would starve the big
// groups, each group's own cutoffs are the values at the Nth percentile of
// that group's score distribution *across the whole league* (not just this
// roster), computed fresh from attributesData so it tracks as ratings
// change. Every badge therefore represents roughly the same population
// rarity no matter which group it's in. `elite` (top 5%) gets a slightly
// more visible outline than `base` (top 10%) -- same muted color either
// way, just a hair more emphasis, no tier-color system.
const ATTR_BADGE_PERCENTILES = { base: 0.90, elite: 0.95 };

function computeAttrBadgeCutoffs(attributesData) {
  const scoresByLabel = {};
  ATTR_BADGE_GROUPS.forEach(g => { scoresByLabel[g.label] = []; });
  Object.values(attributesData || {}).forEach(snap => {
    const attrs = snap && snap.attributes;
    if (!attrs) return;
    ATTR_BADGE_GROUPS.forEach(group => {
      const vals = group.keys.map(k => parseFloat(attrs[k])).filter(v => !isNaN(v));
      if (!vals.length) return;
      scoresByLabel[group.label].push(vals.reduce((s, v) => s + v, 0) / vals.length);
    });
  });
  const cutoffs = {};
  Object.keys(scoresByLabel).forEach(label => {
    const sorted = scoresByLabel[label].slice().sort((a, b) => a - b);
    const at = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : Infinity;
    cutoffs[label] = { base: at(ATTR_BADGE_PERCENTILES.base), elite: at(ATTR_BADGE_PERCENTILES.elite) };
  });
  return cutoffs;
}

function computeAttrBadges(attrSnap, cutoffs) {
  if (!attrSnap || !attrSnap.attributes || !cutoffs) return [];
  const attrs = attrSnap.attributes;
  const badges = [];
  ATTR_BADGE_GROUPS.forEach(group => {
    const vals = group.keys.map(k => parseFloat(attrs[k])).filter(v => !isNaN(v));
    if (!vals.length) return;
    const score = vals.reduce((s, v) => s + v, 0) / vals.length;
    const c = cutoffs[group.label];
    if (c && score >= c.base) {
      badges.push({ label: group.label, full: group.full, value: score, elite: score >= c.elite });
    }
  });
  return badges;
}

// Individual 2K attributes for the roster table's Ratings mode. Same
// grouping/order/abbreviations as players/index.html's ATTR_CATEGORIES /
// ATTR_ABBR, so the two pages read consistently. `catStart` marks the first
// column of each category for a divider, mirroring the salary-year divider.
const RATING_ATTR_COLUMNS = [
  { key: 'three_point_shot',      abbr: '3PT',  full: '3PT Shot',              catStart: true },
  { key: 'mid_range_shot',        abbr: 'MID',  full: 'Mid-Range Shot' },
  { key: 'close_shot',            abbr: 'CS',   full: 'Close Shot' },
  { key: 'free_throw',            abbr: 'FT',   full: 'Free Throw' },
  { key: 'shot_iq',               abbr: 'SIQ',  full: 'Shot IQ' },
  { key: 'offensive_consistency', abbr: 'OCON', full: 'Offensive Consistency' },

  { key: 'layup',                 abbr: 'LAY',  full: 'Layup',                 catStart: true },
  { key: 'driving_dunk',          abbr: 'DDK',  full: 'Driving Dunk' },
  { key: 'standing_dunk',         abbr: 'SDK',  full: 'Standing Dunk' },
  { key: 'post_hook',             abbr: 'PHK',  full: 'Post Hook' },
  { key: 'post_fade',             abbr: 'PFD',  full: 'Post Fade' },
  { key: 'post_control',          abbr: 'PCTL', full: 'Post Control' },
  { key: 'draw_foul',             abbr: 'DF',   full: 'Draw Foul' },
  { key: 'hands',                 abbr: 'HND',  full: 'Hands' },

  { key: 'speed',                 abbr: 'SPD',  full: 'Speed',                 catStart: true },
  { key: 'strength',              abbr: 'STR',  full: 'Strength' },
  { key: 'agility',               abbr: 'AGL',  full: 'Agility' },
  { key: 'vertical',              abbr: 'VERT', full: 'Vertical' },
  { key: 'hustle',                abbr: 'HUS',  full: 'Hustle' },
  { key: 'stamina',               abbr: 'STA',  full: 'Stamina' },
  { key: 'overall_durability',    abbr: 'DUR',  full: 'Durability' },

  { key: 'ball_handle',           abbr: 'BHD',  full: 'Ball Handle',           catStart: true },
  { key: 'speed_with_ball',       abbr: 'SWB',  full: 'Speed With Ball' },
  { key: 'pass_accuracy',         abbr: 'PACC', full: 'Pass Accuracy' },
  { key: 'pass_vision',           abbr: 'PVIS', full: 'Pass Vision' },
  { key: 'pass_iq',               abbr: 'PIQ',  full: 'Pass IQ' },

  { key: 'block',                 abbr: 'BLK',  full: 'Block',                 catStart: true },
  { key: 'steal',                 abbr: 'STL',  full: 'Steal' },
  { key: 'pass_perception',       abbr: 'PPER', full: 'Pass Perception' },
  { key: 'interior_defense',      abbr: 'IDEF', full: 'Interior Defense' },
  { key: 'perimeter_defense',     abbr: 'PDEF', full: 'Perimeter Defense' },
  { key: 'defensive_consistency', abbr: 'DCON', full: 'Defensive Consistency' },
  { key: 'help_defense_iq',       abbr: 'HDIQ', full: 'Help Defense IQ' },
  { key: 'defensive_rebound',     abbr: 'DREB', full: 'Defensive Rebound' },
  { key: 'offensive_rebound',     abbr: 'OREB', full: 'Offensive Rebound' },

  { key: 'intangibles',           abbr: 'INT',  full: 'Intangibles',           catStart: true },
];
const RATING_HEAT_MIN = 25, RATING_HEAT_MAX = 99;

// Roster table's Stats mode: per-game averages from each player's most
// recent season on record (any team), looked up by computeLatestSeasonBySlug.
const STATS_COLS = [
  { key: '_statSeason', label: 'Season', cls: 'muted' },
  { key: '_statG',      label: 'G',      cls: 'right' },
  { key: '_statMpg',    label: 'MPG',    cls: 'right muted' },
  { key: '_statPpg',    label: 'PPG',    cls: 'right' },
  { key: '_statRpg',    label: 'RPG',    cls: 'right' },
  { key: '_statApg',    label: 'APG',    cls: 'right' },
  { key: '_statSpg',    label: 'SPG',    cls: 'right muted' },
  { key: '_statBpg',    label: 'BPG',    cls: 'right muted' },
  { key: '_stat3pmpg',  label: '3PM/G',  cls: 'right muted' },
  { key: '_statGmscpg', label: 'GMSC/G', cls: 'right' },
];

function computeRatingFields(attrSnap) {
  const attrs = (attrSnap && attrSnap.attributes) || {};
  const fields = {};
  RATING_ATTR_COLUMNS.forEach(c => {
    const v = parseFloat(attrs[c.key]);
    fields[`_attr_${c.key}`] = isNaN(v) ? null : Math.round(v);
  });
  return fields;
}

// Whether a roster row actually plays for the team (and so should count
// toward roster-wide attribute totals) as opposed to being a pure cap
// placeholder — a bare UFA/RFA hold (no real salary this season) or a dead-cap
// line. Two-way/draft-rights rows do count; they're real players.
function isAttrCountedRow(row, biosData, season) {
  if (!row.SLUG) return false;
  const bio = biosData[row.SLUG] || {};
  const type = row.TYPE || bio.type || '';
  if (type === 'dead') return false;
  // A UFA/RFA cap-hold type means this is a bare hold, not a real roster
  // spot — even though it carries a nominal $ figure (same convention as
  // real FA holds elsewhere on the page), it doesn't count as a player.
  const capType = (bio.cap_holds || {})[season];
  if (capType === 'UFA' || capType === 'RFA') return false;
  return true;
}

// Sum of each RATING_ATTR_COLUMNS attribute across a specific set of rows —
// the caller decides which rows belong (the whole countable roster, or just
// its top N by OVR).
function sumAttrsForRows(rows, attributesData) {
  const totals = {};
  RATING_ATTR_COLUMNS.forEach(c => { totals[c.key] = 0; });
  rows.forEach(row => {
    const attrs = (attributesData[row.SLUG] && attributesData[row.SLUG].attributes) || {};
    RATING_ATTR_COLUMNS.forEach(c => {
      const v = parseFloat(attrs[c.key]);
      if (!isNaN(v)) totals[c.key] += v;
    });
  });
  return totals;
}

// Countable rows (cap holds/dead cap excluded), highest OVR first — the
// ordering a "top N players" cut is taken from.
function countableRowsByOvr(rows, biosData, currentOvr, season) {
  return rows
    .filter(row => isAttrCountedRow(row, biosData, season))
    .slice()
    .sort((a, b) => (parseFloat(currentOvr[b.SLUG]) || 0) - (parseFloat(currentOvr[a.SLUG]) || 0));
}

// Attribute totals for the whole countable roster, plus its top 5/8/10 by
// OVR — used to diff a real roster against a What-If Mode hypothetical one.
function computeAttrTotals(rows, biosData, attributesData, currentOvr, season) {
  const sorted = countableRowsByOvr(rows, biosData, currentOvr, season);
  return {
    all:   sumAttrsForRows(sorted, attributesData),
    top5:  sumAttrsForRows(sorted.slice(0, 5), attributesData),
    top8:  sumAttrsForRows(sorted.slice(0, 8), attributesData),
    top10: sumAttrsForRows(sorted.slice(0, 10), attributesData),
  };
}

function computeStatFields(seasonRow) {
  if (!seasonRow) {
    return { _statSeason: '—', _statG: '—', _statMpg: '—', _statPpg: '—', _statRpg: '—', _statApg: '—', _statSpg: '—', _statBpg: '—', _stat3pmpg: '—', _statGmscpg: '—' };
  }
  const g = Math.max(1, parseInt(seasonRow.G) || 1);
  const pg = k => Math.round((parseFloat(seasonRow[k]) || 0) / g * 10) / 10;
  return {
    _statSeason: seasonRow.SEASON || '—',
    _statG:      seasonRow.G ?? '0',
    _statMpg:    pg('MIN'),
    _statPpg:    pg('PTS'),
    _statRpg:    pg('REB'),
    _statApg:    pg('AST'),
    _statSpg:    pg('STL'),
    _statBpg:    pg('BLK'),
    _stat3pmpg:  pg('3PM'),
    _statGmscpg: pg('GMSC'),
  };
}

// CONTRACT_TAGS, compactMoney and summarizeContract all moved to /contract.js
// so /pdc and /transactions render the same shorthand from the same code rather
// than from three copies of the same grammar. The roster row's `_salaries` /
// `_cap_holds` are adapted to the shared `{salaries, cap_holds}` shape at the
// call site in buildRosterTable.

// Roster table for a team page. `mode` selects which columns follow Player /
// Pos / Age / OVR: 'contracts' (default) shows salary years, 'stats' shows
// per-game averages from the player's latest season, 'ratings' shows every
// individual 2K attribute, and 'depth' reorders the rows into a starting five
// plus bench (see computeStartingFive). `latestSeasonBySlug` comes from
// computeLatestSeasonBySlug(allSeasons), computed once at page load.
function buildRosterTable(rows, biosData, capLevels, currentOvr = {}, deadCapRows = [], seasonStates = {}, attributesData = {}, mode = 'contracts', latestSeasonBySlug = {}, rowActions = null) {
  if (!rows.length) return null;
  const curYr = currentSeasonYr();
  const hasSlug = 'SLUG' in rows[0] && !('PLAYER' in rows[0]);

  if (!hasSlug) {
    // ── Legacy format: CSV has PLAYER, POS, AGE, TYPE, CAP_HOLDS, salary cols ──
    const salaryKeys = Object.keys(rows[0]).filter(k => /^\d{2}-\d{2}$/.test(k) && k >= curYr);
    const ovrMin = 60, ovrMax = 99;

    const cols = [
      { key: 'PLAYER', label: 'Player',   cls: 'bold',         },
      { key: 'POS',    label: 'Pos',      cls: 'muted center', },
      { key: 'AGE',    label: 'Age',      cls: 'center',       },
      { key: 'OVR',    label: 'OVR',      cls: 'center bold',  },
      ...salaryKeys.map((k, i) => ({
        key: k, label: k, cls: 'right' + (i === 0 ? ' div-left' : ''),
        display: r => formatSalary(r[k]),
      })),
    ];

    const typeOrder = { player: 0, 'two-way': 1, 'draft-rights': 2, dead: 3 };
    const sorted = [...rows].sort((a, b) => {
      const ta = typeOrder[a.TYPE] ?? 4, tb = typeOrder[b.TYPE] ?? 4;
      if (ta !== tb) return ta - tb;
      return (parseFloat(b.OVR) || 0) - (parseFloat(a.OVR) || 0);
    });

    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    cols.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.cls?.includes('right')) th.classList.add('right');
      if (col.cls?.includes('center')) th.classList.add('center');
      hr.appendChild(th);
    });

    const tbody = table.createTBody();
    let lastType = null;
    const LABELS = { 'two-way': 'Two-Way Contracts', 'draft-rights': 'Draft Rights', dead: 'Dead Cap' };

    sorted.forEach(row => {
      if (row.TYPE !== lastType && LABELS[row.TYPE]) {
        const sep = tbody.insertRow();
        sep.className = 'subheader';
        const td = sep.insertCell();
        td.colSpan = cols.length;
        td.textContent = LABELS[row.TYPE];
        lastType = row.TYPE;
      } else if (row.TYPE !== lastType) {
        lastType = row.TYPE;
      }

      const tr = tbody.insertRow();
      if (row.TYPE === 'two-way')      tr.className = 'row-twoway';
      if (row.TYPE === 'draft-rights') tr.className = 'row-draft-rights';
      if (row.TYPE === 'dead')         tr.className = 'row-dead';

      const capMap = parseCapHolds(row.CAP_HOLDS);

      cols.forEach(col => {
        const td = tr.insertCell();
        col.cls?.split(' ').forEach(c => c && td.classList.add(c));

        if (col.key === 'PLAYER') {
          const a = document.createElement('a');
          a.href = `/players/?p=${playerSlug(row.PLAYER)}`;
          a.textContent = row.PLAYER;
          td.appendChild(a);
        } else if (col.key === 'OVR') {
          const n = parseFloat(row.OVR);
          td.textContent = isNaN(n) ? '—' : String(n);
          if (!isNaN(n)) {
            const t = Math.min(1, Math.max(0, (n - ovrMin) / (ovrMax - ovrMin)));
            const hue = Math.round(t * 120);
            td.style.background = `hsl(${hue}, 55%, 18%)`;
            td.style.color = `hsl(${hue}, 80%, 72%)`;
            const ovrSlug = playerSlug(row.PLAYER);
            if (ovrSlug && window.RatingsPopup) {
              RatingsPopup.attach(td, ovrSlug, { name: row.PLAYER });
            }
          }
        } else if (/^\d{2}-\d{2}$/.test(col.key)) {
          td.textContent = col.display ? col.display(row) : (row[col.key] || '—');
          const capType = capMap[col.key];
          if (capType && CAP_HOLD_CSS[capType]) td.classList.add(CAP_HOLD_CSS[capType]);
        } else if (col.display) {
          td.textContent = col.display(row);
        } else {
          td.textContent = row[col.key] ?? '—';
        }
      });
    });

    const hasCapData = rows.some(r => r.CAP_HOLDS && r.CAP_HOLDS.trim() !== '');
    if (!hasCapData) return table;

    const allTypes = new Set();
    rows.forEach(r => {
      Object.values(parseCapHolds(r.CAP_HOLDS || '')).forEach(t => allTypes.add(t));
    });

    const legend = document.createElement('div');
    legend.className = 'cap-legend';
    ['PLAYER_OPT', 'TEAM_OPT', 'UFA', 'RFA', 'NON_GTD'].forEach(type => {
      if (!allTypes.has(type)) return;
      const item = document.createElement('span');
      item.className = 'cap-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'cap-swatch';
      swatch.style.background = SWATCH_COLORS[type];
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(CAP_HOLD_LABELS[type]));
      legend.appendChild(item);
    });

    const legacyWrap = document.createElement('div');
    legacyWrap.appendChild(table);
    legacyWrap.appendChild(legend);
    return legacyWrap;
  }

  // ── New format: SLUG + TYPE, OVR from currentOvr, rest from biosData ────────
  biosData = biosData || {};

  const attrBadgeCutoffs = computeAttrBadgeCutoffs(attributesData);

  const augmented = rows
    .map(row => {
      const bio = biosData[row.SLUG] || {};
      const _type = row.TYPE || bio.type || '';
      return {
        SLUG:       row.SLUG,
        OVR:        currentOvr[row.SLUG] ?? '',
        _name:      displayNameFromBio(bio.name || '') || row.SLUG || '—',
        _pos:       (bio.pos || []).join(' · ') || '—',
        _posList:   bio.pos || [],
        _age:       calcAge(bio.dob),
        _type,
        _cap_holds:          bio.cap_holds || {},
        _salaries:           bio.salaries || {},
        _guaranteed:         bio.guaranteed || {},
        _guarantee_dates:    bio.guarantee_dates || {},
        _guarantee_schedule: bio.guarantee_schedule || {},
        _badges:             computeAttrBadges((attributesData || {})[row.SLUG], attrBadgeCutoffs),
        _photo:              bio.photo_url || '',
        _notes:              bio.notes || '',
        ...computeStatFields(latestSeasonBySlug[row.SLUG]),
        ...computeRatingFields((attributesData || {})[row.SLUG]),
      };
    });

  deadCapRows.forEach(row => {
    const bio = biosData[row.SLUG] || {};
    const dcSals = {};
    Object.keys(row).forEach(k => { if (/^\d{2}-\d{2}$/.test(k) && row[k] && k >= curYr) dcSals[k] = row[k]; });
    if (!Object.keys(dcSals).length) return; // dead cap fully in the past — keep the record, just stop showing the row
    augmented.push({
      SLUG:       row.SLUG,
      OVR:        '',
      _name:      displayNameFromBio(bio.name || '') || row.SLUG || '—',
      _pos:       (bio.pos || []).join(' · ') || '—',
      _posList:   bio.pos || [],
      _age:       calcAge(bio.dob),
      _type:      'dead',
      _cap_holds: {},
      _salaries:  dcSals,
      _badges:    [],
      _photo:     bio.photo_url || '',
      _notes:     bio.notes || '',
      ...computeStatFields(latestSeasonBySlug[row.SLUG]),
      ...computeRatingFields((attributesData || {})[row.SLUG]),
    });
  });

  // Empty Roster Charge rows (§ 2.1a) — virtual, never persisted to the roster
  // CSV. Recomputed live from the real roster count every render, so they
  // appear/disappear on their own as the team crosses the 14-player line;
  // no explicit transaction ever creates or removes one.
  const erc = computeEmptyRosterCharge(rows, biosData, capLevels, curYr);
  for (let i = 0; i < erc.deficiency && erc.rookieMin; i++) {
    augmented.push({
      SLUG:       '',
      OVR:        '',
      _name:      'Empty Roster Charge',
      _pos:       '—',
      _posList:   [],
      _age:       '',
      _type:      'player',
      _erc:       true,
      _cap_holds: {},
      _salaries:  { [curYr]: erc.rookieMin },
      _badges:    [],
      _photo:     '',
      _notes:     '',
    });
  }

  const salaryKeySet = new Set();
  augmented.forEach(a => {
    Object.keys(a._salaries).forEach(k => { if (k >= curYr) salaryKeySet.add(k); });
  });
  const salaryKeys = [...salaryKeySet].sort();
  augmented.forEach(a => {
    salaryKeys.forEach(k => { a[`_s_${k}`] = a._salaries[k] || ''; });
  });

  const ovrMin = 60, ovrMax = 100;

  const hasAnyBadges = augmented.some(a => a._badges && a._badges.length);

  const sharedCols = [
    { key: '_name',   label: 'Player', cls: 'bold' },
    { key: '_pos',    label: 'Pos',    cls: 'muted center' },
    { key: '_age',    label: 'Age',    cls: 'center' },
    { key: 'OVR',     label: 'OVR',    cls: 'center bold' },
  ];
  let modeCols;
  if (mode === 'stats') {
    modeCols = STATS_COLS.map((c, i) => ({ ...c, cls: c.cls + (i === 0 ? ' div-left' : '') }));
  } else if (mode === 'ratings') {
    modeCols = RATING_ATTR_COLUMNS.map(c => ({
      key: `_attr_${c.key}`, label: c.abbr, full: c.full, cls: 'right' + (c.catStart ? ' div-left' : ''),
    }));
  } else if (mode === 'depth') {
    modeCols = [{ key: '_contract', label: 'Contract', cls: 'right nosum div-left' }];
  } else {
    modeCols = salaryKeys.map((k, i) => ({
      key: `_s_${k}`, label: k, cls: 'right' + (i === 0 ? ' div-left' : ''),
    }));
  }
  const cols = [
    ...(mode === 'depth' ? [{ key: '_slot', label: '', cls: 'depth-slot center' }] : []),
    ...sharedCols,
    ...modeCols,
  ];

  const typeOrder = { player: 0, 'two-way': 1, 'draft-rights': 2, dead: 3 };
  const byOvrDesc = (a, b) => (parseFloat(b.OVR) || 0) - (parseFloat(a.OVR) || 0);

  // Row order and the subheaders that break it up. Every mode but 'depth'
  // groups by contract type; 'depth' splits the standard players into a
  // starting five and a bench, then falls back to the type groups for the rest.
  let sorted, GROUP_LABELS;
  if (mode === 'depth') {
    const starterPool = augmented.filter(a => a._type === 'player' && !a._erc);
    const five = computeStartingFive(starterPool);
    const started = new Set(five.filter(Boolean));

    const starterRows = five.map((p, i) => {
      const slot = DEPTH_SLOTS[i];
      if (p) return { ...p, _slot: slot, _group: 'starters' };
      return {
        SLUG: '', OVR: '', _name: `No eligible ${slot}`, _pos: '—', _posList: [],
        _age: '', _type: 'player', _slot: slot, _group: 'starters', _emptySlot: true,
        _cap_holds: {}, _salaries: {}, _badges: [], _photo: '', _notes: '',
      };
    });
    const bench = starterPool.filter(a => !started.has(a)).sort(byOvrDesc)
      .map(a => ({ ...a, _group: 'bench' }));
    const rest = augmented.filter(a => a._type !== 'player' || a._erc)
      .sort((a, b) => (typeOrder[a._type] ?? 4) - (typeOrder[b._type] ?? 4) || byOvrDesc(a, b))
      .map(a => ({ ...a, _group: a._type }));

    sorted = [...starterRows, ...bench, ...rest];
    GROUP_LABELS = {
      starters: 'Starters', bench: 'Bench',
      'two-way': 'Two-Way Contracts', 'draft-rights': 'Draft Rights', dead: 'Dead Cap',
    };
  } else {
    // Rows stay the original objects here — what-if's rowActions is handed them.
    sorted = [...augmented]
      .sort((a, b) => (typeOrder[a._type] ?? 4) - (typeOrder[b._type] ?? 4) || byOvrDesc(a, b));
    GROUP_LABELS = { 'two-way': 'Two-Way Contracts', 'draft-rights': 'Draft Rights', dead: 'Dead Cap' };
  }
  const groupOf = row => (mode === 'depth' ? row._group : row._type);

  const table = document.createElement('table');
  const thead = table.createTHead();
  const hr = thead.insertRow();
  cols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    if (col.cls?.includes('right')) th.classList.add('right');
    if (col.cls?.includes('center')) th.classList.add('center');
    if (col.full) attachTooltip(th, col.full);
    hr.appendChild(th);
  });
  if (rowActions) hr.appendChild(document.createElement('th'));

  const tbody = table.createTBody();
  let lastGroup = null;

  sorted.forEach(row => {
    const group = groupOf(row);
    if (group !== lastGroup && GROUP_LABELS[group]) {
      const sep = tbody.insertRow();
      sep.className = 'subheader';
      const td = sep.insertCell();
      td.colSpan = cols.length + (rowActions ? 1 : 0);
      td.textContent = GROUP_LABELS[group];
      lastGroup = group;
    } else if (group !== lastGroup) {
      lastGroup = group;
    }

    const tr = tbody.insertRow();
    if (row._type === 'two-way')      tr.className = 'row-twoway';
    if (row._type === 'draft-rights') tr.className = 'row-draft-rights';
    if (row._type === 'dead')         tr.className = 'row-dead';
    if (row._erc)                     tr.className = 'row-erc';
    if (row._emptySlot)               tr.className = 'row-empty-slot';

    const capMap = parseCapHolds(row._cap_holds);

    cols.forEach(col => {
      const td = tr.insertCell();
      col.cls?.split(' ').forEach(c => c && td.classList.add(c));

      if (col.key === '_slot') {
        td.textContent = row._slot || '';
      } else if (col.key === '_contract') {
        td.textContent = row._emptySlot ? ''
          : summarizeContract({ salaries: row._salaries, cap_holds: row._cap_holds }, curYr);
      } else if (row._emptySlot) {
        td.textContent = col.key === '_name' ? row._name : '';
      } else if (col.key === '_name') {
        const cell = document.createElement('span');
        cell.className = 'roster-name-cell';

        const topRow = document.createElement('span');
        topRow.className = 'roster-name-top';

        const avatar = document.createElement('span');
        avatar.className = 'roster-avatar';
        if (row._photo) {
          const img = document.createElement('img');
          img.src = row._photo;
          img.alt = '';
          img.loading = 'lazy';
          img.onerror = () => { avatar.classList.add('roster-avatar-empty'); img.remove(); };
          avatar.appendChild(img);
        } else {
          avatar.classList.add('roster-avatar-empty');
        }
        topRow.appendChild(avatar);

        if (row.SLUG && !row.SLUG.startsWith(WHATIF_CUSTOM_PREFIX)) {
          const a = document.createElement('a');
          a.href = `/players/?p=${row.SLUG}`;
          a.textContent = row._name;
          topRow.appendChild(a);
        } else {
          topRow.appendChild(document.createTextNode(row._name));
        }

        if (row._badges && row._badges.length) {
          const badgeGroup = document.createElement('span');
          badgeGroup.className = 'attr-badges';
          row._badges.forEach(b => {
            const badge = document.createElement('span');
            badge.className = 'attr-badge' + (b.elite ? ' attr-badge-elite' : '');
            badge.textContent = b.label;
            attachTooltip(badge, `${b.full} (${Math.round(b.value)})`);
            badgeGroup.appendChild(badge);
          });
          topRow.appendChild(badgeGroup);
        }

        cell.appendChild(topRow);

        td.appendChild(cell);
        if (row._notes) {
          const pip = document.createElement('span');
          pip.className = 'player-note';
          pip.innerHTML = '<svg width="9" height="11" viewBox="0 0 9 11" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="8" height="10" rx="1" stroke="currentColor"/><line x1="2" y1="3.5" x2="7" y2="3.5" stroke="currentColor"/><line x1="2" y1="5.5" x2="7" y2="5.5" stroke="currentColor"/><line x1="2" y1="7.5" x2="5" y2="7.5" stroke="currentColor"/></svg>';
          attachTooltip(pip, row._notes);
          topRow.appendChild(pip);
        }
      } else if (col.key === 'OVR') {
        const n = parseFloat(row.OVR);
        td.textContent = isNaN(n) ? '—' : String(n);
        if (!isNaN(n)) {
          const t = Math.min(1, Math.max(0, (n - ovrMin) / (ovrMax - ovrMin)));
          const hue = Math.round(t * 120);
          td.style.background = `hsl(${hue}, 55%, 18%)`;
          td.style.color = `hsl(${hue}, 80%, 72%)`;
          if (row.SLUG && window.RatingsPopup) {
            RatingsPopup.attach(td, row.SLUG, { name: row._name });
          }
        }
      } else if (col.key.startsWith('_attr_')) {
        const v = row[col.key];
        if (v == null) {
          td.textContent = '—';
        } else {
          td.textContent = String(v);
          const t = Math.min(1, Math.max(0, (v - RATING_HEAT_MIN) / (RATING_HEAT_MAX - RATING_HEAT_MIN)));
          const hue = Math.round(t * 120);
          td.style.background = `hsl(${hue}, 55%, 18%)`;
          td.style.color = `hsl(${hue}, 80%, 72%)`;
        }
      } else if (col.key.startsWith('_s_')) {
        const k = col.key.slice(3);
        const capType = capMap[k];
        if (capType === 'NON_GTD' && row[col.key]) {
          const tipText = buildNonGtdTip(k, row._guaranteed, row._guarantee_dates, row._guarantee_schedule);
          const wrap = document.createElement('span');
          wrap.className = 'sal-tip';
          wrap.textContent = formatSalary(row[col.key]);
          attachTooltip(wrap, tipText);
          td.appendChild(wrap);
        } else {
          td.textContent = formatSalary(row[col.key]);
        }
        if (capType && CAP_HOLD_CSS[capType]) td.classList.add(CAP_HOLD_CSS[capType]);
      } else {
        td.textContent = row[col.key] ?? '—';
      }
    });

    if (rowActions) {
      const actionsTd = tr.insertCell();
      actionsTd.className = 'whatif-actions-cell';
      rowActions(row, actionsTd, capMap);
    }
  });

  // ── Salary tfoot ─────────────────────────────────────────────────────────────
  if (mode === 'contracts' && salaryKeys.length) {
    const BUCKET_ORDER = ['Guaranteed', 'Player Option', 'Team Option', 'Non-Guaranteed', 'Two-Way', 'Dead Cap', 'UFA Hold', 'RFA Hold'];
    const nonSalCols = cols.length - salaryKeys.length;

    // per-year per-bucket totals
    const totals = {};
    BUCKET_ORDER.forEach(b => { totals[b] = {}; salaryKeys.forEach(k => { totals[b][k] = { amt: 0, count: 0 }; }); });
    const grandTotals = {};
    // Apron/hard-cap comparisons exclude pure UFA/RFA holds (§ 1.3/1.4) — same
    // convention as computeMleType/computeCapSummary; the plain Salary Cap row
    // below still uses the hold-inclusive grandTotals.
    const grandTotalsExHolds = {};
    salaryKeys.forEach(k => { grandTotals[k] = 0; grandTotalsExHolds[k] = 0; });

    augmented.forEach(a => {
      const capMap = parseCapHolds(a._cap_holds);
      salaryKeys.forEach(k => {
        const amt = parseSalaryNum(a._salaries[k]);
        if (!amt) return;
        const holdType = capMap[k];
        let bucket;
        if (a._type === 'dead')              bucket = 'Dead Cap';
        else if (a._type === 'two-way')      bucket = 'Two-Way';
        else if (holdType === 'PLAYER_OPT')  bucket = 'Player Option';
        else if (holdType === 'TEAM_OPT')    bucket = 'Team Option';
        else if (holdType === 'NON_GTD')     bucket = 'Non-Guaranteed';
        else if (holdType === 'UFA')         bucket = 'UFA Hold';
        else if (holdType === 'RFA')         bucket = 'RFA Hold';
        else                                 bucket = 'Guaranteed';
        totals[bucket][k].amt += amt;
        totals[bucket][k].count += 1;
        grandTotals[k] += amt;
        if (bucket !== 'UFA Hold' && bucket !== 'RFA Hold') grandTotalsExHolds[k] += amt;
      });
    });

    const anyData = salaryKeys.some(k => grandTotals[k] > 0);
    if (anyData) {
      const tfoot = table.createTFoot();

      function tfRow(cls) {
        const tr = tfoot.insertRow();
        if (cls) tr.className = cls;
        return tr;
      }
      function tfCell(tr, text, cls, colspan) {
        const td = tr.insertCell();
        td.textContent = text;
        if (cls) td.className = cls;
        if (colspan) td.colSpan = colspan;
        return td;
      }

      // bucket rows
      BUCKET_ORDER.forEach(name => {
        const hasAny = salaryKeys.some(k => totals[name][k].count > 0);
        if (!hasAny) return;
        const tr = tfRow('tfoot-bucket');
        const labelTd = tfCell(tr, name, 'tfoot-label', nonSalCols);
        if (name === 'Guaranteed') {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = 'ⓘ';
          attachTooltip(badge, 'Salary with no player/team option, non-guaranteed flag, or free-agent hold — owed regardless of roster moves.');
          labelTd.appendChild(badge);
        }
        salaryKeys.forEach(k => {
          const { amt, count } = totals[name][k];
          const td = tfCell(tr, amt ? formatSalary(amt) : '—', 'right');
          if (count) {
            const sup = document.createElement('sup');
            sup.textContent = count;
            sup.style.cssText = 'color:var(--border);font-size:0.65rem;margin-left:2px';
            td.appendChild(sup);
          }
        });
      });

      // total row
      const totalTr = tfRow('tfoot-divider tfoot-total');
      tfCell(totalTr, 'Total', 'tfoot-label', nonSalCols);
      salaryKeys.forEach(k => tfCell(totalTr, grandTotals[k] ? formatSalary(grandTotals[k]) : '—', 'right'));

      // cap level rows
      if (capLevels) {
        const capDefs = [
          { label: 'Salary Cap', key: 'cap',      exHolds: false },
          { label: '1st Apron',  key: 'apron1',   exHolds: true },
          { label: '2nd Apron',  key: 'apron2',   exHolds: true },
          { label: 'Hard Cap',   key: 'hard_cap', exHolds: true },
        ];
        capDefs.forEach(({ label, key, exHolds }) => {
          const hasCap = salaryKeys.some(k => capLevels[k]?.[key]);
          if (!hasCap) return;
          const totalsForRow = exHolds ? grandTotalsExHolds : grandTotals;
          const tr = tfRow('tfoot-cap');
          tfCell(tr, label, 'tfoot-label', nonSalCols);
          salaryKeys.forEach(k => {
            const val = capLevels[k]?.[key];
            if (!val) { tfCell(tr, '—', 'right'); return; }
            const diff = totalsForRow[k] - val;
            const over = diff > 0;
            if (over) tr.classList.add('over'); else tr.classList.add('under');
            const td = tfCell(tr, formatSalary(val), 'right');
            const diffSpan = document.createElement('span');
            diffSpan.className = 'tfoot-diff';
            diffSpan.style.cssText = 'display:block;font-size:0.7rem;margin-top:0.1rem';
            diffSpan.textContent = over
              ? `+${formatSalary(diff)}`
              : `-${formatSalary(Math.abs(diff))}`;
            td.appendChild(diffSpan);
          });
        });
      }

      // per-season hard-cap status row
      const anyHardCap = salaryKeys.some(k => seasonStates[k]?.hard_cap);
      if (anyHardCap) {
        const tr = tfRow('tfoot-cap tfoot-hardcap');
        tfCell(tr, 'Hard-Capped', 'tfoot-label', nonSalCols);
        salaryKeys.forEach(k => {
          const hc = seasonStates[k]?.hard_cap;
          if (!hc) { tfCell(tr, '—', 'right'); return; }
          const td = tr.insertCell();
          td.className = 'right';
          const chip = document.createElement('span');
          chip.className = 'hardcap-chip' + (hc === 'second_apron' ? ' apron2' : '');
          chip.textContent = hc === 'second_apron' ? '2nd Apron' : '1st Apron';
          const reason = seasonStates[k]?.hard_cap_reason;
          if (reason) attachTooltip(chip, reason);
          td.appendChild(chip);
        });
      }
    }
  }

  const allCapTypes = new Set();
  augmented.forEach(a => {
    Object.values(parseCapHolds(a._cap_holds || '')).forEach(t => allCapTypes.add(t));
  });
  const hasCapData = mode === 'contracts' && augmented.some(a => Object.keys(a._cap_holds || {}).length > 0);
  if (!hasCapData && !hasAnyBadges) return table;

  const wrap = document.createElement('div');
  wrap.appendChild(table);

  if (hasCapData) {
    const legend = document.createElement('div');
    legend.className = 'cap-legend';
    ['PLAYER_OPT', 'TEAM_OPT', 'UFA', 'RFA', 'NON_GTD'].forEach(type => {
      if (!allCapTypes.has(type)) return;
      const item = document.createElement('span');
      item.className = 'cap-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'cap-swatch';
      swatch.style.background = SWATCH_COLORS[type];
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(CAP_HOLD_LABELS[type]));
      legend.appendChild(item);
    });
    wrap.appendChild(legend);
  }

  if (hasAnyBadges) {
    const attrLegend = document.createElement('div');
    attrLegend.className = 'cap-legend attr-legend';
    ATTR_BADGE_GROUPS.forEach(group => {
      const item = document.createElement('span');
      item.className = 'cap-legend-item';
      const badge = document.createElement('span');
      badge.className = 'attr-badge attr-badge-legend';
      badge.textContent = group.label;
      item.appendChild(badge);
      item.appendChild(document.createTextNode(group.full));
      attrLegend.appendChild(item);
    });
    const note = document.createElement('span');
    note.className = 'attr-legend-note';
    note.textContent = 'top 10% of rostered players in that category, league-wide (outlined = top 5%)';
    attrLegend.appendChild(note);
    wrap.appendChild(attrLegend);
  }

  return wrap;
}

// Cache of resolved "{date}: {description}" strings for GET /api/transactions/{id},
// keyed by txn id, shared across every picks table on the page.
const _txnDescCache = new Map();
async function _fetchTxnDesc(id) {
  if (_txnDescCache.has(id)) return _txnDescCache.get(id);
  _txnDescCache.set(id, null);
  try {
    const res = await fetch(`/api/transactions/${id}`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    _txnDescCache.set(id, `${data.date}: ${data.description}`);
  } catch {
    // leave cached as null (not found / not yet backfilled) — tooltip falls back
  }
}

// Contingent picks (protected/swap/binary chain) carry a `leaves` array from
// GET /api/picks describing every possible final owner, each optionally tagged
// with the real trade(s) that created that leg. Builds the tooltip text for
// the pick's Team cell so "Owner TBD" isn't a dead end for the reader.
function buildLeavesTooltip(p) {
  const uniq = [];
  const seen = new Set();
  (p.leaves || []).forEach(l => (l.txn_ids || []).forEach(t => {
    if (!seen.has(t.id)) { seen.add(t.id); uniq.push(t); }
  }));
  uniq.sort((a, b) => a.date.localeCompare(b.date));
  const body = uniq.length
    ? uniq.map(t => _txnDescCache.get(t.id) || `${t.date}: (loading…)`).join('\n\n')
    : 'Originating trade(s) not yet linked.';
  const rnd = p.round === 1 ? '1st' : '2nd';
  const header = p._groupOrigs && p._groupOrigs.length > 1
    ? `One ${rnd} conveys here — originally ${p._groupOrigs.join('/')}'s own pick, exact origin TBD.\n\n`
    : '';
  return header + body;
}

// A swap group / binary chain spans N distinct real picks (one per member
// team). In every case checked live (2026-07-19 audit: 0 of 19 groups), a team
// occupies at most one leaf of the shared `leaves` list, so it ends up with
// exactly one of the N — showing all N as separate rows on one team's page
// overstates that team's haul, hence the collapse below. But the model does
// NOT guarantee that (a swap priority list or nested leaf could in principle
// assign the same team twice), so this checks actual leaf occupancy per group
// rather than assuming it: only collapses down to `myCount` rows when this
// team's own leaf count for the group is <= 1. If a team ever does occupy 2+
// leaves of the same group, this leaves all N member rows un-collapsed rather
// than guessing which ones to hide — never drop a real claim to keep the
// display tidy.
function dedupeByGroup(rows, teamAbbr) {
  const groups = new Map();
  const out = [];
  rows.forEach(p => {
    if (!p.group_id) { out.push(p); return; }
    if (!groups.has(p.group_id)) groups.set(p.group_id, []);
    groups.get(p.group_id).push(p);
  });
  groups.forEach(members => {
    const leaves = members[0].leaves || [];
    const myLeafCount = leaves.filter(l => l.team === teamAbbr).length;
    if (myLeafCount > 1) {
      out.push(...members);   // ambiguous which of the N is "ours" -- show them all
      return;
    }
    const rep = members.find(p => p.orig === teamAbbr) || members[0];
    rep._groupOrigs = [...new Set(members.map(p => p.orig))].sort();
    out.push(rep);
  });
  return out;
}

// The flat `swap_owner` field is just "the other pick's ORIG team" for a
// 2-member swap group — accurate but reads like that team holds a right
// over THIS pick, when the real right-holder is whoever's first in the
// group's priority order (often a third team, e.g. BOS holding the swap
// right over OKC's and DEN's own picks — `swap_owner: DEN` on OKC's own row
// badly misreads as "DEN has swap rights"). `leaves` already carries the
// real, self-describing priority order ("swap priority (better pick)" /
// "(worse pick)"), so build the column from that instead of the raw field.
function formatSwapLeaves(p) {
  const swapLeaves = (p.leaves || []).filter(l => (l.description || '').startsWith('swap priority'));
  if (!swapLeaves.length) return '';
  return swapLeaves.map(l => {
    const m = l.description.match(/\(([^)]+)\)/);
    const label = m ? m[1].replace(/ pick$/, '') : '';
    return label ? `${l.team} (${label})` : l.team;
  }).join(' · ');
}

// The flat `protected` column only ever holds a single from-1 threshold — a
// multi-team band split (e.g. the pick conveys to one team across positions
// 31-50 and a different team across 51-60) has no single number to put there,
// so `p.protected` comes back null even though the pick is very much
// protected. Fall back to the real per-band leaves so that case isn't just
// blank (mirrors formatSwapLeaves' approach for the Swap column).
function formatProtectedLeaves(p) {
  const protLeaves = (p.leaves || []).filter(l => (l.description || '').startsWith('protected band'));
  if (!protLeaves.length) return '';
  return protLeaves.map(l => {
    const m = l.description.match(/protected band (\d+-\d+)/);
    return m ? `${l.team} (${m[1]})` : l.team;
  }).join(' · ');
}

// Historical NOTES rows in the flat CSV predate the conveyance model and
// carry a leftover one-word marker ("protected") or a stale
// "conditional: X/Y" string for picks that have since been fully modeled as
// real structure (`leaves` non-empty) — now redundant with, and sometimes
// flatly contradicted by, the Protection/Swap columns (e.g. a `swap`-type
// pick whose NOTES still says "protected"). Only suppress those two known
// stale shapes, and only once the pick actually has modeled structure to
// stand in for them — anything else in NOTES (genuine prose, a real
// unmigrated pick with no structure yet) is left exactly as-is.
function cleanNotes(p) {
  const notes = (p.notes || '').trim();
  const hasStructure = (p.leaves || []).length > 0;
  if (hasStructure && (notes === 'protected' || /^conditional:/i.test(notes))) return '';
  return notes;
}

// Identity vs. ownership are two different facts about a pick and used to be
// crammed into one "Team" cell with kind-dependent formatting ("from DET",
// "DET | OKC | BKN", "DET → DET | OKC | BKN", ...) — every prior fix in this
// area (the arrow-prefix hack, `_groupOrigs`) was patching that same
// conflation one shape at a time. Split into two columns instead: **Orig**
// (whose draft slot this is — immutable, never changes; same name as the
// picks-edit grid's read-only "Orig" column a few hundred lines down, and
// the `orig` field itself — don't reintroduce a second name for this) and
// **Owner** (who currently has a real claim on it — can be contingent).
// Every kind reads from the same two functions; only `legacy` overrides
// Owner, to flag that its nominal owner isn't fully trusted (see below).
//
// A swap/binary-chain group can collapse two or more PHYSICALLY DISTINCT
// picks (e.g. DEN's own natural 1st and OKC's own natural 1st) into one
// displayed row (dedupeByGroup, above) — `_groupOrigs` (set only when a group
// was actually collapsed) carries the ORIGINAL orig team(s) for that case;
// a single-pick row just uses its own `orig`.
function origCell(p, teamAbbr) {
  if (p._groupOrigs && p._groupOrigs.length > 1) return p._groupOrigs.join('/');
  return p.orig === teamAbbr ? 'Own' : p.orig;
}

function ownerCell(p) {
  return p.owner === '?' ? '?' : p.owner.split('|').join(' | ');
}

const PICK_KIND_DISPLAY = {
  own:       { cls: null },
  uncertain: { cls: 'picks-uncertain' },
  acquired:  { cls: 'picks-acquired' },
  traded:    { cls: 'picks-traded',   ownerCell: p => `to ${p.owner}` },
  // A `legacy` pick is a real historical deal too tangled to model
  // structurally — its flat owner/orig look exactly like a plain settled
  // pick (single team, nothing flagged), but the real terms live only in
  // its notes prose and can name entirely different teams (e.g. OKC's own
  // 2027 1st shows owner "OKC" while its notes say Phoenix and the Clippers
  // are the real parties). Without a distinct marker this silently renders as
  // a confident, trustworthy owner — same failure shape the Swap-column fix
  // addressed, just for a different node type.
  legacy:    { cls: 'picks-legacy',   ownerCell: p => `${p.owner} · unmodeled` },
};

function buildPicksTable(picks, teamAbbr, allPicks = []) {
  // Once a pick is used, it's a historical fact that belongs in Draft
  // History, not this panel — this panel is only future picks still up in
  // the air (no player attached yet).
  const notDrafted = p => !p.player;
  // A pick whose owner/leaves look like a plain settled fact can still carry
  // a real contingent claim for THIS team via `ladder_fallback_of` — server
  // now includes such picks in this team's list (2026-07-23 fix), but the
  // `owner` field itself is untouched (still names the actual current
  // holder, e.g. "OKC"), so without this check it would wrongly land in the
  // confident "Acquired" bucket below instead of "Uncertain owner".
  const isFallbackClaim = p => !!(p.ladder_fallback_of && p.ladder_fallback_of.to === teamAbbr);
  const isTBD      = p => p.owner === '?' || p.owner.includes('|') || isFallbackClaim(p);
  const isLegacy   = p => !!p.legacy;

  const tag = (arr, kind) => arr.map(p => ({ ...p, _kind: kind }));
  const legacy    = tag(picks.filter(p => notDrafted(p) && isLegacy(p)
                        && (p.orig === teamAbbr || p.owner === teamAbbr)), 'legacy');
  const own       = tag(picks.filter(p => notDrafted(p) && !isLegacy(p) && p.orig === teamAbbr && p.owner === teamAbbr), 'own');
  const uncertain = tag(dedupeByGroup(picks.filter(p => notDrafted(p) && !isLegacy(p) && isTBD(p)), teamAbbr), 'uncertain');
  const acquired  = tag(picks.filter(p => notDrafted(p) && !isLegacy(p) && p.orig !== teamAbbr && !isTBD(p)), 'acquired');
  // Traded-away picks aren't picks this team has — kept out of the merged,
  // sorted "picks I hold" list below and shown as its own section instead.
  const legacyTraded = tag(allPicks.filter(p => notDrafted(p) && isLegacy(p)
                           && p.orig === teamAbbr && p.owner !== teamAbbr), 'legacy');
  const traded    = [
                       ...tag(allPicks.filter(p => notDrafted(p) && !isLegacy(p)
                             && p.orig === teamAbbr && p.owner !== teamAbbr && !isTBD(p)), 'traded'),
                       ...legacyTraded,
                     ].sort((a, b) => a.year - b.year || a.round - b.round);

  const rows = [...own, ...uncertain, ...legacy, ...acquired]
    .sort((a, b) => a.year - b.year || a.round - b.round);

  if (!rows.length && !traded.length) return null;

  const stepienLocked = computeStepienLocked(picks, allPicks, teamAbbr);

  const table = document.createElement('table');
  const thead = table.createTHead();
  const hr = thead.insertRow();
  ['Year', 'Rnd', 'Orig', 'Owner', 'Protection', 'Swap', 'Frozen', 'Notes'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    if (label === 'Year' || label === 'Rnd') th.classList.add('right');
    if (label === 'Orig' || label === 'Owner') th.classList.add('center');
    if (label !== 'Year' && label !== 'Rnd') th.classList.add('muted');
    hr.appendChild(th);
  });

  const tbody = table.createTBody();

  const renderRow = p => {
    const { cls, ownerCell: ownerCellFn } = PICK_KIND_DISPLAY[p._kind];
    const tr = tbody.insertRow();
    if (cls) tr.className = cls;

    const protLabel = p.protected != null ? `Top-${p.protected}` : formatProtectedLeaves(p);
    const isStepienLocked = p._kind !== 'traded' && stepienLocked.has(`${p.round}:${p.year}:${p.orig}`);
    const cells = [
      [String(p.year),                'right',        ],
      [p.round === 1 ? '1st' : '2nd', 'right',        ],
      [origCell(p, teamAbbr),          'muted center', ],
      [(ownerCellFn || ownerCell)(p),  'muted center', ],
      [protLabel,                      'muted',        ],
      [formatSwapLeaves(p),            'muted',        ],
      [p.legacy ? 'LEGACY' : (p.frozen ? 'FROZEN' : (isStepienLocked ? 'STEPIEN' : '')), 'muted', ],
      [cleanNotes(p),                  'muted',        ],
    ];
    cells.forEach(([text, cellCls]) => {
      const td = tr.insertCell();
      if (cellCls) cellCls.split(' ').forEach(c => td.classList.add(c));
      td.textContent = text;
    });
    // A `legacy` pick is ALWAYS frozen from re-trade by design (until someone
    // manually converts its notes into real structure) regardless of the
    // flat FROZEN column, which was never set for it — so this can't just
    // reuse the `p.frozen` check above.
    if (p.legacy) {
      const legacyTd = tr.cells[tr.cells.length - 2];
      legacyTd.style.color = 'var(--danger)';
      legacyTd.style.fontWeight = '700';
      attachTooltip(legacyTd, 'This pick predates the site\'s conveyance model and '
        + 'isn’t tracked automatically — the real terms are whatever Notes says. '
        + 'Frozen from re-trade until manually converted to real structure.');
    } else if (p.frozen) {
      const frozenTd = tr.cells[tr.cells.length - 2];
      frozenTd.style.color = 'var(--danger)';
      frozenTd.style.fontWeight = '700';
      if (p.frozen_reason) attachTooltip(frozenTd, p.frozen_reason);
    } else if (isStepienLocked) {
      const stepienTd = tr.cells[tr.cells.length - 2];
      stepienTd.style.color = 'var(--danger-alt)';
      stepienTd.style.fontWeight = '700';
      attachTooltip(stepienTd, `${teamAbbr}'s only first-round pick for ${p.year} — trading it away right `
        + 'now would leave a two-year gap with no first-round pick, violating the Stepien Rule (§ 7.2).');
    }
    if (p.leaves && p.leaves.length) {
      p.leaves.forEach(l => (l.txn_ids || []).forEach(t => _fetchTxnDesc(t.id)));
      attachTooltip(tr.cells[3], () => buildLeavesTooltip(p));
    }
  };

  rows.forEach(renderRow);

  if (traded.length) {
    const sep = tbody.insertRow();
    sep.className = 'subheader';
    const td = sep.insertCell();
    td.colSpan = 8;
    td.textContent = 'Traded Away';
    traded.forEach(renderRow);
  }

  const legend = document.createElement('div');
  legend.className = 'picks-legend';
  [
    ['Own',           null,               'var(--text-secondary)'],
    ['Acquired',      'picks-acquired',   'var(--link)'],
    ['Traded away',   'picks-traded',     'var(--text-muted)'],
    ['Uncertain owner', 'picks-uncertain', 'var(--warning)'],
    ['Legacy — unmodeled, see Notes', 'picks-legacy', 'var(--danger)'],
  ].forEach(([label, , color]) => {
    const item = document.createElement('span');
    item.className = 'picks-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'picks-swatch';
    swatch.style.background = color;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  });

  const wrap = document.createElement('div');
  wrap.appendChild(table);
  wrap.appendChild(legend);
  return wrap;
}

const SEASON_COLS = [
  { key: 'SEASON',         label: 'Season',  cls: 'bold',        sortField: 'SEASON',        defaultDir:  1 },
  { key: 'wl',             label: 'W–L',     cls: 'right',       sortField: 'PCT',           defaultDir: -1,
    display: r => `${r.W}–${r.L}` },
  { key: 'PCT',            label: 'W%',      cls: 'right muted', sortField: 'PCT',           defaultDir: -1,
    display: r => fmtPct(r.PCT) },
  { key: 'PPG',            label: 'PPG',     cls: 'right',       sortField: 'PPG',           defaultDir: -1 },
  { key: 'OPPG',           label: 'OPPG',    cls: 'right',       sortField: 'OPPG',          defaultDir:  1 },
  { key: 'DIFF',           label: '+/−',     cls: 'right',       sortField: 'DIFF',          defaultDir: -1,
    display: r => fmtSigned(r.DIFF) },
  { key: 'SEED',           label: 'Seed',    cls: 'right',       sortField: 'SEED_NUM',      defaultDir:  1,
    display: r => r.SEED || '—' },
  { key: 'OFF_RTG',        label: 'Off Rtg', cls: 'right',       sortField: 'OFF_RTG',       defaultDir: -1,
    display: r => fmtSigned(r.OFF_RTG, 2) },
  { key: 'DEF_RTG',        label: 'Def Rtg', cls: 'right',       sortField: 'DEF_RTG',       defaultDir: -1,
    display: r => fmtSigned(r.DEF_RTG, 2) },
  { key: 'PLAYOFF_RESULT', label: 'Playoffs', cls: '',           sortField: 'PLAYOFF_RESULT', defaultDir: -1 },
];

const PLAYER_COLS = [
  { key: 'PLAYER',   label: 'Player',  cls: 'bold',        sortField: 'PLAYER',   defaultDir:  1 },
  { key: 'GP',       label: 'GP',      cls: 'right',       sortField: 'GP',       defaultDir: -1 },
  { key: 'GMSC_TOT', label: 'GMSC',    cls: 'right',       sortField: 'GMSC_TOT', defaultDir: -1 },
  { key: 'GMSC_AVG', label: 'GMSC/G',  cls: 'right muted', sortField: 'GMSC_AVG', defaultDir: -1 },
  { key: 'PPG',      label: 'PPG',     cls: 'right',       sortField: 'PPG',      defaultDir: -1 },
  { key: 'RPG',      label: 'RPG',     cls: 'right',       sortField: 'RPG',      defaultDir: -1 },
  { key: 'APG',      label: 'APG',     cls: 'right',       sortField: 'APG',      defaultDir: -1 },
  { key: 'SPG',      label: 'SPG',     cls: 'right',       sortField: 'SPG',      defaultDir: -1 },
  { key: 'BPG',      label: 'BPG',     cls: 'right',       sortField: 'BPG',      defaultDir: -1 },
  { key: '3PMPG',    label: '3PM/G',   cls: 'right',       sortField: '3PMPG',    defaultDir: -1 },
  { key: 'SEASONS',  label: 'Seasons', cls: 'muted',       sortField: 'SEASONS',  defaultDir:  1,
    display: r => formatSeasonsCell(r.SEASONS) },
];

// "20-21, 21-22, 22-23, 24-25" -> "3 (20-23, 24-25)": season count, then a
// compact run-length-encoded range list collapsing consecutive seasons.
function formatSeasonsCell(seasonsStr) {
  const seasons = (seasonsStr || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!seasons.length) return '—';

  const ranges = [];
  let rangeStart = seasons[0], rangeEnd = seasons[0];
  for (let i = 1; i < seasons.length; i++) {
    const s = seasons[i];
    if (rangeEnd.split('-')[1] === s.split('-')[0]) {
      rangeEnd = s;
    } else {
      ranges.push([rangeStart, rangeEnd]);
      rangeStart = s; rangeEnd = s;
    }
  }
  ranges.push([rangeStart, rangeEnd]);

  const rangeStrs = ranges.map(([a, b]) => `${a.split('-')[0]}-${b.split('-')[1]}`);
  return `${seasons.length} (${rangeStrs.join(', ')})`;
}

const PO_CLASS = {
  'Champion':     'po-champion',
  'Runner-Up':    'po-runnerup',
  'Conf Finals':  'po-conffinals',
  'Second Round': 'po-other',
  'First Round':  'po-other',
  'Missed':       'po-missed',
};

const SEASON_COLOR_COLS = new Set(['DIFF', 'OFF_RTG', 'DEF_RTG']);

function makeSeasonRenderCell(rows) {
  const ranges = {};
  SEASON_COLOR_COLS.forEach(key => {
    const vals = rows.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
    if (vals.length > 0) {
      const absMax = Math.max(...vals.map(Math.abs));
      ranges[key] = { absMax };
    }
  });

  return function(td, col, row) {
    if (col.key === 'SEASON') {
      td.appendChild(document.createTextNode(row.SEASON));
      if (row.FOTY === 'TRUE') {
        const b = document.createElement('span');
        b.className = 'badge'; b.textContent = '⭐';
        attachTooltip(b, 'Franchise of the Year');
        td.appendChild(b);
      }
      if (row.COTY === 'TRUE') {
        const b = document.createElement('span');
        b.className = 'badge'; b.textContent = '🏅';
        attachTooltip(b, 'Coach of the Year');
        td.appendChild(b);
      }
    } else if (col.key === 'PLAYOFF_RESULT') {
      const cls = PO_CLASS[row.PLAYOFF_RESULT];
      if (cls) td.classList.add(cls);
      td.textContent = row.PLAYOFF_RESULT || '—';
    } else if (col.display) {
      td.textContent = col.display(row);
    } else {
      td.textContent = row[col.key] ?? '—';
    }

    if (ranges[col.key]) {
      const n = parseFloat(row[col.key]);
      if (!isNaN(n)) {
        const { absMax } = ranges[col.key];
        const t = absMax === 0 ? 0.5 : Math.min(1, Math.max(0, n / absMax * 0.5 + 0.5));
        const hue = Math.round(t * 120);
        td.style.background = `hsl(${hue}, 55%, 18%)`;
        td.style.color = `hsl(${hue}, 80%, 72%)`;
      }
    }
  };
}

function buildPersonnelSection(members, allGames) {
  const POS_LABEL = { owner: 'Owner', gm: 'GM', coach: 'Coach' };

  const rows = [];
  for (const member of members) {
    for (const tenure of (member.tenures || [])) {
      if (tenure.team !== abbr || tenure.position === 'none') continue;

      const ts = tenure.start;
      const te = tenure.end ?? '9999-99-99';

      const games = allGames.filter(g =>
        g.date >= ts && g.date <= te &&
        (g.home_team === abbr || g.away_team === abbr)
      );

      let W = 0, L = 0;
      for (const g of games) {
        const won = g.home_team === abbr ? g.home_score > g.away_score : g.away_score > g.home_score;
        if (won) W++; else L++;
      }
      const pct    = W + L > 0 ? W / (W + L) : null;
      const active = tenure.end === null;

      rows.push({
        name: member.name, posLabel: POS_LABEL[tenure.position] || tenure.position,
        startDate: tenure.start, endDate: tenure.end,
        active, n: games.length, W, L, pct,
      });
    }
  }

  if (!rows.length) return;

  function fmtTenureDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  const POS_ORDER = { owner: 0, gm: 1, coach: 2 };
  rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.active) {
      const pa = POS_ORDER[a.posLabel.toLowerCase()] ?? 9;
      const pb = POS_ORDER[b.posLabel.toLowerCase()] ?? 9;
      if (pa !== pb) return pa - pb;
    }
    return b.startDate.localeCompare(a.startDate);
  });

  const section = document.getElementById('personnel-section');
  const wrap    = document.getElementById('personnel-wrap');

  const table = document.createElement('table');
  const hrow  = table.createTHead().insertRow();
  ['Name', 'Role', 'Tenure', 'W', 'L', 'PCT'].forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i >= 3) th.className = 'right';
    hrow.appendChild(th);
  });

  const tbody = table.createTBody();
  let shownDivider = false;
  rows.forEach(row => {
    if (!row.active && !shownDivider) {
      shownDivider = true;
      const divTr = tbody.insertRow();
      divTr.className = 'personnel-divider';
      const divTd = divTr.insertCell();
      divTd.colSpan = 6;
      divTd.textContent = 'Former';
    }

    const tr = tbody.insertRow();
    tr.className = row.active ? 'personnel-active' : 'personnel-former';

    const tdN = tr.insertCell(); tdN.className = 'bold';
    const nameLink = document.createElement('a');
    nameLink.href = `/members/${encodeURIComponent(row.name)}/`;
    nameLink.textContent = row.name;
    tdN.appendChild(nameLink);

    const tdP = tr.insertCell();
    if (row.active) {
      tdP.innerHTML = `<span class="cur-role">${row.posLabel}</span>`;
    } else {
      tdP.className = 'muted'; tdP.textContent = row.posLabel;
    }

    const tdS = tr.insertCell();
    if (row.active) {
      tdS.innerHTML = `<span class="cur-since">Since ${fmtTenureDate(row.startDate)}</span>`;
    } else {
      tdS.textContent = fmtTenureDate(row.startDate) + ' – ' + fmtTenureDate(row.endDate);
    }

    const tdW   = tr.insertCell(); tdW.className   = 'right'; tdW.textContent   = row.n ? row.W   : '—';
    const tdL   = tr.insertCell(); tdL.className   = 'right'; tdL.textContent   = row.n ? row.L   : '—';
    const tdPct = tr.insertCell(); tdPct.className = 'right'; tdPct.textContent = row.pct !== null ? fmtPct(row.pct) : '—';
  });

  wrap.appendChild(table);
  section.style.display = '';
}

function buildTimeline(rows) {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;
  const TL_CLASS = {
    'Champion':     'tl-champion',
    'Runner-Up':    'tl-runnerup',
    'Conf Finals':  'tl-conffinals',
    'Second Round': 'tl-second',
    'First Round':  'tl-second',
    'Missed':       'tl-missed',
  };
  const sorted = [...rows].sort((a, b) => (a.SEASON > b.SEASON ? 1 : -1));
  sorted.forEach(row => {
    const card = document.createElement('div');
    card.className = 'tl-card ' + (TL_CLASS[row.PLAYOFF_RESULT] || '');
    const tip = `${row.SEASON}: ${row.W}–${row.L} · ${row.SEED || '—'} · ${row.PLAYOFF_RESULT || '—'}`;
    attachTooltip(card, tip);
    card.innerHTML = `
      <span class="tl-season">${row.SEASON}</span>
      <span class="tl-wins">${row.W}</span>
      <span class="tl-seed">${(row.SEED || '').replace('East-', 'E').replace('West-', 'W')}</span>
    `;
    wrap.appendChild(card);
  });
}

function playerSlug(name) {
  return name.toLowerCase().replace(/, /g, '-').replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
}

// rosterRows: current roster rows (SLUG or legacy PLAYER format), used to mark
// which all-time players are still on the team.
function computeCurrentSlugSet(rosterRows) {
  const slugs = new Set();
  (rosterRows || []).forEach(r => {
    if (r.SLUG) slugs.add(r.SLUG.trim());
    else if (r.PLAYER) slugs.add(playerSlug(r.PLAYER));
  });
  return slugs;
}

function makePlayerRenderCell(currentSlugs) {
  return function(td, col, row) {
    if (col.key === 'PLAYER') {
      const a = document.createElement('a');
      a.href = `/players/?p=${playerSlug(row.PLAYER)}`;
      a.textContent = row.PLAYER;
      td.appendChild(a);
      if (currentSlugs.has(playerSlug(row.PLAYER))) {
        const dot = document.createElement('span');
        dot.className = 'on-roster-dot';
        attachTooltip(dot, 'Currently on roster');
        td.appendChild(dot);
      }
    } else {
      td.textContent = col.display ? col.display(row) : (row[col.key] ?? '—');
    }
  };
}

// ── Edit mode ────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'nbn_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = t => localStorage.setItem(TOKEN_KEY, t);

// Roles for the current token, populated once on load from GET /api/auth/me.
// Used to decide whether to render edit buttons at all — the API still enforces
// permissions on write, this only hides affordances the user can't actually use.
let AUTH_ROLES = [];
// Mirror the server's has_role logic: admin satisfies anything; bod implies rosters.
function hasAuthRole(role) {
  if (AUTH_ROLES.includes('admin')) return true;
  if (AUTH_ROLES.includes(role)) return true;
  if (role === 'rosters' && AUTH_ROLES.includes('bod')) return true;
  return false;
}
// Roster, picks, dead cap, and team state all gate on the 'rosters' role.
const canEditRosters = () => hasAuthRole('rosters');
// Team Settings (jersey number, secondary position) are gated by the team's own
// role only (e.g. 'phx' on /teams/PHX) — deliberately not by rosters/bod/admin,
// since these are the team's own cosmetic identity choices, not league-administered
// roster data.
const canEditTeamSettings = abbr => AUTH_ROLES.includes(abbr.toLowerCase());
// The trading block takes the team's own role OR admin — mirroring
// put_trading_block in roster_picks.py. Deliberately not the same predicate as
// canEditTeamSettings above, which excludes admin on purpose: a jersey number is
// the team's own cosmetic choice, while the block is league-visible listing data
// the office does administer.
const canEditTradeBlock = abbr => AUTH_ROLES.includes(abbr.toLowerCase()) || AUTH_ROLES.includes('admin');

// Teams this member currently *owns*, from GET /api/auth/me. Ownership is a
// tenure position, not a role — every FO member of a team carries the team role
// (it gates the trading block and jersey numbers), but only the owner may move
// real roster state. The server computes this with the same `is_team_owner` its
// write endpoints gate on, so the menu can't offer a move the API would refuse.
let AUTH_OWNER_OF = [];
const canRenounce = abbr => AUTH_OWNER_OF.includes(abbr.toUpperCase());

const SEL_STYLE = 'background:var(--bg-page);border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);font-size:0.75rem;padding:0.15rem 0.3rem;font-family:inherit;cursor:pointer;outline:none';

const CAP_OPTIONS = [
  { value: '',           label: '—'          },
  { value: 'UFA',        label: 'UFA'        },
  { value: 'RFA',        label: 'RFA'        },
  { value: 'PLAYER_OPT', label: 'Player Opt' },
  { value: 'TEAM_OPT',   label: 'Team Opt'   },
  { value: 'NON_GTD',    label: 'Non-Gtd'    },
];

const CAP_HOLD_COLORS = {
  UFA:        { bg: 'hsl(45,60%,20%)',  color: 'hsl(45,90%,72%)'  },
  RFA:        { bg: 'hsl(25,60%,20%)',  color: 'hsl(25,90%,72%)'  },
  PLAYER_OPT: { bg: 'hsl(120,50%,17%)', color: 'hsl(120,75%,68%)' },
  TEAM_OPT:   { bg: 'hsl(210,55%,20%)', color: 'hsl(210,75%,70%)' },
  NON_GTD:    { bg: 'var(--bg-page)',           color: 'var(--text-dim)'          },
};

function applyCapHoldColor(sel) {
  const c = CAP_HOLD_COLORS[sel.value];
  sel.style.background = c ? c.bg : 'var(--bg-page)';
  sel.style.color = c ? c.color : 'var(--text-secondary)';
  sel.style.borderColor = c ? c.color.replace(/(\d+)%\)$/, m => m.replace(/\d+/, n => Math.round(n * 0.55))) : 'var(--border)';
}

function promptToken(onSuccess) {
  const overlay = document.createElement('div');
  overlay.className = 'token-overlay';
  overlay.innerHTML = `
    <div class="token-modal">
      <h3>Access token required</h3>
      <p>Enter your committee token. It will be saved in this browser.</p>
      <input type="password" id="token-input" placeholder="Paste token…" autocomplete="off" />
      <div class="token-modal-actions">
        <button style="padding:0.35rem 0.8rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:inherit" id="tok-cancel">Cancel</button>
        <button style="padding:0.35rem 0.8rem;border:1px solid var(--accent);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--link);font-family:inherit" id="tok-submit">Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#token-input');
  input.focus();
  overlay.querySelector('#tok-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#tok-submit').addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) return;
    setToken(val);
    overlay.remove();
    onSuccess(val);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') overlay.querySelector('#tok-submit').click();
    if (e.key === 'Escape') overlay.remove();
  });
}

function withToken(fn) {
  const t = getToken();
  if (t) { fn(t); return; }
  promptToken(fn);
}

// ── Owner roster moves ───────────────────────────────────────────────────────
// The per-player "⋯" menu on a team's own roster. Every move here writes for
// real through the API; nothing in this section is a simulation. The what-if
// tab's row buttons look similar on purpose but are purely hypothetical, so
// each real action confirms explicitly and says what it will change.

function openConfirmModal({ title, sub, render, confirmLabel, danger, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'token-overlay';
  const modal = document.createElement('div');
  modal.className = 'confirm-modal';
  overlay.appendChild(modal);

  const h = document.createElement('h3'); h.textContent = title;
  const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub || '';
  const bodyEl = document.createElement('div');
  const actions = document.createElement('div'); actions.className = 'confirm-actions';
  const err = document.createElement('div'); err.className = 'spacer';
  const cancel = document.createElement('button'); cancel.className = 'btn-plain'; cancel.textContent = 'Cancel';
  const go = document.createElement('button');
  go.className = danger ? 'btn-danger' : 'btn-go';
  go.textContent = confirmLabel;
  actions.append(err, cancel, go);
  modal.append(h, s, bodyEl, actions);

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  go.addEventListener('click', async () => {
    go.disabled = true; cancel.disabled = true; err.textContent = '';
    const prev = go.textContent; go.textContent = 'Working…';
    try {
      await onConfirm();
      close();
    } catch (e) {
      err.textContent = e.message || 'Failed.';
      go.disabled = false; cancel.disabled = false; go.textContent = prev;
    }
  });

  document.body.appendChild(overlay);
  // `render` gets the body element plus a handle to gate the confirm button, so
  // a dialog can require typed confirmation or block on a failed check.
  render(bodyEl, { setEnabled: v => { go.disabled = !v; }, close });
  return overlay;
}

function factRow(label, value, color) {
  const d = document.createElement('div'); d.className = 'confirm-fact';
  const a = document.createElement('span'); a.textContent = label;
  const b = document.createElement('span'); b.textContent = value;
  if (color) b.style.color = color;
  d.append(a, b);
  return d;
}

function checkRow(c) {
  const d = document.createElement('div');
  d.className = 'confirm-check ' + (c.passed ? 'ok' : c.level === 'error' ? 'error' : 'warn');
  d.textContent = (c.passed ? '✓ ' : c.level === 'error' ? '✕ ' : '⚠ ') + c.message;
  return d;
}

// The API stores trading-block entries by display name; the roster works in
// slugs. Same transform the API's _display_name applies, so membership tests
// line up on both sides.
const blockNameFor = bio => displayNameFromBio((bio && bio.name) || '');

// Mirror of the API's _renounce_eligibility (§ 3.10), so the menu greys out
// exactly what the server would reject. Note it can't be read off the current
// season's cap-hold cell: a player whose contract runs through this season sits
// as a hold for *next* season, and that is the common renounceable case. The
// test is on the player's EARLIEST hold, not the current year's.
function renounceEligibility(bio) {
  const holds = (bio && bio.cap_holds) || {};
  const years = Object.keys(holds).sort();
  if (!years.length) return { ok: false, why: 'No cap hold on file — nothing to renounce (§ 3.10).' };
  const earliest = years[0];
  const type = holds[earliest];
  const cur = currentSeasonYr();
  const m = cur.match(/^(\d{2})-(\d{2})$/);
  const next = m ? `${m[2]}-${String((parseInt(m[2], 10) + 1) % 100).padStart(2, '0')}` : cur;
  if (type === 'PLAYER_OPT' || type === 'TEAM_OPT') {
    return { ok: false, why: 'Decline the option first (§ 6.1) — only a UFA/RFA hold can be renounced.' };
  }
  if (type !== 'UFA' && type !== 'RFA') {
    return { ok: false, why: 'Under contract — a player still under contract must be released (§ 5.1), not renounced.' };
  }
  if (earliest > next) {
    return { ok: false, why: `Contract runs through ${earliest} — renounce applies once they reach free agency (§ 3.10).` };
  }
  return { ok: true, why: '', holdType: type, holdSeason: earliest };
}

async function apiFetch(url, opts, token) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 403) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error('Not authorized — token cleared, reload and try again.');
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') detail = j.detail;
      else if (j.detail && j.detail.checks) {
        const bad = j.detail.checks.filter(c => !c.passed && c.level === 'error');
        detail = bad.length ? bad[0].message : detail;
      }
    } catch {}
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

function openRenounceDialog(slug, bio, abbr) {
  const name = displayNameFromBio(bio.name || slug);
  // Typed confirmation, using the surname alone so it's short enough to type but
  // still specific to this player. Renounce has no self-serve undo — restoring
  // one is a committee `rescind_renounce` — so a stray click must not be enough.
  const surname = String(bio.name || '').split(',')[0].trim() || name;

  openConfirmModal({
    title: `Renounce ${name}?`,
    sub: `${abbr} gives up this cap hold under § 3.10. Checking against the rulebook…`,
    confirmLabel: 'Renounce',
    danger: true,
    render: async (body, ctl) => {
      ctl.setEnabled(false);
      const loading = document.createElement('div');
      loading.className = 'confirm-check ok';
      loading.textContent = 'Running § 3.10 checks…';
      body.appendChild(loading);

      let data;
      try {
        data = await apiFetchPublic('/api/validate/renounce', { player: slug });
      } catch (e) {
        loading.className = 'confirm-check error';
        loading.textContent = `Could not validate: ${e.message}`;
        return;
      }
      loading.remove();

      const f = data.fact_sheet || {};
      const facts = document.createElement('div'); facts.className = 'confirm-facts';
      facts.appendChild(factRow('Cap hold', `${f.hold_type || '—'} · ${f.hold_season || '—'}`));
      facts.appendChild(factRow('Hold removed', formatSalary(f.hold_amount)));
      if (f.cap_room_before != null) {
        facts.appendChild(factRow('Cap room', `${formatSalary(f.cap_room_before)} → ${formatSalary(f.cap_room_after)}`));
      }
      facts.appendChild(factRow('Team salary', `${formatSalary(f.team_salary_before)} → ${formatSalary(f.team_salary_after)}`));
      facts.appendChild(factRow('Roster', `${f.standard_count_before} → ${f.standard_count_after} players`,
        f.standard_count_after < f.roster_min ? 'var(--danger)' : ''));
      facts.appendChild(factRow('Bird Rights forfeited', f.bird_tier || 'none on record',
        (f.bird_tier === 'QVFA' || f.bird_tier === 'EQVFA') ? 'var(--gold)' : ''));
      body.appendChild(facts);

      (data.checks || []).forEach(c => body.appendChild(checkRow(c)));

      const note = document.createElement('div');
      note.className = 'confirm-check warn';
      note.textContent = 'This cannot be undone from here. ' + name +
        ' becomes an unsigned free agent, free to sign anywhere, and only the committee can restore them.';
      body.appendChild(note);

      if (!data.legal) {
        const stop = document.createElement('div');
        stop.className = 'confirm-check error';
        stop.textContent = 'This renounce is not legal, so it cannot be submitted.';
        body.appendChild(stop);
        return;   // confirm stays disabled
      }

      const label = document.createElement('label');
      label.textContent = `Type ${surname} to confirm`;
      const input = document.createElement('input');
      input.type = 'text'; input.autocomplete = 'off';
      body.append(label, input);
      input.addEventListener('input', () => {
        ctl.setEnabled(input.value.trim().toLowerCase() === surname.toLowerCase());
      });
      input.focus();
    },
    onConfirm: () => new Promise((resolve, reject) => {
      withToken(async token => {
        try {
          await apiFetch('/api/self/renounce', {
            method: 'POST',
            body: JSON.stringify({ player: slug, description: `${abbr} renounce ${name}` }),
          }, token);
          resolve();
          // Team salary, cap room, the exceptions panel, the hard-cap banner and
          // the roster table all derive from the roster that just changed. There
          // is no partial re-render path that keeps them consistent, so reload.
          location.reload();
        } catch (e) { reject(e); }
      });
    }),
  });
}

async function apiFetchPublic(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

function openBlockDialog(slug, bio, abbr, onBlock, currentNotes, afterChange) {
  const name = displayNameFromBio(bio.name || slug);
  let notesInput;
  openConfirmModal({
    title: onBlock ? `Remove ${name} from the trade block?` : `Put ${name} on the trade block?`,
    sub: onBlock
      ? `${name} stops being listed as available on /tradeblock.`
      : `${name} is listed as available on /tradeblock. This is a listing only — it moves no salary and makes no trade.`,
    confirmLabel: onBlock ? 'Remove' : 'Add to block',
    danger: false,
    render: (body, ctl) => {
      ctl.setEnabled(true);
      if (onBlock) return;
      const label = document.createElement('label');
      label.textContent = 'Note for other teams (optional)';
      notesInput = document.createElement('input');
      notesInput.type = 'text';
      notesInput.placeholder = 'e.g. looking for a wing / expiring';
      notesInput.value = currentNotes || '';
      body.append(label, notesInput);
      notesInput.focus();
    },
    onConfirm: () => new Promise((resolve, reject) => {
      withToken(async token => {
        try {
          const url = `/api/trading-block/${abbr}/player/${encodeURIComponent(slug)}`;
          if (onBlock) await apiFetch(url, { method: 'DELETE' }, token);
          else await apiFetch(url, { method: 'PUT', body: JSON.stringify({ notes: (notesInput?.value || '').trim() }) }, token);
          afterChange(!onBlock, (notesInput?.value || '').trim());
          resolve();
        } catch (e) { reject(e); }
      });
    }),
  });
}

function openMovesMenu(anchor, slug, bio, abbr, blockState, afterBlockChange) {
  document.querySelectorAll('.move-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'move-menu';

  const head = document.createElement('div');
  head.className = 'move-menu-head';
  head.textContent = displayNameFromBio(bio.name || slug);
  menu.appendChild(head);

  const close = () => { menu.remove(); document.removeEventListener('click', onDoc, true); };
  const onDoc = e => { if (!menu.contains(e.target) && e.target !== anchor) close(); };

  const addItem = (label, { enabled, why, danger, onClick }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (danger) b.className = 'danger';
    b.disabled = !enabled;
    if (enabled) b.addEventListener('click', () => { close(); onClick(); });
    menu.appendChild(b);
    if (!enabled && why) {
      const w = document.createElement('span');
      w.className = 'move-menu-why';
      w.textContent = why;
      menu.appendChild(w);
    }
  };

  const onBlock = blockState.on;
  addItem(onBlock ? 'Remove from trade block' : 'Add to trade block', {
    enabled: canEditTradeBlock(abbr),
    why: 'Only this team’s front office can edit the trade block.',
    onClick: () => openBlockDialog(slug, bio, abbr, onBlock, blockState.notes, afterBlockChange),
  });

  // § 3.10: only a UFA/RFA cap hold is renounceable. A player under contract is
  // released (§ 5.1); one with a live option has it declined first (§ 6.1).
  const elig = renounceEligibility(bio);
  const owner = canRenounce(abbr);
  addItem('Renounce…', {
    enabled: elig.ok && owner,
    danger: true,
    why: !owner ? 'Only the team owner can renounce.' : elig.why,
    onClick: () => openRenounceDialog(slug, bio, abbr),
  });

  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - mr.width - 8))}px`;
  menu.style.top = `${r.bottom + 4 + mr.height > window.innerHeight ? Math.max(8, r.top - mr.height - 4) : r.bottom + 4}px`;
  setTimeout(() => document.addEventListener('click', onDoc, true), 0);
}


// Any § 3.15 offer sheet this team is on either side of. Shown to everyone, not
// just the teams involved — an unresolved offer is exactly the state that used
// to go unnoticed, and the offering team is carrying a real cap hold for it.
function renderOfferSheetBanner(offers) {
  const el = document.getElementById('offer-sheet-banner');
  if (!el || !offers.length) return;
  el.style.display = '';
  el.innerHTML = offers.map(o => {
    const offering = o.offering_team === abbr;
    const who = `<a href="/players/?p=${o.player}">${o.player_name || o.player}</a>`;
    const line = offering
      ? `Offer sheet out for <b>${who}</b> — ${o.retaining_team} has the right to match.`
      : `<b>${o.offering_team}</b> has an offer sheet out for <b>${who}</b> — ${abbr} must decide whether to match.`;
    const cost = offering
      ? `Holding ${formatSalary(o.hold)} against the cap until it's resolved (§ 3.15).`
      : `${o.offering_team} is holding ${formatSalary(o.hold)} against their cap until this is resolved.`;
    return `<div class="offer-banner${o.overdue ? ' overdue' : ''}">
      ${line}${o.overdue ? ' <span class="tag">overdue</span>' : ''}
      <span class="meta">${cost} Offered ${o.date}${o.deadline ? ` · due ${o.deadline}` : ''} ·
        <a href="/transactions">resolve on the Transactions page</a></span>
    </div>`;
  }).join('');
}

// Builds the `rowActions` callback for the live roster table. Returns null when
// the viewer has no move available at all, which keeps the extra column off
// every public page load.
function makeRosterMoveActions(abbr, biosData, blockEntries) {
  if (!canEditTradeBlock(abbr) && !canRenounce(abbr)) return null;

  // slug -> {on, notes}, seeded from the team's current block listing.
  const byName = new Map((blockEntries || []).map(e => [e.player, e.notes || '']));
  const state = {};
  Object.keys(biosData || {}).forEach(slug => {
    const n = blockNameFor(biosData[slug]);
    if (n && byName.has(n)) state[slug] = { on: true, notes: byName.get(n) };
  });
  const stateFor = slug => state[slug] || (state[slug] = { on: false, notes: '' });

  return (row, td) => {
    if (!row.SLUG || row._erc || row._type === 'dead') return;
    const bio = (biosData || {})[row.SLUG];
    if (!bio) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'move-btn';
    btn.textContent = '⋯';
    btn.title = 'Roster moves';
    btn.setAttribute('aria-label', `Roster moves for ${displayNameFromBio(bio.name || row.SLUG)}`);
    const st = stateFor(row.SLUG);

    const flag = document.createElement('span');
    flag.className = 'block-flag';
    const syncFlag = () => { flag.textContent = st.on ? 'on block' : ''; };
    syncFlag();

    btn.addEventListener('click', e => {
      e.stopPropagation();
      openMovesMenu(btn, row.SLUG, bio, abbr, st,
        (nowOn, notes) => { st.on = nowOn; st.notes = notes; syncFlag(); });
    });
    td.append(btn, flag);
  };
}

function makeSelect(options, selectedValue) {
  const sel = document.createElement('select');
  sel.style.cssText = SEL_STYLE;
  options.forEach(opt => {
    const o = document.createElement('option');
    const v = typeof opt === 'string' ? opt : opt.value;
    const l = typeof opt === 'string' ? opt : opt.label;
    o.value = v;
    o.textContent = l;
    if (v === selectedValue) o.selected = true;
    sel.appendChild(o);
  });
  return sel;
}

function nextSalaryYear(yr) {
  const b = parseInt(yr.split('-')[1], 10);
  return `${String(b).padStart(2,'0')}-${String((b + 1) % 100).padStart(2,'0')}`;
}

function prevSalaryYear(yr) {
  const a = parseInt(yr.split('-')[0], 10);
  return `${String((a - 1 + 100) % 100).padStart(2,'0')}-${String(a).padStart(2,'0')}`;
}

function makeEditCell(header, value, config, pickerCtx) {
  const td = document.createElement('td');
  let getValue;
  let capHoldRef = null;

  if (config?.type === 'select') {
    const sel = makeSelect(config.options, value);
    td.style.cssText = 'padding:0.4rem 0.5rem;vertical-align:middle';
    td.appendChild(sel);
    getValue = () => sel.value;

  } else if (config?.type === 'cap-holds') {
    const holdMap = {};
    (value || '').split(',').forEach(pair => {
      const [yr, type] = pair.split(':');
      if (yr && type) holdMap[yr.trim()] = type.trim();
    });
    td.style.cssText = 'padding:0.4rem 0.5rem;vertical-align:middle';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.2rem 0.5rem;align-items:center';
    const selects = {};
    config.years.forEach(yr => {
      const lbl = document.createElement('span');
      lbl.textContent = yr;
      lbl.style.cssText = 'font-size:0.65rem;color:var(--text-muted);white-space:nowrap';
      const sel = makeSelect(CAP_OPTIONS, holdMap[yr] || '');
      applyCapHoldColor(sel);
      sel.addEventListener('change', () => applyCapHoldColor(sel));
      selects[yr] = sel;
      wrap.appendChild(lbl);
      wrap.appendChild(sel);
    });
    td.appendChild(wrap);
    capHoldRef = { wrap, selects };
    getValue = () => config.years
      .filter(yr => selects[yr].value !== '')
      .map(yr => `${yr}:${selects[yr].value}`)
      .join(',');

  } else if (config?.type === 'salary') {
    td.contentEditable = 'true';
    td.textContent = value;
    td.style.outline = 'none';
    td.addEventListener('focus', () => {
      td.style.background = 'var(--bg-hover)';
      td.style.boxShadow = 'inset 0 0 0 1px var(--accent)';
    });
    td.addEventListener('blur', () => {
      td.style.background = '';
      td.style.boxShadow = '';
      const raw = td.textContent.replace(/[$,\s]/g, '');
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) td.textContent = '$' + n.toLocaleString('en-US');
      else if (raw === '') td.textContent = '';
    });
    getValue = () => td.textContent.trim();

  } else if (config?.type === 'player-picker') {
    const ctx = pickerCtx || {};
    const input = document.createElement('input');
    input.type = 'text';
    if (ctx.listId) input.setAttribute('list', ctx.listId);
    input.value = value && ctx.slugToDisplay ? (ctx.slugToDisplay.get(value) || value) : (value || '');
    input.style.cssText = 'background:var(--bg-page);border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);font-size:0.8rem;padding:0.2rem 0.4rem;font-family:inherit;width:180px;box-sizing:border-box';
    td.style.cssText = 'padding:0.4rem 0.5rem;vertical-align:middle';
    td.appendChild(input);
    getValue = () => {
      const typed = input.value.trim();
      return (ctx.nameToSlug && ctx.nameToSlug.get(typed.toLowerCase())) || '';
    };

  } else {
    td.contentEditable = 'true';
    td.textContent = value;
    td.style.outline = 'none';
    td.addEventListener('focus', () => {
      td.style.background = 'var(--bg-hover)';
      td.style.boxShadow = 'inset 0 0 0 1px var(--accent)';
    });
    td.addEventListener('blur', () => {
      td.style.background = '';
      td.style.boxShadow = '';
    });
    getValue = () => td.textContent.trim();
  }

  return { td, getValue, capHoldRef };
}

// Shared "type a name, resolve to a slug" datalist, built fresh from biosData
// each time (biosData is already the full league-wide player-bios.json, so
// this is a league-wide picker regardless of caller). `excludeSlugs` hides
// players already spoken for by the caller (e.g. already on the roster grid
// being edited, or already added to a What-If Mode roster).
function buildPlayerDatalist(biosData, excludeSlugs = new Set()) {
  const nameToSlug = new Map();
  const slugToDisplay = new Map();
  const listId = `nbn-pdl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const dl = document.createElement('datalist');
  dl.id = listId;
  Object.entries(biosData || {}).sort(([, a], [, b]) => {
    return displayNameFromBio(a.name || '').localeCompare(displayNameFromBio(b.name || ''));
  }).forEach(([s, bio]) => {
    if (excludeSlugs.has(s)) return;
    const dn = displayNameFromBio(bio.name || '');
    if (!dn) return;
    nameToSlug.set(dn.toLowerCase(), s);
    slugToDisplay.set(s, dn);
    const opt = document.createElement('option');
    opt.value = dn;
    dl.appendChild(opt);
  });
  document.body.appendChild(dl);
  return { listId, dl, nameToSlug, slugToDisplay };
}

function buildEditableGrid(headers, rows, cellConfig = {}) {
  const mutableHeaders = [...headers];
  const capHoldCells = [];

  // Build shared datalist for any player-picker column
  let pickerCtx = null;
  const pickerConf = Object.values(cellConfig).find(c => c?.type === 'player-picker');
  if (pickerConf) {
    pickerCtx = buildPlayerDatalist(pickerConf.biosData || {});
  }

  const table = document.createElement('table');
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  const emptyTh = document.createElement('th');
  emptyTh.style.cssText = 'width:28px;padding:0 0.4rem';
  headerRow.appendChild(emptyTh);
  mutableHeaders.forEach(h => {
    const th = document.createElement('th');
    th.textContent = cellConfig[h]?.label || h;
    headerRow.appendChild(th);
  });

  const tbody = table.createTBody();

  function makeRow(data = {}) {
    const tr = document.createElement('tr');
    const getters = [];

    const delTd = document.createElement('td');
    delTd.style.cssText = 'width:28px;padding:0 0.4rem;text-align:center;vertical-align:middle';
    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem;line-height:1;padding:0;font-family:inherit';
    delBtn.onmouseenter = () => { delBtn.style.color = 'var(--danger)'; };
    delBtn.onmouseleave = () => { delBtn.style.color = 'var(--text-dim)'; };
    delBtn.addEventListener('click', () => tr.remove());
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    mutableHeaders.forEach(h => {
      const { td, getValue, capHoldRef } = makeEditCell(h, data[h] ?? '', cellConfig[h], pickerCtx);
      getters.push(getValue);
      if (capHoldRef) capHoldCells.push(capHoldRef);
      tr.appendChild(td);
    });

    tr._getters = getters;
    return tr;
  }

  rows.forEach(row => tbody.appendChild(makeRow(row)));

  const addTr = document.createElement('tr');
  const addTd = document.createElement('td');
  addTd.colSpan = mutableHeaders.length + 1;
  addTd.style.cssText = 'padding:0.5rem 1rem;border-top:1px solid var(--border)';
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add row';
  addBtn.style.cssText = 'background:none;border:1px dashed var(--border);border-radius:4px;color:var(--text-muted);cursor:pointer;font-size:0.8rem;padding:0.25rem 0.75rem;font-family:inherit';
  addBtn.onmouseenter = () => { addBtn.style.color = 'var(--text-secondary)'; addBtn.style.borderColor = 'var(--text-muted)'; };
  addBtn.onmouseleave = () => { addBtn.style.color = 'var(--text-muted)'; addBtn.style.borderColor = 'var(--border)'; };
  addBtn.addEventListener('click', () => tbody.insertBefore(makeRow({}), addTr));
  addTd.appendChild(addBtn);
  addTr.appendChild(addTd);
  tbody.appendChild(addTr);

  function addYearColumn(yr) {
    // Insert at the correct sorted position among salary year columns
    const rawIdx = mutableHeaders.findIndex(h => /^\d{2}-\d{2}$/.test(h) && h > yr);
    const insertAt = rawIdx === -1 ? mutableHeaders.length : rawIdx;

    mutableHeaders.splice(insertAt, 0, yr);
    cellConfig[yr] = { type: 'salary' };
    addTd.colSpan = mutableHeaders.length + 1;

    // Insert in CAP_HOLDS years list in sorted order
    if (cellConfig.CAP_HOLDS?.years) {
      const capYrs = cellConfig.CAP_HOLDS.years;
      const capIdx = capYrs.findIndex(y => y > yr);
      if (capIdx === -1) capYrs.push(yr);
      else capYrs.splice(capIdx, 0, yr);
    }

    // Add th at correct position (children[0] = emptyTh, so headers index i → children[i+1])
    const thRef = headerRow.children[insertAt + 1] || null;
    const th = document.createElement('th');
    th.textContent = yr;
    headerRow.insertBefore(th, thRef);

    // Add td to each existing data row at correct position
    [...tbody.rows].filter(tr => tr !== addTr).forEach(tr => {
      const { td, getValue } = makeEditCell(yr, '', { type: 'salary' });
      tr.insertBefore(td, tr.children[insertAt + 1] || null);
      tr._getters.splice(insertAt, 0, getValue);
    });

    // Add year select to each CAP_HOLDS cell in sorted order
    capHoldCells.forEach(({ wrap, selects }) => {
      const lbl = document.createElement('span');
      lbl.textContent = yr;
      lbl.style.cssText = 'font-size:0.65rem;color:var(--text-muted);white-space:nowrap';
      const sel = makeSelect(CAP_OPTIONS, '');
      applyCapHoldColor(sel);
      sel.addEventListener('change', () => applyCapHoldColor(sel));
      selects[yr] = sel;
      const posInNewYears = cellConfig.CAP_HOLDS.years.indexOf(yr);
      const wrapRef = wrap.children[posInNewYears * 2] || null;
      wrap.insertBefore(lbl, wrapRef);
      wrap.insertBefore(sel, wrapRef);
    });
  }

  function getRows() {
    return [...tbody.rows]
      .filter(tr => tr !== addTr)
      .map(tr => {
        const obj = {};
        tr._getters.forEach((get, i) => { obj[mutableHeaders[i]] = get(); });
        return obj;
      });
  }

  function getHeaders() { return [...mutableHeaders]; }

  return { table, getRows, getHeaders, addYearColumn };
}

function rosterCellConfig(headers, biosData = {}) {
  if (headers.includes('SLUG') && !headers.includes('PLAYER')) {
    const salaryYears = headers.filter(h => /^\d{2}-\d{2}$/.test(h));
    const config = {
      SLUG: { type: 'player-picker', biosData, label: 'Player' },
    };
    salaryYears.forEach(yr => { config[yr] = { type: 'salary' }; });
    return config;
  }
  const salaryYears = headers.filter(h => /^\d{2}-\d{2}$/.test(h));
  const config = {
    TYPE: { type: 'select', options: [
      { value: 'player',       label: 'Player'       },
      { value: 'two-way',      label: 'Two-Way'      },
      { value: 'draft-rights', label: 'Draft Rights' },
      { value: 'dead',         label: 'Dead Cap'     },
    ]},
    CAP_HOLDS: { type: 'cap-holds', years: salaryYears },
  };
  salaryYears.forEach(yr => { config[yr] = { type: 'salary' }; });
  return config;
}


function enterEditMode(wrapEl, headers, rows, apiPath, renderView, cellConfig = {}) {
  const { table, getRows, getHeaders, addYearColumn } = buildEditableGrid(headers, rows, cellConfig);

  const toolbar = document.createElement('div');
  toolbar.className = 'roster-edit-toolbar';
  toolbar.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid var(--accent);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--link);font-family:inherit';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:inherit';

  const statusEl = document.createElement('span');
  statusEl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-left:auto';

  toolbar.appendChild(saveBtn);
  toolbar.appendChild(cancelBtn);

  const salaryYears = headers.filter(h => /^\d{2}-\d{2}$/.test(h));
  if (salaryYears.length && (cellConfig.CAP_HOLDS || cellConfig.SLUG)) {
    const YR_BTN = 'padding:0.35rem 0.8rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;font-weight:500;cursor:pointer;background:transparent;color:var(--text-muted);font-family:inherit';
    const onYrEnter = e => { e.target.style.color = 'var(--text-secondary)'; e.target.style.borderColor = 'var(--text-muted)'; };
    const onYrLeave = e => { e.target.style.color = 'var(--text-muted)'; e.target.style.borderColor = 'var(--border)'; };

    let pendingPrevYr = prevSalaryYear(salaryYears[0]);
    const addPrevBtn = document.createElement('button');
    addPrevBtn.style.cssText = YR_BTN;
    addPrevBtn.onmouseenter = onYrEnter;
    addPrevBtn.onmouseleave = onYrLeave;
    const updatePrevLabel = () => { addPrevBtn.textContent = `+ ${pendingPrevYr}`; };
    updatePrevLabel();
    addPrevBtn.addEventListener('click', () => {
      addYearColumn(pendingPrevYr);
      pendingPrevYr = prevSalaryYear(pendingPrevYr);
      updatePrevLabel();
    });
    toolbar.appendChild(addPrevBtn);

    let pendingNextYr = nextSalaryYear(salaryYears[salaryYears.length - 1]);
    const addNextBtn = document.createElement('button');
    addNextBtn.style.cssText = YR_BTN;
    addNextBtn.onmouseenter = onYrEnter;
    addNextBtn.onmouseleave = onYrLeave;
    const updateNextLabel = () => { addNextBtn.textContent = `+ ${pendingNextYr}`; };
    updateNextLabel();
    addNextBtn.addEventListener('click', () => {
      addYearColumn(pendingNextYr);
      pendingNextYr = nextSalaryYear(pendingNextYr);
      updateNextLabel();
    });
    toolbar.appendChild(addNextBtn);
  }

  toolbar.appendChild(statusEl);

  const gridWrap = document.createElement('div');
  gridWrap.className = 'table-wrap';
  gridWrap.style.overflowX = 'auto';
  gridWrap.appendChild(table);

  wrapEl.innerHTML = '';
  wrapEl.appendChild(toolbar);
  wrapEl.appendChild(gridWrap);

  cancelBtn.addEventListener('click', () => renderView(rows));

  saveBtn.addEventListener('click', async () => {
    const updatedRows = getRows();
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    statusEl.textContent = 'Saving…';
    try {
      const res = await fetch(`/api${apiPath}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ headers: getHeaders(), rows: updatedRows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403) {
          localStorage.removeItem(TOKEN_KEY);
          statusEl.textContent = 'Invalid token — cleared. Try again.';
        } else {
          statusEl.textContent = `Error: ${err.detail || res.status}`;
        }
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        return;
      }
      statusEl.textContent = 'Saved!';
      setTimeout(() => renderView(updatedRows), 700);
    } catch {
      statusEl.textContent = 'Network error';
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}

function setupPicksEditable(titleId, wrapEl, picks, teamAbbr, bios = {}, allPicks = []) {
  const INP = 'background:var(--bg-page);border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);font-size:0.8rem;padding:0.2rem 0.4rem;font-family:inherit;width:100%';

  const playerOpts = [{ slug: '', label: '—' },
    ...Object.entries(bios)
      .map(([slug, bio]) => {
        const parts = bio.name.split(',');
        const label = parts.length === 2 ? `${parts[1].trim()} ${parts[0].trim()}` : bio.name;
        return { slug, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  ];

  function renderView(currentPicks) {
    wrapEl.innerHTML = '';
    const t = buildPicksTable(currentPicks, teamAbbr, allPicks);
    if (t) wrapEl.appendChild(t);
    else wrapEl.innerHTML = '<div class="status">No picks on file.</div>';
    attachBtn(currentPicks);
  }

  function attachBtn(currentPicks) {
    if (!canEditRosters()) return;
    const titleEl = document.getElementById(titleId);
    titleEl.querySelector('.section-edit-btn')?.remove();
    const btn = document.createElement('button');
    btn.className = 'section-edit-btn';
    btn.textContent = 'Edit';
    btn.style.cssText = 'font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text-muted);cursor:pointer;font-weight:500;margin-left:0.6rem;font-family:inherit;vertical-align:middle';
    btn.onmouseenter = () => { btn.style.color = 'var(--text-secondary)'; btn.style.borderColor = 'var(--text-muted)'; };
    btn.onmouseleave = () => { btn.style.color = 'var(--text-muted)'; btn.style.borderColor = 'var(--border)'; };
    btn.addEventListener('click', () => withToken(() => enterPicksEdit(currentPicks)));
    titleEl.appendChild(btn);
  }

  function enterPicksEdit(currentPicks) {
    wrapEl.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid var(--accent);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--link);font-family:inherit';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:inherit';

    const statusEl = document.createElement('span');
    statusEl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-left:auto';

    toolbar.appendChild(saveBtn);
    toolbar.appendChild(cancelBtn);
    toolbar.appendChild(statusEl);

    // Build editable table
    const gridWrap = document.createElement('div');
    gridWrap.className = 'table-wrap';
    gridWrap.style.overflowX = 'auto';

    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    ['Year', 'Rnd', 'Orig', 'Owner', 'Pick #', 'Player', 'Top-N Prot.', 'Swap Owner', 'Notes', 'Frozen'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      hr.appendChild(th);
    });

    const teamOptions = Object.keys(TEAMS).sort();
    const rowGetters = [];

    const tbody = table.createTBody();
    currentPicks.forEach(p => {
      const tr = tbody.insertRow();

      // read-only: year, round, orig
      [String(p.year), p.round === 1 ? '1st' : '2nd', p.orig].forEach(v => {
        const td = tr.insertCell();
        td.textContent = v;
        td.style.color = 'var(--text-muted)';
      });

      // owner input (supports single team, pipe-separated candidates, or '?')
      const tdOwner = tr.insertCell();
      const inpOwner = document.createElement('input');
      inpOwner.type = 'text';
      inpOwner.style.cssText = INP;
      inpOwner.value = p.owner || '';
      inpOwner.placeholder = 'ATL or ATL|BKN or ?';
      inpOwner.style.textTransform = 'uppercase';
      tdOwner.appendChild(inpOwner);

      // pick number
      const tdPick = tr.insertCell();
      const inpPick = document.createElement('input');
      inpPick.type = 'number'; inpPick.min = '1'; inpPick.max = '60';
      inpPick.style.cssText = INP;
      if (p.pick != null) inpPick.value = p.pick;
      tdPick.appendChild(inpPick);

      // player
      const tdPlayer = tr.insertCell();
      const selPlayer = document.createElement('select');
      selPlayer.style.cssText = INP;
      playerOpts.forEach(({ slug, label }) => {
        const o = document.createElement('option');
        o.value = slug; o.textContent = label;
        if (slug === (p.player || '')) o.selected = true;
        selPlayer.appendChild(o);
      });
      tdPlayer.appendChild(selPlayer);

      // protected
      const tdProt = tr.insertCell();
      const inpProt = document.createElement('input');
      inpProt.type = 'number'; inpProt.min = '1'; inpProt.max = '30';
      inpProt.style.cssText = INP;
      if (p.protected != null) inpProt.value = p.protected;
      tdProt.appendChild(inpProt);

      // swap owner
      const tdSwap = tr.insertCell();
      const selSwap = document.createElement('select');
      selSwap.style.cssText = INP;
      [{ value: '', label: '—' }, ...teamOptions.map(t => ({ value: t, label: t }))].forEach(({ value, label }) => {
        const o = document.createElement('option');
        o.value = value; o.textContent = label;
        if (value === (p.swap_owner || '')) o.selected = true;
        selSwap.appendChild(o);
      });
      tdSwap.appendChild(selSwap);

      // notes
      const tdNotes = tr.insertCell();
      const inpNotes = document.createElement('input');
      inpNotes.type = 'text';
      inpNotes.style.cssText = INP;
      inpNotes.value = p.notes || '';
      tdNotes.appendChild(inpNotes);

      // frozen
      const tdFrozen = tr.insertCell();
      tdFrozen.style.cssText = 'display:flex;gap:0.35rem;align-items:center';
      const chkFrozen = document.createElement('input');
      chkFrozen.type = 'checkbox';
      chkFrozen.checked = !!p.frozen;
      const inpFrozenReason = document.createElement('input');
      inpFrozenReason.type = 'text';
      inpFrozenReason.placeholder = 'reason';
      inpFrozenReason.style.cssText = INP + ';width:8rem';
      inpFrozenReason.value = p.frozen_reason || '';
      tdFrozen.appendChild(chkFrozen);
      tdFrozen.appendChild(inpFrozenReason);

      rowGetters.push(() => ({
        year: p.year, round: p.round, orig: p.orig,
        owner:      inpOwner.value.trim().toUpperCase() || p.orig,
        pick:       inpPick.value  ? parseInt(inpPick.value)  : null,
        player:     selPlayer.value || null,
        protected:  inpProt.value  ? parseInt(inpProt.value)  : null,
        swap_owner: selSwap.value  || null,
        notes:      inpNotes.value.trim(),
        frozen:        chkFrozen.checked,
        frozen_reason: inpFrozenReason.value.trim(),
      }));
    });

    gridWrap.appendChild(table);
    wrapEl.appendChild(toolbar);
    wrapEl.appendChild(gridWrap);

    cancelBtn.addEventListener('click', () => renderView(currentPicks));

    saveBtn.addEventListener('click', async () => {
      const updated = rowGetters.map(g => g());
      saveBtn.disabled = true; cancelBtn.disabled = true;
      statusEl.textContent = 'Saving…';
      try {
        const token = getToken();
        let failed = null;
        for (const p of updated) {
          const r = await fetch(`/api/picks/${p.year}/${p.round}/${p.orig}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ owner: p.owner, pick: p.pick, player: p.player, protected: p.protected, swap_owner: p.swap_owner, notes: p.notes, frozen: p.frozen, frozen_reason: p.frozen_reason }),
          });
          if (!r.ok) { failed = r; break; }
        }
        if (failed) {
          if (failed.status === 403) { localStorage.removeItem(TOKEN_KEY); statusEl.textContent = 'Invalid token — cleared.'; }
          else statusEl.textContent = `Error ${failed.status}`;
          saveBtn.disabled = false; cancelBtn.disabled = false;
          return;
        }
        // Re-fetch to get server-computed conveys
        const fresh = await fetch(`/api/picks/${abbr}`).then(r => r.json());
        statusEl.textContent = 'Saved!';
        setTimeout(() => renderView(fresh), 700);
      } catch {
        statusEl.textContent = 'Network error';
        saveBtn.disabled = false; cancelBtn.disabled = false;
      }
    });
  }

  attachBtn(picks);
}

function primaryPosFromAttrs(attrSnap) {
  const pos = attrSnap && attrSnap['2k_pos'];
  return (Array.isArray(pos) && pos.length) ? pos[0] : '—';
}

function setupTeamSettingsTab(wrapId, rosterRows, biosData, attributesData) {
  const wrapEl = document.getElementById(wrapId);
  const hasSlug = rosterRows.length && 'SLUG' in rosterRows[0] && !('PLAYER' in rosterRows[0]);
  const activeRows = hasSlug ? rosterRows.filter(r => r.SLUG) : [];

  if (!activeRows.length) {
    wrapEl.innerHTML = '<div class="status">No roster data.</div>';
    return;
  }

  const canEdit = canEditTeamSettings(abbr);

  function renderReadView() {
    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    ['Player', 'Primary Pos', 'Secondary Pos', '#'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      if (label === '#') th.classList.add('right');
      hr.appendChild(th);
    });

    const tbody = table.createTBody();
    activeRows.forEach(row => {
      const bio = biosData[row.SLUG] || {};
      const name = displayNameFromBio(bio.name || '') || row.SLUG || '—';
      const tr = tbody.insertRow();
      const nameTd = tr.insertCell();
      nameTd.textContent = name;
      nameTd.className = 'bold';
      tr.insertCell().textContent = primaryPosFromAttrs(attributesData[row.SLUG]);
      tr.insertCell().textContent = bio.secondary_pos || '—';
      const numTd = tr.insertCell();
      numTd.className = 'right';
      numTd.textContent = bio.jersey_number ?? '—';
    });

    const gridWrap = document.createElement('div');
    gridWrap.className = 'table-wrap';
    gridWrap.style.overflowX = 'auto';
    gridWrap.appendChild(table);

    wrapEl.innerHTML = '';
    wrapEl.appendChild(gridWrap);

    if (canEdit) {
      const btn = document.createElement('button');
      btn.className = 'edit-toggle-btn';
      btn.style.cssText = 'margin-top:0.5rem;font-size:0.72rem;padding:0.15rem 0.45rem';
      btn.textContent = 'Edit';
      btn.addEventListener('click', () => withToken(() => renderEditView()));
      wrapEl.appendChild(btn);
    }
  }

  function renderEditView() {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid var(--accent);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--link);font-family:inherit';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.35rem 0.8rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:inherit';

    const statusEl = document.createElement('span');
    statusEl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-left:auto';

    toolbar.appendChild(saveBtn);
    toolbar.appendChild(cancelBtn);
    toolbar.appendChild(statusEl);

    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    ['Player', 'Primary Pos', 'Secondary Pos', '#'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      if (label === '#') th.classList.add('right');
      hr.appendChild(th);
    });

    const tbody = table.createTBody();
    const fields = [];

    activeRows.forEach(row => {
      const bio = biosData[row.SLUG] || {};
      const name = displayNameFromBio(bio.name || '') || row.SLUG || '—';
      const jersey = bio.jersey_number ?? '';
      const secondaryPos = bio.secondary_pos || '';

      const tr = tbody.insertRow();
      const nameTd = tr.insertCell();
      nameTd.textContent = name;
      nameTd.className = 'bold';

      tr.insertCell().textContent = primaryPosFromAttrs(attributesData[row.SLUG]);

      const secTd = tr.insertCell();
      // Secondary position is restricted to positions this player is eligible at,
      // i.e. their bio's `pos` array — not the full PG/SG/SF/PF/C set.
      const eligiblePos = Array.isArray(bio.pos) ? bio.pos : [];
      const secSel = makeSelect([{ value: '', label: '—' }, ...eligiblePos], secondaryPos);
      secTd.appendChild(secSel);

      const numTd = tr.insertCell();
      numTd.className = 'right';
      const jerseyInput = document.createElement('input');
      jerseyInput.type = 'text';
      jerseyInput.maxLength = 2;
      jerseyInput.pattern = '\\d{1,2}';
      jerseyInput.value = jersey;
      jerseyInput.placeholder = '—';
      jerseyInput.style.cssText = 'width:3.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);font-size:0.8rem;padding:0.2rem 0.4rem;font-family:inherit;text-align:right;outline:none';
      jerseyInput.addEventListener('focus', () => { jerseyInput.style.borderColor = 'var(--accent)'; });
      jerseyInput.addEventListener('blur',  () => { jerseyInput.style.borderColor = 'var(--border)'; });
      numTd.appendChild(jerseyInput);

      fields.push({
        slug: row.SLUG, jerseyInput, secSel,
        originalJersey: String(jersey), originalSecondaryPos: secondaryPos,
      });
    });

    const gridWrap = document.createElement('div');
    gridWrap.className = 'table-wrap';
    gridWrap.style.overflowX = 'auto';
    gridWrap.appendChild(table);

    wrapEl.innerHTML = '';
    wrapEl.appendChild(toolbar);
    wrapEl.appendChild(gridWrap);

    cancelBtn.addEventListener('click', () => renderReadView());

    saveBtn.addEventListener('click', async () => {
      const changed = fields.filter(({ jerseyInput, secSel, originalJersey, originalSecondaryPos }) =>
        String(jerseyInput.value.trim()) !== originalJersey || secSel.value !== originalSecondaryPos
      );
      if (!changed.length) { renderReadView(); return; }

      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      statusEl.textContent = 'Saving…';

      try {
        const token = getToken();
        const results = await Promise.all(changed.map(({ slug, jerseyInput, secSel }) => {
          const val = jerseyInput.value.trim();
          const jersey_number = val === '' ? null : val;
          const secondary_pos = secSel.value === '' ? null : secSel.value;
          return fetch(`/api/players/${slug}/team-settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ jersey_number, secondary_pos }),
          });
        }));

        const failed = results.find(r => !r.ok);
        if (failed) {
          if (failed.status === 403) {
            localStorage.removeItem(TOKEN_KEY);
            statusEl.textContent = 'Invalid token — cleared. Try again.';
          } else {
            const err = await failed.json().catch(() => ({}));
            statusEl.textContent = `Error: ${err.detail || failed.status}`;
          }
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          return;
        }

        statusEl.textContent = 'Saved!';
        setTimeout(() => location.reload(), 700);
      } catch {
        statusEl.textContent = 'Network error';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  }

  renderReadView();
}

function setupDeadCapEditable(wrapEl, deadCapRows, biosData, curYr, onSave) {
  if (!canEditRosters()) return;

  // Seasons to show: curYr + next 2, plus any already in data
  const seasons = new Set([curYr, nextSalaryYear(curYr), nextSalaryYear(nextSalaryYear(curYr))]);
  deadCapRows.forEach(r => Object.keys(r).forEach(k => { if (/^\d{2}-\d{2}$/.test(k)) seasons.add(k); }));
  const seasonList = [...seasons].sort();

  const editBtn = document.createElement('button');
  editBtn.className = 'edit-toggle-btn';
  editBtn.style.cssText = 'margin-top:0.5rem;font-size:0.72rem;padding:0.15rem 0.45rem';
  editBtn.textContent = 'Edit Dead Cap';
  wrapEl.appendChild(editBtn);

  let formEl = null;
  let formDl = null;

  editBtn.addEventListener('click', () => {
    if (formEl) { formEl.remove(); formEl = null; formDl?.remove(); formDl = null; editBtn.textContent = 'Edit Dead Cap'; return; }
    editBtn.textContent = 'Close';

    let rows = deadCapRows.map(r => ({ ...r }));

    const nameToSlug = new Map();
    const slugToDisplay = new Map();
    const dlId = `dc-pdl-${Date.now()}`;
    const dl = document.createElement('datalist');
    dl.id = dlId;
    Object.entries(biosData).sort(([, a], [, b]) =>
      displayNameFromBio(a.name || '').localeCompare(displayNameFromBio(b.name || ''))
    ).forEach(([slug, bio]) => {
      const dn = displayNameFromBio(bio.name || '');
      if (!dn) return;
      nameToSlug.set(dn.toLowerCase(), slug);
      slugToDisplay.set(slug, dn);
      const opt = document.createElement('option');
      opt.value = dn;
      dl.appendChild(opt);
    });
    document.body.appendChild(dl);
    formDl = dl;

    formEl = document.createElement('div');
    formEl.style.cssText = 'margin-top:0.75rem;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:0.75rem;overflow-x:auto';

    function render() {
      formEl.innerHTML = '';

      const tbl = document.createElement('table');
      tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.8rem';
      const thead = tbl.createTHead();
      const hr = thead.insertRow();
      ['Player', ...seasonList, ''].forEach((lbl, i) => {
        const th = document.createElement('th');
        th.textContent = lbl;
        th.style.cssText = `padding:3px 8px;color:var(--text-muted);text-align:${i === 0 ? 'left' : 'right'}`;
        hr.appendChild(th);
      });

      const tbody = tbl.createTBody();

      rows.forEach((row, ri) => {
        const tr = tbody.insertRow();
        // Player name
        const nameTd = tr.insertCell();
        const bio = biosData[row.SLUG] || {};
        nameTd.textContent = displayNameFromBio(bio.name || '') || row.SLUG;
        nameTd.style.cssText = 'padding:3px 8px';

        // Season amounts
        seasonList.forEach(s => {
          const td = tr.insertCell();
          td.style.cssText = 'padding:3px 6px;text-align:right';
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = row[s] || '';
          inp.placeholder = '—';
          inp.style.cssText = 'width:90px;text-align:right;background:var(--bg-page);color:var(--text-secondary);border:1px solid var(--border);border-radius:3px;padding:2px 4px;font-size:0.75rem';
          inp.addEventListener('input', () => { row[s] = inp.value.trim(); });
          td.appendChild(inp);
        });

        // Delete
        const delTd = tr.insertCell();
        delTd.style.cssText = 'padding:3px 6px;text-align:right';
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.style.cssText = 'background:none;border:none;color:var(--danger);cursor:pointer;padding:0 4px';
        delBtn.addEventListener('click', () => { rows.splice(ri, 1); render(); });
        delTd.appendChild(delBtn);
      });

      // Add-entry row
      const addTr = tbody.insertRow();
      addTr.style.borderTop = '1px solid var(--border)';
      const addTd = addTr.insertCell();
      addTd.colSpan = seasonList.length + 2;
      addTd.style.cssText = 'padding:6px 8px';

      const nameInp = document.createElement('input');
      nameInp.type = 'text'; nameInp.placeholder = 'Player name';
      nameInp.setAttribute('list', dlId);
      nameInp.style.cssText = 'background:var(--bg-page);color:var(--text-secondary);border:1px solid var(--border);border-radius:3px;padding:2px 6px;font-size:0.75rem;width:160px;margin-right:6px';

      const seasonInp = document.createElement('input');
      seasonInp.type = 'text'; seasonInp.placeholder = '25-26';
      seasonInp.style.cssText = 'background:var(--bg-page);color:var(--text-secondary);border:1px solid var(--border);border-radius:3px;padding:2px 6px;font-size:0.75rem;width:70px;margin-right:6px';

      const amtInp = document.createElement('input');
      amtInp.type = 'text'; amtInp.placeholder = '$X,XXX,XXX';
      amtInp.style.cssText = 'background:var(--bg-page);color:var(--text-secondary);border:1px solid var(--border);border-radius:3px;padding:2px 6px;font-size:0.75rem;width:110px;margin-right:6px';

      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add';
      addBtn.style.cssText = 'background:var(--accent-dark);color:var(--text-on-accent);border:none;border-radius:3px;padding:2px 8px;font-size:0.75rem;cursor:pointer';
      addBtn.addEventListener('click', () => {
        const typed = nameInp.value.trim();
        const slug = nameToSlug.get(typed.toLowerCase()) || '';
        const season = seasonInp.value.trim();
        const amt = amtInp.value.trim();
        if (!slug || !season || !amt) return;
        const existing = rows.find(r => r.SLUG === slug);
        if (existing) {
          existing[season] = amt;
        } else {
          rows.push({ SLUG: slug, [season]: amt });
          if (!seasons.has(season)) { seasons.add(season); seasonList.length = 0; [...seasons].sort().forEach(s => seasonList.push(s)); }
        }
        nameInp.value = ''; seasonInp.value = ''; amtInp.value = '';
        render();
      });

      addTd.append(nameInp, seasonInp, amtInp, addBtn);
      formEl.appendChild(tbl);

      // Save / Cancel
      const btns = document.createElement('div');
      btns.style.cssText = 'margin-top:0.5rem;display:flex;gap:0.5rem';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = 'background:var(--accent-dark);color:var(--text-on-accent);border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:0.75rem';
      saveBtn.addEventListener('click', () => {
        withToken(token => {
          const payload = rows
            .filter(r => r.SLUG && Object.keys(r).some(k => /^\d{2}-\d{2}$/.test(k) && r[k]))
            .map(r => {
              const out = { SLUG: r.SLUG };
              Object.keys(r).forEach(k => { if (/^\d{2}-\d{2}$/.test(k) && r[k]) out[k] = r[k]; });
              return out;
            });
          fetch(`/api/deadcap/${abbr}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          })
          .then(r => { if (!r.ok) throw r; return r.json(); })
          .then(() => {
            formEl.remove(); formEl = null; formDl?.remove(); formDl = null;
            editBtn.textContent = 'Edit Dead Cap';
            onSave(payload);
          })
          .catch(r => {
            if (r.status === 403) localStorage.removeItem('nbn_token');
            saveBtn.textContent = 'Error — retry';
            setTimeout(() => { saveBtn.textContent = 'Save'; }, 2000);
          });
        });
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'background:var(--border);color:var(--text-secondary);border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:0.75rem';
      cancelBtn.addEventListener('click', () => { formEl.remove(); formEl = null; formDl?.remove(); formDl = null; editBtn.textContent = 'Edit Dead Cap'; });

      btns.append(saveBtn, cancelBtn);
      formEl.appendChild(btns);
    }

    render();
    wrapEl.appendChild(formEl);
  });
}

// ─── What If Mode ────────────────────────────────────────────────────────────
// A client-side-only sandbox: clones the real roster into local state, lets
// the user add/remove players (any player in the league — one-sided, the
// source team is never touched) and decline options / renounce holds, then
// recomputes the same cap figures the real page shows via the exact same
// pure functions (buildRosterTable, computeCapSummary, renderHardCapBanner,
// renderExceptionsSection). Nothing here ever calls the API; exiting just
// discards the local state, so the real roster/cap sections are untouched.

// Dead-cap remainder on a hypothetical release (rulebook § 5.1-5.2). Walks
// every salary-bearing season from `season` onward and applies the guarantee
// rule for that year's cap-hold type: TEAM_OPT/UFA/RFA years owe nothing
// (they're not real salary), PLAYER_OPT years owe the guaranteed amount (or
// full salary if no partial guarantee is set — a player option fully
// guarantees once the team can no longer decline it), NON_GTD years owe only
// what's vested as of today (a step schedule, or a single guarantee-date
// cutoff), and a plain guaranteed year owes the guaranteed amount or full
// salary.
function simulateRelease(row, season, today = new Date()) {
  let total = 0;
  Object.keys(row._salaries || {}).filter(y => y >= season).forEach(y => {
    const capType = (row._cap_holds || {})[y];
    const salary = parseSalaryNum(row._salaries[y]);
    if (!salary) return;
    if (capType === 'TEAM_OPT' || capType === 'UFA' || capType === 'RFA') return;
    if (capType === 'PLAYER_OPT') {
      const gtd = (row._guaranteed || {})[y];
      total += (gtd != null && gtd !== '') ? parseSalaryNum(gtd) : salary;
      return;
    }
    if (capType === 'NON_GTD') {
      const sched = (row._guarantee_schedule || {})[y];
      if (sched && sched.length) {
        total += sched.filter(s => !s.date || new Date(s.date) <= today)
                       .reduce((sum, s) => sum + parseSalaryNum(s.amount), 0);
        return;
      }
      const gtdDate = (row._guarantee_dates || {})[y];
      const gtdAmt  = (row._guaranteed || {})[y];
      if (gtdDate && today < new Date(gtdDate + 'T00:00:00')) { total += parseSalaryNum(gtdAmt); return; }
      total += salary;
      return;
    }
    const gtdAmt = (row._guaranteed || {})[y];
    total += (gtdAmt != null && gtdAmt !== '') ? parseSalaryNum(gtdAmt) : salary;
  });
  return total;
}

// Slug prefix for fictional (not-a-real-player) What-If additions — lets the
// roster table skip the /players/ link and OVR popup for a slug that will
// never resolve to anything (see buildRosterTable's '_name'/OVR cells).
const WHATIF_CUSTOM_PREFIX = '__whatif-custom-';

// Minimum Salary Scale tiers (§ 3.12), keyed the same way as
// capLevels[season].min_salary_scale (see cap-settings/index.html's
// MIN_SCALE_FIELDS) — used to offer "1-yr vet min" presets in the custom
// player form.
const MIN_SALARY_EXP_TIERS = [
  { key: '0',   label: '0 yrs (rookie)' },
  { key: '1',   label: '1 yr' },
  { key: '2',   label: '2 yrs' },
  { key: '3',   label: '3 yrs' },
  { key: '4',   label: '4 yrs' },
  { key: '5',   label: '5 yrs' },
  { key: '6',   label: '6 yrs' },
  { key: '7',   label: '7 yrs' },
  { key: '8',   label: '8 yrs' },
  { key: '9',   label: '9 yrs' },
  { key: '10+', label: '10+ yrs' },
];

// Layers What-If overrides on top of the real biosData without mutating it —
// every existing pure function keeps working unmodified against this merged
// object, so there's still only one client-side cap-math mirror, not a
// second one built just for the sandbox.
function buildWhatifBiosData(realBiosData, bioOverrides) {
  const merged = { ...realBiosData };
  Object.entries(bioOverrides).forEach(([slug, patch]) => {
    const base = merged[slug] || {};
    merged[slug] = {
      ...base, ...patch,
      salaries:        { ...(base.salaries || {}),        ...(patch.salaries || {}) },
      cap_holds:       { ...(base.cap_holds || {}),       ...(patch.cap_holds || {}) },
      guaranteed:      { ...(base.guaranteed || {}),      ...(patch.guaranteed || {}) },
      guarantee_dates: { ...(base.guarantee_dates || {}), ...(patch.guarantee_dates || {}) },
    };
  });
  return merged;
}

// Shared "Years" stepper + per-season salary/cap-type row builder used by
// both What-If contract forms: signing an existing player to a fresh deal,
// and adding a wholly fictional custom player.
function buildContractYearsController(startSeason) {
  const yearsLbl = document.createElement('label');
  yearsLbl.textContent = 'Years';
  const yearsInp = document.createElement('input');
  yearsInp.type = 'number'; yearsInp.min = '1'; yearsInp.max = '5'; yearsInp.value = '1';
  yearsLbl.appendChild(yearsInp);

  const yearRowsWrap = document.createElement('div');
  yearRowsWrap.style.cssText = 'display:flex;gap:0.5rem;flex-wrap:wrap;width:100%';

  function render() {
    const prevValues = {};
    yearRowsWrap.querySelectorAll('.whatif-year-salary').forEach(inp => { prevValues[inp.dataset.year] = inp.value; });
    yearRowsWrap.innerHTML = '';
    const n = Math.max(1, Math.min(5, parseInt(yearsInp.value, 10) || 1));
    let yr = startSeason;
    for (let i = 0; i < n; i++) {
      const yBox = document.createElement('div');
      yBox.className = 'whatif-contract-year';
      const yLbl = document.createElement('span');
      yLbl.textContent = yr;
      yLbl.style.cssText = 'font-size:0.68rem;color:var(--text-muted);font-weight:700';
      const salInp = document.createElement('input');
      salInp.type = 'text'; salInp.placeholder = '$X,XXX,XXX'; salInp.dataset.year = yr;
      salInp.className = 'whatif-year-salary';
      salInp.value = prevValues[yr] || '';
      const typeSel = makeSelect(CAP_OPTIONS, '');
      typeSel.className = 'whatif-year-captype';
      typeSel.dataset.year = yr;
      yBox.append(yLbl, salInp, typeSel);
      yearRowsWrap.appendChild(yBox);
      yr = nextSalaryYear(yr);
    }
  }
  yearsInp.addEventListener('input', render);
  render();

  function getValues() {
    const salaries = {}, cap_holds = {};
    yearRowsWrap.querySelectorAll('.whatif-year-salary').forEach(inp => {
      const n = parseSalaryNum(inp.value);
      if (n > 0) salaries[inp.dataset.year] = n;
    });
    yearRowsWrap.querySelectorAll('.whatif-year-captype').forEach(sel => {
      if (sel.value) cap_holds[sel.dataset.year] = sel.value;
    });
    return { salaries, cap_holds };
  }

  // Vet-min presets: collapse to a single year and drop the amount straight
  // into that year's salary box.
  function setSingleYearSalary(amount) {
    yearsInp.value = '1';
    render();
    const inp = yearRowsWrap.querySelector('.whatif-year-salary');
    if (inp) inp.value = fmtDollars(amount);
  }

  return { yearsLbl, yearRowsWrap, getValues, setSingleYearSalary };
}

// Builds the "1-yr Vet Min" preset button row (§ 3.12) shared by both
// What-If contract forms. A 1-year minimum deal's cap hit never exceeds the
// 2-year veteran minimum, regardless of the player's actual experience tier
// — the league reimburses the difference — so tiers at 2+ years all collapse
// to the 2-yr scale amount here; only the 0/1-yr tiers (already at or below
// that number) keep their own scale value. Returns null if no scale is
// configured for `startSeason`.
function buildMinSalaryPresetRow(capLevels, startSeason, yc) {
  const scale = (capLevels?.[startSeason] || {}).min_salary_scale || {};
  const twoYrAmt = parseSalaryNum(scale['2']) || 0;
  const presetTiers = MIN_SALARY_EXP_TIERS
    .map(t => {
      const raw = parseSalaryNum(scale[t.key]);
      if (raw <= 0) return null;
      const capped = (t.key === '0' || t.key === '1' || !twoYrAmt) ? raw : Math.min(raw, twoYrAmt);
      return { ...t, amt: capped, raw };
    })
    .filter(Boolean);
  if (!presetTiers.length) return null;

  const presetWrap = document.createElement('div');
  presetWrap.style.cssText = 'display:flex;gap:0.3rem;flex-wrap:wrap;width:100%;align-items:center';
  const presetLbl = document.createElement('span');
  presetLbl.textContent = '1-yr Vet Min:';
  presetLbl.style.cssText = 'font-size:0.68rem;color:var(--text-muted);font-weight:700;text-transform:uppercase';
  presetWrap.appendChild(presetLbl);
  presetTiers.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'whatif-row-action';
    btn.textContent = `${t.label} (${fmtDollars(t.amt)})`;
    if (t.amt < t.raw) {
      btn.title = '1-yr deal cap hit capped at the 2-year veteran minimum (§ 3.12) — the league reimburses the difference.';
    }
    btn.addEventListener('click', () => yc.setSingleYearSalary(t.amt));
    presetWrap.appendChild(btn);
  });
  return presetWrap;
}

function setupWhatIfMode(realRosterRows, biosData, capLevels, currentOvr, realDeadCapRows, seasonStates, attributesData, latestSeasonBySlug, teamState) {
  const enterBtn = document.getElementById('whatif-enter-btn');
  const panel = document.getElementById('whatif-panel');
  if (!enterBtn || !panel) return;

  // What-If Mode only understands the current SLUG-format roster CSV.
  const hasSlug = realRosterRows.length && 'SLUG' in realRosterRows[0] && !('PLAYER' in realRosterRows[0]);
  if (!hasSlug) { enterBtn.style.display = 'none'; return; }

  const exitBtn      = document.getElementById('whatif-exit-btn');
  const realRosterWrap = document.getElementById('roster-wrap');
  const addWrap      = document.getElementById('whatif-add-wrap');
  const contractSlot = document.getElementById('whatif-contract-form-slot');
  const gridWrap     = document.getElementById('whatif-roster-wrap');
  enableRangeSum(gridWrap); // same Sheets-style select-to-sum as the real roster table — delegated, so it survives every rerender
  const warningsEl   = document.getElementById('whatif-warnings');
  const hcBanner     = document.getElementById('whatif-hard-cap-banner');
  const excSection   = document.getElementById('whatif-exceptions-section');
  const excWrap      = document.getElementById('whatif-exceptions-wrap');
  const logEl        = document.getElementById('whatif-log');
  const attrImpactWrap = document.getElementById('whatif-attr-impact-wrap');
  const attrImpactEl  = document.getElementById('whatif-attr-impact');

  let state = null;
  let datalist = null; // { listId, dl, nameToSlug, slugToDisplay } — rebuilt every render so just-added players drop out of the search
  let realAttrTotals = null; // snapshot of the real roster's attribute totals, taken once on entry

  function freshState() {
    return {
      rows: realRosterRows.map(r => ({ SLUG: r.SLUG, TYPE: r.TYPE || '' })),
      deadCapRows: realDeadCapRows.map(r => ({ ...r })),
      bioOverrides: {},
      customCounter: 0, // bumped per custom-player add, to keep synthetic slugs unique within this session
      log: [], // { id, label, undo() } — each entry reverses just its own change, independent of the others
    };
  }

  // Every action pushes one of these; its `undo` closure captures whatever
  // pre-mutation state it needs to put back exactly what it changed, so any
  // entry can be reversed on its own regardless of what else happened after it.
  function logAction(label, undo) {
    state.log.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, undo });
  }

  function renderLog() {
    logEl.innerHTML = '';
    state.log.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'whatif-log-entry';
      const lbl = document.createElement('span');
      lbl.textContent = entry.label;
      const xBtn = document.createElement('button');
      xBtn.type = 'button';
      xBtn.textContent = '×';
      xBtn.title = 'Undo this change';
      xBtn.addEventListener('click', () => {
        entry.undo();
        state.log = state.log.filter(e => e.id !== entry.id);
        rerender();
      });
      row.append(lbl, xBtn);
      logEl.appendChild(row);
    });
  }

  function openDeclineForm(row, season) {
    contractSlot.innerHTML = '';
    const form = document.createElement('div');
    form.className = 'whatif-contract-form';

    const label = document.createElement('span');
    label.textContent = `Decline ${row._name}'s ${season} option — becomes:`;
    label.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);font-weight:600';
    form.appendChild(label);

    const holdSel = makeSelect([{ value: 'UFA', label: 'UFA' }, { value: 'RFA', label: 'RFA' }], 'UFA');
    form.appendChild(holdSel);

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button'; applyBtn.className = 'whatif-row-action';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
      // § 6.1 — declining sizes the resulting hold at the player's previous
      // season's actual salary, not the declined option's own amount.
      const prevYr = prevSalaryYear(season);
      const nominal = parseSalaryNum(row._salaries[prevYr]) || parseSalaryNum(row._salaries[season]);
      const prevOverride = state.bioOverrides[row.SLUG];
      const patch = prevOverride || {};
      state.bioOverrides[row.SLUG] = {
        ...patch,
        salaries:  { ...(patch.salaries || {}),  [season]: nominal },
        cap_holds: { ...(patch.cap_holds || {}), [season]: holdSel.value },
      };
      logAction(`Declined ${row._name}'s ${season} option (→ ${holdSel.value})`, () => {
        if (prevOverride) state.bioOverrides[row.SLUG] = prevOverride;
        else delete state.bioOverrides[row.SLUG];
      });
      contractSlot.innerHTML = '';
      rerender();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'whatif-row-action';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { contractSlot.innerHTML = ''; });

    form.append(applyBtn, cancelBtn);
    contractSlot.appendChild(form);
  }

  function openCustomContractForm(slug) {
    contractSlot.innerHTML = '';
    const bio = biosData[slug] || {};
    const startSeason = currentSeasonYr();

    const form = document.createElement('div');
    form.className = 'whatif-contract-form';

    const title = document.createElement('span');
    title.textContent = `${displayNameFromBio(bio.name || '') || slug} — new contract:`;
    title.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);font-weight:600;width:100%';
    form.appendChild(title);

    const yc = buildContractYearsController(startSeason);
    form.append(yc.yearsLbl, yc.yearRowsWrap);

    const presetRow = buildMinSalaryPresetRow(capLevels, startSeason, yc);
    if (presetRow) form.appendChild(presetRow);

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button'; applyBtn.className = 'whatif-row-action';
    applyBtn.textContent = 'Add to roster';
    applyBtn.addEventListener('click', () => {
      const { salaries, cap_holds } = yc.getValues();
      if (!Object.keys(salaries).length) return;
      const prevOverride = state.bioOverrides[slug];
      state.bioOverrides[slug] = { ...(prevOverride || {}), salaries, cap_holds };
      state.rows.push({ SLUG: slug, TYPE: 'player' });
      logAction(`Signed ${displayNameFromBio(bio.name || '') || slug} to a new contract`, () => {
        state.rows = state.rows.filter(r => r.SLUG !== slug);
        if (prevOverride) state.bioOverrides[slug] = prevOverride;
        else delete state.bioOverrides[slug];
      });
      contractSlot.innerHTML = '';
      rerender();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'whatif-row-action';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { contractSlot.innerHTML = ''; });

    form.append(applyBtn, cancelBtn);
    contractSlot.appendChild(form);
  }

  function openNewCustomPlayerForm() {
    contractSlot.innerHTML = '';
    const startSeason = currentSeasonYr();

    const form = document.createElement('div');
    form.className = 'whatif-contract-form';

    const title = document.createElement('span');
    title.textContent = 'Add a custom player — not a real roster player, OVR/ratings won\'t apply:';
    title.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);font-weight:600;width:100%';
    form.appendChild(title);

    const nameLbl = document.createElement('label');
    nameLbl.textContent = 'Name';
    const nameInp = document.createElement('input');
    nameInp.type = 'text'; nameInp.placeholder = 'Player name';
    nameInp.value = `Custom Player #${state.customCounter + 1}`;
    nameInp.addEventListener('focus', () => nameInp.select(), { once: true });
    nameLbl.appendChild(nameInp);
    form.appendChild(nameLbl);

    const yc = buildContractYearsController(startSeason);
    form.append(yc.yearsLbl, yc.yearRowsWrap);

    const presetRow = buildMinSalaryPresetRow(capLevels, startSeason, yc);
    if (presetRow) form.appendChild(presetRow);

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button'; applyBtn.className = 'whatif-row-action';
    applyBtn.textContent = 'Add to roster';
    applyBtn.addEventListener('click', () => {
      const name = nameInp.value.trim();
      if (!name) { nameInp.focus(); return; }
      const { salaries, cap_holds } = yc.getValues();
      if (!Object.keys(salaries).length) return;
      state.customCounter += 1;
      const slug = `${WHATIF_CUSTOM_PREFIX}${state.customCounter}`;
      state.bioOverrides[slug] = { name, pos: [], salaries, cap_holds };
      state.rows.push({ SLUG: slug, TYPE: 'player' });
      logAction(`Added custom player ${name}`, () => {
        state.rows = state.rows.filter(r => r.SLUG !== slug);
        delete state.bioOverrides[slug];
      });
      contractSlot.innerHTML = '';
      rerender();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'whatif-row-action';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { contractSlot.innerHTML = ''; });

    form.append(applyBtn, cancelBtn);
    contractSlot.appendChild(form);
  }

  function rowActions(row, td, capMap) {
    if (!row.SLUG || row._erc) return;
    const season = currentSeasonYr();

    if (row._type === 'dead') {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button'; clearBtn.className = 'whatif-row-action danger';
      clearBtn.textContent = 'Clear';
      clearBtn.title = 'Remove this dead-cap line from the hypothetical roster';
      clearBtn.addEventListener('click', () => {
        const prevDeadRow = state.deadCapRows.find(r => r.SLUG === row.SLUG);
        const prevDeadRowClone = prevDeadRow ? { ...prevDeadRow } : null;
        state.deadCapRows = state.deadCapRows.filter(r => r.SLUG !== row.SLUG);
        logAction(`Cleared ${row._name}'s dead cap`, () => {
          if (prevDeadRowClone) state.deadCapRows.push(prevDeadRowClone);
        });
        rerender();
      });
      td.appendChild(clearBtn);
      return;
    }

    const hasSalary = !!row._salaries[season];
    const capType = capMap[season];

    // A UFA/RFA row is a bare cap hold, not a real contract — even though it
    // carries a nominal $ figure (same convention real FA holds use, see the
    // tfoot's UFA/RFA Hold buckets), the only valid action is Renounce, never
    // Release (there's no dead cap concept for a hold that was never a deal).
    if (capType === 'UFA' || capType === 'RFA') {
      const renounceBtn = document.createElement('button');
      renounceBtn.type = 'button'; renounceBtn.className = 'whatif-row-action danger';
      renounceBtn.textContent = 'Renounce';
      renounceBtn.title = 'Removes the hold — no dead cap (rulebook § 3.10)';
      renounceBtn.addEventListener('click', () => {
        const raw = state.rows.find(r => r.SLUG === row.SLUG);
        state.rows = state.rows.filter(r => r.SLUG !== row.SLUG);
        logAction(`Renounced ${row._name}'s hold`, () => {
          state.rows.push({ SLUG: row.SLUG, TYPE: raw?.TYPE || '' });
        });
        rerender();
      });
      td.appendChild(renounceBtn);
      return;
    }

    if (capType === 'PLAYER_OPT' || capType === 'TEAM_OPT') {
      const declineBtn = document.createElement('button');
      declineBtn.type = 'button'; declineBtn.className = 'whatif-row-action';
      declineBtn.textContent = 'Decline Option';
      declineBtn.addEventListener('click', () => openDeclineForm(row, season));
      td.appendChild(declineBtn);
    }

    if (hasSalary) {
      // "Remove" models the player leaving cleanly (e.g. traded away — their
      // salary follows them to the other side of the deal) with no dead cap.
      // "Release" models actually waiving them, which does leave a dead-cap
      // remainder per § 5.1-5.2. Same starting point, different real move.
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button'; removeBtn.className = 'whatif-row-action';
      removeBtn.textContent = 'Remove';
      removeBtn.title = 'Take them off the roster with no dead cap — e.g. modeling a trade away';
      removeBtn.addEventListener('click', () => {
        const raw = state.rows.find(r => r.SLUG === row.SLUG);
        state.rows = state.rows.filter(r => r.SLUG !== row.SLUG);
        logAction(`Removed ${row._name}`, () => {
          state.rows.push({ SLUG: row.SLUG, TYPE: raw?.TYPE || '' });
        });
        rerender();
      });
      td.appendChild(removeBtn);

      const releaseBtn = document.createElement('button');
      releaseBtn.type = 'button'; releaseBtn.className = 'whatif-row-action danger';
      releaseBtn.textContent = 'Release';
      releaseBtn.title = 'Waives the player — dead cap sized per rulebook § 5.1-5.2';
      releaseBtn.addEventListener('click', () => {
        const raw = state.rows.find(r => r.SLUG === row.SLUG);
        const deadAmt = simulateRelease(row, season);
        state.rows = state.rows.filter(r => r.SLUG !== row.SLUG);
        const existingDeadRow = state.deadCapRows.find(r => r.SLUG === row.SLUG);
        const prevDeadSeasonVal = existingDeadRow ? existingDeadRow[season] : undefined;
        const isNewDeadRow = deadAmt > 0 && !existingDeadRow;
        if (deadAmt > 0) {
          if (existingDeadRow) existingDeadRow[season] = String(deadAmt);
          else state.deadCapRows.push({ SLUG: row.SLUG, [season]: String(deadAmt) });
        }
        logAction(`Released ${row._name}`, () => {
          state.rows.push({ SLUG: row.SLUG, TYPE: raw?.TYPE || '' });
          if (deadAmt > 0) {
            if (isNewDeadRow) {
              state.deadCapRows = state.deadCapRows.filter(r => r.SLUG !== row.SLUG);
            } else {
              const dr = state.deadCapRows.find(r => r.SLUG === row.SLUG);
              if (dr) {
                if (prevDeadSeasonVal === undefined) delete dr[season];
                else dr[season] = prevDeadSeasonVal;
              }
            }
          }
        });
        rerender();
      });
      td.appendChild(releaseBtn);
    }
  }

  function buildAddControl() {
    addWrap.innerHTML = '';
    if (datalist) { datalist.dl.remove(); datalist = null; }
    const excludeSlugs = new Set(state.rows.map(r => r.SLUG));
    // Real-life retirement (bio.retired) means there's no one to sign or
    // trade for — exclude them from the What-If search regardless of
    // whether they're already on the roster.
    Object.entries(biosData).forEach(([slug, bio]) => { if (bio.retired) excludeSlugs.add(slug); });
    datalist = buildPlayerDatalist(biosData, excludeSlugs);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add a player (any team)…';
    input.className = 'whatif-add-input';
    input.setAttribute('list', datalist.listId);
    input.addEventListener('change', () => {
      const slug = datalist.nameToSlug.get(input.value.trim().toLowerCase());
      input.value = '';
      if (!slug) return;
      const bio = biosData[slug] || {};
      const season = currentSeasonYr();
      const hasActiveContract = !!(bio.salaries || {})[season] || !!(bio.cap_holds || {})[season];
      if (hasActiveContract) {
        state.rows.push({ SLUG: slug, TYPE: bio.type || 'player' });
        logAction(`Added ${displayNameFromBio(bio.name || '') || slug}`, () => {
          state.rows = state.rows.filter(r => r.SLUG !== slug);
        });
        rerender();
      } else {
        openCustomContractForm(slug);
      }
    });
    addWrap.appendChild(input);

    const customBtn = document.createElement('button');
    customBtn.type = 'button'; customBtn.className = 'whatif-row-action';
    customBtn.textContent = '+ Custom Player';
    customBtn.title = 'Add a made-up player with your own contract — not a real roster player';
    customBtn.addEventListener('click', () => openNewCustomPlayerForm());
    addWrap.appendChild(customBtn);
  }

  function renderWarnings(rows, mergedBios, teamSalaryFull, teamSalaryExHolds, season) {
    const lines = [];

    const standardCount = rows.filter(r => {
      const type = r.TYPE || (mergedBios[r.SLUG] || {}).type || '';
      return !ROSTER_EXEMPT_TYPES.has(type);
    }).length;
    if (standardCount > 15) lines.push(`Roster size ${standardCount} exceeds the 15-player in-season limit (§ 2.1)`);

    // Apron/cap comparisons mirror computeMleType's convention: apron-level
    // checks (and this team's own hard cap, if one applies — § 1.3/1.4)
    // exclude pure UFA/RFA holds; the plain Salary Cap check does not. Only
    // the single most severe threshold crossed is shown, since anything over
    // the 2nd apron is necessarily over the 1st apron and the cap too.
    const cl = capLevels?.[season];
    if (cl) {
      const hcApronKey = teamState?.hard_cap === 'second_apron' ? 'apron2' : teamState?.hard_cap === 'first_apron' ? 'apron1' : null;
      const hcLevel = hcApronKey ? cl[hcApronKey] : null;
      if (hcLevel && teamSalaryExHolds > hcLevel) {
        lines.push(`Violates this team's Hard Cap (${hcApronKey === 'apron2' ? 'Second' : 'First'} Apron) by ${fmtDollars(teamSalaryExHolds - hcLevel)}`);
      } else if (cl.apron2 && teamSalaryExHolds > cl.apron2) {
        lines.push(`Over the Second Apron by ${fmtDollars(teamSalaryExHolds - cl.apron2)}`);
      } else if (cl.apron1 && teamSalaryExHolds > cl.apron1) {
        lines.push(`Over the First Apron by ${fmtDollars(teamSalaryExHolds - cl.apron1)}`);
      } else if (cl.cap && teamSalaryFull > cl.cap) {
        lines.push(`Over the Salary Cap by ${fmtDollars(teamSalaryFull - cl.cap)}`);
      }
    }

    warningsEl.innerHTML = lines.map(l => `<div class="whatif-warning-line">⚠ ${l}</div>`).join('');
  }

  const ATTR_IMPACT_COLS = [
    { key: 'all',   label: 'All' },
    { key: 'top5',  label: 'Top 5' },
    { key: 'top8',  label: 'Top 8' },
    { key: 'top10', label: 'Top 10' },
  ];

  const round1 = n => Math.round(n * 10) / 10;

  // Each cell shows the delta (bold, colored) as the headline, with the
  // actual before → after totals underneath in smaller muted text so the
  // magnitude of the underlying numbers is visible too, not just the swing.
  function fillAttrCell(td, before, after) {
    const b = round1(before), a = round1(after);
    const d = round1(a - b);
    td.className = 'right ' + (d > 0 ? 'whatif-attr-up' : d < 0 ? 'whatif-attr-down' : 'whatif-attr-zero');
    const deltaLine = document.createElement('div');
    deltaLine.className = 'whatif-attr-delta-line';
    deltaLine.textContent = d > 0 ? `+${d}` : `${d}`;
    const baLine = document.createElement('div');
    baLine.className = 'whatif-attr-ba-line';
    baLine.textContent = `${b} → ${a}`;
    td.append(deltaLine, baLine);
  }

  function renderAttrImpact(mergedBios, season) {
    if (!realAttrTotals) { attrImpactWrap.style.display = 'none'; return; }
    attrImpactWrap.style.display = '';
    const hypoTotals = computeAttrTotals(state.rows, mergedBios, attributesData, currentOvr, season);

    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    const nameTh = document.createElement('th');
    nameTh.textContent = 'Attribute';
    hr.appendChild(nameTh);
    ATTR_IMPACT_COLS.forEach(col => {
      const th = document.createElement('th');
      th.className = 'right';
      th.textContent = col.label;
      hr.appendChild(th);
    });

    const tbody = table.createTBody();

    const totalTr = tbody.insertRow();
    totalTr.className = 'whatif-attr-total-row';
    const totalNameTd = totalTr.insertCell();
    totalNameTd.textContent = 'TOTAL';
    ATTR_IMPACT_COLS.forEach(col => {
      const before = RATING_ATTR_COLUMNS.reduce((s, c) => s + realAttrTotals[col.key][c.key], 0);
      const after  = RATING_ATTR_COLUMNS.reduce((s, c) => s + hypoTotals[col.key][c.key], 0);
      fillAttrCell(totalTr.insertCell(), before, after);
    });

    RATING_ATTR_COLUMNS.forEach(c => {
      const tr = tbody.insertRow();
      const nameTd = tr.insertCell();
      nameTd.textContent = c.full;
      ATTR_IMPACT_COLS.forEach(col => {
        fillAttrCell(tr.insertCell(), realAttrTotals[col.key][c.key], hypoTotals[col.key][c.key]);
      });
    });

    attrImpactEl.innerHTML = '';
    attrImpactEl.appendChild(table);
  }

  function rerender() {
    const mergedBios = buildWhatifBiosData(biosData, state.bioOverrides);
    const season = currentSeasonYr();

    gridWrap.innerHTML = '';
    const t = buildRosterTable(
      state.rows, mergedBios, capLevels, currentOvr, state.deadCapRows,
      seasonStates, attributesData, 'contracts', latestSeasonBySlug, rowActions,
    );
    if (t) gridWrap.appendChild(t);
    else gridWrap.innerHTML = '<div class="status">No players on this hypothetical roster.</div>';

    const { teamSalaryFull, teamSalaryExHolds } = computeCapSummary(state.rows, state.deadCapRows, mergedBios, capLevels, season);
    renderHardCapBanner(teamState, hcBanner);
    renderExceptionsSection(teamState, capLevels, teamSalaryFull, teamSalaryExHolds, season, excSection, excWrap);
    renderWarnings(state.rows, mergedBios, teamSalaryFull, teamSalaryExHolds, season);
    renderAttrImpact(mergedBios, season);
    buildAddControl();
    renderLog();
  }

  enterBtn.addEventListener('click', () => {
    // Mutually exclusive with real roster Edit mode (same guard the mode
    // tabs already use for the same reason — don't let two edit surfaces
    // fight over the same underlying rows).
    if (realRosterWrap.querySelector('.roster-edit-toolbar')) return;
    state = freshState();
    realAttrTotals = computeAttrTotals(realRosterRows, biosData, attributesData, currentOvr, currentSeasonYr());
    realRosterWrap.closest('section').querySelectorAll(':scope > .roster-header-row, :scope > .table-wrap, :scope > #cap-edit-wrap, :scope > #dead-cap-edit-wrap').forEach(el => { el.style.display = 'none'; });
    document.getElementById('exceptions-section').style.display = 'none';
    panel.style.display = '';
    enterBtn.disabled = true;
    rerender();
  });

  exitBtn.addEventListener('click', () => {
    state = null;
    realAttrTotals = null;
    contractSlot.innerHTML = '';
    if (datalist) { datalist.dl.remove(); datalist = null; }
    panel.style.display = 'none';
    realRosterWrap.closest('section').querySelectorAll(':scope > .roster-header-row, :scope > .table-wrap, :scope > #cap-edit-wrap, :scope > #dead-cap-edit-wrap').forEach(el => { el.style.display = ''; });
    enterBtn.disabled = false;
    // Real roster/cap data was never touched — just recompute+show the real numbers again.
    const season = currentSeasonYr();
    const { teamSalaryFull, teamSalaryExHolds } = computeCapSummary(realRosterRows, realDeadCapRows, biosData, capLevels, season);
    renderHardCapBanner(teamState);
    renderExceptionsSection(teamState, capLevels, teamSalaryFull, teamSalaryExHolds, season);
  });
}

function setupEditable(titleId, wrapId, headers, rows, apiPath, buildView, cellConfig = {}) {
  function renderView(currentRows) {
    const wrapEl = document.getElementById(wrapId);
    wrapEl.innerHTML = '';
    const t = buildView(currentRows);
    if (t) wrapEl.appendChild(t);
    else wrapEl.innerHTML = '<div class="status">No data.</div>';
    attachEditBtn(currentRows);
  }

  function attachEditBtn(currentRows) {
    if (!canEditRosters()) return;
    const titleEl = document.getElementById(titleId);
    titleEl.querySelector('.section-edit-btn')?.remove();
    const btn = document.createElement('button');
    btn.className = 'section-edit-btn';
    btn.textContent = 'Edit';
    btn.style.cssText = 'font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text-muted);cursor:pointer;font-weight:500;margin-left:0.6rem;font-family:inherit;vertical-align:middle';
    btn.onmouseenter = () => { btn.style.color = 'var(--text-secondary)'; btn.style.borderColor = 'var(--text-muted)'; };
    btn.onmouseleave = () => { btn.style.color = 'var(--text-muted)'; btn.style.borderColor = 'var(--border)'; };
    btn.addEventListener('click', () => {
      withToken(() => {
        const wrapEl = document.getElementById(wrapId);
        enterEditMode(wrapEl, headers, currentRows, apiPath, renderView, cellConfig);
      });
    });
    titleEl.appendChild(btn);
  }

  attachEditBtn(rows);
}

// slug -> that player's most recent player_seasons.csv row (any team), used
// by the roster table's Stats mode. Season strings ("24-25") sort correctly
// with plain string comparison, same convention used for the Historical
// Rosters season dropdown below.
function computeLatestSeasonBySlug(allSeasons) {
  const bySlug = {};
  allSeasons.forEach(r => {
    const slug = (r.SLUG || '').trim();
    if (!slug) return;
    const existing = bySlug[slug];
    if (!existing || r.SEASON > existing.SEASON) bySlug[slug] = r;
  });
  return bySlug;
}

function buildHistoricalRoster(allSeasons, teamAbbr, season) {
  const rows = allSeasons.filter(r => r.TEAM === teamAbbr && r.SEASON === season);
  if (!rows.length) return null;

  const augmented = rows.map(r => {
    const g   = Math.max(1, parseInt(r.G) || 1);
    const pg  = k => +(parseFloat(r[k]) || 0) / g;
    const fmt = k => Math.round(pg(k) * 10) / 10;
    return {
      ...r,
      _mpg:    fmt('MIN'),
      _ppg:    fmt('PTS'),
      _rpg:    fmt('REB'),
      _apg:    fmt('AST'),
      _spg:    fmt('STL'),
      _bpg:    fmt('BLK'),
      _3pmpg:  fmt('3PM'),
      _gmscpg: fmt('GMSC'),
    };
  });

  const HIST_COLS = [
    { key: 'PLAYER',  label: 'Player',  cls: 'bold',        sortField: 'PLAYER',  defaultDir:  1 },
    { key: 'G',       label: 'G',       cls: 'right',       sortField: 'G',       defaultDir: -1 },
    { key: '_mpg',    label: 'MPG',     cls: 'right muted', sortField: '_mpg',    defaultDir: -1 },
    { key: '_ppg',    label: 'PPG',     cls: 'right',       sortField: '_ppg',    defaultDir: -1 },
    { key: '_rpg',    label: 'RPG',     cls: 'right',       sortField: '_rpg',    defaultDir: -1 },
    { key: '_apg',    label: 'APG',     cls: 'right',       sortField: '_apg',    defaultDir: -1 },
    { key: '_spg',    label: 'SPG',     cls: 'right muted', sortField: '_spg',    defaultDir: -1 },
    { key: '_bpg',    label: 'BPG',     cls: 'right muted', sortField: '_bpg',    defaultDir: -1 },
    { key: '_3pmpg',  label: '3PM/G',   cls: 'right muted', sortField: '_3pmpg',  defaultDir: -1 },
    { key: '_gmscpg', label: 'GMSC/G',  cls: 'right',       sortField: '_gmscpg', defaultDir: -1 },
  ];

  return buildTable(HIST_COLS, augmented, '_gmscpg', -1, (td, col, row) => {
    if (col.key === 'PLAYER') {
      if (row.SLUG) {
        const a = document.createElement('a');
        a.href = `/players/?p=${row.SLUG}`;
        a.textContent = row.PLAYER;
        td.appendChild(a);
      } else {
        td.textContent = row.PLAYER || '—';
      }
    } else {
      td.textContent = row[col.key] ?? '—';
    }
  });
}

(async () => {
  const seasonsWrap  = document.getElementById('seasons-wrap');
  const playersWrap  = document.getElementById('players-wrap');
  const rosterWrap   = document.getElementById('roster-wrap');
  enableRangeSum(rosterWrap);
  attachCopyBtn('roster-title', 'roster-wrap');
  const picksWrap    = document.getElementById('picks-wrap');
  const draftedWrap  = document.getElementById('drafted-wrap');

  // Snapshot this before the fetches: a stale token gets cleared by the first
  // request that 403s, so reading it afterwards can't tell "never signed in"
  // from "signed in with a token that has since been revoked".
  const hadStoredToken = !!getToken();

  const [sr, pr, rr, pkr, biosr, capr, psr, ovrr, tsr, dcr, allpkr, memr, gamesr, lyr, authr, txnsr, ter, attrr, blockr, offersr, recr] = await Promise.allSettled([
    fetch(`/data/${slug}-seasons.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/data/${slug}-players.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/data/${slug}-roster.csv`).then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch(`/api/picks/${abbr}`).then(r => { if (!r.ok) throw r; return r.json(); }),
    fetch('/api/players').then(r => r.ok ? r.json() : {}),
    fetch('/api/cap-levels').then(r => r.ok ? r.json() : {}),
    fetch('/players/player_seasons.csv').then(r => { if (!r.ok) throw r; return r.text(); }),
    fetch('/api/ovr/current').then(r => r.ok ? r.json() : {}),
    fetch(`/api/team-state/${abbr}`).then(r => r.ok ? r.json() : null),
    fetch(`/api/deadcap/${abbr}`).then(r => r.ok ? r.json() : []),
    fetch('/api/picks').then(r => r.ok ? r.json() : []),
    fetch('/api/members/public').then(r => r.ok ? r.json() : []),
    fetch(`/api/boxscores/games?team=${abbr}`).then(r => r.ok ? r.json() : []),
    fetch('/api/league-year').then(r => r.ok ? r.json() : null),
    fetch('/api/auth/me', { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} }).then(r => r.ok ? r.json() : null),
    fetch('/api/transactions?limit=500').then(r => r.ok ? r.json() : { transactions: [] }),
    fetch(`/api/trade-exceptions/${abbr}`).then(r => r.ok ? r.json() : []),
    fetch('/api/attributes/current').then(r => r.ok ? r.json() : {}),
    fetch('/api/trading-block').then(r => r.ok ? r.json() : {}),
    fetch(`/api/offer-sheets/open?team=${abbr}`).then(r => r.ok ? r.json() : []),
    fetch('/data/franchise-records.csv').then(r => { if (!r.ok) throw r; return r.text(); }),
  ]);

  await ratingsPopupReady;
  await lineupReady;
  await contractReady;

  // Set the league year before any render so currentSeasonYr() is consistent everywhere.
  if (lyr.status === 'fulfilled' && lyr.value?.current_season) LEAGUE_YEAR = lyr.value.current_season;

  // Roles drive which edit buttons render below; default to none if the call failed.
  AUTH_ROLES = (authr.status === 'fulfilled' && Array.isArray(authr.value?.roles)) ? authr.value.roles : [];
  AUTH_OWNER_OF = (authr.status === 'fulfilled' && Array.isArray(authr.value?.owner_of)) ? authr.value.owner_of : [];

  // Every role-gated affordance on this page needs a token to already be stored,
  // and the only ways to store one were themselves role-gated — so a team owner
  // without committee roles could never reach their own tools here. Offer the
  // prompt whenever we have no identity at all, then reload so the gated UI
  // renders. A stale/invalid token also lands here, since it resolves to no roles.
  const signInBtn = document.getElementById('team-signin-btn');
  if (signInBtn && !AUTH_ROLES.length) {
    signInBtn.style.display = '';
    signInBtn.textContent = hadStoredToken ? 'Sign in again' : 'Sign in';
    signInBtn.title = hadStoredToken
      ? 'Your saved token isn’t valid — enter it again to manage your team.'
      : 'Enter your member token to manage your team.';
    signInBtn.addEventListener('click', () => promptToken(() => location.reload()));
  }

  const biosData    = biosr.status === 'fulfilled' ? biosr.value : {};
  const capLevels   = capr.status === 'fulfilled'  ? capr.value  : {};
  const currentOvr  = ovrr.status === 'fulfilled'  ? ovrr.value  : {};
  const teamState   = tsr.status  === 'fulfilled'  ? tsr.value   : null;
  const seasonStates = teamState?.seasons || {};
  const deadCapRows = dcr.status  === 'fulfilled'  ? dcr.value : [];
  const allTxns     = txnsr.status === 'fulfilled' ? (txnsr.value.transactions || []) : [];
  const membersData = memr.status  === 'fulfilled' ? memr.value  : [];
  const allGames    = gamesr.status === 'fulfilled' ? gamesr.value : [];
  const tradeExceptions = ter.status === 'fulfilled' ? ter.value : [];
  const attributesData = attrr.status === 'fulfilled' ? attrr.value : {};
  const myBlockEntries = ((blockr.status === 'fulfilled' ? blockr.value : {})[abbr] || {}).players || [];
  const openOffers = offersr.status === 'fulfilled' && Array.isArray(offersr.value) ? offersr.value : [];
  renderOfferSheetBanner(openOffers);
  const currentRosterRowsParsed = rr.status === 'fulfilled' ? parseCSV(rr.value) : [];
  const currentSlugs = computeCurrentSlugSet(currentRosterRowsParsed);

  let seasonRows = [];
  if (sr.status === 'fulfilled') {
    seasonsWrap.innerHTML = '';
    seasonRows = parseCSV(sr.value);
    buildTimeline(seasonRows);
    seasonsWrap.appendChild(buildTable(SEASON_COLS, seasonRows, 'SEASON', 1, makeSeasonRenderCell(seasonRows)));
  } else {
    seasonsWrap.innerHTML = '<div class="status">Failed to load season data.</div>';
  }

  buildPersonnelSection(membersData, allGames);

  if (pr.status === 'fulfilled') {
    playersWrap.innerHTML = '';
    playersWrap.appendChild(buildTable(PLAYER_COLS, parseCSV(pr.value), 'GMSC_TOT', -1, makePlayerRenderCell(currentSlugs)));
  } else {
    playersWrap.innerHTML = '<div class="status">Failed to load player data.</div>';
  }

  // Franchise Records — best single games by anyone who played for this team.
  // Sourced from data/franchise-records.csv (top 5 per stat per team), which the
  // build writes alongside the league-wide game-highs; a franchise with no
  // all-time great never cracks those, but still has its own record book.
  {
    const recordsWrap = document.getElementById('records-wrap');
    const escAttr = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const REC_STATS = [
      ['P', 'Points'], ['R', 'Rebounds'], ['A', 'Assists'], ['S', 'Steals'],
      ['B', 'Blocks'], ['3PM', '3-Pointers'], ['GMSC', 'Game Score'],
    ];

    if (recr.status !== 'fulfilled') {
      recordsWrap.innerHTML = '<div class="status">Failed to load franchise records.</div>';
    } else {
      const mine = parseCSV(recr.value).filter(r => r.TEAM === abbr);
      const byStat = new Map();
      for (const r of mine) {
        if (!byStat.has(r.STAT)) byStat.set(r.STAT, []);
        byStat.get(r.STAT).push(r);
      }
      for (const arr of byStat.values()) arr.sort((a, b) => (+a.RANK) - (+b.RANK));

      // OPP is stored "@DEN" for road games, "DEN" for home.
      const opponent = opp => (opp || '').startsWith('@')
        ? `@ ${opp.slice(1)}` : `vs ${opp || '—'}`;
      // Playoff rows carry SEASON "20-21 Playoffs"; the PO badge already says
      // that, so show the bare season and don't print it twice.
      const seasonOf = r => r.SEASON.replace(' Playoffs', '');
      const po = r => r.gametype === 'PLAYOFF' ? ' <span class="rec-po">PO</span>' : '';
      const whenFull = r => `${opponent(r.OPP)} · ${seasonOf(r)}${po(r)}`;
      // Sub-rows are narrow — the opponent is dropped so the name isn't clipped.
      const whenShort = r => `${seasonOf(r)}${po(r)}`;
      const nameLink = r =>
        `<a href="/players/?p=${encodeURIComponent(r.SLUG)}">${escAttr(displayNameFromBio(r.PLAYER))}</a>`;
      // Values are whole numbers except Game Score, which carries two decimals.
      const val = r => r.STAT === 'GMSC' ? (+r.VALUE).toFixed(1) : String(+r.VALUE);

      const cards = REC_STATS.map(([key, label]) => {
        const rows = byStat.get(key) || [];
        if (!rows.length) return '';
        const [top, ...rest] = rows;
        return `
          <div class="rec-card">
            <div class="rec-stat">${escAttr(label)}</div>
            <div class="rec-top">
              <span class="val">${escAttr(val(top))}</span>
              <span class="who">${nameLink(top)}</span>
            </div>
            <div class="rec-when">${whenFull(top)}</div>
            ${rest.length ? `<div class="rec-rest">${rest.map(r => `
              <div class="rec-row">
                <span class="val">${escAttr(val(r))}</span>
                <span class="who">${nameLink(r)}</span>
                <span class="when">${whenShort(r)}</span>
              </div>`).join('')}</div>` : ''}
          </div>`;
      }).filter(Boolean).join('');

      recordsWrap.innerHTML = cards
        ? `<div class="rec-grid">${cards}</div>`
        : '<div class="status">No games recorded for this franchise yet.</div>';
    }
  }

  const allSeasons = psr.status === 'fulfilled' ? parseCSV(psr.value) : [];
  const latestSeasonBySlug = computeLatestSeasonBySlug(allSeasons);

  // Draft History tab — sourced from player bios (/api/players via biosData),
  // the canonical per-player draft record: draft_team (who made the pick) plus
  // draft_year / draft_round / draft_pick (the slot). This covers every season,
  // pre- and post- the live draft shows; draft_team is stamped on the bio when a
  // pick is entered "for real" (transactions / Article VII). Career stats are
  // joined from player_seasons by SLUG; a just-drafted rookie with no games yet
  // still appears (with zeroed stats).
  {
    draftedWrap.innerHTML = '';
    {
      // Build rights-trade map from transactions (same logic as /draft page):
      // a player's rights were traded if a trade txn moved them as an asset
      // after their pick txn and before their first sign txn.
      const draftPickTxnTime = {}, signTxnTime = {}, rightsHolder = {};
      for (const t of allTxns) {
        if (t.type === 'pick') {
          const s = t.details?.player;
          if (s) draftPickTxnTime[s] = t.created_at;
        }
        if (t.type === 'sign') {
          const s = t.details?.player;
          if (s && !signTxnTime[s]) signTxnTime[s] = t.created_at;
        }
      }
      for (const t of [...allTxns].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        if (t.type === 'trade') {
          for (const transfer of t.details?.transfers || []) {
            for (const asset of transfer.assets || []) {
              const s = asset.type === 'player' && asset.slug;
              if (s && draftPickTxnTime[s]) {
                const afterPick = t.created_at > draftPickTxnTime[s];
                const beforeSign = !signTxnTime[s] || t.created_at < signTxnTime[s];
                if (afterPick && beforeSign) rightsHolder[s] = transfer.to_team;
              }
            }
          }
        }
      }

      // Career totals per drafted player, keyed by slug.
      const careerBySlug = {};
      for (const row of allSeasons) {
        const s = (row.SLUG || '').trim();
        if (!s) continue;
        const c = careerBySlug[s] || (careerBySlug[s] = { G: 0, PTS: 0, REB: 0, AST: 0, GMSC: 0, name: row.PLAYER });
        c.G    += parseInt(row.G) || 0;
        c.PTS  += parseFloat(row.PTS)  || 0;
        c.REB  += parseFloat(row.REB)  || 0;
        c.AST  += parseFloat(row.AST)  || 0;
        c.GMSC += parseFloat(row.GMSC) || 0;
      }

      const makeDraftRow = (slug, bio) => {
        const c = careerBySlug[slug] || { G: 0, PTS: 0, REB: 0, AST: 0, GMSC: 0, name: '' };
        const round = parseInt(bio.draft_round) || 0;
        const pick  = bio.draft_pick != null && bio.draft_pick !== '' ? parseInt(bio.draft_pick) : null;
        const draftTeam = (bio.draft_team || '').toUpperCase();
        return {
          SLUG:        slug,
          PLAYER:      displayNameFromBio(bio.name || '') || c.name || slug,
          YEAR:        parseInt(bio.draft_year) || 0,
          ROUND:       round,
          PICK:        pick ?? 0,
          PICK_LABEL:  `R${round || '?'} · #${pick ?? '?'}`,
          // RIGHTS_TO: rights traded away from this team to another
          // RIGHTS_FROM: rights acquired by this team (drafted by another team)
          RIGHTS_TO:   (draftTeam === abbr && rightsHolder[slug]) ? rightsHolder[slug] : null,
          RIGHTS_FROM: (draftTeam !== abbr) ? draftTeam : null,
          GP:          c.G,
          GMSC_TOT:    Math.round(c.GMSC * 10) / 10,
          PPG:         c.G ? Math.round(c.PTS / c.G * 10) / 10 : 0,
          RPG:         c.G ? Math.round(c.REB / c.G * 10) / 10 : 0,
          APG:         c.G ? Math.round(c.AST / c.G * 10) / 10 : 0,
        };
      };

      const draftedRows = Object.entries(biosData)
        .filter(([slug, bio]) => {
          const draftTeam = (bio.draft_team || '').toUpperCase();
          // Players this team drafted, plus players whose rights were acquired by this team
          return draftTeam === abbr || (rightsHolder[slug] || '').toUpperCase() === abbr;
        })
        .map(([slug, bio]) => makeDraftRow(slug, bio));
      draftedRows.sort((a, b) => a.YEAR - b.YEAR || a.PICK - b.PICK);

      const DRAFTED_COLS = [
        { key: 'PLAYER',    label: 'Player',  cls: 'bold',        sortField: 'PLAYER',    defaultDir:  1 },
        { key: 'YEAR',      label: 'Year',    cls: 'right',       sortField: 'YEAR',      defaultDir:  1 },
        { key: 'PICK_LABEL',label: 'Pick',    cls: 'right muted', sortField: 'PICK',      defaultDir:  1 },
        { key: 'RIGHTS_TO', label: 'Rights',  cls: 'muted',       sortField: 'RIGHTS_TO', defaultDir:  1 },
        { key: 'GP',        label: 'GP',      cls: 'right',       sortField: 'GP',        defaultDir: -1 },
        { key: 'GMSC_TOT',  label: 'GMSC',    cls: 'right',       sortField: 'GMSC_TOT',  defaultDir: -1 },
        { key: 'PPG',       label: 'PPG',     cls: 'right',       sortField: 'PPG',       defaultDir: -1 },
        { key: 'RPG',       label: 'RPG',     cls: 'right',       sortField: 'RPG',       defaultDir: -1 },
        { key: 'APG',       label: 'APG',     cls: 'right',       sortField: 'APG',       defaultDir: -1 },
      ];
      const renderDraftedCell = (td, col, row) => {
        if (col.key === 'PLAYER') {
          const a = document.createElement('a');
          a.href = `/players/?p=${row.SLUG}`;
          a.textContent = row.PLAYER;
          td.appendChild(a);
        } else if (col.key === 'RIGHTS_TO') {
          if (row.RIGHTS_TO) {
            const arrow = document.createElement('span');
            arrow.style.cssText = 'color:var(--link);font-style:italic';
            arrow.textContent = `→ ${row.RIGHTS_TO}`;
            attachTooltip(arrow, 'Draft rights traded away');
            td.appendChild(arrow);
          } else if (row.RIGHTS_FROM) {
            const arrow = document.createElement('span');
            arrow.style.cssText = 'color:var(--link);font-style:italic';
            arrow.textContent = `← ${row.RIGHTS_FROM}`;
            attachTooltip(arrow, 'Draft rights acquired from another team');
            td.appendChild(arrow);
          } else {
            td.textContent = '—';
          }
        } else {
          td.textContent = row[col.key] ?? '—';
        }
      };
      if (draftedRows.length) {
        draftedWrap.appendChild(buildTable(DRAFTED_COLS, draftedRows, 'YEAR', 1, renderDraftedCell));
      } else {
        draftedWrap.innerHTML = '<div class="status">No draft history found.</div>';
      }
    }
  }

  // Historical Rosters tab
  {
    const histWrap     = document.getElementById('hist-roster-wrap');
    const histControls = document.getElementById('hist-controls');
    const availableSeasons = [...new Set(allSeasons.filter(r => r.TEAM === abbr).map(r => r.SEASON))]
      .sort((a, b) => b.localeCompare(a));
    if (availableSeasons.length) {
      const sel = document.createElement('select');
      availableSeasons.forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s;
        sel.appendChild(o);
      });
      histControls.appendChild(sel);
      const renderHistSeason = season => {
        histWrap.innerHTML = '';
        const t = buildHistoricalRoster(allSeasons, abbr, season);
        if (t) {
          const wrap = document.createElement('div');
          wrap.className = 'table-wrap';
          wrap.appendChild(t);
          histWrap.appendChild(wrap);
        } else {
          histWrap.innerHTML = '<div class="status">No stats found for this season.</div>';
        }
      };
      sel.addEventListener('change', () => renderHistSeason(sel.value));
      renderHistSeason(availableSeasons[0]);
    } else {
      const histWrap = document.getElementById('hist-roster-wrap');
      histWrap.innerHTML = '<div class="status">No historical data available.</div>';
    }
  }

  const capEditWrap = document.getElementById('cap-edit-wrap');

  if (rr.status === 'fulfilled') {
    rosterWrap.innerHTML = '';
    const rosterRows = currentRosterRowsParsed;
    const rosterHeaders = parseLine(rr.value.trim().split('\n')[0]);

    // Rosters / Contracts / Stats / Ratings mode switch. `liveRosterRows` tracks the
    // freshest row set (updated after a contracts-mode save) so switching
    // modes afterwards doesn't fall back to stale data. Rosters (the depth
    // chart) is the default view; it must match the .active mode-tab above.
    let rosterMode = 'depth';
    let liveRosterRows = rosterRows;
    // Per-player move menu, only for a viewer who actually has a move available.
    // Offered on both roster views: Rosters is the default tab, so gating it to
    // Contracts alone made the feature invisible to the owners it exists for.
    // Stats and Ratings are analytical views where an actions column is noise.
    const moveActions = makeRosterMoveActions(abbr, biosData, myBlockEntries);
    const MOVE_MODES = ['depth', 'contracts'];
    const renderRoster = rowsForDisplay => buildRosterTable(
      rowsForDisplay, biosData, capLevels, currentOvr, deadCapRows, seasonStates, attributesData, rosterMode, latestSeasonBySlug,
      MOVE_MODES.includes(rosterMode) ? moveActions : null
    );
    function rerenderRosterWrap() {
      rosterWrap.innerHTML = '';
      const t = renderRoster(liveRosterRows);
      if (t) rosterWrap.appendChild(t);
      else rosterWrap.innerHTML = '<div class="status">No roster data.</div>';
    }

    const t = renderRoster(rosterRows);
    if (t) rosterWrap.appendChild(t);
    else rosterWrap.innerHTML = '<div class="status">No roster data.</div>';

    const modeTabsEl = document.getElementById('roster-mode-tabs');
    if (modeTabsEl) {
      modeTabsEl.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          // Switching modes mid-edit would silently discard unsaved changes.
          if (rosterWrap.querySelector('.roster-edit-toolbar')) return;
          if (btn.classList.contains('active')) return;
          modeTabsEl.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          rosterMode = btn.dataset.mode;
          rerenderRosterWrap();
        });
      });
    }

    // Hard cap banner + exceptions section. Apron-level (NTMLE/TMLE) comparisons
    // exclude pure free-agent cap holds (UFA/RFA) — rulebook § 1.3/1.4 — while
    // Room Exception eligibility stays Cap-based and still counts them (§ 3.2).
    // Mirror both figures from the backend's _compute_team_salary(_ex_holds).
    const curYr = currentSeasonYr();
    const { teamSalaryFull, teamSalaryExHolds } = computeCapSummary(rosterRows, deadCapRows, biosData, capLevels, curYr);
    renderHardCapBanner(teamState);
    renderExceptionsSection(teamState, capLevels, teamSalaryFull, teamSalaryExHolds, curYr);
    renderTradeExceptionsSection(tradeExceptions);

    setupWhatIfMode(rosterRows, biosData, capLevels, currentOvr, deadCapRows, seasonStates, attributesData, latestSeasonBySlug, teamState);

    setupEditable('roster-title', 'roster-wrap', rosterHeaders, rosterRows, `/roster/${abbr}`, rows => {
      liveRosterRows = rows;
      return renderRoster(rows);
    }, rosterCellConfig(rosterHeaders, biosData));
    setupTeamSettingsTab('team-settings-wrap', rosterRows, biosData, attributesData);

    setupDeadCapEditable(
      document.getElementById('dead-cap-edit-wrap'),
      deadCapRows, biosData, currentSeasonYr(),
      newRows => {
        deadCapRows.length = 0;
        newRows.forEach(r => deadCapRows.push(r));
        rerenderRosterWrap();
      }
    );

    // Cap numbers edit button (rosters role)
    const token = localStorage.getItem('nbn_token');
    if (canEditRosters()) {
      const season = currentSeasonYr();
      const editCapBtn = document.createElement('button');
      editCapBtn.className = 'edit-toggle-btn';
      editCapBtn.style.cssText = 'margin-top:0.75rem;font-size:0.72rem;padding:0.15rem 0.45rem';
      editCapBtn.textContent = 'Edit Team State';
      capEditWrap.appendChild(editCapBtn);

      let capFormEl = null;
      editCapBtn.addEventListener('click', () => {
        if (capFormEl) { capFormEl.remove(); capFormEl = null; editCapBtn.textContent = 'Edit Team State'; return; }
        capFormEl = document.createElement('div');
        capFormEl.className = 'cap-edit-form';

        const curState = teamState || {};

        // ── Per-season hard cap controls ──────────────────────────────────────
        // Seasons displayed in the roster table: any salary season >= current.
        const capSeasonSet = new Set([season]);
        rosterRows.forEach(r => {
          const bio = biosData[r.SLUG] || {};
          Object.keys(bio.salaries || {}).forEach(k => {
            if (/^\d{2}-\d{2}$/.test(k) && k >= season) capSeasonSet.add(k);
          });
        });
        deadCapRows.forEach(r => Object.keys(r).forEach(k => {
          if (/^\d{2}-\d{2}$/.test(k) && k >= season) capSeasonSet.add(k);
        }));
        const capSeasons = [...capSeasonSet].sort();

        const hcBlock = document.createElement('div');
        hcBlock.style.cssText = 'display:flex;flex-direction:column;gap:0.35rem;width:100%';
        const hcTitle = document.createElement('div');
        hcTitle.textContent = 'Hard Cap (per season)';
        hcTitle.style.cssText = 'font-size:0.72rem;color:var(--text-muted);font-weight:600';
        hcBlock.appendChild(hcTitle);

        // season → { sel, reason } controls, for diffing on save
        const hcControls = {};
        capSeasons.forEach(s => {
          const st = seasonStates[s] || {};
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:0.4rem;align-items:center';
          const lbl = document.createElement('span');
          lbl.textContent = s;
          lbl.style.cssText = 'font-size:0.72rem;color:var(--text-muted);width:3.2rem';
          const sel = document.createElement('select');
          [['', 'None'], ['first_apron', 'First Apron'], ['second_apron', 'Second Apron']].forEach(([v, l]) => {
            const o = document.createElement('option');
            o.value = v; o.textContent = l;
            if (v === (st.hard_cap || '')) o.selected = true;
            sel.appendChild(o);
          });
          const reason = document.createElement('input');
          reason.type = 'text'; reason.placeholder = 'reason';
          reason.value = st.hard_cap_reason || '';
          reason.style.width = '12rem';
          row.appendChild(lbl); row.appendChild(sel); row.appendChild(reason);
          hcBlock.appendChild(row);
          hcControls[s] = { sel, reason };
        });
        capFormEl.appendChild(hcBlock);

        const fMleTypeLbl = document.createElement('label');
        fMleTypeLbl.textContent = 'MLE Type';
        const fMleType = document.createElement('select');
        const curMleType = curState.mle_type === 'room_exception' ? 'room' : curState.mle_type;
        [['', 'Auto (calculated)'], ['room', 'Room Exception'], ['ntmle', 'Non-Taxpayer MLE'], ['tmle', 'Taxpayer MLE']].forEach(([v, l]) => {
          const o = document.createElement('option');
          o.value = v; o.textContent = l;
          if (v === (curMleType || '')) o.selected = true;
          fMleType.appendChild(o);
        });
        fMleTypeLbl.appendChild(fMleType);
        capFormEl.appendChild(fMleTypeLbl);

        const fMleUsedLbl = document.createElement('label');
        fMleUsedLbl.textContent = 'MLE Used ($)';
        const fMleUsed = document.createElement('input');
        fMleUsed.type = 'number'; fMleUsed.placeholder = '0';
        fMleUsed.value = curState.mle_used || 0;
        fMleUsedLbl.appendChild(fMleUsed);
        capFormEl.appendChild(fMleUsedLbl);

        const fBaeUsedLbl = document.createElement('label');
        fBaeUsedLbl.style.cssText = 'flex-direction:row;align-items:center;gap:0.4rem;cursor:pointer';
        const fBaeUsed = document.createElement('input');
        fBaeUsed.type = 'checkbox'; fBaeUsed.checked = !!curState.bae_used;
        fBaeUsedLbl.appendChild(fBaeUsed);
        fBaeUsedLbl.appendChild(document.createTextNode('BAE Used'));
        capFormEl.appendChild(fBaeUsedLbl);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'edit-btn edit-btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.style.cssText = 'align-self:flex-end;margin-top:0.6rem';
        const statusEl = document.createElement('span');
        statusEl.style.cssText = 'font-size:0.72rem;color:var(--danger);align-self:flex-end';
        capFormEl.appendChild(saveBtn);
        capFormEl.appendChild(statusEl);

        saveBtn.addEventListener('click', async () => {
          saveBtn.disabled = true; statusEl.textContent = 'Saving…';

          // One PUT per season that needs writing. Each season's MLE/BAE state is
          // preserved from its existing slot; only the current season's MLE/BAE
          // fields are editable here.
          const puts = [];
          capSeasons.forEach(s => {
            const st = seasonStates[s] || {};
            const newCap = hcControls[s].sel.value || null;
            const newReason = hcControls[s].reason.value.trim();
            const isCur = s === season;
            const capChanged = (st.hard_cap || null) !== newCap || (st.hard_cap_reason || '') !== newReason;
            if (!isCur && !capChanged) return;  // nothing to write for this season
            puts.push({
              season: s,
              body: {
                hard_cap: newCap,
                hard_cap_reason: newReason,
                mle_type: isCur ? (fMleType.value || null) : (st.mle_type || null),
                mle_used: isCur ? (+fMleUsed.value || 0) : (st.mle_used || 0),
                bae_used: isCur ? fBaeUsed.checked : !!st.bae_used,
              },
            });
          });

          try {
            for (const { season: s, body } of puts) {
              const resp = await fetch(`/api/team-state/${abbr}?season=${encodeURIComponent(s)}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              if (resp.status === 403) { statusEl.textContent = 'Not authorized.'; saveBtn.disabled = false; return; }
              if (!resp.ok) throw new Error(`Save failed for ${s}.`);
            }
            location.reload();
          } catch (e) {
            statusEl.textContent = e.message; saveBtn.disabled = false;
          }
        });

        editCapBtn.after(capFormEl);
        editCapBtn.textContent = 'Cancel';
      });
    }
  } else {
    rosterWrap.innerHTML = '<div class="status">Failed to load roster data.</div>';
  }

  if (pkr.status === 'fulfilled') {
    picksWrap.innerHTML = '';
    const allPicks = allpkr.status === 'fulfilled' ? allpkr.value : [];
    const t = buildPicksTable(pkr.value, abbr, allPicks);
    if (t) picksWrap.appendChild(t);
    else picksWrap.innerHTML = '<div class="status">No picks on file.</div>';
    setupPicksEditable('picks-title', picksWrap, pkr.value, abbr, biosData, allPicks);
  } else {
    picksWrap.innerHTML = '<div class="status">Failed to load picks data.</div>';
  }

  const retired = RETIRED_JERSEYS[abbr];
  if (retired?.length) {
    document.getElementById('retired-section').style.display = '';
    const bannersEl = document.getElementById('retired-banners');
    retired.forEach(({ no, player, date }) => {
      const banner = document.createElement('div');
      banner.className = 'retired-banner';
      const [y, m, d] = date.split('-');
      banner.innerHTML = `
        <span class="retired-no">${no}</span>
        <span class="retired-name">${player}</span>
        <span class="retired-date">Ret. ${y}</span>
      `;
      bannersEl.appendChild(banner);
    });
  }
})();
