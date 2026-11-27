// =============================================================================
// news/rankings/rankings.js — the power-rankings workspace
// =============================================================================
// Everything that happens to a power-rankings article between "created" and
// "published": the author invites voters and moves the phase along, voters rank
// all 30 teams, and once voting closes the consensus appears. Claiming a team
// to write its blurb opens earlier than that, at `voting`, on its own board
// under the ballot (renderBlurbBoard) — so writing does not queue behind the
// whole vote. The published article itself is rendered by
// news/view/index.html — this page is only the workshop.
//
// The phases mirror the API's (routers/news_rankings.py), which is the only
// place the rules actually live. This page never computes a consensus or
// decides who may do what: it renders what `GET /api/news/{id}` returns and
// lets the server refuse anything it shouldn't allow. That matters most for
// the blind-ballot rule — while voting is open the API simply doesn't send
// other people's ballots, so there is nothing here to leak by accident.
// =============================================================================

const API = '/api';

const TEAMS = NBN.TEAMS;
const ABBRS = Object.keys(TEAMS);

const state = {
  id: new URLSearchParams(location.search).get('id'),
  article: null,
  me: null,             // { name, roles } or null
  members: null,        // every member name, for resolving what an author types
  order: null,          // the ballot being edited, local until submitted
  rosters: null,        // ABBR -> [slug], every roster in one fetch
  bios: null,
  ovr: null,
  details: {},          // ABBR -> GET /api/home/team/{abbr}, fetched on demand
  summary: null,        // ABBR -> this season at a glance (loadSummary)
  injuries: null,       // ABBR -> [injury rows]
  openDrawers: new Set(),  // ABBRs whose roster drawers are expanded — a set,
                           // because ranking is comparing, and two rosters side
                           // by side is the whole reason the drawer exists
  openContext: new Set(),  // the same, for the blurb board and consensus rows
  flash: null,          // ABBR just moved, briefly highlighted so the eye can find it
  editingBlurb: null,   // ABBR whose blurb textarea is open
};

// ── small helpers ────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const getToken = () => localStorage.getItem('nbn_token');
const escHtml = NBN.esc;

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A draft is minutes old, not days — "Aug 24" would read as stale when it is
// thirty seconds fresh. Today gets a clock, anything older gets the date too.
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? clock : `${fmtDate(iso)}, ${clock}`;
}

function logo(abbr) {
  return `<img src="/logos/sm/logo-${abbr.toLowerCase()}.webp" alt="" loading="lazy">`;
}

async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (opts.body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, Object.assign({}, opts, { headers }));
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

// Minimal CSV reader — same shape the other pages use. Rankings only ever reads
// two well-formed generated files, so it doesn't need quoted-field handling.
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

// ── who is looking ───────────────────────────────────────────────────────────

// The author runs their own ranking; curator/bod/admin can run anyone's. This
// only decides what controls to *draw* — every one of them is re-checked by the
// API, which is what actually enforces it.
function isEditor() {
  const a = state.article, me = state.me;
  if (!a || !me) return false;
  if (a.author === me.name) return true;
  return (me.roles || []).some(r => ['curator', 'bod', 'admin'].includes(r));
}
const isVoter = () => !!state.article?.viewer_is_voter;

// ── rendering ────────────────────────────────────────────────────────────────

// Mirrors BLURB_PHASES in nbn-api's news_rankings.py — the server is the gate,
// this only decides whether to draw a button that would be refused.
const BLURB_PHASES = ['voting', 'blurbs'];

// Mirrors MAX_BLURB_LEN in news_rankings.py — again the server is the gate; this
// is here so the wall arrives as a counter rather than as a rejected save.
const MAX_BLURB_LEN = 2500;
const BLURB_NEAR = 150;        // characters left before the counter goes amber

const PHASE_LABEL = {
  setup: 'Setting up', voting: 'Voting open', blurbs: 'Writing blurbs', final: 'Ready to publish',
};

function render() {
  const a = state.article;
  $('loading').style.display = 'none';
  $('content').style.display = '';

  const phase = a.status === 'published' ? 'published' : (a.phase || 'setup');
  $('phase-badge').innerHTML = a.status === 'published'
    ? '<span class="ui-badge ui-badge--success">Published</span>'
    : `<span class="ui-badge${{ voting: ' ui-badge--accent', blurbs: ' ui-badge--warning', final: ' ui-badge--success' }[a.phase] || ''}">${escHtml(PHASE_LABEL[a.phase] || a.phase)}</span>`;
  $('pr-title').textContent = a.title || 'Untitled';

  const bits = [];
  if (a.edition) bits.push(`Edition #${a.edition}`);
  bits.push(`by ${escHtml(a.author)}`);
  if (a.series_id && a.series_id !== 'main') bits.push(`series “${escHtml(a.series_id)}”`);
  const bp = a.ballot_progress || {};
  bits.push(`${(bp.submitted || []).length} of ${bp.voters || 0} ballots in`);
  // The way back to the compose page. The workspace only holds the ballot, the
  // blurbs and the phase; the headline, intro and cover live in the editor, and
  // the intro is usually written *here*, once the consensus is on the screen.
  // PATCH has no phase or status gate, so this is live at every phase and after
  // publish too — where it is the only route to editing the piece.
  if (isEditor()) {
    bits.push(`<a href="/news/new/?id=${encodeURIComponent(state.id)}">`
      + `Edit intro &amp; cover</a>`);
  }
  $('pr-sub').innerHTML = bits.join('<span class="sep">·</span>');

  renderAuthorPanel();
  renderMain(phase);
}

// ── author panel ─────────────────────────────────────────────────────────────

