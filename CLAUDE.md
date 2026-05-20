# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**NBN (Nothing But Net)** is a static website for a fantasy basketball simulation GM league. It hosts owner history stats, team pages, player profiles, standings, draft history, stats leaderboards, and NBNTV Classics (curated playoff highlights).

## Running locally

No build step. Serve with any static file server from the project root:

```
python3 -m http.server 8080
```

All pages fetch CSVs at runtime relative to the site root, so the server must always be rooted at the project root.

## Data files

All CSVs live at the project root or in subdirectories and are fetched at runtime. They are generated externally — do not rewrite them.

| Pattern | Used by |
|---|---|
| `owner_stats.csv` (symlink to `/var/lib/nothing-but-stats/owner_stats.csv`) | `owners/index.html` |
| `{abbr}-seasons.csv`, `{abbr}-roster.csv`, `{abbr}-picks.csv`, `{abbr}-players.csv` | `teams/{ABB}/index.html` via `teams/team.js` |
| `standings/standings-history.csv`, `standings/playoff-brackets.csv` | `standings/index.html` |
| `game-highs-{p,r,a,s,b,3pm}.csv` | `stats/highs/{stat}/index.html` via `stats/highs/table.js` |
| `totals-{p,r,a,s,b,3pm}.csv` | `stats/totals/{stat}/index.html` via `stats/totals/table.js` |
| `players/player_seasons.csv`, `players/player_seasons_playoffs.csv`, `players/player_awards.csv` | `players/index.html` |
| `h2h-alltime.csv`, `h2h-owners.csv`, `h2h-playoffs.csv` | `h2h/index.html` |
| `hof.csv` | `hof/index.html` |
| `league-history.csv` | `history/index.html` |
| `nbntv-classics/playoff-classics.csv`, `nbntv-classics/playoff-series-margins.csv` | `nbntv-classics/index.html` |
| `/api/trading-block` (JSON via API, not a static file) | `tradeblock/index.html` |

`owner_stats.csv` headers: `owner, teams, seasons, best_reg_season, best_reg_pct, worst_reg_season, worst_reg_pct, reg_w, reg_l, reg_pct, playoff_w, playoff_l, playoff_pct, total_w, total_l, total_pct, playoff_appearances, po_r2, po_conf_finals, po_finals, championships, off_rtg, def_rtg`

## Architecture

No framework or build step. Every page is a self-contained HTML file with inline `<style>` and `<script>`. Two shared JS files break the pattern as described below.

### Shared scripts

**`teams/team.js`** — loaded by every team page (`teams/{ABB}/index.html`). It:
- Defines `TEAMS` (abbr → full name) and `RETIRED_JERSEYS` (per-team retired number data)
- Infers the team abbreviation from `location.pathname`
- Injects all CSS and HTML into `document.body`
- Fetches the four per-team CSVs in parallel (`Promise.allSettled`)
- Exports reusable helpers: `buildTable(cols, rows, sortField, sortDir, renderCell)`, `buildRosterTable`, `buildPicksTable`, `buildEditableGrid`, `setupEditable`
- Handles **edit mode**: committee members can click an "Edit" button on roster/picks sections, enter a bearer token (stored in `localStorage` as `nbn_token`), and save changes via `PUT /api/roster/{ABB}` or `PUT /api/picks/{ABB}` against a backend API running at port 8001.

**`stats/highs/table.js`** and **`stats/totals/table.js`** — loaded by each stat-category page. The page sets `window.PAGE_CONFIG = { statKey, csvPath }` before the script tag, and the script reads that config to know which CSV to fetch and which column to highlight as primary.

### owners/index.html data flow

1. `fetch('/owner_stats.csv')` → `parseCSV(text)` → array of row objects keyed by CSV header
2. `buildTable(rows)` creates the `<table>`, renders `<thead>` from the `COLS` array, attaches sort click handlers, calls `rebuildBody`
3. `rebuildBody(rows, tbody)` sorts rows and re-renders all `<td>` cells on every sort change

### COLS array (owners/index.html)

Each entry in `COLS` (`owners/index.html:164`) defines a column:
- `key` — CSV field name (used as fallback cell text)
- `sortField` — the CSV field actually sorted on (may differ from `key`)
- `cls` — space-separated CSS classes applied to both `<th>` and `<td>`
- `display(row)` — optional function returning the cell's display string; omit to use `row[key]` directly
- `defaultDir` — sort direction when first clicking this column (`-1` = descending, `1` = ascending)

The `buildTable` function in `teams/team.js` uses the same shape for team-page tables.

### Special cell rendering

