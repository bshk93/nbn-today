// Shared utilities: nav injection, site-wide player search, parseCSV, theming

// ── Icons ────────────────────────────────────────────────────────────────────
// Inline SVGs for the nav-action buttons, so search/inbox/profile render as
// crisp stroked line icons instead of emoji glyphs (which vary in weight and
// baseline across platforms/fonts and read as mismatched next to each other).
const _ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
const _ICON_INBOX = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path></svg>';
const _ICON_PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"></path></svg>';

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
  btn.className = 'theme-btn nav-icon-btn';
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

// ── Inbox button ─────────────────────────────────────────────────────────────
// Lives beside the theme picker rather than the old bottom-corner token badge —
// same real estate as search/theme, so it's part of the nav chrome every page
// already has instead of a separate floating element. The unread count is only
// fetched when a token is on hand; a signed-out visitor still gets the button
// (clicking takes them to /inbox/, which prompts sign-in itself), just no badge.
function _buildInboxButton() {
  const btn = document.createElement('button');
  btn.className = 'inbox-btn nav-icon-btn';
  btn.setAttribute('aria-label', 'Inbox');
  btn.setAttribute('title', 'Inbox');
  btn.innerHTML = _ICON_INBOX;
  btn.addEventListener('click', () => { window.location.href = '/inbox/'; });

  const badge = document.createElement('span');
  badge.className = 'inbox-badge';
  btn.appendChild(badge);

  const token = localStorage.getItem('nbn_token');
  if (token) {
    fetch('/api/inbox', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.unread_count > 0) {
          badge.textContent = d.unread_count > 99 ? '99+' : String(d.unread_count);
          badge.classList.add('show');
        }
      })
      .catch(() => {});
  }
  return btn;
}

// ── Profile picker ───────────────────────────────────────────────────────────
// Last in .nav-actions. Hidden until its own /api/me call confirms a signed-in
// member (same token-gated, self-contained pattern as the inbox button above),
// then shows a circular avatar button that opens a dropdown with the greeting,
// current team badge, NB¥ balance, and a link to the member's profile page.
// Ported from the homepage's old standalone "profile menu" (which only ever
// existed on index.html) so every page gets it, not just the homepage.
function _buildProfilePicker() {
  const wrap = document.createElement('div');
  wrap.className = 'profile-picker';
  wrap.style.display = 'none';

  const btn = document.createElement('button');
  btn.className = 'profile-btn nav-icon-btn';
  btn.setAttribute('aria-label', 'Your profile');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  const avatarWrap = document.createElement('span');
  avatarWrap.className = 'profile-btn-avatar-wrap';
  avatarWrap.innerHTML = _ICON_PERSON;
  btn.appendChild(avatarWrap);

  const menu = document.createElement('div');
  menu.className = 'profile-menu';
  menu.innerHTML = `
    <div class="profile-menu-row">
      <span class="member-banner-greeting"></span>
      <a class="member-banner-team" style="display:none" aria-label="Go to your roster"><img alt=""></a>
    </div>
    <span class="member-banner-balance"></span>
    <a class="member-banner-profile-link" href="/members/">My Profile →</a>
  `;
  const greetEl = menu.querySelector('.member-banner-greeting');
  const teamEl = menu.querySelector('.member-banner-team');
  const teamLogoEl = teamEl.querySelector('img');
  const balanceEl = menu.querySelector('.member-banner-balance');
  const profileLinkEl = menu.querySelector('.member-banner-profile-link');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  document.addEventListener('click', e => {
    if (menu.classList.contains('open') && !wrap.contains(e.target)) {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);

  const token = localStorage.getItem('nbn_token');
  if (token) {
    fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !data.name) return;

        greetEl.textContent = `Welcome back, ${data.name.split(' ')[0]}`;
        profileLinkEl.href = `/members/${encodeURIComponent(data.name)}/`;
        wrap.style.display = '';

        fetch(`/api/bets/balance/${encodeURIComponent(data.name)}`)
          .then(r => r.ok ? r.json() : null)
          .then(b => {
            if (b && b.balance != null) {
              balanceEl.textContent = 'NB¥ ' + (+b.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
          })
          .catch(() => {});

        // Cosmetics purchased with NB¥ (name color, avatar) — /api/me doesn't
        // carry these, so a second call to /api/members/me fetches them.
        fetch('/api/members/me', { headers: { Authorization: 'Bearer ' + token } })
          .then(r => r.ok ? r.json() : null)
          .then(profile => {
            if (!profile) return;
            const nameColor = profile.cosmetics?.name_color;
            if (nameColor) greetEl.style.color = nameColor;
            if (profile.avatar_url) {
              avatarWrap.innerHTML = `<img class="member-banner-avatar" src="${profile.avatar_url}?v=${Date.now()}" alt="">`;
            }
          })
          .catch(() => {});

        // Current team, if any — /api/members/me only reports position names
        // (e.g. "owner"), not which team, so this reads it off the same
        // tenures the /members/ directory already renders from.
        fetch('/api/members/public')
          .then(r => r.ok ? r.json() : null)
          .then(members => {
            const me = members?.find(m => m.name === data.name);
            const active = me?.tenures?.filter(t => !t.end);
            if (!active?.length) return;
            const tenure = active.sort((a, b) => b.start.localeCompare(a.start))[0];
            const teamAbbr = tenure.team.toLowerCase();
            teamEl.href = `/teams/${teamAbbr}/`;
            teamEl.title = `${tenure.team} roster`;
            teamLogoEl.src = `/logos/logo-${teamAbbr}.png`;
            teamLogoEl.alt = `${tenure.team} logo`;
            teamEl.style.display = '';
          })
          .catch(() => {});
      })
      .catch(() => {});
  }

  return wrap;
}

// ── Nav injection ────────────────────────────────────────────────────────────

document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') {
    closeSearch();
    document.querySelector('.theme-menu')?.classList.remove('open');
    document.querySelector('.profile-menu')?.classList.remove('open');
  }
});

