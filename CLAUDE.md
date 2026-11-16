# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Versioning

The site uses semantic versioning (`MAJOR.MINOR.PATCH`) stored in `version.json` at the repo root.

**On every commit that changes something a user can see:**
1. Add a new entry to the **top** of `changelog.json` with `"version": "pending"`, today's date (`YYYY-MM-DD`), and a `changes` array of human-readable bullet strings.
2. Commit normally. The pre-commit hook (`build/hooks/pre-commit`) will auto-bump the patch digit in `version.json` and replace `"pending"` in the new changelog entry with the real version number, then stage both files automatically.

A commit with no pending entry (docs, comments, tooling) gets no bump, by design — don't add an entry just to have one.

**For minor or major bumps** (new feature area, significant overhaul): manually edit `version.json` to the desired version and stage it. The hook skips the auto-bump when the staged `version.json` differs from HEAD.

`changelog.json` format — newest entry first:
```json
[
  { "version": "pending", "date": "YYYY-MM-DD", "changes": ["..."] },
  { "version": "0.0.1",   "date": "2026-05-21", "changes": ["Initial versioned release"] }
]
```

The changelog is served at `/changelog` and the current version appears on the homepage card.

> `changelog.json` holds only the newest releases (150 to 300 entries); older
> ones are in `changelog-archive.json`, which `/changelog` loads on request.
> The hook moves entries across past 300 (`build/archive_changelog.py`, a text
> cut). **Only the first ~10 lines are ever needed**: a new entry goes at the
> top, and the hook rewrites only that entry. Read it with `head`, edit it in
> place, and never re-serialize the file (that reflows every entry into one
> unreviewable diff). Never edit the archive.

---

## League rules and transaction rubrics

All league rules, salary cap rules, and transaction validity rubrics live in **`rulebook/index.html`** — the canonical CBA-style document served at `nbn.today/rulebook`.

Read the relevant article before making or validating any transaction:

| Transaction | Section |
|---|---|
| Trade | Article IV (§ 4.1 – § 4.6) |
| FA signing | Article III (§ 3.1 – § 3.9) |
| Extension | § 6.2 |
| Option exercise / decline | § 6.1 |
| Release / waiver | Article V (§ 5.1 – § 5.2) |
| Renounce (free-agent hold) | § 3.10 |
| Two-way conversion | § 6.1 |
| Draft pick signing | Article VII (§ 7.1 – § 7.3) |
| Void player (no cap hit) | § 5.1 (contract voiding) |
| Stash (keep unsigned draft rights) | § 7.1, § 7.4 |
| Set hard cap level | Article I (§ 1.3 – § 1.4) |

League-wide constants (cap thresholds, roster limits, apron triggers) are in Article I and Article II. `rules/` has been retired — `rulebook/index.html` is the single source of truth.

---

## What this project is

**NBN (Nothing But Net)** is a static website for a fantasy basketball simulation GM league. It hosts owner history stats, team pages, player profiles, standings, draft history, stats leaderboards, and NBNTV Classics (curated playoff highlights).

> **New here, or need the operating picture?** `docs/runbook.md` is one page:
> what lives where, what runs on a timer, the three flows (box score, transaction,
> deploy), how to restore, and what to do when something breaks. This file is the
> per-topic detail; the runbook is the map.

> **The backlog is `BACKLOG.md`** (about 40 KB, 33 items) — read it before proposing new
> work, and update it when work lands. It is far too big to read whole for one
> question: `grep -n '^### ' BACKLOG.md` lists every item with its priority in a
> few hundred tokens, then read only the item that matters.
> **Everything in it is open** — there are no strikethroughs and no done file
> (`BACKLOG_DONE.md` was deleted 2026-08-25). A finished item is deleted; one
> that leaves a real residual is retitled to name what is *left*, not the part
> that finished. Don't reintroduce a struck-through entry: titling items by
> their completed half made the list read as done and open at once.

## This box: read before running anything heavy

The production server (`hostname` is `pallet`) serves nbn.today, dev.nbn.today,
pdc.nbn.today and other sites to real users, and it is small. This covers two
things: **code you write that will run there** (the API, timers, build scripts,
skills), wherever you write it, and **commands run on that machine**. Keep this
section the same in `nbn-today/CLAUDE.md`, `nbn-api/CLAUDE.md` and
`~/.claude/CLAUDE.md`.

- **1 CPU core, 1.9 GB RAM, 2 GB swap.** Never assume more. No `-j N`, no
  worker counts from `nproc` or "cores minus one", no parallel test runners, no
  pools bigger than 1.
- **Headroom is a few hundred MB.** The NBN API alone holds about 1 GB (RAM plus
  swap), and each Claude session takes 200 to 700 MB.
- **The sites are protected, your job is not.** systemd gives `nbn-api` and
  `nginx` top CPU/IO weight, a memory floor and a low OOM score, and runs
  everything in a login or Claude session at low CPU weight. So the OOM killer
  picks your job first.

Writing code that runs there:

- **Budget memory like it's scarce, because it is.** Everything the API keeps
  in memory is held for as long as it runs. Before caching a whole data set,
  measure it: one full copy of the raw box scores as `csv.DictReader` dicts is
  about 250 MB. Keep compact forms (tuples, interned strings, only the columns
  used), bound every cache, and keep one version of a rebuilt index, not two.
- **Stream big files** instead of reading them whole when you only need a pass.
- **One worker, one thread pool.** A script, skill or service that picks a
  worker count picks 1. Never size anything from `nproc`.
- **Timers stay light and spread out.** Don't schedule a new heavy job on the
  hour next to the existing `nbn-*` timers (`systemctl list-timers`).

Running commands there:

- **Run heavy work through `lowprio`** (`~/.local/bin/lowprio <cmd>`): builds,
  test suites, image or asset conversion, backfills, scrapers. It caps the job
  at 700 MB RAM and 256 MB swap at the lowest priority; past the cap the job is
  killed, not the server. Raise it (`LOWPRIO_MEM=1G lowprio …`) only when
  `free -m` shows the room.
- **Check `free -m` first.** If "available" is under 300 MB, don't start a heavy
  job; say so instead.
- **One heavy job at a time.** Don't background a build and start another.
- **A job that hits the cap needs to get lighter** (stream, batch, one worker),
  not a bigger cap.
- **Never stop, restart or reconfigure** `nbn-api`, `nginx` or another site's
  service to free memory.
- `nbn-box-health.timer` (`nbn-api/check_box_health.py`) posts to #nbn-today
  when RAM runs short or the API slows down.

