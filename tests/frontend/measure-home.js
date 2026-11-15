// Homepage load measurement: first paint, request counts, duplicate URLs,
// and when /api/tonight lands. Cold cache, no sign-in.
//
//     node tests/frontend/measure-home.js https://nbn.today desktop
//     node tests/frontend/measure-home.js http://127.0.0.1:8099 phone   # build/preview_live.py
//
// Needs Playwright (preinstalled in cloud sessions; elsewhere `npm i playwright`).
// Against nbn.today it is about 30 real API reads per run, so don't loop it.
// Through preview_live.py the timings mean little (static files are local and
// there is no API queue); the counts and duplicates still hold.
const { chromium } = require('playwright');
const [,, base, vpName] = process.argv;
const VP = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } }[vpName];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: VP });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const reqs = []; let phase = 'load';
  p.on('requestfinished', r => { const t = r.timing(); reqs.push({ u: r.url().replace(base, ''), t: r.resourceType(), phase, start: t.startTime, wait: Math.round(t.responseStart - t.requestStart) }); });
  const t0 = Date.now();
  await p.goto(base + '/', { waitUntil: 'networkidle', timeout: 60000 });
  const idle = Date.now() - t0;
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const f = performance.getEntriesByName('first-contentful-paint')[0]; return { fcp: Math.round(f ? f.startTime : -1), dcl: Math.round(n.domContentLoadedEventEnd) }; });
  const heroAt = await p.evaluate(() => { const e = performance.getEntriesByType('resource').find(x => x.name.includes('/api/tonight')); return e ? Math.round(e.responseEnd) : -1; });
  const cards = () => p.evaluate(() => [...document.querySelectorAll('.dash-card[id]')].filter(c => !c.hidden).map(c => c.id.replace('dash-', '')).sort().join(','));
  const before = await cards();
  phase = 'scroll';
  for (let y = 0; y < 12; y++) { await p.mouse.wheel(0, 900); await p.waitForTimeout(250); }
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  const after = await cards();
  const api = reqs.filter(r => r.u.startsWith('/api/') && r.t !== 'image');
  const load = api.filter(r => r.phase === 'load');
  const counts = {}; reqs.filter(r => r.phase === 'load').forEach(r => counts[r.u] = (counts[r.u] || 0) + 1);
  console.log(JSON.stringify({ vp: vpName, fcp: nav.fcp, dcl: nav.dcl, idle, tonightDone: heroAt,
    loadReqs: reqs.filter(r => r.phase === 'load').length, loadApi: load.length, scrollApi: api.length - load.length,
    dups: Object.entries(counts).filter(([, v]) => v > 1).map(([k]) => k),
    errs: errs.slice(0, 5) }));
  console.log('  before:', before); console.log('  after: ', after);
  await b.close();
})();