Custom rendering is done inside `COLS.forEach` / `renderCell` callbacks. The `championships` column in `owners/index.html` is the canonical example: it creates a `.trophy.trophy-gold` `<span>` instead of plain text. In `teams/team.js`, `makeSeasonRenderCell` handles FOTY/COTY badges and playoff result coloring.

RTG/DIFF columns get heat-map coloring via inline `td.style` (hue 0–120 mapped to min–max of the column).

### NBNTV Classics blurbs

`nbntv-classics/index.html` stores blurbs as a plain JS object (`BLURBS`) keyed by `"{DATE}_{player-slug}"` (e.g. `"2021-06-20_curry-stephen"`). This key is stable across rank changes. Empty string means the blurb hasn't been written yet.

### Edit mode (team pages)

The "Edit" button on Roster and Draft Picks sections in team pages calls `setupEditable`, which uses `buildEditableGrid` for in-browser table editing. Saves go to the API backend (`/api/roster/{ABB}` and `/api/picks/{ABB}`) with a `Bearer` token. Token is prompted via a modal and persisted in `localStorage`. A 403 response clears the stored token.

## API backend (`/home/skim/projects/nbn-api/`)

FastAPI app running as a systemd service on port 8001, proxied through nginx. Source: `/home/skim/projects/nbn-api/main.py`. Reads/writes CSVs in `/var/lib/nothing-but-stats/`.

### Roles

| Role | Permissions |
|---|---|
| `rosters` | `PUT /api/roster/{team}`, `PUT /api/picks/{team}` |
| `admin` | Everything `rosters` can do + token management (`GET/POST/DELETE /api/tokens`) |
| `atl`, `bkn`, `bos`, `cha`, `chi`, `cle`, `dal`, `den`, `det`, `gsw`, `hou`, `ind`, `lac`, `lal`, `mem`, `mia`, `mil`, `min`, `nop`, `nyk`, `okc`, `orl`, `phi`, `phx`, `por`, `sac`, `sas`, `tor`, `uta`, `was` | `PUT /api/trading-block/{team}` for their own team only |

`admin` implicitly satisfies any role check. There is one admin token (yours). Everyone else gets a `rosters` token (or a per-team role once permissions are wired up).

Valid roles are enforced at token creation time — `POST /api/tokens` rejects any unrecognized role name.

### Trading Block endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/trading-block` | Public | Returns `{ "ATL": [{player, notes}], … }` for all 30 teams |
| `PUT /api/trading-block/{team}` | Team role or admin | Replaces that team's list; body is `[{player, notes}]` |

Data stored in `/var/lib/nothing-but-stats/trading-block.json`. The page at `tradeblock/index.html` fetches this API plus the relevant teams' roster CSVs to join player metadata (POS, OVR, AGE, salary columns).

### Token management

Tokens are stored in `/var/lib/nothing-but-stats/tokens.json` as `{ "<hex-token>": { "name": "...", "roles": [...] } }`.

**Create a token** (send to new rosters member over Discord DM):
```bash
curl -X POST https://nbn.today/api/tokens \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Their Name", "roles": ["rosters"]}'
```

**List all tokens:**
```bash
curl https://nbn.today/api/tokens -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Revoke a token:**
```bash
curl -X DELETE https://nbn.today/api/tokens/TOKEN_TO_REVOKE \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Revocation is instant — the next save attempt returns 403 and the browser clears the stored token automatically.

### Service management

```bash
systemctl status nbn-api          # check status
sudo systemctl restart nbn-api    # restart
journalctl -u nbn-api -f          # live logs
journalctl -u nbn-api -n 50       # last 50 log lines
```

### Roster CSV columns

**Post-migration (new format):**

| Column | Description | Example |
|---|---|---|
| `SLUG` | Player slug (key into player-bios.json) | `barnes-scottie` |
| `OVR` | Overall rating | `86` |

All other player data (name, pos, age, type, cap holds, salaries) lives in `player-bios.json` and is joined at render time.

**Legacy format (pre-migration):** columns were `PLAYER, POS, AGE, OVR, TYPE, CAP_HOLDS, 25-26, 26-27, …`. `team.js` handles both formats transparently — if the CSV has a `SLUG` column (and no `PLAYER`), it uses the new path; otherwise falls back to the legacy path.

`CAP_HOLDS` is comma-separated `YEAR:TYPE` pairs. Valid types: `UFA`, `RFA`, `PLAYER_OPT`, `TEAM_OPT`, `NON_GTD`.

### Player bios (player-bios.json)

Canonical player data lives in `/var/lib/nothing-but-stats/player-bios.json`, served by `GET /api/players`. Fields:

