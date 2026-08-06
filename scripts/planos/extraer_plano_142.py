# -*- coding: utf-8 -*-
"""Extrae el plano electrico BAADER 142.71.00.888 a assets estaticos para la PWA.

El PDF es VECTORIAL (0 imagenes, ~58.000 trazos), asi que cada hoja se exporta a
SVG y encima se superpone una capa de zonas clicables construida con las cajas de
cada palabra. No hay OCR en ninguna parte de este pipeline.

Salida en apps/pwa/public/planos/<slug>/:
  indice.json    metadatos de todas las hojas + indice de aparatos + glosario
  hoja-NN.json   zonas clicables de esa hoja (saltos, aparatos, rotulos aleman)
  hoja-NN.svg    el dibujo (~400 KB en disco, ~41 KB servido con gzip)

Uso:  python scripts/planos/extraer_plano_142.py
"""
import fitz, re, json, os, sys, collections

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PDF = os.path.join(
    os.environ.get("ONEDRIVE", os.path.expanduser("~/OneDrive")),
    "ANTARFOOD", "⚙️ EQUIPOS PLANTA", "⚙️ BAADER 142",
    "INFO ALOJADA EN TELEGRAM BAADER 142", "DOCUMENTOS",
    "883_1427100888_001_A1_A3.pdf")
SLUG = "baader-142-888"
DEST = os.path.join(RAIZ, "apps", "pwa", "public", "planos", SLUG)

from glosario_142 import PALABRAS, FRASES, IGNORAR, COLORES  # noqa: E402

RE_COLOR = re.compile(r'^([A-Z]{2})-([A-Z]{2})$')

RE_XREF = re.compile(r"^/(\d{1,2})\.(\d)$")
RE_TAG = re.compile(r"^-?([A-Z]{1,3}\d{1,3})$")
# Destino suelto tras un "/" separado: el "20.1" de "Q7 / 20.1".
RE_DEST = re.compile(r"^(\d{1,2})\.(\d)$")
# A1/A2 son los bornes de bobina IEC: aparecen en cada contactor del plano y no
# designan un aparato. Sin esta lista negra el indice queda inservible.
RUIDO = {"A1", "A2"}


def blatt_de_pagina(i, total):
    """El PDF trae 44 paginas pero el plano numera 45 hojas: la 43 no esta."""
    return i + 1 if i < 42 else i + 2


def optimizar(svg):
    svg = re.sub(r"^<\?xml[^>]*\?>\s*", "", svg)
    svg = re.sub(r"(\d+\.\d{2})\d+", r"\1", svg)
    svg = re.sub(r">\s+<", "><", svg)
    return re.sub(r"<svg ", '<svg class="plano-svg" ', svg, count=1)


