// The player profile's sub-pages: /stats/players/ratings, /contract, /history and
// /injuries, each named by ?p=<slug>. This is the part they share: the strip
// that moves between them (also shown on the profile itself) and the header
// (photo, name, team, crumbs). What each page shows is its own.
(function () {
  const PAGES = [
    { key: 'profile',  label: 'Profile',    path: '/stats/players/' },
    { key: 'ratings',  label: '2K Ratings', path: '/stats/players/ratings/' },
    { key: 'contract', label: 'Contract',   path: '/stats/players/contract/' },
    { key: 'history',  label: 'History',    path: '/stats/players/history/' },
    { key: 'injuries', label: 'Injuries',   path: '/stats/players/injuries/' },
  ];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const href = (key, slug) => `${PAGES.find(p => p.key === key).path}?p=${encodeURIComponent(slug)}`;

  // The strip, into an existing element (the profile reuses its own) or a new one.
  function renderTabs(el, slug, current) {
    el.className = 'ui-tabs player-tabs';
    el.setAttribute('aria-label', 'Player pages');
    el.innerHTML = PAGES.map(p => p.key === current
      ? `<a class="ui-tab active" aria-current="page" href="${href(p.key, slug)}">${p.label}</a>`
      : `<a class="ui-tab" href="${href(p.key, slug)}">${p.label}</a>`).join('');
    el.style.display = '';
    return el;
  }

  // Fills the shared header and strip, and resolves to what the page needs to
  // carry on: { slug, bio, bios, teamMap, name, content }. Resolves null, with
  // a message in #content, when there is no player to show.
  function mount(current) {
    const slug = new URLSearchParams(location.search).get('p') || '';
    const content = document.getElementById('content');
    const label = PAGES.find(p => p.key === current).label;
    if (!slug) {
      content.innerHTML = '<div class="ui-empty">No player named. Open this page from a player’s profile.</div>';
      return Promise.resolve(null);
    }
    const json = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    return Promise.all([json('/api/players'), json('/api/team-map')]).then(([bios, teamMap]) => {
      bios = bios || {};
      teamMap = teamMap || {};
      const bio = bios[slug] || null;
      const name = bio && bio.name ? nbnPlayerName(bio.name) : slug;
      const team = teamMap[slug] || '';
      const profile = href('profile', slug);

      document.title = `NBN | ${name} ${label}`;
      document.getElementById('page-title').textContent = name;
      document.getElementById('page-sub').innerHTML = `${esc(label)}${team ? ` · <a href="/stats/teams/${esc(team)}/">${esc(team)}</a>` : ''}`;
      // The same team band as the profile (components.css § Player pages).
      const header = document.getElementById('page-title').closest('.ui-header');
      if (header && team && !(bio && bio.retired)) header.dataset.team = team;
      if (bio && bio.photo_url) {
        const img = document.getElementById('photo');
        img.src = bio.photo_url;
        img.hidden = false;
        img.onerror = () => { img.hidden = true; };
      }
      const nav = document.getElementById('nav');
      nav.innerHTML = `<a href="/">Home</a><span class="nav-crumb-sep">/</span><a href="/stats/players/">Players</a>`
        + `<span class="nav-crumb-sep">/</span><a href="${profile}">${esc(name)}</a>`
        + `<span class="nav-crumb-sep">/</span><span class="nav-crumb-current">${esc(label)}</span>`;
      if (typeof _initNav === 'function') _initNav();
      renderTabs(document.getElementById('player-tabs'), slug, current);

      if (!bio) {
        content.innerHTML = `<div class="ui-empty">Player not found: <strong>${esc(slug)}</strong></div>`;
        return null;
      }
      return { slug, bio, bios, teamMap, name, content };
    });
  }

  window.PlayerSubpage = { PAGES, href, renderTabs, mount };
})();
