"""Fase 3.7 — borrar la zona del edificio (rectangulo del plano-base) en el
recinto-base.jpg + dark.jpg, con feather suave, para evitar duplicacion visual.

Estrategia:
 1. El rectangulo del plano-base es (0,0)-(6272,3600) en coords del plano-base.
 2. Las 4 esquinas se mapean al recinto reducido (8000x5659) via la inversa
    de la matriz de Fase 2 (matrix_reducido_a_plano).
 3. Resultado: un cuadrilatero ROTADO dentro del recinto.
 4. Mascara L (grayscale) con feather gaussiano ~60 px:
    - Donde NO esta el cuadrilatero: alpha=255 (visible)
    - Donde SI esta el cuadrilatero: alpha=0 (borrado)
    - En el borde: gradiente suave por blur.
 5. Composicion: pixel = (alpha/255)*recinto + ((255-alpha)/255)*background_color
 6. background:
    - dark: navy #0c1620 (12,22,32)
    - light: blanco #ffffff
 7. Reemplazar los archivos en planos-aguas-assets/.

Backup: los originales quedan en scripts/recinto-expansion/output/_pre-edif-borrado/
"""
import os, json, math, time, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "output")
ASSETS = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets"
BACKUP_DIR = os.path.join(OUT, "_pre-edif-borrado")
os.makedirs(BACKUP_DIR, exist_ok=True)

# Cargar config de Fase 2 (matriz reducido -> plano)
with open(os.path.join(ROOT, "fase2_config.json"), "r", encoding="utf-8") as f:
    cfg = json.load(f)
m = cfg["matrix_reduced_to_plano"]
a, b, c, d, e, f_ = m["a"], m["b"], m["c"], m["d"], m["e"], m["f"]
W, H = cfg["recinto_reduced_size"]
print(f"Recinto reducido: {W}x{H}")
print(f"Matriz reducido->plano: [{a:.4f} {b:.4f} {e:.2f}] / [{c:.4f} {d:.4f} {f_:.2f}]")

# Inversa de la matriz forward (plano -> reducido)
M = np.array([[a, b, e], [c, d, f_], [0, 0, 1]])
Minv = np.linalg.inv(M)
print(f"Inversa M^-1 (plano->reducido):")
print(Minv[:2])

# 4 esquinas del rectangulo del plano-base
PB_W, PB_H = 6272, 3600
corners_plano = [(0, 0), (PB_W, 0), (PB_W, PB_H), (0, PB_H)]
corners_red = []
for (xp, yp) in corners_plano:
    v = Minv @ np.array([xp, yp, 1])
    corners_red.append((float(v[0]), float(v[1])))

print(f"\nCuadrilatero del plano-base en coords del recinto reducido:")
for i, p in enumerate(corners_red):
    print(f"  esq{i}: ({p[0]:.1f}, {p[1]:.1f})")

# Configuracion del feather (en px del recinto reducido)
FEATHER_PX = 60  # ~ borde de 60 px en gradiente suave
EXPAND_PX = 0    # cuanto agrandar el cuadrilatero antes de feather (0 = exacto)

print(f"\nFeather: {FEATHER_PX} px gaussiano, expand: {EXPAND_PX} px")

def make_mask():
    """Mascara L donde 255=visible (recinto), 0=oculto (zona edificio)."""
    mask = Image.new("L", (W, H), 255)
    draw = ImageDraw.Draw(mask)
    # Polygon necesita tuples int; expandimos si hace falta
    poly = corners_red
    if EXPAND_PX > 0:
        # expansion isotropica simple: alejar cada esquina del centroide
        cx = sum(p[0] for p in poly) / 4
        cy = sum(p[1] for p in poly) / 4
        poly2 = []
        for p in poly:
            dx, dy = p[0] - cx, p[1] - cy
            L = math.hypot(dx, dy) or 1
            poly2.append((p[0] + dx/L * EXPAND_PX, p[1] + dy/L * EXPAND_PX))
        poly = poly2
    draw.polygon([(int(round(x)), int(round(y))) for x, y in poly], fill=0)
    if FEATHER_PX > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=FEATHER_PX))
    return mask

print("\nGenerando mascara con feather...")
t0 = time.time()
mask = make_mask()
print(f"  done ({(time.time()-t0):.1f}s)")

def composite(src_path, bg_color, dst_path, jpeg_quality):
    print(f"\nProcesando {os.path.basename(src_path)} ...")
    t0 = time.time()
    im = Image.open(src_path).convert("RGB")
    assert im.size == (W, H), f"tamaño inesperado {im.size}, esperado {(W, H)}"
    bg = Image.new("RGB", (W, H), bg_color)
    out = Image.composite(im, bg, mask)
    out.save(dst_path, "JPEG", quality=jpeg_quality, optimize=True, progressive=True)
    sz = os.path.getsize(dst_path) / 1024 / 1024
    print(f"  -> {dst_path}  {sz:.2f} MB  ({(time.time()-t0):.1f}s)")

# Backup de los actuales
for fn in ["recinto-base.jpg", "recinto-base-dark.jpg"]:
    src = os.path.join(ASSETS, fn)
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(BACKUP_DIR, fn))
        print(f"backup: {fn} -> {BACKUP_DIR}")

# Re-procesar desde el recinto original a 8000 px (sin la zona borrada).
# OJO: necesitamos partir de la imagen 8000x5659 ORIGINAL del recinto, NO de la
# version actual con el feather aplicado (porque entonces aplicariamos doble).
# El "original" 8000x5659 es lo que generamos en Fase 2 y luego guardamos como
# recinto-base.jpg y recinto-base-dark.jpg ANTES de cualquier borrado.
# Por eso uso los archivos de output/ (que son los de Fase 2, intactos).
SRC_LIGHT = os.path.join(OUT, "recinto-base.jpg")
SRC_DARK = os.path.join(OUT, "recinto-base-dark.jpg")

DST_LIGHT = os.path.join(ASSETS, "recinto-base.jpg")
DST_DARK = os.path.join(ASSETS, "recinto-base-dark.jpg")

# Composicion
composite(SRC_LIGHT, (255, 255, 255), DST_LIGHT, 85)   # light: fondo blanco
composite(SRC_DARK,  (12, 22, 32),    DST_DARK,  88)   # dark: navy #0c1620

print("\nLISTO. Verificar en preview que la duplicacion del edificio desaparece.")
print(f"Backups guardados en {BACKUP_DIR}")
