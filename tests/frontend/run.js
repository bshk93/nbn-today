#!/usr/bin/env node
'use strict';

// Frontend smoke tests — "does the page actually render?"
//
// build/smoke_test.py guards the *data contract*: that the columns a page reads
// still exist in the CSVs the build writes. Nothing checked that a page renders,
// which is a whole class of breakage it cannot see — a JS error in an inline
// boot, a fetch that 404s, a table that comes up empty because a selector moved.
// The API side has 47 test suites; the 114 pages had none.
//
// Each page gets four questions, and they are deliberately cheap:
//
//   1. Does it answer 200?
//   2. Did any script throw?
//   3. Did every same-origin request it made succeed?
//   4. Did the thing the page exists to show actually appear?
//
// (4) is what stops this from being a liveness check. A page that 200s with an
// empty table is broken, and only an assertion about content catches it.
//
// ── Why this runs against a URL and not a local server ──
//
// It cannot use `python3 -m http.server`. This repo contains no data files —
// the CSVs live in /var/lib/nothing-but-stats and are served by nginx from the
// `public/` view — so a static server rooted at the repo 404s every fetch a
// page makes. It also cannot proxy /api. The target is therefore a real vhost,
// `https://nbn.today` by default. Every request made here is a GET of a public
// page; nothing signs in and nothing writes.
//
// Set NBN_BASE to point elsewhere (dev.nbn.today needs its basic-auth
// credentials, which is why it is not the default).
//
// ── Why it is not in the pre-commit hook ──
//
// It launches a browser and loads ~14 pages over the network. That is tens of
// seconds and a hard dependency on the site being up and on `npm ci` having
// been run — none of which belongs between a commit and its author. The hook
// keeps build/smoke_test.py; this is run by hand, or by anything periodic that
// wants it.
//
//   npm ci && node run.js               # all pages
//   node run.js --only teams            # just the ones whose path matches
//   NBN_BASE=https://dev.nbn.today node run.js

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.NBN_BASE || 'https://nbn.today';
const NAV_TIMEOUT = 45000;
// Pages settle their tables after the CSV fetch resolves; networkidle2 gets us
// most of the way and this covers the render that follows it.
const SETTLE_MS = 1500;

// One row per page. `min` is a floor, not an exact count — these assertions
// should survive the league playing more games, not need editing every season.
const PAGES = [
  { path: '/standings/',              selector: 'table tbody tr',  min: 30, what: 'a row per team' },
  { path: '/owners/',                 selector: 'table tbody tr',  min: 20, what: 'a row per owner' },
  { path: '/players/',                selector: 'table tbody tr',  min: 500, what: 'the player index' },
  { path: '/players/?p=curry-stephen', selector: 'table tbody tr', min: 5,  what: 'a profile with season rows' },
  { path: '/teams/UTA/',              selector: 'table tbody tr',  min: 10, what: 'roster, picks and history tables' },
  // The Cap Health card is built from an API call and a rules module loaded
  // separately from team.js, so a page that renders its tables fine can still
  // come up with no card at all. Standing rows only — the sheet-diff rows
  // below them are legitimately zero on a team that agrees with the sheet.
  { path: '/teams/UTA/',              selector: '#cap-health-section .ch-row', min: 5, what: 'the cap health standing rows' },
  { path: '/h2h/',                    selector: 'table tbody tr',  min: 30, what: 'the head-to-head matrix' },
  { path: '/hof/',                    selector: 'table tbody tr',  min: 100, what: 'the HOF board' },
  { path: '/stats/highs/p/',          selector: 'table tbody tr',  min: 40, what: 'single-game points highs' },
  { path: '/stats/totals/p/',         selector: 'table tbody tr',  min: 100, what: 'career points leaders' },
  { path: '/season-summary/',         selector: 'table tbody tr',  min: 5,  what: 'a row per season' },
  { path: '/nbntv-classics/',         selector: '.classic-entry',  min: 10, what: 'the classics list' },
  { path: '/tradeblock/',             selector: 'table tbody tr',  min: 5,  what: 'blocked players' },
  { path: '/draft/',                  selector: 'table tbody tr',  min: 30, what: 'draft history' },
  { path: '/boxscores/',              selector: 'table tbody tr',  min: 5,  what: 'recent box scores' },
  // scope=all, not the default Upcoming view: that one legitimately empties
  // out once the season has been played, and this should outlive the season.
  { path: '/schedule/?scope=all',     selector: '.game',           min: 20, what: 'scheduled games' },
  { path: '/cap-summary/',            selector: 'table tbody tr',  min: 30, what: 'a row per team' },
  // A published power-rankings edition, by id — the only stable way to reach
  // one, since /news/ lists whatever is newest. Editions are never deleted.
  { path: '/news/view/?id=ee63b136-b6aa-4408-af8a-a5c3dbcbb93f',
                                      selector: '.rank-row',       min: 30, what: 'the power-rankings table' },
];

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), '.cache/puppeteer/chrome-headless-shell');
  if (!fs.existsSync(base)) {
    throw new Error(
      'No Chrome found. Set CHROME_PATH, or install one with:\n' +
      '  npx @puppeteer/browsers install chrome-headless-shell@stable');
  }
  // Several versions accumulate here; take the newest by name.
  const version = fs.readdirSync(base).sort().pop();
  return path.join(base, version, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
}

