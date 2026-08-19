# Dev / live split and data layout for nbn-today + nbn-api

## Problem

Both `nbn-today` and `nbn-api` are currently edited directly in the same
directory that serves production:

- `nbn-today`: `/var/www/nbn.today` is a symlink to
  `/home/skim/projects/nbn-today`. Any file saved there is live on
  `nbn.today` instantly — no buffer between "edited" and "public."
- `nbn-api`: the systemd unit's `WorkingDirectory` and `ExecStart` point
  directly at `/home/skim/projects/nbn-api`, running `uvicorn` straight off
  that checkout.

The API's exposure is weaker than the site's — `uvicorn` runs without
`--reload`, so a half-written router isn't live until a restart — but not
zero: `perry_daily.py` runs from that working tree off cron at 04:00, and
the manual scripts run whatever is on disk when invoked.

**And the repo is not only code.** 180 of its tracked files are symlinks
into `/var/lib/nothing-but-stats` (147 CSV, 2 JSON) or into a third
project's asset directory (31 PNG). The R build writes *through* those
symlinks into the live data directory. So the live checkout is
simultaneously the working copy, the docroot, and part of the data write
path — which is why a dev/live split can't be done cleanly without
touching storage first.

(The 30 `teams/atl -> ATL` symlinks are lowercase-URL aliases, not data.
They stay.)

## Goal

Separate **where you work** from **what's live**, with an explicit, cheap
deploy step between them, and get data out of the repo so that step is
just `git pull`. No build step exists for either project.

Throughout: **the box-score → stats → site loop keeps running.** Games are
still being played and submitted; nothing here may leave that loop broken
between sessions.

---

## Phase 1 — Data layout

Everything else in this document falls out of this phase. Done first, the
dev split becomes trivial; skipped, it needs workarounds.

> **Landed 2026-08-18** (`0292c01`, `2b1fefc`), with three deviations from
> what's written below — recorded here rather than rewritten, so the reasoning
> stays visible:
>
> - **`derived/` and `public/` only.** The five-lifecycle tree (`state/`,
>   `raw/`, `secrets/`, `var/`) was dropped: moving the state JSON meant ~100
>   call sites across `constants.py`, the routers and seven standalone scripts,
>   on the irreplaceable data, to buy a tidier `ls`. Classification is by
>   gitignore rule instead, with the unclassified-file guard doing the work the
>   directories would have.
> - **`secrets/` became a `chmod`.** `chmod 600` on the three credential files,
>   zero call sites, plus the `_atomic_write` fix so the mode actually sticks
>   (`nbn-api` `ba928b3`). `members.json` is still backed up whole — it carries
>   roles and tenures, not only tokens.
> - **`raw/` is deferred.** Moving `allstats-*.csv` would have touched the box
>   score append path *and* `job.R`'s read path in the same window as the
>   derived move — two concepts and doubled failure modes over the one asset
>   that cannot be rebuilt. It is organizational, not protective. Do it as its
>   own step, paired with the append-only guard (Phase 2 item 9), which is the
>   change that actually protects those files.

### Today

`/var/lib/nothing-but-stats` is one flat directory, 100MB, holding five
different lifecycles with nothing marking which is which:

| Kind | Count | Regenerable? |
|---|---|---|
| Derived (R build output) | 86 files | yes, in minutes |
| State (JSON) | 65 files, ~9MB | **no** |
| State (per-team CSV: roster, picks, deadcap) | ~90 files | **no** |
| Raw stats (`allstats-*.csv`) | 12 files, ~20MB | **no** |
| Secrets (`members.json`, `sessions.json`, `tokens.json`) | 3 | **no** |
| Scratch (uploads, caches, `build-status.json`, `.bak` files) | ~35 | yes |

Because they're indistinguishable, every operation is all-or-nothing: no
backup without hauling regenerable artifacts, no dev copy without copying
every member's bearer token, no version history for the ledger without
versioning 26MB of churning CSVs alongside it.

### Target — move two things, classify the rest in place

The first draft of this section moved all five lifecycles into their own
directories. **That is too much blast radius for what it buys**, and the
measurement is why: the state JSON is referenced from **52 `DATA_DIR /`
paths in `constants.py` plus 47 more scattered across other routers**, and
from seven scripts outside the API that each define their own `DATA_DIR`
(`build/poopoo.py`, `load_rookie_scale.py`, `sync_owners.py`,
`scrape_2k_attributes.py` — which hardcodes the path with no env var —
`achievement-notify.js`, `perry_daily.py`, `fetch_trade_votes.py`).
Roughly 100 call sites, in the code that writes the irreplaceable data,
to buy a tidier `ls`.

So:

