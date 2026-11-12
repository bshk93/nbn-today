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

The box score screen has a NAME column and MIN, PTS, REB, AST, STL, BLK, TO,
FG, 3PT, FT, OR, FLS columns. The team logos and line score are on the left.
**In the line score, the top row is the AWAY team and the bottom row is HOME**
(checked against the committed 2026-11-11 games). The team named next to the
LT/RT icons above the table is the side being shown.

## 0. Which night is it?

Read the video's title. NBN's streams are titled `NBN 11/11: Box Scores`: the
date is the night, and its year is whichever is nearest the video's upload
date. If the title names no date, **ask the user**. Never guess it from the
upload date: box scores are often streamed the day after the games, and a
wrong date is refused at upload at best, and filed under the wrong night at
worst. Season and game type come from the queue in step 6, not from the video.

## 1. Open and prep (one JS call)
Navigate the user's current tab to the URL. Wait about 2s, then run:
```js
const v=document.querySelector('video'); v.pause();
const p=document.getElementById('movie_player');
p.setPlaybackQualityRange?.('hd1080','hd1080'); p.setPlaybackQuality?.('hd1080');
let cv=document.getElementById('ovl')||document.body.appendChild(Object.assign(document.createElement('canvas'),{id:'ovl'}));
cv.width=1920; cv.height=1080;
cv.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;background:#000';
window._show=async t=>{v.pause();await new Promise(r=>{v.addEventListener('seeked',()=>setTimeout(r,400),{once:true});v.currentTime=t});cv.getContext('2d').drawImage(v,0,0,1920,1080);return v.currentTime};
window._seg=async(a,b,step)=>{const c=document.createElement('canvas');c.width=60;c.height=40;const x=c.getContext('2d',{willReadFrequently:true});const segs=[];let prev=null,s=a;
 for(let t=a;t<=b;t=+(t+step).toFixed(2)){await new Promise(r=>{v.addEventListener('seeked',()=>setTimeout(r,60),{once:true});v.currentTime=t});
  x.drawImage(v,640,220,1250,760,0,0,60,40);const d=x.getImageData(0,0,60,40).data;const g=[];for(let i=0;i<d.length;i+=4)g.push((d[i]+d[i+1]+d[i+2])/3);
  const diff=prev?g.reduce((q,y,i)=>q+Math.abs(y-prev[i]),0)/g.length:999; if(prev&&diff>3){segs.push(s+'-'+(+(t-step).toFixed(2)));s=t} prev=g;}
 segs.push(s+'-'+b); return segs.join(' ')};
window._isBox=async(a,b)=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d',{willReadFrequently:true});const o=[];
 for(let t=a;t<b;t++){await new Promise(r=>{v.addEventListener('seeked',()=>setTimeout(r,60),{once:true});v.currentTime=t});x.drawImage(v,0,0,160,90);const d=x.getImageData(0,0,160,90).data;let best=0;
  for(let y=0;y<90;y++){let n=0;for(let X=60;X<160;X++){const i=(y*160+X)*4;if(d[i]>170&&d[i+1]>150&&d[i+2]<110)n++}best=Math.max(best,n)} if(best>=85)o.push(t)} return o};
[v.duration, p.getPlaybackQuality()]
```
`_show(t)` paints the exact frame over the whole viewport, with no YouTube
controls or overlays. Use it before every screenshot.

**The returned quality must be `hd1080`.** If it isn't (YouTube can refuse it
on a slow connection), say so in the report. Even at `hd1080` the screenshot
is the browser window, so it comes out at the window's size (about 1126 px
wide in the 11-10 and 11-11 tests, read with 0 errors left after
`/parse-boxscores`). A wider browser window gives a sharper capture; record
the real width in the manifest as `width`, not just the stream quality.

## 2. Find the box score range (JS only, no screenshots)
- Run `await _isBox(0, duration)` in chunks of about 100s, because long calls time out. It returns the seconds where the yellow table chrome appears. The contiguous span is the box score section. Standings and injury screens use a different layout and drop out here; step 4b finds the injury screen.
- Run `await _seg(start, end, 0.5)` in chunks of about 70s. Long segments (4s or more) are stable team screens. Runs of 0.5–1s segments are the operator scrolling a table, the Team Comparison screen, or the Daily View between games.

## 3. Map each game (low-res screenshots)
The usual flow per game: team A screen → team B screen → quick scroll of B (if needed) → Team Comparison → Daily View.
- For each stable segment, `_show(mid)` and take a screenshot at `scale: 0.3`. Read the team in the header next to the LT/RT icons and the line score on the left.
- A table needs a second screen (p2) when the **Total** row isn't visible. To find it, check the 0.5s frames after that segment at `scale: 0.35` until one shows the list scrolled with Total at the bottom.
- **Prefer a frame with the Total row on screen even when no p2 is needed.** The totals row is what lets the validator cross-check every column. If a short list shows Total on its first screen, that one frame is the whole side.
- If a team's p2 never appears (no scroll in the video), take only p1 and report it.
- Batch 5–7 seek and screenshot pairs per `browser_batch` call.

