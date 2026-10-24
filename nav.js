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
// Named themes, chosen from the picker nav.js injects into every page's .nav.
// Every id must have a matching :root[data-theme="..."] block in css/theme.css
// (the bare :root there is "nbn-today", the default/fallback). The first paint
// is theme-boot.js's job, not this file's: nav.js loads at the end of <body>
// (or is injected by team.js), too late to beat it, so every page's <head>
// loads theme-boot.js to set data-theme before anything renders. _activeTheme()
// below must agree with it, or this file re-applies a different theme and the
// flash comes back.
//
// Two themes are free and are hardcoded here on purpose: nav.js is on every
// page including the signed-out ones, and a picker that can't render without a
// successful fetch is a picker that disappears whenever the API hiccups. Every
// other theme is unlocked with NB¥ and comes from GET /api/themes, cached in
// localStorage so it still renders on the first paint of the next page load.
// Prices are never written here — the catalog is the price list, and the
// server owns it (nbn-api/routers/themes.py).
//
// One theme is free for one member and priced for everyone else: their own
// team's. That can't come from the catalog, which is public and cached across
// whoever uses this browser, so it arrives per-member on /api/members/me as
// `free_themes` and is cached separately from the bought ones.
const FREE_THEMES = [
  { id: 'nbn-today',       label: 'NBN Today',       icon: '🌙', free: true },
  { id: 'nbn-today-light', label: 'NBN Today Light', icon: '☀️', free: true },
];
let THEMES = FREE_THEMES.slice();
const THEME_STORAGE_KEY = 'nbn_theme_pref'; // 'auto' or one of THEMES[].id
const THEME_CATALOG_KEY = 'nbn_theme_catalog'; // cached GET /api/themes
const THEME_OWNED_KEY = 'nbn_themes_owned';    // cached cosmetics.themes for this browser's member
const THEME_FREE_KEY = 'nbn_themes_free';      // cached free_themes for this browser's member — their own team's
const DEFAULT_THEME_PREF = 'nbn-today'; // dark — used until a visitor explicitly picks something, incl. "Match System"

// This browser's member's NB¥ balance, once the profile picker has fetched it.
// Only used to tell someone what an unlock would leave them with; the server
// is what actually refuses a purchase they can't afford.
let _myBalance = null;

function _readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function _ownedThemes() { return _readJson(THEME_OWNED_KEY, []); }

// Themes this member may use without buying: today, their own team's. The
// server decides (routers/themes.py derives it from tenure) and sends it on
// /api/members/me; this is the cache of that answer, kept separate from the
// owned list because it is not a purchase — it lapses when the tenure does.
function _freeThemes() { return _readJson(THEME_FREE_KEY, []); }

function _hasTheme(id) { return _ownedThemes().includes(id) || _freeThemes().includes(id); }

function _themeEntry(id) { return THEMES.find(t => t.id === id); }

// A theme is usable if it's free, or if the owned-list cached from this
// member's last /api/members/me says they bought it. The cache is what makes
// the theme paintable before any fetch resolves; the fetch then corrects it,
// which is why _applyTheme runs again when it lands.
function _canUseTheme(id) {
  const e = _themeEntry(id);
  if (!e) return true;   // unknown id — a theme whose catalog entry hasn't loaded yet; don't fight it
  return e.free || _hasTheme(id);
}

// Load the cached catalog immediately (before first paint), then refresh it.
(function _initThemeCatalog() {
  const cached = _readJson(THEME_CATALOG_KEY, null);
  if (Array.isArray(cached) && cached.length) THEMES = cached;
  fetch('/api/themes')
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (!d || !Array.isArray(d.themes)) return;
      THEMES = d.themes;
      try { localStorage.setItem(THEME_CATALOG_KEY, JSON.stringify(d.themes)); } catch { /* private browsing */ }
      _rebuildThemeMenu();
      _applyTheme();
    })
    .catch(() => {});
})();

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

// The theme actually painted: the stored preference, unless it's one this
// browser hasn't unlocked, in which case the default. That fallback is not
// enforcement — every theme's CSS is public and localStorage is the visitor's
// own — it is so a member on a fresh browser, or one who never bought the
// theme their preference names, gets a coherent page instead of a bare one.
function _activeTheme() {
  const id = _effectiveTheme();
  return _canUseTheme(id) ? id : DEFAULT_THEME_PREF;
}

function _applyTheme() {
  document.documentElement.setAttribute('data-theme', _activeTheme());
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
  // The account menu's Theme row names what's chosen ("Match System" for auto).
  const current = document.querySelector('.sb-theme-current');
  if (current) current.textContent = pref === 'auto' ? 'Match System' : (_themeEntry(_activeTheme())?.label || '');
}