```
/var/lib/nothing-but-stats/
  raw/        allstats-*.csv                        — MOVED (2 call sites)
  derived/    R build output, mirroring URL paths:  — MOVED (1 line in job.R)
                data/  players/  standings/  nbntv-classics/
  public/     symlink view for nginx (below)        — new, generated, untracked
  *.json      65 state files                        — STAY PUT, tracked in git
  *-roster.csv, *-picks.csv, *-deadcap.csv          — STAY PUT, tracked in git
  avatars/ rules/ discord-*-raw/                    — STAY PUT, tracked (see below)
  pending-boxscores/ build-status.json              — STAY PUT, gitignored
```

Only the two families with a real problem move: `raw/` because it must be
provably append-only and separately backed up, and `derived/` because the
build currently writes it into a git working tree. Everything else is
classified by **gitignore rules rather than by directory**, which achieves
the same thing for backup purposes at zero risk.

`avatars/` (user-uploaded, not regenerable), `rules/`, and the
`discord-*-raw/` scrape corpora are state and get tracked. `pending-
boxscores/` and `build-status.json` are transient and don't.

**Do not use compatibility symlinks** if a later pass does move the state
files. `storage.py`'s atomic write is `os.replace(tmp, path)`, which
**replaces a symlink with a regular file** — the first write to each
legacy path would silently split the data across two locations. Any real
move has to be a code change, never a symlink shim.

### Secrets: `chmod`, don't move

`members.json` is `644` in a `755` directory — every member's bearer token
is readable by any local user or process. It is not web-exposed (no
tracked symlink points at `members`/`sessions`/`tokens`/`bets`; verified).

`chmod 600 members.json sessions.json tokens.json` fixes it with **zero
call sites touched**: every service that reads them (`nbn-api`,
`nbn-achievements`, `poopoo`) runs as `User=skim`, and nginx never reads
them. A `secrets/` directory would buy nothing more and cost another
migration.

**But the chmod won't stick on its own.** `storage.py:21` does
`os.chmod(tmp, 0o644)` on *every* atomic write, deliberately — the roster
CSVs are served by nginx and a writer under a restrictive umask would 403
them. So the next write to `sessions.json` (minutes) or `members.json` (any
member edit) silently restores `644`. Fix `_atomic_write` first to preserve
the destination's existing mode when the file exists, defaulting to `0644`
for new files:

```python
mode = (path.stat().st_mode & 0o777) if path.exists() else 0o644
os.chmod(tmp, mode)
```

That makes the operator's `chmod` the source of truth and keeps nginx's
files world-readable by default. Without it, this task looks done and
quietly isn't.

One nuance that matters for backups: **`members.json` is not purely a
secret.** It holds roles and tenure history, which `sync_owners.py` turns
into `owners.csv` and the whole owner-stats pipeline joins on — that is
irreplaceable league data sharing a file with credentials. So it **is**
backed up (the destination is a private repo, no less exposed than this
box), and token rotation is the answer if that repo is ever compromised.
An earlier "secrets never leave the box" rule would have quietly excluded
the league's membership history from every backup.

### The `public/` view, and why the symlink farm doesn't just disappear

Two axes cross: *lifecycle* (what gets versioned and what a rebuild may
clobber) and *web-served or not*. The per-team roster CSVs are
irreplaceable state **and** fetched by every team page. A directory tree
can only express one axis, so lifecycle owns the directories and the web
gets a view:

```
public/data/atl-roster.csv        -> ../../atl-roster.csv          (state, at root)
public/data/atl-seasons.csv       -> ../../derived/data/atl-seasons.csv
public/players/player_seasons.csv -> ../../derived/players/player_seasons.csv
```

Generated by a `link-public.sh` from a manifest, re-run after a build adds
a file. **The symlink farm doesn't vanish — it moves from git, where it is
wrong (environment-specific paths as 180 tracked objects), into the data
directory, where it is right (a local view of local data).**

### nginx

Every CSV the site serves is currently a symlink, and **there are zero
real tracked `.csv` files in the repo** — verified — so the existing rule
retargets wholesale, with no page edits:

```nginx
location ~* \.csv$ {
    root /var/lib/nothing-but-stats/public;   # was: docroot
    try_files $uri =404;
    add_header Cache-Control "no-cache" always;
}
location = /data/poopoo.json      { alias /var/lib/nothing-but-stats/public/data/poopoo.json; }
location = /data/trade-votes.json { alias /var/lib/nothing-but-stats/public/data/trade-votes.json; }
```

URL paths are unchanged (`/data/atl-roster.csv`, `/players/player_seasons.csv`),
because `derived/` and `public/` mirror them. No HTML or JS changes.

### The code changes

Three, all small — which is the point of moving only two families:

