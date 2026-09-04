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

> `changelog.json` is ~3,100 lines and 389 entries and grows every commit. **Only
> the first ~10 lines are ever needed** — a new entry goes at the top, and the
> hook rewrites only that entry. Read it with `head`, edit it in place, and never
> re-serialize the whole file (that reflows all 389 entries into one unreviewable
> diff).

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

> **The backlog is `BACKLOG.md`** (~44KB, 37 items) — read it before proposing new
> work, and update it when work lands. It is far too big to read whole for one
> question: `grep -n '^### ' BACKLOG.md` lists every item with its priority in a
> few hundred tokens, then read only the item that matters. Finished items move
> **Everything in it is open** — there are no strikethroughs and no done file
> (`BACKLOG_DONE.md` was deleted 2026-08-25). A finished item is deleted; one
> that leaves a real residual is retitled to name what is *left*, not the part
> that finished. Don't reintroduce a struck-through entry: titling items by
> their completed half made the list read as done and open at once.

## Dev and live — which checkout am I in?

**Both repos are paired. Four checkouts, not two** — and the `-dev` half of each
is where you edit:

| | Path | What it is |
|---|---|---|
| **site, live** | `/home/skim/projects/nbn-today` | what `nbn.today` serves — `/var/www/nbn.today` is a symlink to it |
| **site, dev** | `/home/skim/projects/nbn-today-dev` | what `https://dev.nbn.today` serves, behind basic auth (user `dev`, `/etc/nginx/.htpasswd-dev`) |
| **api, live** | `/home/skim/projects/nbn-api` | what the `nbn-api` service runs. **Every other mention of `nbn-api` in this file is this path**, because ops (`stats_build`, `fetch_trade_votes.py`, `venv/`) genuinely means live — that is not permission to edit here |
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
> path; and it is the only value-level check on the 86 *derived* files, since
> `smoke_test.py` asserts schema and no values. Run
> `python3 -m stats_build.harness port` after any change to the pipeline.
>
> The **raw** corpus those files are built from is checked separately, by
> `nbn-api/stats_build/checks.py` — the Sheets-era `check_allstats()` restored
> on 2026-08-26 and run weekly from `check_stats_integrity.py` (alerts to
> Discord, non-zero exit; `--skip-values` turns it off). Points identity,
> made-vs-attempted bounds, OR+DR=R, PF≤6, per-team minutes, blank fields,
> team score vs its players, W/L, valid team codes, plus two the R build never
> had: **no player twice in one team-game**, and **every PLAYER name resolves
> to a real bio once `PLAYER_FIXES` is applied**. Those last two exist because
> they immediately found four errors nothing else could see.
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
| `GET /api/cap-history` / `GET /api/cap-history/current` | (no page yet) | `cap-history.jsonl` in NBS_DATA_DIR — a daily row per team: salary on both bases, apron position, hard cap, roster counts |
| `GET /api/edits` | `players/index.html` (Edit history disclosure, in the Player History card) | `edits.jsonl` in NBS_DATA_DIR — the value-level diff of every write that bypasses the ledger. Public since 2026-09-01; the player page always scopes it with `key=<slug>` |
| `GET /api/ratings-changes` | `ratings-changes/index.html` | Not a stored file — computed per request by diffing consecutive snapshots in `player-attributes.json` (NBS_DATA_DIR). No separate log to keep in sync; a scrape run that changes nothing produces nothing here. Each snapshot's `team` is stamped by the scrape at the time it ran (from `data/*-roster.csv`, never reconstructed from the transaction ledger, which has real backfill gaps) — `null` on snapshots taken before that field existed |

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
- `allstats-playoffs-26.csv.bak-round-fix` — **kept on purpose, do not sweep it.**
  The pre-round-fix state of that playoff file, from before `nbs-backup.git`
  existed (2026-08-18), so it is the only copy of that state anywhere. Every
  other stale `.bak` in this directory was deleted 2026-08-29; this one was held
  back because the rule below is that a copy of unrebuildable data is never
  deleted on a judgement call, and 182KB is not worth making one.