function renderAuthorPanel() {
  const host = $('author-panel');
  if (!isEditor() || state.article.status === 'published') { host.innerHTML = ''; return; }
  const a = state.article;
  const bp = a.ballot_progress || {};
  const blp = a.blurb_progress || {};

  // The invite list stays editable through voting, not just setup: someone
  // always turns up late, and the alternative — reopening, or going without
  // them — is worse than adding them to a vote already in progress. It closes
  // at `blurbs`, where the ballots are revealed and the consensus is on screen;
  // changing who voted after everyone has read the result is a different act.
  const canEditVoters = a.phase === 'setup' || a.phase === 'voting';

  const chips = (a.voters || []).map(name => {
    // Three states, because "hasn't submitted" covers both someone who is
    // half-way down their ballot and someone who never opened it — and those
    // want opposite things from an author.
    const done = (bp.submitted || []).includes(name);
    const started = !done && (bp.started || []).includes(name);
    const mark = done ? '<span class="tick"><i class="ui-icon ui-icon--check" aria-hidden="true"></i></span>'
      : started ? '<span class="part" title="Started a ballot, not submitted">◐</span>' : '';
    return `<span class="chip ${done ? 'done' : started ? 'started' : ''}"`
      + (started ? ' title="Part-way through — started but not submitted"' : '')
      + `>${mark}${escHtml(name)}`
      + (canEditVoters ? `<button title="Remove" onclick="removeVoter('${escHtml(name)}')">×</button>` : '')
      + `</span>`;
  }).join('');

  let controls = '', note = '';
  if (a.phase === 'setup') {
    controls = `<button class="btn-primary" onclick="setPhase('voting')" ${(a.voters || []).length ? '' : 'disabled'}>Open the ballot</button>`;
    note = 'Voters can\'t see each other\'s ballots until you close voting.';
  } else if (a.phase === 'voting') {
    const pending = (bp.pending || []);
    const started = (bp.started || []);
    controls = `<button class="btn-primary" onclick="setPhase('blurbs')" ${(bp.submitted || []).length ? '' : 'disabled'}>Close voting &amp; reveal</button>`;
    note = (pending.length
      ? `Still waiting on ${pending.map(escHtml).join(', ')}.`
        + (started.length
          ? ` ${started.map(escHtml).join(', ')} ${started.length === 1 ? 'has' : 'have'} a ballot part-way through — worth a nudge rather than closing on them.`
          : '')
        + ' Closing now counts only the ballots that are in.'
      : 'Everyone has voted.')
      + ' You can still add a voter — they just have to rank before you close.';
  } else {
    controls = `<button class="btn-success" onclick="doPublish()">Publish edition</button>`
      + ` <button class="btn-secondary" onclick="setPhase('voting')">Reopen voting</button>`;
    note = `${blp.written || 0} of ${blp.total || 30} blurbs written`
      + (blp.unwritten?.length ? ` · ${blp.unwritten.length} team${blp.unwritten.length === 1 ? '' : 's'} still unwritten` : '')
      + '. Publishing freezes the order — later ballot edits won\'t change it.';
  }

  host.innerHTML = `
    <div class="panel">
      <div class="panel-title">Author controls</div>
      <div class="chips">${chips || '<span class="empty">No voters invited yet.</span>'}
        ${canEditVoters ? `<input class="voter-input" id="voter-input" list="member-list" placeholder="Add a voter by name…">
          <datalist id="member-list"></datalist>
          <button class="btn-secondary btn-tiny" onclick="addVoter()">Add</button>` : ''}
      </div>
      <div class="row-actions">${controls}
        <a class="btn-secondary" href="/news/view/?id=${encodeURIComponent(state.id)}" target="_blank"
           title="Opens the published page as it stands — same renderer, nothing hidden">Preview</a>
        <span class="status-msg" id="author-status"></span></div>
      <div class="panel-note" style="margin-top:0.6rem;">${note}</div>
    </div>`;

  if (canEditVoters) {
    loadMemberList();
    $('voter-input').addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      // Enter is also how a datalist suggestion is accepted, and the browser
      // writes it into the input *after* keydown — reading the value here gets
      // the prefix that was typed ("Sam" for "Samm"), which is then rejected as
      // an unknown member. One tick's delay lets the selection land first.
      setTimeout(addVoter, 0);
    });
  }
}

async function loadMemberList() {
  try {
    const members = await api('/members/public');
    state.members = members.map(m => m.name);
    const list = $('member-list');
    if (!list) return;
    const already = new Set(state.article.voters || []);
    list.innerHTML = members.filter(m => !already.has(m.name))
      .map(m => `<option value="${escHtml(m.name)}">`).join('');
  } catch { /* the picker is a convenience; typing a name still works */ }
}

async function saveVoters(voters) {
  const el = $('author-status');
  if (el) { el.textContent = 'Saving…'; el.className = 'status-msg'; }
  try {
    state.article = await api(`/news/${state.id}/rankings/voters`, {
      method: 'PUT', body: JSON.stringify({ voters }),
    });
    render();
  } catch (e) {
    if (el) { el.textContent = e.message; el.className = 'status-msg err'; }
  }
}

function addVoter() {
  const input = $('voter-input');
  const typed = input.value.trim();
  if (!typed) return;
  // Resolve what was typed against the real member list, so a difference in
  // case reaches the API as the name it knows rather than as a rejection. With
  // no list loaded (the fetch is allowed to fail) the typed name goes as-is and
  // the API is the judge, which is what it is anyway.
  const known = state.members || [];
  const match = known.find(n => n.toLowerCase() === typed.toLowerCase());
  if (known.length && !match) {
    const el = $('author-status');
    if (el) {
      el.textContent = `No member named “${typed}” — pick one from the list.`;
      el.className = 'status-msg err';
    }
    return;
  }
  input.value = '';
  saveVoters([...(state.article.voters || []), match || typed]);
}

function removeVoter(name) {
  // Dropping a voter drops their ballot with them (set_voters, API side), so a
  // stray × on someone who has already ranked destroys a submitted ballot. That
  // is the one case worth stopping to ask about.
  const voted = (state.article.ballot_progress?.submitted || []).includes(name);
  if (voted && !confirm(`${name} has already voted.\n\n`
      + `Removing them discards their ballot, and it can't be recovered — `
      + `they would have to rank all 30 teams again.`)) return;
  saveVoters((state.article.voters || []).filter(v => v !== name));
}

async function setPhase(phase) {
  const el = $('author-status');
  if (el) { el.textContent = 'Working…'; el.className = 'status-msg'; }
  try {
    state.article = await api(`/news/${state.id}/rankings/phase`, {
      method: 'POST', body: JSON.stringify({ phase }),
    });
    state.order = null;      // the ballot is rebuilt from whatever the new phase shows
    render();
  } catch (e) {
    if (el) { el.textContent = e.message; el.className = 'status-msg err'; }
  }
}

async function doPublish() {
  const blp = state.article.blurb_progress || {};
  const warn = blp.unwritten?.length
    ? `\n\n${blp.unwritten.length} team${blp.unwritten.length === 1 ? ' has' : 's have'} no blurb yet.`
    : '';
  if (!confirm(`Publish this edition?${warn}\n\nThe order is frozen at publish and announced to Discord.`)) return;
  const el = $('author-status');
  el.textContent = 'Publishing…'; el.className = 'status-msg';
  try {
    await api(`/news/${state.id}/publish`, { method: 'POST', body: JSON.stringify({}) });
    location.href = `/news/view/?id=${state.id}`;
  } catch (e) {
    el.textContent = e.message; el.className = 'status-msg err';
  }
}

// ── main panel ───────────────────────────────────────────────────────────────

function renderMain(phase) {
  const host = $('main-panel');
  if (phase === 'voting') {
    if (isVoter()) { renderBallot(host); renderBlurbBoard(host); return; }
    host.innerHTML = `<div class="panel"><div class="panel-title">Voting in progress</div>
      <div class="panel-note">Ballots are blind until the author closes voting. ${
        (state.article.ballot_progress?.submitted || []).length} of ${
        state.article.ballot_progress?.voters || 0} are in.</div></div>`;
    if (isEditor()) renderBlurbBoard(host);
    return;
  }
  if (phase === 'setup') {
    host.innerHTML = `<div class="panel"><div class="panel-title">Not open yet</div>
      <div class="panel-note">The author is still setting this edition up. You'll be able to rank once the ballot opens.</div></div>`;
    return;
  }
  renderConsensus(host);
}

