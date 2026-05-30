// Shared utilities: nav injection, site-wide player search, parseCSV

// ── Nav injection ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  const nav = document.querySelector('.nav');
  if (nav && nav.id !== 'nav' && !nav.children.length && !nav.textContent.trim()) {
    nav.innerHTML = '<a href="/">← Home</a><button class="search-btn" aria-label="Search players (Ctrl+K)" title="Search players (Ctrl+K)">⌕</button>';
    nav.querySelector('.search-btn').addEventListener('click', openSearch);
  }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') closeSearch();
  });
});

// ── Search overlay ───────────────────────────────────────────────────────────

let _searchOverlay = null;
let _searchInput = null;
let _searchResults = null;
let _playerCache = null;   // { slug: { name, pos, type } }
let _ovrCache = null;      // { slug: ovrNumber }
let _activeIdx = -1;

function openSearch() {
  if (!_searchOverlay) _buildSearchOverlay();
  _searchOverlay.style.display = 'flex';
  _searchInput.value = '';
  _activeIdx = -1;
  _searchResults.innerHTML = '';
  _searchInput.focus();
  _loadPlayerData().then(() => _filter());
}

function closeSearch() {
  if (_searchOverlay) _searchOverlay.style.display = 'none';
}

function _buildSearchOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="search-modal">
      <input class="search-input" type="text" placeholder="Search players…" autocomplete="off" spellcheck="false">
      <div class="search-results"></div>
      <div class="search-hint">↑↓ navigate · Enter open · Esc close · Ctrl+K</div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch(); });

  _searchInput = overlay.querySelector('.search-input');
  _searchResults = overlay.querySelector('.search-results');

  _searchInput.addEventListener('input', () => { _activeIdx = -1; _filter(); });
  _searchInput.addEventListener('keydown', e => {
    const items = _searchResults.querySelectorAll('.search-result');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIdx = Math.min(_activeIdx + 1, items.length - 1);
      _highlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIdx = Math.max(_activeIdx - 1, -1);
      _highlight(items);
    } else if (e.key === 'Enter') {
      const active = _searchResults.querySelector('.search-result.active');
      if (active) { closeSearch(); window.location.href = active.href; }
    }
  });

  document.body.appendChild(overlay);
  _searchOverlay = overlay;
}

function _highlight(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === _activeIdx));
  if (_activeIdx >= 0) items[_activeIdx]?.scrollIntoView({ block: 'nearest' });
}

function _displayName(raw) {
  const [last, first] = raw.split(', ');
  const tc = s => s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return first ? `${tc(first)} ${tc(last)}` : tc(last);
}

function _filter() {
  if (!_playerCache) { _searchResults.innerHTML = '<div class="search-empty">Loading…</div>'; return; }
  const q = _searchInput.value.trim().toLowerCase();
  const entries = Object.entries(_playerCache);
  const MAX = 10;

  const matches = q
    ? entries.filter(([, p]) => {
        const dn = _displayName(p.name).toLowerCase();
        return dn.includes(q) || p.name.toLowerCase().includes(q);
      })
    : entries.filter(([, p]) => p.type === 'player' || p.type === 'two-way');

  matches.sort(([, a], [, b]) => a.name.localeCompare(b.name));

  if (!matches.length) {
    _searchResults.innerHTML = '<div class="search-empty">No results</div>';
    return;
  }

  _searchResults.innerHTML = '';
  matches.slice(0, MAX).forEach(([slug, p]) => {
    const ovr = _ovrCache?.[slug];
    const pos = Array.isArray(p.pos) ? p.pos.join(' · ') : (p.pos || '');
    const a = document.createElement('a');
    a.className = 'search-result';
    a.href = `/players/?p=${slug}`;
    a.innerHTML = `
      <span class="search-result-name">${_displayName(p.name)}</span>
      <span class="search-result-meta">${pos}${ovr ? ` &nbsp;·&nbsp; <strong>${ovr}</strong>` : ''}</span>`;
    a.addEventListener('click', () => closeSearch());
    _searchResults.appendChild(a);
  });

  if (matches.length > MAX) {
    const more = document.createElement('div');
    more.className = 'search-empty';
    more.textContent = `${matches.length - MAX} more — keep typing to narrow`;
    _searchResults.appendChild(more);
  }
}

async function _loadPlayerData() {
  if (_playerCache) return;
  try {
    const [playersRes, ovrRes] = await Promise.all([
      fetch('/api/players').then(r => r.ok ? r.json() : {}),
      fetch('/api/ovr/current').then(r => r.ok ? r.json() : {}),
    ]);
    _playerCache = playersRes;
    _ovrCache = ovrRes;
    _filter();
  } catch {
    _searchResults.innerHTML = '<div class="search-empty">Failed to load</div>';
  }
}

// ── CSV utilities ────────────────────────────────────────────────────────────

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

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
}
