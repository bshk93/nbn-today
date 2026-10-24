#!/usr/bin/env python3
"""
Sync per-attribute NBA 2K ratings into
/var/lib/nothing-but-stats/player-attributes.json.

Source: nba2kapi.com, a free API that mirrors 2kratings.com. It replaced
scraping 2kratings directly on 2026-10-15, when 2kratings put its pages behind
a Cloudflare bot check (every request from this box got a 403 or a "Just a
moment..." page). nba2kapi reads the same pages we used to -- the same
JSON-LD attribute block, the same "Position:" line, the same badge list -- so
its values are 2kratings' values: on the first comparison, 531 of 532 players
from our last direct scrape (2026-08-27) had identical attributes and badges.
It is one developer's side project with no promise attached, which is why
every run checks the feed is alive and fresh and alerts when it isn't (see
"Alerting" below).

One request per run: GET /api/players/bulk?teamType=curr returns every
current player (~650) at once. The key is read from $NBA2KAPI_KEY, else
~/.config/nbn/nba2kapi.key. It is never committed.

Matching an NBN slug to a 2kratings player:
  1. MANUAL_SLUG_OVERRIDES, for names no rule can derive.
  2. The player's stored source_slug from their last snapshot. That is the
     2kratings page slug, which the API carries in playerUrl, so the ~570
     players we already scraped match with no guessing.
  3. Candidate slugs derived from the bio name (first-last, plus -jr/-sr/
     -ii/-iii/-iv variants).
  4. A last-name lookup, filtered to first names that are a prefix of one
     another (Herb/Herbert, Cam/Cameron).

Player selection:
  --slugs a,b,c   Only these NBN slugs (need not be rostered).
  (default)       Everyone already in player-attributes.json, plus every
                  currently rostered player (*-roster.csv), plus every current
                  free agent (GET /api/fa/pool, `current: true` only -- the
                  same pool free-agency/index.html shows). The bulk call costs
                  the same however many we look up, so there is no separate
                  refresh mode any more.

  The API's "current" set includes 2kratings' "Free Agency" team (119 players
  on the first run), so real-life free agents keep refreshing too. A player
  2kratings has no current page for is reported as not in the feed.

What the API doesn't carry:
  `intangibles` and `potential` are not in the feed. Each new snapshot carries
  them over from the player's previous one, so they don't read as a change.

Positions:
  The API copies 2kratings' "Position:" line verbatim, typos included -- seen
  on the first run: "PG / PG", "PG / S". Anything that isn't PG/SG/SF/PF/C is
  dropped and duplicates are removed (clean_positions). If nothing valid is
  left, the previous snapshot's positions are kept. A wrong value that *looks*
  valid ("SF / PF" typed for an SG) can't be told apart from a real update, so
  every position change is printed. A new 2K primary does not change the
  player's NBN primary, which is frozen until he changes teams (nbn-api
  routers/players.py, "Positions"); when the two now differ it is printed,
  and the streamer dashboard asks for ours to be set in 2K. Nothing is
  alerted: every position 2K has listed stays in the secondary pool, so a
  re-rating can't make a team's choice illegal.

Storage format:
  player-attributes.json is keyed by NBN slug -> a LIST of snapshots
  (append-only, oldest first), mirroring ovr-history.json's shape. Each
  snapshot carries "2k_pos" (2K position abbreviations, e.g. ["PG", "SG"]),
  "badges" (list of {name, tier, category}, tier one of Bronze/Silver/Gold/
  HOF/Legendary), and "team" (the roster abbr the player is on right now, or
  null if a free agent -- stamped at sync time from *-roster.csv rather than
  ever reconstructed later, since the transaction ledger has real backfill
  gaps; GET /api/ratings-changes reads it straight off each snapshot). A new
  snapshot is only appended when the 2K OVR, any attribute, the position list
  or the badge set has changed since the player's last snapshot -- badge
  ORDER is ignored, since the API and the old scrape list the same badges in
  different orders. A team change alone does not trigger a snapshot.

Writing:
  Dry run by default -- writes a preview JSON to SCRATCH_DIR, does not touch
  NBS_DATA_DIR. Pass --apply to merge into the real output file.

  A snapshot flagged as a not-yet-rated stub -- either the OVR is under
  STUB_OVR_THRESHOLD (2K's own floor for a real rating), or it moved by
  DIVERGENCE_THRESHOLD or more against the player's last REAL (non-stub)
  snapshot with the attribute average essentially unmoved -- still gets
  appended to player-attributes.json (carrying "ovr_stub": true, so
  /ratings-changes can call it out as a record rather than a real change),
  but is skipped from the ovr-history.json sync, so it can't clobber the live
  OVR badge/roster tables with a number that isn't real. Both checks are
  re-evaluated on every run, so a player 2K later rates for real syncs on the
  very next run.

Alerting (--apply only):
  Posted to DISCORD_ALERT_CHANNEL (the channel the box score integrity check
  uses; inert if it or DISCORD_BOT_TOKEN is unset) when:
    - the API call fails, or returns fewer than MIN_CURRENT_PLAYERS players;
    - the feed's newest lastUpdated is more than STALE_DAYS old (it claims
      weekly updates -- the old scrape went seven weeks dead unnoticed);
    - a rostered player is newly unmatched (the team page will show no
      primary position for him). "Newly" is against the previous run's list,
      kept in SYNC_STATE_FILE, so a player 2kratings has no page for is
      alerted once, not every day.
  Exit status is 1 when the sync itself failed, so systemd records it.
"""
import argparse
import csv
import glob
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path("/var/lib/nothing-but-stats")
# Same convention as build/poopoo.py.
API_BASE = os.environ.get("NBN_API_BASE", "http://127.0.0.1:8001")
OUT_FILE = DATA_DIR / "player-attributes.json"
BIOS_FILE = DATA_DIR / "player-bios.json"
# The site's OVR badge / roster-table OVR column read this file (via
# GET /api/ovr/current) independently of player-attributes.json. 2K is the
# authoritative OVR source now, so every apply keeps this in sync too --
# same append-only-on-change shape it already had under manual entry.
OVR_HISTORY_FILE = DATA_DIR / "ovr-history.json"
# Last run's outcome: when it ran, how many players the feed had, and which
# rostered players it couldn't match (so those alert once, not daily).
SYNC_STATE_FILE = DATA_DIR / "2k-sync-state.json"
SCRATCH_DIR = Path(os.environ.get("NBN_2K_SCRATCH", "/tmp/nbn-2k-sync"))

