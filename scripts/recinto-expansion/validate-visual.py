"""Fase 1 paso final — validacion visual de la transformacion afin.

Aplica la matriz afin al recinto, lo coloca en coords del plano-base, y
genera 3 imagenes de validacion:

  1. composite_overlay.jpg
     Recinto transformado en el bbox que incluye TANTO el recinto entero
     COMO el plano-base. El plano-base se superpone con alpha 0.7 en su
     posicion (0,0)-(6272,3600) DENTRO del bbox global. Se debe ver:
       - El recinto (gris) cubriendo todo el predio
       - El plano-base (oscuro con cañerias verdes) ENCIMA, calzando con el
         edificio en el recinto
     Si el edificio del plano-base se ve PEGADO al edificio del recinto -> OK.

  2. composite_building_zoom.jpg
     Crop centrado en el edificio (en coords del plano-base 0,0..6272,3600),
     mostrando solo esa region a mayor resolucion para verificar alineamiento.

  3. composite_corner_grid.jpg
     Igual al anterior pero con los 4 puntos clickeados marcados en ambas
     fuentes (recinto y plano-base), para validar que cada par coincide.

Salida en thumbs/ con prefijo 'validate_'.

Tecnica:
- PIL Image.transform(METHOD=AFFINE) usa la matriz INVERSA (output->input).
- Calculo la inversa de la afin y se la paso. Tambien escalo todo a 1/8 de
  la resolucion original del plano-base para que las imagenes pesen poco.
"""
import json, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "thumbs")
os.makedirs(OUT_DIR, exist_ok=True)

# Inputs
RECINTO_SRC = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\recinto completo.png"
PLANO_SRC = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base-dark.png"

with open(os.path.join(ROOT, "transform.json"), "r", encoding="utf-8") as f:
    tr = json.load(f)
with open(os.path.join(ROOT, "points.json"), "r", encoding="utf-8") as f:
    pts = json.load(f)

a, b, c, d, e, f_ = (tr["matrix"][k] for k in "abcdef")
# Matriz forward: (x_plano, y_plano) = M * (x_recinto, y_recinto) + t
# Para PIL Image.transform AFFINE necesitamos la INVERSA: dado un pixel
# (x_dst, y_dst) en el output, devuelve (x_src, y_src) del input.

# Bbox total: union de plano-base (0,0)-(6272,3600) con recinto transformado
bb = tr["bbox_in_plano_coords"]
global_xmin = min(0, bb["x_min"])
global_ymin = min(0, bb["y_min"])
global_xmax = max(6272, bb["x_max"])
global_ymax = max(3600, bb["y_max"])
gW = global_xmax - global_xmin
gH = global_ymax - global_ymin
print(f"Bbox global (en coords plano-base): ({global_xmin:.1f},{global_ymin:.1f}) - ({global_xmax:.1f},{global_ymax:.1f})  size {gW:.0f}x{gH:.0f}")

# Reduzco a un canvas con ancho objetivo 2400 px para que la imagen pese poco
TARGET_W = 2400
DS = TARGET_W / gW  # downsample factor (display/global)
cw, ch = int(round(gW * DS)), int(round(gH * DS))
print(f"Canvas display: {cw}x{ch}  ds={DS:.5f}")

# Helper: coords plano-base (real) -> canvas display (px)
def p2c(x, y):
    return ((x - global_xmin) * DS, (y - global_ymin) * DS)

# 1) Renderizar el RECINTO en el canvas display
# La transformacion forward T mapea recinto -> plano. Quiero pintar
# cada pixel del canvas leyendo del recinto.
# Composicion total (output canvas -> recinto):
#   canvas (cx, cy) -> plano (px, py) = (cx/DS + global_xmin, cy/DS + global_ymin)
#   plano (px, py) -> recinto (rx, ry) = T^-1 (px, py)
# T es afin 2D. Matriz 2x3 forward:
M = np.array([[a, b, e],
              [c, d, f_],
              [0, 0, 1]], dtype=float)
Minv = np.linalg.inv(M)
print("M (recinto->plano):")
print(M[:2])
print("M^-1 (plano->recinto):")
print(Minv[:2])