const only = (() => {
  const i = process.argv.indexOf('--only');
  return i === -1 ? null : process.argv[i + 1];
})();

async function checkPage(browser, spec) {
  const page = await browser.newPage();
  // The box is small; a wide viewport costs nothing but a tiny one can collapse
  // layouts into a state no real visitor sees.
  await page.setViewport({ width: 1280, height: 900 });
  // Every check does its own fetch. Tabs share one browser cache, so a path
  // listed twice — /teams/UTA/ is, deliberately, once for its tables and once
  // for the Cap Health card — had its second load answered 304 from cache.
  // That failed the `expected 200` assertion below, and worse, it meant the
  // second check never exercised the fetch it was there to exercise.
  await page.setCacheEnabled(false);

  const uncaught = [];
  const sameOrigin = [];
  const thirdParty = [];
  const consoleErrors = [];

  page.on('pageerror', (e) => uncaught.push(String(e.message).split('\n')[0].slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Resource failures arrive twice — once here, once on `response`. The
    // response handler is the one that knows the URL and the status, so this
    // half is dropped rather than reported twice.
    if (text.startsWith('Failed to load resource')) return;
    consoleErrors.push(text.slice(0, 160));
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    const url = r.url();
    const entry = `${r.status()} ${url.slice(0, 120)}`;
    (url.startsWith(BASE) ? sameOrigin : thirdParty).push(entry);
  });

  let status = null;
  let navError = null;
  try {
    const res = await page.goto(BASE + spec.path, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    status = res.status();
    await new Promise((r) => setTimeout(r, SETTLE_MS));
  } catch (e) {
    navError = e.message.split('\n')[0];
  }

  let count = 0;
  if (!navError) {
    count = await page
      .$$eval(spec.selector, (n) => n.length)
      .catch(() => 0);
  }
  await page.close();

  const failures = [];
  if (navError) failures.push(`navigation failed: ${navError}`);
  else if (status !== 200) failures.push(`answered ${status}, expected 200`);
  for (const u of uncaught) failures.push(`uncaught: ${u}`);
  for (const c of consoleErrors) failures.push(`console error: ${c}`);
  // Same-origin failures are ours and are always a defect. Third-party ones are
  // someone else's uptime, so they are reported and do not fail the run — a
  // rate-limited image host must not turn the suite red.
  for (const r of sameOrigin) failures.push(`request failed: ${r}`);
  if (!navError && count < spec.min) {
    failures.push(`found ${count} × "${spec.selector}", expected at least ${spec.min} (${spec.what})`);
  }

  return { spec, failures, warnings: thirdParty, count };
}

(async () => {
  const specs = only ? PAGES.filter((p) => p.path.includes(only)) : PAGES;
  if (!specs.length) {
    console.error(`No pages match --only ${only}`);
    process.exit(2);
  }

  console.log(`frontend smoke — ${specs.length} page(s) against ${BASE}\n`);
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const failed = [];
  const warned = [];
  try {
    // Serial on purpose: this box has under 1GB free and each tab is a real
    // renderer process.
    for (const spec of specs) {
      const r = await checkPage(browser, spec);
      if (r.failures.length) {
        failed.push(r);
        console.log(`  [FAIL] ${spec.path}`);
        for (const f of r.failures) console.log(`         ${f}`);
      } else {
        console.log(`  [ok]   ${spec.path}  (${r.count} × ${spec.selector})`);
      }
      if (r.warnings.length) {
        warned.push(r);
        for (const w of r.warnings) console.log(`         warn: third-party ${w}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('');
  if (warned.length) {
    console.log(`${warned.length} page(s) had third-party request failures (reported, not fatal)`);
  }
  if (failed.length) {
    console.log(`${failed.length} FAILED: ${failed.map((f) => f.spec.path).join(', ')}`);
    process.exit(1);
  }
  console.log(`all ${specs.length} pages rendered`);
})().catch((e) => {
  console.error('FATAL', e.stack || e.message);
  process.exit(2);
});
