"""Fase 1 paso 6 — re-crop del edificio en el recinto, ahora más ancho.

`planta principal.png` (mismo DXF, mitad de res) muestra el edificio
HORIZONTAL ocupando casi todo el ancho 9362×6623. Eso implica que en el
recinto 18725×13245, el edificio debería ocupar el equivalente:
algo así como (?, ?)–(?, ?) en coords del orig 18725×13245.

Estrategia: voy a ubicar el bbox del edificio en planta_1800.png (que sé
que está completo), pasarlo a coords del original planta (9362×6623) y luego
a coords del recinto (18725×13245) escalando ×2 sobre un offset.

Pero NO sé el offset entre planta principal y recinto (vienen del mismo
DXF pero el crop del DXF para generar 'planta principal.png' puede haber
sido distinto). Lo más seguro es identificar el bbox a ojo directamente en
el recinto.

Mirando recinto_1800.png 1800×1273:
  edificio principal ocupa ~x=600..1380, y=580..980 aprox
  (con eje largo horizontal, no vertical como pensaba antes — el "vertical"
   era artefacto del crop angosto que hice)

A escala original (factor 1/0.09613 ≈ 10.403):
  x ≈ 6240..14360, y ≈ 6034..10195
  Margen: aprox (5500, 5500, 15000, 11000) en coords del recinto orig.
"""
import os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\recinto completo.png"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\thumbs"

# Nuevo bbox más generoso y horizontal
BBOX = (5500, 5500, 15000, 11000)  # left, top, right, bottom

im = Image.open(SRC).convert("RGB")
crop = im.crop(BBOX)
print(f"crop original: {crop.size}")

target_w = 2400
scale = target_w / crop.size[0]
new_size = (target_w, int(round(crop.size[1] * scale)))
crop_r = crop.resize(new_size, Image.LANCZOS)
out = os.path.join(OUT_DIR, "recinto_edificio_crop_v2.png")
crop_r.save(out, "PNG", optimize=True)
print(f"crop resized: {new_size}  scale_from_orig={scale:.5f}")
print(f"para volver: orig_x = crop_x / {scale:.5f} + {BBOX[0]}")
print(f"             orig_y = crop_y / {scale:.5f} + {BBOX[1]}")