## Dev and live — which checkout am I in?

**Both repos are paired. Four checkouts, not two** — and the `-dev` half of each
is where you edit:

| | Path | What it is |
|---|---|---|
| **site, live** | `/home/skim/projects/nbn-today` | what `nbn.today` serves — `/var/www/nbn.today` is a symlink to it |
| **site, dev** | `/home/skim/projects/nbn-today-dev` | what `https://dev.nbn.today` serves, behind basic auth (user `dev`, `/etc/nginx/.htpasswd-dev`) |
| **api, live** | `/home/skim/projects/nbn-api` | what the `nbn-api` service runs. **Every other mention of `nbn-api` in this file is this path**, because ops (`stats_build`, `venv/`) genuinely means live — that is not permission to edit here |
| **api, dev** | `/home/skim/projects/nbn-api-dev` | where API edits go. Has its own `venv/`, so the test suites run here |

The api pair is the one that gets missed, and predictably: this file names the
live api path a dozen times for ops and named the dev one nowhere, so a session
that has only read this file has only ever been handed the live path. Editing
there is less immediately destructive than on the site (uvicorn holds the old
modules until a restart, so an edit does not deploy itself) — but the tree is
then dirty, and `nbn-api/deploy.sh` refuses to deploy a dirty tree, so the
change cannot ship from where it was made.

**Edit in `-dev`, run ops in live.** Saving a file in the live checkout deploys
it, instantly and with no review step; that is the whole reason the dev copy
exists. Ops commands (`build/build.sh`, `systemctl`, the manual build trigger)
genuinely mean live and stay pointed there.

The loop:

```bash
cd ~/projects/nbn-today-dev && git checkout -b some-change   # edit, commit
git push -u origin some-change && git checkout main && git merge some-change && git push
cd ~/projects/nbn-today && ./deploy.sh                       # ff-only, refuses a dirty tree
```

Same loop for the API, with `nbn-api-dev` / `nbn-api` in place of the two site
paths. Its `deploy.sh` pulls **and restarts the service** — the restart is the
deploy, since uvicorn holds the old modules until then. When a change spans both
repos, **the API ships first**: the site is what would otherwise be live against
a server that has not learned the new rule yet.

`deploy.sh` prints the rollback command (`git reset --hard <sha>`) on every
deploy. It rolls back **code only** — data lives in `/var/lib/nothing-but-stats`
and is recovered from its own git repo (`docs/dev-deploy-setup-spec.md`).

Two things about dev that bite if you forget them:

- **`dev.nbn.today` proxies `/api` to the LIVE API.** There is no second
  instance, deliberately (the spec's "No second API instance" explains why: a
  dev instance posts real Discord embeds and relays real `#roster-log`
  messages). Reads are safe. **Any write path exercised from a dev page is a
  real write** — `POST /api/transactions` applies for real when its checks
  pass. Dev is for read-path and UI work.
- **Never run `build/build.sh` from dev against the live data dir.** Point it
  at a scratch copy, which is safe by construction because both the build's
  inputs and its outputs follow the same variable:

  ```bash
  rsync -a --delete --exclude=.git --exclude=derived/ \
        /var/lib/nothing-but-stats/ ~/nbs-scratch/
  NBS_DATA_DIR=~/nbs-scratch bash build/build.sh
  ```

  **This redirects the build only.** `nbn-api/routers/constants.py` hardcodes
  `DATA_DIR`, so API code run with `NBS_DATA_DIR=scratch` still writes live
  (it did once, 2026-10-02). Test API write paths by patching the module's
  loaders, as `nbn-api/tests/test_qualifying_offers.py` does.

  The backup repo's git dir is `/var/lib/nbs-backup.git`, outside the data
  directory, so there is no `.git` to copy today. `--exclude=.git` stays anyway,
  so that a scratch copy can never end up committing to the backup repo.

The pre-commit hook is tracked at `build/hooks/pre-commit` (`.git/hooks` is not
cloned, so a fresh checkout would silently lose the smoke test and the version
bump). A new clone needs one command: `git config core.hooksPath build/hooks`.

> **The Shiny app is orphaned, not deleted.** `~/projects/nothing-but-stats` and
> `/srv/shiny/nothing-but-stats` are retired. Nothing is removed from them and
> nothing accommodates them either — they are not a consumer of this repo's data
> any more. Don't restore a symlink or a write path on their behalf.

## Running locally

No build step — but **a local static server is only good for pages with no
data** (the rulebook, say). The CSVs aren't in the docroot (nginx serves them
from `$NBS_DATA_DIR/public`) and `http.server` doesn't proxy `/api`, so every
data fetch 404s and the page renders empty.

**Without server access**, `python3 build/preview_live.py` serves this checkout
on `http://127.0.0.1:8099` and fetches everything it doesn't have (the CSVs,
`/api`) from `https://nbn.today`. Sign in with a member token. It refuses writes
unless you pass `--allow-writes`, because the API behind it is live.

**Use `dev.nbn.today`**, which serves this checkout's working tree with the
real data and API behind it. It also covers anything authenticated: the session
cookie is `Domain=.nbn.today; Secure`, so a `localhost` origin can never carry
it — `/committees/pdc`, `/free-agency` and team edit mode are untestable from it. On
`dev.nbn.today` they work: a session minted on `nbn.today` is sent there
automatically and the API accepts it (verified 2026-08-19).

> If you ever add another authenticated vhost under this domain, give it
> `location ^~ /.well-known/acme-challenge/ { auth_basic off; }`. A host-wide
> `auth_basic` 401s the ACME challenge, and the failure shows up as an expired
> certificate two months later rather than as anything at setup time.

## Data files and the stats pipeline

**This repo contains no data files.** Everything lives in `/var/lib/nothing-but-stats/` (NBS_DATA_DIR): the build writes `derived/`, the API writes league state at the root, `build/link-public.sh` publishes both as `public/`, and nginx serves that. The raw box scores (`allstats-*.csv`) are the only files that can't be rebuilt, and are append-only by contract: correct a row with `nbn-api/edit_allstats.py`, never `allow_shrink`. Deploy the API before the site: `build.sh` runs `stats_build` out of it.

**`docs/data-files.md`** has every file, who writes it and who reads it, every `/api` endpoint a page reads, the build directory, how to trigger a build, and the season rollover. Read it before changing what a page fetches.

## Common task lookup

Where to start for a change. Each row names the files and symbols to open; **the full row, with the caveats and the doc to read first, is in `docs/task-lookup.md`** (grep it for the task). Symbols, not line numbers: `grep` finds a symbol in one step.

