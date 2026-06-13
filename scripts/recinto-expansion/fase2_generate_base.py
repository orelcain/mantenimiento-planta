"""Fase 2 — generar recinto-base.jpg + recinto-base-dark.jpg optimizados.

Pipeline:
 1. Cargar recinto completo.png (18725x13245).
 2. Reducir a 8000 px lado largo (mantiene legibilidad de etiquetas).
 3. Guardar version CLARO (recinto-base.jpg, JPEG q85).
 4. Aplicar inversion de luminancia (mismo algoritmo que scripts/make-dark-plano.py)
    para version OSCURA.
 5. Guardar version OSCURA (recinto-base-dark.jpg, JPEG q88).
 6. Calcular bbox del lienzo expandido en coords del plano-base.

Salida en scripts/recinto-expansion/output/  (NO se mueve a planos-aguas-assets
hasta Fase 3 — asi no contaminamos producción por accidente).
"""
import os, json, math, time
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "output")
os.makedirs(OUT_DIR, exist_ok=True)

SRC = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\recinto completo.png"
TARGET_LONG_SIDE = 8000
NAVY = (12, 22, 32)  # #0c1620

# === 1-2. Cargar y reducir ===
print(f"Cargando {SRC} ...")
t0 = time.time()
im = Image.open(SRC).convert("RGB")
print(f"  original {im.size}  ({(time.time()-t0):.1f}s)")

s = TARGET_LONG_SIDE / max(im.size)
new_size = (int(round(im.size[0] * s)), int(round(im.size[1] * s)))
print(f"  resize a {new_size} (scale={s:.5f})")
t0 = time.time()
im_small = im.resize(new_size, Image.LANCZOS)
print(f"  resize done ({(time.time()-t0):.1f}s)")

# === 3. Version CLARO ===
out_light = os.path.join(OUT_DIR, "recinto-base.jpg")
im_small.save(out_light, "JPEG", quality=85, optimize=True, progressive=True)
sz_light = os.path.getsize(out_light) / 1024 / 1024
print(f"  CLARO -> {out_light}  {sz_light:.2f} MB")

# === 4. Inversion de luminancia (HSL: solo L invertido, H y S preservados) ===
def to_dark_array(rgb01):
    a = rgb01
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1); mn = a.min(-1)
    L = (mx + mn) / 2.0
    d = mx - mn
    nz = d > 1e-6
    S = np.zeros_like(L)
    S[nz] = d[nz] / (1 - np.abs(2 * L[nz] - 1) + 1e-9)
    H = np.zeros_like(L)
    i = nz & (mx == r);                         H[i] = ((g[i] - b[i]) / d[i]) % 6
    i = nz & (mx == g) & (mx != r);             H[i] = (b[i] - r[i]) / d[i] + 2
    i = nz & (mx == b) & (mx != r) & (mx != g); H[i] = (r[i] - g[i]) / d[i] + 4
    H = H / 6.0
    Ln = 1.0 - L  # invertir luminancia
    C = (1 - np.abs(2 * Ln - 1)) * S
    Hp = H * 6.0
    X = C * (1 - np.abs(Hp % 2 - 1))
    R = np.zeros_like(H); G = np.zeros_like(H); B = np.zeros_like(H)
    c = (Hp >= 0) & (Hp < 1); R[c], G[c], B[c] = C[c], X[c], 0
    c = (Hp >= 1) & (Hp < 2); R[c], G[c], B[c] = X[c], C[c], 0
    c = (Hp >= 2) & (Hp < 3); R[c], G[c], B[c] = 0, C[c], X[c]
    c = (Hp >= 3) & (Hp < 4); R[c], G[c], B[c] = 0, X[c], C[c]
    c = (Hp >= 4) & (Hp < 5); R[c], G[c], B[c] = X[c], 0, C[c]
    c = (Hp >= 5) & (Hp <= 6); R[c], G[c], B[c] = C[c], 0, X[c]
    m = Ln - C / 2
    out = np.clip(np.stack([R + m, G + m, B + m], -1), 0, 1)
    nv = np.array(NAVY, np.float32) / 255.0
    out = nv + out * (1.0 - nv)  # elevar negro al navy
    return np.clip(out, 0, 1)

print("\nAplicando inversion de luminancia ...")
t0 = time.time()
a = np.asarray(im_small).astype(np.float32) / 255.0
dark = to_dark_array(a)
dark8 = (dark * 255 + 0.5).astype(np.uint8)
im_dark = Image.fromarray(dark8, "RGB")
print(f"  done ({(time.time()-t0):.1f}s)")

# === 5. Version OSCURA ===
out_dark = os.path.join(OUT_DIR, "recinto-base-dark.jpg")
im_dark.save(out_dark, "JPEG", quality=88, optimize=True, progressive=True)
sz_dark = os.path.getsize(out_dark) / 1024 / 1024
print(f"  OSCURO -> {out_dark}  {sz_dark:.2f} MB")

