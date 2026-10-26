#!/usr/bin/env python3
"""The site nav's icon set: icons/nav-icons.svg, one <symbol> per page.

Every icon is two flat colours on a 24px grid:

  A  the body — `currentColor`, which css/sidebar.css sets to the theme's
     --accent, so a team theme tints the whole set in its own colour
  B  detail drawn on top of A — `var(--ni-b)`, --text-on-accent (white on
     every theme)
  C  a second tone for glyphs that stand on the page — `var(--ni-c)`, a light
     tint of the accent, which reads on light and dark pages alike

No icon sits on a backing tile: an icon is the object itself (a calendar, a
trophy) or a bare glyph (arrows, a check). An icon uses two of the three —
A+B for an object with detail on it, A+C for a glyph. The rule that keeps
them readable on every theme: **B only ever sits on top of A.** White out on
the page background vanishes on a light theme; that is what C is for. The drop shadow is CSS (`.ni` in css/sidebar.css), not drawn
here, so it can follow the theme's shadow colour.

The pages pick their icon by id in NAV_SECTIONS (nav.js), and search reads the
same ids. To add or change one: edit ICONS below, then

    python3 build/make_nav_icons.py

Each entry is a list of (kind, svg) pairs, drawn in order:
  'a'   filled with colour A          'b'   filled with colour B
  'as'  stroked in colour A           'bs'  stroked in colour B
  'c'   filled with colour C          'cs'  stroked in colour C
A stroke's width defaults to 2; put it in the tuple's third slot to change it.
"""
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons' / 'nav-icons.svg'


def star(cx, cy, r, inner=0.42, points=5):
    pts = []
    for i in range(points * 2):
        rad = r if i % 2 == 0 else r * inner
        ang = -math.pi / 2 + i * math.pi / points
        pts.append(f'{cx + rad * math.cos(ang):.2f},{cy + rad * math.sin(ang):.2f}')
    return f'<polygon points="{" ".join(pts)}"/>'


def gear(cx, cy, outer, inner, teeth=8):
    pts = []
    step = 2 * math.pi / teeth
    for i in range(teeth):
        a = i * step - math.pi / 2
        for da, rad in ((-0.32, inner), (-0.2, outer), (0.2, outer), (0.32, inner)):
            pts.append(f'{cx + rad * math.cos(a + da * step * 1.6):.2f},{cy + rad * math.sin(a + da * step * 1.6):.2f}')
    return f'<polygon points="{" ".join(pts)}"/>'


DOC = '<path d="M5 2h10l5 5v15H5z"/>'
DOC_FOLD = '<path d="M15 2v5h5z"/>'
CLIPBOARD = [('a', '<rect x="4" y="4" width="16" height="18" rx="2"/>'),
             ('a', '<rect x="8" y="2" width="8" height="4" rx="1"/>')]

