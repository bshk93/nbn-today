#!/usr/bin/env python3
"""One-time script to seed player-bios.json from player_seasons.csv."""

import csv
import json
import re
from datetime import datetime
from pathlib import Path

CSV_PATH  = Path(__file__).parent / "player_seasons.csv"
BIOS_PATH = Path("/var/lib/nothing-but-stats/player-bios.json")

SENTINEL = {"NA", "None", "N/A", ""}


def clean(v: str) -> str:
    v = v.strip()
    return "" if v in SENTINEL else v


def parse_dob(v: str) -> str:
    v = clean(v)
    if not v:
        return ""
    try:
        return datetime.strptime(v, "%m/%d/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return v  # already ISO or unknown format, keep as-is


def parse_int(v: str) -> int | None:
    v = clean(v)
    m = re.search(r"\d+", v)
    return int(m.group()) if m else None


def main():
    seen: dict[str, dict] = {}

    with CSV_PATH.open() as f:
        for row in csv.DictReader(f):
            slug = row["SLUG"].strip()
            if not slug or slug in seen:
                continue
            seen[slug] = {
                "name":        clean(row["PLAYER"]).upper(),
                "pos":         "",
                "dob":         parse_dob(row["DOB"]),
                "college":     clean(row["COLLEGE"]),
                "country":     clean(row["COUNTRY"]),
                "draft_year":  parse_int(row["NBN_DFT_YR"]),
                "draft_round": parse_int(row["NBN_DFT_R"]),
                "draft_pick":  parse_int(row["NBN_DFT_P"]),
                "photo_url":   clean(row["PHOTO_URL"]),
            }

    existing: dict = {}
    if BIOS_PATH.exists():
        existing = json.loads(BIOS_PATH.read_text())

    # existing entries (manually added) take precedence over CSV data
    merged = {**seen, **existing}
    BIOS_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False))
    print(f"Done: {len(merged)} players ({len(seen)} from CSV, {len(existing)} pre-existing).")


if __name__ == "__main__":
    main()
