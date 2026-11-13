---
name: nba2k-box-score-capture
description: Capture every NBA 2K box score screen and the league injury report from an NBN YouTube VOD with Claude in Chrome, then upload them to the night's box score and injury queues on nbn.today. Use when a night's box scores exist only as a stream or VOD, not as uploaded screenshots.
---

# NBA 2K box score capture (YouTube VOD)

> **Where this file runs.** This copy in the repo is the source of truth, but
> Claude in Chrome doesn't read skills from the repo. Add it to your Claude
> account (Settings → Capabilities → Skills, upload this folder zipped), and
> re-upload it after changing this file.

**Runs in Claude in Chrome**, in the user's own browser: YouTube blocks
downloads from cloud servers, so this can't run in a cloud session. The output
goes into the same pending queue as hand-uploaded screenshots, and the night is
then committed by `/parse-boxscores` as usual. This skill never commits
anything, and never reads or types a number into the stats.

Input: a YouTube URL (usually an NBN "Box Scores" stream). Output: every box
score screen and the injury report uploaded to `nbn.today/committees/stats`
under the right date, a zip of the same screenshots
(`NN_AWAY-at-HOME_XmYYs_Team[_p1|_p2].jpg`, `injuries_XmYYs_pN.jpg`) with a
`manifest.json`, and a summary table.

**Budget.** The 11-12 run (4 games, 84.9s video) took about 100 tool calls:
about 50 went on mapping the video one low-res screenshot at a time, and about
14 on hunting for upload refs. The flow below is built to take a fraction of
that. Most of the cost is in screenshots, so every step that can be answered
in JS or in one contact sheet should be.

## The box score screen

- A NAME column, then MIN, PTS, REB, AST, STL, BLK, TO, FG, 3PT, FT, OR, FLS.
  Team logos and the line score are on the left.
- **In the line score, the top row is the AWAY team, the bottom row HOME**
  (checked on 11-11, and on 11-12: Detroit on top for DET @ WAS).
- The team named next to the LT/RT icons above the table is the side shown.
- **First screen vs scrolled (p2) screen**, from the footer: a first screen
  shows **Sort, View Player Card, Quick Nav, Back**; a screen scrolled to the
  bottom shows only **Quick Nav, Back**, with the **Total** row highlighted.
  This is the cue to spot a p2 in a contact sheet.
- **p1 does not always come before p2 in time.** On 11-12 the Hornets' p2 was
  at 38.5s and their p1 at 40.5s: the operator opened on the bottom of the
  list and scrolled up. Label by what the screen shows, never by order.

## 0. Open the stats page first

The stats page settles the night, gives the list of games to look for, and
shows what's already uploaded. Do it before touching the video.

1. Open `https://nbn.today/committees/stats` in a new tab. **If the first call
   on the new tab errors, navigate it again before retrying anything**: on
   11-12, every call (`get_page_text`, `javascript_tool`) failed until the
   second navigation.
2. The user must be signed in with the `stats` or `rosters` role; if the page
   shows no upload boxes, stop and say so.
3. Read the page in one JS call:
   ```js
   [...document.querySelectorAll('[data-slot]')].map(e=>e.dataset.slot+(e.querySelector('img')?' [has image]':''))
   ```
   Each team box is `data-slot="<date>|<TEAM1>~<TEAM2>|<TEAM>"`. **The pair
   is in alphabetical order, not away~home** (`PHI~TOR` for TOR @ PHI). The
   day's own heading lists its games as `AWAY @ HOME` with a time, and a count
   ("Thu, Nov 12, 0 of 4 entered"); take away/home from there. The injury row
   is `data-slot="injury"` inside the day.
4. Note, for each recent day still open: its games (away @ home), and which
   sides already have an image or read "already committed"/"already pending".

### Which night is it?

**The night is the one whose games are on the video, not the video title or
the in-game calendar.** Both have been wrong:

- The title is the day it was streamed: `NBN 11/9: Box Scores` held the
  **11-04** games.
- The MyNBA calendar after the sim shows **the day after** the games: it read
  November 13th for the Nov 12 games. The footer's "Recent Records" ticker on
  the box score screens shows **the day before** (November 11th for the Nov 12
  games). Together they bracket the night, but treat both as hints only; on
  11-12 the calendar was too blurred to read at all.
