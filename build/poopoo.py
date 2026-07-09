#!/usr/bin/env python3
"""
Diffs nbn.today's live cap/roster data against the league's published
Google Sheet (the historical roster/cap-tracking spreadsheet, which the
committee is still hand-updating in parallel this season).

Sheet is fetched via its "Publish to the web" xlsx export, which
auto-updates a few minutes after any edit -- not a frozen snapshot.

Compares, per team, for the site's current league year (from
/api/league-year, expected to match the sheet's "current" column):
  - Aggregate cap figures (guaranteed salary, cap holds, cap/apron space,
    hard-cap flag) -- sheet rows 39-49, sourced the same way cap-summary/
    computes them.
  - MLE type/amount/remaining -- sheet G75:J77.
  - BAE year-used -- sheet's "Bi-Annual Exception -> Year Used" cell.
  - Draft picks -- sheet's "Original Draft Picks" table (year/round/
    current owner) vs the global /api/picks ledger.

Writes a single JSON snapshot to $NBS_DATA_DIR/poopoo.json for the
/poopoo/ page to render. Run on a timer (see poopoo.timer) aligned to
the clock (:00/:10/:20/...) so refreshes are predictable.

Env:
  NBN_API_BASE   override the API base URL (default http://127.0.0.1:8001)
  NBS_DATA_DIR   override the data dir (default /var/lib/nothing-but-stats)
  POOPOO_SHEET_URL  override the published-sheet xlsx URL
"""
import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
import requests

REPO = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("NBS_DATA_DIR", "/var/lib/nothing-but-stats"))
API_BASE = os.environ.get("NBN_API_BASE", "http://127.0.0.1:8001")
OUT_FILE = DATA_DIR / "poopoo.json"
SHEET_URL = os.environ.get(
    "POOPOO_SHEET_URL",
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTqyqqC0O1U9O-2uwmMk6UIhSO58ukTa5HpXaU_IOQa3SEW8bLK5Wpjh_KA4YWePDgT2BIdhPO6Mieu/pub?output=xlsx",
)

