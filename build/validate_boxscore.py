#!/usr/bin/env python3
"""Validate a parsed box score before committing it to the stats database.

This owns ALL the sanity-check arithmetic that used to live in the
/parse-boxscores prompt. Keeping it in code (not the prompt) is the whole point:
the LLM only transcribes numbers, terse, and this script decides what's wrong.

Input: a JSON file (path as argv[1]) with the extraction output:

    {
      "home_team": "ABC", "away_team": "DEF",
      "home_pts": 110, "away_pts": 105,          # team scores, optional
      "home_rows": [ {row}, ... ],
      "away_rows": [ {row}, ... ]
    }

where each {row} is:

    {"player": "Name as shown",
     "min":32,"pts":18,"reb":6,"oreb":1,"ast":4,"stl":1,"blk":0,
     "tov":2,"pf":3,"fgm":7,"fga":14,"tpm":2,"tpa":5,"ftm":2,"fta":2}

DREB is derived (reb - oreb) and written back into the normalized output.

Output: a human-readable report to stdout, and a normalized copy of the input
with `dreb` filled in written to <input>.checked.json. Exit code is 0 when the
box score is clean, 1 when any row or team-level check failed, 2 on bad input.
The exit code lets the skill branch without re-parsing the report text.
"""

import json
import sys

# Integer stat fields every player row must carry (player + these).
STAT_FIELDS = ["min", "pts", "reb", "oreb", "ast", "stl", "blk",
               "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta"]


def check_row(row):
    """Return a list of human-readable problem strings for one player row.

    Empty list == the row passed every check.
    """
    problems = []

    # Structural: every stat field present and a non-negative int.
    for f in STAT_FIELDS:
        if f not in row:
            problems.append(f"missing {f}")
            continue
        v = row[f]
        if not isinstance(v, int) or v < 0:
            problems.append(f"{f}={v!r} not a non-negative int")
    if problems:
        return problems  # can't do arithmetic on a malformed row

    fgm, fga = row["fgm"], row["fga"]
    tpm, tpa = row["tpm"], row["tpa"]
    ftm, fta = row["ftm"], row["fta"]
    pts, reb, oreb = row["pts"], row["reb"], row["oreb"]

    # Points must reconstruct exactly from makes.
    calc = (fgm - tpm) * 2 + tpm * 3 + ftm
    if calc != pts:
        problems.append(f"PTS {pts} != computed {calc} "
                        f"[(FGM {fgm}-3PM {tpm})*2 + 3PM {tpm}*3 + FTM {ftm}]")

    # Makes never exceed attempts; threes never exceed field goals.
    if tpm > fgm:
        problems.append(f"3PM {tpm} > FGM {fgm}")
    if fgm > fga:
        problems.append(f"FGM {fgm} > FGA {fga}")
    if tpm > tpa:
        problems.append(f"3PM {tpm} > 3PA {tpa}")
    if ftm > fta:
        problems.append(f"FTM {ftm} > FTA {fta}")
    if oreb > reb:
        problems.append(f"OREB {oreb} > REB {reb}")

    # Per-player physical limit. (The per-player MIN ceiling depends on how many
    # overtime periods the game went, so it's checked at the team level below,
    # once the OT count is known — not here.)
    if row["pf"] > 6:
        problems.append(f"PF {row['pf']} > 6")

    return problems


def nearest_regulation(team_min):
    """Nearest legal per-team minute total and its OT count.

    A team plays 240 player-minutes in regulation (5 on court * 48), and each
    overtime period adds 25 (5 * 5). Confirmed against real allstats data:
    per-team sums cluster at 240 / 265 / 290 / 315. Returns (expected, ot, gap).
    """
    ot = max(0, round((team_min - 240) / 25))
    expected = 240 + 25 * ot
    return expected, ot, team_min - expected


def main():
    if len(sys.argv) != 2:
        print("usage: validate_boxscore.py <parsed.json>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    try:
        with open(path) as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as e:
        print(f"could not read {path}: {e}", file=sys.stderr)
        return 2

    failed = False
    team_min = {}   # side -> summed player minutes, for the OT check
    lines = []

    for side in ("home", "away"):
        team = data.get(f"{side}_team", side.upper())
        rows = data.get(f"{side}_rows", [])
        team_pts_score = data.get(f"{side}_pts")
        lines.append(f"\n{team} ({side}) — {len(rows)} players"
                     + (f", score {team_pts_score}" if team_pts_score is not None else ""))

        summed_pts = 0
        summed_min = 0
        for row in rows:
            # Derive DREB and write it back for the commit payload.
            if isinstance(row.get("reb"), int) and isinstance(row.get("oreb"), int):
                row["dreb"] = row["reb"] - row["oreb"]
            if isinstance(row.get("min"), int):
                summed_min += row["min"]
            if isinstance(row.get("pts"), int):
                summed_pts += row["pts"]

            problems = check_row(row)
            name = row.get("player", "?")
            if problems:
                failed = True
                lines.append(f"  [!] {name}: " + "; ".join(problems))
            else:
                lines.append(f"  [ok] {name}")

        # Team score must equal the sum of its players' points.
        if team_pts_score is not None and summed_pts != team_pts_score:
            failed = True
            lines.append(f"  [!] team PTS: players sum to {summed_pts}, "
                         f"box score says {team_pts_score}")

        team_min[side] = summed_min

    # Cross-team checks.
    lines.append("")
    hp, ap = data.get("home_pts"), data.get("away_pts")
    if hp is not None and ap is not None and hp == ap:
        failed = True
        lines.append(f"[!] both teams show the same score ({hp}) — impossible")

    # Each team plays 240 player-minutes in regulation, +25 per OT. Both teams
    # share the same number of OT periods, so their implied OT counts must agree.
    ot_by_side = {}
    for side in ("home", "away"):
        tm = team_min.get(side, 0)
        expected, ot, gap = nearest_regulation(tm)
        ot_by_side[side] = ot
        if abs(gap) > 1:
            failed = True
            lines.append(f"[!] {side} MIN {tm}, nearest legal total is "
                         f"{expected} (off by {gap:+d})")
        else:
            tag = "regulation" if ot == 0 else f"{ot} OT period(s)"
            lines.append(f"[ok] {side} MIN {tm} ({tag})")
            # Now that OT is known, no single player can exceed 48 + 5*OT.
            cap = 48 + 5 * ot
            for row in data.get(f"{side}_rows", []):
                if isinstance(row.get("min"), int) and row["min"] > cap:
                    failed = True
                    lines.append(f"[!] {side} {row.get('player','?')}: "
                                 f"MIN {row['min']} > {cap} (game max)")
    if ot_by_side.get("home") != ot_by_side.get("away"):
        failed = True
        lines.append(f"[!] teams disagree on OT: home implies {ot_by_side['home']} "
                     f"OT, away implies {ot_by_side['away']} OT")

    print("\n".join(lines))
    print("\n" + ("FAILED — fix flagged [!] cells before committing"
                  if failed else "PASS — all checks clean"))

    # Emit the normalized copy (with dreb filled) for the commit step.
    out = path.rsplit(".json", 1)[0] + ".checked.json"
    with open(out, "w") as fh:
        json.dump(data, fh, indent=2)
    print(f"\nnormalized -> {out}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