// ── the ballot ───────────────────────────────────────────────────────────────

// The working order is saved twice over: to the server as a draft (so it
// follows someone from their phone to their desk) and to localStorage (so a
// reload, or a dead connection, still can't cost them thirty drags). The
// server copy wins on load, being the one that can be newer than this browser.
const draftKey = () => `nbn_pr_draft_${state.id}`;

const isFullOrder = o => Array.isArray(o) && o.length === 30 && o.every(t => TEAMS[t]);

function initOrder() {
  if (state.order) return;
  const mine = state.article.ballots?.[state.me?.name]?.order;
  if (isFullOrder(mine)) { state.order = mine.slice(); return; }
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    if (isFullOrder(saved)) { state.order = saved; return; }
  } catch { /* fall through to a fresh ballot */ }
  // Last edition's finish — the API works it out (`seed_order`) precisely so
  // nobody has to drag thirty rows to say "much the same as last week".
  // Alphabetical is the floor under that, not the starting point.
  const seed = state.article.seed_order;
  state.order = isFullOrder(seed) ? seed.slice() : ABBRS.slice();
}

// Autosave. Debounced, because this fires on every drag and every ▲▼.
let draftTimer = null, draftDirty = false;

function saveDraft() {
  try { localStorage.setItem(draftKey(), JSON.stringify(state.order)); } catch { /* private mode */ }
  draftDirty = true;
  setBallotStatus('Saving…');
  clearTimeout(draftTimer);
  draftTimer = setTimeout(pushDraft, 700);
}

async function pushDraft() {
  if (!draftDirty || !isVoter()) return;
  draftDirty = false;
  try {
    // Deliberately no re-render: this lands mid-drag, and rebuilding the list
    // under someone's cursor would be worse than a stale author panel.
    state.article = await api(`/news/${state.id}/rankings/ballot/draft`, {
      method: 'PUT', body: JSON.stringify({ order: state.order }),
    });
    setBallotStatus(ballotStatusText());
  } catch (e) {
    draftDirty = true;            // keep it dirty so the next edit retries
    setBallotStatus(`Not saved to the server — ${e.message}`, 'err');
  }
}

// Leaving the tab — closing it, or locking the phone — is exactly the moment a
// debounce is about to lose something. `keepalive` lets the request outlive the
// page; a plain fetch here would be cancelled on unload.
function flushDraft() {
  if (!draftDirty || !isVoter()) return;
  draftDirty = false;
  const token = getToken();
  if (!token) return;
  try {
    fetch(`${API}/news/${state.id}/rankings/ballot/draft`, {
      method: 'PUT', keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ order: state.order }),
    });
  } catch { /* nothing useful to do on the way out */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushDraft();
});
window.addEventListener('pagehide', flushDraft);

function ballotStatusText() {
  const b = state.article.ballots?.[state.me?.name] || {};
  if (b.submitted_at) {
    return `Submitted ${escHtml(fmtDate(b.submitted_at))} · edits save as you go until voting closes`;
  }
  if (b.saved_at) {
    return `Draft saved ${escHtml(fmtTime(b.saved_at))} · not submitted, and only you can see it`;
  }
  return 'Not submitted yet — your order is saved as you go';
}

function setBallotStatus(text, cls) {
  const el = $('ballot-status');
  if (el) { el.innerHTML = text; el.className = `status-msg${cls ? ' ' + cls : ''}`; }
}

function renderBallot(host) {
  initOrder();
  const mine = state.article.ballots?.[state.me?.name] || {};
  const hasSeed = isFullOrder(state.article.seed_order);
  host.innerHTML = `
    <div class="panel">
      <div class="panel-title">Your ballot</div>
      <div class="panel-note">Rank all 30 from best to worst: drag a team by its handle, tap its
        number to type a new rank, or use ▲▼. Tap a team to open its roster, last five games
        and injuries — open as many as you want to compare. Your order saves as you go, so you
        can finish on another device; it only counts once you submit, and nobody else sees it
        while voting is open.</div>
      <div class="ballot-tools">
        <span class="tools-label">Start from</span>
        ${hasSeed ? `<button class="btn-secondary btn-tiny" onclick="startFrom('last')">Last edition</button>` : ''}
        <button class="btn-secondary btn-tiny" data-needs-summary onclick="startFrom('standings')" ${state.summary ? '' : 'disabled'}>Standings</button>
        <button class="btn-secondary btn-tiny" data-needs-summary onclick="startFrom('model')" ${state.summary ? '' : 'disabled'}
          title="The playoff-odds model's team rating, the same one the homepage card ranks by">Model rating</button>
        <span class="tools-sep"></span>
        <button class="btn-secondary btn-tiny" onclick="toggleAllDrawers()" id="toggle-all">${state.openDrawers.size ? 'Close all' : 'Open all'}</button>
      </div>
    </div>
    <div class="ballot-list" id="ballot-list"></div>
    <div class="sticky-save">
      <span class="status-msg" id="ballot-status">${ballotStatusText()}</span>
      <button class="btn-primary" onclick="submitBallot()">${mine.submitted_at ? 'Update ballot' : 'Submit ballot'}</button>
    </div>`;
  drawBallotRows();
}

function drawBallotRows() {
  const list = $('ballot-list');
  if (!list) return;
  list.innerHTML = state.order.map((abbr, i) => `
    <div class="brow${state.flash === abbr ? ' moved' : ''}${state.openDrawers.has(abbr) ? ' open' : ''}" data-abbr="${abbr}" data-i="${i}">
      <span class="brow-grip" title="Drag to move" aria-hidden="true">⋮⋮</span>
      <button class="brow-rank" onclick="editRank(${i})" title="Type a new rank">${i + 1}</button>
      <div class="brow-team" onclick="toggleDrawer('${abbr}')" role="button" tabindex="0"
           aria-expanded="${state.openDrawers.has(abbr)}">
        ${logo(abbr)}
        <span class="brow-name">${escHtml(TEAMS[abbr])}</span>
        <span class="brow-abbr">${abbr}</span>
      </div>
      <div class="brow-stats" data-sum="${abbr}" data-variant="row">${summaryHtml(abbr, 'row')}</div>
      <div class="brow-btns">
        <button onclick="move(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Up" aria-label="Move up">▲</button>
        <button onclick="move(${i}, 1)" ${i === 29 ? 'disabled' : ''} title="Down" aria-label="Move down">▼</button>
      </div>
    </div>
    ${state.openDrawers.has(abbr) ? `<div class="roster-drawer" id="drawer-${abbr}">Loading…</div>` : ''}
  `).join('');
  state.flash = null;
  wireDrag(list);
  list.querySelectorAll('.brow-team').forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  }));
  state.openDrawers.forEach(abbr => fillDrawer(abbr, $(`drawer-${abbr}`)));
  const t = $('toggle-all');
  if (t) t.textContent = state.openDrawers.size ? 'Close all' : 'Open all';
}

