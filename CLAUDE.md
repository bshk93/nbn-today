# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Versioning

The site uses semantic versioning (`MAJOR.MINOR.PATCH`) stored in `version.json` at the repo root.

**On every commit:**
1. Add a new entry to the **top** of `changelog.json` with `"version": "pending"`, today's date (`YYYY-MM-DD`), and a `changes` array of human-readable bullet strings.
2. Commit normally. The pre-commit hook (`.git/hooks/pre-commit`) will auto-bump the patch digit in `version.json` and replace `"pending"` in the new changelog entry with the real version number, then stage both files automatically.

**For minor or major bumps** (new feature area, significant overhaul): manually edit `version.json` to the desired version before committing. The hook detects that `version.json` is already staged and skips the auto-bump.

`changelog.json` format — newest entry first:
```json
[
  { "version": "pending", "date": "YYYY-MM-DD", "changes": ["..."] },
  { "version": "0.0.1",   "date": "2026-05-21", "changes": ["Initial versioned release"] }
]
```

The changelog is served at `/changelog` and the current version appears on the homepage card.

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
| Set hard cap level | Article I (§ 1.3 – § 1.4) |

League-wide constants (cap thresholds, roster limits, apron triggers) are in Article I and Article II. `rules/` has been retired — `rulebook/index.html` is the single source of truth.

---

## What this project is

**NBN (Nothing But Net)** is a static website for a fantasy basketball simulation GM league. It hosts owner history stats, team pages, player profiles, standings, draft history, stats leaderboards, and NBNTV Classics (curated playoff highlights).

> **New here, or need the operating picture?** `docs/runbook.md` is one page:
> what lives where, what runs on a timer, the three flows (box score, transaction,
> deploy), how to restore, and what to do when something breaks. This file is the
> per-topic detail; the runbook is the map.

## Dev and live — which checkout am I in?

Two checkouts of this repo, both on `main`, both plain clones of the same remote:

| | Path | What it is |
|---|---|---|
| **live** | `/home/skim/projects/nbn-today` | what `nbn.today` serves — `/var/www/nbn.today` is a symlink to it |
| **dev** | `/home/skim/projects/nbn-today-dev` | what `https://dev.nbn.today` serves, behind basic auth (user `dev`, `/etc/nginx/.htpasswd-dev`) |

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

  `--exclude=.git` matters: the data directory is a git work tree, and copying
  its `.git` would have the scratch copy committing to the backup repo.

The pre-commit hook is tracked at `build/hooks/pre-commit` (`.git/hooks` is not
cloned, so a fresh checkout would silently lose the smoke test and the version
bump). A new clone needs one command: `git config core.hooksPath build/hooks`.

> **The Shiny app is orphaned, not deleted.** `~/projects/nothing-but-stats` and
> `/srv/shiny/nothing-but-stats` are retired. Nothing is removed from them and
> nothing accommodates them either — they are not a consumer of this repo's data
> any more. Don't restore a symlink or a write path on their behalf.

## Running locally

No build step. Serve with any static file server from the project root:

```
python3 -m http.server 8080
```

All pages fetch CSVs at runtime relative to the site root, so the server must always be rooted at the project root.

For anything authenticated, this is not enough and `dev.nbn.today` is the answer:
`http.server` does not proxy `/api` (so relative fetches 404), and the session
cookie is `Domain=.nbn.today; Secure`, so a `localhost` origin can never carry
it — `/pdc`, `/free-agency` and team edit mode are untestable from it. On
`dev.nbn.today` they work: a session minted on `nbn.today` is sent there
automatically and the API accepts it (verified 2026-08-19).

> If you ever add another authenticated vhost under this domain, give it
> `location ^~ /.well-known/acme-challenge/ { auth_basic off; }`. A host-wide
> `auth_basic` 401s the ACME challenge, and the failure shows up as an expired
> certificate two months later rather than as anything at setup time.

## Data files

**This repo contains no data files.** Everything below lives in `/var/lib/nothing-but-stats/` (NBS_DATA_DIR) and is served from there, not from the docroot — the 149 tracked symlinks that used to fake it were removed on 2026-08-18, which is what makes `git pull` a safe deploy and `git reset --hard` a safe rollback.

How a file reaches the browser:

- The build writes to `$NBS_DATA_DIR/derived/**` (`NBN_OUT_DIR`). League state the API writes (rosters, picks, deadcap, `poopoo.json`, `trade-votes.json`) stays at the data-dir root.
- `build/link-public.sh` regenerates `$NBS_DATA_DIR/public`, a symlink view unifying both under the URL paths pages already fetch. It runs at the end of every build, so a newly generated file is published rather than 404ing.
- nginx serves that view: `location ~* \.csv$ { root /var/lib/nothing-but-stats/public; }` plus `location =` rules for the two JSONs. **Both `nbn.today` and `pdc.nbn.today` need the block.** Note `/etc/nginx/sites-enabled/nbn.today` is a **real file, not a symlink** into `sites-available`, and the two have diverged — edit `sites-enabled`.

No URL changed in the move; every path below is what the page fetches. Files are grouped by what generates them.

---

### Generated by `build/build.sh` (Python pipeline)

> **The aggregation is Python, since 2026-08-19.** All 86 files below are
> written by `nbn-api/stats_build/`, checked byte for byte against the R build
> it replaced (see `docs/stats-pipeline-port-spec.md` and `nbn-api/CLAUDE.md`).
> R is kept **dormant and permanent** (decided 2026-08-19 — it is not being
> uninstalled). It is the rollback, `NBN_STATS_ENGINE=r bash build/build.sh`,
> exercised on the same `link-public.sh` + `smoke_test.py` tail as the live
> path; and it is the only value-level check the 86 files have, since
> `smoke_test.py` asserts schema and no values. Run
> `python3 -m stats_build.harness port` after any change to the pipeline.
>
> Two R bugs the cutover fixed, so these files read differently than they did
> before it: `league-history.csv` listed every playoff team as a champion (R
> counted playoff wins over *player* rows, not games), and three players named
> Will were written `Barton, will`.

Runs automatically after each box score commit, or manually. Source data: `allstats-{YY-YY}.csv` and `allstats-playoffs-{YY}.csv` in NBS_DATA_DIR.

| File | Used by | What it contains |
|---|---|---|
| `data/owner_stats.csv` | `owners/index.html` | Career W/L, ratings, playoff depth per GM |
| `data/{abbr}-seasons.csv` | `teams/{ABB}/index.html` | Per-season record, seed, ratings, playoff result, FOTY/COTY for one team |
| `data/{abbr}-players.csv` | `teams/{ABB}/index.html` | All-time per-player career stat lines for one team |
| `standings/standings-history.csv` | `standings/index.html` | All-time season records for all teams (one row per team per season) |
| `standings/playoff-brackets.csv` | `standings/index.html` | Every playoff series: teams, wins, seeds, winner |
| `nbntv-classics/playoff-series-margins.csv` | `nbntv-classics/index.html` | Average margin per completed playoff series |
| `nbntv-classics/playoff-classics.csv` | `nbntv-classics/index.html` | Top 10 playoff performances by Game Score |
| `players/player_seasons.csv` | `players/index.html` | Per-player, per-season regular season totals + bio snapshot |
| `players/player_seasons_playoffs.csv` | `players/index.html` | Same for playoffs |
| `players/player_awards.csv` | `players/index.html` | One row per award per player per season |
| `data/game-highs-{p,r,a,s,b,3pm}.csv` | `stats/highs/{stat}/index.html` | Top 50 single-game performances per stat category (the doc said 20; the build writes 50) |
| `data/franchise-records.csv` | `teams/team.js` (All-Time tab) | Top 5 single games **per team** per stat (P/R/A/S/B/3PM/GMSC) — one combined file for all 30 teams. Unlike `game-highs-*`, which is league-wide, every franchise appears here |
| `data/totals-{p,r,a,s,b,3pm}.csv` | `stats/totals/{stat}/index.html` | Top 250 career totals per stat category |
| `data/h2h-alltime.csv` | `h2h/index.html` | All-time head-to-head W/L matrix (teams vs teams) |
| `data/h2h-playoffs.csv` | `h2h/index.html` | Same, playoffs only |
| `data/h2h-owners.csv` | `h2h/index.html` | Head-to-head W/L matrix (owners vs teams) |
| `data/hof.csv` | `hof/index.html` | Hall of Fame scores + career counting stats, top 250 players |
| `data/league-history.csv` | `season-summary/index.html` | Per-season champion, award winners, stat leaders, best ratings |

`data/owner_stats.csv` headers: `owner, teams, seasons, best_reg_season, best_reg_pct, worst_reg_season, worst_reg_pct, reg_w, reg_l, reg_pct, playoff_w, playoff_l, playoff_pct, total_w, total_l, total_pct, playoff_appearances, po_r2, po_conf_finals, po_finals, championships, off_rtg, def_rtg`

---

### Written by the nbn-api on roster/picks edits

Updated whenever a team owner saves changes in the team page edit mode (`PUT /api/roster/{team}` for the roster; picks are written one at a time via `PUT /api/picks/{year}/{rnd}/{orig}`, since the conveyance model has no whole-team picks write).

| File | Used by | What it contains |
|---|---|---|
| `data/{abbr}-roster.csv` | `teams/{ABB}/index.html` | Current roster: `SLUG` per player (name/OVR/salary etc. joined from player-bios.json and ovr-history.json at render time) |
| `data/{abbr}-picks.csv` | `teams/{ABB}/index.html` | Draft pick inventory: `YEAR, ROUND, TEAM, TYPE` |

---

### Generated by manual Discord scrape

| File | Used by | What it contains |
|---|---|---|
| `data/trade-votes.json` | `tradevotes/index.html` | Per-member, per-team FOR/AGAINST counts on trade messages in the #transactions channels |

