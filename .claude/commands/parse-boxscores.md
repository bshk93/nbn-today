Parse pending box score screenshots and commit them to the stats database.

Run with no arguments to process all pending games.

## Why this skill is shaped the way it is

The old version asked the model to transcribe every number **and** show its
arithmetic **and** run sanity checks inline. That is unbounded generation — it
once never terminated. The rule now: **you only transcribe. A script does every
check.** Emit numbers, terse, straight to a file. Do not compute points, do not
narrate bounds, do not "verify" anything in prose. `build/validate_boxscore.py`
owns all of that.

## Steps

### 1. Get token

Check `echo $NBN_TOKEN`. If non-empty, use it as the Bearer token. Otherwise ask the user to paste their admin token.

### 2. List pending games

```bash
curl -s http://localhost:8001/api/boxscore/pending \
  -H "Authorization: Bearer <TOKEN>"
```

If the result is an empty array, report "No pending games" and stop.

Print a numbered list: `id · date · HOME vs AWAY · season game_type`

### 3. For each pending game

Process one game at a time in the order returned.

#### 3a. Read meta + both images in parallel

In a single batch of tool calls, read all three:
- `/var/lib/nothing-but-stats/pending-boxscores/<id>/meta.json`
- `/var/lib/nothing-but-stats/pending-boxscores/<id>/<home_image>`
- `/var/lib/nothing-but-stats/pending-boxscores/<id>/<away_image>`

#### 3b. Transcribe both teams straight to a JSON file — nothing else

With both images in view, extract every player who played (skip DNP rows) for
**both** teams. Write the result **directly to `/tmp/nbn-boxscore-<id>.json`**
with the Write tool, in exactly this shape:

```json
{
  "home_team": "ABC", "away_team": "DEF",
  "home_pts": 110, "away_pts": 105,
  "home_rows": [
    {"player":"Name as shown","min":32,"pts":18,"reb":6,"oreb":1,"ast":4,
     "stl":1,"blk":0,"tov":2,"pf":3,"fgm":7,"fga":14,"tpm":2,"tpa":5,
     "ftm":2,"fta":2}
  ],
  "away_rows": [ ... ]
}
```

2K box score column order (left to right): MIN, PTS, REB, AST, STL, BLK, TO, FGM/FGA, 3PM/3PA, FTM/FTA, OREB, PF

Rules while transcribing:
- **Do not** compute DREB, points, or anything — the script derives DREB and checks points.
- Every value is a plain integer. Use player names **exactly as shown** — do not guess or look up rosters yet.
- `home_pts`/`away_pts` are the final team scores from the screenshot. Omit a field only if it is genuinely not visible.
- Keep going until every row is written. Do not stop to comment on the data. **No prose between rows.**

#### 3c. Run the validator

```bash
python3 build/validate_boxscore.py /tmp/nbn-boxscore-<id>.json
```

The script prints a per-row report, checks the points formula, all bounds
(3PM≤FGM, FTM≤FTA, FGM≤FGA, 3PM≤3PA, OREB≤REB), PF≤6, per-team minutes
(240 + 25·OT, both teams must agree on OT count), per-player minute caps, team
score = sum of player points, and distinct final scores. It writes a normalized
copy (with DREB filled) to `/tmp/nbn-boxscore-<id>.checked.json`.

- **Exit 0 / "PASS":** go to 3d. Tell the user briefly that all checks passed and show a one-line-per-player summary for a sanity glance.
- **Exit 1 / "FAILED":** the report lists each `[!]` cell. Re-examine the image for **only those cells**, fix them in `/tmp/nbn-boxscore-<id>.json` with Edit, and re-run the validator. Repeat until it passes or a cell is genuinely ambiguous.

If a flagged cell is genuinely unreadable in the image, show the user that cell
(with the report line) and ask. Do **not** ask about cells that passed.

#### 3d. Resolve player slugs

Fetch the player registry once:

```bash
curl -s http://localhost:8001/api/players
```

For each player name in `.checked.json`, find their slug by matching the `name`
field (stored as `"LAST, FIRST"` uppercase). The screenshot may show abbreviated
or display names — use context to match. If a player cannot be matched, derive
the slug: `"LAST, FIRST"` → `last-first` (lowercase, spaces→hyphens, strip
punctuation). Flag any uncertain derivation and ask if needed.

Add the resolved `slug` and normalized `player` (`"LAST, FIRST"`) into each row.

### 4. Commit

Build the payload from `.checked.json` (it already has `dreb` on every row) plus
the meta fields and POST:

```bash
curl -s -X POST http://localhost:8001/api/boxscore/commit \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '<JSON>'
```

Payload shape:
```json
{
  "date": "YYYY-MM-DD",
  "home_team": "ABC",
  "away_team": "DEF",
  "season": "25-26",
  "game_type": "REG",
  "home_pts": 110,
  "away_pts": 105,
  "game_num": null,
  "round_num": null,
  "home_rows": [
    {
      "player": "LAST, FIRST",
      "slug": "last-first",
      "min": 32, "pts": 18, "reb": 6, "oreb": 1, "dreb": 5,
      "ast": 4, "stl": 1, "blk": 0, "tov": 2, "pf": 3,
      "fgm": 7, "fga": 14, "tpm": 2, "tpa": 5, "ftm": 2, "fta": 2
    }
  ],
  "away_rows": [...]
}
```

Report the API response. If `ok: true`, report how many rows were added.

### 5. Clean up

```bash
curl -s -X DELETE http://localhost:8001/api/boxscore/pending/<id> \
  -H "Authorization: Bearer <TOKEN>"
rm -f /tmp/nbn-boxscore-<id>.json /tmp/nbn-boxscore-<id>.checked.json
```

### 6. Continue or stop

If there are more pending games, ask the user if they want to continue. If yes, return to step 3.
