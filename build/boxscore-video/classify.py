#!/usr/bin/env python3
"""Step 1 of the box-score-video pipeline: walk a VOD, classify every sampled
frame by 2K MyNBA UI screen type, coalesce into segments, track the current
in-game day from date-bearing screens, and print a timeline.

Screen types detected:
  box_player       - player box score (NAME MIN PTS ...)  -> transcribe (step 2)
  team_comparison  - team aggregate stats (STAT / TEAM / TEAM) -> skip
  daily_view       - per-day game list; carries the date (no year)
  calendar         - carries full date incl. year
  other            - injury popups, menus, transitions

No stats are read yet. Output is the segment timeline + per-day box-score list
+ dwell-time stats (how long the streamer lingers on each box score).

Usage:
  python3 classify.py VIDEO.mp4 [--fps 5] [--workers 8] [--json out.json]
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocrutil as o  # noqa: E402

MONTHS = ("January February March April May June July August "
          "September October November December").split()
MONTH_RE = re.compile(
    r"(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?",
    re.I)


def parse_date(text: str):
    m = MONTH_RE.search(text)
    if not m:
        return None
    month = m.group(1).capitalize()
    day = int(m.group(2))
    year = int(m.group(3)) if m.group(3) else None
    return {"month": month, "day": day, "year": year}


MONTH_NUM = {m: i + 1 for i, m in enumerate(MONTHS)}
# Daily View LT/RT toggles between the sim's recent days; older days show a
# relative header ("YESTERDAY", "2 DAYS AGO") instead of an absolute date.
REL_RE = re.compile(r"(\d+)\s+DAYS?\s+AGO")


def relative_offset(text: str):
    """Days-ago offset from a relative Daily View header, or None."""
    u = text.upper()
    if "YESTERDAY" in u:
        return -1
    if "TODAY" in u:
        return 0
    m = REL_RE.search(u)
    return -int(m.group(1)) if m else None


def to_date(d, default_year):
    """{month,day,year?} -> datetime.date, using default_year if year absent."""
    if not d:
        return None
    y = d.get("year") or default_year
    if not y:
        return None
    try:
        return datetime.date(y, MONTH_NUM[d["month"]], d["day"])
    except (KeyError, ValueError):
        return None


def date_str(d):
    if d is None:
        return "?"
    if isinstance(d, datetime.date):
        return d.strftime("%b %-d, %Y")
    s = f"{d['month']} {d['day']}"
    return s + (f", {d['year']}" if d.get("year") else "")


def frame_brightness(im: Image.Image) -> float:
    """Mean brightness of a downscaled grayscale frame. Dimmed popup/injury
    overlays sit ~12; any real content screen is 28+. Lets us skip OCR on the
    injury/menu wall (often ~half a VOD) with no tesseract call."""
    t = im.convert("L").resize((160, 90))
    return float(np.asarray(t, dtype=np.float32).mean())


def header_left_yellowness(im: Image.Image) -> float:
    """Mean (R+G)/2 - B of the header-left cell. ~230 when it's the bright
    yellow NAME cell of a player box score, ~0 otherwise. Lets us flag player
    box scores (the long-dwell majority of frames) without any OCR."""
    c = im.convert("RGB").crop(
        o.scale_box(o.REGIONS["header_left"], im.width, im.height))
    a = np.asarray(c, dtype=np.float32)
    return float((a[..., 0].mean() + a[..., 1].mean()) / 2 - a[..., 2].mean())


# ---- Pass 1: cheap pixel-only coarse label (NO OCR) -------------------------
# Every frame gets one of: 'dark' (injury/menu/transition), 'box_player'
# (yellow NAME cell), or 'bright' (some other content screen -> refined later).
def coarse_label(path: str) -> str:
    im = Image.open(path)
    if frame_brightness(im) < 20:
        return "dark"
    if header_left_yellowness(im) > 100:
        return "box_player"
    return "bright"


def _coarse_worker(args):
    idx, path = args
    return idx, coarse_label(path)


# ---- Pass 2: OCR one representative per 'bright' segment ---------------------
def refine_frame(path):
    """OCR one bright frame -> (sublabel, mark). For daily_view, mark is a
    day-mark: {"abs": {m,d,y}} for an absolute date, {"rel": -1} for a
    relative header ("YESTERDAY"), or None. For calendar, mark is the parsed
    date dict (cursor position). Otherwise None."""
    im = Image.open(path)
    if header_left_yellowness(im) > 100:  # stray box_player past the gate
        return "box_player", None
    banner = o.read_region(im, "banner").lower()
    if "daily view" in banner:
        txt = o.read_region(im, "date_dailyview")
        d = parse_date(txt)
        if d:
            return "daily_view", {"abs": d}
        rel = relative_offset(txt)
        return "daily_view", ({"rel": rel} if rel is not None else None)
    if "box score" in banner:
        return "team_comparison", None
    d = parse_date(o.read_region(im, "date_calendar"))
    return ("calendar", d) if d else ("other", None)


def split_bright_segment(seg, frames, fps, step=2):
    """OCR a bright segment every `step` frames and split it into sub-segments
    by screen type. Sampling every 2 frames (~0.4s) catches the transient
    daily_view flashes that mark day boundaries, instead of averaging them
    away with a single per-segment vote."""
    start, end = seg["start_i"], seg["end_i"]
    idxs = list(range(start, end + 1, step))
    if idxs[-1] != end:
        idxs.append(end)
    subs = []
    for i in idxs:
        lab, mark = refine_frame(frames[i][1])
        if subs and subs[-1]["mode"] == lab:
            subs[-1]["end_i"] = i
            if mark:
                subs[-1]["marks"].append(mark)
        else:
            subs.append({"mode": lab, "start_i": i, "end_i": i,
                         "marks": [mark] if mark else []})
    subs[0]["start_i"] = start
    subs[-1]["end_i"] = end
    for s in subs:
        s["t0"] = s["start_i"] / fps
        s["t1"] = (s["end_i"] + 1) / fps
        s["dur"] = s["t1"] - s["t0"]
    return subs


# ---- frame extraction -------------------------------------------------------
def extract_frames(video: str, fps: float, outdir: str):
    os.makedirs(outdir, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={fps}",
         "-q:v", "3", os.path.join(outdir, "f%06d.jpg")],
        check=True)
    files = sorted(f for f in os.listdir(outdir) if f.endswith(".jpg"))
    # fps filter emits frame i (1-based) at ~ (i-1)/fps seconds
    return [(i, os.path.join(outdir, f)) for i, f in enumerate(files)]


# ---- segment coalescing -----------------------------------------------------
def coalesce(labels, fps, min_frames=2):
    """Merge consecutive same-label frames into segments. Isolated blips
    shorter than min_frames fold into the previous segment so a stray frame
    during a transition doesn't fragment the timeline."""
    segs = []
    for i, lab in enumerate(labels):
        if segs and segs[-1]["mode"] == lab:
            segs[-1]["end_i"] = i
        else:
            segs.append({"mode": lab, "start_i": i, "end_i": i})
    merged = []
    for s in segs:
        nframes = s["end_i"] - s["start_i"] + 1
        if merged and (s["mode"] == merged[-1]["mode"]
                       or nframes < min_frames):
            merged[-1]["end_i"] = s["end_i"]
        else:
            merged.append(dict(s))
    for s in merged:
        s["t0"] = s["start_i"] / fps
        s["t1"] = (s["end_i"] + 1) / fps
        s["dur"] = s["t1"] - s["t0"]
        s["marks"] = []
    return merged


