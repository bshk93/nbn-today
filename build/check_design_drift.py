#!/usr/bin/env python3
"""Count the ways a page can drift from the design system, and refuse more.

    python3 build/check_design_drift.py            # check against the baseline
    python3 build/check_design_drift.py --report   # per-metric totals and worst files
    python3 build/check_design_drift.py --update   # lower the baseline to today's counts

The design system (docs/design-system.md) gives every page the same tokens and
components, but nothing stopped a page from writing `font-size: 0.82rem` or
`#fbbf24` again, and the site had collected 73 font sizes and ~600 hex colours
that way. This is a ratchet: each file's count of each metric may go down,
never up. It runs from the pre-commit hook.

**A count going up is the thing to fix, not the baseline.** Use the token or
component instead (`var(--text-sm)`, `var(--gold)`, `var(--radius)`,
`ui-badge`). `--update` only ever lowers numbers; a genuine exception needs
`--update --allow-increase` and a reason in the commit message.

A new file starts at zero, so a new page is held to the system from its first
commit.

What is counted, per file (html/js/css, excluding vendor/, tests/, build/ and
the 30 generated team-page shells):

  font_size  a literal size (`font-size: 13px`) instead of a --text-* token
             (em sizes, relative to their context, are not counted)
  hex        a literal colour; css/theme.css and the generated
             css/team-colors.css are where colours are *meant* to live, so
             they are not counted, and neither is <meta name="theme-color">,
             which can't take a CSS variable
  radius     a literal border-radius instead of --radius / --radius-sm
  gradient   any linear/radial/conic-gradient
  shadow     any box-shadow other than `none`
  emoji      emoji in markup and scripts, which the site uses as icons
  bare_page  a `class="page"` container that isn't on ui-page
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BASELINE = REPO / 'build' / 'design-drift-baseline.json'

SKIP_DIRS = {'vendor', 'tests', 'build', 'node_modules', '.git', '.claude'}
TEAM_SHELL = re.compile(r'^teams/[A-Z]{3}/')
NO_HEX = {'css/theme.css', 'css/team-colors.css', 'team-colors.js'}
THEME_META = re.compile(r'<meta name="theme-color"[^>]*>')
MASK = re.compile(r'(?:-webkit-)?mask(?:-image)?\s*:[^;]*;')

METRICS = {
    # A literal size in px or rem. An em size is relative to its context, which
    # is itself set from the scale, so it isn't counted.
    'font_size': re.compile(r'font-size\s*:\s*[0-9.]+(?:px|rem)\b'),
    'hex':       re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])'),
    # A literal corner. 50% is a circle (an avatar, a dot), a shape rather
    # than a corner style, so it isn't counted.
    'radius':    re.compile(r'border-radius\s*:\s*(?!50%)[0-9.]+(?:px|rem|em|%)'),
    # A gradient that paints something. Masks (the tab and ticker edge fades)
    # and repeating patterns (hatching) are not counted: they draw nothing.
    'gradient':  re.compile(r'(?<!repeating-)(?:linear|radial|conic)-gradient\('),
    # A literal elevation shadow. Insets (state stripes, rings) and the tokens
    # (--shadow-overlay, --focus-ring) are how shadows are meant to be written.
    'shadow':    re.compile(r'box-shadow\s*:(?!\s*(?:none\b|var\(|inset\b))'),
    'emoji':     re.compile('[\U0001F300-\U0001FAFF☀-➿⭐⭕]'),
    'bare_page': re.compile(r'class="page"'),
}


def files():
    for p in sorted(REPO.rglob('*')):
        if p.suffix not in ('.html', '.js', '.css') or not p.is_file():
            continue
        rel = p.relative_to(REPO).as_posix()
        if SKIP_DIRS & set(rel.split('/')[:-1]) or TEAM_SHELL.match(rel):
            continue
        yield rel, p


def measure():
    counts = {}
    for rel, p in files():
        text = p.read_text(encoding='utf-8', errors='ignore')
        row = {}
        for name, rx in METRICS.items():
            if name == 'hex' and rel in NO_HEX:
                continue
            if name == 'gradient':
                n = len(rx.findall(MASK.sub('', text)))
            elif name == 'hex':
                # The browser's theme-color meta can't take a CSS variable, so the
                # literal there is the one place a page needs a colour of its own.
                text_for = THEME_META.sub('', text)
                n = len(rx.findall(text_for))
            else:
                n = len(rx.findall(text))
            if n:
                row[name] = n
        if row:
            counts[rel] = row
    return counts


def totals(counts):
    t = {m: 0 for m in METRICS}
    for row in counts.values():
        for m, n in row.items():
            t[m] += n
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--update', action='store_true', help='lower the baseline to the current counts')
    ap.add_argument('--allow-increase', action='store_true', help='with --update: accept increases too')
    ap.add_argument('--report', action='store_true', help='print totals and the worst files')
    args = ap.parse_args()

    now = measure()
    base = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}

    if args.report:
        t = totals(now)
        b = totals(base)
        for m in METRICS:
            delta = t[m] - b[m]
            print(f'{m:10} {t[m]:6}  ({"+" if delta > 0 else ""}{delta} vs baseline)')
        for m in METRICS:
            worst = sorted(((row.get(m, 0), f) for f, row in now.items()), reverse=True)[:5]
            print(f'\n{m}: ' + ', '.join(f'{f} {n}' for n, f in worst if n))
        return 0

    worse = []
    for f, row in now.items():
        for m, n in row.items():
            was = base.get(f, {}).get(m, 0)
            if n > was:
                worse.append((f, m, was, n))

    if args.update:
        if worse and not args.allow_increase:
            for f, m, was, n in worse:
                print(f'  {f}: {m} {was} → {n}')
            print('\nRefusing to raise the baseline. Fix these, or pass --allow-increase with a reason.')
            return 1
        BASELINE.write_text(json.dumps(now, indent=1, sort_keys=True) + '\n')
        t = totals(now)
        print('baseline: ' + ', '.join(f'{m} {n}' for m, n in t.items()))
        return 0

    if worse:
        print('Design drift went up (docs/design-system.md):')
        for f, m, was, n in worse:
            print(f'  {f}: {m} {was} → {n}')
        print('\nUse the tokens and ui- components instead of literal values.')
        return 1
    lower = sum(1 for f, row in base.items() for m, n in row.items() if now.get(f, {}).get(m, 0) < n)
    if lower:
        print(f'design drift: {lower} count(s) below baseline — run build/check_design_drift.py --update to lock them in')
    return 0


if __name__ == '__main__':
    sys.exit(main())
