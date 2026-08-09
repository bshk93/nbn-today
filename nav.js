// Shared utilities: nav injection, site-wide player search, parseCSV, theming

// ── Theme ────────────────────────────────────────────────────────────────────
//
// Named themes, chosen from the picker nav.js injects into every page's
// .nav. Each id here must have a matching :root[data-theme="..."] block in
// css/theme.css (the bare :root there is "nbn-today", the default/fallback).
// Applied as early as possible (top-level, not waiting for DOMContentLoaded)
// to minimize a flash of the wrong theme on load.

const THEMES = [
  { id: 'nbn-today',       label: 'NBN Today',       icon: '🌙' },
  { id: 'nbn-today-light', label: 'NBN Today Light', icon: '☀️' },
  { id: 'lavender-rose',   label: 'Lavender Rose',   icon: '🌹' },
];
const THEME_STORAGE_KEY = 'nbn_theme_pref'; // 'auto' or one of THEMES[].id
const DEFAULT_THEME_PREF = 'nbn-today'; // dark — used until a visitor explicitly picks something, incl. "Match System"

function _systemTheme() {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
    ? 'nbn-today-light' : 'nbn-today';
}

function _themePref() {
  try { return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME_PREF; } catch { return DEFAULT_THEME_PREF; }
}

function _effectiveTheme() {
  const pref = _themePref();
  return pref === 'auto' ? _systemTheme() : pref;
}

function _applyTheme() {
  document.documentElement.setAttribute('data-theme', _effectiveTheme());
  _refreshThemeMenu();
}

function _setThemePref(pref) {
  try { localStorage.setItem(THEME_STORAGE_KEY, pref); } catch { /* private browsing etc — theme just won't persist */ }
  _applyTheme();
}

_applyTheme();

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (_themePref() === 'auto') _applyTheme();
  });
}

function _refreshThemeMenu() {
  const menu = document.querySelector('.theme-menu');
  const pref = _themePref();
  if (menu) {
    menu.querySelectorAll('.theme-menu-item').forEach(item => {
      item.classList.toggle('active', item.dataset.themeChoice === pref);
    });
  }
  const btn = document.querySelector('.theme-btn');
  if (btn) {
    const active = THEMES.find(t => t.id === _effectiveTheme());
    btn.textContent = active ? active.icon : '🎨';
  }
}

function _buildThemePicker() {
  const wrap = document.createElement('div');
  wrap.className = 'theme-picker';

  const btn = document.createElement('button');
  btn.className = 'theme-btn';
  btn.setAttribute('aria-label', 'Choose theme');
  btn.setAttribute('title', 'Choose theme');

  const menu = document.createElement('div');
  menu.className = 'theme-menu';

  const choices = [{ id: 'auto', label: 'Match System', icon: '🖥️' }, ...THEMES];
  choices.forEach(c => {
    const item = document.createElement('div');
    item.className = 'theme-menu-item';
    item.dataset.themeChoice = c.id;
    item.innerHTML = `<span class="theme-menu-icon">${c.icon}</span><span class="theme-menu-label">${c.label}</span><span class="theme-menu-check">✓</span>`;
    item.addEventListener('click', () => { _setThemePref(c.id); menu.classList.remove('open'); });
    menu.appendChild(item);
  });

  btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

document.addEventListener('click', e => {
  const menu = document.querySelector('.theme-menu');
  if (menu && menu.classList.contains('open') && !menu.parentElement.contains(e.target)) {
    menu.classList.remove('open');
  }
});

// ── Nav injection ────────────────────────────────────────────────────────────

document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') { closeSearch(); document.querySelector('.theme-menu')?.classList.remove('open'); }
});

function _initNav() {
  const nav = document.querySelector('.nav');
  if (!nav || nav.id === 'nav') return;
  if (!nav.children.length && !nav.textContent.trim() && !nav.hasAttribute('data-no-home')) {
    nav.innerHTML = '<a href="/">← Home</a>';
  }
  if (!nav.querySelector('.nav-actions')) {
    const actions = document.createElement('div');
    actions.className = 'nav-actions';

    if (!nav.hasAttribute('data-no-search')) {
      const btn = document.createElement('button');
      btn.className = 'search-btn';
      btn.setAttribute('aria-label', 'Search (Ctrl+K)');
      btn.setAttribute('title', 'Search (Ctrl+K)');
      btn.textContent = '⌕';
      btn.addEventListener('click', () => openSearch());
      actions.appendChild(btn);
    }

    actions.appendChild(_buildThemePicker());
    nav.appendChild(actions);
    _refreshThemeMenu();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initNav);
} else {
  _initNav();
}