NBA2KAPI_BULK = "https://api.nba2kapi.com/api/players/bulk?teamType=curr"
NBA2KAPI_KEY_FILE = Path.home() / ".config" / "nbn" / "nba2kapi.key"
UA = "nbn.today ratings sync (https://nbn.today)"

# The first run returned 654. A feed that drops well below that is broken or
# truncated, and merging it would just leave most of the league unrefreshed.
MIN_CURRENT_PLAYERS = 500
STALE_DAYS = 14

DISCORD_ALERT_CHANNEL = os.environ.get("DISCORD_ALERT_CHANNEL", "").strip()
DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
DISCORD_ADMIN_ID = os.environ.get("DISCORD_ADMIN_ID", "").strip()

SUFFIX_RE = re.compile(r'\b(JR|SR|II|III|IV)\.?$')
POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"]

# The API spells two tiers differently from the labels every snapshot to date
# uses ("Hall of Fame" for HOF). Mapped back so an unchanged badge stays
# unchanged.
TIER_LABELS = {"Hall of Fame": "HOF", "Legend": "Legendary"}

# camelCase API attribute -> the snake_case key snapshots have always used.
# Anything not listed converts mechanically (threePointShot -> three_point_shot).
ATTR_RENAMES = {
    "drivingLayup": "layup",
    "durability": "overall_durability",
    "shotIQ": "shot_iq",
    "passIQ": "pass_iq",
    "helpDefenseIQ": "help_defense_iq",
}
# Snapshot fields the feed doesn't carry -- copied forward from the last one.
CARRIED_ATTRS = ("intangibles", "potential")

# 2K doesn't issue real OVRs below this -- a value under it means the player
# has no confirmed real-world team on 2K's books yet (seen first 2026-08-27,
# at the 2K27 edition switchover: every sub-50 case that run also showed a
# large mismatch between OVR and the player's own individual attributes,
# which stayed at plausible real values). Such a snapshot still gets appended
# to player-attributes.json unconditionally, so /ratings-changes keeps a full
# dated record -- only the ovr-history.json sync (which drives the live OVR
# badge/roster tables) skips it. Checked fresh against each run, not a
# persistent slug list, so a player 2K later rates for real syncs normally.
STUB_OVR_THRESHOLD = 50

