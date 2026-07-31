#!/usr/bin/env python3
"""
Smoke test for the build's data contract.

The R build writes CSVs; the HTML pages read specific column names out of them.
Nothing else checks that those two halves still agree, and the live docroot is a
symlink to this working tree — so a renamed column ships broken immediately.

This asserts, for every generated file:
  - it exists, parses, and has rows
  - every column a page depends on is still present (extra columns are fine —
    additive changes are safe, removals and renames are not)
  - no depended-on column is entirely blank (the failure mode that silently
    emptied the roster OVR column for the whole league)

Then it checks that every literal data-file path fetched by a page exists on disk.

Usage:
    python3 build/smoke_test.py            # full run
    python3 build/smoke_test.py --quiet    # only report problems
Exit status is 1 if any check failed, 0 otherwise.
"""

import argparse
import csv
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

TEAMS = [
    "atl", "bkn", "bos", "cha", "chi", "cle", "dal", "den", "det", "gsw",
    "hou", "ind", "lac", "lal", "mem", "mia", "mil", "min", "nop", "nyk",
    "okc", "orl", "phi", "phx", "por", "sac", "sas", "tor", "uta", "was",
]

STAT_KEYS = ["p", "r", "a", "s", "b", "3pm"]

# Columns that are legitimately sparse — a fully blank one is not a red flag.
# (Playoff/award fields go empty in a young league or early in a season.)
BLANK_OK = {
    "FOTY", "COTY", "ROUND", "GAME", "PLAYOFF_RESULT", "NBN_DFT_YR",
    "NBN_DFT_R", "NBN_DFT_P", "RINGS", "COLLEGE", "COUNTRY", "PHOTO_URL",
    "EAST_RUNNER_UP", "WEST_RUNNER_UP", "MIP", "ROTY", "SIX_MOY", "ROY",
    "ALL_DEF", "TYPE", "TEAM",
}

GAME_HIGH_COLS = [
    "RANK", "DATE", "SEASON", "PLAYER", "TEAM", "OPP", "gametype",
    "P", "R", "A", "S", "B", "3PM",
]

H2H_COLS = [t.upper() for t in TEAMS]

PLAYER_SEASON_COLS = [
    "PLAYER", "SEASON", "TEAM", "G", "MIN", "PTS", "REB", "AST", "STL", "BLK",
    "TOV", "PF", "FGM", "FGA", "HIGH_P", "HIGH_R", "HIGH_A", "HIGH_S",
    "HIGH_B", "HIGH_3PM", "HIGH_GMSC", "3PM", "3PA", "FTM", "FTA", "GMSC",
    "SLUG",
]

# path -> (required columns, minimum rows, consuming page)
SCHEMA = {
    "data/owner_stats.csv": (
        ["owner", "teams", "seasons", "best_reg_season", "best_reg_pct",
         "worst_reg_season", "worst_reg_pct", "reg_w", "reg_l", "reg_pct",
         "playoff_w", "playoff_l", "playoff_pct", "total_w", "total_l",
         "total_pct", "playoff_appearances", "po_r2", "po_conf_finals",
         "po_finals", "championships", "off_rtg", "def_rtg"],
        1, "owners/index.html",
    ),
    "standings/standings-history.csv": (
        ["SEASON", "W", "L", "PCT", "PPG", "OPPG", "DIFF", "SEED", "SEED_NUM",
         "OFF_RTG", "DEF_RTG", "PLAYOFF_RESULT", "FOTY", "COTY", "TEAM"],
        30, "standings/index.html",
    ),
    "standings/playoff-brackets.csv": (
        ["SEASON", "ROUND", "T1", "T2", "T1_W", "T2_W", "WINNER",
         "T1_SEED", "T1_SEED_NUM", "T2_SEED", "T2_SEED_NUM"],
        1, "standings/index.html",
    ),
    "nbntv-classics/playoff-series-margins.csv": (
        ["SEASON", "ROUND", "T1", "T2", "GAMES", "AVG_MARGIN", "WINNER"],
        1, "nbntv-classics/index.html",
    ),
    "nbntv-classics/playoff-classics.csv": (
        ["RANK", "SEASON", "DATE", "PLAYER", "TEAM", "OPP", "GMSC"],
        1, "nbntv-classics/index.html",
    ),
    "players/player_seasons.csv": (
        PLAYER_SEASON_COLS + ["RINGS"], 1, "players/index.html",
    ),
    "players/player_seasons_playoffs.csv": (
        PLAYER_SEASON_COLS, 1, "players/index.html",
    ),
    "players/player_awards.csv": (
        ["SLUG", "PLAYER", "SEASON", "AWARD"], 1, "players/index.html",
    ),
    "data/hof.csv": (
        ["PLAYER", "TEAMS", "HOF_POINTS", "RINGS", "PLAYOFF_APPS", "ALLSTARS",
         "ALL_NBN_1", "ALL_NBN_2", "ALL_NBN_3", "MVP", "DPOY", "ALL_DEF",
         "SIX_MOY", "ROY", "MIP", "G", "M", "P", "R", "A", "S", "B", "ACTIVE"],
        1, "hof/index.html",
    ),
    "data/league-history.csv": (
        ["SEASON", "CHAMPION", "RUNNER_UP", "MVP", "DPOY", "ROTY", "MIP",
         "FOTY", "COTY", "PTS_LEADER", "REB_LEADER", "AST_LEADER",
         "STL_LEADER", "BLK_LEADER", "TPM_LEADER", "BEST_OFF", "BEST_DEF",
         "BEST_OVERALL"],
        1, "season-summary/index.html",
    ),
    "data/h2h-alltime.csv": (["TEAM"] + H2H_COLS, 30, "h2h/index.html"),
    "data/h2h-playoffs.csv": (["TEAM"] + H2H_COLS, 1, "h2h/index.html"),
    "data/h2h-owners.csv": (["OWNER"] + H2H_COLS, 1, "h2h/index.html"),
}

