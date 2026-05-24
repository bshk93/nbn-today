Parse pending box score screenshots and commit them to the stats database.

Run with no arguments to process all pending games.

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

#### 3b. Parse both teams in one pass

With both images in view, extract every player who played (skip DNP rows) for **both** teams simultaneously.

2K box score column order (left to right): MIN, PTS, REB, AST, STL, BLK, TO, FGM/FGA, 3PM/3PA, FTM/FTA, OREB, PF

- DREB is not shown — derive it as REB − OREB
- Use player names **exactly as shown** in the screenshot — do not guess or look up rosters
- Mark any name or number that is hard to read with **[?]**
- Extract team scores from the screenshot if shown

Run these sanity checks on every row:
1. **Points formula**: PTS = (FGM − 3PM) × 2 + 3PM × 3 + FTM
2. **Bounds**: 3PM ≤ FGM, FTM ≤ FTA, FGM ≤ FGA, 3PM ≤ 3PA, OREB ≤ REB
3. **Team total**: sum of player PTS = team score, if shown
4. Teams must have different scores
5. Total minutes across both teams ≈ 240 (or 240 + multiple of 10 for OT)
6. MAX 6 PF per player, MAX 48 MIN per player

Flag any row that fails a check with **[!]**.

#### 3c. Present results and ask for confirmation

Print a clean summary:

```
Game: HOME vs AWAY — DATE (SEASON, GAME_TYPE)

HOME (score: XX)
  Name as shown [?]   MIN  PTS  REB  AST  STL  BLK  TO  PF  FGM/FGA  3PM/3PA  FTM/FTA
  ...

AWAY (score: XX)
  ...

Issues:
  [?] names that were hard to read — please confirm or correct
  [!] rows that failed a sanity check
```

Ask the user to confirm the data or provide corrections. Keep it brief — if everything looks clean, a simple "looks good" is enough.

**Wait for the user's response. Apply any corrections they provide.**

#### 3d. Resolve player slugs

After confirmation, fetch the player registry once:

```bash
curl -s http://localhost:8001/api/players
```

For each confirmed player name, find their slug in the registry by matching the name field (stored as `"LAST, FIRST"` uppercase). The screenshot may show abbreviated or display names — use context to match.

If a player cannot be matched, derive the slug from the confirmed name: `"LAST, FIRST"` → `last-first` (lowercase, spaces to hyphens, remove punctuation). Flag any uncertain derivations and ask the user if needed.

### 4. Commit

Build the payload and POST:

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
```

### 6. Continue or stop

If there are more pending games, ask the user if they want to continue. If yes, return to step 3.