- **API — raw stats path.** `boxscores.py:39 allstats_path()` and
  `_all_allstats_paths()` (line 491) are the only places raw allstats
  files are located. `DATA_DIR` → `DATA_DIR / "raw"`.
- **Build — output base.** Every `write_csv` in `job.R` goes through
  `file.path(REPO_ROOT, …)` (the `out_dir`/`output_dir` function args are
  passed the same). Introduce `OUT_ROOT <- Sys.getenv("NBN_OUT_DIR",
  file.path(DATA_DIR, "derived"))` and use it in the write paths;
  `build.sh` exports it. `REPO_ROOT` stays for reading build config.
- **`build/smoke_test.py` — the one that will bite.** It resolves every
  path from `REPO = Path(__file__).parent.parent` and checks files like
  `data/owner_stats.csv` and `players/player_seasons.csv`. Once those stop
  being in the repo, it fails on **every commit in both checkouts**,
  because the pre-commit hook runs it. Point its `REPO` base for data
  files at `$NBS_DATA_DIR/derived` (keeping the HTML-page side on `REPO`).
  Easy, but it is a hard stop if it's missed — do it in the same commit as
  the `job.R` change.

**The `job.R` change is the prize.** Today the R build writes into a git
working tree; after it, the build writes to `$NBS_DATA_DIR/derived` and
the repo is code only.

`build.sh` also gains a final `link-public.sh` call, so a build that adds
a file (a new stat category, a new team) publishes it instead of 404ing
until someone re-runs the linker by hand.

### The Shiny app is orphaned, not deleted

`shiny-release` is superseded. It is also the only reason `derived/` had to
stay put, and it has been serving data frozen since **June 1** — nothing
has written a `.rds` file since; the current `build/*.R` contains no
`write_rds`/`saveRDS` at all, and the pipeline that did
(`~/projects/nothing-but-stats/refresh.R`) is manual and dormant.

Nothing is deleted. The app, its unit, `~/projects/nothing-but-stats`, and
the `.rds` family stay exactly where they are, marked retired in
`CLAUDE.md` and here. They are simply no longer a consumer this layout
accommodates: the reorg does not move, refresh, or preserve compatibility
with anything they read.

**One coupling to break** so the site doesn't depend on a retired project:
`logos/*.png` (31 files) symlink into `~/projects/nothing-but-stats/app/www/`.
Copy them into the repo as real tracked files (1.8MB) and drop the
symlinks. The originals stay put.

`allstats.csv` (26MB, referenced by nothing since the per-season split)
also stays — under the rule below, nothing in `raw/` gets deleted.

---

## Phase 2 — The box score data

**This is the one asset that cannot be rebuilt.** 157,442 rows across 12
files, hand-entered from screenshots over six seasons. The derived CSVs,
the site, the records, the Hall of Fame, every page on `nbn.today` is a
function of these files. Lose them and the project ends.

Everything else in this document is convenience. This section is not.

### Current exposure, measured

- The source screenshots are **destroyed after parsing** —
  `boxscores.py:879` does `shutil.rmtree(item_dir)` on the pending upload
  once it's committed. So the CSV is not the primary record, it is the
  *only* record. **This is deliberate and stays that way** — see "Why the
  screenshots stay deleted" below.
- **Every copy is on one 50GB virtual disk** (`/dev/vda1`, no RAID, no
  snapshot mechanism visible from inside the box).
- **There is no backup.** No cron entry, no timer, not tracked in git, no
  off-box copy anywhere.
- The only second copy is `/var/www/stats.nbn.today/files/` — real files,
  same disk, publicly served with `autoindex on`, and **last refreshed
  June 1** by the same dormant pipeline. A stale same-disk mirror.
- Total history of the entire data directory: 28 hand-made `.bak` files
  (6.1MB) with names like `.bak-rekey29-20260816-130436` — snapshots taken
  by hand while nervous during migrations.

### Threats, in order of likelihood

The order matters, because a plan that only addresses the last one is the
usual mistake:

1. **Logical corruption** — a bad parse, a bad manual fix, a script that
   rewrites where it meant to append. A mirroring backup faithfully copies
   the damage, and nobody notices for weeks. Needs *history* and a
   *monotonicity guard*, not a mirror.
2. **Accidental deletion** — including from this very document: the dev
   scratch refresh below is `rsync -a --delete /var/lib/nothing-but-stats/
   ~/nbs-scratch/`, and reversing those two arguments empties the source.
3. **Disk or VPS loss** — needs a copy off this box.
4. **Provider or account loss** — needs a second destination in a
   different failure domain.

### Why the screenshots stay deleted

