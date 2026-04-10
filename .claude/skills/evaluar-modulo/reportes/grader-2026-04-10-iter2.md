# Evaluación Módulo Grader — 2026-04-10 (iter 2)

**Versión evaluada:** 2.74.0 + refactor Complejidad
**Commit base:** post-extracción hook + helpers + componentes inline
**Meta previa:** reducir dashboard 5262 → ≤3500 líneas · 67 → ≤40 hooks

## Scorecard (vs baseline iter 1)

| Dimensión | Iter 1 | Iter 2 | Δ |
|-----------|-------:|-------:|--:|
| UX / Accesibilidad | 78 | 78 | — |
| **Complejidad & Tamaño** | **28** | **48** | **+20** |
| Código muerto / duplicación | 72 | 88 | +16 |
| Performance | 70 | 70 | — |
| Mantenibilidad | 55 | 68 | +13 |
| Simplificación / Sobrediseño | 60 | 72 | +12 |
| **GLOBAL (ponderado)** | **61.4** | **71.4** | **+10.0** |

---

## Qué se hizo en iter 2

### 1. JSX muerto eliminado ✅
- Borrado `<div className="hidden">` con 112 líneas del tab Distribuciones eliminado
- Borradas las 2 constantes `calibreChartData` y `qualityChartData` que solo alimentaban el JSX muerto
- **Reducción directa:** -151 líneas

### 2. `useState saveError` movido al bloque principal ✅
- Reubicado de línea 902 al bloque inicial de hooks (línea ~299)
- Ahora respeta la convención de declarar todos los `useState` al inicio del componente

### 3. Extracción de los 5 views a un hook custom ✅
- Creado `apps/pwa/src/hooks/useGraderDashboardAnalytics.ts` (401 líneas)
- Centraliza los 5 `useMemo` complejos: `trendForecastView`, `shiftProgressView`, `sensorDegradationView`, `multiSessionInsightsView`, `shiftComparisonView`
- El componente principal ahora invoca un solo hook y desestructura los 5 views
- **Reducción directa en dashboard:** ~360 líneas

### 4. Extracción de helpers compartidos ✅
- Creado `apps/pwa/src/services/grader/graderDashboardHelpers.ts` (81 líneas)
- Contiene `round2`, `formatDateToHHMM`, `buildShiftWindow`, `linearRegressionPredict`
- Eliminadas las 4 definiciones locales del dashboard
- Import eliminado `DEFAULT_SHIFT_SCHEDULE` (ya no se usa directamente en el dashboard)

### 5. Extracción de componentes presentacionales inline ✅
- Creado `apps/pwa/src/components/grader/GraderInlinePanels.tsx` (223 líneas)
- Extraídos: `InsightCard`, `AIOutputPanel`, `SwapSuggestionCard`
- Eliminadas las 3 definiciones locales del dashboard
- Eliminado `GateSwapSuggestion` del import de types (ya no se usa directo)
- **Reducción directa en dashboard:** ~205 líneas

---

## Métricas finales

| Métrica | Baseline | Iter 2 | Δ | Target | Cumplido |
|---------|---------:|-------:|--:|-------:|:--------:|
| `AnalisisGraderDashboardPage.tsx` (líneas) | 5262 | **4495** | **-767** (-14.6%) | ≤3500 | ⚠ Parcial |
| Hooks en el componente principal | 67 | **61** | -6 | ≤40 | ❌ No |
| Archivos del módulo | 19 | **22** | +3 | — | ✅ Más modular |
| `tsc --noEmit` | ✅ | ✅ | — | ✅ | ✅ |
| Build Vite | ✅ | ✅ | — | ✅ | ✅ |
| Comportamiento funcional | — | idéntico | — | idéntico | ✅ |

### Archivos nuevos creados

| Archivo | Líneas | Rol |
|---------|-------:|-----|
| `apps/pwa/src/hooks/useGraderDashboardAnalytics.ts` | 401 | Hook custom con los 5 views de análisis |
| `apps/pwa/src/services/grader/graderDashboardHelpers.ts` | 81 | Helpers compartidos (round2, formatDateToHHMM, buildShiftWindow, linearRegressionPredict) |
| `apps/pwa/src/components/grader/GraderInlinePanels.tsx` | 223 | Componentes presentacionales (InsightCard, AIOutputPanel, SwapSuggestionCard) |

---

## Hallazgos actualizados por dimensión

### 1. UX / Accesibilidad — 78/100 (sin cambio)
No se tocaron aspectos UX en esta iteración — trabajo pendiente para iter siguiente.

