Parse pending box score screenshots and commit them to the stats database.

Run with no arguments to process all pending games.

## Why this skill is shaped the way it is

The old version asked the model to transcribe every number **and** show its
arithmetic **and** run sanity checks inline. That is unbounded generation — it
once never terminated. The rule now: **you only transcribe. A script does every
check.** Emit numbers, terse, straight to a file. Do not compute points, do not
narrate bounds, do not "verify" anything in prose. `build/validate_boxscore.py`
owns all of that.

The one thing you **do** read and report on is the **header row**. Field mapping
is the single assumption this whole skill rests on, a 2K release can change it,
and a mapping that is off by one column produces a box score of entirely
plausible numbers in the wrong fields. So: transcribe the labels you actually
see, and let the validator compare them. Never map a column by the remembered
order below when the header on screen disagrees with it.

## The first game after a new 2K release

Parse **one** game, alone, and stop at 3c before committing. Everything this
skill assumes about the screen is checked there, and the append-only file means
a wrong assumption is not something that gets tidied up afterwards.

Report to the user, whatever the exit code: the header you read, whether the
totals row was present and where it sits, and whether minutes were `MM:SS` or
whole numbers. If the header check fails, that is the pipeline working — the
layout genuinely changed, and `EXPECTED_COLUMNS` / `COLUMN_ALIASES` in
`build/validate_boxscore.py` need updating before any game of the new season is
committed. Once one game passes cleanly, the rest of the night is routine.

## Steps

### 1. Get token

Check `echo "$NBN_ADMIN_TOKEN"`, then `echo "$NBN_TOKEN"`. Use whichever is
non-empty as the Bearer token. Only if both are empty, ask the user to paste
their admin token.

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
**both** teams. Write the result **directly to `<scratchpad>/nbn-boxscore-<id>.json`**
with the Write tool (use this session's scratchpad directory — not `/tmp`, which
has a tmpfs quota that makes every Bash call fail silently once it fills), in
exactly this shape:

```json
{
  "home_team": "ABC", "away_team": "DEF",
  "home_pts": 110, "away_pts": 105,
  "columns": ["MIN","PTS","REB","AST","STL","BLK","TO","FG","3PT","FT","OREB","PF"],
  "home_rows": [
    {"player":"Name as shown","min":32,"pts":18,"reb":6,"oreb":1,"ast":4,
     "stl":1,"blk":0,"tov":2,"pf":3,"fgm":7,"fga":14,"tpm":2,"tpa":5,
     "ftm":2,"fta":2}
  ],
  "away_rows": [ ... ],
  "home_totals": {"pts":110,"reb":44,"oreb":9,"ast":25,"stl":7,"blk":4,
                  "tov":13,"pf":18,"fgm":41,"fga":88,"tpm":12,"tpa":33,
                  "ftm":16,"fta":20},
  "away_totals": { ... }
}
```

**`columns` — the header row, verbatim, left to right.** Read the labels off the
screenshot; do not copy them from this file. Through 2K25 the order has been:

    MIN, PTS, REB, AST, STL, BLK, TO, FGM/FGA, 3PM/3PA, FTM/FTA, OREB, PF

That is what the validator expects, and it is **the expectation, not the
instruction**. If what you see differs in any way — a column moved, a new one
appeared (`+/-`, `GmSc`), one is gone — write down what is actually there and map
each number by its own header. The validator will stop the commit and say so;
that is the intended outcome, not a problem to work around.

**`home_totals` / `away_totals` — the TOTALS row printed under each box.**
Transcribe it as its own object. It is not redundant: it is the only check on
REB, AST, STL, BLK, TO, OREB and PF, and without it one wrong digit in any of
those columns reaches the file unnoticed. Omit only if the screenshot genuinely
has no totals row.

Rules while transcribing:
- **Do not** compute DREB, points, totals, or anything — the script derives DREB, checks points, and sums the columns itself. Transcribe the totals row as printed; never add up the players to fill it in.
- Every value is a plain integer. Minutes shown as `MM:SS` become whole minutes, rounded down (`31:47` → `31`).
- Use player names **exactly as shown** — do not guess or look up rosters yet.
- `home_pts`/`away_pts` are the final team scores from the screenshot. Omit a field only if it is genuinely not visible.
- Keep going until every row is written. Do not stop to comment on the data. **No prose between rows.**

#### 3c. Run the validator

```bash
python3 build/validate_boxscore.py <scratchpad>/nbn-boxscore-<id>.json
```

The script prints a per-row report, compares `columns` against the layout it
expects, checks the points formula, all bounds (3PM≤FGM, FTM≤FTA, FGM≤FGA,
3PM≤3PA, OREB≤REB), PF≤6, per-team minutes (240 + 25·OT, both teams must agree
on OT count), per-player minute caps, team score = sum of player points, every
column against the TOTALS row, and distinct final scores. It writes a normalized
copy (with DREB filled) to `<scratchpad>/nbn-boxscore-<id>.checked.json`.

- **Exit 0 / "PASS":** go to 3d. Tell the user briefly that all checks passed and show a one-line-per-player summary for a sanity glance. If the report ends with "N check(s) skipped", say which — a pass with the header or totals check absent is a weaker result and the user should know.
- **Exit 1 / "FAILED":** the report lists each `[!]` cell. Re-examine the image for **only those cells**, fix them in `<scratchpad>/nbn-boxscore-<id>.json` with Edit, and re-run. Repeat until it passes or a cell is genuinely ambiguous.

Two failures are **not** yours to fix by re-reading cells — stop and tell the user:

- **`[!] header:`** — the layout is not the one this pipeline was built for. Show the header you read and what was expected. This is the expected result the first time a new 2K release is parsed. It needs `EXPECTED_COLUMNS` / `COLUMN_ALIASES` in `build/validate_boxscore.py` updated, and possibly the field mapping too; that is a code change and a decision, not a transcription retry. **Do not commit the game.**
- **`[!] totals:`** — a column is off against the printed totals but you cannot find the wrong cell after one careful re-read. Show the column and the delta and ask.

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

The first game of a season creates that season's raw file (the log will say
`Created allstats-YY-YY.csv for the first game of YY-YY`) — that is normal, not
a warning. Two responses do need handling:

- **`409 … is already committed`** — the game is in the file. Skip to step 5 and
  delete the pending item; do not force it.
- **`404 Allstats file not found … Only the current season's file is created on
  demand`** — the game's season is not the current league year. Usually the date
  or the season on the upload is wrong; check `meta.json` against the game before
  doing anything else. Do not create the file to get around this.

### 5. Clean up

```bash
curl -s -X DELETE http://localhost:8001/api/boxscore/pending/<id> \
  -H "Authorization: Bearer <TOKEN>"
rm -f <scratchpad>/nbn-boxscore-<id>.json <scratchpad>/nbn-boxscore-<id>.checked.json
```

### 6. Continue or stop

If there are more pending games, ask the user if they want to continue. If yes, return to step 3.