# === 6. Calcular bbox en coords del plano-base usando la matriz de Fase 1 ===
with open(os.path.join(ROOT, "transform.json"), "r", encoding="utf-8") as f:
    tr = json.load(f)
a_, b_, c_, d_, e_, f_ = (tr["matrix"][k] for k in "abcdef")

# IMPORTANTE: la matriz fue calculada con el recinto ORIGINAL (18725x13245).
# Ahora trabajamos con un recinto REDUCIDO (new_size). La transformación de
# coords del recinto REDUCIDO al plano-base se obtiene aplicando primero la
# inversa del downsample:
#   x_orig = x_reduced / s
#   y_orig = y_reduced / s
# Luego aplicar la afín original.
# Composición: matriz_reducido_a_plano = matriz_orig_a_plano * diag(1/s, 1/s)
# Es decir, dividir a,b,c,d por s (e,f sin cambio).
a_r = a_ / s
b_r = b_ / s
c_r = c_ / s
d_r = d_ / s

print(f"\nMatriz para recinto REDUCIDO ({new_size[0]}x{new_size[1]}) -> plano-base:")
print(f"  [{a_r:.6f} {b_r:.6f} {e_:.4f}]")
print(f"  [{c_r:.6f} {d_r:.6f} {f_:.4f}]")

# Bbox de las 4 esquinas del recinto reducido en coords del plano-base
W, H = new_size
corners = [(0,0), (W,0), (W,H), (0,H)]
mapped = []
for (cx, cy) in corners:
    mx = a_r*cx + b_r*cy + e_
    my = c_r*cx + d_r*cy + f_
    mapped.append((mx, my))
xs = [m[0] for m in mapped]; ys = [m[1] for m in mapped]
bbox = (min(xs), min(ys), max(xs), max(ys))

# Union con plano-base (0,0)-(6272,3600)
plano_bbox = (0, 0, 6272, 3600)
union = (
    min(bbox[0], plano_bbox[0]),
    min(bbox[1], plano_bbox[1]),
    max(bbox[2], plano_bbox[2]),
    max(bbox[3], plano_bbox[3]),
)
print(f"\nBbox recinto reducido en coords plano-base:")
print(f"  ({bbox[0]:.1f}, {bbox[1]:.1f}) - ({bbox[2]:.1f}, {bbox[3]:.1f})  size {bbox[2]-bbox[0]:.0f}x{bbox[3]-bbox[1]:.0f}")
print(f"Bbox plano-base:")
print(f"  (0, 0) - (6272, 3600)")
print(f"Union (lienzo expandido):")
print(f"  ({union[0]:.1f}, {union[1]:.1f}) - ({union[2]:.1f}, {union[3]:.1f})  size {union[2]-union[0]:.0f}x{union[3]-union[1]:.0f}")

# Guardar config Fase 2
config = {
    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "recinto_orig_size": [im.size[0], im.size[1]],
    "recinto_reduced_size": [W, H],
    "downsample_scale": s,
    "matrix_reduced_to_plano": {
        "a": a_r, "b": b_r, "c": c_r, "d": d_r, "e": e_, "f": f_,
        "note": "x_plano = a*x_reducido + b*y_reducido + e ; y_plano = c*x_reducido + d*y_reducido + f"
    },
    "outputs": {
        "light": {"path": "output/recinto-base.jpg", "size_mb": round(sz_light, 3)},
        "dark":  {"path": "output/recinto-base-dark.jpg", "size_mb": round(sz_dark, 3)},
    },
    "bbox_recinto_in_plano_coords": {
        "x_min": round(bbox[0], 2), "y_min": round(bbox[1], 2),
        "x_max": round(bbox[2], 2), "y_max": round(bbox[3], 2),
        "w": round(bbox[2]-bbox[0], 2), "h": round(bbox[3]-bbox[1], 2),
    },
    "bbox_union_lienzo_expandido": {
        "x_min": round(union[0], 2), "y_min": round(union[1], 2),
        "x_max": round(union[2], 2), "y_max": round(union[3], 2),
        "w": round(union[2]-union[0], 2), "h": round(union[3]-union[1], 2),
    },
    "css_transform_for_embed": (
        f"matrix({a_r:.6f}, {c_r:.6f}, {b_r:.6f}, {d_r:.6f}, {e_:.2f}, {f_:.2f})"
    ),
    "css_transform_note": "CSS matrix(a,b,c,d,e,f) usa orden (a,c,b,d,tx,ty) vs nuestra notacion (a,b,c,d,e,f).",
}
out_cfg = os.path.join(ROOT, "fase2_config.json")
with open(out_cfg, "w", encoding="utf-8") as f:
    json.dump(config, f, indent=2)
print(f"\nfase2_config.json -> {out_cfg}")
