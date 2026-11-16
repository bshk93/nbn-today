# Player bio fields

Moved out of CLAUDE.md on 2026-11-16 word for word. The data-model overview (slug, player types, cap holds, draft picks, the stats rows) stays in CLAUDE.md § Data model.

## Fields: set once, never changed

These are historical facts about the player. Correct a typo if you must, but they should not change as a result of in-league events.

| Field | Type | Notes |
|---|---|---|
| `dob` | ISO date | `"1988-03-14"` |
| `college` | string | |
| `country` | string | |
| `draft_year`, `draft_round`, `draft_pick` | int or null | NBN draft position, not NBA — null if undrafted |
| `draft_team` | string or null | Abbr of the team that made the pick (e.g. `"ATL"`); null if undrafted. Canonical source for "who drafted this player" across the site — team Draft History and `/draft` read it. Stamped by the `pick` transaction (Article VII); the picks ledger (`/api/picks`) only covers the live-draft era (2026+), so the bio is the all-years source. |
| `height`, `wingspan` | string | e.g. `"6'8\""`, `"7'1\""` |
| `weight` | int | lbs |


## Fields: updated occasionally

These change infrequently but can legitimately be updated as better information is available or as in-league decisions happen.

| Field | Type | When it changes |
|---|---|---|
| `name` | string (`"LAST, FIRST"` uppercase) | Typo correction only; not a game event |
| `pos` | string[] (subset of `PG SG SF PF C`) | **Derived, don't write it**: `[primary, effective secondary]`, rewritten by the API whenever either changes (`_sync_pos` in `nbn-api/routers/players.py`), and ignored on a bio edit once `position` exists. Many pages read it. Before 2026-10-24 it was a hand-kept list from the league sheet that disagreed with 2K for 75 players |
| `position` | object | The player's positions: `{primary, secondary, team, set, reason}`, 2K's as they were when last taken. A 2K re-rating or a trade doesn't move them; **his team chooses** to take 2K's current ones (`take_2k_position` on the team-settings PUT, Roster Settings → Details) whenever 2K differs (§ 2.3, 2026-11-15). Kept by `reconcile_positions` — never by hand. A team change clears `secondary_pos`. Read through `_primary_pos` / `primaryPos` (`teams/team.js`), never `2k_pos[0]`. `docs/pages.md` § Roster Settings |
| `photo_url` | string | Replaced if a better image is found |
| `jersey_number` | string or null | Set by the owning team in the Roster Settings section (`teams/{ABB}` → Coaching tab → Roster Settings), via `PUT /api/players/{slug}/team-settings`. Gated strictly by the team's own role — not admin/rosters/bod — since this is the team's own cosmetic choice, not league-administered roster data. |
| `secondary_pos` | string or null (one of `PG SG SF PF C`, or `"none"`) | null means the team hasn't chosen, so the secondary stored in `position` stands; `"none"` removes it; a position is the team's pick. Read it through `effective_secondary` (`nbn-api/routers/players.py`) / `effectiveSecondary` (`teams/team.js`), never raw. Rulebook § 2.3: legal is one step from the primary or any position 2K has ever listed for him (`secondary_pool` / `secondaryPool`, the history served as `2k_pos_seen` on `GET /api/attributes/current`); anything else but the primary is saved and flagged for the streamer. Cleared when the player joins a different team. Same Roster Settings section and endpoint/permissions as `jersey_number`. |


## Fields: change with contract/roster activity

These reflect the current contract state and are updated whenever a transaction touches this player.

| Field | Type | When it changes |
|---|---|---|
| `type` | enum | Changes on transactions: `""` → `"player"` on signing, `"player"` ↔ `"two-way"` on conversion. A release sets it back to `""` and writes the dead money to the team's `{abbr}-deadcap.csv` — it does **not** set `"dead"` |
| `salaries` | `{"YY-YY": "$amount"}` | Accumulates across contracts — past seasons are preserved; current-season-onwards entries are replaced by each new contract. The player page displays all entries as career earnings history; roster/tradeblock display code filters to `>= current season`. **Not every entry is salary**: a season with a `UFA`/`RFA` hold carries the hold's amount here (that's how it counts against the cap), and a released player keeps the remaining dead money here as well as in the deadcap CSV. Values are strings in mixed formats (`"$2,048,494"`, `"2296274"`); always go through `_parse_dollar` |
| `cap_holds` | object | Updated alongside `salaries`; see "Cap holds" below |
| `contracts` | array | One entry per signing since the write path started recording them (`team`, `date`, `signing_method`, `bird_rights_type`, `salaries`, `guaranteed`, `guarantee_dates`, `guarantee_schedule`, `cap_holds`, `txn_id`). Only on ~170 of ~720 contracted players, so it is history, not the source of truth. The top-level fields are what every validator reads, and the two can disagree |
| `guarantee_schedule` | `{"YY-YY": [{amount, date?}]}` | Guarantee tranches within a season: an amount with no date is guaranteed now, one with a date becomes guaranteed on it |
| `bird_tiers` | `{"YY-YY": "QVFA" \| "EQVFA" \| "Non-QVFA"}` | The Bird tier a player carries into that offseason (§ 3.8) |
| `cap_hold_notes` | `{"YY-YY": string}` | Free text explaining a placeholder hold amount, e.g. one priced before that season's EAPS was set |
| `retired` | bool | Retired players are skipped by free agency and POEXT |
| `notes` | string | Free text from the league sheet (`"Extended 11/6/25"`) |
| `guaranteed` | `{"YY-YY": "$amount"}` | Guaranteed portion of each year; set when partial guarantees exist |
| `guarantee_dates` | `{"YY-YY": "YYYY-MM-DD"}` | The date after which that season's salary becomes fully guaranteed; cleared once the date passes |


