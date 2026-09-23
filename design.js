// Unified design preview switch. ?design=clean turns it on, ?design=current
// turns it off, and the choice is remembered in this browser. Sets
// <html data-design="clean">, which css/theme.css and css/components.css key
// the new design off.
//
// nav.js loads this on every page. A page that lays itself out while it is
// still loading (the homepage) also loads it in <head>, so it knows before it
// renders. Temporary: when the unified design becomes the default, this file
// and every data-design selector go away.
(function () {
  if (window.__nbnDesign) return;
  window.__nbnDesign = true;
  var q = new URLSearchParams(location.search).get('design');
  var on = false;
  try {
    if (q === 'clean') localStorage.setItem('nbn_design_preview', 'clean');
    if (q === 'current') localStorage.removeItem('nbn_design_preview');
    on = localStorage.getItem('nbn_design_preview') === 'clean';
  } catch (_) {
    on = q === 'clean';
  }
  if (on) document.documentElement.dataset.design = 'clean';
})();
