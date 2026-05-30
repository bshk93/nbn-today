#!/usr/bin/env python3
"""Remove inline parseLine and parseCSV function definitions from HTML pages.
These are now provided globally by nav.js."""
import re
import os
import sys

REPO = '/home/skim/projects/nbn-today'

PAGES = [
    'bet/index.html',
    'draft/index.html',
    'frivolities/index.html',
    'h2h/index.html',
    'history/index.html',
    'hof/index.html',
    'nbntv-classics/index.html',
    'owners/index.html',
    'players/index.html',
    'standings/index.html',
    'stats/seasons/index.html',
    'tradeblock/index.html',
    'trivia/index.html',
]

def remove_function(content, func_name):
    """Remove a named JS function definition from content using brace counting."""
    pattern = re.compile(r'\n( *)function ' + re.escape(func_name) + r'\(')
    match = pattern.search(content)
    if not match:
        return content, False

    start = match.start()
    brace_start = content.find('{', match.end())
    if brace_start == -1:
        return content, False

    depth = 0
    i = brace_start
    while i < len(content):
        c = content[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                if end < len(content) and content[end] == '\n':
                    end += 1
                return content[:start] + content[end:], True
        i += 1
    return content, False

def process(rel_path, dry_run=False):
    path = os.path.join(REPO, rel_path)
    if not os.path.exists(path):
        print(f'  SKIP (not found): {rel_path}')
        return

    with open(path) as f:
        original = f.read()

    content = original
    removed = []

    for func in ('parseLine', 'parseCSV'):
        content, did_remove = remove_function(content, func)
        if did_remove:
            removed.append(func)

    if content == original:
        print(f'  unchanged: {rel_path}')
        return

    if dry_run:
        print(f'  WOULD REMOVE {removed} from: {rel_path}')
        return

    with open(path, 'w') as f:
        f.write(content)
    print(f'  removed {removed} from: {rel_path}')

dry = '--dry' in sys.argv
if dry:
    print('=== DRY RUN ===')

for p in PAGES:
    process(p, dry_run=dry)

print('Done.')