def merge_adjacent(segs):
    """After refinement, collapse neighbouring segments that ended up the same
    mode (e.g. two daily_view glimpses split by a 1-frame blip)."""
    out = []
    for s in segs:
        if out and out[-1]["mode"] == s["mode"]:
            out[-1]["end_i"] = s["end_i"]
            out[-1]["t1"] = s["t1"]
            out[-1]["dur"] = out[-1]["t1"] - out[-1]["t0"]
            out[-1]["marks"] += s["marks"]
        else:
            out.append(s)
    return out


def vote_mark(marks):
    """Most common day-mark from a daily_view segment's sampled frames."""
    from collections import Counter
    keys = []
    for m in marks:
        if "abs" in m:
            keys.append(("abs", m["abs"]["month"], m["abs"]["day"]))
        elif m.get("rel") is not None:
            keys.append(("rel", m["rel"]))
    if not keys:
        return None
    k = Counter(keys).most_common(1)[0][0]
    if k[0] == "abs":
        yr = next((m["abs"].get("year") for m in marks
                   if "abs" in m and m["abs"].get("year")), None)
        return {"abs": {"month": k[1], "day": k[2], "year": yr}}
    return {"rel": k[1]}


def vote_date(marks):
    """Most common calendar date dict from a calendar segment."""
    from collections import Counter
    keys = [(m["month"], m["day"]) for m in marks if m]
    if not keys:
        return None
    k = Counter(keys).most_common(1)[0][0]
    yr = next((m.get("year") for m in marks if m and m.get("year")), None)
    return {"month": k[0], "day": k[1], "year": yr}


