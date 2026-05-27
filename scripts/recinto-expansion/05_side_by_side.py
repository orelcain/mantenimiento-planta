"""Fase 1 paso 5 — vista comparativa side-by-side, misma altura.

Pone el crop del edificio del recinto y el plano-base rotado lado a lado,
escalados a la misma altura, para identificar visualmente las 4 esquinas
correspondientes.

También dibuja una grilla suave (cada 100px) y un marco rojo en las
posiciones tentativas de las 4 esquinas (NW/NE/SE/SW) para que el usuario
valide o ajuste.
"""
import os
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None

OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\thumbs"

RECINTO_CROP = os.path.join(OUT_DIR, "recinto_edificio_crop.png")  # 2200x1907
PLANO_ROT = os.path.join(OUT_DIR, "plano_base_dark_rot90cw_1600.png")  # 918x1600

recinto = Image.open(RECINTO_CROP).convert("RGB")
plano = Image.open(PLANO_ROT).convert("RGB")

# Misma altura para ambas: 1600 px
H = 1600
def scale_to_h(im, h):
    s = h / im.size[1]
    return im.resize((int(round(im.size[0] * s)), h), Image.LANCZOS), s

recinto_s, sr = scale_to_h(recinto, H)
plano_s, sp = scale_to_h(plano, H)
print(f"recinto scaled: {recinto_s.size} (scale from crop={sr:.4f})")
print(f"plano   scaled: {plano_s.size} (scale from rot1600={sp:.4f})")

# canvas: ambos lado a lado con separación de 30px
gap = 30
canvas_w = recinto_s.size[0] + gap + plano_s.size[0]
canvas_h = H
canvas = Image.new("RGB", (canvas_w, canvas_h), (40, 40, 40))
canvas.paste(recinto_s, (0, 0))
canvas.paste(plano_s, (recinto_s.size[0] + gap, 0))

draw = ImageDraw.Draw(canvas)
# Grilla suave cada 100 px
for x in range(0, canvas_w, 100):
    draw.line([(x, 0), (x, canvas_h)], fill=(80, 80, 80), width=1)
for y in range(0, canvas_h, 100):
    draw.line([(0, y), (canvas_w, y)], fill=(80, 80, 80), width=1)

# Etiquetas
try:
    font = ImageFont.truetype("arial.ttf", 28)
except Exception:
    font = ImageFont.load_default()
draw.text((10, 10), "RECINTO (crop edificio)", fill=(255, 200, 50), font=font)
draw.text((recinto_s.size[0] + gap + 10, 10), "PLANO-BASE (rotado 90° horario)", fill=(255, 200, 50), font=font)

out = os.path.join(OUT_DIR, "side_by_side.png")
canvas.save(out, "PNG", optimize=True)
print(f"saved {out}  {canvas_w}x{canvas_h}")
