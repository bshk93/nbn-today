// =============================================================================
// news/rankings/rankings.js — the power-rankings workspace
// =============================================================================
// Everything that happens to a power-rankings article between "created" and
// "published": the author invites voters and moves the phase along, voters rank
// all 30 teams, and once voting closes the consensus appears and voters claim
// teams to write blurbs on. The published article itself is rendered by
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
    const done = (bp.submitted || []).includes(name);
    return `<span class="chip ${done ? 'done' : ''}">${done ? '<span class="tick">✓</span>' : ''}${escHtml(name)}`
      + (canEditVoters ? `<button title="Remove" onclick="removeVoter('${escHtml(name)}')">×</button>` : '')
      + `</span>`;
  }).join('');

  let controls = '', note = '';
  if (a.phase === 'setup') {
    controls = `<button class="btn-primary" onclick="setPhase('voting')" ${(a.voters || []).length ? '' : 'disabled'}>Open the ballot</button>`;
    note = 'Voters can\'t see each other\'s ballots until you close voting.';
  } else if (a.phase === 'voting') {
    const pending = (bp.pending || []);
    controls = `<button class="btn-primary" onclick="setPhase('blurbs')" ${(bp.submitted || []).length ? '' : 'disabled'}>Close voting &amp; reveal</button>`;
    note = (pending.length
      ? `Still waiting on ${pending.map(escHtml).join(', ')}. Closing now counts only the ballots that are in.`
      : 'Everyone has voted.')
      + ' You can still add a voter — they just have to rank before you close.';
  } else {
    controls = `<button class="btn-success" onclick="doPublish()">Publish edition</button>`
      + ` <button class="btn-secondary" onclick="setPhase('voting')">Reopen voting</button>`;
    note = `${blp.approved || 0} of ${blp.written || 0} written blurbs approved`
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
      <div class="row-actions">${controls}<span class="status-msg" id="author-status"></span></div>
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
    if (isVoter()) { renderBallot(host); return; }
    host.innerHTML = `<div class="panel"><div class="panel-title">Voting in progress</div>
      <div class="panel-note">Ballots are blind until the author closes voting. ${
        (state.article.ballot_progress?.submitted || []).length} of ${
        state.article.ballot_progress?.voters || 0} are in.</div></div>`;
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

// The working order lives in localStorage until it's submitted, so a reload
// mid-ballot doesn't cost someone their 30-team ordering.
const draftKey = () => `nbn_pr_draft_${state.id}`;

function initOrder() {
  if (state.order) return;
  const mine = state.article.ballots?.[state.me?.name]?.order;
  if (mine?.length === 30) { state.order = mine.slice(); return; }
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    if (Array.isArray(saved) && saved.length === 30 && saved.every(t => TEAMS[t])) {
      state.order = saved; return;
    }
  } catch { /* fall through to a fresh ballot */ }
  state.order = ABBRS.slice();
}

function saveDraft() {
  try { localStorage.setItem(draftKey(), JSON.stringify(state.order)); } catch { /* private mode */ }
}

function renderBallot(host) {
  initOrder();
  const submitted = state.article.ballots?.[state.me?.name]?.submitted_at;
  host.innerHTML = `
    <div class="panel">
      <div class="panel-title">Your ballot</div>
      <div class="panel-note">Drag a team, or use ▲▼, to rank all 30 from best to worst.
        Click teams to open their rosters — as many at once as you want to compare.
        Nobody — the author included — can see your ballot until voting closes.</div>
    </div>
    <div class="ballot-list" id="ballot-list"></div>
    <div class="sticky-save">
      <span class="status-msg" id="ballot-status">${submitted ? `Submitted ${escHtml(fmtDate(submitted))} · you can keep changing it until voting closes` : 'Not submitted yet'}</span>
      <button class="btn-primary" onclick="submitBallot()">${submitted ? 'Update ballot' : 'Submit ballot'}</button>
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
  </tr>`;
}

function renderBlurbCell(team, b) {
  const me = state.me?.name;
  const editor = isEditor();
  const mine = b.claimed_by === me;
  const canWrite = mine || editor;

  if (state.editingBlurb === team && canWrite) {
    return `<div class="blurb-box">
      <textarea id="blurb-input-${team}" maxlength="1200" placeholder="What's the read on ${escHtml(TEAMS[team])}?">${escHtml(b.body || '')}</textarea>
      <div class="blurb-meta">
        <button class="btn-primary btn-tiny" onclick="saveBlurb('${team}')">Save</button>
        <button class="btn-secondary btn-tiny" onclick="cancelBlurb()">Cancel</button>
        ${mine && !editor ? `<button class="btn-danger btn-tiny" onclick="releaseBlurb('${team}')">Give this team up</button>` : ''}
        <span class="status-msg" id="blurb-status-${team}"></span>
      </div>
    </div>`;
  }

  if (b.body) {
    return `<div class="blurb-text">${escHtml(b.body)}</div>
      <div class="blurb-meta">
        <span>— ${escHtml(b.claimed_by || 'unknown')}</span>
        ${b.approved ? '<span class="tick">✓ approved</span>' : '<span>pending approval</span>'}
        ${canWrite ? `<button class="btn-secondary btn-tiny" onclick="editBlurb('${team}')">Edit</button>` : ''}
        ${editor ? `<button class="btn-secondary btn-tiny" onclick="approveBlurb('${team}', ${b.approved ? 'false' : 'true'})">${b.approved ? 'Unapprove' : 'Approve'}</button>` : ''}
      </div>`;
  }

  if (b.claimed_by) {
    return `<span class="blurb-open">Claimed by ${escHtml(b.claimed_by)}</span>
      ${canWrite ? ` <button class="btn-secondary btn-tiny" onclick="editBlurb('${team}')">Write</button>` : ''}`;
  }

  const canClaim = (isVoter() || editor) && state.article.phase === 'blurbs';
  return canClaim
    ? `<button class="btn-secondary btn-tiny" onclick="claimBlurb('${team}')">Claim</button>`
    : '<span class="blurb-open">—</span>';
}

function editBlurb(team) { state.editingBlurb = team; renderMain(state.article.phase); }
function cancelBlurb() { state.editingBlurb = null; renderMain(state.article.phase); }

async function claimBlurb(team) {
  try {
    state.article = await api(`/news/${state.id}/rankings/blurbs/${team}/claim`, { method: 'POST' });
    state.editingBlurb = team;
    render();
  } catch (e) { alert(e.message); }
}

async function releaseBlurb(team) {
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

async function approveBlurb(team, approved) {
  try {
    state.article = await api(`/news/${state.id}/rankings/blurbs/${team}`, {
      method: 'PUT', body: JSON.stringify({ approved }),
    });
    render();
  } catch (e) { alert(e.message); }
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