ICONS = {
    # ── Season ──
    'calendar': [
        ('a', '<rect x="3" y="5" width="18" height="16" rx="2"/>'),
        ('a', '<rect x="7" y="2" width="2" height="5" rx="1"/>'),
        ('a', '<rect x="15" y="2" width="2" height="5" rx="1"/>'),
        ('b', '<rect x="3" y="9" width="18" height="1.5"/>'),
        ('b', '<rect x="6.5" y="12.5" width="3" height="3" rx=".5"/><rect x="10.5" y="12.5" width="3" height="3" rx=".5"/>'
              '<rect x="14.5" y="12.5" width="3" height="3" rx=".5"/><rect x="6.5" y="16.5" width="3" height="2.5" rx=".5"/>'
              '<rect x="10.5" y="16.5" width="3" height="2.5" rx=".5"/>'),
    ],
    'standings': [
        ('a', '<rect x="2" y="13" width="6" height="8" rx="1"/><rect x="9" y="8" width="6" height="13" rx="1"/><rect x="16" y="15" width="6" height="6" rx="1"/>'),
        ('b', '<rect x="11.25" y="10.5" width="1.5" height="4.5" rx=".5"/><circle cx="5" cy="16" r="1.2"/><circle cx="19" cy="17.5" r="1.2"/>'),
    ],
    'flag': [
        ('a', '<rect x="4" y="2" width="2" height="20" rx="1"/><path d="M6 3h14v10H6z"/>'),
        ('b', '<rect x="6" y="3" width="3.5" height="2.5"/><rect x="13" y="3" width="3.5" height="2.5"/>'
              '<rect x="9.5" y="5.5" width="3.5" height="2.5"/><rect x="16.5" y="5.5" width="3.5" height="2.5"/>'
              '<rect x="6" y="8" width="3.5" height="2.5"/><rect x="13" y="8" width="3.5" height="2.5"/>'
              '<rect x="9.5" y="10.5" width="3.5" height="2.5"/><rect x="16.5" y="10.5" width="3.5" height="2.5"/>'),
    ],
    'live': [
        ('a', '<circle cx="12" cy="12" r="2.6"/>'),
        ('cs', '<path d="M8.3 15.7a5.2 5.2 0 0 1 0-7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4"/>', 2),
        ('as', '<path d="M5.2 18.8a9.6 9.6 0 0 1 0-13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6"/>', 2),
    ],
    'guide': [
        ('a', '<rect x="4" y="2" width="16" height="20" rx="2"/>'),
        ('b', '<rect x="6.5" y="2" width="1.3" height="20"/>'),
        ('b', star(13.5, 11, 4.2)),
    ],
    # ── Front office ──
    'swap': [
        ('a', '<rect x="3" y="6" width="12" height="3" rx="1.5"/><polygon points="14,2.5 21,7.5 14,12.5"/>'),
        ('c', '<rect x="9" y="15" width="12" height="3" rx="1.5"/><polygon points="10,11.5 3,16.5 10,21.5"/>'),
    ],
    'pen': [
        ('a', '<polygon points="15,3 21,9 9,21 3,21 3,15"/>'),
        ('b', '<polygon points="3,21 3,17.5 6.5,21"/><polygon points="13,5 19,11 17.6,12.4 11.6,6.4"/>'),
    ],
    'doc-plus': [
        ('a', DOC),
        ('b', DOC_FOLD),
        ('bs', '<path d="M12.5 10.5v7M9 14h7"/>'),
    ],
    'doc-lines': [
        ('a', DOC),
        ('b', DOC_FOLD),
        ('b', '<rect x="8" y="10" width="9" height="1.5" rx=".75"/><rect x="8" y="13.5" width="9" height="1.5" rx=".75"/><rect x="8" y="17" width="6" height="1.5" rx=".75"/>'),
    ],
    'calculator': [
        ('a', '<rect x="5" y="2" width="14" height="20" rx="2"/>'),
        ('b', '<rect x="7.5" y="4.5" width="9" height="4" rx="1"/>'
              + ''.join(f'<circle cx="{x}" cy="{y}" r="1.1"/>' for y in (12, 15.5, 19) for x in (8.75, 12, 15.25))),
    ],
    'money': [
        ('a', '<rect x="2" y="6" width="20" height="12" rx="2"/>'),
        ('b', '<circle cx="12" cy="12" r="3"/><circle cx="5.5" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>'),
    ],
    # ── Committees ──
    'columns': [
        ('a', '<polygon points="12,2 22,7 2,7"/><rect x="2" y="19" width="20" height="3" rx=".5"/>'
              '<rect x="4" y="8.5" width="3" height="9.5"/><rect x="10.5" y="8.5" width="3" height="9.5"/><rect x="17" y="8.5" width="3" height="9.5"/>'),
        ('b', '<circle cx="12" cy="5" r="1"/>'),
    ],
    'clipboard-check': CLIPBOARD + [('bs', '<path d="M8 13.5l3 3 5-6"/>')],
    'ballot': [
        ('a', '<rect x="7" y="3" width="10" height="9" rx="1"/><rect x="3" y="10" width="18" height="11" rx="2"/>'),
        ('bs', '<path d="M9.7 7l1.7 1.7 3-3.2"/>', 1.6),
        ('b', '<rect x="6" y="12.8" width="12" height="1.5" rx=".75"/>'),
    ],
    'folder-chart': [
        ('a', '<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>'),
        ('b', '<rect x="7" y="13" width="2" height="4" rx=".5"/><rect x="11" y="10" width="2" height="7" rx=".5"/><rect x="15" y="12" width="2" height="5" rx=".5"/>'),
    ],
    'camera': [
        ('a', '<rect x="2" y="6" width="14" height="12" rx="2"/><polygon points="16,10 22,6.5 22,17.5 16,14"/>'),
        ('b', '<circle cx="7" cy="12" r="2.3"/>'),
    ],
    'scale': [
        ('a', '<rect x="11" y="4" width="2" height="16"/><rect x="6" y="19" width="12" height="3" rx="1"/><rect x="3" y="6" width="18" height="2" rx="1"/>'
              '<path d="M2 13h8a4 4 0 0 1-8 0z"/><path d="M14 13h8a4 4 0 0 1-8 0z"/>'),
        ('as', '<path d="M6 8l-3.5 5M6 8l3.5 5M18 8l-3.5 5M18 8l3.5 5"/>', 1.2),
        ('b', '<circle cx="12" cy="7" r="1"/>'),
    ],
    'upload': [
        ('a', '<rect x="3" y="14" width="18" height="7" rx="2"/><polygon points="12,2 18,8 14,8 14,14 10,14 10,8 6,8"/>'),
        ('b', '<rect x="6.5" y="17" width="5" height="1.5" rx=".75"/><circle cx="17" cy="17.75" r="1"/>'),
    ],
    # ── History ──
    'scroll': [
        ('a', '<rect x="5" y="3" width="14" height="18"/><rect x="3" y="2" width="18" height="3.5" rx="1.75"/><rect x="3" y="18.5" width="18" height="3.5" rx="1.75"/>'),
        ('b', '<rect x="8" y="8" width="8" height="1.5" rx=".75"/><rect x="8" y="11.5" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/>'),
    ],
    'trophy': [
        ('a', '<path d="M6 3h12v5a6 6 0 0 1-12 0z"/><rect x="11" y="13" width="2" height="5"/><rect x="7" y="18" width="10" height="3" rx="1"/>'),
        ('as', '<path d="M6 5H3.5v1.5A3.5 3.5 0 0 0 7 10M18 5h2.5v1.5A3.5 3.5 0 0 1 17 10"/>', 1.6),
        ('b', star(12, 7.6, 2.8)),
    ],
    'star': [
        ('a', star(12, 12.5, 10.5, 0.45)),
        ('b', star(12, 13, 4.5, 0.45)),
    ],
    'medal': [
        ('a', '<polygon points="6,2 10.5,2 13,9.5 8.5,9.5"/><polygon points="13.5,2 18,2 15.5,9.5 11,9.5"/><circle cx="12" cy="15" r="6.5"/>'),
        ('b', star(12, 15.3, 3.5)),
    ],
    'tape': [
        ('a', '<rect x="2" y="5" width="20" height="14" rx="2"/>'),
        ('b', '<circle cx="8" cy="11" r="2.2"/><circle cx="16" cy="11" r="2.2"/><rect x="7" y="15.3" width="10" height="1.5" rx=".75"/>'),
    ],
    'clipboard-list': CLIPBOARD + [
        ('b', '<circle cx="8.3" cy="10.5" r="1"/><rect x="10.5" y="9.75" width="6" height="1.5" rx=".75"/>'
              '<circle cx="8.3" cy="14.5" r="1"/><rect x="10.5" y="13.75" width="6" height="1.5" rx=".75"/>'
              '<circle cx="8.3" cy="18.5" r="1"/><rect x="10.5" y="17.75" width="4" height="1.5" rx=".75"/>'),
    ],
    # ── Stats ──
    'basketball': [
        ('a', '<circle cx="12" cy="12" r="10"/>'),
        ('bs', '<path d="M2.5 12h19M12 2.5v19M5.5 4.8c2.4 2 3.8 4.4 3.8 7.2s-1.4 5.2-3.8 7.2M18.5 4.8c-2.4 2-3.8 4.4-3.8 7.2s1.4 5.2 3.8 7.2"/>', 1.4),
    ],
    'jersey': [
        ('a', '<path d="M8 2h2.3a1.7 1.7 0 0 0 3.4 0H16l4.5 3.2v5.3l-3.5 1V22H7V11.5l-3.5-1V5.2z"/>'),
        ('b', '<rect x="11.2" y="11" width="1.8" height="7" rx=".5"/><polygon points="10,11 11.2,11 11.2,12.6 10,13.2"/>'),
    ],
    'owner': [
        ('a', '<circle cx="12" cy="7" r="4.2"/><path d="M3.5 21.5a8.5 8.5 0 0 1 17 0z"/>'),
        ('b', '<polygon points="12,13.5 13.4,15 12.6,20.5 11.4,20.5 10.6,15"/>'),
    ],
    'compare': [
        ('a', '<rect x="3" y="11" width="7.5" height="10" rx="1.5"/>'),
        ('c', '<rect x="13.5" y="3" width="7.5" height="18" rx="1.5"/>'),
    ],
    'trend-bars': [
        ('a', '<rect x="3" y="14" width="4" height="7" rx="1"/><rect x="10" y="11" width="4" height="10" rx="1"/><rect x="17" y="8" width="4" height="13" rx="1"/>'),
        ('as', '<path d="M3 9.5l5-4.2 4 3 7-6M16.2 2.3h2.8v2.8"/>', 1.8),
        ('b', '<rect x="4.25" y="16.5" width="1.5" height="2.5" rx=".75"/><rect x="11.25" y="14" width="1.5" height="5" rx=".75"/><rect x="18.25" y="11" width="1.5" height="8" rx=".75"/>'),
    ],
    'bar-chart': [
        ('cs', '<path d="M3 21h18"/>', 2),
        ('a', '<rect x="4" y="12" width="4" height="7" rx="1"/><rect x="10" y="4" width="4" height="15" rx="1"/><rect x="16" y="8.5" width="4" height="10.5" rx="1"/>'),
    ],
    'table': [
        ('a', '<rect x="2" y="4" width="20" height="16" rx="2"/>'),
        ('b', '<rect x="2" y="8.3" width="20" height="1.4"/><rect x="2" y="13.8" width="20" height="1.4"/><rect x="7.8" y="9" width="1.4" height="11"/><rect x="14.8" y="9" width="1.4" height="11"/>'),
    ],
    'steps': [
        ('a', '<rect x="2" y="15" width="6" height="6" rx="1"/><rect x="9" y="11" width="6" height="10" rx="1"/><rect x="16" y="5" width="6" height="16" rx="1"/>'),
        ('b', star(19, 9.5, 2.4)),
    ],
    'spike': [
        ('cs', '<path d="M3 21h18"/>', 2),
        ('as', '<path d="M3.5 16.5l5.5-5.5 4 4 7.5-8.5M15 6.5h5.5V12"/>', 2.6),
    ],
    'versus': [
        ('as', '<path d="M3 6l4.5 12L12 6"/>', 2.8),
        ('cs', '<path d="M20.5 7.6c-.8-1-2.1-1.5-3.4-1.3-1.6.2-2.5 1.4-2.1 2.7.4 1.4 2.4 1.9 3.6 2.7 1.3.8 1.6 2.3.7 3.4-1.1 1.3-3.6 1.3-5-.2"/>', 2.8),
    ],
    'pie': [
        ('a', '<circle cx="12" cy="12" r="10"/>'),
        ('b', '<path d="M12 12V3.5a8.5 8.5 0 0 1 8.5 8.5z"/>'),
    ],
    'list': [
        ('a', '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="5" cy="18" r="2"/>'),
        ('c', '<rect x="9" y="4.8" width="12" height="2.6" rx="1.3"/><rect x="9" y="10.8" width="12" height="2.6" rx="1.3"/><rect x="9" y="16.8" width="8" height="2.6" rx="1.3"/>'),
    ],
    'magnifier': [
        ('as', '<path d="M15.5 15.5l5.5 5.5"/>', 3.5),
        ('a', '<circle cx="10" cy="10" r="7.5"/>'),
        ('bs', '<path d="M6.5 9.5A3.5 3.5 0 0 1 10 6"/>', 1.7),
    ],
    # ── NB¥ ──
    'yen': [
        ('as', '<path d="M5.5 3L12 12.5 18.5 3M12 12.5V21"/>', 2.8),
        ('cs', '<path d="M7 13h10M7 17h10"/>', 2.4),
    ],
    'dice': [
        ('a', '<rect x="3" y="3" width="18" height="18" rx="4"/>'),
        ('b', ''.join(f'<circle cx="{x}" cy="{y}" r="1.6"/>' for x, y in ((8, 8), (16, 8), (12, 12), (8, 16), (16, 16)))),
    ],
    'line-chart': [
        ('cs', '<path d="M3 3v18h18"/>', 2),
        ('as', '<path d="M6.5 16l4.5-5 3.5 3 6-7.5"/>', 2.6),
    ],
    'candles': [
        ('as', '<path d="M6.5 4.5v15M12 2.5v15M17.5 6.5v15"/>', 1.5),
        ('a', '<rect x="5" y="7.5" width="3" height="9" rx=".75"/><rect x="10.5" y="5" width="3" height="9.5" rx=".75"/><rect x="16" y="9" width="3" height="9" rx=".75"/>'),
        ('b', '<rect x="11.4" y="6.5" width="1.2" height="6.5" rx=".6"/>'),
    ],
    'heart': [
        ('a', '<path d="M12 21l-1.5-1.3C5.4 15.1 2 12 2 8.2 2 5.1 4.4 2.7 7.5 2.7c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.5 11.5z"/>'),
        ('bs', '<path d="M5.8 8.3a2.6 2.6 0 0 1 2.3-2.2"/>', 1.7),
    ],
    'medical': [
        ('a', '<rect x="3" y="3" width="18" height="18" rx="4"/>'),
        ('b', '<path d="M10.2 6.5h3.6v3.7h3.7v3.6h-3.7v3.7h-3.6v-3.7H6.5v-3.6h3.7z"/>'),
    ],
    'target': [
        ('a', '<circle cx="12" cy="12" r="10"/>'),
        ('bs', '<circle cx="12" cy="12" r="6"/>', 2),
        ('b', '<circle cx="12" cy="12" r="2.3"/>'),
    ],
    # ── Games ──
    'hoop': [
        ('a', '<rect x="4" y="2" width="16" height="10.5" rx="1.5"/><rect x="6" y="12" width="12" height="2.2" rx="1.1"/>'),
        ('bs', '<rect x="9" y="5.5" width="6" height="4.5"/>', 1.4),
        ('as', '<path d="M8 14l1.6 7M16 14l-1.6 7M11 14l.4 7M13 14l-.4 7M9 17.5h6"/>', 1.3),
    ],
    'silhouette': [
        ('a', '<circle cx="9.5" cy="7.5" r="4"/><path d="M2 21a7.5 7.5 0 0 1 15 0z"/>'),
        ('cs', '<path d="M17 4.6a2.6 2.6 0 1 1 3.5 2.4c-.7.3-1 .8-1 1.5v.6"/>', 2),
        ('c', '<circle cx="19.5" cy="12" r="1.2"/>'),
    ],
    'question': [
        ('a', '<path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>'),
        ('bs', '<path d="M9.4 8.3a2.7 2.7 0 1 1 3.7 2.5c-.7.3-1.1.9-1.1 1.6v.4"/>', 1.8),
        ('b', '<circle cx="12" cy="15.4" r="1.1"/>'),
    ],
    'blocks': [
        ('a', '<rect x="3" y="12" width="6" height="6" rx="1"/><rect x="9" y="12" width="6" height="6" rx="1"/>'
              '<rect x="15" y="12" width="6" height="6" rx="1"/><rect x="9" y="6" width="6" height="6" rx="1"/>'),
        ('bs', '<path d="M9 12.5v5M15 12.5v5M9.5 12h5"/>', 1.2),
    ],
    # ── Media ──
    'newspaper': [
        ('a', '<rect x="17" y="8" width="5" height="12" rx="1.5"/><rect x="2" y="4" width="17" height="16" rx="2"/>'),
        ('b', '<rect x="5" y="7.5" width="11" height="3" rx=".75"/><rect x="5" y="13" width="5" height="4" rx=".75"/>'
              '<rect x="11.5" y="13" width="4.5" height="1.3" rx=".65"/><rect x="11.5" y="15.7" width="4.5" height="1.3" rx=".65"/>'),
    ],
    'tv': [
        ('as', '<path d="M8 2l4 4 4-4"/>', 1.6),
        ('a', '<rect x="2" y="6" width="20" height="14" rx="2"/>'),
        ('b', '<rect x="4.5" y="8.5" width="11" height="9" rx="1"/><circle cx="18.7" cy="10.5" r="1"/><circle cx="18.7" cy="14" r="1"/>'),
    ],
    'football': [
        ('a', '<path d="M4.5 19.5C2 17 2.5 10 6.3 6.3S17 2 19.5 4.5 22 14 17.7 17.7 7 22 4.5 19.5z"/>'),
        ('bs', '<path d="M9 15l6-6M10.2 11.2l2.6 2.6M12.2 9.2l2.6 2.6M8.2 13.2l2.6 2.6"/>', 1.5),
    ],
    'play': [
        ('a', '<rect x="2" y="5" width="20" height="14" rx="4"/>'),
        ('b', '<polygon points="10,8.8 15.8,12 10,15.2"/>'),
    ],
    # ── About ──
    'people': [
        ('c', '<circle cx="16.5" cy="8" r="3.2"/><path d="M12.8 20a6 6 0 0 1 10.2-4.3V20z"/>'),
        ('a', '<circle cx="9" cy="8" r="4"/><path d="M1.5 21a7.5 7.5 0 0 1 15 0z"/>'),
    ],
    'key': [
        ('a', '<circle cx="8" cy="12" r="5.5"/><rect x="12" y="10.5" width="10" height="3" rx=".5"/><rect x="17" y="13" width="2" height="3.5"/><rect x="20" y="13" width="2" height="2.5"/>'),
        ('b', '<circle cx="7" cy="12" r="1.8"/>'),
    ],
    'charter': [
        ('a', '<rect x="4" y="2" width="16" height="20" rx="2"/>'),
        ('b', '<rect x="7" y="5.5" width="10" height="1.4" rx=".7"/><rect x="7" y="8.8" width="10" height="1.4" rx=".7"/><rect x="7" y="12.1" width="6" height="1.4" rx=".7"/>'),
        ('b', star(15.5, 17, 2.7, 0.6, 8)),
    ],
    'book': [
        ('a', '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>'),
        ('b', '<path d="M6.5 17.5H20V19H6.5a.75.75 0 0 1 0-1.5z"/><rect x="9" y="6" width="8" height="1.5" rx=".75"/><rect x="9" y="9.5" width="6" height="1.5" rx=".75"/>'),
    ],
    'tag': [
        ('a', '<path d="M3 3h8.5L21 12.5 12.5 21 3 11.5z"/>'),
        ('b', '<circle cx="7.5" cy="7.5" r="1.8"/>'),
    ],
    'inbox': [
        ('a', '<path d="M2 13l3-9h14l3 9v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>'),
        ('bs', '<path d="M3 13h5l1.5 2.5h5L16 13h5"/>', 1.6),
    ],
    'person-plus': [
        ('a', '<circle cx="9" cy="8" r="4"/><path d="M1.5 21a7.5 7.5 0 0 1 15 0z"/>'),
        ('cs', '<path d="M19 7v7M15.5 10.5h7"/>', 2.4),
    ],
    # ── League office ──
    'vote': [
        ('cs', '<circle cx="12" cy="12" r="9.5"/>', 2),
        ('as', '<path d="M7.5 12.5l3 3 6-7"/>', 2.8),
    ],
    'bulb': [
        ('a', '<path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/><rect x="8.5" y="18" width="7" height="1.8" rx=".9"/><rect x="9.5" y="20.5" width="5" height="1.5" rx=".75"/>'),
        ('bs', '<path d="M10 11l2 2 2-2M12 13v3"/>', 1.4),
        ('bs', '<path d="M8.6 8a3.6 3.6 0 0 1 2.5-2.6"/>', 1.5),
    ],
    'envelope': [
        ('a', '<rect x="2" y="5" width="20" height="14" rx="2"/>'),
        ('bs', '<path d="M3.5 7l8.5 6.2L20.5 7"/>', 1.7),
    ],
    'ruler': [
        ('a', '<polygon points="2,16 16,2 22,8 8,22"/>'),
        ('bs', '<path d="M5 13l2 2M8 10l3 3M11 7l2 2M14 4l3 3"/>', 1.4),
    ],
    'gear': [
        ('a', gear(12, 12, 10.5, 7.8)),
        ('b', '<circle cx="12" cy="12" r="3.2"/>'),
    ],
    'warning': [
        ('a', '<path d="M10.3 3.4a2 2 0 0 1 3.4 0l8.4 14.6a2 2 0 0 1-1.7 3H3.6a2 2 0 0 1-1.7-3z"/>'),
        ('b', '<rect x="11" y="8.5" width="2" height="6.5" rx="1"/><circle cx="12" cy="17.6" r="1.2"/>'),
    ],
    'checklist': [
        ('as', '<path d="M3 6.5l2 2 3.5-3.8M3 15.5l2 2 3.5-3.8"/>', 2.2),
        ('c', '<rect x="11" y="5.8" width="10" height="2.6" rx="1.3"/><rect x="11" y="14.8" width="10" height="2.6" rx="1.3"/>'),
    ],
    # ── Account menu ──
    'palette': [
        ('a', '<path d="M12 2a10 10 0 0 0 0 20c1.4 0 2.2-.9 2.2-2 0-.6-.3-1.1-.6-1.5-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a5 5 0 0 0 5-5C22 6.1 17.5 2 12 2z"/>'),
        ('b', '<circle cx="7" cy="11.5" r="1.6"/><circle cx="9.3" cy="6.9" r="1.6"/><circle cx="14.4" cy="6.6" r="1.6"/><circle cx="17.6" cy="10.4" r="1.5"/>'),
    ],
    'exit': [
        ('a', '<rect x="3" y="3" width="11" height="18" rx="1.5"/>'),
        ('b', '<circle cx="10.8" cy="12" r="1.1"/>'),
        ('cs', '<path d="M15.5 12H21M18.2 9l3 3-3 3"/>', 2.2),
    ],
    'gavel': [
        ('as', '<path d="M12 11l8.5 8.5"/>', 3),
        ('a', '<rect x="5" y="4.5" width="11" height="6.5" rx="1.2" transform="rotate(45 10.5 7.75)"/><rect x="3" y="19" width="10" height="3" rx="1"/>'),
        ('b', '<rect x="9.8" y="4.5" width="1.4" height="6.5" transform="rotate(45 10.5 7.75)"/>'),
    ],
}

