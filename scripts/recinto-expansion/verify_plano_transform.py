"""Verificacion empirica de la transformacion PDF natural -> render rotado 270.

El plano-base.png se rasterizo con pypdfium2 scale=4.0 rotation=270, luego crop
(227, 363)-(1795, 1263) en pt del espacio ROTADO.

pymupdf (`page.get_drawings()`) devuelve coords en sistema PDF NATURAL Y-down
(top-left, x derecha, y abajo). Necesitamos mapear esas coords al espacio
mostrado rotado y luego aplicar el crop+scale.

Probamos 4 candidatos de transform (rotacion CW 90 = rotation=270 anti-horario
en pypdfium2). Para cada uno extraemos paths verdes (agua dulce) y cyan (salada)
y comparamos contra el PNG real abriendo un par de pixeles esperados.

Esto NO genera GeoJSONs; solo imprime tablas + dibuja overlays para validar.
"""
import os
import sys
import fitz
from PIL import Image, ImageDraw
from collections import defaultdict

PDF = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\PLANOS AGUAS\AQUA014-HID-PL-015_C1.pdf"
PNG = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base.png"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\plano_extract"
os.makedirs(OUT_DIR, exist_ok=True)

# Render params (mismos que fase5_remove_cotas.py)
PDF_SCALE = 4.0
PDF_ROT = 270  # pypdfium2 anti-horario
PDF_CROP_RECT_PT_ROT = (227, 363, 1795, 1263)  # en pt del espacio ROTADO

# === abrir PDF y page ===
doc = fitz.open(PDF)
page = doc[0]
W_NAT, H_NAT = page.rect.width, page.rect.height
print(f"Page rect natural: {W_NAT:.0f} x {H_NAT:.0f} pt")
print(f"page.rotation: {page.rotation}")
print(f"PDF root /Rotate (si existe): mira metadata...")

# Tamano del espacio rotado:
# rotation=270 (anti-horario 270 = horario 90): la pagina W x H pasa a H x W mostrado.
W_ROT, H_ROT = H_NAT, W_NAT
print(f"Tamano del espacio rotado: {W_ROT:.0f} x {H_ROT:.0f} pt")
print(f"Render full (scale 4): {W_ROT*PDF_SCALE:.0f} x {H_ROT*PDF_SCALE:.0f} px")
print(f"Crop (pt rotado): {PDF_CROP_RECT_PT_ROT}  -> render {6272}x{3600} px")

# === extraer drawings y categorizarlos por color ===
drawings = page.get_drawings()
print(f"\nTotal drawings: {len(drawings)}")


def color_rgb255(c):
    if not c:
        return None
    return (int(c[0] * 255 + 0.5), int(c[1] * 255 + 0.5), int(c[2] * 255 + 0.5))


# tomar agua dulce (verde) y salada (cyan) que tengan layer "0" o HID-
dulce = []
salada = []
for d in drawings:
    sc = color_rgb255(d.get("color"))
    layer = (d.get("layer") or "").strip()
    if sc == (0, 255, 0):
        dulce.append(d)
    elif sc == (0, 255, 255):
        salada.append(d)

print(f"verde stroke (0,255,0): {len(dulce)} paths")
print(f"cyan  stroke (0,255,255): {len(salada)} paths")


# === bbox global de cada categoria en sistema natural pt ===
def union_bbox(paths):
    xs, ys = [], []
    for d in paths:
        r = d.get("rect")
        if r:
            xs += [r.x0, r.x1]
            ys += [r.y0, r.y1]
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


bbox_d_nat = union_bbox(dulce)
bbox_s_nat = union_bbox(salada)
print(f"\nbbox dulce NATURAL pt: {bbox_d_nat}")
print(f"bbox salada NATURAL pt: {bbox_s_nat}")


# === 4 candidatos de transform: natural pt -> render-px (post-crop) ===
# rotation=270 en pypdfium2 = horario 90 = mira la pagina rotada hacia la derecha visualmente.
# Punto natural (x_n, y_n) en pagina W_NAT x H_NAT (Y-down: top-left=(0,0)).
# Cuatro candidatos a probar:
#   A: identity (sin rotar). x_rot = x_n; y_rot = y_n. (Solo si el render no rotara.)
#   B: horario 90:  x_rot = H_NAT - y_n; y_rot = x_n.        (top-right natural pasa a top-left)
#   C: anti-horario 90: x_rot = y_n; y_rot = W_NAT - x_n.    (top-left natural pasa a bot-left)
#   D: 180: x_rot = W_NAT - x_n; y_rot = H_NAT - y_n.
# El espacio rotado debe tener tamano (W_ROT, H_ROT) = (H_NAT, W_NAT) = (1684, 2384).
# B y C son los unicos que satisfacen eso. D no cambia las dimensiones.


def trans_A(x, y):
    return x, y


def trans_B(x, y):  # horario 90 (top-right natural -> top-left rotado)
    return H_NAT - y, x


def trans_C(x, y):  # anti-horario 90
    return y, W_NAT - x


def trans_D(x, y):  # 180
    return W_NAT - x, H_NAT - y


CANDS = [("A_identity", trans_A), ("B_cw90", trans_B), ("C_ccw90", trans_C), ("D_180", trans_D)]

