"""Fase 1 paso final — calcula transformación afín recinto -> plano-base.

Modelo: x' = a*x + b*y + e
        y' = c*x + d*y + f

6 parámetros (a,b,c,d,e,f). Con 4 puntos correspondientes tenemos 8
ecuaciones; se resuelve por least-squares (numpy.linalg.lstsq).

Entrada:  points.json (4 puntos {recinto:{x,y}, plano:{x,y}})
Salida:   transform.json (matriz, residuales, descomposición)
          + log a stdout con análisis (scale, rotation, residuals)
"""
import json, math, os
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
PTS_PATH = os.path.join(ROOT, "points.json")
OUT_PATH = os.path.join(ROOT, "transform.json")

with open(PTS_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

pts = data["points"]
N = len(pts)

# Build design matrix A (2N x 6) and target b (2N)
# For each (x,y) -> (x', y'):
#   x' = a*x + b*y + 0 + 0 + 1*e + 0
#   y' = 0 + 0 + c*x + d*y + 0 + 1*f
A = np.zeros((2*N, 6))
B = np.zeros(2*N)
for i, p in enumerate(pts):
    x, y = p["recinto"]["x"], p["recinto"]["y"]
    xp, yp = p["plano"]["x"], p["plano"]["y"]
    A[2*i,   :] = [x, y, 0, 0, 1, 0]
    A[2*i+1, :] = [0, 0, x, y, 0, 1]
    B[2*i]   = xp
    B[2*i+1] = yp

sol, residuals_sum, rank, sv = np.linalg.lstsq(A, B, rcond=None)
a, b, c, d, e, f = sol

# Compute per-point residuals
print("=" * 70)
print("TRANSFORMACION AFIN  recinto -> plano-base")
print("=" * 70)
print(f"  a = {a:12.6f}    b = {b:12.6f}    e = {e:12.4f}")
print(f"  c = {c:12.6f}    d = {d:12.6f}    f = {f:12.4f}")
print()
print(f"  Matriz [a b e]   [{a:9.6f}  {b:9.6f}  {e:11.2f}]")
print(f"         [c d f] = [{c:9.6f}  {d:9.6f}  {f:11.2f}]")
print(f"         [0 0 1]   [{0:9.0f}  {0:9.0f}  {1:11.0f}]")
print()

# Descomposicion: scale (sx, sy), shear, rotation
# Para afin de 6 parametros:  M = R(theta) * scale * (1 shear; 0 1) approx
# Aproximacion simple: sx = sqrt(a^2 + c^2), sy = sqrt(b^2 + d^2)
sx = math.sqrt(a*a + c*c)
sy = math.sqrt(b*b + d*d)
rot_deg_a = math.degrees(math.atan2(c, a))   # rotation segun eje X
rot_deg_b = math.degrees(math.atan2(-b, d))  # rotation segun eje Y (deberia coincidir)
det = a*d - b*c
print(f"  Escala estimada: sx = {sx:.5f}  sy = {sy:.5f}  (deberia ser similar si no hay shear)")
print(f"  Rotacion (atan2(c,a)):  {rot_deg_a:+.3f} deg")
print(f"  Rotacion (atan2(-b,d)): {rot_deg_b:+.3f} deg")
print(f"  Determinante: {det:.5f}  (signo + = preserva orientacion, - = mirror)")
print()

# Per-point residuals
print("=" * 70)
print("RESIDUALES POR PUNTO (error en px del plano-base)")
print("=" * 70)
print(f"{'#':>3} | {'recinto':>15} | {'plano (real)':>15} | {'plano (pred)':>15} | {'dx':>7} | {'dy':>7} | {'dist':>7}")
print("-" * 90)
errors = []
for i, p in enumerate(pts):
    x, y = p["recinto"]["x"], p["recinto"]["y"]
    xp, yp = p["plano"]["x"], p["plano"]["y"]
    xpred = a*x + b*y + e
    ypred = c*x + d*y + f
    dx = xpred - xp
    dy = ypred - yp
    dist = math.hypot(dx, dy)
    errors.append(dist)
    print(f"{i+1:>3} | ({x:>5d},{y:>5d}) | ({xp:>5d},{yp:>5d}) | ({xpred:>7.1f},{ypred:>7.1f}) | {dx:+7.2f} | {dy:+7.2f} | {dist:7.2f}")
rms = math.sqrt(sum(e*e for e in errors) / len(errors))
print("-" * 90)
print(f"RMS error: {rms:.2f} px del plano-base")
print(f"Max error: {max(errors):.2f} px")
print()

# Bounding box: donde caen las 4 esquinas del recinto (0,0)-(W,H) en plano-base
W, H = data["sources"]["recinto"]["orig_w"], data["sources"]["recinto"]["orig_h"]
corners = [(0, 0), (W, 0), (W, H), (0, H)]
print("=" * 70)
print("PROYECCION DE LAS 4 ESQUINAS DEL RECINTO EN COORDS DEL PLANO-BASE")
print("=" * 70)
mapped = []
for (cx, cy) in corners:
    mx = a*cx + b*cy + e
    my = c*cx + d*cy + f
    mapped.append((mx, my))
    print(f"  recinto ({cx:>5d},{cy:>5d})  ->  plano ({mx:>9.1f}, {my:>9.1f})")
xs = [m[0] for m in mapped]
ys = [m[1] for m in mapped]
bbox = (min(xs), min(ys), max(xs), max(ys))
print(f"\n  bbox del recinto proyectado en plano-base: ({bbox[0]:.1f}, {bbox[1]:.1f}) - ({bbox[2]:.1f}, {bbox[3]:.1f})")
print(f"  dimensiones: {bbox[2]-bbox[0]:.1f} x {bbox[3]-bbox[1]:.1f}")
print(f"  (plano-base hoy: 6272 x 3600)")
print()

# Guardar
out = {
    "generated_at": data["generated_at"],
    "method": "least-squares 6-param affine, 4 correspondences (over-determined)",
    "matrix": {
        "a": a, "b": b, "c": c, "d": d, "e": e, "f": f,
        "note": "x' = a*x + b*y + e ; y' = c*x + d*y + f  (recinto -> plano-base, en px)"
    },
    "css_matrix": f"matrix({a:.8f}, {c:.8f}, {b:.8f}, {d:.8f}, {e:.4f}, {f:.4f})",
    "css_matrix_note": "CSS matrix(a,b,c,d,tx,ty) usa orden distinto: (a,c,b,d,e,f) -> matrix(a,c,b,d,e,f)",
    "decomposition": {
        "sx": sx, "sy": sy,
        "rotation_deg_from_atan2_ca": rot_deg_a,
        "rotation_deg_from_atan2_neg_b_d": rot_deg_b,
        "determinant": det,
    },
    "residuals_px_plano": {
        "per_point": [round(x, 3) for x in errors],
        "rms": round(rms, 3),
        "max": round(max(errors), 3),
    },
    "recinto_corners_in_plano_coords": [
        {"recinto": list(c), "plano": [round(m[0], 2), round(m[1], 2)]}
        for c, m in zip(corners, mapped)
    ],
    "bbox_in_plano_coords": {
        "x_min": round(bbox[0], 2), "y_min": round(bbox[1], 2),
        "x_max": round(bbox[2], 2), "y_max": round(bbox[3], 2),
        "width":  round(bbox[2]-bbox[0], 2),
        "height": round(bbox[3]-bbox[1], 2),
    },
    "plano_base_size": {"w": 6272, "h": 3600},
}
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)
print(f"transform.json guardado en {OUT_PATH}")