# A second, more general stub signal: this player's OVR moved by this much or
# more than their own attribute average moved, since their last real
# snapshot. A real rating update moves OVR roughly in proportion to how much
# the underlying attributes actually moved -- 2K's real OVR formula is
# position-weighted, not a flat average, so some per-player noise here is
# normal (confirmed-legitimate Jonathan Kuminga sat at divergence 6.1 on
# 2026-08-27's run, a real rating decision with no matching attribute move).
# A not-yet-rated stub instead moves OVR with the attributes essentially
# frozen, which was a much larger gap for every confirmed-broken case that
# run (11.8-47.4) -- including several that land well above STUB_OVR_THRESHOLD
# and so the floor check alone misses (Jonas Valanciunas's OVR crashed
# 79->64, still nowhere near 50). Set comfortably above the largest
# confirmed-legitimate divergence seen so far and below the smallest
# confirmed-broken one. A case landing between the two -- Lonzo Ball and Maxi
# Kleber that run, divergence 6.2/7.2, both confirmed real-life free agents
# with their attribute average essentially flat despite a +6 OVR jump -- sits
# too close to a confirmed-legitimate case (Kuminga, 6.1) for any single
# number to separate automatically, and needed a human to cross-check the
# free-agent tag by hand; expect that to recur occasionally rather than
# raising this threshold to catch it, which would start flagging real moves.
#
# Measured against the last NON-stub snapshot: measured against a stub, the
# real rating arriving (Valanciunas 64 -> 77, attributes unchanged) would
# itself read as a stub, and the player would stay frozen forever.
DIVERGENCE_THRESHOLD = 10


def _avg_attrs(attrs):
    vals = [int(v) for v in attrs.values() if str(v).lstrip("-").isdigit()]
    return sum(vals) / len(vals) if vals else None

# Manual overrides for name-matching exceptions the automated tiers can't
# resolve (e.g. acronym-style nicknames that aren't a prefix/suffix of the
# real name). Values are 2kratings page slugs. Checked before all other tiers.
MANUAL_SLUG_OVERRIDES = {
    "prosper-omax": "olivier-maxence-prosper",  # "Omax" = OlivierMAXence, not a substring
    "hyland-nahshon": "bones-hyland",           # page renamed to his nickname after 2026-08-27
}

# Known players 2kratings has no fixable current-page match for. Skipped
# without being reported as unmatched.
MANUAL_SKIP = {
    "paul-chris": "no current 2K27 page on 2kratings (chris-paul/-2 both dead-end into "
                  "historical archive pages only -- not a matching bug)",
}


def clean_slug(s):
    s = s.lower().strip().replace(" ", "-")
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def name_parts(bio_name):
    last, _, first = bio_name.partition(",")
    last, first = last.strip(), first.strip()
    suffix = None
    for field in (last, first):
        m = SUFFIX_RE.search(field)
        if m:
            suffix = m.group(1)
    last = SUFFIX_RE.sub("", last).strip()
    first = SUFFIX_RE.sub("", first).strip()
    return first, last, suffix


def candidate_slugs(bio_name):
    first, last, suffix = name_parts(bio_name)
    base = clean_slug(f"{first} {last}")
    cands = [base]
    if suffix:
        cands.append(f"{base}-{suffix.lower()}")
    for suf in ("jr", "sr", "ii", "iii", "iv"):
        c = f"{base}-{suf}"
        if c not in cands:
            cands.append(c)
    return cands, clean_slug(first), clean_slug(last)


def load_roster_team_map():
    """slug -> team abbr for every currently rostered player, derived from the
    {abbr}-roster.csv filename. Stamped onto each new snapshot as "team" --
    the team a player is on *right now* is always a fact we know for certain
    at sync time, so recording it directly avoids ever having to reconstruct
    "who was on what team on date D" later from the transaction ledger (which
    has real backfill gaps for older history)."""
    team_map = {}
    for f in sorted(glob.glob(str(DATA_DIR / "*-roster.csv"))):
        team = Path(f).stem.replace("-roster", "").upper()
        with open(f) as fh:
            for row in csv.DictReader(fh):
                s = row.get("SLUG", "").strip()
                if s:
                    team_map[s] = team
    return team_map


