"""Step 2 validators: turn voted cell values into a checked box score with
per-cell flags for the human review step.

Checks / repairs, per team:
  - parse FG/3PT/FT "made-att"; if the hyphen was dropped by OCR ("49"),
    reconstruct it from the scoring identity  PTS = 2*FGM + 3PM + FTM  (FGM
    already includes 3PM), disambiguating the split.
  - basketball constraints: 3PM<=FGM, made<=att for each pair.
  - per-player PTS check against the reconstructed makes.
  - column sums across players vs the team Total row.

A cell is FLAGGED when: OCR agreement is low, it won't parse, it failed a
check, or it was auto-repaired. Flagged cells are what the reviewer confirms.
"""
from __future__ import annotations

from bsread import COLS, MADE_ATT

INT_COLS = [c for c in COLS if c not in MADE_ATT]
LOW_AGREE = 0.6


def to_int(s):
    return int(s) if s.isdigit() else None


def parse_ma(raw):
    """'4-9' -> (4, 9); returns None if no clean hyphenated split."""
    if "-" in raw:
        a, b = raw.split("-", 1)
        if a.isdigit() and b.isdigit():
            return int(a), int(b)
    return None


def repair_ma(raw, target_made=None):
    """Digit string with a dropped hyphen ('49') -> (made, att). Prefer the
    split whose made == target_made (from the PTS identity); else the split
    with made <= att and the smallest made."""
    d = "".join(ch for ch in raw if ch.isdigit())
    cands = []
    for k in range(1, len(d)):
        m, a = int(d[:k]), int(d[k:])
        if m <= a:
            cands.append((m, a))
    if not cands:
        return None
    if target_made is not None:
        for m, a in cands:
            if m == target_made:
                return (m, a)
    return cands[0]


def validate_team(team_block):
    """team_block = {'frames', 'players': {key: row}} from bsread.vote_box.
    Returns {'players': [...], 'total': row-or-None, 'column_checks': {...}}."""
    players = []
    total = None
    for key, row in team_block["players"].items():
        vr = _validate_row(row)
        if key == "TOTAL":
            total = vr
        else:
            players.append(vr)
    players.sort(key=lambda r: (r["dnp"], -(r["int"].get("PTS") or -1)))

    # column sums (players) vs Total
    checks = {}
    if total:
        for c in INT_COLS:
            s = sum(r["int"][c] for r in players
                    if not r["dnp"] and r["int"].get(c) is not None)
            t = total["int"].get(c)
            checks[c] = {"sum": s, "total": t, "ok": (t is not None and s == t)}
        for c in MADE_ATT:
            sm = sum(r["ma"][c][0] for r in players
                     if not r["dnp"] and r["ma"].get(c))
            sa = sum(r["ma"][c][1] for r in players
                     if not r["dnp"] and r["ma"].get(c))
            tt = total["ma"].get(c)
            checks[c] = {"sum": (sm, sa), "total": tt,
                         "ok": (tt is not None and (sm, sa) == tt)}
    return {"players": players, "total": total, "column_checks": checks}


def _validate_row(row):
    stats = row["stats"]
    val = {c: stats[c][0] for c in COLS}
    agree = {c: stats[c][1] for c in COLS}
    flags = {}                       # col -> reason
    out = {"name": row["name"], "dnp": row["dnp"], "seen": row["seen"],
           "int": {}, "ma": {}, "raw": val, "agree": agree, "flags": flags}
    if row["dnp"]:
        return out

    for c in COLS:
        if agree[c] < LOW_AGREE:
            flags[c] = "low-agreement"

    for c in INT_COLS:
        v = to_int(val[c])
        out["int"][c] = v
        if v is None:
            flags[c] = "unparsed"

    ma = {}
    for c in MADE_ATT:
        ma[c] = parse_ma(val[c])
    pts = out["int"].get("PTS")

    # reconstruct any made-att that lost its hyphen
    for c in MADE_ATT:
        if ma[c] is None and val[c]:
            target = None
            if c == "FG" and pts is not None and ma.get("3PT") and ma.get("FT"):
                need = pts - ma["3PT"][0] - ma["FT"][0]
                if need >= 0 and need % 2 == 0:
                    target = need // 2
            fixed = repair_ma(val[c], target)
            if fixed:
                ma[c] = fixed
                flags[c] = "repaired"
    out["ma"] = ma

    # constraints
    for c in MADE_ATT:
        if ma[c] and ma[c][0] > ma[c][1]:
            flags[c] = "made>att"
    if ma.get("3PT") and ma.get("FG") and ma["3PT"][0] > ma["FG"][0]:
        flags["3PT"] = "3PM>FGM"

    # PTS identity
    if pts is not None and ma.get("FG") and ma.get("3PT") and ma.get("FT"):
        exp = 2 * ma["FG"][0] + ma["3PT"][0] + ma["FT"][0]
        if exp != pts:
            flags.setdefault("PTS", f"pts!={exp}")
    return out
