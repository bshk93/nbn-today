Parse a pending 2K injury report and commit it — the list on `/injuries` and the post to `#injury-report`.

Run with no arguments to process every pending report, oldest first.

## What this is

Each stream day the streamer uploads MyNBA's **Injury History → Entire League**
screen from `/committees/stream` (the 🚑 button on a day). One report per date;
a long list is two or three screenshots. You transcribe the rows, match each
player to a slug, and commit. The API does the rest — diffs against the current
list, writes the history, and posts only what changed to Discord, tagging each
affected team (`routers/injuries.py` in nbn-api).

**You only transcribe and match.** Don't decide what's new, changed or healed —
the commit works that out from the full list you send.

**Anyone not on the report is healed.** That makes a missed row a wrong
"cleared" post, so take every player off every screenshot. The API backs
this up: it won't heal a player who was on a long injury (2+ weeks, or a
duration it can't read) until the user confirms it — step 4.

## Steps

### 1. Get token

Check `echo "$NBN_ADMIN_TOKEN"`, then `echo "$NBN_TOKEN"`. Use whichever is
non-empty as the Bearer token. Only if both are empty, ask the user to paste
their token (it needs the `stats` or `rosters` role).

### 2. List pending reports

```bash
curl -s http://localhost:8001/api/injuries/pending -H "Authorization: Bearer <TOKEN>"
```

Each item is `{id, date, uploaded_by, images: [{file, by, at, url}]}`. If there
are none, say so and stop. Print `id · date · N screenshots · uploaded by`.

Reports must be committed **in date order** — the API refuses one older than
the last committed report.

### 3. For each report

#### 3a. Read every image

In one batch of tool calls, read every
`/var/lib/nothing-but-stats/pending-injury-reports/<id>/<file>`.

The screen's columns are: NAME (abbreviated, e.g. `P. Reed`), team logo, STATUS
(`Hurt` or `Out`), OVR (the injured rating) with the drop in brackets, e.g.
`73 (-2)` — no bracket means no drop), INJURY, DURATION. The highlighted row
and the player card at the top are just the cursor; they are not a separate
entry.

When there are several screenshots they are the same list scrolled: take each
player once. If two screenshots overlap on a player, the rows must agree — if
not, ask.

#### 3b. Transcribe to a file

Write `<scratchpad>/nbn-injuries-<id>.json` with the Write tool (this session's
scratchpad, not `/tmp`):

```json
{"rows": [
  {"player": "P. Reed", "team_shown": "LAL", "status": "Hurt", "ovr": 73, "ovr_delta": -2,
   "injury": "Strained Left Hip", "duration": "4-6 weeks"}
]}
```

- `team_shown` is the abbreviation for the logo you see. If a logo is unclear,
  leave it `null` rather than guess — the roster decides the team anyway.
- `ovr_delta` is negative (`(-2)` → `-2`), or `null` when there is no bracket.
- Injury and duration exactly as shown. No prose between rows.

#### 3c. Is this the whole list?

Since everyone missing is healed, check that the screenshots between them show
the **top and the bottom** of the list: the scrollbar at the right reaches the
end, or there are fewer rows than fit on one screen. If the bottom isn't
visible, **tell the user before committing** — a report cut off at the bottom
clears everyone below the cut. They can upload the rest, or say go ahead.

#### 3d. Resolve slugs

```bash
curl -s http://localhost:8001/api/players
```

Match each `player` (`P. Reed`) against bio `name` (`"REED, PAUL"`): last name
plus first initial, preferring the player on the `team_shown` team's roster
(`/var/lib/nothing-but-stats/<abbr>-roster.csv`, lower-case abbr, one `SLUG` column). If
there is no match, or more than one, **stop and ask** — a wrong slug files one
player's injury under another and pings the wrong team.

### 4. Commit

```bash
curl -s -X POST http://localhost:8001/api/injuries/commit \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"report_id": "<id>", "date": "<date from the pending item>",
       "rows": [{"slug": "reed-paul", "player": "P. Reed", "team_shown": "LAL", "status": "Hurt",
                 "ovr": 73, "ovr_delta": -2, "injury": "Strained Left Hip", "duration": "4-6 weeks"}]}'
```

Report the response: `new`, `changed`, `healed`, how many are injured now, and
every line in `warnings` (a player 2K shows on a different team than NBN's
roster, or one on no roster — the user may want to check those).

- **`422 … is not a player bio` / `listed twice`** — a slug from 3d is wrong; fix it and commit again.
- **`409 … older than the current list`** — a later report is already in. Ask the user; don't change the date to get past it.
- **`409` with `"error": "confirm_heals"`** — players on a long injury are missing from this report, and nothing was written. **This is the check that a row wasn't missed.** For each player in `detail.players`:
  1. Look through the screenshots again for them (search by last name). If they're there, you missed the row: add it and commit again.
  2. If they really aren't there, ask the user, one line each:
     `Paul Reed (LAL) was Out – Strained Left Hip – 4-6 weeks, since Oct 21. Not on today's report — healed?`
  3. Commit again with `"confirm_heals": ["<slug>", …]` naming **only** the players the user said yes to. For a no, ask the user how they want it entered (usually: add the row as last reported).

  Never fill `confirm_heals` without asking — it is the user's answer, not yours.

A successful commit moves the screenshots out of the queue (kept 14 days, then
deleted). Remove the scratch file:

```bash
rm -f <scratchpad>/nbn-injuries-<id>.json
```

To throw away a mistaken upload instead:

```bash
curl -s -X DELETE http://localhost:8001/api/injuries/pending/<id> -H "Authorization: Bearer <TOKEN>"
```

### 5. Continue or stop

If more reports are pending, ask whether to continue, then return to step 3.
