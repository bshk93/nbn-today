#!/usr/bin/env python3
"""
Migrate roster CSVs to the new slug-based format.

Dry run by default — prints matches/unmatched without writing anything.
Pass --apply to write changes:
  1. Move type / cap_holds / salaries from each roster CSV into player-bios.json
  2. Rewrite each roster CSV as SLUG,OVR (dropping all other columns)

python3 players/migrate_rosters.py           # dry run
python3 players/migrate_rosters.py --apply   # write changes
"""

import csv
import json
import re
import sys
from pathlib import Path

DATA_DIR  = Path("/var/lib/nothing-but-stats")
BIOS_FILE = DATA_DIR / "player-bios.json"
TEAMS = [
    "atl","bkn","bos","cha","chi","cle","dal","den","det","gsw",
    "hou","ind","lac","lal","mem","mia","mil","min","nop","nyk",
    "okc","orl","phi","phx","por","sac","sas","tor","uta","was",
]
SENTINEL = {"", "NA", "None", "N/A"}


def clean(v: str) -> str:
    return "" if v.strip() in SENTINEL else v.strip()


def bio_display_name(bio_name: str) -> str:
    """'BARNES, SCOTTIE' → 'SCOTTIE BARNES'"""
    if "," in bio_name:
        last, first = bio_name.split(",", 1)
        return f"{first.strip()} {last.strip()}"
    return bio_name


def normalize(name: str) -> str:
    name = name.upper()
    name = name.replace('.', '')                        # C.J. → CJ, T.J. → TJ
    for ch in ("'", '‘', '’', 'ʼ'):     # strip all apostrophe variants
        name = name.replace(ch, '')
    name = re.sub(r'\s+(JR|SR|II|III|IV)$', '', name)  # strip trailing suffixes
    return " ".join(name.split())


def main():
    apply = "--apply" in sys.argv

    bios: dict = json.loads(BIOS_FILE.read_text())

    # Reverse map: "SCOTTIE BARNES" → "barnes-scottie"
    reverse: dict[str, str] = {}
    for slug, bio in bios.items():
        key = normalize(bio_display_name(bio.get("name", "")))
        if key:
            reverse[key] = slug

    total_matched = 0
    all_unmatched: list[str] = []

    for team in TEAMS:
        path = DATA_DIR / f"{team}-roster.csv"
        if not path.exists():
            print(f"[SKIP] {team}: file not found")
            continue

        with path.open() as f:
            reader = csv.DictReader(f)
            headers = list(reader.fieldnames or [])
            rows = list(reader)

        salary_cols = [h for h in headers if len(h) == 5 and h[2] == "-"]

        new_rows: list[dict] = []
        team_matched = 0
        team_unmatched: list[str] = []

        for row in rows:
            player = clean(row.get("PLAYER", ""))
            if not player:
                continue
            ovr = clean(row.get("OVR", ""))
            slug = reverse.get(normalize(player))

            if not slug:
                team_unmatched.append(player)
                all_unmatched.append(f"  {team}: {player!r}")
                new_rows.append({"SLUG": "", "OVR": ovr})
                continue

            team_matched += 1
            total_matched += 1

            salaries = {
                sc: row[sc].strip()
                for sc in salary_cols
                if row.get(sc, "").strip() and row[sc].strip() not in SENTINEL
            }
            contract_type = clean(row.get("TYPE", ""))
            cap_holds = clean(row.get("CAP_HOLDS", ""))

            if apply:
                bio = bios[slug]
                bio["type"]      = contract_type
                bio["cap_holds"] = cap_holds
                bio["salaries"]  = salaries

            new_rows.append({"SLUG": slug, "OVR": ovr})

        status = "[OK] " if apply else "[DRY]"
        print(f"{status} {team}: {team_matched} matched, {len(team_unmatched)} unmatched"
              + (f" → {team_unmatched}" if team_unmatched else ""))

        if apply:
            with path.open("w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=["SLUG", "OVR"], lineterminator="\n")
                writer.writeheader()
                writer.writerows(new_rows)

    if apply:
        BIOS_FILE.write_text(json.dumps(bios, indent=2, ensure_ascii=False))

    print(f"\nTotal matched: {total_matched}  |  unmatched: {len(all_unmatched)}")
    if all_unmatched:
        print("Unmatched players (will have empty SLUG):")
        for u in all_unmatched:
            print(u)

    if not apply:
        print("\nRe-run with --apply to write changes.")


if __name__ == "__main__":
    main()
