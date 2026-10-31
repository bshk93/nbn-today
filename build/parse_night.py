#!/usr/bin/env python3
"""Batch the box score parse: fetch a night's screenshots, then validate,
resolve and commit every transcribed game in one run.

The model's only job is still to transcribe (see .claude/commands/parse-boxscores.md).
Everything else lives here so a whole stream night takes a handful of tool
calls instead of five per game.

    python3 build/parse_night.py fetch <dir>             # download every ready game
    python3 build/parse_night.py run <dir> [--commit]    # check every <dir>/<id>.txt

`run` without --commit is a dry run. With it, a game is committed only when
the validator passes and every name resolves to exactly one player on that
team's roster; anything else is held and reported, and a re-run skips the
games already committed (they have left the pending queue).

Transcription format, one file per game, <dir>/<id>.txt:

    #columns=MIN,PTS,REB,AST,STL,BLK,TO,FG,3PT,FT,OR,FLS
    #home_pts=105            (only if the final score is on screen)
    #away_pts=93
    HOME
    K. Irving|41 36 3 3 0 1 0 14-29 4-13 4-5 0 2
    TOTAL|240 105 36 28 6 5 4 43-84 13-32 6-8 6 7     (only if printed)
    AWAY
    ...

Values are in the order of #columns, as read off the screen. The header is
mapped label by label, so a moved column lands in the right field and the
validator's header check still stops the commit.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from validate_boxscore import normalize_column  # noqa: E402

# Canonical header column -> the row fields its cell fills.
COL_FIELDS = {
    "MIN": ["min"], "PTS": ["pts"], "REB": ["reb"], "AST": ["ast"],
    "STL": ["stl"], "BLK": ["blk"], "TO": ["tov"], "FG": ["fgm", "fga"],
    "3PT": ["tpm", "tpa"], "FT": ["ftm", "fta"], "OREB": ["oreb"], "PF": ["pf"],
}
COMMIT_KEYS = ["player", "slug", "min", "pts", "reb", "oreb", "dreb", "ast", "stl",
               "blk", "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta"]
SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}
DATA_DIR = Path(os.environ.get("NBS_DATA_DIR", "/var/lib/nothing-but-stats"))


def token():
    t = os.environ.get("NBN_ADMIN_TOKEN") or os.environ.get("NBN_TOKEN")
    if not t:
        sys.exit("no token: set NBN_ADMIN_TOKEN or NBN_TOKEN")
    return t


def api_base():
    if os.environ.get("NBN_API"):
        return os.environ["NBN_API"].rstrip("/")
    try:
        urllib.request.urlopen("http://localhost:8001/api/build/status", timeout=3)
        return "http://localhost:8001"
    except OSError:
        return "https://nbn.today"


def call(api, path, method="GET", body=None, raw=False):
    req = urllib.request.Request(
        api + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if raw else json.loads(data)


def pending(api):
    p = call(api, "/api/boxscore/pending")
    return p if isinstance(p, list) else p.get("items", [])


# --- fetch -----------------------------------------------------------------

def cmd_fetch(d: Path):
    api = api_base()
    d.mkdir(parents=True, exist_ok=True)
    items = pending(api)
    ready = [i for i in items if i.get("ready")]
    for i in items:
        if not i.get("ready"):
            missing = [s for s in ("away", "home") if not i["images"].get(s)]
            team = i[f"{missing[0]}_team"] if missing else "?"
            print(f"waiting  {i['id']} · {i['date']} · {i['away_team']} @ {i['home_team']} · no {team} side yet")
    for i in ready:
        gd = d / i["id"]
        gd.mkdir(exist_ok=True)
        paths = []
        for side in ("home", "away"):
            for img in i["images"][side]:
                out = gd / f"{side}-{img['file']}" if not img["file"].startswith(side) else gd / img["file"]
                out.write_bytes(call(api, f"/api/boxscore/screenshots/{i['id']}/{img['file']}", raw=True))
                paths.append(f"{side}={out}")
        print(f"ready    {i['id']} · {i['date']} · {i['away_team']} @ {i['home_team']} · "
              f"{i['season']} {i['game_type']} · " + " ".join(paths))
    if not ready:
        print("no ready games")


# --- run -------------------------------------------------------------------

def parse_compact(text: str, item: dict) -> dict:
    out = {"home_team": item["home_team"], "away_team": item["away_team"]}
    fields, side = None, None
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln:
            continue
        if ln.startswith("#"):
            k, v = ln[1:].split("=", 1)
            if k == "columns":
                out["columns"] = [c.strip() for c in v.split(",")]
                fields = []
                for c in out["columns"]:
                    n = normalize_column(c)
                    fields.append(COL_FIELDS.get(n) if n else None)
            elif k in ("home_pts", "away_pts"):
                out[k] = int(v)
            continue
        if ln in ("HOME", "AWAY"):
            side = ln.lower()
            out[f"{side}_rows"] = []
            continue
        if fields is None or side is None:
            raise ValueError(f"row before #columns or HOME/AWAY: {ln!r}")
        name, nums = ln.split("|", 1)
        cells = nums.split()
        if len(cells) != len(fields):
            raise ValueError(f"{name.strip()}: {len(cells)} cells, header has {len(fields)}")
        row = {}
        for cell, f in zip(cells, fields):
            if f is None:          # unrecognized column: the validator reports the header
                continue
            vals = cell.split("-") if len(f) == 2 else [cell]
            row.update(zip(f, map(int, vals)))
        if name.strip().upper() == "TOTAL":
            row.pop("min", None)
            out[f"{side}_totals"] = row
        else:
            out[f"{side}_rows"].append({"player": name.strip(), **row})
    return out


def norm_words(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return [w for w in re.sub(r"[^a-z ]", " ", s.replace("'", "")).split() if w not in SUFFIXES]


def roster(team, cache={}):
    if team not in cache:
        f = DATA_DIR / f"{team.lower()}-roster.csv"
        if f.exists():
            text = f.read_text()
        else:
            text = urllib.request.urlopen(f"https://nbn.today/data/{team.lower()}-roster.csv").read().decode()
        cache[team] = {r["SLUG"] for r in csv.DictReader(io.StringIO(text))}
    return cache[team]


def resolve(rows, team, bios):
    """Fill each row's slug; return problem strings (empty = all certain)."""
    problems, on = [], roster(team)
    for r in rows:
        first, _, last = r["player"].partition(" ")
        if not last:
            first, last = "", first
        initial, lastw = norm_words(first)[:1], norm_words(last)
        cands = []
        for slug, b in bios.items():
            L, _, F = b.get("name", "").partition(",")
            if norm_words(L) == lastw and (not initial or "".join(norm_words(F)).startswith(initial[0][0])):
                cands.append(slug)
        mine = [s for s in cands if s in on]
        if len(mine) == 1:
            r["slug"] = mine[0]
        else:
            r["slug"] = None
            why = f"{len(mine)} on the {team} roster" if mine else "none on the roster"
            problems.append(f"{team} {r['player']}: {why}, candidates {cands or 'none'}")
    return problems


