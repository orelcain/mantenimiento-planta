"""Fase 1 paso 9 — prepara assets para la herramienta de alineamiento.

Genera versiones a resolución suficiente para zoom in (sin saturar memoria
del browser). Guarda en scripts/recinto-expansion/aligner/imgs/ y arma un
JSON con metadata (escalas, dimensiones originales).
"""
import os, json
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\aligner"
IMG_DIR = os.path.join(ROOT, "imgs")
os.makedirs(IMG_DIR, exist_ok=True)

SOURCES = [
    {
        "key": "recinto",
        "src": r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\recinto completo.png",
        "target_long_side": 4000,
        "filename": "recinto.jpg",
    },
    {
        "key": "plano",
        "src": r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano-base-dark.png",
        "target_long_side": 3000,
        "filename": "plano.jpg",
    },
]

meta = {}
for cfg in SOURCES:
    im = Image.open(cfg["src"]).convert("RGB")
    orig_w, orig_h = im.size
    s = cfg["target_long_side"] / max(orig_w, orig_h)
    new_w, new_h = int(round(orig_w * s)), int(round(orig_h * s))
    im_r = im.resize((new_w, new_h), Image.LANCZOS)
    out = os.path.join(IMG_DIR, cfg["filename"])
    im_r.save(out, "JPEG", quality=88, optimize=True)
    kb = os.path.getsize(out) / 1024
    meta[cfg["key"]] = {
        "filename": cfg["filename"],
        "orig_w": orig_w,
        "orig_h": orig_h,
        "display_w": new_w,
        "display_h": new_h,
        "scale_display_to_orig": 1.0 / s,
    }
    print(f"{cfg['key']:8s} orig {orig_w}x{orig_h} -> display {new_w}x{new_h}  scale_orig={1.0/s:.5f}  {kb:.0f} KB")

with open(os.path.join(ROOT, "meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)
print(f"\nmeta.json saved at {ROOT}\\meta.json")
