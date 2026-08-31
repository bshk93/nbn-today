#!/usr/bin/env python3
"""Seed `schedule-{season}.json` in NBS_DATA_DIR from the real NBA schedule.

NBN follows the NBA's schedule exactly, so the league's fixture list is the
NBA's — but only as a *starting point*. Two things the NBA does, NBN does not:
it leaves two games per team unassigned until its in-season cup's group play
resolves, and it plays a knockout round NBN has no equivalent of. So this script
seeds and then gets out of the way. Every change after the seed goes through
`PUT/POST/PATCH/DELETE /api/schedule` (nbn-api/routers/schedule.py).

**It refuses to overwrite an existing schedule file.** That is the point, not a
safety rail bolted on: a second run would silently discard whatever the league
had reassigned the cup slots to, and there is no other copy of that decision.
`--force` exists for re-seeding a season nobody has touched yet, and prints what
it is about to destroy first.

Source is Basketball-Reference's month pages. nba.com, data.nba.com and
stats.nba.com all sit behind an Akamai edge that 403s this box, so they are not
an option; BBRef publishes the same schedule in a stable table and is polite to
scrape at one request every few seconds, which is what this does.

Usage:
    build/load_nba_schedule.py                       # dry run, current season
    build/load_nba_schedule.py --apply
    build/load_nba_schedule.py --season 25-26 --apply
    build/load_nba_schedule.py --csv scraped.csv --apply   # skip the fetch

The CSV form takes the columns this script's own --dump writes
(date,time_et,away,home,arena,notes,game_id), so a scrape can be eyeballed
before it is loaded.
"""

import argparse
import collections
import csv
import json
import os
import re
import secrets
import sys
import time
import urllib.request
from datetime import datetime
from html import unescape
from pathlib import Path

# The season clock lives in nbn-api and is deliberately the *only* answer to
# "what season is it?" (nbn-api/season_clock.py) — three independent copies of
# the July-1 rule is exactly the bug it was written to end. Resolved the same
# way build/check_rulebook_badges.py reaches that repo.
REPO = Path(__file__).resolve().parents[1]
NBN_API = Path(os.environ.get("NBN_API_DIR", REPO.parent / "nbn-api"))

DATA_DIR = Path(os.environ.get("NBS_DATA_DIR", "/var/lib/nothing-but-stats"))
MONTHS = ["october", "november", "december", "january", "february", "march",
          "april", "may", "june"]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
FETCH_DELAY = 4.0          # BBRef asks for <= 20 requests/minute

# Basketball-Reference spells three franchises differently to everyone else.
ABBR_FIX = {"BRK": "BKN", "CHO": "CHA", "PHO": "PHX"}
VALID_TEAMS = {
    "ATL", "BKN", "BOS", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
    "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
    "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
}
TAG = re.compile(r"<[^>]+>")
TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})([ap])$")
FIELDS = ["date", "time_et", "away", "home", "arena", "notes", "game_id"]


def time_key(t: str) -> tuple:
    """Sort key for a "7:00p" tip-off, matching `_time_key` in
    nbn-api/routers/schedule.py so the seed is already in the order the API
    maintains from its first write. Unset times sort last within a date."""
    m = TIME_RE.match(t or "")
    if not m:
        return (99, 99)
    hh, mm, ap = int(m.group(1)), int(m.group(2)), m.group(3)
    if hh == 12:
        hh = 0
    if ap == "p":
        hh += 12
    return (hh, mm)


def bbref_year(season: str) -> int:
    """'26-27' -> 2027, the year Basketball-Reference files that season under."""
    return 2000 + int(season.split("-")[1])


def fetch_month(year: int, month: str) -> str | None:
    url = f"https://www.basketball-reference.com/leagues/NBA_{year}_games-{month}.html"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None        # that month simply has no games
        raise


def parse_month(html: str) -> list[dict]:
    """Rows out of one month page. `csk` carries the machine-readable values —
    the visible cell text is display-formatted and the team cells are full
    names, so the abbreviations only exist in that attribute."""
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        if 'data-stat="date_game"' not in row:
            continue
        cells, csks = {}, {}
        for seg, inner in re.findall(r"(<t[hd][^>]*>)(.*?)</t[hd]>", row, re.S):
            ds = re.search(r'data-stat="([a-z_]+)"', seg)
            if not ds:
                continue
            cells[ds.group(1)] = unescape(TAG.sub("", inner)).strip()
            ck = re.search(r'csk="([^"]*)"', seg)
            if ck:
                csks[ds.group(1)] = ck.group(1)
        if cells.get("date_game") in (None, "", "Date"):     # the header row
            continue
        away = csks.get("visitor_team_name", "").split(".")[0]
        home = csks.get("home_team_name", "").split(".")[0]
        out.append({
            "date": datetime.strptime(cells["date_game"], "%a, %b %d, %Y").date().isoformat(),
            "time_et": cells.get("game_start_time", ""),
            "away": ABBR_FIX.get(away, away),
            "home": ABBR_FIX.get(home, home),
            "arena": cells.get("arena_name", ""),
            "notes": cells.get("game_remarks", ""),
            "game_id": csks.get("date_game", ""),
        })
    return out


