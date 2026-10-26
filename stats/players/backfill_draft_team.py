#!/usr/bin/env python3
"""Backfill `draft_team` onto player-bios.json from player-bio-database.csv.

The pre-migration build stored each player's NBN pick as "Pick N (TEAM)" in the
spreadsheet's `NBN D P` column. The build migration dropped the "(TEAM)" part,
so the canonical bios lost the drafting team. This restores it.

Safe by construction:
  * only sets draft_team where it is currently empty/null (never overwrites the
    2026 picks being entered "for real" via transactions);
  * atomic write (temp + os.replace) to minimize the race window;
  * makes a timestamped backup first.

Dry run by default; pass --apply to write.
"""
import csv, json, os, re, sys, datetime

DATA_DIR = "/var/lib/nothing-but-stats"
BIOS = os.path.join(DATA_DIR, "player-bios.json")
DB   = os.path.join(DATA_DIR, "player-bio-database.csv")

VALID_TEAMS = {
    "ATL","BKN","BOS","CHA","CHI","CLE","DAL","DEN","DET","GSW","HOU","IND",
    "LAC","LAL","MEM","MIA","MIL","MIN","NOP","NYK","OKC","ORL","PHI","PHX",
    "POR","SAC","SAS","TOR","UTA","WAS",
}

def norm(s):
    return re.sub(r"[^a-z]", "", (s or "").lower())

def main():
    apply = "--apply" in sys.argv
    bios = json.load(open(BIOS))

    # Index bios by normalized "LAST, FIRST" name.
    by_name = {}
    for slug, b in bios.items():
        n = norm(b.get("name", ""))
        if n:
            by_name.setdefault(n, slug)

    rows = list(csv.reader(open(DB)))
    hdr = rows[1]
    pcol = hdr.index("NBN D P")

    set_count = skip_has = skip_already = unmatched = bad_team = 0
    unmatched_names, bad_teams = [], []
    pending = {}  # slug -> team

    for r in rows[2:]:
        if pcol >= len(r):
            continue
        m = re.search(r"Pick\s+(\d+)\s+\(([A-Za-z]{2,3})\)", r[pcol] or "")
        if not m:
            continue
        team = m.group(2).upper()
        name = r[1] or r[0]
        slug = by_name.get(norm(name))
        if not slug:
            unmatched += 1; unmatched_names.append(name); continue
        if team not in VALID_TEAMS:
            bad_team += 1; bad_teams.append((name, team)); continue
        if bios[slug].get("draft_team"):
            skip_already += 1; continue
        pending[slug] = team
        set_count += 1

    print(f"parsed picks with team: {set_count + skip_already + unmatched + bad_team}")
    print(f"  will set draft_team:        {set_count}")
    print(f"  already had draft_team:     {skip_already}")
    print(f"  unmatched name:             {unmatched}  {unmatched_names}")
    print(f"  unknown team abbr:          {bad_team}  {bad_teams}")

    if not apply:
        print("\n(dry run — pass --apply to write)")
        return

    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = f"{BIOS}.bak-draftteam-{ts}"
    with open(bak, "w") as f:
        json.dump(bios, f, ensure_ascii=False, indent=2)
    print(f"\nbackup written: {bak}")

    # Re-read just before write to pick up any concurrent edits, then apply.
    fresh = json.load(open(BIOS))
    applied = 0
    for slug, team in pending.items():
        if slug in fresh and not fresh[slug].get("draft_team"):
            fresh[slug]["draft_team"] = team
            applied += 1
    tmp = f"{BIOS}.tmp-{ts}"
    with open(tmp, "w") as f:
        json.dump(fresh, f, ensure_ascii=False, indent=2)
    os.replace(tmp, BIOS)
    print(f"applied draft_team to {applied} players (atomic write).")

if __name__ == "__main__":
    main()
