# -*- coding: utf-8 -*-
"""Genera el CHECKLIST DE TERRENO para confirmar el puente electrico->pieza.

Para cada familia de aparatos del plano 888 que NO se puede mapear con certeza
desde los catalogos, lista: designacion + que es (desc del plano) + donde mirar
(figura candidata del despiece) + espacio para anotar lo leido en el rotulo
fisico. Lo confirmado se carga a scripts/planos/partes_curadas_142.json con
confianza "confirmado" y generar_partes_142.py lo integra.

Salida: OneDrive ⚙️ BAADER 142/CHECKLIST_TERRENO_PUENTE_ELECTRICO_142.md
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.abspath(__file__))
TRABAJO = os.path.join(RAIZ, "_staging", "baader-142-despiece-trabajo")
PWA = os.path.abspath(os.path.join(RAIZ, "..", "..", "apps", "pwa", "public", "planos"))
DESTINO = os.path.join(
    os.environ.get("ONEDRIVE", os.path.expanduser("~/OneDrive")),
    "ANTARFOOD", "⚙️ EQUIPOS PLANTA", "⚙️ BAADER 142",
    "CHECKLIST_TERRENO_PUENTE_ELECTRICO_142.md",
)

idx = json.load(io.open(os.path.join(PWA, "baader-142-888", "indice.json"), encoding="utf-8"))
partes = json.load(io.open(os.path.join(PWA, "baader-142-888", "partes.json"), encoding="utf-8"))
figs = json.load(io.open(os.path.join(TRABAJO, "figuras.json"), encoding="utf-8"))["figuras"]

descs = idx.get("descs", {})
mapeados = set(partes["aparatos"])

def hoja_de(sec):
    return next((n for n, f in enumerate(figs, 1) if f["seccion"] == sec), None)

CAJAS = [("70-2", "Caja de distribución 1"), ("70-3", "Caja de distribución 2"),
         ("70-5", "Caja de interruptor principal"), ("70-6", "Puesto de mando")]

def fila(tag):
    d = (descs.get(tag) or "").split(". Trabaja")[0][:70]
    return f"| ☐ | **{tag}** | {d} |  |  |"

lineas = [
    "# Checklist de terreno · Puente eléctrico → pieza física · BAADER 142",
    "",
    "Generado desde el plano 888 + catálogo de piezas.",
    "",
    "## Lo mejor: confirmar DESDE EL CELULAR, sin papel",
    "",
    "En la app, `Aprendizaje → Planos → BAADER 142`, toca el aparato (K7, B14…)",
    "y en el bloque **Pieza física** usa **«Confirmar en terreno»**. Tres respuestas:",
    "",
    "- **Sí, es esta pieza** → el vínculo queda confirmado con tu nombre y la fecha.",
    "- **Es otra pieza** → escribes el código que leíste en la etiqueta y ese pasa",
    "  a ser el bueno (el del catálogo queda a la vista, tachado).",
    "- **No existe en esta máquina** → se marca y deja de contar como pendiente.",
    "",
    "Cada confirmación sube el contador «confirmados en terreno» del plano: ese es",
    "el número que demuestra, con evidencia, cuánto del puente está verificado.",
    "",
    "## Este papel sirve para recorrer",
    "",
    "Úsalo como ruta (agrupa por zona lo que hay que mirar) y confirma en la app",
    "a medida que avanzas. Si prefieres anotar, la columna «código leído» sigue",
    "acá y después se carga.",
    "",
    "Columnas: ✓ | Designación | Qué es (según el plano) | Código/modelo leído | Foto (sí/no)",
    "",
]

# 1) Sensores ya mapeados: solo confirmar
lineas += ["## 1 · Sensores B1-B15 — YA MAPEADOS (solo confirmar el modelo)",
           "Según catálogo: B10/B14/B15 = **42303077** · resto = **42303109**. Figura 70-8"
           f" (hoja {hoja_de('70-8')} del plano de partes).", "",
           "| ✓ | Aparato | Qué es | Código leído | Foto |", "|---|---|---|---|---|"]
for t in sorted(mapeados, key=lambda x: int(re.sub(r'\D', '', x) or 0)):
    lineas.append(fila(t))

# 2) Sensores de las nuevas sin catalogo
b_nuevos = sorted((k for k in idx["indice"] if re.fullmatch(r"B\d+", k) and k not in mapeados),
                  key=lambda x: int(x[1:]))
lineas += ["", "## 2 · Sensores B de las máquinas 2022 — SIN catálogo (leer modelo en terreno)",
           "", "| ✓ | Aparato | Qué es | Código leído | Foto |", "|---|---|---|---|---|"]
lineas += [fila(t) for t in b_nuevos]

# 3) Gabinetes: K/Q/F
kqf = sorted((k for k in idx["indice"] if re.fullmatch(r"[KQF]\d+", k)),
             key=lambda x: (x[0], int(x[1:])))
cajas_txt = " · ".join(f"fig {s} «{n}» (hoja {hoja_de(s)})" for s, n in CAJAS)
lineas += ["", "## 3 · Gabinetes: contactores K, guardamotores Q, protecciones F",
           f"Cada componente lleva su designación en el riel. Figuras de referencia: {cajas_txt}.",
           "Anota además EN QUÉ caja está (1/2/principal/mando).", "",
           "| ✓ | Aparato | Qué es | Código leído + caja | Foto |", "|---|---|---|---|---|"]
lineas += [fila(t) for t in kqf]

# 4) Valvulas Y
ys = sorted((k for k in idx["indice"] if re.fullmatch(r"Y\d+", k)), key=lambda x: int(x[1:]))
lineas += ["", "## 4 · Electroválvulas Y (bloque neumático)",
           "", "| ✓ | Aparato | Qué es | Código leído | Foto |", "|---|---|---|---|---|"]
lineas += [fila(t) for t in ys]

# 5) Motores
ms = sorted((k for k in idx["indice"] if re.fullmatch(r"(M|SM)\d+", k)),
            key=lambda x: (x.rstrip("0123456789"), int(re.sub(r"\D", "", x))))
lineas += ["", "## 5 · Motores M / motores paso a paso SM",
           f"Figuras SM-Platte: {hoja_de('4-1-3') or '—'} y afines; placa del motor = marca+tipo.", "",
           "| ✓ | Aparato | Qué es | Código leído | Foto |", "|---|---|---|---|---|"]
lineas += [fila(t) for t in ms]

lineas += ["", "---", f"Total a confirmar: {len(mapeados) + len(b_nuevos) + len(kqf) + len(ys) + len(ms)}",
           "Entregar a Claude (foto de este checklist lleno o dictado) → carga a",
           "`partes_curadas_142.json` → badges a confirmado en la app."]

with io.open(DESTINO, "w", encoding="utf-8") as f:
    f.write("\n".join(lineas))
print(f"OK checklist -> {DESTINO}")
print(f"   B mapeados {len(mapeados)} · B nuevos {len(b_nuevos)} · K/Q/F {len(kqf)} · Y {len(ys)} · M/SM {len(ms)}")