def scrape(season: str) -> list[dict]:
    year = bbref_year(season)
    rows = []
    for i, month in enumerate(MONTHS):
        if i:
            time.sleep(FETCH_DELAY)
        html = fetch_month(year, month)
        if html is None:
            print(f"  {month:<10} — no page")
            continue
        got = parse_month(html)
        print(f"  {month:<10} {len(got):>4} games")
        rows.extend(got)
    return rows


def read_csv_rows(path: Path) -> list[dict]:
    with path.open() as fh:
        return [{k: (r.get(k) or "") for k in FIELDS} for r in csv.DictReader(fh)]


def verify(rows: list[dict]) -> list[str]:
    """Everything that would make the file untrustworthy. Returns hard errors;
    the counts that are merely *interesting* are printed by the caller, because
    a partial or in-progress season is legitimate and must not fail the load."""
    errors = []
    for r in rows:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", r["date"]):
            errors.append(f"bad date: {r}")
        for side in ("home", "away"):
            if r[side] not in VALID_TEAMS:
                errors.append(f"unknown {side} team {r[side]!r} on {r['date']}")
        if r["home"] == r["away"]:
            errors.append(f"{r['home']} plays itself on {r['date']}")
    booked = collections.Counter((r["date"], t) for r in rows for t in (r["home"], r["away"]))
    for (date, team), n in booked.items():
        if n > 1:
            errors.append(f"{team} is booked {n}x on {date}")
    return errors


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--season", help="e.g. 26-27 (default: the current league year)")
    ap.add_argument("--csv", type=Path, help="load these rows instead of scraping")
    ap.add_argument("--dump", type=Path, help="write the scraped rows to this CSV as well")
    ap.add_argument("--apply", action="store_true", help="write the file (default is a dry run)")
    ap.add_argument("--force", action="store_true", help="overwrite an existing schedule file")
    args = ap.parse_args()

    season = args.season
    if not season:
        sys.path.insert(0, str(NBN_API))
        try:
            import season_clock                                # noqa: E402
        except ImportError:
            sys.exit(f"Cannot import season_clock from {NBN_API} — pass --season, "
                     f"or set NBN_API_DIR.")
        season = season_clock.current_season()
    if not re.match(r"^\d{2}-\d{2}$", season):
        sys.exit(f"--season must look like '26-27', got {season!r}")

    out_file = DATA_DIR / f"schedule-{season}.json"

    if args.csv:
        print(f"Reading {args.csv}")
        rows = read_csv_rows(args.csv)
    else:
        print(f"Scraping Basketball-Reference for NBA_{bbref_year(season)} "
              f"({len(MONTHS)} pages, {FETCH_DELAY:g}s apart)")
        rows = scrape(season)

    if not rows:
        sys.exit("No games parsed — refusing to write an empty schedule.")

    errors = verify(rows)
    if errors:
        print(f"\n{len(errors)} problem(s):", file=sys.stderr)
        for e in errors[:20]:
            print(f"  {e}", file=sys.stderr)
        sys.exit(1)

    rows.sort(key=lambda r: (r["date"], time_key(r["time_et"]), r["home"]))
    per_team = collections.Counter(t for r in rows for t in (r["home"], r["away"]))
    home = collections.Counter(r["home"] for r in rows)
    print(f"\n{len(rows)} games, {len(per_team)} teams, "
          f"{rows[0]['date']} -> {rows[-1]['date']}")
    print(f"  per team: {min(per_team.values())}-{max(per_team.values())} games, "
          f"{min(home.values())}-{max(home.values())} at home")
    tagged = collections.Counter(r["notes"] for r in rows if r["notes"])
    for note, n in tagged.most_common():
        print(f"  {n:>4} tagged {note!r}")
    if len(per_team) != 30:
        print(f"  WARNING: {len(per_team)} teams, expected 30")

    if args.dump:
        with args.dump.open("w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDS)
            w.writeheader()
            w.writerows(rows)
        print(f"  wrote {args.dump}")

    games = [{
        "id": secrets.token_hex(8),
        "date": r["date"],
        "time_et": r["time_et"],
        "away_team": r["away"],
        "home_team": r["home"],
        "arena": r["arena"],
        "note": r["notes"],
        # The Basketball-Reference key for this game, kept so a row can be
        # traced back to what was scraped. It spells Brooklyn/Charlotte/Phoenix
        # BRK/CHO/PHO, unlike home_team/away_team beside it — deliberately, it
        # is their key and not ours. Nothing should parse teams out of it.
        "source_id": r["game_id"],
    } for r in rows]

    payload = {
        "season": season,
        "source": f"basketball-reference.com NBA_{bbref_year(season)} "
                  f"(loaded {datetime.now().date().isoformat()})",
        "games": games,
    }

    if out_file.exists():
        existing = json.loads(out_file.read_text())
        n = len(existing.get("games", []))
        hand_added = sum(1 for g in existing.get("games", []) if not g.get("source_id"))
        print(f"\n{out_file} already exists — {n} games, {hand_added} of them hand-added.")
        if not args.force:
            sys.exit("Refusing to overwrite. The league's own edits live only in this file;\n"
                     "re-run with --force if you are certain none of them matter.")
        print("--force given — overwriting, and those edits are gone.")

    if not args.apply:
        print(f"\nDry run. Re-run with --apply to write {out_file}")
        return

    out_file.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"\nWrote {out_file} ({len(games)} games)")


if __name__ == "__main__":
    main()
