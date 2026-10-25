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
  * a tweet with a stat claim names at least one player, and a game.

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
    problems = check(batch, load_games(args.api, batch["date"]))
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
