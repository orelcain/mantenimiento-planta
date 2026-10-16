# Recortes del catálogo mecánico de la GEA PowerPak 50520 (la de planta, serie 50520184) con la posición
# encerrada en rojo + barra negra, mismo estilo que gea_mech-50520 (15-10-2026).
# Por qué existe: ~190 repuestos GEA tenían el dibujo del catálogo de la 5550 (serie 50540108), que NO es la
# máquina de planta (placa vista el 16-10-2026). El generador original se perdió en un scratchpad.
# uso: python -I generar-recortes-gea-50520.py <objetivo.json> <catalogo mecanico 50520.pdf> <salida>
#   objetivo.json: {"objetivo":[{docId, code, nombre, filas:[{pagina, posicion, descripcion, conjunto}]}]}
# Luego: node aplicar-recortes-gea-50520.cjs <salida> [--dry-run]. REVISAR una muestra a ojo antes de cargar.
import fitz, json, os, sys
from PIL import Image, ImageDraw, ImageFont

OBJ, PDF, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
items = json.load(open(OBJ, encoding='utf8'))['objetivo']
doc = fitz.open(PDF)
ANCHO = 1800
B = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 46)
R = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 34)


def es_lista(pn):
    return doc[pn - 1].get_text().lstrip().startswith('Pos\nItem number')


def paginas_dibujo(lista):
    """El dibujo va antes de su(s) página(s) de lista, y a veces son VARIAS hojas seguidas (vistas de un
    mismo conjunto): todas las que no son lista hacia atrás, de la más cercana a la más lejana (máx. 8)."""
    p = lista
    while p > 1 and es_lista(p):
        p -= 1
    res = []
    while p >= 1 and not es_lista(p) and len(res) < 8:
        res.append(p)
        p -= 1
    return res


man, resumen = [], []
for it in items:
    hecho = False
    for f in it['filas']:
        dib, globos = None, []
        for q in paginas_dibujo(f['pagina']):
            globos = [fitz.Rect(w[:4]) for w in doc[q - 1].get_text('words') if w[4] == str(f['posicion'])]
            if globos:
                dib = q
                break
        if not dib:
            continue
        pg = doc[dib - 1]
        z = ANCHO / pg.rect.width
        pix = pg.get_pixmap(matrix=fitz.Matrix(z, z))
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        capa = Image.new('RGBA', im.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(capa)
        for g in globos:
            cx, cy = (g.x0 + g.x1) / 2 * z, (g.y0 + g.y1) / 2 * z
            rad = max(g.width, g.height) * z * 1.5 + 10
            d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(239, 68, 68, 60), outline=(200, 20, 20, 255), width=7)
        im = Image.alpha_composite(im.convert('RGBA'), capa).convert('RGB')
        desc = (f['descripcion'] or it['nombre']).upper()
        mas = len(it['filas']) - 1
        l1 = f"Pos. {f['posicion']} · {it['code']} · {desc}"
        l2 = f"GEA PowerPak 50520 · catálogo mecánico · pág. {dib} (lista pág. {f['pagina']})" + (f" · también en {mas} conjunto(s) más" if mas else '')
        w, h = im.size
        out = Image.new('RGB', (w, h + 150), (30, 30, 30))
        out.paste(im, (0, 0))
        dd = ImageDraw.Draw(out)
        dd.text((20, h + 18), l1, font=B, fill='white')
        dd.text((20, h + 86), l2, font=R, fill=(175, 175, 175))
        nombre = f"{it['docId']}_p{dib}.jpg"
        out.save(os.path.join(OUT, nombre), quality=82)
        g0 = globos[0]
        PR = pg.rect
        pad = 4
        x0, y0, x1, y1 = (g0.x0 - pad) / PR.width, (g0.y0 - pad) / PR.height, (g0.x1 + pad) / PR.width, (g0.y1 + pad) / PR.height
        man.append({
            'docId': it['docId'], 'pagina': dib, 'file': nombre, 'code': it['code'],
            'nombre': f"Pos. {f['posicion']} - {desc}",
            'descripcion': f"Referencia GEA PowerPak 50520 · catálogo mecánico pág. {dib} - pos. {f['posicion']} ({it['code']})",
            'puntos': [{'x': x0, 'y': y0}, {'x': x1, 'y': y0}, {'x': x1, 'y': y1}, {'x': x0, 'y': y1}],
        })
        resumen.append((it['docId'], dib, f['posicion'], len(globos)))
        hecho = True
        break
    if not hecho:
        resumen.append((it['docId'], None, None, 0))

json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
ok = [r for r in resumen if r[1]]
print('recortes', len(ok), 'de', len(items), '| sin globo hallado:', [r[0] for r in resumen if not r[1]][:20])