// ── Search overlay ───────────────────────────────────────────────────────────
//
// Unified site search: static pages (SITE_PAGES), team pages (TEAM_LIST),
// and players (fetched lazily from /api/players). All three are merged into
// one result list so Ctrl+K / the ⌕ button works as an all-in-one jump box.

const SITE_PAGES = [
  { title: 'Calendar', href: '/calendar', icon: '📅' },
  { title: 'Standings & Playoffs', href: '/standings', icon: '🏅' },
  { title: 'Tradeblock', href: '/tradeblock/', icon: '🤝' },
  { title: 'Transaction Simulator', href: '/transaction-sim/', icon: '⚖️' },
  { title: 'Trade Retrospectives', href: '/trade-retros/', icon: '🔍' },
  { title: 'Compare Players', href: '/compare/', icon: '⇆' },
  { title: 'Free Agency', href: '/free-agency/', icon: '✍️' },
  { title: 'Transactions', href: '/transactions', icon: '📝' },
  { title: 'Cap Summary', href: '/cap-summary/', icon: '💰' },
  { title: 'Season Summary', href: '/season-summary', icon: '📜' },
  { title: 'Hall of Champions', href: '/champions/', icon: '🏆' },
  { title: 'Hall of Fame', href: '/hof', icon: '⭐' },
  { title: 'Awards', href: '/awards/', icon: '🎖️' },
  { title: 'Draft', href: '/draft', icon: '📋' },
  { title: 'Teams', href: '/teams', icon: '🏀' },
  { title: 'Players', href: '/players', icon: '⛹️' },
  { title: 'Owners', href: '/owners', icon: '🏛️' },
  { title: 'Season Stats', href: '/stats/seasons', icon: '📅' },
  { title: 'Box Scores', href: '/boxscores/', icon: '🗂' },
  { title: 'Totals Leaderboards', href: '/stats/totals', icon: '🏅' },
  { title: 'Single-Game Highs', href: '/stats/highs', icon: '🔝' },
  { title: 'Head to Head', href: '/h2h', icon: '⚔️' },
  { title: 'Frivolities & Viz', href: '/frivolities', icon: '📈' },
  { title: 'Bets', href: '/bet/', icon: '🎲' },
  { title: 'Daily Perry Game', href: '/perry/', icon: '🏀' },
  { title: 'Daily Poeltl', href: '/poeltl/', icon: '🕵️' },
  { title: 'Trivia', href: '/trivia', icon: '🧠' },
  { title: 'Wall Street', href: '/invest', icon: '📈' },
  { title: 'NBNTV Classics', href: '/nbntv-classics', icon: '📺' },
  { title: 'YouTube', href: 'https://youtube.com/@nothingbutnetNBN/streams', icon: '▶️' },
  { title: 'News', href: 'https://news.nbn.today', icon: '📰' },
  { title: 'Members', href: '/members/', icon: '👥' },
  { title: 'Roles & Permissions', href: '/roles', icon: '🔑' },
  { title: 'Constitution', href: '/constitution/', icon: '📄' },
  { title: 'Rulebook', href: '/rulebook/', icon: '📖' },
  { title: 'Changelog', href: '/changelog', icon: '🔖' },
  { title: 'Proposals', href: '/proposals/', icon: '🗳️' },
  { title: 'Suggestions', href: '/suggestions/', icon: '💡' },
];

// Pages that only exist for people holding a specific role. Kept out of
// SITE_PAGES because that list is offered to everybody: a page 27 of 30 owners
// can't use has no business in their jump box. Resolved lazily — see
// _loadCommitteePages — and merged into the page results only when the API says
// this member holds the role. The gate is a courtesy either way; the security
// boundary is the API, which is what /pdc's own shell relies on too.
const ROLE_PAGES = [
  { title: 'PDC Committee', href: '/pdc/', icon: '🗳️',
    roles: ['fac', 'fac_head', 'poext', 'poext_head', 'admin'] },
];

