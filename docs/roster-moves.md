# Owner self-serve roster moves

Detail split out of `CLAUDE.md` on 2026-08-24. The per-player ⋯ menu on team
pages, and the two genuinely different permission tiers behind it.

## Owner self-serve roster moves

Team pages carry a per-player **⋯ menu** offering moves the viewer is actually
entitled to make. Built by `makeRosterMoveActions` / `openMovesMenu` in
`teams/team.js`. Actions the player is ineligible for are shown **disabled with the
rule-citing reason**, not hidden — "why can't I renounce him?" is a rules question
and the menu is where it gets answered.

Rendered in the **Rosters and Contracts** roster views (`MOVE_MODES`), not Stats or
Ratings. Rosters is the default tab, so gating it to Contracts alone made the
feature invisible to the owners it exists for.

**Getting a token in the first place:** the roster header has a `#team-signin-btn`
shown only when `/api/auth/me` resolves to no roles. It is not decoration — every
other affordance on a team page that prompts for a token (`attachEditBtn`, the
Team Settings tab) is gated on roles that require a token to already be stored, so
without it a team owner who isn't on the committee had no way into their own tools
at all. `hadStoredToken` is snapshotted *before* the page's fetches, since the first
request to 403 clears a stale token and would otherwise erase the difference between
"never signed in" and "token revoked".

Two permission tiers, and they are genuinely different:

| Action | Gate | Endpoint |
|---|---|---|
| Add/remove from trade block | team's own role **or** admin (`canEditTradeBlock`) | `PUT`/`DELETE /api/trading-block/{team}/player/{slug}` |
| Renounce (§ 3.10) | **owner tenure** (`canRenounce`, server: `auth.is_team_owner`) | `POST /api/self/renounce` |

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
