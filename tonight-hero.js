// The homepage's "Tonight" graphic: a poster (the night's game count and its
// featured matchup, face to face) over a swipeable rail of every game, plus
// last night's stars.
//
// It draws GET /api/tonight and decides nothing: which game is featured, each
// side's star (the hot hand: best Game Score over his last 5 for this team),
// the storylines and the team colours all come from nbn-api's
// routers/tonight.py, which also renders the same answer as the 11am Discord
// card. So the page and the card can't disagree. The one addition here is
// milestone lines (`addStory`), because milestones.js is their one home.
//
// Styles: css/tonight-hero.css. It is the homepage's one broadcast graphic, so
// unlike the rest of the site it moves (see docs/design-system.md § The
// Tonight graphic); every animation is off under prefers-reduced-motion.
//
//   TonightHero.mount(el, data, { lastNight, previewHref, label })
//   TonightHero.setFinal(el, away, home, awayPts, homePts, href)
//   TonightHero.addStory(el, slug, text)
(function (global) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduced = () => !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const AUTO_MS = 5000;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dateLine(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return `${DAYS[dt.getUTCDay()]} · ${MONTHS[m - 1]} ${d}`;
  }
  const seasonYears = s => (/^\d\d-\d\d$/.test(s || '') ? `20${s.slice(0, 2)}–${s.slice(3)}` : (s || ''));
  const tip = t => {
    const m = /^(\d{1,2}:\d\d)([ap])$/.exec(t || '');
    return m ? `${m[1]} ${m[2] === 'p' ? 'PM' : 'AM'}` : (t || 'TBD');
  };
  function lastName(name) {
    const parts = String(name || '').split(' ');
    while (parts.length > 2 && /^(Jr\.|Sr\.|II|III|IV)$/.test(parts[parts.length - 1])) parts.pop();
    return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
  }
  const initials = name => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const logo = t => `/logos/sm/logo-${esc(String(t).toLowerCase())}.webp`;

  // A face in its team's accent ring; the initials stay underneath, so a
  // missing headshot (a 404) just leaves them showing.
  function face(star, team, cls) {
    if (!star) {
      return `<span class="${cls} th-face--logo" data-team="${esc(team)}"><img src="${logo(team)}" alt=""></span>`;
    }
    return `<span class="${cls}" data-team="${esc(team)}"><span class="th-init">${esc(initials(star.name))}</span>`
      + `<img src="${esc(star.headshot)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
  }

  function starLine(star) {
    if (!star) return '';
    if (star.last5) {
      const l = star.last5;
      // Each figure is one unbreakable piece, so a narrow line wraps between them.
      return [[l.pts, 'PPG'], [l.reb, 'RPG'], [l.ast, 'APG']]
        .map(([v, k]) => `<span><b>${v.toFixed(1)}</b> ${k}</span>`).join(' ');
    }
    return star.ovr ? `<span><b>${esc(star.ovr)}</b> OVR</span>` : '';
  }
  const starSub = star => (!star ? '' : star.last5 ? `Last ${star.last5.gp}` : 'Top rated');

  function posterSide(g, side) {
    const team = g[side], star = g.stars && g.stars[side];
    return `<div class="th-side th-side--${side}">`
      + face(star, team, 'th-face')
      + `<a class="th-name" href="${star ? `/players/?p=${encodeURIComponent(star.slug)}` : `/teams/${esc(team.toLowerCase())}/`}">`
      + `${esc(star ? lastName(star.name) : team)}</a>`
      + `<div class="th-line">${starLine(star)}</div>`
      + `<div class="th-line-sub">${esc(starSub(star))}</div>`
      + `<a class="th-team" href="/teams/${esc(team.toLowerCase())}/"><img src="${logo(team)}" alt="">`
      + `${esc(team)} <span>${esc((g.records || {})[side] || '')}</span></a>`
      + '</div>';
  }

  function tickerHtml(stories) {
    if (!stories.length) return '';
    // Written twice, so sliding by half loops seamlessly; the copy is hidden
    // from screen readers.
    const run = stories.map(s => `<span class="th-tick">${esc(s)}</span>`).join('');
    return `<div class="th-ticker"><div class="th-ticker-strip" style="--th-dur:${Math.max(18, stories.length * 6)}s">`
      + `<span class="th-ticker-run">${run}</span><span class="th-ticker-run" aria-hidden="true">${run}</span></div></div>`;
  }

  // The poster's ticker: the featured game's storylines, then one from each
  // other game, the stream line left to the pill.
  function posterStories(data, feat) {
    const out = (feat ? feat.storylines : []).filter(s => !/^Live on/.test(s));
    for (const g of data.games) if (g !== feat && g.storylines.length) out.push(`${g.away} @ ${g.home}: ${g.storylines[0]}`);
    return out.slice(0, 10);
  }

  function gameCard(g, i, previewHref) {
    const a = g.stars && g.stars.away, h = g.stars && g.stars.home;
    const story = g.storylines.find(s => !/^Live on/.test(s)) || '';
    const chip = g.stream ? '<span class="th-chip th-chip--live">Stream</span>'
      : g.featured ? '<span class="th-chip">Game of the night</span>' : '';
    return `<a class="th-card${g.featured ? ' th-card--feat' : ''}" style="--i:${i}" href="${esc(previewHref(g))}"`
      + ` data-away="${esc(g.away)}" data-home="${esc(g.home)}" data-slugs="${esc([a && a.slug, h && h.slug].filter(Boolean).join(' '))}">`
      + `<span class="th-half th-half--a" data-team="${esc(g.away)}"></span><span class="th-half th-half--h" data-team="${esc(g.home)}"></span>`
      + '<span class="th-card-body">'
      + `<span class="th-card-faces">${face(a, g.away, 'th-mini')}<span class="th-at">@</span>${face(h, g.home, 'th-mini')}</span>`
      + `<span class="th-card-row"><span><img src="${logo(g.away)}" alt="">${esc(a ? lastName(a.name) : g.away)}</span>`
      + `<span>${esc(h ? lastName(h.name) : g.home)}<img src="${logo(g.home)}" alt=""></span></span>`
      + `<span class="th-card-row th-card-rec"><span>${esc(g.away)} ${esc(g.records.away)}</span><span>${esc(g.home)} ${esc(g.records.home)}</span></span>`
      + `<span class="th-card-story">${esc(story)}</span>`
      + `<span class="th-card-foot"><span class="th-card-tip">${esc(tip(g.time_et))} ET</span>${chip}</span>`
      + '</span></a>';
  }

  function lastNightCard(ln) {
    if (!ln || !ln.top || !ln.top.length) return '';
    const [, m, d] = ln.date.split('-').map(Number);
    return '<div class="th-card th-card--last" style="--i:0">'
      + `<span class="th-last-head">Last night's stars · ${MONTHS[m - 1]} ${d}</span>`
      + ln.top.map(x => {
        const extra = [['stl', 'STL'], ['blk', 'BLK']].filter(([k]) => x[k] >= 3).map(([k, l]) => ` · ${x[k]} ${l}`).join('');
        return `<a class="th-last-row" href="/players/?p=${encodeURIComponent(x.slug)}">`
          + face({ name: x.name, headshot: `/api/players/${encodeURIComponent(x.slug)}/headshot` }, x.team, 'th-mini th-mini--sm')
          + `<span class="th-last-text"><b>${esc(x.name)}</b>`
          + `<small>${x.pts} PTS · ${x.reb} REB · ${x.ast} AST${extra}</small>`
          + `<small class="th-last-game"><img src="${logo(x.team)}" alt="">${esc(x.team)} ${x.home ? 'vs' : '@'} ${esc(x.opp)} · ${esc(x.wl)} ${esc(x.score)}</small></span></a>`;
      }).join('')
      + '</div>';
  }

  // The count runs up from zero once, unless motion is off.
  function countUp(node, n) {
    if (reduced() || n <= 1) { node.textContent = n; return; }
    const t0 = performance.now(), dur = 700;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      node.textContent = Math.round(n * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    node.textContent = '0';
    requestAnimationFrame(step);
  }

  function setupRail(root) {
    const rail = root.querySelector('.th-rail');
    const dots = root.querySelector('.th-dots');
    const cards = [...rail.querySelectorAll('.th-card')];
    if (!cards.length) return;
    dots.innerHTML = cards.map((_, i) => `<button type="button" class="th-dot" aria-label="Card ${i + 1}"></button>`).join('');
    const dotEls = [...dots.children];
    const current = () => {
      const x = rail.scrollLeft;
      let best = 0;
      cards.forEach((c, i) => { if (Math.abs(c.offsetLeft - rail.offsetLeft - x) < Math.abs(cards[best].offsetLeft - rail.offsetLeft - x)) best = i; });
      return best;
    };
    const go = i => {
      const c = cards[(i + cards.length) % cards.length];
      rail.scrollTo({ left: c.offsetLeft - rail.offsetLeft, behavior: reduced() ? 'auto' : 'smooth' });
    };
    const mark = () => { const i = current(); dotEls.forEach((d, j) => d.setAttribute('aria-current', String(i === j))); };
    rail.addEventListener('scroll', () => requestAnimationFrame(mark), { passive: true });
    mark();
    dots.addEventListener('click', e => { const i = dotEls.indexOf(e.target.closest('.th-dot')); if (i >= 0) go(i); });
    root.querySelector('.th-prev').addEventListener('click', () => go(current() - 1));
    root.querySelector('.th-next').addEventListener('click', () => go(current() + 1));

    // Auto-advance: paused while the pointer, focus or a finger is on the
    // rail, while the tab is hidden, and for good once someone swipes it.
    if (reduced()) return;
    let held = false, stopped = false;
    const wrap = root.querySelector('.th-rail-wrap');
    wrap.addEventListener('mouseenter', () => { held = true; });
    wrap.addEventListener('mouseleave', () => { held = false; });
    wrap.addEventListener('focusin', () => { held = true; });
    wrap.addEventListener('focusout', () => { held = false; });
    rail.addEventListener('touchstart', () => { stopped = true; }, { passive: true });
    const timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); return; }
      if (held || stopped || document.hidden) return;
      // Only once the rail actually overflows; at the end, back to the start.
      if (rail.scrollWidth <= rail.clientWidth + 4) return;
      const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
      go(atEnd ? 0 : current() + 1);
    }, AUTO_MS);
  }

  /**
   * Draw `data` (a GET /api/tonight answer with games) into `el`.
   * opts.lastNight  — last night's lines, when `data` is a later slate's
   * opts.label      — the line over the count ("Next up"); default by date
   * opts.previewHref(g) — where a game links (the homepage's previewHref)
   */
  function mount(el, data, opts = {}) {
    const games = data.games || [];
    if (!games.length) return false;
    const previewHref = opts.previewHref || (g => `/preview/?away=${g.away}&home=${g.home}&date=${g.date}`);
    const feat = games.find(g => g.featured) || games[0];
    const n = data.count || games.length;
    const ln = opts.lastNight !== undefined ? opts.lastNight : data.last_night;
    const unit = n === 1 ? 'Game' : 'Games';
    const when = opts.label ? '' : 'Tonight';
    const fs = feat.stars || {};

    el.classList.add('th');
    el.innerHTML =
      `<section class="th-poster" aria-label="${esc(`${n} ${unit} ${opts.label || 'tonight'}`)}">`
      + `<span class="th-half th-half--a" data-team="${esc(feat.away)}"></span><span class="th-half th-half--h" data-team="${esc(feat.home)}"></span>`
      + '<span class="th-hatch"></span>'
      + '<div class="th-top">'
      + '<div class="th-count">'
      + (opts.label ? `<span class="th-kicker">${esc(opts.label)}</span>` : '')
      + `<span class="th-num">${n}</span><span class="th-unit">${unit}${when ? `<br>${when}` : ''}</span>`
      + `<span class="th-date">${esc(dateLine(data.date))} · ${esc(seasonYears(data.season))}</span></div>`
      + '<div class="th-feat">'
      + '<div class="th-label">'
      + (feat.stream ? `<span class="th-live" title="${esc(feat.streamer ? `Streamed by ${feat.streamer}` : 'Stream game')}">Stream</span>` : '')
      + `<span>Game of the night · <a href="${esc(previewHref(feat))}">${esc(tip(feat.time_et))} ET</a></span></div>`
      + posterSide(feat, 'away')
      + `<div class="th-vs"><span>VS</span><small>${esc(feat.away)} @ ${esc(feat.home)}</small></div>`
      + posterSide(feat, 'home')
      + '</div></div>'
      + tickerHtml(posterStories(data, feat))
      + '</section>'
      + '<div class="th-rail-wrap">'
      + '<div class="th-rail" tabindex="0" aria-label="Games">'
      + lastNightCard(ln)
      + games.map((g, i) => gameCard(g, i + 1, previewHref)).join('')
      + '</div>'
      + '<div class="th-controls">'
      + '<button type="button" class="th-prev ui-btn ui-btn--ghost ui-btn--sm" aria-label="Previous card">Prev</button>'
      + '<div class="th-dots"></div>'
      + '<button type="button" class="th-next ui-btn ui-btn--ghost ui-btn--sm" aria-label="Next card">Next</button>'
      + '</div></div>';
    el._thStories = posterStories(data, feat);
    el._thFeatSlugs = [fs.away && fs.away.slug, fs.home && fs.home.slug].filter(Boolean);
    countUp(el.querySelector('.th-num'), n);
    setupRail(el);
    return true;
  }

  /** A played game's final in place of its tip time, linked to the box score. */
  function setFinal(el, away, home, ap, hp, href) {
    const card = el.querySelector(`.th-card[data-away="${away}"][data-home="${home}"]`);
    if (!card) return;
    const t = card.querySelector('.th-card-tip');
    t.innerHTML = `<b class="${ap > hp ? 'th-win' : ''}">${esc(ap)}</b>–<b class="${hp > ap ? 'th-win' : ''}">${esc(hp)}</b> Final`;
    if (href) card.href = href;
  }

  /** A storyline found on the page (a milestone) for a star's cards and,
   *  when he's in the featured game, the poster's ticker. */
  function addStory(el, slug, text) {
    el.querySelectorAll('.th-card[data-slugs]').forEach(card => {
      if (!card.dataset.slugs.split(' ').includes(slug)) return;
      card.querySelector('.th-card-story').textContent = text;
    });
    if ((el._thFeatSlugs || []).includes(slug)) {
      const old = el.querySelector('.th-ticker');
      el._thStories = [text, ...el._thStories];
      const html = tickerHtml(el._thStories);
      if (old) old.outerHTML = html;
      else el.querySelector('.th-poster').insertAdjacentHTML('beforeend', html);
    }
  }

  global.TonightHero = { mount, setFinal, addStory, lastName };
})(typeof window !== 'undefined' ? window : globalThis);
