"""OCR helpers for reading the 2K MyNBA UI off box-score VOD frames.

We shell out to the tesseract 5.x binary rather than depend on pytesseract/cv2
(neither is installed on the server). PIL + numpy + the tesseract CLI is enough.

Every crop region below is expressed in 1920x1080 coordinates as
(x0, y0, x1, y1). If the source frame is a different size we scale the box.
"""
from __future__ import annotations

import subprocess
import tempfile
import os
from PIL import Image, ImageOps

# ---- Fixed UI crop regions (1920x1080) --------------------------------------
# Derived from reference frames in the NBN "Association" MyNBA UI (2K).
REGIONS = {
    # Top banner label: "Association Box Score" / "Association Daily View".
    # "Association" is red (drops out under threshold); the white second word
    # ("Box Score" / "Daily View") is what we key on.
    "banner": (300, 32, 600, 78),
    # Left-most header cell of the middle table: "NAME" (player box score,
    # dark text on yellow) vs "STAT" (team comparison, light text on dark).
    "header_left": (662, 240, 878, 282),
    # Daily View date, big white text, top-left of the content panel.
    "date_dailyview": (150, 128, 520, 186),
    # Calendar date, white text, top-right ("March 10th, 2026").
    "date_calendar": (1545, 180, 1770, 222),
    # Left panel team names (box-score family): away on top, home below the
    # quarter-score strip. Identifies which game the box score belongs to.
    "team_top": (92, 163, 632, 210),
    "team_bottom": (92, 620, 632, 670),
    # Mid-panel header (next to LT/RT): the currently-displayed team's nickname
    # ("Cavaliers"/"76ers"). Tells us which of the two teams' rows are on screen
    # as the streamer toggles LT/RT within a box_score segment.
    "table_team": (735, 168, 1015, 208),
    # Left-panel quarter-score strip: away team on top, home below, each
    # "Q1 Q2 Q3 Q4 [OT] FINAL". Independent of the stat table -> cross-check.
    "quarter_away": (90, 500, 500, 542),
    "quarter_home": (90, 572, 500, 614),
}

BASE_W, BASE_H = 1920, 1080


def scale_box(box, w, h):
    if (w, h) == (BASE_W, BASE_H):
        return box
    sx, sy = w / BASE_W, h / BASE_H
    x0, y0, x1, y1 = box
    return (int(x0 * sx), int(y0 * sy), int(x1 * sx), int(y1 * sy))


def crop(img: Image.Image, region_name: str) -> Image.Image:
    return img.crop(scale_box(REGIONS[region_name], img.width, img.height))


def ocr(img: Image.Image, psm: int = 7, whitelist: str | None = None,
        upscale: int = 4) -> str:
    """OCR a small crop. Upscale + grayscale; let tesseract binarize (handles
    both light-on-dark and dark-on-light). Returns stripped text."""
    g = img.convert("L")
    if upscale != 1:
        g = g.resize((g.width * upscale, g.height * upscale), Image.LANCZOS)
    g = ImageOps.autocontrast(g)
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "c.png")
        g.save(p)
        cmd = ["tesseract", p, "stdout", "--psm", str(psm)]
        if whitelist:
            cmd += ["-c", f"tessedit_char_whitelist={whitelist}"]
        out = subprocess.run(cmd, capture_output=True, text=True)
        return out.stdout.strip()


def read_region(img: Image.Image, region_name: str, **kw) -> str:
    return ocr(crop(img, region_name), **kw)
