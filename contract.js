// =============================================================================
// contract.js — shared contract vocabulary and shorthand
// =============================================================================
// One definition of what a contract year can be, and one function that turns a
// contract into the "2+1 PO, $150M" shorthand the site shows everywhere.
//
// Before this existed the same grammar was written out three times — in
// teams/team.js (summarizeContract), pdc/index.html (shorthand) and
// nbn-api/routers/discord_notify.py (_contract_str) — with the latter two
// carrying comments saying they mirrored the first. Divergent shorthand for the
// same deal is worse than none, and a mirror maintained by comment drifts the
// first time someone edits one copy.
//
// The Python one can't import this; it stays a deliberate mirror, pinned to the
// same cases by nbn-api/tests/test_contract_shorthand.py.
//
// Loaded as a classic script; every name below is a plain global. team.js pulls
// it in dynamically (see `contractReady` there) because team pages are 11-line
// shells that load only team.js. Other pages use a normal <script> tag.
//
//   CONTRACT_HOLD_TYPES   the cap_holds vocabulary, in display order
//   CONTRACT_TAGS         hold type -> short tag (PO / TO / NG)
//   isFaHold              is this a UFA/RFA free-agent hold?
//   parseContractMoney    "$1,234" -> 1234
//   compactContractMoney  16000000 -> "$16M"
//   parseCapHoldMap       object, or legacy "yr:type,yr:type" string, -> object
//   summarizeContract     the shorthand
// =============================================================================

// The single vocabulary. `value` is what goes in `cap_holds`; `label` is the
// long form for a form control; `tag` is the short form used in shorthand
// (null where the year isn't tagged at all).
const CONTRACT_HOLD_TYPES = [
  { value: '',           label: 'Guaranteed',     short: '—',          tag: null, faHold: false },
  { value: 'UFA',        label: 'UFA Hold',       short: 'UFA',        tag: null, faHold: true  },
  { value: 'RFA',        label: 'RFA Hold',       short: 'RFA',        tag: null, faHold: true  },
  { value: 'PLAYER_OPT', label: 'Player Option',  short: 'Player Opt', tag: 'PO', faHold: false },
  { value: 'TEAM_OPT',   label: 'Team Option',    short: 'Team Opt',   tag: 'TO', faHold: false },
  { value: 'NON_GTD',    label: 'Non-Guaranteed', short: 'Non-Gtd',    tag: 'NG', faHold: false },
];

const CONTRACT_TAGS = CONTRACT_HOLD_TYPES.reduce((m, t) => {
  if (t.tag) m[t.value] = t.tag;
  return m;
}, {});

// UFA/RFA are the two that end a deal rather than describing a year of it.
const _FA_HOLD_TYPES = CONTRACT_HOLD_TYPES.filter(t => t.faHold).map(t => t.value);
function isFaHold(type) { return _FA_HOLD_TYPES.indexOf(type) !== -1; }

function parseContractMoney(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

function compactContractMoney(n) {
  if (!n) return '$0';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n >= 1e6) return sign + '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return sign + '$' + Math.round(n / 1e3) + 'K';
  return sign + '$' + Math.round(n);
}

// cap_holds is a `{season: type}` object in player-bios.json, but the legacy
// roster CSV format carried it as a "27-28:PLAYER_OPT,28-29:UFA" string and
// team.js still reads those rows.
function parseCapHoldMap(val) {
  if (val && typeof val === 'object') return val;
  const map = {};
  if (!val) return map;
  String(val).split(',').forEach(pair => {
    const [yr, type] = pair.split(':');
    if (yr && type) map[yr.trim()] = type.trim();
  });
  return map;
}

// One-line contract summary: guaranteed years, then any option / non-guaranteed
// years, then total remaining money — "2+1 PO, $150M". Years run from `season`
// forward.
//
// A trailing UFA/RFA line is the cap hold the deal *rolls into*, not a contract
// year, so it ends the deal — or is the whole story, when the player has nothing
// but a hold. Counting it would add a phantom year and inflate the total on
// every deal that has one.
//
// `contract` is `{salaries, cap_holds}`; both may use the legacy string form of
// cap_holds. Returns '—' when there's nothing from `season` onward.
//
// Omit `season` to summarize the **whole** deal from its own first year — what
// a transaction-log row wants, since it records the contract as signed rather
// than what is left of it today. Pass a season for the roster/review reading,
// "what this player is still owed from here".
function summarizeContract(contract, season) {
  const sals = (contract && contract.salaries) || {};
  const caps = parseCapHoldMap(contract && contract.cap_holds);
  const all = Object.keys(sals)
    .filter(k => /^\d{2}-\d{2}$/.test(k) && sals[k] !== '' && sals[k] != null)
    .sort();
  if (!season) season = all[0];
  const years = all.filter(k => k >= season);
  if (!years.length) return '—';

  if (isFaHold(caps[years[0]])) {
    // Placeholder holds carry a nominal $1 — a figure worth hiding, not showing.
    const amt = parseContractMoney(sals[years[0]]);
    return `${caps[years[0]]} hold` + (amt >= 1000 ? `, ${compactContractMoney(amt)}` : '');
  }

  const deal = [];
  for (const k of years) {
    if (isFaHold(caps[k])) break;
    deal.push({ year: k, tag: CONTRACT_TAGS[caps[k]] || null });
  }

  let base = 0;
  while (base < deal.length && !deal[base].tag) base++;

  // Everything after the guaranteed run, collapsed into runs of like years.
  const extras = [];
  for (let i = base; i < deal.length;) {
    const tag = deal[i].tag;
    let n = 0;
    while (i < deal.length && deal[i].tag === tag) { n++; i++; }
    extras.push(n + (tag ? ' ' + tag : ''));
  }

  let yrs;
  if (!extras.length)  yrs = `${base} yr${base === 1 ? '' : 's'}`;
  else if (base === 0) yrs = extras.join('+');
  else                 yrs = `${base}+${extras.join('+')}`;

  const total = deal.reduce((sum, d) => sum + parseContractMoney(sals[d.year]), 0);
  return total ? `${yrs}, ${compactContractMoney(total)}` : yrs;
}

// Node (the Python-mirror test harness and any future build script) rather than
// a browser. Guarded so the browser path stays a plain classic script.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONTRACT_HOLD_TYPES, CONTRACT_TAGS, isFaHold,
    parseContractMoney, compactContractMoney, parseCapHoldMap, summarizeContract,
  };
}
