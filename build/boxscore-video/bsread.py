"""Step 2: read player box-score stat lines from VOD frames.

Strategy (fast on 1 core): OCR the whole table region in ONE tesseract call
per frame -- the 2K box score is a fixed grid, so tesseract returns one row
per line with name + 12 stats in column order. Parse each line by taking the
last 12 whitespace tokens as the stat columns and the rest as the name. Then
majority-vote each cell across all the frames of a box_score segment; per-frame
OCR noise (Z->2, 0)->0, dropped hyphens) averages out.

Columns, left to right (matches the NBN 2K "Association Box Score" UI):
    MIN PTS REB AST STL BLK TO FG 3PT FT OR FLS
FG/3PT/FT are made-attempt strings ("10-18"); the rest are integers.
"""
from __future__ import annotations

import os
import re
import sys
from collections import Counter, defaultdict

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocrutil as o  # noqa: E402

COLS = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO",
        "FG", "3PT", "FT", "OR", "FLS"]
MADE_ATT = {"FG", "3PT", "FT"}

# Fixed table region (1920x1080): NAME column through FLS, first row past Total.
TABLE_BOX = (665, 285, 1820, 915)


def normalize_token(tok: str, col: str) -> str:
    """Conservative cleanup of a single stat token. Fix only unambiguous OCR
    confusions; leave the rest for voting to resolve."""
    t = tok.strip().replace("O", "0").replace("o", "0")
    t = t.replace("(", "").replace(")", "").replace("|", "").replace("I", "1")
    t = t.replace("l", "1").replace("Z", "2").replace("S", "5")
    if col in MADE_ATT:
        t = re.sub(r"[^0-9-]", "", t)
    else:
        t = re.sub(r"[^0-9]", "", t)
    return t


def parse_line(line: str):
    """One OCR line -> {'name', 'dnp'} or {'name', 'stats': {col: raw}} or None.
    Stats are the last 12 tokens; DNP rows have only 'DNP' after the name."""
    # Drop stray bracket/pipe glyphs (OCR of "0" often reads "0)") *before*
    # tokenizing, so they don't become phantom tokens that shift the columns.
    line = re.sub(r"[)(|\]\[]", "", line)
    toks = line.split()
    if len(toks) < 2:
        return None
    up = [t.upper() for t in toks]
    if "DNP" in up:
        return {"name": " ".join(toks[:up.index("DNP")]).strip(), "dnp": True}
    if len(toks) < 13:  # need name + 12 stats
        return None
    stat_toks = toks[-12:]
    name = " ".join(toks[:-12]).strip()
    stats = {c: normalize_token(t, c) for c, t in zip(COLS, stat_toks)}
    return {"name": name, "stats": stats}


def norm_name(name: str) -> str:
    """Key for matching a player row across frames: lowercase, strip punctuation
    and the leading initial so 'T. Haliburton' == 'T Haliburton'."""
    n = re.sub(r"[^a-z ]", " ", name.lower())
    return re.sub(r"\s+", " ", n).strip()


def read_frame(path: str):
    """OCR one frame's table -> (active_team_read, [parsed row dicts])."""
    im = Image.open(path)
    text = o.ocr(im.crop(TABLE_BOX), psm=6, upscale=2)
    team = o.read_region(im, "table_team")
    rows = [r for r in (parse_line(ln) for ln in text.splitlines()) if r]
    return team, rows


def read_quarters(path: str):
    """Read the left-panel quarter strips -> {'away': {...}, 'home': {...}},
    each {'q': [q1..q4(,ot)], 'final': int}. None on parse failure."""
    im = Image.open(path)
    out = {}
    for side, region in (("away", "quarter_away"), ("home", "quarter_home")):
        txt = o.read_region(im, region, psm=7, whitelist="0123456789 ")
        nums = [int(t) for t in txt.split() if t.isdigit()]
        if len(nums) >= 5:
            out[side] = {"q": nums[:-1], "final": nums[-1]}
        else:
            out[side] = None
    return out