for _k in STAT_KEYS:
    SCHEMA[f"data/game-highs-{_k}.csv"] = (
        GAME_HIGH_COLS, 1, f"stats/highs/{_k}/index.html",
    )
    SCHEMA[f"data/totals-{_k}.csv"] = (
        ["RANK", "PLAYER", _k.upper()], 1, f"stats/totals/{_k}/index.html",
    )

for _t in TEAMS:
    SCHEMA[f"data/{_t}-seasons.csv"] = (
        ["SEASON", "W", "L", "PCT", "PPG", "OPPG", "DIFF", "SEED", "SEED_NUM",
         "OFF_RTG", "DEF_RTG", "PLAYOFF_RESULT", "FOTY", "COTY"],
        1, f"teams/{_t.upper()}/",
    )
    SCHEMA[f"data/{_t}-players.csv"] = (
        ["PLAYER", "GP", "GMSC_TOT", "GMSC_AVG", "PPG", "RPG", "APG", "SPG",
         "BPG", "3PMPG", "SEASONS"],
        1, f"teams/{_t.upper()}/",
    )
    SCHEMA[f"data/{_t}-roster.csv"] = (["SLUG"], 0, f"teams/{_t.upper()}/")
    SCHEMA[f"data/{_t}-picks.csv"] = (
        ["YEAR", "ROUND", "TEAM", "TYPE"], 0, f"teams/{_t.upper()}/",
    )


class Report:
    def __init__(self, quiet):
        self.quiet = quiet
        self.errors = []
        self.warnings = []
        self.checked = 0

    def error(self, path, msg):
        self.errors.append((path, msg))

    def warn(self, path, msg):
        self.warnings.append((path, msg))

    def ok(self, msg):
        if not self.quiet:
            print(f"  ok   {msg}")


def is_blank(value):
    return value is None or value.strip() in ("", "NA", "NaN")


def check_csv(relpath, required, min_rows, consumer, report):
    report.checked += 1
    path = REPO / relpath

    if not path.exists():
        report.error(relpath, f"missing (read by {consumer})")
        return
    if path.stat().st_size == 0:
        report.error(relpath, f"empty file (read by {consumer})")
        return

    try:
        with path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            header = reader.fieldnames or []
            rows = list(reader)
    except (UnicodeDecodeError, csv.Error) as exc:
        report.error(relpath, f"unparseable: {exc}")
        return

    missing = [c for c in required if c not in header]
    if missing:
        report.error(
            relpath,
            f"missing column(s) {', '.join(missing)} — {consumer} reads them",
        )
        return

    if len(rows) < min_rows:
        report.error(
            relpath, f"has {len(rows)} rows, expected at least {min_rows}"
        )
        return

    if rows:
        for col in required:
            if col in BLANK_OK:
                continue
            if all(is_blank(r.get(col)) for r in rows):
                report.warn(
                    relpath,
                    f"column '{col}' is blank in all {len(rows)} rows",
                )

    report.ok(f"{relpath} ({len(rows)} rows)")


FETCH_RE = re.compile(r"""fetch\(\s*['"`](/[^'"`?${]+\.(?:csv|json))['"`]""")


def check_fetch_targets(report):
    """Every literal /x.csv or /x.json a page fetches must exist on disk."""
    skip = {".git", ".claude", "venv", "__pycache__", "node_modules"}
    targets = {}

    for path in REPO.rglob("*"):
        if path.suffix not in (".html", ".js") or not path.is_file():
            continue
        if skip & set(path.relative_to(REPO).parts):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for match in FETCH_RE.finditer(text):
            targets.setdefault(match.group(1), set()).add(
                str(path.relative_to(REPO))
            )

    for target, sources in sorted(targets.items()):
        report.checked += 1
        # API routes are served by nbn-api, not from disk.
        if target.startswith("/api/"):
            continue
        if not (REPO / target.lstrip("/")).exists():
            report.error(
                target, f"fetched by {', '.join(sorted(sources))} but not on disk"
            )
        else:
            report.ok(f"{target} (fetched by {len(sources)} page(s))")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--quiet", action="store_true", help="only print problems"
    )
    args = parser.parse_args()

    report = Report(args.quiet)

    if not args.quiet:
        print("Checking generated data files…")
    for relpath, (required, min_rows, consumer) in SCHEMA.items():
        check_csv(relpath, required, min_rows, consumer, report)

    if not args.quiet:
        print("\nChecking fetched data paths…")
    check_fetch_targets(report)

    print()
    for path, msg in report.warnings:
        print(f"WARN  {path}: {msg}")
    for path, msg in report.errors:
        print(f"FAIL  {path}: {msg}")

    summary = (
        f"{report.checked} checks, {len(report.errors)} failed, "
        f"{len(report.warnings)} warning(s)"
    )
    print(summary)
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
