#!/usr/bin/env python3
"""
make-dark-plano.py — Convierte un plano CAD (fondo blanco, líneas gris/negras +
colores) a su versión OSCURA estándar de la PWA: fondo navy, líneas claras y
colores de líneas preservados (agua dulce/salada, etc.).

Por qué inversión de LUMINANCIA (y no invert() plano): invertir cada canal rota
los colores (verde→magenta). Invirtiendo solo la lightness en HSL, el fondo
blanco se vuelve oscuro y las líneas negras claras, PERO los colores se mantienen.
Además se eleva el punto negro al navy de la app (#0c1620) para cohesión visual.

Uso:
    python scripts/make-dark-plano.py entrada.png salida-dark.png
    (requiere numpy + pillow; si faltan: uv pip install --system numpy pillow)

Estándar del proyecto: ver memoria reference_plano_oscuro_estandar y CLAUDE.md.
"""
import sys
import numpy as np
from PIL import Image

NAVY = (12, 22, 32)  # #0c1620 — fondo de la app


def to_dark(src_path: str, dst_path: str, navy=NAVY) -> None:
    img = Image.open(src_path).convert("RGB")
    a = np.asarray(img).astype(np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1)
    mn = a.min(-1)
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

    Ln = 1.0 - L  # invertir solo la luminancia

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

    nv = np.array(navy, np.float32) / 255.0
    out = nv + out * (1.0 - nv)  # elevar negro al navy

    out8 = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(out8, "RGB").save(dst_path, optimize=True)
    print(f"OK -> {dst_path}  {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("uso: python scripts/make-dark-plano.py entrada.png salida-dark.png")
        sys.exit(1)
    to_dark(sys.argv[1], sys.argv[2])