function _fmtNby(n) {
  return 'NB¥' + (+n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Try a theme, then decide. Clicking a locked theme paints it for real —
 * whole page, and the confirm dialog is themed too, so it repaints with
 * everything else — and the dialog asks whether to keep it. Cancel, Escape
 * or clicking the scrim puts the old theme straight back.
 *
 * The preview is deliberately scoped to the dialog: it touches only the
 * data-theme attribute, never localStorage, so there is no state to leave
 * someone stranded in a theme they didn't buy, on this page or the next.
 *
 * Locked themes stay in the menu, priced — the same "disabled with the
 * reason, not hidden" rule the roster ⋯ menu and the suggestions Edit button
 * follow. Buying blind off a name is the thing this avoids: "Suns" tells you
 * nothing about whether you want to read tables in it.
 */
async function _unlockTheme(entry, menu) {
  let token = null;
  try { token = localStorage.getItem('nbn_token'); } catch { /* private browsing */ }
  if (!token) {
    token = await promptForToken({ body: 'Themes are unlocked with NB¥ from your member balance, so this needs your token.' });
    if (!token) return;
  }

  // Paint it. Close the dropdown first so the page underneath is actually
  // visible; restore() is the single way back, used by every exit below.
  const previous = document.documentElement.getAttribute('data-theme');
  const restore = () => document.documentElement.setAttribute('data-theme', previous);
  menu?.classList.remove('open');
  document.documentElement.setAttribute('data-theme', entry.id);

  // The page behind the dialog is the pitch — it is the theme, applied. So the
  // dialog is the question, the balance, and the two buttons; the price rides
  // on the confirm button where the decision is. Nothing else to say.
  const price = _fmtNby(entry.price);
  const ok = await confirmDialog({
    title: `Keep the ${entry.label} theme?`,
    body: _myBalance == null ? '' : `Balance: ${_fmtNby(_myBalance)}`,
    confirmLabel: `Keep it — ${price}`,
    cancelLabel: 'Cancel',
  });
  if (!ok) { restore(); return; }

  let res, data;
  try {
    res = await fetch(`/api/members/me/themes/${encodeURIComponent(entry.id)}`,
                      { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    data = await res.json();
  } catch {
    restore();
    toast('Could not reach the server to unlock that theme', true);
    return;
  }
  if (!res.ok) {
    // The refusal string is the server's — it names the price and the
    // balance, and this page never composes one of its own.
    restore();
    toast(data?.detail || 'Could not unlock that theme', true);
    return;
  }

  try { localStorage.setItem(THEME_OWNED_KEY, JSON.stringify(data.owned || [])); } catch { /* private browsing */ }
  _myBalance = data.new_balance;
  _rebuildThemeMenu();
  _setThemePref(entry.id);
  toast(`${entry.label} unlocked — ${_fmtNby(data.new_balance)} left`);
}

// A team theme's row shows that team's logo. The catalog's icon for all 30 is
// the same 🏀, which identifies none of them; `team` (from GET /api/themes) is
// what turns it into a specific one. The emoji is kept as the fallback node, so
// a logo that fails to load leaves a readable row rather than a blank gap.
function _themeIcon(c, cls, defer) {
  cls = cls || 'theme-menu-icon';
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = c.icon;
  if (!c.team) return span;
  const img = document.createElement('img');
  img.className = cls + ' theme-logo-icon';
  img.alt = '';
  img.addEventListener('error', () => img.replaceWith(span));
  const src = `/logos/sm/logo-${String(c.team).toLowerCase()}.webp`;
  // The 30 logos are ~116KB together (the logos/sm thumbnails) and the menu is built on every page, so the
  // rows carry the URL and fetch nothing until the menu is first opened. The
  // button's own icon is visible immediately and is never deferred.
  if (defer) img.dataset.src = src; else img.src = src;
  return img;
}

// Turn the deferred rows into real image loads. Idempotent, so it is safe to
// call on every open and after a rebuild.
function _hydrateThemeLogos(menu) {
  menu.querySelectorAll('img[data-src]').forEach(img => {
    img.src = img.dataset.src;
    delete img.dataset.src;
  });
}

function _themeMenuItems(menu) {
  menu.textContent = '';
  const choices = [{ id: 'auto', label: 'Match System', icon: '🖥️', free: true }, ...THEMES];
  choices.forEach(c => {
    const mine = !c.free && _freeThemes().includes(c.id);   // their own team's — free, and worth saying so
    const locked = !c.free && !_hasTheme(c.id);
    const item = document.createElement('div');
    item.className = 'theme-menu-item' + (locked ? ' locked' : '');
    item.dataset.themeChoice = c.id;
    const price = locked ? `<span class="theme-menu-price">${_fmtNby(c.price)}</span>` : '';
    item.innerHTML = `<span class="theme-menu-label"></span>${price}`
      + `<span class="theme-menu-check">✓</span>`;
    item.prepend(_themeIcon(c, 'theme-menu-icon', true));
    item.querySelector('.theme-menu-label').textContent = c.label;
    item.title = locked ? `Unlock ${c.label} for ${_fmtNby(c.price)}`
                        : mine ? `${c.label} — your team, free` : c.label;
    item.addEventListener('click', () => {
      if (locked) { _unlockTheme(c, menu); return; }
      _setThemePref(c.id);
      menu.classList.remove('open');
    });
    menu.appendChild(item);
  });
}

// Called when the catalog or the owned list arrives after the menu is already
// on the page — both are fetched, and neither blocks the first paint.
function _rebuildThemeMenu() {
  const menu = document.querySelector('.theme-menu');
  if (menu) {
    _themeMenuItems(menu);
    if (menu.classList.contains('open')) _hydrateThemeLogos(menu);
    _refreshThemeMenu();
  }
}

// ── Inbox button ─────────────────────────────────────────────────────────────
// Only on a page that opts out of the sidebar (`<html data-no-sidebar>`):
// everywhere else the inbox is in the sidebar's account menu, and its unread
// count rides on the avatar there and on the ☰. The unread count is only
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

  _unreadCount().then(n => {
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.classList.add('show');
    }
  });
  return btn;
}

// Unread inbox count, once per page — the avatar, the ☰ and the sidebar's Inbox
// row both show it. 0 when signed out (no request then).
let _unreadPromise = null;
function _unreadCount() {
  if (!_unreadPromise) {
    let token = null;
    try { token = localStorage.getItem('nbn_token'); } catch { /* private browsing */ }
    _unreadPromise = !token ? Promise.resolve(0)
      : fetch('/api/inbox', { headers: { Authorization: 'Bearer ' + token } })
          .then(r => r.ok ? r.json() : null)
          .then(d => (d && d.unread_count) || 0)
          .catch(() => 0);
  }
  return _unreadPromise;
}

// ── This member ──────────────────────────────────────────────────────────────
// Who's signed in, fetched once per page and shared by the sidebar's account
// block (bottom left), its committee badges, search's role-gated pages and
// theme unlocks. Each lookup is a promise made on first ask, so nothing here
// costs a request until something needs it.
//
// Sign out everywhere: this browser's token, and the shared .nbn.today session
// cookie (so pdc.nbn.today and dev.nbn.today are signed out too). The one
// sign-out on the site — four pages used to carry their own sign-in/out bar,
// which is how this ended up living nowhere shared.
function nbnSignOut() {
  const done = () => {
    try { localStorage.removeItem('nbn_token'); localStorage.removeItem('nbn_token_name'); } catch { /* private browsing */ }
    location.reload();
  };
  fetch('/api/auth/session/logout', { method: 'POST', credentials: 'same-origin' })
    .catch(() => {}).then(done);
}

// GET /api/me, once per page: the account block and the role-gated sidebar
// and search rows all read it. null when there's no token or it fails.
let _mePromise = null;
function _fetchMe() {
  if (!_mePromise) {
    let token = null;
    try { token = localStorage.getItem('nbn_token'); } catch { /* private browsing */ }
    _mePromise = token
      ? fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null);
  }
  return _mePromise;
}

// This member's current team abbreviation ("ATL"), or null — read off the
// tenures the /members/ directory renders from, since /api/me and
// /api/members/me only name positions ("owner"), not which team.
let _myTeamPromise = null;
function _fetchMyTeam() {
  if (!_myTeamPromise) {
    _myTeamPromise = _fetchMe().then(me => {
      if (!me || !me.name) return null;
      return fetch('/api/members/public')
        .then(r => r.ok ? r.json() : null)
        .then(members => {
          const active = members?.find(m => m.name === me.name)?.tenures?.filter(t => !t.end);
          if (!active?.length) return null;
          return active.sort((a, b) => b.start.localeCompare(a.start))[0].team.toUpperCase();
        });
    }).catch(() => null);
  }
  return _myTeamPromise;
}

// This member's NB¥ balance (a number), or null. Also kept in _myBalance, so a
// theme unlock can say what it would leave them with.
let _balancePromise = null;
function _fetchBalance() {
  if (!_balancePromise) {
    _balancePromise = _fetchMe().then(me => !me || !me.name ? null
      : fetch(`/api/bets/balance/${encodeURIComponent(me.name)}`)
          .then(r => r.ok ? r.json() : null)
          .then(b => (b && b.balance != null ? (_myBalance = +b.balance) : null)))
      .catch(() => null);
  }
  return _balancePromise;
}

// GET /api/members/me: cosmetics bought with NB¥ (name colour, avatar) and the
// themes this member may use. Asked on every signed-in page load, sidebar or
// not, because the theme lists ride on it: caching them is what lets a paid
// theme paint on the next page load before anything resolves, and re-applying
// here is what corrects that cache when it's wrong.
let _profilePromise = null;
function _fetchProfile() {
  if (!_profilePromise) {
    let token = null;
    try { token = localStorage.getItem('nbn_token'); } catch { /* private browsing */ }
    _profilePromise = !token ? Promise.resolve(null)
      : fetch('/api/members/me', { headers: { Authorization: 'Bearer ' + token } })
          .then(r => r.ok ? r.json() : null)
          .then(profile => {
            if (!profile) return null;
            try { localStorage.setItem(THEME_OWNED_KEY, JSON.stringify(profile.cosmetics?.themes || [])); } catch { /* private browsing */ }
            try { localStorage.setItem(THEME_FREE_KEY, JSON.stringify(profile.free_themes || [])); } catch { /* private browsing */ }
            _rebuildThemeMenu();
            _applyTheme();
            return profile;
          })
          .catch(() => null);
  }
  return _profilePromise;
}


// ── Nav injection ────────────────────────────────────────────────────────────

document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') {
    _closeDrawer();
    closeSearch();
    _closeAccountMenu();
    _closeTeamsPanel();
  }
});

// Idempotent by design (bails via the .nav-actions check below) — a page that
// rewrites .nav's innerHTML wholesale after this first runs (players/index.html
// does, to swap in a breadcrumb once its data loads) must call _initNav() again
// afterward, or the rewrite silently wipes out the ☰, search and inbox with
// it. _initNav is a plain global (this file has no module wrapper), so any page
// that includes nav.js can call it directly.
function _initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  // A page that brings no back link of its own gets the name of its sidebar
  // section as the line above its title ("SEASON"); the sidebar is how you
  // move around, so a bare "← Home" said nothing. A page outside the nav
  // keeps "← Home".
  if (!nav.children.length && !nav.textContent.trim() && !nav.hasAttribute('data-no-home')) {
    const section = _activeSectionLabel();
    nav.innerHTML = section
      ? `<span class="nav-kicker">${section}</span>`
      : '<a href="/">← Home</a>';
  }
  if (_sidebarEnabled() && !nav.querySelector('.nav-menu-btn')) nav.prepend(_buildMenuButton());
  // On a phone the sidebar (and its logo) is a closed drawer, which left the
  // top of every page with no sign of what site this is. The mark sits
  // beside the menu button there, and is hidden wherever the sidebar is docked.
  if (_sidebarEnabled() && !nav.querySelector('.nav-brand')) {
    const brand = document.createElement('a');
    brand.className = 'nav-brand';
    brand.href = '/';
    brand.title = 'Nothing But Net';
    brand.innerHTML = '<img src="/icons/logo-header.webp" alt="">NBN';
    nav.querySelector('.nav-menu-btn').after(brand);
  }
  if (!nav.querySelector('.nav-actions')) {
    const actions = document.createElement('div');
    actions.className = 'nav-actions';

    // Search and the inbox live in the sidebar (its search box, Ctrl+K, and
    // the account menu), so the nav carries them only on a page without one.
    // What's left here is token-badge.js's Sign in, on phones.
    if (!_sidebarEnabled() && !nav.hasAttribute('data-no-search')) {
      const btn = document.createElement('button');
      btn.className = 'search-btn nav-icon-btn';
      btn.setAttribute('aria-label', 'Search (Ctrl+K)');
      btn.setAttribute('title', 'Search (Ctrl+K)');
      btn.innerHTML = _ICON_SEARCH;
      btn.addEventListener('click', () => openSearch());
      actions.appendChild(btn);
    }

    if (!_sidebarEnabled()) actions.appendChild(_buildInboxButton());
    nav.appendChild(actions);
  }
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
//
// The site's left-hand navigation, drawn from NAV_SECTIONS. Three states:
//   open  — docked, full width (the default)
//   rail  — docked, icons only
//   drawer — below 900px it is never docked; the ☰ in .nav slides it over
//            the page instead, and open/rail don't apply.
// open/rail is the visitor's choice, kept in localStorage. The first paint is
// theme-boot.js's job, for the same reason as the theme: it sets
// <html data-sidebar> in <head>, so css/sidebar.css reserves the sidebar's
// width before this file (at the end of <body>) gets to draw it. Keep the two
// on the same key and default.
//
// Attached to <body>, not .nav: pages rewrite .nav wholesale (players/), and
// that must not take the sidebar with it. `<html data-no-sidebar>` opts a page
// out entirely.
const SIDEBAR_KEY = 'nbn_sidebar';               // 'open' | 'rail'
// Sections start folded; what's kept is the ones a visitor has unfolded.
// (The old key, 'nbn_sidebar_groups', held folded ones when open was the default.)
const SIDEBAR_GROUPS_KEY = 'nbn_sidebar_open';   // labels of unfolded sections
const _ICON_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="20" y2="17"></line></svg>';
const _ICON_PANEL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="9" y1="4" x2="9" y2="20"></line></svg>';
const _ICON_CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 6 9 12 15 18"></polyline></svg>';
const _ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';

