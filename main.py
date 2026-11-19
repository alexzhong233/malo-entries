"""Render the 19 November 2026 world-news poster as a deterministic PNG.

Stdlib only (os, struct, sys, zlib).  No clock, no randomness, no network:
the same source always emits byte-identical bytes.  The PNG is written by
hand (IHDR / IDAT / IEND, one filter-0 RGB scanline per row) and every
letter is painted from the embedded 5x7 bitmap font below.
"""

import os
import struct
import sys
import zlib

# ---------------------------------------------------------------------------
# Canvas and palette
# ---------------------------------------------------------------------------

W = H = 1024

# Vertical rhythm: masthead -> tight 2x4 grid -> generous 4-line ticker.
GRID_TOP = 152
CARD_W = 492
CARD_H = 180
COL_PITCH = 500
ROW_PITCH = 186
TICKER_TOP = 898

# Width budgets (in pixels) used by both the copy checks and the renderer.
CARD_TEXT_MAX = 372          # x+116 .. x+487, clear of the card's right border
HEAD_REGION_MAX = 320        # leaves a clear gap before the right-aligned field
HEAD_FIELD_MAX = 170
TICKER_TEXT_MAX = W - 36     # 28px left inset + 8px right safety margin

BG = (10, 16, 30)
PANEL = (20, 29, 50)
PANEL_EDGE = (38, 52, 82)
WELL = (14, 22, 40)
WHITE = (240, 245, 252)
MUTED = (166, 184, 212)
DIM = (108, 126, 158)
INK = (12, 18, 32)
GOLD = (246, 199, 32)
GOLD_LIGHT = (255, 232, 138)
RED = (228, 66, 74)
GREEN = (66, 202, 146)
BLUE = (64, 140, 232)

PX = bytearray(bytes(BG) * (W * H))


def put(x, y, c):
    """Set one pixel, silently clipping anything outside the canvas."""
    if 0 <= x < W and 0 <= y < H:
        i = (y * W + x) * 3
        PX[i] = c[0]
        PX[i + 1] = c[1]
        PX[i + 2] = c[2]


