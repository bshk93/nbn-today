#!/usr/bin/env python3
"""Small team logos for places that draw them at icon size.

logos/logo-{abbr}.png are 480px and ~1.5MB for all 30. A row of 30 logos at
30px (the homepage team strip) would download all of it. This writes
logos/sm/logo-{abbr}.webp at 96px (3x a 32px icon), ~116KB for all 30,
and logos/md/logo-{abbr}.webp at 280px for the team page header.

A logo that vanishes on the default dark page (Utah's is solid black) can
have a logos/logo-{abbr}-dark.png beside it: its thumbnail is drawn from that
instead. The 480px logo-{abbr}.png stays the original, since the places that
draw it (the team header, the champions banner, og cards) put it on a white
disc. css/theme.css turns the thumbnail back to black on the light themes.

Re-run after changing a logo:  python3 build/make_logo_thumbs.py
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIZE = 96
# The team page header draws the logo at 140px, so 280px is 2x. Always from the
# original, never the -dark variant: the header puts it on a white disc.
HEADER_SIZE = 280

out = ROOT / 'logos' / 'sm'
out.mkdir(exist_ok=True)
md = ROOT / 'logos' / 'md'
md.mkdir(exist_ok=True)
for src in sorted((ROOT / 'logos').glob('logo-*.png')):
    if src.stem.endswith('-dark'):
        continue
    dark = src.with_name(src.stem + '-dark.png')
    im = Image.open(dark if dark.exists() else src).convert('RGBA')
    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
    im.save(out / (src.stem + '.webp'), 'WEBP', quality=90, method=6)
    print(out / (src.stem + '.webp'))
    im = Image.open(src).convert('RGBA')
    im.thumbnail((HEADER_SIZE, HEADER_SIZE), Image.LANCZOS)
    im.save(md / (src.stem + '.webp'), 'WEBP', quality=90, method=6)
    print(md / (src.stem + '.webp'))
