# -*- coding: utf-8 -*-
"""Extractor del PLANO DE PARTES (despiece) BAADER 142.

Fuente de dibujos: 835_142-Piezas de Recambio Baader vieja-2006-10.pdf
  (644 pags: ~307 dibujos vectoriales explosionados + ~337 tablas con texto).
Fuente de tablas ES: apps/pwa/public/data/codigos-fabricante/baader-142.json
  (catalogo 2014 ya extraido; posiciones coinciden con el 2006 — verificado
  conjunto 1420400000 pos 1 = 1420400021 en ambos).

Fases (subcomando en argv[1]):
  inventario  -> clasifica paginas, detecta conjunto/seccion/titulo por dibujo,
                 escribe _staging/baader-142-despiece/inventario.json
  (proximas: svg, ocr, indice)
"""
import io
import json
import os
import re
import sys

import fitz

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.abspath(__file__))
STAGING = os.path.join(RAIZ, "_staging", "baader-142-despiece")
TRABAJO = STAGING + "-trabajo"
PDF_835 = os.path.join(
    os.environ.get("ONEDRIVE", os.path.expanduser("~/OneDrive")),
    "ANTARFOOD", "⚙️ EQUIPOS PLANTA", "⚙️ BAADER 142",
    "INFO ALOJADA EN TELEGRAM BAADER 142", "DOCUMENTOS",
    "835_142-Piezas de Recambio Baader vieja-2006-10.pdf",
)

RE_CONJUNTO = re.compile(r"\b(\d{10})\b")
RE_SECCION = re.compile(r"\b(\d+(?:-\d+)+)\b")
RE_POS_FILA = re.compile(r"^\s*(\d+(?:-\d+)?)\s+\S")


def clasificar(doc):
    """Devuelve lista de dicts por pagina: tipo dibujo/tabla + metadatos."""
    paginas = []
    for i, page in enumerate(doc):
        texto = page.get_text()
        chars = len(texto.strip())
        ndraw = len(page.get_drawings()) if chars < 40 else -1  # caro: solo si candidata a dibujo
        info = {"pag": i + 1, "chars": chars}
        if chars < 40:
            info["tipo"] = "dibujo" if ndraw > 30 else "vacia"
            info["paths"] = ndraw
        else:
            info["tipo"] = "tabla"
            lineas = [l.strip() for l in texto.splitlines() if l.strip()]
            info["conjuntos"] = list(dict.fromkeys(RE_CONJUNTO.findall(texto)))
            # cabecera: primeras lineas con codigo de 10 digitos + seccion
            cab = None
            for l in lineas[:12]:
                m = RE_CONJUNTO.search(l)
                if m:
                    sec = RE_SECCION.search(l)
                    cab = {"conjunto": m.group(1), "linea": l[:120]}
                    if sec:
                        cab["seccion"] = sec.group(1)
                    break
            info["cabecera"] = cab
            info["posiciones"] = [m.group(1) for l in lineas if (m := RE_POS_FILA.match(l))][:400]
        paginas.append(info)
    return paginas


def asignar_dibujos(paginas):
    """Cada dibujo hereda el conjunto de la TABLA que lo sigue (patron del 835).

    Si entre el dibujo y la proxima tabla hay mas dibujos, todos apuntan a esa
    tabla (figuras multi-hoja). Se registra tambien la tabla previa por si el
    patron real fuese tabla->dibujo; la fase de validacion decide.
    """
    tablas = [p for p in paginas if p["tipo"] == "tabla"]
    for p in paginas:
        if p["tipo"] != "dibujo":
            continue
        sig = next((t for t in tablas if t["pag"] > p["pag"]), None)
        ant = next((t for t in reversed(tablas) if t["pag"] < p["pag"]), None)
        p["tabla_sig"] = sig["pag"] if sig else None
        p["conj_sig"] = (sig.get("cabecera") or {}).get("conjunto") if sig else None
        p["tabla_ant"] = ant["pag"] if ant else None
        p["conj_ant"] = (ant.get("cabecera") or {}).get("conjunto") if ant else None
    return paginas


def inventario():
    doc = fitz.open(PDF_835)
    print(f"PDF: {doc.page_count} paginas")
    paginas = asignar_dibujos(clasificar(doc))
    os.makedirs(TRABAJO, exist_ok=True)
    ruta = os.path.join(TRABAJO, "inventario.json")
    with io.open(ruta, "w", encoding="utf-8") as f:
        json.dump(paginas, f, ensure_ascii=False, indent=1)
    dib = [p for p in paginas if p["tipo"] == "dibujo"]
    tab = [p for p in paginas if p["tipo"] == "tabla"]
    vac = [p for p in paginas if p["tipo"] == "vacia"]
    con_cab = [t for t in tab if t.get("cabecera")]
    print(f"dibujos={len(dib)} tablas={len(tab)} vacias={len(vac)}")
    print(f"tablas con cabecera de conjunto: {len(con_cab)}/{len(tab)}")
    sin_conj = [p["pag"] for p in dib if not p["conj_sig"]]
    print(f"dibujos sin conjunto siguiente: {len(sin_conj)} -> {sin_conj[:20]}")
    # muestra de los primeros 12 emparejamientos para validar el patron a ojo
    for p in dib[:12]:
        print(f"  dib pag {p['pag']:3d} paths={p['paths']:5d} -> tabla sig {p['tabla_sig']} ({p['conj_sig']}) / ant {p['tabla_ant']} ({p['conj_ant']})")
    return paginas


RE_CONJ_PUNTOS = re.compile(r"\b(\d{3}\.\d{2}\.\d{2}\.\d{3})\b")
RE_SECCION_SOLA = re.compile(r"^\d+(?:-\d+)+$|^00$")
RE_FILA_DE = re.compile(
    r"^([A-Z]?\d+(?:-\d+)*)\s+(\S.*?)[\s.]*(?:\.\s*)*(Fig\.\s*[\d-]+|\d{6,10})?\s*$"
)
RE_FR = re.compile(r"[éèêàçûôî]|\bpour\b|\bavec\b|Détecteur|Plaque|D['’]|\bde manoeuvre\b")
RE_ES = re.compile(r"ción|ñ|á|í|ó|ú|\bpor\b|\bpara\b|\bde\b.*\b(mando|recambio|proximidad)\b|Placa|Sensores|entrada|salida|paso|inductivo|Tornillo|Anillo|Interruptor|Caja")


