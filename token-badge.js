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

  function showModal(onSuccess) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000';
    overlay.innerHTML = '<div style="background:#1f2937;border:1px solid #374151;border-radius:12px;padding:1.5rem;width:360px;max-width:90vw">'
      + '<h3 style="font-size:1rem;font-weight:700;margin-bottom:0.4rem;color:#f3f4f6;font-family:system-ui,sans-serif">Enter your token</h3>'
      + '<p style="font-size:0.8rem;color:#9ca3af;margin-bottom:1rem;font-family:system-ui,sans-serif">Paste the token you received. It will be saved in this browser.</p>'
      + '<input type="password" placeholder="Paste token…" autocomplete="off" style="width:100%;background:#111827;border:1px solid #374151;border-radius:6px;color:#f3f4f6;font-size:0.875rem;font-family:monospace;padding:0.5rem 0.75rem;margin-bottom:1rem;box-sizing:border-box;outline:none" />'
      + '<div style="display:flex;gap:0.5rem;justify-content:flex-end">'
      + '<button id="tok-cancel" style="padding:0.35rem 0.8rem;border:1px solid #374151;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#d1d5db;font-family:inherit">Cancel</button>'
      + '<button id="tok-submit" style="padding:0.35rem 0.8rem;border:1px solid #3b82f6;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:#60a5fa;font-family:inherit">Continue</button>'
      + '</div></div>';
    document.body.appendChild(overlay);
    var input = overlay.querySelector('input');
    input.focus();
    overlay.querySelector('#tok-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('#tok-submit').addEventListener('click', function () {
      var val = input.value.trim();
      if (!val) return;
      localStorage.setItem('nbn_token', val);
      overlay.remove();
      onSuccess(val);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') overlay.querySelector('#tok-submit').click();
      if (e.key === 'Escape') overlay.remove();
    });
  }

  function startGreeting(el, name) {
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
  }

  function sendSignal(token) {
    try {
      fetch('/api/me/signal', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen:   screen.width + 'x' + screen.height,
          language: navigator.language,
        }),
      });
    } catch (_) {}
  }

  function tryToken(el, token) {
    fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.name) {
          el.style.pointerEvents = 'none';
          el.style.cursor = 'default';
          el.style.color = '#4b5563';
          startGreeting(el, d.name.split(' ')[0]);
          sendSignal(token);
        } else {
          localStorage.removeItem('nbn_token');
          setNoToken(el);
        }
      })
      .catch(function () { setNoToken(el); });
  }

  function setNoToken(el) {
    el.textContent = 'enter token';
    el.style.color = '#3b82f6';
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.onclick = function () {
      showModal(function (token) { tryToken(el, token); });
    };
  }

  function init() {
    if (document.getElementById('nbn-token-badge')) return;
    var el = document.createElement('div');
    el.id = 'nbn-token-badge';
    el.style.cssText = [
      'position:fixed', 'bottom:0.6rem', 'right:0.8rem',
      'font-size:0.65rem', 'z-index:9999',
      'font-family:monospace', 'letter-spacing:0.02em',
      'transition:opacity 0.4s',
    ].join(';');
    document.body.appendChild(el);

    var token = localStorage.getItem('nbn_token');
    if (!token) { setNoToken(el); return; }
    tryToken(el, token);
  }

  window.__nbnBadge = init;

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
