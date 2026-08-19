#!/usr/bin/env python3
"""What build.sh must keep being true — port spec Phase 3.

The stats aggregation is Python now (`stats_build`, in nbn-api). build.sh is
still the entry point everything triggers, so it is the seam where the cutover
could silently come undone: a revert to `Rscript`, a second copy of the season
rule creeping back, or one engine quietly skipping the smoke test.

This lives here rather than in nbn-api's suite on purpose. A test in that repo
asserting on this file would fail until *this* repo deploys — cross-repo
coupling is what the port set out to remove, not something to add back in a
test.

Run by build/hooks/pre-commit, next to smoke_test.py.

    python3 build/test_build_sh.py
"""

import sys
from pathlib import Path

BUILD_SH = Path(__file__).resolve().parent / "build.sh"

FAILS = []


def check(name, cond):
    print(f"  [{'ok' if cond else 'FAIL'}] {name}")
    if not cond:
        FAILS.append(name)


text = BUILD_SH.read_text()
python_branch = text.split('== "python"')[1].split("elif")[0]
after_engines = text.split("\nfi\n", 1)[-1]

print("the engine switch")
check("defaults to Python", "NBN_STATS_ENGINE:-python" in text)
check("the live path runs the stats_build entry point", "-m stats_build" in python_branch)
check("R is still reachable as the dormant engine", "Rscript" in text and '== "r"' in text)
check("an unrecognised engine is refused, not silently treated as one of them",
      "unknown NBN_STATS_ENGINE" in text and "exit 2" in text)

print("\none season resolver")
# The Sep 30 cutoff exists in Python (stats_build/buildargs.py) and, until R
# goes, in bash on the R branch only. A third copy on the live path is how the
# two engines would start disagreeing about which season a build is for.
check("no second copy of the cutoff rule on the live path",
      "America/New_York" not in python_branch)

print("\nwhat happens after either engine")
check("the served view is republished once, for both", after_engines.count("link-public.sh") == 1)
check("the data contract is verified once, for both", after_engines.count("smoke_test.py") == 1)
check("the smoke test's status is the build's exit status", 'exit "$SMOKE_STATUS"' in text)

print("\n" + ("FAILED: " + ", ".join(FAILS) if FAILS else "all checks passed"))
sys.exit(1 if FAILS else 0)
