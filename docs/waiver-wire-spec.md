# Waiver wire — design spec (v0.1, draft)

**Status:** v0.2, 2026-08-12. Six decisions settled by the user (§ 2); no
design questions outstanding. Nothing has been built yet — this document is
the design record, following the same pattern as
`docs/pdc-free-agency-spec.md`.

## 1. Scope

Today, `release` (§ 5.1) is instant: the player comes off the roster and the
dead cap obligation is computed and applied in the same request
(`_apply_release` in `nbn-api/routers/transactions.py`). The rulebook already
*describes* a waiver claim ("If a released player is claimed off waivers, the
claiming team assumes the full remaining contract") but nothing implements a
claim window, a priority rule, or a claim itself — that sentence has never had
code behind it.

This spec adds the missing piece: every `release` opens a **48-hour claim
window**. During it the player shows on `/free-agency` as "on waivers" with a
countdown, other teams can submit a claim (assuming the existing contract, not
offering a new one), and at expiry the highest-priority valid claim — worst
qualifying record, tie broken by head-to-head — takes over the contract. No
claims (or no *valid* claims) means the release resolves exactly as it does
today: dead cap on the releasing team.

`void_player` (§ 5.1's no-payment-obligation conditions — 2nd-round/UDFA
non-tender, not in the current 2K, real-life retirement) is a **separate
transaction type already** (`_buyout_salary_above_ntmle` scans
`("release", "void_player")` as distinct cases). It is untouched by this spec
— a voided contract has no obligation for anyone to assume, so there's nothing
for a claim to acquire.

## 2. Decisions already made

| Question | Answer |
|---|---|
| Tie-break when two claimants share the identical worst qualifying record | **Worse head-to-head record in the same relevant season wins** the tie |
| Roster room to claim | **Claiming team must already have an open standard roster spot** — no simultaneous-drop path, consistent with the existing § 5.1 "simultaneous waiver restriction" invariant (a spot must exist before acquisition) |
| § 5.1 First-Apron/NTMLE restriction (can't sign a bought-out contract over NTMLE while at/above the First Apron) | **Also blocks the claim itself**, not just a later fresh signing of a player who clears unclaimed |
| Build approach | **This spec first**, then implement in phases |
| Are pending claims visible to rival claiming teams? | **Sealed** — no team sees who else has claimed, or whether anyone has, until the window resolves. Only `pdc-alerts` (committee-only) sees claims as they're submitted |
| Head-to-head tie-break is itself tied (split season series, or the teams never played) | **Goes to PDC** for a manual call, same as any other `👁 manual review` item in the rulebook — not auto-resolved by a coin flip or timestamp |

## 3. Existing building blocks to reuse

| Thing | Where | Why it matters here |
|---|---|---|
| Dead cap computation, stretch provision | `_apply_release` (`transactions.py:701`) | Unchanged — still the formula for what a releasing team owes if the player goes unclaimed |
| Snapshot + reverse pattern | `_apply_renounce` / `rescind_renounce` (`_snapshot` on the txn, restored by the undo button) | Exact template for "an action mutated roster/bio state, and it needs to be cleanly undone by a later event." A waiver claim reversing a release is the same shape |
| Two-transaction split for a pending decision | `offer_sheet` / `offer_sheet_decision`, `_open_offer_sheets()` deriving the live list from the ledger with no second store | Template for `release` (opens the window) / `waiver_claim` (a bid) / the resolution — enumerable from the ledger, nothing to drift |
| Sweep-on-read expiry, no scheduler | `_sweep_ffa_expiry` (`free_agency.py:391`) | § 4.1 has no cron anywhere in this codebase; waiver expiry follows the same "whichever read observes it first, resolves it, under lock" shape |
| Funding/eligibility validator reused by both fact-sheet and submit path | `_validate_sign` / `_signing_fact_sheet`, `_signee_existing_hold`, `_resolve_mle_bucket`, `_compute_team_salary*` | A claim's fact sheet must come from the same helpers, per the standing rule that a fact sheet never does its own cap math |
| The exact NTMLE/First-Apron gate this spec's § 2 answer extends to claims | `_buyout_salary_above_ntmle` (`transactions.py:3325`) — already scans `release` transactions for a terminated salary above NTMLE, independent of what the *next* transaction is | Reusable as-is; just needs a call site in the claim validator, not a new implementation |
| Discord paced-queue transport, burst caps, freshness gate | `discord_transport.py`, `discord_notify.py`, `fa_notify.py` | New posts reuse this, never a new `httpx.post` |
| **The `#waivers` Discord channel already exists and is already relayed** | `roster_log_relay.py` `SOURCES`: `{"name": "waivers", "id": "1116542114382217316", "humans_only": False}` | See § 6 — this means "propagate in the discord as needed" is close to free |

## 4. State model — proposed approach

**Proposal: don't change what `_apply_release` does to roster/bio state at
all.** It already removes the player from the roster CSV and computes dead cap
immediately, exactly as it should if the window closes unclaimed. The waiver
window sits *on top* as a pending-decision layer, the same way `offer_sheet`
sits on top of a plain `sign`:

1. `_apply_release` gains one addition: it stores a **`_snapshot`** of the
   player's pre-release bio state on the transaction (`salaries`,
   `cap_holds`, `guaranteed`, `guarantee_dates`, `type`) — identical in shape
   to the renounce snapshot, just a different source struct.
2. **A release is "on waivers" exactly when it is enumerable as open** —
   mirroring `_open_offer_sheets()`: a `release` transaction is open when
   `now < created_at + 48h` **and** no `waiver_clear` transaction names its
   `txn_id` as resolved. No second store; `GET /api/waivers` derives the live
   list straight from the ledger, the same guarantee § 3.15 relies on ("pending
   is enumerable").
3. **Display, not state, carries "still active technically."** The FA page
   reads the open release's `_snapshot` to show the player's real contract
   terms and reads the live roster/dead-cap CSVs for the dollar amount
   currently charged — both already correct, because `_apply_release` already
   computed them right. The player's bio already shows the dead-cap version
   under the hood the instant they're released; the waiver window is a 48-hour
   grace period during which that can still be undone, not a state where two
   different versions of the truth coexist.
4. **A winning claim reverses the release and re-applies the contract to the
   claiming team**, in one operation under the transaction lock:
   - Restore the releasing team's pre-release bio fields from `_snapshot`
     (same mechanism as `rescind_renounce`), removing the dead-cap rows it
     wrote.
   - Immediately re-terminate those same fields onto the claiming team: add
     the roster CSV row, set `bio["salaries"]`/`cap_holds`/`guaranteed` from
     the snapshot, and run the same tail `_apply_sign` already runs for
     `mle_used` / hard-cap bookkeeping (§ 1.4 Row D, NTMLE/TMLE flags) keyed to
     the claim's `signing_method`.
   - Log a `waiver_clear` transaction: `{released_txn_id, outcome: "claimed",
     claimed_by, signing_method}`.
5. **No valid claim** (zero claims, or every claim fails re-validation at
   resolution — see § 5): log `waiver_clear` with `{outcome: "unclaimed"}`.
   Nothing else changes; the dead cap already applied at release stands
   permanently, exactly as today.

This reuses two already-tested code paths (`_apply_release`'s dead-cap math,
the renounce snapshot/reverse pattern) instead of inventing new bio-state
semantics, and keeps `_open_waivers()` as cheap and driftless as
`_open_offer_sheets()`. Flagging this as a proposal, not a given — if a
different mental model is wanted (e.g., dead cap should never post until the
window actually closes, so the releasing team's cap sheet visibly reads
differently during the 48 hours than after), that's a bigger change and should
be said now.

## 5. Priority resolution

Runs once per expiring release, inside `_sweep_waivers()` (§ 7), under the
transaction lock:

1. Collect every `waiver_claim` referencing this release's `txn_id` that
   hasn't been withdrawn (see § 8, open question).
2. **Relevant season for record**: if the release's date resolves (via
   `_season_for_date`) to before December 1 of that league year, use the
   **prior completed season's** row for each claiming team from
   `standings/standings-history.csv`; otherwise use the **current** season's
   row from the same file. (This file already updates per-game through the
   normal build pipeline, so an in-progress current season's record is live
   there — no new data source needed.)
3. Rank claimants by ascending win **PCT** (worst record = highest priority).
4. **Tie**: compare head-to-head record between the tied teams *in that same
   relevant season*, derived from `allstats-{season}.csv` game rows (`TEAM`,
   `OPP`, `WL`, deduped to one row per game). The team with the **worse**
   head-to-head record in that season gets priority.
5. **Tie survives the head-to-head check** (split season series, or the tied
   teams never played each other that season): resolution does **not**
   auto-pick a winner. The sweep stops short, leaves the release open past its
   48-hour deadline, and flags it for a **manual PDC decision** — a
   `pdc-alerts` post naming the tied teams and the head-to-head figures, and a
   `POST /api/waivers/{txn_id}/resolve` action (head/admin-gated, the same
   tier that finalizes FA ballots) taking either a winning team or
   "unclaimed." Nothing in § 7's sweep may guess here; a still-tied release is
   simply not resolved until a human breaks it.
6. Otherwise, walk the priority list top to bottom. For each claimant, re-run
   the claim validator (roster room, funding, hard cap, § 2's
   NTMLE/First-Apron gate) — a team's situation can change during the 48
   hours. First one that still passes wins. If none pass, fall through to "no
   valid claim" (§ 4 step 5).

## 6. Discord

Three feeds, three different jobs. **Each event posts to exactly one
channel** — a transaction never sends more than a single Discord message
(revised 2026-08-12: window-open used to also post to `fa-news`, a
near-duplicate of the `#waivers` post for the same event; removed).

**`#waivers`** — fires the moment a `release` transaction is submitted (from
inside `_apply_release`, same call-site pattern as `discord_notify`'s existing
per-transaction posts). This is the one the user asked to "automatically
propagate in the discord as needed" — and it already will, for free: the
roster-log relay (`roster_log_relay.py` `SOURCES`) already polls `#waivers`
with `"humans_only": False`, meaning **bot posts from this channel are already
relayed into `#roster-log` today** — that machinery exists purely because a
human used to type waiver announcements into `#waivers` by hand. Posting there
programmatically needs a new `DISCORD_WAIVERS_CHANNEL` env var (same channel
id the relay already has hardcoded, `1116542114382217316`) and a small sender
module following the `discord_notify.py` shape — no relay changes at all.

**`fa-news`** (`DISCORD_FA_NEWS_CHANNEL`, existing) — window closes only,
reusing `fa_notify._news` (which structurally cannot reach the private
channel or carry a `$`/team abbreviation, per the existing signature-enforced
rule): "Waiver claims on `{player}` have closed." Nothing more if unclaimed;
if claimed, `_news` still can't name a team, so this just says claims have
closed and points at the site for the outcome. (Flag: if the outcome *should*
be public, that's a deliberate widening of what `_news` is allowed to say, and
should be decided explicitly rather than done by mistake — see § 8.)

**`pdc-alerts`** (`DISCORD_PDC_CHANNEL`, existing, private) — one post per
claim submitted: team, player, signing method. Claims are sealed everywhere
else (§ 2), so this channel is the *only* place any claim is visible before
resolution — including to the committee, who otherwise couldn't see the board
filling up. Also posts the § 5 step 5 manual-tie flag when one occurs. Same
channel that already carries offer submissions/remands/voids — this is two
more event types through `_alert`.

## 7. Sweep / expiry mechanics

No scheduler exists anywhere in this codebase for time-based transitions (§
4.1's own words: "Expiry has no scheduler"). `_sweep_waivers()` follows
`_sweep_ffa_expiry`'s exact shape — called at the top of the read paths that
matter:
- `GET /api/waivers` (the primary poll target for the FA page)
- `GET /api/fa/board`, so a cleared player's FA-page status updates promptly
  even if nobody hit `/api/waivers` directly
- team roster fetch (so a team's own page reflects a win/loss promptly)

Unlike `_sweep_ffa_expiry` (which only *posts*, never mutates roster/bio
state), this sweep **does** mutate state when a claim wins — so it must run
under the same `_txn_lock` / `_state_lock` pair `_apply_release` and
`_apply_sign` already use, and must be idempotent per release (guarded by
`waiver_clear` enumeration, same as `_open_offer_sheets` guards against
double-resolving an offer).

## 8. Remaining implementation-level details

Don't block starting; can be settled while § 4/§ 5 are built and adjusted once
seen live:

- Whether a team may withdraw its own claim before the window closes (offer
  sheets have no withdraw path once submitted; a claim is a lower-stakes
  commitment before resolution, so allowing it is a reasonable default absent
  a reason not to).
- Exact wording/shape of the § 6 Discord messages — first pass is a reasonable
  draft, not a final copy review.
- Since claims are sealed (§ 2), the FA page's claim ⋯-menu entry shows no
  count and no rival-team information — a team knows only that *a* claim
  window is open and whether *it* has claimed, never who else has.

## 9. Phased build plan

- **Phase 0** — `_apply_release` snapshot addition, `waiver_claim` /
  `waiver_clear` transaction types + Pydantic models, `_open_waivers()`.
- **Phase 1** — `_validate_waiver_claim`, `POST /api/waivers/{txn_id}/claim`,
  `_sweep_waivers()` + priority resolution (§ 5), `GET /api/waivers`.
- **Phase 2** — the three Discord feeds (§ 6).
- **Phase 3** — `/free-agency` UI: "on waivers" status + countdown, the ⋯-menu
  claim action, fact sheet display.
- **Phase 4** — PDC dashboard visibility (mirrors how offer sheets show up
  there today).
