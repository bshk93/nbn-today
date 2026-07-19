#!/usr/bin/env python3
"""
Scrape per-attribute NBA 2K ratings from 2kratings.com and write/update
/var/lib/nothing-but-stats/player-attributes.json.

Matching strategy (skipped entirely in --refresh mode, see below):
  1. Build an index of "current" player slugs from 2kratings' own sitemaps
     (post-sitemap1/2/3), filtering out historical year/team-specific pages.
  2. For each target player, derive candidate slugs from their bio name
     (first-last, plus -jr/-sr/-ii/-iii/-iv variants) and match against
     the sitemap index with zero network calls.
  3. Anything still unmatched is tried live (rate-limited GETs of the
     candidate URLs), verifying the fetched page's last name matches.
  4. Still unmatched: fall back to a last-name-only lookup in the sitemap
     index, filtered to candidates whose first-name token is a nickname
     match (either name is a prefix of the other -- Herb/Herbert, Cam/
     Cameron, Rob/Robert, etc.), and live-verified the same way.
  5. Each matched player's page embeds a JSON-LD block with the full
     attribute list under Person.additionalProperty -- no HTML scraping
     needed for the values themselves.

Player selection:
  --slugs a,b,c   Only these NBN slugs (looked up in player-bios.json;
                  does NOT require the player to be on a roster -- use
                  this for one-off / free-agent / not-yet-rostered players).
  --refresh       Re-fetch players ALREADY in player-attributes.json, using
                  their stored source_slug directly (skips all matching --
                  use this to pick up rating changes/updates). Combine with
                  --slugs to refresh only specific players.
  (default)       Every currently rostered player (data/*-roster.csv).

Storage format:
  player-attributes.json is keyed by NBN slug -> a LIST of snapshots
  (append-only, oldest first), mirroring ovr-history.json's shape. Each
  snapshot also carries "2k_pos" (list of 2K position abbreviations, e.g.
  ["PG", "SG"], scraped from the page header -- not part of the JSON-LD
  attribute block). A new snapshot is only appended when the 2K OVR, any
  attribute value, or the position list has actually changed since the
  last recorded snapshot for that player -- re-running --refresh with no
  real-world rating change is a no-op, so the file only grows when
  something meaningful happened.

Writing:
  Dry run by default -- writes a preview JSON to scratch, does not touch
  NBS_DATA_DIR. Pass --apply to merge results into the real output file
  (existing entries/history for players outside this run's scope are
  preserved; for players in scope, a snapshot is appended only if changed).
"""
import argparse
import csv
import glob
import json
import re
import time
import urllib.request
from pathlib import Path

DATA_DIR = Path("/var/lib/nothing-but-stats")
REPO_DIR = Path("/home/skim/projects/nbn-today")
OUT_FILE = DATA_DIR / "player-attributes.json"
BIOS_FILE = DATA_DIR / "player-bios.json"
# The site's OVR badge / roster-table OVR column read this file (via
# GET /api/ovr/current) independently of player-attributes.json. 2K is the
# authoritative OVR source now, so every apply keeps this in sync too --
# same append-only-on-change shape it already had under manual entry.
OVR_HISTORY_FILE = DATA_DIR / "ovr-history.json"
SCRATCH_DIR = Path(
    "/tmp/claude-1000/-home-skim-projects-nbn-today/6d79f28f-056c-4e22-80a6-2c0a01f15d24/scratchpad"
)

SITEMAPS = [
    "https://www.2kratings.com/post-sitemap1.xml",
    "https://www.2kratings.com/post-sitemap2.xml",
    "https://www.2kratings.com/post-sitemap3.xml",
]

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

REQUEST_DELAY = 1.3  # seconds between live requests, be polite
SUFFIX_RE = re.compile(r'\b(JR|SR|II|III|IV)\.?$')