Measured, not estimated: the league plays exactly **1,230 games a season**
(a full 82-game schedule across 30 teams), so retaining sources means
**2,460 screenshots a season** — roughly 1GB/year, growing forever, on a
box with 19GB free. It would become the largest thing on the disk within
two seasons and the largest thing in every backup immediately. The
existing `rmtree` is the right call and stays.

The trade being made, stated plainly: images would only protect against a
**mis-parse**, which is caught at parse time by the box-score sanity
checks, caught later by the integrity check below, and repaired by
re-entering one game from the same screenshot the submitter still has.
That's an afternoon, not a catastrophe. The catastrophe is losing the
CSVs — and the entire six-season dataset is **3.4MB gzipped**. Spending
1GB/season to insure a recoverable failure, while the unrecoverable one
needs 3.4MB, is the wrong allocation.

What replaces them, at negligible cost: **keep the provenance, drop the
pixels.** When a game is committed, record `{game, uploaded_by,
uploaded_at, parsed_by, source}` into a per-season JSONL in `state/`.
Kilobytes a season, and it answers the question an image would actually be
consulted for — "where did this line come from, and who do I ask about
it?" A thumbnail small enough to be affordable wouldn't be re-parseable
anyway, so it buys nothing.

If a real image trail is ever wanted, the only acceptable shape is
**off-box only** — streamed to the archive at upload time and deleted
locally as it is today, so the local footprint stays flat. Deferred until
someone asks for it.

### The plan

Everything below concerns the **3.4MB that actually can't be rebuilt.**

**1. History, locally.** A git repo over the data directory — but with the
**git dir outside it**: `GIT_DIR=/var/lib/nbs-backup.git`,
`GIT_WORK_TREE=/var/lib/nothing-but-stats`, wrapped in one
`nbs-snapshot` script. That keeps `.git` out of a directory that gets
rsync'd, `find`-ed and served, and means a stray `git` command run from a
shell sitting in the data dir does nothing at all. Tracked:
`raw/`, the state JSON, the per-team state CSVs, `avatars/`, `rules/`,
`discord-*-raw/` (~29MB, nearly all text; appends and small JSON edits
delta-compress well). Ignored: `derived/`, `public/`, `pending-boxscores/`,
`build-status.json` — **the build is `derived/`'s restore path**, so
recovery there is `git checkout <sha>` then one build.

Because classification here is by gitignore rather than by directory, add
one guard: a check that **every file in the data directory is either
tracked or explicitly ignored**, failing loudly on anything unclassified.
Otherwise a new state file added six months from now is silently outside
the backup, and nobody finds out until they need it.

A systemd timer commits every 10 minutes, skipping when nothing changed
(no empty commits), with a periodic `git gc` — 144 commits a day
compounds. Writes are already atomic (`storage.py:13`, tmp + `os.replace`),
so a commit can never catch a half-written file. This covers threat 1 and
retires the `.bak` habit.

**2. Off-box, automatically.** Push that repo to a **private GitHub repo**
(`bshk93/nbn-data`) after each commit. SSH to GitHub is already
authenticated from this box and `gh` is installed, so this needs no new
credential. ~30MB checked out, 3.4MB of it the box scores, against a 5GB
repo limit and a 100MB file limit; the largest single file is 3MB.
**This is the tier that answers "gone forever,"** and it costs nothing —
which is the argument for doing it this week rather than after the reorg.

**3. A second destination, different failure domain.** Weekly: a tarball of
everything the git repo tracks, to Google Drive using the OAuth credential
already on the box (`google-oauth.json`, already used by
`routers/google_sheets.py`).
Different provider, different credential, different failure mode from
GitHub. A few MB a week. The raw data is already public at
`stats.nbn.today`, so there's no confidentiality question about where it's
copied — only `secrets/` is excluded, always.

**4. Verification, or none of the above counts.**

- **Weekly integrity check**: per-season row counts must be *monotonically
  non-decreasing* against the previous commit, and a `sha256` manifest must
  match for every prior season's file (a closed season should never change
  at all). Any violation alerts to Discord through the existing paced
  transport (`discord_transport.py`). This is what turns threat 1 from
  "discovered never" into "discovered within a week."
- **Quarterly restore drill**: clone `nbn-data` into a temp directory,
  point `NBS_DATA_DIR` at it, run the build, confirm the derived CSVs
  regenerate. A backup nobody has restored is not a backup. This doubles
  as proof that the tracked set is a *complete* one — if the build succeeds
  from it alone, nothing essential was left in an ignored path.

**5. Append-only by contract.** The `raw/` files only ever grow. Any code
path that would shrink one needs an explicit override flag, checked where
`allstats_path()` (`boxscores.py:39`) is written. Cheap, and it makes the
most likely catastrophe impossible rather than merely detectable.

