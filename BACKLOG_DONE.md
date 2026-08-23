# NBN — Resolved Backlog Items

Closed-out entries moved out of `BACKLOG.md` to keep the active list lean.
Same struck-through-title convention; each keeps its resolution summary and,
where useful, the original problem statement below it.

---

### ~~[P3] The data backup commits 144 no-op snapshots a day~~ — DONE 2026-08-23
`poopoo.py` rewrote `poopoo.json` on every 10-minute run whether or not the
diff had changed, and `nbs-snapshot` committed each rewrite. Re-measured on the
day it was fixed: **558 of the backup's 646 commits** were one changed line,
`generated_at`, and nothing else — 87% of a history whose reason for existing
is that you can read it to spot logical corruption.

Fixed by `write_report` in `build/poopoo.py`: the report is written only when
its content minus `generated_at` differs from what is already on disk. Freshness
is preserved without a diff — the file's mtime is bumped on every run either
way, so nginx's `Last-Modified` says when the job last *ran* while
`generated_at` now says when the answer last *changed*. `/poopoo` reads both,
and shows "Unchanged since …" when they differ.

The 558 commits already in the backup are left alone; rewriting that history
would cost more than it returns, and it stops growing today.

### ~~[P2] Two different answers to "what season is it?" (was three)~~ — DONE 2026-08-21
Found 2026-08-19 while building the box score integrity check. Three
independent definitions of the season boundary existed and did not agree:
`nbn-api` `stats_build/buildargs.py` (Sep 30, America/New_York), `nbn-api`
`storage._current_season_str` (Jul 1, UTC), and a hardcoded string in
`boxscores/submit/index.html`. Confirmed live-disagreeing as of 2026-08-21
(today: the first two read "25-26" vs "26-27") — one build day away from
`POST /api/boxscore/commit` writing a file the build couldn't find.

Fixed by unifying all three into `season_clock.py` (new, nbn-api repo root):
one July-1 default, one override store (`league-state.json`, BOD-settable via
`PUT /api/league-year/{season}`, same mechanism the league year already had).
There is no more separate "stats clock" — `_current_league_year()` and
`stats_build.buildargs.resolve_season()` both delegate to it, and the submit
form now reads its default off `GET /api/league-year` instead of a hardcoded
string. `season_clock.DATA_DIR` still honors `NBS_DATA_DIR`, so a scratch-dir
build reads that copy's rollovers rather than the live league's.
`tests/test_season_clock.py` (nbn-api) pins the boundary math and the
rollover-override path.

### ~~[P2] § 3.12 minimum-scale years escalated in the model but not in the league's own sheet~~ — REVERSED 2026-08-13
Jamison Battle's ATL `sign` (txn `c90cd99d35ad3cc0`, `minimum`, § 3.12) had gone
through with a fully empty contract — see the DONE item below — and was
hand-corrected to a 2-year deal: 26-27 guaranteed $2,449,421, 27-28 player
option $2,664,401, `years_experience: 2`, plus the § 3.10 trailing UFA hold
(Early Bird tier, via `_autofill_fa_hold_amounts`) for 28-29 at $3,463,721.

$2,664,401 is the tier-**2** figure for 27-28, flat off the declared
`years_experience: 2` — not tier **3** ($2,756,912), which is what
`_check_minimum_salary` used to compute by escalating one tier per contract
year off the anchor (the "pure function of (first season, years of
experience, scale)" model settled 2026-08-10). Checked against the league's
live source of truth — the **"NBN Rosters and Salaries 2026-27"** Google
Sheet — which already carried Battle's row at exactly `$2,449,421 |
$2,664,401 | $3,463,721`. Flat, not escalating, is the real convention.

Treated Battle's contract as the barometer and reversed the model rather than
the data: `_contract_years_exp` (`nbn-api/routers/transactions.py`) no longer
adds one year of experience per elapsed contract year off the declared
anchor — it returns the declared `years_experience` unchanged for every
season of that contract. A multi-year minimum still raises year over year;
that now comes entirely from each season's own § 3.12 scale table moving
(cap growth), not from the tier climbing. The draft_year proxy fallback
(no `years_experience` declared) is untouched — it still climbs naturally,
because that's real elapsed calendar time, not a contract-year count.
`tests/test_minimum_contract_raises.py` rewritten to pin the flat behavior
(previously pinned the escalating one); full suite green. Verified live:
`POST /api/validate/sign` on Battle's actual contract now reports
`minimum_salary: passed=true` with no tier warning.

### ~~[P1] `sign` accepts a contract with zero salary years~~ — DONE 2026-08-13
Discovered from the Battle signing above: `_apply_sign` (`nbn-api/routers/
transactions.py`) never checked that `contract.salaries` was non-empty before
writing it. A `sign` submitted with `salaries: {}` silently succeeded — no
year got added to the bio, `cap_holds` got *replaced* with whatever was sent
(so an empty submission also erased any existing cap hold on the player), and
the player sat on the roster with no salary at all until someone noticed.

`_check_minimum_salary` had the same hole from the validator side: its loop
is `for yr, raw in (contract.salaries or {}).items()`, so zero years meant
zero iterations, and it fell through to `passed=True, "Every contract year
meets the § 3.12 minimum salary"` — a lie when there were no years to check.
Same vacuous-pass shape as the `_require_validatable`/`_require_trade_validatable`
bugs already fixed for `/api/validate/trade`.

