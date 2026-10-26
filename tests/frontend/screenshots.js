#!/usr/bin/env node
'use strict';

// Screenshots of a fixed set of pages, for before/after review of design work.
//
// run.js asks "does the page render?"; this asks "what does it look like?".
// The same page list, viewports and themes every time, so two runs — one
// against the live site, one against a branch — line up file for file:
//
//   node screenshots.js --out /tmp/before                          # nbn.today
//   python3 build/preview_live.py &                                # the branch,
//   node screenshots.js --base http://127.0.0.1:8099 --out /tmp/after  # live data
//
// Files are named {viewport}-{theme}-{page}.png. Motion is reduced so nothing
// is caught mid-animation, and captures are the first screen, not full-page:
// the top of a page is what reads as "the site", and full-page shots of the
// longer tables are tens of thousands of pixels.
//
// It also reports horizontal overflow at phone width (the page wider than the
// screen), which every page is meant to be free of (docs/design-system.md).
// Exit status is 1 if any page overflowed, 0 otherwise.
//
//   --only teams           just pages whose name or path matches
//   --themes dark,light    themes to capture (default: dark,light,team-bos)
//   --viewports phone      desk and/or phone (default: both)
//   --all                  every page in build/og_tags.py instead of the list below
//   --element '#dash-feed' capture that element, whole, instead of the first
//                          screen — for a section below the fold
//
// Themes are applied by setting <html data-theme> after load, which skips the
// unlock check theme-boot.js does — a screenshot needs no NB¥.

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PAGES = [
  ['home',        '/'],
  ['standings',   '/season/standings/'],
  ['team',        '/stats/teams/BOS/'],
  ['player',      '/stats/players/?p=curry-stephen'],
  ['players',     '/stats/players/'],
  ['owners',      '/stats/owners/'],
  ['totals',      '/stats/totals/'],
  ['highs',       '/stats/highs/'],
  ['boxscores',   '/stats/boxscores/'],
  ['calendar',    '/season/calendar/'],
  ['preview',     '/preview/?away=NYK&home=BOS&date=2026-10-23'],
  ['news',        '/news/'],
  ['hof',         '/history/hof/'],
  ['draft',       '/history/draft/'],
  ['h2h',         '/stats/h2h/'],
  ['members',     '/members/'],
  ['bet',         '/nbyen/bet/'],
  ['frivolities', '/stats/frivolities/'],
  ['tradeblock',  '/fo/tradeblock/'],
  ['tsim',        '/fo/transaction-sim/'],
  ['rulebook',    '/about/rulebook/'],
  ['committees',  '/committees/'],
  ['injuries',    '/season/injuries/'],
];

const THEMES = { dark: 'nbn-today', light: 'nbn-today-light' };   // anything else is passed through, e.g. team-bos
const VIEWPORTS = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : process.argv[i + 1];
}

// Same lookup as run.js, plus the Playwright Chromium cloud containers ship.
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pw = '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    const dir = fs.readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    // chrome-linux before Playwright 1.5x, chrome-linux64 since.
    const bin = dir && ['chrome-linux', 'chrome-linux64'].map(d => path.join(pw, dir, d, 'chrome')).find(fs.existsSync);
    if (bin) return bin;
  }
  const base = path.join(os.homedir(), '.cache/puppeteer/chrome-headless-shell');
  if (!fs.existsSync(base)) {
    throw new Error(
      'No Chrome found. Set CHROME_PATH, or install one with:\n' +
      '  npx @puppeteer/browsers install chrome-headless-shell@stable');
  }
  const version = fs.readdirSync(base).sort().pop();
  return path.join(base, version, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
}

(async () => {
  const base = arg('base', 'https://nbn.today').replace(/\/$/, '');
  const out = arg('out', 'screenshots');
  const only = arg('only', null);
  const themes = arg('themes', 'dark,light,team-bos').split(',');
  const viewports = arg('viewports', 'desk,phone').split(',');
  const element = arg('element', null);
  // --all: every page build/og_tags.py knows (~140), not just the fixed list.
  // For a sweep before a PR that changes shared CSS, where the fixed list
  // has missed pages that carry their own markup.
  const list = process.argv.includes('--all')
    ? [...fs.readFileSync(path.join(__dirname, '../../build/og_tags.py'), 'utf8').matchAll(/^ '(\/[^']*)':/gm)]
        .map(m => [m[1].replace(/^\/|\/$|\.html$/g, '').replace(/\//g, '_') || 'home', m[1]])
    : PAGES;
  const pages = list.filter(([name, p]) => !only || name.includes(only) || p.includes(only));
  fs.mkdirSync(out, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const overflow = [];
  try {
    for (const vp of viewports) {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORTS[vp]);
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      for (const [name, p] of pages) {
        // networkidle2 can wait forever on a page that polls, so a timeout is
        // a note, not a failure: whatever has rendered by then is captured.
        try {
          await page.goto(base + p, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
          console.log(`  ${name}: ${e.message.split('\n')[0]}`);
        }
        // Pages draw "Loading…" placeholders until their data is in; give
        // them up to 10s more to clear, so a slow fetch isn't captured as
        // a design change.
        await page.waitForFunction(() => !/Loading(…|\.\.\.)/.test(document.body.innerText), { timeout: 10000 })
          .catch(() => console.log(`  ${name}: still loading after 10s`));
        await new Promise(r => setTimeout(r, 1200));
        for (const t of themes) {
          await page.evaluate(id => document.documentElement.setAttribute('data-theme', id), THEMES[t] || t);
          await new Promise(r => setTimeout(r, 150));
          const file = path.join(out, `${vp}-${t}-${name}.png`);
          const el = element && await page.$(element);
          if (element && !el) console.log(`  ${name}: no ${element}`);
          await (el ? el.screenshot({ path: file }) : page.screenshot({ path: file }));
        }
        if (vp === 'phone') {
          const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (w > 0) overflow.push(`${name} (${w}px)`);
        }
        console.log(`${vp} ${name}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (overflow.length) {
    console.log(`\nwider than a phone: ${overflow.join(', ')}`);
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(2); });