function moveTo(from, to) {
  to = Math.max(0, Math.min(state.order.length - 1, to));
  if (from === to) return;
  const [moved] = state.order.splice(from, 1);
  state.order.splice(to, 0, moved);
  state.flash = moved;
  saveDraft();
  drawBallotRows();
}

function move(i, delta) { moveTo(i, i + delta); }

// Typing a rank is the phone's answer to a long drag: moving a team from 24th
// to 6th is eighteen ▲ taps, or one number.
function editRank(i) {
  const row = document.querySelector(`.brow[data-i="${i}"]`);
  const btn = row?.querySelector('.brow-rank');
  if (!btn) return;
  const input = document.createElement('input');
  input.type = 'number'; input.min = 1; input.max = 30; input.inputMode = 'numeric';
  input.className = 'brow-rank-input'; input.value = i + 1;
  input.setAttribute('aria-label', `New rank for ${TEAMS[state.order[i]]}`);
  btn.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = apply => {
    if (done) return;
    done = true;
    const n = parseInt(input.value, 10);
    if (apply && n >= 1 && n <= 30 && n !== i + 1) moveTo(i, n - 1);
    else drawBallotRows();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// A starting point, so nobody has to drag thirty rows to say "roughly the
// standings". It replaces the working order, so ask first if there is one.
function startFrom(kind) {
  let next = null;
  if (kind === 'last') next = state.article.seed_order?.slice();
  else if (state.summary) {
    const S = state.summary;
    const pct = t => (S[t]?.w + S[t]?.l) ? S[t].w / (S[t].w + S[t].l) : 0;
    next = ABBRS.slice().sort(kind === 'standings'
      ? (a, b) => pct(b) - pct(a) || (S[b]?.diff ?? 0) - (S[a]?.diff ?? 0) || a.localeCompare(b)
      : (a, b) => (S[b]?.rating ?? -99) - (S[a]?.rating ?? -99) || a.localeCompare(b));
  }
  if (!isFullOrder(next)) return;
  if (next.join() === state.order.join()) return;
  const label = { last: 'last edition\'s finish', standings: 'the current standings', model: 'the model rating' }[kind];
  if (!confirm(`Reorder your ballot to ${label}?\n\nThis replaces the order you have now.`)) return;
  state.order = next;
  saveDraft();
  drawBallotRows();
}

// Pointer events rather than HTML5 drag-and-drop, which never fires on a
// touch screen — that left a phone with nothing but ▲▼. The handle starts a
// drag at once (touch or mouse); a mouse can also drag from anywhere on the
// row once it has moved a few pixels, so a plain click still opens the roster.
let drag = null;
let suppressClickUntil = 0;
document.addEventListener('click', e => {
  if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); }
}, true);

function wireDrag(list) {
  list.querySelectorAll('.brow').forEach(row => {
    row.addEventListener('pointerdown', e => {
      if (e.button !== 0 || drag) return;
      const onGrip = !!e.target.closest('.brow-grip');
      if (!onGrip && (e.pointerType !== 'mouse' || e.target.closest('button, input, a'))) return;
      drag = { row, list, startY: e.clientY, y: e.clientY, active: false, raf: 0 };
      if (onGrip) { e.preventDefault(); beginDrag(); }
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', endDrag);
      document.addEventListener('pointercancel', endDrag);
    });
  });
}

function beginDrag() {
  drag.active = true;
  drag.before = drag.row.dataset.abbr;
  drag.row.classList.add('dragging');
  document.body.classList.add('is-dragging');
  // The dragged team's own drawer would be left behind at the old spot.
  const dr = $(`drawer-${drag.row.dataset.abbr}`);
  if (dr) dr.style.display = 'none';
  const tick = () => {
    if (!drag?.active) return;
    const edge = 70;
    if (drag.y < edge) { window.scrollBy(0, -Math.ceil((edge - drag.y) / 5)); placeDragged(); }
    else if (drag.y > innerHeight - edge) { window.scrollBy(0, Math.ceil((drag.y - innerHeight + edge) / 5)); placeDragged(); }
    drag.raf = requestAnimationFrame(tick);
  };
  drag.raf = requestAnimationFrame(tick);
}

function onDragMove(e) {
  if (!drag) return;
  drag.y = e.clientY;
  if (!drag.active) {
    if (Math.abs(e.clientY - drag.startY) < 5) return;
    beginDrag();
  }
  e.preventDefault();
  placeDragged();
}

