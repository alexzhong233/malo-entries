#!/usr/bin/env python3
import math
import os
import struct
import zlib

W = 1024
H = 1024

BG = (8, 12, 22)
PANEL = (18, 25, 41)
PANEL_EDGE = (44, 58, 82)
TEXT = (240, 244, 252)
MUTED = (150, 168, 196)
ACCENT = (255, 183, 62)
ACCENT_DARK = (109, 76, 28)
ALERT = (255, 96, 80)
ICE = (120, 207, 244)
GREEN = (126, 222, 154)
CLOUD = (206, 219, 238)
ICON_BG = (26, 36, 56)
GLOBE_FILL = (13, 20, 35)
GLOBE_LINE = (25, 38, 62)

FONT = {
    "A": ".###.\n#...#\n#...#\n#####\n#...#\n#...#\n#...#",
    "B": "####.\n#...#\n#...#\n####.\n#...#\n#...#\n####.",
    "C": ".####\n#....\n#....\n#....\n#....\n#....\n.####",
    "D": "####.\n#...#\n#...#\n#...#\n#...#\n#...#\n####.",
    "E": "#####\n#....\n#....\n####.\n#....\n#....\n#####",
    "F": "#####\n#....\n#....\n####.\n#....\n#....\n#....",
    "G": ".####\n#....\n#....\n#.###\n#...#\n#...#\n.###.",
    "H": "#...#\n#...#\n#...#\n#####\n#...#\n#...#\n#...#",
    "I": "#####\n..#..\n..#..\n..#..\n..#..\n..#..\n#####",
    "J": "..###\n....#\n....#\n....#\n#...#\n#...#\n.###.",
    "K": "#...#\n#..#.\n#.#..\n##...\n#.#..\n#..#.\n#...#",
    "L": "#....\n#....\n#....\n#....\n#....\n#....\n#####",
    "M": "#...#\n##.##\n#.#.#\n#.#.#\n#...#\n#...#\n#...#",
    "N": "#...#\n##..#\n#.#.#\n#..##\n#...#\n#...#\n#...#",
    "O": ".###.\n#...#\n#...#\n#...#\n#...#\n#...#\n.###.",
    "P": "####.\n#...#\n#...#\n####.\n#....\n#....\n#....",
    "Q": ".###.\n#...#\n#...#\n#...#\n#.#.#\n#..#.\n.##.#",
    "R": "####.\n#...#\n#...#\n####.\n#.#..\n#..#.\n#...#",
    "S": ".####\n#....\n#....\n.###.\n....#\n....#\n####.",
    "T": "#####\n..#..\n..#..\n..#..\n..#..\n..#..\n..#..",
    "U": "#...#\n#...#\n#...#\n#...#\n#...#\n#...#\n.###.",
    "V": "#...#\n#...#\n#...#\n#...#\n#...#\n.#.#.\n..#..",
    "W": "#...#\n#...#\n#...#\n#.#.#\n#.#.#\n##.##\n#...#",
    "X": "#...#\n#...#\n.#.#.\n..#..\n.#.#.\n#...#\n#...#",
    "Y": "#...#\n#...#\n.#.#.\n..#..\n..#..\n..#..\n..#..",
    "Z": "#####\n....#\n...#.\n..#..\n.#...\n#....\n#####",
    "0": ".###.\n#...#\n#..##\n#.#.#\n##..#\n#...#\n.###.",
    "1": "..#..\n.##..\n..#..\n..#..\n..#..\n..#..\n.###.",
    "2": ".###.\n#...#\n....#\n...#.\n..#..\n.#...\n#####",
    "3": "####.\n....#\n....#\n.###.\n....#\n....#\n####.",
    "4": "...#.\n..##.\n.#.#.\n#..#.\n#####\n...#.\n...#.",
    "5": "#####\n#....\n#....\n####.\n....#\n....#\n####.",
    "6": ".####\n#....\n#....\n####.\n#...#\n#...#\n.###.",
    "7": "#####\n....#\n...#.\n..#..\n.#...\n.#...\n.#...",
    "8": ".###.\n#...#\n#...#\n.###.\n#...#\n#...#\n.###.",
    "9": ".###.\n#...#\n#...#\n.####\n....#\n....#\n.###.",
    " ": ".....\n.....\n.....\n.....\n.....\n.....\n.....",
    ".": ".....\n.....\n.....\n.....\n.....\n.##..\n.##..",
    ",": ".....\n.....\n.....\n.....\n.##..\n.##..\n.#...",
    "-": ".....\n.....\n.....\n#####\n.....\n.....\n.....",
    ":": ".....\n.##..\n.##..\n.....\n.##..\n.##..\n.....",
    ";": ".....\n.##..\n.##..\n.....\n.##..\n.##..\n.#...",
    "/": "....#\n....#\n...#.\n..#..\n.#...\n#....\n#....",
    "+": ".....\n..#..\n..#..\n#####\n..#..\n..#..\n.....",
    "$": "..#..\n.####\n#.#..\n.###.\n..#.#\n####.\n..#..",
    "?": ".###.\n#...#\n....#\n...#.\n..#..\n.....\n..#..",
    "!": "..#..\n..#..\n..#..\n..#..\n..#..\n.....\n..#..",
    "'": "..#..\n..#..\n.....\n.....\n.....\n.....\n.....",
    "(": "...#.\n..#..\n.#...\n.#...\n.#...\n..#..\n...#.",
    ")": ".#...\n..#..\n...#.\n...#.\n...#.\n..#..\n.#...",
    "&": ".##..\n#..#.\n#.#..\n.##..\n#.#.#\n#..#.\n.##.#",
    "%": "##..#\n##..#\n...#.\n..#..\n.#...\n#..##\n#..##",
    "=": ".....\n.....\n#####\n.....\n#####\n.....\n.....",
}