# Manual overrides for name-matching exceptions the automated tiers can't
# resolve (e.g. acronym-style nicknames that aren't a prefix/suffix of the
# real name). Checked before all other tiers, so this persists across both
# --refresh (which just reuses whatever source_slug got stored) and any
# future full re-match.
MANUAL_SLUG_OVERRIDES = {
    "prosper-omax": "olivier-maxence-prosper",  # "Omax" = OlivierMAXence, not a substring
}

# Known players 2kratings has no fixable current-page match for (e.g. no
# current-season card exists, only historical archive pages we deliberately
# won't serve as if current). Skipped without wasting requests on retries.
MANUAL_SKIP = {
    "paul-chris": "no current 2K27 page on 2kratings (chris-paul/-2 both dead-end into "
                  "historical archive pages only -- not a matching bug)",
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


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


def build_sitemap_index():
    locs = []
    for url in SITEMAPS:
        try:
            status, body = fetch(url)
        except Exception as e:
            print(f"  WARN: failed to fetch {url}: {e}")
            continue
        locs += re.findall(r"<loc>([^<]+)</loc>", body)
        time.sleep(0.5)
    index = set()
    for u in locs:
        slug = u.rstrip("/").split("/")[-1]
        if re.search(r"\d{4}-\d{2}", slug):
            continue
        if any(ch.isdigit() for ch in slug):
            continue
        if "all-time" in slug or "all-decade" in slug:
            continue
        index.add(slug)
    return index


def load_roster_slugs():
    slugs = set()
    for f in sorted(glob.glob(str(REPO_DIR / "data" / "*-roster.csv"))):
        with open(f) as fh:
            for row in csv.DictReader(fh):
                s = row.get("SLUG", "").strip()
                if s:
                    slugs.add(s)
    return slugs


def extract_attributes(html):
    blocks = re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, re.S
    )
    for block in blocks:
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        for node in data.get("@graph", []):
            props = node.get("additionalProperty")
            if not props:
                continue
            name = node.get("name", "")
            attrs, ovr = {}, None
            for p in props:
                pname = p.get("name", "")
                val = p.get("value")
                if pname.endswith("Rating"):
                    ovr = val
                elif pname.endswith(" Attribute"):
                    key = clean_slug(pname[: -len(" Attribute")]).replace("-", "_")
                    attrs[key] = val
            if attrs:
                return name, ovr, attrs
    return None, None, {}


# The player's position(s) live outside the JSON-LD block, in the page's
# header info list, e.g.:
#   Position: <a href="/lists/point-guard">PG</a> / <a href="/lists/shooting-guard">SG</a>
POSITION_BLOCK_RE = re.compile(r'Position:\s*(.*?)</p>', re.S)
POSITION_ABBR_RE = re.compile(r'>([A-Z]{1,2})</a>')


def extract_position(html):
    m = POSITION_BLOCK_RE.search(html)
    if not m:
        return []
    return POSITION_ABBR_RE.findall(m.group(1))


def fetch_2k_page(twok_slug):
    """GET a 2kratings player page and extract (name, ovr, attrs, positions), rate-limited."""
    url = f"https://www.2kratings.com/{twok_slug}"
    try:
        status, html = fetch(url)
    except Exception:
        status, html = None, ""
    time.sleep(REQUEST_DELAY)
    if status != 200:
        return status, None, None, {}, []
    name, ovr, attrs = extract_attributes(html)
    positions = extract_position(html)
    return status, name, ovr, attrs, positions


