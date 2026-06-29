# OEE de Área (end-to-end) — Metodología y Roadmap

> Estado: **propuesta / roadmap** (2026-06-27). Disparado por una observación correcta de Orel:
> el OEE que mostramos hoy es el de las **Baader 142**, no el del **área de Eviscerado**.
> Llamarlo "OEE del área" sobre-afirma. Este doc define cómo medirlo bien, por capas.

## 0. Premisa de la app
Cada KPI debe servir para **demostrar con datos que Mantención optimiza el proceso** y para
**detectar oportunidades de mejora** (paros, micro-paradas, velocidad, rechazo). El OEE bien
medido + descompuesto en pérdidas **es** ese mapa de oportunidades.

## 1. Estado actual (honesto)
- **Lo que medimos hoy = OEE de las 3 Baader 142** (evisceradoras), no del área.
  - **A** (Disponibilidad) = `shiftRuntime` de cada Baader (uptime / tiempo productivo programado). Fuente: **Shoplogix**.
  - **R** (Rendimiento) = `overallRatio` (ciclos reales / esperados, tope 1.0). Fuente: **Shoplogix**.
  - **Q** (Calidad) = `1 − P0%` (rechazo "Punto Cero" del Grader). Fuente: **Excel del Grader**.
  - **OEE = A × R × Q**, promediando A/R de las 3 Baader; Q a nivel de línea.
- **Cobertura de datos:** Shoplogix **solo** instrumenta las **3 Baader** (`shoplogixMachines.ts`).
  NO hay datos de: bombeo de acopio, chiller, desangrador, cintas, Marel HG, corte de cabeza, etiquetado.

## 2. Verdad metodológica (clave)
1. **OEE es, por definición, un KPI de EQUIPO** ("Overall Equipment Effectiveness").
2. **Promediar el OEE de las máquinas NO da el OEE del proceso.** En una línea en serie las
   pérdidas **se multiplican/propagan**, no se promedian. Ej: 5 etapas al 90% de disponibilidad
   acopladas sin pulmón → línea ≈ 0.9⁵ = **59%**, no 90%.
3. **OEE de línea/área = se mide END-TO-END a la salida:**
   - A_línea = tiempo en que la **línea** produjo / tiempo planificado.
   - R_línea = throughput real vs. **velocidad del cuello de botella** (la etapa que limita).
   - Q_línea = **buenas al final / total que entró** (calidad acumulada, compone todas las etapas).
4. **Alternativa válida:** medir el OEE en el **cuello de botella** (gobierna el flujo de la línea).
5. **OEE por máquina = capa de DIAGNÓSTICO** (Pareto: qué etapa arrastra y por qué). Convive con
   el OEE de línea (número titular). NO se suman: cumplen roles distintos.

## 3. Mapa del proceso — Área Eviscerado (Chonchi)
Flujo real (según Orel) y qué aporta cada etapa al OEE:

| # | Etapa | Tipo | Aporta a | ¿Datos hoy? |
|---|-------|------|----------|-------------|
| 1 | Bombeo de peces (Acopio, Sist. 1/2) | Transporte | **Disponibilidad** (si para → *starving*, línea sin pescado) | ❌ |
| 2 | Chiller (tiempo, Tº salmón) | Proceso | **Calidad** (driver) | ❌ |
| 3 | Desangrador (tiempo) | Proceso | **Calidad** (driver) | ❌ |
| 4 | Cinta elevadora 1 ("cuello de cisne") + cintas | Transporte | **Disponibilidad** (si para → para la línea) | ❌ |
| 5 | Marel HG (alimenta las Baader) | Máquina | **A · R** (posible cuello de botella) | ❌ |
| 6 | **Baader 142 × 3** (eviscerado) | Máquina | **A · R** | ✅ Shoplogix |
| 7 | Corte de cabeza | Máquina | **A · R · Q** | ❌ |
| 8 | **Grader** (clasifica calibre/calidad) | Máquina | **Q** (P0%) | ✅ Excel |
| 9 | Etiquetado por calidad/peso | Máquina | **A · Q** | ❌ |

**Lectura:** las cintas/bombeo **no llevan OEE propio** → se miden por su **downtime que se propaga**.
El chiller/desangrador/temperaturas son **parámetros de proceso que afectan Q**. Las máquinas de
transformación (Marel, Baader, corte, Grader, etiquetadora) sí llevan **A·R·Q** donde aplique.

## 4. Las 6 Grandes Pérdidas (el mapa de oportunidades)
| Factor | Pérdida | ¿La capturamos hoy? |
|--------|---------|---------------------|
| Disponibilidad | Averías / paros | ✅ (paros Shoplogix ≥5 min en Baader) |
| Disponibilidad | Setup / ajustes | ⚠️ parcial (no separado) |
| Rendimiento | **Micro-paradas (<5 min)** | ❌ (hoy caen dentro de R, sin separar) |
| Rendimiento | Velocidad reducida | ⚠️ (dentro de R, sin separar de micro-paradas) |
| Calidad | Rechazo de arranque | ⚠️ (dentro de P0%) |
| Calidad | Rechazo en régimen | ⚠️ (dentro de P0%) |

Separar **micro-paradas vs. velocidad reducida** requiere estados Shoplogix más finos (hoy no se distinguen).

## 5. Benchmarks (con cuidado)
- **≥ 85%** = clase mundial · **~60%** = típico manufactura · **< 40%** = bajo.
- ⚠️ Estos benchmarks son para **una máquina / el cuello de botella**. Un **OEE de línea** compone
  pérdidas de varias etapas → **da naturalmente más bajo**. Comparar el cuello vs. benchmark;
  usar el OEE de línea para seguir el conjunto, no para compararlo 1:1 contra el 85%.

## 6. Plan por fases
### Fase A — Honestidad + diagnóstico (FACTIBLE YA, con datos actuales)
- [x] Rotular el KPI: **"OEE Evisceradoras (Baader)"**, no "del área"; tooltip honesto sobre el alcance. *(v3.75.12)*
- [ ] Vista **"¿qué Baader arrastra?"**: resaltar la peor (menor A×R), ordenar por pérdida.
- [ ] Encuadre **6 pérdidas** en el detalle por máquina (paros vs. rendimiento vs. calidad).

### Fase B — Extender cobertura, etapa por etapa
- [ ] Marel HG y corte de cabeza a Shoplogix (si tienen contador/estado) → A·R por etapa.
- [ ] Cintas y bombeo: capturar **downtime** (Shoplogix o captura manual de paros) → propaga a A_línea.
- [ ] Chiller/desangrador/Tº: registrar **parámetros de proceso** (mediciones) → linkear a pérdidas de Q.
- [ ] Definir el **cuello de botella** del área (probablemente Marel o Baader) y medir su OEE como proxy de línea.

### Fase C — OEE de línea end-to-end
- [ ] A_línea = línea produjo / planificado (desde el primer paro que detiene el flujo).
- [ ] R_línea = throughput de salida / velocidad del cuello de botella.
- [ ] Q_línea = buenas al final (post-Grader/etiquetado) / total que entró (post-bombeo).
- [ ] OEE_línea = A_línea × R_línea × Q_línea, con su Pareto de pérdidas por etapa.

## 7. Limitación honesta
El OEE de área **real** está **gobernado por la cobertura de datos**. Hoy solo tenemos las Baader y
el Grader; el resto requiere instrumentar (Shoplogix/PLC/sensores) o **capturar manualmente** los
paros/parámetros. La **Captura Rápida de Intervención** (Análisis de Turno) ya es un canal para
empezar a registrar paros de cintas/bombeo a nivel de área hasta que haya telemetría.
