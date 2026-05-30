#!/usr/bin/env python3
"""
A1: Extract shared CSS into css/shared.css
Removes from each page:
  - *, *::before, *::after reset
  - body base rule (all standard variants)
  - a / a:hover link styles
  - thead th sortable header block + hover/active/sort-arrow/right (standard variants only)
"""
import re
import os
import sys

REPO = '/home/skim/projects/nbn-today'

PAGES = [
    'awards/index.html',
    'bet/index.html',
    'boxscores/index.html',
    'boxscores/submit/index.html',
    'calendar/index.html',
    'cap-settings/index.html',
    'changelog/index.html',
    'context/index.html',
    'draft/index.html',
    'free-agency/index.html',
    'frivolities/index.html',
    'h2h/index.html',
    'history/index.html',
    'hof/index.html',
    'how-to-rosters/index.html',
    'members/index.html',
    'members/profile/index.html',
    'nbntv-classics/index.html',
    'owners/index.html',
    'perry/index.html',
    'players/index.html',
    'proposals/index.html',
    'proposals/new/index.html',
    'proposals/view/index.html',
    'roles/index.html',
    'rookie-scale/index.html',
    'standings/index.html',
    'stats/highs/3pm/index.html',
    'stats/highs/a/index.html',
    'stats/highs/b/index.html',
    'stats/highs/index.html',
    'stats/highs/p/index.html',
    'stats/highs/r/index.html',
    'stats/highs/s/index.html',
    'stats/index.html',
    'stats/seasons/index.html',
    'stats/totals/3pm/index.html',
    'stats/totals/a/index.html',
    'stats/totals/b/index.html',
    'stats/totals/index.html',
    'stats/totals/p/index.html',
    'stats/totals/r/index.html',
    'stats/totals/s/index.html',
    'transactions/index.html',
    'trivia/index.html',
    'tradeblock/index.html',
]

# Exact single-line rules — safe to remove verbatim
EXACT_REMOVES = [
    '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n',
    '    a { color: #60a5fa; text-decoration: none; }\n',
    '    a:hover { text-decoration: underline; }\n',
    # Single-line body (standard 4rem)
    "    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #111827; color: #f3f4f6; min-height: 100vh; padding: 2rem 1rem 4rem; }\n",
    # Multi-line body (standard 4rem, all properties on separate lines)
    "    body {\n      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n      background: #111827;\n      color: #f3f4f6;\n      min-height: 100vh;\n      padding: 2rem 1rem 4rem;\n    }\n",
    # Single-line thead th (standard — no position:relative)
    '    thead th { padding: 0.7rem 1rem; text-align: left; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #374151; cursor: pointer; user-select: none; }\n',
    # Multi-line thead th (standard)
    '    thead th {\n      padding: 0.7rem 1rem;\n      text-align: left;\n      font-size: 0.7rem;\n      font-weight: 600;\n      letter-spacing: 0.06em;\n      text-transform: uppercase;\n      color: #6b7280;\n      border-bottom: 1px solid #374151;\n      cursor: pointer;\n      user-select: none;\n    }\n',
    # thead th sub-rules (standard exact values only — non-standard ones are left untouched)
    '    thead th:hover { color: #d1d5db; }\n',
    '    thead th[data-active="true"] { color: #93c5fd; }\n',
    '    thead th .sort-arrow { margin-left: 4px; font-size: 0.65rem; }\n',
    '    thead th.right { text-align: right; }\n',
]

# Standard body properties
BODY_EXPECTED = {
    'font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    'background': '#111827',
    'color': '#f3f4f6',
    'min-height': '100vh',
}

def remove_body_css(content):
    """Remove/simplify any multi-line body rule with only standard properties."""
    m = re.search(r'(\n    body \{)([^}]+)\}(\n)', content)
    if not m:
        return content

    props_text = m.group(2)
    normalized = re.sub(r'\s+', ' ', props_text).strip()
    props = {}
    for part in normalized.split(';'):
        part = part.strip()
        if ':' in part:
            k, v = part.split(':', 1)
            props[k.strip()] = v.strip()

    # All expected properties must match
    for key, val in BODY_EXPECTED.items():
        if props.get(key) != val:
            return content

    # Only padding is allowed as an extra property
    extra = set(props.keys()) - set(BODY_EXPECTED.keys()) - {'padding', ''}
    if extra:
        return content

    padding = props.get('padding', '2rem 1rem 4rem')

    if padding == '2rem 1rem 4rem':
        return content.replace(m.group(0), '\n')
    else:
        pb = padding.split()[-1]
        return content.replace(m.group(0), f'\n    body {{ padding-bottom: {pb}; }}\n')

def clean_blank_lines(content):
    """Collapse 3+ consecutive blank lines into 2."""
    return re.sub(r'\n{3,}', '\n\n', content)

def process(rel_path, dry_run=False):
    path = os.path.join(REPO, rel_path)
    if not os.path.exists(path):
        print(f'  SKIP (not found): {rel_path}')
        return

    with open(path) as f:
        original = f.read()

    content = original

    # Remove exact-match rules
    for rule in EXACT_REMOVES:
        content = content.replace(rule, '')

    # Remove/simplify multi-line body (handles varied formatting)
    content = remove_body_css(content)

    # Clean up excess blank lines left behind
    content = clean_blank_lines(content)

    if content == original:
        print(f'  unchanged: {rel_path}')
        return

    removed = sum(1 for r in EXACT_REMOVES if r in original and r not in content)
    if dry_run:
        print(f'  WOULD UPDATE ({removed} exact rules + body): {rel_path}')
        return

    with open(path, 'w') as f:
        f.write(content)
    print(f'  updated: {rel_path}')

dry = '--dry' in sys.argv
if dry:
    print('=== DRY RUN ===')

for p in PAGES:
    process(p, dry_run=dry)

print('Done.')
