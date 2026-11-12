// A hub page: one card per page in a NAV_SECTIONS section that has a `hub`
// (nav.js), so the sidebar's one row and this page are drawn from the same list.
// The page is a shell holding <div class="ui-hub"></div>; load this after nav.js.
// Role-gated pages stay hidden until this member is known to qualify, as in
// the sidebar.
(function () {
  const el = document.querySelector('.ui-hub');
  if (!el || typeof NAV_SECTIONS === 'undefined') return;
  const here = _normPath(location.pathname);
  const sec = NAV_SECTIONS.find(s => s.hub && _normPath(s.hub) === here);
  if (!sec) return;

  // Items sharing a `group` get that heading before the first of them; a
  // section with no groups is drawn as plain cards, as before.
  const gated = [];
  let group = null;
  for (const p of sec.items) {
    if (p.searchOnly) continue;
    if (p.group && p.group !== group) {
      group = p.group;
      const h = document.createElement('h2');
      h.className = 'ui-section-title ui-hub-group';
      h.textContent = group;
      el.appendChild(h);
    }
    const a = document.createElement('a');
    a.className = 'ui-hub-card';
    a.href = p.href;
    if (!p.href.startsWith('/')) { a.target = '_blank'; a.rel = 'noopener'; }
    a.innerHTML = `<span class="ui-hub-icon">${_navIcon(p.icon)}</span>`
      + '<span class="ui-hub-title"></span><span class="ui-hub-desc"></span>';
    a.querySelector('.ui-hub-title').textContent = p.title;
    a.querySelector('.ui-hub-desc').textContent = p.desc || '';
    if (p.roles) { a.hidden = true; gated.push([a, p]); }
    el.appendChild(a);
  }
  if (gated.length) {
    _myRoles().then(roles => gated.forEach(([a, p]) => { a.hidden = !_qualifies(p, roles); }));
  }
})();
