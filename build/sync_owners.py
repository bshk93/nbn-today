#!/usr/bin/env python3
"""
Regenerate owners.csv from members.json tenure data.

Reads:  $NBS_DATA_DIR/members.json
Writes: $NBS_DATA_DIR/owners.csv  (team,owner,start_date in M/D/YYYY format)

Only emits tenure rows where position == "owner".  Rows are sorted by team
then start_date, matching the historical hand-maintained file format that
job.R expects.
"""
import csv
import json
import os
import sys
from datetime import date
from pathlib import Path

DATA_DIR     = Path(os.environ.get("NBS_DATA_DIR", "/var/lib/nothing-but-stats"))
MEMBERS_FILE = DATA_DIR / "members.json"
OWNERS_FILE  = DATA_DIR / "owners.csv"


def iso_to_mdy(iso: str) -> str:
    """Convert 'YYYY-MM-DD' → 'M/D/YYYY' (no leading zeros)."""
    d = date.fromisoformat(iso)
    return f"{d.month}/{d.day}/{d.year}"


def main():
    if not MEMBERS_FILE.exists():
        print(f"ERROR: {MEMBERS_FILE} not found", file=sys.stderr)
        sys.exit(1)

    members = json.loads(MEMBERS_FILE.read_text())

    rows = []  # (team, name, start_iso) — sort key uses ISO date directly
    for name, data in members.items():
        for tenure in data.get("tenures", []):
            if tenure.get("position") != "owner":
                continue
            team  = (tenure.get("team") or "").upper()
            start = tenure.get("start") or ""
            if not team or not start:
                continue
            rows.append((team, name, start))

    rows.sort(key=lambda r: (r[0], r[2]))  # team asc, start_date asc

    with OWNERS_FILE.open("w", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["team", "owner", "start_date"])
        for team, name, start_iso in rows:
            writer.writerow([team, name, iso_to_mdy(start_iso)])

    print(f"sync_owners: wrote {len(rows)} rows to {OWNERS_FILE}")


if __name__ == "__main__":
    main()