def main():
    if not os.path.exists(PDF):
        sys.exit(f"No encuentro el PDF:\n  {PDF}")
    doc = fitz.open(PDF)
    os.makedirs(DEST, exist_ok=True)

    # --- pasada 1: indice global de aparatos.
    # Cada aparicion lleva su CAJA ademas de hoja.columna: sin la caja, saltar a
    # un aparato solo podia iluminar la columna entera y el usuario terminaba
    # buscando el K7 a ojo dentro de ella.
    cols_por_pagina, indice = {}, {}
    for i in range(doc.page_count):
        pg = doc[i]
        cab = pg.get_text("words", clip=fitz.Rect(0, 0, pg.rect.width, pg.rect.height * 0.05))
        cols_por_pagina[i] = {w[4]: round(w[0], 1) for w in cab if w[4] in "0123456789"}
        blatt = blatt_de_pagina(i, doc.page_count)
        for x0, y0, x1, y1, txt, *_ in pg.get_text("words"):
            m = RE_TAG.match(txt)
            if m and m.group(1) not in RUIDO:
                c = columna_de(x0, cols_por_pagina[i])
                ap = indice.setdefault(m.group(1), {})
                # una aparicion por (hoja, columna): la primera manda
                ap.setdefault((blatt, c), [round(x0, 1), round(y0, 1),
                                           round(x1 - x0, 1), round(y1 - y0, 1)])
    # Antes se exigia >1 aparicion, pero un aparato que sale una sola vez
    # igual necesita ser clicable: es el ancla de sus notas y fotos.
    indice = {
        k: [{"h": h, "c": c, "b": b} for (h, c), b in sorted(v.items())]
        for k, v in sorted(indice.items())
    }

    # --- pasada 1.5: indice de bornes del Klemmenplan (hojas 24+).
    # Cada borne es una COLUMNA vertical: su numero en una franja girada y el
    # nombre de la regla (X5, X9...) en otra mas abajo, alineados en x. Esto
    # permite que tocar "X5 97" en el esquema salte a la fila de cableado.
    bornes = {}
    for i in range(doc.page_count):
        blatt = blatt_de_pagina(i, doc.page_count)
        if blatt < 24:
            continue
        columnas = []          # (x_centro, y_top, texto, caja)
        for blk in doc[i].get_text("dict")["blocks"]:
            for ln in blk.get("lines", []):
                if tuple(round(v) for v in ln.get("dir", (1, 0))) != (0, -1):
                    continue
                t = "".join(sp["text"] for sp in ln["spans"]).strip()
                x0, y0, x1, y1 = ln["bbox"]
                columnas.append(((x0 + x1) / 2, y0, t,
                                 [round(x0, 1), round(y0, 1),
                                  round(x1 - x0, 1), round(y1 - y0, 1)]))
        reglas = [c for c in columnas if re.match(r"^-?X\d{1,2}$", c[2])]
        numeros = [c for c in columnas if re.match(r"^\d{1,3}$", c[2])]
        for cx, cy, texto, _ in reglas:
            regla = texto.lstrip("-")
            # el numero del borne: misma columna (x), en la franja de arriba
            cand = [n for n in numeros if abs(n[0] - cx) < 3 and n[1] < cy]
            if not cand:
                continue
            num = max(cand, key=lambda n: n[1])          # el mas cercano por arriba
            bornes.setdefault(f"{regla}:{num[2]}", {"h": blatt, "b": num[3]})
    print(f"    bornes indexados en el Klemmenplan: {len(bornes)}")

    # --- pasada 2: una hoja a la vez
    hojas, sin_traducir, busqueda = [], collections.Counter(), []
    for i in range(doc.page_count):
        pg, blatt = doc[i], blatt_de_pagina(i, doc.page_count)
        with open(os.path.join(DEST, f"hoja-{blatt:02d}.svg"), "w", encoding="utf-8") as f:
            f.write(optimizar(pg.get_svg_image(text_as_path=True)))

        palabras = pg.get_text("words")
        xrefs, tags, brs, consumido = [], [], [], set()
        for j, (x0, y0, x1, y1, txt, *_) in enumerate(palabras):
            if j in consumido:
                continue
            caja = [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]
            m = RE_XREF.match(txt)
            if m:
                xrefs.append({"b": caja, "t": txt, "h": int(m.group(1)), "c": int(m.group(2))})
                continue
            # El plano escribe la referencia de DOS formas. Pegada ("/8.5") y
            # separada colgando de un aparato ("Q7 / 20.1", "X5.97 / 15.7"),
            # que el tokenizador parte en "/" y "20.1". La segunda forma es el
            # 11% de las referencias del plano y es la mas util para seguir un
            # circuito, asi que hay que unir los dos tokens.
            if txt == "/" and j + 1 < len(palabras):
                sx0, sy0, sx1, sy1, stxt, *_ = palabras[j + 1]
                m = RE_DEST.match(stxt)
                if m:
                    consumido.add(j + 1)
                    xrefs.append({
                        "b": [round(min(x0, sx0), 1), round(min(y0, sy0), 1),
                              round(max(x1, sx1) - min(x0, sx0), 1),
                              round(max(y1, sy1) - min(y0, sy0), 1)],
                        "t": "/" + stxt, "h": int(m.group(1)), "c": int(m.group(2))})
                    continue
            # Referencia a borne en el esquema, dos formas:
            #   token unico "X5:97" / "X5.62", o par "X5" + "97" (el numero va
            #   ~9,6 pt a la derecha del tag, misma linea — medido en hoja 4).
            # Si el borne existe en el Klemmenplan, la zona salta a su columna.
            if blatt < 24:
                mb = re.match(r"^(X\d{1,2})[:.](\d{1,3})$", txt)
                par = None
                if not mb and re.match(r"^X\d{1,2}$", txt):
                    for k in range(max(0, j - 3), min(len(palabras), j + 4)):
                        if k == j or k in consumido:
                            continue
                        nx0, ny0, nx1, ny1, ntxt, *_ = palabras[k]
                        if re.match(r"^\d{1,3}$", ntxt) and abs(ny0 - y0) < 4 and 3 < nx0 - x1 < 30:
                            par = (k, ntxt, [round(min(x0, nx0), 1), round(min(y0, ny0), 1),
                                             round(max(x1, nx1) - min(x0, nx0), 1),
                                             round(max(y1, ny1) - min(y0, ny0), 1)])
                            break
                clave = f"{mb.group(1)}:{mb.group(2)}" if mb else (f"{txt}:{par[1]}" if par else None)
                if clave and clave in bornes:
                    destino = bornes[clave]
                    zona = caja if mb else par[2]
                    if par:
                        consumido.add(par[0])
                    brs.append({"b": zona, "t": clave, "h": destino["h"], "tb": destino["b"]})
                    continue
            m = RE_TAG.match(txt)
            if m and m.group(1) in indice:
                tags.append({"b": caja, "t": m.group(1)})

        terms = deduplicar(rotulos(pg, sin_traducir))
        with open(os.path.join(DEST, f"hoja-{blatt:02d}.json"), "w", encoding="utf-8") as f:
            json.dump({"xrefs": xrefs, "tags": tags, "terms": terms, "bornes": brs}, f, ensure_ascii=False)

        # Indice de busqueda global de rotulos: sin el, el buscador solo podia
        # adivinar la hoja por el titulo y no llevaba al punto exacto.
        vistos_busq = set()
        for t in terms:
            if t.get("dup"):
                continue
            k = (t["de"], blatt)
            if k in vistos_busq:
                continue
            vistos_busq.add(k)
            busqueda.append({"de": t["de"], "es": t["es"], "h": blatt, "b": t["b"]})

        hojas.append({
            "blatt": blatt,
            "vb": [round(pg.rect.width, 2), round(pg.rect.height, 2)],
            "cols": cols_por_pagina[i],
            "seccion": "circuitos" if blatt < 24 else "bornes",
            **titulos(pg, terms),
            "n": {"x": len(xrefs), "t": len(tags), "d": len(terms), "b": len(brs)},
        })

    with open(os.path.join(DEST, "indice.json"), "w", encoding="utf-8") as f:
        json.dump({"plano": "142.71.00.888", "rev": "A1 · 23.08.2022",
                   "maquina": "BAADER 142", "hojasTotales": 45,
                   "faltante": [43], "hojas": hojas, "indice": indice,
                   "busqueda": busqueda, "glosario": PALABRAS}, f, ensure_ascii=False)

    resumen(DEST, hojas, indice, sin_traducir)