function placeDragged() {
  const { row, list, y } = drag;
  const others = [...list.querySelectorAll('.brow')].filter(r => r !== row);
  const target = others.find(r => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
  if (target) { if (row.nextElementSibling !== target) list.insertBefore(row, target); }
  else if (list.lastElementChild !== row) list.appendChild(row);
}

function endDrag() {
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', endDrag);
  document.removeEventListener('pointercancel', endDrag);
  const d = drag;
  drag = null;
  if (!d) return;
  cancelAnimationFrame(d.raf);
  document.body.classList.remove('is-dragging');
  if (!d.active) return;
  // The click that ends a mouse drag would otherwise toggle the roster.
  suppressClickUntil = Date.now() + 250;
  const next = [...d.list.querySelectorAll('.brow')].map(r => r.dataset.abbr);
  if (next.join() !== state.order.join()) {
    state.order = next;
    state.flash = d.before;
    saveDraft();
  }
  drawBallotRows();
}

async function submitBallot() {
  clearTimeout(draftTimer);       // this write supersedes the pending draft
  draftDirty = false;
  const el = $('ballot-status');
  el.textContent = 'Submitting…'; el.className = 'status-msg';
  try {
    state.article = await api(`/news/${state.id}/rankings/ballot`, {
      method: 'PUT', body: JSON.stringify({ order: state.order }),
    });
    try { localStorage.removeItem(draftKey()); } catch { /* private mode */ }
    el.textContent = 'Ballot submitted.'; el.className = 'status-msg ok';
    renderAuthorPanel();
  } catch (e) {
    el.textContent = e.message; el.className = 'status-msg err';
  }
}

// ── team context: the season line and the drawer ────────────────────────────
// The same drawer opens from a ballot row, a blurb-board or consensus row, and
// sits beside an open blurb editor: whoever is ranking or writing about a team
// wants the same few things in front of them.

function toggleDrawer(abbr) {
  if (!state.openDrawers.delete(abbr)) state.openDrawers.add(abbr);
  drawBallotRows();
}

function toggleAllDrawers() {
  if (state.openDrawers.size) state.openDrawers.clear();
  else state.order.forEach(t => state.openDrawers.add(t));
  drawBallotRows();
}

// This season at a glance, for all 30 teams in three league-wide fetches: the
// playoff-odds run (record, rating, odds), the standings file (seed, net
// rating) and the season's game index (last 10 and streak). Context only —
// every view works without it and fills in when it lands.
async function loadSummary() {
  try {
    const odds = await fetch('/api/playoff-odds').then(r => r.ok ? r.json() : null);
    const season = odds?.season;
    const [standRes, gamesRes, injRes] = await Promise.allSettled([
      fetch('/standings/standings-history.csv').then(r => r.ok ? r.text() : null),
      season ? fetch(`/api/boxscores/games?season=${encodeURIComponent(season)}`).then(r => r.ok ? r.json() : []) : [],
      fetch('/api/injuries').then(r => r.ok ? r.json() : null),
    ]);
    const stand = {};
    if (standRes.status === 'fulfilled' && standRes.value) {
      NBN.parseCSV(standRes.value).forEach(r => { if (r.SEASON === season && r.TEAM) stand[r.TEAM] = r; });
    }
    const games = gamesRes.status === 'fulfilled' ? (gamesRes.value || []) : [];
    const ratingRank = {};
    (odds?.teams || []).slice().sort((a, b) => b.rating - a.rating).forEach((t, i) => { ratingRank[t.team] = i + 1; });
    const seed = state.article.seed_order;
    const lastRank = isFullOrder(seed) ? Object.fromEntries(seed.map((t, i) => [t, i + 1])) : {};
    const S = {};
    ABBRS.forEach(t => {
      const o = (odds?.teams || []).find(x => x.team === t) || {};
      const st = stand[t] || {};
      const f = formOf(games, t);
      S[t] = {
        w: o.w ?? (st.W !== undefined ? +st.W : null), l: o.l ?? (st.L !== undefined ? +st.L : null),
        seed: st.SEED || '', diff: st.DIFF !== undefined && st.DIFF !== '' ? +st.DIFF : null,
        rating: o.rating ?? null, ratingRank: ratingRank[t] || null,
        playoffs: o.playoffs ?? null, title: o.title ?? null,
        l10: f?.l10 || '', streak: f?.streak || '', last: lastRank[t] || null,
      };
    });
    state.summary = S;
    state.injuries = {};
    if (injRes.status === 'fulfilled' && injRes.value) {
      (injRes.value.players || []).forEach(p => { (state.injuries[p.team] ||= []).push(p); });
    }
    fillSummaries();
  } catch { /* context only */ }
}

// Last 10 and streak, regular season, newest first. Same reading as
// PowerRank.form on the homepage card.
function formOf(games, team) {
  const mine = games.filter(g => g && g.gametype !== 'PLAYOFF'
      && (g.home_team === team || g.away_team === team) && g.home_score !== g.away_score)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!mine.length) return null;
  const won = mine.map(g => (g.home_team === team) === (g.home_score > g.away_score));
  let n = 1;
  while (n < won.length && won[n] === won[0]) n++;
  const ten = won.slice(0, 10), w = ten.filter(Boolean).length;
  return { streak: (won[0] ? 'W' : 'L') + n, l10: `${w}-${ten.length - w}` };
}

const fmtDiff = d => d == null || isNaN(d) ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
const seedShort = s => (s || '').replace(/^(East|West)-/, (m, c) => c[0]);

// `row` is the ballot's columns; `line` is one compact line under a team name.
function summaryHtml(abbr, variant) {
  const s = state.summary?.[abbr];
  if (!s) return '';
  const rec = s.w != null ? `${s.w}-${s.l}` : '';
  const diffCls = s.diff > 0 ? 'pos' : s.diff < 0 ? 'neg' : '';
  const strkCls = s.streak.startsWith('W') ? 'pos' : s.streak.startsWith('L') ? 'neg' : '';
  if (variant === 'row') {
    return `<span class="st st-rec" title="Record">${rec}</span>`
      + `<span class="st st-seed" title="Seed">${escHtml(seedShort(s.seed))}</span>`
      + `<span class="st st-l10" title="Last 10">${s.l10 ? `<em>L10</em> ${s.l10}` : ''}</span>`
      + `<span class="st st-strk ${strkCls}" title="Streak">${s.streak}</span>`
      + `<span class="st st-diff ${diffCls}" title="Point differential per game">${fmtDiff(s.diff)}</span>`
      + `<span class="st st-last" title="Rank in the last edition">${s.last ? `<em>was</em> ${s.last}` : ''}</span>`;
  }
  return [rec && `${rec}${s.seed ? ` (${escHtml(seedShort(s.seed))})` : ''}`,
    s.l10 && `L10 ${s.l10}`,
    s.streak && `<span class="${strkCls}">${s.streak}</span>`,
    s.diff != null && `<span class="${diffCls}">${fmtDiff(s.diff)}</span>`].filter(Boolean).join(' · ');
}

function fillSummaries() {
  document.querySelectorAll('[data-sum]').forEach(el => {
    el.innerHTML = summaryHtml(el.dataset.sum, el.dataset.variant);
  });
  document.querySelectorAll('[data-needs-summary]').forEach(b => { b.disabled = !state.summary; });
  // Drawers opened before the summary landed can now show their header.
  document.querySelectorAll('.roster-drawer[data-team]').forEach(el => fillDrawer(el.dataset.team, el));
}

// One team page's worth of season data (results, saved five, per-player
// averages). Fetched one at a time — "Open all" asks for 30, and the box is
// small — and kept for the visit.
let detailQueue = Promise.resolve();
function loadDetail(abbr) {
  if (state.details[abbr]) return state.details[abbr];
  state.details[abbr] = detailQueue = detailQueue.catch(() => {}).then(() =>
    fetch(`/api/home/team/${abbr}`).then(r => r.ok ? r.json() : null));
  return state.details[abbr];
}

async function loadRosters() {
  if (!state.rosters) {
    state.rosters = (async () => {
      const [rosters, bios, ovr] = await Promise.all([
        fetch('/api/rosters/slugs').then(r => r.ok ? r.json() : {}),
        fetch('/api/players').then(r => r.ok ? r.json() : {}),
        fetch('/api/ovr/current').then(r => r.ok ? r.json() : {}),
      ]);
      state.bios = bios; state.ovr = ovr;
      return rosters;
    })();
  }
  return state.rosters;
}

function ageOf(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d)) return '';
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

const playerName = raw => (typeof nbnPlayerName === 'function' ? nbnPlayerName(raw) : raw);

