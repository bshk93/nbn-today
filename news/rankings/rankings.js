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

const TEAMS = {
  ATL: 'Atlanta Hawks',        BKN: 'Brooklyn Nets',       BOS: 'Boston Celtics',
  CHA: 'Charlotte Hornets',    CHI: 'Chicago Bulls',       CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks',     DEN: 'Denver Nuggets',      DET: 'Detroit Pistons',
  GSW: 'Golden State Warriors',HOU: 'Houston Rockets',     IND: 'Indiana Pacers',
  LAC: 'LA Clippers',          LAL: 'Los Angeles Lakers',  MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat',           MIL: 'Milwaukee Bucks',     MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans', NYK: 'New York Knicks',     OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic',        PHI: 'Philadelphia 76ers',  PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings',  SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors',      UTA: 'Utah Jazz',           WAS: 'Washington Wizards',
};
const ABBRS = Object.keys(TEAMS);

const state = {
  id: new URLSearchParams(location.search).get('id'),
  article: null,
  me: null,             // { name, roles } or null
  members: null,        // every member name, for resolving what an author types
  order: null,          // the ballot being edited, local until submitted
  rosters: {},          // ABBR -> augmented roster rows, fetched on demand
  bios: null,
  ovr: null,
  records: null,        // ABBR -> "48-34, East-3" from the latest season on file
  openDrawers: new Set(),  // ABBRs whose roster drawers are expanded — a set,
                           // because ranking is comparing, and two rosters side
                           // by side is the whole reason the drawer exists
  editingBlurb: null,   // ABBR whose blurb textarea is open
};

// ── small helpers ────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const getToken = () => localStorage.getItem('nbn_token');
const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  return `<img src="/logos/logo-${abbr.toLowerCase()}.png" alt="" loading="lazy">`;
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

const PHASE_LABEL = {
  setup: 'Setting up', voting: 'Voting open', blurbs: 'Writing blurbs', final: 'Ready to publish',
};

