"""Repara in-place los titulos cortados a mitad de palabra dentro de `descs`.

Las descripciones de aparato citan en que hojas trabaja: «<titulo>» (hoja N).
Ese titulo se cortaba duro a 48 caracteres y quedaban cosas como
«SM3 Aspirador · SM2 Cuchilla ranuradora · SM1 Ce» (visto en la ficha de B14
en produccion). El extractor ya corta bien; esto arregla lo YA generado sin
tener que volver a procesar los PDF: el titulo completo esta en el propio
indice, en hojas[].tituloEs.
"""
import glob
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extraer_plano_142 import recortar_titulo  # noqa: E402

PAT = re.compile(r'«([^»]*)» \(hoja (\d+)\)')


def reparar(ruta: str) -> tuple[int, int]:
    d = json.load(io.open(ruta, encoding="utf-8"))
    descs = d.get("descs") or {}
    if not descs:
        return 0, 0
    titulos = {h.get("blatt"): (h.get("tituloEs") or h.get("titulo") or "")
               for h in d.get("hojas", [])}
    cambios = 0

    def sub(m):
        nonlocal cambios
        completo = titulos.get(int(m.group(2)), "")
        # Solo se toca lo que el corte duro mutilo: el texto actual es un
        # PREFIJO del titulo completo y no es ya el titulo entero.
        if not completo or m.group(1) == completo or not completo.startswith(m.group(1)):
            return m.group(0)
        nuevo = recortar_titulo(completo)
        if nuevo == m.group(1):
            return m.group(0)
        cambios += 1
        return f"«{nuevo}» (hoja {m.group(2)})"

    for k, v in list(descs.items()):
        if isinstance(v, str):
            descs[k] = PAT.sub(sub, v)
    if cambios:
        io.open(ruta, "w", encoding="utf-8").write(
            json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    return cambios, len(descs)


if __name__ == "__main__":
    tot = 0
    for f in sorted(glob.glob("apps/pwa/public/planos/*/indice.json")):
        n, _ = reparar(f)
        if n:
            print(f"  {os.path.basename(os.path.dirname(f)):22} {n} titulos reparados")
        tot += n
    print(f"OK {tot} titulos reparados")
