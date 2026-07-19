// Shared ratings-breakdown popup for OVR cells.
//
// Attaches to any element that shows a player's OVR and reveals the 2K attribute
// breakdown on hover (pointer devices), tap (touch), or focus (keyboard).
// Data comes from GET /api/attributes/{slug} — one ~800-byte fetch per player,
// lazily on first reveal and cached for the life of the page. Pages that already
// hold the whole attribute map (players/index.html fetches /api/attributes) can
// call RatingsPopup.setSource() to serve it from memory and skip the fetch.
//
// Usage:
//   RatingsPopup.attach(td, slug);                 // fetches on demand
//   RatingsPopup.setSource(slug => snapshotOrNull) // optional in-memory source
//
// A snapshot is one entry of player-attributes.json: { 2k_ovr, 2k_pos,
// attributes: {…}, date, … }. Written by build/scrape_2k_attributes.py.
(function () {
  const CATEGORIES = [
    { label: 'Shooting', keys: ['three_point_shot', 'mid_range_shot', 'close_shot', 'free_throw', 'shot_iq', 'offensive_consistency'] },
    { label: 'Finishing', keys: ['layup', 'driving_dunk', 'standing_dunk', 'post_hook', 'post_fade', 'post_control', 'draw_foul', 'hands'] },
    { label: 'Athleticism', keys: ['speed', 'strength', 'agility', 'vertical', 'hustle', 'stamina', 'overall_durability'] },
    { label: 'Playmaking', keys: ['ball_handle', 'speed_with_ball', 'pass_accuracy', 'pass_vision', 'pass_iq'] },
    { label: 'Defense & Rebounding', keys: ['block', 'steal', 'pass_perception', 'interior_defense', 'perimeter_defense', 'defensive_consistency', 'help_defense_iq', 'defensive_rebound', 'offensive_rebound'] },
    { label: 'Intangibles', keys: ['intangibles'] },
  ];

  // Compact labels — the popup is much tighter than the profile page's bars,
  // which keep the full names in players/index.html's own ATTR_LABELS.
  const LABELS = {
    three_point_shot: '3PT', mid_range_shot: 'Mid-Range', close_shot: 'Close', free_throw: 'Free Throw',
    shot_iq: 'Shot IQ', offensive_consistency: 'Off. Consist.',
    layup: 'Layup', driving_dunk: 'Driving Dunk', standing_dunk: 'Standing Dunk', post_hook: 'Post Hook',
    post_fade: 'Post Fade', post_control: 'Post Control', draw_foul: 'Draw Foul', hands: 'Hands',
    speed: 'Speed', strength: 'Strength', agility: 'Agility', vertical: 'Vertical', hustle: 'Hustle',
    stamina: 'Stamina', overall_durability: 'Durability',
    ball_handle: 'Ball Handle', speed_with_ball: 'Speed w/ Ball', pass_accuracy: 'Pass Acc.',
    pass_vision: 'Pass Vision', pass_iq: 'Pass IQ',
    block: 'Block', steal: 'Steal', pass_perception: 'Pass Percep.', interior_defense: 'Interior Def.',
    perimeter_defense: 'Perimeter Def.', defensive_consistency: 'Def. Consist.', help_defense_iq: 'Help Def. IQ',
    defensive_rebound: 'Def. Reb.', offensive_rebound: 'Off. Reb.',
    intangibles: 'Intangibles',
  };

  const HOVER_DELAY_MS = 120;
  const cache = new Map();   // slug → snapshot | null (null = known-missing)
  const inflight = new Map(); // slug → Promise
  let source = null;         // optional caller-supplied sync lookup
  let popEl = null;
  let activeEl = null;
  let showTimer = null;
  let styleInjected = false;

  // 2K attributes run roughly 25–99; map 40→red through 99→green.
  function attrHue(n) {
    const t = Math.min(1, Math.max(0, (n - 40) / (99 - 40)));
    return Math.round(t * 120);
  }

  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const css = `
      .ratings-pop {
        position: fixed;
        z-index: 1000;
        width: 30rem;
        max-width: calc(100vw - 1.5rem);
        background: #111827;
        border: 1px solid #374151;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        padding: 0.7rem 0.8rem;
        color: #e5e7eb;
        font-size: 0.75rem;
        line-height: 1.3;
      }
      .ratings-pop[hidden] { display: none; }
      .ratings-pop-head {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        border-bottom: 1px solid #1f2937;
        padding-bottom: 0.45rem;
        margin-bottom: 0.5rem;
      }
      .ratings-pop-name { font-weight: 700; font-size: 0.82rem; }
      .ratings-pop-meta { color: #6b7280; font-size: 0.68rem; margin-left: auto; text-align: right; }
      /* Two balanced columns so the whole breakdown fits without scrolling. */
      .ratings-pop-body { column-count: 2; column-gap: 1.1rem; }
      .ratings-pop-group { break-inside: avoid; page-break-inside: avoid; }
      .ratings-pop-cat {
        color: #9ca3af;
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin: 0.5rem 0 0.25rem;
      }
      .ratings-pop-group:first-child .ratings-pop-cat { margin-top: 0; }
      .ratings-pop-row {
        display: grid;
        grid-template-columns: 5.5rem 1fr 1.35rem;
        align-items: center;
        gap: 0.35rem;
        margin-bottom: 0.2rem;
      }
      .ratings-pop-label { color: #9ca3af; font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      /* display:block matters — these are spans, and height is ignored on inline boxes. */
      .ratings-pop-track { display: block; background: #1f2937; border-radius: 999px; height: 5px; overflow: hidden; }
      .ratings-pop-fill { display: block; height: 100%; border-radius: 999px; }
      .ratings-pop-val { font-size: 0.68rem; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
      /* Safety valve: on very short viewports (landscape phones) let it scroll
         rather than run off-screen where the bottom rows are unreachable. */
      @media (max-height: 34rem) {
        .ratings-pop { max-height: calc(100vh - 1.5rem); overflow-y: auto; }
      }
      @media (max-width: 26rem) {
        .ratings-pop-row { grid-template-columns: 4.4rem 1fr 1.2rem; }
        .ratings-pop-label { font-size: 0.62rem; }
      }
      .ratings-pop-note { color: #6b7280; font-size: 0.7rem; padding: 0.15rem 0; }
      .ratings-pop-foot { color: #4b5563; font-size: 0.6rem; border-top: 1px solid #1f2937; margin-top: 0.55rem; padding-top: 0.4rem; }
      .ratings-trigger { cursor: help; }
      @media (hover: none) { .ratings-trigger { cursor: pointer; } }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensurePop() {
    if (popEl) return popEl;
    injectStyle();
    popEl = document.createElement('div');
    popEl.className = 'ratings-pop';
    popEl.hidden = true;
    popEl.setAttribute('role', 'tooltip');
    // Keep the popup open while the pointer is inside it.
    popEl.addEventListener('pointerenter', () => clearTimeout(showTimer));
    popEl.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
    popEl.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(popEl);
    return popEl;
  }

  function fetchSnapshot(slug) {
    if (source) {
      const fromSource = source(slug);
      if (fromSource) return Promise.resolve(fromSource);
    }
    if (cache.has(slug)) return Promise.resolve(cache.get(slug));
    if (inflight.has(slug)) return inflight.get(slug);
    const p = fetch(`/api/attributes/${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(snap => { cache.set(slug, snap); inflight.delete(slug); return snap; });
    inflight.set(slug, p);
    return p;
  }

  function renderInto(el, name, snap) {
    el.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'ratings-pop-head';
    const nameEl = document.createElement('span');
    nameEl.className = 'ratings-pop-name';
    nameEl.textContent = name || 'Ratings';
    head.appendChild(nameEl);

    if (snap) {
      const meta = document.createElement('span');
      meta.className = 'ratings-pop-meta';
      const bits = [];
      if (snap['2k_ovr'] != null) bits.push(`OVR ${snap['2k_ovr']}`);
      const pot = (snap.attributes || {}).potential;
      if (pot) bits.push(`POT ${pot}`);
      if ((snap['2k_pos'] || []).length) bits.push(snap['2k_pos'].join('/'));
      meta.textContent = bits.join(' · ');
      head.appendChild(meta);
    }
    el.appendChild(head);

    if (!snap || !snap.attributes) {
      const note = document.createElement('div');
      note.className = 'ratings-pop-note';
      note.textContent = 'No ratings breakdown for this player yet.';
      el.appendChild(note);
      return;
    }

    const attrs = snap.attributes;
    const body = document.createElement('div');
    body.className = 'ratings-pop-body';
    el.appendChild(body);

    CATEGORIES.forEach(cat => {
      const present = cat.keys.filter(k => attrs[k] != null);
      if (!present.length) return;
      // One group per category, kept whole across the column break.
      const group = document.createElement('div');
      group.className = 'ratings-pop-group';
      body.appendChild(group);

      const h = document.createElement('div');
      h.className = 'ratings-pop-cat';
      h.textContent = cat.label;
      group.appendChild(h);

      present.forEach(key => {
        const val = attrs[key];
        const n = parseFloat(val);
        const row = document.createElement('div');
        row.className = 'ratings-pop-row';

        const label = document.createElement('span');
        label.className = 'ratings-pop-label';
        label.textContent = LABELS[key] || key;
        row.appendChild(label);

        const track = document.createElement('span');
        track.className = 'ratings-pop-track';
        const fill = document.createElement('span');
        fill.className = 'ratings-pop-fill';
        const hue = attrHue(isNaN(n) ? 0 : n);
        fill.style.width = `${Math.min(100, Math.max(0, (isNaN(n) ? 0 : n) / 99 * 100))}%`;
        fill.style.background = `hsl(${hue}, 65%, 45%)`;
        track.appendChild(fill);
        row.appendChild(track);

        const v = document.createElement('span');
        v.className = 'ratings-pop-val';
        v.style.color = `hsl(${hue}, 80%, 72%)`;
        v.textContent = val;
        row.appendChild(v);

        group.appendChild(row);
      });
    });

    const foot = document.createElement('div');
    foot.className = 'ratings-pop-foot';
    foot.textContent = snap.date ? `2K attributes via 2kratings.com · ${snap.date}` : '2K attributes via 2kratings.com';
    el.appendChild(foot);
  }

  // Anchor to the trigger: below by default, flipped above when it would
  // overflow, and clamped horizontally to stay on screen.
  function position(el, trigger) {
    const r = trigger.getBoundingClientRect();
    el.style.top = '0px';
    el.style.left = '0px';
    const pr = el.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    let top = r.bottom + gap;
    if (top + pr.height > window.innerHeight - margin) {
      const above = r.top - gap - pr.height;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - margin - pr.height);
    }
    let left = r.left + r.width / 2 - pr.width / 2;
    left = Math.min(Math.max(margin, left), window.innerWidth - margin - pr.width);

    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
  }

  function show(trigger) {
    const slug = trigger.dataset.ratingsSlug;
    if (!slug) return;
    const el = ensurePop();
    activeEl = trigger;
    const name = trigger.dataset.ratingsName || '';

    renderInto(el, name, undefined);
    el.hidden = false;
    position(el, trigger);

    fetchSnapshot(slug).then(snap => {
      if (activeEl !== trigger) return; // pointer moved on before the fetch landed
      renderInto(el, name, snap);
      position(el, trigger);
    });
  }

  function hide() {
    clearTimeout(showTimer);
    activeEl = null;
    if (popEl) popEl.hidden = true;
  }

  function attach(el, slug, opts) {
    if (!el || !slug) return;
    const options = opts || {};
    el.dataset.ratingsSlug = slug;
    if (options.name) el.dataset.ratingsName = options.name;
    el.classList.add('ratings-trigger');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${options.name || 'Player'} ratings breakdown`);

    // Per-event pointerType is device-truthful; a (hover: hover) media query is a
    // guess that hybrid touch/mouse machines and headless browsers get wrong.
    let lastPointerType = 'mouse';
    el.addEventListener('pointerdown', e => { lastPointerType = e.pointerType || 'mouse'; });

    el.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(el), HOVER_DELAY_MS);
    });
    el.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(showTimer);
      // Let the pointer cross the gap into the popup without it closing.
      showTimer = setTimeout(() => { if (!popEl || !popEl.matches(':hover')) hide(); }, HOVER_DELAY_MS);
    });

    // Tap toggles. Mouse is already covered by hover, so a click from a mouse
    // must not immediately re-hide what hovering just opened.
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (lastPointerType === 'mouse') return;
      if (activeEl === el && popEl && !popEl.hidden) hide();
      else show(el);
    });

    el.addEventListener('focus', () => show(el));
    el.addEventListener('blur', () => hide());
    el.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  }

  document.addEventListener('click', () => hide());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  // Scrolling the page detaches the popup from its anchor, so close it — but not
  // when the scroll is the popup's own overflowing attribute list.
  window.addEventListener('scroll', e => {
    if (activeEl && !(popEl && popEl.contains(e.target))) hide();
  }, true);
  window.addEventListener('resize', () => hide());

  window.RatingsPopup = {
    attach,
    setSource(fn) { source = fn; },
    CATEGORIES,
    LABELS,
  };
})();
