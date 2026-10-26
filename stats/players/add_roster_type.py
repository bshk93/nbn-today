#!/usr/bin/env python3
"""
Add TYPE column to new-format (SLUG+OVR) roster CSVs.
- Skips CSVs that already have TYPE or are legacy format (have PLAYER column).
- Defaults TYPE to '' for bio.type='player', else uses bio.type directly.
- For slugs on multiple teams with bio.type='player', TYPE is left '' on all
  of them — mark the dead cap entry manually via edit mode on the team page.

Run with --apply to write changes (dry-run by default).
"""
import csv, io, json, sys
from pathlib import Path

DATA_DIR = Path("/var/lib/nothing-but-stats")
DRY_RUN  = "--apply" not in sys.argv

with open(DATA_DIR / "player-bios.json") as f:
    bios = json.load(f)

for path in sorted(DATA_DIR.glob("*-roster.csv")):
    text = path.read_text()
    reader = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    rows = list(reader)

    if not rows:
        continue
    if "PLAYER" in headers:          # legacy format — skip
        continue
    if "TYPE" in headers:            # already migrated — skip
        continue
    if "SLUG" not in headers:
        continue

    new_headers = ["SLUG", "TYPE", "OVR"]

    new_rows = []
    for row in rows:
        slug = row.get("SLUG", "").strip()
        bio_type = bios.get(slug, {}).get("type", "")
        roster_type = "" if bio_type == "player" else bio_type
        new_rows.append({"SLUG": slug, "TYPE": roster_type, "OVR": row.get("OVR", "")})

    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=new_headers, lineterminator="\n")
    writer.writeheader()
    writer.writerows(new_rows)

    if DRY_RUN:
        print(f"[dry-run] {path.name}: would add TYPE column ({len(new_rows)} rows)")
        for r in new_rows:
            if r["TYPE"]:
                print(f"          {r['SLUG']} → TYPE={r['TYPE']!r}")
    else:
        path.write_text(out.getvalue())
        print(f"[updated] {path.name}")

if DRY_RUN:
    print("\nRun with --apply to write changes.")