const TEAM_LIST = {
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

let _searchOverlay = null;
let _searchInput = null;
let _searchResults = null;
let _playerCache = null;   // { slug: { name, pos, type } }
let _ovrCache = null;      // { slug: ovrNumber }
let _activeIdx = -1;
let _rolePages = [];       // ROLE_PAGES this member actually qualifies for
let _rolesChecked = false; // asked once per page, whatever the answer

function openSearch(initialQuery) {
  if (!_searchOverlay) _buildSearchOverlay();
  _searchOverlay.style.display = 'flex';
  _searchInput.value = initialQuery || '';
  _activeIdx = -1;
  _searchInput.focus();
  _filter();
  // Both are lazy and fire only when someone actually opens the search overlay,
  // so nav.js still makes no request on an ordinary page load — which matters,
  // because it loads on every page of the site.
  Promise.all([_loadPlayerData(), _loadCommitteePages()]).then(() => _filter());
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
      <input class="search-input" type="text" placeholder="Search pages, teams, players…" autocomplete="off" spellcheck="false">
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
  const q = _searchInput.value.trim().toLowerCase();

  if (!q) {
    _searchResults.innerHTML = '<div class="search-empty">Type to search pages, teams, or players…</div>';
    return;
  }

  const pageMatches = SITE_PAGES.concat(_rolePages)
    .filter(p => p.title.toLowerCase().includes(q))
    .slice(0, 6)
    .map(p => ({ type: 'Page', icon: p.icon, title: p.title, meta: '', href: p.href }));

  const teamMatches = Object.entries(TEAM_LIST)
    .filter(([abbr, name]) => name.toLowerCase().includes(q) || abbr.toLowerCase().includes(q))
    .slice(0, 6)
    .map(([abbr, name]) => ({ type: 'Team', icon: '🏀', title: name, meta: abbr, href: `/teams/${abbr}/` }));

  let playerMatches = [];
  if (_playerCache) {
    playerMatches = Object.entries(_playerCache)
      .filter(([, p]) => {
        const dn = _displayName(p.name).toLowerCase();
        return dn.includes(q) || p.name.toLowerCase().includes(q);
      })
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .slice(0, 8)
      .map(([slug, p]) => {
        const ovr = _ovrCache?.[slug];
        const pos = Array.isArray(p.pos) ? p.pos.join(' · ') : (p.pos || '');
        const meta = pos + (ovr ? `${pos ? ' · ' : ''}${ovr}` : '');
        return { type: 'Player', icon: '⛹️', title: _displayName(p.name), meta, href: `/players/?p=${slug}` };
      });
  }

  const all = [...pageMatches, ...teamMatches, ...playerMatches];

  if (!all.length) {
    _searchResults.innerHTML = _playerCache
      ? '<div class="search-empty">No results</div>'
      : '<div class="search-empty">No results yet — still loading players…</div>';
    return;
  }

  _searchResults.innerHTML = '';
  all.forEach(r => {
    const a = document.createElement('a');
    a.className = 'search-result';
    a.href = r.href;
    a.innerHTML = `
      <span class="search-result-icon">${r.icon}</span>
      <span class="search-result-name">${r.title}</span>
      <span class="search-result-meta">${r.meta ? `${r.meta} &nbsp;·&nbsp; ` : ''}${r.type}</span>`;
    a.addEventListener('click', () => closeSearch());
    _searchResults.appendChild(a);
  });
}

// Does this browser plausibly have a signed-in member behind it? `nbn_session_live`
// is the readable companion to the HttpOnly `.nbn.today` session cookie and exists
// precisely so page JS can answer this. Checking it first means a logged-out
// visitor's search costs exactly what it did before — no auth request at all.
function _maybeSignedIn() {
  try { if (localStorage.getItem('nbn_token')) return true; } catch { /* private browsing */ }
  return /(?:^|;\s*)nbn_session_live=/.test(document.cookie);
}

async function _loadCommitteePages() {
  if (_rolesChecked) return;
  _rolesChecked = true;
  if (!_maybeSignedIn()) return;
  try {
    const headers = {};
    try {
      const t = localStorage.getItem('nbn_token');
      if (t) headers.Authorization = 'Bearer ' + t;
    } catch { /* ignore */ }
    const me = await fetch('/api/auth/me', { credentials: 'same-origin', headers })
      .then(r => r.ok ? r.json() : null);
    const roles = new Set((me && me.roles) || []);
    // Same rule the pages themselves apply: admin satisfies any role check.
    _rolePages = ROLE_PAGES.filter(p => roles.has('admin') || p.roles.some(r => roles.has(r)));
  } catch {
    // The jump box works without this; it just won't list the committee page.
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
    // page/team results (already rendered) still work; player search just won't have data this session
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