def mmss(t):
    return f"{int(t)//60}:{int(t)%60:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--fps", type=float, default=5.0)
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 1)
    ap.add_argument("--json")
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--frames-dir", help="reuse already-extracted frames "
                    "(skip ffmpeg); must match --fps")
    args = ap.parse_args()

    if args.frames_dir:
        tmp = args.frames_dir
        files = sorted(f for f in os.listdir(tmp) if f.endswith(".jpg"))
        frames = [(i, os.path.join(tmp, f)) for i, f in enumerate(files)]
        print(f"[reuse] {len(frames)} frames from {tmp}", file=sys.stderr)
        args.keep_frames = True
    else:
        tmp = tempfile.mkdtemp(prefix="bsvframes_")
        print(f"[extract] {args.video} @ {args.fps} fps -> {tmp}",
              file=sys.stderr)
        frames = extract_frames(args.video, args.fps, tmp)
        print(f"[extract] {len(frames)} frames", file=sys.stderr)

    # ---- Pass 1: cheap pixel-only coarse labels over every frame -----------
    print(f"[pass1] pixel-classify {len(frames)} frames "
          f"({args.workers} workers)...", file=sys.stderr)
    if args.workers > 1:
        with ProcessPoolExecutor(max_workers=args.workers) as ex:
            coarse = list(ex.map(_coarse_worker, frames, chunksize=16))
    else:
        coarse = [_coarse_worker(f) for f in frames]
    labels = [lab for _, lab in sorted(coarse)]
    segs = coalesce(labels, args.fps)
    n_bright = sum(1 for s in segs if s["mode"] == "bright")
    print(f"[pass1] {len(segs)} segments ({n_bright} bright to OCR)",
          file=sys.stderr)

    # ---- Pass 2: split bright segments by OCR into sub-segments -------------
    print("[pass2] OCR refine/split bright segments + box-score teams...",
          file=sys.stderr)
    refined = []
    for s in segs:
        if s["mode"] == "bright":
            refined.extend(split_bright_segment(s, frames, args.fps))
        else:
            if s["mode"] == "dark":
                s["mode"] = "other"
            refined.append(s)
    segs = merge_adjacent(refined)

    # team names for player box scores (1 representative frame per segment)
    for s in segs:
        if s["mode"] == "box_player":
            mid = (s["start_i"] + s["end_i"]) // 2
            im = Image.open(frames[mid][1])
            s["teams"] = [o.read_region(im, "team_top"),
                          o.read_region(im, "team_bottom")]

    # ---- day tracking ------------------------------------------------------
    # daily_view is the AUTHORITATIVE "which day am I reviewing" marker. Its
    # header is either an absolute date (the sim's current day) or a relative
    # token ("YESTERDAY" -> today-1) reached via the LT/RT toggle. Calendar
    # dates are just the streamer's cursor position (they scrub 9/10/11 while
    # navigating) so they only seed a year / a fallback anchor for "today".
    default_year = None
    for s in segs:
        for m in s["marks"]:
            yr = (m.get("abs") or {}).get("year") if "abs" in m else m.get("year")
            if yr:
                default_year = yr
    today_ref = None   # datetime.date the sim currently sits on
    cur_day = None     # datetime.date being reviewed right now
    for s in segs:
        if s["mode"] == "daily_view":
            mk = vote_mark(s["marks"])
            if mk and "abs" in mk:
                cur_day = to_date(mk["abs"], default_year)
                today_ref = cur_day or today_ref
            elif mk and mk.get("rel") is not None and today_ref:
                cur_day = today_ref + datetime.timedelta(days=mk["rel"])
            s["date"] = cur_day
        elif s["mode"] == "calendar":
            cd = to_date(vote_date(s["marks"]), default_year)
            if cd and today_ref is None:
                today_ref = cd  # seed "today" only until a daily_view sets it
            s["date"] = cd
        s["day_context"] = cur_day

    print_report(segs, args.fps)

    if args.json:
        def clean(s):
            out = {}
            for k, v in s.items():
                if k == "marks":
                    continue
                if isinstance(v, datetime.date):
                    out[k] = v.isoformat()
                else:
                    out[k] = v
            return out
        with open(args.json, "w") as f:
            json.dump([clean(s) for s in segs], f, indent=2)
        print(f"[json] wrote {args.json}", file=sys.stderr)

    if not args.keep_frames:
        for _, p in frames:
            os.unlink(p)
        os.rmdir(tmp)


def print_report(segs, fps):
    print("\n===== SEGMENT TIMELINE =====")
    for s in segs:
        tag = ""
        if s["mode"] in ("daily_view", "calendar") and s.get("date"):
            tag = f"  date={date_str(s['date'])}"
        elif s["mode"] == "box_player":
            day = date_str(s.get("day_context"))
            teams = " vs ".join(t for t in s.get("teams", []) if t)
            tag = f"  [{day}]  {teams}"
        print(f"  {mmss(s['t0'])}-{mmss(s['t1'])} ({s['dur']:4.1f}s) "
              f"{s['mode']:16s}{tag}")

    print("\n===== BOX SCORES BY DAY =====")
    from collections import defaultdict
    byday = defaultdict(list)
    for s in segs:
        if s["mode"] == "box_player":
            byday[date_str(s.get("day_context"))].append(s)
    for day, lst in byday.items():
        print(f"  {day}:  {len(lst)} player box scores")
        for s in lst:
            teams = " vs ".join(t for t in s.get("teams", []) if t)
            print(f"      {mmss(s['t0'])}-{mmss(s['t1'])} "
                  f"({s['dur']:.1f}s dwell)  {teams}")

    print("\n===== DWELL STATS (box_player) =====")
    dwells = [s["dur"] for s in segs if s["mode"] == "box_player"]
    if dwells:
        dwells.sort()
        print(f"  count={len(dwells)}  min={dwells[0]:.1f}s  "
              f"median={dwells[len(dwells)//2]:.1f}s  max={dwells[-1]:.1f}s")
        print(f"  frames/box @ {fps}fps: median "
              f"~{int(dwells[len(dwells)//2]*fps)} frames")
    else:
        print("  (none)")


if __name__ == "__main__":
    main()
