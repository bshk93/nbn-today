Parse pending box score screenshots and commit them to the stats database, then any pending injury reports.

Run with no arguments to process all pending games, then all pending injury
reports (step 7), then the day's NBN Twitter posts (step 8) — one sweep for a
stream night.

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

Screenshots are uploaded one team-side at a time, so a game can be pending
with only one side in. Each item carries `ready` — true once both sides have at
least one image. **Parse only `ready` games.** List the others separately as
"waiting on a side" (name the missing team) and leave them alone.

If there are no ready games, report that (and any waiting ones) and go to
step 7 — there may still be an injury report.

Print a numbered list: `id · date · AWAY @ HOME · season game_type · images per side`

### 3. For each pending game

Process one game at a time in the order returned.

#### 3a. Read meta + every image in parallel

`images.home` and `images.away` in the pending list are arrays of
`{file, by, at}` — usually one per side, sometimes two when a long bench
needed a second screenshot. In a single batch of tool calls, read
`/var/lib/nothing-but-stats/pending-boxscores/<id>/meta.json` and every
`/var/lib/nothing-but-stats/pending-boxscores/<id>/<file>` on both sides.

When a side has more than one image, they are the same box score split across
screens: take each player once, and the totals row from whichever image shows
it. If two images overlap on a player, the rows must agree — if they don't,
ask.

#### 3b. Transcribe both teams straight to a JSON file — nothing else

With all the images in view, extract every player who played (skip DNP rows) for
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
screenshot; do not copy them from this file. The order the validator was built
for (2K25, and unchanged through the 25-26 season) is:

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
  If a team's minutes then come up short of 240 only because of that rounding, stop and tell the user — do not nudge anyone's minutes to make the total work.
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
or display names — use context to match, and prefer a player on that team's
roster. **The slug is the only thing that identifies the player.** The commit
writes the bio's name for that slug, whatever `player` says, and refuses a slug
with no bio.

If a player cannot be matched to an existing bio, **stop and ask the user.** Do
not invent a slug. A genuinely new player needs a bio created first; a misread
name needs re-reading. Ask about any match you are not sure of too: a wrong
slug files one player's line under another, and every check still passes.

Add the resolved `slug` into each row (keep `player` as shown, for the report).

### 4. Commit

Build the payload from `.checked.json` (it already has `dreb` on every row) plus
`date`, `season`, `game_type`, `game_num` and `round_num` copied from `meta.json`
(never from the example below), and POST:

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
  "season": "26-27",
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

Don't send `skip_reward`. The API pays a game's uploader when the screenshots
arrive, and a commit of a screenshot game pays nothing more by itself.

The commit runs the same checks as the weekly integrity job before it writes,
and requires the season to be the one the date falls in. A `422` names every
problem; nothing was written. Fix the cause and commit again:

- **`is not a player bio`** / **`listed twice`** — a slug from 3d is wrong. Go back to 3d for that player.
- **`is in the YY-YY season`** — the upload's date or season is wrong. Check `meta.json` against the game.
- **anything else** (`bad_arithmetic`, `bad_minutes`, `score_mismatch`, `overtime mismatch`, …) — should not happen after a clean validator pass. Show the user the response; do not edit numbers to get past it.

The first game of a season creates that season's raw file (the log will say
`Created allstats-YY-YY.csv for the first game of YY-YY`) — that is normal, not
a warning. Two responses do need handling:

- **`409 … is already committed`** — the game is in the file. Delete the
  pending item (step 5's `DELETE`) so it leaves the queue; do not force it.
- **`404 Allstats file not found … Only the current season's file is created on
  demand`** — the game's season is not the current league year. Usually the date
  or the season on the upload is wrong; check `meta.json` against the game before
  doing anything else. Do not create the file to get around this.

### 5. Clean up

A successful commit moves the screenshots out of the queue by itself — they
are kept 14 days for reference, then deleted (`routers/boxscore_shots.py` in
nbn-api). Do **not** `DELETE` the pending item after a commit; there is
nothing left to delete. Just remove the scratch files:

```bash
rm -f <scratchpad>/nbn-boxscore-<id>.json <scratchpad>/nbn-boxscore-<id>.checked.json
```

The `DELETE` is only for a game that was already committed (the 409 above):

```bash
curl -s -X DELETE http://localhost:8001/api/boxscore/pending/<id> \
  -H "Authorization: Bearer <TOKEN>"
```

### 6. Continue or stop

If there are more pending games, ask the user if they want to continue. If yes, return to step 3.
When the games are done (or the user stops), go to step 7.

### 7. Injury reports

Follow `.claude/commands/parse-injuries.md` from its step 2, with the token
you already have (it needs `stats` or `rosters`). If none are pending, say so
in one line and go to step 8. Its stops still apply here: a cut-off list, an
unmatched name and every `confirm_heals` player are the user's call, never
yours.

### 8. NBN Twitter

For each game day committed in this run, write one batch of made-up tweets for
the homepage card. Skip this step if no game was committed. It runs without
asking: post, then report the count in one line. A bad tweet is deleted after
the fact (`DELETE /api/tweets/<n>`), not held for review.

**The rule:** the tweets are fiction, the numbers in them are not. Never
invent a trade, signing, injury, quote from a real person or rumor someone
could believe. Fiction is the voices and the reactions, not the events.

**What to read**, and nothing more:

- `curl -s 'http://localhost:8001/api/boxscores?date=<date>'` — the day's games.
  Pick the 3–5 stories worth a tweet: the best line, a blowout or a buzzer
  game, a rivalry, a bad night from a star.
- `curl -s http://localhost:8001/api/members/public` — who owns each team that
  played (the tenure with `end: null`).
- `grep -n -i '<team or owner>' /var/lib/nothing-but-stats/lore/lore.md` for the
  teams and owners in those stories. Grep, don't read the whole file. A callback
  to a real old grudge is what makes a tweet good.
- Optional: `GET /api/players/<slug>/insights` for a streak, or a career
  milestone from the homepage's Milestone Watch. A season or career number is
  allowed only when it came from one of these, read this run.

**The cast.** Use 4–8 tweets per day, from at least three accounts:

| Account | Voice |
|---|---|
| `@NBNStatMuse` "NBN StatMuse" | Dry stat lines and "first since" notes. No jokes. |
| `@NBNInsider` "NBN Insider" | Reports only what really happened today in `GET /api/transactions`. Skip if nothing did. |
| `@GaryOnTheBeat` "Gary Pruitt" | Old, grumpy beat writer. Hates threes, loves defense, has seen it all. |
| `@GMWatchNBN` "GM Watch" | Roasts the owners by name, using the lore. Members are fair game, old scandals included. Punch at decisions and history, never at someone's real life outside the league. |
| Fan accounts, e.g. `@BucksSzn` | One per team that played, if worth it. Overreacts both ways. Set `team`. |
| The players | Own accounts, a made-up handle like `@PBanchero_NBN`. Short, like real player tweets. Set `slug`. |

Handles are 1–15 letters, digits or underscores. Invent `likes` and `retweets`
that fit: a 50-point game gets tens of thousands, a beat writer's take a few
hundred.

**Write it once**, straight to `<scratchpad>/nbn-tweets-<date>.json`:

```json
{"date": "2026-10-23", "tweets": [
  {"handle": "NBNStatMuse", "name": "NBN StatMuse", "teams": ["NYK", "BOS"],
   "about": ["brunson-jalen"], "text": "Jalen Brunson tonight:\n38 points\n9 assists\n0 turnovers",
   "likes": 4200, "retweets": 610}
]}
```

- `teams` is `[away, home]` for the game the tweet is about; leave it out for a
  tweet about the whole night.
- `about` lists every player whose stat the tweet quotes. Write stats as
  `<n> <word>` ("38 points", "12 boards", "6 threes") so the check can read
  them. The checker drops `about` before posting.

Then check it. It compares every quoted stat and final score with the box
score:

```bash
python3 build/check_tweets.py <scratchpad>/nbn-tweets-<date>.json --out <scratchpad>/nbn-tweets-<date>.post.json
```

On a failure, fix only the tweets it names, or cut them, and run it again. Do
not rewrite the batch. Once it passes, post:

```bash
curl -s -X POST http://localhost:8001/api/tweets \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  --data @<scratchpad>/nbn-tweets-<date>.post.json
rm -f <scratchpad>/nbn-tweets-<date>.json <scratchpad>/nbn-tweets-<date>.post.json
```
