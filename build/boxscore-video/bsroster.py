"""Roster cross-check: match voted box-score names against the team's actual
roster (`data/{abbr}-roster.csv` -> slugs -> `player-bios.json` names). This
kills partial-name OCR junk rows (single initials, mis-merged names), corrects
the display name, and attaches the canonical player slug for the eventual
allstats hand-off.
"""
from __future__ import annotations

import csv
import difflib
import json
import os
import re

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BIOS_PATH = "/var/lib/nothing-but-stats/player-bios.json"

# Full "City Nickname" -> abbr. OCR reads the left-panel full name; we match on
# it to find the roster CSV. Nickname-keyed too, for robustness.
TEAMS = {
    "atlanta hawks": "atl", "boston celtics": "bos", "brooklyn nets": "bkn",
    "charlotte hornets": "cha", "chicago bulls": "chi",
    "cleveland cavaliers": "cle", "dallas mavericks": "dal",
    "denver nuggets": "den", "detroit pistons": "det",
    "golden state warriors": "gsw", "houston rockets": "hou",
    "indiana pacers": "ind", "los angeles clippers": "lac",
    "los angeles lakers": "lal", "memphis grizzlies": "mem",
    "miami heat": "mia", "milwaukee bucks": "mil",
    "minnesota timberwolves": "min", "new orleans pelicans": "nop",
    "new york knicks": "nyk", "oklahoma city thunder": "okc",
    "orlando magic": "orl", "philadelphia 76ers": "phi",
    "phoenix suns": "phx", "portland trail blazers": "por",
    "sacramento kings": "sac", "san antonio spurs": "sas",
    "toronto raptors": "tor", "utah jazz": "uta",
    "washington wizards": "was",
}
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}

_bios = None


def bios():
    global _bios
    if _bios is None:
        with open(BIOS_PATH) as f:
            _bios = json.load(f)
    return _bios


def team_abbr(full_name: str):
    key = re.sub(r"[^a-z0-9 ]", "", full_name.lower()).strip()
    if key in TEAMS:
        return TEAMS[key]
    nick = key.split()[-1] if key else ""
    for name, ab in TEAMS.items():
        if nick and name.endswith(nick):
            return ab
    m = difflib.get_close_matches(key, TEAMS, n=1, cutoff=0.7)
    return TEAMS[m[0]] if m else None


def _name_parts(name: str):
    """'JAMES, LEBRON' or 'L. James Jr.' -> (last_lower, first_initial)."""
    if "," in name:  # bios "LAST, FIRST"
        last, first = name.split(",", 1)
        toks = last.split()
        toks = [t for t in toks if t.lower().rstrip(".") not in SUFFIXES]
        return " ".join(toks).lower().strip(), (first.strip()[:1].lower() or None)
    # OCR "L. James Jr." / ". Hartenstein" / "J. Sochan 6"
    name = name.replace(".", " ")
    toks = [t for t in name.split() if not t.isdigit()
            and t.lower() not in SUFFIXES]
    if not toks:
        return "", None
    initial = toks[0][0].lower() if len(toks[0]) == 1 else None
    last = toks[-1].lower()
    return last, initial


_global_index = None


def global_index():
    """League-wide [{slug, last, initial, display}] from player-bios.json.
    Used as a fallback because 2K in-game rosters don't always match the NBN
    roster CSVs (point-in-time drift / pending transactions), so a player can
    legitimately appear for a team the CSV doesn't list them on."""
    global _global_index
    if _global_index is None:
        out = []
        for slug, bio in bios().items():
            name = bio.get("name") or slug.replace("-", ", ").upper()
            last, initial = _name_parts(name)
            if last:
                out.append({"slug": slug, "last": last, "initial": initial,
                            "display": name})
        _global_index = out
    return _global_index


def load_roster(abbr: str):
    """[{slug, last, initial, display}] for a team abbr, or [] if no CSV."""
    path = os.path.join(REPO, "data", f"{abbr}-roster.csv")
    if not os.path.exists(path):
        return []
    out = []
    B = bios()
    with open(path) as f:
        for row in csv.DictReader(f):
            slug = (row.get("SLUG") or "").strip()
            if not slug:
                continue
            name = B.get(slug, {}).get("name", slug.replace("-", ", ").upper())
            last, initial = _name_parts(name)
            out.append({"slug": slug, "last": last, "initial": initial,
                        "display": name})
    return out


def reconcile(team_full_name: str, team_block):
    """Match voted players to the roster: drop unmatched junk, collapse rows
    that map to the same player (keep the better-seen one), attach slug +
    canonical name. Returns (new_block, report)."""
    abbr = team_abbr(team_full_name)
    roster = load_roster(abbr) if abbr else []
    if not roster:
        return team_block, {"abbr": abbr, "roster": 0, "matched": 0,
                            "dropped": []}
    kept, best_by_slug, dropped, off_roster = {}, {}, [], []
    for key, row in team_block["players"].items():
        if key == "TOTAL":
            kept[key] = row
            continue
        m = match(row["name"], roster)          # prefer this team's roster
        off = False
        if not m:                               # fall back to league-wide
            m = match(row["name"], global_index())
            off = m is not None
        if not m:
            dropped.append(row["name"])          # matches no real player: junk
            continue
        slug = m["slug"]
        if slug in best_by_slug:
            if best_by_slug[slug][0] >= row["seen"]:
                dropped.append(row["name"])
                continue
            dropped.append(kept[best_by_slug[slug][1]]["name"])
            del kept[best_by_slug[slug][1]]
        row = dict(row, slug=slug, name=m["display"], off_roster=off)
        kept[key] = row
        best_by_slug[slug] = (row["seen"], key)
        if off:
            off_roster.append(m["display"])
    block = dict(team_block, players=kept)
    return block, {"abbr": abbr, "roster": len(roster),
                   "matched": len(best_by_slug), "dropped": dropped,
                   "off_roster": off_roster}


def match(ocr_name: str, roster, cutoff=0.72):
    """Best roster entry for an OCR'd name, or None. Match on last name
    (fuzzy); use the first initial to break ties."""
    last, initial = _name_parts(ocr_name)
    if not last:
        return None
    scored = []
    for p in roster:
        r = difflib.SequenceMatcher(None, last, p["last"]).ratio()
        if initial and p["initial"] and initial == p["initial"]:
            r += 0.15
        scored.append((r, p))
    scored.sort(key=lambda x: -x[0])
    if scored and scored[0][0] >= cutoff:
        return scored[0][1]
    return None