def match_player(slug, bio, index):
    """Return (twok_slug, via, name, ovr, attrs, positions) or None if no match found."""
    if slug in MANUAL_SLUG_OVERRIDES:
        override = MANUAL_SLUG_OVERRIDES[slug]
        status, name, ovr, attrs, positions = fetch_2k_page(override)
        if status == 200:
            return override, "manual-override", name, ovr, attrs, positions

    cands, first_clean, last_clean = candidate_slugs(bio["name"])

    # Tier 1: sitemap index, zero network calls
    hit = next((c for c in cands if c in index), None)
    if hit:
        status, name, ovr, attrs, positions = fetch_2k_page(hit)
        if status == 200 and attrs:
            return hit, "sitemap", name, ovr, attrs, positions
        if status == 200:
            return hit, "sitemap-no-attrs", name, ovr, {}, positions

    # Tier 2: live-probe the deterministic candidates directly
    for c in cands:
        status, name, ovr, attrs, positions = fetch_2k_page(c)
        if status == 200 and name and last_clean in clean_slug(name):
            if attrs:
                return c, "live-fallback", name, ovr, attrs, positions
            return c, "live-fallback-no-attrs", name, ovr, {}, positions

    # Tier 3: last-name lookup in sitemap index, filtered by nickname
    # containment (Herb/Herbert, Cam/Cameron, Rob/Robert, ...)
    same_last = [s for s in index if s.split("-")[-1] == last_clean]
    def nickname_match(cand):
        cand_first = cand.rsplit("-", 1)[0].replace("-", "")
        return cand_first.startswith(first_clean) or first_clean.startswith(cand_first)
    for c in [s for s in same_last if nickname_match(s)]:
        status, name, ovr, attrs, positions = fetch_2k_page(c)
        if status == 200 and name and last_clean in clean_slug(name) and attrs:
            return c, "nickname-lastname-fallback", name, ovr, attrs, positions

    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="merge results into NBS_DATA_DIR (default: dry run)")
    ap.add_argument("--limit", type=int, default=None, help="only process first N players (testing)")
    ap.add_argument("--slugs", type=str, default=None, help="comma-separated NBN slugs to target (need not be rostered)")
    ap.add_argument("--refresh", action="store_true", help="re-fetch players already in player-attributes.json via their stored source_slug (skips matching)")
    args = ap.parse_args()

    bios = json.loads(BIOS_FILE.read_text())
    existing = json.loads(OUT_FILE.read_text()) if OUT_FILE.exists() else {}

    if args.refresh:
        targets = sorted(existing.keys())
        if args.slugs:
            wanted = {s.strip() for s in args.slugs.split(",") if s.strip()}
            targets = [s for s in targets if s in wanted]
            missing = wanted - set(targets)
            if missing:
                print(f"  WARN: not in player-attributes.json yet (skip --refresh, use --slugs alone instead): {sorted(missing)}")
        if args.limit:
            targets = targets[: args.limit]
        print(f"Refreshing {len(targets)} existing players via stored source_slug...")

        results, failures = {}, []
        for i, slug in enumerate(targets):
            last = existing[slug][-1]
            twok_slug = last["source_slug"]
            status, name, ovr, attrs, positions = fetch_2k_page(twok_slug)
            if status == 200 and attrs:
                results[slug] = {
                    "date": time.strftime("%Y-%m-%d"),
                    "2k_name": name, "2k_ovr": ovr, "2k_pos": positions,
                    "source_slug": twok_slug, "match_method": last["match_method"],
                    "attributes": attrs,
                }
            else:
                failures.append((slug, twok_slug, status))
            if (i + 1) % 25 == 0:
                print(f"  ...{i + 1}/{len(targets)} refreshed")

        print(f"\nRefreshed {len(results)}/{len(targets)}.")
        if failures:
            print(f"{len(failures)} failed to refresh (page moved/gone?):")
            for slug, twok_slug, status in failures:
                print(f"  {slug} (was {twok_slug}): HTTP {status}")

    else:
        print("Building sitemap index...")
        index = build_sitemap_index()
        print(f"  {len(index)} current-style slugs found")

        if args.slugs:
            targets = [s.strip() for s in args.slugs.split(",") if s.strip()]
            print(f"Matching {len(targets)} specified player(s) (roster membership not required)...")
        else:
            targets = sorted(load_roster_slugs())
            print(f"Matching {len(targets)} rostered players...")
        if args.limit:
            targets = targets[: args.limit]

        results, failures = {}, []
        for i, slug in enumerate(targets):
            if slug in MANUAL_SKIP:
                failures.append((slug, f"known gap: {MANUAL_SKIP[slug]}"))
                continue
            bio = bios.get(slug)
            if not bio:
                failures.append((slug, "no bio entry"))
                continue
            m = match_player(slug, bio, index)
            if m is None:
                failures.append((slug, "no candidate matched (page may not exist yet)"))
                continue
            twok_slug, via, name, ovr, attrs, positions = m
            if not attrs:
                failures.append((slug, f"found {twok_slug} but 2K hasn't published attributes yet"))
                continue
            results[slug] = {
                "date": time.strftime("%Y-%m-%d"),
                "2k_name": name, "2k_ovr": ovr, "2k_pos": positions,
                "source_slug": twok_slug, "match_method": via,
                "attributes": attrs,
            }
            if (i + 1) % 25 == 0:
                print(f"  ...{i + 1}/{len(targets)} processed")

        print(f"\nDone. {len(results)}/{len(targets)} players with full attribute data.")
        if failures:
            print(f"\n{len(failures)} unresolved:")
            for slug, note in failures:
                bio_name = bios.get(slug, {}).get("name", "?")
                print(f"  {slug} ({bio_name}): {note}")

    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    preview_path = SCRATCH_DIR / "player-attributes-preview.json"
    preview_path.write_text(json.dumps(results, indent=2))
    print(f"\nPreview written to {preview_path}")

    if args.apply:
        merged = dict(existing)
        appended, unchanged = 0, 0
        for slug, entry in results.items():
            history = list(merged.get(slug, []))
            last = history[-1] if history else None
            if (last and last["2k_ovr"] == entry["2k_ovr"]
                    and last["attributes"] == entry["attributes"]
                    and last.get("2k_pos") == entry["2k_pos"]):
                unchanged += 1
                continue
            if last:
                changed_attrs = {
                    k: (last["attributes"].get(k), v)
                    for k, v in entry["attributes"].items()
                    if last["attributes"].get(k) != v
                }
                if changed_attrs:
                    print(f"  CHANGED {slug}: {changed_attrs}")
                if last.get("2k_pos") != entry["2k_pos"]:
                    print(f"  POSITION CHANGED {slug}: {last.get('2k_pos')} -> {entry['2k_pos']}")
            history.append(entry)
            merged[slug] = history
            appended += 1
        OUT_FILE.write_text(json.dumps(merged, indent=2))
        print(f"Appended {appended} new snapshots ({unchanged} unchanged, skipped) into {OUT_FILE} ({len(merged)} players total)")

        # Keep the site's OVR badge / roster tables (ovr-history.json, via
        # GET /api/ovr/current) in sync -- 2K is the authoritative OVR now.
        ovr_history = json.loads(OVR_HISTORY_FILE.read_text()) if OVR_HISTORY_FILE.exists() else {}
        ovr_synced = 0
        for slug, entry in results.items():
            ovr = entry.get("2k_ovr")
            if ovr is None:
                continue
            ovr_entries = ovr_history.get(slug, [])
            if ovr_entries and ovr_entries[-1]["ovr"] == ovr:
                continue
            ovr_entries.append({"date": entry["date"], "ovr": ovr})
            ovr_entries.sort(key=lambda e: e["date"])
            ovr_history[slug] = ovr_entries
            ovr_synced += 1
        OVR_HISTORY_FILE.write_text(json.dumps(ovr_history, indent=2))
        print(f"Synced {ovr_synced} OVR change(s) into {OVR_HISTORY_FILE}")
    else:
        print("Dry run only -- rerun with --apply to merge into NBS_DATA_DIR/player-attributes.json")


if __name__ == "__main__":
    main()