# para cada candidato, transformar bbox dulce y ver si cae dentro de PDF_CROP_RECT_PT_ROT
print("\n=== Pruebas de bbox de paths verdes (dulce) en cada candidato ===")
print(f"Crop ROT objetivo: {PDF_CROP_RECT_PT_ROT}")
print(f"  expected: paths verdes deben caer mayormente DENTRO de este rectangulo.")
print()
for name, fn in CANDS:
    bx = bbox_d_nat
    x0, y0 = fn(bx[0], bx[1])
    x1, y1 = fn(bx[2], bx[3])
    bb_rot = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
    # render px (post-crop)
    px0 = (bb_rot[0] - PDF_CROP_RECT_PT_ROT[0]) * PDF_SCALE
    py0 = (bb_rot[1] - PDF_CROP_RECT_PT_ROT[1]) * PDF_SCALE
    px1 = (bb_rot[2] - PDF_CROP_RECT_PT_ROT[0]) * PDF_SCALE
    py1 = (bb_rot[3] - PDF_CROP_RECT_PT_ROT[1]) * PDF_SCALE
    inside = (
        bb_rot[0] >= PDF_CROP_RECT_PT_ROT[0]
        and bb_rot[2] <= PDF_CROP_RECT_PT_ROT[2]
        and bb_rot[1] >= PDF_CROP_RECT_PT_ROT[1]
        and bb_rot[3] <= PDF_CROP_RECT_PT_ROT[3]
    )
    print(
        f"  {name:12s}  bbox_rot=({bb_rot[0]:7.1f},{bb_rot[1]:7.1f})-({bb_rot[2]:7.1f},{bb_rot[3]:7.1f})  px=({px0:7.0f},{py0:7.0f})-({px1:7.0f},{py1:7.0f})  inside_crop={inside}"
    )

# === Verificacion fina via pixel sampling ===
# Abrir PNG, cargar pixeles. Para cada path verde, tomar el centro de su bbox,
# transformar con cada candidato, y verificar si ese pixel en el PNG es verde.
print("\n=== Verificacion via pixel-sampling (10 paths verdes, top-left de cada bbox) ===")
img = Image.open(PNG).convert("RGB")
W_PNG, H_PNG = img.size
print(f"PNG size: {W_PNG} x {H_PNG}  (esperado 6272 x 3600)")
pixels = img.load()


def is_greenish(rgb, dom="g"):
    r, g, b = rgb
    if dom == "g":
        return g > 100 and g > r + 30 and g > b + 30
    if dom == "c":  # cyan
        return g > 100 and b > 100 and r < 100
    return False


# elegir 5 paths verdes con bbox > 5pt y bien separados
chosen = []
for d in dulce:
    r = d.get("rect")
    if not r:
        continue
    if (r.x1 - r.x0) ** 2 + (r.y1 - r.y0) ** 2 < 25:
        continue
    chosen.append(d)
    if len(chosen) >= 10:
        break

results = defaultdict(lambda: {"hit": 0, "total": 0})
for d in chosen:
    r = d.get("rect")
    cx_nat = (r.x0 + r.x1) / 2.0
    cy_nat = (r.y0 + r.y1) / 2.0
    print(f"\n  path natural bbox=({r.x0:.1f},{r.y0:.1f})-({r.x1:.1f},{r.y1:.1f})")
    for name, fn in CANDS:
        cx_rot, cy_rot = fn(cx_nat, cy_nat)
        px = (cx_rot - PDF_CROP_RECT_PT_ROT[0]) * PDF_SCALE
        py = (cy_rot - PDF_CROP_RECT_PT_ROT[1]) * PDF_SCALE
        if 0 <= px < W_PNG and 0 <= py < H_PNG:
            # sample alrededor de (px, py) en 3x3
            best = None
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    qx = int(round(px + dx))
                    qy = int(round(py + dy))
                    if 0 <= qx < W_PNG and 0 <= qy < H_PNG:
                        c = pixels[qx, qy]
                        if is_greenish(c, "g"):
                            best = c
                            break
                if best:
                    break
            hit = best is not None
            results[name]["total"] += 1
            if hit:
                results[name]["hit"] += 1
            print(f"    {name:12s} -> ({cx_rot:7.1f},{cy_rot:7.1f}) px=({px:6.0f},{py:6.0f})  hit_green={hit}")
        else:
            print(f"    {name:12s} -> px=({px:.0f},{py:.0f}) fuera del PNG")

print("\n=== Resumen hit-rate ===")
for name in [c[0] for c in CANDS]:
    r = results[name]
    rate = r["hit"] / r["total"] * 100 if r["total"] else 0
    print(f"  {name:12s}: {r['hit']:2d}/{r['total']:2d} = {rate:5.1f}%")

# === Dibujar overlay de la candidata ganadora (la del mejor hit-rate) ===
best_cand = max(CANDS, key=lambda c: results[c[0]]["hit"])
print(f"\nGanadora: {best_cand[0]}")
fn = best_cand[1]
overlay = img.copy()
draw = ImageDraw.Draw(overlay)
for d in dulce[:200]:
    r = d.get("rect")
    if not r:
        continue
    x0, y0 = fn(r.x0, r.y0)
    x1, y1 = fn(r.x1, r.y1)
    px0 = (x0 - PDF_CROP_RECT_PT_ROT[0]) * PDF_SCALE
    py0 = (y0 - PDF_CROP_RECT_PT_ROT[1]) * PDF_SCALE
    px1 = (x1 - PDF_CROP_RECT_PT_ROT[0]) * PDF_SCALE
    py1 = (y1 - PDF_CROP_RECT_PT_ROT[1]) * PDF_SCALE
    draw.rectangle([min(px0, px1), min(py0, py1), max(px0, px1), max(py0, py1)], outline=(255, 0, 255), width=2)

out_overlay = os.path.join(OUT_DIR, f"verify_overlay_{best_cand[0]}.png")
overlay.thumbnail((2000, 2000), Image.LANCZOS)
overlay.save(out_overlay, "PNG")
print(f"Overlay guardado: {out_overlay}")