def _agrupar_trads(lineas_trad):
    """Separa las lineas EN/FR/ES (orden fijo del catalogo) por idioma."""
    if not lineas_trad:
        return {}
    # limite EN->FR: primera linea con señal francesa; FR->ES: primera con señal
    # castellana DESPUES de esa. Las continuaciones "(...)" heredan el grupo.
    i_fr = next((i for i, l in enumerate(lineas_trad) if RE_FR.search(l)), None)
    i_es = None
    desde = (i_fr + 1) if i_fr is not None else 1
    for i in range(desde, len(lineas_trad)):
        if RE_ES.search(lineas_trad[i]) and not RE_FR.search(lineas_trad[i]):
            i_es = i
            break
    if i_es is None and lineas_trad:
        i_es = len(lineas_trad) - 1          # ultima linea = ES (orden fijo)
    en = " ".join(lineas_trad[: i_fr if i_fr is not None else i_es])
    fr = " ".join(lineas_trad[i_fr:i_es]) if i_fr is not None else ""
    es = " ".join(lineas_trad[i_es:])
    out = {}
    if en:
        out["en"] = en
    if fr:
        out["fr"] = fr
    if es:
        out["es"] = es
    return out
RE_LEYENDA = re.compile(r"^(\d+)-\.\.\.\s*=\s*(\d{3}\.\d{2}\.\d{2}\.\d{3})")
RE_CODIGO_FIN = re.compile(r"(Fig\.\s*[\d-]+|\b\d{6,10})\s*$")


def _cabecera_tabla(lineas):
    """conjunto, seccion y titulos [de, fr, en, es] de una pagina de tabla."""
    conjunto = seccion = None
    titulos = []
    for l in lineas[:6]:
        m = re.match(r"^(\d{10})\b", l) or RE_CONJ_PUNTOS.match(l)
        if m:
            conjunto = m.group(1).replace(".", "")
            break
    for j, l in enumerate(lineas[:40]):
        if seccion is None and RE_SECCION_SOLA.match(l):
            seccion = l
        if l == "142" and not titulos:
            cand = []
            for k in range(j + 1, min(j + 7, len(lineas))):
                if lineas[k].startswith("Pos.") or RE_SECCION_SOLA.match(lineas[k]):
                    break
                cand.append(lineas[k])
            if len(cand) >= 3:
                titulos = cand[:4]
    return conjunto, seccion, titulos


def _parsear_filas(lineas):
    """Filas cuatrilingues: linea DE con pos+codigo, luego EN/FR/ES."""
    filas, leyenda, i = [], {}, 0
    # saltar el bloque de cabeceras de columna (hasta el ultimo 'No. article')
    ini = 0
    for j, l in enumerate(lineas[:60]):
        if l in ("No. article", "Part No", "Designación"):
            ini = j + 1
    while ini < len(lineas) and not RE_FILA_DE.match(lineas[ini]):
        m = RE_LEYENDA.match(lineas[ini])
        if m:
            leyenda[m.group(1)] = m.group(2).replace(".", "")
        ini += 1
    i = ini
    while i < len(lineas):
        l = lineas[i]
        m = RE_LEYENDA.match(l)
        if m:
            leyenda[m.group(1)] = m.group(2).replace(".", "")
            i += 1
            continue
        m = RE_FILA_DE.match(l)
        if not m or not RE_CODIGO_FIN.search(l):
            i += 1
            continue
        pos, nombre_de, ref = m.group(1), m.group(2).strip(" ."), m.group(3)
        grupo = []
        j = i + 1
        while j < len(lineas) and len(grupo) < 12:
            nl = lineas[j]
            if (RE_FILA_DE.match(nl) and RE_CODIGO_FIN.search(nl)) or RE_LEYENDA.match(nl) or RE_SECCION_SOLA.match(nl):
                break
            grupo.append(nl.strip(" ."))
            j += 1
        # continuaciones alemanas de la propia fila: "(für Schrittmotor SM1)"
        while grupo and grupo[0].startswith("(") and re.search(r"\bfür\b|\bzum\b|\bmit\b|\bohne\b", grupo[0]):
            nombre_de += " " + grupo.pop(0)
        fila = {"pos": pos, "de": nombre_de}
        fila.update(_agrupar_trads(grupo))
        if ref:
            if ref.startswith("Fig"):
                fila["fig"] = ref.replace("Fig.", "").strip()
            else:
                fila["nr"] = ref
        filas.append(fila)
        i = j
    return filas, leyenda


