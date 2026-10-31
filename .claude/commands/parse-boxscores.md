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
see, and let the validator compare them. Never map a column by the order in the
example in step 3 when the header on screen disagrees with it.

## The first game after a new 2K release

Transcribe **one** game, alone, and run step 4 without `--commit` (a dry run). Everything this
skill assumes about the screen is checked there, and the append-only file means
a wrong assumption is not something that gets tidied up afterwards.

Report to the user, whatever the exit code: the header you read, whether the
totals row was present and where it sits, and whether minutes were `MM:SS` or
whole numbers. If the header check fails, that is the pipeline working — the
layout genuinely changed, and `EXPECTED_COLUMNS` / `COLUMN_ALIASES` in
`build/validate_boxscore.py` need updating before any game of the new season is
committed. Once one game passes cleanly, the rest of the night is routine.

## Steps

### 1. Get token and API base

Check `echo "$NBN_ADMIN_TOKEN"`, then `echo "$NBN_TOKEN"`. Use whichever is
non-empty as the Bearer token. Only if both are empty, ask the user to paste
their token (it needs the `stats` or `rosters` role).

Then pick `<API>`, the base every call below uses:

1. `$NBN_API`, if it is set.
2. Else `http://localhost:8001`, if `curl -sf -o /dev/null http://localhost:8001/api/build/status` succeeds (you are on the server).
3. Else `https://nbn.today`.

Nothing in this skill reads the server's disk, so it runs the same from any
machine with a clone of this repo. Shell variables don't carry between
commands, so write the chosen base into each command, as with `<TOKEN>`.

### 2. Fetch the night

```bash
python3 build/parse_night.py fetch <scratchpad>/night
```

One call lists the queue and downloads every image of every `ready` game into
`<scratchpad>/night/<id>/`. It prints one `ready` line per game (id, teams,
season, image paths) and one `waiting` line per game still missing a side —
leave those alone and name the missing team in the report. No ready games: say
so and go to step 7.

### 3. Transcribe every game in one Sonnet subagent

Don't read the screenshots yourself. Spawn **one** `general-purpose` Agent with
`model: "sonnet"` and `run_in_background: false` for the whole night, passing it the `ready`
lines from step 2 and these instructions:

> For each game, read its images (all games' images in one batch of Read
> calls), then write `<scratchpad>/night/<id>.txt` — one file per game, all
> files in one batch of Write calls. Transcribe only; compute nothing, comment
> on nothing. Format:
>
> ```
> #columns=MIN,PTS,REB,AST,STL,BLK,TO,FG,3PT,FT,OR,FLS
> #home_pts=105
> #away_pts=93
> HOME
> K. Irving|41 36 3 3 0 1 0 14-29 4-13 4-5 0 2
> TOTAL|240 105 36 28 6 5 4 43-84 13-32 6-8 6 7
> AWAY
> ...
> ```
>
> - `#columns` is the header row **as printed on screen**, left to right — read
>   it, don't copy this example. Each row's values follow that order.
> - Shooting cells stay as `made-att`. `MM:SS` minutes become whole minutes,
>   rounded down.
> - Names exactly as shown. Skip DNP rows.
> - `TOTAL` is the printed totals row; leave it out if the screenshot doesn't
>   show one, never add it up. Same for `#home_pts`/`#away_pts`: only if the
>   final score is visible.
> - Two images for one side are one box score split across screens: each
>   player once.
>
> Reply with one line per game: `<id> done`, plus the header you read if it
> differs from the example.

If the subagent reports a different header, follow "The first game after a new
2K release" above: the validator will hold those games, and that is a code
change, not a retry.

### 4. Check and commit everything

```bash
python3 build/parse_night.py run <scratchpad>/night --commit
```

Per game, the script maps each column by its header label, runs
`build/validate_boxscore.py`, resolves every name to a slug (exactly one match
on that team's roster, or it holds the game), and commits only games where all
of that is clean. Each line shows the final score and either `committed N rows`
or `HELD` with the reasons. A clean game's scratch files are deleted after the
commit. A game that is already committed is taken off the queue.

The commit API rejects a game that fails its own checks with a `422`, and the
script reports it as `HELD`. Nothing is written.

### 5. Fix held games

For each held game only:

- **`[!]` cell flags** (bounds, points, minutes, totals): `SendMessage` the
  same subagent the flagged lines and ask it to re-read only those cells and fix
  them in `<id>.txt`. Then re-run step 4 — committed games are no longer
  pending, so they are skipped.
- **`[!] header`**: stop and tell the user (see the 2K-release section). Don't
  commit.
- **A name with 0 or 2+ roster matches**: ask the user. Don't invent a slug —
  a wrong slug files one player's line under another and every check still
  passes. A genuinely new player needs a bio first.
- **`is in the YY-YY season`** / **`404 … Only the current season's file is
  created on demand`**: the upload's date or season is wrong; tell the user.
- A totals delta you can't find after one re-read, or a cell the subagent
  calls unreadable: show the user the report line and ask.

Never edit a number to get a check to pass.

Report in a short table: game, final score, rows. Name the games where a
`[--]` line says a check was skipped (usually no totals row on screen) in one
line, without commentary. Don't send `skip_reward` — the API pays uploaders
when the screenshots arrive.

### 6. Clean up

`rm -rf <scratchpad>/night` once nothing is held.

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

- `curl -s '<API>/api/boxscores?date=<date>'` — the day's games.
  Pick the 3–5 stories worth a tweet: the best line, a blowout or a buzzer
  game, a rivalry, a bad night from a star.
- `curl -s <API>/api/members/public` — who owns each team that
  played (the tenure with `end: null`).
- `curl -s -G <API>/api/lore/search --data-urlencode 'q=<team or owner>' -H "Authorization: Bearer <TOKEN>"`
  for the teams and owners in those stories. Search, don't read whole documents. A callback
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
| `@TripPenimore` "Trip Penimore" | Loud TV hot-take guy, Stephen A. Smith or Colin Cowherd. Catchphrase: a team was "built the right way", said of any team he likes whether it fits or not. Wing defense wins titles: he credits a win to the wing stopper over the guy who scored 40. Wolves homer: a win proves him right, a loss is a fluke, the refs or the schedule. Jabs at Houston whenever he can, even off topic, but only at their basketball (roster, moves, results). All caps for emphasis, total certainty, bold predictions, often wrong or illogical; contradicts last week's take and never admits it. Never names the Wolves' owner. Bad logic is fine, wrong numbers are not. |
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
python3 build/check_tweets.py <scratchpad>/nbn-tweets-<date>.json --out <scratchpad>/nbn-tweets-<date>.post.json --api <API>
```

On a failure, fix only the tweets it names, or cut them, and run it again. Do
not rewrite the batch. Once it passes, post:

```bash
curl -s -X POST <API>/api/tweets \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  --data @<scratchpad>/nbn-tweets-<date>.post.json
rm -f <scratchpad>/nbn-tweets-<date>.json <scratchpad>/nbn-tweets-<date>.post.json
```
