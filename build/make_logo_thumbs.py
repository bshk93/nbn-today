#!/usr/bin/env python3
"""Small team logos for places that draw them at icon size.

logos/logo-{abbr}.png are 480px and ~1.5MB for all 30. A row of 30 logos at
30px (the homepage team strip) would download all of it. This writes
logos/sm/logo-{abbr}.webp at 96px (3x a 32px icon), ~116KB for all 30.

Re-run after changing a logo:  python3 build/make_logo_thumbs.py
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIZE = 96

out = ROOT / 'logos' / 'sm'
out.mkdir(exist_ok=True)
for src in sorted((ROOT / 'logos').glob('logo-*.png')):
    im = Image.open(src).convert('RGBA')
    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
    im.save(out / (src.stem + '.webp'), 'WEBP', quality=90, method=6)
    print(out / (src.stem + '.webp'))