def columna_de(x, cols):
    if not cols:
        return 0
    return int(min(cols, key=lambda c: abs(cols[c] - x)))


def rotulos(pg, sin_traducir):
    """Rotulos alemanes traducidos POR LINEA del dibujo.

    Palabra por palabra no sirve: el castellano es mas largo y las cajas se
    pisan. Y hay que conservar el giro: los rotulos de funcion del encabezado
    estan a 90 grados, estamparlos horizontales los cruza sobre el esquema.
    """
    out = []
    for blk in pg.get_text("dict")["blocks"]:
        for ln in blk.get("lines", []):
            d = tuple(round(v) for v in ln.get("dir", (1, 0)))
            rot = 0 if d == (1, 0) else 90 if d == (0, -1) else None
            if rot is None:
                continue
            pals = "".join(sp["text"] for sp in ln["spans"]).strip().split()
            if not pals:
                continue
            frase = " ".join(pals)
            m = RE_COLOR.match(frase)
            if m and m.group(1) in COLORES and m.group(2) in COLORES:
                es = f"{COLORES[m.group(1)]}-{COLORES[m.group(2)]}"
            else:
                es = FRASES.get(frase)
            if es is None:
                if not any(p.strip(".,:;()") in PALABRAS for p in pals):
                    for p in pals:
                        if re.match(r"^[A-Za-zÀ-ÿ\-]{4,}$", p) and p not in IGNORAR:
                            sin_traducir[p] += 1
                    continue
                # Umbral: una frase a medio traducir ("Die Maquina muss...")
                # confunde mas que dejarla en su idioma. O se traduce entera o
                # no se toca; lo que quede fuera aparece en el reporte final.
                hechas = sum(1 for p in pals if p.strip(".,:;()") in PALABRAS)
                if hechas / len(pals) < 0.6:
                    for p in pals:
                        if re.match(r"^[A-Za-zÀ-ÿ\-]{4,}$", p) and p not in IGNORAR                                 and p.strip(".,:;()") not in PALABRAS:
                            sin_traducir[p] += 1
                    continue
                es = " ".join(PALABRAS.get(p.strip(".,:;()"), p) for p in pals)
            if es.lower() == frase.lower():
                continue
            x0, y0, x1, y1 = ln["bbox"]
            out.append({"b": [round(x0, 1), round(y0, 1),
                              round(x1 - x0, 1), round(y1 - y0, 1)],
                        "de": frase, "es": es, "r": rot})
    return out


