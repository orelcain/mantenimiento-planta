"""Inspeccion rapida de los GeoJSONs del recinto para decidir estrategia."""
import os, json, glob
from collections import defaultdict

GEO_DIR = r"C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\_geojson_test"

def bbox_of_coords(coords, bbox):
    if isinstance(coords, list):
        if len(coords) > 0 and isinstance(coords[0], (int, float)):
            x, y = coords[0], coords[1]
            bbox[0] = min(bbox[0], x); bbox[1] = min(bbox[1], y)
            bbox[2] = max(bbox[2], x); bbox[3] = max(bbox[3], y)
        else:
            for c in coords:
                bbox_of_coords(c, bbox)

print(f"{'Capa':<22} {'Features':>8} {'Geometry':>12} {'Size MB':>8}  bbox (xmin,ymin,xmax,ymax)")
print("-"*120)

total_bbox = [float('inf'), float('inf'), float('-inf'), float('-inf')]
for path in sorted(glob.glob(os.path.join(GEO_DIR, "*.geojson"))):
    name = os.path.basename(path).replace(".geojson", "")
    size_mb = os.path.getsize(path) / 1024 / 1024
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    feats = data.get("features", [])
    n = len(feats)
    geom_types = defaultdict(int)
    bbox = [float('inf'), float('inf'), float('-inf'), float('-inf')]
    for ft in feats:
        g = ft.get("geometry")
        if g:
            geom_types[g["type"]] += 1
            bbox_of_coords(g.get("coordinates", []), bbox)
    geom_str = ",".join(f"{k}:{v}" for k,v in geom_types.items())
    if n > 0:
        print(f"{name:<22} {n:>8} {geom_str:>30}  {size_mb:>5.2f}  ({bbox[0]:.1f},{bbox[1]:.1f},{bbox[2]:.1f},{bbox[3]:.1f})")
        for i in range(4):
            total_bbox[i] = min(total_bbox[i], bbox[i]) if i<2 else max(total_bbox[i], bbox[i])
print("-"*120)
print(f"BBOX TOTAL: x [{total_bbox[0]:.1f}, {total_bbox[2]:.1f}] ({total_bbox[2]-total_bbox[0]:.1f} unid) | y [{total_bbox[1]:.1f}, {total_bbox[3]:.1f}] ({total_bbox[3]-total_bbox[1]:.1f} unid)")
