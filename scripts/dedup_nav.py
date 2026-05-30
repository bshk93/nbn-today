#!/usr/bin/env python3
"""
Remove inline nav CSS and nav HTML from all pages.
- Inserts <link rel="stylesheet" href="/css/shared.css"> in <head>
- Removes the inline .nav / .nav a / .nav a:hover CSS
- Replaces populated <nav class="nav">...</nav> with empty <nav class="nav"></nav>
- Adds <script src="/nav.js"></script> to pages that are missing it
"""
import re
import os
import sys

REPO = '/home/skim/projects/nbn-today'

# All pages that have inline nav CSS to remove
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

# Pages that need <script src="/nav.js"></script> added
NEED_NAVJS = {
    'boxscores/submit/index.html',
    'context/index.html',
    'how-to-rosters/index.html',
    'perry/index.html',
    'proposals/index.html',
    'proposals/new/index.html',
    'proposals/view/index.html',
}

def remove_nav_css(content):
    # Multi-line block: .nav {\n      ...\n    }\n
    content = re.sub(
        r'    \.nav \{\n(?:      [^\n]+\n)+    \}\n',
        '',
        content
    )
    # Single-line: .nav { ... }\n
    content = re.sub(r'    \.nav \{ [^}]*\}\n', '', content)
    # .nav a { ... }\n
    content = re.sub(r'    \.nav a \{ [^}]*\}\n', '', content)
    # .nav a:hover { ... }\n
    content = re.sub(r'    \.nav a:hover \{ [^}]*\}\n', '', content)
    return content

def empty_nav_html(content):
    """Replace populated nav HTML with empty <nav class="nav"></nav>."""
    # <nav class="nav"><a href="/">← Home</a></nav>
    content = content.replace(
        '<nav class="nav"><a href="/">← Home</a></nav>',
        '<nav class="nav"></nav>'
    )
    # <div class="nav"><a href="/">← Home</a></div>
    content = content.replace(
        '<div class="nav"><a href="/">← Home</a></div>',
        '<nav class="nav"></nav>'
    )
    # Unicode arrow variants
    content = content.replace(
        '<div class="nav"><a href="/">&#8592; Home</a></div>',
        '<nav class="nav"></nav>'
    )
    content = content.replace(
        '<nav class="nav"><a href="/">&#8592; Home</a></nav>',
        '<nav class="nav"></nav>'
    )
    return content

def add_shared_css_link(content):
    """Add shared.css link after the favicon link in <head>."""
    if '/css/shared.css' in content:
        return content
    return content.replace(
        '<link rel="icon" href="/logo.png">',
        '<link rel="icon" href="/logo.png">\n  <link rel="stylesheet" href="/css/shared.css">'
    )

def add_navjs(content):
    """Add nav.js before </body> if not already present."""
    if '<script src="/nav.js"></script>' in content:
        return content
    return content.replace('</body>', '  <script src="/nav.js"></script>\n</body>')

def process(rel_path, dry_run=False):
    path = os.path.join(REPO, rel_path)
    if not os.path.exists(path):
        print(f'  SKIP (not found): {rel_path}')
        return

    with open(path) as f:
        original = f.read()

    content = original
    content = add_shared_css_link(content)
    content = remove_nav_css(content)
    content = empty_nav_html(content)
    if rel_path in NEED_NAVJS:
        content = add_navjs(content)

    if content == original:
        print(f'  unchanged: {rel_path}')
        return

    if dry_run:
        print(f'  WOULD UPDATE: {rel_path}')
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