def deduplicar(terms):
    """El plano apila cada rotulo de tabla en aleman, ingles y frances. Al
    traducir los tres sale la misma palabra castellana repetida. Se conserva el
    de mas arriba y los de abajo quedan marcados para taparse SIN texto, con lo
    que la tabla queda limpia y en un solo idioma."""
    orden = sorted([t for t in terms if t["r"] == 0],
                   key=lambda t: (round(t["b"][0]), t["b"][1]))
    for i, t in enumerate(orden):
        for prev in orden[:i]:
            if prev.get("dup") or prev["es"].lower() != t["es"].lower():
                continue
            if abs(prev["b"][0] - t["b"][0]) < 6 and 0 < t["b"][1] - prev["b"][1] < 16:
                t["dup"] = 1
                break
    return terms


def titulos(pg, terms):
    """Titulo de la hoja para el indice lateral.

    Se compone de los rotulos de funcion del encabezado, que son los GIRADOS,
    y se reusa su traduccion ya resuelta. Antes se traducia aparte palabra por
    palabra y salian titulos a medias ("Not- Desconectado").
    """
    alto = pg.rect.height * 0.16
    # No solo los girados: hay hojas que rotulan su funcion en horizontal.
    cab = sorted([t for t in terms if t["b"][1] < alto and not t.get("dup")],
                 key=lambda t: t["b"][0])
    de = " · ".join(dict.fromkeys(t["de"] for t in cab))[:70]
    es = " · ".join(dict.fromkeys(t["es"] for t in cab))[:70]
    return {"titulo": de or "Continuacion del esquema",
            "tituloEs": es or "Continuacion del esquema"}


def resumen(dest, hojas, indice, sin_traducir):
    peso = sum(os.path.getsize(os.path.join(dest, f)) for f in os.listdir(dest))
    trad = sum(h["n"]["d"] for h in hojas)
    print(f"OK  {len(hojas)} hojas -> {dest}")
    print(f"    {peso/1024/1024:.1f} MB en disco")
    print(f"    {sum(h['n']['x'] for h in hojas)} saltos entre hojas")
    print(f"    {len(indice)} aparatos en el indice")
    print(f"    {trad} rotulos traducidos")
    if sin_traducir:
        print(f"\n    {len(sin_traducir)} terminos alemanes AUN SIN traducir "
              f"(los 25 mas frecuentes):")
        for t, n in sin_traducir.most_common(25):
            print(f"      {n:4d}  {t}")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main()
