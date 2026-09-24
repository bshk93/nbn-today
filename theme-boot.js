// Sets the page's theme before first paint.
//
// Loaded as a plain blocking <script> in every page's <head>, right after
// <meta charset>. nav.js owns theming (the picker, the catalog fetch, unlocks),
// but it loads at the end of <body> — or, on team pages, is injected by
// team.js — so by the time it runs the browser has already painted once in the
// default theme. Without this file every page flashed default → chosen theme.
//
// This must pick the same theme nav.js's _activeTheme() does, or nav.js will
// flip it a moment later and the flash comes back. It reads the same
// localStorage keys and applies the same rule: the stored preference ('auto'
// follows the system), unless the cached catalog says it is locked for this
// browser, in which case the default. Keep the two in step.
(function () {
  var DEFAULT = 'nbn-today';
  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  var pref = DEFAULT;
  try { pref = localStorage.getItem('nbn_theme_pref') || DEFAULT; } catch (e) { /* private browsing */ }
  var id = pref;
  if (pref === 'auto') {
    id = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
      ? 'nbn-today-light' : 'nbn-today';
  }
  var catalog = read('nbn_theme_catalog', null);
  if (!Array.isArray(catalog) || !catalog.length) {
    catalog = [{ id: 'nbn-today', free: true }, { id: 'nbn-today-light', free: true }];
  }
  var entry = null;
  for (var i = 0; i < catalog.length; i++) if (catalog[i] && catalog[i].id === id) { entry = catalog[i]; break; }
  var usable = !entry || entry.free
    || read('nbn_themes_owned', []).indexOf(id) !== -1
    || read('nbn_themes_free', []).indexOf(id) !== -1;
  document.documentElement.setAttribute('data-theme', usable ? id : DEFAULT);
})();
