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
    overlay.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:1.5rem;width:360px;max-width:90vw">'
      + '<h3 style="font-size:1rem;font-weight:700;margin-bottom:0.4rem;color:var(--text-primary);font-family:var(--font-sans)">Enter your token</h3>'
      + '<p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem;font-family:var(--font-sans)">Paste the token you received. It will be saved in this browser.</p>'
      + '<input type="password" placeholder="Paste token…" autocomplete="off" style="width:100%;background:var(--bg-page);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:0.875rem;font-family:var(--font-mono);padding:0.5rem 0.75rem;margin-bottom:1rem;box-sizing:border-box;outline:none" />'
      + '<div style="display:flex;gap:0.5rem;justify-content:flex-end">'
      + '<button id="tok-cancel" style="padding:0.35rem 0.8rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:inherit">Cancel</button>'
      + '<button id="tok-submit" style="padding:0.35rem 0.8rem;border:1px solid var(--accent);border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;background:transparent;color:var(--link);font-family:inherit">Continue</button>'
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

  function startGreeting(greetEl, name) {
    var idx = Math.floor(Math.random() * GREETINGS.length);
    greetEl.textContent = GREETINGS[idx] + ', ' + name + '!';
    setInterval(function () {
      greetEl.style.opacity = '0';
      setTimeout(function () {
        idx = (idx + 1) % GREETINGS.length;
        greetEl.textContent = GREETINGS[idx] + ', ' + name + '!';
        greetEl.style.opacity = '1';
      }, 400);
    }, 3000);
  }

  // ── .nbn.today session cookie ──────────────────────────────────────────────
  // The token lives in localStorage, which is per-origin, so it does not follow
  // the member to pdc.nbn.today. Minting a session cookie scoped to .nbn.today
  // here means anyone who has loaded this site is already signed in over there —
  // no link to send, no second paste, nothing in browser history.
  //
  // The session cookie itself is HttpOnly and unreadable from here; the server
  // sets a second, valueless `nbn_session_live` marker alongside it purely so
  // this can tell it already has one. Without that check every page load would
  // mint another session row. (Both are Secure, so over plain http in local dev
  // neither sticks and this mints each load — harmless, and never the case in
  // production.)
  function hasSession() {
    return document.cookie.split(';').some(function (c) {
      return c.trim().indexOf('nbn_session_live=') === 0;
    });
  }

  function ensureSession(token, fresh) {
    // `fresh` = the token was just pasted, so it may be a rotated one whose old
    // session the server has already dropped. Mint regardless of the marker.
    if (!fresh && hasSession()) return;
    try {
      fetch('/api/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        credentials: 'same-origin',
      }).catch(function () {});
    } catch (_) {}
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

  function tryToken(el, token, fresh) {
    fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.name) {
          el.style.pointerEvents = 'none';
          el.style.cursor = 'default';
          el.innerHTML = '';

          var greetEl = document.createElement('span');
          greetEl.style.cssText = 'display:block;color:var(--text-dim);transition:opacity 0.4s;text-align:right';
          el.appendChild(greetEl);
          startGreeting(greetEl, d.name.split(' ')[0]);

          sendSignal(token);
          ensureSession(token, fresh);
        } else {
          localStorage.removeItem('nbn_token');
          setNoToken(el);
        }
      })
      .catch(function () { setNoToken(el); });
  }

  function setNoToken(el) {
    el.innerHTML = '';
    el.style.color = 'var(--accent)';
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.textContent = 'enter token';
    el.onclick = function () {
      showModal(function (token) { tryToken(el, token, true); });
    };
  }

  function init() {
    if (document.getElementById('nbn-token-badge')) return;
    var el = document.createElement('div');
    el.id = 'nbn-token-badge';
    el.style.cssText = [
      'position:fixed', 'bottom:0.6rem', 'right:0.8rem',
      'font-size:0.65rem', 'z-index:9999',
      'font-family:var(--font-mono)', 'letter-spacing:0.02em',
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
