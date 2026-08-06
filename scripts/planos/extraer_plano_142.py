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

    # --- pasada 1: indice global de aparatos (en que hoja.columna esta cada uno)
    cols_por_pagina, indice = {}, {}
    for i in range(doc.page_count):
        pg = doc[i]
        cab = pg.get_text("words", clip=fitz.Rect(0, 0, pg.rect.width, pg.rect.height * 0.05))
        cols_por_pagina[i] = {w[4]: round(w[0], 1) for w in cab if w[4] in "0123456789"}
        blatt = blatt_de_pagina(i, doc.page_count)
        for w in pg.get_text("words"):
            m = RE_TAG.match(w[4])
            if m and m.group(1) not in RUIDO:
                c = columna_de(w[0], cols_por_pagina[i])
                indice.setdefault(m.group(1), set()).add((blatt, c))
    indice = {k: sorted(v) for k, v in sorted(indice.items()) if len(v) > 1}

    # --- pasada 2: una hoja a la vez
    hojas, sin_traducir = [], collections.Counter()
    for i in range(doc.page_count):
        pg, blatt = doc[i], blatt_de_pagina(i, doc.page_count)
        with open(os.path.join(DEST, f"hoja-{blatt:02d}.svg"), "w", encoding="utf-8") as f:
            f.write(optimizar(pg.get_svg_image(text_as_path=True)))

        xrefs, tags = [], []
        for x0, y0, x1, y1, txt, *_ in pg.get_text("words"):
            caja = [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]
            m = RE_XREF.match(txt)
            if m:
                xrefs.append({"b": caja, "t": txt, "h": int(m.group(1)), "c": int(m.group(2))})
                continue
            m = RE_TAG.match(txt)
            if m and m.group(1) in indice:
                tags.append({"b": caja, "t": m.group(1)})

        terms = deduplicar(rotulos(pg, sin_traducir))
        with open(os.path.join(DEST, f"hoja-{blatt:02d}.json"), "w", encoding="utf-8") as f:
            json.dump({"xrefs": xrefs, "tags": tags, "terms": terms}, f, ensure_ascii=False)

        hojas.append({
            "blatt": blatt,
            "vb": [round(pg.rect.width, 2), round(pg.rect.height, 2)],
            "cols": cols_por_pagina[i],
            "seccion": "circuitos" if blatt < 24 else "bornes",
            **titulos(pg, terms),
            "n": {"x": len(xrefs), "t": len(tags), "d": len(terms)},
        })

    with open(os.path.join(DEST, "indice.json"), "w", encoding="utf-8") as f:
        json.dump({"plano": "142.71.00.888", "rev": "A1 · 23.08.2022",
                   "maquina": "BAADER 142", "hojasTotales": 45,
                   "faltante": [43], "hojas": hojas,
                   "indice": indice, "glosario": PALABRAS}, f, ensure_ascii=False)

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