def rect(x, y, w, h, c):
    """Filled rectangle, clipped to the canvas."""
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(W, x + w)
    y1 = min(H, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    run = bytes(c) * (x1 - x0)
    span = (x1 - x0) * 3
    for yy in range(y0, y1):
        i = (yy * W + x0) * 3
        PX[i:i + span] = run


def outline(x, y, w, h, c, t=1):
    rect(x, y, w, t, c)
    rect(x, y + h - t, w, t, c)
    rect(x, y, t, h, c)
    rect(x + w - t, y, t, h, c)


def disc(cx, cy, r, c):
    """Filled integer circle."""
    r2 = r * r
    for dy in range(-r, r + 1):
        span = int((r2 - dy * dy) ** 0.5)
        rect(cx - span, cy + dy, 2 * span + 1, 1, c)


def line(x0, y0, x1, y1, c, t=1):
    """Bresenham line with a round pen of thickness t."""
    r = max(0, (t - 1) // 2)
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        if r:
            disc(x0, y0, r, c)
        else:
            put(x0, y0, c)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def polygon(points, c):
    """Even-odd scanline fill for a small integer polygon."""
    ys = [p[1] for p in points]
    for yy in range(min(ys), max(ys) + 1):
        sample = yy + 0.5
        xs = []
        for i in range(len(points)):
            ax, ay = points[i]
            bx, by = points[(i + 1) % len(points)]
            if (ay <= sample < by) or (by <= sample < ay):
                xs.append(ax + (sample - ay) * (bx - ax) / (by - ay))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            a = int(xs[i] + 0.5)
            b = int(xs[i + 1] + 0.5)
            if b > a:
                rect(a, yy, b - a, 1, c)


def dim(c, factor):
    return tuple(max(0, min(255, int(v * factor))) for v in c)


# ---------------------------------------------------------------------------
# Hand-drawn 5x7 bitmap font.  Each glyph is seven rows of five cells.
# ---------------------------------------------------------------------------

FONT_RAW = {
    "A": (".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    "B": ("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),
    "C": (".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
    "D": ("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
    "E": ("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
    "F": ("#####", "#....", "#....", "####.", "#....", "#....", "#...."),
    "G": (".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."),
    "H": ("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    "I": ("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"),
    "J": ("..###", "....#", "....#", "....#", "#...#", "#...#", ".###."),
    "K": ("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
    "L": ("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
    "M": ("#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"),
    "N": ("#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"),
    "O": (".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    "P": ("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
    "Q": (".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),
    "R": ("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
    "S": (".####", "#....", "#....", ".###.", "....#", "....#", "####."),
    "T": ("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
    "U": ("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    "V": ("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),
    "W": ("#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"),
    "X": ("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),
    "Y": ("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
    "Z": ("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),
    "0": (".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),
    "1": ("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"),
    "2": (".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),
    "3": ("####.", "....#", "....#", ".###.", "....#", "....#", "####."),
    "4": ("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),
    "5": ("#####", "#....", "#....", "####.", "....#", "....#", "####."),
    "6": (".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."),
    "7": ("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
    "8": (".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),
    "9": (".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."),
    " ": (".....", ".....", ".....", ".....", ".....", ".....", "....."),
    ".": (".....", ".....", ".....", ".....", ".....", ".##..", ".##.."),
    ",": (".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."),
    ":": (".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."),
    "-": (".....", ".....", ".....", "#####", ".....", ".....", "....."),
    "+": (".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."),
    "%": ("##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"),
    "'": ("..#..", "..#..", ".....", ".....", ".....", ".....", "....."),
    "/": ("....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."),
    "$": ("..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."),
    "&": (".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"),
    "(": ("...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."),
    ")": (".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."),
    "!": ("..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."),
    "?": (".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."),
    "~": (".....", ".....", ".##..", "#..#.", ".....", ".....", "....."),
    "=": (".....", ".....", "#####", ".....", "#####", ".....", "....."),
}

for _ch, _rows in FONT_RAW.items():
    assert len(_rows) == 7, _ch
    assert all(len(_r) == 5 for _r in _rows), _ch

FONT = {
    ch: tuple(
        sum(1 << (4 - i) for i, cell in enumerate(row) if cell == "#")
        for row in rows
    )
    for ch, rows in FONT_RAW.items()
}


def text_width(text, scale):
    """Advance of a monospaced 5x7 string (including the inter-glyph column)."""
    return len(text) * 6 * scale - scale


def draw_text(x, y, text, c, scale=1, scales=None, max_width=None):
    """Paint text; `scales` optionally gives a per-character scale factor."""
    if max_width is not None and text_width(text, scale) > max_width:
        raise ValueError("text too wide: %r (%d > %d)" % (text, text_width(text, scale), max_width))
    cx = x
    for i, ch in enumerate(text):
        glyph = FONT.get(ch)
        if glyph is None:
            raise ValueError("missing glyph for %r" % ch)
        s = scales[i] if scales is not None else scale
        for row, bits in enumerate(glyph):
            for col in range(5):
                if bits & (1 << (4 - col)):
                    rect(cx + col * s, y + row * s, s, s, c)
        cx += 6 * s
    return cx - x


def centered_text(cy, text, c, scale):
    draw_text((W - text_width(text, scale)) // 2, cy, text, c, scale)


# ---------------------------------------------------------------------------
# Flat pictograms, drawn only with rects / lines / discs / polygons
# ---------------------------------------------------------------------------

class Icon:
    def __init__(self, x, y, col):
        self.x = x
        self.y = y
        self.col = col

    def rect(self, x, y, w, h, c=None):
        rect(self.x + x, self.y + y, w, h, c if c is not None else self.col)

    def outline(self, x, y, w, h, c=None, t=1):
        outline(self.x + x, self.y + y, w, h, c if c is not None else self.col, t)

    def disc(self, cx, cy, r, c=None):
        disc(self.x + cx, self.y + cy, r, c if c is not None else self.col)

    def line(self, x0, y0, x1, y1, c=None, t=1):
        line(self.x + x0, self.y + y0, self.x + x1, self.y + y1,
             c if c is not None else self.col, t)

    def poly(self, pts, c=None):
        polygon([(self.x + a, self.y + b) for a, b in pts],
                c if c is not None else self.col)


def icon_diplomacy(ic):
    body = dim(ic.col, 0.72)
    ic.disc(20, 22, 7, WHITE)
    ic.disc(48, 13, 7, WHITE)
    ic.disc(76, 22, 7, WHITE)
    ic.rect(10, 31, 20, 18, body)
    ic.rect(38, 22, 20, 18, body)
    ic.rect(66, 31, 20, 18, body)
    ic.line(22, 68, 48, 54, GOLD, 5)
    ic.line(48, 54, 74, 68, GOLD, 5)
    ic.rect(42, 56, 12, 9, GOLD_LIGHT)
    ic.disc(48, 61, 3, GOLD)


def icon_europe(ic):
    ic.rect(12, 14, 72, 40, (58, 108, 214))
    ic.rect(12, 34, 72, 20, GOLD)
    ic.outline(12, 14, 72, 40, WHITE, 2)
    for cx, cy in ((24, 76), (48, 70), (72, 76)):
        ic.disc(cx, cy, 6, WHITE)
        ic.rect(cx - 9, cy + 7, 18, 13, dim(ic.col, 0.8))
    ic.rect(10, 90, 76, 3, dim(WHITE, 0.5))


def icon_gulf(ic):
    ic.poly([(48, 8), (68, 38), (76, 62), (60, 74), (36, 74), (20, 62), (28, 38)], RED)
    ic.poly([(48, 28), (62, 52), (54, 68), (42, 68), (34, 52)], (242, 138, 40))
    ic.poly([(48, 44), (55, 60), (41, 60)], GOLD_LIGHT)
    for yy in (80, 88, 96):
        ic.line(14, yy, 82, yy, BLUE, 2)
        ic.line(24, yy + 3, 72, yy + 3, dim(BLUE, 0.7), 1)


def icon_riyadh(ic):
    tower = [(40, 92), (40, 34), (44, 34), (44, 26), (52, 26),
             (52, 18), (60, 18), (60, 26), (68, 26), (68, 34),
             (72, 34), (72, 92)]
    ic.poly(tower, (188, 200, 224))
    ic.line(56, 8, 56, 18, WHITE, 2)
    for xx in (46, 56, 66):
        for yy in (40, 52, 64, 76):
            ic.rect(xx, yy, 4, 6, dim(ic.col, 0.55))
    ic.rect(34, 92, 44, 4, GOLD)
    ic.line(6, 18, 58, 54, RED, 3)
    ic.disc(58, 54, 4, GOLD_LIGHT)
    for x, y in ((70, 40), (82, 62), (64, 72)):
        ic.rect(x, y, 5, 5, RED)


def icon_chip(ic):
    for i in range(5):
        p = 24 + i * 12
        ic.rect(p, 10, 6, 10, GOLD)
        ic.rect(p, 76, 6, 10, GOLD)
        ic.rect(10, p, 10, 6, GOLD)
        ic.rect(76, p, 10, 6, GOLD)
    ic.rect(20, 20, 56, 56, dim(ic.col, 0.45))
    ic.outline(20, 20, 56, 56, ic.col, 3)
    ic.rect(34, 34, 28, 28, dim(ic.col, 0.8))
    ic.outline(34, 34, 28, 28, WHITE, 1)
    ic.rect(44, 44, 8, 8, WHITE)
    # Solid corner glints (a 1px Bresenham diagonal only produced loose specks).
    ic.rect(27, 27, 3, 3, GOLD_LIGHT)
    ic.rect(62, 27, 3, 3, GOLD_LIGHT)


def icon_virus(ic):
    for x0, y0, x1, y1 in ((48, 26, 48, 10), (48, 70, 48, 86),
                           (26, 48, 10, 48), (70, 48, 86, 48),
                           (32, 32, 21, 21), (64, 32, 75, 21),
                           (32, 64, 21, 75), (64, 64, 75, 75)):
        ic.line(x0, y0, x1, y1, ic.col, 3)
        ic.disc(x1, y1, 4, GOLD)
    ic.disc(48, 48, 20, ic.col)
    for dx, dy in ((-9, -7), (8, -8), (0, 2), (-7, 9), (9, 8)):
        ic.disc(48 + dx, 48 + dy, 3, dim(ic.col, 0.4))


def icon_ballot(ic):
    ic.outline(16, 24, 64, 58, ic.col, 3)
    ic.rect(30, 19, 36, 5, dim(ic.col, 0.7))
    ic.rect(24, 32, 48, 14, dim(WHITE, 0.85))
    ic.rect(24, 54, 32, 3, DIM)
    ic.rect(24, 62, 38, 3, DIM)
    ic.line(28, 72, 42, 84, GREEN, 5)
    ic.line(42, 84, 72, 50, GREEN, 5)


def icon_pencil(ic):
    ic.rect(10, 16, 44, 64, dim(WHITE, 0.85))
    for yy in (28, 38, 48, 58):
        ic.rect(16, yy, 32, 2, DIM)
    ic.line(44, 86, 70, 42, GOLD, 7)
    ic.poly([(70, 42), (86, 22), (64, 34)], GOLD_LIGHT)
    ic.rect(80, 22, 6, 4, INK)  # graphite tip: a solid block, not a 1px triangle
    ic.rect(28, 84, 12, 9, (228, 110, 150))
    ic.rect(40, 80, 5, 6, (176, 184, 198))


ICONS = {
    "diplomacy": icon_diplomacy,
    "europe": icon_europe,
    "gulf": icon_gulf,
    "riyadh": icon_riyadh,
    "chip": icon_chip,
    "virus": icon_virus,
    "ballot": icon_ballot,
    "pencil": icon_pencil,
}

# ---------------------------------------------------------------------------
# The eight verified stories of 19 November 2026 (all text is uppercase)
# ---------------------------------------------------------------------------

STORIES = [
    dict(region="ASIA-PACIFIC", field="DIPLOMACY", color=BLUE, icon="diplomacy",
         label=("US-CHINA-RUSSIA", "1ST-EVER SUMMIT"),
         sub=("TRUMP XI PUTIN", "AT APEC SHENZHEN", "NUCLEAR + UKRAINE")),
    dict(region="EUROPE", field="UKRAINE", color=(92, 112, 226), icon="europe",
         label=("COALITION MEETS", "IN BERLIN"),
         sub=("EU LOAN EUR 45B", "MERZ, MACRON,", "ZELENSKYY, 30+")),
    dict(region="MIDDLE EAST", field="CONFLICT", color=(230, 78, 78), icon="gulf",
         label=("IRAN STRIKES", "US BASE, KUWAIT"),
         sub=("BAHRAIN HIT", "HORMUZ OIL FLOWS", "8.5M BARRELS/DAY")),
    dict(region="MIDDLE EAST", field="YEMEN", color=(176, 92, 214), icon="riyadh",
         label=("HOUTHI DEBRIS", "HITS RIYADH"),
         sub=("PIF TOWER HIT", "SAUDI STRIKES SAADA", "IN YEMEN")),
    dict(region="BUSINESS", field="TECH", color=GREEN, icon="chip",
         label=("NVIDIA REVENUE", "HITS $115.8B"),
         sub=("UP 103% Y/Y", "Q4 FORECAST ~$130B", "ON AI DEMAND")),
    dict(region="AFRICA", field="HEALTH", color=(240, 154, 52), icon="virus",
         label=("EBOLA OUTBREAK", "PASSES 6 MONTHS"),
         sub=("DRC: 5,400+", "11,000+ INFECTED", "STILL UNCONTROLLED")),
    dict(region="AMERICAS", field="POLITICS", color=(54, 194, 202), icon="ballot",
         label=("PELTOLA WINS", "ALASKA SPECIAL"),
         sub=("SENATE 56-44", "BEATS SULLIVAN", "DEM MAJORITY")),
    dict(region="ASIA", field="KOREA", color=(234, 116, 156), icon="pencil",
         label=("KOREA CSAT EXAM", "550,000 SIT"),
         sub=("BLACK PENCILS", "OVER AI CHEATING", "FEARS NATIONWIDE")),
]

DATE_TEXT = "19 NOVEMBER 2026"

TICKER = (
    "SENEGAL BOAT: ~100 ABOARD, DOZENS MISSING",
    "BANGLADESH PROTESTS OVER HASINA'S RETURN",
    "ICJ TO RULE IN ROHINGYA GENOCIDE CASE",
    "CAMBRIDGE WORD OF YEAR: HUMAN",
)

GLYPHS = set(FONT)

# Every one of these must come from the digit / punctuation glyphs below.
CRITICAL_NUMBERS = ("5,400+", "11,000+", "115.8B", "550,000", "56-44",
                    "8.5M", "103%", "45B", "130B", "30+", "~100")


def check_copy():
    """Guard against clipped lines, missing glyphs and a second date."""
    for token in CRITICAL_NUMBERS:
        assert set(token) <= GLYPHS, token
        assert all(ch in GLYPHS for ch in token if ch.isdigit()), token

    all_lines = [DATE_TEXT]
    for st in STORIES:
        lines = [(st["region"], HEAD_REGION_MAX, 3),
                 (st["field"], HEAD_FIELD_MAX, 3)]
        lines += [(t, CARD_TEXT_MAX, 4) for t in st["label"]]
        lines += [(st["sub"][0], CARD_TEXT_MAX, 4)]
        lines += [(t, CARD_TEXT_MAX, 3) for t in st["sub"][1:]]
        all_lines += [item[0] for item in lines]
        for text, budget, scale in lines:
            assert set(text) <= GLYPHS, text
            width = text_width(text, scale)
            assert width <= budget, (text, width, budget)
        # The two header columns must never collide, whatever the copy says.
        region_end = 10 + text_width(st["region"], 3)
        field_start = 482 - text_width(st["field"], 3)
        assert region_end + 8 <= field_start, st["region"]

    all_lines += list(TICKER)
    for brief in TICKER:
        assert set(brief) <= GLYPHS, brief
        width = text_width(brief, 4)
        assert width <= TICKER_TEXT_MAX, (brief, width, TICKER_TEXT_MAX)

    # 19 NOVEMBER 2026 is the only date anywhere in the poster.
    assert sum(t.count("2026") for t in all_lines) == 1
    assert all(t == DATE_TEXT or "20" not in t for t in all_lines)


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------

def draw_masthead():
    # Flanking accent bars keep the wide title from floating in empty space.
    rect(226, 26, 8, 52, RED)
    rect(246, 34, 4, 36, GOLD)
    rect(770, 34, 4, 36, GOLD)
    rect(790, 26, 8, 52, RED)
    centered_text(18, "WORLD NEWS", WHITE, 8)
    rect(0, 92, W, 2, PANEL_EDGE)

    # The one and only date in the whole image, set large in the gold band.
    rect(0, 100, W, 48, GOLD)
    centered_text(103, DATE_TEXT, INK, 6)
    rect(0, 146, W, 2, (168, 132, 20))


def draw_card(st, x, y):
    col = st["color"]
    rect(x, y, CARD_W, CARD_H, PANEL)
    outline(x, y, CARD_W, CARD_H, PANEL_EDGE, 2)
    rect(x + 2, y + 2, CARD_W - 4, 28, col)
    draw_text(x + 10, y + 5, st["region"], WHITE, 3, max_width=HEAD_REGION_MAX)
    fw = text_width(st["field"], 3)
    draw_text(x + 482 - fw, y + 5, st["field"], dim(WHITE, 0.82), 3,
              max_width=HEAD_FIELD_MAX)

    # Sunken icon well at the left of the card.
    rect(x + 10, y + 38, 96, 136, WELL)
    outline(x + 10, y + 38, 96, 136, dim(col, 0.55), 1)
    ICONS[st["icon"]](Icon(x + 14, y + 58, col))

    tx = x + 116
    draw_text(tx, y + 38, st["label"][0], WHITE, 4, max_width=CARD_TEXT_MAX)
    draw_text(tx, y + 70, st["label"][1], GOLD_LIGHT, 4, max_width=CARD_TEXT_MAX)
    draw_text(tx, y + 102, st["sub"][0], WHITE, 4, max_width=CARD_TEXT_MAX)
    draw_text(tx, y + 132, st["sub"][1], MUTED, 3, max_width=CARD_TEXT_MAX)
    draw_text(tx, y + 155, st["sub"][2], MUTED, 3, max_width=CARD_TEXT_MAX)


def draw_grid():
    for i, st in enumerate(STORIES):
        col = i % 2
        row = i // 2
        draw_card(st, 16 + col * COL_PITCH, GRID_TOP + row * ROW_PITCH)


def draw_ticker():
    # A taller strip lets all four briefs use the larger scale-4 glyphs.
    rect(0, TICKER_TOP, W, H - TICKER_TOP, (15, 23, 42))
    rect(0, TICKER_TOP, W, 2, GOLD)
    for i, brief in enumerate(TICKER):
        ty = TICKER_TOP + 4 + i * 30
        rect(14, ty + 11, 5, 5, RED if i % 2 == 0 else GOLD)
        draw_text(28, ty, brief, WHITE if i % 2 == 0 else MUTED, 4,
                  max_width=TICKER_TEXT_MAX)
        if i < len(TICKER) - 1:
            rect(28, ty + 29, W - 56, 1, PANEL_EDGE)


def render():
    check_copy()
    draw_masthead()
    draw_grid()
    draw_ticker()


# ---------------------------------------------------------------------------
# Minimal, deterministic PNG encoder
# ---------------------------------------------------------------------------

def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def encode_png():
    raw = bytearray()
    stride = W * 3
    for y in range(H):
        raw.append(0)  # filter type 0 (None)
        raw += PX[y * stride:(y + 1) * stride]
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
            chunk(b"IEND", b""))


def main():
    out_dir = os.environ.get("OUT_DIR", "/output")
    os.makedirs(out_dir, exist_ok=True)
    render()
    blob = encode_png()
    path = os.path.join(out_dir, "entry.png")
    with open(path, "wb") as handle:
        handle.write(blob)
    sys.stdout.write("wrote %s (%d bytes)\n" % (path, len(blob)))


if __name__ == "__main__":
    main()