**6. Provenance, not pixels.** Per-season JSONL in `state/` recording who
uploaded and parsed each game and when (above). Kilobytes.

**7. Refresh or retire the public mirror.** `stats.nbn.today` currently
serves 2.5-month-old files as though they were current, which is a bug in
its own right. Either regenerate it after each build (it then doubles as a
third, public copy) or take it down.

### Keeping stats live through the migration

The loop that must not break:

```
POST /api/boxscores/submit  →  append raw/allstats-{season}.csv
                            →  trigger build/build.sh
                            →  R reads raw/ + state/, writes derived/
                            →  public/ symlinks make it live immediately
```

Two moving parts (the API's append path, the build's output base), so a
box score submitted mid-migration could land on an old path. Cutover:

1. Build the new directories beside the old files (`raw/` and `derived/`
   populated by `cp`, `public/` generated) — no consumer pointed at them
   yet.
2. **Between games**, in one window: stop the API, apply the three code
   changes, flip nginx, restart, run one build, load a team page and a
   stats page.
3. Keep the flat files in place for a month — populate the new tree with
   `cp`, never `mv`, so rollback is reverting two constants and one nginx
   block against files that never moved.

The build is the safety net throughout: if `derived/` comes out wrong,
rerun it — nothing in it is authored.

---

## Phase 3 — Dev / live split

### Layout

Plain sibling folders under `~/projects/`, matching the convention on this
box.

| | Live (existing path, unchanged) | Dev (new) |
|---|---|---|
| nbn-today | `/home/skim/projects/nbn-today` | `/home/skim/projects/nbn-today-dev` |
| nbn-api | `/home/skim/projects/nbn-api` | `/home/skim/projects/nbn-api-dev` |

Plain `git clone` checkouts of the existing remotes. After Phase 1 they
contain **code only** — no data symlinks, no environment-specific paths —
so a clone is complete on arrival and the two checkouts are byte-identical
at the same SHA.

**`nbn-api-dev` is a checkout only — it never runs as a service.**

### Workflow

1. Edit in the `-dev` directory, on a branch.
2. Push to `origin`, merge to `main` (direct push — see "Decisions").
3. `cd <live dir> && ./deploy.sh`

```bash
git diff --quiet && git diff --cached --quiet || { echo "live tree is dirty — resolve first"; exit 1; }
git pull --ff-only
# nbn-api only:
sudo systemctl restart nbn-api
```

`--ff-only` and the dirty check stay even though Phase 1 removes the main
source of live-tree churn: the admin box-score UI still spawns a Claude
session with `cwd=` the live checkout (`nbn-api/routers/misc.py:843`), and
a silent merge commit in live is how a live/main divergence gets found
during an outage.

**Rollback**: `git reset --hard <previous-sha>` (+ restart, for the API).
After Phase 1 this is unconditionally safe — there is nothing but code in
the tree. It rolls back **code only**; data recovery is the data-dir git
repo above.

### Build work in dev is safe by construction

Today, `bash build/build.sh` from a dev checkout would write **live**
aggregates: `job.R` writes through the repo's data symlinks, so
`NBS_DATA_DIR` redirects only the build's inputs. After Phase 1 both ends
follow one variable:

```bash
rsync -a --delete --exclude=.git --exclude=derived/ \
      /var/lib/nothing-but-stats/ ~/nbs-scratch/
NBS_DATA_DIR=~/nbs-scratch bash build/build.sh
```

Live is unreachable from a dev build without editing the command. No
symlink flipping, no per-checkout data config.

`--exclude=.git` matters once the data directory is a git repo — otherwise
every scratch refresh drags the whole history along and the scratch copy
starts committing to a repo you didn't mean to touch. `~/nbs-scratch` lives
outside any checkout deliberately.

### No second API instance

An earlier draft gave `nbn-api` a running dev instance on port 8002 with
its own data copy. **Dropped** — it carried nearly all the risk in the plan
for a case the test suite already covers.

What it would have cost:

- **Discord side effects aren't gated by `NBS_DATA_DIR`.** `.env` holds a
  bot token and eight channel ids. A dev instance posts real embeds to
  `#transactions` for every test transaction — the 300s freshness gate in
  `discord_notify` doesn't help, because a dev test transaction *is* fresh.
  Worse, `roster_log_relay` starts a 60s poller at app startup and keeps
  its cursor in the data dir, so a copied cursor makes the dev instance
  relay real messages into the real `#roster-log` a second time.
- **Real member tokens in a git working tree.** One `git add -A` in
  `nbn-api-dev` publishes them.
