#!/usr/bin/env python3
"""Move the oldest changelog entries into changelog-archive.json.

/changelog fetched one 400 KB file for 980 entries, nearly all of them months
old. changelog.json now keeps the newest entries; the rest live in
changelog-archive.json, which the page loads only when someone asks for older
releases.

The move is a cut, not a re-serialization: both files are sliced at the line
where an entry starts, so every entry keeps its exact formatting (some span
several lines) and the diff is the entries that moved and nothing else. The
archive is append-only from the front: newer moved entries go above older ones.

    python3 build/archive_changelog.py                 # keep 150, if over 300
    python3 build/archive_changelog.py --keep 150 --over 0   # force a cut now

The pre-commit hook runs it after filling in the version, with the defaults,
so changelog.json stays between 150 and 300 entries without anyone thinking
about it. tests/changelog-archive.test.js checks the two files together.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRENT = ROOT / 'changelog.json'
ARCHIVE = ROOT / 'changelog-archive.json'
ENTRY_START = re.compile(r'^  \{ "version"', re.M)


def split_at(text: str, n: int) -> tuple[str, str]:
    """Text of the first n entries, and of the rest, each without the brackets."""
    starts = [m.start() for m in ENTRY_START.finditer(text)]
    end = text.rindex(']')
    if n >= len(starts):
        return text[starts[0]:end] if starts else '', ''
    return text[starts[0]:starts[n]], text[starts[n]:end]


def wrap(body: str) -> str:
    body = body.rstrip().rstrip(',')
    return '[\n' + body + '\n]\n' if body else '[\n]\n'


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--keep', type=int, default=150)
    ap.add_argument('--over', type=int, default=300, help='only cut when there are more entries than this')
    args = ap.parse_args()

    text = CURRENT.read_text()
    count = len(json.loads(text))
    if count <= args.over:
        return 0
    keep, moved = split_at(text, args.keep)
    old = ARCHIVE.read_text() if ARCHIVE.exists() else '[\n]\n'
    _, old_body = split_at(old, 0)
    archive_body = moved.rstrip().rstrip(',') + (',\n' + old_body if old_body.strip() else '')
    new_current, new_archive = wrap(keep), wrap(archive_body)
    # Nothing lost, nothing duplicated, order kept: refuse to write otherwise.
    before = json.loads(text) + json.loads(old)
    after = json.loads(new_current) + json.loads(new_archive)
    if before != after:
        raise SystemExit('archive_changelog: the cut would change the entries; nothing written')
    CURRENT.write_text(new_current)
    ARCHIVE.write_text(new_archive)
    print(f'archive_changelog: moved {count - args.keep} entries to {ARCHIVE.name}, kept {args.keep}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
