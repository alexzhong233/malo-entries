#!/usr/bin/env python3
import os
import struct
import zlib

W = 1024
H = 1024
OUT_DIR = os.environ.get("OUT_DIR", "/output")
OUT_PATH = os.path.join(OUT_DIR, "entry.png")

# 5x7 bitmap font, each char: 7 rows top->bottom, 5 bits MSB-left (bit4 leftmost)
FONT = {
    ' ': (0x00,0x00,0x00,0x00,0x00,0x00,0x00),
    'A': (0x0E,0x11,0x11,0x1F,0x11,0x11,0x11),
    'B': (0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E),
    'C': (0x0E,0x11,0x10,0x10,0x10,0x11,0x0E),
    'D': (0x1C,0x12,0x11,0x11,0x11,0x12,0x1C),
    'E': (0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F),
    'F': (0x1F,0x10,0x10,0x1E,0x10,0x10,0x10),
    'G': (0x0E,0x11,0x10,0x17,0x11,0x11,0x0F),
    'H': (0x11,0x11,0x11,0x1F,0x11,0x11,0x11),
    'I': (0x0E,0x04,0x04,0x04,0x04,0x04,0x0E),
    'J': (0x01,0x01,0x01,0x01,0x11,0x11,0x0E),
    'K': (0x11,0x12,0x14,0x18,0x14,0x12,0x11),
    'L': (0x10,0x10,0x10,0x10,0x10,0x10,0x1F),
    'M': (0x11,0x1B,0x15,0x15,0x11,0x11,0x11),
    'N': (0x11,0x19,0x15,0x13,0x11,0x11,0x11),
    'O': (0x0E,0x11,0x11,0x11,0x11,0x11,0x0E),
    'P': (0x1E,0x11,0x11,0x1E,0x10,0x10,0x10),
    'Q': (0x0E,0x11,0x11,0x11,0x15,0x12,0x0D),
    'R': (0x1E,0x11,0x11,0x1E,0x14,0x12,0x11),
    'S': (0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E),
    'T': (0x1F,0x04,0x04,0x04,0x04,0x04,0x04),
    'U': (0x11,0x11,0x11,0x11,0x11,0x11,0x0E),
    'V': (0x11,0x11,0x11,0x11,0x11,0x0A,0x04),
    'W': (0x11,0x11,0x11,0x15,0x15,0x15,0x0A),
    'X': (0x11,0x11,0x0A,0x04,0x0A,0x11,0x11),
    'Y': (0x11,0x11,0x0A,0x04,0x04,0x04,0x04),
    'Z': (0x1F,0x01,0x02,0x04,0x08,0x10,0x1F),
    '0': (0x0E,0x11,0x13,0x15,0x19,0x11,0x0E),
    '1': (0x04,0x0C,0x04,0x04,0x04,0x04,0x0E),
    '2': (0x0E,0x11,0x01,0x02,0x04,0x08,0x1F),
    '3': (0x1E,0x01,0x01,0x0E,0x01,0x01,0x1E),
    '4': (0x02,0x06,0x0A,0x12,0x1F,0x02,0x02),
    '5': (0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E),
    '6': (0x06,0x08,0x10,0x1E,0x11,0x11,0x0E),
    '7': (0x1F,0x01,0x02,0x04,0x08,0x08,0x08),
    '8': (0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E),
    '9': (0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C),
    ',': (0x00,0x00,0x00,0x00,0x00,0x04,0x08),
    '.': (0x00,0x00,0x00,0x00,0x00,0x00,0x04),
    ':': (0x00,0x04,0x00,0x00,0x00,0x04,0x00),
    '-': (0x00,0x00,0x00,0x1F,0x00,0x00,0x00),
    "'": (0x04,0x04,0x08,0x00,0x00,0x00,0x00),
    '/': (0x01,0x01,0x02,0x04,0x08,0x10,0x10),
    '(': (0x02,0x04,0x08,0x08,0x08,0x04,0x02),
    ')': (0x08,0x04,0x02,0x02,0x02,0x04,0x08),
    '+': (0x00,0x04,0x04,0x1F,0x04,0x04,0x00),
    '!': (0x04,0x04,0x04,0x04,0x04,0x00,0x04),
    '?': (0x0E,0x11,0x01,0x02,0x04,0x00,0x04),
    '&': (0x08,0x14,0x14,0x08,0x15,0x12,0x0D),
    '$': (0x04,0x0F,0x14,0x0E,0x05,0x1E,0x04),
    '|': (0x04,0x04,0x04,0x04,0x04,0x04,0x04),
}

