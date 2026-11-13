// One trade request, drawn as a card, and the buttons on it. Loaded as a plain
// script (its functions are globals) by /committees/trc, which lists every
// request the viewer may see, and /trades/view, which shows one.
// Styles: trade-request.css, next to this file.

const TEAMS = {
  ATL: "Atlanta Hawks", BKN: "Brooklyn Nets", BOS: "Boston Celtics",
  CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "LA Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
};
let me = { name: null, roles: [], owner_of: [] };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function teamName(ab) { return TEAMS[ab] || ab; }

function hasRole(r) { return (me.roles || []).includes(r) || (me.roles || []).includes('admin'); }
function isTrcHead() { return hasRole('trc_head'); }
// Deliberately no admin bypass — a ballot is a judgment call, and neither
// is holding a team's role treated as "you're a party" via admin (an
// admin isn't magically on every team).
function isTrc() { return (me.roles || []).includes('trc') || (me.roles || []).includes('trc_head'); }
// Consent and withdraw take any role for the team (owner, GM, coach), the
// same check the server makes. owner_of still counts, since admin is in it.
function onTeam(ab) { return (me.owner_of || []).includes(ab) || (me.roles || []).includes(ab.toLowerCase()); }
// Teams whose requests this member sees without a trc role.
function myTeams() { return Object.keys(TEAMS).filter(onTeam); }

let toastTimer = null;
function toast(msg, bad) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 4500);
}

function storedToken() { return localStorage.getItem('nbn_token'); }

async function authedFetch(url, opts = {}) {
  const token = storedToken();
  const headers = Object.assign({}, opts.headers || {}, token ? { Authorization: `Bearer ${token}` } : {});
  const res = await fetch(url, Object.assign({}, opts, { headers }));
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.detail === 'string' ? d.detail : (d.detail?.message || `HTTP ${res.status}`));
  }
  return res.json();
}

