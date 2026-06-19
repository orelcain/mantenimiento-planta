"""Fase 7 — extraer paths vectoriales del plano-base PDF a 6 GeoJSONs por categoria.

Pipeline:
1. fitz.open(PDF) -> page.get_drawings() devuelve paths en sistema MEDIABOX (1684x2384 pt,
   sin rotar). pymupdf NO aplica la rotation=270 al entregar las coords.
2. Aplicar la rotation_matrix(0, -1, 1, 0, 0, 1684) -> espacio rotado (2384x1684 pt).
3. Aplicar crop (227, 363)-(1795, 1263) y scale 4.0 -> render-px (6272x3600).
4. Categorizar por (color stroke/fill + capa OCG) en 6 buckets.
5. Aplicar filtro escenario B: descartar paths con bbox diagonal < 5 pt EXCEPTO si la
   categoria es agua-dulce / agua-salada (las cañerias finas son legitimas).
6. Convertir cada drawing a MultiLineString (lineas + curves sampleadas + rects).
7. Asignar id estable `p:{cat}:{idx}` con idx = orden secuencial dentro de la categoria
   en el orden de iteracion de fitz (estable entre runs).
8. Emitir 6 archivos GeoJSON en apps/pwa/public/planos-aguas-assets/geojsons/plano-*.geojson.

Las coords del GeoJSON estan en pixels del render (0..6272, 0..3600), Y-down.
El embed HTML las usa sin matriz CSS porque ya viven en el sistema del plano-base.
"""
import os
import json
import time
import fitz

PDF = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\PLANOS AGUAS\AQUA014-HID-PL-015_C1.pdf"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\geojsons"
os.makedirs(OUT_DIR, exist_ok=True)

# Render params (deben coincidir con plano-base.png; ver fase5_remove_cotas.py)
PDF_SCALE = 4.0
CROP_PT_ROT = (227, 363, 1795, 1263)  # en pt del espacio rotado
RENDER_W = int((CROP_PT_ROT[2] - CROP_PT_ROT[0]) * PDF_SCALE)  # 6272
RENDER_H = int((CROP_PT_ROT[3] - CROP_PT_ROT[1]) * PDF_SCALE)  # 3600

# Limites de descarte
MIN_BBOX_DIAG_PT = 5.0  # paths mas chicos = ruido (cotas, signos). Pipes exentos.

# Capas para clasificacion
LAYERS_EXTERIORES = {"PDF_CERCO METALICO", "PDF_LINEAS", "PDF_EDIFICACION", "PDF_SOLERA VIA"}
LAYERS_COTAS = {"M-Formato", "G-FORMATO"}
LAYERS_TEXTO = {"AR-TEXTO", "M-TEXTO", "PDF_TEXTO 2", "DIBUJO"}
LAYERS_EQUIPOS_GRIS = {
    "EQP-Equipos - Situacion Proyectada (Trabajo3)$0$Meson Prolijado filetes$0$Visible (ANSI)",
    "EQP-Equipos - Situacion Proyectada (Trabajo3)$0$Visible (ANSI)",
}
# Capas que descartamos completamente
LAYERS_DISCARD = {"DEFPOINT", "0_Planta", "SLD-0", "PDF_0", "PDF_SE\udca0ALETICA", "PDF_SEÑALETICA"}

# Categorias exentas del filtro de min-size (textos / cotas / pipes finos / equipos son legitimos)
CATS_EXEMPT_MIN_SIZE = {"agua-dulce", "agua-salada", "cotas-rojas", "texto-negro", "equipos"}
# Min size especial por categoria (pt diagonal)
MIN_SIZE_MUROS = 3.0       # antes 12; bajado para capturar detalles finos de muros/hatching
MIN_SIZE_EQUIPOS = 2.0     # equipos tienen valvulas, simbolos, tornillos — threshold muy bajo
MIN_SIZE_EXTERIORES = 3.0

# Categorias resultantes
CATS = ["agua-dulce", "agua-salada", "muros", "equipos", "cotas-rojas", "texto-negro", "exteriores"]


def rgb255(c):
    if not c:
        return None
    return (int(c[0] * 255 + 0.5), int(c[1] * 255 + 0.5), int(c[2] * 255 + 0.5))


def near(a, b, tol=8):
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol and abs(a[2] - b[2]) <= tol


def is_grayish(rgb, tol=20):
    if not rgb:
        return False
    r, g, b = rgb
    return abs(r - g) <= tol and abs(g - b) <= tol and 40 < (r + g + b) // 3 < 230


def is_blackish(rgb):
    if not rgb:
        return False
    return max(rgb) <= 30


def path_diag(d):
    r = d.get("rect")
    if not r:
        return 0
    return ((r.x1 - r.x0) ** 2 + (r.y1 - r.y0) ** 2) ** 0.5


