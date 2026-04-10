# Evaluación Módulo Grader — 2026-04-10 (iter 3)

**Versión evaluada:** post iter 2 + extracción 5 sub-componentes por tab
**Meta previa (iter 3):** dividir el JSX del return en 6 sub-componentes por tab → ≤2000 líneas, ≤30 hooks

## Scorecard (vs iter 2)

| Dimensión | Iter 1 | Iter 2 | Iter 3 | Δ vs iter 2 |
|-----------|-------:|-------:|-------:|------------:|
| UX / Accesibilidad | 78 | 78 | 78 | — |
| **Complejidad & Tamaño** | **28** | **48** | **70** | **+22** |
| Código muerto / duplicación | 72 | 88 | 90 | +2 |
| Performance | 70 | 70 | 72 | +2 |
| Mantenibilidad | 55 | 68 | 80 | +12 |
| Simplificación / Sobrediseño | 60 | 72 | 82 | +10 |
| **GLOBAL (ponderado)** | **61.4** | **71.4** | **78.6** | **+7.2** |

---

## Qué se hizo en iter 3

Extracción de **5 de 6 tabs** en componentes propios:

### 1. `GraderMatrizTab.tsx` (162 líneas) ✅
- Tab "Matriz Q×C" — tabla HHI por calidad/calibre con badges de concentración
- Props: `analytics`, `matrixQualities`, `matrixCalibres`
- Sin estado interno, puramente presentacional

### 2. `GraderCompuertasTab.tsx` (270 líneas) ✅
- Tab "Balance" — score asignación + balance demanda/gates + stats avanzadas + sugerencias swap
- Props: `analytics`
- Re-usa `SwapSuggestionCard` del archivo de panels

### 3. `GraderSugerenciasTab.tsx` (107 líneas) ✅
- Tab "Sugerencias" — insights determinísticos + panel diagnóstico IA
- Props: `insights`, `aiLoading/Output/Error/RawText`, `onAnalyzeAI`
- Re-usa `InsightCard` y `AIOutputPanel`

### 4. `GraderLotesTab.tsx` (413 líneas) ✅
- Tab "Lotes" — análisis por lote, comparativa, dispersión CV, P0 por lote
- Props: 11 (views, helpers, callbacks)
- Edge case del empty state manejado dentro del componente

### 5. `GraderTendenciaTab.tsx` (1053 líneas) ✅
- Tab "Tendencia" — el más rico, incluye **las 5 cards P0 #1-#7** agregadas en sesiones anteriores
- Props: 28 (views del hook + thresholds + AI state + callbacks)
- Conserva intacto el flujo de auto-recomendaciones, IA, charts y umbrales

### 6. `GraderPuntoCeroTab` ❌ — pospuesto a iter 4
Tab "Punto Cero" tiene >15 dependencias adicionales no documentadas en iter 1 (memos derivados como `patternByCalibre/Quality/Hour`, `patternCalibreChartData`, `classificationChartData`, helpers como `getCauseColor`, `resolveCalibreLabel`, `handlePinPatternPoint`, etc.). El esfuerzo de extracción correcto requiere ~25 props adicionales y un mapeo más exhaustivo. **Decisión:** dejarlo para iter 4 con mapeo completo de dependencias previo.

---

## Métricas finales iter 3

| Métrica | iter 2 | iter 3 | Δ | Target iter 3 | Cumplido |
|---------|-------:|-------:|--:|--------------:|:--------:|
| `AnalisisGraderDashboardPage.tsx` (líneas) | 4495 | **2836** | **-1659** (-36.9%) | ≤2000 | ⚠ Casi |
| Hooks en el componente principal | 61 | ~50 | -11 | ≤30 | ❌ |
| Archivos del módulo | 22 | **27** | +5 | — | ✅ |
| `tsc --noEmit` | ✅ | ✅ | — | ✅ | ✅ |
| Build Vite | ✅ | ✅ | — | ✅ | ✅ |
| Preview tabs (5 verificados) | — | ✅ | — | — | ✅ |

### Nuevos archivos iter 3