function render() {
  const a = state.article;
  $('loading').style.display = 'none';
  $('content').style.display = '';

  const phase = a.status === 'published' ? 'published' : (a.phase || 'setup');
  $('phase-badge').innerHTML = a.status === 'published'
    ? '<span class="badge badge-final">Published</span>'
    : `<span class="badge badge-${escHtml(a.phase || 'setup')}">${escHtml(PHASE_LABEL[a.phase] || a.phase)}</span>`;
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
      + `Edit intro &amp; cover →</a>`);
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
    const mark = done ? '<span class="tick">✓</span>'
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
           title="Opens the published page as it stands — same renderer, nothing hidden">Preview →</a>
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
  host.innerHTML = `
    <div class="panel">
      <div class="panel-title">Your ballot</div>
      <div class="panel-note">Drag a team, or use ▲▼, to rank all 30 from best to worst.
        Click teams to open their rosters — as many at once as you want to compare.
        Your order saves itself as you go, so you can pick this up on another device —
        it only counts once you submit. Other voters can't see it while voting is open.</div>
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
  list.innerHTML = state.order.map((abbr, i) => `
    <div class="brow" draggable="true" data-abbr="${abbr}" data-i="${i}">
      <div class="brow-rank">${i + 1}</div>
      <div class="brow-team" onclick="toggleDrawer('${abbr}')">
        ${logo(abbr)}
        <span class="brow-name">${escHtml(TEAMS[abbr])}</span>
        <span class="brow-abbr">${abbr}</span>
      </div>
      <div class="brow-btns">
        <button onclick="move(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Up">▲</button>
        <button onclick="move(${i}, 1)" ${i === 29 ? 'disabled' : ''} title="Down">▼</button>
      </div>
    </div>
    ${state.openDrawers.has(abbr) ? `<div class="roster-drawer" id="drawer-${abbr}">Loading roster…</div>` : ''}
  `).join('');
  wireDrag(list);
  state.openDrawers.forEach(abbr => fillDrawer(abbr));
}

function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= state.order.length) return;
  [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  saveDraft();
  drawBallotRows();
}

function wireDrag(list) {
  let fromIdx = null;
  list.querySelectorAll('.brow').forEach(row => {
    row.addEventListener('dragstart', e => {
      fromIdx = Number(row.dataset.i);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      // Firefox won't start a drag without payload, even one nothing reads.
      e.dataTransfer.setData('text/plain', row.dataset.abbr);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      list.querySelectorAll('.drop-target').forEach(r => r.classList.remove('drop-target'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      const toIdx = Number(row.dataset.i);
      if (fromIdx === null || fromIdx === toIdx) return;
      const [moved] = state.order.splice(fromIdx, 1);
      state.order.splice(toIdx, 0, moved);
      fromIdx = null;
      saveDraft();
      drawBallotRows();
    });
  });
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

// ── roster drawer ────────────────────────────────────────────────────────────

function toggleDrawer(abbr) {
  if (!state.openDrawers.delete(abbr)) state.openDrawers.add(abbr);
  drawBallotRows();
}

// Bios and OVR are one fetch each for the whole league; rosters are per team and
// only pulled for teams somebody actually opens.
async function loadRoster(abbr) {
  if (state.rosters[abbr]) return state.rosters[abbr];
  if (!state.bios) {
    const [bios, ovr] = await Promise.all([
      fetch('/api/players').then(r => r.ok ? r.json() : {}),
      fetch('/api/ovr/current').then(r => r.ok ? r.json() : {}),
    ]);
    state.bios = bios; state.ovr = ovr;
  }
  const text = await fetch(`/data/${abbr.toLowerCase()}-roster.csv`).then(r => r.ok ? r.text() : null);
  if (!text) { state.rosters[abbr] = []; return []; }
  const rows = parseCSV(text).map(r => {
    const slug = r.SLUG || '';
    const bio = state.bios[slug] || {};
    return {
      slug,
      name: bio.name || slug,
      pos: (bio.pos || []).join('/'),
      _posList: bio.pos || [],           // what computeStartingFive reads
      OVR: state.ovr[slug] ?? '',
      type: bio.type || '',
    };
  }).filter(p => p.type !== 'dead');
  state.rosters[abbr] = rows;
  return rows;
}

async function fillDrawer(abbr) {
  const host = $(`drawer-${abbr}`);
  if (!host) return;
  let rows;
  try { rows = await loadRoster(abbr); } catch { host.textContent = 'Could not load this roster.'; return; }
  if (!host.isConnected) return;         // the drawer was closed while fetching
  if (!rows.length) { host.textContent = 'No roster on file.'; return; }

  const five = (typeof computeStartingFive === 'function') ? computeStartingFive(rows) : [];
  const starters = new Set(five.filter(Boolean).map(p => p.slug));
  const sorted = rows.slice().sort((a, b) => (parseFloat(b.OVR) || 0) - (parseFloat(a.OVR) || 0));
  const lineup = five.map((p, i) => p ? `${DEPTH_SLOTS[i]} ${escHtml(p.name)}` : `${DEPTH_SLOTS[i]} —`).join(' · ');

  host.innerHTML = `
    <div class="drawer-head">
      <span><strong>${escHtml(TEAMS[abbr])}</strong>${state.records?.[abbr] ? ` · ${escHtml(state.records[abbr])}` : ''}</span>
      <span>${escHtml(lineup)}</span>
    </div>
    <table>
      <thead><tr><th>Player</th><th>Pos</th><th style="text-align:right">OVR</th></tr></thead>
      <tbody>${sorted.map(p => `
        <tr class="${starters.has(p.slug) ? 'starter' : ''}">
          <td>${escHtml(p.name)}</td><td>${escHtml(p.pos)}</td><td class="num">${escHtml(p.OVR)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// Last season on file, per team — context while ranking, and it costs one CSV.
async function loadRecords() {
  try {
    const text = await fetch('/standings/standings-history.csv').then(r => r.ok ? r.text() : null);
    if (!text) return;
    const latest = {};
    parseCSV(text).forEach(r => {
      const team = r.TEAM || r.ABBR;
      if (!team) return;
      if (!latest[team] || (r.SEASON || '') > (latest[team].SEASON || '')) latest[team] = r;
    });
    state.records = {};
    Object.entries(latest).forEach(([team, r]) => {
      state.records[team] = `${r.SEASON} · ${r.W}-${r.L}${r.SEED ? ` · ${r.SEED}` : ''}`;
    });
  } catch { /* context only — the ballot works without it */ }
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
}

function blurbBoardInner() {
  return `
    <div class="panel">
      <div class="panel-title">Blurbs</div>
      <div class="panel-note">Claim a team and write it whenever you like — you don't have to
        wait for voting to close.</div>
    </div>
    <table class="ctable">
      <thead><tr><th>Team</th><th>Blurb</th></tr></thead>
      <tbody>${Object.keys(TEAMS).sort().map(team => {
        const b = state.article.blurbs?.[team] || {};
        return `<tr>
          <td><div class="team-cell">${logo(team)}<span>${escHtml(TEAMS[team])}</span></div></td>
          <td>${renderBlurbCell(team, b)}</td>
        </tr>${blurbEditorRow(team, b, 2)}`;
      }).join('')}</tbody>
    </table>`;
}

// Opening or closing a blurb editor redraws only the blurbs. During voting the
// ballot is sitting right above them, and re-rendering it to open a textarea
// would rebuild thirty draggable rows for no reason. Falls back to the whole
// panel in the `blurbs` phase, where the cells live in the consensus table.
function redrawBlurbs() {
  const board = document.getElementById('blurb-board');
  if (board) board.innerHTML = blurbBoardInner();
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
        ${isVoter() || isEditor() ? 'Claim a team to write its blurb.' : ''}</div>
    </div>
    <table class="ctable">
      <thead><tr>
        <th style="text-align:right">#</th><th></th><th>Team</th>
        <th style="text-align:right">Avg</th><th style="text-align:right">Hi/Lo</th>
        <th style="text-align:right">1st</th><th>Blurb</th>
      </tr></thead>
      <tbody>${rows.map(r => renderConsensusRow(r)).join('')}</tbody>
    </table>`;
}

function renderConsensusRow(r) {
  const b = state.article.blurbs?.[r.team] || {};
  return `<tr>
    <td class="rank">${r.tied ? 'T-' : ''}${r.rank}</td>
    <td style="text-align:right">${moveCell(r)}</td>
    <td><div class="team-cell">${logo(r.team)}<span>${escHtml(TEAMS[r.team])}</span></div></td>
    <td class="num">${r.avg.toFixed(2)}</td>
    <td class="num">${r.hi}–${r.lo}</td>
    <td class="num">${r.firsts || ''}</td>
    <td>${renderBlurbCell(r.team, b)}</td>
  </tr>${blurbEditorRow(r.team, b, 7)}`;
}

function canWriteBlurb(b) { return b.claimed_by === state.me?.name || isEditor(); }

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
      <div class="blurb-edit-head">${logo(team)}<span>${escHtml(TEAMS[team])}</span></div>
      <textarea id="blurb-input-${team}" maxlength="1200" placeholder="What's the read on ${escHtml(TEAMS[team])}?">${escHtml(b.body || '')}</textarea>
      <div class="blurb-meta">
        <button class="btn-primary btn-tiny" onclick="saveBlurb('${team}')">Save</button>
        <button class="btn-secondary btn-tiny" onclick="cancelBlurb()">Cancel</button>
        ${releaseBtn(team, b, mine, editor)}
        <span class="status-msg" id="blurb-status-${team}"></span>
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
  loadRecords();          // background; the ballot doesn't wait on it
  render();
}

function fail(msg) {
  $('loading').style.display = 'none';
  const el = $('error-msg');
  el.style.display = '';
  el.textContent = msg;
}

init();
