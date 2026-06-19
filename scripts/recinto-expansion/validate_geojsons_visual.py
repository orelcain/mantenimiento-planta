"""Validacion visual: superponer cada GeoJSON sobre el plano-base.png reducido
para verificar que las paths caen sobre las cañerias/muros correctos.

Salida: scripts/recinto-expansion/plano_extract/validate_*.png
"""
import os
import json
from PIL import Image, ImageDraw

GEOJSONS_DIR = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\geojsons"
PNG = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base.png"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\plano_extract"
os.makedirs(OUT_DIR, exist_ok=True)

COLORS = {
    "agua-dulce": (0, 255, 0, 255),
    "agua-salada": (0, 255, 255, 255),
    "muros": (255, 255, 0, 220),
    "cotas-rojas": (255, 0, 0, 255),
    "texto-negro": (255, 0, 255, 220),
    "exteriores": (255, 128, 0, 220),
}


def draw_geojson(name, color):
    path = os.path.join(GEOJSONS_DIR, f"plano-{name}.geojson")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        gj = json.load(f)
    if not gj.get("features"):
        print(f"  {name}: 0 features, skipping")
        return None
    img = Image.open(PNG).convert("RGB")
    overlay = img.copy()
    draw = ImageDraw.Draw(overlay, "RGBA")
    for feat in gj["features"]:
        g = feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for poly in polys:
            if len(poly) < 2:
                continue
            try:
                draw.line([(p[0], p[1]) for p in poly], fill=color, width=4)
            except Exception:
                pass
    overlay.thumbnail((2400, 2400), Image.LANCZOS)
    out = os.path.join(OUT_DIR, f"validate_{name}.png")
    overlay.save(out, "PNG")
    print(f"  {name}: {len(gj['features'])} feats -> {out}")
    return out


print("=== Generando overlays de validacion ===")
for n, c in COLORS.items():
    draw_geojson(n, c)

# Tambien generar un OVERLAY combinado: todas las capas a la vez sobre fondo gris
print("\n=== Overlay combinado (todas las capas) ===")
img = Image.open(PNG).convert("RGB")
# darken background
from PIL import ImageEnhance
img = ImageEnhance.Brightness(img).enhance(0.35)
overlay = img.copy()
draw = ImageDraw.Draw(overlay, "RGBA")
totals = 0
for n, c in COLORS.items():
    path = os.path.join(GEOJSONS_DIR, f"plano-{n}.geojson")
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8") as f:
        gj = json.load(f)
    for feat in gj.get("features", []):
        g = feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for poly in polys:
            if len(poly) >= 2:
                draw.line([(p[0], p[1]) for p in poly], fill=c, width=2)
                totals += 1
print(f"  segmentos totales: {totals}")
overlay.thumbnail((2400, 2400), Image.LANCZOS)
out = os.path.join(OUT_DIR, "validate_ALL.png")
overlay.save(out, "PNG")
print(f"  -> {out}")
