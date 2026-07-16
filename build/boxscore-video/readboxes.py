#!/usr/bin/env python3
"""Step-2 driver: read every box score in a classified VOD into validated,
flagged stat lines for review.

Consumes classify.py's --json timeline plus its frames, and for each
box_player segment: subsamples frames -> vote_box -> reconcile against roster
-> validate_team. Prints a per-box report (flagged cells marked '*') and can
write a review JSON.

    python3 readboxes.py TIMELINE.json --frames-dir DIR [--per-box 14]
                         [--only N] [--json review.json]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bsread as b          # noqa: E402
import bsvalidate as v      # noqa: E402
import bsroster as R        # noqa: E402


def subsample(a, b_, n):
    if b_ - a + 1 <= n:
        return list(range(a, b_ + 1))
    step = (b_ - a) / (n - 1)
    return sorted({int(round(a + i * step)) for i in range(n)})


def cell_str(row, col):
    if col in v.MADE_ATT:
        m = row["ma"].get(col)
        s = f"{m[0]}-{m[1]}" if m else (row["raw"][col] or "?")
    else:
        s = str(row["int"].get(col))
    return s + "*" if col in row["flags"] else s


def read_box(seg, frames_dir, per_box):
    idxs = subsample(seg["start_i"], seg["end_i"], per_box)
    paths = [os.path.join(frames_dir, f"f{i:06d}.jpg") for i in idxs]
    paths = [p for p in paths if os.path.exists(p)]
    voted = b.vote_box(paths, seg.get("teams", []))
    # quarter strips are identical on every frame -> a handful is plenty
    quarters = b.vote_quarters(paths[:: max(1, len(paths) // 6)])
    teams = seg.get("teams", [])
    side_of = {}
    if len(teams) >= 2:
        side_of[teams[0]] = "away"
        side_of[teams[1]] = "home"
    result = {}
    for team_name, block in voted.items():
        block, rep = R.reconcile(team_name, block)
        val = v.validate_team(block)
        val["roster"] = rep
        q = quarters.get(side_of.get(team_name))
        val["quarter"] = None
        if q:
            tot = val["total"]["int"].get("PTS") if val["total"] else None
            val["quarter"] = {"q": q["q"], "final": q["final"],
                              "sum_ok": sum(q["q"]) == q["final"],
                              "total_pts": tot,
                              "matches_total": tot == q["final"]}
        result[team_name] = val
    return result


def print_box(seg, result):
    day = seg.get("day_context") or seg.get("date") or "?"
    teams = " vs ".join(t for t in seg.get("teams", []) if t)
    print(f"\n########## {seg['t0']:.0f}s  [{day}]  {teams} ##########")
    for team_name, val in result.items():
        rep = val["roster"]
        off = rep.get("off_roster", [])
        print(f"\n  == {team_name}  (roster {rep['abbr']}, "
              f"matched {rep['matched']}/{rep['roster']}, "
              f"dropped {len(rep['dropped'])}"
              + (f", off-roster {len(off)}" if off else "") + ") ==")
        print("  " + f"{'player':18s} " + " ".join(f"{c:>5}" for c in b.COLS))
        for r in val["players"]:
            tag = " ⚠off-roster" if r.get("off_roster") else ""
            if r["dnp"]:
                print(f"  {r['name'][:18]:18s} DNP{tag}")
                continue
            print("  " + f"{r['name'][:18]:18s} "
                  + " ".join(f"{cell_str(r, c):>5}" for c in b.COLS) + tag)
        if val["total"]:
            t = val["total"]
            print("  " + f"{'TOTAL':16s} "
                  + " ".join(f"{cell_str(t, c):>5}" for c in b.COLS))
        bad = [c for c, ck in val["column_checks"].items() if not ck["ok"]]
        print(f"  column-sum vs Total: "
              + ("ALL MATCH ✓" if not bad else f"mismatch: {bad}"))
        q = val.get("quarter")
        if q:
            qs = "+".join(str(x) for x in q["q"])
            ok = "✓" if q["matches_total"] and q["sum_ok"] else "✗"
            print(f"  quarter check: {qs}={q['final']} vs Total PTS "
                  f"{q['total_pts']}  {ok}")
        nflag = sum(len(r["flags"]) for r in val["players"])
        print(f"  flagged cells to review: {nflag}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("timeline")
    ap.add_argument("--frames-dir", required=True)
    ap.add_argument("--per-box", type=int, default=22)
    ap.add_argument("--only", type=int, help="process only the first N boxes")
    ap.add_argument("--json")
    args = ap.parse_args()

    segs = json.load(open(args.timeline))
    boxes = [s for s in segs if s["mode"] == "box_player"]
    n_raw = len(boxes)
    boxes = dedup_boxes(boxes)
    if len(boxes) < n_raw:
        print(f"deduped {n_raw} -> {len(boxes)} box scores "
              f"(removed re-opened games)", file=sys.stderr)
    if args.only:
        boxes = boxes[:args.only]
    print(f"reading {len(boxes)} box scores from {args.frames_dir}",
          file=sys.stderr)

    review = []
    for i, seg in enumerate(boxes):
        print(f"[{i+1}/{len(boxes)}] {seg.get('teams')}", file=sys.stderr)
        result = read_box(seg, args.frames_dir, args.per_box)
        print_box(seg, result)
        review.append({"seg": {k: seg[k] for k in ("t0", "t1", "teams",
                       "day_context") if k in seg}, "teams": _ser(result)})

    if args.json:
        json.dump(review, open(args.json, "w"), indent=2, default=str)
        print(f"[json] wrote {args.json}", file=sys.stderr)


def _ser(result):
    out = {}
    for team, val in result.items():
        players = []
        for r in val["players"]:
            players.append({
                "name": r["name"], "slug": r.get("slug"), "dnp": r["dnp"],
                "seen": r["seen"],
                "stats": {c: cell_str(r, c) for c in b.COLS} if not r["dnp"]
                else "DNP",
                "flags": r["flags"],
            })
        out[team] = {"players": players,
                     "column_checks": val["column_checks"],
                     "quarter": val.get("quarter"),
                     "roster": val["roster"]}
    return out


def dedup_boxes(boxes):
    """Collapse box scores the streamer re-opened: same team pair + same day.
    Keep the longer-dwell segment (more frames = better read)."""
    best = {}
    order = []
    for s in boxes:
        teams = tuple(sorted(t for t in s.get("teams", []) if t))
        key = (teams, str(s.get("day_context")))
        if key not in best:
            best[key] = s
            order.append(key)
        elif s["dur"] > best[key]["dur"]:
            best[key] = s
    return [best[k] for k in order]


if __name__ == "__main__":
    main()
