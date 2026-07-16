# box-score-video pipeline

Reads NBN box scores off the day's YouTube VOD (2K MyNBA "Association" UI)
instead of hand-transcribing screenshots. Accuracy comes from **fixed-UI
structure + multi-frame voting + arithmetic validators**, not from asking an
LLM to read an image (that was the old approach that hurt accuracy).

Flow (target): VOD URL → (your PC) `yt-dlp` download + `scp` here → server job
→ transcribed box scores with low-confidence cells flagged → **you confirm** →
existing `allstats` pipeline.

## Step 1 — `classify.py` (DONE)

Walks a VOD, classifies every sampled frame by screen type, coalesces into
segments, tracks the in-game day, and prints a timeline + per-day box-score
list + dwell stats. **No stats are read yet** (that's step 2).

```
python3 classify.py VIDEO.mp4 [--fps 5] [--workers N] [--json out.json]
                    [--frames-dir DIR]   # reuse already-extracted frames
```

### How it works (fast on a 1-core box)

- **Pass 1 (pixel-only, no OCR):** each frame → `dark` (brightness < 20:
  injury popup / menu / transition), `box_player` (bright yellow NAME header
  cell), or `bright` (other content). This rejects the injury-popup wall
  (~half a VOD) and flags player box scores — the two biggest frame classes —
  with zero tesseract calls.
- **Pass 2 (OCR only where needed):** each `bright` run is OCR-sampled every
  ~0.4s and split by screen type — `team_comparison` (skip), `daily_view`
  (carries the date), `calendar` (cursor date). Sampling densely enough to
  catch the **transient ~1s daily_view flashes** between games is what makes
  day boundaries work.
- **Day tracking:** `daily_view` is authoritative. Its header is either an
  absolute date (the sim's current day) or a **relative** token reached via the
  LT/RT toggle — `YESTERDAY` → today−1, `N DAYS AGO` → today−N. Calendar dates
  are just the streamer's cursor scrubbing and only seed a fallback anchor.

### Discriminators (see `ocrutil.REGIONS`)

| Screen | Banner | Signal |
|---|---|---|
| player box score | `Association Box Score` | yellow `NAME` header cell (pixel) |
| team comparison | `Association Box Score` | bright, `STAT` header (no yellow) |
| daily view | `Association Daily View` | date / `YESTERDAY` top-left |
| calendar | (tab) | `Month Dayth, YYYY` top-right |

### Verified on `boxscore-vod-long-example.mp4` (6:07, 1080p60, two days)

- 17 player box scores found, correct team names, split correctly into
  **Mar 9 (5 games, "Today") + Mar 8 (12 games, "Yesterday")**.
- Dwell median **5.6s ≈ 27 frames/box @ 5fps** — ample for step-2 voting.
- ~4 min wall on 1 core (scales with game count, not VOD length).

Known: an occasional duplicate box score when the streamer re-opens a game
(e.g. IND@SAC twice) — dedup in step 2. `team_comparison` can absorb some
end-of-stream nav screens (cosmetic).

## Step 2 — cell reader (`bsread.py` + `bsvalidate.py`, core working)

For each `box_player` segment:
- **`bsread.read_frame`** — OCR the whole table in ONE tesseract call/frame
  (the grid is fixed, so tesseract returns one row/line, name + 12 stats in
  order). Parse = last 12 tokens are stats, rest is the name; DNP rows kept.
- **`bsread.vote_box`** — a segment shows BOTH teams (LT/RT toggle), so split
  by the mid-panel active-team nickname (fuzzy-matched to the game's two teams)
  and **majority-vote each cell** across frames. Random OCR noise averages out;
  partial-name junk rows (<25% frame presence) are dropped. Subsample frames
  (~10) — voting converges fast and each OCR call is ~1-2s on 1 core.
- **`bsvalidate.validate_team`** — parse FG/3PT/FT "made-att"; **reconstruct a
  dropped hyphen** (`49`→`4-9`) from `PTS = 2*FGM + 3PM + FTM`; check
  constraints (made<=att, 3PM<=FGM), the per-player PTS identity, and
  **column sums vs the Total row**. Emits per-cell flags
  (`low-agreement` / `unparsed` / `repaired` / `made>att` / `pts!=`).

- **`bsroster.reconcile`** — match voted names to real players: try the game
  team's `{abbr}-roster.csv` first, then fall back **league-wide** (all
  `player-bios.json`). Attaches canonical name + slug; drops rows that match no
  real player (junk); **flags `off_roster`** when a player matched only
  league-wide. NB: **2K in-game rosters drift from the NBN CSVs** (a player can
  score for a team the CSV doesn't list them on — e.g. S. Curry for the 76ers),
  so matching must NOT be team-restricted, and off-roster hits are surfaced for
  the reviewer (they may signal a needed transaction or a stale CSV).
- **`readboxes.py`** — the driver: `timeline.json` + frames → per box_player
  segment: subsample ~22 frames → `vote_box` → `reconcile` → `validate_team` →
  printed report (flagged cells `*`, off-roster ⚠) + review JSON.

Verified on PHI@CLE: Cavaliers box **column-sums ALL MATCH the Total** with only
4 flagged cells; 76ers box recovered its full roster (incl. off-roster Curry),
PTS within 2 of the Total with the gap flagged.

### Still TODO
- **Dedup** re-opened box scores; **quarter-strip** cross-check; more coverage
  for a briefly-shown team (LT/RT toggle) — sample enough frames.
- **Wire into `allstats`** + a review UI for the confirm step.
- Initial-only names can be ambiguous (S. Curry → Seth vs Stephen) — reviewer
  confirms; a jersey-number or team-context tiebreak could help later.
