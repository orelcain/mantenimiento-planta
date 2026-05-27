"""Fase 5 — regenerar plano-base.png/dark.png ocultando capas OCG del PDF.

Estrategia:
1. Abrir plano.pdf con pikepdf.
2. Marcar capas seleccionadas como OFF en /OCProperties/D/OFF.
3. Guardar un PDF temporal.
4. Renderizar con pypdfium2 al mismo bbox y escala que el plano-base actual
   (scale=4.0, crop edificio = (227,363)-(1795,1263) en pt rotado del PDF).
5. Aplicar inversion de luminancia para tema oscuro.
6. Guardar como plano-base.png y plano-base-dark.png en planos-aguas-assets/.

Capas a ocultar (configurable abajo):
  - M-TEXTO   (cotas/medidas)
  - M-Formato (formato/cajetin)
  - AR-TEXTO  (textos arquitectonicos)

Otras capas siguen ON (cañerias, muros, equipos, etc).

Backup: los actuales van a output/_pre-remove-cotas/.
"""
import os, sys, shutil, time, tempfile
import pikepdf
import pypdfium2 as pdfium
import numpy as np
from PIL import Image

# === Config ===
SRC_PDF = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano.pdf"
ASSETS = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets"
BACKUP_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\output\_pre-remove-cotas"
os.makedirs(BACKUP_DIR, exist_ok=True)

# Capas OCG a OCULTAR (por nombre exacto)
LAYERS_TO_HIDE = {
    "M-TEXTO",      # cotas/medidas
    "AR-TEXTO",     # textos arquitectonicos
    "M-Formato",    # formato/cajetin de medidas
    "G-FORMATO",    # formato general
    "PDF_TEXTO 2",  # textos PDF
    "DIBUJO",       # capa dibujo (puede tener las lineas de cota)
}

NAVY = (12, 22, 32)  # #0c1620

# === Rendering params (mismo que la actual plano-base.png) ===
# Page size: (2384, 1684) pt, rotation 270.
# Crop edificio en pt rotado = (227,363) - (1795,1263) → 1568 x 900 pt.
# Scale 4.0 → 6272 x 3600 px (= dimensiones actuales).
PDF_ROT = 270
PDF_CROP_RECT_PT = (227, 363, 1795, 1263)  # (left, top, right, bottom) en pt rotado
PDF_SCALE = 4.0  # px / pt
EXPECTED_OUT = (6272, 3600)


def step(msg):
    print(f"\n[+] {msg}")


step("Cargando PDF con pikepdf...")
with pikepdf.open(SRC_PDF, allow_overwriting_input=False) as pdf:
    ocp = pdf.Root.get('/OCProperties')
    if not ocp:
        print("ERROR: PDF no tiene OCG.")
        sys.exit(1)
    ocgs = ocp.get('/OCGs', [])
    print(f"  PDF tiene {len(ocgs)} capas OCG.")

    # Identificar capas a ocultar
    off_refs = []
    on_refs = []
    for ocg in ocgs:
        name = str(ocg.get('/Name', '?'))
        if name in LAYERS_TO_HIDE:
            off_refs.append(ocg)
            print(f"  OFF: {name}")
        else:
            on_refs.append(ocg)

    print(f"  Total OFF: {len(off_refs)}, ON: {len(on_refs)}")

    # Modificar /OCProperties/D para incluir OFF y ON
    d = ocp.get('/D', pikepdf.Dictionary())
    d['/OFF'] = pikepdf.Array(off_refs)
    d['/ON'] = pikepdf.Array(on_refs)
    # BaseState default es ON; explícito por las dudas
    d['/BaseState'] = pikepdf.Name('/ON')
    ocp['/D'] = d
    pdf.Root['/OCProperties'] = ocp

    # Guardar PDF temporal
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    pdf.save(tmp.name)
    print(f"  PDF temporal guardado: {tmp.name}")


step("Renderizando con pypdfium2 (esto demora ~5-10s)...")
t0 = time.time()
doc = pdfium.PdfDocument(tmp.name)
page = doc[0]

