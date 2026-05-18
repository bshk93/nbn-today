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

`admin` implicitly satisfies any role check. There is one admin token (yours). Everyone else gets a `rosters` token.

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

| Column | Description | Example |
|---|---|---|
| `PLAYER` | Full name | `Scottie Barnes` |
| `POS` | Position(s) | `SF/PF` |
| `AGE` | Age (integer) | `24` |
| `OVR` | Overall rating | `86` |
| `TYPE` | Contract type | `player`, `two-way`, or `dead` |
| `CAP_HOLDS` | Option/hold flags | `29-30:PLAYER_OPT,30-31:UFA` |
| `25-26`, `26-27`, … | Salary by season | `$38,661,750` |

`CAP_HOLDS` is comma-separated `YEAR:TYPE` pairs. Valid types: `UFA`, `RFA`, `PLAYER_OPT`, `TEAM_OPT`, `NON_GTD`.

### Picks CSV columns

| Column | Description | Example |
|---|---|---|
| `YEAR` | Draft year | `2026` |
| `ROUND` | Round | `1st` or `2nd` |
| `TEAM` | Origin or destination | `Own`, `from NYK` |
| `TYPE` | Direction | `own` or `acquired` |