- **The site path is hardcoded in six modules** — `constants.py:20`
  (`BUILD_SCRIPT`), `discord.py:51`, `misc.py:34`, `waivers.py:67`,
  `perry.py:27`, `poeltl.py:29`. Two aren't reads: `boxscores.py:224`
  *executes* the live `build/build.sh`, and `misc.py:843` spawns a Claude
  session in the live tree.

What covers API work instead:

- **The test suite**: `venv/bin/python -m tests.run_all`, 31 modules. No
  `conftest.py` — isolation is per-module and hand-rolled: writers patch
  their own `DATA_DIR`/`SESSIONS_FILE` to a temp path
  (`tests/test_two_way_slots.py:65`, `tests/test_auth_session.py:57`), and
  the one module touching the real data dir
  (`tests/test_room_exception_july1.py:326`) only reads. Nothing starts a
  server. Runs from `nbn-api-dev` once it has its own `venv`.
- **The `/api/validate/*` endpoints**, read-only by design.
- Deploy-then-verify on live for the rest; the restart is the gate.

**The cost, stated plainly:** `nbn-today-dev` pages point at the **live**
API. Reads are safe; any **write** path exercised from a dev page is a
real write — `POST /api/transactions` applies for real when its checks
pass, it is not a dry run. Dev is for read-path and UI work. If that stops
being enough, revisit this section rather than quietly standing an
instance back up.

### Git hooks

`.git/hooks/` isn't cloned, and `nbn-today`'s `pre-commit` runs
`build/smoke_test.py` plus the version/changelog bump documented in
`CLAUDE.md`. A dev clone gets neither, so `main` starts collecting
`"version": "pending"` entries and unverified data-contract changes. Track
it in-repo (`build/hooks/pre-commit`) and point both checkouts at it:

```bash
git config core.hooksPath build/hooks
```

This is part of the split — the first dev commit is where it bites.

### Staging host

`python3 -m http.server` can't serve the dev site usefully: it doesn't
proxy `/api`, so relative fetches 404, and the session cookie is
`Domain=.nbn.today; Secure; HttpOnly`, so a `localhost` origin can never
carry it — `/pdc`, `/free-agency`, team edit mode and every authenticated
page are untestable.

