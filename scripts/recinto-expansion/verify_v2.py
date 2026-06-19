"""Verificacion v2: dibujar overlays de paths verdes para los 4 candidatos
de transformacion. Tambien examinar page.rotation_matrix.

Estrategia: tomar TODAS las paths verdes, transformarlas con cada candidato,
clipear al rango del PNG, dibujar como puntos en un overlay reducido.
La candidata correcta hara que el patron coincida con las cañerias del plano.
"""
import os
import fitz
from PIL import Image, ImageDraw

PDF = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\PLANOS AGUAS\AQUA014-HID-PL-015_C1.pdf"
PNG = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base.png"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\plano_extract"

PDF_SCALE = 4.0
CROP = (227, 363, 1795, 1263)

doc = fitz.open(PDF)
page = doc[0]
print(f"page.rect = {page.rect}")
print(f"page.mediabox = {page.mediabox}")
print(f"page.rotation = {page.rotation}")
print(f"page.rotation_matrix = {page.rotation_matrix}")
print(f"page.derotation_matrix = {page.derotation_matrix}")

W_NAT = page.mediabox.width
H_NAT = page.mediabox.height
print(f"mediabox W x H = {W_NAT} x {H_NAT}")

# Despues de aplicar rotation, las coords logicas pasan a tener (H_NAT, W_NAT) shape
# en el espacio mostrado (asumiendo rotation=270 = horario 90)

drawings = page.get_drawings()
dulce = [d for d in drawings if d.get("color") and tuple(int(c * 255 + 0.5) for c in d["color"]) == (0, 255, 0)]
salada = [d for d in drawings if d.get("color") and tuple(int(c * 255 + 0.5) for c in d["color"]) == (0, 255, 255)]
print(f"verde={len(dulce)} cyan={len(salada)}")


# Cuatro candidatos
def trans_A(x, y):
    return x, y  # identity


def trans_B(x, y):
    return H_NAT - y, x  # cw 90


def trans_C(x, y):
    return y, W_NAT - x  # ccw 90


def trans_D(x, y):
    return W_NAT - x, H_NAT - y  # 180


CANDS = [("A_identity", trans_A), ("B_cw90", trans_B), ("C_ccw90", trans_C), ("D_180", trans_D)]

img = Image.open(PNG).convert("RGB")
print(f"PNG: {img.size}")


def render_overlay(name, fn):
    overlay = img.copy()
    draw = ImageDraw.Draw(overlay, "RGBA")
    n_inside = 0
    n_outside = 0
    for d in dulce:
        # iterar items: line, curve, rect
        for it in d.get("items", []):
            op = it[0]
            if op == "l":
                # line: (op, p1, p2)
                p1, p2 = it[1], it[2]
                x1r, y1r = fn(p1.x, p1.y)
                x2r, y2r = fn(p2.x, p2.y)
                px1 = (x1r - CROP[0]) * PDF_SCALE
                py1 = (y1r - CROP[1]) * PDF_SCALE
                px2 = (x2r - CROP[0]) * PDF_SCALE
                py2 = (y2r - CROP[1]) * PDF_SCALE
                if 0 <= px1 < 6272 and 0 <= py1 < 3600 and 0 <= px2 < 6272 and 0 <= py2 < 3600:
                    draw.line([px1, py1, px2, py2], fill=(255, 0, 255, 255), width=4)
                    n_inside += 1
                else:
                    n_outside += 1
            elif op == "re":
                # rect: (op, rect)
                r = it[1]
                xs = [r.x0, r.x1]
                ys = [r.y0, r.y1]
                pts_r = [fn(x, y) for x in xs for y in ys]
                for (px_pt, py_pt) in pts_r:
                    pxc = (px_pt - CROP[0]) * PDF_SCALE
                    pyc = (py_pt - CROP[1]) * PDF_SCALE
                    if 0 <= pxc < 6272 and 0 <= pyc < 3600:
                        draw.ellipse([pxc - 6, pyc - 6, pxc + 6, pyc + 6], fill=(255, 0, 255, 255))
                        n_inside += 1
                    else:
                        n_outside += 1
    overlay.thumbnail((2200, 2200), Image.LANCZOS)
    out_path = os.path.join(OUT_DIR, f"v2_overlay_{name}.png")
    overlay.save(out_path, "PNG")
    print(f"  {name}: inside={n_inside} outside={n_outside} -> {out_path}")
    return n_inside, n_outside


print("\n=== Overlays para 4 candidatos ===")
best = None
best_inside = -1
for name, fn in CANDS:
    inside, outside = render_overlay(name, fn)
    if inside > best_inside:
        best_inside = inside
        best = name
print(f"\nMas paths dentro del crop: {best}")

# tambien probar variantes "scale+rotation_matrix" usando pymupdf
print("\n=== Usando page.rotation_matrix de pymupdf ===")
m = page.rotation_matrix  # matriz que rota natural -> espacio mostrado
print(f"matrix = a={m.a} b={m.b} c={m.c} d={m.d} e={m.e} f={m.f}")


def trans_pymupdf(x, y):
    # apply matrix m: new_x = m.a*x + m.c*y + m.e ; new_y = m.b*x + m.d*y + m.f
    return m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f


inside, outside = render_overlay("E_pymupdf_rotmatrix", trans_pymupdf)
print(f"  pymupdf rotation_matrix: inside={inside} outside={outside}")
