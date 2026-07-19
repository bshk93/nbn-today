// Shared utilities: nav injection, site-wide player search, parseCSV

// ── Nav injection ────────────────────────────────────────────────────────────

document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') closeSearch();
});

function _initNav() {
  const nav = document.querySelector('.nav');
  if (!nav || nav.id === 'nav') return;
  if (!nav.children.length && !nav.textContent.trim()) {
    nav.innerHTML = '<a href="/">← Home</a>';
  }
  if (!nav.querySelector('.search-btn')) {
    const btn = document.createElement('button');
    btn.className = 'search-btn';
    btn.setAttribute('aria-label', 'Search (Ctrl+K)');
    btn.setAttribute('title', 'Search (Ctrl+K)');
    btn.textContent = '⌕';
    btn.addEventListener('click', () => openSearch());
    nav.appendChild(btn);
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
  { title: 'Trade Simulator', href: '/trade-sim/', icon: '⚖️' },
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

function openSearch(initialQuery) {
  if (!_searchOverlay) _buildSearchOverlay();
  _searchOverlay.style.display = 'flex';
  _searchInput.value = initialQuery || '';
  _activeIdx = -1;
  _searchInput.focus();
  _filter();
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

  const pageMatches = SITE_PAGES
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
