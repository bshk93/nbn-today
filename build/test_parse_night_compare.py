#!/usr/bin/env python3
"""Pins `parse_night.py compare`, the double read: two independent
transcriptions of a game are written through only when they agree on every
cell, and every disagreement is named. Runs from the pre-commit hook; no
network, no data dir."""
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import parse_night  # noqa: E402

GAME = """#columns=MIN,PTS,REB,AST,STL,BLK,TO,FG,3PT,FT,OR,FLS
#home_pts=106
#away_pts=135
HOME
A. Reaves|33 28 5 5 1 0 2 12-17 4-7 0-0 0 2
G. Williams|27 9 7 2 0 2 1 3-14 3-6 0-0 4 5
D. Ayton|30 10 13 0 2 0 2 4-11 0-0 2-3 3 1
TOTAL|240 106 45 23 5 5 21 41-91 14-34 10-13 9 24
AWAY
Z. Williamson|29 31 4 3 2 0 2 14-19 0-0 3-4 1 1
Y. Konan Niederhäuser|20 8 6 1 0 2 0 4-5 0-0 0-0 2 3
"""

failures = []


def check(name, cond):
    if not cond:
        failures.append(name)
        print("FAIL", name)


# Identical reads agree.
check("identical reads agree", parse_night.compare_reads(GAME, GAME) == [])

# Spacing and line order of the header lines don't matter; values do.
check("blank lines ignored", parse_night.compare_reads(GAME, GAME.replace("HOME\n", "\nHOME\n")) == [])

# One misread cell (the real slip from 2026-11-11: a 7 read as a 2) is named.
slip = GAME.replace("G. Williams|27 9 7 2", "G. Williams|27 9 2 2")
d = parse_night.compare_reads(GAME, slip)
check("one slip, one line", len(d) == 1)
check("slip names the player and field", d and "G. Williams" in d[0] and "reb a=7 b=2" in d[0])

# A shooting cell compares both halves.
d = parse_night.compare_reads(GAME, GAME.replace("4-7 0-0 0 2", "4-8 0-0 0 2"))
check("made-att compared", len(d) == 1 and "tpa a=7 b=8" in d[0])

# A skipped player is one disagreement, not a shift of every row below him.
skipped = GAME.replace("G. Williams|27 9 7 2 0 2 1 3-14 3-6 0-0 4 5\n", "")
d = parse_night.compare_reads(GAME, skipped)
check("skipped row is one disagreement", len(d) == 1 and "(missing)" in d[0])

# Totals, final score and header disagreements are all reported.
check("totals compared", len(parse_night.compare_reads(GAME, GAME.replace("TOTAL|240 106 45", "TOTAL|240 106 40"))) == 1)
check("final score compared", len(parse_night.compare_reads(GAME, GAME.replace("#home_pts=106", "#home_pts=108"))) == 1)
check("header compared", any("header" in x for x in parse_night.compare_reads(
    GAME, GAME.replace("OR,FLS", "FLS,OR"))))

# The side matters: the same line under the other team is a disagreement.
moved = GAME.replace("HOME\n", "HOMEX\n").replace("AWAY\n", "HOME\n").replace("HOMEX\n", "AWAY\n")
check("side compared", parse_night.compare_reads(GAME, moved) != [])

# A malformed read is reported, never written through.
check("bad read reported", parse_night.compare_reads(GAME, GAME.replace("12-17 4-7", "12-17")) != [])

# cmd_compare writes only agreeing games, and returns non-zero when any split.
tmp = Path(tempfile.mkdtemp())
try:
    for sub in ("a", "b"):
        (tmp / sub).mkdir()
    (tmp / "a" / "g1.txt").write_text(GAME)
    (tmp / "b" / "g1.txt").write_text(GAME)
    (tmp / "a" / "g2.txt").write_text(GAME)
    (tmp / "b" / "g2.txt").write_text(slip)
    (tmp / "a" / "g3.txt").write_text(GAME)
    rc = parse_night.cmd_compare(tmp)
    check("agreeing game written", (tmp / "g1.txt").read_text() == GAME)
    check("split game not written", not (tmp / "g2.txt").exists())
    check("single read not written", not (tmp / "g3.txt").exists())
    check("non-zero when a game splits", rc == 1)
finally:
    shutil.rmtree(tmp)

if failures:
    print(f"\n{len(failures)} failure(s)")
    sys.exit(1)
print("parse_night compare: all checks pass")
