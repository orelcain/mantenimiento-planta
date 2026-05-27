"""Fase 1 paso 3 — crop del edificio principal en el recinto a alta res.

Visualmente en recinto_1800.png el edificio principal ocupa aproximadamente
(en coords del thumbnail 1800x1273):
    x ≈ 600 a 1100
    y ≈ 550 a 950
Multiplicando por (1/scale_recinto = 1/0.09613 ≈ 10.4) llegamos a coords del
original 18725x13245:
    x ≈ 6240 a 11440
    y ≈ 5720 a 9880

Generamos un crop generoso (con margen) a partir del original a 0.3x:
área ~5200x4160 del orig → ~1560x1250 del crop.
"""
import os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\recinto completo.png"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\thumbs"

# Bounding box en coords ORIGINALES del recinto (18725x13245)
# Generoso para tener contexto alrededor del edificio.
BBOX_ORIG = (5800, 5200, 11800, 10400)  # left, top, right, bottom

im = Image.open(SRC).convert("RGB")
crop = im.crop(BBOX_ORIG)
print(f"crop original size: {crop.size}")

# Bajar a ancho ~2200 px (suficiente para ver detalles, manejable)
target_w = 2200
scale = target_w / crop.size[0]
new_size = (target_w, int(round(crop.size[1] * scale)))
crop_resized = crop.resize(new_size, Image.LANCZOS)
out = os.path.join(OUT_DIR, "recinto_edificio_crop.png")
crop_resized.save(out, "PNG", optimize=True)
print(f"crop resized: {new_size}  scale_from_orig={scale:.5f}")
print(f"para volver a orig: orig_x = crop_x / {scale:.5f} + {BBOX_ORIG[0]}")
print(f"                    orig_y = crop_y / {scale:.5f} + {BBOX_ORIG[1]}")
