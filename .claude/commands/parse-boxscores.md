Parse pending box score screenshots and commit them to the stats database.

Run with no arguments to process all pending games.

## Steps

### 1. Get admin token

Check `echo $NBN_TOKEN`. If non-empty, use it as the Bearer token. Otherwise ask the user to paste their admin token.

### 2. List pending games

```bash
curl -s http://localhost:8001/api/boxscore/pending \
  -H "Authorization: Bearer <TOKEN>"
```

If the result is an empty array, report "No pending games" and stop.

Print a numbered list of pending items: `id · date · HOME vs AWAY · season game_type`.

### 3. For each pending game

Process one game at a time in the order returned.

#### 3a. Read the meta

The pending folder is at `/var/lib/nothing-but-stats/pending-boxscores/<id>/`. Read `meta.json` with the Read tool to get `home_team`, `away_team`, `date`, `season`, `game_type`, `game_num`, `round_num`, `home_image`, `away_image`.

#### 3b. Load roster context

Read `/var/lib/nothing-but-stats/player-bios.json`. For each team, read their roster CSV at `/var/lib/nothing-but-stats/<team_lower>-roster.csv` and build a list of `{slug, name}` for all players on the roster (join slug → name via player-bios.json).

#### 3c. Read the screenshots

Use the Read tool to view both images:
- `/var/lib/nothing-but-stats/pending-boxscores/<id>/<home_image>`
- `/var/lib/nothing-but-stats/pending-boxscores/<id>/<away_image>`

#### 3d. Parse each screenshot

2K box score column order (left to right): MIN, PTS, REB, AST, STL, BLK, TO, FGM/FGA, 3PM/3PA, FTM/FTA, OREB, PF

DREB is not shown — derive it as REB − OREB.

For the **home team** screenshot, extract all players who played (skip DNP). For each player:
- Match the name to the closest player in the home team's roster context
- Convert minutes MM:SS → integer (round down)
- Extract all stat columns: MIN, PTS, REB, OREB, DREB, AST, STL, BLK, TO, PF, FGM, FGA, 3PM, 3PA, FTM, FTA
- Note confidence: high (obvious match), medium (uncertain), low (best guess)
- If the screenshot shows team totals, extract the team score too

Repeat for the **away team** screenshot.

#### 3d. Sanity checks

Run these checks on every row before presenting results:

1. **Points formula**: PTS = (FGM − 3PM) × 2 + 3PM × 3 + FTM
2. **Bounds**: 3PM ≤ FGM, FTM ≤ FTA, FGM ≤ FGA, 3PM ≤ 3PA, OREB ≤ REB
3. **Team total**: sum of all player PTS = team score from the screenshot, if exists
4. Teams cannot have the same score.
5. Minutes total between the two teams in a game should be 240 (most games) or 240 plus a multiple of 10 (denoting one or more 5-minute overtime periods were played)
6. Maximum 6 PF
7. Maximum 48 M
8. PTS ≤ team score
9. Sum of columns match total row

Flag any row that fails with [?].

#### 3e. Present results for review

Print a clear summary:

```
Game: HOME vs AWAY — DATE (SEASON, GAME_TYPE)

HOME (score: XX)
  Player Name [slug]          MIN  PTS  REB  AST  STL  BLK  TO  PF  FGM/FGA  3PM/3PA  FTM/FTA
  ...

AWAY (score: XX)
  ...

Issues:
  - any name mismatches or low-confidence reads
```

Mark any low/medium confidence entries with [?]. Ask the user to confirm or provide corrections before continuing.

Wait for the user's response. Apply any corrections.

### 4. Commit

Once the user confirms the data is correct, build the commit payload and POST to:

```bash
curl -s -X POST http://localhost:8001/api/boxscore/commit \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '<JSON payload>'
```

The payload shape:
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

After a successful commit, delete the pending item:

```bash
curl -s -X DELETE http://localhost:8001/api/boxscore/pending/<id> \
  -H "Authorization: Bearer <TOKEN>"
```

### 6. Continue or stop

If there are more pending games, ask the user if they want to continue to the next one. If yes, go back to step 3. If no, stop.