function _sidebarEnabled() { return !document.documentElement.hasAttribute('data-no-sidebar'); }

function _sidebarMode() {
  try { return localStorage.getItem(SIDEBAR_KEY) === 'rail' ? 'rail' : 'open'; } catch { return 'open'; }
}

function _setSidebarMode(mode, persist = true) {
  if (persist) {
    try { localStorage.setItem(SIDEBAR_KEY, mode); } catch { /* private browsing — just won't persist */ }
  }
  document.documentElement.setAttribute('data-sidebar', mode);
  const t = document.querySelector('.sb-collapse');
  if (t) {
    const label = mode === 'rail' ? 'Expand sidebar' : 'Collapse sidebar';
    t.setAttribute('aria-label', label);
    t.title = label;
  }
}

// "/teams/ATL/index.html" and "/teams/ATL" are the same page.
function _normPath(p) {
  return (p.replace(/index\.html$/, '').replace(/\/+$/, '') || '/').toLowerCase();
}

// The row this page belongs to: an exact match, else the longest href this
// path sits under — a team page is under Teams, a season's awards under Awards.
// /awards/race/ matches itself before /awards/, being longer.
function _activeNavHref() {
  const here = _normPath(location.pathname);
  let best = null;
  for (const p of _NAV_ITEMS) {
    if (p.searchOnly || !p.href.startsWith('/') || p.href.includes('#')) continue;
    // `also`: other pages that live under this row (reached from its page, not the sidebar).
    for (const h of [_normPath(p.href), ...(p.also || []).map(_normPath)]) {
      if (here === h || (h !== '/' && here.startsWith(h + '/'))) {
        if (!best || h.length > best.len) best = { href: p.href, len: h.length };
      }
    }
  }
  return best && best.href;
}

// The NAV_SECTIONS label of the section this page sits in, or null.
function _activeSectionLabel() {
  const href = _activeNavHref();
  const s = href && NAV_SECTIONS.find(sec => sec.items.some(p => p.href === href));
  return s ? s.label : null;
}

function _openGroups() { return new Set(_readJson(SIDEBAR_GROUPS_KEY, [])); }

// Pinned pages: per browser, stored as hrefs and resolved against NAV_SECTIONS
// on every draw, so a page that leaves the nav drops out of the list.
const SIDEBAR_PINS_KEY = 'nbn_sidebar_pins';
const _ICON_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,3 14.7,8.6 20.8,9.4 16.3,13.6 17.5,19.7 12,16.7 6.5,19.7 7.7,13.6 3.2,9.4 9.3,8.6"></polygon></svg>';

function _navItemFor(href) { return _NAV_ITEMS.find(p => p.href === href && !p.searchOnly) || null; }

function _sidebarPins() { return _readJson(SIDEBAR_PINS_KEY, []).filter(_navItemFor); }

function _togglePin(href) {
  const pins = _sidebarPins();
  const i = pins.indexOf(href);
  i === -1 ? pins.push(href) : pins.splice(i, 1);
  try { localStorage.setItem(SIDEBAR_PINS_KEY, JSON.stringify(pins)); } catch { /* private browsing */ }
  _drawPersonalGroups();
}

let _rolesKnown = null; // the resolved _myRoles() set, once it is in

// A row: the link, and the ☆ that pins it. Two siblings rather than a button
// inside the <a>, which would nest one control inside another.
function _sidebarRow(p, active) {
  const row = document.createElement('div');
  row.className = 'sb-row';
  row.dataset.href = p.href;
  if (p.roles) {
    row.dataset.roles = p.roles.join(' ');
    row.hidden = !(_rolesKnown && _qualifies(p, _rolesKnown)) && !_badges[p.href];
  }

  const a = document.createElement('a');
  a.className = 'sb-link';
  a.href = p.href;
  a.title = p.title;
  if (p.href === active) a.setAttribute('aria-current', 'page');
  if (!p.href.startsWith('/')) { a.target = '_blank'; a.rel = 'noopener'; }
  // No icon on a row: the section header carries it.
  const text = document.createElement('span');
  text.className = 'sb-label';
  text.textContent = p.short || p.title;
  a.append(text);

  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'sb-pin';
  pin.innerHTML = _ICON_STAR;
  pin.addEventListener('click', () => _togglePin(p.href));

  row.append(a, pin);
  return row;
}

// One foldable group. `key` is what the fold is remembered under; `icon` is
// the header's, and in rail mode the header is all that shows of the group.
function _sidebarGroup(label, key, rows, active, open, icon) {
  const group = document.createElement('div');
  group.className = 'sb-group';
  // The section holding this page is never drawn folded — a highlight you
  // can't see is no highlight — but that doesn't overwrite the saved fold.
  if (!open.has(key) && !rows.some(p => p.href === active)) group.classList.add('folded');

  const hdr = document.createElement('button');
  hdr.type = 'button';
  hdr.className = 'sb-group-hdr';
  hdr.setAttribute('aria-expanded', group.classList.contains('folded') ? 'false' : 'true');
  hdr.title = label;
  hdr.innerHTML = `<span class="sb-icon">${_navIcon(icon)}</span><span class="sb-group-label sb-label"></span>`
    + `<span class="sb-group-live" hidden title="Live now"></span>`
    + `<span class="sb-group-badge" hidden></span><span class="sb-group-chev">${_ICON_CHEVRON}</span>`;
  hdr.querySelector('.sb-group-label').textContent = label;
  if (rows.some(p => p.href === active)) group.classList.add('holds-active');
  hdr.addEventListener('click', () => {
    // In the rail the rows are hidden, so a header opens the sidebar on its
    // section rather than folding something you can't see.
    if (_sidebarMode() === 'rail' && !_drawerOpen() && window.matchMedia('(min-width: 900px)').matches) {
      _setSidebarMode('open');
      group.classList.remove('folded');
      hdr.setAttribute('aria-expanded', 'true');
      const f = _openGroups(); f.add(key);
      try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify([...f])); } catch { /* private browsing */ }
      group.scrollIntoView({ block: 'nearest' });
      _refreshBadges();
      return;
    }
    const isFolded = group.classList.toggle('folded');
    hdr.setAttribute('aria-expanded', isFolded ? 'false' : 'true');
    const f = _openGroups();
    isFolded ? f.delete(key) : f.add(key);
    try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify([...f])); } catch { /* private browsing */ }
    _refreshBadges();
  });
  group.appendChild(hdr);

  const list = document.createElement('div');
  list.className = 'sb-items';
  rows.forEach(p => list.appendChild(_sidebarRow(p, active)));
  group.appendChild(list);
  return group;
}

// Pinned, redrawn whenever a pin changes; left out while empty, so a first
// visit sees only the site's sections. The sidebar is otherwise the same on
// every page — it deliberately keeps no history of where you've been.
function _drawPersonalGroups() {
  const slot = document.querySelector('.sb-personal');
  if (!slot) return;
  const active = _activeNavHref();
  const open = _openGroups();
  const pins = _sidebarPins();
  slot.replaceChildren();
  if (pins.length) slot.appendChild(_sidebarGroup('Pinned', '_pinned', pins.map(_navItemFor), active, open, 'star'));
  _refreshPinState();
  _refreshBadges();
}

