# Owner self-serve roster moves

Detail split out of `CLAUDE.md` on 2026-08-24. The per-player Moves menu on team
pages, and the two genuinely different permission tiers behind it.

## Owner self-serve roster moves

Team pages carry a per-player **Moves menu** offering moves the viewer is actually
entitled to make. Its button sits at the left of the player's name cell, not in
a trailing column, so it is on screen on a phone without scrolling past the
salary years. Built by `makeRosterMoveActions` / `openMovesMenu` in
`teams/team.js`. Actions the player is ineligible for are shown **disabled with the
rule-citing reason**, not hidden — "why can't I renounce him?" is a rules question
and the menu is where it gets answered.

Rendered in the **Rosters and Contracts** roster views (`MOVE_MODES`), not Stats or
Ratings. Rosters is the default tab, so gating it to Contracts alone made the
feature invisible to the owners it exists for.

**Getting a token in the first place:** the roster header has a `#team-signin-btn`
shown only when `/api/auth/me` resolves to no roles. It is not decoration — every
other affordance on a team page that prompts for a token (`attachEditBtn`, the
Team Settings section) is gated on roles that require a token to already be stored, so
without it a team owner who isn't on the committee had no way into their own tools
at all. `hadStoredToken` is snapshotted *before* the page's fetches, since the first
request to 403 clears a stale token and would otherwise erase the difference between
"never signed in" and "token revoked".

Two permission tiers, and they are genuinely different:

| Action | Gate | Endpoint |
|---|---|---|
| Add/remove from trade block | team's own role **or** admin (`canEditTradeBlock`) | `PUT`/`DELETE /api/trading-block/{team}/player/{slug}` |
| Renounce (§ 3.10) | **owner tenure** (`canRenounce`, server: `auth.is_team_owner`) | `POST /api/self/renounce` |
| Stash draft rights (§ 7.1 / § 7.4) | **owner tenure**, same as renounce | `POST /api/self/stash` |
| Make an offer (a free agent's new contract, Bird Rights included) | team's own role, same as the trade block. Shown only for a UFA/RFA hold `renounceEligibility` accepts. A link, not a move: it opens `/free-agency/?player=&team=`, which goes straight into that team's offer form when the board is taking offers | none here — the offer is `POST /api/fa/offers` on `/free-agency` |
| Extend / withdraw a qualifying offer (§ 3.1) | **owner tenure**, same as renounce. Shown only for an RFA-tagged player or one with a QO out (`qoEligibility`) | `POST /api/self/qualifying-offer` |

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