def vote_quarters(frame_paths):
    """Majority-vote the quarter strips across frames (they're identical on
    every frame of the segment, so voting just denoises the OCR)."""
    from collections import Counter
    votes = {"away": Counter(), "home": Counter()}
    for p in frame_paths:
        q = read_quarters(p)
        for side in ("away", "home"):
            if q[side]:
                votes[side][tuple(q[side]["q"]) + (q[side]["final"],)] += 1
    out = {}
    for side in ("away", "home"):
        if votes[side]:
            best = votes[side].most_common(1)[0][0]
            out[side] = {"q": list(best[:-1]), "final": best[-1]}
        else:
            out[side] = None
    return out


def match_team(mid_read: str, team_names):
    """Match the mid-panel nickname read against the two known full team names
    of the game; returns the best full name or None."""
    import difflib
    mid = re.sub(r"[^a-z0-9]", "", mid_read.lower())
    if not mid:
        return None
    best, best_score = None, 0.0
    for full in team_names:
        nick = re.sub(r"[^a-z0-9]", "", full.lower().split()[-1] if full else "")
        if not nick:
            continue
        score = difflib.SequenceMatcher(None, mid, nick).ratio()
        if nick[-4:] and nick[-4:] in mid:   # "ers" in "76ers"/"0ers"
            score = max(score, 0.7)
        if score > best_score:
            best, best_score = full, score
    return best if best_score >= 0.34 else None


def vote_box(frame_paths, team_names):
    """Read every frame of a box_score segment and majority-vote each cell,
    split by which team was on screen (the streamer toggles LT/RT between the
    two teams). Returns {team_full_name: {player_key: row}} where row is
    {'name', 'dnp', 'seen', 'stats': {col: (value, agreement)}}. The 'Total'
    row is kept per team. Rows seen in too few frames (partial-name OCR junk
    during scroll/transition) are dropped."""
    # team -> key -> col -> Counter ; team -> key -> name/ dnp / seen
    cells = defaultdict(lambda: defaultdict(lambda: defaultdict(Counter)))
    names = defaultdict(lambda: defaultdict(Counter))
    dnp = defaultdict(lambda: defaultdict(int))
    seen = defaultdict(lambda: defaultdict(int))
    team_frames = Counter()
    for p in frame_paths:
        mid, rows = read_frame(p)
        team = match_team(mid, team_names)
        if not team:
            continue
        team_frames[team] += 1
        for r in rows:
            key = "TOTAL" if r["name"].upper().startswith("TOTAL") \
                else norm_name(r["name"])
            if not key:
                continue
            names[team][key][r["name"]] += 1
            seen[team][key] += 1
            if r.get("dnp"):
                dnp[team][key] += 1
                continue
            for col, raw in r["stats"].items():
                if raw != "":
                    cells[team][key][col][raw] += 1

    out = {}
    for team, keyseen in seen.items():
        # Keep anything seen in >=2 frames (kills single-frame OCR ghosts).
        # Real junk (partial names) is filtered later by roster matching, so we
        # do NOT drop low-seen rows here -- bench players are only visible in a
        # few scrolled frames and must survive.
        players = {}
        for key, n in keyseen.items():
            if key != "TOTAL" and n < 2:
                continue
            display = names[team][key].most_common(1)[0][0]
            is_dnp = dnp[team][key] > n / 2
            stats = {}
            for col in COLS:
                c = cells[team][key].get(col)
                if c:
                    val, cnt = c.most_common(1)[0]
                    stats[col] = (val, cnt / sum(c.values()))
                else:
                    stats[col] = ("", 0.0)
            players[key] = {"name": display, "dnp": is_dnp, "seen": n,
                            "stats": stats}
        out[team] = {"frames": team_frames[team], "players": players}
    return out