function _refreshPinState() {
  const pins = new Set(_sidebarPins());
  document.querySelectorAll('.sidebar .sb-row').forEach(row => {
    const on = pins.has(row.dataset.href);
    const btn = row.querySelector('.sb-pin');
    row.classList.toggle('pinned', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = (on ? 'Unpin ' : 'Pin ') + row.querySelector('.sb-link').title;
    btn.setAttribute('aria-label', label);
    btn.title = on ? 'Unpin' : 'Pin to the top';
  });
}

// ── Badges ──
// Beside a row: unread inbox and committee work as accent counts; games on
// today's slate as muted text ('info'), or LIVE while the stream is on
// ('live'). Only counts are something to clear, so only they add up on a
// header — an info line reading as "2 unread" is what this split is for.
// Kept here as values and re-applied after any redraw, since Pinned rows
// come and go.
const _badges = {};

function _setBadge(href, n, label, kind = 'count', text = null) {
  _badges[href] = n > 0 ? { n, label, kind, text } : null;
  _refreshBadges();
}

function _refreshBadges() {
  document.querySelectorAll('.sidebar .sb-row, .sidebar .sb-top-link').forEach(row => {
    const b = _badges[row.dataset.href];
    const link = row.classList.contains('sb-top-link') ? row : row.querySelector('.sb-link');
    let el = link.querySelector('.sb-badge');
    if (!b) { el?.remove(); return; }
    if (!el) { el = document.createElement('span'); link.appendChild(el); }
    el.className = 'sb-badge' + (b.kind === 'count' ? '' : ` sb-badge-${b.kind}`);
    el.textContent = b.text ?? (b.n > 99 ? '99+' : String(b.n));
    el.title = b.label;
  });
  // A header shows its rows' total when you can't see the rows: folded, or
  // in rail mode (css/sidebar.css decides which; this keeps the number).
  document.querySelectorAll('.sidebar .sb-group').forEach(group => {
    const shown = [...group.querySelectorAll('.sb-row:not([hidden])')].map(row => _badges[row.dataset.href]);
    const total = shown.reduce((n, b) => n + (b?.kind === 'count' ? b.n : 0), 0);
    const el = group.querySelector('.sb-group-badge');
    el.hidden = !total;
    el.textContent = total > 99 ? '99+' : String(total);
    group.querySelector('.sb-group-live').hidden = !shown.some(b => b?.kind === 'live');
  });
}

// Today's date in league time. league-time.js owns this, but it isn't on every
// page; the fallback is the same rule (America/New_York, as YYYY-MM-DD).
function _leagueToday() {
  if (typeof nbnToday === 'function') return nbnToday();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// How many games are scheduled today. The one request the sidebar adds, so it
// is asked once per tab per ten minutes rather than on every page.
const GAMES_TODAY_KEY = 'nbn_games_today';
function _gamesToday() {
  const today = _leagueToday();
  try {
    const c = JSON.parse(sessionStorage.getItem(GAMES_TODAY_KEY));
    if (c && c.date === today && Date.now() - c.at < 10 * 60 * 1000) return Promise.resolve(c.n);
  } catch { /* private browsing / nothing cached */ }
  return _schedule()
    .then(d => {
      const n = (d?.games || []).filter(g => g.date === today).length;
      try { sessionStorage.setItem(GAMES_TODAY_KEY, JSON.stringify({ date: today, n, at: Date.now() })); } catch { /* ignore */ }
      return n;
    })
    .catch(() => 0);
}

// Whether twitch.tv/nothingbutnet is live, from the same GET /api/stream/live
// the homepage banner polls. Cached a minute per tab, as the API caches it.
const STREAM_LIVE_KEY = 'nbn_stream_live';
function _streamLive() {
  try {
    const c = JSON.parse(sessionStorage.getItem(STREAM_LIVE_KEY));
    if (c && Date.now() - c.at < 60 * 1000) return Promise.resolve(c.live);
  } catch { /* private browsing / nothing cached */ }
  return fetch('/api/stream/live')
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      const live = !!(d && d.live);
      try { sessionStorage.setItem(STREAM_LIVE_KEY, JSON.stringify({ live, at: Date.now() })); } catch { /* ignore */ }
      return live;
    })
    .catch(() => false);
}

// Calendar: "2 games today" in muted text, or LIVE while a game day is on stream.
// Asked only on a day with games, so an off-day stream doesn't mark the
// calendar live.
function _loadCalendarBadge() {
  _gamesToday().then(n => {
    if (!n) return;
    const today = `${n} game${n === 1 ? '' : 's'} today`;
    _setBadge('/calendar', n, today, 'info', today);
    _streamLive().then(live => {
      if (live) _setBadge('/calendar', n, `Live on Twitch now · ${today}`, 'live', 'LIVE');
    });
  });
}

// ── Committee work ──
// "Something here needs you" counts on the committee rows, each counted by the
// same rule its page uses to flag a row as yours — so the badge and the page
// can't disagree about what's waiting. Fetched only for members holding the
// role, after the page has settled, and cached per tab for two minutes: these
// lists are heavier than anything else nav.js asks for, and they change when
// someone acts, not by the second.
const WORK_TTL_MS = 2 * 60 * 1000;

function _authHeaders() {
  let token = null;
  try { token = localStorage.getItem('nbn_token'); } catch { /* private browsing */ }
  return token ? { Authorization: 'Bearer ' + token } : {};
}

function _getJson(url) {
  return fetch(url, { credentials: 'same-origin', headers: _authHeaders() })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))));
}

// A count cached in sessionStorage under this member's name, so signing in as
// someone else in the same tab never shows the last person's queue.
function _cachedCount(key, who, fetchCount) {
  const k = 'nbn_work_' + key;
  try {
    const c = JSON.parse(sessionStorage.getItem(k));
    if (c && c.who === who && Date.now() - c.at < WORK_TTL_MS) return Promise.resolve(c.n);
  } catch { /* nothing cached */ }
  return fetchCount().then(n => {
    try { sessionStorage.setItem(k, JSON.stringify({ n, who, at: Date.now() })); } catch { /* ignore */ }
    return n;
  }).catch(() => 0);
}

// One schedule and one box-score index per page, shared by the games-today,
// stats and stream counts.
let _schedulePromise = null;
function _schedule() {
  if (!_schedulePromise) _schedulePromise = fetch('/api/schedule').then(r => (r.ok ? r.json() : null)).catch(() => null);
  return _schedulePromise;
}
let _enteredPromise = null;
function _enteredGames(season) {
  if (!_enteredPromise) {
    _enteredPromise = fetch(`/api/boxscores/games?season=${encodeURIComponent(season)}`)
      .then(r => (r.ok ? r.json() : [])).catch(() => []);
  }
  return _enteredPromise;
}

// TRC — committees/trc renderRequest's `mine`: a ballot not yet cast (trc /
// trc_head only; admin doesn't vote), a trade ready to finalize (the head), or
// a trade waiting on the consent of a team this member owns.
function _trcWork(me) {
  const roles = new Set(me.roles || []);
  const isTrc = roles.has('trc') || roles.has('trc_head');
  const isHead = roles.has('trc_head') || roles.has('admin');
  const owns = new Set(me.owner_of || []);
  if (!isTrc && !isHead && !owns.size) return Promise.resolve(0);
  return _getJson('/api/trade-requests').then(items => (items || []).filter(i => {
    if (['finalized', 'rejected', 'withdrawn'].includes(i.status)) return false;
    const consent = i.status === 'awaiting_consent'
      && (i.parties || []).some(p => owns.has(p) && !((i.consents || {})[p] || {}).consented);
    const finalize = isHead && i.status === 'ready_to_finalize';
    const ballot = isTrc && ['balloting', 'ready_to_finalize'].includes(i.status) && !(i.ballots || {})[me.name];
    return consent || finalize || ballot;
  }).length);
}

// PDC — committees/pdc's list tabs: your assigned free agents still needing
// your ballot (fac), unblocked players on the agents' queue (agent), players
// needing a result (head). A head counts as an agent there, so here too.
function _pdcWork(me) {
  const roles = new Set(me.roles || []);
  const isHead = roles.has('admin') || roles.has('fac_head');
  const isFac = isHead || roles.has('fac');
  const isAgent = isHead || roles.has('agent');
  if (!isFac && !isAgent) return Promise.resolve(0);
  return _getJson('/api/fa/state').then(state => Object.values(state?.players || {}).filter(p =>
    (isFac && p.mine && !p.balloted && !p.finalized && p.stage === 'with_committee')
    || (isAgent && p.stage === 'awaiting_agent' && !p.claim_refusal)
    || (isHead && p.needs_result)).length);
}

// Stats — committees/stats renderTiles' "Awaiting entry": games scheduled up to
// today with no box score on file. A game with its sides swapped is the same game.
function _statsWork(me) {
  const roles = new Set(me.roles || []);
  if (!roles.has('stats') && !roles.has('admin')) return Promise.resolve(0);
  const key = (d, a, b) => `${d}|${[a, b].sort().join('~')}`;
  const today = _leagueToday();
  return _schedule().then(sched => {
    if (!sched?.season) return 0;
    return _enteredGames(sched.season).then(games => {
      const entered = new Set(games.map(g => key(g.date, g.home_team, g.away_team)));
      return (sched.games || []).filter(f => f.date <= today && !entered.has(key(f.date, f.home_team, f.away_team))).length;
    });
  });
}

// Stream — committees/stream openRequests: a member's request to buy a stream,
// for a game not yet played, that no streamer has answered.
function _streamWork(me) {
  const roles = new Set(me.roles || []);
  if (!roles.has('streamer') && !roles.has('admin')) return Promise.resolve(0);
  const today = _leagueToday();
  return _schedule().then(sched => {
    if (!sched?.season) return 0;
    return _enteredGames(sched.season).then(games => {
      const played = new Set(games.map(g => `${g.date}|${g.away_team}|${g.home_team}`));
      return (sched.games || []).filter(g => g.stream_request && g.date >= today
        && !played.has(`${g.date}|${g.away_team}|${g.home_team}`)).length;
    });
  });
}

// /api/auth/me is what the committee pages themselves ask (it carries
// owner_of, which /api/me doesn't); asked only when one of the counts needs it.
function _loadWorkBadges() {
  if (!_maybeSignedIn()) return;
  _getJson('/api/auth/me').then(me => {
    if (!me || !me.name) return;
    const work = [
      ['/committees/trc/', 'trc', _trcWork, n => `${n} trade${n === 1 ? '' : 's'} waiting on you`],
      ['/committees/pdc/', 'pdc', _pdcWork, n => `${n} free agent${n === 1 ? '' : 's'} waiting on you`],
      ['/committees/stats/', 'stats', _statsWork, n => `${n} game${n === 1 ? '' : 's'} awaiting a box score`],
      ['/committees/stream/', 'stream', _streamWork, n => `${n} stream request${n === 1 ? '' : 's'} to answer`],
    ];
    for (const [href, key, count, label] of work) {
      _cachedCount(key, me.name, () => count(me)).then(n => {
        // An owner with a trade awaiting their consent sees TRC even without
        // a committee role: that's the one place the consent button lives.
        if (n > 0) document.querySelectorAll(`.sidebar .sb-row[data-href="${href}"]`).forEach(r => { r.hidden = false; });
        _setBadge(href, n, label(n));
      });
    }
  }).catch(() => {});
}

