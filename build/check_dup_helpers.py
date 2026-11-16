#!/usr/bin/env python3
"""Keep the shared helpers shared (nbn-data.js), and loaded where they're used.

Two checks, both run from the pre-commit hook:

1. **A ratchet on local copies.** Counts, per file, the local definitions of the
   helpers nbn-data.js provides (an HTML escaper, a CSV parser, the 30-team
   name map) plus displayName, which names.js's nbnPlayerName replaces. The
   counts in build/dup-helpers-baseline.json may only go down: a file that
   gains a copy, or a new file with one, fails. A copy that is now a one-line
   alias (`const esc = NBN.esc;`, `function parseCSV(t) { return NBN.parseCSV(t); }`)
   doesn't count. This exists because the last clean-up (scripts/dedup_csv.py)
   removed eleven parseCSV copies and they all came back.

2. **The script is loaded.** A page that uses `NBN.` — itself, or through a
   module it loads — must load /nbn-data.js, or that page throws on first use.

    python3 build/check_dup_helpers.py              # check
    python3 build/check_dup_helpers.py --update     # rewrite the baseline (after removing copies)
    python3 build/check_dup_helpers.py --report     # every file and its counts
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / 'build' / 'dup-helpers-baseline.json'
SKIP_DIRS = {'node_modules', '.git', 'tests', 'build', '.github'}
SKIP_FILES = {'nbn-data.js', 'names.js'}

HELPERS = {
    'esc':         r'(?:esc|escHtml|escapeHtml|escAttr)',
    'parseCSV':    r'parseCSV',
    'TEAMS':       r'TEAMS',
    'displayName': r'displayName',
}


def files():
    for p in ROOT.rglob('*'):
        if p.suffix in ('.html', '.js') and not (SKIP_DIRS & set(p.relative_to(ROOT).parts)):
            rel = str(p.relative_to(ROOT))
            if rel not in SKIP_FILES:
                yield rel, p.read_text(errors='ignore')


def counts(text):
    out = {}
    for key, name in HELPERS.items():
        n = 0
        for m in re.finditer(rf'(?m)^[ \t]*(?:function\s+{name}\s*\(|(?:const|let|var)\s+{name}\s*=\s*)([\s\S]{{0,80}})', text):
            tail = m.group(1)
            if re.match(r'(?:NBN\.|\w*\)\s*\{\s*return\s+(?:NBN\.|nbnPlayerName\())', tail):
                continue                     # an alias of the shared copy
            if key == 'TEAMS' and not tail.lstrip().startswith('{'):
                continue                     # a list of abbreviations, a different thing
            n += 1
        if n:
            out[key] = n
    return out


def check_loaded(all_files):
    mods = {rel for rel, t in all_files.items() if rel.endswith('.js') and 'NBN.' in t}
    problems = []
    for rel, t in all_files.items():
        if not rel.endswith('.html'):
            continue
        srcs = set(re.findall(r'<script src="/([^"]+)"', t))
        if ('NBN.' in t or srcs & mods) and 'src="/nbn-data.js"' not in t:
            problems.append(rel)
    return problems


def main():
    all_files = dict(files())
    now = {rel: c for rel, t in all_files.items() if (c := counts(t))}
    if '--report' in sys.argv:
        for rel in sorted(now):
            print(f'{rel}: {now[rel]}')
        print({k: sum(c.get(k, 0) for c in now.values()) for k in HELPERS})
        return 0
    if '--update' in sys.argv:
        BASELINE.write_text(json.dumps(now, indent=1, sort_keys=True) + '\n')
        print(f'wrote {BASELINE.relative_to(ROOT)}: {len(now)} files')
        return 0
    base = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    grew = [f'{rel}: {k} {base.get(rel, {}).get(k, 0)} -> {n}'
            for rel, c in now.items() for k, n in c.items() if n > base.get(rel, {}).get(k, 0)]
    unloaded = check_loaded(all_files)
    for g in grew:
        print(f'  new local copy of a shared helper: {g} (use NBN.* from nbn-data.js, or names.js for names)')
    for u in unloaded:
        print(f'  {u} uses NBN.* but does not load /nbn-data.js (add it right after theme-boot.js)')
    if grew or unloaded:
        return 1
    shrank = sum(n for c in base.values() for n in c.values()) - sum(n for c in now.values() for n in c.values())
    if shrank > 0:
        print(f'check_dup_helpers: {shrank} fewer local copies than the baseline; run with --update to lock that in')
    return 0


if __name__ == '__main__':
    sys.exit(main())
