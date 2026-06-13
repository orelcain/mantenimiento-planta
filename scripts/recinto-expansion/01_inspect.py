"""Fase 1 paso 1 — inspección de dimensiones de las imágenes fuente."""
import os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

PATHS = [
    r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\recinto completo.png",
    r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\planta principal.png",
    r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base.png",
    r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base-dark.png",
]

for p in PATHS:
    im = Image.open(p)
    name = os.path.basename(p)
    size_mb = os.path.getsize(p) / 1024 / 1024
    print(f"{name:38s} {im.size[0]:>6d}x{im.size[1]:<6d}  {im.mode:5s}  {size_mb:6.2f} MB")