async function fillDrawer(abbr, host) {
  if (!host) return;
  host.dataset.team = abbr;
  let rosters, detail;
  try {
    [rosters, detail] = await Promise.all([loadRosters(), loadDetail(abbr).catch(() => null)]);
  } catch { host.textContent = 'Could not load this team.'; return; }
  if (!host.isConnected) return;         // closed while fetching

  const lines = detail?.lines || {};
  const rows = (rosters[abbr] || []).map(slug => {
    const bio = state.bios[slug] || {};
    return { slug, name: playerName(bio.name || slug), pos: bio.pos || [], _posList: bio.pos || [],
             OVR: state.ovr[slug] ?? '', age: ageOf(bio.dob), type: bio.type || '', line: lines[slug] };
  }).filter(p => p.type !== 'dead' && p.type !== 'draft-rights');

  // The team's saved five when it has one, else the best legal five.
  let five = (detail?.five?.players || []).map(p => p.slug);
  if (!five.length && typeof computeStartingFive === 'function') {
    five = computeStartingFive(rows).filter(Boolean).map(p => p.slug);
  }
  const starterIdx = Object.fromEntries(five.map((s, i) => [s, i]));
  const mins = p => p.line?.min ?? -1;
  rows.sort((a, b) => {
    const sa = starterIdx[a.slug], sb = starterIdx[b.slug];
    if (sa !== undefined || sb !== undefined) return (sa ?? 99) - (sb ?? 99);
    return mins(b) - mins(a) || (parseFloat(b.OVR) || 0) - (parseFloat(a.OVR) || 0);
  });

  const s = state.summary?.[abbr];
  const kpis = s ? [
    ['Record', s.w != null ? `${s.w}-${s.l}` : '–', s.seed ? s.seed.replace('-', ' ') : ''],
    ['Last 10', s.l10 || '–', s.streak ? `streak ${s.streak}` : ''],
    ['Net', fmtDiff(s.diff) || '–', 'pts / game'],
    ['Model', s.ratingRank ? `#${s.ratingRank}` : '–', s.rating != null ? `rating ${s.rating > 0 ? '+' : ''}${s.rating}` : ''],
    ['Playoffs', s.playoffs != null ? `${Math.round(s.playoffs * 100)}%` : '–', s.title != null ? `title ${(s.title * 100).toFixed(1)}%` : ''],
  ] : [];

  const results = (detail?.results || []).filter(g => g.home_score !== g.away_score).slice(0, 5).map(g => {
    const home = g.home_team === abbr;
    const us = home ? g.home_score : g.away_score, them = home ? g.away_score : g.home_score;
    const opp = home ? g.away_team : g.home_team;
    const won = us > them;
    return `<span class="res ${won ? 'pos' : 'neg'}" title="${escHtml(g.date)}"><b>${won ? 'W' : 'L'}</b> ${us}-${them} ${home ? 'vs' : '@'} ${opp}</span>`;
  }).join('');

  const inj = (state.injuries?.[abbr] || []).map(p =>
    `<span class="inj"><b>${escHtml(p.name || p.slug)}</b> ${escHtml(p.status || '')}${p.injury ? ` · ${escHtml(p.injury)}` : ''}${p.duration ? ` (${escHtml(p.duration)})` : ''}</span>`).join('');

  const f1 = v => v == null ? '' : Number(v).toFixed(1);
  host.innerHTML = `
    ${kpis.length ? `<div class="dr-kpis">${kpis.map(([k, v, sub]) =>
      `<div class="dr-kpi"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${sub}</span></div>`).join('')}</div>` : ''}
    ${results ? `<div class="dr-line"><span class="dr-lbl">Last 5</span>${results}</div>` : ''}
    ${inj ? `<div class="dr-line"><span class="dr-lbl">Injured</span>${inj}</div>` : ''}
    ${rows.length ? `<table>
      <thead><tr><th></th><th>Player</th><th>Pos</th><th class="num">OVR</th><th class="num wide">Age</th>
        <th class="num wide">MIN</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th></tr></thead>
      <tbody>${rows.map(p => {
        const si = starterIdx[p.slug];
        return `<tr class="${si !== undefined ? 'starter' : ''}">
          <td class="slot">${si !== undefined ? DEPTH_SLOTS[si] || '' : ''}</td>
          <td class="pname"><a href="/players/?p=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${escHtml(p.name)}</a>${p.type === 'two-way' ? ' <span class="tw">2W</span>' : ''}</td>
          <td>${escHtml(p.pos.join('/'))}</td><td class="num">${escHtml(p.OVR)}</td><td class="num wide">${p.age}</td>
          <td class="num wide">${f1(p.line?.min)}</td><td class="num">${f1(p.line?.pts)}</td>
          <td class="num">${f1(p.line?.reb)}</td><td class="num">${f1(p.line?.ast)}</td>
        </tr>`; }).join('')}
      </tbody></table>` : '<div class="empty">No roster on file.</div>'}
    <div class="dr-foot"><a href="/teams/${abbr}/" target="_blank" rel="noopener">${escHtml(TEAMS[abbr])} team page ↗</a></div>`;
}

// ── consensus and blurbs ─────────────────────────────────────────────────────

function moveCell(row) {
  if (row.prev == null) return '<span class="move-new">new</span>';
  if (row.move > 0) return `<span class="move-up">▲${row.move}</span>`;
  if (row.move < 0) return `<span class="move-down">▼${Math.abs(row.move)}</span>`;
  return '<span class="move-flat">–</span>';
}

// Blurbs open at `voting`, so this is the claim board for that phase — the same
// blurb cells the consensus table carries, on a plain alphabetical list of all
// 30 teams.
//
// Alphabetical, and with no rank, average or vote count anywhere, because the
// consensus is exactly what a voter must not see mid-vote: ordering this board
// by the standing would leak through the back door the thing `redact` closes at
// the front. (`a.consensus` is null here for a voter anyway — the server does
// not send it — so there is nothing to order it by even by accident.)
function renderBlurbBoard(host) {
  const wrap = document.createElement('div');
  wrap.id = 'blurb-board';
  wrap.innerHTML = blurbBoardInner();
  host.appendChild(wrap);
  fillContexts();
}

function blurbBoardInner() {
  return `
    <div class="panel">
      <div class="panel-title">Blurbs</div>
      <div class="panel-note">Claim a team and write it whenever you like — you don't have to
        wait for voting to close. Tap a team for its roster and recent games.</div>
      ${myClaimsHtml()}
      ${openClaimsHtml()}
    </div>
    <table class="ctable">
      <thead><tr><th>Team</th><th>Blurb</th></tr></thead>
      <tbody>${Object.keys(TEAMS).sort().map(team => {
        const b = state.article.blurbs?.[team] || {};
        return `<tr>
          <td class="team-td">${teamCell(team)}</td>
          <td>${renderBlurbCell(team, b)}</td>
        </tr>${contextRow(team, b, 2)}${blurbEditorRow(team, b, 2)}`;
      }).join('')}</tbody>
    </table>`;
}