def load_fa_pool_slugs():
    """Current free agents, via the same pool GET /api/fa/pool serves to
    free-agency/index.html (built by `_fa_pool` in nbn-api's free_agency.py) --
    reused rather than re-derived so this can't drift from what that page
    calls a free agent. Only `current: true` entries: the pool also carries
    future-year holds for players still under contract elsewhere (already
    covered by the roster set), which aren't free agents yet."""
    req = urllib.request.Request(f"{API_BASE}/api/fa/pool", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        pool = json.loads(resp.read().decode())
    return {slug for slug, entry in pool.items() if entry.get("current")}


def load_api_key():
    key = os.environ.get("NBA2KAPI_KEY", "").strip()
    if not key and NBA2KAPI_KEY_FILE.exists():
        key = NBA2KAPI_KEY_FILE.read_text().strip()
    return key


def fetch_current_players(key):
    req = urllib.request.Request(NBA2KAPI_BULK, headers={"User-Agent": UA, "X-API-Key": key})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode())
    if not body.get("success") or not isinstance(body.get("data"), list):
        raise RuntimeError(f"unexpected response: {str(body)[:300]}")
    return body["data"]


def page_slug(player):
    """The 2kratings page slug -- what source_slug has always stored."""
    url = (player.get("playerUrl") or "").rstrip("/")
    return url.rsplit("/", 1)[-1] if url else player.get("slug", "")


def clean_positions(raw):
    """(positions, dropped) -- valid abbreviations in order, deduplicated."""
    out, dropped = [], []
    for p in raw or []:
        p = str(p).strip().upper()
        if p in POSITION_ORDER and p not in out:
            out.append(p)
        else:
            dropped.append(p)
    return out, dropped


def convert_attrs(api_attrs):
    out = {}
    for k, v in (api_attrs or {}).items():
        key = ATTR_RENAMES.get(k) or re.sub(r"([A-Z])", r"_\1", k).lower()
        out[key] = v
    return out


def convert_badges(api_badges):
    return [
        {"name": b["name"], "tier": TIER_LABELS.get(b["tier"], b["tier"]), "category": b.get("category", "")}
        for b in (api_badges or {}).get("list", [])
    ]


def badge_set(badges):
    return {(b["name"], b["tier"], b.get("category", "")) for b in badges or []}


def match_player(slug, bio, last_snap, by_page, by_name):
    """Return (api_player, via) or (None, None)."""
    if slug in MANUAL_SLUG_OVERRIDES and MANUAL_SLUG_OVERRIDES[slug] in by_page:
        return by_page[MANUAL_SLUG_OVERRIDES[slug]], "manual-override"
    if last_snap and last_snap.get("source_slug") in by_page:
        return by_page[last_snap["source_slug"]], last_snap.get("match_method") or "source-slug"
    if not bio:
        return None, None
    # A stored source_slug can go stale: 2kratings renames pages (between
    # 2026-08-27 and 2026-10-12 carlton-carrington became bub-carrington), so
    # the name tiers below run for known players too, and also try the API's
    # display name, which keeps the legal name the page slug dropped.
    cands, first_clean, last_clean = candidate_slugs(bio["name"])
    hit = next((c for c in cands if c in by_page), None)
    if hit:
        return by_page[hit], "name"
    hit = next((c for c in cands if c in by_name), None)
    if hit:
        return by_name[hit], "display-name"
    # Surname-first display names ("Yang Hansen" for YANG, HANSEN).
    reversed_name = clean_slug(f"{last_clean} {first_clean}")
    if reversed_name in by_name:
        return by_name[reversed_name], "display-name-surname-first"
    def nickname_match(cand):
        cand_first = cand.rsplit("-", 1)[0].replace("-", "")
        return cand_first.startswith(first_clean) or first_clean.startswith(cand_first)
    same_last = [s for s in by_page if s.split("-")[-1] == last_clean and nickname_match(s)]
    if len(same_last) == 1:
        return by_page[same_last[0]], "nickname-lastname-fallback"
    return None, None


