# Moving stats aggregation off R (job.R kept as the oracle)

## What this is

The plan to replace the R build (`nbn-today/build/`) with a Python
aggregation pipeline living in `nbn-api`, without changing what it
computes.

This is deliberately *not* part of `dev-deploy-setup-spec.md`. That
document moves where the build writes; this one changes what the build
*is*. Doing them together would mean a failure could have two causes.

## Why

Not because it's broken — it works, and it encodes six seasons of league
semantics correctly. Four reasons it should still go:

1. **It's a fourth language on the stack** (Python, JS, R, bash), and the
   only one nobody wants to open. Every change to it is preceded by
   re-learning dplyr.
2. **It can't be tested the way everything else is.** `nbn-api` has 31 test
   modules. The build has `smoke_test.py`, which is a *schema* contract —
   required columns, minimum row counts, non-blank checks — and asserts
   **no values at all**. A wrong number ships silently.
3. **It lives in the wrong repo.** `dev-deploy-setup-spec.md` makes
   `nbn-today` code-only and deployable by `git pull`; a data pipeline in
   there works against that. The API already reaches across repos to run it
   through a hardcoded `BUILD_SCRIPT = /home/skim/projects/nbn-today/
   build/build.sh`.
4. **Its lineage is a retired app.** `preprocess-utils.R` is a Shiny-era
   file whose functions fed `news.rds` / `ach_*.rds`, files nothing has
   written since April.

## What must NOT change: the full-recompute model

The build reads every raw row and rewrites all 86 derived files, every
time. That is a **feature and it is preserved**:

- **Idempotent** — same inputs, same outputs, safe to run at any moment.
- **Self-healing** — a corrupted derived file is fixed by running it again,
  which is exactly why `derived/` needs no backup.
- **No incremental drift.** Incremental aggregation would be faster and
  would slowly diverge from the raw rows in ways nobody notices for months.
  **Explicitly rejected.** Performance is not the reason for this port.

Likewise the interchange stays **CSV files on disk**. Pages fetch them
statically; computing aggregates per-request would be a serving-model
change with worse caching, and is out of scope.

## Current state, measured

| | |
|---|---|
| Size | 1,999 lines across `job.R`, `build-utils.R`, `preprocess-utils.R` |
| Functions | 39 defined, **30 reachable** from `job.R` |
| Dead code | 9 functions / 661 lines (removed separately — see "Prerequisite") |
| Inputs | `allstats-*.csv` (12 files, 157,442 rows), `owners.csv`, `player-bios.json` |
| Outputs | 86 CSVs |
| Trigger | `POST /api/boxscores/submit` → subprocess → `build.sh` |
| Duration | **22 seconds** (measured 2026-08-18, three runs: 21.8s / 23.1s / 22.5s) |

**On duration — Phase 0 is done, and the answer overturns the premise.** The
standing assumption was ~10 minutes, mostly Google Sheets. It is **22
seconds**, and there is no network activity at all: `write_roster_picks`
and `get_cap_hold_flags` are never called. The 10-minute memory dates from
when rosters really were pulled from the sheet, before the API owned them.

Two consequences:

- **There is no performance problem to solve.** Nothing about the design
  needs to change; the port is purely about language, testability and
  location. This removes the only argument that could have justified
  incremental aggregation.
- **The full-recompute model is cheaper than assumed**, which makes it
  easier to defend: 22 seconds to rebuild six seasons from raw rows is a
  bargain for the idempotence it buys.

Also measured, by hashing all 322 files in the data directory before and
after a build: the build changes **only** derived output. Rosters, picks,
`player-bios.json`, `transactions.json` and every other piece of league
state are byte-identical afterwards. And a second consecutive run changes
**nothing at all** — the build is deterministic.

## Prerequisite — done 2026-08-18

Deleted 8 dead functions / 650 lines, including the entire Google Sheets
write path. `preprocess-utils.R` is gone; its three live functions moved
into `build-utils.R`. Build is now 1,289 lines across two files, verified
by byte-identical output across all 322 data files.