- **What decides it:** after step 2, every matchup on the video must be
  listed under exactly one open date on the stats page, with the same two
  teams. That date is the night. If no single date has every game you found,
  stop and ask the user. Never move a game to another date to make it fit.

Season and game type come from the queue, not from the video.

## 1. Open and prep the video (one JS call)

Navigate the YouTube tab to the URL. Wait about 2s, then run:
```js
const v=document.querySelector('video'); v.pause();
const p=document.getElementById('movie_player');
p.setPlaybackQualityRange?.('hd1080','hd1080'); p.setPlaybackQuality?.('hd1080');
let cv=document.getElementById('ovl')||document.body.appendChild(Object.assign(document.createElement('canvas'),{id:'ovl'}));
cv.width=1920; cv.height=1080;
cv.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;background:#000';
const seek=(t,ms)=>new Promise(r=>{v.addEventListener('seeked',()=>setTimeout(r,ms),{once:true});v.currentTime=t});
window._show=async t=>{v.pause();await seek(t,400);cv.width=1920;cv.height=1080;cv.getContext('2d').drawImage(v,0,0,1920,1080);return v.currentTime};
window._sheet=async(ts,cols=3)=>{
 const W=1920/cols,H=1080/cols,x=cv.getContext('2d');
 cv.width=1920;cv.height=1080;x.fillStyle='#000';x.fillRect(0,0,1920,1080);
 for(let i=0;i<ts.length&&i<cols*cols;i++){
  await seek(ts[i],250);
  const cx=(i%cols)*W,cy=Math.floor(i/cols)*H;
  x.drawImage(v,cx,cy,W,H);x.fillStyle='#f0f';x.font='bold 30px sans-serif';x.fillText(ts[i]+'s',cx+8,cy+H-10);
 } return ts.slice(0,cols*cols)};
window._seg=async(a,b,step)=>{const c=document.createElement('canvas');c.width=60;c.height=40;const x=c.getContext('2d',{willReadFrequently:true});const segs=[];let prev=null,s=a;
 for(let t=a;t<=b;t=+(t+step).toFixed(2)){await seek(t,60);
  x.drawImage(v,640,220,1250,760,0,0,60,40);const d=x.getImageData(0,0,60,40).data;const g=[];for(let i=0;i<d.length;i+=4)g.push((d[i]+d[i+1]+d[i+2])/3);
  const diff=prev?g.reduce((q,y,i)=>q+Math.abs(y-prev[i]),0)/g.length:999; if(prev&&diff>3){segs.push(s+'-'+(+(t-step).toFixed(2)));s=t} prev=g;}
 segs.push(s+'-'+b); return segs.join(' ')};
window._isBox=async(a,b)=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d',{willReadFrequently:true});const o=[];
 for(let t=a;t<b;t++){await seek(t,60);x.drawImage(v,0,0,160,90);const d=x.getImageData(0,0,160,90).data;let best=0;
  for(let y=0;y<90;y++){let n=0;for(let X=60;X<160;X++){const i=(y*160+X)*4;if(d[i]>170&&d[i+1]>150&&d[i+2]<110)n++}best=Math.max(best,n)} if(best>=85)o.push(t)} return o};
[v.duration, p.getPlaybackQuality()]
```
- `_show(t)` paints one exact frame over the whole viewport, with no YouTube
  controls or overlays. Use it before every full capture.
- `_sheet([t1,t2,…], cols)` tiles up to `cols×cols` frames on the same canvas,
  each labelled with its timestamp in magenta. **One screenshot of a sheet
  replaces up to nine low-res screenshots.** `cols=3` (9 frames) is for
  telling screen types apart; `cols=2` (4 frames) when you need to read team
  names or the footer. *Untested as of 11-12: if `cols=3` can't be read, use
  `cols=2` throughout and note it for this file.*

**The returned quality must be `hd1080`.** If it isn't (YouTube can refuse it
on a slow connection), say so in the report. The screenshot is the browser
window, so it comes out at the window's size (about 1126 px wide in the 11-10
to 11-12 tests, read with 0 errors left after `/parse-boxscores`). A wider
window gives a sharper capture; record the real width in the manifest.

## 2. Map the video (JS, then contact sheets)