# The sidebar's outline set, written as `<symbol id="{name}-o">`. A section
# header (and Teams, Inbox, Pinned) draws its icon in outline, and switches to
# its `-on` icon (below: the filled one, or its ACTIVE override) when you are
# in that section, so the section you are
# in is the one solid icon in the sidebar. Only those icons need an outline;
# search results and the account menu always draw the filled set. Drawn by
# hand, not traced from the filled shapes (a trace doubles every line where two
# shapes overlap): one colour, 'as' strokes at 1.6 and 'a' fills for dots.
OUTLINES = {
    'calendar': [
        ('as', '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 2.75v4M16 2.75v4M3.5 9.75h17"/>', 1.6),
        ('a', '<circle cx="8" cy="13.5" r="1"/><circle cx="12" cy="13.5" r="1"/><circle cx="16" cy="13.5" r="1"/>'
              '<circle cx="8" cy="17" r="1"/><circle cx="12" cy="17" r="1"/>'),
    ],
    'swap': [('as', '<path d="M3 7.5h16M15 3.5l4 4-4 4M21 16.5H5M9 12.5l-4 4 4 4"/>', 1.6)],
    'trophy': [
        ('as', '<path d="M6.5 3.5h11V8a5.5 5.5 0 0 1-11 0z"/><path d="M12 13.5v4.5"/>'
               '<rect x="7.5" y="18" width="9" height="3" rx="1"/>'
               '<path d="M6.5 5.5H4v1A3.5 3.5 0 0 0 7 10M17.5 5.5H20v1A3.5 3.5 0 0 1 17 10"/>', 1.6),
    ],
    'bar-chart': [
        ('as', '<path d="M3 21h18"/><rect x="4.5" y="12" width="3.5" height="6.5" rx="1"/>'
               '<rect x="10.25" y="4.5" width="3.5" height="14" rx="1"/><rect x="16" y="8.5" width="3.5" height="10" rx="1"/>', 1.6),
    ],
    'yen': [('as', '<path d="M5.5 3.5L12 12.5l6.5-9M12 12.5V21M7.5 13.5h9M7.5 17h9"/>', 1.6)],
    'hoop': [
        ('as', '<rect x="4" y="2.5" width="16" height="10" rx="1.5"/><rect x="9" y="5.5" width="6" height="4" rx=".5"/>'
               '<path d="M6 13.5h12"/>', 1.6),
        ('as', '<path d="M8 13.5l1.6 7M16 13.5l-1.6 7M12 13.5v7M9 17h6"/>', 1.2),
    ],
    'tv': [
        ('as', '<path d="M8 2.5l4 3.5 4-3.5"/><rect x="2.5" y="6" width="19" height="14" rx="2"/>'
               '<rect x="5" y="8.75" width="10" height="8.5" rx="1"/>', 1.6),
        ('a', '<circle cx="18.25" cy="10.5" r="1"/><circle cx="18.25" cy="14" r="1"/>'),
    ],
    'columns': [
        ('as', '<path d="M12 2.5l9.5 4.75h-19z"/><path d="M2.5 20.5h19M5.5 10v7.5M12 10v7.5M18.5 10v7.5"/>', 1.6),
    ],
    'people': [
        ('as', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/>'
               '<circle cx="16.75" cy="8.5" r="2.75"/><path d="M17.5 14a5 5 0 0 1 4.5 5"/>', 1.6),
    ],
    'gavel': [
        ('as', '<rect x="5" y="4.5" width="11" height="6.5" rx="1.2" transform="rotate(45 10.5 7.75)"/>'
               '<path d="M13.6 12.6l6.9 6.9"/><rect x="3" y="19" width="10" height="2.5" rx="1"/>', 1.6),
    ],
    'basketball': [
        ('as', '<circle cx="12" cy="12" r="9.5"/>', 1.6),
        ('as', '<path d="M2.5 12h19M12 2.5v19M5.5 4.8c2.4 2 3.8 4.4 3.8 7.2s-1.4 5.2-3.8 7.2M18.5 4.8c-2.4 2-3.8 4.4-3.8 7.2s1.4 5.2 3.8 7.2"/>', 1.2),
    ],
    'inbox': [
        ('as', '<path d="M2.5 13l3-8.5h13l3 8.5v5.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z"/><path d="M2.5 13h5.5l1.5 2.5h5L16 13h5.5"/>', 1.6),
    ],
    'star': [('as', star(12, 12.5, 9.5, 0.45), 1.6)],
}