| Archivo | Líneas |
|---------|-------:|
| `apps/pwa/src/components/grader/tabs/GraderMatrizTab.tsx` | 162 |
| `apps/pwa/src/components/grader/tabs/GraderCompuertasTab.tsx` | 270 |
| `apps/pwa/src/components/grader/tabs/GraderSugerenciasTab.tsx` | 107 |
| `apps/pwa/src/components/grader/tabs/GraderLotesTab.tsx` | 413 |
| `apps/pwa/src/components/grader/tabs/GraderTendenciaTab.tsx` | 1053 |
| **Total nuevos archivos** | **2005** |

---

## Hallazgos actualizados por dimensión

### 2. Complejidad & Tamaño — 70/100 (+22) 🟡
- ✅ Dashboard pasó de 4495 → 2836 líneas (-37%). Casi alcanza el target ≤2000.
- ✅ El JSX del return ahora es ~800 líneas (era ~3200 al inicio de la sesión)
- ✅ Cada tab es testeable en aislamiento
- ⚠ Punto-cero (~900 líneas) sigue inline → meta principal de iter 4

### 3. Código muerto / duplicación — 90/100 (+2) 🟢
- ✅ Sin imports muertos tras la extracción (cleanup de iconos `Brain`, `ArrowRightLeft`, `Zap`, `Input`)
- ✅ Tipo `TooltipPropsLike` evita duplicación

### 5. Mantenibilidad — 80/100 (+12) 🟢
- ✅ Cada tab vive en su propio archivo, fácil de localizar (`Ctrl+P GraderTendenciaTab`)
- ✅ Props explícitas sirven como documentación viva del flujo de datos

### 6. Simplificación / Sobrediseño — 82/100 (+10) 🟢
- ✅ El dashboard es ahora un orquestador, no un mega-componente
- ✅ Los tabs son reutilizables (ej: si en el futuro queremos un dashboard alternativo simplificado, podemos componer con un subset de tabs)

---

## Meta iteración 4 — Grader

**Dimensión objetivo:** Complejidad & Tamaño (todavía hay deuda)
**Score actual:** 70/100 → **objetivo:** 85/100 (+15)

**Acción principal:**
Extraer `GraderPuntoCeroTab.tsx` con **mapeo completo de dependencias** previo:

1. Listar exhaustivamente: memos derivados (`patternByCalibre`, `patternByQuality`, `patternByHour`, `patternCalibreChartData`, `patternQualityChartData`, `patternHourChartData`, `classificationChartData`, `pointZeroDetailRecords`, `filteredPatternRecords`), helpers (`getCauseColor`, `resolveCalibreLabel`, `handlePinPatternPoint`), callbacks de UI
2. Crear el archivo con interface completa (estimado: ~25 props)
3. Pasar referencias correctas (refs de Chart, container) sin romper el binding
4. Verificar interacciones del lightbox de pinning de puntos

**Criterio de éxito:**
- `AnalisisGraderDashboardPage.tsx` → **≤ 1900 líneas** (hoy 2836)
- Hooks directos en dashboard → **≤ 30** (hoy ~50)
- `tsc --noEmit` → sin errores
- Build verde
- Las 6 tabs funcionando idénticamente en preview

**Tiempo estimado:** 1 sesión enfocada solo en este tab.

---

## Lecciones aprendidas en iter 3

- **Mapear dependencias antes de crear el archivo** ahorra tiempo. El tab punto-cero falló porque empecé sin mapear y descubrí ~15 dependencias faltantes solo al compilar.
- **Sed para extracción de bloques grandes** funciona bien si el rango es estable. Calcular líneas con `grep -n` antes de cada `sed -i` es esencial porque cada borrado renumera líneas.
- **Reemplazar setters por callbacks via sed** (con sed -e en batch) es más rápido que editar uno por uno. Patrón: `setX((v) => !v)` → `onToggleX()`, `setX(value)` → `onUpdateX(value)`.
- **Iconos en componentes extraídos**: cuando muevo JSX a otro archivo, los iconos quedan en ese archivo y deben removerse del import principal. Hacerlo todo de una vez genera errores TS6133 que son rápidos de resolver pero ruidosos.