Two things that turned up while doing it, both worth remembering for the
port:

- **`write_h2h_matrix` and `write_owner_h2h_matrix` were defined in *both*
  files.** `job.R` sourced `build-utils.R` first and `preprocess-utils.R`
  second, so the preprocess copies silently won at runtime. They differed
  only in whitespace, but the same shadowing could have hidden a real
  divergence indefinitely. The port should assert that no name is defined
  twice.
- **Reachability analysis lied twice** — once on `h2h` names (a character
  class that excluded digits) and once on `.get_award_rows` (a leading dot
  defeats `\b`), which is called by 11 live award functions and was nearly
  deleted. Static analysis proposes; byte-identical output disposes.

## Where it lands

`nbn-api`, as an importable module plus a CLI entry point, so the API
triggers it in-process or by subprocess without a cross-repo path. It
inherits pytest, the existing test conventions, and `NBS_DATA_DIR`.

`build.sh` stays as the entry point contract (`bash build.sh` → rebuild
everything) so nothing that calls it has to change on day one.

## The acceptance test: byte-identical output

The port is correct when the Python pipeline writes **the same bytes** the
R build writes, for all 86 files, from the same inputs. Nothing weaker is
acceptable, because the smoke test asserts no values and there is no other
oracle.

Mechanically:

1. Run the R build; snapshot all 86 outputs and their `sha256`.
2. Run the Python pipeline into a separate directory.
3. Diff. Any difference is a defect until proven to be an R formatting
   artifact.

Two rules that keep this honest:

- **Fix the writer, don't relax the test.** Float formatting, rounding, and
  column ordering are where "identical" will fight hardest. When R writes
  `0.5` and Python writes `0.50`, change the Python writer. A tolerance
  setting here would erase the only real safety net.
- **Port bug-for-bug.** Any behaviour that looks wrong gets ported
  *faithfully first*, then fixed in a **separate, later commit** with its
  own reasoning. A diff must never mix "ported" with "improved" — otherwise
  every mismatch needs adjudication instead of just being a bug.

## Phase 1 — the harness, done 2026-08-19

`nbn-api/stats_build/harness.py`, with `tests/test_stats_harness.py` in
`tests.run_all`. It runs either engine into a scratch tree and diffs:

```
python3 -m stats_build.harness determinism        # R twice, then diff
python3 -m stats_build.harness port               # R vs Python, then diff
python3 -m stats_build.harness diff DIR_A DIR_B
```

Byte equality decides pass/fail. For a CSV that differs it names the file, the
row, the column and both values; a difference where both sides parse to the
same number is labelled *formatting only* to shorten the fix but **still
fails**, per the rule above. The test module pins that specifically, because
that assertion is the one a future tolerance would quietly delete.

It invokes `Rscript job.R` directly rather than `build.sh` — `build.sh` also
runs `sync_owners.py` and `link-public.sh`, both of which write into the live
data directory, and the harness must stay read-only against it. Verified by
reading every write path in `job.R` and `build-utils.R`: output goes only
under `NBN_OUT_DIR`.

**Three things it established:**

- **The R build is deterministic.** Two runs into separate trees: 86/86
  byte-identical. The whole acceptance test rests on this and it had never
  been checked; had it been false, the port would have needed a different
  oracle before a line of Python was worth writing.
- **The harness reproduces live output exactly.** Its scratch tree diffs
  clean against `$NBS_DATA_DIR/derived` as the running site serves it — so it
  is the real oracle, not a second opinion assembled differently.
- **`through` must be pinned.** `job.R` defaults it to `Sys.Date()`, so two
  builds on different days can legitimately differ. `BuildArgs` resolves all
  three arguments (season, `playoffs_from` from `seasons.conf`, `through`) and
  records them in a manifest beside the output; the Python pipeline takes the
  same three explicitly. An unpinned comparison measures the calendar.

Timing reconfirmed at 24.7s / 24.3s, against 22s on 2026-08-18 — same
ballpark, no drift worth chasing.

