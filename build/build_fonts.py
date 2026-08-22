#!/usr/bin/env python3
"""Rebuild the subset Inter faces in fonts/.

    python3 build/build_fonts.py

Downloads the upstream Inter release, subsets both variable faces, and writes
them to fonts/. The output is committed — this is not part of the site build
and nothing runs it on a timer. Re-run it only to move Inter versions or to
widen the character set.

Needs `fonttools` and `brotli` (`pip install fonttools brotli`).

**Where the subset line is drawn, and what each range costs.** Measured on
the roman face, so the trade-offs are on the record rather than guessed:

    base (Latin-1 + punctuation + arrows + shapes)   78,688
    + Latin Extended-A          (U+0100-017F)        86,328   +7.6K
    + combining marks           (U+0300-036F)       110,040  +23.7K
    + Latin Extended-B          (U+0180-024F)       142,540  +32.5K

Only the first two are kept. Extended-A is cheap and is where essentially
every European sports name lives (č ć š ž ģ ņ ū ł ő ş ğ ı đ), so a name like
Dončić renders whole rather than falling back mid-word on one letter. The
other two are dropped: our text is precomposed, so combining marks are dead
weight, and Extended-B is 32K for Romanian ș/ț when the cedilla forms ş/ţ
that Extended-A already carries are the common spelling.

Worth being straight about: **no name in player-bios.json is non-ASCII
today** — all 1,026 of them are plain Latin, and the only accented character
anywhere in the bios is the ç in "Fenerbahçe", which Latin-1 already covers.
Extended-A is insurance against the next bio that isn't, priced at 7.6K.
If that never happens it is the cheapest range here to remove.

Deliberately NOT included: emoji, and the CJK/Thai/Arabic/Devanagari/Hebrew
in the multi-language greeting. Inter has none of them anyway, and they
already fall back to the system's emoji and CJK fonts.

Ten codepoints the UI does use are absent from Inter itself and fall back per
glyph: ★ ⓘ ⇄ ▴ ▾ ▸ ▤ ✕ ⋯ ℹ. Worth knowing before chasing a rendering
inconsistency around one of them.

Features are pruned to what the site asks for. `tnum` is the load-bearing
one — the stat tables ask for `font-variant-numeric: tabular-nums` in 164
places, and it was doing nothing before Inter arrived.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

VERSION = '4.1'
URL = f'https://github.com/rsms/inter/releases/download/v{VERSION}/Inter-{VERSION}.zip'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'fonts')

UNICODES = ','.join([
    'U+0020-007E',   # Basic Latin
    'U+00A0-00FF',   # Latin-1 Supplement — carries § ¥ · × ÷
    'U+0100-017F',   # Latin Extended-A — see the cost table above
    'U+02BB-02BC', 'U+02C6', 'U+02DA', 'U+02DC',
    'U+2000-206F',   # general punctuation — – — ’ “ ” • …
    'U+20A0-20BF',   # currency
    'U+2122', 'U+2139',
    'U+2190-21FF',   # arrows
    'U+2212', 'U+2248', 'U+2264-2265', 'U+22EF',
    'U+24D8',
    'U+25A0-25FF',   # geometric shapes — sort triangles, bullets
    'U+2713', 'U+2715', 'U+2717',
    'U+FEFF', 'U+FFFD',
])

FEATURES = 'kern,liga,calt,ccmp,locl,mark,mkmk,tnum,case,zero'

FACES = [
    ('web/InterVariable.woff2', 'InterVariable.subset.woff2'),
    ('web/InterVariable-Italic.woff2', 'InterVariable-Italic.subset.woff2'),
]


def main():
    try:
        import fontTools  # noqa: F401
        import brotli     # noqa: F401
    except ImportError as e:
        sys.exit(f'missing dependency: {e.name} (pip install fonttools brotli)')

    os.makedirs(DEST, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        zip_path = os.path.join(tmp, 'inter.zip')
        print(f'downloading Inter {VERSION}…')
        urllib.request.urlretrieve(URL, zip_path)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(tmp)

        license_src = os.path.join(tmp, 'LICENSE.txt')
        if not os.path.exists(license_src):
            sys.exit('no LICENSE.txt in the release — Inter is OFL and it must ship with the fonts')
        shutil.copy(license_src, os.path.join(DEST, 'LICENSE.txt'))

        for src, out in FACES:
            src_path = os.path.join(tmp, src)
            dst_path = os.path.join(DEST, out)
            subprocess.run([
                sys.executable, '-m', 'fontTools.subset', src_path,
                f'--unicodes={UNICODES}',
                f'--layout-features={FEATURES}',
                '--flavor=woff2',
                f'--output-file={dst_path}',
                '--desubroutinize',
                '--drop-tables+=DSIG',
            ], check=True)
            print(f'  {out:34} {os.path.getsize(dst_path):>8,} bytes')

    print('done — both faces keep their wght (100–900) and opsz (14–32) axes')


if __name__ == '__main__':
    main()
