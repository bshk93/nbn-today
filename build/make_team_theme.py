#!/usr/bin/env python3
"""Generate a team-coloured theme block for css/theme.css.

    python3 build/make_team_theme.py PHX            # print the block
    python3 build/make_team_theme.py PHX --write    # insert/replace it in css/theme.css
    python3 build/make_team_theme.py --all --write  # all 30

Why this is generated and not hand-written: a theme block is 59 tokens, every
one of which has to be present (css/theme.css has no cross-theme fallback,
only to the bare :root), and shipping two hand-written light themes turned up
285 unreadable text/background pairs. Thirty more by hand is not a thing that
would come out right.

The recipe, in one sentence: keep the dark theme's *lightness* for every
token — it is already tuned — and change only the hue.

  - backgrounds / borders / text  →  the team's primary hue, at a fixed low
    chroma (a tint, not a wash: a page painted in full team purple is
    unreadable and looks nothing like the rest of the site)
  - the accent family (accent, link, panel, muted-border) → the team's accent
    hue, carrying as much of that colour's own chroma as the gamut allows
  - --text-on-accent → black or white, whichever actually reads on the
    accent that came out (this is the token that breaks for the teams whose
    accent is gold or silver, and the reason it is computed rather than set)
  - everything semantic (danger, success, gold, purple, market, champion…)
    keeps its dark-theme value, because a red that means "alarm" must not
    become team-coloured — but each one is re-checked against the new card
    background and lightened if the hue change cost it contrast

Colour work is in OKLab, so "same lightness, different hue" means the same
thing to the eye across all 30 teams; sRGB/HSL would make the gold teams
glow and the navy teams disappear. Out-of-gamut results are fitted by
reducing chroma, never by clipping channels (clipping shifts the hue).

Contrast targets are WCAG AA: 4.5:1 for text tokens against --bg-card, 3:1
for the large/decorative ones. build/contrast_audit.sh is what actually
proves a generated theme on real pages; this only guarantees the tokens
themselves are sane in isolation.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
THEME_CSS = REPO / "css" / "theme.css"
COLORS_JSON = REPO / "build" / "team-colors.json"

TEAM_NAMES = {
    "ATL": "Atlanta Hawks", "BKN": "Brooklyn Nets", "BOS": "Boston Celtics",
    "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
    "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons",
    "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
    "LAC": "LA Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies",
    "MIA": "Miami Heat", "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves",
    "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder",
    "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns",
    "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
    "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards",
}

# ── Colour ───────────────────────────────────────────────────────────────────

def _srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c):
    v = 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return v * 255.0


def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#" + "".join(f"{max(0, min(255, round(c))):02x}" for c in rgb)


def rgb_to_oklab(rgb):
    r, g, b = (_srgb_to_linear(c) for c in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (v ** (1 / 3) if v > 0 else -((-v) ** (1 / 3)) for v in (l, m, s))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def oklab_to_rgb(lab):
    L, a, b = lab
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = (v ** 3 for v in (l_, m_, s_))
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return tuple(_linear_to_srgb(c) for c in (r, g, bb))


def hex_to_lch(h):
    L, a, b = rgb_to_oklab(hex_to_rgb(h))
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360


def _in_gamut(rgb):
    return all(-0.5 <= c <= 255.5 for c in rgb)


def lch_to_hex(L, C, h):
    """Fit to sRGB by reducing chroma — clipping channels would shift the hue."""
    L = max(0.0, min(1.0, L))
    rad = math.radians(h)
    lo, hi = 0.0, max(0.0, C)
    rgb = oklab_to_rgb((L, hi * math.cos(rad), hi * math.sin(rad)))
    if not _in_gamut(rgb):
        for _ in range(24):
            mid = (lo + hi) / 2
            if _in_gamut(oklab_to_rgb((L, mid * math.cos(rad), mid * math.sin(rad)))):
                lo = mid
            else:
                hi = mid
        rgb = oklab_to_rgb((L, lo * math.cos(rad), lo * math.sin(rad)))
    return rgb_to_hex(rgb)


def _luminance(h):
    r, g, b = (_srgb_to_linear(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = _luminance(a), _luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def shift_until(fg_hex, bg_hex, target, direction):
    """Move a colour's lightness (hue and chroma held) until it reads on bg.

    direction is +1 to lighten, -1 to darken. Returns the nearest end of the
    scale if the target is unreachable, which is still the best available."""
    if contrast(fg_hex, bg_hex) >= target:
        return fg_hex
    L, C, h = hex_to_lch(fg_hex)
    for step in range(1, 101):
        cand = lch_to_hex(max(0.0, min(1.0, L + direction * step * 0.01)), C, h)
        if contrast(cand, bg_hex) >= target:
            return cand
    return "#ffffff" if direction > 0 else "#000000"


def lighten_until(fg_hex, bg_hex, target):
    return shift_until(fg_hex, bg_hex, target, +1)


# ── Token recipe ─────────────────────────────────────────────────────────────
#
# Fixed chroma per family. These are the numbers that decide whether a theme
# reads as "the site, in Suns colours" or as a novelty skin; the backgrounds
# in particular are barely-there on purpose (0.028 is about as far as a page
# can be pushed before long tables stop being restful).
C_BG, C_BORDER, C_TEXT = 0.028, 0.030, 0.012

PRIMARY_HUE = {"bg": C_BG, "border": C_BORDER, "text": C_TEXT}

BG_TOKENS = {"--bg-page", "--bg-card", "--bg-subtle", "--bg-hover", "--bg-deep",
             "--accent-panel-bg"}
BORDER_TOKENS = {"--border", "--border-subtle", "--border-dark"}
TEXT_TOKENS = {"--text-primary", "--text-secondary", "--text-muted", "--text-dim",
               "--text-bright"}
ACCENT_TOKENS = {"--accent", "--accent-dark", "--link", "--accent-light", "--muted-border"}

# Semantic tokens that are rendered as *text* and so must clear 4.5:1 on the
# new card background; the rest of the semantic set is backgrounds and borders.
SEMANTIC_TEXT = {"--danger", "--danger-light", "--danger-alt", "--success",
                 "--success-light", "--success-alt", "--gold", "--gold-dim",
                 "--gold-alt", "--warning", "--purple", "--purple-light",
                 "--market-positive", "--market-positive-light", "--runnerup-text"}
# Borders/decorative edges: 3:1 is the AA bar for non-text.
SEMANTIC_EDGE = {"--danger-border", "--danger-border-strong", "--danger-alt-border",
                 "--gold-border", "--gold-chip-border", "--champion-border",
                 "--runnerup-border", "--purple-border", "--market-positive-border"}

SKIP = {"--font-sans", "--font-mono"}


def parse_root_block(css_text):
    """The bare :root block of css/theme.css, in file order."""
    m = re.search(r"\n:root \{(.*?)\n\}", css_text, re.S)
    if not m:
        sys.exit("could not find the bare :root block in css/theme.css")
    out = []
    for line in m.group(1).splitlines():
        t = re.match(r"\s*(--[a-z0-9-]+):\s*(.+?);", line)
        if t:
            out.append((t.group(1), t.group(2).strip()))
    return out


def build_theme(primary, accent, base):
    """base: [(token, dark-theme value)] → {token: new value}."""
    _, _, h_p = hex_to_lch(primary)
    _, C_a, h_a = hex_to_lch(accent)
    out = {}

    # Pass 1 — the hue-substituted families. Lightness is copied from the dark
    # theme token, which is what keeps the whole set coherent.
    for token, value in base:
        if token in SKIP or token == "--text-muted-rgb":
            continue
        if token in BG_TOKENS or token in BORDER_TOKENS or token in TEXT_TOKENS:
            L, _, _ = hex_to_lch(value) if value.startswith("#") else (0, 0, 0)
            C = C_BG if token in BG_TOKENS else C_BORDER if token in BORDER_TOKENS else C_TEXT
            # The info panel is an accent-tinted surface, not a neutral one.
            hue = h_a if token == "--accent-panel-bg" else h_p
            if token == "--accent-panel-bg":
                C = C_BG * 2.2
            out[token] = lch_to_hex(L, C, hue)
        elif token in ACCENT_TOKENS:
            L, C_base, _ = hex_to_lch(value)
            # The accent proper carries the team's own saturation; --muted-border
            # is defined as "less saturated than --accent" and keeps the base's,
            # or a gold/orange team turns every secondary edge into a highlight.
            C = C_base if token == "--muted-border" else max(C_base, min(C_a, 0.20))
            out[token] = lch_to_hex(L, C, h_a)
        elif token.startswith("rgba") or not value.startswith("#"):
            out[token] = value
        else:
            out[token] = value  # semantic — repaired in pass 2

    card, page = out["--bg-card"], out["--bg-page"]
    base_card = dict(base)["--bg-card"]

    # Pass 2 — repair, and only repair. The target is capped at what the same
    # token already achieved in the dark theme, so a team theme inherits that
    # theme's contrast character exactly: a hue swap can never quietly cost a
    # colour its legibility, and can never quietly "fix" one either (a border
    # that reads deliberately soft at 2:1 in NBN Today must not come out
    # brighter here just because this file happens to be doing the maths).
    # Nothing in this pass changes hue, so red stays red.
    def repair(token, want):
        val = out[token]
        target = min(want, contrast(dict(base)[token], base_card))
        out[token] = lighten_until(val, card, target)

    for token in list(out):
        if not out[token].startswith("#") or not dict(base).get(token, "").startswith("#"):
            continue
        if token in SEMANTIC_TEXT:
            repair(token, 4.5)
        elif token in SEMANTIC_EDGE:
            repair(token, 3.0)
        elif token in TEXT_TOKENS and token != "--text-dim":
            # --text-dim is deliberately below AA: it is the "receding" tone.
            repair(token, 4.5 if token in ("--text-primary", "--text-secondary", "--text-muted") else 3.0)
        elif token in ("--link", "--accent-light"):
            out[token] = lighten_until(out[token], card, 4.5)

    # --text-on-accent is a label on a *surface*, and it lands on more than
    # one: the site paints its primary buttons with --accent-dark, not
    # --accent. So pick the label by the worst surface it has to survive,
    # then move that surface until the worst case clears — white labels push
    # the surface darker, black labels push it lighter. Checking only
    # --accent shipped an unreadable "Sign in" button on 19 pages, which is
    # the one contrast failure a viewer has no way to work around.
    SURFACES = ["--accent", "--accent-dark"]

    def worst(label):
        return min(contrast(label, out[s]) for s in SURFACES)

    label = "#fff" if worst("#fff") >= worst("#0b0f14") else "#0b0f14"

    # Only --accent-dark may be moved to make the label fit. --accent is ALSO
    # rendered as plain text on the page background ("enter token", link-ish
    # accents), so darkening it to seat a white label just relocates the
    # failure onto 48 pages of text — measured, not hypothetical. The dark
    # theme resolves the same conflict the same way: its own #3b82f6 reads
    # fine as text and fails as a button surface. --accent-dark is only ever
    # a surface, so it is the one that gives.
    if contrast(label, out["--accent-dark"]) < 4.5:
        out["--accent-dark"] = shift_until(out["--accent-dark"], label, 4.5,
                                           -1 if label == "#fff" else +1)
    out["--text-on-accent"] = label

    # The info panel carries accent-coloured text (links, badges) on an
    # accent-tinted background, so a hue change collapses the separation the
    # base theme got from lightness alone. Darkening the panel is the safe
    # direction on a dark theme — it only moves further from the text on it.
    for fg, need in (("--link", 4.5), ("--accent-light", 3.0), ("--text-primary", 4.5)):
        if contrast(out[fg], out["--accent-panel-bg"]) < need:
            out["--accent-panel-bg"] = shift_until(out["--accent-panel-bg"], out[fg], need, -1)

    out["--text-muted-rgb"] = ", ".join(str(round(c)) for c in hex_to_rgb(out["--text-muted"]))

    # Scrim and shadows: the page's own darkest hue rather than neutral black,
    # so an overlay doesn't grey the theme out (the same choice Lavender made).
    dark = hex_to_rgb(lch_to_hex(0.16, C_BG * 1.5, h_p))
    r, g, b = (round(c) for c in dark)
    out["--overlay-scrim"] = f"rgba({r}, {g}, {b}, 0.65)"
    out["--shadow-color"] = f"rgba({r}, {g}, {b}, 0.45)"
    out["--shadow-color-strong"] = f"rgba({r}, {g}, {b}, 0.6)"
    return out, page, card


def render_block(abbr, primary, accent, values, base_order, page, card):
    name = TEAM_NAMES.get(abbr, abbr)
    lines = [
        f'/* ── {name} ' + "─" * max(3, 66 - len(name)),
        f"   Generated by build/make_team_theme.py from {primary} / {accent}.",
        "   Do not hand-edit: regenerate, or change the recipe in that script.",
        f"   Contrast against --bg-card: primary text {contrast(values['--text-primary'], card):.1f}:1,"
        f" secondary {contrast(values['--text-secondary'], card):.1f}:1,"
        f" muted {contrast(values['--text-muted'], card):.1f}:1, link {contrast(values['--link'], card):.1f}:1. */",
        f':root[data-theme="team-{abbr.lower()}"] {{',
    ]
    for token, _ in base_order:
        if token in SKIP:
            continue
        lines.append(f"  {token}: {values[token]};")
    lines.append("}")
    return "\n".join(lines)


def upsert(css_text, abbr, block):
    marker = f':root[data-theme="team-{abbr.lower()}"]'
    if marker in css_text:
        start = css_text.index(marker)
        start = css_text.rindex("/*", 0, start)
        end = css_text.index("\n}", start) + 2
        return css_text[:start] + block + css_text[end:]
    return css_text.rstrip("\n") + "\n\n" + block + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("teams", nargs="*", help="team abbreviations, e.g. PHX")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--write", action="store_true", help="insert into css/theme.css")
    args = ap.parse_args()

    colors = {k: v for k, v in json.loads(COLORS_JSON.read_text()).items() if not k.startswith("_")}
    teams = sorted(colors) if args.all else [t.upper() for t in args.teams]
    if not teams:
        sys.exit("name a team, or pass --all")

    css_text = THEME_CSS.read_text()
    base = parse_root_block(css_text)

    for abbr in teams:
        if abbr not in colors:
            sys.exit(f"no colours on file for {abbr}")
        primary, accent = colors[abbr]["primary"], colors[abbr]["accent"]
        values, page, card = build_theme(primary, accent, base)
        missing = [t for t, _ in base if t not in SKIP and t not in values]
        if missing:
            sys.exit(f"{abbr}: recipe produced no value for {missing}")
        block = render_block(abbr, primary, accent, values, base, page, card)
        if args.write:
            css_text = upsert(css_text, abbr, block)
            print(f"{abbr}: {len(values)} tokens")
        else:
            print(block)

    if args.write:
        THEME_CSS.write_text(css_text)
        print(f"wrote {THEME_CSS.relative_to(REPO)}")


if __name__ == "__main__":
    main()