## 4. Capture finals
For each chosen timestamp, `_show(t)` then take a full-scale screenshot. Prefer frames with the highlight on the first row. Keep each screenshot's id: step 6 uploads by it.

Save copies to your outputs folder as `<Video>_BoxScores/NN_AWAY-at-HOME_XmYYs_Team[_p1|_p2].jpg`, and write `manifest.json` beside them:
```json
{"video": "https://www.youtube.com/watch?v=…", "title": "NBN 11/11: Box Scores", "date": "2026-11-11",
 "quality": "hd1080",
 "shots": [{"file": "01_BOS-at-TOR_0m44s_Raptors.jpg", "t": 44.0, "away": "BOS", "home": "TOR",
            "team": "TOR", "part": 1, "total_row": true}]}
```
The VOD link and timestamps are the lasting source for every number: uploaded
screenshots are deleted 14 days after commit, the VOD isn't.

## 4b. Capture the injury report

The streamer shows MyNBA's **Injury History → Entire League** screen once a
night, usually just after the last box score. `/parse-injuries` needs it, and
it reads anyone missing from the list as **healed**, so a partial list does
real damage: capture all of it or none.

- Run `_seg` over the rest of the video after the box score section (and the
  first 60s before it), then take a `scale: 0.3` screenshot of each stable
  segment. The injury screen has "Injury History" and "Entire League" at the
  top, and NAME, STATUS, OVR, INJURY, DURATION columns.
- Capture the top of the list, then each scrolled screen, until the bottom is
  on screen: the scrollbar at the right reaches the end, or the list is
  shorter than one screen. Consecutive screens should overlap by a row or
  two, so no player falls between them. At most 6 screenshots.
- **The bottom never appears** (the streamer stopped scrolling): capture what
  there is, don't upload it, and report it as cut off.
- Only a **New Injury** popup (one team's notice with rotation buttons), no
  list: capture the popups, upload them, and say so; `/parse-injuries` has a
  path for popups and knows they aren't the whole list.
- No injury screen anywhere in the video: say so in the report. Don't look
  for one in another video.

Save them as `injuries_XmYYs_pN.jpg` and add them to `manifest.json` under
`"injuries": [{"file", "t", "part", "bottom": true|false}]`.

## 5. Check before uploading

Before anything is uploaded, every game must have: both teams, at least one
shot per side, and the final score from the line score. A side with a list
longer than one screen and no p2 is incomplete: report it rather than
upload half a box score. A box score missing players is held by the
validator only if its totals row is visible; without one it can commit short.

## 6. Upload to the queue

Open `https://nbn.today/committees/stats` in a tab. The user must be signed in
with the `stats` or `rosters` role; if the page shows no upload boxes, stop and
say so. Each game on the night's date has one box per team, an element with
`data-slot="<game key>|<TEAM>"` holding a hidden `input[type=file]`.

For each shot, upload the full-scale screenshot (by its id from step 4) into
that team's file input, p1 before p2. Upload one side at a time and let the
box re-render before the next.

- A game **not listed** on that date means the date is wrong or the game isn't
  on the schedule: stop and ask, don't upload it somewhere else.
- **"already committed"** or **"already pending"**: that game was uploaded by
  hand. Skip it and say so; don't add a second copy.
- A side allows at most 4 images.

The injury report goes in the same night's **Injuries** row: the element with
`data-slot="injury"` inside that date's day, which holds its own hidden
`input[type=file]`. Upload the screens top to bottom, at most 6. If the row
already has screenshots for that date, someone uploaded it by hand: skip it
and say so. A committed report shows as links instead of an upload box, so
don't upload over it either.

Uploading pays the usual box score reward to the signed-in member; that's
expected.

## 7. Clean up and report
Run `document.getElementById('ovl')?.remove()` on the YouTube tab. Zip the
outputs folder and send it to the user.

Report a table: # | AWAY @ HOME | final (winner first, note OT) | timestamp → team (p1/p2) | uploaded. Then one line for the injury report: how many screens, whether the bottom of the list was reached, and uploaded or not. Then list exceptions: missing p2 screens, sides with no Total row on any frame, frames where a mid-list row is highlighted, games skipped as already uploaded, and the quality if it wasn't `hd1080`.

End with: run `/parse-boxscores` to commit the night; it does the injury
report as its step 7. Its validator is what checks the numbers, not this
skill.

## Speed notes
- Never scan visually second by second. The `_isBox` and `_seg` passes replace about 100 screenshots.
- Don't try fullscreen ('f' key) or CSS on the video element, because YouTube overlays stay on top. The canvas overlay is the reliable approach.
- About 10 games is about 25 screenshots. Expect 3–5 low-res checks per game, then 2–3 full captures.

## Tuning

The detection numbers assume a 1080p 2K box score layout. If the overlay
changes, these may need tuning: the brightness and color limits that spot the
yellow header (`>170 / >150 / <110`), the 85-pixel row width in `_isBox`, and
the change cut-off (`diff>3`) in `_seg`.
