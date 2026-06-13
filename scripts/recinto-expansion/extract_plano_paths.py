"""Extrae paths vectoriales del PDF del plano-base por capa OCG.

Output: stats por capa (count, bbox, sample paths) + estimacion de viabilidad
para integrar como SVG en el embed.

Usa pymupdf (fitz) que mantiene OCG layer info en sus drawings.
"""
import fitz
import json
import os
from collections import defaultdict

PDF = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\PLANOS AGUAS\AQUA014-HID-PL-015_C1.pdf"
OUT_DIR = r"D:\a\APP leventamiento de insidencias en planta\scripts\recinto-expansion\plano_extract"

os.makedirs(OUT_DIR, exist_ok=True)

doc = fitz.open(PDF)
print(f"Pages: {len(doc)}")
page = doc[0]
print(f"Page size: {page.rect.width:.1f} x {page.rect.height:.1f} pt")

# OCG layers
ocg = doc.layer_ui_configs()
print(f"\n=== {len(ocg)} OCG (capas opcionales) ===")
for i, layer in enumerate(ocg):
    print(f"  [{i:2}] {layer.get('text', '?'):30s}  on={layer.get('on', False)}  locked={layer.get('locked', False)}")

# Drawings: get all paths in the page
print("\n=== Extrayendo drawings... ===")
drawings = page.get_drawings()
print(f"Total drawings: {len(drawings)}")

# Drawings tienen: 'items' (list of segments), 'fill', 'color' (stroke), 'width', 'rect' (bbox)
# Y a veces 'layer' (OCG name) si esta asignado

# Stats por color + tipo
by_layer = defaultdict(list)
by_stroke_color = defaultdict(int)
by_fill_color = defaultdict(int)
total_segments = 0
for d in drawings:
    layer = d.get('layer', '<none>') or '<none>'
    by_layer[layer].append(d)
    sc = str(d.get('color')) if d.get('color') else 'none'
    fc = str(d.get('fill')) if d.get('fill') else 'none'
    by_stroke_color[sc] += 1
    by_fill_color[fc] += 1
    total_segments += sum(len(it) for it in d.get('items', []))

print(f"\nTotal segments (suma items): {total_segments}")
print(f"\n=== Paths agrupados por capa OCG ===")
for layer, paths in sorted(by_layer.items(), key=lambda x: -len(x[1])):
    # bbox total
    xs, ys = [], []
    for p in paths:
        r = p.get('rect')
        if r:
            xs += [r.x0, r.x1]; ys += [r.y0, r.y1]
    bbox = (min(xs) if xs else 0, min(ys) if ys else 0, max(xs) if xs else 0, max(ys) if ys else 0) if xs else None
    print(f"  {layer:30s}  {len(paths):5d} paths  bbox={bbox}")

# Estimar tamano del SVG/GeoJSON resultante
print(f"\n=== Estimacion ===")
print(f"Si convertimos cada path a SVG: ~{total_segments * 25 / 1024:.0f} KB de string")
print(f"Si lo agrupamos por capa y comprimimos: ~{total_segments * 12 / 1024:.0f} KB")

# Guardar resumen como JSON
summary = {
    'pdf': PDF,
    'page_size_pt': [page.rect.width, page.rect.height],
    'n_drawings': len(drawings),
    'n_segments': total_segments,
    'ocg_layers': [{'name': l.get('text'), 'on': l.get('on')} for l in ocg],
    'by_layer_counts': {k: len(v) for k, v in by_layer.items()},
}
with open(os.path.join(OUT_DIR, 'extract_summary.json'), 'w') as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)

print(f"\nResumen guardado: {OUT_DIR}/extract_summary.json")
