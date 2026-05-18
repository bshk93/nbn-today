(function () {
  var GREETINGS = [
    'Hello',       // English
    'Hej',         // Swedish (IKEA!)
    'Hola',        // Spanish
    'Bonjour',     // French
    'Hallo',       // German
    'Ciao',        // Italian
    'Olá',         // Portuguese
    'Hei',         // Norwegian
    'Hej',         // Danish
    'Hoi',         // Dutch
    'Привет',      // Russian
    'こんにちは',  // Japanese
    '안녕하세요',  // Korean
    '你好',        // Chinese
    'नमस्ते',     // Hindi
    'Merhaba',     // Turkish
    'Γεια',        // Greek
    'Cześć',       // Polish
    'Xin chào',    // Vietnamese
    'Halo',        // Indonesian
    'สวัสดี',     // Thai
    'Habari',      // Swahili
    'مرحبا',       // Arabic
    'שלום',        // Hebrew
  ];

  function init() {
    if (document.getElementById('nbn-token-badge')) return;
    var el = document.createElement('div');
    el.id = 'nbn-token-badge';
    el.style.cssText = [
      'position:fixed', 'bottom:0.6rem', 'right:0.8rem',
      'font-size:0.65rem', 'color:#4b5563', 'z-index:9999',
      'pointer-events:none', 'font-family:monospace', 'letter-spacing:0.02em',
      'transition:opacity 0.4s',
    ].join(';');
    document.body.appendChild(el);

    var token = localStorage.getItem('nbn_token');
    if (!token) { el.textContent = 'no token'; return; }

    fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.name) { el.textContent = 'invalid token'; return; }
        var name = d.name.split(' ')[0]; // first name only
        var idx = Math.floor(Math.random() * GREETINGS.length);
        el.textContent = GREETINGS[idx] + ', ' + name + '!';
        setInterval(function () {
          el.style.opacity = '0';
          setTimeout(function () {
            idx = (idx + 1) % GREETINGS.length;
            el.textContent = GREETINGS[idx] + ', ' + name + '!';
            el.style.opacity = '1';
          }, 400);
        }, 3000);
      })
      .catch(function () { el.textContent = 'no token'; });
  }

  window.__nbnBadge = init;

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