`offer_sheet` already guarded this (`_apply_offer_sheet` hard-rejects `len(
salaries) < 2` per § 3.15's 2-year minimum); plain `sign` had nothing. Fixed
with a `contract_has_salary_years` error `CheckResult` in `_validate_sign`
(so the office's live rubric catches it before submit) plus the same guard
as a hard 422 in `_apply_sign` (the rubric is advisory; the real gate has to
be at apply time). `tests/test_sign_requires_salary.py` pins both the failing
and the passing case through the real `/api/validate/sign` endpoint.

Also fixed while in this code: the office's contract form used to hide the
Year-1-+-raise% contract helper entirely for `signing_method: "minimum"`,
which is how a minimum signing ended up hand-typed one row at a time with
nothing pre-filled — the direct path to submitting empty. § 3.12 pricing is a
pure function of (season, years of experience, scale), so the minimum method
now gets its own generator (`min-contract-helper` / `generateMinimumContractRows`
in `transactions/index.html`) — guaranteed years + trailing option type/years
+ the existing `years_experience` field — that pulls dollar figures from
`GET /api/cap-levels`'s `min_salary_scale`, instead of asking for typed-in
amounts. Verified end-to-end in a headless browser against the live page.
(Originally escalated one tier per contract year; corrected to flat 2026-08-13
below, same day as the `_contract_years_exp` reversal.)

### ~~[P1] Minimum-contract generator and `_check_minimum_salary` both stale against the 2026-08-13 flat/hardship-cap fixes~~ — DONE 2026-08-13
Caught live entering Nahshon Hyland's 1-yr minimum with GSW (5 years
experience, 26-27): the office's `min-contract-helper` generator prefilled
$2,845,883 (the raw tier-5 figure), but the league's own sheet had $2,449,421
— the § 3.12 veteran-minimum hardship cap, which caps a *genuine 1-year*
minimum deal's cap hit at that season's 2-year-veteran figure regardless of
actual experience tier (`_one_year_min_cap_hit`, `_check_minimum_contract_cap_hit`).
The generator never mirrored that exception, and separately was still
escalating one tier per contract year — stale against the same-day
`_contract_years_exp` flattening (previous entry above). Fixed both in
`generateMinimumContractRows` (`transactions/index.html`): tier is now applied
flat across every generated year, and a genuine 1-year deal (no option) is
additionally capped at that season's `"2"` tier when the player's own tier
sits above it.

Re-submitting at the corrected $2,449,421 then surfaced a second, backend bug:
`_check_minimum_salary` (the `minimum_salary` check) still compared the
submission against the raw uncapped tier via `_min_salary_for`, so it warned
"below this player's minimum for their experience tier" on the *exact same
contract* that `_check_minimum_contract_cap_hit` had just passed as correct —
two checks disagreeing about the same dollar figure. Fixed by threading
`signing_method` into `_check_minimum_salary`: a genuine 1-year `minimum`
deal (single salary year) is now checked against `_one_year_min_cap_hit`
instead of the raw tier, matching the cap-hit check. Multi-year minimums are
untouched — the hardship cap is § 3.12's exception for a 1-year deal only.
`nbn-api/tests/test_one_year_min_cap_hit_consistency.py` pins the fix,
including that a multi-year minimum still warns uncapped and that callers
which don't pass `signing_method` keep the old behavior. Verified live via
`POST /api/validate/sign` before/after.

### ~~[P2] § 5.1 waiver claims described in the rulebook but never implemented~~ — BUILT 2026-08-12/13
Never listed here (spec landed two days after the 2026-08-10 review), recorded
now so it isn't re-proposed. The rulebook had always said a claimed player's
contract transfers, with no code behind it. Spec: `docs/waiver-wire-spec.md`
(v0.2, six decisions settled). Built: `routers/waivers.py` — `GET /api/waivers`,
`POST /api/validate/waiver_claim`, claim / withdraw / resolve — plus the
`#waivers` relay and the surface on `/free-agency`. `tests/test_waivers.py`.

Follows the established shapes rather than inventing new ones: pending claims
are enumerable from the ledger (as `_open_offer_sheets` is), expiry sweeps on
read with no scheduler (as `_sweep_ffa_expiry` does), and claims are **sealed**
— only `pdc-alerts` sees them before the window resolves.

### ~~[P1] Production runs off an unmerged feature branch~~ — RESOLVED, confirmed 2026-08-19
`nbn-api` is on `main`, `picks-conveyance-phase0` is fully merged into it
(`git merge-base --is-ancestor` confirms), and both repos push cleanly to
`origin/main`. `main` describes what is running again. The dev/live split built
on 2026-08-19 depends on that being true — a dev checkout clones `origin/main`,
so a live tree on some other branch would have made the two checkouts silently
different at the same "version". Original entry follows.

`nbn-api` is on branch `picks-conveyance-phase0`, **58 commits ahead of
`main`** — and the systemd service serves directly out of that working
directory, so that branch *is* production. `main` no longer describes what's
running. Decide whether to merge the branch to `main` or rename it.

~~Both repos have 28 unpushed commits each.~~ **Resolved as of 2026-08-07** —
`nbn-today` and `nbn-api` both report 0 unpushed against their upstreams, so
the "disk failure loses ~4 weeks of work" risk is gone. Only the branch
question remains.

### ~~[P3] `/api/rookie-scale` returns empty~~ — DONE 2026-08-11
Populated by `build/load_rookie_scale.py` from the league sheet's
"{year} Rookie Contracts" tabs. 2025 and 2026 are loaded and verified to the
dollar against every signed contract in those classes; `/rookie-scale` renders
them and `GET /api/rookie-scale/contract/{slug}` prefills the office form.
**2024 is deliberately still out** — see the § 3.10 multiplier item in §1.

### ~~[P2] § 7.2 rulebook badge is stale~~ — CLOSED 2026-08-09, fully resolved 2026-08-21
Section read 👁 manual review only, despite Stepien going live 2026-07-23.
Fixed 2026-08-09: badge became 🔒 + 👁 with a "What's system-enforced / Still
manual review" split, since only the Stepien half was actually checked. Once
the companion 7-year advance limit was enforced too (2026-08-21, next entry),
the split no longer applied — § 7.2 is now a single 🔒 system-enforced
section, same as any other fully-covered one.

### ~~[P2] § 7.2 seven-year advance limit unenforced~~ — DONE 2026-08-21
The Stepien half of § 7.2 was enforced 2026-07-23 (`_check_stepien_rule`);
the companion rule — picks may only be traded up to 7 years ahead of the
current league year — had no check. Added `_check_pick_advance_limit`
(nbn-api `routers/transactions.py`), wired into `_validate_trade` right next
to Stepien, so both the submit path and the simulator get it for free. Any
round, not just first-rounders — unlike Stepien.

The horizon isn't a new number: `roster_picks.picks_horizon_target_year`
already computes "current league year + 7" to decide how far the picks
ledger stays populated. Split into `_pick_year_horizon(season)` so the
validator checks a transaction against *its own* season rather than always
today, and so the two can never define "7 years out" two different ways.
`tests/test_pick_advance_limit.py` pins it. Confirmed against live picks
data before deploying: the ledger's newest year (2033) already sits exactly
at the horizon, so this can only ever reject a pick year with no real ledger
row behind it — nothing already on the books was retroactively affected.