// The teams this viewer has claimed, as jump links — with thirty rows, finding
// your own two is otherwise a scroll-and-squint.
function myClaimsHtml() {
  const me = state.me?.name;
  if (!me) return '';
  const mine = Object.entries(state.article.blurbs || {}).filter(([, b]) => b.claimed_by === me)
    .map(([t, b]) => [t, b]).sort(([a], [b]) => a.localeCompare(b));
  if (!mine.length) return '';
  return `<div class="my-claims"><span class="tools-label">Your teams</span>${mine.map(([t, b]) =>
    `<button class="claim-chip${b.body ? ' done' : ''}" onclick="editBlurb('${t}')" title="${b.body ? 'Written — tap to edit' : 'Not written yet'}">`
    + `${logo(t)}${t}${b.body ? ' <i class="ui-icon ui-icon--check" aria-hidden="true"></i>' : ''}</button>`).join('')}</div>`;
}

// Every team nobody has claimed yet, so a voter looking for one to write sees
// them at a glance instead of scanning thirty rows for a Claim button. A team
// released with text still on it counts as open: the API lets anyone claim it.
// Tapping a chip claims the team (giving it back is one button on the row).
function openClaimsHtml() {
  if (!BLURB_PHASES.includes(state.article.phase)) return '';
  const blurbs = state.article.blurbs || {};
  const open = Object.keys(TEAMS).sort().filter(t => !blurbs[t]?.claimed_by);
  if (!open.length) return '<div class="my-claims"><span class="tools-label">Up for grabs</span><span class="blurb-open">Every team is claimed</span></div>';
  const canClaim = isVoter() || isEditor();
  return `<div class="my-claims"><span class="tools-label">Up for grabs · ${open.length}</span>${open.map(t =>
    canClaim
      ? `<button class="claim-chip open" onclick="claimBlurb('${t}')" title="Claim ${escHtml(TEAMS[t])}">${logo(t)}${t}</button>`
      : `<span class="claim-chip">${logo(t)}${t}</span>`).join('')}</div>`;
}

function teamCell(team, extra = '') {
  return `<div class="team-cell team-toggle" onclick="toggleContext('${team}')" role="button" tabindex="0"
      aria-expanded="${state.openContext.has(team)}" title="Roster and recent games">
    ${logo(team)}<div class="team-txt"><span class="team-nm">${escHtml(TEAMS[team])}</span>
    <span class="team-sub" data-sum="${team}" data-variant="line">${summaryHtml(team, 'line')}</span>${extra}</div>
  </div>`;
}

// The open blurb editor carries its own copy of the team context, so the
// standalone row is skipped for that team rather than shown twice.
function contextRow(team, b, cols) {
  if (!state.openContext.has(team)) return '';
  if (state.editingBlurb === team && canWriteBlurb(b)) return '';
  return `<tr class="ctx-row"><td colspan="${cols}"><div class="roster-drawer" data-ctx="${team}">Loading…</div></td></tr>`;
}

function toggleContext(team) {
  if (!state.openContext.delete(team)) state.openContext.add(team);
  redrawBlurbs();
}

document.addEventListener('keydown', e => {
  const t = e.target.closest?.('.team-toggle');
  if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); }
});

function fillContexts() {
  document.querySelectorAll('.roster-drawer[data-ctx]').forEach(el => fillDrawer(el.dataset.ctx, el));
}

// Opening or closing a blurb editor redraws only the blurbs. During voting the
// ballot is sitting right above them, and re-rendering it to open a textarea
// would rebuild thirty draggable rows for no reason. Falls back to the whole
// panel in the `blurbs` phase, where the cells live in the consensus table.
function redrawBlurbs() {
  const board = document.getElementById('blurb-board');
  if (board) { board.innerHTML = blurbBoardInner(); fillContexts(); }
  else renderMain(state.article.phase);
}

function renderConsensus(host) {
  const a = state.article;
  const rows = a.consensus || [];
  if (!rows.length) {
    host.innerHTML = '<div class="panel"><div class="empty">No ballots in yet.</div></div>';
    return;
  }
  host.innerHTML = `
    <div class="panel">
      <div class="panel-title">Consensus · ${rows[0].votes} ballot${rows[0].votes === 1 ? '' : 's'}</div>
      <div class="panel-note">Average rank across every submitted ballot. Teams level on
        the average share a rank (T) — nobody sets the order by hand.
        ${isVoter() || isEditor() ? 'Claim a team to write its blurb. ' : ''}Tap a team for its roster and recent games.</div>
      ${myClaimsHtml()}
      ${openClaimsHtml()}
    </div>
    <table class="ctable ctable-consensus">
      <thead><tr>
        <th style="text-align:right">#</th><th class="c-move"></th><th>Team</th>
        <th class="c-wide" style="text-align:right">Avg</th><th class="c-wide" style="text-align:right">Hi/Lo</th>
        <th class="c-wide" style="text-align:right">1st</th><th>Blurb</th>
      </tr></thead>
      <tbody>${rows.map(r => renderConsensusRow(r)).join('')}</tbody>
    </table>`;
  fillContexts();
}

function renderConsensusRow(r) {
  const b = state.article.blurbs?.[r.team] || {};
  // On a phone the three number columns fold into a line under the team.
  const narrow = `<span class="c-narrow">${moveCell(r)} avg ${r.avg.toFixed(2)} · ${r.hi}–${r.lo}${r.firsts ? ` · ${r.firsts}× 1st` : ''}</span>`;
  return `<tr>
    <td class="rank">${r.tied ? 'T-' : ''}${r.rank}</td>
    <td class="c-move" style="text-align:right">${moveCell(r)}</td>
    <td class="team-td">${teamCell(r.team, narrow)}</td>
    <td class="num c-wide">${r.avg.toFixed(2)}</td>
    <td class="num c-wide">${r.hi}–${r.lo}</td>
    <td class="num c-wide">${r.firsts || ''}</td>
    <td>${renderBlurbCell(r.team, b)}</td>
  </tr>${contextRow(r.team, b, 7)}${blurbEditorRow(r.team, b, 7)}`;
}

function canWriteBlurb(b) { return b.claimed_by === state.me?.name || isEditor(); }

// A maxlength on its own is a silent wall — it stops taking keystrokes and says
// nothing, which reads like the box broke. The counter is the announcement.
function blurbCountNear(n) { return MAX_BLURB_LEN - n <= BLURB_NEAR; }
function blurbCountText(n) { return `${n.toLocaleString()} / ${MAX_BLURB_LEN.toLocaleString()}`; }

function updateBlurbCount(team) {
  const ta = $(`blurb-input-${team}`), el = $(`blurb-count-${team}`);
  if (!ta || !el) return;
  el.textContent = blurbCountText(ta.value.length);
  el.classList.toggle('near', blurbCountNear(ta.value.length));
}

