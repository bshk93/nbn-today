#!/usr/bin/env python3
"""Site icons, generated from logo.png.

logo.png is 3491x3831 and 574KB. It was the favicon on every page and the
homepage header image (drawn at ~44px), so every first visit downloaded it.
This writes small copies to icons/:

  favicon.png           48px, transparent  — the browser tab
  apple-touch-icon.png  180px on the page colour — iOS "Add to Home Screen"
  icon-192.png, icon-512.png  same, for site.webmanifest (Android)
  logo-header.webp      the homepage header logo, 2x its drawn size

The <link> tags pointing at them are written into every page by
build/og_tags.py. Re-run after changing logo.png:  python3 build/make_icons.py
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
BG = (13, 14, 17, 255)   # --bg-page on the default dark theme, #0d0e11

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


def on_bg(size, pad):
    canvas = Image.new('RGBA', (size, size), BG)
    canvas.alpha_composite(fit(size, pad))
    return canvas.convert('RGB')


fit(48, 0.02).save(out / 'favicon.png', optimize=True)
on_bg(180, 0.12).save(out / 'apple-touch-icon.png', optimize=True)
# 512 keeps the logo inside Android's maskable safe zone (the middle 80%).
on_bg(192, 0.14).save(out / 'icon-192.png', optimize=True)
on_bg(512, 0.14).save(out / 'icon-512.png', optimize=True)
header = logo.copy()
header.thumbnail((200, 200), Image.LANCZOS)
header.save(out / 'logo-header.webp', 'WEBP', quality=90, method=6)

for p in sorted(out.iterdir()):
    print(f'{p.relative_to(ROOT)}  {p.stat().st_size:,} bytes')