// Idempotent by design (bails via the .nav-actions check below) — a page that
// rewrites .nav's innerHTML wholesale after this first runs (players/index.html
// does, to swap in a breadcrumb once its data loads) must call _initNav() again
// afterward, or the rewrite silently wipes out search/inbox/theme/profile with
// it. _initNav is a plain global (this file has no module wrapper), so any page
// that includes nav.js can call it directly.
function _initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  if (!nav.children.length && !nav.textContent.trim() && !nav.hasAttribute('data-no-home')) {
    nav.innerHTML = '<a href="/">← Home</a>';
  }
  if (!nav.querySelector('.nav-actions')) {
    const actions = document.createElement('div');
    actions.className = 'nav-actions';

    if (!nav.hasAttribute('data-no-search')) {
      const btn = document.createElement('button');
      btn.className = 'search-btn nav-icon-btn';
      btn.setAttribute('aria-label', 'Search (Ctrl+K)');
      btn.setAttribute('title', 'Search (Ctrl+K)');
      btn.innerHTML = _ICON_SEARCH;
      btn.addEventListener('click', () => openSearch());
      actions.appendChild(btn);
    }

    actions.appendChild(_buildInboxButton());
    actions.appendChild(_buildThemePicker());
    actions.appendChild(_buildProfilePicker());
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
  { title: 'Extensions', href: '/extensions/', icon: '📄' },
  { title: 'Transactions', href: '/transactions', icon: '📝' },
  { title: 'Cap Summary', href: '/cap-summary/', icon: '💰' },
  { title: 'Season Summary', href: '/season-summary', icon: '📜' },
  { title: 'Hall of Champions', href: '/champions/', icon: '🏆' },
  { title: 'Hall of Fame', href: '/hof', icon: '⭐' },
  { title: 'Awards', href: '/awards/', icon: '🎖️' },
  { title: 'Draft', href: '/draft', icon: '📋' },
  { title: 'Rookie Scale', href: '/rookie-scale/', icon: '📐' },
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
  { title: 'Clean Up the Poo Poo', href: '/cleanup/', icon: '🧹' },
  { title: 'Inbox', href: '/inbox/', icon: '📥' },
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
