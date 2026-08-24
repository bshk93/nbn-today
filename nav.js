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
// (the bare :root there is "nbn-today", the default/fallback). The theme is
// applied as early as possible — top-level, not waiting for DOMContentLoaded —
// to minimize a flash of the wrong theme on load.
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
  const btn = document.querySelector('.theme-btn');
  if (btn) {
    const active = _themeEntry(_activeTheme());
    btn.textContent = '';
    // Same reason as the menu rows: a team theme reads as its own logo, not as
    // the 🏀 every one of the 30 shares.
    if (active) btn.append(_themeIcon(active, 'theme-btn-icon'));
    else btn.textContent = '🎨';
  }
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
  const src = `/logos/logo-${String(c.team).toLowerCase()}.png`;
  // The 30 logos are ~1.6MB together and the menu is built on every page, so the
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

function _buildThemePicker() {
  const wrap = document.createElement('div');
  wrap.className = 'theme-picker';

  const btn = document.createElement('button');
  btn.className = 'theme-btn nav-icon-btn';
  btn.setAttribute('aria-label', 'Choose theme');
  btn.setAttribute('title', 'Choose theme');

  const menu = document.createElement('div');
  menu.className = 'theme-menu';
  _themeMenuItems(menu);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    _hydrateThemeLogos(menu);
    menu.classList.toggle('open');
  });

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
              _myBalance = +b.balance;
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
            // Unlocked themes ride along on the cosmetics the picker already
            // fetches. Caching them is what lets a paid theme paint on the
            // next page load before this call resolves; re-applying here is
            // what corrects the cache when it's wrong.
            try { localStorage.setItem(THEME_OWNED_KEY, JSON.stringify(profile.cosmetics?.themes || [])); } catch { /* private browsing */ }
            try { localStorage.setItem(THEME_FREE_KEY, JSON.stringify(profile.free_themes || [])); } catch { /* private browsing */ }
            _rebuildThemeMenu();
            _applyTheme();
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
  { title: 'Trade Retrospectives', href: '/frivolities#retros', icon: '🔍' },
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