// ── Teams ──
// A top-level entry that opens every team at once, by division, in a panel
// to the right of the sidebar (inline, under the entry, in the phone drawer).
// Hover opens it on a pointer device, click on anything; it replaces the strip
// of 30 logos that used to run across the top of the homepage.
function _buildTeamsEntry() {
  const here = location.pathname.match(/^\/teams\/([a-z]{3})\b/i)?.[1]?.toUpperCase() || null;
  const onTeams = /^\/teams(\/|$)/i.test(location.pathname);

  const wrap = document.createElement('div');
  wrap.className = 'sb-teams';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sb-group-hdr sb-teams-btn' + (onTeams ? ' holds-active' : '');
  btn.title = 'Teams';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'sb-teams-panel');
  btn.innerHTML = `<span class="sb-icon">${_navIcon('basketball')}</span><span class="sb-group-label sb-label">Teams</span>`
    + `<span class="sb-group-chev sb-teams-chev">${_ICON_CHEVRON}</span>`;

  const panel = document.createElement('div');
  panel.className = 'sb-teams-panel';
  panel.id = 'sb-teams-panel';
  panel.hidden = true;
  const grid = document.createElement('div');
  grid.className = 'sb-teams-grid';
  for (const [division, teams] of TEAM_DIVISIONS) {
    const col = document.createElement('div');
    col.className = 'sb-teams-div';
    const h = document.createElement('div');
    h.className = 'sb-teams-div-name';
    h.textContent = division;
    col.appendChild(h);
    for (const t of teams) {
      const a = document.createElement('a');
      a.className = 'sb-team';
      a.href = `/teams/${t}/`;
      if (t === here) a.setAttribute('aria-current', 'page');
      // Logos load on first open, not with every page: 30 of them is ~116KB.
      a.innerHTML = `<img data-src="/logos/sm/logo-${t.toLowerCase()}.webp" alt=""><span></span>`;
      a.querySelector('span').textContent = TEAM_LIST[t] || t;
      col.appendChild(a);
    }
    grid.appendChild(col);
  }
  panel.appendChild(grid);
  panel.insertAdjacentHTML('beforeend', '<a class="sb-teams-all" href="/teams">All teams →</a>');

  const docked = () => window.matchMedia('(min-width: 900px)').matches;
  const place = () => {
    if (!docked()) { panel.style.top = ''; return; }
    // Beside the entry, kept on screen when the entry is low in the sidebar.
    const top = btn.getBoundingClientRect().top;
    panel.style.top = Math.max(8, Math.min(top, window.innerHeight - panel.offsetHeight - 8)) + 'px';
  };
  const open = () => {
    if (!panel.hidden) return;
    panel.querySelectorAll('img[data-src]').forEach(img => { img.src = img.dataset.src; delete img.dataset.src; });
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    wrap.classList.add('open');
    place();
  };
  const close = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('open');
  };
  _closeTeamsPanel = close;

  btn.addEventListener('click', e => { e.stopPropagation(); panel.hidden ? open() : close(); });
  // Hover, with a beat of grace either way: no flicker crossing the gap from
  // the entry to the panel, and no panel for a mouse just passing by.
  let timer = null;
  const hoverable = window.matchMedia('(hover: hover)');
  [btn, panel].forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (!hoverable.matches || !docked()) return;
      clearTimeout(timer); timer = setTimeout(open, 120);
    });
    el.addEventListener('mouseleave', () => {
      if (!hoverable.matches || !docked()) return;
      clearTimeout(timer); timer = setTimeout(close, 250);
    });
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  panel.addEventListener('click', e => { if (e.target.closest('a')) { close(); _closeDrawer(); } });
  window.addEventListener('resize', () => { if (!panel.hidden) place(); });

  wrap.append(btn, panel);
  return wrap;
}
let _closeTeamsPanel = () => {};

// Inbox: a top-level entry under Teams, carrying the unread count. A link,
// not a section — signed out, /inbox/ asks you to sign in itself.
function _buildInboxEntry() {
  const a = document.createElement('a');
  a.className = 'sb-group-hdr sb-top-link';
  a.href = '/inbox/';
  a.dataset.href = '/inbox/';
  a.title = 'Inbox';
  if (/^\/inbox(\/|$)/.test(location.pathname)) a.setAttribute('aria-current', 'page');
  a.innerHTML = `<span class="sb-icon">${_navIcon('inbox')}</span><span class="sb-group-label sb-label">Inbox</span>`;
  return a;
}

// ── Account ──
// Bottom left: who you are (avatar or initials, name, team) and, on click, a
// menu with everything that's yours — profile, team, inbox, NB¥, the theme
// picker, sign out. It replaces the profile and theme buttons the nav used to
// carry. Signed out, it's a Sign in button whose menu still offers themes.
function _teamRecord(abbr) {
  return fetch(`/data/${abbr.toLowerCase()}-seasons.csv`)
    .then(r => r.ok ? r.text() : '')
    .then(text => {
      const rows = text ? parseCSV(text) : [];
      if (!rows.length) return null;
      const last = rows.slice().sort((a, b) => String(a.SEASON).localeCompare(String(b.SEASON))).pop();
      return last && last.W !== undefined ? `${last.W}–${last.L}` : null;
    })
    .catch(() => null);
}

function _initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function _closeAccountMenu() {
  const menu = document.querySelector('.sb-acct-menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  document.querySelector('.sb-acct-btn')?.setAttribute('aria-expanded', 'false');
  document.querySelector('.sb-acct-menu .theme-menu')?.classList.remove('open');
}

function _acctItem(tag, label, icon, href) {
  const el = document.createElement(tag);
  el.className = 'sb-acct-item';
  el.setAttribute('role', 'menuitem');
  if (href) el.href = href; else el.type = 'button';
  el.innerHTML = `<span class="sb-acct-item-icon">${_navIcon(icon)}</span><span class="sb-acct-item-label"></span>`;
  el.querySelector('.sb-acct-item-label').textContent = label;
  return el;
}

function _buildAccount() {
  const wrap = document.createElement('div');
  wrap.className = 'sb-account';
  wrap.innerHTML = `
    <button type="button" class="sb-acct-btn" aria-haspopup="menu" aria-expanded="false">
      <span class="sb-avatar-wrap"><span class="sb-avatar">${_ICON_PERSON}</span></span>
      <span class="sb-acct-text sb-label">
        <span class="sb-acct-name">Sign in</span>
        <span class="sb-acct-sub">Guest</span>
      </span>
    </button>
    <div class="sb-acct-menu" role="menu" hidden></div>`;
  const btn = wrap.querySelector('.sb-acct-btn');
  const menu = wrap.querySelector('.sb-acct-menu');
  const avatar = wrap.querySelector('.sb-avatar');
  const nameEl = wrap.querySelector('.sb-acct-name');
  const subEl = wrap.querySelector('.sb-acct-sub');
  btn.title = 'Account and settings';

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (!menu.hidden) { _closeAccountMenu(); return; }
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) _closeAccountMenu(); });
  // Choosing anything but the theme toggle closes the menu.
  menu.addEventListener('click', e => {
    if (e.target.closest('a.sb-acct-item')) _closeAccountMenu();
  });

  // The theme picker: a row naming the current theme that unfolds the list in
  // place. The list keeps the .theme-menu class, so _rebuildThemeMenu,
  // _refreshThemeMenu and _unlockTheme find it exactly as they found the nav's.
  const themeRow = _acctItem('button', 'Theme', 'palette');
  themeRow.classList.add('sb-acct-theme');
  themeRow.insertAdjacentHTML('beforeend', '<span class="sb-theme-current"></span>');
  const themeList = document.createElement('div');
  themeList.className = 'theme-menu';
  _themeMenuItems(themeList);
  themeRow.addEventListener('click', e => {
    e.stopPropagation();
    _hydrateThemeLogos(themeList);
    themeList.classList.toggle('open');
  });

  const divider = () => Object.assign(document.createElement('div'), { className: 'sb-acct-divider' });

  // The Change Log, with the version the site is on beside it.
  const changelog = _acctItem('a', 'Change Log', 'tag', '/changelog');
  fetch('/version.json').then(r => r.json()).then(d => {
    if (d?.version) changelog.insertAdjacentHTML('beforeend', `<span class="sb-acct-item-meta">v${d.version}</span>`);
  }).catch(() => {});

  const signedOut = () => {
    menu.replaceChildren();
    const signIn = _acctItem('button', 'Sign in', 'person-plus');
    // token-badge.js owns signing in (its button stays in the nav on phones);
    // use it when it's there, so both paths do exactly the same thing.
    signIn.addEventListener('click', async () => {
      _closeAccountMenu();
      _closeDrawer();
      const navBtn = document.getElementById('nbn-token-badge');
      if (navBtn && navBtn.tagName === 'BUTTON') { navBtn.click(); return; }
      if (await promptForToken()) location.reload();
    });
    menu.append(signIn, divider(), themeRow, themeList, changelog);
    _refreshThemeMenu();
  };
  signedOut();

  _fetchMe().then(me => {
    if (!me || !me.name) return;
    nameEl.textContent = me.name;
    subEl.textContent = 'Member';
    avatar.textContent = _initials(me.name);
    avatar.classList.add('initials');

    const head = document.createElement('div');
    head.className = 'sb-acct-head';
    head.innerHTML = '<span class="sb-acct-head-name"></span><span class="sb-acct-head-sub"></span>';
    head.querySelector('.sb-acct-head-name').textContent = me.name;
    const headSub = head.querySelector('.sb-acct-head-sub');

    const profile = _acctItem('a', 'My profile', 'owner', `/members/${encodeURIComponent(me.name)}/`);
    const inbox = _acctItem('a', 'Inbox', 'inbox', '/inbox/');
    const nby = _acctItem('a', 'NB¥ history', 'yen', `/nbyen/?m=${encodeURIComponent(me.name)}`);
    const signOut = _acctItem('button', 'Sign out', 'exit');
    signOut.classList.add('sb-acct-signout');
    signOut.addEventListener('click', nbnSignOut);
    const teamSlot = document.createElement('div');
    menu.replaceChildren(head, profile, teamSlot, inbox, nby, divider(), themeRow, themeList, changelog, divider(), signOut);
    _refreshThemeMenu();

    // Unread mail shows on the avatar too — the inbox used to be its own
    // button in the nav, and its count shouldn't go out of sight with it.
    _unreadCount().then(n => {
      if (!n) return;
      const count = n > 99 ? '99+' : String(n);
      inbox.insertAdjacentHTML('beforeend', `<span class="sb-badge">${count}</span>`);
      wrap.querySelector('.sb-avatar-wrap').insertAdjacentHTML('beforeend',
        `<span class="sb-avatar-badge" title="${count} unread">${count}</span>`);
    });
    _fetchBalance().then(b => { if (b != null) headSub.textContent = 'NB¥ ' + b.toLocaleString('en-US', { maximumFractionDigits: 0 }); });
    _fetchProfile().then(p => {
      if (p?.cosmetics?.name_color) nameEl.style.color = p.cosmetics.name_color;
      if (p?.avatar_url) {
        avatar.classList.remove('initials');
        avatar.innerHTML = `<img src="${p.avatar_url}?v=${Date.now()}" alt="">`;
      }
    });
    _fetchMyTeam().then(team => {
      if (!team) return;
      const name = TEAM_LIST[team] || team;
      subEl.textContent = name;
      const link = _acctItem('a', name, 'basketball', `/teams/${team.toLowerCase()}/`);
      link.querySelector('.sb-acct-item-icon').innerHTML = `<img src="/logos/sm/logo-${team.toLowerCase()}.webp" alt="">`;
      teamSlot.replaceWith(link);
      _teamRecord(team).then(rec => {
        if (!rec) return;
        subEl.textContent = `${name} · ${rec}`;
        link.insertAdjacentHTML('beforeend', `<span class="sb-acct-item-meta">${rec}</span>`);
      });
    });
  });
  return wrap;
}

