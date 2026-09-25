// Radar — the archetype radar shared by player pages and team pages.
//
// Each page supplies its own axes and archetypes; this file owns the parts
// that must read the same on both: how a percentile is ranked, how the
// nearest archetype is chosen, and how the chart is drawn.
//
//   Radar.percentile(val, arr)          share of arr strictly below val (0–1)
//   Radar.nearest(pcts, archetypes)     { name, runnerUp } — see below
//   Radar.draw({ dims, title, tier, runnerUp, footer })  → <svg>
//   Radar.withSeasons(seasons, build, opts)  season switcher around build(season);
//       opts.card puts it in a card headed by opts.label, with a dropdown for
//       the season instead of a row of buttons
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  function percentile(val, arr) {
    return arr.length ? arr.filter(x => x < val).length / arr.length : 0;
  }

  function ordinal(n) {
    const sfx = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
    return `${n}${sfx}`;
  }

  // archetypes: { name: [target percentile 0–100 per axis, in axis order] }.
  // The player or team gets the nearest target. The runner-up is named only
  // when it is within 10% of the winner's distance.
  function nearest(pcts, archetypes) {
    const ranked = Object.entries(archetypes).map(([name, target]) => ({
      name,
      dist: Math.hypot(...pcts.map((p, i) => p - target[i] / 100)),
    })).sort((a, b) => a.dist - b.dist);
    const [first, second] = ranked;
    return { name: first.name, runnerUp: second && second.dist <= first.dist * 1.10 ? second.name : null };
  }

  function dotColor(p) {
    if (p >= 0.95) return '#a855f7';
    if (p >= 0.80) return '#eab308';
    if (p >= 0.50) return '#94a3b8';
    return '#b87333';
  }

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (text != null) e.textContent = text;
    return e;
  }

  // dims: [{ label, angle (degrees, 90 = top), pct (0–1), tip }]
  function draw({ dims, title, tier, runnerUp, footer }) {
    const W = 260, H = 292, cx = 130, cy = 125, maxR = 80;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}` });
    svg.style.cssText = 'width:280px;max-width:100%;height:auto;display:block;';
    const toXY = (angle, r) => {
      const rad = angle * Math.PI / 180;
      return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
    };

    [0.33, 0.66, 1.0].forEach(frac => svg.appendChild(el('polygon', {
      points: dims.map(d => toXY(d.angle, maxR * frac).join(',')).join(' '),
      fill: 'none', stroke: 'var(--border)', 'stroke-width': '0.5',
    })));
    dims.forEach(d => {
      const [x2, y2] = toXY(d.angle, maxR);
      svg.appendChild(el('line', { x1: cx, y1: cy, x2, y2, stroke: 'var(--border)', 'stroke-width': '0.5' }));
    });

    svg.appendChild(el('polygon', {
      points: dims.map(d => toXY(d.angle, maxR * d.pct).join(',')).join(' '),
      fill: 'var(--accent)', 'fill-opacity': '0.2',
      stroke: 'var(--accent)', 'stroke-width': '1.5', 'stroke-linejoin': 'round',
    }));

    dims.forEach(d => {
      const [dx, dy] = toXY(d.angle, maxR * d.pct);
      const dot = el('circle', { cx: dx, cy: dy, r: '2.5', fill: dotColor(d.pct), stroke: 'var(--bg-page)', 'stroke-width': '1' });
      dot.appendChild(el('title', {}, `${d.tip} — ${ordinal(Math.round(d.pct * 100))} percentile`));
      svg.appendChild(dot);
    });

    dims.forEach(d => {
      const [lx, ly] = toXY(d.angle, maxR + 16);
      const yOff = Math.abs(ly - cy) < 8 ? 4 : (ly < cy ? -3 : 11);
      svg.appendChild(el('text', {
        x: lx, y: ly + yOff,
        'text-anchor': lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle',
        fill: 'var(--text-muted)', 'font-size': '8.5', 'font-weight': '500',
      }, d.label));
    });

    const titleEl = el('text', {
      x: cx, y: H - 31, 'text-anchor': 'middle',
      fill: 'var(--text-secondary)', 'font-size': '10', 'font-weight': '600',
    }, title);
    if (tier) titleEl.appendChild(el('tspan', { fill: 'var(--text-muted)', 'font-weight': '500' }, ` · ${tier}`));
    svg.appendChild(titleEl);

    if (runnerUp) svg.appendChild(el('text', {
      x: cx, y: H - 18, 'text-anchor': 'middle',
      fill: 'var(--text-muted)', 'font-size': '8.5', 'font-style': 'italic',
    }, `close second: ${runnerUp}`));

    svg.appendChild(el('text', {
      x: cx, y: H - 5, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': '9',
    }, footer));

    return svg;
  }

  // seasons newest first; build(season) returns an <svg> or null.
  function withSeasons(seasons, build, opts = {}) {
    if (!seasons.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'ui-radar';
    const slot = document.createElement('div');
    const show = s => { slot.innerHTML = ''; const svg = build(s); if (svg) slot.appendChild(svg); };

    if (opts.card) {
      wrap.classList.add('ui-radar--card');
      const head = document.createElement('div');
      head.className = 'ui-radar-head';
      const label = document.createElement('span');
      label.textContent = opts.label || 'Archetype';
      head.appendChild(label);
      if (seasons.length > 1) {
        const sel = document.createElement('select');
        sel.className = 'ui-select';
        sel.setAttribute('aria-label', 'Season');
        seasons.forEach(s => sel.appendChild(new Option(s, s)));
        sel.addEventListener('change', () => show(sel.value));
        head.appendChild(sel);
      } else {
        const one = document.createElement('span');
        one.className = 'ui-radar-season';
        one.textContent = seasons[0];
        head.appendChild(one);
      }
      wrap.appendChild(head);
    } else if (seasons.length > 1) {
      const bar = document.createElement('div');
      bar.className = 'ui-segmented';
      bar.setAttribute('role', 'group');
      seasons.forEach((s, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = s;
        btn.setAttribute('aria-pressed', String(i === 0));
        btn.addEventListener('click', () => {
          bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          show(s);
        });
        bar.appendChild(btn);
      });
      wrap.appendChild(bar);
    }
    wrap.appendChild(slot);
    show(seasons[0]);
    return wrap;
  }

  window.Radar = { percentile, ordinal, nearest, draw, withSeasons };
})();