- `dev.nbn.today`, docroot `/home/skim/projects/nbn-today-dev`.
- `/api` → `127.0.0.1:8001` (the live API — there is no other).
- CSV/JSON locations copied from the live block, pointing at the same
  `public/` view (dev reads live data; that's intended).
- Under `.nbn.today`, so the existing session cookie works — the reason
  for a real subdomain over a localhost port.
- **Behind basic auth or an IP allow.** It's publicly reachable and it
  honours real tokens against the live API.

### Documentation drift

`CLAUDE.md`, the skills and the stored memories encode both project paths
throughout. That stays correct for ops commands (`fetch_trade_votes.py`,
`systemctl restart nbn-api`, manual build triggers) and becomes wrong for
editing instructions. Add a short section to each repo's `CLAUDE.md`: edit
in `-dev`, run ops in live. Don't rewrite the paths — most genuinely mean
live. `CLAUDE.md`'s data-file tables also need updating for the new layout.

---

## Out of scope / unchanged

- The other sites' copy-based deploy scripts.
- The `/var/www/nbn.today` → `~/projects/nbn-today` symlink itself.
- Multi-collaborator access — solo case only.
- The six hardcoded site paths in the API, left alone precisely because
  nothing else will run them.
- Serving data under a new URL prefix — unnecessary, since retargeting the
  existing `\.csv$` location covers it with no page edits.

## Decisions

1. **Direct push to `main`, branch per change.** Review with one person is
   a step without a reviewer; the value is the branch and the deploy gate.
2. **No scheduled scratch refresh.** Scratch exists for build work only and
   is refreshed by hand at the top of it; a cron `rsync --delete` would
   clobber a working set mid-session.
3. **Staging host in phase 2**, not deferred — nothing authenticated is
   testable without it.
4. **Shiny is orphaned, not deleted.** Nothing of it is removed; it just
   stops being a consumer anything accommodates.
5. **Nothing in `raw/` is ever deleted**, including files believed
   redundant (`allstats.csv`). 26MB is not worth a judgement call about
   irreplaceable data.

## Build order

**Phase 0 — get the box scores off this box (before touching anything)** — **done 2026-08-18**

The reorg is the riskiest handling this data has ever had. It does not
start until a copy exists somewhere else.

1. Create the private `bshk93/nbn-data` repo and the external git dir;
   commit the data directory as it stands today, flat, **tracking by
   default and ignoring only by explicit list**; push. **Verify by cloning
   it back into a temp directory and diffing.**
2. Only then proceed.

**Phase 1 — data layout** — **done 2026-08-18**, except step 6's `raw/` (deferred, see above) and step 8's month-later `pre-migration/` sweep

3. `chmod 600 members.json sessions.json tokens.json`. Zero call sites; do
   it now, independent of everything else.
4. Copy the 31 logo PNGs into the repo as real files; drop those symlinks.
   (`~/projects/nothing-but-stats` is left untouched.)
5. `git init` the data dir with the tracked/ignored classification, plus
   the unclassified-file guard; 10-minute commit timer (skip-if-unchanged,
   periodic `gc`), push-to-GitHub on commit.
6. Create `raw/` and `derived/` beside the flat files — `cp`, not `mv`, so
   the flat copies survive the cutover; generate `public/` via
   `link-public.sh` and add that call to the end of `build.sh`.
7. Cutover between games: three code changes (`allstats_path`, `job.R`,
   `smoke_test.py`), one nginx block, restart, one build, verify a team
   page and a stats page.
8. Drop the 180 data symlinks from the repo. Leave the flat originals in
   place for a month, then move them to `pre-migration/` — not `rm`.

**Phase 2 — protecting the box scores** — **done 2026-08-19** (items 9-14).
The restore drill at the end of it passed: a bare clone of the backup rebuilds
every derived file byte-identically.

9. ~~Append-only guard on `allstats_path()` writes.~~ **Done** —
   `nbn-api/routers/allstats_guard.py`. Refuses a shrinking write, a write
   whose first N rows aren't the N on disk, and a header list that would drop
   a column the file has. The third refusal earned its place during the build:
   the pre-24-25 files have real header drift (no `OPP_RAW`, `...27` for the
   blank column, a trailing `SEASON`), so committing a game to an old season
   with the current header constant would have erased a column across the
   whole file. Override is `allow_shrink=True` per call, and logs.
10. ~~Weekly integrity check~~ **Done** — `nbn-api/check_stats_integrity.py`,
    `nbs-integrity.timer`, Mondays. Manifest is `stats-integrity.json` in the
    data dir (tracked, so its history is off-box with the files). A violation
    is **not** written into the manifest — the next run compares against the
    last good state and alerts again, rather than adopting the damage as its
    new floor; `--accept` re-baselines once a human has resolved it. Alerts
    want `DISCORD_ALERT_CHANNEL` in `nbn-api/.env`; **it is currently unset**,
    so today a violation is journal-only (the unit exits non-zero). Two
    seasons count as live, not one: the stats clock rolls July 1 but the 25-26
    finals were played 2026-06-18, so a slower postseason would land in July
    against a clock already reading 26-27.
11. ~~Weekly Google Drive tarball~~ **Done** — `nbn-api/backup_to_drive.py`,
    `nbs-drive-backup.timer`, Sundays. Tars exactly what the snapshot repo
    tracks (`git ls-files`), so the two backups can never describe different
    sets: 214 files, 64.3MB → **12.1MB gzipped**. Credentials are the one
    exclusion and it is not all-or-nothing — `google-oauth.json` is dropped,
    but `members.json` is **redacted**: tokens blanked, roles and all 72
    tenures kept, because a token is one rotation to replace and a tenure
    history is not. The tarball is re-opened and checked before upload, so a
    shape change in members.json fails the run instead of shipping tokens.
    Nothing is shared — unlike the trade-sheet export, no Drive permission is
    granted. Old backups are **trashed** (30-day grace), never deleted, only
    when they match this script's own name pattern, and only beyond the newest
    12. First upload 2026-08-19.
12. ~~Per-game provenance JSONL~~ **Done** — `nbn-api/routers/boxscore_provenance.py`,
    one line per committed game into `boxscore-provenance-{season}.jsonl`.
    Records who committed it, who uploaded it (recovered by matching the still-
    pending screenshot upload, since the commit request carries no upload id),
    the score, the rows added and the file's row count after. It is a log and
    nothing reads it to decide anything, which is why every failure in it is
    swallowed — a provenance write must never be why a real box score fails.
13. ~~Refresh or retire the `stats.nbn.today` mirror~~ **Retired — it was
    already dead.** Checked 2026-08-19: the vhost is in `sites-available` but
    **not enabled**, and the host does not resolve, so it has not been serving
    anything at all; nothing in the site repo links to it. This section's claim
    that it "serves 2.5-month-old files as though they were current" was
    already stale when written. What remains is 48MB of June 1 copies in
    `/var/www/stats.nbn.today/files/`. Verified: 11 of the 12 `allstats-*.csv`
    there are exact byte prefixes of the live files, and the twelfth
    (`allstats-playoffs-26.csv`) is a CRLF-converted, pre-round-fix, 1,400-row
    copy whose original is kept as `.bak-round-fix` in the data dir. So nothing
    there is unique. **The bytes are left in place anyway**, per this document's
    own rule about never deleting a copy of the unrebuildable data; it is
    filed in `BACKLOG.md` as a disk-space cleanup, not a data question.
14. ~~First restore drill~~ **Done 2026-08-19, and it passed cleanly.** Cloned
    `nbn-data` to a scratch directory, pointed `NBS_DATA_DIR`/`NBN_OUT_DIR` at
    it, ran `build/build.sh`: **all 86 derived CSVs came out byte-identical to
    the live ones**, 173 files published, 166 smoke checks passed, and nothing
    in the live data directory was touched. That is the proof the tracked set
    is *complete* — the build needed nothing the backup lacked. Procedure
    below; next drill due ~2026-11-19.

### Restoring from the backup

Verified end to end on 2026-08-19. Takes about three minutes.

```bash
git clone git@github.com:bshk93/nbn-data.git /home/skim/nbs-restore-drill
NBS_DATA_DIR=/home/skim/nbs-restore-drill \
NBN_OUT_DIR=/home/skim/nbs-restore-drill/derived \
  bash /home/skim/projects/nbn-today/build/build.sh
# then diff derived/ against the live derived/ — expect 86/86 identical
```

Three things a real restore needs that the drill surfaced:

- **`chmod 600 members.json` immediately.** Git does not preserve file modes
  beyond the exec bit, so a clone hands back the credential files
  world-readable (0664) no matter what they were on disk.
- **`sessions.json` and `tokens.json` are not in the backup** and should not
  be. Every member simply signs in again. (They *were* tracked until
  2026-08-19 — named in `.gitignore` from the start, but added before the rule
  existed, and gitignore does not untrack what is already tracked. Every live
  session id had been pushed to the remote on each change.)
- **`owners.csv` is absent and that is correct** — `build.sh` regenerates it
  from `members.json` via `sync_owners.py` before calling R.

**`raw/` stays deferred, and now has a date.** Phase 1 step 6 left it to be
paired with item 9; item 9 is done and the move still wasn't taken, because it
changes the build's *read* path — which the R→Python cutover
(`stats-pipeline-port-spec.md` Phase 3) is about to change anyway. Doing both
in one window is one verification instead of two against the same files. Do it
there.

Screenshot retention is **not** on this list. See "Why the screenshots stay
deleted."

**Phase 3 — dev/live** — **done 2026-08-19**, except the one step that is not
this box's to take: `dev.nbn.today` has **no DNS record yet** (see 18).

15. ~~Track the pre-commit hook; set `core.hooksPath` in live.~~ **Done** —
    `build/hooks/pre-commit`, with `core.hooksPath` set in both the live and
    dev checkouts of `nbn-today`. Verified by committing through it.
16. ~~`deploy.sh` in both live directories.~~ **Done.** Refuses a dirty tree,
    pulls `--ff-only`, prints the rollback command. The API's variant restarts
    the service and fails loudly if it does not come back — a pull without a
    restart leaves uvicorn holding the old modules, which is the worst of both.
17. ~~Clone both `-dev` checkouts; venv; suite green off a fresh clone.~~
    **Done.** Both clones are byte-identical to live at the same SHA (only
    untracked `.claude/` local files differ). This step also turned up a real
    gap: **`nbn-api` had no dependency list at all**, so "create a venv" was
    not a reproducible instruction. `requirements.txt` now pins all 32 packages
    from the live venv; the dev venv was built from it and ran all 39 test
    modules green.
18. ~~nginx `dev.nbn.today` with auth.~~ **Configured and enabled**, verified by
    `Host:` header: every path 401s without credentials, 200s with, `/api`
    proxies to the live API, CSVs come off the same `public/` view, and live
    hosts are unaffected. `/robots.txt` is deliberately the one open path.
    Basic auth is `/etc/nginx/.htpasswd-dev` (user `dev`).

    **Two steps remain and the first is not on this box:**

    1. Add a DNS **A record** `dev.nbn.today` → `162.243.70.105`. There is no
       wildcard — every subdomain here has its own record (`randomtest.nbn.today`
       is NXDOMAIN), so nothing resolves until this exists.
    2. Then `sudo certbot --nginx -d dev.nbn.today`, which converts the block
       to 443 and adds the port-80 redirect, exactly as on `pdc`. Until then it
       is HTTP-only, and the `Secure` session cookie will not be sent — so the
       authenticated pages this host exists for are still untestable.
19. ~~`CLAUDE.md` notes in both repos, including the retired-Shiny note.~~
    **Done** — "Dev and live" sections in both, covering which checkout to edit,
    the scratch-copy build command, why there is no second API instance, and the
    fact that a write from a dev page is a real write.
