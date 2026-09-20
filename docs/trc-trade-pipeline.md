# TRC — Trade Request Committee (spec v1.0, 2026-09-20)

**Status: built.** Roles, backend store/endpoints, the ownership-check fix,
the `apply_trade` extraction, the transaction-sim submit button, and the
`committees/trc/index.html` dashboard are all live in this commit. What's
outstanding is granting the `trc`/`trc_head` roles to real members — the
feature is inert until then, same as PDC's own rollout.

## What this is

Trades were the one transaction type teams could never submit themselves —
`POST /api/transactions` gates every type, trade included, behind `rosters`.
The only trace of a trade committee anywhere in the codebase was a line in
`draft/guide/index.html`: "reach out to TRC with the details, they'll stage
the trade and announce it on the live board." This builds that committee for
real, reusing PDC's shape (a committee role, a head role, a pending-request
store, a dashboard) — `pdc-free-agency-spec.md` § (scope note) already said
trades should get this treatment.

Unlike PDC, TRC isn't reviewing competing offers for one slot — there's
exactly one proposed trade to judge. So there's no ball-splitting ballot, no
per-player sub-committee assignment, and no agent stage. It's simpler: any
`trc` member may ballot on any open request, and the bar to clear is a fixed
count, not a share of the committee.

## Decisions

1. **Intake is transaction-sim's trade builder, not a new form.** The sim
   already assembles the exact body `/api/validate/trade` wants
   (`transaction-sim/index.html`'s `runCheck()` → `tradeBody`). A "Submit to
   TRC" button, shown only when the signed-in member holds a role for one of
   the trade's own party teams, POSTs that same object to
   `POST /api/trade-requests`. This is a deliberate, permanent crack in the
   simulator's documented "read-only, no path to submission" contract
   (`nbn-today/CLAUDE.md`, Validation-endpoints section) — everything else
   on that page, including every other transaction type, stays preview-only.
   The stated long-term direction is one place to mock and submit any
   transaction type; this is the first step, not the final shape.

2. **New roles, `trc` and `trc_head`**, scoped to trades only. `trc_head` is
   let through `POST /api/transactions`' trade branch too (see § "Backend"
   below), but that grant is trade-only — it is not a `rosters` substitute
   for any other type. `bod` does **not** imply `trc` (matches the PDC/POEXT
   precedent: committee membership is a specific grant, not a board-wide
   one).

3. **A fixed 3 approvals**, not a majority of the committee's actual size —
   there's no per-request assignment, so "majority of whoever's assigned"
   doesn't apply the way it does on PDC's ballots. A reject ballot is
   recorded but never auto-rejects a request; only `trc_head`'s own
   `POST /.../reject` does that. Re-voting overwrites a member's prior ballot
   rather than appending a second one.

4. **A ballot judges fairness, not legality** — legality is already fully
   covered by `_validate_trade` (`nbn-api/routers/transactions.py`), computed
   live on every read and re-checked at finalize, so there's nothing for a
   human vote to duplicate there. A ballot requires a non-empty note for
   exactly this reason: "looks fine" isn't a legality check, it's a judgment
   call, and the note is the record of what was actually judged. Because a
   ballot is a judgment call and not an administrative action, **`admin`
   does not satisfy `PUT /api/trade-requests/{id}/ballot`'s gate** — the one
   place in this codebase's role system where `admin` isn't waved through.
   `admin` does satisfy `require_role("trc_head")` for reject/finalize, same
   as every other head-power here.

5. **No time-based expiry.** A request stays open until it's rejected,
   withdrawn, or finalized — no clock. Instead, it just has to keep passing a
   live check for as long as it's open: `GET /api/trade-requests[/{id}]`
   returns a fresh `validation` block (legality + current ownership) computed
   on every call, never stored, so a request that's gone stale (an asset it
   names has since left the team that was supposed to trade it) shows that
   immediately rather than after some elapsed window.

6. **A real gap this design surfaced:** `_validate_trade` never checked
   whether a team still actually holds an asset it's proposing to trade —
   that check lived only inside `_apply_trade`, as a hard exception at write
   time, not as a `CheckResult`. A trade whose named player had already been
   traded elsewhere still came back "legal" from `/api/validate/trade`. Fixed
   by extracting that check into `_trade_leg_ownership_problems(details,
   bios, team_map, pick_index, conveyance_store) -> list[str]`
   (`nbn-api/routers/transactions.py`) — `_apply_trade` calls it and raises
   on the first entry (behavior-preserving, pinned by
   `test_exception_absorption_split.py` / `test_cap_room_contagion.py` /
   `test_tpe_and_hardcap.py`), and TRC's own live-check calls the same
   function to report every problem, not just the first. This closes a real
   hole in the simulator too, independent of TRC.

