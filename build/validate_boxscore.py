#!/usr/bin/env python3
"""Validate a parsed box score before committing it to the stats database.

This owns ALL the sanity-check arithmetic that used to live in the
/parse-boxscores prompt. Keeping it in code (not the prompt) is the whole point:
the LLM only transcribes numbers, terse, and this script decides what's wrong.

Input: a JSON file (path as argv[1]) with the extraction output:

    {
      "home_team": "ABC", "away_team": "DEF",
      "home_pts": 110, "away_pts": 105,          # team scores, optional
      "columns": ["MIN","PTS",...],              # header row, left to right
      "home_rows": [ {row}, ... ],
      "away_rows": [ {row}, ... ],
      "home_totals": {"pts":110,"reb":44,...},   # the TOTALS row, optional
      "away_totals": { ... }
    }

where each {row} is:

    {"player": "Name as shown",
     "min":32,"pts":18,"reb":6,"oreb":1,"ast":4,"stl":1,"blk":0,
     "tov":2,"pf":3,"fgm":7,"fga":14,"tpm":2,"tpa":5,"ftm":2,"fta":2}

DREB is derived (reb - oreb) and written back into the normalized output.

Two of the checks exist specifically because a 2K release can change the box
score layout, and the failure that causes is silent:

* **`columns`** is the header row as actually read off the screenshot. The
  transcription maps cells to fields by remembered column order, so a release
  that inserts or moves a column yields a full box score of plausible numbers in
  the wrong fields. Comparing the header actually on screen against the order
  this script expects is the only thing that catches that before it reaches an
  append-only file.

* **`*_totals`** is the TOTALS row 2K prints under each box. It is the only
  per-cell check on REB / AST / STL / BLK / TO / OREB / PF — the points identity
  covers the shooting columns and PTS, and nothing covers the rest. A transposed
  REB/AST pair, or one misread digit in AST, passes every other check here.

Both are optional, so an genuinely redesigned layout can still be pushed through
deliberately, but the report always states which ones ran and which were absent.
Neither can silently no-op.

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

# The box score header, left to right, as 2K has printed it through 2K25. The
# three shooting cells are single "made-att" columns on screen, which is why
# this list is 12 entries and STAT_FIELDS is 15.
EXPECTED_COLUMNS = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO",
                    "FG", "3PT", "FT", "OREB", "PF"]

# Header labels normalize to the names above before comparison — the check is
# for a column that MOVED or APPEARED, not for 2K restyling a label. Anything
# not listed here is reported as unrecognized, which is the signal for a genuinely
# new column (a +/- or a GmSc, say) rather than a rename.
COLUMN_ALIASES = {
    "MIN": "MIN", "M": "MIN", "MINS": "MIN", "MINUTES": "MIN",
    "PTS": "PTS", "P": "PTS", "POINTS": "PTS",
    "REB": "REB", "R": "REB", "TREB": "REB", "REBS": "REB", "REBOUNDS": "REB",
    "AST": "AST", "A": "AST", "ASTS": "AST", "ASSISTS": "AST",
    "STL": "STL", "S": "STL", "STLS": "STL", "STEALS": "STL",
    "BLK": "BLK", "B": "BLK", "BLKS": "BLK", "BLOCKS": "BLK",
    "TO": "TO", "TOV": "TO", "TOS": "TO", "TURNOVERS": "TO",
    "FG": "FG", "FGM/FGA": "FG", "FGM-FGA": "FG", "FGMA": "FG",
    "3PT": "3PT", "3P": "3PT", "3PM/3PA": "3PT", "3PM-3PA": "3PT", "3PMA": "3PT",
    "FT": "FT", "FTM/FTA": "FT", "FTM-FTA": "FT", "FTMA": "FT",
    "OREB": "OREB", "OR": "OREB", "ORB": "OREB", "OFF": "OREB", "OFFREB": "OREB",
    "PF": "PF", "F": "PF", "FLS": "PF", "FOULS": "PF",
}

# Which player-row fields a TOTALS cell can be checked against. MIN is excluded
# on purpose: the per-team minute total is already checked against 240 + 25*OT,
# which is a stronger statement than agreeing with a printed total.
TOTALS_FIELDS = ["pts", "reb", "oreb", "ast", "stl", "blk",
                 "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta"]


def normalize_column(label):
    """A header label reduced to its canonical name, or None if unrecognized."""
    key = "".join(str(label).upper().split()).replace(".", "")
    return COLUMN_ALIASES.get(key)


def check_columns(columns):
    """Compare the header read off the screenshot against EXPECTED_COLUMNS.

    Returns a list of problem strings; empty means the layout is the one every
    other check in this file assumes.
    """
    seen = [normalize_column(c) for c in columns]
    unknown = [c for c, n in zip(columns, seen) if n is None]

    problems = []
    if unknown:
        problems.append(
            f"unrecognized header label(s) {unknown} — 2K has added a column this "
            f"script does not know. Do not commit: the field mapping is guesswork."
        )
    known = [n for n in seen if n]
    if known != EXPECTED_COLUMNS:
        missing = [c for c in EXPECTED_COLUMNS if c not in known]
        extra = [c for c in known if c not in EXPECTED_COLUMNS]
        detail = []
        if missing:
            detail.append(f"missing {missing}")
        if extra:
            detail.append(f"unexpected {extra}")
        if not detail:
            detail.append("same columns, different order")
        problems.append(
            f"header is {known}, expected {EXPECTED_COLUMNS} ({'; '.join(detail)}). "
            f"The layout changed — remap the fields by label before committing."
        )
    return problems


def check_totals(rows, totals, side):
    """Compare each stat column summed over `rows` against the printed TOTALS row."""
    problems = []
    for f in TOTALS_FIELDS:
        if f not in totals:
            continue
        want = totals[f]
        if not isinstance(want, int):
            problems.append(f"totals {f.upper()}={want!r} is not an int")
            continue
        got = sum(r[f] for r in rows if isinstance(r.get(f), int))
        if got != want:
            problems.append(
                f"{side} {f.upper()}: players sum to {got}, TOTALS row says {want} "
                f"(off by {got - want:+d}) — a cell in that column is misread"
            )
    return problems


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

    # The layout check comes first: if the columns moved, every number below is
    # in the wrong field and the rest of the report is describing the wrong box
    # score. Say so before any of it.
    columns = data.get("columns")
    if columns:
        problems = check_columns(columns)
        if problems:
            failed = True
            for p in problems:
                lines.append(f"[!] header: {p}")
        else:
            lines.append(f"[ok] header matches the expected 2K layout ({len(columns)} columns)")
    else:
        lines.append("[--] header: no `columns` given — layout NOT verified. "
                     "Add the header row as read off the screenshot.")

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

        # Every column against the printed TOTALS row — the only check that
        # reaches REB/AST/STL/BLK/TO/OREB/PF at all.
        totals = data.get(f"{side}_totals")
        if totals:
            problems = check_totals(rows, totals, team)
            if problems:
                failed = True
                for p in problems:
                    lines.append(f"  [!] totals: {p}")
            else:
                lines.append("  [ok] all columns match the TOTALS row")
        else:
            lines.append(f"  [--] no `{side}_totals` given — REB/AST/STL/BLK/TO/"
                         f"OREB/PF are unchecked for {team}")

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
    if failed:
        print("\nFAILED — fix flagged [!] cells before committing")
    else:
        skipped = [ln.split("]", 1)[1].strip() for ln in lines if ln.strip().startswith("[--]")]
        print("\nPASS — all checks clean")
        if skipped:
            # A pass with the layout or totals check absent is a weaker statement
            # than a full pass, and the operator should see which one is missing.
            print(f"  ({len(skipped)} check(s) skipped, see [--] above)")

    # Emit the normalized copy (with dreb filled) for the commit step.
    out = path.rsplit(".json", 1)[0] + ".checked.json"
    with open(out, "w") as fh:
        json.dump(data, fh, indent=2)
    print(f"\nnormalized -> {out}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
