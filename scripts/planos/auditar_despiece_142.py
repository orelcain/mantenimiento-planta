# -*- coding: utf-8 -*-
"""Auditoria de redundancia del despiece + puente (F3).

Verifica que TODO link aterrice:
  1. partes.json (888 y 860): cada entrada apunta a una hoja existente del
     despiece, su pos existe en las filas de esa hoja, y el nr coincide.
  2. indice.json del despiece: cada aparicion de cada codigo apunta a hoja
     valida; cada hoja tiene svg+json; los tags de cada hoja corresponden a
     posiciones de sus filas.
  3. Cobertura: % posiciones ancladas por OCR, % aparatos B/S del plano
     electrico con pieza mapeada.

Uso: python scripts/planos/auditar_despiece_142.py
Salida: exit 0 si no hay errores duros; lista de problemas por consola.
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(RAIZ, "_staging", "baader-142-despiece")
PWA = os.path.abspath(os.path.join(RAIZ, "..", "..", "apps", "pwa", "public", "planos"))

errores, avisos = [], []


def norm(t):
    return re.sub(r"[^A-Za-z0-9-]", "", t.strip().replace(" ", "")).upper()


def main():
    idx = json.load(io.open(os.path.join(APP, "indice.json"), encoding="utf-8"))
    hojas = {h["blatt"]: h for h in idx["hojas"]}
    datos_hoja = {}
    for b in hojas:
        nn = str(b).zfill(2)
        svg = os.path.join(APP, f"hoja-{nn}.svg")
        js = os.path.join(APP, f"hoja-{nn}.json")
        if not os.path.exists(svg):
            errores.append(f"hoja {b}: falta {os.path.basename(svg)}")
        if not os.path.exists(js):
            errores.append(f"hoja {b}: falta {os.path.basename(js)}")
            continue
        datos_hoja[b] = json.load(io.open(js, encoding="utf-8"))

    # 2a. tags ⊆ filas de la hoja
    tot_tags = tot_filas = 0
    for b, d in datos_hoja.items():
        poss_filas = {norm(f["pos"]) for f in d.get("filas", [])}
        tot_filas += len(poss_filas)
        for t in d.get("tags", []):
            tot_tags += 1
            if norm(t["t"]) not in poss_filas:
                errores.append(f"hoja {b}: tag «{t['t']}» sin fila en la tabla")

    # 2b. indice global de codigos aterriza
    for cod, aps in idx["indice"].items():
        for a in aps:
            if a["h"] not in hojas:
                errores.append(f"indice[{cod}]: hoja {a['h']} no existe")
                continue
            d = datos_hoja.get(a["h"], {})
            if not any(f.get("nr") == cod for f in d.get("filas", [])):
                errores.append(f"indice[{cod}]: la hoja {a['h']} no tiene fila con ese codigo")

    # 1. partes.json de los planos electricos
    for slug in ("baader-142-888", "baader-142-860"):
        ruta = os.path.join(PWA, slug, "partes.json")
        if not os.path.exists(ruta):
            errores.append(f"{slug}: falta partes.json")
            continue
        p = json.load(io.open(ruta, encoding="utf-8"))
        idx_elec = json.load(io.open(os.path.join(PWA, slug, "indice.json"), encoding="utf-8"))
        for tag, entradas in p["aparatos"].items():
            for e in entradas:
                if e["hoja"] not in hojas:
                    errores.append(f"{slug} {tag}: hoja despiece {e['hoja']} no existe")
                    continue
                d = datos_hoja.get(e["hoja"], {})
                fila = next((f for f in d.get("filas", []) if norm(f["pos"]) == norm(e["pos"])), None)
                if not fila:
                    errores.append(f"{slug} {tag}: pos {e['pos']} sin fila en hoja {e['hoja']}")
                elif fila.get("nr") != e["nr"]:
                    errores.append(f"{slug} {tag}: nr {e['nr']} != fila {fila.get('nr')}")
            if tag not in idx_elec["indice"]:
                avisos.append(f"{slug}: {tag} mapeado pero no existe en el plano electrico")

        sensores = {k for k in idx_elec["indice"] if re.fullmatch(r"[BS]\d+", k)}
        mapeados = sensores & set(p["aparatos"])
        print(f"{slug}: sensores B/S mapeados {len(mapeados)}/{len(sensores)}")

    # 2c. INDICE PARTIDO: busqueda.json debe existir y ser coherente
    ruta_busq = os.path.join(APP, "busqueda.json")
    if os.path.exists(ruta_busq):
        bus = json.load(io.open(ruta_busq, encoding="utf-8"))
        if "busqueda" in idx and idx["busqueda"]:
            errores.append("indice.json TODAVIA trae `busqueda`: se duplica el peso que se separo")
        hojas_busq = {b["h"] for b in bus.get("busqueda", [])}
        fuera = hojas_busq - set(hojas)
        if fuera:
            errores.append(f"busqueda.json apunta a hojas inexistentes: {sorted(fuera)[:5]}")
        print(f"indice partido: busqueda {len(bus.get('busqueda', []))} items · descs {len(bus.get('descs', {}))}")
    else:
        avisos.append("no hay busqueda.json: el indice va entero (mas pesado al abrir)")

    # 2d. DATOS DERIVADOS que consume la UI
    dest = idx.get("destacados") or []
    for d in dest:
        if d["hoja"] not in hojas:
            errores.append(f"destacado '{d['etiqueta']}' apunta a la hoja {d['hoja']}, que no existe")
    if not dest:
        avisos.append("sin destacados: se pierde el acceso directo a piezas de desgaste")

    vocab = set()
    for b in (json.load(io.open(ruta_busq, encoding="utf-8")).get("busqueda", [])
              if os.path.exists(ruta_busq) else idx.get("busqueda", [])):
        vocab.update(re.findall(r"[a-záéíóúñ]{3,}", (b.get("es") or "").lower()))
    for alias, destino in (idx.get("sinonimos") or {}).items():
        if any(w not in vocab for w in destino.split()):
            errores.append(f"sinonimo {alias}->{destino}: el destino no existe en el catalogo")

    sap = idx.get("sapPorCodigo") or {}
    fuera_sap = [c for c in sap if c not in idx["indice"]]
    if fuera_sap:
        errores.append(f"sapPorCodigo con codigos que no estan en el indice: {fuera_sap[:5]}")
    print(f"derivados: destacados {len(dest)} · sinonimos {len(idx.get('sinonimos') or {})} · SAP {len(sap)}")

    # 2e. FAMILIAS del puente (zona sugerida)
    for slug in ("baader-142-888", "baader-142-860"):
        rp = os.path.join(PWA, slug, "partes.json")
        if not os.path.exists(rp):
            continue
        pj = json.load(io.open(rp, encoding="utf-8"))
        for fam, datos in (pj.get("familias") or {}).items():
            for f in datos["figuras"]:
                if f["hoja"] not in hojas:
                    errores.append(f"{slug} familia {fam}: hoja {f['hoja']} no existe")
        cob = pj.get("cobertura")
        if cob and cob["exacta"] + cob["zona"] + cob["sinDato"] != cob["total"]:
            errores.append(f"{slug}: la cobertura no suma ({cob})")

    # 3. cobertura de anclas
    anclados = sum(len(d.get("tags", [])) for d in datos_hoja.values())
    print(f"hojas: {len(hojas)} · filas con pos: {tot_filas} · posiciones ancladas (tags): {anclados}")
    con_ancla = sum(1 for d in datos_hoja.values() if d.get("tags"))
    print(f"figuras con al menos un ancla: {con_ancla}/{len(hojas)}")

    print()
    for a in avisos[:20]:
        print("AVISO:", a)
    if errores:
        print(f"\n{len(errores)} ERRORES:")
        for e in errores[:40]:
            print(" -", e)
        sys.exit(1)
    print("AUDITORIA OK: todos los links aterrizan")


if __name__ == "__main__":
    main()