1. **Segment the whole video in JS.** `await _seg(0, duration, 0.5)` in chunks
   of about 70s (long calls time out). Optionally `await _isBox(0, duration)`
   in chunks of about 100s. **`_isBox` is not a box score detector on its
   own:** on 11-12 it also fired on the injury list (51–65s) and the
   standings (71–82s). Use it only to skip stretches it says are empty.
2. **Contact-sheet every segment.** Take the midpoint of each segment of
   0.5s or longer, in order, and `_sheet` them nine at a time, one screenshot
   per sheet at `scale: 0.6` or so. Don't skip short segments: p2 screens and
   injury list screens are often 1–3s.
3. From the sheets, label every frame: box score (which team, p1 or p2 by the
   footer cue, Total row visible or not), Team Comparison, injury popup,
   injury list (Entire League), calendar/menu, standings, other.
4. Where a label is in doubt (team name too small, p1 vs p2), put just those
   frames on a `cols=2` sheet. Don't fall back to one screenshot per frame.
5. **Match against step 0.** Every game listed for the night needs both
   sides found. Go back for a missing side once, by sheeting the 0.5s frames
   of the stretch where it should be (between its opponent's screen and the
   next Team Comparison).

What 11-12 looked like, as a guide to the order (it varies by night):

| Time (s) | On screen |
|---|---|
| 2–5 | Injury popup (Pelicans), lineups. Not the injury list |
| 10–15 | DET @ WAS: Wizards, Pistons, Team Comparison |
| 19–23 | TOR @ PHI: 76ers, Raptors, Team Comparison |
| 27–31 | DAL @ MIN: Timberwolves, Mavericks |
| 35–43 | CHA @ PHX: Suns p1, Suns p2, Hornets **p2**, Hornets p1, Team Comparison |
| 48–54 | MyNBA menu; per-team injury history (not the league list) |
| 55–64 | **Entire League injury list**, 21 players on 3 screens |
| 65–84 | Calendar (reads the next day), standings, menu |

### Which frames make the box score

- A side needs a p2 when its first screen has no **Total** row. On 11-12, CHA
  and PHX needed one each.
- **Prefer a frame with the Total row on screen even when no p2 is needed.**
  The totals row is what lets the validator cross-check every column.
- Prefer frames with the highlight on the first row (p1) or on Total (p2).
- A side whose list runs past one screen and has no p2 anywhere is incomplete:
  report it, don't upload half a box score.
- A box score missing players is held by the validator only if its totals row
  is visible; without one it can commit short.

## 3. Find the injury report

`/parse-injuries` reads anyone missing from the list as **healed**, so a
partial list does real damage: capture all of it or none.

- **It is not always at the end.** On 11-11 it came after the last box score
  at the very end; on 11-12 it was at 55–64s with the calendar and standings
  after it. Find it in the step 2 sheets.
- The list screen has "Injury History" and "**Entire League**" at the top, a
  player card under that, and NAME, STATUS, OVR, INJURY, DURATION columns,
  sorted longest duration first.
