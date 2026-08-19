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
| Duration | ~10 minutes, believed — **unverified, and the common explanation is wrong** |

**On duration:** the standing assumption is that most of the 10 minutes is
pulling from Google Sheets. It cannot be — `write_roster_picks` and
`get_cap_hold_flags` are never called, and the live build makes no network
calls at all. That memory predates rosters moving to the API. So the real
cost is somewhere in the aggregation, unprofiled. **Phase 0 measures it**,
because "R is slow" and "we recompute six seasons of per-player aggregates
several times over" imply very different ports.

## Prerequisite

Delete the 661 lines of dead code first (`preprocess-utils.R` is 8
functions, 7 dead; plus `check_allstats` and `.get_award_rows`). Porting
code that nothing calls is the most avoidable kind of wasted work, and the
dead set includes the sheet-writing path that must never run again.

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
