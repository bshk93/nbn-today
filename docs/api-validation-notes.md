# Transaction validation — how the rules are modeled

Detail split out of `CLAUDE.md` on 2026-08-24. These are the checks in
`nbn-api/routers/transactions.py` and the mistakes each one exists to stop.
Read the relevant part before changing a validator, a fact sheet, or the
contract a `/api/validate/*` endpoint returns.

## Validation endpoints — the two bugs the endpoint layer hid

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

## Per-type coverage — how `sign_pick`, `convert_twoway` and `extension` got theirs

("Those silent stubs" is the uneven-coverage paragraph in `CLAUDE.md` §
"Validation endpoints" — `release`, `option` and `pick` still return `[]`.)

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

## The § 7.1 rookie scale

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

## § 3.8 Bird Rights tenure

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

## Offer sheets are two transactions (§ 3.15)

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