async function loadMe() {
  const token = storedToken();
  try {
    me = await fetch('/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.json());
    me.roles = me.roles || [];
    me.owner_of = me.owner_of || [];
  } catch (e) {
    me = { name: null, roles: [], owner_of: [] };
  }
}

// Player bios and current OVRs, for naming and pricing the players in a
// trade. Loaded once; a request only ever shows a handful of players.
let BIOS = {};
let OVRS = {};

const ROUND_NAMES = { 1: '1st', 2: '2nd' };
function pickLabel(a) {
  return `${a.year} ${ROUND_NAMES[a.round] || 'R' + a.round} (${a.orig})`;
}

function playerName(slug) {
  const b = BIOS[slug];
  return b && b.name ? nbnPlayerName(b.name) : slug;
}

function lastName(slug) {
  const b = BIOS[slug];
  if (!b || !b.name) return slug;
  const i = b.name.indexOf(',');
  return nbnPlayerName(i === -1 ? b.name : b.name.slice(0, i));
}

function ageOf(dob) {
  if (!dob) return null;
  const d = new Date(dob + 'T00:00:00'), now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}

const money = compactContractMoney;
function fullMoney(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }

// A check's kind. A warning-level check is shown whether or not it
// "passed": the passing ones are notices (an Empty Roster Charge), not
// clearances.
function checkKind(c) {
  if (c.level === 'warning') return 'warning';
  return c.passed ? 'pass' : 'error';
}
const ICON = { error: '<i class="ui-icon ui-icon--x" aria-hidden="true"></i>', warning: '<i class="ui-icon ui-icon--warning" aria-hidden="true"></i>', pass: '<i class="ui-icon ui-icon--check" aria-hidden="true"></i>' };
function issueRow(kind, text) {
  return `<div class="issue ${kind}"><span>${ICON[kind]}</span><span>${esc(text)}</span></div>`;
}

// Every check names its subject at the end of its id — `_hayes-jaxson`,
// `_2027_atl`, `_uta` — so each one can sit next to the player, pick or
// team it is about. Players and picks are tried first, since a pick's id
// also ends in a team abbreviation. Anything left is about the whole trade.
function routeChecks(item) {
  const out = { trade: [], team: {}, asset: {} };
  const slugs = [], picks = [];
  (item.trade.transfers || []).forEach(tr => tr.assets.forEach(a => {
    if (a.type === 'player') slugs.push(a.slug);
    else picks.push(`${a.year}_${String(a.orig).toLowerCase()}`);
  }));
  Object.values(item.trade.releases || {}).forEach(list => list.forEach(s => slugs.push(s)));
  (item.validation.checks || []).forEach(c => {
    const id = c.check || '';
    const slug = slugs.find(s => id.endsWith('_' + s));
    if (slug) { (out.asset[slug] = out.asset[slug] || []).push(c); return; }
    const pk = picks.find(k => id.endsWith('_' + k));
    if (pk) { (out.asset['pick:' + pk] = out.asset['pick:' + pk] || []).push(c); return; }
    const team = item.parties.find(p => id.endsWith('_' + p.toLowerCase()));
    if (team) { (out.team[team] = out.team[team] || []).push(c); return; }
    out.trade.push(c);
  });
  return out;
}

// Short names for a passing check, shown as a chip. The full sentence is
// one tap away in "All checks".
const CHECK_CHIPS = [
  ['hard_cap_league_', 'League hard cap'], ['hard_cap_', 'Hard cap'],
  ['salary_matching_', 'Salary match'], ['roster_size_', 'Roster size'],
  ['trade_limit_', 'Trade count'], ['stepien_rule_', 'Stepien'],
  ['sat_receiving_apron_', 'S&T apron'], ['signing_method_declared_', 'Exception'],
  ['buyout_signing_', 'Buyout'], ['empty_roster_charge_', 'Roster charge'],
];
function chipLabel(id) {
  const hit = CHECK_CHIPS.find(([p]) => id.startsWith(p));
  if (hit) return hit[1];
  const s = id.replace(/_[a-z]{3}$/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Where a salary sits against the cap and aprons, in one phrase. The
// comparing is CapHealth's; the figures are the fact sheet's, which are the
// ones the checks judged.
const TIER = { over_cap: 'Over cap', over_apron1: 'Over 1st apron', over_apron2: 'Over 2nd apron', hard_cap_exceeded: 'Over hard cap' };
function tier(fs, t, full, exHolds) {
  const { warnings } = CapHealth.standing({
    season: fs.season, capLevels: { [fs.season]: fs.cap_levels },
    teamState: { hard_cap: t.hard_cap_level },
    teamSalaryFull: full, teamSalaryExHolds: exHolds,
  });
  const w = warnings.find(x => TIER[x.code]);
  return w ? TIER[w.code] : 'Under cap';
}

function assetRow(a, route, checks, showRoute, season) {
  const issues = (checks || []).filter(c => checkKind(c) !== 'pass')
    .map(c => issueRow(checkKind(c), c.message)).join('');
  const routeTag = showRoute ? `<span class="route">${esc(route)}</span>` : '';
  if (a.type === 'player') {
    const b = BIOS[a.slug] || {};
    const sal = season ? parseContractMoney((b.salaries || {})[season]) : 0;
    const meta = [
      (b.pos || []).join('/'),
      OVRS[a.slug] ? `${OVRS[a.slug]} OVR` : '',
      ageOf(b.dob) != null ? `age ${ageOf(b.dob)}` : '',
      season ? summarizeContract(b, season) : '',
      b.type === 'two-way' ? 'two-way' : '',
      routeTag,
    ].filter(Boolean);
    return `
      <div class="asset">
        <div class="asset-top">
          <a href="/players/?p=${encodeURIComponent(a.slug)}">${esc(playerName(a.slug))}</a>
          ${sal ? `<span class="sal" title="${fullMoney(sal)} in ${esc(season)}">${money(sal)}</span>` : ''}
        </div>
        <div class="asset-meta">${meta.join(' · ')}</div>
        ${issues}
      </div>`;
  }
  if (a.type === 'swap') {
    const meta = [`gets the better of ${esc(pickLabel({ ...a, orig: a.swap_orig }))} and ${esc(pickLabel(a))}`, routeTag].filter(Boolean);
    return `
    <div class="asset">
      <div class="asset-top"><span class="pick">${esc(a.year)} ${esc(ROUND_NAMES[a.round] || 'R' + a.round)} swap rights</span></div>
      <div class="asset-meta">${meta.join(' · ')}</div>
    </div>`;
  }
  const terms = [];
  if (a.protection) terms.push(`top-${a.protection} protected`);
  if (a.swap_with) terms.push(`swap with ${esc(a.swap_with)}`);
  if (a.ladder_protect_top) terms.push(`top-${a.ladder_protect_top} protected, else ${
    (a.ladder_fallback || []).map(f => esc(pickLabel(f))).join(' + ') || 'fallback'}`);
  const meta = [...terms, routeTag].filter(Boolean);
  return `
    <div class="asset">
      <div class="asset-top"><span class="pick">${esc(pickLabel(a))} pick</span></div>
      ${meta.length ? `<div class="asset-meta">${meta.join(' · ')}</div>` : ''}
      ${issues}
    </div>`;
}

function teamPanel(item, team, routed, live) {
  const many = item.parties.length > 2;
  const fs = live ? item.validation.fact_sheet : null;
  const t = fs && fs.teams ? fs.teams[team] : null;
  const season = fs ? fs.season : null;
  const gets = [], sends = [];
  (item.trade.transfers || []).forEach(tr => tr.assets.forEach(a => {
    const key = a.type === 'player' ? a.slug : `pick:${a.year}_${String(a.orig).toLowerCase()}`;
    if (tr.to_team === team) gets.push(assetRow(a, `from ${tr.from_team}`, routed.asset[key], many, season));
    if (tr.from_team === team) sends.push(assetRow(a, `to ${tr.to_team}`, routed.asset[key], many, season));
  }));
  const released = (item.trade.releases || {})[team] || [];

  const c = item.consents[team] || {};
  const consent = c.consented
    ? `<span class="tp-consent yes"><i class="ui-icon ui-icon--check" aria-hidden="true"></i> consented · ${esc(c.by)}</span>`
    : `<span class="tp-consent no">awaiting consent</span>`;

  let html = `
    <div class="tp" data-team="${esc(team)}">
      <div class="tp-head"><span class="tp-name">${esc(teamName(team))}</span>${consent}</div>
      <div class="tp-sec"><span>Receives</span>${t ? `<span class="amt">${money(t.incoming_salary)} in</span>` : ''}</div>
      ${gets.join('') || '<div class="tp-none">Nothing</div>'}
      <div class="tp-sec"><span>Sends</span>${t ? `<span class="amt">${money(t.outgoing_salary)} out</span>` : ''}</div>
      ${sends.join('') || '<div class="tp-none">Nothing</div>'}`;

  if (released.length) {
    html += `<div class="tp-sec"><span>Releases after the trade</span></div>` +
      released.map(s => assetRow({ type: 'player', slug: s }, '', routed.asset[s], false, season)).join('');
  }

  // How this team pays for what it takes in, when it isn't plain matching.
  const exc = (item.trade.exceptions || {})[team];
  const tpe = (item.trade.tpe_usage || {})[team];
  const excPlayers = (item.trade.exception_players || {})[team] || [];
  const sat = (item.trade.sign_and_trade_players || []).filter(s => item.trade.transfers.some(tr => tr.to_team === team && tr.assets.some(a => a.slug === s)));

  if (t) {
    const delta = t.projected_salary - t.current_salary;
    const before = tier(fs, t, t.current_salary, t.current_salary_ex_holds);
    const after = tier(fs, t, t.projected_salary, t.projected_salary_ex_holds);
    const hardCap = t.hard_cap_level === 'first_apron' ? '1st apron' : t.hard_cap_level === 'second_apron' ? '2nd apron' : null;
    html += `
      <div class="money">
        <span class="lbl">Salary</span>
        <span class="val" title="${fullMoney(t.current_salary)} → ${fullMoney(t.projected_salary)}">${money(t.current_salary)} → <b>${money(t.projected_salary)}</b>
          ${delta ? `<span class="${delta > 0 ? 'up' : 'down'}">(${delta > 0 ? '+' : ''}${money(delta)})</span>` : ''}</span>
        <span class="lbl">Cap</span>
        <span class="val">${before === after ? esc(after) : `${esc(before)} → <b>${esc(after)}</b>`}</span>
        ${hardCap ? `<span class="sub">Hard-capped at the ${hardCap} (${money(t.hard_cap_limit)})</span>` : ''}
        <span class="lbl">Roster</span>
        <span class="val">${t.standard_count_before} → <b>${t.standard_count_after}</b> players</span>
        ${exc ? `<span class="lbl">Absorbs</span><span class="val">${esc(exc.toUpperCase().replace('ROOM_EXCEPTION', 'Room exception'))}${excPlayers.length ? ` (${excPlayers.map(lastName).map(esc).join(', ')})` : ''}</span>` : ''}
        ${tpe ? `<span class="lbl">Absorbs</span><span class="val">Trade exception</span>` : ''}
        ${sat.length ? `<span class="lbl">S&amp;T</span><span class="val">${sat.map(lastName).map(esc).join(', ')}</span>` : ''}
      </div>`;
  }

  if (live) {
    const checks = routed.team[team] || [];
    const problems = checks.filter(x => checkKind(x) !== 'pass');
    const passes = checks.filter(x => checkKind(x) === 'pass');
    if (problems.length) html += `<div class="issues">${problems.map(x => issueRow(checkKind(x), x.message)).join('')}</div>`;
    if (passes.length) html += `<div class="chips">${passes.map(x => `<span class="chip" title="${esc(x.message)}"><i class="ui-icon ui-icon--check" aria-hidden="true"></i> ${esc(chipLabel(x.check))}</span>`).join('')}</div>`;
  }
  return html + '</div>';
}

// The collapsed card's one line: who ends up with what.
function gist(item) {
  return item.parties.map(team => {
    const got = [];
    (item.trade.transfers || []).forEach(tr => {
      if (tr.to_team !== team) return;
      tr.assets.forEach(a => got.push(a.type === 'player' ? lastName(a.slug) : pickLabel(a)));
    });
    const shown = got.length > 3 ? got.slice(0, 3).join(', ') + ` +${got.length - 3}` : (got.join(', ') || 'nothing');
    return `<b>${esc(team)}</b> gets ${esc(shown)}`;
  }).join(' · ');
}

function steps(item, approveCount) {
  const consented = Object.values(item.consents).filter(c => c.consented).length;
  const total = Object.keys(item.consents).length;
  const s = item.status;
  const consentState = s === 'awaiting_consent' ? 'now' : 'done';
  const voteState = s === 'awaiting_consent' ? '' : (s === 'balloting' ? 'now' : 'done');
  const finState = s === 'finalized' ? 'done' : (s === 'ready_to_finalize' ? 'now' : '');
  return `<div class="steps">
    <span class="step ${consentState}">Consent ${consented}/${total}</span>
    <span class="step ${voteState}">Votes ${approveCount}/3</span>
    <span class="step ${finState}">Finalize</span>
  </div>`;
}

function verdict(item) {
  const v = item.validation;
  const all = v.checks || [];
  const errors = all.filter(c => checkKind(c) === 'error');
  const warnings = all.filter(c => checkKind(c) === 'warning');
  const blockers = [...(v.ownership_problems || [])];
  if (blockers.length) {
    return `<div class="verdict bad"><b>Can't be finalized.</b> An asset is no longer where this trade expects it:<ul>${
      blockers.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  }
  if (errors.length) {
    return `<div class="verdict bad"><b>Illegal right now</b> — ${errors.length} failed check${errors.length === 1 ? '' : 's'}, shown in red below.</div>`;
  }
  if (warnings.length) {
    return `<div class="verdict warn"><b>Legal</b>, with ${warnings.length} warning${warnings.length === 1 ? '' : 's'} below.</div>`;
  }
  return `<div class="verdict ok"><b>Legal.</b> Every check passes.</div>`;
}

function renderBallots(item) {
  const entries = Object.entries(item.ballots || {});
  if (!entries.length) return '<p class="empty">No votes yet.</p>';
  return entries.map(([member, b]) => `
    <div class="ballot-row">
      <span class="${b.decision === 'approve' ? 'yes' : 'no'}">${b.decision === 'approve' ? '<i class="ui-icon ui-icon--check" aria-hidden="true"></i> Approve' : '<i class="ui-icon ui-icon--x" aria-hidden="true"></i> Reject'}</span>
      · ${esc(member)}
      <div class="note">${esc(b.note)}</div>
    </div>`).join('');
}

// `balloting` is the stored status; the page calls it voting.
const STATUS_LABELS = { balloting: 'voting' };
const STATUS_TONE = { balloting: ' ui-badge--warning', ready_to_finalize: ' ui-badge--success', finalized: ' ui-badge--success', rejected: ' ui-badge--danger', withdrawn: ' ui-badge--danger' };
const sentence = t => t.charAt(0).toUpperCase() + t.slice(1);
function statusBadge(item) {
  return `<span class="ui-badge${STATUS_TONE[item.status] || ''}">${sentence(STATUS_LABELS[item.status] || item.status.replace(/_/g, ' '))}</span>`;
}

// The page a request lives on. Inbox notices and #trc-alerts link here.
function tradeHref(item) { return `/trades/view/?id=${encodeURIComponent(item.id)}`; }

// `single`: the request is the whole page, so it starts open and has no link
// to itself.
function renderRequest(item, terminal, single) {
  const parties = item.parties.join(item.parties.length === 2 ? ' ⇄ ' : ' · ');
  const stale = !item.validation.legal;
  const canBallot = isTrc() && ['balloting', 'ready_to_finalize'].includes(item.status);
  const canFinalize = isTrcHead() && item.status === 'ready_to_finalize';
  const canReject = isTrcHead() && !terminal;
  const ownedParties = item.parties.filter(onTeam);
  const canWithdraw = !terminal && (ownedParties.length > 0 || isTrcHead());
  const pendingMine = ownedParties.filter(p => !(item.consents[p] || {}).consented);
  const canConsent = item.status === 'awaiting_consent' && pendingMine.length > 0;

  const approveCount = Object.values(item.ballots || {}).filter(b => b.decision === 'approve').length;
  // Legality is checked against today's rosters, so it only means
  // something while the request is open. A finished trade shows the deal.
  const live = !terminal;
  const routed = routeChecks(item);
  const issueCount = live ? (item.validation.checks || []).filter(c => checkKind(c) !== 'pass').length
    + (item.validation.ownership_problems || []).length : 0;

  let body = '';
  if (live) body += steps(item, approveCount) + verdict(item);
  body += `<div class="teams">${item.parties.map(t => teamPanel(item, t, routed, live)).join('')}</div>`;

  if (live) {
    const tradeIssues = routed.trade.filter(c => checkKind(c) !== 'pass');
    if (tradeIssues.length) body += `<h3>Whole trade</h3>${tradeIssues.map(c => issueRow(checkKind(c), c.message)).join('')}`;
    const all = item.validation.checks || [];
    body += `
      <details class="all-checks">
        <summary>All ${all.length} checks, in full</summary>
        ${all.map(c => issueRow(checkKind(c), c.message)).join('')}
      </details>`;
  }

  body += `<h3>Votes · ${approveCount} of 3 approvals</h3>${renderBallots(item)}`;

  if (canBallot) {
    body += `
    <div class="ballot-form" data-ballot-form="${item.id}">
      <textarea class="ballot-note" placeholder="Your reasoning (required). Judge fairness; legality is checked above."></textarea>
      <button type="button" class="ballot-submit" data-decision="approve" data-id="${item.id}"><i class="ui-icon ui-icon--check" aria-hidden="true"></i> Approve</button>
      <button type="button" class="ballot-submit" data-decision="reject" data-id="${item.id}"><i class="ui-icon ui-icon--x" aria-hidden="true"></i> Reject</button>
    </div>`;
  }

  const actions = [];
  const hasOwnershipProblems = (item.validation.ownership_problems || []).length > 0;
  const hasReleaseProblems = (item.validation.release_problems || []).length > 0;
  if (canConsent) actions.push(`<button type="button" class="primary" data-act="consent" data-id="${item.id}">Consent for ${esc(pendingMine.map(teamName).join(', '))}</button>`);
  if (canFinalize) actions.push(`<button type="button" class="primary" data-act="finalize" data-id="${item.id}" data-stale="${stale}" data-has-ownership-problems="${hasOwnershipProblems}" data-has-release-problems="${hasReleaseProblems}">Finalize${stale ? ' (illegal — override required)' : ''}</button>`);
  if (canReject) actions.push(`<button type="button" class="danger" data-act="reject" data-id="${item.id}">Reject</button>`);
  if (canWithdraw) actions.push(`<button type="button" data-act="withdraw" data-id="${item.id}">Withdraw</button>`);
  if (actions.length) body += `<div class="req-actions">${actions.join('')}</div>`;

  if (item.finalized) body += `<p class="sub">Finalized by ${esc(item.finalized.by)}${item.finalized.trade_number ? ` as Trade ${item.finalized.trade_number}` : ''} — <a href="/transactions#${esc(item.finalized.txn_id)}">view transaction</a></p>`;
  if (item.rejected) body += `<p class="sub">Rejected by ${esc(item.rejected.by)}: ${esc(item.rejected.reason)}</p>`;
  if (item.withdrawn) body += `<p class="sub">Withdrawn by ${esc(item.withdrawn.by)}${item.withdrawn.reason ? ': ' + esc(item.withdrawn.reason) : ''}</p>`;
  body += `<p class="sub">Proposed by ${esc(item.created_by)} on ${esc((item.created_at || '').slice(0, 10))}${
    single ? '' : ` · <a href="${tradeHref(item)}">This trade's page</a>`}</p>`;

  // An open request starts expanded when this member has something to do on it.
  const mine = canConsent || canFinalize || (canBallot && !(item.ballots || {})[me.name]);
  const title = item.finalized?.trade_number ? `Trade ${item.finalized.trade_number}` : `Request #${item.number}`;
  return `
    <details class="req"${single || (live && mine) ? ' open' : ''}>
      <summary>
        <div class="req-head">
          <span class="req-num">${esc(title)}</span>
          <span class="req-parties">${esc(parties)}</span>
          ${statusBadge(item)}
          ${live && item.status !== 'awaiting_consent' ? `<span class="ui-badge">${approveCount}/3 votes</span>` : ''}
          ${live && stale ? '<span class="ui-badge ui-badge--danger">Illegal now</span>' : (issueCount ? `<span class="ui-badge ui-badge--warning"><i class="ui-icon ui-icon--warning" aria-hidden="true"></i> ${issueCount}</span>` : '')}
        </div>
        <div class="req-gist">${gist(item)}</div>
      </summary>
      <div class="req-body">${body}</div>
    </details>`;
}

// `reload` redraws the page after any action succeeds.
function wireActions(reload) {
  document.querySelectorAll('.ballot-submit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const form = btn.closest('[data-ballot-form]');
      const decision = btn.dataset.decision;
      const note = form.querySelector('.ballot-note').value.trim();
      if (!note) { toast('A note is required.', true); return; }
      try {
        await authedFetch(`/api/trade-requests/${btn.dataset.id}/ballot`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, note }),
        });
        toast('Vote recorded.');
        await reload();
      } catch (e) { toast(e.message, true); }
    });
  });

  document.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      try {
        if (act === 'consent') {
          await authedFetch(`/api/trade-requests/${id}/consent`, { method: 'POST' });
          toast('Consent recorded.');
        } else if (act === 'withdraw') {
          const reason = prompt('Reason for withdrawing (optional):') || '';
          await authedFetch(`/api/trade-requests/${id}/withdraw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          });
          toast('Request withdrawn.');
        } else if (act === 'reject') {
          const reason = prompt('Reason for rejecting (required):');
          if (!reason) return;
          await authedFetch(`/api/trade-requests/${id}/reject`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          });
          toast('Request rejected.');
        } else if (act === 'finalize') {
          const stale = btn.dataset.stale === 'true';
          const hasOwnershipProblems = btn.dataset.hasOwnershipProblems === 'true';
          const hasReleaseProblems = btn.dataset.hasReleaseProblems === 'true';
          let body = {};
          if (hasReleaseProblems) {
            alert('One of this trade\'s releases can\'t happen (see the red box on the card), and that can\'t be overridden. The trade needs to be re-proposed without it.');
            return;
          }
          if (hasOwnershipProblems) {
            alert('This trade involves an asset that is no longer where it expects it to be (see the red box on the card) — that can\'t be overridden, since finalizing would corrupt real roster/pick data. The trade needs to be re-proposed instead.');
            return;
          }
          if (stale) {
            const reason = prompt('This trade currently fails one or more legality checks (see above). Finalizing anyway requires a reason for the record:');
            if (!reason || !reason.trim()) return;
            body = { force: true, override_reason: reason.trim() };
          } else {
            if (!confirm('Finalizing executes this trade for real — rosters, picks and the transaction ledger update immediately, and it posts to #transactions. Continue?')) return;
          }
          await authedFetch(`/api/trade-requests/${id}/finalize`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          toast('Trade finalized.');
        }
        await reload();
      } catch (e) { toast(e.message, true); }
    });
  });
}
