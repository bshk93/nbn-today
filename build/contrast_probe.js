// Walk the rendered DOM and report text that fails WCAG AA against the
// background actually painted behind it. Injected into a page by
// build/contrast_audit.sh, which forces a theme first and reads the result
// back out of the <pre> this appends.
//
// This exists because the interesting failures are invisible to grep. A page
// can hardcode a dark background and inherit a themed text colour from a
// stylesheet three files away; only the rendered result shows the two
// disagreeing. It is what found --text-muted missing from the light theme
// (267 failures from one absent token) and the 53 badge rules whose surface
// stayed dark while their text flipped.
//
// Deliberately conservative: it only reports an element that owns visible
// text of its own, and only when the nearest opaque ancestor background is
// what is actually painted behind it — so one bad container does not report
// as fifty findings.
(() => {
  const parse = c => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  // The painted background behind an element: walk up until something opaque.
  const bgOf = el => {
    let n = el;
    while (n && n !== document.documentElement.parentNode) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.85) return c;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };

  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.15) continue;
    // only elements with their own visible text
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
    if (!own) continue;
    const fg = parse(s.color);
    if (!fg || fg[3] < 0.85) continue;
    const r = ratio(fg, bgOf(el));
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    if (r >= need) continue;
    const key = `${el.tagName}.${el.className}|${s.color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ratio: +r.toFixed(2), need,
      sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
      color: s.color, bg: `rgb(${bgOf(el).slice(0, 3).join(', ')})`,
      text: own.slice(0, 46),
    });
  }
  out.sort((a, b) => a.ratio - b.ratio);
  const pre = document.createElement('pre');
  pre.id = 'contrast-report';
  pre.textContent = JSON.stringify(out.slice(0, 40), null, 0);
  document.body.appendChild(pre);
})();
