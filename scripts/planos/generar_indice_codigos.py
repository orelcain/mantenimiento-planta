# -*- coding: utf-8 -*-
"""Indice UNICO de numeros de parte de toda la planta.

El tecnico tiene un numero grabado en una pieza y no sabe de que maquina es
ni donde buscarlo. Hoy hay dos buscadores separados (planos vs codigos de
fabricante) y 4.868 codigos quedaban fuera del de planos — justo los de la
GEA, la enzunchadora y Marel, que no tienen despiece navegable.

Este indice junta TODO: 7.097 codigos de los 6 catalogos + los 2 despieces,
con su maquina, su nombre y a donde lleva cada uno (dibujo si existe,
Repuestos si no). Liviano a proposito: se carga solo cuando la consulta
parece un numero de parte.

Uso: python scripts/planos/generar_indice_codigos.py
Salida: apps/pwa/public/data/codigos-indice.json
"""
import io
import json
import os
import glob

RAIZ = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.abspath(os.path.join(RAIZ, "..", "..", "apps", "pwa", "public"))

# despieces navegables: codigo -> (slug, hoja, figura)
despieces = {}
for slug in ("baader-142-despiece", "baader-200-despiece"):
    ruta = os.path.join(RAIZ, "_staging", slug, "indice.json")
    if not os.path.exists(ruta):
        continue
    idx = json.load(io.open(ruta, encoding="utf-8"))
    figs = {h["blatt"]: h.get("fig", "") for h in idx["hojas"]}
    for cod, aps in idx["indice"].items():
        if aps and cod not in despieces:
            despieces[cod] = (slug, aps[0]["h"], figs.get(aps[0]["h"], ""))

salida = {}
for f in sorted(glob.glob(os.path.join(PUB, "data", "codigos-fabricante", "*.json"))):
    d = json.load(io.open(f, encoding="utf-8"))
    maquina = d.get("maquina") or os.path.basename(f)
    for p in d.get("piezas", []):
        cod = str(p.get("codigo") or "").strip()
        if not cod or cod in salida:
            continue
        e = {"m": maquina, "n": (p.get("descripcion") or "")[:52]}
        d_ = despieces.get(cod)
        if d_:
            e["s"], e["h"], e["f"] = d_
        salida[cod] = e

# los del despiece que NO estan en ningun catalogo (exclusivos del 2006)
for cod, (slug, hoja, fig) in despieces.items():
    if cod not in salida:
        salida[cod] = {"m": "BAADER 142" if "142" in slug else "BAADER 200",
                       "n": "", "s": slug, "h": hoja, "f": fig}

# Formato COMPACTO: las claves ("m","n","s"...) y los nombres de maquina se
# repetian 7.570 veces (591 KB). Con arrays posicionales e indices a tablas
# baja a un tercio — el tecnico lo carga en el telefono, en planta.
maquinas = sorted({e["m"] for e in salida.values()})
slugs = sorted({e["s"] for e in salida.values() if "s" in e})
compacto = {}
for cod, e in salida.items():
    fila = [maquinas.index(e["m"]), e["n"]]
    if "s" in e:
        fila += [slugs.index(e["s"]), e["h"], e["f"]]
    compacto[cod] = fila

destino = os.path.join(PUB, "data", "codigos-indice.json")
with io.open(destino, "w", encoding="utf-8") as fh:
    json.dump({"maquinas": maquinas, "planos": slugs, "codigos": compacto}, fh, ensure_ascii=False)
con_dibujo = sum(1 for e in salida.values() if "s" in e)
kb = os.path.getsize(destino) / 1024
print(f"OK {len(salida)} numeros de parte ({con_dibujo} con dibujo navegable) -> {kb:.0f} KB")
maqs = {}
for e in salida.values():
    maqs[e["m"]] = maqs.get(e["m"], 0) + 1
for m, n in sorted(maqs.items(), key=lambda x: -x[1]):
    print(f"   {m[:38]:<40} {n:>5}")
