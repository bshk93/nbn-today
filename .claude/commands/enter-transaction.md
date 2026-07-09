Interpret a freeform description of a league transaction, resolve it into the API's structured format, confirm your interpretation, submit it, and verify the result.

$ARGUMENTS format: `YYYY-MM-DD <freeform description>` — the transaction date is the first token; everything after is the raw description to interpret (e.g. `2026-07-10 HOU trades their 2027 1st and Fred VanVleet to LAL for Austin Reaves and a 2028 2nd`).

This replaces manually using the `/transactions` page. Nothing is ever submitted without an explicit confirmation step — freeform text is ambiguous and this mutates live roster/pick/cap data.

## Steps

### 1. Split arguments

Extract `DATE` (first token, must match `\d{4}-\d{2}-\d{2}`) and `TEXT` (everything after).

**`DATE` and `TEXT` are the source of truth for this transaction — preserve them verbatim, don't work from your own paraphrase of them.** If resolving this takes multiple turns (ambiguities to clarify, blockers to research with the user) or gets deferred and picked up again in a later session, carry the *exact* original `TEXT` forward — quote it in full in any note, memory entry, or scratchpad you write about the task, not just your interpretation of it. A paraphrase can drop or scramble details a literal quote can't (e.g. which team receives which asset in a multi-team trade) — this has caused real resubmission errors before.

### 2. Load context (parallel)

```bash
curl -s http://localhost:8001/api/players            # player-bios.json — name/type/salary lookup
curl -s http://localhost:8001/api/picks               # all draft picks, with swap-conveyance already resolved
curl -s http://localhost:8001/api/team-map            # slug -> current team, for player ownership
```

Also read `/home/skim/projects/nbn-today/rulebook/index.html` sections as needed in step 6 — don't load the whole file up front, just the relevant `<article>` once you know the transaction type.

### 3. Classify the transaction type

Read `TEXT` and decide which of the 9 types it describes:

| Type | Cues in freeform text |
|---|---|
| `trade` | Two or more teams exchanging players/picks ("trades X for Y", "sends ... to ... for ...") |
| `sign` | A free agent signing a new contract with a team |
| `sign_pick` | Signing a player to their **rookie-scale** contract after their draft rights were awarded (distinct from `pick` — see below) |
| `pick` | Awarding a drafted player's rights to the team that picked them (no contract yet — that's a separate later `sign_pick`) |
| `release` | Waiving/cutting a player currently on a roster |
| `renounce` | Giving up a free-agent cap hold (UFA/RFA) without releasing an active contract |
| `option` | A player or team exercising or declining a `PLAYER_OPT`/`TEAM_OPT` |
| `guarantee` | A non-guaranteed salary year becoming guaranteed |
| `convert_twoway` | Converting a player between a standard and two-way contract |

If the text is genuinely ambiguous between two types (e.g. "signs their draft pick" could be `pick` or `sign_pick` depending on whether this is the initial rights-award or the rookie contract), ask the user to disambiguate rather than guessing — say what you think it is and why, and let them correct it in the confirmation step (7) if you're wrong.

### 4. Resolve entities

#### 4a. Players

For each player named in `TEXT`, match against `/api/players` the same way as other skills in this repo: build a `lowercase "first last" -> slug` map from each bio's `name` field (`"LAST, FIRST"`), then fuzzy-match with `difflib.get_close_matches`. Confirm uncertain matches with the user in step 7 rather than silently picking the top match if the text used an ambiguous short name (e.g. just a last name shared by multiple players).