function _buildSidebar() {
  if (!_sidebarEnabled() || document.querySelector('.sidebar')) return;
  // theme-boot.js normally set this already; pages without it get it here.
  if (!document.documentElement.hasAttribute('data-sidebar')) {
    document.documentElement.setAttribute('data-sidebar', _sidebarMode());
  }

  const active = _activeNavHref();
  const open = _openGroups();

  const aside = document.createElement('aside');
  aside.className = 'sidebar';
  aside.id = 'nbn-sidebar';
  aside.setAttribute('aria-label', 'Site');

  const head = document.createElement('div');
  head.className = 'sb-head';
  head.innerHTML = `
    <a class="sb-home" href="/" title="Nothing But Net"><img src="/icons/logo-header.webp" alt=""><span class="sb-label sb-brand"><span class="sb-brand-name">Nothing But Net</span><span class="sb-brand-sub">Basketball Simulation<br>GM League</span></span></a>
    <button type="button" class="sb-collapse">${_ICON_PANEL}</button>
    <button type="button" class="sb-close nav-icon-btn" aria-label="Close menu">${_ICON_CLOSE}</button>`;
  head.querySelector('.sb-close').addEventListener('click', _closeDrawer);
  // Expand/collapse lives at the top, beside the logo (where Claude's own
  // sidebar keeps it); below 900px the ✕ takes its place.
  head.querySelector('.sb-collapse').addEventListener('click', () => {
    _setSidebarMode(_sidebarMode() === 'rail' ? 'open' : 'rail');
  });
  aside.appendChild(head);

  const search = document.createElement('button');
  search.type = 'button';
  search.className = 'sb-search';
  search.title = 'Search (Ctrl+K)';
  search.innerHTML = `<span class="sb-icon">${_ICON_SEARCH}</span><span class="sb-label sb-search-text">Search…</span><kbd class="sb-label">Ctrl K</kbd>`;
  search.addEventListener('click', () => { _closeDrawer(); openSearch(); });
  aside.appendChild(search);

  const nav = document.createElement('nav');
  nav.className = 'sb-sections';
  nav.appendChild(_buildTeamsEntry());
  nav.appendChild(_buildInboxEntry());
  const personal = document.createElement('div');
  personal.className = 'sb-personal';
  nav.appendChild(personal);
  for (const sec of NAV_SECTIONS) {
    const rows = sec.items.filter(p => !p.searchOnly);
    if (rows.length) nav.appendChild(_sidebarGroup(sec.label, sec.label, rows, active, open, sec.icon));
  }
  aside.appendChild(nav);

  const foot = document.createElement('div');
  foot.className = 'sb-foot';
  foot.appendChild(_buildAccount());
  aside.appendChild(foot);

  const scrim = document.createElement('div');
  scrim.className = 'sb-scrim';
  scrim.addEventListener('click', _closeDrawer);

  // Following a link closes the drawer, so Back doesn't return to it open.
  nav.addEventListener('click', e => { if (e.target.closest('a')) _closeDrawer(); });
  aside.addEventListener('keydown', _trapDrawerFocus);

  document.body.prepend(scrim);
  document.body.prepend(aside);
  _setSidebarMode(_sidebarMode(), false);

  _drawPersonalGroups();

  // Role-gated rows stay hidden until this member is known to qualify.
  _myRoles().then(roles => {
    _rolesKnown = roles;
    aside.querySelectorAll('.sb-row[data-roles]').forEach(row => {
      if (_badges[row.dataset.href]) return; // revealed by a waiting-on-you badge
      row.hidden = !_qualifies({ roles: row.dataset.roles ? row.dataset.roles.split(' ') : [] }, roles);
    });
  });

  _unreadCount().then(n => _setBadge('/inbox/', n, `${n} unread`));
  _loadCalendarBadge();
  // Committee queues wait until the page itself has had the network.
  (window.requestIdleCallback || (fn => setTimeout(fn, 1500)))(_loadWorkBadges);

  // Keep the current row in view in a long list (Stats alone is 5 rows) —
  // the one in its own section, not a copy in Pinned.
  aside.querySelector('.sb-sections > .sb-group [aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
}

function _drawerOpen() { return document.documentElement.classList.contains('sb-drawer-open'); }

function _openDrawer() {
  document.documentElement.classList.add('sb-drawer-open');
  document.querySelector('.nav-menu-btn')?.setAttribute('aria-expanded', 'true');
  document.querySelector('.sidebar .sb-close')?.focus();
}

function _closeDrawer() {
  if (!_drawerOpen()) return;
  document.documentElement.classList.remove('sb-drawer-open');
  const btn = document.querySelector('.nav-menu-btn');
  btn?.setAttribute('aria-expanded', 'false');
  btn?.focus();
}

// While the drawer covers the page, Tab cycles inside it.
function _trapDrawerFocus(e) {
  if (e.key !== 'Tab' || !_drawerOpen()) return;
  const els = [...e.currentTarget.querySelectorAll('a[href], button')].filter(el => el.offsetParent !== null);
  if (!els.length) return;
  const first = els[0], last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// The ☰ that opens the drawer. Only shown below the docking breakpoint (CSS),
// and first in .nav so it sits where a phone user looks for it.
function _buildMenuButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-menu-btn nav-icon-btn';
  btn.setAttribute('aria-label', 'Menu');
  btn.setAttribute('aria-controls', 'nbn-sidebar');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = _ICON_MENU;
  btn.addEventListener('click', () => (_drawerOpen() ? _closeDrawer() : _openDrawer()));
  // On a phone the drawer hides the account menu, so unread mail marks the ☰.
  _unreadCount().then(n => {
    if (!n) return;
    btn.classList.add('has-unread');
    btn.setAttribute('aria-label', `Menu — ${n} unread`);
  });
  return btn;
}


// ── Site pages ───────────────────────────────────────────────────────────────
//
// The one list of the site's pages. The sidebar draws it section by section;
// the search overlay flattens it (SITE_PAGES / ROLE_PAGES below). Sections and
// their order follow the homepage's link tiles — those are still a separate
// hand-kept list in index.html, so a new page goes in both until they merge.
//
// `roles`: the page only exists for people holding one of these (admin always
// qualifies). Kept out of everyone's search and sidebar — a page 27 of 30
// owners can't use has no business in their jump box. The gate is a courtesy
// either way; the security boundary is the API, which is what the PDC
// dashboard's own shell relies on too.
// `icon`: a symbol id in icons/nav-icons.svg (made by build/make_nav_icons.py,
// which says how to add one). The sidebar draws a section's icon on its
// header and none on its rows; a row's own icon is what search shows.
// `searchOnly`: a deep link into another page (a tab, a section) — worth
// finding by name in search, but noise as its own sidebar row.
// `noSearch`: the reverse — a sidebar row that search leaves out.
const NAV_SECTIONS = [
  { label: 'Season', icon: 'calendar', items: [
    { title: 'Calendar', href: '/calendar', icon: 'calendar' },
    { title: 'Standings & Playoffs', href: '/standings', icon: 'standings' },
    { title: 'Award Race', href: '/awards/race/', icon: 'flag' },
    { title: 'Injuries', href: '/injuries/', icon: 'medical', keywords: ['injury report', 'hurt', 'out'] },
    { title: 'Season Stats', href: '/stats/seasons', icon: 'bar-chart' },
  ] },
  { label: 'Front Office', icon: 'swap', items: [
    { title: 'Trade Block', href: '/tradeblock/', icon: 'swap' },
    { title: 'Free Agency', href: '/free-agency/', icon: 'pen' },
    { title: 'Extensions', href: '/extensions/', icon: 'doc-plus' },
    { title: 'Transactions', href: '/transactions', icon: 'doc-lines' },
    { title: 'Transaction Simulator', href: '/transaction-sim/', icon: 'calculator', keywords: ['trade machine', 'trade builder', 'trade simulator'] },
    { title: 'Cap Summary', href: '/cap-summary/', icon: 'money' },
  ] },
  { label: 'History', icon: 'trophy', items: [
    { title: 'Season Summary', href: '/season-summary', icon: 'scroll' },
    { title: 'Hall of Champions', href: '/champions/', icon: 'trophy' },
    { title: 'Hall of Fame', href: '/hof', icon: 'star' },
    { title: 'Awards', href: '/awards/', icon: 'medal' },
    { title: 'Season Recaps', href: '/recap/', icon: 'tape' },
    { title: 'Draft', href: '/draft', icon: 'clipboard-list' },
    { title: 'Draft Live', href: '/draft/live/', icon: 'live' },
  ] },
  { label: 'Stats', icon: 'bar-chart', items: [
    // Searchable, but not a row: Teams is its own entry at the top of the
    // sidebar, opening the division panel (_buildTeamsEntry).
    { title: 'Teams', href: '/teams', icon: 'basketball', searchOnly: true },
    // Players and Stat Lab each stand for a few pages; their own pages link the
    // rest (tabs on /players, cards on /stats/), which stay searchable here.
    { title: 'Players', href: '/players', icon: 'jersey', also: ['/compare', '/ratings-changes'] },
    { title: 'Compare Players', href: '/compare/', icon: 'compare', searchOnly: true },
    { title: 'Ratings Changes', href: '/ratings-changes/', icon: 'trend-bars', searchOnly: true },
    { title: 'Owners', href: '/owners', icon: 'owner' },
    { title: 'Stat Lab', href: '/stats/', icon: 'list', also: ['/h2h', '/frivolities'], keywords: ['stats', 'leaders', 'leaderboards', 'explore'] },
    { title: 'Career Leaders', href: '/stats/totals', icon: 'steps', searchOnly: true },
    { title: 'Single-Game Highs', href: '/stats/highs', icon: 'spike', searchOnly: true },
    { title: 'Head to Head', href: '/h2h', icon: 'versus', searchOnly: true },
    { title: 'Frivolities & Viz', href: '/frivolities', icon: 'pie', searchOnly: true },
    { title: 'Box Scores', href: '/boxscores/', icon: 'table' },
    { title: 'Box Score Import', href: '/boxscores/submit/', icon: 'upload', keywords: ['submit box score', 'upload box score'] },
    { title: 'Trade Retrospectives', href: '/frivolities#retros', icon: 'magnifier', searchOnly: true },
  ] },
  { label: 'NB¥ Corner', icon: 'yen', items: [
    { title: 'NB¥ Balances', href: '/nbyen/', icon: 'yen' },
    { title: 'Betting — bets, Pick\'em, futures', short: 'Betting', href: '/bet/', icon: 'dice' },
    { title: "Pick'em", href: '/bet/#pickem', icon: 'target', keywords: ['pickem', 'lineup', 'fantasy'] },
    { title: 'Futures', href: '/bet/#futures', icon: 'line-chart', searchOnly: true },
    { title: 'Wall Street', href: '/invest', icon: 'candles' },
    { title: 'Donations', href: '/donations/', icon: 'heart' },
  ] },
  { label: 'Games', icon: 'hoop', items: [
    { title: 'Daily Perry Game', href: '/perry/', icon: 'hoop' },
    { title: 'Daily Poeltl', href: '/poeltl/', icon: 'silhouette' },
    { title: 'Trivia', href: '/trivia', icon: 'question' },
    { title: 'Tetris', href: '/tetris/', icon: 'blocks' },
  ] },
  { label: 'Media', icon: 'tv', items: [
    { title: 'News', href: '/news/', icon: 'newspaper' },
    { title: 'NBNTV Classics', href: '/nbntv-classics', icon: 'tv' },
    { title: 'NBNFL', href: '/nbnfl/', icon: 'football', noSearch: true },
    { title: 'YouTube', href: 'https://youtube.com/@nothingbutnetNBN/streams', icon: 'play' },
  ] },
  { label: 'Committees', icon: 'columns', href: '/committees/', items: [
    { title: 'Committees', short: 'All committees', href: '/committees/', icon: 'columns' },
    { title: 'Rosters Committee — compliance & cap sheet diffs', short: 'Rosters', href: '/committees/rosters/', icon: 'clipboard-check' },
    // The same roles the dashboard's own boot gate admits; anyone else is sent home.
    { title: 'PDC Committee', short: 'PDC', href: '/committees/pdc/', icon: 'ballot',
      roles: ['fac', 'fac_head', 'agent', 'poext', 'poext_head'] },
    { title: 'Stats Committee — build health & missing box scores', short: 'Stats', href: '/committees/stats/', icon: 'folder-chart' },
    { title: 'Stream Committee — claim games & coaching settings', short: 'Stream', href: '/committees/stream/', icon: 'camera',
      roles: ['streamer'] },
    { title: 'TRC Committee — trade requests', short: 'TRC', href: '/committees/trc/', icon: 'scale',
      roles: ['trc', 'trc_head'] },
  ] },
  { label: 'About', icon: 'people', items: [
    { title: 'Members', href: '/members/', icon: 'people' },
    { title: 'Roles & Permissions', href: '/roles', icon: 'key' },
    { title: 'Constitution', href: '/constitution/', icon: 'charter' },
    { title: 'Rulebook', href: '/rulebook/', icon: 'book' },
    { title: 'Draft Guide', href: '/draft/guide/', icon: 'guide' },
    // Searchable, but its own entry in the sidebar's account menu (_buildAccount).
    { title: 'Change Log', href: '/changelog', icon: 'tag', searchOnly: true },
    // Searchable, but its own entry at the top of the sidebar (_buildInboxEntry).
    { title: 'Inbox', href: '/inbox/', icon: 'inbox', searchOnly: true },
    { title: 'Join NBN', short: 'Join', href: '/join/', icon: 'person-plus' },
  ] },
  { label: 'League Office', icon: 'gavel', items: [
    { title: 'Proposals', href: '/proposals/', icon: 'vote' },
    { title: 'Suggestions', href: '/suggestions/', icon: 'bulb' },
    { title: 'League Office Memos', short: 'Memos', href: '/memos/', icon: 'envelope' },
    { title: 'Rookie Scale', href: '/rookie-scale/', icon: 'ruler' },
    { title: 'Legal — Disciplinary Record', short: 'Legal', href: '/legal/', icon: 'gavel' },
    { title: 'Cap Settings', href: '/cap-settings/', icon: 'gear', roles: ['rosters'] },
    { title: 'Strikes', href: '/strikes/', icon: 'warning', roles: ['bod'] },
    { title: 'Backlog', href: '/backlog/', icon: 'checklist', roles: [] },
  ] },
];

const _NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);
// Search's two views of the list: offered to everybody, and resolved per member.
const SITE_PAGES = _NAV_ITEMS.filter(p => !p.roles && !p.noSearch);
const ROLE_PAGES = _NAV_ITEMS.filter(p => p.roles && !p.noSearch);

