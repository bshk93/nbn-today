#!/usr/bin/env python3
"""Render the link-preview cards that build/og_tags.py points every page at.

    python3 build/og_cards.py

Writes og-default.png (the crest card, used by every page that isn't a team)
and og/team-{abbr}.png for all 30 franchises. Output is committed to the repo —
this is not part of the site build, and nothing runs it on a timer. Re-run it
only when the logos, the palette or the layout below actually change.

Two things the team cards do that are worth keeping if this is ever rewritten:

- **The logo is cropped to its alpha bbox before it is fitted.** The source
  files in logos/ carry wildly different amounts of transparent padding, so
  scaling them as-is left some marks tiny and some overflowing into the text.
  Crop first, then fit the mark itself into a fixed square.
- **A dark mark gets a light plate under it.** Roughly a third of the logos
  (UTA, SAS, BKN, …) are black line art, which vanishes on a dark card. The
  plate is drawn only when the mark's mean luminance is genuinely low, so the
  colourful ones keep the flat dark background they look better on.
"""
import re
import pathlib
from collections import Counter

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent

W, H = 1200, 630                       # the Open Graph standard card size
BG_TOP, BG_BOT = (13, 20, 34), (17, 24, 39)   # around --bg-page
WHITE, MUTED, ACCENT = (243, 244, 246), (156, 163, 175), (59, 130, 246)
BRAND_NAVY = (7, 50, 102)              # sampled from logo.png
TAGLINE = 'Fantasy basketball GM simulation league'

FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

BOX, CX, CY = 360, 300, 315            # team mark fits in BOX², centred on (CX, CY)


def gradient():
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)],
               fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOT)))
    return im


def tracked(d, xy, text, font, fill, track=0):
    """PIL has no letter-spacing, and the small caps label needs it."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + track


def opaque_pixels(im):
    return [p[:3] for p in im.get_flattened_data() if p[3] > 200]


def dominant(px):
    """The logo's most-used real colour — skipping greys, near-black and near-white,
    which are backgrounds and outlines rather than the team's colour."""
    for c, _ in Counter(px).most_common(12):
        if max(c) - min(c) > 28 and 22 < sum(c) / 3 < 210:
            return c
    return BRAND_NAVY


def glow_over(tint, box):
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    ImageDraw.Draw(glow).ellipse(box, fill=tint)
    return Image.blend(gradient(), glow.filter(ImageFilter.GaussianBlur(120)), 0.26)


def wrapped(d, name, font, x0, max_lines=2):
    words, lines, cur = name.split(), [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if d.textlength(trial, font=font) > W - x0 - 70 and cur:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    lines.append(cur)
    while len(lines) > max_lines:      # never let a long name push off the card
        lines[-2] += ' ' + lines.pop()
    return lines


def default_card():
    card = glow_over(BRAND_NAVY, [-120, 40, 640, 700])

    logo = Image.open(ROOT / 'logo.png').convert('RGBA')
    lh = 430
    logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
    card.paste(logo, (108, (H - lh) // 2), logo)

    d = ImageDraw.Draw(card)
    x0 = 108 + logo.width + 78
    tracked(d, (x0, 132), 'NBN.TODAY', ImageFont.truetype(FB, 22), ACCENT, 5)
    f = ImageFont.truetype(FB, 74)
    tracked(d, (x0, 190), 'NOTHING', f, WHITE, 3)
    tracked(d, (x0, 272), 'BUT NET', f, WHITE, 3)
    d.line([(x0, 380), (x0 + 96, 380)], fill=ACCENT, width=5)
    d.text((x0, 408), TAGLINE, font=ImageFont.truetype(FR, 27), fill=MUTED)

    card.save(ROOT / 'og-default.png', optimize=True)


def team_cards():
    src = (ROOT / 'teams/team.js').read_text()
    block = re.search(r'const TEAMS = \{(.*?)\n\};', src, re.S).group(1)
    teams = dict(re.findall(r'(\w{3}):\s*"([^"]+)"', block))
    assert len(teams) == 30, f'expected 30 teams, parsed {len(teams)}'

    out = ROOT / 'og'
    out.mkdir(exist_ok=True)

    for ab, name in sorted(teams.items()):
        logo = Image.open(ROOT / f'logos/logo-{ab.lower()}.png').convert('RGBA')
        logo = logo.crop(logo.getchannel('A').getbbox())
        px = opaque_pixels(logo)
        luminance = sum(sum(p) / 3 for p in px) / len(px)

        card = glow_over(dominant(px), [CX - 460, CY - 350, CX + 340, CY + 350])

        if luminance < 105:            # black line art needs something to sit on
            plate = Image.new('L', (W, H), 0)
            ImageDraw.Draw(plate).ellipse(
                [CX - 235, CY - 235, CX + 235, CY + 235], fill=150)
            plate = plate.filter(ImageFilter.GaussianBlur(60))
            card = Image.composite(Image.new('RGB', (W, H), (233, 236, 242)), card, plate)

        s = BOX / max(logo.width, logo.height)
        logo = logo.resize((max(1, round(logo.width * s)),
                            max(1, round(logo.height * s))), Image.LANCZOS)
        card.paste(logo, (CX - logo.width // 2, CY - logo.height // 2), logo)

        d = ImageDraw.Draw(card)
        x0 = 620
        tracked(d, (x0, 168), 'NBN.TODAY', ImageFont.truetype(FB, 21), ACCENT, 5)

        f = ImageFont.truetype(FB, 62)
        lines = wrapped(d, name, f, x0)
        y = 320 - 42 * len(lines)
        for ln in lines:
            d.text((x0, y), ln, font=f, fill=WHITE)
            y += 76
        d.line([(x0, y + 22), (x0 + 90, y + 22)], fill=ACCENT, width=5)
        d.text((x0, y + 50), 'Roster · Cap · History',
               font=ImageFont.truetype(FR, 26), fill=MUTED)

        card.save(out / f'team-{ab.lower()}.png', optimize=True)

    return len(teams)


if __name__ == '__main__':
    default_card()
    n = team_cards()
    print(f'wrote og-default.png and {n} team cards into og/')
