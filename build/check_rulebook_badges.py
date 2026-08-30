#!/usr/bin/env python3
"""Fails when the rulebook's 🔒/👁 badges disagree with what the code enforces.

The badges are the site's only answer to "is this rule actually enforced?",
and hand-maintaining them against code in another repo did not work — § 7.2
read 👁-only for two and a half weeks after Stepien went live, and by
2026-08-30 ten sections were enforced while still reading manual-only. The
manifest is `nbn-api/rulebook_coverage.py`, which computes the 🔒 half by
parsing every `CheckResult(...)` reachable from `_VALIDATORS`; this script is
what makes the page keep agreeing with it.

The badges stay literal in the HTML rather than being fetched at runtime, so
the canonical rules document needs no JS to be readable and an enforcement
change lands as a reviewable diff in the same commit as the code.

Only badges on a `<h3 class="sec-title">` are touched. The three that sit
elsewhere — the § 1.5 buyout bullet, the "Hard Cap Grace Period" sub-heading —
are claims about one clause, not one section, and the manifest has nothing to
say about them.

    python3 build/check_rulebook_badges.py            # report, exit 1 on drift
    python3 build/check_rulebook_badges.py --fix      # rewrite the badges
    python3 build/check_rulebook_badges.py --quiet    # only report problems
Exits 0 when the page agrees, 1 when it does not (or 0 after a --fix).
"""
import argparse
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RULEBOOK = REPO / "rulebook" / "index.html"

# The API repo sits beside this one. Overridable so a checkout elsewhere still
# works; absent, this is a skip rather than a failure — the site must stay
# buildable on a box that has no API checkout.
NBN_API = Path(os.environ.get("NBN_API_DIR", REPO.parent / "nbn-api"))

ENFORCED = '<span class="badge badge-enforced">🔒 system-enforced</span>'
MANUAL = '<span class="badge badge-manual">👁 manual review</span>'

# One section heading: the § number, then everything up to </h3>, badges included.
HEADING_RE = re.compile(
    r'(<h3 class="sec-title"><span class="sec-num">§\s*([0-9.a-z]+)</span>)(.*?)(</h3>)',
    re.S)
BADGE_RE = re.compile(r'\s*<span class="badge badge-(?:enforced|manual)">.*?</span>', re.S)


def load_manifest():
    sys.path.insert(0, str(NBN_API))
    import rulebook_coverage  # noqa: E402
    return rulebook_coverage.manifest()


def current_badges(body: str) -> tuple[bool, bool]:
    return "badge-enforced" in body, "badge-manual" in body


def rewrite(body: str, enforced: bool, manual: bool) -> str:
    """Strip the section's badges and re-emit them in a fixed order, leaving the
    heading text (and any markup in it) untouched."""
    text = BADGE_RE.sub("", body).rstrip()
    for want, badge in ((enforced, ENFORCED), (manual, MANUAL)):
        if want:
            text += " " + badge
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true",
                    help="rewrite the badges to match the manifest")
    ap.add_argument("--quiet", action="store_true", help="only report problems")
    args = ap.parse_args()

    if not (NBN_API / "rulebook_coverage.py").exists():
        print(f"skip: no rulebook_coverage.py under {NBN_API} — nothing to check against")
        return 0

    manifest = load_manifest()
    sections = manifest["sections"]
    html = RULEBOOK.read_text()

    drift, seen = [], set()

    def replace(m):
        head, sec, body, tail = m.groups()
        seen.add(sec)
        entry = sections.get(sec, {})
        want = (bool(entry.get("enforced")), bool(entry.get("manual")))
        have = current_badges(body)
        if have == want:
            return m.group(0)
        drift.append((sec, have, want, entry))
        return head + rewrite(body, *want) + tail if args.fix else m.group(0)

    fixed = HEADING_RE.sub(replace, html)

    unrepresented = sorted(set(sections) - seen)

    def label(pair):
        return ("🔒" if pair[0] else "") + ("👁" if pair[1] else "") or "(none)"

    for sec, have, want, entry in drift:
        reason = ", ".join(entry.get("checks", [])) or entry.get("enforced_by", "")
        print(f"§ {sec:6s} {label(have):8s} -> {label(want):8s} {reason[:90]}")
    if not args.quiet and not drift:
        print(f"rulebook badges agree with the manifest ({len(seen)} sections)")

    if unrepresented:
        print(f"\nmanifest names {len(unrepresented)} section(s) with no heading in "
              f"the rulebook: {', '.join(unrepresented)}")

    if args.fix and drift:
        RULEBOOK.write_text(fixed)
        print(f"\nrewrote {len(drift)} section badge(s) in {RULEBOOK.relative_to(REPO)}")
        return 0

    if drift or unrepresented:
        print(f"\n{len(drift)} section(s) disagree with the code. "
              f"Re-run with --fix, or fix the manifest in nbn-api/rulebook_coverage.py.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