# Renderizar pagina completa al scale, luego cropear al rectángulo del edificio.
# Page natural size = (2384, 1684) pt. Con scale=4 -> (9536, 6736) px.
# Pero solo necesitamos el crop del edificio (6272x3600 px).

# pypdfium2 .render() devuelve la pagina entera. Para evitar generar la imagen
# entera y cropear, uso get_viewport con rotation y limites.
# Actually pdfium no soporta crop directo en render(). Renderizo full y crop.
img = page.render(scale=PDF_SCALE, rotation=PDF_ROT).to_pil()
print(f"  full render: {img.size}  ({(time.time()-t0):.1f}s)")

# Crop al rectángulo del edificio en coords PIXEL
# El PDF rota 270, así que la pagina natural (2384x1684) pasa a (1684x2384) en pt rotado.
# A scale 4: (6736 x 9536) px.
# Crop rect en pt rotado = (227, 363, 1795, 1263) → en pixel: multiplicar por scale=4
left_px = PDF_CROP_RECT_PT[0] * PDF_SCALE
top_px = PDF_CROP_RECT_PT[1] * PDF_SCALE
right_px = PDF_CROP_RECT_PT[2] * PDF_SCALE
bottom_px = PDF_CROP_RECT_PT[3] * PDF_SCALE
print(f"  crop box: ({left_px}, {top_px}) - ({right_px}, {bottom_px})")
plano_clear = img.crop((left_px, top_px, right_px, bottom_px))
print(f"  cropped: {plano_clear.size}")
assert plano_clear.size == EXPECTED_OUT, f"Tamano inesperado {plano_clear.size}, esperado {EXPECTED_OUT}"


step("Backup de los archivos actuales...")
for fn in ["plano-base.png", "plano-base-dark.png"]:
    src = os.path.join(ASSETS, fn)
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(BACKUP_DIR, fn))
        print(f"  backup: {fn} -> {BACKUP_DIR}")


step("Guardando plano-base.png (claro)...")
dst_light = os.path.join(ASSETS, "plano-base.png")
plano_clear.save(dst_light, "PNG", optimize=True)
sz = os.path.getsize(dst_light) / 1024 / 1024
print(f"  -> {dst_light}  {sz:.2f} MB")


step("Generando plano-base-dark.png (inversion luminancia + navy)...")
t0 = time.time()
a = np.asarray(plano_clear).astype(np.float32) / 255.0
if a.shape[2] == 4: a = a[..., :3]
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mx = a.max(-1); mn = a.min(-1)
L = (mx + mn) / 2.0
d = mx - mn
nz = d > 1e-6
S = np.zeros_like(L); S[nz] = d[nz] / (1 - np.abs(2 * L[nz] - 1) + 1e-9)
H = np.zeros_like(L)
i = nz & (mx == r);                         H[i] = ((g[i] - b[i]) / d[i]) % 6
i = nz & (mx == g) & (mx != r);             H[i] = (b[i] - r[i]) / d[i] + 2
i = nz & (mx == b) & (mx != r) & (mx != g); H[i] = (r[i] - g[i]) / d[i] + 4
H = H / 6.0
Ln = 1.0 - L
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
out = nv + out * (1.0 - nv)
out8 = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(out8, "RGB").save(os.path.join(ASSETS, "plano-base-dark.png"), "PNG", optimize=True)
sz = os.path.getsize(os.path.join(ASSETS, "plano-base-dark.png")) / 1024 / 1024
print(f"  done ({(time.time()-t0):.1f}s)  -> plano-base-dark.png  {sz:.2f} MB")


step("Limpieza...")
os.remove(tmp.name)
print(f"  PDF temporal eliminado: {tmp.name}")
print(f"\nLISTO. Recargar iframe en preview para verificar.")
print(f"Backups en {BACKUP_DIR}")
print(f"Capas ocultadas: {sorted(LAYERS_TO_HIDE)}")
