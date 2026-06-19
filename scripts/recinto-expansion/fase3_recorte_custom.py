"""Fase 3.9 — aplica un polígono CUSTOM (dibujado en aligner/recorte.html) como
zona a BORRAR del recinto. Genera recinto-base.jpg + dark.jpg con la mascara
custom + feather suave. Reemplaza los archivos en planos-aguas-assets/.

Uso:
  py -3.11 fase3_recorte_custom.py polygon.json
  (donde polygon.json es el export de la herramienta HTML)

Si no se pasa polygon.json, lee de scripts/recinto-expansion/polygon.json.

Backup: los actuales se mueven a output/_pre-recorte-custom/.
"""
import os, sys, json, time, shutil
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "output")
ASSETS = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets"
BACKUP_DIR = os.path.join(OUT, "_pre-recorte-custom")
os.makedirs(BACKUP_DIR, exist_ok=True)

PJSON = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "polygon.json")
if not os.path.isfile(PJSON):
    print(f"ERROR: no encuentro {PJSON}")
    print("Uso: py -3.11 fase3_recorte_custom.py polygon.json")
    sys.exit(1)

with open(PJSON, "r", encoding="utf-8") as f:
    data = json.load(f)

W, H = data["recinto_size"]["w"], data["recinto_size"]["h"]
FEATHER = data.get("feather_px", 60)
poly = [(p["x"], p["y"]) for p in data["polygon"]]
print(f"Recinto: {W}x{H}")
print(f"Polígono: {len(poly)} vértices")
print(f"Feather: {FEATHER} px gaussiano")
for i, (x, y) in enumerate(poly):
    print(f"  v{i+1}: ({x}, {y})")

if len(poly) < 3:
    print("ERROR: el polígono necesita al menos 3 vértices")
    sys.exit(1)

# Mascara: 255=visible (recinto se ve), 0=oculto (zona borrada)
print("\nGenerando máscara con feather...")
t0 = time.time()
mask = Image.new("L", (W, H), 255)
ImageDraw.Draw(mask).polygon(poly, fill=0)
if FEATHER > 0:
    mask = mask.filter(ImageFilter.GaussianBlur(radius=FEATHER))
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

# Backup
for fn in ["recinto-base.jpg", "recinto-base-dark.jpg"]:
    src = os.path.join(ASSETS, fn)
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(BACKUP_DIR, fn))
        print(f"backup: {fn} -> {BACKUP_DIR}")

# Re-procesar desde el recinto SIN borrado (Fase 2 original en output/)
SRC_LIGHT = os.path.join(OUT, "recinto-base.jpg")
SRC_DARK = os.path.join(OUT, "recinto-base-dark.jpg")
DST_LIGHT = os.path.join(ASSETS, "recinto-base.jpg")
DST_DARK = os.path.join(ASSETS, "recinto-base-dark.jpg")

composite(SRC_LIGHT, (255, 255, 255), DST_LIGHT, 85)
composite(SRC_DARK, (12, 22, 32), DST_DARK, 88)

print("\nLISTO. Recargá el iframe en el preview para ver el resultado.")
print(f"Backups guardados en {BACKUP_DIR}")