- **Not the list:** New Injury popups during the sim ("INJURY NOTICE - The
  Chicago Bulls have injury issues…", with rotation buttons), and the
  per-team injury history (one team's name instead of Entire League). The
  11-09 test captured two popups and missed the list.
- Capture the top of the list (scrollbar thumb at the top), then each
  scrolled screen until the thumb reaches the bottom (the last rows are
  usually Day-to-Day). Screens overlap by 1–3 rows on their own; keep at least
  one row of overlap between consecutive captures. At most 6 screenshots. If 6
  can't cover the list with overlap, capture none and report it.
- **The bottom never appears:** capture what there is, don't upload it, and
  report it as cut off.
- Popups only, and no list anywhere in the sheets: capture the popups, upload
  them, and say so plainly. `/parse-injuries` knows popups aren't the list.

## 4. Capture to disk

Before uploading, check every game has both teams, at least one shot per
side, a Total row on some frame of each side (or a reported exception), and a
final score off the line score.

For each chosen timestamp, `_show(t)`, then take a full-scale screenshot
**with `save_to_disk: true`**. As each is taken, write down its saved path
next to its target: date, team, part, timestamp. Screenshot ids expire within
minutes, which on 11-12 forced captures and uploads to be interleaved; a path
on disk doesn't expire, so capture everything first, then upload.

Name and list them as:
`NN_AWAY-at-HOME_XmYYs_Team[_p1|_p2].jpg` and `injuries_XmYYs_pN.jpg`, with
`manifest.json` beside them:
```json
{"video": "https://www.youtube.com/watch?v=…", "title": "NBN 11/12: Box Scores", "date": "2026-11-12",
 "quality": "hd1080", "width": 1126,
 "shots": [{"file": "01_DET-at-WAS_0m12s_Pistons.jpg", "t": 12.0, "away": "DET", "home": "WAS",
            "team": "DET", "part": 1, "total_row": true}],
 "injuries": [{"file": "injuries_0m55s_p1.jpg", "t": 55.5, "part": 1, "bottom": false}]}
```
Build the folder, the renames and the zip in one script from the list you
kept, not by matching files to teams by hand afterwards. The VOD link and
timestamps are the lasting source for every number: uploaded screenshots are
deleted 14 days after commit, the VOD isn't.

## 5. Upload to the queue

Switch to the stats tab. **After any upload the box re-renders and every
element ref on the page changes.** Never reuse a ref from before an upload,
and never guess one (button-ref-plus-one worked once on 11-12 and failed
once). Before each upload, get a fresh ref one of two ways:

- `find` for the hidden file input in that team's box (e.g. "file input in the
  PHI box for Nov 12"), or
- `read_page` on that box's own ref with `filter: all`, and take the ref of
  the `button`/`input` with `type=file`.

Then, per side:

- **`file_upload` with `paths`: p1 then p2 in one call.** One call per side
  means no re-render between its two images. *Untested as of 11-12: check
  after the first two-image side that the box shows both images in p1, p2
  order. If the input takes only one file, or the order comes out wrong,
  upload one path per call, p1 first, with a fresh ref before each.*
- If `save_to_disk` or `file_upload` isn't available, fall back to
  `upload_image` with the screenshot id and the file-input ref, one image per
  call, and take each screenshot just before its upload so its id is fresh.
- A side allows at most 4 images.

Rules, unchanged:

- A game **not listed** on that date: the date is wrong or the game isn't on
  the schedule. Stop and ask, don't upload it somewhere else.
- **Name every game of the night you didn't capture.** The stream may cover
  only part of a night (the 11-04 video had 7 of its 14).
- **"already committed"**, **"already pending"**, or a box that already shows
  an image: uploaded by hand. Skip that side and say so.
- After an upload a box shows the screenshot, a remove button and "Add
  another", and the page links it as "Uploaded by" the signed-in member. That
  member gets the usual box score reward; that's expected.

The injury report goes in that day's **Injuries** row (`data-slot="injury"`
inside the day), top to bottom, at most 6, same ref rule. If the row already
has screenshots, or shows links (a committed report), skip it and say so.

Finally, re-run the step 0 JS once and confirm every side you uploaded now
shows an image.

## 6. Clean up and report

Run `document.getElementById('ovl')?.remove()` on the YouTube tab. Send the
user the zip.

Report a table: # | AWAY @ HOME | final (winner first, note OT) | timestamp →
team (p1/p2) | uploaded. Then one line for the night: the date and how it was
settled (stats page match; the title's and calendar's dates if they differ),
and how many of that date's games were captured. Then one line for the
injury report: list or popups, how many screens, timestamps, whether the
bottom was reached, uploaded or not. Then exceptions: missing p2s, sides with
no Total row on any frame, mid-list highlights, sides skipped as already
uploaded, quality if not `hd1080`. Last, the tool-call count for the run, so
this file's budget can be checked against it.

End with: run `/parse-boxscores` to commit the night; it does the injury
report as its step 7. Its validator is what checks the numbers, not this
skill.

## Speed notes

- Never scan visually second by second, and never take one low-res
  screenshot per frame: segment in JS, then read nine frames per sheet.
- Don't try fullscreen ('f' key) or CSS on the video element; YouTube's
  overlays stay on top. The canvas overlay is the reliable approach.
- Batch the seek-and-screenshot pairs for full captures, 5–7 per
  `browser_batch` call.
- Rough target for 4 games: 1–2 calls for the stats page, 2–3 to segment,
  2–4 sheets, about 13 captures, then per side one ref lookup and one upload.

## Tuning

The detection numbers assume a 1080p 2K box score layout. If the overlay
changes, these may need tuning: the brightness and color limits that spot the
yellow header (`>170 / >150 / <110`), the 85-pixel row width in `_isBox`, and
the change cut-off (`diff>3`) in `_seg`.