7. **Consent is per-team, from every party, including the proposer's own** —
   one rule, no exception for whoever happened to click Submit. It's gated
   on `is_team_owner`, not just the team role (`self_renounce`'s pattern:
   team derived from data, never from the request body) — a front-office
   member can draft and submit a proposal, but only the actual owner locks
   their team into it.

8. **No `remand` endpoint.** PDC/POEXT have one because there's an editable
   object downstream a team can revise in place; TRC's sim-built trade has
   no "load this back in for editing" path, and building one is out of scope
   here. A request needing changes gets rejected with a reason (`trc_head`),
   or superseded by a fresh `POST /api/trade-requests`.

9. **Discord reuses `#transactions`** — `apply_trade` calls the existing
   `notify_transaction()` (`nbn-api/routers/discord_notify.py`) unconditionally,
   so a TRC-finalized trade posts the same embed a `rosters`-entered one
   would, no new channel, no notification on intake/consent/balloting.

## Roles

Added to `VALID_ROLES` / `ROLE_IMPLIES` (`nbn-api/routers/constants.py`):
`trc`, `trc_head`, with `"trc_head": {"trc"}`. Also added to
`members/index.html`'s `NAMED_ROLES` — an admin can't grant a role that page
doesn't list.

## Backend

`nbn-api/routers/transactions.py`:

- `_trade_leg_ownership_problems(...)` — extracted from `_apply_trade`, see
  decision 6 above.
- `apply_trade(details, txn_date, info, *, description="", force=False,
  relay_to_roster_log=False) -> dict` — extracted from `create_transaction`'s
  trade branch: validate, apply, ledger-append, announce. `create_transaction`
  now dispatches `body.type == "trade"` straight to this helper before its
  generic per-type block. TRC's finalize endpoint calls this helper directly
  (not `create_transaction`, and not a re-entrant HTTP call) — `info` is
  whoever's actually executing the trade (the `trc_head` who clicked
  Finalize), which correctly attributes the resulting ledger entry.

`nbn-api/routers/trade_requests.py` — new router, new store
`trade-requests.json` (`{"seq": 0, "items": [...]}`, the same
`_load_json`/`_save_json`/`threading.Lock()`/`secrets.token_hex(8)` pattern
as `suggestions.py`). One item per request:

```jsonc
{
  "id": "…", "number": 7, "status": "awaiting_consent",
  // -> balloting -> ready_to_finalize -> finalized | rejected | withdrawn
  "created_by": "...", "created_at": "...", "updated_at": "...",
  "trade": { /* exactly transaction-sim's tradeBody / TradeValidateInput shape */ },
  "parties": ["BOS", "PHX"],   // every team named in `trade.transfers`, derived once
  "consents": { "PHX": {"consented": false, "by": null, "at": null}, "BOS": {...} },
  "ballots": { "member": {"decision": "approve", "note": "...", "at": "..."} },
  "rejected": null, "withdrawn": null, "finalized": null,   // or {at, by, ...}
  "history": [ {at, by, action} ]
}
```

`status`, `consents`, `ballots`, `rejected`/`withdrawn`/`finalized` are the
only stored lifecycle fields. Legality/ownership is never stored — see
decision 5.

Endpoints — all under `/api/trade-requests`:

| Verb/path | Gate | Effect |
|---|---|---|
| `GET` `[/{id}]` | public | list/single, with a live `validation` block merged in |
| `POST` | holds a role for a party team | creates, `status: awaiting_consent` |
| `POST /{id}/consent` | `is_team_owner` of a party | consents that team; flips to `balloting` once every party has |
| `POST /{id}/withdraw` | `is_team_owner` of a party, or `trc_head` | `status: withdrawn` |
| `PUT /{id}/ballot` | `has_role("trc")` — **not** `require_role`, no admin bypass | `{decision, note}`; flips to `ready_to_finalize` at 3 approvals |
| `POST /{id}/reject` | `require_role("trc_head")` | `status: rejected` |
| `POST /{id}/finalize` | `require_role("trc_head")` | re-checks live legality/ownership, then `apply_trade` |

## Site

- `transaction-sim/index.html` — `loadMe()` on init; `renderResults()` shows
  "Submit to TRC" only for a party-team role holder; `submitToTRC(tradeBody)`
  reuses the token-prompt pattern already there for `publishTradeSheet`.
- `committees/trc/index.html` — new dashboard, gated to `trc`/`trc_head`/
  `admin`, structural template `committees/stream/index.html`. Queue (open
  requests, sorted `ready_to_finalize` first) and History (terminal). Row
  detail: trade legs, live legality/ownership panel, consent chips, ballots,
  and role-gated actions (ballot form for `trc`; reject/finalize for
  `trc_head`; withdraw for a party or `trc_head`).
- `nav.js` `ROLE_PAGES`, `committees/index.html`'s `COMMITTEES` array, and
  `build/og_tags.py`'s `PAGES` all got a TRC entry.
