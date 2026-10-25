#!/usr/bin/env python3
"""The site's inline icons: css/ui-icons.css, one class per glyph.

These are the small marks that sit in a line of text or on a button: a check
beside a rule that passes, a warning beside one that doesn't, a lock on a
closed bet, the trophy beside a title. They replaced emoji, which drew in a
different style, colour and size on every platform, and never in the site's
own colours.

Each icon is one colour, `currentColor`: it is drawn as a CSS mask over the
element's text colour, so it takes the tone of whatever it sits in (a green
pass row, a red error, a gold chip) with nothing to set. The sidebar's
two-tone page icons are a different set (build/make_nav_icons.py).

Two ways to use one (docs/design-system.md § Icons):

    <i class="ui-icon ui-icon--check" aria-hidden="true"></i> Legal
    el.dataset.icon = 'warning'; el.textContent = text;   // drawn by ::before

The second is for text set with textContent: the icon comes from CSS, so the
text stays text and needs no escaping.

To add or change one: edit ICONS below (24px grid, drawn in black; only the
shape matters), then

    python3 build/make_ui_icons.py            # write css/ui-icons.css
    python3 build/make_ui_icons.py --check    # fail if it is out of date
"""
import math
import pathlib
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'css' / 'ui-icons.css'

def stroke(d, w=2):
    return (f"<path fill='none' stroke='black' stroke-width='{w}' "
            f"stroke-linecap='round' stroke-linejoin='round' d='{d}'/>")


def fill(d, evenodd=False):
    rule = " fill-rule='evenodd'" if evenodd else ''
    return f"<path fill='black'{rule} d='{d}'/>"


def circle(cx, cy, r):
    """A circle as a path, so it can be cut out of a shape with evenodd."""
    return f'M{cx - r} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0Z'


def star_path(cx, cy, r, inner=0.42, points=5):
    pts = []
    for i in range(points * 2):
        rad = r if i % 2 == 0 else r * inner
        ang = -math.pi / 2 + i * math.pi / points
        pts.append(f'{cx + rad * math.cos(ang):.2f} {cy + rad * math.sin(ang):.2f}')
    return 'M' + 'L'.join(pts) + 'Z'


def gear_path(cx, cy, outer, inner, teeth=8):
    pts = []
    step = 2 * math.pi / teeth
    for i in range(teeth):
        a = i * step - math.pi / 2
        for da, rad in ((-0.32, inner), (-0.2, outer), (0.2, outer), (0.32, inner)):
            ang = a + da * step * 1.6
            pts.append(f'{cx + rad * math.cos(ang):.2f} {cy + rad * math.sin(ang):.2f}')
    return 'M' + 'L'.join(pts) + 'Z'