// The editor is a row of its own, spanning every column, rather than the blurb
// cell it used to live in: that cell is one of seven in the consensus table, so
// on a phone it left a textarea about a word wide. Same reason the roster
// drawer and the published table's expanded panel are full-width rows.
function blurbEditorRow(team, b, cols) {
  if (state.editingBlurb !== team || !canWriteBlurb(b)) return '';
  const editor = isEditor();
  const mine = b.claimed_by === state.me?.name;
  return `<tr class="blurb-edit-row"><td colspan="${cols}">
    <div class="blurb-box">
      <div class="blurb-edit-head">${logo(team)}<span>${escHtml(TEAMS[team])}</span>
        <span class="team-sub" data-sum="${team}" data-variant="line">${summaryHtml(team, 'line')}</span></div>
      <div class="blurb-grid">
        <textarea id="blurb-input-${team}" maxlength="${MAX_BLURB_LEN}" oninput="updateBlurbCount('${team}')"
          placeholder="What's the read on ${escHtml(TEAMS[team])}?">${escHtml(b.body || '')}</textarea>
        <div class="roster-drawer blurb-ctx" data-ctx="${team}">Loading…</div>
      </div>
      <div class="blurb-meta">
        <button class="btn-primary btn-tiny" onclick="saveBlurb('${team}')">Save</button>
        <button class="btn-secondary btn-tiny" onclick="cancelBlurb()">Cancel</button>
        ${releaseBtn(team, b, mine, editor)}
        <span class="status-msg" id="blurb-status-${team}"></span>
        <span class="blurb-count${blurbCountNear((b.body || '').length) ? ' near' : ''}"
          id="blurb-count-${team}">${blurbCountText((b.body || '').length)}</span>
      </div>
    </div>
  </td></tr>`;
}

function renderBlurbCell(team, b) {
  const me = state.me?.name;
  const editor = isEditor();
  const mine = b.claimed_by === me;
  const canWrite = mine || editor;

  // Open in the row below: say so rather than repeating the text being edited,
  // or offering an Edit button for an editor that is already open.
  if (state.editingBlurb === team && canWrite) return '<span class="blurb-open">Editing…</span>';

  if (b.body) {
    return `<div class="blurb-text">${escHtml(b.body)}</div>
      <div class="blurb-meta">
        <span>— ${escHtml(b.claimed_by || 'unknown')}</span>
        ${canWrite ? `<button class="btn-secondary btn-tiny" onclick="editBlurb('${team}')">Edit</button>` : ''}
        ${releaseBtn(team, b, mine, editor)}
      </div>`;
  }

  if (b.claimed_by) {
    return `<div class="blurb-meta">
        <span class="blurb-open">Claimed by ${escHtml(b.claimed_by)}</span>
        ${canWrite ? `<button class="btn-secondary btn-tiny" onclick="editBlurb('${team}')">Write</button>` : ''}
        ${releaseBtn(team, b, mine, editor)}
      </div>`;
  }

  const canClaim = (isVoter() || editor) && BLURB_PHASES.includes(state.article.phase);
  return canClaim
    ? `<button class="btn-secondary btn-tiny" onclick="claimBlurb('${team}')">Claim</button>`
    : '<span class="blurb-open">—</span>';
}

// Giving a team back sits on the cell itself, not only inside an open editor.
// The usual case is a voter who claimed a team, wrote nothing, and wants to hand
// it back — that cell has no editor to open, so the only way out was to click
// Write first. An editor can release anyone's claim (the API allows the
// reassignment); everyone else only their own.
// Only while claiming is open, for the same reason claiming closes: a release
// in `final` could not be undone — nobody can claim the team back — and would
// quietly strip the byline off a blurb that is already published.
function releaseBtn(team, b, mine, editor) {
  if (!b.claimed_by || !(mine || editor)) return '';
  if (!BLURB_PHASES.includes(state.article.phase)) return '';
  const label = mine ? 'Give this team up' : `Unclaim (${escHtml(b.claimed_by)})`;
  return `<button class="btn-danger btn-tiny" onclick="releaseBlurb('${team}')">${label}</button>`;
}

function editBlurb(team) { state.editingBlurb = team; redrawBlurbs(); focusBlurbEditor(team); }
function cancelBlurb() { state.editingBlurb = null; redrawBlurbs(); }

// Opening the editor pushes it a row below the team, which on a phone can be
// off the bottom of the screen — put the caret in it and bring it into view.
function focusBlurbEditor(team) {
  fillContexts();
  const el = $(`blurb-input-${team}`);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.setSelectionRange(el.value.length, el.value.length);
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function claimBlurb(team) {
  try {
    state.article = await api(`/news/${state.id}/rankings/blurbs/${team}/claim`, { method: 'POST' });
    state.editingBlurb = team;
    render();
    focusBlurbEditor(team);
  } catch (e) { alert(e.message); }
}

// Releasing clears the claim and leaves any text behind — written work is not
// something a misclick should destroy — so say so, since the edition then
// publishes that blurb with no byline until someone else picks the team up.
async function releaseBlurb(team) {
  const b = state.article.blurbs?.[team] || {};
  const warn = b.body
    ? '\n\nWhat you wrote stays on the edition, but loses your byline until someone claims it.'
    : '';
  if (!confirm(`Give up ${TEAMS[team] || team}?${warn}\n\nAnyone else can claim it after this.`)) return;
  try {
    state.article = await api(`/news/${state.id}/rankings/blurbs/${team}/claim`, { method: 'DELETE' });
    state.editingBlurb = null;
    render();
  } catch (e) { alert(e.message); }
}

async function saveBlurb(team) {
  const el = $(`blurb-status-${team}`);
  el.textContent = 'Saving…'; el.className = 'status-msg';
  try {
    state.article = await api(`/news/${state.id}/rankings/blurbs/${team}`, {
      method: 'PUT', body: JSON.stringify({ body: $(`blurb-input-${team}`).value }),
    });
    state.editingBlurb = null;
    render();
  } catch (e) { el.textContent = e.message; el.className = 'status-msg err'; }
}

// ── boot ─────────────────────────────────────────────────────────────────────

async function init() {
  if (!state.id) { fail('No ranking specified.'); return; }
  // /auth/me always 200s and accepts the .nbn.today session cookie as well as
  // the header, so it's asked unconditionally; a null name means signed out.
  const me = await api('/auth/me').catch(() => null);
  state.me = me?.name ? me : null;
  try {
    state.article = await api(`/news/${state.id}`);
  } catch (e) {
    fail(state.me ? e.message
                  : 'Sign in on any NBN page to open this ballot, then come back.');
    return;
  }
  if (state.article.type !== 'power_rankings') {
    location.replace(`/news/view/?id=${state.id}`);
    return;
  }
  loadSummary();          // background; every view fills in when it lands
  render();
}

function fail(msg) {
  $('loading').style.display = 'none';
  const el = $('error-msg');
  el.style.display = '';
  el.textContent = msg;
}

init();