# What a header draws while you are in its section: `<symbol id="{name}-on">`,
# the filled icon unless overridden here. The overrides are the bare glyphs,
# whose filled form is only a thicker line and barely differs from the
# outline; they stand on a solid accent shape instead (Instagram's Reels icon
# does the same), so the section you are in is unmistakable.
ACTIVE = {
    'yen': [
        ('a', '<circle cx="12" cy="12" r="10.5"/>'),
        ('bs', '<path d="M7.5 5.5L12 12l4.5-6.5M12 12v6.5M8.5 12.75h7M8.5 15.75h7"/>', 1.9),
    ],
    'swap': [
        ('a', '<rect x="1.5" y="1.5" width="21" height="21" rx="5"/>'),
        ('bs', '<path d="M6 9h11M14 6l3 3-3 3M18 15H7M10 12l-3 3 3 3"/>', 1.9),
    ],
    'bar-chart': [
        ('a', '<rect x="1.5" y="1.5" width="21" height="21" rx="5"/>'),
        ('b', '<rect x="6" y="12" width="3" height="6" rx=".8"/><rect x="10.5" y="6" width="3" height="12" rx=".8"/>'
              '<rect x="15" y="9" width="3" height="9" rx=".8"/>'),
    ],
    'columns': [
        ('a', '<polygon points="12,1.5 22.5,7 1.5,7"/><rect x="2.5" y="8" width="19" height="10.5"/>'
              '<rect x="1.5" y="19.5" width="21" height="3" rx=".5"/>'),
        ('b', '<rect x="7.25" y="10" width="1.5" height="6.5" rx=".5"/><rect x="11.25" y="10" width="1.5" height="6.5" rx=".5"/>'
              '<rect x="15.25" y="10" width="1.5" height="6.5" rx=".5"/><circle cx="12" cy="4.6" r="1"/>'),
    ],
}

