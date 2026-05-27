"""Fase 1 paso 7 — zoom MUY cerca del edificio en el recinto.

Después del crop v2 (recinto[5500..15000, 5500..11000]), el edificio
principal ocupa aproximadamente en coords del crop v2 original 9500×5500:
  x ≈ 1750..3200, y ≈ 1000..3000  (margen incluido)

Vuelvo a la imagen ORIGINAL y hago el crop quirúrgico:
  recinto[5500+1750=7250 .. 5500+3200=8700, 5500+1000=6500 .. 5500+3000=8500]
  = (7250, 6500, 8700, 8500) → 1450×2000

A escala original (full res), 1450×2000 = bien para ver detalles.
Lo guardo a tamaño nativo (sin reducir, pero limitado a 2200px lado largo).
"""
import os
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None

SRC = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\recinto completo.png"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\thumbs"

# Bbox ajustado al edificio principal con poco margen, en coords del original
BBOX = (7000, 6300, 9100, 9000)  # left, top, right, bottom

im = Image.open(SRC).convert("RGB")
crop = im.crop(BBOX)
print(f"crop original: {crop.size}")

# Limitar a 2200px alto (el crop tiene más alto que ancho)
target_h = 2200
scale = target_h / crop.size[1]
new_size = (int(round(crop.size[0] * scale)), target_h)
crop_r = crop.resize(new_size, Image.LANCZOS)

# Dibujo grilla suave para referencia
draw = ImageDraw.Draw(crop_r)
for x in range(0, new_size[0], 100):
    color = (200, 0, 0) if x % 500 == 0 else (200, 200, 200)
    draw.line([(x, 0), (x, new_size[1])], fill=color, width=1)
for y in range(0, new_size[1], 100):
    color = (200, 0, 0) if y % 500 == 0 else (200, 200, 200)
    draw.line([(0, y), (new_size[0], y)], fill=color, width=1)

try:
    font = ImageFont.truetype("arial.ttf", 20)
except Exception:
    font = ImageFont.load_default()
# Etiquetas cada 500px
for x in range(0, new_size[0], 500):
    draw.text((x+2, 2), str(x), fill=(200, 0, 0), font=font)
for y in range(0, new_size[1], 500):
    draw.text((2, y+2), str(y), fill=(200, 0, 0), font=font)

out = os.path.join(OUT_DIR, "recinto_edificio_zoom.png")
crop_r.save(out, "PNG", optimize=True)
print(f"crop resized: {new_size}  scale_from_orig={scale:.5f}")
print(f"crop bbox in orig: {BBOX}")
print(f"para volver: orig_x = crop_x / {scale:.5f} + {BBOX[0]}")
print(f"             orig_y = crop_y / {scale:.5f} + {BBOX[1]}")
