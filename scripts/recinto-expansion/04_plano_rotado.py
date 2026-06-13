"""Fase 1 paso 4 — plano-base rotado 90° para facilitar comparación visual.

El edificio en el recinto está con eje largo vertical (~rotado 0° del recinto).
El edificio en el plano-base está con eje largo horizontal (~rotado 90°).
Roto el plano-base -90° (CCW = 90° antihorario en PIL) para que ambos
queden con la MISMA orientación. Esto NO es la transformación final, solo
una ayuda visual para identificar esquinas correspondientes.

Guardo dos versiones: una a tamaño thumbnail ~1600px y otra a 2400px.
"""
import os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base-dark.png"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\thumbs"

im = Image.open(SRC).convert("RGB")
# PIL ROTATE_90 = 90° antihorario; ROTATE_270 = 90° horario.
# El plano-base tiene 6272 ancho × 3600 alto (horizontal). Lo quiero vertical.
# Probamos ambas rotaciones; visualmente luego elijo.
for code, suffix in [(Image.ROTATE_90, "rot90ccw"), (Image.ROTATE_270, "rot90cw")]:
    im_r = im.transpose(code)
    # bajar a ~1600px lado largo
    target = 1600
    scale = target / max(im_r.size)
    new_size = (int(round(im_r.size[0] * scale)), int(round(im_r.size[1] * scale)))
    im_r_small = im_r.resize(new_size, Image.LANCZOS)
    out = os.path.join(OUT_DIR, f"plano_base_dark_{suffix}_1600.png")
    im_r_small.save(out, "PNG", optimize=True)
    print(f"{suffix}: {im_r.size} -> {new_size}  saved as {os.path.basename(out)}")