| Field | Description |
|---|---|
| `name` | `"LAST, FIRST"` uppercase |
| `pos` | Array: subset of `["PG","SG","SF","PF","C"]` |
| `dob` | ISO date `"YYYY-MM-DD"` |
| `college`, `country` | Strings |
| `draft_year`, `draft_round`, `draft_pick` | Integers or null |
| `photo_url` | String |
| `type` | `"player"`, `"two-way"`, `"dead"`, or `""` |
| `cap_holds` | String, same format as old CSV column |
| `salaries` | Dict keyed by season string: `{"25-26": "$37,000,000"}` |

Endpoints: `GET /api/players` (public), `POST /api/players` (admin, creates), `PUT /api/players/{slug}` (rosters role, upserts).

### Migration script

`players/migrate_rosters.py` — one-time script to migrate 30 roster CSVs from legacy format to `SLUG,OVR`. Dry run by default; `--apply` writes changes. Run after all team/tradeblock/bio pages are updated to handle new format.

### Picks CSV columns

| Column | Description | Example |
|---|---|---|
| `YEAR` | Draft year | `2026` |
| `ROUND` | Round | `1st` or `2nd` |
| `TEAM` | Origin or destination | `Own`, `from NYK` |
| `TYPE` | Direction | `own` or `acquired` |

## Data model

The core entities and how they relate.

### Player

A player is the stable identity unit across the whole site. The canonical store is `player-bios.json` (served via `GET /api/players`), keyed by **slug** (`"curry-stephen"`).

#### Slug

The slug is the permanent primary key for a player — it ties together the bio, roster entries, OVR history, stats rows, and awards. It is set once at creation (`POST /api/players`) and **never changes**. There is no rename endpoint; changing a slug would orphan every other reference to that player across all CSVs and history files.

#### Fields: set once, never changed

These are historical facts about the player. Correct a typo if you must, but they should not change as a result of in-league events.

| Field | Type | Notes |
|---|---|---|
| `dob` | ISO date | `"1988-03-14"` |
| `college` | string | |
| `country` | string | |
| `draft_year`, `draft_round`, `draft_pick` | int or null | NBN draft position, not NBA — null if undrafted |
| `height`, `wingspan` | string | e.g. `"6'8\""`, `"7'1\""` |
| `weight` | int | lbs |

#### Fields: updated occasionally

These change infrequently but can legitimately be updated as better information is available or as in-league decisions happen.

| Field | Type | When it changes |
|---|---|---|
| `name` | string (`"LAST, FIRST"` uppercase) | Typo correction only; not a game event |
| `pos` | string[] (subset of `PG SG SF PF C`) | If the league reclassifies a player's eligible positions |
| `photo_url` | string | Replaced if a better image is found |
| `jersey_number` | string or null | Updated by the owning team via `PUT /api/players/{slug}/jersey`; only the team owner (or admin) can change it |

#### Fields: change with contract/roster activity

These reflect the current contract state and are updated whenever a transaction touches this player.

| Field | Type | When it changes |
|---|---|---|
| `type` | enum | Changes on transactions: `""` → `"player"` on signing, `"player"` ↔ `"two-way"` on conversion, `"dead"` when a player is cut and only a cap hit remains |
| `salaries` | `{"YY-YY": "$amount"}` | Replaced wholesale on any new contract, extension, or option exercise/decline |
| `cap_holds` | string | Updated alongside `salaries` to reflect the status after each contract year |
| `guaranteed` | `{"YY-YY": "$amount"}` | Guaranteed portion of each year; set when partial guarantees exist |
| `guarantee_dates` | `{"YY-YY": "YYYY-MM-DD"}` | The date after which that season's salary becomes fully guaranteed; cleared once the date passes |

#### OVR (not in player-bios.json)

OVR is **not** stored on the player bio. It lives in a separate append-only log at `ovr-history.json` (served via `GET /api/ovr`), keyed by slug, as an array of `{date, ovr}` entries. The current rating is always the last entry. Updated via `PUT /api/ovr/{slug}` whenever ratings are refreshed (valid range 50–99).

The roster CSV (`{abbr}-roster.csv`) stores the most recent OVR as a convenience column, but `ovr-history.json` is the source of truth for history.

#### Player types

| Value | Meaning |
|---|---|
| `"player"` | Standard roster player |
| `"two-way"` | Two-way contract; salary/cap rules differ |
| `"dead"` | Dead cap entry — no active player, just the cap hit on the books |
| `""` | Unset / not yet classified |

#### Cap holds

`cap_holds` is a comma-separated string of `YEAR:TYPE` pairs, e.g. `"27-28:PLAYER_OPT,28-29:UFA"`. It describes what happens **after** the last contract year — i.e., the player's free-agent or option status in each subsequent offseason.