ICONS = {
    # status
    'check':     [stroke('M4.5 12.5l5 5L19.5 7', 2.6)],
    'x':         [stroke('M6 6l12 12M18 6L6 18', 2.6)],
    'plus':      [stroke('M12 5v14M5 12h14', 2.6)],
    'chevron':   [stroke('M6 9l6 6 6-6', 2.6)],   # points down; rotate it for a closed disclosure
    'info':      [fill(circle(12, 12, 10.5) + 'M10.8 10.5h2.4V17h-2.4z' + circle(12, 7.4, 1.4), evenodd=True)],
    'warning':   [fill('M12 2.5L23 21.5H1Z' + 'M11 9h2v6h-2z' + circle(12, 18, 1.25), evenodd=True)],
    'lock':      [fill('M4.5 10.5h15v11h-15z'), stroke('M8 10.5V7.5a4 4 0 0 1 8 0v3', 2.2)],
    'pin':       [fill('M8 2.5h8l-1.2 6.5 3.7 3.5h-13L9.2 9z'), stroke('M12 12.5V22', 2)],
    'star':      [fill(star_path(12, 12.5, 10.5))],
    # honours
    'trophy':    [fill('M6.5 3h11v6a5.5 5.5 0 0 1-11 0z'),
                  stroke('M6.5 5H3.5v1.5A3.5 3.5 0 0 0 7 10M17.5 5h3v1.5A3.5 3.5 0 0 1 17 10M12 14.5V19'),
                  stroke('M7.5 21h9', 2.6)],
    'medal':     [stroke('M7.5 2l4.5 7.5L16.5 2', 2.2), fill(circle(12, 15.5, 6))],
    'ring':      [stroke(circle(12, 15, 6.2), 2.4), fill('M12 2.5l3 3-3 3.5-3-3.5z')],
    'crown':     [fill('M2.5 7.5l5 4.5L12 4l4.5 8 5-4.5-2 12h-15z')],
    'flame':     [fill('M12 1.5c.8 4 6.5 6.5 6.5 12.5a6.5 6.5 0 0 1-13 0c0-3.2 1.8-5.6 3.2-7.4.2 2.3 1.2 3.6 2.4 3.9-.4-3.4.1-6.4.9-9z')],
    # media and streams
    'stream':    [fill(circle(12, 12, 2.2)),
                  stroke('M8.2 7.8a6 6 0 0 0 0 8.4M15.8 7.8a6 6 0 0 1 0 8.4M5.2 4.8a10.2 10.2 0 0 0 0 14.4M18.8 4.8a10.2 10.2 0 0 1 0 14.4')],
    'tv':        [stroke('M3 5.5h18v11.5H3zM8 21h8M12 17v4')],
    'camera':    [fill('M2 7.5h5l2-3h6l2 3h5v13H2z' + circle(12, 13.8, 3.8), evenodd=True)],
    'image':     [stroke('M3 4h18v16H3z'), fill(circle(8.5, 9.5, 1.9)), stroke('M3.5 19l6-6.5 4 4 2.8-2.8L20.5 18')],
    'quote':     [fill('M3 19v-5.5C3 9 5 6.4 8.8 5l.9 1.8C7.6 8 6.6 9.6 6.4 12H10v7z'
                       'M13.5 19v-5.5c0-4.5 2-7.1 5.8-8.5l.9 1.8c-2.1 1.2-3.1 2.8-3.3 5.2h3.6v7z')],
    'link':      [stroke('M10 14a4.2 4.2 0 0 0 6 0l3.2-3.2a4.2 4.2 0 0 0-6-6l-1.2 1.2M14 10a4.2 4.2 0 0 0-6 0l-3.2 3.2a4.2 4.2 0 0 0 6 6l1.2-1.2', 2.2)],
    # places and things
    'person':    [fill(circle(12, 8, 4.5) + 'M3.5 22c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5z')],
    'comment':   [fill('M3 4h18v13H9l-5 4v-4H3z')],
    'coins':     [fill(circle(9, 9, 6.5)), stroke(circle(15.5, 15.5, 6), 2.2)],
    'pencil':    [fill('M15.5 3.5l5 5L9 20H4v-5z'), stroke('M13 6l5 5', 1.4)],
    'calendar':  [stroke('M3 5h18v16H3zM3 10h18M8 2.5v4.5M16 2.5v4.5')],
    'home':      [fill('M2.5 11.5L12 3l9.5 8.5H19V21h-5v-6h-4v6H5v-9.5z')],
    'plane':     [fill('M21.5 15.5v-2l-8.5-5.2V3.6a1.6 1.6 0 0 0-3.2 0v4.7l-7.3 5.2v2l7.3-2.3v4.6L8 19.2V21l3.4-1 3.4 1v-1.8l-1.8-1.4v-4.6z')],
    'medical':   [fill('M3 3h18v18H3z' + 'M10.2 6.5h3.6v3.7h3.7v3.6h-3.7v3.7h-3.6v-3.7H6.5v-3.6h3.7z', evenodd=True)],
    'bank':      [fill('M12 2l10 5v2.5H2V7z'), stroke('M5 11.5v6.5M10 11.5v6.5M14 11.5v6.5M19 11.5v6.5', 2.2), stroke('M2 21h20', 2.4)],
    'gear':      [fill(gear_path(12, 12, 11, 8.2) + circle(12, 12, 3.2), evenodd=True)],
    'send':      [fill('M2.5 10.5L21.5 3l-7.5 19-3-8.5z')],
    'clipboard': [stroke('M5.5 4h13v17h-13zM9 11h6M9 15h6'), fill('M9 2h6v4H9z')],
    'scale':     [stroke('M12 3v18M6 21h12M4 7h16'), stroke('M4 7l-2.5 6.5h5zM20 7l-2.5 6.5h5z', 1.6)],
    'folder':    [fill('M2.5 5h7l2 2.5h10V20h-19z')],
    'basketball': [stroke(circle(12, 12, 9.5)), stroke('M2.5 12h19M12 2.5v19M5.6 5.2c3.4 3.4 3.4 10.2 0 13.6M18.4 5.2c-3.4 3.4-3.4 10.2 0 13.6', 1.6)],
    # charts
    'bars':      [stroke('M5 20v-9M12 20V4M19 20v-6', 3), stroke('M2 21.5h20', 1.6)],
    'trend':     [stroke('M3 17l6-6 4 4 8-8M15 7h6v6', 2.2)],
    'pie':       [stroke(circle(12, 12, 9)), fill('M12 3a9 9 0 0 1 9 9h-9z')],
    'top':       [stroke('M12 21V8M6 13l6-6 6 6M5 3h14', 2.4)],
    'versus':    [stroke('M4 4l11 11M20 4L9 15M14.5 18.5l4-4M5.5 14.5l4 4M3.5 20.5l2-2M20.5 20.5l-2-2', 2.2)],
    # appearance
    'sun':       [fill(circle(12, 12, 4.2)),
                  stroke(' '.join(f'M{12 + 7 * math.cos(a):.2f} {12 + 7 * math.sin(a):.2f}L{12 + 9.6 * math.cos(a):.2f} {12 + 9.6 * math.sin(a):.2f}'
                                  for a in (i * math.pi / 4 for i in range(8))))],
    'moon':      [fill('M20.5 14.8A8.8 8.8 0 1 1 9.2 3.5a7 7 0 0 0 11.3 11.3z')],
    'monitor':   [stroke('M2.5 4h19v13h-19zM8 21h8M12 17v4')],
}