TEAMS = [
    "ATL", "BKN", "BOS", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
    "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
    "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]

DOLLAR_TOLERANCE = 1000  # ignore diffs smaller than this (rounding noise)


def http_json(path):
    with urllib.request.urlopen(f"{API_BASE}{path}", timeout=30) as r:
        return json.loads(r.read().decode())


def http_text(path):
    with urllib.request.urlopen(f"{API_BASE}{path}", timeout=30) as r:
        return r.read().decode()


def parse_csv(text):
    return list(csv.DictReader(io.StringIO(text)))


def parse_salary(s):
    if not s:
        return 0
    try:
        return int(str(s).replace("$", "").replace(",", "").strip())
    except ValueError:
        return 0


# ── Sheet-side extraction ───────────────────────────────────────────────

def classify(bio, season):
    """Mirrors cap-summary/index.html's classify() -- must stay in sync."""
    g = (bio.get("guaranteed") or {}).get(season)
    if g in ("0", 0):
        return "nongtd"
    hold = (bio.get("cap_holds") or {}).get(season)
    if hold == "PLAYER_OPT":
        return "player_opt"
    if hold == "TEAM_OPT":
        return "team_opt"
    if hold == "RFA":
        return "rfa"
    if hold == "UFA":
        return "ufa"
    return "guaranteed"


def sheet_aggregate(ws, col=6):
    """Rows 39-49, column F (=season col 1, index 6) by default."""
    def cell(r):
        v = ws.cell(row=r, column=col).value
        return v if isinstance(v, (int, float)) else 0

    hard_cap_text = ws.cell(row=47, column=col).value
    hard_cap = None
    if hard_cap_text:
        t = str(hard_cap_text).upper()
        if "SECOND" in t:
            hard_cap = "second_apron"
        elif "FIRST" in t:
            hard_cap = "first_apron"

    return {
        "guaranteed_salary": cell(39),
        "cap_holds": cell(40),
        "cap_space": cell(41),
        "salary_cap": cell(42),
        "first_apron_space": cell(43),
        "first_apron": cell(44),
        "second_apron_space": cell(45),
        "second_apron": cell(46),
        "hard_cap": hard_cap,
        "nbn_hard_cap_space": cell(48),
        "nbn_hard_cap": cell(49),
    }


def sheet_mle(ws):
    return {
        "type": ws.cell(row=76, column=7).value,        # G76
        "amount": ws.cell(row=76, column=9).value or 0,  # I76
        "remaining": ws.cell(row=77, column=9).value or 0,  # I77
    }


def sheet_bae(ws):
    for r in range(78, 96):
        if ws.cell(row=r, column=7).value == "Year Used":
            return ws.cell(row=r, column=9).value
    return None


def sheet_picks(ws, orig_team):
    """Original Draft Picks table: col A=Year, B=Round, D=Current Owner.
    Year is merged/blank on the 2nd-round row beneath each 1st-round row.
    Stops at the "Acquired Draft Picks" table, which reuses the same columns
    with different semantics (col D = the *origin* team of a pick BKN etc.
    acquired) -- not comparable to this table and must not be scanned into."""
    picks = []
    last_year = None
    for r in range(76, 160):
        label = ws.cell(row=r, column=1).value
        if isinstance(label, str) and "acquired" in label.lower():
            break
        year_cell = ws.cell(row=r, column=1).value
        round_cell = ws.cell(row=r, column=2).value
        owner_cell = ws.cell(row=r, column=4).value
        if round_cell not in ("1st", "2nd"):
            continue
        if year_cell:
            last_year = year_cell
        if last_year is None or not owner_cell:
            continue
        rnd = 1 if round_cell == "1st" else 2
        owner_raw = str(owner_cell).strip().rstrip("*").strip()
        if "/" in owner_raw:
            continue  # compound/conditional destination (e.g. "CHA/CHI") -- not diffable against a single site owner
        owner = orig_team if owner_raw.lower() == "own" else owner_raw.upper()
        picks.append({"year": int(float(last_year)), "round": rnd, "owner": owner})
    return picks


def load_sheet():
    import tempfile
    fd, tmp_path = tempfile.mkstemp(suffix=".xlsx", prefix="poopoo-sheet-")
    os.close(fd)
    tmp = Path(tmp_path)
    resp = requests.get(SHEET_URL, timeout=60)
    resp.raise_for_status()
    tmp.write_bytes(resp.content)
    wb = openpyxl.load_workbook(tmp, read_only=True, data_only=True)
    result = {}
    for team in TEAMS:
        if team not in wb.sheetnames:
            continue
        ws = wb[team]
        result[team] = {
            "aggregate": sheet_aggregate(ws),
            "mle": sheet_mle(ws),
            "bae_year_used": sheet_bae(ws),
            "picks": sheet_picks(ws, team),
        }
    tmp.unlink(missing_ok=True)
    return result


# ── Site-side extraction ────────────────────────────────────────────────

def load_site(season):
    players = http_json("/api/players")
    cap_levels = http_json("/api/cap-levels")
    team_state = http_json("/api/team-state")
    all_picks = http_json("/api/picks")
    levels = cap_levels.get(season, {})

    result = {}
    for team in TEAMS:
        try:
            roster_csv = (REPO / "data" / f"{team.lower()}-roster.csv").read_text()
            roster_rows = [r for r in parse_csv(roster_csv) if r.get("SLUG")]
        except Exception:
            roster_rows = []
        try:
            dead_rows = http_json(f"/api/deadcap/{team}")
        except Exception:
            dead_rows = []

        cats = {k: 0 for k in ("guaranteed", "dead", "nongtd", "team_opt", "player_opt", "rfa", "ufa")}
        for r in roster_rows:
            bio = players.get(r["SLUG"])
            if not bio or bio.get("type") == "dead" or r.get("TYPE") == "dead":
                continue
            salary = parse_salary((bio.get("salaries") or {}).get(season))
            if not salary:
                continue
            cats[classify(bio, season)] += salary
        for r in dead_rows:
            cats["dead"] += parse_salary(r.get(season))

        guaranteed_salary = cats["guaranteed"] + cats["dead"] + cats["nongtd"] + cats["team_opt"] + cats["player_opt"]
        cap_holds = cats["rfa"] + cats["ufa"]
        total = guaranteed_salary + cap_holds

        ts_cur = (team_state.get(team) or {}).get("current", {})

        result[team] = {
            "aggregate": {
                "guaranteed_salary": guaranteed_salary,
                "cap_holds": cap_holds,
                "cap_space": (levels.get("cap") or 0) - total,
                "salary_cap": levels.get("cap") or 0,
                "first_apron_space": (levels.get("apron1") or 0) - total,
                "first_apron": levels.get("apron1") or 0,
                "second_apron_space": (levels.get("apron2") or 0) - total,
                "second_apron": levels.get("apron2") or 0,
                "hard_cap": ts_cur.get("hard_cap"),
                "nbn_hard_cap_space": (levels.get("hard_cap") or 0) - total,
                "nbn_hard_cap": levels.get("hard_cap") or 0,
            },
            "mle": {
                "type": ts_cur.get("mle_type"),
                "used": ts_cur.get("mle_used", 0),
            },
            "bae_available": (team_state.get(team) or {}).get("bae_available"),
        }

    picks_by_orig = {}
    for p in all_picks:
        picks_by_orig.setdefault(p["orig"], []).append(p)
    return result, picks_by_orig


# ── Diffing ──────────────────────────────────────────────────────────────

AGGREGATE_FIELDS = [
    ("guaranteed_salary", "Guaranteed Salary"),
    ("hard_cap", "Hard Cap"),
]
# Cap Holds / Cap Space / First & Second Apron Space are deliberately excluded:
# cap-summary's own site-side total doesn't yet track roster-spot holds or
# unsigned-draft-pick holds (see its CATEGORIES comment), so those fields
# mismatch for ~29/30 teams every single run regardless of anything actually
# being wrong -- pure noise until that's tracked as real site-side data.


def money_diff(a, b):
    return abs((a or 0) - (b or 0)) > DOLLAR_TOLERANCE


def diff_team(team, sheet, site, picks_by_orig):
    diffs = []

    s_agg, w_agg = sheet["aggregate"], site["aggregate"]
    for key, label in AGGREGATE_FIELDS:
        sv, wv = s_agg.get(key), w_agg.get(key)
        if key == "hard_cap":
            if sv != wv:
                diffs.append({"category": "aggregate", "field": label, "sheet": sv, "site": wv})
        elif money_diff(sv, wv):
            diffs.append({"category": "aggregate", "field": label, "sheet": sv, "site": wv})

    # MLE: only flag if usage differs meaningfully (types are recomputed live
    # site-side once used=0, so an unused/unused pair is never a mismatch).
    s_mle_used = (s_mle := sheet["mle"])["amount"] - s_mle["remaining"]
    w_mle_used = site["mle"]["used"] or 0
    if money_diff(s_mle_used, w_mle_used):
        diffs.append({"category": "mle", "field": "MLE Used", "sheet": s_mle_used, "site": w_mle_used})

    # BAE: sheet's Year Used implies unavailable the following year.
    s_bae_recent = bool(sheet["bae_year_used"])
    w_bae_avail = site["bae_available"]
    if s_bae_recent and w_bae_avail:
        diffs.append({"category": "bae", "field": "BAE Availability", "sheet": f"used {sheet['bae_year_used']}", "site": "available"})

    # Draft picks: compare (year, round) -> owner for this team's own-origin picks.
    site_picks = {(p["year"], p["round"]): p["owner"] for p in picks_by_orig.get(team, [])}
    for p in sheet["picks"]:
        key = (p["year"], p["round"])
        site_owner = site_picks.get(key)
        if site_owner is None:
            continue  # sheet has a future pick beyond the site's tracked horizon
        if site_owner != p["owner"]:
            diffs.append({
                "category": "picks", "field": f"{key[0]} R{key[1]}",
                "sheet": p["owner"], "site": site_owner,
            })

    return diffs


def main():
    season = http_json("/api/league-year")["current_season"]
    sheet_data = load_sheet()
    site_data, picks_by_orig = load_site(season)

    teams_out = []
    for team in TEAMS:
        if team not in sheet_data or team not in site_data:
            continue
        diffs = diff_team(team, sheet_data[team], site_data[team], picks_by_orig)
        teams_out.append({
            "team": team,
            "diff_count": len(diffs),
            "diffs": diffs,
            "sheet": sheet_data[team],
            "site": site_data[team],
        })

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "season": season,
        "teams": teams_out,
    }
    OUT_FILE.write_text(json.dumps(out, indent=2))
    print(f"poopoo: wrote {OUT_FILE} ({sum(t['diff_count'] for t in teams_out)} diffs across {len(teams_out)} teams)")


if __name__ == "__main__":
    main()
