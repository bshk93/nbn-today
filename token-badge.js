(function () {
  function init() {
    if (document.getElementById('nbn-token-badge')) return;
    const el = document.createElement('div');
    el.id = 'nbn-token-badge';
    el.style.cssText = [
      'position:fixed', 'bottom:0.6rem', 'right:0.8rem',
      'font-size:0.65rem', 'color:#4b5563', 'z-index:9999',
      'pointer-events:none', 'font-family:monospace', 'letter-spacing:0.02em',
    ].join(';');
    document.body.appendChild(el);

    const token = localStorage.getItem('nbn_token');
    if (!token) { el.textContent = 'no token'; return; }

    fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { el.textContent = d && d.name ? d.name : 'invalid token'; })
      .catch(function () { el.textContent = 'no token'; });
  }

  window.__nbnBadge = init;

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
