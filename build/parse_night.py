#!/usr/bin/env python3
"""Batch the box score parse: fetch a night's screenshots, then validate,
resolve and commit every transcribed game in one run.

The model's only job is still to transcribe (see .claude/commands/parse-boxscores.md).
Everything else lives here so a whole stream night takes a handful of tool
calls instead of five per game.

    python3 build/parse_night.py fetch <dir>             # download every ready game
    python3 build/parse_night.py compare <dir>           # two reads -> <dir>/<id>.txt
    python3 build/parse_night.py crop <dir> <id>          # enlarged table crops for a re-read
    python3 build/parse_night.py reread <dir> <id> <home|away> <COL> <file>   # settle one column
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

`compare` is the double read. Two readers transcribe each game independently
into <dir>/a/<id>.txt and <dir>/b/<id>.txt; a game whose two reads agree on
every cell is written to <dir>/<id>.txt, and one that doesn't is listed cell
by cell and left out until a third look settles those cells. The validator's
totals check only covers a side whose totals row is on screen; two readers
rarely make the same slip, so this covers the rest.

`reread` settles one column of one side from a fresh reader's look at it (the
fresh reader is never shown the old values; a reader asked to re-check its
own transcript repeats it, as on 2026-11-12). The fresh values go in only
when the screen proves them:

- the side has a printed TOTAL: the fresh column must sum to it, and the fresh
  reader must read the same TOTAL;
- no TOTAL, and two reads split on a cell: the fresh value must equal one of
  them, and every cell the two reads agree on must read the same again.

Anything else changes nothing and exits 1, for the user to decide. With
<dir>/a/<id>.txt and <dir>/b/<id>.txt and no <dir>/<id>.txt yet, it writes the
settled column into both reads, so `compare` passes the game only once every
disagreement is settled; otherwise it edits <dir>/<id>.txt.

The values file is one line per player, `Name|value`, plus `TOTAL|value` if a
totals row is printed. Shooting columns stay `made-att`.
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
        if not mine and initial:
            # 2K sometimes prints a surname-first name in Western order:
            # bio "YANG, HANSEN" shows as "Y. Hansen". Roster players only.
            for slug in on:
                L, _, F = bios.get(slug, {}).get("name", "").partition(",")
                if norm_words(F) == lastw and "".join(norm_words(L)).startswith(initial[0][0]):
                    mine.append(slug)
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


def _read_cells(text: str) -> dict:
    """One read as {cell key: value}, each a string so the two reads compare
    exactly. Rows are keyed by name, not position: a reader who skips a player
    shifts every row below him, and that is one disagreement, not twenty."""
    data = parse_compact(text, {"home_team": "HOME", "away_team": "AWAY"})
    cells = {"header": ",".join(data.get("columns", []))}
    for k in ("home_pts", "away_pts"):
        cells[k] = str(data.get(k, "-"))
    for side in ("home", "away"):
        cells[f"{side} TOTAL"] = json.dumps(data.get(f"{side}_totals"), sort_keys=True)
        for r in data.get(f"{side}_rows", []):
            name = r.pop("player")
            key = f"{side} {''.join(norm_words(name)) or name}"
            if key in cells:
                key += " (again)"
            cells[key] = name + " | " + " ".join(f"{k}={r[k]}" for k in sorted(r))
    return cells


def compare_reads(a: str, b: str) -> list[str]:
    """Every cell where two reads of one game differ; empty when they agree."""
    try:
        ca, cb = _read_cells(a), _read_cells(b)
    except ValueError as e:
        return [f"unreadable transcription: {e}"]
    out = []
    for k in sorted(set(ca) | set(cb)):
        va, vb = ca.get(k, "(missing)"), cb.get(k, "(missing)")
        if va == vb:
            continue
        if " | " in va and " | " in vb:
            fa = dict(x.split("=") for x in va.split(" | ")[1].split())
            fb = dict(x.split("=") for x in vb.split(" | ")[1].split())
            diffs = [f"{f} a={fa.get(f)} b={fb.get(f)}" for f in sorted(set(fa) | set(fb)) if fa.get(f) != fb.get(f)]
            out.append(f"{va.split(' | ')[0]} ({k.split()[0]}): " + ", ".join(diffs))
        else:
            out.append(f"{k}: a={va} b={vb}")
    return out


def cmd_compare(d: Path) -> int:
    ids = sorted({f.stem for f in (d / "a").glob("*.txt")} | {f.stem for f in (d / "b").glob("*.txt")})
    if not ids:
        sys.exit(f"no reads in {d}/a or {d}/b")
    split = 0
    for gid in ids:
        fa, fb = d / "a" / f"{gid}.txt", d / "b" / f"{gid}.txt"
        if not (fa.exists() and fb.exists()):
            print(f"== {gid}: only one read ({'a' if fa.exists() else 'b'}) — not written")
            split += 1
            continue
        diffs = compare_reads(fa.read_text(), fb.read_text())
        if diffs:
            split += 1
            print(f"== {gid}: {len(diffs)} disagreement(s) — not written")
            for x in diffs:
                print("   " + x)
        else:
            shutil.copyfile(fa, d / f"{gid}.txt")
            print(f"== {gid}: reads agree — written")
    print(f"\n{split} game(s) need a third look" if split else "\nall reads agree")
    return 1 if split else 0


# ── Fresh re-read of one column ─────────────────────────────────────────────

def _side_lines(text: str, side: str):
    """(lines, column index by canonical label, [(line no, name)], total line no)."""
    lines = text.splitlines()
    cols, rows, total, cur = {}, [], None, None
    for i, ln in enumerate(lines):
        t = ln.strip()
        if t.startswith("#columns="):
            for j, c in enumerate(t.split("=", 1)[1].split(",")):
                n = normalize_column(c.strip())
                if n:
                    cols[n] = j
        elif t in ("HOME", "AWAY"):
            cur = t.lower()
        elif "|" in t and cur == side:
            name = t.split("|", 1)[0].strip()
            if name.upper() == "TOTAL":
                total = i
            else:
                rows.append((i, name))
    return lines, cols, rows, total


def _cell(lines, i, j):
    return lines[i].split("|", 1)[1].split()[j]


def _set_cell(lines, i, j, v):
    name, nums = lines[i].split("|", 1)
    cells = nums.split()
    cells[j] = v
    lines[i] = name + "|" + " ".join(cells)


def _parts(v: str):
    return [int(x) for x in v.split("-")]


def _key(name):
    return "".join(norm_words(name)) or name.strip().lower()


def read_values(text: str) -> dict:
    out = {}
    for ln in text.splitlines():
        if "|" in ln:
            name, v = ln.split("|", 1)
            out["TOTAL" if name.strip().upper() == "TOTAL" else _key(name)] = v.strip()
    return out


def settle_column(reads: list[str], side: str, col: str, fresh: dict):
    """Settle one column against a fresh read. `reads` is one transcript, or
    the two reads of a split game. Returns (new texts or None, report lines)."""
    col = normalize_column(col) or col
    if col in ("MIN",):
        return None, ["MIN has no printed total to prove a fresh read against; ask the user"]
    parsed = [_side_lines(t, side) for t in reads]
    lines0, cols0, rows0, total0 = parsed[0]
    if col not in cols0:
        return None, [f"no {col} column in the transcript"]
    j = cols0[col]
    names = [n for _, n in rows0]
    missing = [n for n in names if _key(n) not in fresh]
    if missing:
        return None, ["fresh read has no value for: " + ", ".join(missing)]
    new = {n: fresh[_key(n)] for n in names}
    try:
        width = len(_parts(next(iter(new.values()))))
        if any(len(_parts(v)) != width for v in new.values()):
            raise ValueError
    except (ValueError, StopIteration):
        return None, ["fresh values aren't all numbers in one format"]

    old = []                     # per read: {name: value}, and TOTAL
    for lines, cols, rows, total in parsed:
        if [n for _, n in rows] != names or cols.get(col) != j:
            return None, ["the two reads list different players or columns on this side; ask the user"]
        o = {n: _cell(lines, i, j) for i, n in rows}
        o["TOTAL"] = _cell(lines, total, j) if total is not None else None
        old.append(o)

    report = []
    totals = {o["TOTAL"] for o in old}
    if old[0]["TOTAL"] is not None:
        if len(totals) != 1:
            return None, ["the two reads disagree on the printed TOTAL; ask the user"]
        printed = old[0]["TOTAL"]
        if fresh.get("TOTAL") != printed:
            return None, [f"fresh read gives TOTAL {fresh.get('TOTAL')}, transcript {printed}; ask the user"]
        summed = [sum(p[k] for p in map(_parts, new.values())) for k in range(width)]
        if summed != _parts(printed):
            return None, [f"fresh {col} sums to {'-'.join(map(str, summed))}, TOTAL is {printed}; ask the user"]
        report.append(f"proved by the printed TOTAL ({printed})")
    else:
        if len(old) < 2:
            return None, ["no printed TOTAL and only one read: nothing proves a fresh value; ask the user"]
        for n in names:
            a, b, f = old[0][n], old[1][n], new[n]
            if a == b and f != a:
                return None, [f"{n}: both reads say {a}, fresh read says {f}; ask the user"]
            if a != b and f not in (a, b):
                return None, [f"{n}: reads say {a} / {b}, fresh read says {f}; ask the user"]
        report.append("no TOTAL; each split cell matched one of the two reads")

    changed = [f"{n} {col}: {' / '.join(sorted({o[n] for o in old}))} -> {new[n]}"
               for n in names if any(o[n] != new[n] for o in old)]
    if not changed:
        return None, [f"fresh read matches the transcript in every {col} cell; ask the user"]
    out = []
    for lines, cols, rows, total in parsed:
        lines = list(lines)
        for i, n in rows:
            _set_cell(lines, i, j, new[n])
        out.append("\n".join(lines) + "\n")
    return out, report + changed


def cmd_reread(d: Path, gid: str, side: str, col: str, values: Path) -> int:
    single = d / f"{gid}.txt"
    pair = [d / "a" / f"{gid}.txt", d / "b" / f"{gid}.txt"]
    paths = [single] if single.exists() else pair
    if not all(p.exists() for p in paths):
        sys.exit(f"no transcript for {gid} in {d}")
    texts, report = settle_column([p.read_text() for p in paths], side, col,
                                  read_values(values.read_text()))
    print(f"== {gid} {side} {col}: " + ("settled" if texts else "NOT settled"))
    for r in report:
        print("   " + r)
    if not texts:
        return 1
    for p, t in zip(paths, texts):
        p.write_text(t)
    return 0


def cmd_crop(d: Path, gid: str) -> int:
    """An enlarged copy of each screenshot's table, beside the original: the
    left panel (logos, line score) cut away and the rest doubled, so a fresh
    reader sees bigger digits. The full image stays the reference."""
    from PIL import Image
    imgs = [p for p in sorted((d / gid).glob("*")) if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
            and ".table" not in p.name]
    if not imgs:
        sys.exit(f"no images in {d / gid}")
    for p in imgs:
        with Image.open(p) as im:
            w, h = im.size
            box = (int(w * 0.33), int(h * 0.12), int(w * 0.98), int(h * 0.95))
            t = im.convert("RGB").crop(box)
            t = t.resize((t.width * 2, t.height * 2), Image.LANCZOS)
            out = p.with_name(p.stem + ".table.png")
            t.save(out)
            print(out)
    return 0


def main():
    if len(sys.argv) >= 4 and sys.argv[1] == "crop":
        return cmd_crop(Path(sys.argv[2]), sys.argv[3])
    if len(sys.argv) >= 7 and sys.argv[1] == "reread":
        return cmd_reread(Path(sys.argv[2]), sys.argv[3], sys.argv[4].lower(), sys.argv[5], Path(sys.argv[6]))
    if len(sys.argv) < 3 or sys.argv[1] not in ("fetch", "run", "compare"):
        print(__doc__)
        return 2
    d = Path(sys.argv[2])
    if sys.argv[1] == "fetch":
        cmd_fetch(d)
        return 0
    if sys.argv[1] == "compare":
        return cmd_compare(d)
    return cmd_run(d, "--commit" in sys.argv[3:])


if __name__ == "__main__":
    sys.exit(main())