FILL = {'a': 'fill="currentColor"', 'b': 'style="fill:var(--ni-b,#fff)"',
        'c': 'style="fill:var(--ni-c,#8db6e6)"'}
STROKE = {'as': 'stroke:currentColor', 'bs': 'stroke:var(--ni-b,#fff)',
          'cs': 'stroke:var(--ni-c,#8db6e6)'}


def layer(kind, svg, width=2):
    if kind in FILL:
        return f'<g {FILL[kind]}>{svg}</g>'
    return (f'<g style="fill:none;{STROKE[kind]};stroke-width:{width};'
            f'stroke-linecap:round;stroke-linejoin:round">{svg}</g>')


def main():
    out = ['<svg xmlns="http://www.w3.org/2000/svg">',
           '<!-- Generated by build/make_nav_icons.py — edit there, not here. -->']
    for name, layers in ICONS.items():
        body = ''.join(layer(*l) for l in layers)
        out.append(f'<symbol id="{name}" viewBox="0 0 24 24">{body}</symbol>')
    for name, layers in OUTLINES.items():
        assert name in ICONS, f'outline for {name} has no filled icon'
        body = ''.join(layer(*l) for l in layers)
        out.append(f'<symbol id="{name}-o" viewBox="0 0 24 24">{body}</symbol>')
        body = ''.join(layer(*l) for l in ACTIVE.get(name, ICONS[name]))
        out.append(f'<symbol id="{name}-on" viewBox="0 0 24 24">{body}</symbol>')
    out.append('</svg>')
    OUT.write_text('\n'.join(out) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)} — {len(ICONS)} icons, {len(OUTLINES)} outlines')


if __name__ == '__main__':
    main()
