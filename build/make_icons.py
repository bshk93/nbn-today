#!/usr/bin/env python3
"""Site icons, generated from logo.png.

logo.png is 3491x3831 and 574KB. It was the favicon on every page and the
homepage header image (drawn at ~44px), so every first visit downloaded it.
This writes small copies to icons/:

  favicon.png           48px, transparent  — the browser tab
  apple-touch-icon.png  180px on a navy tile — iOS "Add to Home Screen"
  icon-192.png, icon-512.png  transparent shield — the manifest's "any"
                        icon, what desktop installs show
  icon-maskable-512.png navy tile, shield inside the safe zone — the
                        manifest's "maskable" icon, what Android crops
  logo-header.webp      the homepage header logo, 2x its drawn size

The tile is a navy gradient around the shield's own navy, so the installed
app reads as one badge rather than a shield floating on a black square.

The <link> tags pointing at them are written into every page by
build/og_tags.py. Re-run after changing logo.png:  python3 build/make_icons.py
"""
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Tile gradient, top to bottom, either side of the shield's navy (#073266).
TILE_TOP = (20, 74, 140)
TILE_BOTTOM = (4, 28, 60)

out = ROOT / 'icons'
out.mkdir(exist_ok=True)
logo = Image.open(ROOT / 'logo.png').convert('RGBA')


def fit(size, pad):
    """The logo scaled into a size x size square, `pad` of it left as margin."""
    im = logo.copy()
    inner = round(size * (1 - 2 * pad))
    im.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas


def on_tile(size, pad):
    canvas = Image.new('RGBA', (size, size))
    draw = ImageDraw.Draw(canvas)
    for y in range(size):
        t = y / (size - 1)
        colour = tuple(round(a + (b - a) * t) for a, b in zip(TILE_TOP, TILE_BOTTOM))
        draw.line([(0, y), (size, y)], fill=colour + (255,))
    canvas.alpha_composite(fit(size, pad))
    return canvas.convert('RGB')


fit(48, 0.02).save(out / 'favicon.png', optimize=True)
# iOS rounds the corners itself; the shield's corners clear its radius.
on_tile(180, 0.09).save(out / 'apple-touch-icon.png', optimize=True)
fit(192, 0.04).save(out / 'icon-192.png', optimize=True)
fit(512, 0.04).save(out / 'icon-512.png', optimize=True)
# Android may crop to a circle of 80% diameter; 0.2 keeps the shield's top
# corners inside it.
on_tile(512, 0.2).save(out / 'icon-maskable-512.png', optimize=True)
header = logo.copy()
header.thumbnail((200, 200), Image.LANCZOS)
header.save(out / 'logo-header.webp', 'WEBP', quality=90, method=6)

for p in sorted(out.iterdir()):
    print(f'{p.relative_to(ROOT)}  {p.stat().st_size:,} bytes')
