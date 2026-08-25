# Frontend smoke tests

Does the page actually render? `build/smoke_test.py` guards the **data
contract** — that the columns a page reads still exist in the CSVs the build
writes. It cannot see a JS error in an inline boot, a fetch that 404s, or a
table that comes up empty. This covers that gap.

```bash
cd tests/frontend
npm ci                              # once; node_modules is gitignored
node run.js                         # all pages
node run.js --only teams            # just paths matching "teams"
NBN_BASE=https://dev.nbn.today node run.js
```

Exit status is 0 when every page rendered, 1 on a failure, 2 if the harness
itself could not start.

## What each page is asked

1. Does it answer 200?
2. Did any script throw?
3. Did every **same-origin** request succeed?
4. Did the thing the page exists to show actually appear?

(4) is the one that matters. A page that 200s with an empty table is broken, and
only an assertion about content catches it. The counts in `PAGES` are floors, so
they survive the league playing more games rather than needing an edit a season.

**Third-party request failures are reported but do not fail the run.** A
rate-limited image host is not a regression in this repo. Same-origin failures
always fail — those are ours.

## Two things that look like choices and aren't

**It runs against a real vhost, not a local server.** This repo contains no data
files; the CSVs live in `/var/lib/nothing-but-stats` and nginx serves them from
the `public/` view. A static server rooted at the repo 404s every fetch a page
makes, and it cannot proxy `/api` either. Default target is
`https://nbn.today`. Every request is a GET of a public page — nothing signs in
and nothing writes.

`dev.nbn.today` works via `NBN_BASE` but is not the default, since it sits
behind basic auth.

**It is not in the pre-commit hook.** It launches a browser and loads ~15 pages
over the network: tens of seconds, plus a hard dependency on the site being up
and on `npm ci` having been run. None of that belongs between a commit and its
author. The hook keeps `build/smoke_test.py`.

## Adding a page

One row in `PAGES` in `run.js`:

```js
{ path: '/h2h/', selector: 'table tbody tr', min: 30, what: 'the head-to-head matrix' },
```

Pick a selector that is the page's *content*, not its chrome — every page
carries a nav and a theme menu, so counting `div` proves nothing. `what` is
printed in the failure message, so write it as the thing a reader would miss.

## Authenticated pages are not covered

`/pdc`, `/free-agency` and team edit mode need a session cookie
(`Domain=.nbn.today`), so they are out of scope here. Covering them means
minting a real session against the live API, and a write path exercised from a
dev page is a real write — see the root `CLAUDE.md`.

## Chrome

Resolved from `~/.cache/puppeteer/chrome-headless-shell` (newest version wins),
or `CHROME_PATH`. If neither exists:

```bash
npx @puppeteer/browsers install chrome-headless-shell@stable
```

Pages run **serially** — this box has under 1GB free and each tab is a real
renderer process.
