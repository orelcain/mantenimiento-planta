# -*- coding: utf-8 -*-
"""Genera el PUENTE aparato electrico -> pieza fisica del despiece (BAADER 142).

Fuente: _staging/baader-142-despiece-trabajo/figuras.json (parseo del catalogo
2006, cuatrilingue). Regla directa: cuando la POSICION de una fila del catalogo
es una designacion IEC (B14, S00...), el propio fabricante esta mapeando el
aparato electrico a su pieza. Verificado ademas que la numeracion B es estable
entre el plano 860 (maquina antigua) y el 888 (nuevas): B10 «Carro», B14
«Carro en», B15 «Control» significan lo mismo en ambos.

Curaduria manual: scripts/planos/partes_curadas_142.json (si existe) se fusiona
encima (permite corregir, agregar M/K/Q o marcar confirmado en terreno).

Salida: apps/pwa/public/planos/<slug>/partes.json para baader-142-888 y
baader-142-860.
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.abspath(__file__))
TRABAJO = os.path.join(RAIZ, "_staging", "baader-142-despiece-trabajo")
PWA_PLANOS = os.path.abspath(os.path.join(RAIZ, "..", "..", "apps", "pwa", "public", "planos"))
DESPIECE_SLUG = "baader-142-despiece"
RE_DESIGNACION = re.compile(r"^[A-Z]\d+$")


# Familias IEC 81346 -> donde vive fisicamente ese tipo de componente. Las
# figuras NO se listan a mano: se detectan por el contenido real del catalogo
# (titulo de la figura o >=3 filas del tipo), asi el dia que entre otro plano
# el mapa se regenera solo.
FAMILIAS = {
    "K": (r"sch(ü|ue)tz|contactor|rel(é|e)\b|relais", "contactores y relés"),
    "Q": (r"motorschutz|guardamotor|leistungsschalter|interruptor autom", "guardamotores"),
    "F": (r"sicherung|fusible|schutzschalter", "fusibles y protecciones"),
    "S": (r"taster|pulsador|stufenschalter|bedieneinheit|puesto de mando", "mandos y pulsadores"),
    "Y": (r"magnetventil|electrov|v(á|a)lvula|ventil\b", "electroválvulas"),
    "M": (r"\bmotor\b", "motores"),
    "SM": (r"schrittmotor|paso a paso|sm-platte", "motores paso a paso"),
    "B": (r"ann(ä|ae)herungsschalter|proximidad|sensor|initiator", "sensores"),
}


def construir_familias(figs):
    """Para cada letra IEC, las figuras del catálogo donde vive ese tipo de
    componente (con la evidencia: cuántas filas del tipo tiene la figura).
    Sirve para responder «¿dónde busco mi K7?» aunque el catálogo no rotule
    la designación: la respuesta honesta es la CAJA, no la pieza exacta."""
    salida = {}
    for fam, (pat, etiqueta) in FAMILIAS.items():
        rx = re.compile(pat, re.I)
        cands = []
        for n, f in enumerate(figs, 1):
            titulo_all = " ".join(f["titulos"])
            filas_tipo = sum(
                1 for x in f["filas"]
                if rx.search(" ".join(str(x.get(k) or "") for k in ("de", "es")))
            )
            if rx.search(titulo_all) or filas_tipo >= 3:
                tit = f["titulos"][3] if len(f["titulos"]) > 3 else (f["titulos"][0] if f["titulos"] else "")
                cands.append({"fig": f["seccion"], "hoja": n, "titulo": tit[:44], "n": filas_tipo})
        # las de más piezas del tipo primero; tope 4 para no abrumar en el panel
        cands.sort(key=lambda c: c["n"], reverse=True)
        if cands:
            salida[fam] = {"etiqueta": etiqueta, "figuras": cands[:4]}
    return salida


def main():
    figs = json.load(io.open(os.path.join(TRABAJO, "figuras.json"), encoding="utf-8"))["figuras"]
    ruta_maestro = os.path.join(TRABAJO, "maestro-142.json")
    sap_por_fab = {}
    if os.path.exists(ruta_maestro):
        for m in json.load(io.open(ruta_maestro, encoding="utf-8")):
            if m["fab"] and m["sap"].isdigit():
                sap_por_fab.setdefault(m["fab"], m)

    aparatos = {}
    for n, f in enumerate(figs, 1):
        for x in f["filas"]:
            pos = x["pos"].upper()
            if not RE_DESIGNACION.match(pos) or not x.get("nr"):
                continue
            entrada = {
                "nr": x["nr"],
                "es": x.get("es") or x.get("de") or "",
                "de": x.get("de") or "",
                "fig": f["seccion"],
                "hoja": n,
                "pos": pos,
                "confianza": "catalogo",
            }
            m = sap_por_fab.get(re.sub(r"[^A-Z0-9]", "", x["nr"].upper()))
            if m:
                entrada["sap"] = m["sap"]
                entrada["sapNombre"] = m["nombre"][:60]
                entrada["sapUbicacion"] = m["ubicacion"]
            # si ya existe (misma designacion en 2 figuras), conservar ambas
            aparatos.setdefault(pos, []).append(entrada)

    # solo designaciones que EXISTEN en al menos un plano electrico (el S00
    # del catalogo no aparece en ninguno y ensuciaba la auditoria)
    en_planos = set()
    for slug in ("baader-142-888", "baader-142-860"):
        idx = json.load(io.open(os.path.join(PWA_PLANOS, slug, "indice.json"), encoding="utf-8"))
        en_planos.update(k for k in idx["indice"] if RE_DESIGNACION.match(k))
    descartadas = sorted(set(aparatos) - en_planos)
    if descartadas:
        print(f"descartadas (no existen en los planos): {descartadas}")
    aparatos = {k: v for k, v in aparatos.items() if k in en_planos}

    # curaduria manual encima
    ruta_cur = os.path.join(RAIZ, "partes_curadas_142.json")
    if os.path.exists(ruta_cur):
        curadas = json.load(io.open(ruta_cur, encoding="utf-8"))
        for tag, entradas in curadas.items():
            aparatos[tag] = entradas if isinstance(entradas, list) else [entradas]
        print(f"curaduria aplicada: {len(curadas)} designaciones")

    familias = construir_familias(figs)
    salida = {"despiece": DESPIECE_SLUG, "aparatos": aparatos, "familias": familias}
    for slug in ("baader-142-888", "baader-142-860"):
        destino = os.path.join(PWA_PLANOS, slug, "partes.json")
        # cobertura contra los aparatos reales de ese plano
        idx = json.load(io.open(os.path.join(PWA_PLANOS, slug, "indice.json"), encoding="utf-8"))
        del_plano = {k for k in idx["indice"] if RE_DESIGNACION.match(k)}
        mapeados = {k for k in aparatos if k in del_plano}
        con_zona = {k for k in del_plano
                    if k not in mapeados and re.match(r"^[A-Z]", k) and familias.get(re.match(r"^[A-Z]+", k).group())}
        with io.open(destino, "w", encoding="utf-8") as fh:
            json.dump(salida, fh, ensure_ascii=False)
        cob = 100 * (len(mapeados) + len(con_zona)) / max(len(del_plano), 1)
        print(f"{slug}: pieza exacta {len(mapeados)} · zona sugerida {len(con_zona)} · "
              f"sin dato {len(del_plano) - len(mapeados) - len(con_zona)} de {len(del_plano)} ({cob:.0f}% con alguna guía)")
    print("OK partes.json escritos")


if __name__ == "__main__":
    main()