def categorize(d):
    """Devuelve nombre de categoria o None para descartar."""
    sc = rgb255(d.get("color"))
    fc = rgb255(d.get("fill"))
    layer = (d.get("layer") or "").strip()

    if layer in LAYERS_DISCARD:
        return None

    # 1. Cañerias por color (mayor prioridad — incluyen fills de simbolos)
    if (sc and near(sc, (0, 255, 0))) or (fc and near(fc, (0, 255, 0))):
        return "agua-dulce"
    if (sc and near(sc, (0, 255, 255))) or (fc and near(fc, (0, 255, 255))):
        return "agua-salada"

    # 2. Texto/cotas por capa
    if layer in LAYERS_TEXTO:
        return "texto-negro"
    if layer in LAYERS_COTAS:
        return "cotas-rojas"

    # 3. Cotas por color (rojo M-Formato pero a veces en capa "0")
    if sc and near(sc, (184, 0, 0)):
        return "cotas-rojas"

    # 4. Exteriores por capa
    if layer in LAYERS_EXTERIORES:
        return "exteriores"

    # 5. Equipos: capa EQP-* (mesas, baader, prolijado, etc.)
    if layer in LAYERS_EQUIPOS_GRIS:
        if is_grayish(sc) or is_blackish(sc) or (sc is None and (is_grayish(fc) or is_blackish(fc))):
            return "equipos"

    # 6. Muros: gris en capa "0" o sin capa, tamano >= MIN_SIZE_MUROS
    if layer in ("0", "<none>", ""):
        if is_grayish(sc) or (sc is None and is_grayish(fc)):
            return "muros"
        # negros gruesos tambien suelen ser arquitectura
        if is_blackish(sc) and path_diag(d) >= 10:
            return "muros"

    return None


def pmap(x_n, y_n):
    """Mapeo coords MEDIABOX pt (1684x2384) -> render-px (6272x3600).

    Aplica:
      1. rotation_matrix pymupdf: (x', y') = (y, 1684 - x). Espacio rotado 2384x1684.
      2. crop (227, 363) y scale 4.0.
    """
    x_rot = y_n
    y_rot = 1684.0 - x_n
    px = (x_rot - CROP_PT_ROT[0]) * PDF_SCALE
    py = (y_rot - CROP_PT_ROT[1]) * PDF_SCALE
    return px, py


def fmt(v):
    """Format coord with 1 decimal, omitir .0."""
    if v == int(v):
        return int(v)
    return round(v, 1)


def sample_cubic(p0, p1, p2, p3, n=4):
    """Sample cubic bezier en n+1 puntos (incluye endpoints)."""
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]
        y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        pts.append((x, y))
    return pts


def sample_quad(p0, p1, p2, n=3):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def drawing_to_lines(d):
    """Convierte un drawing a lista de polilineas (cada una = lista de puntos pt MEDIABOX).

    Items soportados:
      ('l', p1, p2)               - line
      ('c', p1, p2, p3, p4)       - cubic bezier  (p1 start, p2/p3 control, p4 end)
      ('qu', quad)                - quadrilateral fitz.Quad
      ('re', rect)                - rectangle
    """
    lines = []
    current = None
    last_pt = None

    def flush():
        nonlocal current
        if current and len(current) >= 2:
            lines.append(current)
        current = None

    for it in d.get("items", []):
        op = it[0]
        if op == "l":
            p1, p2 = (it[1].x, it[1].y), (it[2].x, it[2].y)
            if last_pt is None or last_pt != p1:
                flush()
                current = [p1]
            current.append(p2)
            last_pt = p2
        elif op == "c":
            p0 = (it[1].x, it[1].y)
            cp1 = (it[2].x, it[2].y)
            cp2 = (it[3].x, it[3].y)
            p3 = (it[4].x, it[4].y)
            if last_pt is None or last_pt != p0:
                flush()
                current = [p0]
            pts = sample_cubic(p0, cp1, cp2, p3, n=4)
            for p in pts[1:]:
                current.append(p)
            last_pt = p3
        elif op == "qu":
            # quad: 4 puntos como polígono cerrado
            quad = it[1]
            pts = [(quad.ul.x, quad.ul.y), (quad.ur.x, quad.ur.y),
                   (quad.lr.x, quad.lr.y), (quad.ll.x, quad.ll.y), (quad.ul.x, quad.ul.y)]
            flush()
            lines.append(pts)
            last_pt = None
        elif op == "re":
            r = it[1]
            pts = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]
            flush()
            lines.append(pts)
            last_pt = None
        else:
            # 'm', 'h' u otros operadores raros -> flush
            flush()
            last_pt = None
    flush()
    return lines


def transform_lines(lines):
    """Aplica pmap a cada punto y filtra coords fuera del PNG (clip suave: dejamos
    pasar si parte del path esta dentro).
    """
    out = []
    any_inside = False
    margin = 80  # permitir pequeño overshoot que se vea bien al borde
    for poly in lines:
        new_poly = []
        for (x, y) in poly:
            px, py = pmap(x, y)
            new_poly.append([fmt(px), fmt(py)])
            if -margin <= px <= RENDER_W + margin and -margin <= py <= RENDER_H + margin:
                any_inside = True
        if len(new_poly) >= 2:
            out.append(new_poly)
    return out if any_inside else []


