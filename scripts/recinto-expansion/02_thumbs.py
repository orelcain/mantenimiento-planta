"""Fase 1 paso 2 — thumbnails alineables.

Genera versiones reducidas del recinto, del plano-base (PDF hidráulico) y del
recorte 'planta principal.png' (mismo DXF que recinto, doble res). Las dejo en
PNG calidad alta para ver bien los detalles arquitectónicos.

Las dimensiones se eligen para que el lado largo sea ~1800px (manejable en
preview / browser) preservando la relación de aspecto.
"""
import os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\thumbs"
os.makedirs(OUT_DIR, exist_ok=True)

JOBS = [
    (r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\recinto completo.png", "recinto_1800.png", 1800),
    (r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\planta principal.png", "planta_1800.png", 1800),
    (r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base.png", "plano_base_1800.png", 1800),
    (r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base-dark.png", "plano_base_dark_1800.png", 1800),
]

for src, out_name, target in JOBS:
    im = Image.open(src)
    if im.mode != "RGB":
        im = im.convert("RGB")
    w, h = im.size
    scale = target / max(w, h)
    new_size = (int(round(w * scale)), int(round(h * scale)))
    im_resized = im.resize(new_size, Image.LANCZOS)
    out_path = os.path.join(OUT_DIR, out_name)
    im_resized.save(out_path, "PNG", optimize=True)
    kb = os.path.getsize(out_path) / 1024
    print(f"{out_name:30s} {new_size[0]:>5d}x{new_size[1]:<5d}  scale={scale:.5f}  {kb:6.1f} KB")