For `sign`/`release`/`renounce`/`convert_twoway`/`option`/`guarantee`, cross-check the resolved player is actually in the state the text implies (e.g. don't resolve a `release` against a player who isn't currently on that team's roster per `/api/team-map`) — flag a mismatch instead of proceeding.

#### 4b. Teams

Map city/nickname/owner references to the 30 team abbreviations (`atl bkn bos cha chi cle dal den det gsw hou ind lac lal mem mia mil min nop nyk okc orl phi phx por sac sas tor uta was`, uppercased for the API).

#### 4c. Draft picks — resolve via team ownership, not the raw CSV

**Do not** try to match picks by reading `draft-picks.csv` directly or by naive string equality on `OWNER`. That field can be a pipe-separated multi-team string (`"LAL|BOS"`, meaning contingent/unresolved ownership) or the literal placeholder `"?"` (meaning "not yet determined, defaults to the original team"). Use `GET /api/picks/{team}` for the team the text says currently holds the pick — it applies the correct resolution (`owner == "?"` → falls back to the original team; otherwise `team in owner.split("|")`) — and match on `year`/`round`/`orig` from there.

If a pick reference in the text doesn't cleanly resolve (compound owner, `"?"` placeholder, or you can't find a `year/round/orig` combination matching what's described):

1. Search `GET /api/transactions?team={team}` (or fetch all and filter client-side) for prior `trade`/`pick` entries touching that `year`/`round`/`orig` to reconstruct how it got to its current state.
2. Draft-pick records are known to be incomplete for moves that predate this site's transaction log. If the trail goes cold, **say so explicitly** and ask the user to supply the missing provenance (which trade sent it where) rather than guessing — getting this wrong writes bad ownership data that then compounds for the next person trying to trace the same pick.
3. Once resolved, note in the transaction's `description` field any manual reconciliation you had to do, so the next lookup has more to go on than the last one did.

If the pick's `PROTECTED` or `SWAP_OWNER` fields are non-empty on the current row, surface that to the user before treating the pick as a clean asset — `_apply_trade` only overwrites those fields when the new trade explicitly supplies `protection`/`swap_with`, so stale protection/swap metadata from a previous deal otherwise silently carries over to the new owner.

### 5. Build the structured `details` payload

Use these exact shapes (from `nbn-api/routers/transactions.py`):

```
sign:            { player, team, contract, signing_method?, bird_rights_type? }
pick:            { player, team, pick: { year, round, orig, pick_number? } }
sign_pick:       { player, contract }
release:         { player }
renounce:        { player }
option:          { player, decision: "accept"|"decline", option_type: "PLAYER_OPT"|"TEAM_OPT", year, cap_hold_type?, cap_hold_amount?, bird_tier? }
guarantee:       { player, year }
convert_twoway:  { player, contract }
trade:           { transfers: [ { from_team, to_team, assets: [
                     { type: "player", slug },
                     { type: "pick", year, round, orig, protection?, swap_with? }
                   ] } ], legality: "tbd", exceptions?: { TEAM: "ntmle"|"tmle"|"room_exception" } }
```

`exceptions` (trade only, optional): maps a team abbr to the MLE-type exception it's using to absorb *that team's* incoming salary in this trade, in lieu of matching outgoing salary (rulebook § 4.2a). Only set this when the text explicitly says a team is using its MLE/room exception to make a trade work — don't infer it just because a trade would otherwise fail salary matching; ask the user if it's ambiguous. Omit a team's key (or use `null`) for teams matching normally.

`contract` (used by `sign`/`sign_pick`/`convert_twoway`):
```
{ type: "player"|"two-way", salaries: {"YY-YY": "$amount"}, cap_holds: {"YY-YY": "UFA"|"RFA"|"PLAYER_OPT"|"TEAM_OPT"|"NON_GTD"}, guaranteed?: {...}, guarantee_dates?: {...} }
```

`signing_method` (when the text implies a cap mechanism): `cap_space`, `minimum`, `bird_rights`, `mle`, `ntmle`, `tmle`, `room_exception`, `bae`.

Only include optional fields the text actually implies — don't invent salary numbers, years, or protections that weren't stated or clearly implied.

### 6. Check against the rulebook

Look up the relevant article per the table in this project's CLAUDE.md (Article IV for trades, III for signings, § 6.2 extensions, § 6.1 options, Article V releases, § 3.10 renounce, Article VII draft pick signings). **Only `sign`, `trade`, and `convert_twoway` have real automated validators in the API** (`_validate_sign`, `_validate_trade`, `_validate_convert_twoway` in `transactions.py`) — every other type (`release`, `renounce`, `option`, `guarantee`, `pick`) returns no checks at all from the API regardless of legality. The rulebook itself flags which sections are "🔒 system-enforced" vs "👁 manual review" — for anything marked manual review, you are the check: read the section and reason about whether the described transaction is legal before presenting it, and flag any concern even though the API won't block it.

### 7. Present your interpretation and wait for confirmation

Show the user, plainly:
- What type you've classified this as, and why, if it wasn't obvious
- The resolved players/teams/picks (flag anything fuzzy-matched or reconstructed rather than directly stated)
- The full `details` JSON you're about to submit
- Any rulebook concerns from step 6

**Wait for the user's response. Apply any corrections before proceeding.** Do not submit until they confirm.

### 8. Get the token

Check for an env var holding a usable token — `NBN_TOKEN` or `NBN_ADMIN_TOKEN` (admin satisfies any role check) — **without printing its value** (that leaks the credential into the transcript). List names only, e.g. `env | cut -d= -f1 | grep -iE "nbn|token"`, then reference whichever var exists directly in the curl command (`Bearer $NBN_ADMIN_TOKEN`) rather than echoing it. If neither var is set, ask the user to paste a token with the `rosters` role (or `bod`/`admin`).

### 9. Submit

```bash
curl -s -X POST http://localhost:8001/api/transactions \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type": "<type>", "date": "<DATE>", "description": "<description>", "details": <details>, "force": false}'
```

Set `description` to include (or closely paraphrase) the original `TEXT`, especially for `trade` — this makes the transaction log itself the durable source of truth for the deal, so a future lookup isn't relying on someone's memory of it.

- **Success**: the transaction is applied. Move to step 10.
- **422 with `{"validation": true, "checks": [...], "can_force": true}`**: present each check's `check` name, `level` (`error`/`warning`), and `message`. Ask the user whether to fix the inputs and resubmit, or override. Only resubmit with `"force": true` spliced into the same body if they explicitly say to override — never force automatically.
- **Any other error**: show the detail and stop. Do not retry automatically.

### 10. Verify

For every team and player touched by the transaction, re-fetch and sanity-check against intent:

```bash
curl -s http://localhost:8001/api/roster/{team}
curl -s http://localhost:8001/api/picks/{team}
curl -s http://localhost:8001/api/players    # re-check the touched slugs' bio fields (type, salaries, cap_holds)
```

- For a `trade`, confirm the traded player(s) now appear on the receiving team's roster and no longer on the sending team's, and any traded picks now resolve to the new owner via `GET /api/picks/{team}` for the receiving team specifically (not just absence from the old owner's list — a pick can vanish from view for either team if its `OWNER` ends up in an unexpected compound state).
- For a `sign`/`convert_twoway`/`sign_pick`, confirm `player-bios.json`'s `type` field changed as expected — **that field, not the roster CSV's second column, is the authoritative source for two-way/standard/dead status** (the roster CSV's `OVR` column is the only thing reliably persisted there).
- Report back a short diff: what changed, per team/player, and flag anything that doesn't match what was intended so it can be corrected (remember `DELETE /api/transactions/{id}` only removes the log entry — it does **not** reverse the underlying roster/bio/pick mutation, so a bad transaction needs a corrective follow-up transaction, not a delete, unless you're only cleaning up a duplicate log record after manually undoing the real change).