// Same rule the pages themselves apply: admin satisfies any role check. An
// empty `roles` list is admin-only.
// One icon from the nav set. Two colours, both from the theme (`.ni` in
// css/sidebar.css), so a team theme tints the set in its own accent. The sprite
// is one file, fetched once and cached however many icons a page draws.
function _navIcon(id) {
  return `<svg class="ni" aria-hidden="true"><use href="/icons/nav-icons.svg#${id}"></use></svg>`;
}

function _qualifies(page, roles) {
  return !page.roles || roles.has('admin') || page.roles.some(r => roles.has(r));
}

// ── Search overlay ───────────────────────────────────────────────────────────
//
// Unified site search: static pages (SITE_PAGES), team pages (TEAM_LIST),
// and players (fetched lazily from /api/players). All three are merged into
// one result list so Ctrl+K / the ⌕ button works as an all-in-one jump box.

// The six divisions, for the sidebar's Teams panel. NBN's conferences are the
// NBA's (checked against the standings' East/West seeds, 2026-10-22), so the
// NBA's divisions sit inside them unchanged.
const TEAM_DIVISIONS = [
  ['Atlantic',  ['BOS', 'BKN', 'NYK', 'PHI', 'TOR']],
  ['Central',   ['CHI', 'CLE', 'DET', 'IND', 'MIL']],
  ['Southeast', ['ATL', 'CHA', 'MIA', 'ORL', 'WAS']],
  ['Northwest', ['DEN', 'MIN', 'OKC', 'POR', 'UTA']],
  ['Pacific',   ['GSW', 'LAC', 'LAL', 'PHX', 'SAC']],
  ['Southwest', ['DAL', 'HOU', 'MEM', 'NOP', 'SAS']],
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
    .filter(p => p.title.toLowerCase().includes(q) || (p.keywords || []).some(k => k.includes(q)))
    .slice(0, 6)
    .map(p => ({ type: 'Page', icon: p.icon, title: p.title, meta: '', href: p.href }));

  const teamMatches = Object.entries(TEAM_LIST)
    .filter(([abbr, name]) => name.toLowerCase().includes(q) || abbr.toLowerCase().includes(q))
    .slice(0, 6)
    .map(([abbr, name]) => ({ type: 'Team', icon: 'basketball', title: name, meta: abbr, href: `/teams/${abbr}/` }));

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
        return { type: 'Player', icon: 'jersey', title: _displayName(p.name), meta, href: `/players/?p=${slug}` };
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
      <span class="search-result-icon">${_navIcon(r.icon)}</span>
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

// This member's roles, asked once per page and shared by search and the
// sidebar. With a token that rides on the profile picker's /api/me (no extra
// request); a cookie-only session (signed in on another subdomain) asks
// /api/auth/me instead. Resolves to an empty set for a signed-out visitor
// without making any request at all.
let _rolesPromise = null;
function _myRoles() {
  if (_rolesPromise) return _rolesPromise;
  let token = null;
  try { token = localStorage.getItem('nbn_token'); } catch { /* private browsing */ }
  _rolesPromise = (token ? _fetchMe()
    : _maybeSignedIn() ? fetch('/api/auth/me', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null)
    : Promise.resolve(null))
    .then(me => new Set((me && me.roles) || []))
    .catch(() => new Set());
  return _rolesPromise;
}

async function _loadCommitteePages() {
  if (_rolesChecked) return;
  _rolesChecked = true;
  // The jump box works without this; it just won't list the committee pages.
  const roles = await _myRoles();
  _rolePages = ROLE_PAGES.filter(p => _qualifies(p, roles));
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

// ── Dialogs ─────────────────────────────────────────────────────────────────
//
// The site's replacements for alert() / confirm() / prompt(). Those render as
// OS chrome (Chrome prefixes every one with "nbn.today says:"), ignore the
// theme, can't be laid out, and block the tab — which was actively bad for the
// forced-override confirms in /transactions, where a rules decision was being
// made from "\n\n"-joined text in a grey system box, and for the nine separate
// "Enter your NBN token:" prompts, which collected a credential in an
// unstyled, unmaskable system field.
//
// Styling lives in css/dialogs.css, imported from css/nav-chrome.css so it
// cannot arrive without this file. Pages that pull nav.js in dynamically
// (teams/team.js, awards/*.js) must await that load before calling these.

/**
 * Non-blocking status message, bottom-right.
 *
 * Signature-compatible with the per-page copies this replaced, so
 * `toast(msg, true)` still means "this is an error".
 *
 * Errors linger noticeably longer than confirmations: an error is often the
 * only place an API's `detail` string is shown, and a message you have to read
 * fast is worse than the alert() it replaced. Either can be clicked away.
 */
function toast(msg, bad) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }

  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : ' good');
  t.setAttribute('role', bad ? 'alert' : 'status');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = msg;
  const x = document.createElement('span');
  x.className = 'toast-dismiss';
  x.textContent = '×';
  t.append(text, x);

  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 200);
  };
  t.addEventListener('click', dismiss);
  setTimeout(dismiss, bad ? 9000 : 4200);

  stack.appendChild(t);
  return t;
}

