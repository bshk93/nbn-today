#!/usr/bin/env python3
"""Pin what build/validate_boxscore.py must keep catching.

The validator is the only thing between a misread screenshot and an append-only
file that cannot be rebuilt. Two of its checks — the header comparison and the
TOTALS cross-check — exist for failures that produce *plausible* numbers, so
there is no downstream symptom to notice later. This file makes sure a future
edit cannot quietly drop them.

Run: python3 build/test_validate_boxscore.py   (also run by the pre-commit hook)
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "validate_boxscore.py"

# A clean, internally consistent five-man box for each side. PTS reconstructs
# from the makes on every row, both teams sum to 240 minutes, and the scores
# differ — so anything a test below flags is the thing that test injected.
def _row(player, mn, fgm, fga, tpm, tpa, ftm, fta, reb, oreb, ast, stl, blk, tov, pf):
    return {"player": player, "min": mn,
            "pts": (fgm - tpm) * 2 + tpm * 3 + ftm,
            "reb": reb, "oreb": oreb, "ast": ast, "stl": stl, "blk": blk,
            "tov": tov, "pf": pf, "fgm": fgm, "fga": fga,
            "tpm": tpm, "tpa": tpa, "ftm": ftm, "fta": fta}


HOME_ROWS = [
    _row("A. One",   48, 10, 20, 2, 5, 4, 4, 8, 2, 5, 1, 0, 3, 2),
    _row("B. Two",   48,  8, 15, 1, 3, 2, 2, 6, 1, 4, 2, 1, 2, 3),
    _row("C. Three", 48,  7, 14, 0, 1, 3, 4, 10, 4, 2, 0, 2, 1, 4),
    _row("D. Four",  48,  5, 11, 3, 7, 0, 0, 3, 0, 7, 1, 0, 2, 1),
    _row("E. Five",  48,  4,  9, 1, 4, 1, 2, 5, 1, 3, 3, 1, 1, 2),
]
AWAY_ROWS = [
    _row("F. Six",   48,  9, 19, 1, 4, 5, 6, 7, 2, 6, 2, 0, 4, 3),
    _row("G. Seven", 48,  8, 16, 2, 6, 0, 0, 4, 0, 3, 1, 1, 1, 2),
    _row("H. Eight", 48,  6, 12, 0, 2, 4, 5, 9, 3, 1, 0, 3, 2, 5),
    _row("I. Nine",  48,  5, 10, 2, 5, 2, 2, 5, 1, 5, 1, 0, 3, 1),
    _row("J. Ten",   48,  3,  8, 1, 3, 1, 2, 6, 2, 2, 2, 1, 0, 4),
]

COLUMNS = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO",
           "FG", "3PT", "FT", "OREB", "PF"]


def _totals(rows):
    fields = ["pts", "reb", "oreb", "ast", "stl", "blk",
              "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta"]
    return {f: sum(r[f] for r in rows) for f in fields}


def base():
    """A box score that passes every check, with both optional blocks present."""
    return {
        "home_team": "ABC", "away_team": "DEF",
        "home_pts": sum(r["pts"] for r in HOME_ROWS),
        "away_pts": sum(r["pts"] for r in AWAY_ROWS),
        "columns": list(COLUMNS),
        "home_rows": json.loads(json.dumps(HOME_ROWS)),
        "away_rows": json.loads(json.dumps(AWAY_ROWS)),
        "home_totals": _totals(HOME_ROWS),
        "away_totals": _totals(AWAY_ROWS),
    }


def run(data):
    """Run the validator on `data`; return (exit_code, stdout)."""
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "box.json"
        path.write_text(json.dumps(data))
        proc = subprocess.run([sys.executable, str(SCRIPT), str(path)],
                              capture_output=True, text=True)
        return proc.returncode, proc.stdout


FAILURES = []


def expect(label, cond, detail=""):
    if cond:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label}" + (f" — {detail}" if detail else ""))
        FAILURES.append(label)


def main():
    print("validate_boxscore.py")

    # The fixture itself must be clean, or every test below is meaningless.
    code, out = run(base())
    expect("a clean box score passes", code == 0, out)
    expect("a clean box score reports no skipped checks",
           "skipped" not in out, out)

    # --- the header check ------------------------------------------------
    # A moved column is the 2K-release failure mode: same 12 labels, different
    # order, and every number lands in the wrong field while still looking sane.
    d = base()
    d["columns"] = ["MIN", "PTS", "AST", "REB", "STL", "BLK", "TO",
                    "FG", "3PT", "FT", "OREB", "PF"]
    code, out = run(d)
    expect("a reordered header fails", code == 1, out)
    expect("a reordered header says the layout changed",
           "layout changed" in out, out)

    # An inserted column (a +/- , a GmSc) shifts everything to its right.
    d = base()
    d["columns"] = COLUMNS + ["+/-"]
    code, out = run(d)
    expect("an unknown extra column fails", code == 1, out)
    expect("an unknown extra column is named in the report", "+/-" in out, out)

    # A relabeled column is NOT a layout change and must not cry wolf — 2K has
    # printed the turnover column as both TO and TOV.
    d = base()
    d["columns"] = ["MINS", "PTS", "REB", "AST", "STL", "BLK", "TOV",
                    "FGM/FGA", "3PM/3PA", "FTM/FTA", "OR", "PF"]
    code, out = run(d)
    expect("known label variants still pass", code == 0, out)

    # Absent, the check must announce itself rather than pass silently.
    d = base()
    del d["columns"]
    code, out = run(d)
    expect("a missing header block still passes", code == 0, out)
    expect("a missing header block is reported as skipped",
           "layout NOT verified" in out and "skipped" in out, out)

    # --- the TOTALS check ------------------------------------------------
    # One wrong AST digit: legal row, legal team, caught only by the totals row.
    d = base()
    d["home_rows"][0]["ast"] += 3
    code, out = run(d)
    expect("a wrong AST cell fails against TOTALS", code == 1, out)
    expect("the failing column is named", "AST" in out, out)

    # Same for a column the old checks never touched at all.
    for field in ("reb", "stl", "blk", "tov", "pf"):
        d = base()
        # Keep OREB <= REB and PF <= 6 intact so only the totals check fires.
        d["away_rows"][1][field] += 1
        code, out = run(d)
        expect(f"a wrong {field.upper()} cell fails against TOTALS",
               code == 1 and field.upper() in out, out)

    # A transposed REB/AST pair passes every other check in the file.
    d = base()
    r = d["home_rows"][2]
    r["reb"], r["ast"] = r["ast"], r["reb"]
    r["oreb"] = min(r["oreb"], r["reb"])
    code, out = run(d)
    expect("a transposed REB/AST pair fails against TOTALS", code == 1, out)

    # Absent, the check must announce itself rather than pass silently.
    d = base()
    del d["home_totals"]
    del d["away_totals"]
    code, out = run(d)
    expect("missing totals still pass", code == 0, out)
    expect("missing totals are reported as skipped",
           "unchecked" in out and "skipped" in out, out)

    # --- the checks that already existed must still fire ------------------
    d = base()
    d["home_rows"][0]["pts"] += 2
    code, _ = run(d)
    expect("the points identity still fires", code == 1)

    d = base()
    d["home_rows"][0]["min"] = 60
    d["home_rows"][1]["min"] = 36
    code, _ = run(d)
    expect("the per-player minute cap still fires", code == 1)

    d = base()
    d["away_pts"] = d["home_pts"]
    code, _ = run(d)
    expect("identical final scores still fire", code == 1)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed: {', '.join(FAILURES)}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