def svg(layers):
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>" + ''.join(layers) + '</svg>'


def data_uri(markup):
    return 'url("data:image/svg+xml,' + urllib.parse.quote(markup, safe=" =:/',.-") + '")'


def render():
    out = ['/* GENERATED by build/make_ui_icons.py. Don\'t edit by hand: change ICONS',
           '   there and re-run it. docs/design-system.md § Icons. */',
           '',
           '.ui-icon,',
           '[data-icon]::before {',
           '  display: inline-block;',
           '  flex: none;',
           '  width: 1em;',
           '  height: 1em;',
           '  vertical-align: -0.14em;',
           '  background-color: currentColor;',
           '  -webkit-mask: var(--ui-icon) center / contain no-repeat;',
           '  mask: var(--ui-icon) center / contain no-repeat;',
           '}',
           "[data-icon]::before { content: ''; margin-right: 0.35em; }",
           '']
    for name, layers in ICONS.items():
        out.append(f'.ui-icon--{name}, [data-icon="{name}"] {{ --ui-icon: {data_uri(svg(layers))}; }}')
    return '\n'.join(out) + '\n'


def main():
    text = render()
    if '--check' in sys.argv:
        if not OUT.exists() or OUT.read_text() != text:
            print(f'{OUT.relative_to(ROOT)} is out of date: run python3 build/make_ui_icons.py')
            return 1
        print(f'{OUT.relative_to(ROOT)} up to date')
        return 0
    OUT.write_text(text)
    print(f'wrote {OUT.relative_to(ROOT)}: {len(ICONS)} icons')
    return 0


if __name__ == '__main__':
    sys.exit(main())