def width_px(d):
    """Stroke width del path en pt -> px (aprox)."""
    w = d.get("width")
    if w is None:
        return None
    return round(float(w) * PDF_SCALE, 2)


# === main ===
print(f"Abriendo {PDF} ...")
t0 = time.time()
doc = fitz.open(PDF)
page = doc[0]
drawings = page.get_drawings()
print(f"  {len(drawings)} drawings extraidos ({time.time()-t0:.1f}s)")

# Buckets por categoria
buckets = {c: [] for c in CATS}
stats = {c: {"n_features": 0, "n_segments": 0, "n_paths_input": 0, "n_dropped_small": 0,
             "n_dropped_outside": 0} for c in CATS}
dropped_category = 0
dropped_small = 0
dropped_layer = 0

idx_counter = {c: 0 for c in CATS}

for d in drawings:
    cat = categorize(d)
    if cat is None:
        layer = (d.get("layer") or "").strip()
        if layer in LAYERS_DISCARD:
            dropped_layer += 1
        else:
            dropped_category += 1
        continue
    stats[cat]["n_paths_input"] += 1

    # Filtro tamaño por categoria
    if cat not in CATS_EXEMPT_MIN_SIZE:
        if cat == "muros":
            threshold = MIN_SIZE_MUROS
        elif cat == "equipos":
            threshold = MIN_SIZE_EQUIPOS
        elif cat == "exteriores":
            threshold = MIN_SIZE_EXTERIORES
        else:
            threshold = MIN_BBOX_DIAG_PT
        if path_diag(d) < threshold:
            stats[cat]["n_dropped_small"] += 1
            dropped_small += 1
            continue

    lines = drawing_to_lines(d)
    if not lines:
        continue
    coords = transform_lines(lines)
    if not coords:
        stats[cat]["n_dropped_outside"] += 1
        continue

    idx = idx_counter[cat]
    idx_counter[cat] += 1

    sc = rgb255(d.get("color"))
    fc = rgb255(d.get("fill"))
    w = width_px(d)
    n_seg = sum(max(0, len(p) - 1) for p in coords)

    props = {"id": f"p:{cat}:{idx}", "n": n_seg}
    if w is not None and w > 0:
        props["w"] = w
    if sc:
        props["sc"] = f"#{sc[0]:02x}{sc[1]:02x}{sc[2]:02x}"
    if fc and d.get("fill"):
        props["fc"] = f"#{fc[0]:02x}{fc[1]:02x}{fc[2]:02x}"

    geom = (
        {"type": "LineString", "coordinates": coords[0]}
        if len(coords) == 1
        else {"type": "MultiLineString", "coordinates": coords}
    )
    feat = {"type": "Feature", "properties": props, "geometry": geom}
    buckets[cat].append(feat)
    stats[cat]["n_features"] += 1
    stats[cat]["n_segments"] += n_seg

# === guardar ===
print("\n=== Guardando GeoJSONs ===")
total_bytes = 0
for cat, features in buckets.items():
    fc_doc = {
        "type": "FeatureCollection",
        "name": f"plano-{cat}",
        "metadata": {
            "source_pdf": "AQUA014-HID-PL-015_C1.pdf",
            "render_size_px": [RENDER_W, RENDER_H],
            "coord_system": "render-px (pixels of plano-base.png)",
            "extracted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "n_features": stats[cat]["n_features"],
            "n_segments": stats[cat]["n_segments"],
        },
        "features": features,
    }
    out_path = os.path.join(OUT_DIR, f"plano-{cat}.geojson")
    # Serializacion compacta para reducir bytes
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(fc_doc, f, ensure_ascii=False, separators=(",", ":"))
    sz = os.path.getsize(out_path)
    total_bytes += sz
    print(f"  plano-{cat}.geojson  {stats[cat]['n_features']:5d} features  "
          f"{stats[cat]['n_segments']:6d} segs  {sz/1024:7.1f} KB")

print(f"\nTotal: {sum(s['n_features'] for s in stats.values())} features  "
      f"{total_bytes/1024:.0f} KB")

# bbox global por categoria (en render-px) para diagnostico
print("\n=== bbox por categoria (render-px) ===")
for cat, features in buckets.items():
    xs, ys = [], []
    for f in features:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for poly in polys:
            for p in poly:
                xs.append(p[0])
                ys.append(p[1])
    if xs:
        print(f"  {cat:14s}: x [{min(xs):7.0f},{max(xs):7.0f}]  y [{min(ys):7.0f},{max(ys):7.0f}]")
    else:
        print(f"  {cat:14s}: (vacio)")

print(f"\nDescartes globales: layer={dropped_layer}  sin-categoria={dropped_category}  small={dropped_small}")
print(f"\nOutput dir: {OUT_DIR}")
