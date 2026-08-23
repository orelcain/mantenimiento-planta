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


def main():
    figs = json.load(io.open(os.path.join(TRABAJO, "figuras.json"), encoding="utf-8"))["figuras"]

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
            # si ya existe (misma designacion en 2 figuras), conservar ambas
            aparatos.setdefault(pos, []).append(entrada)

    # curaduria manual encima
    ruta_cur = os.path.join(RAIZ, "partes_curadas_142.json")
    if os.path.exists(ruta_cur):
        curadas = json.load(io.open(ruta_cur, encoding="utf-8"))
        for tag, entradas in curadas.items():
            aparatos[tag] = entradas if isinstance(entradas, list) else [entradas]
        print(f"curaduria aplicada: {len(curadas)} designaciones")

    salida = {"despiece": DESPIECE_SLUG, "aparatos": aparatos}
    for slug in ("baader-142-888", "baader-142-860"):
        destino = os.path.join(PWA_PLANOS, slug, "partes.json")
        # cobertura contra los aparatos reales de ese plano
        idx = json.load(io.open(os.path.join(PWA_PLANOS, slug, "indice.json"), encoding="utf-8"))
        del_plano = {k for k in idx["indice"] if RE_DESIGNACION.match(k)}
        mapeados = {k for k in aparatos if k in del_plano}
        with io.open(destino, "w", encoding="utf-8") as fh:
            json.dump(salida, fh, ensure_ascii=False)
        print(f"{slug}: {len(mapeados)} aparatos mapeados de {len(del_plano)} designaciones simples"
              f" -> {sorted(mapeados, key=lambda t: (t[0], int(t[1:])))}")
    print("OK partes.json escritos")


if __name__ == "__main__":
    main()
