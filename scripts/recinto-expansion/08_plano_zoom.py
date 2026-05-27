"""Fase 1 paso 8 — zoom del plano-base, con grilla, en MISMA orientación
que el recinto (rotación 90° horario), para identificar esquinas correspondientes.

El plano-base es 6272×3600 horizontal. Lo roto 90° CW (=Image.ROTATE_270 en PIL)
para tener edificio vertical = misma orientación que el recinto. Eso hace que la
nueva imagen sea 3600×6272.

Coordenadas en el ORIGINAL (no rotado) del plano-base se relacionan así:
  Si rotamos 90° CW, un punto (x,y) en el original pasa a (H-1-y, x) en la rotada
  donde H = 3600 (alto original).

Inversa: punto (x', y') en la rotada → original (y', 3600-1-x') = (y', 3599-x').

Para la transformación afín FINAL trabajamos con coords del ORIGINAL del plano-base
(no rotado). La rotación solo es ayuda visual.
"""
import os
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None

SRC = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base-dark.png"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\thumbs"

im = Image.open(SRC).convert("RGB")
print(f"plano-base original: {im.size}")  # (6272, 3600)

# Rotar 90° CW para tener orientación vertical (edificio NS)
im_r = im.transpose(Image.ROTATE_270)
print(f"plano-base rotado CW: {im_r.size}")  # esperado: (3600, 6272)

# Bajar a altura 2200 para emparejar al recinto_edificio_zoom
target_h = 2200
scale = target_h / im_r.size[1]
new_size = (int(round(im_r.size[0] * scale)), target_h)
im_small = im_r.resize(new_size, Image.LANCZOS)
print(f"plano-base small: {new_size}  scale_from_rotated={scale:.5f}")

# Dibujar grilla
draw = ImageDraw.Draw(im_small)
for x in range(0, new_size[0], 100):
    color = (255, 80, 80) if x % 500 == 0 else (255, 255, 255, 30)
    draw.line([(x, 0), (x, new_size[1])], fill=color, width=1)
for y in range(0, new_size[1], 100):
    color = (255, 80, 80) if y % 500 == 0 else (255, 255, 255, 30)
    draw.line([(0, y), (new_size[0], y)], fill=color, width=1)

try:
    font = ImageFont.truetype("arial.ttf", 20)
except Exception:
    font = ImageFont.load_default()
for x in range(0, new_size[0], 500):
    draw.text((x+2, 2), str(x), fill=(255, 80, 80), font=font)
for y in range(0, new_size[1], 500):
    draw.text((2, y+2), str(y), fill=(255, 80, 80), font=font)

out = os.path.join(OUT_DIR, "plano_base_rotcw_grid.png")
im_small.save(out, "PNG", optimize=True)
print(f"saved {out}")

# Helper para convertir coords entre los espacios
print()
print("== HELPERS DE COORDS ==")
print(f"small (mostrado) → rotado-original: x_rot = x_small / {scale:.5f}; y_rot = y_small / {scale:.5f}")
print(f"rotado-original → plano-base original: x_orig = y_rot; y_orig = 3599 - x_rot")
print(f"  composición: x_orig = y_small/{scale:.5f}; y_orig = 3599 - x_small/{scale:.5f}")
