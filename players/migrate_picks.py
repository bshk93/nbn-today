#!/usr/bin/env python3
"""
Migrate per-team picks CSVs into a single draft-picks.csv.

Existing format (per-team):
  TYPE=own  → what happened to THIS team's original pick
              TEAM="Own"      → still holds it
              TEAM="Own*"     → still holds it (protected)
              TEAM="NYK"      → owed to NYK
              TEAM="DET/HOU"  → conditional (flagged for review)
  TYPE=acquired → this team holds another team's pick
              TEAM="NYK"      → holds NYK's pick

Output format (centralized draft-picks.csv):
  YEAR, ROUND, ORIG, OWNER, PICK, NOTES

Run with --apply to write the file (dry-run by default).
"""
import csv, io, sys
from pathlib import Path

DATA_DIR = Path("/var/lib/nothing-but-stats")
OUT_FILE = DATA_DIR / "draft-picks.csv"
DRY_RUN  = "--apply" not in sys.argv

VALID_TEAMS = {
    "ATL","BKN","BOS","CHA","CHI","CLE","DAL","DEN","DET","GSW",
    "HOU","IND","LAC","LAL","MEM","MIA","MIL","MIN","NOP","NYK",
    "OKC","ORL","PHI","PHX","POR","SAC","SAS","TOR","UTA","WAS",
}

def parse_round(r):
    return 1 if "1" in r else 2

picks = {}   # (year, round, orig) → dict
warnings = []

for team in sorted(VALID_TEAMS):
    path = DATA_DIR / f"{team.lower()}-picks.csv"
    if not path.exists():
        continue
    with open(path) as f:
        rows = list(csv.DictReader(f))

    for row in rows:
        year  = int(row["YEAR"])
        rnd   = parse_round(row["ROUND"])
        team_ = row["TEAM"].strip()
        typ   = row["TYPE"].strip()

        if typ == "own":
            orig  = team
            notes = ""
            if team_ in ("Own", ""):
                owner = team
            elif team_ == "Own*":
                owner = team
                notes = "protected"
            elif "/" in team_:
                # Conditional — use notes, owner = first team listed
                parts = [p.strip() for p in team_.split("/")]
                owner = parts[0] if parts[0] in VALID_TEAMS else team
                notes = f"conditional: {team_}"
                warnings.append(f"  [conditional] {year} R{rnd} {team}: {team_}")
            elif team_ in VALID_TEAMS:
                owner = team_   # owed to this team
            else:
                owner = team
                notes = team_
                warnings.append(f"  [unknown team] {year} R{rnd} {team}: TEAM={team_!r}")

            key = (year, rnd, orig)
            # "acquired" rows take precedence if already seen
            if key not in picks:
                picks[key] = {"YEAR": year, "ROUND": rnd, "ORIG": orig,
                              "OWNER": owner, "PICK": "", "NOTES": notes}

        elif typ == "acquired":
            if team_ not in VALID_TEAMS:
                warnings.append(f"  [unknown orig] {year} R{rnd} {team}: acquired from {team_!r}")
                continue
            orig  = team_
            owner = team
            key   = (year, rnd, orig)
            existing = picks.get(key)
            if existing and existing["OWNER"] != owner:
                warnings.append(
                    f"  [conflict] {year} R{rnd} {orig}: own-row says {existing['OWNER']}, "
                    f"acquired-row ({team}) says {owner} → using acquired"
                )
            picks[key] = {"YEAR": year, "ROUND": rnd, "ORIG": orig,
                          "OWNER": owner, "PICK": "",
                          "NOTES": existing["NOTES"] if existing else ""}

rows_out = sorted(picks.values(), key=lambda p: (p["YEAR"], p["ROUND"], p["ORIG"]))

if warnings:
    print("Warnings (need manual review):")
    for w in warnings:
        print(w)
    print()

print(f"{'[dry-run] would write' if DRY_RUN else '[writing]'} {OUT_FILE} — {len(rows_out)} picks")

if not DRY_RUN:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=["YEAR","ROUND","ORIG","OWNER","PICK","NOTES"],
                            lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows_out)
    OUT_FILE.write_text(out.getvalue())
    print("Done.")
else:
    # Print a sample
    print("\nFirst 20 rows:")
    for r in rows_out[:20]:
        print(f"  {r['YEAR']} R{r['ROUND']} {r['ORIG']:<4} → {r['OWNER']:<4}  {r['NOTES']}")
    if len(rows_out) > 20:
        print(f"  ... and {len(rows_out) - 20} more")
