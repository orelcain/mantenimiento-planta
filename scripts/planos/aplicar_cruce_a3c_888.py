"""Aplica el cruce A3C -> repuestos sobre el partes.json del plano 888 (N2/N3).

Entrada: scripts/planos/cruce_a3c_888.json (minado 2026-10-07 de los catalogos
2006 `835_` y 2014 `499_EK-...` + maestro SAP de bodega; cada fila con fuentes).
Salida:  apps/pwa/public/planos/baader-142-888/partes.json (solo `aparatos` y
`cobertura`; las `familias` del generador quedan intactas).

Por que un paso aparte y no dentro de generar_partes_142.py: el generador
escribe IGUAL para el 860 (N1) y el 888 (N2/N3), y el hallazgo del cruce es
justamente que NO son iguales. La fig. 70-8 del catalogo 2006 (B1-B15 ->
42303109/42303077) vale para la N1; el catalogo 2014 de las nuevas trae otros
inductivos (42303107/42303108) y no dice cual va en cada B. Por eso en el 888
esas filas bajan a 'propuesto' y se listan los dos candidatos. El 860 no se toca.

Regla del usuario: solo lo que tengamos certeza. 'catalogo' = el fabricante
asocia la designacion con el codigo; todo lo demas es 'propuesto' con su razon.
Las confirmaciones de terreno viven en Firestore (planoVinculos), no aqui.

Correr DESPUES de generar_partes_142.py:  python scripts/planos/aplicar_cruce_a3c_888.py
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(RAIZ, "..", ".."))
CRUCE = os.path.join(RAIZ, "cruce_a3c_888.json")
PARTES = os.path.join(REPO, "apps", "pwa", "public", "planos", "baader-142-888", "partes.json")
FIGURAS = os.path.join(REPO, "apps", "pwa", "public", "data", "despiece-142-figuras.json")

# Candidatos que el minado dejo solo en texto (`pendiente`): la placa decide.
# SAP tomados del maestro de bodega (join exacto por codigo de fabricante).
CANDIDATOS = {
    **{f"SM{n}": [("41702013", "Motor paso a paso 1,8°", "3300016112"),
                  ("41702014", "Motor paso a paso 1,8°", "3300016111")] for n in range(1, 6)},
    **{y: [("34970060", "Electroválvula 2/2 G1/2", "3300070160"),
           ("34970061", "Electroválvula 2/2", None)] for y in ("Y13", "Y14", "Y53", "Y54", "Y55")},
}


# SAP de los candidatos sin join exacto en el maestro: el texto SAP del export
# de bodega nombra el codigo (p. ej. «INTERRUPTOR DE PROXIMIDAD 42303108»).
SAP_CANDIDATO = {
    "42303107": ("3300098470", "INTERRUPTOR 42303107", "C-13"),
    "42303108": ("3300084425", "INTERRUPTOR DE PROXIMIDAD 42303108", None),
}


def hoja_despiece(figuras, nr, fig):
    """Hoja del visor de despiece (catalogo 2006). Las figuras del 2014 no estan
    en el visor: sin hoja no hay boton «Ver dibujo», y eso es lo honesto."""
    if not fig or "2014" in str(fig):
        return None
    hoja_fig = figuras.get(nr)  # forma: [hoja, "70-8"]
    return hoja_fig[0] if hoja_fig and str(hoja_fig[1]) == str(fig) else None


def entrada(fila, nr, es, de, fig, pos, confianza, sap=None, sap_nombre=None, ubic=None,
            razon=None, fuentes=None, generacion=None, figuras=None):
    e = {
        "nr": nr,
        "es": es or "",
        "de": de or "",
        "fig": fig,
        "hoja": hoja_despiece(figuras, nr, fig),
        "pos": pos or fila["elemento"],
        "confianza": confianza,
        "nivel": fila.get("nivel") or "pieza",
    }
    if sap:
        e["sap"] = sap
        if sap_nombre:
            e["sapNombre"] = sap_nombre[:60]
        if ubic:
            e["sapUbicacion"] = ubic
    if razon:
        e["razon"] = razon
    if fuentes:
        e["fuentes"] = fuentes
    if generacion:
        e["generacion"] = generacion
    if fila.get("pendiente"):
        e["pendiente"] = fila["pendiente"]
    return e


def main():
    filas = json.load(io.open(CRUCE, encoding="utf-8"))
    partes = json.load(io.open(PARTES, encoding="utf-8"))
    figuras = json.load(io.open(FIGURAS, encoding="utf-8"))["codigos"]
    aparatos = partes["aparatos"]

    tocados = 0
    for f in filas:
        if not f.get("piezaFisica"):
            continue
        tag = f["elemento"]
        nuevas = []
        fuentes = f.get("fuentes") or []
        es_2006 = any(s.startswith("835") for s in fuentes) and not any(s.startswith("499") for s in fuentes)
        if f.get("codigoFabricante"):
            conf = f.get("confianza") or "propuesto"
            razon = f.get("razon")
            gen = None
            # La fig. 70-8 (2006) es de la N1: en el 888 no es certeza.
            if f.get("alternativas") and es_2006:
                conf = "propuesto"
                gen = "N1 (catálogo 2006)"
                razon = razon or ("El catálogo 2006 (máquina antigua) asocia esta designación con "
                                  "este código; el catálogo 2014 de las nuevas trae otro modelo. "
                                  "Leer la etiqueta en terreno.")
            nuevas.append(entrada(f, f["codigoFabricante"], f.get("descripcionFabricante"),
                                  f.get("descripcionFabricanteDE"), f.get("figura"), f.get("posicion"),
                                  conf, f.get("sap"), f.get("nombreSap"), f.get("ubicacion"),
                                  razon, fuentes, gen, figuras))
            for a in f.get("alternativas") or []:
                if "codigoFabricante" not in a:
                    # varios candidatos sin asignar: uno por fila, todos propuestos
                    for nr in a.get("candidatos") or []:
                        sap, nom, ubic = SAP_CANDIDATO.get(nr, (None, None, None))
                        nuevas.append(entrada(f, nr, "Sensor de proximidad inductivo", None, None,
                                              f.get("posicion"), "propuesto", sap, nom, ubic,
                                              a.get("razon"), a.get("fuentes"), a.get("generacion"),
                                              figuras))
                    continue
                sap = (a.get("sap") or [{}])[0] if isinstance(a.get("sap"), list) else {}
                nuevas.append(entrada(f, a["codigoFabricante"], f.get("descripcionFabricante"), None,
                                      None, f.get("posicion"), "propuesto", sap.get("sap"),
                                      sap.get("nombreSap"), sap.get("ubicacion"), a.get("razon"),
                                      a.get("fuentes"), a.get("generacion"), figuras))
        elif tag in CANDIDATOS:
            for nr, es, sap in CANDIDATOS[tag]:
                nuevas.append(entrada(f, nr, es, None, None, tag, "propuesto", sap, None, None,
                                      "Candidato del catálogo: la placa del equipo decide.",
                                      fuentes, None, figuras))
        if nuevas:
            aparatos[tag] = nuevas
            tocados += 1

    # Cobertura del 888 recalculada con la misma definicion que el generador.
    con_pieza = [t for t in aparatos if aparatos[t]]
    cob = partes.get("cobertura", {})
    cob.update({
        "exacta": len(con_pieza),
        "conSap": sum(1 for t in con_pieza if any(e.get("sap") for e in aparatos[t])),
        "catalogo": sum(1 for t in con_pieza if any(e.get("confianza") == "catalogo" for e in aparatos[t])),
    })
    partes["cobertura"] = cob
    with io.open(PARTES, "w", encoding="utf-8") as fh:
        json.dump(partes, fh, ensure_ascii=False)
    print(f"888: {tocados} designaciones del cruce A3C · con pieza {cob['exacta']} · "
          f"con SAP {cob['conSap']} · según catálogo {cob['catalogo']}")


if __name__ == "__main__":
    main()