# Para PIL: Image.transform(size, AFFINE, (a,b,c,d,e,f)) usa la matriz inversa
# (output -> input) en formato (x_in = a*x_out + b*y_out + c; y_in = d*x_out + e*y_out + f).
# Nuestra transformacion de output canvas -> recinto es:
#   x_recinto = M_inv * [cx/DS + xmin, cy/DS + ymin, 1]
# Lo expreso como afin de output canvas (cx, cy) -> recinto:
#   x_rec = (Minv[0,0]/DS) * cx + (Minv[0,1]/DS) * cy + (Minv[0,0]*global_xmin + Minv[0,1]*global_ymin + Minv[0,2])
#   y_rec = (Minv[1,0]/DS) * cx + (Minv[1,1]/DS) * cy + (Minv[1,0]*global_xmin + Minv[1,1]*global_ymin + Minv[1,2])
A_pil = Minv[0,0] / DS
B_pil = Minv[0,1] / DS
C_pil = Minv[0,0] * global_xmin + Minv[0,1] * global_ymin + Minv[0,2]
D_pil = Minv[1,0] / DS
E_pil = Minv[1,1] / DS
F_pil = Minv[1,0] * global_xmin + Minv[1,1] * global_ymin + Minv[1,2]

# Reduzco el recinto antes de transformar para que PIL no tenga que samplear
# desde una imagen de 18725 px. Uso un downsample del recinto y compenso en M.
# Para mayor calidad, uso 0.5x del recinto (= 9362 px lado largo).
RECINTO_DS = 0.5
recinto = Image.open(RECINTO_SRC).convert("RGB")
new_recinto_size = (int(recinto.size[0] * RECINTO_DS), int(recinto.size[1] * RECINTO_DS))
recinto = recinto.resize(new_recinto_size, Image.LANCZOS)
print(f"recinto reducido a {recinto.size}")
# Ajusto Minv para trabajar con recinto reducido: si downsampled, las coords
# de recinto deben ser x_red = x_rec * RECINTO_DS
# x_red = RECINTO_DS * (A*cx + B*cy + C)
A_pil2 = A_pil * RECINTO_DS
B_pil2 = B_pil * RECINTO_DS
C_pil2 = C_pil * RECINTO_DS
D_pil2 = D_pil * RECINTO_DS
E_pil2 = E_pil * RECINTO_DS
F_pil2 = F_pil * RECINTO_DS

recinto_warped = recinto.transform(
    (cw, ch),
    Image.AFFINE,
    (A_pil2, B_pil2, C_pil2, D_pil2, E_pil2, F_pil2),
    resample=Image.BILINEAR,
    fillcolor=(220, 220, 220),
)
print("recinto warpeado al canvas")

# 2) Plano-base reducido y colocado en su posicion (0,0)-(6272,3600) dentro del canvas
plano = Image.open(PLANO_SRC).convert("RGB")
plano_target_w = int(round(6272 * DS))
plano_target_h = int(round(3600 * DS))
plano_small = plano.resize((plano_target_w, plano_target_h), Image.LANCZOS)
plano_offset = (int(round((0 - global_xmin) * DS)), int(round((0 - global_ymin) * DS)))
print(f"plano-base posicion en canvas: {plano_offset}, size {plano_small.size}")

# === Composite 1: overlay con alpha ===
canvas = recinto_warped.copy()
# Pego plano-base con alpha 0.75 (mezclo manualmente con su region)
region_box = (plano_offset[0], plano_offset[1], plano_offset[0]+plano_small.size[0], plano_offset[1]+plano_small.size[1])
underlay = canvas.crop(region_box)
mixed = Image.blend(underlay, plano_small, alpha=0.75)
canvas.paste(mixed, region_box)

# Dibujo los 4 puntos
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype("arial.ttf", 16)
except Exception:
    font = ImageFont.load_default()