> These two are the only files on the box that cannot be rebuilt, and they are
> **append-only by contract**: the API writes them through
> `nbn-api/routers/allstats_guard.py`, which refuses a write that shrinks one,
> that rewrites rows already on disk, or that would drop a column an older
> season has (they do differ — no `OPP_RAW` before 24-25). A weekly
> `nbs-integrity.timer` re-checks row counts and hashes a closed season can
> never change, and runs the value-level checks in `stats_build/checks.py`.
> Details in `nbn-api/CLAUDE.md` § "Protecting the raw box scores"; the plan
> they come from is `docs/dev-deploy-setup-spec.md` Phase 2.
>
> **To correct a row that is already on disk, use `nbn-api/edit_allstats.py`.**
> It is the one sanctioned way through the append contract, and it is a second
> contract rather than an exemption: dry-run by default, it refuses a `--where`
> matching more rows than you named, and it verifies the write against disk cell
> by cell so it cannot change anything it did not declare. Every applied edit
> needs a `--reason` and lands in `allstats-edits.jsonl` — the only record of
> why a hand-corrected row differs from what was parsed, since the screenshots
> are deleted. **Do not reach for `allow_shrink=True` instead**: it disables
> every check at once, which is right for a migration and wrong for a cell.
> Adding or removing rows is deliberately not supported.
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

**Nothing to do.** The season's raw file is created on demand, by whichever of
the build or the first commit gets there first (`nbn-api/allstats_files.py`),
with the header copied verbatim from the previous season. Same for
`allstats-playoffs-<YY>.csv` at the start of a postseason.

That is worth knowing about rather than ignoring, because the alternative bit
once and would again. The rollover is the **July 1 league year**
(`nbn-api/season_clock.py`, overridable per season in `league-state.json`) — not
the September date the sim season starts on. So from July 1 the build resolves a
season whose file cannot exist yet; before 2026-08-26 it exited 2 there, and
`build.sh` runs under `set -e`, so **every build failed** from the rollover
onward. Nothing triggers a build in the offseason, so it stayed invisible for
five days and would have surfaced as the season's first box score never
appearing on the site.

What creation does *not* do is paper over a missing data directory. It requires
the previous season's file to be present; two missing in a row still exits 2,
which is the case the original refusal was really guarding (see
`allstats_files.py`). A file that goes missing mid-season reads the same as a
rollover here and is deliberately left to `check_stats_integrity.py`, which runs
weekly and reports it precisely (`GONE — was N rows, no file on disk now`).

`build/seasons.conf` can be updated with the new playoff start date for the
record, but nothing reads it any more (see the `build/` table above).