GLYPHS = {k: v.split("\n") for k, v in FONT.items()}


class Canvas:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.buf = bytearray(width * height * 3)

    def put(self, x, y, color):
        x = int(x)
        y = int(y)
        if 0 <= x < self.width and 0 <= y < self.height:
            i = (y * self.width + x) * 3
            self.buf[i] = color[0]
            self.buf[i + 1] = color[1]
            self.buf[i + 2] = color[2]

    def fill(self, x, y, w, h, color):
        x = int(x)
        y = int(y)
        w = int(w)
        h = int(h)
        x0 = max(0, x)
        y0 = max(0, y)
        x1 = min(self.width, x + w)
        y1 = min(self.height, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        row = bytes(color) * (x1 - x0)
        for yy in range(y0, y1):
            i = (yy * self.width + x0) * 3
            self.buf[i:i + len(row)] = row

    def disk(self, cx, cy, r, color):
        cx = int(round(cx))
        cy = int(round(cy))
        r = int(r)
        rr = r * r
        for dy in range(-r, r + 1):
            half = math.isqrt(max(0, rr - dy * dy))
            self.fill(cx - half, cy + dy, 2 * half + 1, 1, color)

    def circle(self, cx, cy, r, color, width=1, filled=False):
        if filled:
            self.disk(cx, cy, r, color)
            return
        steps = max(48, int(r * 12))
        prev = None
        for i in range(steps + 1):
            t = 2 * math.pi * i / steps
            p = (round(cx + r * math.cos(t)), round(cy + r * math.sin(t)))
            if prev is not None:
                self.line(prev[0], prev[1], p[0], p[1], color, width)
            prev = p

    def ellipse(self, cx, cy, rx, ry, color, width=1):
        steps = max(48, int(max(rx, ry) * 12))
        prev = None
        for i in range(steps + 1):
            t = 2 * math.pi * i / steps
            p = (round(cx + rx * math.cos(t)), round(cy + ry * math.sin(t)))
            if prev is not None:
                self.line(prev[0], prev[1], p[0], p[1], color, width)
            prev = p

    def line(self, x0, y0, x1, y1, color, width=1):
        x0 = int(round(x0))
        y0 = int(round(y0))
        x1 = int(round(x1))
        y1 = int(round(y1))
        dx = abs(x1 - x0)
        dy = abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            if width <= 1:
                self.put(x0, y0, color)
            else:
                self.disk(x0, y0, width // 2, color)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    def poly(self, points, color, width=1, closed=True):
        n = len(points)
        for i in range(n if closed else n - 1):
            ax, ay = points[i]
            bx, by = points[(i + 1) % n]
            self.line(ax, ay, bx, by, color, width)

    def text(self, x, y, s, scale, color):
        for ch in s.upper():
            glyph = GLYPHS.get(ch, GLYPHS["?"])
            for ry, row in enumerate(glyph):
                for rx, cell in enumerate(row):
                    if cell == "#":
                        self.fill(x + rx * scale, y + ry * scale, scale, scale, color)
            x += 6 * scale
        return x

    def text_right(self, x_right, y, s, scale, color):
        return self.text(x_right - text_width(s, scale), y, s, scale, color)


def text_width(s, scale):
    if not s:
        return 0
    return len(s) * 6 * scale - scale


def wrap(s, limit):
    lines = []
    current = ""
    for word in s.split():
        if not current:
            current = word
        elif len(current) + 1 + len(word) <= limit:
            current += " " + word
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_globe_watermark(c):
    cx, cy, r = 897, 120, 80
    c.disk(cx, cy, r, GLOBE_FILL)
    c.circle(cx, cy, r, GLOBE_LINE, 2)
    c.ellipse(cx, cy, r // 3, r, GLOBE_LINE, 2)
    c.ellipse(cx, cy, 2 * r // 3, r, GLOBE_LINE, 2)
    for dy in (-52, -27, 0, 27, 52):
        half = math.isqrt(max(0, r * r - dy * dy))
        c.line(cx - half, cy + dy, cx + half, cy + dy, GLOBE_LINE, 2)


def draw_masthead(c):
    c.fill(0, 0, W, 266, BG)
    c.fill(40, 37, 11, 11, ACCENT)
    c.text(62, 35, "WORLD NEWS", 2, TEXT)
    c.text(206, 35, "/  DAILY BRIEF", 2, MUTED)
    c.text(42, 71, "17 NOVEMBER 2026", 8, ACCENT_DARK)
    c.text(40, 68, "17 NOVEMBER 2026", 8, ACCENT)
    c.text(40, 148, "THE DAY IN EIGHT STORIES", 3, TEXT)
    c.text(508, 151, "/  WORLD BRIEF", 3, MUTED)
    draw_globe_watermark(c)
    c.fill(40, 180, 944, 3, ACCENT)
    c.fill(40, 178, 150, 7, ACCENT)
    c.text(40, 199, "ASIA   MIDEAST   CLIMATE   UKRAINE   AFRICA   TAIWAN   SPORTS", 2, MUTED)


def icon_globe(c, cx, cy):
    c.circle(cx, cy - 6, 9, ACCENT, 2)
    c.ellipse(cx, cy - 6, 4, 9, ACCENT, 1)
    c.line(cx - 9, cy - 6, cx + 9, cy - 6, ACCENT, 1)
    c.line(cx - 7, cy + 12, cx + 7, cy + 12, TEXT, 2)
    c.line(cx, cy + 12, cx, cy + 4, TEXT, 2)
    c.line(cx + 1, cy + 5, cx + 6, cy + 11, ACCENT, 1)


def icon_crosshair(c, cx, cy):
    c.circle(cx, cy, 10, ACCENT, 2)
    c.circle(cx, cy, 4, ACCENT, 2)
    c.line(cx - 15, cy, cx - 6, cy, ACCENT, 2)
    c.line(cx + 6, cy, cx + 15, cy, ACCENT, 2)
    c.line(cx, cy - 15, cx, cy - 6, ACCENT, 2)
    c.line(cx, cy + 6, cx, cy + 15, ACCENT, 2)
    c.disk(cx, cy, 2, ALERT)


def icon_cloud(c, cx, cy):
    c.disk(cx - 7, cy - 3, 6, CLOUD)
    c.disk(cx, cy - 7, 8, CLOUD)
    c.disk(cx + 7, cy - 3, 6, CLOUD)
    c.fill(cx - 12, cy - 4, 24, 6, CLOUD)
    for dx in (-8, 0, 8):
        c.line(cx + dx - 2, cy + 5, cx + dx - 4, cy + 12, ICE, 2)


def icon_leaf(c, cx, cy):
    pts = []
    ang = -math.pi / 4
    for i in range(72):
        t = 2 * math.pi * i / 72
        ex = 11 * math.cos(t)
        ey = 5 * math.sin(t)
        px = cx + ex * math.cos(ang) - ey * math.sin(ang)
        py = cy + ex * math.sin(ang) + ey * math.cos(ang)
        pts.append((round(px), round(py)))
    c.poly(pts, GREEN, 2)
    c.line(cx - 8, cy + 8, cx + 8, cy - 8, GREEN, 2)


def icon_snow(c, cx, cy):
    for ang in (0, math.pi / 3, 2 * math.pi / 3):
        dx = math.cos(ang) * 11
        dy = math.sin(ang) * 11
        c.line(cx - dx, cy - dy, cx + dx, cy + dy, ICE, 2)
        px = -dy / 11 * 3.5
        py = dx / 11 * 3.5
        for s in (-1, 1):
            bx = cx + s * dx * 0.62
            by = cy + s * dy * 0.62
            c.line(bx, by, bx + s * dx * 0.28 + px, by + s * dy * 0.28 + py, ICE, 1)
            c.line(bx, by, bx + s * dx * 0.28 - px, by + s * dy * 0.28 - py, ICE, 1)


def icon_wheat(c, cx, cy):
    pts = [(cx + round(12 * math.cos(math.pi * i / 12)),
            cy + 2 + round(9 * math.sin(math.pi * i / 12))) for i in range(13)]
    c.poly(pts, ACCENT, 2, closed=False)
    c.line(cx - 12, cy + 2, cx + 12, cy + 2, ACCENT, 2)
    for sx in (-7, 0, 7):
        c.line(cx + sx, cy + 1, cx + sx, cy - 10, GREEN, 1)
        for gy in (-2, -5, -8):
            c.line(cx + sx, cy + gy, cx + sx - 3, cy + gy - 2, GREEN, 1)
            c.line(cx + sx, cy + gy, cx + sx + 3, cy + gy - 2, GREEN, 1)


def icon_missile(c, cx, cy):
    c.line(cx - 8, cy + 8, cx + 6, cy - 6, ACCENT, 4)
    c.poly([(cx + 4, cy - 9), (cx + 12, cy - 12), (cx + 8, cy - 3)], ACCENT, closed=True)
    c.line(cx - 5, cy + 4, cx - 12, cy + 3, ACCENT, 2)
    c.line(cx - 2, cy + 8, cx - 3, cy + 13, ACCENT, 2)
    c.disk(cx - 10, cy + 11, 2, ALERT)


def icon_bat(c, cx, cy):
    c.line(cx - 9, cy + 9, cx + 2, cy - 2, ACCENT, 9)
    c.line(cx + 2, cy - 2, cx + 9, cy - 9, TEXT, 3)
    c.line(cx - 1, cy - 5, cx + 5, cy + 1, TEXT, 2)
    c.disk(cx - 12, cy - 6, 3, ALERT)


ICONS = {
    "globe": icon_globe,
    "crosshair": icon_crosshair,
    "cloud": icon_cloud,
    "leaf": icon_leaf,
    "snow": icon_snow,
    "wheat": icon_wheat,
    "missile": icon_missile,
    "bat": icon_bat,
}

STORIES = [
    ("01 / ASIA", "globe", "TRUMP OPENS ASIA TOUR",
     "ASEAN + QUAD SUMMITS; MAY MEET KIM IN CHINA"),
    ("02 / MIDEAST", "crosshair", "IRAN STRIKES BAHRAIN",
     "DRONES HIT US RADAR; THIRD STRIKE IN 5 DAYS"),
    ("03 / GAZA", "cloud", "RAIN FLOODS GAZA CAMPS",
     "GERMANY DEMANDS MORE AID BEFORE WINTER"),
    ("04 / CLIMATE", "leaf", "CLIMATE TIPPING POINTS",
     "COP31: ROCKSTROM WARNS; $200M FOR GEF"),
    ("05 / UKRAINE", "snow", "UKRAINE FACES WINTER CHILL",
     "RUSSIAN STRIKES EXPOSE NATION TO THE COLD"),
    ("06 / KENYA", "wheat", "WFP FEEDS KENYA FAMILIES",
     "FAMILIES FLEE ETHIOPIA; 'HUNGER NOT A CONCERN'"),
    ("07 / TAIWAN", "missile", "TAIWAN NEEDS $14B ARMS",
     "URGENT NEED FOR US ARMS; DEAL UP TO TRUMP"),
    ("08 / SPORTS", "bat", "DHONI QUITS, ALCARAZ WINS",
     "5 TITLES, 5,439 RUNS; ALCARAZ BEATS TIAFOE"),
]


def draw_tile(c, x, y, index):
    w = 463
    h = 170
    tag, icon, headline, detail = STORIES[index]
    c.fill(x, y, w, h, PANEL)
    for dx in range(w):
        c.put(x + dx, y, PANEL_EDGE)
        c.put(x + dx, y + h - 1, PANEL_EDGE)
    for dy in range(h):
        c.put(x, y + dy, PANEL_EDGE)
        c.put(x + w - 1, y + dy, PANEL_EDGE)
    c.fill(x, y, 4, h, ACCENT)

    cx, cy = x + 44, y + 46
    c.disk(cx, cy, 24, ICON_BG)
    c.circle(cx, cy, 24, PANEL_EDGE, 1)
    ICONS[icon](c, cx, cy)

    c.text_right(x + w - 18, y + 16, tag, 2, ACCENT)

    for i, line in enumerate(wrap(headline, 15)[:2]):
        c.text(x + 80, y + 32 + i * 32, line, 4, TEXT)

    c.line(x + 20, y + 100, x + w - 20, y + 100, PANEL_EDGE, 1)
    for i, line in enumerate(wrap(detail, 23)[:2]):
        c.text(x + 20, y + 110 + i * 26, line, 3, MUTED)


def render():
    c = Canvas(W, H)
    c.fill(0, 0, W, H, BG)
    draw_masthead(c)
    for i in range(8):
        col = i % 2
        row = i // 2
        draw_tile(c, 40 + col * 481, 266 + row * 186, i)
    return c


def png_bytes(c):
    raw = bytearray()
    for y in range(c.height):
        raw.append(0)
        raw.extend(c.buf[y * c.width * 3:(y + 1) * c.width * 3])
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", c.width, c.height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", compressed) + chunk(b"IEND", b""))


def main():
    out_dir = os.environ.get("OUT_DIR", "/output")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "entry.png")
    with open(path, "wb") as fh:
        fh.write(png_bytes(render()))


if __name__ == "__main__":
    main()
