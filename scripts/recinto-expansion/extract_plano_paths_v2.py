"""Analisis fino del PDF: categorizar paths por color, capa y simplificacion estimada."""
import fitz
import json
import os
from collections import defaultdict

PDF = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\PLANOS AGUAS\AQUA014-HID-PL-015_C1.pdf"

doc = fitz.open(PDF)
page = doc[0]
drawings = page.get_drawings()

# Categorizar por (layer, stroke_color, is_text-ish)
# Un path es "text-ish" si tiene muchos sub-paths chicos y bbox chico (heuristica)

def color_str(c):
    if not c: return 'none'
    if isinstance(c, (tuple, list)):
        return f"rgb({int(c[0]*255):3d},{int(c[1]*255):3d},{int(c[2]*255):3d})"
    return str(c)

def path_size(d):
    """Tamaño aprox del path (diagonal del bbox)."""
    r = d.get('rect')
    if not r: return 0
    return ((r.x1-r.x0)**2 + (r.y1-r.y0)**2)**0.5

def path_segments(d):
    return sum(len(it) for it in d.get('items', []))

# Agrupar por (layer, color)
groups = defaultdict(lambda: {'paths': [], 'segments': 0, 'total_size': 0, 'bbox': [9e9, 9e9, -9e9, -9e9]})
for d in drawings:
    layer = (d.get('layer') or '<none>').strip()
    color = color_str(d.get('color'))
    fill = color_str(d.get('fill'))
    key = (layer, color, fill)
    g = groups[key]
    g['paths'].append(d)
    g['segments'] += path_segments(d)
    g['total_size'] += path_size(d)
    r = d.get('rect')
    if r:
        g['bbox'][0] = min(g['bbox'][0], r.x0)
        g['bbox'][1] = min(g['bbox'][1], r.y0)
        g['bbox'][2] = max(g['bbox'][2], r.x1)
        g['bbox'][3] = max(g['bbox'][3], r.y1)

# Imprimir top 30 grupos
print(f"{'Layer':30s} {'Stroke':16s} {'Fill':16s} {'Paths':>6s} {'Segs':>7s} {'AvgSize':>8s}")
print("-"*100)
sorted_groups = sorted(groups.items(), key=lambda x: -len(x[1]['paths']))
for (lyr, sc, fc), g in sorted_groups[:30]:
    avg_size = g['total_size']/len(g['paths']) if g['paths'] else 0
    n = len(g['paths'])
    print(f"{lyr[:30]:30s} {sc[:16]:16s} {fc[:16]:16s} {n:6d} {g['segments']:7d} {avg_size:8.2f}")

print(f"\nTotal grupos distintos: {len(groups)}")

# Heuristicas de descarte: paths chicos en avgSize < 5pt suelen ser texto/cotas
# Filtrar y estimar reduccion
print("\n=== Escenarios de filtrado ===")

# Escenario A: descartar capas obvias de "formato/texto"
DISCARD_LAYERS = {'M-Formato', 'G-FORMATO', 'AR-TEXTO', 'M-TEXTO', 'PDF_TEXTO 2', 'DEFPOINT', '<none>', '0_Planta', 'SLD-0'}
remaining_A = [d for d in drawings if (d.get('layer') or '<none>').strip() not in DISCARD_LAYERS]
print(f"A) Sin capas formato/texto: {len(remaining_A)} paths ({len(remaining_A)/len(drawings)*100:.0f}%)")

# Escenario B: A + descartar paths con bbox diagonal < 5pt (cotas y simbolos chicos)
remaining_B = [d for d in remaining_A if path_size(d) >= 5]
print(f"B) A + sin paths chicos (<5pt diag): {len(remaining_B)} paths")

# Escenario C: B + simplificar paths con muchos segments (curvas decimal-able)
total_segs_C = sum(min(path_segments(d), 20) for d in remaining_B)
print(f"C) B + cap segments a 20 por path: ~{total_segs_C} segments totales")

# Escenario D: solo capas hidraulicas y arquitectura visible
KEEP_LAYERS = {'PDF_MURO', 'PDF_LINEAS', 'PDF_EDIFICACION', 'PDF_CERCO METALICO', 'PDF_SOLERA VIA',
               'HID-ADUCCI N AGUA DULCE', 'HID-DISTRIBUCI N AGUA DULCE',
               'EQP-Equipos - Situacion Proyectada (Trabajo3)$0$Visible (ANSI)',
               '0'}  # 0 es la mayoria del dibujo
remaining_D = [d for d in drawings if any(k in (d.get('layer') or '') for k in ['PDF_', 'HID-', 'EQP-'])]
remaining_D2 = [d for d in drawings if (d.get('layer') or '').strip() == '0' and path_size(d) >= 10]
print(f"D) Solo capas tematicas (PDF_/HID-/EQP-): {len(remaining_D)} paths")
print(f"D+) Capa '0' filtrada por tamano>=10pt: {len(remaining_D2)} paths")
print(f"D+D+) Total: {len(remaining_D)+len(remaining_D2)} paths")

# Tamano estimado SVG si guardo escenario D+
def estimate_svg_size(paths):
    """Estimar bytes promedio: ~30 bytes header + 8 bytes/segment"""
    total_segs = sum(path_segments(p) for p in paths)
    return len(paths)*30 + total_segs*8

for name, paths in [('A', remaining_A), ('B', remaining_B), ('D total', remaining_D+remaining_D2)]:
    bytes_est = estimate_svg_size(paths)
    print(f"  Escenario {name}: {len(paths):5d} paths -> SVG ~{bytes_est/1024:.0f} KB")

print("\n=== Recomendacion ===")
if len(remaining_B) < 15000:
    print(f"VIABLE: filtrado B deja ~{len(remaining_B)} paths, manejable en DOM con lazy load.")
elif len(remaining_D)+len(remaining_D2) < 15000:
    print(f"VIABLE: filtrado D+ deja {len(remaining_D)+len(remaining_D2)} paths.")
else:
    print("Necesita simplificacion + agrupamiento adicional.")