for p in pts["points"]:
    # En coords del recinto, donde cae en el plano via M:
    rx, ry = p["recinto"]["x"], p["recinto"]["y"]
    px_pred = M[0,0]*rx + M[0,1]*ry + M[0,2]
    py_pred = M[1,0]*rx + M[1,1]*ry + M[1,2]
    cx, cy = p2c(px_pred, py_pred)
    # Tambien dibujo el punto real del plano (clickeado por el usuario)
    pxr, pyr = p["plano"]["x"], p["plano"]["y"]
    cxr, cyr = p2c(pxr, pyr)
    # circle predicho (rojo)
    r = 8
    draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=(255, 80, 80), width=2)
    # circle real (verde)
    draw.ellipse((cxr-r-2, cyr-r-2, cxr+r+2, cyr+r+2), outline=(80, 255, 80), width=2)
    draw.text((cx+10, cy-10), str(p["idx"]), fill=(255, 80, 80), font=font)

# Marco del plano-base (rectangulo aqua)
draw.rectangle(region_box, outline=(46, 117, 182), width=3)
draw.text((region_box[0]+8, region_box[1]+8), "plano-base 6272x3600", fill=(46, 117, 182), font=font)

# Marco del recinto entero (gris)
rW, rH = pts["sources"]["recinto"]["orig_w"], pts["sources"]["recinto"]["orig_h"]
rect_corners = [(0,0), (rW, 0), (rW, rH), (0, rH)]
rect_pts = []
for rx, ry in rect_corners:
    px = M[0,0]*rx + M[0,1]*ry + M[0,2]
    py = M[1,0]*rx + M[1,1]*ry + M[1,2]
    rect_pts.append(p2c(px, py))
draw.polygon(rect_pts, outline=(180, 180, 180), width=2)

out1 = os.path.join(OUT_DIR, "validate_overlay.jpg")
canvas.save(out1, "JPEG", quality=85, optimize=True)
print(f"saved {out1}")

# === Composite 2: zoom solo al bbox del plano-base ===
# Crop al rectangulo del plano-base (mas un margen para contexto)
margin = int(round(min(plano_target_w, plano_target_h) * 0.2))
crop_box = (
    max(0, region_box[0]-margin),
    max(0, region_box[1]-margin),
    min(cw, region_box[2]+margin),
    min(ch, region_box[3]+margin),
)
zoom = canvas.crop(crop_box)
out2 = os.path.join(OUT_DIR, "validate_zoom_edificio.jpg")
zoom.save(out2, "JPEG", quality=90, optimize=True)
print(f"saved {out2}  ({zoom.size[0]}x{zoom.size[1]})")

# === Composite 3: vista panoramica con grilla cada 2000 px del plano ===
panoramic = recinto_warped.copy()
draw3 = ImageDraw.Draw(panoramic)
# Grilla cada 2000 px del plano-base
for x in range(int(global_xmin // 2000)*2000, int(global_xmax) + 2000, 2000):
    x_canvas = (x - global_xmin) * DS
    if 0 <= x_canvas <= cw:
        draw3.line([(x_canvas, 0), (x_canvas, ch)], fill=(80, 80, 80), width=1)
        draw3.text((x_canvas+2, 2), str(x), fill=(80, 80, 80), font=font)
for y in range(int(global_ymin // 2000)*2000, int(global_ymax) + 2000, 2000):
    y_canvas = (y - global_ymin) * DS
    if 0 <= y_canvas <= ch:
        draw3.line([(0, y_canvas), (cw, y_canvas)], fill=(80, 80, 80), width=1)
        draw3.text((2, y_canvas+2), str(y), fill=(80, 80, 80), font=font)
# Marco del plano-base
draw3.rectangle(region_box, outline=(46, 117, 182), width=3)
draw3.text((region_box[0]+8, region_box[1]+8), "plano-base 6272x3600 (sin overlay)", fill=(46, 117, 182), font=font)
out3 = os.path.join(OUT_DIR, "validate_panoramic.jpg")
panoramic.save(out3, "JPEG", quality=80, optimize=True)
print(f"saved {out3}")

print()
print("OK. Mira:")
print(f"  1. {out1}  (overlay alpha, edificio debe calzar)")
print(f"  2. {out2}  (zoom al edificio)")
print(f"  3. {out3}  (panoramica completa del recinto con marco del plano)")