/**
 * Shared modal core behind confirmDialog and promptDialog. Not exported —
 * call one of those. `settle(ok, input)` turns the outcome into whatever the
 * caller's promise should resolve to.
 */
function _dialog(o, settle) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'dlg-overlay';

    const dlg = document.createElement('div');
    dlg.className = 'dlg';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');

    const h = document.createElement('h3');
    h.textContent = o.title;
    dlg.appendChild(h);

    if (o.body) {
      const b = document.createElement('div');
      b.className = 'dlg-body';
      b.textContent = o.body;
      dlg.appendChild(b);
    }

    // The flagged-check list. This is the case that most needed real markup:
    // forced overrides in /transactions were passing "\n\n"-joined rule text
    // through confirm(), where it rendered as an undifferentiated blob.
    if (o.details && o.details.length) {
      const ul = document.createElement('ul');
      ul.className = 'dlg-details';
      for (const d of o.details) {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = d;
        li.appendChild(span);
        ul.appendChild(li);
      }
      dlg.appendChild(ul);
    }

    let input = null;
    if (o.field || o.requireText) {
      const f = o.field || { label: `Type "${o.requireText}" to confirm` };
      const wrap = document.createElement('div');
      wrap.className = 'dlg-confirm-text';
      const label = document.createElement('label');
      label.textContent = f.label;
      input = document.createElement('input');
      input.type = f.type || 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.value) input.value = f.value;
      label.htmlFor = input.id = 'dlg-field-' + Math.random().toString(36).slice(2, 8);
      wrap.append(label, input);
      dlg.appendChild(wrap);
    }

    const actions = document.createElement('div');
    actions.className = 'dlg-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = o.cancelLabel || 'Cancel';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'dlg-ok' + (o.danger ? ' danger' : '');
    ok.textContent = o.confirmLabel || 'Confirm';
    actions.append(cancel, ok);
    dlg.appendChild(actions);

    const gate = () => {
      if (o.requireText) {
        ok.disabled = input.value.trim().toLowerCase() !== o.requireText.toLowerCase();
      } else if (input && o.field && o.field.required !== false) {
        ok.disabled = !input.value.trim();
      }
    };
    gate();

    let settled = false;
    const close = okd => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(settle(okd, input));
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
      else if (e.key === 'Enter' && !ok.disabled && e.target !== cancel) { e.preventDefault(); close(true); }
    }

    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);
    if (input) input.addEventListener('input', gate);

    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    // Focus the field if there is one, otherwise the *safe* control — a stray
    // Enter or a held-down key must not be able to complete the action.
    (input || cancel).focus();
  });
}

/**
 * Themed replacement for confirm(). Resolves true if the user confirmed;
 * cancelling (button, Escape, or clicking the scrim) resolves false. It never
 * rejects, so call sites read as `if (!await confirmDialog(…)) return;`.
 *
 *   await confirmDialog('Delete this comment?')
 *   await confirmDialog({
 *     title: 'Force this signing?',
 *     body: '§ 3.15 flagged this offer sheet.',
 *     details: ['Salary matching: …', 'Hard cap: …'],   // one <li> each
 *     confirmLabel: 'Submit anyway',
 *     danger: true,                                     // red, non-default button
 *     requireText: 'Ibaka',                             // must be typed to enable
 *   })
 *
 * `danger` is not decoration: it drops the confirm button out of the default
 * blue so cancel stays the visually easy choice. Use it for anything
 * destructive and for anything that overrides a rules check.
 */
function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { body: opts } : (opts || {});
  return _dialog({ title: 'Are you sure?', ...o }, ok => ok === true);
}

/**
 * Themed replacement for prompt(). Resolves the trimmed string, or null if
 * cancelled. Pass `field.type: 'password'` for credentials.
 *
 *   await promptDialog({
 *     title: 'Sign in',
 *     body: 'Paste the member token you were given.',
 *     field: { label: 'Member token', type: 'password' },
 *     confirmLabel: 'Sign in',
 *   })
 */
function promptDialog(opts) {
  const o = opts || {};
  return _dialog(
    { title: 'Enter a value', confirmLabel: 'OK', ...o, field: { label: '', ...(o.field || {}) } },
    (ok, input) => (ok ? input.value.trim() : null),
  );
}


/**
 * Ask for a member token and store it under `nbn_token` (the key every page
 * already reads). Resolves the token, or null if cancelled.
 *
 * Nine pages had grown their own `prompt('Enter your NBN token:')` — each one
 * collecting a credential in a system field that can't be masked. This is the
 * one place that asks.
 *
 * It deliberately does **not** validate: pages differ on what a usable token
 * means (any member, `rosters`, `bod`), so the caller checks and reports.
 */
async function promptForToken(opts) {
  const o = opts || {};
  const token = await promptDialog({
    title: o.title || 'Sign in',
    body: o.body || 'Paste the member token you were given. It is stored in this browser only.',
    field: { label: o.label || 'Member token', type: 'password', placeholder: '••••••••' },
    confirmLabel: o.confirmLabel || 'Sign in',
  });
  if (!token) return null;
  try { localStorage.setItem('nbn_token', token); } catch { /* private browsing */ }
  return token;
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

// Share a page: the device's share sheet where there is one (phones, most
// Macs and Windows), otherwise copy the link. `btn`, if given, says "Copied"
// for a moment so a desktop click visibly did something. A share the person
// cancels is not an error. `url` defaults to this page.
async function nbnShare({ title, text, url } = {}, btn) {
  url = url || location.href;
  title = title || document.title;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }   // fall through on any other failure
  }
  try { await navigator.clipboard.writeText(url); }
  catch { prompt('Copy this link', url); return; }
  if (btn) {
    const was = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = was; }, 1500);
  }
}

// ── Startup ──────────────────────────────────────────────────────────────────
// Last in the file on purpose: team.js and the awards pages inject nav.js after
// the document has loaded, so this runs synchronously the moment the file
// does — and the const page lists above must already be initialised by then.
function _initChrome() {
  _buildSidebar();
  _initNav();
  _fetchProfile(); // keeps the unlocked-theme cache fresh, sidebar or not
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initChrome);
} else {
  _initChrome();
}
