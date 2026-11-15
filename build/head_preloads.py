#!/usr/bin/env python3
"""Give every page static preloads for the shared stylesheets and fonts.

    python3 build/head_preloads.py            # write the block
    python3 build/head_preloads.py --check    # fail if any page is missing it or stale

The shared sheets reach a page through @import, four levels deep, and the
fonts only after those. `theme-boot.js` preloads them all, but a script can
only add a preload once it has downloaded and run, and it was fetched beside
every other script on the page: measured on the homepage, the sheets and
fonts started about 420ms after the page's first requests. A `<link
rel="preload">` written into the HTML is found by the browser's preload
scanner while the page is still arriving, with no script in front of it.

The block goes immediately before `<script src="/theme-boot.js">`, on every
page that loads it. The list is read out of `theme-boot.js` itself (its two
`[...].forEach` arrays), so there is one list: add a sheet there and this
script puts it on every page. theme-boot.js's own preloads stay as the
fallback, and it skips them when it finds this block (`data-nbn-preload`).

Re-runnable: an existing NBN:preload block is replaced, never duplicated.
--check runs from the pre-commit hook.
"""
import pathlib
import re
import sys

CHECK = '--check' in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent.parent
BOOT = ROOT / 'theme-boot.js'
TAG = '<script src="/theme-boot.js"></script>'
BEGIN = '<!-- NBN:preload (build/head_preloads.py) -->'
END = '<!-- /NBN:preload -->'
SKIP_DIRS = {'.git', 'node_modules', 'vendor', 'tests'}


def lists():
    """The sheet and font names, in theme-boot.js's order."""
    src = BOOT.read_text()
    arrays = re.findall(r"\[((?:\s*'[^']+'\s*,?)+)\]\s*\.forEach", src)
    if len(arrays) != 2:
        sys.exit(f'head_preloads: expected 2 name lists in {BOOT.name}, found {len(arrays)}')
    sheets, fonts = (re.findall(r"'([^']+)'", a) for a in arrays)
    return sheets, fonts


def block(indent):
    sheets, fonts = lists()
    lines = [BEGIN]
    lines += [f'<link rel="preload" href="/css/{n}.css" as="style" data-nbn-preload>' for n in sheets]
    lines += [f'<link rel="preload" href="/fonts/{n}.woff2" as="font" type="font/woff2" crossorigin data-nbn-preload>'
              for n in fonts]
    lines.append(END)
    return ''.join(indent + l + '\n' for l in lines)


OLD = re.compile(r'[ \t]*' + re.escape(BEGIN) + r'.*?' + re.escape(END) + r'[ \t]*\n', re.S)


def pages():
    for p in sorted(ROOT.rglob('*.html')):
        if SKIP_DIRS & set(p.relative_to(ROOT).parts):
            continue
        yield p


def main():
    stale, written = [], 0
    for p in pages():
        text = p.read_text()
        if TAG not in text:
            continue
        stripped = OLD.sub('', text)
        line = next(l for l in stripped.splitlines() if TAG in l)
        indent = line[:len(line) - len(line.lstrip())]
        new = stripped.replace(line + '\n', block(indent) + line + '\n', 1)
        if new == text:
            continue
        if CHECK:
            stale.append(str(p.relative_to(ROOT)))
        else:
            p.write_text(new)
            written += 1
    if CHECK:
        if stale:
            print('Pages whose NBN:preload block is missing or stale:')
            for s in stale:
                print('  ' + s)
            sys.exit(1)
        return
    print(f'head_preloads: {written} page(s) written')


if __name__ == '__main__':
    main()