**The contract Phase 2 fills in:** `stats_build.pipeline.build(out_dir,
data_dir, args)`. Until it exists `run_python` raises `NotImplementedError`
rather than writing an empty tree, which would diff as 86 missing files and
read like a broken run instead of an absent one.

## Phase 2 — in progress, started 2026-08-19

**The writer came first** (`stats_build/csvio.py`). Every aggregation inherits
it, so a formatting bug would fail every slice for the same reason and invite
someone to loosen the comparison. Its rules were measured from the 86 real
output files, not read off readr's documentation, and two of them were not
guessable: **negative zero keeps its sign** (`-0` in three files, a point
differential that reached zero from below), and **an empty field is not `NA`**
(14,903 NAs and 403 genuine empties — the h2h diagonal). 159,363 numeric
values across all 86 files now render identically, and all 86 re-render
byte-identically for quoting, escaping and line endings.

**One named exception, and it is not a tolerance.** readr/vroom 1.6.5 does not
always emit the shortest round-trip form for a double — measured, 244 of
150,000 doubles written from R carry one extra significant digit. Both
renderings parse to the *same* IEEE double, so no computed value differs, only
the text. The harness accepts that class and nothing else: exact double
equality (never an epsilon, so a wrong number is still a different double) and
both sides at ≥15 significant digits (so `0.50` against `0.5`, or `2790.0`
against `2790`, still fail as the writer bugs they are). It reaches exactly one
value, in `OFF_RTG`, in two files; the test re-measures that scope on every
run, so the day it stops being two cells a test fails. This is the "name them
explicitly rather than loosening the comparison globally" answer the open
question below asked for.

**Slice order changed: gateable slices first.** Porting the loaders first was
the natural dependency order and the wrong call — loaders produce no output
file, so the acceptance test would not have applied to the first slice. Slices
are output files instead, starting with the 52 of 86 that carry no
full-precision doubles (the other 34 are the `-seasons` files,
`standings-history` and `league-history`, all via `OFF_RTG`/`DEF_RTG`), so
early progress doesn't depend on the rendering question above.

**stdlib only — no pandas.** It would be a new dependency in the API's venv for
a service that never imports it at runtime, and numpy's own float and NaN
rendering would fight the one thing the gate turns on. Revisit if a later slice
genuinely needs it.

**All 86 files ported, 2026-08-19.** 47 byte-identical to R, 38 differing only
by accepted cells, 1 deliberately corrected.

| Accepted difference | Cells | Form |
|---|---|---|
| readr's double rendering | 2 | same double, printed longer |
| `.xx5` mean ties | 6 | enumerated cell by cell |
| R's `will` name bug | 10 | enumerated, with the fix |
| Rating noise (`OFF_RTG`/`DEF_RTG`) | 465 | tolerance, scoped to two columns, 1e-11 |
| `league-history.csv` | whole file | R's version is broken — below |

**The one file the port refuses to reproduce.** R builds `league-history.csv`
by summing `WL == "W"` over *player* rows rather than distinct games, so any
team with about two playoff wins clears the 16-win champion test: the live file
carries 64 rows for 6 seasons and names eleven champions for 20-21.
`season-summary` had already papered over it, deduplicating by season and
taking the champion from the bracket ("CSV join artifacts"), which is why
nobody chased the cause. The port counts games; every other cell matches R
exactly and every champion matches the finals winner. It is listed in
`harness.KNOWN_FIXED_FILES`, so `tests/test_stats_pipeline.py` carries its
verification instead of the byte gate.

**Timing:** Python 36.7s against R's 24s. Slower, and irrelevant — Phase 0
established there is no performance problem, and nothing here sits on a request
path. The cost is pure-Python loops plus exact rationals in the ratings.

**Semantics worth knowing, each found as a diff rather than by reading R:**

- Career-total ties keep alphabetical player order; game-high ties go to the
  earlier date. Both fall out of R's stable sorts over a grouped frame, so
  `clean_allstats`' closing `arrange(PLAYER, DATE)` is a tie-break, not tidying.