| Type | Meaning |
|---|---|
| `UFA` | Unrestricted free agent |
| `RFA` | Restricted free agent |
| `PLAYER_OPT` | Player holds option to extend |
| `TEAM_OPT` | Team holds option to extend |
| `NON_GTD` | Non-guaranteed salary year (team can waive without full cap hit) |

### Roster entry

One row in `{abbr}-roster.csv`. Links a player to a team for the current season.

| Column | Notes |
|---|---|
| `SLUG` | Foreign key into `player-bios.json` |
| `OVR` | Overall rating (integer, e.g. `86`) |

All other display data (name, position, age, salary, cap holds) is joined from `player-bios.json` at render time.

### Draft pick

One row in `{abbr}-picks.csv`. Represents a future draft pick owned by or owed by the team.

| Column | Values | Notes |
|---|---|---|
| `YEAR` | e.g. `2026` | Draft year |
| `ROUND` | `1st` or `2nd` | |
| `TEAM` | `Own`, `from NYK`, … | Origin team (for acquired picks) or `Own` |
| `TYPE` | `own` or `acquired` | Whether the team retains or receives this pick |

A trailing `*` on `TEAM` (e.g. `Own*`) conventionally marks a pick with conditions.

### Player season

One row in `players/player_seasons.csv` (regular season) or `players/player_seasons_playoffs.csv` (playoffs). Aggregated stats for one player in one season on one team.

Key columns: `PLAYER`, `SEASON` (e.g. `"24-25"`), `TEAM`, `G`, `MIN`, `PTS`, `REB`, `AST`, `STL`, `BLK`, `3PM`, `GMSC` (game score total), and single-game highs (`HIGH_P`, `HIGH_R`, etc.). Also carries bio snapshot fields (`DOB`, `COLLEGE`, `PHOTO_URL`, `NBN_DFT_*`) and `SLUG`.

`RINGS` (reg season only) counts championship rings the player holds as of that season.

### Player award

One row in `players/player_awards.csv`. One award instance per player per season.

| Column | Example |
|---|---|
| `SLUG` | `"durant-kevin"` |
| `PLAYER` | `"Durant, Kevin"` |
| `SEASON` | `"20-21"` |
| `AWARD` | `"All-Star"`, `"MVP"`, `"DPOY"`, `"All-NBN 1st"`, … |

### Team season

One row in `{abbr}-seasons.csv` (and mirrored in `standings/standings-history.csv`). One team's record for one regular season.

Key columns: `SEASON`, `W`, `L`, `PCT`, `PPG`, `OPPG`, `DIFF`, `SEED` (e.g. `"East-3"`), `SEED_NUM`, `OFF_RTG`, `DEF_RTG`, `PLAYOFF_RESULT`, `FOTY` (Franchise of the Year, bool), `COTY` (Coach of the Year, bool).

`PLAYOFF_RESULT` values: `Missed`, `First Round`, `Conf Finals`, `Runner-Up`, `Champion`.

### Owner

One row in `owner_stats.csv`. Career-aggregate stats for a GM across all seasons they managed a team.

Key columns: `owner`, `teams` (comma-separated abbrs), `seasons`, `reg_w/l/pct`, `playoff_w/l/pct`, `playoff_appearances`, `po_r2`, `po_conf_finals`, `po_finals`, `championships`, `off_rtg`, `def_rtg`.

### HOF entry

One row in `hof.csv`. Tracks a player's Hall of Fame eligibility score.

Key columns: `PLAYER`, `TEAMS`, `HOF_POINTS`, `RINGS`, `PLAYOFF_APPS`, `ALLSTARS`, `ALL_NBN_1/2/3`, `MVP`, `DPOY`, `G`, `P/R/A/S/B` (career totals), `ACTIVE` (bool).

### Game high

One row in `game-highs-{p,r,a,s,b,3pm}.csv`. A single-game stat record entry.

Key columns: `RANK`, `DATE`, `SEASON`, `PLAYER`, `TEAM`, `OPP`, `gametype` (`REGULAR` or `PLAYOFF`), plus the six stat columns (`P`, `R`, `A`, `S`, `B`, `3PM`).

### Playoff bracket

One row in `standings/playoff-brackets.csv`. One matchup in one season's bracket.

| Column | Notes |
|---|---|
| `SEASON` | e.g. `"24-25"` |
| `ROUND` | `1` (first round) through `4` (finals) |
| `T1`, `T2` | Team abbreviations |
| `T1_W`, `T2_W` | Wins per team |
| `WINNER` | Winning team abbreviation |
| `T1_SEED`, `T2_SEED` | e.g. `"East-1"` |
| `T1_SEED_NUM`, `T2_SEED_NUM` | Integer seed |