def post_alert(lines):
    if not lines:
        return
    print("\nALERT:\n  " + "\n  ".join(lines))
    if not (DISCORD_ALERT_CHANNEL and DISCORD_BOT_TOKEN):
        print("  (DISCORD_ALERT_CHANNEL / DISCORD_BOT_TOKEN unset -- not posted)")
        return
    mention = f"<@{DISCORD_ADMIN_ID}> " if DISCORD_ADMIN_ID else ""
    body = "\n".join(f"• {l}" for l in lines[:15])
    if len(lines) > 15:
        body += f"\n• …and {len(lines) - 15} more"
    text = f"{mention}**2K ratings sync**\n{body}"
    req = urllib.request.Request(
        f"https://discord.com/api/v10/channels/{DISCORD_ALERT_CHANNEL}/messages",
        data=json.dumps({"content": text[:1990]}).encode(),
        headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}", "Content-Type": "application/json",
                 "User-Agent": UA},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=20).close()
    except Exception as e:
        print(f"  WARN: Discord alert failed: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="merge results into NBS_DATA_DIR (default: dry run)")
    ap.add_argument("--slugs", type=str, default=None, help="comma-separated NBN slugs to target (need not be rostered)")
    ap.add_argument("--replace-last-ovr", action="store_true", help="one-off: overwrite ovr-history.json's LAST entry per player instead of appending a new one. Use only when correcting a bad prior sync (i.e. you know 2K itself hasn't changed since that entry) -- normal runs should never pass this, since it discards the timeline's memory of what the wrong value was.")
    args = ap.parse_args()

    today = time.strftime("%Y-%m-%d")
    bios = json.loads(BIOS_FILE.read_text())
    existing = json.loads(OUT_FILE.read_text()) if OUT_FILE.exists() else {}
    state = json.loads(SYNC_STATE_FILE.read_text()) if SYNC_STATE_FILE.exists() else {}
    team_map = load_roster_team_map()
    alerts = []

    key = load_api_key()
    if not key:
        print(f"No API key: set NBA2KAPI_KEY or write it to {NBA2KAPI_KEY_FILE}")
        if args.apply:
            post_alert(["No nba2kapi key on the box -- ratings are not being refreshed."])
        return 1
    try:
        api = fetch_current_players(key)
    except Exception as e:
        print(f"nba2kapi fetch failed: {e}")
        if args.apply:
            post_alert([f"nba2kapi fetch failed: {e}. Ratings were not refreshed."])
        return 1
    print(f"nba2kapi: {len(api)} current players")
    if len(api) < MIN_CURRENT_PLAYERS:
        print(f"Refusing to sync: fewer than {MIN_CURRENT_PLAYERS} players")
        if args.apply:
            post_alert([f"nba2kapi returned only {len(api)} current players (expected {MIN_CURRENT_PLAYERS}+). "
                        "Nothing was merged."])
        return 1

    newest = max((p.get("lastUpdated") or "" for p in api), default="")
    if newest:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(newest.replace("Z", "+00:00"))
        print(f"  newest lastUpdated {newest[:10]} ({age.days} days ago)")
        if age.days > STALE_DAYS:
            alerts.append(f"nba2kapi's data is {age.days} days old (newest update {newest[:10]}). "
                          "It may have lost access to 2kratings.")

    by_page = {}
    for p in api:
        by_page.setdefault(page_slug(p), p)
    # Display name -> player, only where the name is unique in the feed.
    name_counts = {}
    for p in api:
        n = clean_slug(p.get("name") or "")
        name_counts.setdefault(n, []).append(p)
    by_name = {n: ps[0] for n, ps in name_counts.items() if n and len(ps) == 1}

    if args.slugs:
        targets = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        try:
            fa = load_fa_pool_slugs()
        except Exception as e:
            print(f"  WARN: failed to fetch FA pool from {API_BASE}: {e}")
            fa = set()
        targets = sorted(set(existing) | set(team_map) | fa)
    print(f"Looking up {len(targets)} players...")

    results, unmatched, junk_positions = {}, [], []
    for slug in targets:
        if slug in MANUAL_SKIP:
            continue
        last = existing.get(slug, [None])[-1]
        p, via = match_player(slug, bios.get(slug), last, by_page, by_name)
        if not p:
            unmatched.append(slug)
            continue
        attrs = convert_attrs(p.get("attributes"))
        if not attrs:
            unmatched.append(slug)
            continue
        if last:
            for k in CARRIED_ATTRS:
                if k in last.get("attributes", {}) and k not in attrs:
                    attrs[k] = last["attributes"][k]
        positions, dropped = clean_positions(p.get("positions"))
        if dropped:
            junk_positions.append((slug, p.get("positions"), positions))
        if not positions and last:
            positions = last.get("2k_pos") or []
        results[slug] = {
            "date": today,
            "2k_name": p.get("name"), "2k_ovr": p.get("overall"), "2k_pos": positions,
            "source_slug": page_slug(p), "match_method": via,
            "attributes": attrs, "badges": convert_badges(p.get("badges")), "team": team_map.get(slug),
        }

    print(f"\nMatched {len(results)}/{len(targets)}.")
    if junk_positions:
        print(f"\n{len(junk_positions)} invalid position value(s) dropped:")
        for slug, raw, kept in junk_positions:
            print(f"  {slug}: {raw} -> {kept}")
    rostered_unmatched = sorted(s for s in unmatched if s in team_map)
    if unmatched:
        print(f"\n{len(unmatched)} not in the feed ({len(rostered_unmatched)} rostered):")
        for slug in unmatched:
            team = team_map.get(slug)
            print(f"  {slug} ({bios.get(slug, {}).get('name', '?')}){' ' + team if team else ''}")

    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    preview_path = SCRATCH_DIR / "player-attributes-preview.json"
    preview_path.write_text(json.dumps(results, indent=2))
    print(f"\nPreview written to {preview_path}")

    def _is_stub(slug, entry):
        """(is_stub, reason) -- see STUB_OVR_THRESHOLD / DIVERGENCE_THRESHOLD above."""
        ovr = entry.get("2k_ovr")
        try:
            if int(ovr) < STUB_OVR_THRESHOLD:
                return True, f"2K OVR {ovr} looks like a not-yet-rated stub (< {STUB_OVR_THRESHOLD})"
        except (TypeError, ValueError):
            pass
        real = [s for s in existing.get(slug, []) if not s.get("ovr_stub")]
        if not real:
            return False, None
        last_snap = real[-1]
        old_avg = _avg_attrs(last_snap.get("attributes", {}))
        new_avg = _avg_attrs(entry.get("attributes", {}))
        try:
            old_ovr, new_ovr = int(last_snap["2k_ovr"]), int(ovr)
        except (TypeError, ValueError):
            return False, None
        if old_avg is None or new_avg is None:
            return False, None
        divergence = (new_ovr - old_ovr) - (new_avg - old_avg)
        if abs(divergence) >= DIVERGENCE_THRESHOLD:
            return True, (f"OVR moved {new_ovr - old_ovr:+d} vs an essentially flat attribute "
                          f"average ({new_avg - old_avg:+.1f}); divergence {divergence:+.1f} "
                          f">= {DIVERGENCE_THRESHOLD}")
        return False, None

    merged = dict(existing)
    appended, unchanged, stubs = 0, 0, 0
    for slug, entry in results.items():
        history = list(merged.get(slug, []))
        last = history[-1] if history else None
        if (last and last["2k_ovr"] == entry["2k_ovr"]
                and last["attributes"] == entry["attributes"]
                and last.get("2k_pos") == entry["2k_pos"]
                and badge_set(last.get("badges")) == badge_set(entry["badges"])):
            unchanged += 1
            continue
        is_stub, stub_reason = _is_stub(slug, entry)
        entry = dict(entry)
        entry["ovr_stub"] = is_stub
        if is_stub:
            stubs += 1
            print(f"  STUB {slug}: {stub_reason}")
        if not last:
            print(f"  NEW {slug}: {entry['2k_ovr']} {'/'.join(entry['2k_pos'])}")
        else:
            if last["2k_ovr"] != entry["2k_ovr"]:
                print(f"  OVR {slug}: {last['2k_ovr']} -> {entry['2k_ovr']}")
            changed_attrs = {
                k: (last["attributes"].get(k), v)
                for k, v in entry["attributes"].items()
                if last["attributes"].get(k) != v
            }
            if changed_attrs:
                print(f"  CHANGED {slug}: {changed_attrs}")
            if last.get("2k_pos") != entry["2k_pos"]:
                print(f"  POSITION CHANGED {slug}: {last.get('2k_pos')} -> {entry['2k_pos']}")
            old_b, new_b = badge_set(last.get("badges")), badge_set(entry["badges"])
            if old_b != new_b:
                prev_tiers = {n: t for n, t, _ in old_b}
                new_tiers = {n: t for n, t, _ in new_b}
                gained = set(new_tiers) - set(prev_tiers)
                lost = set(prev_tiers) - set(new_tiers)
                retiered = {n: (prev_tiers[n], new_tiers[n]) for n in set(prev_tiers) & set(new_tiers)
                            if prev_tiers[n] != new_tiers[n]}
                if gained:
                    print(f"  BADGES GAINED {slug}: {sorted(gained)}")
                if lost:
                    print(f"  BADGES LOST {slug}: {sorted(lost)}")
                if retiered:
                    print(f"  BADGES RETIERED {slug}: {retiered}")
        # Our primary is frozen, so a new 2K primary only means the streamer
        # has one more thing to set in 2K.
        old_primary = (last.get("2k_pos") or [None])[0] if last else None
        new_primary = (entry["2k_pos"] or [None])[0]
        ours = (bios.get(slug, {}).get("position") or {}).get("primary")
        if new_primary and old_primary != new_primary and ours and ours != new_primary:
            print(f"  2K PRIMARY {slug}: 2K now {new_primary}, NBN primary stays {ours}")
        history.append(entry)
        merged[slug] = history
        appended += 1

    print(f"\n{appended} new snapshot(s), {unchanged} unchanged, {stubs} stub(s)")

    newly_unmatched = sorted(set(rostered_unmatched) - set(state.get("rostered_unmatched", [])))
    label = lambda s: f"{bios.get(s, {}).get('name', s)} ({team_map[s]})"
    never = [s for s in newly_unmatched if s not in existing]
    stale = [s for s in newly_unmatched if s in existing]
    if never:
        alerts.append(f"No 2K ratings for {len(never)} rostered player(s): {', '.join(map(label, never))}. "
                      "Their team pages show no primary position.")
    if stale:
        alerts.append(f"{len(stale)} rostered player(s) dropped out of the feed and keep their last ratings: "
                      f"{', '.join(map(label, stale))}.")
    if newly_unmatched:
        alerts.append("Usually 2kratings has no current page for them. If one does exist under another "
                      "name, add it to MANUAL_SLUG_OVERRIDES in build/scrape_2k_attributes.py.")

    if not args.apply:
        if alerts:
            print("\nWould alert:\n  " + "\n  ".join(alerts))
        print("\nDry run only -- rerun with --apply to merge into NBS_DATA_DIR/player-attributes.json")
        return 0

    OUT_FILE.write_text(json.dumps(merged, indent=2))
    print(f"Wrote {OUT_FILE} ({len(merged)} players total)")

    # Keep the site's OVR badge / roster tables (ovr-history.json, via
    # GET /api/ovr/current) in sync -- 2K is the authoritative OVR now.
    ovr_history = json.loads(OVR_HISTORY_FILE.read_text()) if OVR_HISTORY_FILE.exists() else {}
    ovr_synced, ovr_skipped_stub = 0, 0
    for slug, entry in results.items():
        ovr = entry.get("2k_ovr")
        if ovr is None:
            continue
        # Reuse the stub verdict the append loop stored on the snapshot -- an
        # "unchanged" player was never appended and so never flagged, but its
        # ovr already matches ovr_history's last entry and is skipped below.
        if merged.get(slug, [{}])[-1].get("ovr_stub"):
            ovr_skipped_stub += 1
            continue
        ovr_entries = ovr_history.get(slug, [])
        if ovr_entries and ovr_entries[-1]["ovr"] == ovr:
            continue
        if args.replace_last_ovr and ovr_entries:
            old = ovr_entries[-1]
            ovr_entries[-1] = {"date": entry["date"], "ovr": ovr}
            print(f"  REPLACED {slug} ovr-history last entry: {old['date']} {old['ovr']} -> {entry['date']} {ovr}")
        else:
            ovr_entries.append({"date": entry["date"], "ovr": ovr})
            ovr_entries.sort(key=lambda e: e["date"])
        ovr_history[slug] = ovr_entries
        ovr_synced += 1
    OVR_HISTORY_FILE.write_text(json.dumps(ovr_history, indent=2))
    print(f"Synced {ovr_synced} OVR change(s) into {OVR_HISTORY_FILE} ({ovr_skipped_stub} stub entries skipped)")

    SYNC_STATE_FILE.write_text(json.dumps({
        "last_run": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "feed_players": len(api),
        "feed_newest_update": newest,
        "matched": len(results),
        "appended": appended,
        "rostered_unmatched": rostered_unmatched,
    }, indent=2))
    post_alert(alerts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