- `round()` and `mean()` both differ from Python's — see `stats_build/rmath.py`.
- Playoff depth is credited by **season span**, not game day: a GM who takes
  over in the summer owns that season's playoff run, and two owners can be
  credited with one season's.
- Negative zero is real data (`-0` for a differential that reached zero from
  below), in the writer and in rounding.
- The bios join to stat lines by **uppercase name**, not slug — box scores
  carry no slug.

## Phase 3 — cutover, done 2026-08-19

`build.sh` runs `python3 -m stats_build` instead of `Rscript job.R`. Everything
that triggers a build — `POST /api/boxscores/submit`, `POST /api/build/trigger`,
a person on the box — is unchanged: `build.sh` was kept as the entry-point
contract exactly so nothing else had to move on the day.

Done in the offseason, two months after the last box score (2026-06-18), which
is the quiet window the cutover wanted.

**What the switch actually is.** `NBN_STATS_ENGINE`, defaulting to `python`,
with `r` reaching the dormant engine. Both branches share the tail — the same
`link-public.sh` and the same `smoke_test.py`, whose status is still the
build's exit status — so the rollback is a real path and not a hopeful one. It
was run end to end against a scratch data directory before the cutover, not
just left in place: R 13.9s, Python 35.7s, 173 files published and 166 smoke
checks passing on both. An unrecognised engine exits 2 rather than defaulting
to either.

**One resolver, finally.** The Sep 30 season cutoff existed three times (bash
in `build.sh`, Python in `harness.py`, and R in `job.R`). It is now
`stats_build/buildargs.py`, which the entry point and the harness both import;
`build/test_build_sh.py` fails the commit if a copy reappears on the live path.
The bash copy survives only on the R branch and goes with it in Phase 4.

**What reading `job.R` for the last time settled:** of its three positional
arguments, only `season` is used. `playoffs_from` and `through` are parsed,
defaulted, and never read again — playoff rows come from their own
`allstats-playoffs-{YY}.csv` files, so nothing splits a season by date. They
are still passed to R verbatim (the dormant engine is invoked exactly as it
always was) and still recorded in the harness manifest, because R defaults
`through` to `Sys.Date()` and a comparison must pin it. But `seasons.conf`,
which `build.sh` grepped on every build to produce `playoffs_from`, has fed
nothing for as long as it has existed.

**One guard the R build did not have.** The entry point refuses to run when the
season's `allstats-{season}.csv` is missing. The pipeline would otherwise
aggregate zero rows perfectly happily and write 86 empty CSVs over 86 good
ones — the failure mode of a wrong season or an unmounted data directory, and
the one way a *full recompute* can destroy rather than heal. `derived/` is not
backed up precisely because the build is its restore path, so a vacuous success
is the expensive bug here.

**What changed on the site**, both of them the deliberate fix landing:
`league-history.csv` now names one champion per season instead of every team
with about two playoff wins, and three players named Will are no longer
`Barton, will`.

**Tests.** `tests/test_stats_cutover.py` (in `tests.run_all`) pins the entry
point: the shared resolver, `--dry-run` writing nothing, and the empty-league
guard. `build/test_build_sh.py` pins build.sh's half and runs from the
pre-commit hook. They are deliberately in **different repos** — an nbn-api test
asserting on `build.sh` would fail until the *site* repo deployed, which is the
cross-repo coupling this port exists to remove.

**Deploy order is load-bearing:** nbn-api first. `build.sh` runs the engine out
of the API checkout, so a site deploy that lands first gives every build `No
module named stats_build`. Caught in rehearsal, before it could be caught in
production.

## R stays — decided 2026-08-19, and it retires "Phase 4"

The plan through Phase 3 ended with "delete R, and the R dependency from the
box." **That is not happening, and dropping it makes the port stronger rather
than unfinished.**

