"""Debug: contar paths por (layer, stroke_color, fill_color) y por bucket de color."""
import fitz
from collections import Counter

PDF = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\PLANOS AGUAS\AQUA014-HID-PL-015_C1.pdf"
doc = fitz.open(PDF)
page = doc[0]
drawings = page.get_drawings()


def rgb255(c):
    if not c:
        return None
    return (int(c[0] * 255 + 0.5), int(c[1] * 255 + 0.5), int(c[2] * 255 + 0.5))


# Tabla layer + stroke + fill, top 25
by_key = Counter()
for d in drawings:
    layer = (d.get("layer") or "").strip()
    sc = rgb255(d.get("color"))
    fc = rgb255(d.get("fill"))
    by_key[(layer, str(sc), str(fc))] += 1

print(f"=== Top 30 (layer, stroke_rgb, fill_rgb) ===")
for (k, n) in by_key.most_common(30):
    print(f"  {n:6d}  layer={k[0]!r:32s}  stroke={k[1]:18s}  fill={k[2]}")

# Strokes "rojizos" (R > G+50 and R > B+50)
print(f"\n=== Strokes con R dominante (posibles cotas/rojos) ===")
reds = Counter()
for d in drawings:
    sc = rgb255(d.get("color"))
    if sc and sc[0] > sc[1] + 40 and sc[0] > sc[2] + 40:
        reds[sc] += 1
for c, n in reds.most_common(10):
    print(f"  {n:6d}  rgb{c}")

# Strokes en capa M-Formato/G-FORMATO
print(f"\n=== Paths en capas M-Formato / G-FORMATO ===")
for lyr in ("M-Formato", "G-FORMATO"):
    cnt = sum(1 for d in drawings if (d.get("layer") or "").strip() == lyr)
    print(f"  {lyr:20s}: {cnt} paths")
    # Top colores en esa capa
    cc = Counter()
    for d in drawings:
        if (d.get("layer") or "").strip() == lyr:
            cc[(str(rgb255(d.get("color"))), str(rgb255(d.get("fill"))))] += 1
    for k, n in cc.most_common(5):
        print(f"    stroke={k[0]:18s} fill={k[1]:18s}  n={n}")

# Strokes en capa "0" con color rojo
print(f"\n=== Paths en capa '0' con stroke rojizo ===")
cnt = sum(1 for d in drawings if (d.get("layer") or "").strip() == "0"
          and (sc := rgb255(d.get("color"))) and sc[0] > sc[1] + 40 and sc[0] > sc[2] + 40)
print(f"  total: {cnt}")
