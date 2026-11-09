#!/usr/bin/env python3
"""Check a day's NBN Twitter batch against the box scores before it posts.

The tweets are fiction; the numbers in them must not be. This is the check
for that, so the writer only writes (the same split as validate_boxscore.py):

  * every `teams` pair is a game played that day, [away, home];
  * every "<n> <stat>" in a tweet ("41 points", "12 reb", "6 threes") is
    exactly that stat for one of the tweet's players in that game. The players
    are `slug` (the player's own account) plus `about`, a list of slugs that
    exists only for this check and is stripped before posting;
  * every final score written as "122-104" is that game's score;
  * a tweet with a stat claim names at least one player, and a game;
  * no tweet reuses a phrase from the last 100 posted, or from another tweet
    in the batch: any shared run of four words (numbers aside), or any stock
    line in STOCK_LINES. One account's own catchphrase (CATCHPHRASES) is
    exempt for that account only. Fan accounts all saying "book the parade"
    is what this is for.

Three accounts quote numbers that are not in a box score, and those are
checked against where they come from:

  * fantasy points ("48.25 fantasy points", "31 FP") are the Pick'em score of
    one of the tweet's players in that game, scored with the table
    `GET /api/pickem/{date}` serves;
  * draft slots ("#3 pick", "3rd overall", "second-rounder", "2024 draft",
    "undrafted") match one of the tweet's players' bios;
  * share prices ("PHX ▼3.1%", "PHX NB¥222.60") are that team's fair value on
    the batch's date and its move from the last earlier day, as the homepage's
    Market Movers figures it. In an @NBNTicker tweet every "%" and "NB¥" must
    be one of these, so nothing it says goes unchecked.

Season and career numbers ("31.2 ppg", "10,000 career points") are not
checked here; the skill says where they must come from.

    python3 build/check_tweets.py tweets.json [--out post.json] [--api URL]

Exit 0 and write the POST body to --out when everything checks; exit 1 and
list every problem otherwise.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import date as Date, timedelta

STAT_WORDS = {
    "pts": "pts", "points": "pts", "point": "pts",
    "reb": "reb", "rebs": "reb", "rebounds": "reb", "rebound": "reb", "boards": "reb", "board": "reb",
    "ast": "ast", "asts": "ast", "assists": "ast", "assist": "ast", "dimes": "ast", "dime": "ast",
    "stl": "stl", "steals": "stl", "steal": "stl",
    "blk": "blk", "blocks": "blk", "block": "blk", "swats": "blk",
    "threes": "tpm", "three": "tpm", "3s": "tpm", "3pm": "tpm", "triples": "tpm", "treys": "tpm",
    "tov": "tov", "turnovers": "tov", "turnover": "tov",
    "min": "min", "minutes": "min",
}
# "41 points", "41-point", "12 reb". Season rates ("31.2 ppg") have a decimal
# point or "pg", so they fall outside this.
STAT_RE = re.compile(r"(?<![\d.,])(\d{1,3})[\s-]+(" + "|".join(sorted(STAT_WORDS, key=len, reverse=True)) + r")\b",
                     re.IGNORECASE)
SCORE_RE = re.compile(r"(?<![\d.])(\d{2,3})\s*[-–]\s*(\d{2,3})(?![\d.])")

# The one line an account is meant to repeat. Anything else it says twice in
# two weeks is a rut, catchphrase or not.
CATCHPHRASES = {"TripPenimore": ["built the right way"]}
# Reports what happened in the ledger; "converted to a two-way" twice is news.
NO_REPEAT_CHECK = {"NBNInsider"}
# Short stock lines a four-word match misses. Each may appear once in the
# window, then it is spent until it scrolls out.
STOCK_LINES = [
    "book the parade", "book it", "parade route", "fire everyone", "blow it up",
    "so back", "not taking questions", "winning the title", "title odds",
    "i don't care", "i'm not kidding", "in my day", "that's basketball",
    "write that down", "defense still wins", "everybody wants to talk",
    "meanwhile houston", "logging off", "lie down", "we locked in",
]
WORD_RE = re.compile(r"[a-z']+|\d+")
RECENT = 100

# Pick'em's scoring keys (as `GET /api/pickem/{date}` serves them) -> box score keys.
FP_KEYS = {"P": "pts", "3PM": "tpm", "R": "reb", "A": "ast", "S": "stl", "B": "blk", "TO": "tov"}
FP_TENS = ("pts", "reb", "ast", "stl", "blk")
FP_RE = re.compile(r"(?<![\d.])(\d{1,3}(?:\.\d{1,2})?)\s*(?:fantasy points|fantasy pts|fpts|fp)\b", re.IGNORECASE)

PICK_RE = re.compile(r"(?:#|\bno\.\s?)(\d{1,2})\s+(?:overall\s+)?pick\b"
                     r"|\b(\d{1,2})(?:st|nd|rd|th)[\s-]+(?:overall|pick)\b", re.IGNORECASE)
ROUND_RE = re.compile(r"\b(1st|2nd|first|second)[\s-]+round(?:er)?\b", re.IGNORECASE)
DRAFT_YEAR_RE = re.compile(r"\b(20\d\d)\s+(?:nbn\s+)?draft\b", re.IGNORECASE)
UNDRAFTED_RE = re.compile(r"\bundrafted\b", re.IGNORECASE)
ROUNDS = {"1st": 1, "first": 1, "2nd": 2, "second": 2}

PRICE = r"NB¥\s?(\d[\d,]*(?:\.\d{1,2})?)"
MOVE_RE = re.compile(r"\b([A-Z]{2,3})\s+(?:" + PRICE + r"\s+)?([▲▼+\-−])\s?(\d{1,3}(?:\.\d{1,2})?)%")
PRICE_RE = re.compile(r"\b([A-Z]{2,3})\s+(?:(?:at|to|now)\s+)?" + PRICE)
# Every "%" and "NB¥" in these accounts' tweets must be a checked price or move.
TICKER_HANDLES = {"NBNTicker"}


def words(text: str) -> list[str]:
    return WORD_RE.findall(text.lower().replace("\u2019", "'"))


def grams(text: str, handle: str, n: int = 4) -> set[str]:
    # The account's catchphrase splits the text, so no run reaches into it.
    spans = [words(text)]
    for c in CATCHPHRASES.get(handle, []):
        cw = words(c)
        spans = [part for span in spans for part in _split(span, cw)]
    return {" ".join(w[i:i + n]) for w in spans for i in range(len(w) - n + 1)
            if not any(x.isdigit() for x in w[i:i + n])}


def _split(w: list[str], cw: list[str]) -> list[list[str]]:
    for i in range(len(w) - len(cw) + 1):
        if w[i:i + len(cw)] == cw:
            return [w[:i], *_split(w[i + len(cw):], cw)]
    return [w]


def stock(text: str, handle: str) -> set[str]:
    padded = " " + " ".join(words(text)) + " "
    own = {" ".join(words(c)) for c in CATCHPHRASES.get(handle, [])}
    return {s for s in STOCK_LINES if f" {s} " in padded and s not in own}


def load_recent(api: str) -> list[dict]:
    with urllib.request.urlopen(f"{api}/api/tweets?limit={RECENT}", timeout=30) as r:
        return json.load(r)


def check_repeats(batch: dict, recent: list[dict]) -> list[str]:
    problems = []
    texts = {t.get("text") for t in batch["tweets"]}
    seen_g, seen_s = {}, {}
    for t in recent:
        if t.get("text") in texts or t["handle"] in NO_REPEAT_CHECK:
            continue  # the same batch, already posted once
        who = f"@{t['handle']} on {t['date']}"
        for g in grams(t["text"], t["handle"]):
            seen_g.setdefault(g, who)
        for s in stock(t["text"], t["handle"]):
            seen_s.setdefault(s, who)
    for i, t in enumerate(batch["tweets"], 1):
        where = f"tweet {i} (@{t.get('handle', '?')})"
        text, handle = t.get("text", ""), t.get("handle", "")
        if handle in NO_REPEAT_CHECK:
            continue
        hits = sorted({f'"{g}" ({seen_g[g]})' for g in grams(text, handle) if g in seen_g}
                      | {f'"{s}" ({seen_s[s]})' for s in stock(text, handle) if s in seen_s})
        if hits:
            problems.append(f"{where}: reuses {', '.join(hits)}")
        who = f"tweet {i} in this batch"
        for g in grams(text, handle):
            seen_g.setdefault(g, who)
        for s in stock(text, handle):
            seen_s.setdefault(s, who)
    return problems


def fantasy_points(line: dict, scoring: dict) -> float:
    pts = sum(scoring[k] * (line.get(b) or 0) for k, b in FP_KEYS.items())
    tens = sum(1 for k in FP_TENS if (line.get(k) or 0) >= 10)
    if tens >= 2:
        pts += scoring["DD"]
    if tens >= 3:
        pts += scoring["TD"]
    return round(pts, 2)


def load_json(url: str):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def load_prices(api: str, date: str) -> dict:
    """{team: (price, pct move or None)} for `date`, or {} with no row yet."""
    since = (Date.fromisoformat(date) - timedelta(days=21)).isoformat()
    days = load_json(f"{api}/api/fair-value/history?since={since}").get("days") or []
    today = next((d for d in days if d["date"] == date), None)
    if not today:
        return {}
    earlier = [d for d in days if d["date"] < date]
    prev = earlier[-1]["teams"] if earlier else {}
    out = {}
    for t, v in today["teams"].items():
        a, b = (prev.get(t) or {}).get("price"), v.get("price")
        out[t] = (b, (b / a - 1) * 100 if a and b else None)
    return out


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def check_extras(batch: dict, games: dict, bios: dict, prices: dict, scoring: dict) -> list[str]:
    """Fantasy points, draft slots and share prices: see the module docstring."""
    problems = []
    for i, t in enumerate(batch["tweets"], 1):
        where = f"tweet {i} (@{t.get('handle', '?')})"
        text = t.get("text", "")
        slugs = [s for s in [t.get("slug"), *(t.get("about") or [])] if s]

        fps = FP_RE.findall(text)
        game = games.get(tuple(t.get("teams") or ()))
        if fps and not (game and slugs):
            problems.append(f"{where}: quotes fantasy points but names no game and player")
        elif fps:
            lines = {p["slug"]: p for side in ("away_players", "home_players") for p in game.get(side) or []}
            have = {s: fantasy_points(lines[s], scoring) for s in slugs if s in lines}
            for n in fps:
                if not any(abs(v - float(n)) < 0.01 for v in have.values()):
                    got = ", ".join(f"{s} {v:g}" for s, v in have.items())
                    problems.append(f'{where}: "{n} fantasy points" matches nobody ({got})')

        draft = [("pick", int(a or b)) for a, b in PICK_RE.findall(text)]
        draft += [("round", ROUNDS[r.lower()]) for r in ROUND_RE.findall(text)]
        draft += [("year", int(y)) for y in DRAFT_YEAR_RE.findall(text)]
        draft += [("undrafted", None)] * len(UNDRAFTED_RE.findall(text))
        if draft and not slugs:
            problems.append(f"{where}: quotes a draft slot but names no player in `slug`/`about`")
        for kind, n in draft if slugs else []:
            field = {"pick": "draft_pick", "round": "draft_round", "year": "draft_year"}.get(kind)
            ok = [s for s in slugs
                  if (not any((bios.get(s) or {}).get(f) for f in ("draft_year", "draft_pick"))
                       if kind == "undrafted"
                      else (bios.get(s) or {}).get(field) == n)]
            if not ok:
                real = ", ".join(f"{s} {(bios.get(s) or {}).get('draft_year')} "
                                 f"R{(bios.get(s) or {}).get('draft_round')} "
                                 f"#{(bios.get(s) or {}).get('draft_pick')}" for s in slugs)
                problems.append(f"{where}: draft {kind}{'' if n is None else f' {n}'} matches nobody ({real})")

        rest = text
        for m in MOVE_RE.finditer(text):
            team, price, sign, pct = m.group(1), m.group(2), m.group(3), float(m.group(4))
            real = prices.get(team)
            if not real or real[1] is None:
                problems.append(f"{where}: no fair-value move for {team} on {batch['date']}")
                continue
            claimed = -pct if sign in "▼-−" else pct
            if abs(claimed - real[1]) > 0.051:
                problems.append(f"{where}: {team} {sign}{pct}% is not its move ({real[1]:+.1f}%)")
            if price and abs(_num(price) - real[0]) > 0.0051:
                problems.append(f"{where}: {team} NB¥{price} is not its price (NB¥{real[0]:.2f})")
            rest = rest.replace(m.group(0), " ", 1)
        for m in PRICE_RE.finditer(rest):
            team, price = m.group(1), m.group(2)
            real = prices.get(team)
            if not real:
                problems.append(f"{where}: no fair value for {team} on {batch['date']}")
            elif abs(_num(price) - real[0]) > (0.0051 if "." in price else 0.5):
                problems.append(f"{where}: {team} NB¥{price} is not its price (NB¥{real[0]:.2f})")
            rest = rest.replace(m.group(0), " ", 1)
        if t.get("handle") in TICKER_HANDLES and ("%" in rest or "NB¥" in rest):
            problems.append(f'{where}: a "%" or "NB¥" that isn\'t "<TEAM> ▲1.2%" or "<TEAM> NB¥123.45"')
    return problems


def load_games(api: str, date: str) -> dict:
    with urllib.request.urlopen(f"{api}/api/boxscores?date={date}", timeout=30) as r:
        games = json.load(r)
    return {(g["away_team"], g["home_team"]): g for g in games}


def check(batch: dict, games: dict) -> list[str]:
    problems = []
    for i, t in enumerate(batch["tweets"], 1):
        where = f"tweet {i} (@{t.get('handle', '?')})"
        text = t.get("text", "")
        if len(text) > 280:
            problems.append(f"{where}: {len(text)} characters, over 280")
        teams = tuple(t.get("teams") or ())
        game = games.get(teams) if teams else None
        if teams and not game:
            problems.append(f"{where}: no game {teams[0]} @ {teams[1]} on {batch['date']}")
        slugs = [s for s in [t.get("slug"), *(t.get("about") or [])] if s]
        lines = {}
        if game:
            for side in ("away_players", "home_players"):
                for p in game.get(side) or []:
                    lines[p["slug"]] = p
        missing = [s for s in slugs if game and s not in lines]
        if missing:
            problems.append(f"{where}: {', '.join(missing)} did not play in that game")
        claims = STAT_RE.findall(text)
        if claims and not game:
            problems.append(f"{where}: quotes a stat line but names no game in `teams`")
        if claims and not slugs:
            problems.append(f"{where}: quotes a stat line but names no player in `slug`/`about`")
        for n, word in claims:
            key = STAT_WORDS[word.lower()]
            if lines and slugs and not any(lines.get(s, {}).get(key) == int(n) for s in slugs):
                have = ", ".join(f"{s} {lines[s].get(key)}" for s in slugs if s in lines)
                problems.append(f"{where}: \"{n} {word}\" matches nobody ({key}: {have})")
        for a, b in SCORE_RE.findall(text):
            a, b = int(a), int(b)
            if min(a, b) < 60:
                continue  # a shooting line, "9-17", not a score
            if not game or {a, b} != {game["away_score"], game["home_score"]}:
                real = f"{game['away_score']}-{game['home_score']}" if game else "no game"
                problems.append(f"{where}: score {a}-{b} is not the final ({real})")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--out")
    ap.add_argument("--api", default="http://localhost:8001")
    args = ap.parse_args()
    batch = json.load(open(args.file))
    games = load_games(args.api, batch["date"])
    problems = check(batch, games)
    problems += check_extras(batch, games, load_json(f"{args.api}/api/players"),
                             load_prices(args.api, batch["date"]),
                             load_json(f"{args.api}/api/pickem/{batch['date']}")["scoring"])
    problems += check_repeats(batch, load_recent(args.api))
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    body = {"date": batch["date"],
            "tweets": [{k: v for k, v in t.items() if k != "about"} for t in batch["tweets"]]}
    if args.out:
        json.dump(body, open(args.out, "w"), indent=1)
    print(f"ok: {len(body['tweets'])} tweets for {batch['date']}")


if __name__ == "__main__":
    main()
