"""Extrae la figura 00 «Piezas de desgaste» del catálogo BAADER 200.

Por qué un script aparte: el parser general asocia cada tabla a un CONJUNTO
(código de 10 dígitos en la cabecera) y la figura 00 no tiene ninguno — no es
un conjunto, es una lista de las piezas que se cambian seguido. Quedaba con 0
filas mientras las otras 200 figuras se parseaban bien; tocar el parser general
por este caso arriesgaba las que ya funcionan.

Salida: scripts/planos/desgaste_200.json  →  lo consume `indice` como
`destacados`, igual que las 9 de la 142.
"""
import io
import json
import os
import re
import sys

import fitz

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(os.path.expanduser("~"), "OneDrive", "ANTARFOOD", "⚙️ EQUIPOS PLANTA",
                   "⚙️ BAADER 200", "INFO ALOJADA EN TELEGRAM BAADER 200", "DOCUMENTOS",
                   "549_BAADER 200 n°parte y materiales.pdf")
PAGINA = 10          # la única de la figura 00
PRIMERA_FILA = 16    # antes va la cabecera cuatrilingüe
RE_COD = re.compile(r"^(.*?)[\. ]{4,}(\d{5,10})\s*$")


def prefijo_comun(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def limpiar_es(bloque, k):
    """El ES son las últimas líneas del bloque cuatrilingüe (DE/EN/FR/ES).

    OJO: el catálogo NO tradujo la 2ª línea de varias piezas — dice
    «Tôle de guidage des nageoire, derecha», francés con la última palabra en
    castellano. Mostrar eso como español confunde, así que si esa línea es
    casi idéntica a la francesa se descarta y queda solo el nombre.
    """
    es = [x for x in bloque[k + 1:] if x]
    if len(es) < 2:
        return " ".join(es).strip()
    ultima, previa = es[-1], es[-2]
    for otra in bloque[:-1]:
        if otra is ultima:
            continue
        if prefijo_comun(otra, ultima) > len(ultima) * 0.6:
            # Francés sin traducir, PERO el sufijo tras la última coma sí está
            # en castellano y es lo que distingue la pieza: sin él, «derecha» e
            # «izquierda» quedan con el mismo nombre y no se sabe cuál pedir.
            lado = ultima.rsplit(",", 1)[-1].strip() if "," in ultima else ""
            return f"{previa} · {lado}".strip(" ·") if lado else previa.strip()
    return f"{previa} {ultima}".strip()


def main():
    lineas = [l.rstrip() for l in fitz.open(PDF)[PAGINA].get_text().splitlines()]
    filas, i = [], PRIMERA_FILA
    while i < len(lineas):
        l = lineas[i].strip()
        if l.isdigit() and len(l) <= 3:
            bloque, j = [], i + 1
            while j < len(lineas) and not (lineas[j].strip().isdigit() and len(lineas[j].strip()) <= 3):
                if lineas[j].strip():
                    bloque.append(lineas[j].strip())
                j += 1
            for k, b in enumerate(bloque):
                m = RE_COD.match(b)
                if m:
                    filas.append({
                        "pos": l,
                        "nr": m.group(2),
                        "de": " ".join(bloque[:k] + [m.group(1).strip()]).strip(),
                        "es": limpiar_es(bloque, k),
                    })
                    break
            i = j
        else:
            i += 1

    destino = os.path.join(RAIZ, "desgaste_200.json")
    io.open(destino, "w", encoding="utf-8").write(
        json.dumps({"fig": "00", "filas": filas}, ensure_ascii=False, indent=1))
    print(f"OK {len(filas)} piezas de desgaste -> {destino}")
    for f in filas:
        print(f"  {f['pos']:>2}  {f['nr']:>10}  {f['es'][:52]}")


if __name__ == "__main__":
    main()
