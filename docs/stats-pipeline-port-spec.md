# Retiring job.R — porting stats aggregation off R

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

## What's actually hard

Not the dataframe work — the league semantics buried in it: award
tie-breaks, seed derivation, playoff round inference, championship/rings
attribution, HOF scoring weights, franchise records, game-score. These are
the asset. They exist nowhere else, including the rulebook, and are the
reason a from-scratch rewrite is the wrong idea.

## Phases

0. **Measure.** Time a full build; profile which aggregations dominate.
   Answers whether anything about the design needs to change or only the
   language.
1. **Harness.** Run-both-and-diff, so every subsequent step is verifiable.
2. **Port in dependency order** — loaders → standings → team seasons →
   player seasons → awards → derived tables (highs, totals, h2h, franchise
   records) → HOF. R stays authoritative throughout; each aggregation
   flips only once its output matches byte for byte.
3. **Cutover.** The API triggers Python. R is kept, dormant, for one full
   season so any seasonal path (playoffs, awards, rings) has run at least
   once under the new code.
4. **Delete R**, and the R dependency from the box.

## Open questions

- Where does the 10 minutes actually go? (Phase 0.)
- Does R's CSV writer have formatting quirks that make byte-identical
  output impractical for specific columns? If so, name them explicitly
  rather than loosening the comparison globally.
- Should `smoke_test.py` grow value assertions during the port? The harness
  makes them cheap to derive, and it would leave a real regression test
  behind once R is gone.

## Not in scope

- Changing what any page fetches, or any CSV's schema.
- poopoo's Google Sheet read (`build/poopoo.py`), which is a deliberate
  read-only diff against the league's published sheet and stays.
- The box score ingestion path — already Python, already in the API.