def cmd_run(d: Path, commit: bool):
    api = api_base()
    items = {i["id"]: i for i in pending(api) if i.get("ready")}
    files = sorted(d.glob("*.txt"))
    if not files:
        sys.exit(f"no transcriptions in {d}")
    bios = call(api, "/api/players")
    held = 0
    for f in files:
        gid = f.stem
        item = items.get(gid)
        if not item:
            print(f"== {gid}: not pending (already committed?) — skipped")
            continue
        label = f"{item['away_team']} @ {item['home_team']}"
        try:
            data = parse_compact(f.read_text(), item)
        except ValueError as e:
            print(f"== {gid} {label}: HELD — {e}")
            held += 1
            continue
        jp = d / f"{gid}.json"
        jp.write_text(json.dumps(data))
        v = subprocess.run([sys.executable, str(HERE / "validate_boxscore.py"), str(jp)],
                           capture_output=True, text=True)
        notes = [ln.strip() for ln in v.stdout.splitlines() if ln.strip().startswith(("[!]", "[--]"))]
        checked = json.loads((d / f"{gid}.checked.json").read_text())
        slug_problems = (resolve(checked["home_rows"], item["home_team"], bios)
                         + resolve(checked["away_rows"], item["away_team"], bios))
        hp = checked.get("home_pts") or sum(r["pts"] for r in checked["home_rows"])
        ap = checked.get("away_pts") or sum(r["pts"] for r in checked["away_rows"])
        ok = v.returncode == 0 and not slug_problems
        head = f"== {gid} {label}: {item['away_team']} {ap}, {item['home_team']} {hp}"
        if not ok:
            held += 1
            print(f"{head} — HELD")
            for n in notes + slug_problems:
                print("   " + n)
            continue
        if not commit:
            print(f"{head} — clean (dry run)" + "".join(f"\n   {n}" for n in notes))
            continue
        payload = {k: item.get(k) for k in ("date", "season", "game_type", "game_num", "round_num")}
        payload.update(home_team=item["home_team"], away_team=item["away_team"],
                       home_pts=hp, away_pts=ap,
                       home_rows=[{k: r[k] for k in COMMIT_KEYS} for r in checked["home_rows"]],
                       away_rows=[{k: r[k] for k in COMMIT_KEYS} for r in checked["away_rows"]])
        try:
            res = call(api, "/api/boxscore/commit", "POST", payload)
            print(f"{head} — committed {res.get('rows_added')} rows" + "".join(f"\n   {n}" for n in notes))
            for p in (f, jp, d / f"{gid}.checked.json"):
                p.unlink(missing_ok=True)
            shutil.rmtree(d / gid, ignore_errors=True)
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:1500]
            if e.code == 409 and "already committed" in body:
                call(api, f"/api/boxscore/pending/{gid}", "DELETE")
                print(f"{head} — already in the file; removed from the queue")
            else:
                held += 1
                print(f"{head} — HELD, commit returned {e.code}: {body}")
    print(f"\n{held} game(s) held" if held else "\nall games clean")
    return 1 if held else 0


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("fetch", "run"):
        print(__doc__)
        return 2
    d = Path(sys.argv[2])
    if sys.argv[1] == "fetch":
        cmd_fetch(d)
        return 0
    return cmd_run(d, "--commit" in sys.argv[3:])


if __name__ == "__main__":
    sys.exit(main())