`tradevotes/index.html` (unlisted — not linked from `nav.js`, no auth) is a sortable
matrix: rows are members, columns are the 30 teams, a cell is a FOR-AGAINST record +
percentage. A member "votes on a trade" by reacting to its message at all (any emoji).
For every team actually named in that trade — parsed from the "TEAM receives: ..."
headers via `resolve_discord_trades.BLOCK_RE`/`_alias_to_abbr`, the same parser the
historical trade backfill uses — each reactor is scored **FOR** that team if one of
their reactions was one of that team's own logo emoji (each team has 2-3 logo-art
variants in the guild — `Hawks`/`Hawks2`/`hawkstb` etc. — pooled as equivalent), and
**AGAINST** every other team named in the same trade otherwise: they showed up and
didn't back that side. A 3-team trade gives every reactor an independent for/against
verdict on all 3 teams. Messages whose team headers don't parse (~2% of the corpus)
are skipped outright — there's nothing to attribute a verdict to.

Generated by `nbn-api/fetch_trade_votes.py` (read-only against Discord, requires
`DISCORD_BOT_TOKEN`; imports `BLOCK_RE`/`_alias_to_abbr` from `resolve_discord_trades.py`
so the team-header parser can't drift between the two scripts), run manually — there's
no timer, so the "Generated" timestamp on the page can go stale. Re-run it to refresh:
```bash
cd /home/skim/projects/nbn-api && set -a && source .env && set +a && ./venv/bin/python3 fetch_trade_votes.py
```
It's slow (~20 min for the full 7-channel history) because it fetches the reactor list
for **every** reaction on every trade message, not just team-emoji ones — a member's
sentiment-only reaction (👍/💀/🔥/⚖️/🐋/🤔, no team emoji) still counts as having voted
on the trade, so it still needs the full reactor list to mark them AGAINST every team
in it. It joins `discord_id` against `members.json` where linked (`/link` in Discord);
unlinked reactors fall back to their raw Discord username and render in italics on the
page.

---

### Served via API (not static files)

These are fetched from nbn-api at runtime, not from flat files in the repo.

| Endpoint | Used by | Backed by |
|---|---|---|
| `GET /api/trading-block` | `tradeblock/index.html` | `trading-block.json` in NBS_DATA_DIR |
| `GET /api/players` | player profiles, roster pages | `player-bios.json` in NBS_DATA_DIR |
| `GET /api/boxscores` | `boxscores/index.html` | `allstats-{YY-YY}.csv` in NBS_DATA_DIR |
| `GET /api/players/{slug}/gamelog` | player profiles | `allstats-{YY-YY}.csv` in NBS_DATA_DIR |
| `GET /api/deadcap/{team}` | `teams/{ABB}/index.html` | `team-state.json` in NBS_DATA_DIR |
| `GET /api/members/public` | `members/index.html` | `members.json` in NBS_DATA_DIR |
| `GET /api/trade-exceptions` / `GET /api/trade-exceptions/{team}` | `teams/{ABB}/index.html` | `trade-exceptions.json` in NBS_DATA_DIR |

## Stats pipeline

Stats flow from game submission to the live site in one automated step:

```
/boxscores/submit  →  nbn-api appends row to allstats-{season}.csv
                   →  triggers build/build.sh asynchronously
                   →  stats_build regenerates all 86 aggregated CSVs
                   →  link-public.sh republishes the served view
                   →  nginx serves the updated files immediately
```

### build/ directory

| File | Purpose |
|---|---|
| `build.sh` | Entry point. Syncs `owners.csv` from `members.json`, runs the engine, republishes `public/`, smoke-tests. Picks the engine off `NBN_STATS_ENGINE` (`python`, the default, or `r`). |
| `test_build_sh.py` | Pins what build.sh must keep being true — defaults to Python, still reaches R, one season resolver. Runs from the pre-commit hook. |
| `job.R` | **Dormant.** The retired R orchestrator, kept for one season as the rollback. Reached only by `NBN_STATS_ENGINE=r`. |
| `build-utils.R` | **Dormant**, with `job.R`. |
| `link-public.sh` | Regenerates `$NBS_DATA_DIR/public`, the symlink view nginx serves. Called at the end of `build.sh`. |
| `sync_owners.py` | Regenerates `$NBS_DATA_DIR/owners.csv` from `members.json` tenure data. |
| `seasons.conf` | Maps season strings to playoff start dates (`25-26=2026-04-13`). Read only on the R path — and `job.R` parses the value and never uses it. Playoff rows come from their own `allstats-playoffs-{YY}.csv`, so nothing splits a season by date. |

### Data boundaries

**Stays in `/var/lib/nothing-but-stats/` (written by the API, read by the build):**
- `allstats-{YY-YY}.csv` — raw game-level rows for each regular season
- `allstats-playoffs-{YY}.csv` — raw playoff rows

> These two are the only files on the box that cannot be rebuilt, and they are
> **append-only by contract**: the API writes them through
> `nbn-api/routers/allstats_guard.py`, which refuses a write that shrinks one,
> that rewrites rows already on disk, or that would drop a column an older
> season has (they do differ — no `OPP_RAW` before 24-25). A weekly
> `nbs-integrity.timer` re-checks row counts and hashes a closed season can
> never change. Details in `nbn-api/CLAUDE.md` § "Protecting the raw box
> scores"; the plan they come from is `docs/dev-deploy-setup-spec.md` Phase 2.
- `player-bios.json`, `members.json`, `owners.csv`, `awards-history.json`

**Written to `$NBS_DATA_DIR/derived/` by the build** (served through the `public/` view at the paths below — the build is the only author, so nothing here is backed up):
- `data/owner_stats.csv`, `data/{abbr}-seasons.csv`, `data/{abbr}-players.csv`
- `standings/standings-history.csv`, `standings/playoff-brackets.csv`
- `players/player_seasons.csv`, `players/player_seasons_playoffs.csv`, `players/player_awards.csv`
- `data/game-highs-*.csv`, `data/totals-*.csv`, `data/hof.csv`, `data/h2h-*.csv`, `data/league-history.csv`, `data/franchise-records.csv`
- `nbntv-classics/playoff-classics.csv`, `nbntv-classics/playoff-series-margins.csv`

Box score detail (individual game lines) is served via API endpoints (`GET /api/boxscores`, `GET /api/players/{slug}/gamelog`) rather than static files, keeping the repo size manageable.

### Manually triggering a build

```bash
# via API (requires rosters or stats role token)
curl -X POST https://nbn.today/api/build/trigger \
  -H "Authorization: Bearer YOUR_TOKEN"

# check status
curl https://nbn.today/api/build/status

# run directly on the server
bash /home/skim/projects/nbn-today/build/build.sh

# roll back to the dormant R engine for one run
NBN_STATS_ENGINE=r bash /home/skim/projects/nbn-today/build/build.sh

# the aggregation on its own, without owners.csv / public/ / the smoke test
cd /home/skim/projects/nbn-api && venv/bin/python3 -m stats_build --dry-run

# tail the log
tail -f /var/log/nbn-build.log
```

**Deploy order matters.** `build.sh` runs `python3 -m stats_build` out of
`nbn-api`, so **nbn-api deploys first**; a site deploy that lands ahead of it
gives every build `No module named stats_build`. The reverse order is safe —
the API carries the engine before anything asks for it.

### Adding a new season

1. The build auto-infers the current season from today's date (Sep 30 cutoff),
   in `nbn-api/stats_build/buildargs.py` — the one place that rule lives. No
   config change is needed.
2. `build/seasons.conf` can be updated with the new playoff start date for the
   record, but nothing reads it any more (see the `build/` table above).

---

## Architecture

No framework or build step. Every page is a self-contained HTML file with inline `<style>` and `<script>`. Two shared JS files break the pattern as described below.

## Common task lookup

Entries name a **symbol and a file, deliberately without a line number** — `grep`
finds the symbol in one step, and a line number in a 5,000-line file is wrong
again within a few edits. Every number this table used to carry had drifted by
thousands of lines before anyone noticed, which is worse than none: it reads as
precise.

| Task | Where to edit |
|---|---|
| Add/change a roster table column | `buildRosterTable` — `teams/team.js` |
| Add/change a draft picks column | `buildPicksTable` — `teams/team.js` |
| Add/change a season history column | `makeSeasonRenderCell` — `teams/team.js` |
| Add/change an owners table column | `COLS` array — `owners/index.html` |
| Change team page layout or HTML structure | `teams/team.js` (the injected HTML, not per-team files) |
| Change cap/MLE/exception display | `renderHardCapBanner` / `renderExceptionsSection` — `teams/team.js` |
| Change edit mode behavior | `enterEditMode` / `setupEditable` — `teams/team.js` |
| Change the Team Settings tab (jersey #, secondary position) | `setupTeamSettingsTab` — `teams/team.js` |
| Change stats highs table | `stats/highs/table.js` (not the per-stat HTML files) |
| Change stats totals table | `stats/totals/table.js` (not the per-stat HTML files) |
| Add/edit a NBNTV blurb | `BLURBS` object — `nbntv-classics/index.html` |
| Change standings display | `standings/index.html` |
| Change player index display | `players/index.html` |
| Change HOF display | `hof/index.html` |
| Change H2H display | `h2h/index.html` |
| Add a retired jersey | `RETIRED_JERSEYS` — `teams/team.js` |
| Change the Franchise Records cards | `records-wrap` block in `teams/team.js`; data comes from `franchise_records` in `nbn-api/stats_build/pipeline.py` |
| Change the transaction simulator's spreadsheet export | `buildTradeWorkbook` — `transaction-sim/index.html`; the .xlsx writer is `transaction-sim/xlsx.js`, and publishing to Google Sheets is `POST /api/trade-sheet` (`nbn-api/routers/google_sheets.py`). Export is trade-mode only |
| Add a transaction type to the simulator | `setMode` / `runSignCheck` — `transaction-sim/index.html`, plus a `POST /api/validate/{type}` endpoint in `nbn-api/routers/transactions.py` (see "Transaction simulator" below) |
| Change the contract shorthand (`2+1 PO, $150M`) or the cap-hold vocabulary | **`contract.js`** at the repo root — one grammar, loaded by team pages (via `contractReady` in `team.js`), `/pdc` and `/transactions`. `_contract_str` in `nbn-api/routers/discord_notify.py` is a deliberate Python mirror (it can't import JS) and is pinned to the same cases by `nbn-api/tests/test_contract_shorthand.py`. Don't add a fourth copy |
| Change the office's contract entry form (salary rows, EAPS, live signing rubric) | `addSalaryRow` / `collectSalaries` / `collectSignValidationBody` — `transactions/index.html`. The signing rubric calls `POST /api/validate/sign` (or `/offer_sheet`, `/sign_pick`) on a 300ms debounce, the same validator the submit path runs. The **EAPS field is not always shown** — `syncEapsVisibility` reveals it off the fact sheet's `trailing_hold` only when it actually prices something (Full Bird hold, season with no real EAPS), and keeps it up once answered so the control that produced the figure doesn't vanish |
| Change the rookie scale table, or how a pick signing is prefilled | `build/load_rookie_scale.py` (loader) · `rookie-scale/index.html` (page) · `_rookie_scale_contract` + `GET /api/rookie-scale/contract/{slug}` (nbn-api) · `prefillRookieScale` — `transactions/index.html`. See "The § 7.1 rookie scale" below |
| Add/change an owner's per-player roster move | `makeRosterMoveActions` / `openMovesMenu` — `teams/team.js` (see "Owner self-serve roster moves") |
| Verify build output still matches what pages read | `build/smoke_test.py` — runs from `build.sh` and the pre-commit hook |
| Change the suggestions board or its comment threads | `suggestions/index.html` + `nbn-api/routers/suggestions.py` (see "Suggestions board" below) |
| Change the team-facing FA offer form (⋯ menu, contract editor, submit confirm) | `free-agency/index.html` — the block under "Team-facing offers"; endpoints `POST/PATCH/DELETE /api/fa/offers`, `POST /api/fa/offers/{id}/submit`, `GET /api/fa/commitment/{team}`. an offer's legality and every dollar shown come from `POST /api/validate/sign`, never from page code (see "Team-facing FA offers" below) |
| Add a theme, or change what one costs | Colours: `build/make_team_theme.py` → `css/theme.css` (the team blocks are **generated**, don't hand-edit). Catalog and price: `LIVE_TEAM_THEMES` / `THEME_PRICE` in `nbn-api/routers/themes.py`. Picker: `_themeMenuItems` / `_unlockTheme` — `nav.js`. Run `build/check_theme_catalog.sh` after (see "Unlockable themes" below) |
| Change the PDC committee dashboard (FA review, the 1,000-ball ballot, remand/void, finalize/unlock, the agent queue, head controls) | `pdc/index.html`; data from `/api/fa/*` in `nbn-api/routers/free_agency.py`; design record in `docs/pdc-free-agency-spec.md`. Three roles, and a free agent passes through them in order — `agent` curates, `fac` ballots, `fac_head` runs it (see "The agent stage" below). Served at both `nbn.today/pdc` and `pdc.nbn.today` — the subdomain is `/etc/nginx/sites-available/pdc.nbn.today`, the **same docroot** with `/` → `/pdc/index.html`, so every fetch stays same-origin (no CORS, no static-asset CORS gap). Keep any new path rule in sync with the `nbn.today` block or it works on one host and 404s on the other |

---

## Architecture

No framework or build step. Every page is a self-contained HTML file with inline `<style>` and `<script>`. Two shared JS files break the pattern as described below.

### Shared scripts

**`teams/team.js`** — loaded by every team page (`teams/{ABB}/index.html`). It:
- Defines `TEAMS` (abbr → full name) and `RETIRED_JERSEYS` (per-team retired number data)
- Infers the team abbreviation from `location.pathname`
- Injects all CSS and HTML into `document.body`
- Fetches the four per-team CSVs in parallel (`Promise.allSettled`)
- Exports reusable helpers: `buildTable(cols, rows, sortField, sortDir, renderCell)`, `buildRosterTable`, `buildPicksTable`, `buildEditableGrid`, `setupEditable`
- Handles **edit mode**: committee members can click an "Edit" button on roster/picks sections, enter a bearer token (stored in `localStorage` as `nbn_token`), and save changes via `PUT /api/roster/{ABB}`, or `PUT`/`DELETE /api/picks/{year}/{rnd}/{orig}` per pick, against a backend API running at port 8001.

> **Never edit `teams/{ABB}/index.html` directly.** All 30 files are identical 11-line shells (`<script src="../team.js"></script>`). All team page logic lives in `team.js`.

**`contract.js`** (repo root) — the contract vocabulary and shorthand: `CONTRACT_HOLD_TYPES` (the one list of what a `cap_holds` year can be), `CONTRACT_TAGS`, `isFaHold`, `parseCapHoldMap`, and `summarizeContract`, which renders `2+1 PO, $150M`. Loaded by team pages (dynamically, via `contractReady`), `/pdc` (`<script src="/contract.js">`) and `/transactions`.

Two things it settles, both of which had already gone wrong once: a **trailing UFA/RFA line is the hold the deal rolls into, not a contract year**, so it ends the deal rather than adding a year and inflating the total; and `summarizeContract` with **no `season`** summarizes the whole deal from its own first year (what a ledger row wants — the contract as signed), while passing a season gives the roster reading (what's left from here).

**`teams/lineup.js`** — `DEPTH_SLOTS` + `computeStartingFive`, the best legal one-player-per-slot PG→C lineup. Extracted from `team.js` so pages other than a team page can project a lineup (`team.js` injects a whole page into `document.body` on load, so nothing can import from it). It reads exactly two fields off each row — `_posList` and `OVR` — so any caller producing objects with those can use it.

> Because the team shells load only `team.js`, shared modules are pulled in from `team.js` itself via an injected `<script>` + an awaited promise (`ratingsPopupReady`, `lineupReady`). Add new shared modules the same way rather than touching the 30 shells.

**`stats/highs/table.js`** and **`stats/totals/table.js`** — loaded by each stat-category page. The page sets `window.PAGE_CONFIG = { statKey, csvPath }` before the script tag, and the script reads that config to know which CSV to fetch and which column to highlight as primary.

> **Never edit individual stat-category HTML files** (`stats/highs/{stat}/index.html`, `stats/totals/{stat}/index.html`). They only differ by 3 lines (title, heading, `PAGE_CONFIG`). All display logic lives in `table.js`.

### owners/index.html data flow

1. `fetch('/data/owner_stats.csv')` → `parseCSV(text)` → array of row objects keyed by CSV header
2. `buildTable(rows)` creates the `<table>`, renders `<thead>` from the `COLS` array, attaches sort click handlers, calls `rebuildBody`
3. `rebuildBody(rows, tbody)` sorts rows and re-renders all `<td>` cells on every sort change

### COLS array (owners/index.html)

Each entry in `COLS` (`owners/index.html`) defines a column:
- `key` — CSV field name (used as fallback cell text)
- `sortField` — the CSV field actually sorted on (may differ from `key`)
- `cls` — space-separated CSS classes applied to both `<th>` and `<td>`
- `display(row)` — optional function returning the cell's display string; omit to use `row[key]` directly
- `defaultDir` — sort direction when first clicking this column (`-1` = descending, `1` = ascending)

The `buildTable` function in `teams/team.js` uses the same shape for team-page tables.

### Special cell rendering

Custom rendering is done inside `COLS.forEach` / `renderCell` callbacks. The `championships` column in `owners/index.html` is the canonical example: it creates a `.trophy.trophy-gold` `<span>` instead of plain text. In `teams/team.js`, `makeSeasonRenderCell` handles FOTY/COTY badges and playoff result coloring.

RTG/DIFF columns get heat-map coloring via inline `td.style` (hue 0–120 mapped to min–max of the column).

### NBNTV Classics blurbs

`nbntv-classics/index.html` stores blurbs as a plain JS object (`BLURBS`) keyed by `"{DATE}_{player-slug}"` (e.g. `"2021-06-20_curry-stephen"`). This key is stable across rank changes. Empty string means the blurb hasn't been written yet.

### Edit mode (team pages)

The "Edit" button on Roster and Draft Picks sections in team pages calls `setupEditable`, which uses `buildEditableGrid` for in-browser table editing. Saves go to the API backend (`PUT /api/roster/{ABB}`, and `PUT`/`DELETE /api/picks/{year}/{rnd}/{orig}` one pick at a time) with a `Bearer` token. Token is prompted via a modal and persisted in `localStorage`. A 403 response clears the stored token.

## API backend (`/home/skim/projects/nbn-api/`)

FastAPI app running as a systemd service on port 8001, proxied through nginx. Source: `/home/skim/projects/nbn-api/main.py`. Reads/writes CSVs in `/var/lib/nothing-but-stats/`.

### Roles

| Role | Permissions |
|---|---|
| `rosters` | `PUT /api/roster/{team}`, `PUT`/`DELETE /api/picks/{year}/{rnd}/{orig}` |
| `bod` | Everything `rosters` can do + early award access + edit member tenures |
| `admin` | Everything + member management (`GET/POST/PATCH/DELETE /api/members`) |
| `atl`, `bkn`, `bos`, `cha`, `chi`, `cle`, `dal`, `den`, `det`, `gsw`, `hou`, `ind`, `lac`, `lal`, `mem`, `mia`, `mil`, `min`, `nop`, `nyk`, `okc`, `orl`, `phi`, `phx`, `por`, `sac`, `sas`, `tor`, `uta`, `was` | `PUT /api/trading-block/{team}` for their own team only |

`admin` implicitly satisfies any role check.

Valid roles are enforced at member creation time — `POST /api/members` rejects any unrecognized role name.

### Sign-in: the token, and the `.nbn.today` session cookie

The member token lives in `localStorage` as `nbn_token`, which is **per-origin** — so a member signed in on `nbn.today` is a stranger on `pdc.nbn.today` (this is why `news.nbn.today` was retired into `nbn.today/news` rather than solved). `token-badge.js` runs on every page and, when it has a working token and no session yet, calls `POST /api/auth/session` to mint an **opaque** session id delivered as `nbn_session=…; Domain=.nbn.today; Secure; HttpOnly; SameSite=Lax; Max-Age=30d`. Every subdomain sends it automatically, so signing in once anywhere covers all of them.

The token itself never enters the cookie, which is what makes a session revocable — rotating a token, revoking it, or deleting the member drops every session that member had. The cookie is honoured on a **narrow allowlist only** (`GET /api/auth/me` and `/api/fa/*`); every real write path still requires the `Authorization` header. Full rationale and the mechanics live in `nbn-api/CLAUDE.md` § "Browser sessions"; do not widen the allowlist without reading it.

`nbn_session_live` is a companion cookie that is deliberately readable by page JS and holds nothing but `1` — it exists only so `token-badge.js` can tell it already has a session (the real one is `HttpOnly`), and without it every page load would mint another session row.

### Trading Block endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/trading-block` | Public | Returns `{ "ATL": [{player, notes}], … }` for all 30 teams |
| `PUT /api/trading-block/{team}` | Team role or admin | Replaces that team's list; body is `[{player, notes}]` |

Data stored in `/var/lib/nothing-but-stats/trading-block.json`. The page at `tradeblock/index.html` fetches this API plus the relevant teams' roster CSVs (for team membership) and `player-bios.json`/`GET /api/ovr/current` to join player metadata (POS, OVR, AGE, salary columns).

The whole-block `PUT` also takes an unpersisted `notify_discord` flag — see "Tradeblock Discord notifications" below.

### Validation endpoints (Transaction Simulator)

`/transaction-sim/` models a transaction and reports the legal checks against
it. It is **read-only by design** — there is deliberately no path from the
simulator to an actual submission.

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

`_require_validatable` rejects unknown teams/players with a 400 instead of
scoring them — a validator handed an unknown team reads its salary as $0 and
every check passes vacuously, which would print a confident "LEGAL" for a
transaction that was never evaluated. `_require_trade_validatable` is the same
guard for a trade, which has many teams and players rather than one of each;
`/api/validate/trade` had none until 2026-08-10 and was scoring unknown teams
(reporting a passing hard-cap check and a roster count of -1).

**`tests/test_validate_endpoints.py` is the only suite that goes through HTTP.**
Every other suite calls the validators directly, which left the endpoint
functions wrapping them — the code that reads the request model and assembles
the response — never executed under test. That is precisely where both of the
above bugs lived. Add a case here when adding a `/api/validate/*` endpoint; it
asserts shape, not legality (never 5xx, `{legal, checks, fact_sheet}` back,
unknown subjects refused with 400, junk bodies 422).

Coverage is uneven and the UI says so: `sign`/`offer_sheet`/`offer_sheet_decision`/
`trade`/`renounce`/`sign_pick`/`extension` have real validators, while `release`, `option` and `pick` are stubs
returning `[]` — those types are deliberately **not** offered in the simulator, since a
verdict off zero checks is worse than no verdict. § 3.7 (DPE) remains unmodeled.
(`renounce` is validated but still isn't wired into the simulator UI; its
validator exists to serve the roster page's confirm dialog. Adding it there is
now just UI work.)

`sign_pick` was itself one of those silent stubs until 2026-08-11 — it wasn't in
`_VALIDATORS` at all, so a pick signing ran **zero** checks, against § 1.3's
explicit promise to block "any signing, trade, draft pick signing, or two-way
conversion" that breaches a ceiling. It now checks the hard cap, the roster
ceiling, that the player actually holds draft rights, and § 7.1 scale conformity.
It is wired into `/transactions`' live rubric (not the simulator, which doesn't
offer the type). Note it is deliberately **not** run through
`_check_contract_raises`: the scale's own Year 1 → Year 2 step lands either side
of exactly 5% (pick 1 of 2026 rises 5.0024%), so the § 3.9 ladder rejects about
half the contracts § 7.1 prescribes.

`convert_twoway` had the same gap `sign_pick` did, but on the fact-sheet side
rather than the checks: `_validate_convert_twoway` was always in `_VALIDATORS`,
so a two-way conversion was never unchecked — but with no `/api/validate/*`
endpoint, `/transactions`' live rubric had no fact sheet to read `needs_eaps`
off of, so `f-eaps-field` never appeared even though `_apply_convert_twoway`
prices the trailing § 3.10 hold through the same `_autofill_fa_hold_amounts` a
signing does, and a Full Bird hold with no EAPS on file rejects at submit with
a 422 asking for `eaps_assumption`. The office form could ask for an answer it
had nowhere to collect. Fixed 2026-08-12 by adding the endpoint and wiring
`collectSignValidationBody`/the rubric section to `convert_twoway` the same
way `sign_pick` joined them.

`extension` (§ 6.2 / § 6.3) shipped 2026-08-21 — Phase A + E of
`docs/poext-extension-pipeline.md`. Deliberately does **not** reuse
`_validate_sign`: an extension adds years to a live contract rather than
replacing a current-season figure, and every cap figure in `_validate_sign`
is built for replacement (measured against production 2026-08-07: that shape
reported a team $18.9M *cheaper* for extending a player). Contract start is
derived by reusing `_bird_tenure`'s ledger walk verbatim, including its
synthetic draft-event seed, rather than the separate ledger backfill the
pipeline doc originally sized — see the `[P3]` backlog item. Wired into both
`/transaction-sim` (its own "Extension" tab, not a variant of the signing one)
and the `/transactions` office form (2026-08-21) the same way
`sign_pick`/`convert_twoway` were — team derived from the roster, since § 6.2
means only the incumbent may extend.

### The § 7.1 rookie scale

`rookie-scale.json` in NBS_DATA_DIR, keyed by draft year, 30 rows of **five**
figures. Served by `GET /api/rookie-scale`; `/rookie-scale` renders it (public
read, editing gated on `rosters`) and `GET /api/rookie-scale/contract/{slug}`
returns one player's prescribed deal ready to load into a contract form.

**Five figures, not four.** Years 1–4 are the contract (§ 7.1: Years 3 and 4 are
team options); the fifth is the **§ 3.10 RFA cap hold** the deal rolls into, at
250% of Year 4 for picks 1–2 and 300% for picks 3–30. Season keys are derived
from the draft year (2026 → 26-27 … 30-31), never read from the sheet's header
row, which has been stale by a year before.

`_rookie_scale_contract` is the one reader: the validator scores against it and
the office form prefills from it, so the prescribed deal is stated once.

**Loading it:** `build/load_rookie_scale.py` reads the league sheet's
`{year} Rookie Contracts` tabs. Two things it refuses to do, both because the
data has actually been wrong: it reads **columns F–J only** (L–P are the
underlying NBA figures and are stale on the 2026 tab, so re-deriving 120% × base
yields last year's contract), and it verifies each table against every already-
signed contract from that draft plus a § 3.10 direction check before writing.
Years that fail are skipped and named, not written.

**2024 is deliberately not loaded.** Its multiplier is inverted — picks 1–9 take
300% and 10–30 take 250%, where § 3.10 puts the *higher* multiplier on the
*lower* salary (2025 and 2026 both do). Its boundary sits at ~$7.7M against
~$16M for the other two years, and two 2024 bios (McCain #10, Carter #11) already
carry the corrected convention while picks 12–30 don't. Needs a league ruling,
not a code fix.

### § 3.8 Bird Rights tenure

`_bird_tenure(slug, team, season, bio)` derives continuous service from the
**transaction ledger**, not from `bio["contracts"]`. That field is a
projection of the ledger written only by `_apply_sign` / `_apply_sign_pick` /
`_apply_convert_twoway` (each entry carries a `txn_id` back-pointer), so it is
empty for ~95% of players, can never express a trade, and will never
retroactively fill — the 1,178 backfilled signings went through
`_append_historical`, which by design doesn't touch bios. Don't reintroduce it
as a tenure source; it's the same denormalized-copy trap as the old roster-CSV
`OVR` column. It remains the right place for contract *terms*.

The model (`tests/test_bird_rights_tenure.py` pins all of it):

- A **trade carries** the clock — § 6.2 recognises Bird Rights held "via trade".
- **Re-signing your own free agent continues** the clock; § 3.8 is about teams
  re-signing their own free agents, so a reset would make Bird rights
  single-use.
- Signing with a **different team**, or a **release**, resets it.
- The **draft seeds** the timeline, so drafted-then-traded resolves to the
  current holder.
- A trade with **no earlier record** yields a lower bound only (`basis:
  "trade_floor"`).

**Only over-declaration errors, and only from a definite basis.** This
asymmetry is the safety property: a ledger gap can only make derived tenure
look *longer* (the most recent signing visible is an older one), so "declared
above derived" cannot be manufactured by missing data. `trade_floor` and
unknown bases warn instead. **Unknown is never Non-QVFA** — a player with no
record is typically a long-tenured one, so defaulting them to Non-Bird would
invert the truth.

Coverage is 483/487 rostered players. Verified against all 14 real Bird
signings in the ledger: 12 pass, 2 warn, 0 false-positive errors.

`_check_bird_rights_declaration` also takes `method`, which closes a real hole:
`_check_signing_method_funding` returns early for any method outside the
cap-space/MLE family, so `signing_method="bird_rights"` used to bypass funding
validation entirely *and* unlock § 3.13's 8% raise ceiling.

The ledger index is cached against `transactions.json`'s (mtime, size) —
the simulator revalidates on a 250ms debounce, and re-parsing ~2MB per
keystroke is pure waste.

**`_preview_fa_hold` must simulate the apply-time bio, not the current one.**
`_apply_sign`/`_apply_sign_pick`/`_apply_convert_twoway` all append the deal
being signed to `bio["contracts"]` *before* pricing its own trailing § 3.10
hold, on purpose — a player signing a 3-year deal will, by the time its
trailing hold season arrives, actually have played those 3 years, so they
count toward the tenure that prices it. `_derive_bird_tier`'s ledger path
(`_bird_tenure`) gets this for free from real elapsed calendar time, but its
fallback (no acquisition record on the ledger — `_bird_tenure` reports
`"unknown"`) scans `bio["contracts"]` directly, so it only sees those extra
years if they're actually in there. `_preview_fa_hold` used to derive tier
from the bio exactly as it stood, never the deal being typed — so a fresh
signing to a player with no ledger history could preview as Non-QVFA (no
EAPS needed, `f-eaps-field` hidden, verdict green) purely because apply
hadn't yet appended the years that would flip the fallback to QVFA, and then
422 at submit demanding `eaps_assumption` from a form that had no reason to
ask for it. Fixed 2026-08-12 by having the preview build the same probe bio
apply will (`bio["contracts"] + [{team, salaries}]`) before calling
`_derive_bird_tier`, so the two paths can no longer disagree about the tier.
`tests/test_fa_hold_calc.py` pins `_preview_fa_hold`'s no-mutation guarantee,
which this still holds — the probe's `contracts` list is a new list, never
`bio["contracts"]` appended in place.

### Owner self-serve roster moves

Team pages carry a per-player **⋯ menu** offering moves the viewer is actually
entitled to make. Built by `makeRosterMoveActions` / `openMovesMenu` in
`teams/team.js`. Actions the player is ineligible for are shown **disabled with the
rule-citing reason**, not hidden — "why can't I renounce him?" is a rules question
and the menu is where it gets answered.

Rendered in the **Rosters and Contracts** roster views (`MOVE_MODES`), not Stats or
Ratings. Rosters is the default tab, so gating it to Contracts alone made the
feature invisible to the owners it exists for.

**Getting a token in the first place:** the roster header has a `#team-signin-btn`
shown only when `/api/auth/me` resolves to no roles. It is not decoration — every
other affordance on a team page that prompts for a token (`attachEditBtn`, the
Team Settings tab) is gated on roles that require a token to already be stored, so
without it a team owner who isn't on the committee had no way into their own tools
at all. `hadStoredToken` is snapshotted *before* the page's fetches, since the first
request to 403 clears a stale token and would otherwise erase the difference between
"never signed in" and "token revoked".

Two permission tiers, and they are genuinely different:

| Action | Gate | Endpoint |
|---|---|---|
| Add/remove from trade block | team's own role **or** admin (`canEditTradeBlock`) | `PUT`/`DELETE /api/trading-block/{team}/player/{slug}` |
| Renounce (§ 3.10) | **owner tenure** (`canRenounce`, server: `auth.is_team_owner`) | `POST /api/self/renounce` |

**Ownership is a tenure position, not a role.** Every front-office member of a
team carries the team role (`phx`, `bkn`, …) — it gates cosmetic/soft writes like
jersey numbers and the trading block. Only a member with a *current* `owner`-position
tenure in members.json may move real roster state, so a GM or coach passes the role
check and fails `is_team_owner`. `GET /api/auth/me` returns `owner_of` computed by
that same function, so the UI can't offer a move the API would refuse. Admin passes
everything, consistent with every other check in `auth.py`.

The scoped trading-block endpoints exist because the whole-block `PUT` is a
last-write-wins replace — fine for the `/tradeblock` editor which owns the entire
form, wrong for a one-click add from the roster page, where a stale read would
silently wipe the rest of the team's listing.

Renounce is the dangerous one and is treated accordingly: the confirm dialog runs
`POST /api/validate/renounce` and shows the room freed, the resulting roster count
against the § 2.1/§ 2.1a floors, and the § 3.8 Bird tenure being forfeited, then
requires typing the player's surname. Every renounce stores a `_snapshot` of the
bio state it erases; `rescind_renounce` restores from it via the **undo** button on
renounce rows in `/transactions`. See `nbn-api/docs/transactions.md` for both types.

### Offer sheets are two transactions (§ 3.15)

`offer_sheet` extends the offer; `offer_sheet_decision` records the incumbent's
answer and does the signing. Two decisions by two different teams, so two records.

**This is a deliberate return to a design that previously broke — read this before
touching it.** An earlier two-step version was merged into one transaction because
an offer could be submitted with no follow-up, silently leaving the player on
nothing but their old RFA hold (it bit Dyson Daniels' matched sheet in production;
`_apply_offer_sheet_decision`'s docstring carries the history). Three things make
the split safe, and removing any one of them reintroduces the bug:

1. **Pending is enumerable.** `_open_offer_sheets()` derives every unresolved
   offer from the ledger — an offer is open exactly when no `offer_sheet_decision`
   names it. No second store, so nothing can drift from the transactions it
   describes.
2. **Pending costs money.** `_pending_offer_hold` charges the offering team a cap
   hold equal to the offer's **Year 1** salary, inside `_compute_team_salary`, for
   as long as it's open. A hold is a single season's charge, so the multi-year
   total isn't the figure § 3.15 means. Counted against the Cap but not hard
   cap/apron, exactly like the UFA/RFA holds it sits beside (§ 3.10).
3. **Pending is loud.** `GET /api/offer-sheets/open` backs a banner on both teams'
   pages and a panel at the top of `/transactions`, flagged `overdue` past the
   48-hour deadline. Nothing auto-resolves — silently moving a real player on a
   timer is worse than a late decision.

`_rfa_eligibility` is the single eligibility rule, shared by the validator and the
apply path. It tests the **current** season on purpose: `_apply_sign` refuses a
cross-team signing unless the player carries a current-season UFA/RFA hold, so an
"earliest hold" reading accepts a player still under contract — the offer
validates, holds real cap room, then fails at the decision. (Verified the hard
way; `tests/test_offer_sheets.py` pins it.)

Decision-time validation checks the **incumbent's** hard cap on a match — a team
may exceed the Cap to keep its own free agent, but a hard cap still binds (§ 1.3).
Nothing checked that before the split.

Three legacy combined entries carry their own `outcome` and were applied on
submission. They read as already-resolved everywhere and are not migrated.

### Discord transaction notifications

`routers/discord_notify.py` posts an embed to Discord for every **live**
transaction, using the existing `DISCORD_BOT_TOKEN` (same channel-post endpoint
as `misc._notify_join_discord`). Set `DISCORD_TXN_CHANNEL` in `.env` to the target
channel id; **unset, the module is a complete no-op**, so it is safe to deploy
before the channel exists.

**Delivery lives in `routers/discord_transport.py`**, shared with `fa_notify`
(below). One paced queue and one worker process-wide: two modules each pacing
themselves correctly would still collectively exceed Discord's rate limit. The
burst cap is keyed **by channel**, so a runaway on one feed can't silence
another, and each module sizes its own. `transport.send` takes a callable
payload built only *after* the gates pass — a transaction embed loads every
player bio, and refusing a message has to stay cheap.

The load-bearing requirement is negative — *the channel must never receive a
dump*. 1,935 of the ledger's 2,241 entries are backfill, so any path that iterates
it and notifies would fire ~2,000 messages and rate-limit the bot. Three
independent gates enforce that; all three must be defeated at once for a flood:

1. **Call-site opt-in.** Only the two live submit paths (`POST /api/transactions`,
   `POST /api/self/renounce`) call `notify_transaction`. `_append_transaction` is
   deliberately *not* the hook — it's also the append path for `_append_historical`.
   There is no startup, replay, migration, or scheduled hook that notifies.
2. **Freshness.** A transaction whose `created_at` is older than `MAX_AGE_SECONDS`
   (300s) is never announced. This makes replaying old entries structurally silent
   regardless of caller intent.
3. **Burst cap.** `MAX_BURST` (250) messages per `BURST_WINDOW` (900s), plus a
   `MAX_QUEUE` (400) backlog ceiling. A runaway loop posts 250 and then goes quiet
   with a log line.

**Sizing gate 3 is measured, not guessed** — get this wrong in either direction and
you either spam the channel or silently lose a busy day. From the real ledger:
busiest single day **52** live transactions (2026-06-21), tightest actual 10-minute
burst **19**. Draft day is expected to beat both (~30 pick signings plus trades,
50+). An earlier 20/300s setting would have clipped that real 19-transaction burst.
`tests/test_discord_notify.py` pins those figures, so if league activity outgrows
them a test fails rather than messages quietly going missing.

**Delivery is a paced queue, not a thread per message.** Discord rate-limits channel
messages at roughly 5 per 5 seconds; firing a draft day's worth concurrently would
429 most of them, and a dropped announcement is worse than a late one. A single
daemon worker drains `_queue` at `SEND_INTERVAL` (1.25s, ~4 per 5s) and honours the
`retry_after` Discord returns, retrying up to `MAX_RETRIES`. A 4xx that isn't a rate
limit (bad channel id, bot not in the guild, missing Send Messages) fails fast — it
won't fix itself. A draft day drains in about two minutes.

`tests/test_discord_notify.py` proves each gate independently — including that
replaying all 2,241 entries sends zero messages, and that a 429'd message is
delivered rather than dropped.

**Contract shorthand mirrors `teams/team.js`'s `summarizeContract`** — `2+1 PO`,
`1 NG+1 TO`, tags PO/TO/NG. Divergent shorthand for the same deal is worse than
none, so `_contract_str` reimplements that function's rules, including treating a
trailing UFA/RFA line as the hold the deal *rolls into* rather than a contract year
(counting it would inflate the total on every deal that has one). Contract-carrying
types also get a `Year by year` field: a code block of per-season figures with
option/non-guaranteed years labelled.

**Offer sheets name the destination, never an arrow.** `details.teams` is stored
`[offering, retaining]`; joining them with `→` stated the opposite of what happened
on a non-match, where the player leaves for the *offering* team. `_headline_team`
resolves whoever actually ends up with the player, and the roles are labelled
("CLE offering · SAC incumbent") rather than implied by ordering.

Enqueueing happens outside the API lock, after the roster write and ledger append
are already committed: Discord being down must never delay or fail a transaction.
Forced transactions (`force: true` overriding a failed check) are posted with the
overridden check names and a distinct colour — the override is already in the ledger
as `_forced_checks`, this just surfaces it. Owner self-serve moves are marked in the
footer via `details._source`.

### Team-facing FA offers

The ⋯ menu and offer form on `/free-agency` (spec § 8.1). **One gate on the whole
object** (§ 6.0) — any holder of the team's role drafts *and* submits:

| Action | Gate | Endpoint |
|---|---|---|
| Create / edit / delete a **draft** | any holder of the team's role | `POST`/`PATCH`/`DELETE /api/fa/offers` |
| **Submit** (and resubmit a remanded offer) | any holder of the team's role | `POST /api/fa/offers/{id}/submit` |

Submit was owner-only (`is_team_owner`) until 2026-08-10, mirroring the split team
pages draw between the trading block and renounce. **That split doesn't transfer**:
a renounce destroys roster state immediately, while an offer goes to a committee
that reviews and can remand it — so the owner tier bought no safety and cost the
team its FFA window (§ 4.1) whenever the owner wasn't around. `submitted_by` and
`created_by` still record who did which. The team is always derived from the stored
offer, never from the request body, so the role is the only thing that widened.

Three rules this page holds and must keep holding:

- **No cap math in the page.** Every dollar comes off the fact sheet
  `POST /api/validate/sign` returns, or off `GET /api/fa/commitment/{team}` —
  the same `_team_commitment` the committee's review page renders. A team can
  never be shown room the validator didn't credit it with.
- **No reason string is composed client-side.** The disabled ⋯-menu copy is
  `reason` from `GET /api/fa/board`, i.e. the server's `_accepts_offers`. That
  is why the board lists closed players too (§ 6.3).
- **The FA pool is not the offerable set.** `GET /api/fa/pool` returns everyone
  with an actionable cap hold *on file*, keyed by the year it lands — it spans
  future league years, because `/free-agency`'s year chips are built from it
  (570 entries, 209 of them current, as of 2026-08-09). Each entry carries
  **`current`**, stamped by the same `_is_current_fa` that gates
  `_accepts_offers`. **Read `current`; never re-derive it** — a `class_year`
  comparison alone gets `RENOUNCED`/`UNSIGNED` wrong, and they are 132 of the
  209. This caught out both the team ⋯ menu and the head's "+ Player" picker.
- **Submission is final at the team's initiative** (§ 4.3). There is no withdraw
  endpoint and no post-submit edit — a submitted offer opens read-only. The only
  ways back are both the committee's: a **remand**, after which the same form
  reopens with the committee's notes pinned above it and the frozen prior figures
  beside each year input, or a **void** (§ 4.3b, below), after which the team may
  bid again from scratch.

The client legality check is advisory: the server re-runs `_validate_sign` at
submit and *that* verdict is what's stored. There is no `force` on this path,
for the same reason `self_renounce` has none.

### The agent stage (§ 4.7) — who curates what the committee sees

A third role, `agent`, sits between a closed offer window and a sub-committee
ballot. Agents **claim** free agents off a shared queue (no per-player
assignment, no head handing them out), negotiate the offers down to a final set,
then either **advance** the survivors to a sub-committee or **finalize** an
uncontested one. `fac_head → {fac, agent}`, which is the fallback that keeps the
stage from deadlocking; `agent` and `fac` are meant to be **different people**,
by role-grant convention rather than by a check.

Four things to know before touching it:

- **The stage is derived, never stored** — `_agent_stage` reads `status`, the
  FFA clock, `agent.advanced_at` and the finalize record. `open` →
  `awaiting_agent` → `with_agent` → `with_committee` → `decided`.
- **A claim bars the agent's own team from bidding, permanently.** It survives
  a release *and* a reopen (`blocked_teams` lives on the player, not the claim),
  which is the only reason releasing is safe to allow — otherwise it's a way to
  read every rival's figure and then bid. This is the **one hard block** in a
  subsystem that otherwise only warns about conflicts (§ 4.6 / D21). The barred
  team reads it as `your_block` on `GET /api/fa/board` — the one authenticated
  field on a public payload, scoped to the team it stops, since *which agent
  claimed whom* is committee information.
- **Filtering an offer out is a void, not a new status** — so the team is told
  why through the same `void.reason` machinery that already reaches their ⋯ menu
  and their re-bid form. This **reverses D14**: remand/void/restore are the
  claiming agent's plus head/admin, and assigned sub-committee members have
  none of them. A reviewer who wants a term changed asks the agent, or asks the
  head to `return-to-agent`.
- **Nothing is balloted before the advance**, gated in the API and not only in
  the dashboard. Agents never see a ballot, on any player. `final.path` records
  `agent` vs `committee` — the route, not the actor.

Negotiation itself happens in Discord; the site models only what it *changes*
(remand → revision → version diff). No message thread, no counter-offer object.

### Voiding an offer (§ 4.3b) — a status, not a delete

`POST /api/fa/offers/{id}/void` takes a `submitted`/`returned` offer out of play;
`POST /api/fa/offers/{id}/restore` undoes it. **Head-only** (`fac_head`/admin),
unlike a remand, which any assigned reviewer may issue: a remand asks the team a
question and the team can answer, and nobody can answer a void.

It exists because a remand leaves the bid **live** — on the ballot, in the team's
§ 5.3 exposure, holding its one-offer-per-player slot — which is wrong when the
offer should never have counted at all (wrong player, duplicate, team since ruled
ineligible). Those otherwise sit `returned` forever, listed as awaiting a team
with nothing to say.

**The whole implementation is that `voided` is not in `LIVE_STATUSES`.** Every
consequence falls out of the existing `_is_live` gate — off the ballot, out of
`_team_commitment`, no § 4.6 conflict, slot freed, no edit/resubmit/remand. Don't
add a parallel rule anywhere; extend `_is_live`'s callers instead.

Four things that are load-bearing and pinned by `tests/test_fa_offers.py`:

- **A reason is required**, and it is what the team is shown — in the ⋯ menu and
  above the form when they re-bid. Server-composed, like every other refusal
  string on `/free-agency`.
- **Restore returns `void.from_status`, not a guess.** A voided *remand* comes
  back `returned` with its notes still unanswered, or the void would have
  silently answered them. Refused if the team has since bid again (D5).
- **Ballots already cast are flagged, never rewritten** — `voided_since` on each
  ballot, `voided_options` on the finalize record. **Totals are never adjusted**:
  redistributing balls nobody redistributed is the software inventing a vote.
- **Finalize archives voided offers with the live ones**; `unlock` un-archives
  both. They belong to the round they were bid in.

On `/free-agency`, `MY_VOIDED` is deliberately a second map beside `MY_OFFERS` —
a void frees the slot, so one player can carry both a void and a fresh live
offer, and one map would have them fighting over the key.

**On the committee side, the ballot widget is gated on *assignment*, never on
being the head.** `PUT /api/fa/players/{slug}/ballot` is the one endpoint in the
API that does not wave `admin` through — a ballot is a vote, not an
administrative action — so gating the UI on "is head" would offer a vote the
server refuses. A head who isn't on a player's sub-committee sees the totals and
the finalize button and no inputs. Finalize, unlock and assignment are the
head's real powers and are separate endpoints.

### PDC free-agency Discord feeds

`routers/fa_notify.py` (spec: `docs/pdc-free-agency-spec.md` § 9) posts the FA
pipeline's events to two channels with deliberately different appetites:

| Channel | Env var | Gets |
|---|---|---|
| `pdc-alerts` (private) | `DISCORD_PDC_CHANNEL` | Everything: offer submitted/resubmitted with a **diff vs the version frozen at the remand**, remands with their note and conflict flag, voids/restores with the head's reason and the terms removed, mode changes, rounds, clock start/expiry, finalize totals |
| `fa-news` (public) | `DISCORD_FA_NEWS_CHANNEL` | **FFA mode only**, and only clock events: clock started, window closed, and window extended/reopened by the head |

Each is inert without its own env var, which is how it rolled out (module, then
private channel, then public last).

**No team abbreviation and no `$` may ever reach `fa-news`** — that a team is
bidding is committee information. This is enforced by signature, not by care:
`_news(slug, text)` is the only function that can reach the public channel and
it cannot be handed an offer. `tests/test_fa_notify.py` asserts it against
rendered output.

**How long an FFA window runs is the head's setting** (`PUT /api/fa/ffa-window`,
default 24h, 1–168), not a constant and not a rulebook rule. It is read in exactly
one place — `_start_ffa_clock`, which stamps `deadline` *and* `window_hours` onto
the player's clock — so a change applies to clocks started from then on and to
nothing already running: it can't move a deadline a team is bidding against, and
shortening it can't retroactively close an open window. Every string naming a
length (the § 8.1 refusal, both § 9.2 posts, the dashboard) goes through
`ffa_window_label` on *that clock's* stamp, never the current setting. Don't add a
reader of the setting anywhere else.

**One named exception, and only one: `POST /api/fa/players/{slug}/ffa-extend`**
(head-only, required reason). It moves *one* player's deadline — the thing the
setting may never do — and is safe for the reasons the setting isn't: one player,
by a named actor, with a reason, announced on both channels before anyone can act
on it. It works on a lapsed clock as well as a live one (extending from
`max(now, deadline)`), recomputes `window_hours` so `ffa_window_label` keeps
describing the window that actually ran, and clears `closed_posted` so a revived
window's second expiry is still announced. `_start_ffa_clock` is untouched and
still reads the setting exactly once.

**Extending is not reopening, and confusing the two loses a round of votes.**
`PUT /api/fa/players/{slug}` with `status: "open"` clears `ffa` and mints a fresh
`round_id` — a deliberate *second* window, with ballots already cast left in the
old bucket. `ffa-extend` keeps `round_id`, the offers and the ballots, and only
buys time. Both are on the player view's "FAC Head controls" (`windowControls` /
`extendModal` in `pdc/index.html`), and the Open button confirms what it will
discard when a clock exists.

Expiry has no scheduler (§ 4.1) — `free_agency._sweep_ffa_expiry` announces from
whichever read request first observes a deadline has passed, stamping
`ffa.closed_posted` under the lock *before* sending so simultaneous observers
produce one post. Nothing consults that stamp for offerability, so it can't
reopen a player; and a window that expired more than a day ago is stamped but
never announced.

### The #roster-log mirror

`routers/roster_log_relay.py` is the one place the API **reads** Discord. It
polls `#fa-news`, `#transactions`, `#waivers` and `#roster-log-nbn-today` every
60s and reposts new **parent** messages into `#roster-log`
(`DISCORD_ROSTER_LOG_CHANNEL`) verbatim, replacing the hand-copying that fed that
channel. Bot posts are relayed per source: skipped on `#fa-news` (our FFA clock
posts aren't sheet changes; the humans there post the signings, renounces, team
options and guarantees, and all of those go through untouched), relayed on
`#roster-log-nbn-today`, whose embeds are collapsed to text. Each entry lands as a
bare card (description + colour, no title or source label) purely so consecutive
entries have an edge. The same event arriving from two sources is relayed twice on
purpose.

It relays, it never interprets — no summarizing and no deciding whether a message
"is" a transaction, because a human enters what the line says. Full rules, the
four anti-dump gates, and the admin endpoints for carrying an older message
across (`GET/POST /api/roster-log/*`) are in `nbn-api/CLAUDE.md`.

**Per-transaction opt-out.** The office form at `/transactions` has a "Also post
to #roster-log" checkbox, **off by default** — most transactions are typed into
#roster-log by hand as part of working them, so mirroring by default would
double every one up. Checking it sends `relay_to_roster_log: true` on
`POST /api/transactions`; `discord_notify` stamps the decision into that
transaction's embed footer rather than storing it anywhere the relay would have
to look up separately, and the relay's `_opted_out` reads it back off the same
message it's already relaying.

### Tradeblock Discord notifications

`/tradeblock`'s edit panel has an "Also post to Discord" checkbox, **off by
default**, next to Save. Checked, it sends `notify_discord: true` on
`PUT /api/trading-block/{team}`; `roster_picks.put_trading_block` diffs the
save against the block as it was before writing, and — only if something
actually changed — `routers/tradeblock_notify.py` posts a plain-text line to
`DISCORD_TRADEBLOCK_CHANNEL`: `**{member}** ({TEAM}) added X, Y to the
tradeblock and removed Z.` Players and picks share one added/removed list;
a pick reads `2027 1st` for the team's own or `2028 2nd (NYK)` for one it
acquired.

**This is for manual edits only, and there is no separate flag that makes
that true — it falls out of who calls the notify function.** A player also
comes off the block automatically when they're traded away
(`_scrub_trading_block`, called from `transactions.py`'s apply paths), and
that path never touches `tradeblock_notify` — only the `/tradeblock` save
button does, and only when the box is checked. Extending notification to any
other write path (the roster-page ⋯ menu's scoped `PUT`/`DELETE
/api/trading-block/{team}/player/{slug}`, say) means adding a call there
deliberately, not toggling a shared setting.

### Unlockable themes

Two themes are free (`nbn-today` dark, `nbn-today-light`); **every other one is
bought once with NB¥ at a flat 1,000** — Lavender Rose, and one theme per team.
Priced flat on purpose, own-team included: 1,000 sits between the two existing
NB¥ sinks (a cosmetics update at 500, an avatar at 5,000) against a median
member balance of ~2,250.

**Entitlement is server-side; selection is not.** `nbn-api/routers/themes.py` is
the only thing that decides who paid for what, storing it in
`members[name]["cosmetics"]["themes"]` beside the name colour, and returning it
on the `/api/members/me` the nav already fetches. Which theme a browser is
*showing* stays in `localStorage`, because `nav.js` applies the theme at the top
of the file, before any fetch — waiting on the network to paint would put a
flash of the wrong colours on every page load for every visitor, in exchange for
guarding a palette whose CSS is public either way. So the page is trusted to
render honestly and only the charge is guarded. `_canUseTheme` falls back to the
default for a locked id, which is about a fresh browser rather than about theft.

| Piece | Where |
|---|---|
| Catalog, price, purchase | `THEME_PRICE` / `LIVE_TEAM_THEMES` — `nbn-api/routers/themes.py`; `GET /api/themes` (public), `POST /api/members/me/themes/{id}` |
| Picker, lock state, buy flow | `_themeMenuItems` / `_unlockTheme` — `nav.js` |
| Colours | `css/theme.css`, one `:root[data-theme="…"]` block of 59 tokens each |
| Team blocks | **generated** by `build/make_team_theme.py` from `build/team-colors.json` |

Four things to know before touching it:

- **`nav.js` hardcodes only the two free themes.** It is on every page including
  signed-out ones, and a picker that can't render without a successful fetch
  disappears whenever the API hiccups. Everything else comes from
  `GET /api/themes`, cached in `localStorage` so it paints on first load. **No
  price is ever written in the page**, and the 402 refusal string is the
  server's — the same rule `/free-agency` follows.
- **Locked themes stay in the menu with their price**, not hidden — the same
  "disabled with the reason" pattern as the roster ⋯ menu and the suggestions
  Edit button. The price *is* the reason. Clicking one **applies it for real**
  and asks whether to keep it; the preview touches only the `data-theme`
  attribute and never `localStorage`, so cancelling (or Escape, or the scrim)
  reverts with nothing stored and nothing charged. Buying blind off a name was
  the thing to avoid — "Suns" says nothing about reading tables in it.
- **Team blocks are generated, and regenerating overwrites hand-edits.** The
  recipe: keep the dark theme's *lightness* for every token and change only the
  hue — primary hue for backgrounds/borders/text at a low chroma, accent hue for
  the accent family, semantic colours (danger/success/gold) left alone so red
  still means alarm. `--text-on-accent` is *computed* black-or-white, which is
  what stops the gold and silver teams shipping unreadable buttons. Contrast
  repair is capped at what the same token already achieved in the dark theme, so
  a team theme inherits that theme's contrast character exactly — never worse,
  and never silently better. Verified: `team-phx` and `nbn-today` return the
  **same 38 failures** across the same audited pages.
- **A team is only listed once its block exists.** `LIVE_TEAM_THEMES` in the API
  is the gate; adding a team there without generating the CSS sells 1,000 NB¥ of
  nothing. `bash build/check_theme_catalog.sh` checks the two repos agree, and
  `bash build/contrast_audit.sh team-xxx` is what actually clears a new theme.

Adding the remaining 29:

```bash
python3 build/make_team_theme.py --all --write   # or one abbr at a time
bash build/contrast_audit.sh team-bos            # must match nbn-today's count
# then add the abbr to LIVE_TEAM_THEMES in nbn-api/routers/themes.py
```

> `build/team-colors.json` is the generator's colour source. Three older
> hardcoded copies of team colours still exist (`champions/index.html`,
> `frivolities/index.html`, `nbn-api/routers/discord.py`) and are **not** fed
> from it — unifying them is a separate job.

### Suggestions board

`/suggestions` is the member-facing idea board (`routers/suggestions.py`,
`suggestions.json`). `BACKLOG.md` is the internal list; this is the one members
can write to. Suggestion **numbers come from a monotonic `seq`**, never from
`max(existing)`, so a number is a permanent reference even after deletions.

| Endpoint | Auth |
|---|---|
| `GET /api/suggestions` | public |
| `POST /api/suggestions` | any member token |
| `PATCH /api/suggestions/{id}` | author (title/description, while open) · bod/admin (anything, any status) |
| `DELETE /api/suggestions/{id}` | author while open · bod/admin any time |
| `POST /api/suggestions/{id}/comments` | any member token, **any status** |
| `PATCH`/`DELETE /api/suggestions/{id}/comments/{cid}` | comment's author · bod/admin |

**One thread, two kinds of entry.** `suggestion["comments"]` holds both
`kind="comment"` and `kind="status"` entries in a single append-ordered list, so
the ordering between a decision and the discussion around it is real rather than
reconstructed at render time. A status entry (`{from, to, author}`) is appended
by `PATCH` whenever the status actually changes — a no-op change appends
nothing. **Status entries are the record: they are never editable or deletable**,
by the author or by BOD. Only comments are.

Commenting is deliberately allowed on every status, including `complete` and
`closed` — posting updates as a suggestion is worked, and after it lands, is the
whole point. Editing the suggestion *body* is not: once BOD triages it, the
author can no longer rewrite what was triaged, and the page shows the Edit
button **disabled with that reason** rather than hiding it, pointing at the
comment thread instead.

Suggestions predating comments have no `comments` key; `list_suggestions`
defaults it in the response so no client guards for its absence, without
writing the key back. `tests/test_suggestions.py` pins all of the above.

### Member management

Members are the canonical identity for all league participants. Stored in `/var/lib/nothing-but-stats/members.json` as `{ "username": { "token": "<hex>", "roles": [...], "tenures": [{team, start, end, position}] } }`.

The member name (key) is the canonical name that matches `owner` in `owners.csv` and `owner_stats.csv` — this is the join key between the members system and the stats pipeline.

**Tenure positions:** `owner`, `gm`, `coach`, `none`

Member management UI is at `/members/`. Admin creates members (token auto-generated, shown once). BOD can edit tenures. Token rotation and deletion are admin-only.

**Create a member** (use the UI at `/members/` — token is shown once in-browser):
```bash
curl -X POST https://nbn.today/api/members \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "username", "roles": ["rosters"], "tenures": []}'
```

**List all members (public):**
```bash
curl https://nbn.today/api/members/public
```

**List all members with tokens (admin):**
```bash
curl https://nbn.today/api/members -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Update member roles (admin) or tenures (admin/bod):**
```bash
curl -X PATCH https://nbn.today/api/members/username \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roles": ["rosters", "phx"], "tenures": [{"team": "PHX", "start": "2020-07-01", "end": null, "position": "owner"}]}'
```

**Rotate a token:**
```bash
curl -X POST https://nbn.today/api/members/username/rotate-token \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Delete a member:**
```bash
curl -X DELETE https://nbn.today/api/members/username \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

The old `/api/tokens/*` endpoints remain as compatibility shims backed by members.json.

### Service management

```bash
systemctl status nbn-api          # check status
sudo systemctl restart nbn-api    # restart
journalctl -u nbn-api -f          # live logs
journalctl -u nbn-api -n 50       # last 50 log lines
```

### Achievement NB¥ awards (background job)

`build/achievement-notify.js` (Node) awards NB¥ whenever a member unlocks or
upgrades an achievement. Achievements are computed statelessly in the browser,
so this job recomputes them server-side using the **same** engine the site uses
(`members/achievements.js`, which is `require()`-able under Node), diffs against
the snapshot `achievement-state.json` in NBS_DATA_DIR, and awards on every tier
upgrade by calling `POST /api/bets/admin/adjust` (which writes the balance +
ledger under the API lock). It uses an admin token read from members.json.

Reward scale (by tier): bronze 250, silver 500, gold 1000, single-tier 500.
Betting/investing achievements are excluded. The snapshot is **monotonic** — an
entry only advances after a successful award, so awards can't double-fire and a
failed award retries next run. The first run (no snapshot) seeds silently, so
existing achievements are **not** awarded retroactively. No Discord/webhook
output — the ledger entry (`Achievement: …`) is the record.

Every included achievement except **Archivist** (the "Clean Up the Poo Poo"
tier — § its own doc, `docs/clean-up-the-poopoo-spec.md`) is scored from
`computeAchData`'s `shared` argument alone, so `scoreAll` can feed every
member `{}` for `perMember` and still get a correct score. Archivist needs a
real per-member `cleanupStats.approved_count`, so `scoreAll` reads
`cleanup-submissions.json` directly (same file `nbn-api/routers/cleanup.py`
writes) and builds it per member before scoring — the one category that
isn't just `{}`. Client-side rendering (member profile, members index) gets
the same numbers over `GET /api/cleanup/stats`, since the browser can't read
NBS_DATA_DIR directly.

Run by a systemd timer every 10 min. `DRY_RUN=1` previews without granting,
`NBN_ACH_STATE` overrides the snapshot path, `NBN_API_BASE` the API URL.

```bash
systemctl list-timers nbn-achievements.timer   # next run
journalctl -u nbn-achievements.service -n 20    # recent runs / awards
DRY_RUN=1 node build/achievement-notify.js       # preview pending awards
```

To re-baseline (e.g. after editing the achievement list), delete the snapshot
and let the next run seed it: `rm $NBS_DATA_DIR/achievement-state.json`.

### Roster CSV columns

**Post-migration (new format):**

| Column | Description | Example |
|---|---|---|
| `SLUG` | Player slug (key into player-bios.json) | `barnes-scottie` |

All other player data (name, pos, age, type, cap holds, salaries) lives in `player-bios.json` and is joined at render time. **OVR is not a roster CSV column** — it lives exclusively in `ovr-history.json` (see below) and is joined in at render time via `GET /api/ovr/current`. The roster CSV briefly carried its own `OVR` column as a denormalized convenience copy; that column was dropped (all 30 `{abbr}-roster.csv` files migrated to `SLUG`-only) because nothing kept it in sync with `ovr-history.json` — transaction handlers silently blanked it on every roster-row rewrite, and it had drifted to empty for every player in the league. `ovr-history.json` is now the single source of truth end-to-end; don't reintroduce an OVR column to the roster CSV.

**Legacy format (pre-migration):** columns were `PLAYER, POS, AGE, OVR, TYPE, CAP_HOLDS, 25-26, 26-27, …`. `team.js` handles both formats transparently — if the CSV has a `SLUG` column (and no `PLAYER`), it uses the new path; otherwise falls back to the legacy path.

`CAP_HOLDS` is a legacy CSV column only present in the old roster format. In `player-bios.json`, `cap_holds` is a JSON object keyed by season string (e.g. `{"27-28": "PLAYER_OPT", "28-29": "UFA"}`). Valid types: `UFA`, `RFA`, `PLAYER_OPT`, `TEAM_OPT`, `NON_GTD`.

### Player bios (player-bios.json)

Canonical player data lives in `/var/lib/nothing-but-stats/player-bios.json`, served by `GET /api/players`. Fields:

| Field | Description |
|---|---|
| `name` | `"LAST, FIRST"` uppercase |
| `pos` | Array: subset of `["PG","SG","SF","PF","C"]` |
| `dob` | ISO date `"YYYY-MM-DD"` |
| `college`, `country` | Strings |
| `draft_year`, `draft_round`, `draft_pick` | Integers or null |
| `draft_team` | Abbr of drafting team (`"ATL"`) or null — canonical "who drafted this player" |
| `photo_url` | String |
| `type` | `"player"`, `"two-way"`, `"dead"`, or `""` |
| `cap_holds` | Object keyed by season string: `{"27-28": "PLAYER_OPT", "28-29": "UFA"}` |
| `salaries` | Dict keyed by season string: `{"25-26": "$37,000,000"}` |

Endpoints: `GET /api/players` (public), `POST /api/players` (admin, creates), `PUT /api/players/{slug}` (rosters role, upserts).

### Migration script

`players/migrate_rosters.py` — one-time script to migrate 30 roster CSVs from legacy format to `SLUG,OVR`. Dry run by default; `--apply` writes changes. Run after all team/tradeblock/bio pages are updated to handle new format.

### Picks CSV columns

| Column | Description | Example |
|---|---|---|
| `YEAR` | Draft year | `2026` |
| `ROUND` | Round | `1st` or `2nd` |
| `TEAM` | Origin or destination | `Own`, `from NYK` |
| `TYPE` | Direction | `own` or `acquired` |

## Data model

The core entities and how they relate.

### Player

A player is the stable identity unit across the whole site. The canonical store is `player-bios.json` (served via `GET /api/players`), keyed by **slug** (`"curry-stephen"`).

#### Slug

The slug is the permanent primary key for a player — it ties together the bio, roster entries, OVR history, stats rows, and awards. It is set once at creation (`POST /api/players`) and **never changes**. There is no rename endpoint; changing a slug would orphan every other reference to that player across all CSVs and history files.

#### Fields: set once, never changed

These are historical facts about the player. Correct a typo if you must, but they should not change as a result of in-league events.

| Field | Type | Notes |
|---|---|---|
| `dob` | ISO date | `"1988-03-14"` |
| `college` | string | |
| `country` | string | |
| `draft_year`, `draft_round`, `draft_pick` | int or null | NBN draft position, not NBA — null if undrafted |
| `draft_team` | string or null | Abbr of the team that made the pick (e.g. `"ATL"`); null if undrafted. Canonical source for "who drafted this player" across the site — team Draft History and `/draft` read it. Stamped by the `pick` transaction (Article VII); the picks ledger (`/api/picks`) only covers the live-draft era (2026+), so the bio is the all-years source. |
| `height`, `wingspan` | string | e.g. `"6'8\""`, `"7'1\""` |
| `weight` | int | lbs |

#### Fields: updated occasionally

These change infrequently but can legitimately be updated as better information is available or as in-league decisions happen.

| Field | Type | When it changes |
|---|---|---|
| `name` | string (`"LAST, FIRST"` uppercase) | Typo correction only; not a game event |
| `pos` | string[] (subset of `PG SG SF PF C`) | If the league reclassifies a player's eligible positions. This is the set `secondary_pos` (below) must be chosen from. Distinct from the "Primary Position" shown in the Team Settings tab, which is read from the 2K scrape snapshot (`player-attributes.json` → `2k_pos[0]`, written by `build/scrape_2k_attributes.py`, served via `GET /api/attributes/current`), not from this field. |
| `photo_url` | string | Replaced if a better image is found |
| `jersey_number` | string or null | Set by the owning team in the Team Settings tab (`teams/{ABB}` → Team Settings), via `PUT /api/players/{slug}/team-settings`. Gated strictly by the team's own role — not admin/rosters/bod — since this is the team's own cosmetic choice, not league-administered roster data. |
| `secondary_pos` | string or null (one of `PG SG SF PF C`) | A position the owning team assigns to the player, alongside (not replacing) their 2K-scraped primary position. Must be one of the player's own eligible positions (`pos`, above) — the API rejects any value not in that list. Same Team Settings tab and endpoint/permissions as `jersey_number`. |

#### Fields: change with contract/roster activity

These reflect the current contract state and are updated whenever a transaction touches this player.

| Field | Type | When it changes |
|---|---|---|
| `type` | enum | Changes on transactions: `""` → `"player"` on signing, `"player"` ↔ `"two-way"` on conversion, `"dead"` when a player is cut and only a cap hit remains |
| `salaries` | `{"YY-YY": "$amount"}` | Accumulates across contracts — past seasons are preserved; current-season-onwards entries are replaced by each new contract. The player page displays all entries as career earnings history; roster/tradeblock display code filters to `>= current season`. |
| `cap_holds` | string | Updated alongside `salaries` to reflect the status after each contract year |
| `guaranteed` | `{"YY-YY": "$amount"}` | Guaranteed portion of each year; set when partial guarantees exist |
| `guarantee_dates` | `{"YY-YY": "YYYY-MM-DD"}` | The date after which that season's salary becomes fully guaranteed; cleared once the date passes |

#### OVR (not in player-bios.json)

OVR is **not** stored on the player bio. It lives in a separate append-only log at `ovr-history.json` (served via `GET /api/ovr`), keyed by slug, as an array of `{date, ovr}` entries. The current rating is always the last entry. Updated via `PUT /api/ovr/{slug}` whenever ratings are refreshed (valid range 50–99).

The roster CSV (`{abbr}-roster.csv`) stores the most recent OVR as a convenience column, but `ovr-history.json` is the source of truth for history.

#### Player types

| Value | Meaning |
|---|---|
| `"player"` | Standard roster player |
| `"two-way"` | Two-way contract; salary/cap rules differ |
| `"dead"` | Dead cap entry — no active player, just the cap hit on the books |
| `""` | Unset / not yet classified |

#### Cap holds

`cap_holds` is a JSON object keyed by season string, e.g. `{"27-28": "PLAYER_OPT", "28-29": "UFA"}`. It describes what happens **after** the last contract year — i.e., the player's free-agent or option status in each subsequent offseason.

| Type | Meaning |
|---|---|
| `UFA` | Unrestricted free agent |
| `RFA` | Restricted free agent |
| `PLAYER_OPT` | Player holds option to extend |
| `TEAM_OPT` | Team holds option to extend |
| `NON_GTD` | Non-guaranteed salary year (team can waive without full cap hit) |

### Roster entry

One row in `{abbr}-roster.csv`. Links a player to a team for the current season.

| Column | Notes |
|---|---|
| `SLUG` | Foreign key into `player-bios.json` |

All other display data (name, position, age, salary, cap holds) is joined from `player-bios.json` at render time. OVR is joined from `ovr-history.json` (via `GET /api/ovr/current`) — it is not a roster CSV column (see "OVR" under Player fields above).

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

The flat, legacy `{abbr}-picks.csv` (`YEAR, ROUND, TEAM, TYPE`, `TEAM` values like `Own`, `from NYK`, a trailing `*` for "has conditions") is a coarse write-side/display artifact, not the model — used by `PUT /api/picks/{year}/{rnd}/{orig}` and older code paths. Anything reasoning about *why* a pick is owned by whom goes through `/api/picks` and reads `leaves`, never this file.

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

Key columns: `owner`, `teams` (comma-separated abbrs), `seasons`, `reg_w/l/pct`, `playoff_w/l/pct`, `playoff_appearances`, `po_r2`, `po_conf_finals`, `po_finals`, `championships`, `off_rtg`, `def_rtg`.

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
