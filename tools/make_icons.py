"""Erzeugt die PNG-Icons (192, 512, maskable 512, Apple 180) aus dem Logo-Motiv. Braucht Pillow."""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "app" / "icons"
BG = (14, 40, 38)
RING = (110, 142, 139)
RING2 = (76, 105, 102)
ACCENT = (94, 216, 203)
GLOW = (47, 211, 195)


def hexagon(cx, cy, r):
    return [(cx + r * math.cos(-math.pi / 2 + i * math.pi / 3), cy + r * math.sin(-math.pi / 2 + i * math.pi / 3)) for i in range(6)]


def draw_icon(size, content_scale, rounded):
    s = size * 4  # überabtasten für glatte Kanten
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.23), fill=BG)
    else:
        d.rectangle([0, 0, s, s], fill=BG)
    cx = cy = s / 2
    r = s / 2 * content_scale
    lw = max(2, int(s * 0.012))
    d.polygon(hexagon(cx, cy, r), outline=RING, width=lw)
    d.polygon(hexagon(cx, cy, r / 2), outline=RING2, width=lw)
    vals = [0.76, 0.75, 0.6, 0.67, 0.72, 0.5]
    shape = [(cx + r * v * math.cos(-math.pi / 2 + i * math.pi / 3), cy + r * v * math.sin(-math.pi / 2 + i * math.pi / 3))
             for i, v in enumerate(vals)]
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(glow).polygon(shape, fill=GLOW + (90,))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(s * 0.01)))
    d.polygon(shape, outline=ACCENT, width=int(lw * 1.6))
    # Federspitze oben auf dem Netz
    top = cy - r
    k = r / 21
    nib = [(cx, top - 0.8 * k), (cx + 3.2 * k, top + 5.4 * k), (cx, top + 9 * k), (cx - 3.2 * k, top + 5.4 * k)]
    d.polygon(nib, fill=ACCENT)
    d.ellipse([cx - 1.1 * k, top + 4.6 * k - 1.1 * k, cx + 1.1 * k, top + 4.6 * k + 1.1 * k], fill=BG)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
draw_icon(192, 0.7, True).save(OUT / "icon-192.png")
draw_icon(512, 0.7, True).save(OUT / "icon-512.png")
draw_icon(512, 0.55, False).save(OUT / "icon-maskable-512.png")
draw_icon(180, 0.66, False).convert("RGB").save(OUT / "apple-touch-icon.png")
print("Icons in", OUT)