---

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
| Change the Cap Health card (standing vs the cap/aprons and § 2.1 roster limits, or the league-sheet diffs) | Rules: **`cap-health.js`** at the repo root — one rule set, shared by the card, What-If Mode's warnings and (next) a league-wide board, plus the diff-category vocabulary `/poopoo` reads from the same file. Rendering: `renderCapHealth` — `teams/team.js`. Data: `GET /api/poopoo/summary` (`nbn-api/routers/poopoo.py`), a slim slice of `poopoo.json` — the full report is 1.1MB and cannot be fetched per team page. **The card does no cap math**: the salary figures come from `computeCapSummary`, the dollar magnitudes from the job that produced the diffs. Pinned by `tests/cap-health.test.js` (pure node, runs from the hook) and `nbn-api/tests/test_poopoo_summary.py` |
| Change edit mode behavior | `enterEditMode` / `setupEditable` — `teams/team.js` |
| Change the Team Settings tab (jersey #, secondary position) | `setupTeamSettingsTab` — `teams/team.js` |
| Change stats highs table | `stats/highs/table.js` (not the per-stat HTML files) |
| Change stats totals table | `stats/totals/table.js` (not the per-stat HTML files) |
| Add/edit a NBNTV blurb | `BLURBS` object — `nbntv-classics/index.html` |
| Change a page's Open Graph tags (the card Discord shows for a pasted link) | `PAGES` in **`build/og_tags.py`**, then run it — the tags are static and a new page needs an entry or `--check` fails the hook. The card images are `build/og_cards.py`. **The four per-item pages are the exception** (`/news/view/`, `/players/`, `/proposals/view/`, `/members/{name}`): each is one shell serving many items, so nginx sends known unfurlers to `nbn-api/routers/og.py` for the real card, and the static entry is only what everything else sees |
| Change the calendar page (public, read-only game list + fixture/vesting events) | `calendar/index.html` — one self-contained file; game data from `GET /api/schedule` merged with `GET /api/calendar/games`, keyed by date into `scheduledGamesByDate` (`nbn-api/routers/schedule.py` / the calendar-games endpoint). `addMonthCell`'s `.schd-pip` is where an upcoming fixture renders, and where who's claimed it (`streamer`) and whether it's flagged as one (`stream`) show — both public data, read-only here. A date's `.yt-pip` (▶️ VOD) is separate — one per day, not per game, from `GET /api/streaming-days` (`nbn-api/routers/streaming_days.py`), attached inline on `/stream`'s Claim Games day dividers. `/schedule` is retired to a redirect stub pointing here (Discord links still point at it); claiming/flagging/marking days done is `/stream`, the streamer role's own page, not this one |
| Change the streamer dashboard (game claims, the stream flag, the day mark-done/VOD controls, or the Coaching Settings entry queue) | `stream/index.html` — one self-contained file, gated to the `streamer` role (and `admin`) at the page level; two tabs. "Claim Games" is the same season browser as `/schedule`, moved here because claiming/flagging are the only writes it makes: a streamer claim (`streamer`, who's broadcasting) and the stream flag (`stream`, whether the game itself is marked as one) — two independent fields, neither implies the other. Its day-divider rows (`dayRowEl`) also carry that date's slate controls (`daySlateControls`) — mark-done (`nbn-api/routers/streaming_days.py`, one shared flag per date, not per streamer) and the YouTube VOD link, which is what shows up as `/calendar`'s `.yt-pip` above. Both are unrestricted to any `streamer`/`admin`, on every date, regardless of who (if anyone) claimed a game that night — there used to be a separate "Days" tab gated to dates with a claimed/flagged game, retired 2026-09-04 in favor of this inline, ungated version. "Coaching Settings" is the entry-queue dashboard for the row below — sorted by each team's soonest next game (`nextGameFor`), not just pending/entered status |
| Change the coaching-settings field/option schema, or the Coaching tab on team pages | **`coaching-config.js`** at the repo root — one schema (points of emphasis, coach style/playbook, coaching sliders, the two point-buy pools, the player-minutes depth chart), shared by `setupCoachingSettingsTab` (`teams/team.js`) and `stream/index.html`'s Coaching Settings tab, so a team's saved settings render identically in both places. The server (`nbn-api/routers/coaching_settings.py` — `GET`/`PUT /api/coaching-settings/{team}`, `POST .../enter`) is deliberately schema-blind and stores whatever blob is sent, since the field list is 2K-version-coupled and expected to change yearly — a new season's fields are a `coaching-config.js`-only edit, no backend change. Saving is never blocked on an unbalanced point-buy pool or the minutes grid; `CoachingSettings.validityIssues()` is the one place "unbalanced" is computed, and it's what flags an inconsistent save to both the team that entered it and the streamer about to act on it |
| Change standings display | `standings/index.html` |
| Change player index display | `players/index.html` |
| Change HOF display | `hof/index.html` |
| Change H2H display | `h2h/index.html` |
| Change a Frivolities tab, incl. Trade Retros | `frivolities/index.html` — one file, one tab per `.tab-panel`; the router at the bottom maps `#hash` → tab. Trade Retros moved in from the standalone `/trade-retros/`, which is now a redirect stub, and keeps its own IIFE because it brings its own `esc`/`parseCSV`/`state` |
| Add a retired jersey | `RETIRED_JERSEYS` — `teams/team.js` |
| Change the Franchise Records cards | `records-wrap` block in `teams/team.js`; data comes from `franchise_records` in `nbn-api/stats_build/pipeline.py` |
| Change the transaction simulator's spreadsheet export | `buildTradeWorkbook` — `transaction-sim/index.html`; the .xlsx writer is `transaction-sim/xlsx.js`, and publishing to Google Sheets is `POST /api/trade-sheet` (`nbn-api/routers/google_sheets.py`). Export is trade-mode only |
| Add a transaction type to the simulator | `setMode` / `runSignCheck` — `transaction-sim/index.html`, plus a `POST /api/validate/{type}` endpoint in `nbn-api/routers/transactions.py` (see "Transaction simulator" below) |
| Change the contract shorthand (`2+1 PO, $150M`) or the cap-hold vocabulary | **`contract.js`** at the repo root — one grammar, loaded by team pages (via `contractReady` in `team.js`), `/pdc` and `/transactions`. `_contract_str` in `nbn-api/routers/discord_notify.py` is a deliberate Python mirror (it can't import JS) and is pinned to the same cases by `nbn-api/tests/test_contract_shorthand.py`. Don't add a fourth copy |
| Change the office's contract entry form (salary rows, EAPS, live signing rubric) | `addSalaryRow` / `collectSalaries` / `collectSignValidationBody` — `transactions/index.html`. The signing rubric calls `POST /api/validate/sign` (or `/offer_sheet`, `/sign_pick`) on a 300ms debounce, the same validator the submit path runs. The **EAPS field is not always shown** — `syncEapsVisibility` reveals it off the fact sheet's `trailing_hold` only when it actually prices something (Full Bird hold, season with no real EAPS), and keeps it up once answered so the control that produced the figure doesn't vanish |
| Change the rookie scale table, or how a pick signing is prefilled | `build/load_rookie_scale.py` (loader) · `rookie-scale/index.html` (page) · `_rookie_scale_contract` + `GET /api/rookie-scale/contract/{slug}` (nbn-api) · `prefillRookieScale` — `transactions/index.html`. See `docs/api-validation-notes.md` |
| Change the ratings-changes page (OVR/position/attribute/badge diffs from the 2K scrape) | `ratings-changes/index.html` (page, one self-contained file) · `_diff_2k_snapshots` + `GET /api/ratings-changes` — `nbn-api/routers/players.py`. Nothing to write on the scrape side — it diffs `player-attributes.json`'s existing snapshot history on the fly |
| Add/change an owner's per-player roster move | `makeRosterMoveActions` / `openMovesMenu` — `teams/team.js` (see `docs/roster-moves.md`) |
| Verify build output still matches what pages read | `build/smoke_test.py` — runs from `build.sh` and the pre-commit hook |
| Change a rulebook 🔒/👁 enforcement badge | **Don't** — they are generated. The 🔒 half is computed by `nbn-api/rulebook_coverage.py`, which walks every `CheckResult` reachable from `_VALIDATORS` in `routers/transactions.py` (plus `waivers.py`); the 👁 half and the non-check enforcement are declared in `SECTION_REVIEW` / `SECTION_ENFORCED_BY` in that same file, with a required reason. Edit there, then `build/check_rulebook_badges.py --fix`. `tests/test_rulebook_coverage.py` fails if a check id isn't mapped to a §, and `smoke_test.py` fails if the HTML disagrees |
| Verify a page still *renders* (not just that its columns exist) | `tests/frontend/run.js` — puppeteer, run by hand (`npm ci && node run.js`), deliberately not in the hook. Add a page as one row in `PAGES`; see `tests/frontend/README.md` |
| Change the suggestions board or its comment threads | `suggestions/index.html` + `nbn-api/routers/suggestions.py` (see `docs/members-and-rewards.md`) |
| Change power rankings — the ballot, the consensus math, blurbs | Rules: `nbn-api/routers/news_rankings.py` (pure — no FastAPI, no I/O, so it is directly testable and is what `tests/test_news_rankings.py` pins). Routes: the `_mutate_ranking` block in `nbn-api/routers/news.py`. Workspace UI: `news/rankings/rankings.js`; published table: `renderRankings` in `news/view/index.html`. A power-rankings article is an ordinary news article with a ballot phase between draft and publish. **Blurbs open at `voting`, not at the close of it** (`BLURB_PHASES` in `news_rankings.py`, mirrored in `rankings.js`), so a voter claims and writes while the ballot is still out; during that phase the claim board is its own alphabetical list under the ballot (`renderBlurbBoard`), never ordered by the standing, since the standing is the thing a voter must not see mid-vote. Unlike ballots, blurbs are **not** blind while voting runs — league decision, 2026-08-30 — **the order is the plain average of the ballots and the author cannot reorder it**, so don't add an override without the league deciding to. Teams level on the average **share a rank** (T-13, T-13, 15) — nothing hidden breaks a tie. An edition with no `prev_id` can still show ▲▼ against a `baseline` (`{label, ranks}`, set by `PUT /api/news/{id}/rankings/baseline`), which is how the imported February 2026 sheet moves against January. Each `final` row also carries a frozen `roster` (the team's whole active roster by OVR, stamped by `_team_roster_snapshot` in `publish_article` at publish time) and `season_line` (its last completed season out of `standings-history.csv`) — like the rest of `final`, these are captured once and never reconstructed, so a later trade or rating change can't rewrite what an already-published edition showed. A collapsed row is rank, movement, team, every voter's placement (the best and worst ballot marked green/red, unexplained and deliberately so, which is what the row used to spell out as `high 2 · low 5`; a unanimous team has no spread and nothing is marked) and two clamped lines of its blurb; clicking it expands a panel that leads with the full blurb and its byline, then the season's KPI tiles, the projected starting five via `computeStartingFive`, and the rest of the roster numbered on from 6 — the five are not repeated in the list, and the list runs to the end of the roster rather than to a cap, so it needs no heading admitting what it hides. Those numbers are depth order, not OVR rank: a centre rated 7th can start ahead of a guard rated 5th. A row is expandable if it has **any** of those three — the February edition froze no roster but has blurbs, and gating on the roster alone would have put them out of reach. The **whole** roster is frozen even though only 8 are shown, because the starting five is computed from all of it — the only centre on a team can sit well outside the top 8 — and because the panel is a claim about the team the ranking was *voted on*. An unpublished ballot preview has no `final` yet, so `renderRankings` live-fetches via `loadTeamSnapshots` there instead; an edition published before these fields existed (the imported February 2026 sheet) renders as plain rows with nothing to expand |
| Change the team-facing FA offer form (⋯ menu, contract editor, submit confirm) | `free-agency/index.html` — the block under "Team-facing offers"; endpoints `POST/PATCH/DELETE /api/fa/offers`, `POST /api/fa/offers/{id}/submit`, `GET /api/fa/commitment/{team}`. an offer's legality and every dollar shown come from `POST /api/validate/sign`, never from page code (see `docs/fa-offers-pipeline.md`) |
| Add a theme, or change what one costs | Colours: `build/make_team_theme.py` → `css/theme.css` (the team blocks are **generated**, don't hand-edit). Catalog and price: `LIVE_TEAM_THEMES` / `THEME_PRICE` in `nbn-api/routers/themes.py`. Picker: `_themeMenuItems` / `_unlockTheme` — `nav.js`. Run `build/check_theme_catalog.sh` after (see `docs/themes.md`) |
| Change the PDC committee dashboard (FA review, the 1,000-ball ballot, remand/void, finalize/unlock, the agent queue, head controls) | `pdc/index.html`; data from `/api/fa/*` in `nbn-api/routers/free_agency.py`; design record in `docs/pdc-free-agency-spec.md`. Three roles, and a free agent passes through them in order — `agent` curates, `fac` ballots, `fac_head` runs it (see `docs/fa-offers-pipeline.md`). Served at both `nbn.today/pdc` and `pdc.nbn.today` — the subdomain is `/etc/nginx/sites-available/pdc.nbn.today`, the **same docroot** with `/` → `/pdc/index.html`, so every fetch stays same-origin (no CORS, no static-asset CORS gap). Keep any new path rule in sync with the `nbn.today` block or it works on one host and 404s on the other |

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
| Any path between the API and Discord — transaction embeds, PDC FA feeds, the `#roster-log` mirror, tradeblock posts | `docs/discord-integrations.md` |
| The team-facing FA offer form, the § 4.7 agent stage, or § 4.3b voiding | `docs/fa-offers-pipeline.md` |
| A theme, what one costs, or `css/theme.css` | `docs/themes.md` |
| Members, the suggestions board, or NB¥ achievement awards | `docs/members-and-rewards.md` |
| The per-player ⋯ menu on team pages | `docs/roster-moves.md` |
| The daily cap/apron snapshot, or § 7.3's four-year lookback | `nbn-api/CLAUDE.md` § "Cap history" |
| The audit log for writes that bypass the transaction ledger | `nbn-api/CLAUDE.md` § "The edit log" |

What stays in this file is what you need *before* you know which subsystem you
are in: roles, endpoint tables, the data contract, the data model.

> **Keep it that way.** This file is loaded in full at the start of every
> session; `docs/` is not. It went from 37KB to 99KB in the three weeks to
> 2026-08-24 by appending each feature's history here. When a change needs a
> paragraph of reasoning to explain itself, that paragraph belongs in the
> relevant `docs/` file, and this file gets at most a table row pointing at it.

### Roles

| Role | Permissions |
|---|---|
| `rosters` | `PUT /api/roster/{team}`, `PUT`/`DELETE /api/picks/{year}/{rnd}/{orig}` |
| `bod` | Everything `rosters` can do + early award access + edit member tenures |
| `admin` | Everything + member management (`GET/POST/PATCH/DELETE /api/members`) |
| `streamer` | `POST`/`DELETE /api/schedule/{game_id}/streamer` — claim a game on `/schedule` as one they will stream. **One streamer per game**, so the field is a single name and not a list (a list capped at one is the shape that drifts); a second claimant gets a 409 naming who holds it. Neither endpoint takes a member argument — the claim identifies its own holder — so the role can only ever write its holder's own name, which is why it needs no board standing. Dropping someone else's is `bod`. Also `POST`/`DELETE /api/schedule/{game_id}/stream` — mark or clear the separate `stream` flag (whether the game itself is a stream). That flag has no holder: any `streamer` can set or clear it on any game, whether or not that game has a claimed streamer |
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

The whole-block `PUT` also takes an unpersisted `notify_discord` flag — see `docs/discord-integrations.md`.

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

Coverage is uneven and the UI says so: `sign`/`offer_sheet`/`offer_sheet_decision`/
`trade`/`renounce`/`sign_pick`/`extension` have real validators, while `release`, `option` and `pick` are stubs
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