def tablas():
    doc = fitz.open(PDF_835)
    inv = json.load(io.open(os.path.join(TRABAJO, "inventario.json"), encoding="utf-8"))

    # bloques: dibujos consecutivos + las tablas que los siguen (hasta el
    # proximo dibujo). El preambulo (tablas sin dibujo previo: indice) aparte.
    bloques, actual, preambulo = [], None, []
    for p in inv:
        if p["tipo"] == "vacia":
            continue
        if p["tipo"] == "dibujo":
            if actual and actual["tablas"]:
                bloques.append(actual)
                actual = None
            if actual is None:
                actual = {"dibujos": [], "tablas": []}
            actual["dibujos"].append(p["pag"])
        else:
            if actual is None:
                preambulo.append(p["pag"])
            else:
                actual["tablas"].append(p["pag"])
    if actual:
        bloques.append(actual)

    figuras = []
    pags_indice = []
    for b in bloques:
        conjunto = seccion = None
        titulos, filas, leyenda = [], [], {}
        for pag in list(b["tablas"]):
            if "Inhaltsverzeichnis" in doc[pag - 1].get_text() or pag - 1 in pags_indice:
                # el indice del catalogo ocupa varias paginas seguidas
                pags_indice.append(pag)
                b["tablas"].remove(pag)
                continue
            lineas = [l.strip() for l in doc[pag - 1].get_text().splitlines() if l.strip()]
            c, s, t = _cabecera_tabla(lineas)
            conjunto = conjunto or c
            seccion = seccion or s
            titulos = titulos or t
            fs, ly = _parsear_filas(lineas)
            filas.extend(fs)
            leyenda.update(ly)
        fig = {
            "seccion": seccion,
            "conjunto": conjunto,
            "dibujos": b["dibujos"],
            "tablas": b["tablas"],
            "titulos": titulos,
            "filas": filas,
        }
        if leyenda:
            fig["leyenda"] = leyenda
        figuras.append(fig)

    # indice del catalogo: nombre cuatrilingue -> Fig
    indice_figs = []
    for pag in preambulo + pags_indice:
        lineas = [l.strip() for l in doc[pag - 1].get_text().splitlines() if l.strip()]
        for j, l in enumerate(lineas):
            m = re.match(r"^(.*?)[\s.]*(?:\.\s*)+Fig\.\s*([\d-]+|00)\s*$", l)
            if m:
                trads = []
                k = j + 1
                while k < len(lineas) and len(trads) < 3 and not re.search(r"Fig\.\s*[\d-]+\s*$", lineas[k]) and "." not in lineas[k][-4:]:
                    trads.append(lineas[k])
                    k += 1
                indice_figs.append({"de": m.group(1).strip(" ."), "fig": m.group(2), "trads": trads})

    salida = {"figuras": figuras, "indiceFigs": indice_figs}
    with io.open(os.path.join(TRABAJO, "figuras.json"), "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=1)

    # resumen + validaciones
    n_filas = sum(len(f["filas"]) for f in figuras)
    sin_sec = [f["dibujos"][0] for f in figuras if not f["seccion"]]
    sin_conj = [f["dibujos"][0] for f in figuras if not f["conjunto"]]
    sin_es = sum(1 for f in figuras for x in f["filas"] if "es" not in x)
    print(f"bloques figura: {len(figuras)} · filas: {n_filas} · indiceFigs: {len(indice_figs)}")
    print(f"figuras sin seccion: {len(sin_sec)} -> {sin_sec[:12]}")
    print(f"figuras sin conjunto: {len(sin_conj)} -> {sin_conj[:12]}")
    print(f"filas sin ES: {sin_es} ({100*sin_es/max(n_filas,1):.1f}%)")

    # REDUNDANCIA: cruce contra el catalogo 2014 por (conjunto, pos) y por nr
    ruta14 = os.path.join(RAIZ, "..", "..", "apps", "pwa", "public", "data",
                          "codigos-fabricante", "baader-142.json")
    cat = json.load(io.open(os.path.abspath(ruta14), encoding="utf-8"))
    por_cp = {}
    for pz in cat["piezas"]:
        cj = (pz.get("conjunto") or "").split(" ")[0]
        if cj and pz.get("posicion"):
            por_cp[(cj, str(pz["posicion"]))] = pz
    coinciden = difieren = 0
    for f in figuras:
        for x in f["filas"]:
            if not f["conjunto"] or "nr" not in x:
                continue
            pz = por_cp.get((f["conjunto"], x["pos"]))
            if pz:
                if str(pz.get("codigo")) == str(x["nr"]):
                    coinciden += 1
                else:
                    difieren += 1
    print(f"validacion vs 2014 por (conjunto,pos): {coinciden} codigos iguales, {difieren} distintos")


def _optimizar_svg(svg):
    svg = re.sub(r"^<\?xml[^>]*\?>\s*", "", svg)
    svg = re.sub(r"(\d+\.\d{2})\d+", r"\1", svg)
    svg = re.sub(r">\s+<", "><", svg)
    return re.sub(r"<svg ", '<svg class="plano-svg" ', svg, count=1)


def _figuras():
    return json.load(io.open(os.path.join(TRABAJO, "figuras.json"), encoding="utf-8"))


def svg():
    """Exporta el dibujo de cada figura a hoja-NNN.svg (numeradas 1..N en orden)."""
    doc = fitz.open(PDF_835)
    figs = _figuras()["figuras"]
    dest = os.path.join(STAGING, "assets")
    os.makedirs(dest, exist_ok=True)
    for n, f in enumerate(figs, 1):
        pg = doc[f["dibujos"][0] - 1]
        with io.open(os.path.join(dest, f"hoja-{n:03d}.svg"), "w", encoding="utf-8") as fh:
            fh.write(_optimizar_svg(pg.get_svg_image(text_as_path=True)))
        if n % 40 == 0:
            print(f"  svg {n}/{len(figs)}")
    print(f"OK {len(figs)} SVG en {dest}")


def _normalizar_pos(t):
    t = t.strip().replace(" ", "").replace(",", "-").replace(".", "-")
    t = re.sub(r"[^A-Za-z0-9-]", "", t).upper()
    return t


def ocr():
    """OCRea los numeros de posicion sobre cada dibujo y los valida contra las
    posiciones que la tabla de esa figura declara (redundancia de dos fuentes).
    Salida: _staging/.../ocr.json  {n: {"poss": [{t, b}], "esperadas": [...], "sinAncla": [...]}}
    """
    from rapidocr_onnxruntime import RapidOCR

    doc = fitz.open(PDF_835)
    figs = _figuras()["figuras"]
    motor = RapidOCR()
    ZOOM = 4
    salida = {}
    tot_esp = tot_ok = 0
    for n, f in enumerate(figs, 1):
        pg = doc[f["dibujos"][0] - 1]
        esperadas = {_normalizar_pos(x["pos"]) for x in f["filas"]}
        # variantes con prefijo de leyenda: "1-102" tambien aparece como "102"
        variantes = {}
        for e in esperadas:
            variantes[e] = e
            m = re.match(r"^\d+-(\d+.*)$", e)
            if m and f.get("leyenda"):
                variantes.setdefault(m.group(1), e)
        pix = pg.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
        res, _ = motor(pix.tobytes("png"))
        poss, vistas = [], set()
        for l in res or []:
            txt = _normalizar_pos(l[1])
            destino = variantes.get(txt)
            if not destino:
                continue
            xs = [p[0] for p in l[0]]
            ys = [p[1] for p in l[0]]
            b = [round(min(xs) / ZOOM, 1), round(min(ys) / ZOOM, 1),
                 round((max(xs) - min(xs)) / ZOOM, 1), round((max(ys) - min(ys)) / ZOOM, 1)]
            poss.append({"t": destino, "b": b})
            vistas.add(destino)
        sin = sorted(esperadas - vistas)
        salida[str(n)] = {"poss": poss, "esperadas": sorted(esperadas), "sinAncla": sin}
        tot_esp += len(esperadas)
        tot_ok += len(esperadas) - len(sin)
        if n % 20 == 0:
            print(f"  ocr {n}/{len(figs)} · ancladas {tot_ok}/{tot_esp} ({100*tot_ok/max(tot_esp,1):.0f}%)")
    with io.open(os.path.join(TRABAJO, "ocr.json"), "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=1)
    print(f"OK ocr.json · posiciones ancladas {tot_ok}/{tot_esp} ({100*tot_ok/max(tot_esp,1):.1f}%)")


def ocr2():
    """Segunda pasada: re-OCR a zoom 7 SOLO de las figuras con <70% de anclaje,
    fusionando lo nuevo con lo ya visto (union por posicion)."""
    from rapidocr_onnxruntime import RapidOCR

    doc = fitz.open(PDF_835)
    figs = _figuras()["figuras"]
    datos = json.load(io.open(os.path.join(TRABAJO, "ocr.json"), encoding="utf-8"))
    motor = RapidOCR()
    ZOOM = 7
    mejoradas = 0
    for n, f in enumerate(figs, 1):
        a = datos.get(str(n))
        if not a or not a["esperadas"]:
            continue
        cobertura = 1 - len(a["sinAncla"]) / len(a["esperadas"])
        if cobertura >= 0.7:
            continue
        esperadas = set(a["esperadas"])
        variantes = {}
        for e in esperadas:
            variantes[e] = e
            m = re.match(r"^\d+-(\d+.*)$", e)
            if m and f.get("leyenda"):
                variantes.setdefault(m.group(1), e)
        pix = doc[f["dibujos"][0] - 1].get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
        res, _ = motor(pix.tobytes("png"))
        vistas = {p["t"] for p in a["poss"]}
        nuevas = 0
        for l in res or []:
            txt = _normalizar_pos(l[1])
            destino = variantes.get(txt)
            if not destino or destino in vistas:
                continue
            xs = [p[0] for p in l[0]]
            ys = [p[1] for p in l[0]]
            a["poss"].append({"t": destino, "b": [round(min(xs) / ZOOM, 1), round(min(ys) / ZOOM, 1),
                                                 round((max(xs) - min(xs)) / ZOOM, 1), round((max(ys) - min(ys)) / ZOOM, 1)]})
            vistas.add(destino)
            nuevas += 1
        a["sinAncla"] = sorted(esperadas - vistas)
        if nuevas:
            mejoradas += 1
        if n % 20 == 0:
            print(f"  ocr2 {n}/{len(figs)}…")
    with io.open(os.path.join(TRABAJO, "ocr.json"), "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=1)
    tot_esp = sum(len(a["esperadas"]) for a in datos.values())
    tot_ok = tot_esp - sum(len(a["sinAncla"]) for a in datos.values())
    print(f"OK ocr2 · figuras mejoradas: {mejoradas} · ancladas {tot_ok}/{tot_esp} ({100*tot_ok/max(tot_esp,1):.1f}%)")


LOOKALIKES = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "|": "1"})

# El catalogo esta en castellano de TRADUCCION ALEMANA ("cojinete", "atarjea",
# "muelle"); en planta se dice otra cosa ("rodamiento", "canaleta", "resorte",
# y "golilla" por arandela). Sin esto el buscador devuelve 0 justo cuando el
# tecnico escribe la palabra que usa a diario. Cada alias se VALIDA contra el
# vocabulario real del catalogo: si el termino destino no existe, no se emite.
SINONIMOS = {
    "golilla": "arandela", "huincha": "cinta", "perno": "tornillo",
    "rodamiento": "cojinete", "balero": "cojinete", "descanso": "cojinete",
    "buje": "casquillo", "bocina": "casquillo",
    "canaleta": "atarjea", "canal": "atarjea",
    "resorte": "muelle", "manilla": "palanca", "manija": "palanca",
    "sello": "junta", "reten": "obturador", "oring": "anillo",
    "llave": "interruptor", "switch": "interruptor",
    "correa": "correa", "cadena": "cadena", "polea": "disco",
    "prensa": "abrazadera", "grampa": "abrazadera", "abrazadera": "abrazadera",
    "cuchillo": "cuchilla", "hoja": "hoja", "rasqueta": "rascador",
    "manguera": "manguera", "codo": "angulo", "niple": "boquilla",
    "grasa": "lubrificante", "aceite": "lubrificante",
    "electrovalvula": "valvula", "solenoide": "valvula",
    "sensor": "proximidad", "fotocelula": "proximidad",
    "motor": "motor", "reductor": "engranaje", "pinon": "rueda dentada",
    "chumacera": "cojinete", "pasador": "perno", "tuerca": "tuerca",
}


def ocrt(desde=1, hasta=None):
    """OCR POR TESELAS: el detector de rapidocr reescala la pagina entera a
    ~736 px y los numeros de posicion (~7 pt) quedan de 6 px — invisibles.
    (La pasada de pagina completa solo cazaba lo grande: 52%.) En teselas de
    ~250 pt con solape de 40, cada numero es grande relativo a la tesela.
    Reemplaza ocr.json completo. Valida contra las tablas, igual que antes."""
    from rapidocr_onnxruntime import RapidOCR

    doc = fitz.open(PDF_835)
    figs = _figuras()["figuras"]
    motor = RapidOCR()
    ZOOM, TESELA, SOLAPE = 4, 250, 40
    hasta = hasta or len(figs)
    salida = {}
    tot_esp = tot_ok = 0
    for n, f in enumerate(figs, 1):
        if n < desde or n > hasta:
            continue
        pg = doc[f["dibujos"][0] - 1]
        esperadas = {_normalizar_pos(x["pos"]) for x in f["filas"]}
        variantes = {}
        for e in esperadas:
            variantes[e] = e
            m = re.match(r"^\d+-(\d+.*)$", e)
            if m and f.get("leyenda"):
                variantes.setdefault(m.group(1), e)
        poss, vistas = [], set()
        W, H = pg.rect.width, pg.rect.height
        y = 0.0
        while y < H:
            x = 0.0
            while x < W:
                clip = fitz.Rect(x, y, min(x + TESELA, W), min(y + TESELA, H))
                pix = pg.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=clip)
                res, _ = motor(pix.tobytes("png"))
                for l in res or []:
                    txt = _normalizar_pos(l[1])
                    destino = variantes.get(txt) or variantes.get(txt.translate(LOOKALIKES))
                    if not destino:
                        continue
                    xs = [p[0] for p in l[0]]
                    ys = [p[1] for p in l[0]]
                    b = [round(clip.x0 + min(xs) / ZOOM, 1), round(clip.y0 + min(ys) / ZOOM, 1),
                         round((max(xs) - min(xs)) / ZOOM, 1), round((max(ys) - min(ys)) / ZOOM, 1)]
                    # dedupe entre teselas solapadas: misma pos a <6 pt = la misma
                    if any(p["t"] == destino and abs(p["b"][0] - b[0]) < 6 and abs(p["b"][1] - b[1]) < 6 for p in poss):
                        continue
                    poss.append({"t": destino, "b": b})
                    vistas.add(destino)
                x += TESELA - SOLAPE
            y += TESELA - SOLAPE
        sin = sorted(esperadas - vistas)
        salida[str(n)] = {"poss": poss, "esperadas": sorted(esperadas), "sinAncla": sin}
        tot_esp += len(esperadas)
        tot_ok += len(esperadas) - len(sin)
        if n % 10 == 0:
            print(f"  ocrt {n}/{len(figs)} · ancladas {tot_ok}/{tot_esp} ({100*tot_ok/max(tot_esp,1):.0f}%)", flush=True)
    nombre = "ocr.json" if (desde == 1 and hasta == len(figs)) else f"ocr-parte-{desde}-{hasta}.json"
    with io.open(os.path.join(TRABAJO, nombre), "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=1)
    print(f"OK ocrt [{desde}-{hasta}] · ancladas {tot_ok}/{tot_esp} ({100*tot_ok/max(tot_esp,1):.1f}%)")


def ocrmerge():
    import glob as _glob
    total = {}
    for ruta in sorted(_glob.glob(os.path.join(TRABAJO, "ocr-parte-*.json"))):
        total.update(json.load(io.open(ruta, encoding="utf-8")))
    with io.open(os.path.join(TRABAJO, "ocr.json"), "w", encoding="utf-8") as fh:
        json.dump(total, fh, ensure_ascii=False, indent=1)
    esp = sum(len(a["esperadas"]) for a in total.values())
    ok = esp - sum(len(a["sinAncla"]) for a in total.values())
    print(f"OK merge {len(total)} figuras · ancladas {ok}/{esp} ({100*ok/max(esp,1):.1f}%)")


def ocrr(desde=1, hasta=None):
    """Pasada ROTADA para figuras apaisadas: muchas figuras estan giradas 90
    dentro de la pagina vertical (los numeros quedan de lado y el OCR normal
    no los ve — la fig 67-1-2 daba 0/11 por esto). Se OCRea la pagina rotada
    +90 y +270 en teselas y las cajas se mapean de vuelta con la matriz
    inversa. Solo figuras con cobertura < 80%. Fusiona sobre ocr.json."""
    from rapidocr_onnxruntime import RapidOCR
    import numpy as np
    import cv2

    doc = fitz.open(PDF_835)
    figs = _figuras()["figuras"]
    datos = json.load(io.open(os.path.join(TRABAJO, "ocr.json"), encoding="utf-8"))
    motor = RapidOCR()
    ZOOM, TESELA_PX, SOLAPE_PX = 4, 1000, 160
    hasta = hasta or len(figs)
    mejoradas = nuevas_tot = 0
    for n, f in enumerate(figs, 1):
        if n < desde or n > hasta:
            continue
        a = datos.get(str(n))
        if not a or not a["esperadas"]:
            continue
        cobertura = 1 - len(a["sinAncla"]) / len(a["esperadas"])
        if cobertura >= 0.8:
            continue
        esperadas = set(a["esperadas"])
        variantes = {}
        for e in esperadas:
            variantes[e] = e
            m = re.match(r"^\d+-(\d+.*)$", e)
            if m and f.get("leyenda"):
                variantes.setdefault(m.group(1), e)
        pg = doc[f["dibujos"][0] - 1]
        vistas = {p["t"] for p in a["poss"]}
        nuevas = 0
        for rot in (90, 270):
            mat = fitz.Matrix(ZOOM, ZOOM).prerotate(rot)
            pix = pg.get_pixmap(matrix=mat)
            inv = fitz.Matrix(mat)
            inv.invert()
            img = cv2.imdecode(np.frombuffer(pix.tobytes("png"), np.uint8), cv2.IMREAD_COLOR)
            Hp, Wp = img.shape[:2]
            y0 = 0
            while y0 < Hp:
                x0 = 0
                while x0 < Wp:
                    tile = img[y0:min(y0 + TESELA_PX, Hp), x0:min(x0 + TESELA_PX, Wp)]
                    # sliver del borde (p.ej. 8 px de alto): el detector lo
                    # reescala a ~86.000 px y revienta la memoria (725 MB por
                    # tesela). El solape de 160 ya cubre ese borde.
                    if tile.shape[0] < 120 or tile.shape[1] < 120:
                        x0 += TESELA_PX - SOLAPE_PX
                        continue
                    res, _ = motor(tile)
                    for l in res or []:
                        txt = _normalizar_pos(l[1])
                        destino = variantes.get(txt) or variantes.get(txt.translate(LOOKALIKES))
                        if not destino or destino in vistas:
                            continue
                        xs = [p[0] + x0 for p in l[0]]
                        ys = [p[1] + y0 for p in l[0]]
                        # a coords de pagina: deshacer offset del pixmap y la matriz
                        esquinas = [fitz.Point(x + pix.x, y + pix.y) * inv
                                    for x, y in ((min(xs), min(ys)), (max(xs), max(ys)))]
                        px0 = min(p.x for p in esquinas)
                        py0 = min(p.y for p in esquinas)
                        px1 = max(p.x for p in esquinas)
                        py1 = max(p.y for p in esquinas)
                        if not (0 <= px0 <= pg.rect.width and 0 <= py0 <= pg.rect.height):
                            continue
                        a["poss"].append({"t": destino, "b": [round(px0, 1), round(py0, 1),
                                                             round(px1 - px0, 1), round(py1 - py0, 1)],
                                          "r": rot})
                        vistas.add(destino)
                        nuevas += 1
                    x0 += TESELA_PX - SOLAPE_PX
                y0 += TESELA_PX - SOLAPE_PX
        a["sinAncla"] = sorted(esperadas - vistas)
        if nuevas:
            mejoradas += 1
            nuevas_tot += nuevas
        if n % 10 == 0:
            print(f"  ocrr {n}/{hasta}…", flush=True)
    # cada proceso escribe SOLO su rango: 4 en paralelo sobre ocr.json entero
    # se pisaban entre si (last-writer-wins). ocrrmerge los aplica encima.
    if desde == 1 and hasta == len(figs):
        destino, contenido = "ocr.json", datos
    else:
        destino = f"ocr-rot-{desde}-{hasta}.json"
        contenido = {k: v for k, v in datos.items() if desde <= int(k) <= hasta}
    with io.open(os.path.join(TRABAJO, destino), "w", encoding="utf-8") as fh:
        json.dump(contenido, fh, ensure_ascii=False, indent=1)
    tot_esp = sum(len(x["esperadas"]) for x in datos.values())
    tot_ok = tot_esp - sum(len(x["sinAncla"]) for x in datos.values())
    print(f"OK ocrr [{desde}-{hasta}] -> {destino} · figuras mejoradas {mejoradas} (+{nuevas_tot} anclas)")


def ocrrmerge():
    import glob as _glob
    base = json.load(io.open(os.path.join(TRABAJO, "ocr.json"), encoding="utf-8"))
    partes = sorted(_glob.glob(os.path.join(TRABAJO, "ocr-rot-*.json")))
    for ruta in partes:
        for k, v in json.load(io.open(ruta, encoding="utf-8")).items():
            # quedarse con la version con MAS anclas (la rotada solo suma)
            if len(v.get("poss", [])) >= len(base.get(k, {}).get("poss", [])):
                base[k] = v
    with io.open(os.path.join(TRABAJO, "ocr.json"), "w", encoding="utf-8") as fh:
        json.dump(base, fh, ensure_ascii=False, indent=1)
    esp = sum(len(a["esperadas"]) for a in base.values())
    ok = esp - sum(len(a["sinAncla"]) for a in base.values())
    print(f"OK ocrrmerge ({len(partes)} partes) · ancladas {ok}/{esp} ({100*ok/max(esp,1):.1f}%)")


def _expandir_grupo(texto_crudo, esperadas):
    """'16-18' -> [16,17,18] · '2, 3' / '31, 40' -> lista. Solo miembros que
    esten en las posiciones esperadas de la figura (validacion de tablas)."""
    t = texto_crudo.strip()
    out = []
    for parte in re.split(r"[,;]\s*", t):
        parte = parte.strip()
        m = re.fullmatch(r"(\d{1,3})\s*[-–]\s*(\d{1,3})", parte)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if 0 < b - a <= 8:
                out.extend(str(x) for x in range(a, b + 1))
            continue
        if re.fullmatch(r"\d{1,3}", parte):
            out.append(parte)
    miembros = [x for x in out if x in esperadas]
    # un rotulo agrupado tiene 2+ miembros validos; uno solo ya lo cazo ocrt
    return miembros if len(miembros) >= 2 else []


def ocrg(desde=1, hasta=None):
    """Pasada de GRUPOS: el catalogo rotula posiciones agrupadas ('2, 3',
    '16-18', '31, 40') y el matcher individual no las veia. Re-OCRea SOLO las
    figuras con posiciones sin ancla, en la orientacion que ya funciono para
    esa figura, y expande listas/rangos. Fusiona sobre ocr.json."""
    from rapidocr_onnxruntime import RapidOCR
    import numpy as np
    import cv2

    doc = fitz.open(PDF_835)
    figs = _figuras()["figuras"]
    datos = json.load(io.open(os.path.join(TRABAJO, "ocr.json"), encoding="utf-8"))
    motor = RapidOCR()
    ZOOM, TESELA_PX, SOLAPE_PX = 4, 1000, 160
    hasta = hasta or len(figs)
    mejoradas = nuevas_tot = 0
    for n, f in enumerate(figs, 1):
        if n < desde or n > hasta:
            continue
        a = datos.get(str(n))
        if not a or not a["sinAncla"]:
            continue
        esperadas = set(a["esperadas"])
        vistas = {p["t"] for p in a["poss"]}
        # orientaciones: 0 siempre; las rotadas solo si esa figura ya dio
        # anclas rotadas (o si no tiene ninguna ancla aun)
        rots = {0}
        rots.update(p.get("r", 0) for p in a["poss"])
        if not a["poss"]:
            rots.update((90, 270))
        nuevas = 0
        for rot in sorted(rots):
            mat = fitz.Matrix(ZOOM, ZOOM).prerotate(rot)
            pix = doc[f["dibujos"][0] - 1].get_pixmap(matrix=mat)
            inv = fitz.Matrix(mat)
            inv.invert()
            img = cv2.imdecode(np.frombuffer(pix.tobytes("png"), np.uint8), cv2.IMREAD_COLOR)
            Hp, Wp = img.shape[:2]
            y0 = 0
            while y0 < Hp:
                x0 = 0
                while x0 < Wp:
                    tile = img[y0:min(y0 + TESELA_PX, Hp), x0:min(x0 + TESELA_PX, Wp)]
                    if tile.shape[0] < 120 or tile.shape[1] < 120:
                        x0 += TESELA_PX - SOLAPE_PX
                        continue
                    res, _ = motor(tile)
                    for l in res or []:
                        miembros = _expandir_grupo(l[1], esperadas)
                        pendientes = [mm for mm in miembros if mm not in vistas]
                        if not pendientes:
                            continue
                        xs = [p[0] + x0 for p in l[0]]
                        ys = [p[1] + y0 for p in l[0]]
                        esq = [fitz.Point(x + pix.x, y + pix.y) * inv
                               for x, y in ((min(xs), min(ys)), (max(xs), max(ys)))]
                        px0, py0 = min(p.x for p in esq), min(p.y for p in esq)
                        px1, py1 = max(p.x for p in esq), max(p.y for p in esq)
                        if not (0 <= px0 <= doc[f["dibujos"][0] - 1].rect.width):
                            continue
                        b = [round(px0, 1), round(py0, 1), round(px1 - px0, 1), round(py1 - py0, 1)]
                        for mm in pendientes:
                            a["poss"].append({"t": mm, "b": b, "g": 1})
                            vistas.add(mm)
                            nuevas += 1
                    x0 += TESELA_PX - SOLAPE_PX
                y0 += TESELA_PX - SOLAPE_PX
        a["sinAncla"] = sorted(esperadas - vistas)
        if nuevas:
            mejoradas += 1
            nuevas_tot += nuevas
        if n % 10 == 0:
            print(f"  ocrg {n}/{hasta}…", flush=True)
    if desde == 1 and hasta == len(figs):
        destino, contenido = "ocr.json", datos
    else:
        destino = f"ocr-grp-{desde}-{hasta}.json"
        contenido = {k: v for k, v in datos.items() if desde <= int(k) <= hasta}
    with io.open(os.path.join(TRABAJO, destino), "w", encoding="utf-8") as fh:
        json.dump(contenido, fh, ensure_ascii=False, indent=1)
    print(f"OK ocrg [{desde}-{hasta}] -> {destino} · figuras mejoradas {mejoradas} (+{nuevas_tot})")


def ocrgmerge():
    import glob as _glob
    base = json.load(io.open(os.path.join(TRABAJO, "ocr.json"), encoding="utf-8"))
    partes = sorted(_glob.glob(os.path.join(TRABAJO, "ocr-grp-*.json")))
    for ruta in partes:
        for k, v in json.load(io.open(ruta, encoding="utf-8")).items():
            if len(v.get("poss", [])) >= len(base.get(k, {}).get("poss", [])):
                base[k] = v
    with io.open(os.path.join(TRABAJO, "ocr.json"), "w", encoding="utf-8") as fh:
        json.dump(base, fh, ensure_ascii=False, indent=1)
    esp = sum(len(a["esperadas"]) for a in base.values())
    ok = esp - sum(len(a["sinAncla"]) for a in base.values())
    print(f"OK ocrgmerge ({len(partes)} partes) · ancladas {ok}/{esp} ({100*ok/max(esp,1):.1f}%)")


def _nn(n):
    """Mismo nombre de archivo que usePlano: String(blatt).padStart(2,'0')."""
    return str(n).zfill(2)


def indice_app():
    """Arma los assets finales para la PWA en _staging/baader-142-despiece/.

    Requiere: figuras.json + ocr.json (en ...-trabajo/) y assets/hoja-NNN.svg.
    """
    import shutil

    trabajo = TRABAJO
    figs = json.load(io.open(os.path.join(trabajo, "figuras.json"), encoding="utf-8"))["figuras"]
    # cruce SAP: maestro exportado por cruzar_sap_142.mjs (match EXACTO por
    # codigoFabricante, solo SAP numericos — certeza primero)
    ruta_maestro = os.path.join(trabajo, "maestro-142.json")
    sap_por_fab = {}
    if os.path.exists(ruta_maestro):
        for m in json.load(io.open(ruta_maestro, encoding="utf-8")):
            if m["fab"] and m["sap"].isdigit():
                sap_por_fab.setdefault(m["fab"], {"s": m["sap"], "n": m["nombre"][:60], "u": m["ubicacion"]})
    ruta_ocr = os.path.join(trabajo, "ocr.json")
    anclas = json.load(io.open(ruta_ocr, encoding="utf-8")) if os.path.exists(ruta_ocr) else {}
    doc = fitz.open(PDF_835)
    os.makedirs(STAGING, exist_ok=True)

    # capitulo = primer tramo de la seccion; etiqueta = tituloEs de su 1a figura
    def cap_de(sec):
        return (sec or "0").split("-")[0]

    etiquetas = {}
    for f in figs:
        c = cap_de(f["seccion"])
        if c not in etiquetas:
            tit = f["titulos"][3] if len(f["titulos"]) > 3 else (f["titulos"][0] if f["titulos"] else "Varios")
            etiquetas[c] = f"{c} · {tit}" if c != "0" else "Portada"

    # CANTIDAD por pieza: el catalogo 2006 no la trae, el 2014 si. Se hereda
    # por (conjunto, posicion) — el mismo par que ya valido 1.189 codigos
    # identicos entre ambos. Sin esto el tecnico pide 1 y la maquina lleva 4.
    ruta14 = os.path.abspath(os.path.join(RAIZ, "..", "..", "apps", "pwa", "public",
                                          "data", "codigos-fabricante", "baader-142.json"))
    cant_por_cp = {}
    if os.path.exists(ruta14):
        for pz in json.load(io.open(ruta14, encoding="utf-8"))["piezas"]:
            cj = (pz.get("conjunto") or "").split(" ")[0]
            if cj and pz.get("posicion") and pz.get("cantidad"):
                cant_por_cp[(cj, str(pz["posicion"]))] = pz["cantidad"]

    hojas_meta, indice_cod, busqueda, descs = [], {}, [], {}
    for n, f in enumerate(figs, 1):
        pg = doc[f["dibujos"][0] - 1]
        vb = [round(pg.rect.width, 2), round(pg.rect.height, 2)]
        a = anclas.get(str(n), {"poss": [], "sinAncla": []})
        poss = a["poss"]
        caja_fallback = [round(vb[0] * 0.25, 1), round(vb[1] * 0.25, 1),
                         round(vb[0] * 0.5, 1), round(vb[1] * 0.5, 1)]
        por_pos = {}
        for p in poss:
            por_pos.setdefault(p["t"], p["b"])
        titulo_de = f["titulos"][0] if f["titulos"] else ""
        titulo_es = f["titulos"][3] if len(f["titulos"]) > 3 else titulo_de
        hojas_meta.append({
            "blatt": n, "vb": vb, "cols": {},
            "seccion": etiquetas[cap_de(f["seccion"])],
            "fig": f["seccion"] or "—", "conjunto": f.get("conjunto"),
            "titulo": titulo_de, "tituloEs": titulo_es,
            "n": {"x": 0, "t": len(poss), "d": len(f["filas"])},
        })
        for x in f["filas"]:
            b = por_pos.get(_normalizar_pos(x["pos"]), caja_fallback)
            nombre_es = x.get("es") or x.get("de") or ""
            if x.get("nr"):
                indice_cod.setdefault(x["nr"], []).append({"h": n, "c": 0, "b": b})
                d = descs.get(x["nr"])
                if not d:
                    descs[x["nr"]] = f"{nombre_es} · pieza del catálogo, fig. {f['seccion']}"
            busqueda.append({
                "de": f"{x['pos']} {x.get('de','')} {x.get('nr','')}".strip(),
                "es": nombre_es, "h": n, "b": b,
            })
        # svg: renombrar del staging de trabajo al nombre padStart(2)
        origen = os.path.join(STAGING, "assets", f"hoja-{n:03d}.svg")
        destino = os.path.join(STAGING, f"hoja-{_nn(n)}.svg")
        if os.path.exists(origen):
            shutil.move(origen, destino)
        # las posiciones OCR van como capa `tags`: PlanoLienzo ya dibuja esa
        # capa y su click (onAparato) — cero cambios de lienzo para el despiece
        filas_out = []
        for x in f["filas"]:
            fila = dict(x)
            q = cant_por_cp.get((f.get("conjunto") or "", x["pos"]))
            if q and str(q).strip() not in ("", "1"):
                fila["q"] = q          # x1 no se muestra: es el caso normal
            filas_out.append(fila)
        datos_hoja = {"tags": poss, "filas": filas_out}
        if f.get("leyenda"):
            datos_hoja["leyenda"] = f["leyenda"]
        with io.open(os.path.join(STAGING, f"hoja-{_nn(n)}.json"), "w", encoding="utf-8") as fh:
            json.dump(datos_hoja, fh, ensure_ascii=False)

    # "tambien en N figuras": util cuando la pieza es ESPECIFICA (2-12 usos:
    # "ojo, la misma cuchilla va en el excavador B"); por encima de eso es
    # ferreteria comun (una arandela va en 287 figuras) y decir el numero solo
    # estorba -> se marca como comun y la UI lo dice con palabras.
    UMBRAL_COMUN = 12
    usos = {cod: len(aps) for cod, aps in indice_cod.items()}
    compartidas = {cod: n for cod, n in usos.items() if n > 1}

    # Accesos directos: la figura de PIEZAS DE DESGASTE (fig 00) es la que el
    # tecnico busca a diario (cuchillas, hojas, rascador) y queda enterrada
    # entre 43 capitulos. Se detecta por su titulo, no por numero fijo.
    destacados = []
    for h in hojas_meta:
        if re.search(r"desgaste|verschleiss|wearing", (h["tituloEs"] or "") + (h["titulo"] or ""), re.I):
            destacados.append({"hoja": h["blatt"], "etiqueta": "Piezas de desgaste",
                               "detalle": f"{h['n']['d']} piezas que se cambian seguido"})
            break

    # sinonimos VALIDADOS: solo los que apuntan a una palabra que de verdad
    # aparece en este catalogo (si no, seria una promesa vacia en el buscador)
    vocab = set()
    for b in busqueda:
        vocab.update(re.findall(r"[a-záéíóúñ]{3,}", (b.get("es") or "").lower()))
    sinonimos = {a: d for a, d in SINONIMOS.items()
                 if a not in vocab and all(w in vocab for w in d.split())}

    sap_por_codigo = {}
    for cod in indice_cod:
        m = sap_por_fab.get(re.sub(r"[^A-Z0-9]", "", cod.upper()))
        if m:
            sap_por_codigo[cod] = m
    idx = {
        "plano": "Catálogo de piezas 142.00.00.821",
        "rev": "Ed. 10/2006",
        "maquina": "BAADER 142",
        "hojasTotales": len(figs),
        "faltante": [],
        "hojas": hojas_meta,
        "indice": indice_cod,
        "busqueda": busqueda,
        "bornesIdx": {},
        "descs": descs,
        "glosario": {},
        "sapPorCodigo": sap_por_codigo,
        "usosPorCodigo": compartidas,
        "umbralComun": UMBRAL_COMUN,
        "destacados": destacados,
        "sinonimos": sinonimos,
    }
    # PARTIR EL INDICE: `busqueda` (50% del peso) y `descs` (12%) solo hacen
    # falta al BUSCAR, no al abrir el plano. Separarlos baja el arranque de
    # ~134 KB a ~50 KB comprimidos — en planta la senal parpadea y el fetch
    # del indice era el punto donde se caia la carga.
    busqueda_aparte = {"busqueda": idx.pop("busqueda"), "descs": idx.pop("descs", {})}
    with io.open(os.path.join(STAGING, "busqueda.json"), "w", encoding="utf-8") as fh:
        json.dump(busqueda_aparte, fh, ensure_ascii=False)
    with io.open(os.path.join(STAGING, "indice.json"), "w", encoding="utf-8") as fh:
        json.dump(idx, fh, ensure_ascii=False)
    kb = lambda o: len(json.dumps(o, ensure_ascii=False).encode("utf-8")) / 1024
    print(f"   indice {kb(idx):.0f} KB + busqueda {kb(busqueda_aparte):.0f} KB (antes: {kb(idx)+kb(busqueda_aparte):.0f} KB juntos)")
    restantes = os.listdir(os.path.join(STAGING, "assets")) if os.path.isdir(os.path.join(STAGING, "assets")) else []
    if not restantes:
        try:
            os.rmdir(os.path.join(STAGING, "assets"))
        except OSError:
            pass
    # Mapa liviano codigo->figura para el modulo REPUESTOS (el indice completo
    # pesa 770 KB y ahi solo se necesita "donde esta el dibujo de esta pieza").
    mapa = {cod: [aps[0]["h"], hojas_meta[aps[0]["h"] - 1]["fig"]]
            for cod, aps in indice_cod.items() if aps}
    ruta_mapa = os.path.abspath(os.path.join(
        RAIZ, "..", "..", "apps", "pwa", "public", "data", "despiece-142-figuras.json"))
    with io.open(ruta_mapa, "w", encoding="utf-8") as fh:
        json.dump({"plano": "baader-142-despiece", "codigos": mapa}, fh, ensure_ascii=False)
    print(f"OK mapa codigo->figura ({len(mapa)}) -> public/data/despiece-142-figuras.json")

    print(f"OK indice.json + {len(figs)} hojas en {STAGING}")
    print(f"   codigos indexados: {len(indice_cod)} · items de busqueda: {len(busqueda)} · capitulos: {len(etiquetas)}")
    print(f"   codigos con SAP (match exacto): {len(sap_por_codigo)}")
    print(f"   sinonimos de planta validados: {len(sinonimos)} -> {sorted(sinonimos)[:10]}")
    esp = sum(1 for n in compartidas.values() if n <= UMBRAL_COMUN)
    print(f"   piezas compartidas: {len(compartidas)} ({esp} especificas, {len(compartidas)-esp} ferreteria comun)")


if __name__ == "__main__":
    fase = sys.argv[1] if len(sys.argv) > 1 else "inventario"
    if fase == "inventario":
        inventario()
    elif fase == "tablas":
        tablas()
    elif fase == "svg":
        svg()
    elif fase == "ocr":
        ocr()
    elif fase == "ocr2":
        ocr2()
    elif fase == "ocrt":
        ocrt(int(sys.argv[2]) if len(sys.argv) > 2 else 1,
             int(sys.argv[3]) if len(sys.argv) > 3 else None)
    elif fase == "ocrmerge":
        ocrmerge()
    elif fase == "ocrrmerge":
        ocrrmerge()
    elif fase == "ocrg":
        ocrg(int(sys.argv[2]) if len(sys.argv) > 2 else 1,
             int(sys.argv[3]) if len(sys.argv) > 3 else None)
    elif fase == "ocrgmerge":
        ocrgmerge()
    elif fase == "ocrr":
        ocrr(int(sys.argv[2]) if len(sys.argv) > 2 else 1,
             int(sys.argv[3]) if len(sys.argv) > 3 else None)
    elif fase == "indice":
        indice_app()
    else:
        print(f"fase desconocida: {fase}")