| Task | Start here |
|---|---|
| Change the dropdown menu every `<select>` opens, or make a filter multi-select | `ui-select.js`, `nav.js`, `css/components.css` |
| Change how pages look: widths, headers, tabs, tables, buttons, type, colours, team colours, player-name display | `css/components.css`, `css/theme.css`, `names.js` |
| Change what loads before first paint (the stylesheet and font preloads), or the caching headers | `theme-boot.js`, `build/head_preloads.py`, `docs/runbook.md` |
| Add/change a roster table column | `buildRosterTable` in `teams/team.js` |
| Add/change a draft picks column | `buildPicksTable` in `teams/team.js` |
| Add/change a season history column | `makeSeasonRenderCell` in `teams/team.js` |
| Add/change an owners table column | `COLS` in `owners/index.html` |
| Change team page layout or HTML structure (hero, section bar, owner panel, season grid) | `renderSeasonTop` in `teams/team.js`, `docs/pages.md` § Team page layout |
| Change cap/MLE/exception display | `renderHardCapBanner`, `renderExceptionsSection` in `teams/team.js` |
| Change the Cap Health card (standing vs the cap/aprons and § 2.1 roster limits) | `cap-health.js`, `teams/team.js`, `tests/cap-health.test.js` |
| Change the league-wide compliance board | `committees/rosters/index.html`, `cap-health.js`, `tests/frontend/run.js` |
| Change the rosters committee dashboard, or the cap-sheet / picks / data-quality reconciliation | `committees/rosters/index.html`, `/data/poopoo.json`, `build/poopoo.py` |
| Change the stats committee dashboard (the day-by-day box score worklist, screenshot upload, the day's VOD link, build health) | `committees/stats/index.html`, `nbn-api/routers/boxscore_shots.py`, `tests/frontend/run.js` |
| Change the committees index | `committees/index.html`, `cap-health.js` |
| Change edit mode behavior | `enterEditMode`, `setupEditable` in `teams/team.js` |
| Change the Roster Settings section (jersey #, secondary position, player minutes) | `setupTeamSettingsTab` in `teams/team.js`, `nbn-api/routers/coaching_settings.py`, `docs/pages.md` |
| Change the archetype radar (axes, archetypes, tiers) on a player or team page | `radar.js`, `players/index.html`, `teams/team.js` |
| Change the single-game highs page (categories, feats, floors, filters) | `nbn-api/routers/game_highs.py`, `tests/test_game_highs.py`, `stats/highs/index.html` |
| Change advanced stats (pace, ORtg/DRtg, Four Factors, USG%, AST%, REB%, STL%, BLK%, Win Shares, BPM, VORP) | `nbn-api/stats_build/advanced.py`, `player_value.py`, `tests/test_player_value.py` |
| Change the career leaders page (categories, per-game/percentage floors, filters) | `stats/totals/index.html`, `redirects.js` |
| Change the IRL tab on `/nbnfl` or a team page (real-world game logs and injury news for the roster), or add a roster or sport | `irl-feed.js`, `nbnfl/index.html`, `teams/team.js` |
| Add/edit a NBNTV blurb | `BLURBS` in `nbntv-classics/index.html` |
| Change a page's Open Graph tags (the card Discord shows for a pasted link) | `PAGES` in `build/og_tags.py`, `build/og_cards.py`, `/news/view/` |
| Change the calendar page (public, read-only game list + fixture/vesting events) | `calendar/index.html`, `redirects.js`, `docs/pages.md` |
| Change the streamer dashboard (My games, game claims, the stream flag, the day mark-done control, the Planner, the Coaching Settings entry queue, or the Roster Moves queue of transactions to make in 2K) | `committees/stream/index.html`, `nbn-api/routers/roster_entry.py`, `nbn-api/routers/stream_planner.py` |
| Change the injury report (the `/injuries` page, the 🚑 upload, `/parse-injuries`, the `#injury-report` post) | `injuries/index.html`, `players/index.html`, `players/injuries/index.html` |
| Change the coaching-settings field/option schema, or the Coaching tab on team pages (which also holds the Roster Settings section — see above) | `coaching-config.js`, `nbn-api/routers/coaching_settings.py`, `docs/pages.md` |
| Change the game preview page (form, head-to-head, projected starters, milestones for one game) | `preview/index.html`, `index.html`, `teams/lineup.js` |
| Change the award race (`/awards/race`: the MVP / DPOY / ROTY / 6MOY / MIP formula ladders) | `award-race.js`, `tests/award-race.test.js`, `awards/race/index.html` |
| Change the Front Office Ledger (fake franchise attendance, P&L and valuation) | `nbn-api/stats_build/finances.py`, `tests/test_finances.py`, `build.sh` |
| Change the franchise share prices (the Market tab `/finances` opens on: fair value, its daily moves panel and Market Summary) | `finances/market.js`, `finances/daily-moves.js`, `finances/market-summary.js` |
| Change who-started-each-game (the GS column on player pages, 6MOY) | `nbn-api/routers/game_starters.py`, `players/index.html` |
| Change a team season recap (`/recap/?team=&season=`) | `recap/index.html`, `nbn-api/routers/og.py` |
| Change the homepage Tonight graphic (the headline poster and game rail) or the 11am Discord card | `tonight-hero.js`, `css/tonight-hero.css`, `index.html` |
| Change the your-team callout (your team and your players tinted wherever they appear, the "Highlight my team" choice: team colour, a swatch, a star, or off) | `my-team.js`, `nav.js`, `/teams/ABB/` |
| Add a homepage card, or change what the homepage asks for first | `index.html`, `docs/runbook.md` |
| Change the homepage Power Rankings card | `power-rank.js`, `tests/power-rank.test.js`, `routers/playoff_odds.py` |
| Change the homepage On This Day card | `nbn-api/routers/on_this_day.py`, `index.html` |
| Change NBN Twitter (the homepage card of made-up posts on each game day: the cast, the voices, how many) | `.claude/commands/parse-boxscores.md`, `build/check_tweets.py`, `nbn-api/routers/tweets.py` |
| Change career milestones (the homepage Milestone Watch card, the preview's milestones) | `milestones.js` |
| Change how a transaction reads in the homepage feed ("MIL sign Mike Conley") | `feed-types.js`, `tests/feed-headline.test.js` |
| Change a player's Feats & Streaks or Most Games Together | `nbn-api/routers/player_insights.py`, `players/index.html` |
| Change Pick'em (the daily six-man lineup game: slots, eligibility, scoring, lock, standings, prizes) | `nbn-api/routers/pickem.py`, `tests/test_pickem.py`, `pickem-{season}.json` |
| Change what counts as "tonight" (a night's stream running past midnight) | `nbn-api/routers/game_day.py`, `tests/test_game_day.py`, `league-time.js` |
| Change playoff odds (the model, the format, how often it runs) | `nbn-api/routers/playoff_odds.py`, `snapshot_playoff_odds.py`, `playoff-odds.json` |
| Change standings display | `standings/index.html`, `clinch.js`, `tests/clinch.test.js` |
| Change the NBA Cup standings (the NBA Cup tab on `/standings`, the homepage card) | `nba-cup.js`, `tests/nba-cup.test.js`, `standings/index.html` |
| Change player index display | `players/index.html` |
| Change a player's 2K ratings, contract or history page, or the profile tiles that link to them | `players/ratings/`, `players/contract/`, `players/history/` |
| Change HOF display | `hof/index.html` |
| Change H2H display | `h2h/index.html` |
| Change a Frivolities tab, incl. Trade Retros | `frivolities/index.html`, `/trade-retros/`, `redirects.js` |
| Add a retired jersey | `RETIRED_JERSEYS` in `teams/team.js` |
| Change the Franchise Records cards | `teams/team.js`, `nbn-api/stats_build/pipeline.py` |
| Change the trade builder (team/asset selection, exceptions/TPE, sign-and-trade, releases after the trade, pick swaps and new protections (`swap` asset; a team must hold its pick outright), removing or lowering a protection by sending your band (`nbn-api/docs/picks.md` § "Trading a protection away"), live checks, .xlsx export, Google Sheets publish, Submit to TRC) | `trade-builder.js`, `transaction-sim/index.html`, `transaction-sim/xlsx.js` |
| Change a rule that turns on at opening night, the trade deadline or the draft (§ 2.1's in-season 15, § 6.3's windows, § 4.5's trade limit) | `nbn-api/routers/season_calendar.py`, `schedule-{season}.json`, `docs/api-validation-notes.md` |
| Add a transaction type to the simulator | `setMode`, `runSignCheck` in `transaction-sim/index.html`, `nbn-api/routers/transactions.py`, `trade-builder.js` |
| Change the TRC committee dashboard or a trade's own page (trade review, consent tracking, ballots, reject/finalize) | `committees/trc/index.html`, `trades/trade-request.js`, `nbn-api/routers/trade_requests.py` |
| Change the contract shorthand (`2+1 PO, $150M`) or the cap-hold vocabulary | `contract.js`, `team.js`, `nbn-api/routers/discord_notify.py` |
| Change the office's contract entry form (salary rows, EAPS, live signing rubric) | `addSalaryRow`, `collectSalaries` in `transactions/index.html` |
| Change the rookie scale table, or how a pick signing is prefilled | `build/load_rookie_scale.py`, `cap-settings/index.html`, `redirects.js` |
| Change the ratings-changes page (OVR/position/attribute/badge diffs from the 2K scrape) | `ratings-changes/index.html`, `nbn-api/routers/players.py`, `docs/pages.md` |
| Add/change an owner's per-player roster move | `makeRosterMoveActions`, `openMovesMenu` in `teams/team.js`, `docs/roster-moves.md` |
| Verify build output still matches what pages read | `build/smoke_test.py`, `build.sh` |
| Change a rulebook 🔒/👁 enforcement badge | `nbn-api/rulebook_coverage.py`, `routers/transactions.py`, `waivers.py` |
| Verify a page still *renders* (not just that its columns exist) | `tests/frontend/run.js` (CI runs it), `tests/frontend/README.md` |
| Add a league office memo | `MEMOS` in `memos/`, `memos/memos.js`, `/memos/` |
| Change the suggestions board or its comment threads | `suggestions/index.html`, `nbn-api/routers/suggestions.py`, `docs/members-and-rewards.md` |
| Write an NBN Today article (or anything that needs league history) | `lore`, `sagas` |
| Change power rankings — the ballot, the consensus math, blurbs | `nbn-api/routers/news_rankings.py`, `tests/test_news_rankings.py`, `nbn-api/routers/news.py` |
| Change futures markets (the Futures tab on `/bet`: buying/selling outcome shares, the market maker, settlement) | `nbn-api/routers/markets.py`, `tests/test_markets.py`, `bet/futures.js` |
| Change qualifying offers (§ 3.1: extend/withdraw from the Moves menu, the amount, the July 1 lapse, a QO winning the PDC ballot) | `_validate_qualifying_offer`, `_apply_accept_qo` in `nbn-api/routers/transactions.py`, `teams/team.js`, `docs/qualifying-offers.md` |
| Change the team-facing FA offer form (⋯ menu, contract editor, submit confirm) | `free-agency/index.html`, `docs/fa-offers-pipeline.md` |
| Move or retire a page (keep old links working) | `TABLE` in `redirects.js`, `404.html`, `tests/redirects.test.js` |
| Add a page to the site nav (sidebar + Ctrl+K search), or change the sidebar | `NAV_SECTIONS` in `nav.js`, `hub.js`, `build/make_nav_icons.py` |
| Add a theme, or change what one costs | `build/make_team_theme.py`, `css/theme.css`, `nbn-api/routers/themes.py` |
| Change the PDC committee dashboard (FA review, the 1,000-ball ballot, remand/void, finalize/declare-winner/unlock, the agent queue, head controls) | `committees/pdc/index.html`, `nbn-api/routers/free_agency.py`, `docs/pdc-free-agency-spec.md` |

## Architecture

No framework or build step. Every page is a self-contained HTML file with inline `<style>` and `<script>`. Shared modules at the repo root (and `teams/team.js`, `teams/lineup.js`) break the pattern; the main ones are described below, and the common task lookup table names the rest.

### Shared scripts

**`teams/team.js`** — loaded by every team page (`teams/{ABB}/index.html`). It:
- Defines `TEAMS` (abbr → full name) and `RETIRED_JERSEYS` (per-team retired number data)
- Infers the team abbreviation from `location.pathname`
- Injects all CSS and HTML into `document.body`
- Fetches everything the page needs in one `Promise.allSettled` (~24 sources, mostly `/api/*`; the roster CSV is the only per-team file)
- Exports reusable helpers: `buildTable(cols, rows, sortField, sortDir, renderCell)`, `buildRosterTable`, `buildPicksTable`, `buildEditableGrid`, `setupEditable`
- Handles **edit mode** for the roster and picks sections (see `docs/pages.md` § Team page edit mode)

> **Never edit `teams/{ABB}/index.html` directly.** All 30 files are identical 11-line shells (`<script src="../team.js"></script>`). All team page logic lives in `team.js`.

**`contract.js`** (repo root) — the contract vocabulary and shorthand: `CONTRACT_HOLD_TYPES` (the one list of what a `cap_holds` year can be), `CONTRACT_TAGS`, `isFaHold`, `parseCapHoldMap`, and `summarizeContract`, which renders `2+1 PO, $150M`. Loaded by team pages (dynamically, via `contractReady`), `/committees/pdc` (`<script src="/contract.js">`) and `/transactions`.

Two things it settles, both of which had already gone wrong once: a **trailing UFA/RFA line is the hold the deal rolls into, not a contract year**, so it ends the deal rather than adding a year and inflating the total; and `summarizeContract` with **no `season`** summarizes the whole deal from its own first year (what a ledger row wants — the contract as signed), while passing a season gives the roster reading (what's left from here).

**`teams/lineup.js`** — `DEPTH_SLOTS` + `computeStartingFive`, the best legal one-player-per-slot PG→C lineup. Extracted from `team.js` so pages other than a team page can project a lineup (`team.js` injects a whole page into `document.body` on load, so nothing can import from it). It reads exactly two fields off each row — `_posList` and `OVR` — so any caller producing objects with those can use it. `rotationFive` comes first wherever a five is shown (team page Depth mode, `/preview`, the homepage slate's click-to-open fives): the team's saved order from the public `GET /api/rotations`, with `computeStartingFive` only as the fallback when a team has none.

> Because the team shells load only `team.js`, shared modules are pulled in from `team.js` itself via an injected `<script>` + an awaited promise (`ratingsPopupReady`, `lineupReady`). Add new shared modules the same way rather than touching the 30 shells.

### Page internals

The owners page's `COLS` shape, special cell rendering, the NBNTV `BLURBS` keys and team-page edit mode are in `docs/pages.md`.

## API backend

FastAPI app running as a systemd service on port 8001, proxied through nginx. The service runs the live checkout, `/home/skim/projects/nbn-api`; **edit in `/home/skim/projects/nbn-api-dev`** (see "Dev and live" above). Entry point: `main.py`. Reads/writes CSVs in `/var/lib/nothing-but-stats/`.

### Subsystem detail lives in `docs/` — read it before changing that subsystem

The reasoning behind each subsystem below — what broke once, what the shape is
guarding against, what must never be reintroduced — was moved out of this file
on 2026-08-24. It is **not optional** reading: it is exactly the context that
stops a change from reinstating a bug that has already happened. It is *on
demand* reading, because it only applies once you know which subsystem you are
in.

| Touching this | Read first |
|---|---|
| A `/api/validate/*` endpoint, the § 7.1 rookie scale, § 3.8 Bird tenure, or § 3.15 offer sheets | `docs/api-validation-notes.md` |
| RFA status or a qualifying offer (§ 3.1) | `docs/qualifying-offers.md` |
| Any path between the API and Discord — transaction embeds, PDC FA feeds, the `#roster-log` mirror, tradeblock posts | `docs/discord-integrations.md` |
| The team-facing FA offer form, the § 4.7 agent stage, or § 4.3b voiding | `docs/fa-offers-pipeline.md` |
| A theme, what one costs, or `css/theme.css` | `docs/themes.md` |
| Members, the suggestions board, or NB¥ achievement awards | `docs/members-and-rewards.md` |
| Anything that moves NB¥ — balances, bets, buying a stream, donations/Twitch credit, or switching a paused earner back on. Every balance change goes through `nbn-api/routers/wallet.py`; never write `member-balances.json` directly. The public view is `/nbyen` | `docs/nbyen-economy.md` |
| The per-player Moves menu on team pages | `docs/roster-moves.md` |
| How pages look: components, tokens, fonts, team colours | `docs/design-system.md` |
| A page whose common-task row ends in `docs/pages.md § …` — the committee dashboards, Roster Settings, coaching settings, the calendar, power rankings, owners `COLS`, NBNTV blurbs, team edit mode | `docs/pages.md` |
| The daily cap/apron snapshot, or § 7.3's four-year lookback | `nbn-api/docs/ledger-and-audit.md` § "Cap history" |
| The audit log for writes that bypass the transaction ledger | `nbn-api/docs/ledger-and-audit.md` § "The edit log" |

What stays in this file is what you need *before* you know which subsystem you
are in: roles, endpoint tables, the data contract, the data model.

> **Keep it that way.** This file is loaded in full at the start of every
> session; `docs/` is not. It grew to 99 KB twice by appending each feature's
> history here; on 2026-11-16 it went back to about 50 KB, with the full task
> table in `docs/task-lookup.md`, the data files in `docs/data-files.md` and
> the bio fields in `docs/data-model.md`. A change that needs a paragraph of
> reasoning puts it in the relevant `docs/` file (`docs/pages.md` for a single
> page, and the full row in `docs/task-lookup.md`); this file gets at most a
> short row naming where to edit.

### Roles

| Role | Permissions |
|---|---|
| `rosters` | `PUT /api/roster/{team}`, `PUT`/`DELETE /api/picks/{year}/{rnd}/{orig}`, `POST /api/picks/structure/preview`/`apply` (a pick's bands or swaps, through the proof in `nbn-api/picks_conveyance/restructure.py`; `nbn-api/docs/picks.md` § "Correcting a pick's structure"), `PUT /api/irl/ids/{sport}/{slug}` (an NBN player's ESPN id, for the IRL tab) |
| `bod` | Everything `rosters` can do + early award access + edit member tenures |
| `admin` | Everything + member management (`GET/POST/PATCH/DELETE /api/members`) |
| `streamer` | `POST`/`DELETE /api/schedule/{game_id}/streamer` — claim a game on `/committees/stream` as one they will stream. **One streamer per game**, so the field is a single name and not a list (a list capped at one is the shape that drifts); a second claimant gets a 409 naming who holds it. Neither endpoint takes a member argument — the claim identifies its own holder — so the role can only ever write its holder's own name, which is why it needs no board standing. Dropping someone else's is `bod`. Assigning a named streamer is `admin` only: `PUT /api/schedule/{game_id}/streamer` (one game) and `PUT /api/schedule/days/{date}/streamer` (every game that date), body `{name}`, which replace an existing claim. Also `POST`/`DELETE /api/schedule/{game_id}/stream` — mark or clear the separate `stream` flag (whether the game itself is a stream) — and `POST /api/schedule/stream-batch`, the Planner's Save all: one pick per date, all or nothing. That flag has no holder: any `streamer` can set or clear it on any game, whether or not that game has a claimed streamer. And `POST /api/schedule/{game_id}/stream-request/accept` / `decline` — answer a member's request to buy a stream; accepting is what spends their NB¥ (`docs/nbyen-economy.md` § 5) |
| `fac`, `fac_head`, `agent`, `poext`, `poext_head` | The Player Decision Committee's roles — see `docs/pdc-free-agency-spec.md` and the PDC row in the common-task table above |
| `trc` | `PUT /api/trade-requests/{id}/ballot` — cast an approve/reject ballot (with a required note) on a trade a request's parties have all consented to. Not waved through by `admin` — a ballot is a judgment call, not an administrative one, unlike every other permission in this table |
| `trc_head` | Everything `trc` can do + `POST /api/trade-requests/{id}/reject` and `POST /api/trade-requests/{id}/finalize` — the latter is the one action that actually executes the trade (`PUT /api/roster/*`, `PUT`/`DELETE /api/picks/*`, and a real `POST /api/transactions`-shaped ledger entry, via `apply_trade`). `docs/trc-trade-pipeline.md` |
| `updates` | `PUT /api/ratings-changes/updated` — tick (or untick) one change on `/ratings-changes` as entered into the league's 2K roster file. Stored in `ratings-updated.json` keyed `slug|date`, returned as `updated: {by, at}` on each `GET /api/ratings-changes` entry. Grants nothing else |
| `atl`, `bkn`, `bos`, `cha`, `chi`, `cle`, `dal`, `den`, `det`, `gsw`, `hou`, `ind`, `lac`, `lal`, `mem`, `mia`, `mil`, `min`, `nop`, `nyk`, `okc`, `orl`, `phi`, `phx`, `por`, `sac`, `sas`, `tor`, `uta`, `was` | `PUT /api/trading-block/{team}` for their own team only. Also implicitly required (one of, not held on the member) to propose a `POST /api/trade-requests` trade naming that team, and to consent to or withdraw one (any front-office member, not just the owner) |

`admin` implicitly satisfies any role check.

Valid roles are enforced at member creation time — `POST /api/members` rejects any unrecognized role name.

### Sign-in: the token, and the `.nbn.today` session cookie

The member token lives in `localStorage` as `nbn_token`, which is **per-origin** — so a member signed in on `nbn.today` is a stranger on `pdc.nbn.today` (this is why `news.nbn.today` was retired into `nbn.today/news` rather than solved). `token-badge.js` runs on every page and, when it has a working token and no session yet, calls `POST /api/auth/session` to mint an **opaque** session id delivered as `nbn_session=…; Domain=.nbn.today; Secure; HttpOnly; SameSite=Lax; Max-Age=30d`. Every subdomain sends it automatically, so signing in once anywhere covers all of them.

The token itself never enters the cookie, which is what makes a session revocable — rotating a token, revoking it, or deleting the member drops every session that member had. The cookie is honoured on a **narrow allowlist only** (`GET /api/auth/me` and `/api/fa/*`); every real write path still requires the `Authorization` header. Full rationale and the mechanics live in `nbn-api/docs/members-and-money.md` § "Browser sessions"; do not widen the allowlist without reading it.

`nbn_session_live` is a companion cookie that is deliberately readable by page JS and holds nothing but `1` — it exists only so `token-badge.js` can tell it already has a session (the real one is `HttpOnly`), and without it every page load would mint another session row.

### Trading Block endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/trading-block` | Public | Returns `{ "ATL": {players: [{player, notes, added_at, snoozed_until?}], picks: [...]}, … }` for all 30 teams |
| `PUT /api/trading-block/{team}` | Team role or admin | Replaces that team's block; body is `{players: [{player, notes}], picks}`. `added_at` and `snoozed_until` are server-set and kept across saves |

Data stored in `/var/lib/nothing-but-stats/trading-block.json`. The page at `tradeblock/index.html` fetches this API plus the relevant teams' roster CSVs (for team membership) and `player-bios.json`/`GET /api/ovr/current` to join player metadata (POS, OVR, AGE, salary columns).

The whole-block `PUT` also takes an unpersisted `notify_discord` flag — see `docs/discord-integrations.md`. A player listed 7+ days gets his team a weekly inbox nudge with Remove / Still available (a 2-week snooze — no permanent keep, on purpose) — `nbn-api/docs/site-features.md` § "Trading block nudge".

### Validation endpoints (Transaction Simulator)

`/transaction-sim/` models a transaction and reports the legal checks against
it. Every `/api/validate/*` endpoint below stays read-only and unauthenticated,
exactly as documented here. Trade mode's **Submit to TRC** button is a
separate, authenticated write to `POST /api/trade-requests`
(`docs/trc-trade-pipeline.md`), not a hole in these.

| Endpoint | Validator | Fact sheet |
|---|---|---|
| `POST /api/validate/trade` | `_validate_trade` | `_trade_fact_sheet` |
| `POST /api/validate/sign` | `_validate_sign` | `_signing_fact_sheet` |
| `POST /api/validate/offer_sheet` | `_validate_offer_sheet` | `_signing_fact_sheet` |
| `POST /api/validate/offer_sheet_decision` | `_validate_offer_sheet_decision` | inline |
| `POST /api/validate/renounce` | `_validate_renounce` | `_renounce_fact_sheet` |
| `POST /api/validate/sign_pick` | `_validate_sign_pick` | `_signing_fact_sheet` + `rookie_scale` |
| `POST /api/validate/convert_twoway` | `_validate_convert_twoway` | `_signing_fact_sheet` |
| `POST /api/validate/extension` | `_validate_extension` | `_extension_fact_sheet` |
| `POST /api/validate/stash` | `_validate_stash` | none |
| `POST /api/validate/qualifying_offer` | `_validate_qualifying_offer` | `_qualifying_offer_fact_sheet` |

All of them are public (no auth), take the same body shape as the corresponding
`details` in `POST /api/transactions`, and return
`{legal, checks[], fact_sheet}`. They share their validators with the submit
path, so a "legal" verdict here is what the office accepts — **but they never
write**: no roster, bio, team-state or ledger change, and they don't take the
API lock. Note that `POST /api/transactions` *applies for real* when checks
pass; it is not a dry run, which is exactly why these exist separately.

Key invariant: **the fact sheet must never do its own cap math.** Both fact
sheets are built from the same helpers the validators use
(`_signee_existing_hold`, `_resolve_mle_bucket`, `_compute_team_salary*`,
`_trade_flows`), so the sim can't show a team room the validator didn't credit
it with. When adding a check, reuse the helper rather than recomputing.

Coverage is uneven and the UI says so: `sign`/`offer_sheet`/`offer_sheet_decision`/
`trade`/`renounce`/`sign_pick`/`extension`/`stash`/`qualifying_offer` have real validators, while `release`, `option` and `pick` are stubs
returning `[]` — those types are deliberately **not** offered in the simulator, since a
verdict off zero checks is worse than no verdict. § 3.7 (DPE) remains unmodeled.
(`renounce` is validated but still isn't wired into the simulator UI; its
validator exists to serve the roster page's confirm dialog. Adding it there is
now just UI work.)

How each type got its validator, and the two bugs the endpoint layer hid before
`tests/test_validate_endpoints.py` existed, are in `docs/api-validation-notes.md`.

### Service management

```bash
systemctl status nbn-api          # check status
sudo systemctl restart nbn-api    # restart
journalctl -u nbn-api -f          # live logs
journalctl -u nbn-api -n 50       # last 50 log lines
```

### Roster CSV columns

| Column | Description | Example |
|---|---|---|
| `SLUG` | Player slug (key into player-bios.json) | `barnes-scottie` |

All other player data (name, pos, age, type, cap holds, salaries) lives in `player-bios.json` and is joined at render time. **OVR is not a roster CSV column** — it lives only in `ovr-history.json`, joined via `GET /api/ovr/current`. Don't reintroduce an OVR column: the old one went unmaintained and drifted to empty for every player.

**Legacy format:** `PLAYER, POS, AGE, OVR, TYPE, CAP_HOLDS, 25-26, …`. No roster file uses it (all 30 are `SLUG`-only), and since 2026-11-16 no page reads it either: the fallback paths in `team.js` and `tradeblock` are gone.

## Data model

The core entities and how they relate.

### Player

A player is the stable identity unit across the whole site. The canonical store is `player-bios.json`, keyed by **slug** (`"curry-stephen"`). Endpoints: `GET /api/players` (public), `POST /api/players` (admin, creates), `PUT /api/players/{slug}` (rosters role, upserts).

#### Slug

The slug is the permanent primary key for a player — it ties together the bio, roster entries, OVR history, stats rows, and awards. It is set once at creation (`POST /api/players`) and **never changes**. There is no rename endpoint; changing a slug would orphan every other reference to that player across all CSVs and history files.

#### Fields

Every bio field (set once, updated occasionally, changed by transactions) is in **`docs/data-model.md`**. Three things to know without opening it: `pos` is derived (never write it), read positions through `_primary_pos` / `primaryPos` and `effective_secondary` / `effectiveSecondary`, and parse every salary through `_parse_dollar`.

#### OVR (not in player-bios.json)

OVR is **not** stored on the player bio. It lives in a separate append-only log at `ovr-history.json` (served via `GET /api/ovr`), keyed by slug, as an array of `{date, ovr}` entries. The current rating is always the last entry. Updated via `PUT /api/ovr/{slug}` whenever ratings are refreshed (valid range 50–99).

The roster CSV does **not** carry OVR (see "Roster CSV columns" above).

#### Player types

| Value | Meaning |
|---|---|
| `"player"` | Standard roster player |
| `"two-way"` | Two-way contract; salary/cap rules differ |
| `"draft-rights"` | Unsigned draft rights held on a roster — a cap hold, not a player. Exempt from the roster count |
| `"dead"` | **Legacy.** Nothing writes it any more (27 bios still have it); dead cap lives in `{abbr}-deadcap.csv`, since a player can carry dead money on one team while active on another. Still read as roster-exempt |
| `""` | Unset / not yet classified |

#### Cap holds

`cap_holds` is a JSON object keyed by season string, e.g. `{"27-28": "PLAYER_OPT", "28-29": "UFA"}`. It tags a season in `salaries`; it is not a separate list of seasons. An option or `NON_GTD` tag marks a real contract year as conditional. A `UFA`/`RFA` tag marks the season **after** the deal ends, and that season's `salaries` entry is the hold amount, not a salary. So `{"28-29": "UFA"}` with `"28-29": "$13,193,576"` is a deal that ends in 27-28 plus a $13.2M hold. `contract.js` reads it that way (a trailing UFA/RFA line ends the deal), and `_compute_team_salary_ex_holds` drops those seasons for apron and hard-cap math.

| Type | Meaning |
|---|---|
| `UFA` | Unrestricted free agent |
| `RFA` | Restricted free agent |
| `PLAYER_OPT` | Player holds option to extend |
| `TEAM_OPT` | Team holds option to extend |
| `NON_GTD` | Non-guaranteed salary year (team can waive without full cap hit) |

### Draft pick — how to read one (know this, don't look it up)

A pick is identified by `(year, round, orig)` — **`orig` is immutable identity only, "whose draft slot this numerically is," never a current party.** A pick with `orig: "LAL"` does not mean LAL has any live stake in it — they may have fully traded it away years ago; only the numeric-slot label persists. This is the single most common misread: seeing a team name in `orig` and treating it as an active participant. It isn't. Whether it's still theirs is a completely separate question, answered by `owner`/`leaves` below.

Real ownership is a resolvable tree, not one mutable field (this replaced a flat `OWNER`-column model specifically because that model silently lost intermediate owners in an A→B→C chain and had no way to express contingent/multi-way outcomes — full rationale in `nbn-api/docs/picks-conveyance.md` if ever needed, but the model itself is summarized completely below; that doc's day-to-day currency is not to be trusted — it was written 2026-07-19 and has drifted since). `GET /api/picks` / `GET /api/picks/{team}` project that tree down to a flat response per pick:

- **`owner`** — convenience view of the resolved tree: a single team string when fully settled, `"?"` when genuinely undetermined with no named candidates, or `"TEAM1|TEAM2"` pipe-joined when there are exactly N live candidates and nothing left to distinguish them.
- **`leaves`** — the actual authoritative structure whenever a pick is contingent (protected / swap / ladder): an array of `{team, description, txn_ids}`. **The set of teams appearing in `leaves` is the complete, exact set of real parties — nothing else in the response names one.** `description` states each team's role in plain language: `"swap priority (better pick)"` / `"(worse pick)"` for a swap, `"protected band 1-4"` for a protection tier. Read `description`, don't infer a role from position or ordering.
- **`group_id`** — set when a pick is one physical half of a 2-way (or more) swap. Both picks in the pair share it. **This does not make it a 3-party situation just because two separate `(year, round, orig)` rows are involved** — the real party count is however many distinct teams appear across both rows' `leaves`, which for a plain "better-of-these-two" swap is exactly 2 (whoever gets the better, whoever gets the worse), regardless of how many origs are on the two picks being compared. A team is guaranteed to end up with *exactly one* physical pick out of the group — never zero, never more than one — once draft positions are known. **Consequently, every row sharing a `group_id` is the SAME claim, not independent ones** — the rows are backed by one shared swap-group priority list / binary-chain node (`registry.handle_retrade` in `picks_conveyance`), so trading away any one member row conveys the team's whole shared interest and removes them from every other row in the group simultaneously. A team cannot trade one row and "keep the other" — got this wrong once already (2026-07-23, the Stepien check below initially let a team retrade one row of a shared group while treating the other as still-covering, which was flatly wrong).
- **`protected`** / **`swap_owner`** — narrow single-value legacy fields (a top-N threshold; the other pick's orig team in a 2-member swap). Only cover the simplest cases; a real multi-band protection or 3+-way swap won't fit in them and will read `null`/misleadingly blank — `leaves` is what to use instead, always.
- **`ladder`** — multi-year chained protection: `{from, to, protect_top, fallback, txn_ids}`. `from` keeps the pick if it lands within `protect_top`; otherwise it conveys to `to`; `fallback` is what happens if the ladder runs out of steps unresolved.
- **`legacy`** — a pick whose real terms were too tangled to model structurally; resolver skips it, `notes` carries the real prose verbatim, frozen from re-trade until a human converts it. (As of 2026-07-22 the live ledger has zero legacy picks left — the last cluster was resolved into real structure.)

**Concrete worked example, verified against real production data (2026-07-23):** HOU's and DET's 2027 1st both show `group_id` set, `owner: "DET|HOU"`. Reading `leaves` on either row gives the complete, correct picture in one step: `{"team": "DET", "description": "swap priority (better pick)"}` and `{"team": "HOU", "description": "swap priority (worse pick)"}`. That's the whole story — two teams, DET guaranteed the better of the two physical picks, HOU guaranteed the worse, no third party, no ambiguity, no need to trace transaction history. (The pick numerically labeled `orig: "LAL"` is not LAL's concern at all — LAL traded it away in 2020; DET already owns it outright and is only deciding whether to keep it or swap into HOU's own pick instead.)

The flat, legacy `{abbr}-picks.csv` (`YEAR, ROUND, TEAM, TYPE`, `TEAM` values like `Own`, `from NYK`, a trailing `*` for "has conditions") is stale and unread (see "Written by the nbn-api" above). The live flat ledger is `draft-picks.csv` (one row per pick, `OWNER` column), which `PUT /api/picks/{year}/{rnd}/{orig}` writes and the conveyance store is regenerated from. It is lossy and not what the site serves; the weekly integrity check flags any owner it names who holds no claim on what `/api/picks` returns (`picks_conveyance/parity.py`). Anything reasoning about *why* a pick is owned by whom goes through `/api/picks` and reads `leaves`, never this file.

### Player season

One row in `players/player_seasons.csv` (regular season) or `players/player_seasons_playoffs.csv` (playoffs). Aggregated stats for one player in one season on one team.

Key columns: `PLAYER`, `SEASON` (e.g. `"24-25"`), `TEAM`, `G`, `MIN`, `PTS`, `REB`, `AST`, `STL`, `BLK`, `3PM`, `GMSC` (game score total), and single-game highs (`HIGH_P`, `HIGH_R`, etc.). Also carries bio snapshot fields (`DOB`, `COLLEGE`, `PHOTO_URL`, `NBN_DFT_*`) and `SLUG`.

`RINGS` (reg season only) counts championship rings the player holds as of that season.

### Player award

One row in `players/player_awards.csv`. One award instance per player per season.

| Column | Example |
|---|---|
| `SLUG` | `"durant-kevin"` |
| `PLAYER` | `"Durant, Kevin"` |
| `SEASON` | `"20-21"` |
| `AWARD` | `"All-Star"`, `"MVP"`, `"DPOY"`, `"All-NBN 1st"`, … |

### Team season

One row in `{abbr}-seasons.csv` (and mirrored in `standings/standings-history.csv`). One team's record for one regular season.

Key columns: `SEASON`, `W`, `L`, `PCT`, `PPG`, `OPPG`, `DIFF`, `SEED` (e.g. `"East-3"`), `SEED_NUM`, `OFF_RTG`, `DEF_RTG`, `PLAYOFF_RESULT`, `FOTY` (Franchise of the Year, bool), `COTY` (Coach of the Year, bool).

`PLAYOFF_RESULT` values: `Missed`, `First Round`, `Conf Finals`, `Runner-Up`, `Champion`.

### Owner

One row in `data/owner_stats.csv`. Career-aggregate stats for a GM across all seasons they managed a team.

Full header list under "Generated by `build/build.sh`" above; `teams` is comma-separated abbrs.

### HOF entry

One row in `hof.csv`. Tracks a player's Hall of Fame eligibility score.

Key columns: `PLAYER`, `TEAMS`, `HOF_POINTS`, `RINGS`, `PLAYOFF_APPS`, `ALLSTARS`, `ALL_NBN_1/2/3`, `MVP`, `DPOY`, `G`, `P/R/A/S/B` (career totals), `ACTIVE` (bool).

### Game high

One row in `game-highs-{p,r,a,s,b,3pm}.csv`. A single-game stat record entry.

Key columns: `RANK`, `DATE`, `SEASON`, `PLAYER`, `TEAM`, `OPP`, `gametype` (`REGULAR` or `PLAYOFF`), plus the six stat columns (`P`, `R`, `A`, `S`, `B`, `3PM`).

### Playoff bracket

One row in `standings/playoff-brackets.csv`. One matchup in one season's bracket.

| Column | Notes |
|---|---|
| `SEASON` | e.g. `"24-25"` |
| `ROUND` | `1` (first round) through `4` (finals) |
| `T1`, `T2` | Team abbreviations |
| `T1_W`, `T2_W` | Wins per team |
| `WINNER` | Winning team abbreviation |
| `T1_SEED`, `T2_SEED` | e.g. `"East-1"` |
| `T1_SEED_NUM`, `T2_SEED_NUM` | Integer seed |