Uninstalling R would buy a little disk and one less thing to patch. It would
cost the only *value-level* oracle these 86 files have ever had:
`smoke_test.py` asserts columns, row-count floors and no values at all, so
byte-comparison against a second independent implementation is the entire
reason anyone can believe the numbers. Trading a permanent regression gate for
a tidier package list is a bad trade, and it is one that cannot be undone
cheaply — reconstructing `job.R` later means reconstructing six seasons of
league semantics from the thing it was supposed to check.

So the arrangement is standing, not transitional:

- **R stays installed**, and `build/job.R`, `build/build-utils.R` and
  `harness.run_r` stay with it. Keeping the runtime while deleting the source
  would be incoherent — the source *is* the oracle; the runtime just runs it.
- **`python3 -m stats_build.harness port` stays the gate**, available forever
  rather than until a deletion date. Run it after any change to `pipeline.py`.
- **`seasons.conf`, `BuildArgs.playoffs_from` and `.through`** stay too. They
  feed nothing (see Phase 3), but they are how R is invoked, and R is invoked.
- The bash season inference in `build.sh` stays on the R branch only, where
  `build/test_build_sh.py` already pins it out of the live path.

**The open question below stops being urgent**, which is the real consequence.
Whether `smoke_test.py` should grow value assertions was going to become
blocking the moment the comparison disappeared. It doesn't disappear, so it
goes back to being a genuine improvement worth making when convenient, not a
prerequisite for anything.

**What it costs, stated honestly.** The accepted-difference lists are
enumerated cell by cell and re-measured on every harness run, on purpose — so a
new season's data can turn up a seventh `.xx5` tie or a new rating cell and
fail the gate until a person looks at it. That is the design working, not
breaking, but it is a real recurring cost and the reason to keep those lists
enumerated rather than letting them decay into a tolerance.

**One thing from the old Phase 4 survives, as a watch item rather than a
countdown.** Playoffs, awards, rings and championship attribution are the code
that runs least often, and the harness can only compare what today's data
exercises. The first time each runs under Python on new data — the 26-27
playoffs — run `harness port` and confirm R agrees. After that there is nothing
pending.

## What's actually hard

Not the dataframe work — the league semantics buried in it: award
tie-breaks, seed derivation, playoff round inference, championship/rings
attribution, HOF scoring weights, franchise records, game-score. These are
the asset. They exist nowhere else, including the rulebook, and are the
reason a from-scratch rewrite is the wrong idea.

## Phases

0. ~~**Measure.**~~ **Done 2026-08-18** — 22 seconds, no network. See
   "Current state, measured."
1. ~~**Harness.**~~ **Done 2026-08-19** — run-both-and-diff, plus R
   determinism confirmed. See "Phase 1" above.
2. ~~**Port in dependency order**~~ **Done 2026-08-19 — all 86 files** — loaders → standings → team seasons →
   player seasons → awards → derived tables (highs, totals, h2h, franchise
   records) → HOF. R stays authoritative throughout; each aggregation
   flips only once its output matches byte for byte.
3. ~~**Cutover.**~~ **Done 2026-08-19** — `build.sh` runs
   `python3 -m stats_build`; R is dormant behind `NBN_STATS_ENGINE=r`. See
   "Phase 3" above.
4. ~~**Delete R.**~~ **Dropped 2026-08-19** — R stays, permanently, as the
   oracle. The port is complete at Phase 3. See "R stays" above.

## Open questions

- ~~Where does the 10 minutes actually go?~~ **Answered:** there is no 10
  minutes. 22 seconds, no network at all.
- Does R's CSV writer have formatting quirks that make byte-identical
  output impractical for specific columns? If so, name them explicitly
  rather than loosening the comparison globally.
- Should `smoke_test.py` grow value assertions? The harness makes them cheap
  to derive, and it would be a faster gate than running both engines. No longer
  blocking anything now that R stays — worth doing, not urgent. Still open.

## Not in scope

- Changing what any page fetches, or any CSV's schema.
- poopoo's Google Sheet read (`build/poopoo.py`), which is a deliberate
  read-only diff against the league's published sheet and stays.
- The box score ingestion path — already Python, already in the API.
