#!/usr/bin/env python3
"""Pins `parse_night.py reread`: a fresh reader's look at one column goes in
only when the screen proves it (the printed TOTAL, or a split between two
reads), and is otherwise left for the user. Built from the two real misreads
of 2026-11-12. Runs from the pre-commit hook; no network, no data dir."""
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import parse_night  # noqa: E402

# TOR on 2026-11-12: Landale's 8 rebounds were read as 2 (sum 34, TOTAL 40).
GAME = """#columns=MIN,PTS,REB,AST,STL,BLK,TO,FG,3PT,FT,OR,FLS
#home_pts=117
#away_pts=95
HOME
T. Maxey|36 30 4 6 1 0 2 11-20 4-9 4-4 0 1
AWAY
T. Murphy III|29 22 3 1 1 2 3 7-17 5-13 3-5 0 3
M. Williams|29 11 19 1 1 2 0 4-7 0-0 3-4 12 2
J. Landale|19 6 2 2 1 0 0 2-5 0-0 2-4 2 3
P. Spencer|15 2 16 2 0 0 2 1-6 0-3 0-0 0 3
TOTAL|92 41 40 6 3 4 5 14-35 5-16 8-13 14 11
"""
FRESH = "T. Murphy III|3\nM. Williams|19\nJ. Landale|8\nP. Spencer|10\nTOTAL|40\n"

failures = []


def check(name, cond):
    if not cond:
        failures.append(name)
        print("FAIL", name)


def settle(reads, side, col, fresh):
    return parse_night.settle_column(reads, side, col, parse_night.read_values(fresh))


# Spencer's 16 is a second slip in the same column, and here the two cancel
# out (2 + 16 = 8 + 10). The fresh read fixes both and still sums to the TOTAL.
texts, rep = settle([GAME], "away", "REB", FRESH)
check("totals-proved fix applies", texts is not None)
if texts:
    check("Landale now 8", "J. Landale|19 6 8 2" in texts[0])
    check("Spencer now 10", "P. Spencer|15 2 10 2" in texts[0])
    check("other columns untouched", "M. Williams|29 11 19 1 1 2 0 4-7 0-0 3-4 12 2" in texts[0])
    check("other side untouched", "T. Maxey|36 30 4 6 1 0 2 11-20 4-9 4-4 0 1" in texts[0])
    check("report names the changes", any("J. Landale REB: 2 -> 8" in r for r in rep))

# A fresh read that doesn't sum to the TOTAL proves nothing.
texts, rep = settle([GAME], "away", "REB", FRESH.replace("J. Landale|8", "J. Landale|7"))
check("fresh sum off: not applied", texts is None and "sums to" in rep[0])

# A fresh read of the TOTAL itself that differs: ask.
texts, rep = settle([GAME], "away", "REB", FRESH.replace("TOTAL|40", "TOTAL|46"))
check("fresh TOTAL differs: not applied", texts is None)

# A fresh reader that repeats the transcript changes nothing.
same = "T. Murphy III|3\nM. Williams|19\nJ. Landale|2\nP. Spencer|16\nTOTAL|40\n"
texts, rep = settle([GAME], "away", "REB", same)
check("repeat of the transcript: ask", texts is None and "matches the transcript" in rep[0])

# A player missing from the fresh read: ask.
texts, rep = settle([GAME], "away", "REB", "T. Murphy III|3\nM. Williams|19\nTOTAL|40\n")
check("missing player: ask", texts is None and "J. Landale" in rep[0])

# No TOTAL and one read: nothing can prove it.
no_total = GAME.replace("TOTAL|92 41 40 6 3 4 5 14-35 5-16 8-13 14 11\n", "")
texts, rep = settle([no_total], "away", "REB", FRESH)
check("no TOTAL, one read: ask", texts is None)

# No TOTAL, two reads split on Landale: fresh matches one side of the split.
b = no_total.replace("J. Landale|19 6 2 2", "J. Landale|19 6 8 2")
a = no_total.replace("P. Spencer|15 2 16 2", "P. Spencer|15 2 10 2")
b = b.replace("P. Spencer|15 2 16 2", "P. Spencer|15 2 10 2")
texts, rep = settle([a, b], "away", "REB", "T. Murphy III|3\nM. Williams|19\nJ. Landale|8\nP. Spencer|10\n")
check("split settled by a matching fresh read", texts is not None and len(texts) == 2)
if texts:
    check("both reads now agree", parse_night.compare_reads(texts[0], texts[1]) == [])

# ...but a fresh value that matches neither read: ask.
texts, rep = settle([a, b], "away", "REB", "T. Murphy III|3\nM. Williams|19\nJ. Landale|5\nP. Spencer|10\n")
check("fresh matches neither read: ask", texts is None)

# ...and a fresh value against two reads that agreed: ask.
texts, rep = settle([a, b], "away", "REB", "T. Murphy III|4\nM. Williams|19\nJ. Landale|8\nP. Spencer|10\n")
check("fresh against two agreeing reads: ask", texts is None)

# PHX on 2026-11-12: Smith's 0 turnovers read as 1. Shooting columns sum both halves.
SHOOT = """#columns=MIN,PTS,REB,AST,STL,BLK,TO,FG,3PT,FT,OR,FLS
HOME
K. Leonard|24 24 4 2 1 0 2 9-11 4-5 2-2 1 0
J. Smith|12 6 4 0 0 0 1 2-4 2-4 0-0 1 1
TOTAL|36 30 8 2 1 0 2 11-15 6-9 2-2 2 1
AWAY
"""
texts, rep = settle([SHOOT], "home", "TO", "K. Leonard|2\nJ. Smith|0\nTOTAL|2\n")
check("Smith TO fixed", texts is not None and "J. Smith|12 6 4 0 0 0 0 2-4" in texts[0])
texts, rep = settle([SHOOT], "home", "3PT", "K. Leonard|4-5\nJ. Smith|2-3\nTOTAL|6-9\n")
check("made-att checks both halves", texts is None and "sums to 6-8" in rep[0])

# cmd_reread edits <dir>/<id>.txt in place, or both reads of a split game.
tmp = Path(tempfile.mkdtemp())
(tmp / "g1.txt").write_text(GAME)
(tmp / "v").write_text(FRESH)
check("cmd_reread exit 0", parse_night.cmd_reread(tmp, "g1", "away", "REB", tmp / "v") == 0)
check("cmd_reread wrote the file", "J. Landale|19 6 8 2" in (tmp / "g1.txt").read_text())
(tmp / "v2").write_text(same)
check("cmd_reread exit 1 when unproved", parse_night.cmd_reread(tmp, "g1", "away", "AST", tmp / "v2") == 1)

if failures:
    print(f"\n{len(failures)} failure(s)")
    sys.exit(1)
print("parse_night reread: all checks pass")