class Canvas:
    def __init__(self, w, h, bg=(255,255,255)):
        self.w = w
        self.h = h
        self.buf = bytearray(w*h*3)
        if bg != (0,0,0):
            row = bytes(bg) * w
            for y in range(h):
                s = y*w*3
                self.buf[s:s+w*3] = row

    def set_pixel(self, x, y, color):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y*self.w + x)*3
            self.buf[i] = color[0]; self.buf[i+1] = color[1]; self.buf[i+2] = color[2]

    def fill_rect(self, x0, y0, x1, y1, color):
        if x0 > x1: x0,x1 = x1,x0
        if y0 > y1: y0,y1 = y1,y0
        x0 = max(0, int(x0)); y0 = max(0, int(y0))
        x1 = min(self.w, int(x1)); y1 = min(self.h, int(y1))
        if x0 >= x1 or y0 >= y1: return
        row_bytes = bytes(color) * (x1-x0)
        for y in range(y0, y1):
            s = (y*self.w + x0)*3
            self.buf[s:s+(x1-x0)*3] = row_bytes

    def rect_outline(self, x0, y0, x1, y1, color, t=1):
        self.fill_rect(x0, y0, x1, y0+t, color)
        self.fill_rect(x0, y1-t, x1, y1, color)
        self.fill_rect(x0, y0, x0+t, y1, color)
        self.fill_rect(x1-t, y0, x1, y1, color)

    def draw_hline(self, x0, x1, y, color, t=1):
        self.fill_rect(x0, y, x1+1, y+t, color)

    def fill_polygon(self, points, color):
        if len(points) < 3: return
        ys = [p[1] for p in points]
        ymin = max(0, int(min(ys)))
        ymax = min(self.h-1, int(max(ys)))
        n = len(points)
        for y in range(ymin, ymax+1):
            nodes = []
            j = n-1
            for i in range(n):
                yi, xi = points[i][1], points[i][0]
                yj, xj = points[j][1], points[j][0]
                if (yi < y+0.5 <= yj) or (yj < y+0.5 <= yi):
                    if yj != yi:
                        nodes.append(xi + (y+0.5 - yi)/(yj-yi)*(xj-xi))
                j = i
            nodes.sort()
            for k in range(0, len(nodes)-1, 2):
                xa = max(0, int(nodes[k]))
                xb = min(self.w-1, int(nodes[k+1]))
                if xa <= xb:
                    s = (y*self.w + xa)*3
                    self.buf[s:s+(xb-xa+1)*3] = bytes(color)*(xb-xa+1)

    def draw_line(self, x0,y0,x1,y1,color,th=1):
        dx = abs(x1-x0); dy = -abs(y1-y0)
        sx = 1 if x0<x1 else -1
        sy = 1 if y0<y1 else -1
        err = dx+dy
        while True:
            self.fill_rect(x0-th//2, y0-th//2, x0-th//2+th, y0-th//2+th, color)
            if x0==x1 and y0==y1: break
            e2 = 2*err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

def draw_text(canvas, x, y, text, scale, color):
    cx = x
    for ch in text.upper():
        glyph = FONT.get(ch, FONT['?'])
        for ry, rowbits in enumerate(glyph):
            for rx in range(5):
                if rowbits & (1 << (4-rx)):
                    px = cx + rx*scale
                    py = y + ry*scale
                    canvas.fill_rect(px, py, px+scale, py+scale, color)
        cx += 6*scale
    return cx

def text_width(text, scale):
    return len(text)*6*scale - scale if text else 0

def draw_text_centered(canvas, cx, y, text, scale, color):
    w = text_width(text, scale)
    draw_text(canvas, cx - w//2, y, text, scale, color)

def draw_text_right(canvas, rx, y, text, scale, color):
    w = text_width(text, scale)
    draw_text(canvas, rx - w, y, text, scale, color)

def draw_text_fit(canvas, x, y, text, scale, max_w, color, min_scale=1):
    sc = scale
    while sc > min_scale and text_width(text, sc) > max_w:
        sc -= 1
    draw_text(canvas, x, y, text, sc, color)


# --- icon drawing helpers ---
def icon_broken_bridge(c, x, y, w, h, col, accent):
    c.fill_rect(x+4, y+h-18, x+w-4, y+h-4, (120,170,220))
    c.fill_rect(x+18, y+h-30, x+30, y+h-4, col)
    c.fill_rect(x+w-30, y+h-30, x+w-18, y+h-4, col)
    c.fill_rect(x+8, y+h-34, x+w//2-10, y+h-28, col)
    c.fill_polygon([(x+w//2+10,y+h-32),(x+w-8,y+h-18),(x+w-8,y+h-12),(x+w//2+10,y+h-26)], col)
    c.fill_rect(x+w//2-6, y+h-22, x+w//2-1, y+h-12, accent)
    c.fill_rect(x+w//2+2, y+h-14, x+w//2+8, y+h-8, accent)
    c.draw_line(x+24,y+h-30,x+24,y+h-50,col,2)
    c.draw_line(x+24,y+h-50,x+8,y+h-34,col,1)
    c.draw_line(x+24,y+h-50,x+w//2-10,y+h-34,col,1)

def icon_missile_strike(c, x, y, w, h, col, accent):
    c.fill_rect(x+10, y+h-22, x+w-10, y+h-8, (170,150,120))
    c.fill_rect(x+20, y+h-28, x+40, y+h-22, col)
    c.fill_polygon([(x+26,y+h-52),(x+34,y+h-52),(x+36,y+h-30),(x+24,y+h-30)], accent)
    c.fill_polygon([(x+30,y+h-58),(x+26,y+h-52),(x+34,y+h-52)], accent)
    c.fill_polygon([(x+24,y+h-34),(x+18,y+h-28),(x+24,y+h-28)], accent)
    c.fill_polygon([(x+36,y+h-34),(x+42,y+h-28),(x+36,y+h-28)], accent)
    c.draw_line(x+w-12,y+12,x+w//2+2,y+h//2, (220,60,40), 3)
    c.fill_polygon([(x+w//2-2,y+h//2-6),(x+w//2+10,y+h//2+6),(x+w//2-8,y+h//2+8)], (220,60,40))
    for r,cc in [(10,(255,220,80)),(6,(255,140,40))]:
        cxp,cyp = x+w-18, y+18
        c.fill_rect(cxp-r,cyp-r,cxp+r,cyp+r,cc)

def icon_trilateral(c, x, y, w, h, col, accent):
    cxm = x + w//2
    c.fill_polygon([(cxm, y+h-24),(x+20,y+h-10),(x+w-20,y+h-10)], (210,210,220))
    c.fill_rect(x+18, y+28, x+34, y+h-26, (50,80,160))
    c.fill_rect(x+22, y+14, x+30, y+28, (240,210,180))
    c.fill_rect(cxm-8, y+22, cxm+8, y+h-26, (160,40,40))
    c.fill_rect(cxm-4, y+8, cxm+4, y+22, (240,210,180))
    c.fill_rect(x+w-34, y+28, x+w-18, y+h-26, (40,120,60))
    c.fill_rect(x+w-30, y+14, x+w-22, y+28, (240,210,180))
    draw_text(c, cxm-3*3, y+2, "3", 3, accent)

def icon_ballot(c, x, y, w, h, col, accent):
    bx0, by0 = x+20, y+h-40
    bx1, by1 = x+w-20, y+h-8
    c.fill_rect(bx0, by0, bx1, by1, col)
    c.fill_rect(bx0+2, by0+2, bx1-2, by1-2, (245,245,250))
    c.fill_rect(bx0+8, by0-4, bx1-8, by0+2, col)
    c.fill_rect(x+w//2-16, by0-2, x+w//2+16, by0+1, (30,30,40))
    c.fill_rect(x+w//2-10, y+12, x+w//2+10, by0+6, (255,255,255))
    c.rect_outline(x+w//2-10, y+12, x+w//2+10, by0+6, (80,80,100), 1)
    c.draw_line(x+w//2-5, y+24, x+w//2-1, y+30, accent, 2)
    c.draw_line(x+w//2-1, y+30, x+w//2+7, y+18, accent, 2)

def icon_nuclear(c, x, y, w, h, col, accent):
    cxm, cym = x+w//2, y+h//2+2
    c.fill_polygon([(cxm-18,y+h-8),(cxm-10,y+22),(cxm+10,y+22),(cxm+18,y+h-8)], (180,190,200))
    c.fill_polygon([(cxm-14,y+h-10),(cxm-8,y+24),(cxm+8,y+24),(cxm+14,y+h-10)], (220,230,235))
    for dx,dy,r in [(-6,-2,5),(6,-6,4),(0,-10,5),(12,-12,3)]:
        c.fill_rect(cxm+dx-r, y+22+dy-r, cxm+dx+r, y+22+dy+r, (240,245,255))
    ax, ay = x+w-18, y+16
    c.fill_rect(ax-2,ay-2,ax+2,ay+2, accent)
    c.rect_outline(ax-7,ay-4,ax+7,ay+4, accent, 1)
    c.rect_outline(ax-4,ay-7,ax+4,ay+7, accent, 1)

def icon_syringe(c, x, y, w, h, col, accent):
    c.fill_polygon([(x+w//2,y+8),(x+14,y+22),(x+14,y+44),(x+w//2,y+h-8),(x+w-14,y+44),(x+w-14,y+22)], (230,240,250))
    c.draw_line(x+24, y+h-18, x+w-22, y+18, col, 3)
    c.draw_line(x+w-22, y+18, x+w-16, y+12, col, 2)
    c.draw_line(x+24, y+h-18, x+18, y+h-12, col, 2)
    c.fill_rect(x+30, y+h-30, x+38, y+h-22, (200,220,255))
    c.draw_line(x+16, y+10, x+32, y+26, accent, 2)
    c.draw_line(x+32, y+10, x+16, y+26, accent, 2)

def icon_knesset(c, x, y, w, h, col, accent):
    c.fill_rect(x+16, y+h-28, x+w-16, y+h-8, (210,200,180))
    for i in range(4):
        cxp = x+24 + i*18
        c.fill_rect(cxp, y+30, cxp+6, y+h-28, (230,225,210))
    c.fill_polygon([(x+w//2,y+10),(x+12,y+30),(x+w-12,y+30)], col)
    c.fill_rect(x+w-28, y+h-20, x+w-8, y+h-14, (120,80,40))
    c.fill_rect(x+w-22, y+h-14, x+w-18, y+h-6, (160,120,70))

def icon_gamepad(c, x, y, w, h, col, accent):
    c.fill_rect(x+14, y+26, x+w-14, y+h-22, col)
    c.fill_rect(x+8, y+34, x+18, y+h-28, col)
    c.fill_rect(x+w-18, y+34, x+w-8, y+h-28, col)
    c.fill_rect(x+22, y+38, x+28, y+52, (230,230,230))
    c.fill_rect(x+18, y+42, x+32, y+48, (230,230,230))
    for dx,dy in [(0,-4),(0,4),(-4,0),(4,0)]:
        bx,by = x+w-26+dx, y+45+dy
        c.fill_rect(bx-2,by-2,bx+2,by+2, accent)
    c.fill_rect(x+28, y+10, x+w-28, y+22, (40,40,60))
    draw_text(c, x+30, y+12, "VI", 2, (120,255,120))

ICON_FUNCS = {
    'bridge': icon_broken_bridge,
    'missile': icon_missile_strike,
    'trilateral': icon_trilateral,
    'ballot': icon_ballot,
    'nuclear': icon_nuclear,
    'syringe': icon_syringe,
    'knesset': icon_knesset,
    'gamepad': icon_gamepad,
}

def draw_card(canvas, x, y, w, h, story, bg, header_col, text_col):
    canvas.fill_rect(x, y, x+w, y+h, bg)
    canvas.rect_outline(x, y, x+w, y+h, (40,40,50), 2)
    canvas.fill_rect(x+1, y+1, x+w-1, y+31, header_col)
    draw_text_fit(canvas, x+10, y+9, story['region'], 2, w-24, (255,255,255))
    icon_fn = ICON_FUNCS.get(story['icon'])
    if icon_fn:
        iw, ih = 180, 80
        icon_fn(canvas, x+(w-iw)//2, y+36, iw, ih,
                story.get('icon_col',(60,60,80)), story.get('accent',(200,60,40)))
    hy = y+120
    for line in story['head']:
        draw_text_fit(canvas, x+12, hy, line, 3, w-24, text_col)
        hy += 23
    draw_text_fit(canvas, x+12, y+172, story['detail'], 2, w-24, (70,70,80))


def build_image():
    c = Canvas(W, H, (245, 242, 235))

    c.fill_rect(0, 0, W, 122, (20, 28, 48))
    draw_text_centered(c, W//2, 6, "WORLD NEWS", 7, (255, 255, 255))
    c.fill_rect(80, 64, W-80, 112, (255, 230, 60))
    draw_text_centered(c, W//2, 77, "WEDNESDAY NOVEMBER 18, 2026", 3, (20, 28, 48))
    c.fill_rect(0, 122, W, 128, (200, 40, 40))

    stories = [
        {
            'region': 'UKRAINE',
            'icon': 'bridge',
            'icon_col': (70,70,80),
            'accent': (220,70,40),
            'head': ['KERCH BRIDGE HIT', 'SPAN COLLAPSED'],
            'detail': 'DRONE & MISSILE STRIKE, KYIV 2 DEAD',
        },
        {
            'region': 'MIDDLE EAST / GULF',
            'icon': 'missile',
            'icon_col': (90,80,70),
            'accent': (220,60,40),
            'head': ['US STRIKES IRAN', 'ON QESHM ISLAND'],
            'detail': '3RD US CARRIER ARRIVES IN GULF',
        },
        {
            'region': 'APEC / SHENZHEN',
            'icon': 'trilateral',
            'icon_col': (60,70,90),
            'accent': (255,210,60),
            'head': ['US-CHINA-RUSSIA', 'TALKS THURSDAY'],
            'detail': 'TRUMP, XI & PUTIN - FIRST EVER',
        },
        {
            'region': 'UNITED STATES',
            'icon': 'ballot',
            'icon_col': (40,60,120),
            'accent': (40,160,70),
            'head': ['PELTOLA WINS', 'ALASKA SENATE'],
            'detail': 'DEMS TAKE SENATE 56-44',
        },
        {
            'region': 'USA / HEALTH',
            'icon': 'syringe',
            'icon_col': (40,110,130),
            'accent': (200,50,50),
            'head': ['US LOSES MEASLES', 'ELIMINATION STATUS'],
            'detail': '5,400+ CASES, 26 YEARS',
        },
        {
            'region': 'ASIA / MONGOLIA',
            'icon': 'knesset',
            'icon_col': (110,90,50),
            'accent': (180,60,40),
            'head': ['PRESIDENT QUITS', 'KHURELSUKH RESIGNS'],
            'detail': 'ABUSE-OF-POWER, BRIBERY CLAIMS',
        },
        {
            'region': 'ASIA / BANGLADESH',
            'icon': 'nuclear',
            'icon_col': (70,90,110),
            'accent': (40,160,200),
            'head': ['ROOPPUR PLANT', 'ON THE GRID'],
            'detail': 'FIRST NUCLEAR PLANT, 2,400 MW',
        },
        {
            'region': 'CULTURE / TECH',
            'icon': 'gamepad',
            'icon_col': (60,60,80),
            'accent': (120,255,120),
            'head': ['GTA VI OUT', 'AT MIDNIGHT'],
            'detail': '14.9M PREORDERS, $1.45B',
        },
    ]

    margin_x = 14
    gap_x = 10
    cols = 2
    card_w = (W - 2*margin_x - (cols-1)*gap_x) // cols
    top_y = 136
    gap_y = 8
    avail_h = 964 - top_y
    rows = 4
    card_h = (avail_h - (rows-1)*gap_y) // rows

    header_colors = [
        (30,70,130), (120,40,30), (40,90,60), (50,50,110),
        (20,100,110), (120,80,20), (30,90,120), (80,40,100),
    ]
    for idx, story in enumerate(stories):
        r = idx // cols
        col = idx % cols
        x = margin_x + col*(card_w + gap_x)
        y = top_y + r*(card_h + gap_y)
        bg = (255,255,252) if idx % 2 == 0 else (250,250,246)
        draw_card(c, x, y, card_w, card_h, story, bg, header_colors[idx], (20,20,25))

    c.fill_rect(0, 968, W, 1024, (20, 28, 48))
    c.fill_rect(0, 968, W, 971, (200,40,40))
    draw_text_fit(c, 8, 976, "ISRAEL: KAHANA NEW SPEAKER 66-52 | UK & AU SANCTION WEST BANK SETTLERS",
                  2, W-16, (255,255,255))
    draw_text_fit(c, 8, 998, "CARNEY-XI EXPAND TRADE | GOLD BELOW $3,800 | NSA NET DOWN | MODI AT QUAD MANILA",
                  2, W-16, (255,255,255))

    return c

def write_png(path, canvas):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    raw = bytearray()
    row_bytes = canvas.w * 3
    for y in range(canvas.h):
        raw.append(0)
        start = y * row_bytes
        raw.extend(canvas.buf[start:start+row_bytes])
    compressed = zlib.compress(bytes(raw), 9)
    png = bytearray()
    png.extend(b'\x89PNG\r\n\x1a\n')
    ihdr = struct.pack(">IIBBBBB", canvas.w, canvas.h, 8, 2, 0, 0, 0)
    png.extend(chunk(b'IHDR', ihdr))
    png.extend(chunk(b'IDAT', compressed))
    png.extend(chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    canvas = build_image()
    write_png(OUT_PATH, canvas)

if __name__ == '__main__':
    main()