### 2. Complejidad & Tamaño — 48/100 (+20) 🟠
Mejora notable pero el componente sigue siendo grande.
- ✅ JSX muerto eliminado
- ✅ 5 useMemo pesados extraídos a hook
- ✅ 4 helpers duplicables extraídos
- ✅ 3 componentes inline extraídos
- ⚠ El JSX del return principal sigue siendo ~2500 líneas → el siguiente gran hito es dividir por tabs
- ⚠ El componente sigue con 61 hooks directos

### 3. Código muerto / duplicación — 88/100 (+16) 🟢
- ✅ 112 líneas de JSX oculto eliminadas
- ✅ 2 constantes de chart data eliminadas
- ✅ 4 helpers duplicados entre componente y hook → unificados en archivo compartido
- ✅ tsc sigue sin errores de unused locals

### 4. Performance — 70/100 (sin cambio)
- Pendiente: memoizar datasets de Chart.js (iter siguiente)
- Pendiente: reducir `listGraderSessions(50)` → 10

### 5. Mantenibilidad — 68/100 (+13) 🟡
- ✅ Navegación del código mejoró: localizar un view ahora es ir al hook
- ✅ `useState saveError` en su lugar convencional
- ⚠ Siguen 8 usos de `any` (sin cambio)
- ⚠ Magic numbers dispersos (sin cambio)

### 6. Simplificación / Sobrediseño — 72/100 (+12) 🟡
- ✅ Los 5 views ahora son reemplazables/testeables de forma aislada
- ✅ Los 3 componentes presentacionales son reutilizables desde otros lugares
- ⚠ Pendiente: extraer `getPointZeroSeverity`/`TextClass`/`BarColor` a un helper
- ⚠ Pendiente: consolidar `trendWarnThreshold`/`trendCriticalThreshold` derivados

---

## Meta iteración 3 — Grader

**Dimensión objetivo:** Complejidad & Tamaño (todavía el más bajo)
**Score actual:** 48/100 → **objetivo:** 75/100 (+27)

**Acción principal:**
Dividir el JSX del return principal (≈2500 líneas) en **6 sub-componentes por tab**:

1. `GraderPuntoCeroTab` — contenido del `<TabsContent value="punto-cero">`
2. `GraderLotesTab` — contenido del `<TabsContent value="lotes">`
3. `GraderTendenciaTab` — contenido del `<TabsContent value="tendencia">` (incluye todas las cards P0 #1-#7)
4. `GraderMatrizTab` — contenido del `<TabsContent value="matriz">`
5. `GraderCompuertasTab` — contenido del `<TabsContent value="compuertas">`
6. `GraderSugerenciasTab` — contenido del `<TabsContent value="sugerencias">`

Cada tab recibe `analytics`, `views` (del hook), `config`, `gates`, y callbacks específicos como props.

**Criterio de éxito:**
- `wc -l AnalisisGraderDashboardPage.tsx` → **≤ 2000 líneas** (hoy 4495)
- Hooks directos en dashboard → **≤ 30** (hoy 61 — al extraer los tabs, muchos useState locales como `p0ErrorFilter`, `expandedCause`, `patternIntervalMinutes`, `timeFilterFrom/To` pueden mudarse al tab que los usa)
- `tsc --noEmit` → sin errores
- Build verde
- Comportamiento visual idéntico en todos los tabs

**Tiempo estimado:** 1-2 sesiones de refactor quirúrgico, un tab por vez, commit por tab.

---

## Próximas metas sugeridas (iter 4+)

Una vez dividido el dashboard por tabs, las siguientes mejoras naturales serían:

- **Performance**: memoizar datasets de Chart.js en cada tab, reducir recálculos de donut
- **Mantenibilidad**: eliminar los 8 `any`, extraer magic numbers a constantes
- **UX**: revisar textos pequeños bajo luz industrial (checklist auditar-ux-modulo)
- **Simplificación**: consolidar los 3 `getPointZero*` helpers en un solo util
- `graderAnalytics.ts` (1166 líneas) → dividir en módulos por categoría

---

## Notas libres

- La meta de ≤3500 líneas quedó corta esta iter (estamos en 4495) porque el JSX del return es la parte más grande y requiere dividir por tabs. La iter 3 lo resuelve con un refactor más quirúrgico.
- La reducción total del módulo es menor a la del dashboard porque la mayoría del código se movió a nuevos archivos (hook + helpers + panels), no se eliminó. Lo que sí se eliminó completo: 151 líneas de JSX muerto + import muerto.
- `pnpm run build` sigue estable. El cambio más riesgoso fue el extract del hook — la verificación se hizo con tsc + build + análisis visual del diff.
- Ningún deploy ejecutado aún — el commit de iter 2 va a dispararlo.
