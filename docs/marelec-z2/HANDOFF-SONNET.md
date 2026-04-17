# Handoff Sonnet — Implementación P1.9 + P1.10 (Grader Producto UX)

> Generado por Opus 4.7 en sesión 2026-04-17. Pick up and code.
> **Contexto del plan**: [`CLAUDE.md` sección P1.9 y P1.10] + [`docs/marelec-z2/parameters.md`]
> **Mockup navegable**: http://localhost:5173/mantenimiento-planta/producto-v2-mockup.html
> **Fuente visual**: [`apps/pwa/public/producto-v2-mockup.html`](../apps/pwa/public/producto-v2-mockup.html)

---

## 🎯 Objetivo

Rediseñar el tab **Producto** de `AnalisisGraderGatesConfigPage.tsx` con progressive disclosure + motor de sugerencias IA trazables + modales de medición mecánica (slow-mo reset flipper + tacómetro SKF cinta).

Constraints del usuario:
- ✅ Peso en gramos (NO convertir a kg — otros módulos leen gramos)
- ✅ AutoField por campo (largo y ancho independientes, NO toggle global)

---

## 📋 Orden de implementación sugerido

### FASE 1 — Refactor estructural del tab Producto (commit único)
- Reestructurar `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderGatesConfigPage.tsx` en 3 capas:
  - **Hero**: especie + peso + pockets + largo/ancho + diagrama arriba + pill verdict
  - **⚙️ Equipo flipper** (`<details>` abierto): 3 sub-cards (ciclo software + reset mecánico + paleta)
  - **📐 Diagnóstico técnico** (`<details>` cerrado): análisis pockets + timing flipper + fórmula
- Mover el `BeltVisualizer` actual al hero (bajo especie/peso)
- Agregar pill verdict 🟢🟡🔴 basado en ratio pez/paso
- Colapsar fórmula FishBase del hero a tooltip + sección diagnóstico

**Archivos a tocar:**
- `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderGatesConfigPage.tsx` (split probablemente necesario)
- `apps/pwa/src/services/grader/types.ts` (nuevos campos — ver FASE 2)

**Commit sugerido:**
```
refactor(grader): tab Producto en 3 capas progressive disclosure v2.113.0
```

### FASE 2 — Modelo de datos para parámetros Z2

Agregar a `GraderPhysicalConfig` (en `types.ts`):

```typescript
export interface GraderPhysicalConfig {
  // ... campos existentes ...

  // Z2 flipper timing (ms)
  flipperDelayOpenMs?: number       // default 150 (Z2 delayFlipperOpen)
  flipperMinOpenTimeMs?: number     // default 350 (Z2 minFlipperOpenTime)
  flipperDelayCloseMs?: number      // default 150 (Z2 delayFlipperClose)

  // Reset mecánico cilindro (s)
  flipperMechanicalResetS?: number  // medido con slow-mo, default undefined (queda estimado)
  flipperMechanicalMeasuredAt?: number  // timestamp última medición

  // Múltiples cintas (ver FASE 4)
  gradingBeltSpeedMs?: number       // default 0.70 (Z2 maxSpeed=700 mm/s)
  zBeltSpeedMs?: number             // default 0.42 (Z2 Z-belt maxSpeed=420 mm/s)
  accelBelt1SpeedMs?: number        // medir
  accelBelt2SpeedMs?: number        // medir

  // Paleta
  flipperPaddleLengthMm?: number    // default 475
  flipperHeightAboveBeltMm?: number // default 0.5

  // Gate/batch timing Z2
  delayBeforeGateCloseMs?: number   // default 400
  delayGateCloseMs?: number         // default 500
  minGateOpenMs?: number            // default 0
  maxBinWeightG?: number            // default 25000
}
```

### FASE 3 — Motor IA sugerencias punto cero (cards expandibles)

Crear carpeta `apps/pwa/src/services/grader/suggestions/`:

```
suggestions/
├── types.ts                          # interfaz PointZeroSuggestion
├── suggestFishBaseLength.ts          # peso + especie → largo
├── suggestFishBaseWidth.ts           # largo + especie → ancho
├── suggestHistoricalCadence.ts       # histórico N turnos → cadencia esperada
├── suggestPocketCount.ts             # ratio → pocketCount óptimo
├── suggestResetFreshness.ts          # timestamp última medición ≥30 días
└── useSuggestionEngine.ts            # orquestador hook
```

**Interfaz base:**
```typescript
export interface PointZeroSuggestion {
  id: string
  parameter: string
  currentValue: number | string
  suggestedValue: number | string
  unit: string
  source: 'fishbase' | 'historical' | 'batch' | 'geometric' | 'datasheet'
  sourceLabel: string
  reasoning: string
  formula?: string
  dataPoints: Array<{ label: string; value: string; detail?: string }>
  confidence: 'high' | 'medium' | 'low'
  confidenceReason: string
  impactText?: string
  severity: 'info' | 'recommended' | 'warning'
  applyFn: () => void
  ignoreFn?: () => void
}
```

**Componentes UI:**
- `SuggestionCard.tsx` — card expandible con sección "🧠 Por qué" + "📊 Datos usados" + "🔬 Fórmula" + "🎯 Confianza" + "⚠️ Impacto" + botones Aplicar/Ignorar
- `SuggestionsPanel.tsx` — lista de cards, filtra por severity, muestra contador "N mejoras sugeridas"

Ubicar el panel **entre el Hero y la capa Equipo**.

### FASE 4 — Múltiples cintas en el modelo

Actualmente la app asume 1 cinta (grading) a 1.28 m/s. Real:
- Z-belt 0.42 m/s
- Grading belt 0.70 m/s
- Acceleration belts (medir)

Crear tab "Cintas" con inputs por cada una. Los cálculos del análisis pockets deben usar la **grading belt** (donde están los flippers), no la z-belt.

Archivos posibles:
- `AnalisisGraderGatesConfigPage.tsx` tab "Cintas" (ya existe? verificar)
- Actualizar hooks que asumen belt speed único

### FASE 5 — Modales de medición (dos)

#### Modal A — Slow-mo reset flipper
Ubicación: botón "🎥 Medir con slow-mo" en sub-card "Reset mecánico cilindro neumático"

Contenido (ver mockup slowMoModal):
- SVG iPhone 240fps + flipper multi-frame
- 6 pasos: Servicio → Probar salidas → grabar → contar frames → dividir /240
- Inputs: frames contados + fps + pocket + presión bar
- Resultado calculado en vivo: `frames / fps`
- Botón Guardar → escribe a Firestore collection `flipperTimingMeasurements`

**Firestore schema:**
```typescript
// flipperTimingMeasurements/{autoId}
{
  timestamp: number,
  pocketOrFlipper: string,  // ej: "flipper 3"
  seconds: number,
  method: 'slowmo' | 'tachometer' | 'datasheet' | 'manual',
  fpsUsed?: number,         // si slow-mo
  framesUsed?: number,      // si slow-mo
  pressureBar?: number,
  userId: string,
  notes?: string
}
```

#### Modal B — Tacómetro SKF (velocidad cinta)
Ubicación: botón "⚙️ Medir con tacómetro" en input velocidad cinta

Contenido (ver mockup tachModal):
- SVG vista lateral: belt + tacómetro SKF + DO/DON'T callouts + 3 zonas
- 5 pasos: modo producción → START → contacto perpendicular → HOLD → promediar
- Inputs: 3 lecturas (zona 1/2/3) + programa Z2 activo + observaciones
- Promedio calculado en vivo + desvío estándar
- Guardar → Firestore collection `beltSpeedMeasurements`

**Firestore schema:**
```typescript
// beltSpeedMeasurements/{autoId}
{
  timestamp: number,
  belt: 'grading' | 'z' | 'accel1' | 'accel2',
  readings: [number, number, number],  // m/s
  average: number,
  stdev: number,
  tool: 'SKF TMRT-1' | string,
  programActive?: string,
  notes?: string,
  userId: string
}
```

### FASE 6 — Audit trail cambios punto cero

Colección `graderConfigChangeLog/{autoId}`:
```typescript
{
  timestamp: number,
  userId: string,
  parameter: string,           // 'flipperMinOpenTimeMs'
  previousValue: any,
  newValue: any,
  source: 'suggestion' | 'manual' | 'measurement' | 'z2-import',
  suggestionId?: string,
  suggestionMetadata?: {...},  // snapshot del card
  notes?: string
}
```

Hook `useConfigChangeLogger` que intercepte cambios a `GraderPhysicalConfig` y emita al log.

A futuro: pantalla "Historial punto cero" con timeline.

---

## 🧪 Tests a agregar

- `suggestFishBaseLength.test.ts` — casos: Salar 4.26kg → 73cm, Coho 3kg → 62cm, edge: peso 0 → null
- `suggestHistoricalCadence.test.ts` — casos: n<10 → null, n≥10 → promedio, con/sin outliers
- `suggestPocketCount.test.ts` — casos: ratio 0.1 → sugerir menos, ratio 0.9 → warn
- `SuggestionCard.test.tsx` — render con severity diferentes, click Aplicar, click Ignorar

---

## 🎨 Referencias visuales del mockup

El HTML mockup ya contiene todos los estilos y componentes:
- Pill verdict: `.pill.pill-green/amber/red`
- Subcard: `background:#0b1220; border:1px solid #1e293b`
- SVGs: `belt diagram`, `iPhone slow-mo`, `tacómetro SKF`
- Progressive disclosure: `<details>` nativo con caret rotation

**NO reinventar estilos** — copiar las clases tailwind del mockup al TailwindCSS de la app. Ya existen clases similares (`bg-slate-900`, `border-slate-800`, etc.).

---

## ⚠️ Constraints críticos

1. **Peso SIEMPRE en gramos** — los hooks `useGraderDashboardAnalytics`, `useGraderPatternAnalytics`, etc., leen `avgWeightGrams`. NO cambiar.
2. **AutoField por campo independiente** — el usuario quiere poder tener largo Auto + ancho Manual por separado.
3. **widthRatio es empírico, no FishBase** — 0.20 Salar y 0.18 Coho son estimaciones. Agregar tooltip que lo explique.
4. **No tocar el branch `claude/grader-hmi-interface-De4pv`** — es el HMI Grader Z2 separado, coordinar antes de modificarlo.

---

## 📦 Dependencias existentes a reutilizar

- `SPECIES_ALLOMETRY` constant en `AnalisisGraderGatesConfigPage.tsx:52`
- `useGraderSelectionStore` (Zustand) para día/turno seleccionado
- `BeltVisualizer` componente (mover, no rehacer)
- `AutoField` componente (ya existe para largo/ancho)
- `GraderDailySummary` type con `avgWeightGrams`

---

## ✅ Criterios de aceptación

- [ ] Hero del tab Producto muestra diagrama arriba y reduce altura ≥30% vs v2.112.1
- [ ] Pill verdict cambia de 🟢 a 🟡 cuando ratio pez/paso >0.7
- [ ] Click en card de sugerencia la expande con 5 secciones (Por qué, Datos, Fórmula, Confianza, Impacto)
- [ ] Aplicar sugerencia genera entry en `graderConfigChangeLog`
- [ ] Modal slow-mo calcula segundos en vivo como `frames/fps`
- [ ] Modal tacómetro promedia 3 lecturas con stdev
- [ ] Mediciones guardan a Firestore con validación rules
- [ ] Tests unitarios verdes (mínimo 10 tests nuevos entre suggestions + UI)
- [ ] Deploy Firebase 🟢 sin romper tests previos (67+ tests ya existen)
- [ ] Lint + TSC sin errores
- [ ] Versión bump a v2.113.0 en `package.json`, `version.ts`, `version.json`, `VERSION.md`

---

## 🚀 Al terminar

- `git add` con archivos específicos (NO `-A`)
- Commit con mensaje claro siguiendo el patrón existente (ver `git log --oneline`)
- Push a main
- `gh run watch` para confirmar deploys 🟢 en los 4 workflows (Firebase Hosting, PWA build, Functions, Firestore Rules)
- Actualizar CLAUDE.md marcando P1.9 items como ✅
- Crear nuevo session memory en `C:/Users/pc hp/.claude/projects/.../memory/`

---

## 📊 Estimación

- FASE 1: 1-2 horas (refactor)
- FASE 2: 30 min (types)
- FASE 3: 2-3 horas (motor IA + cards)
- FASE 4: 1 hora (modelo cintas)
- FASE 5: 2-3 horas (modales + Firestore)
- FASE 6: 1 hora (audit log)
- Tests: 1-2 horas

**Total**: ~10-14 horas de trabajo. Puede partirse en varios commits/iteraciones.

---

## 🔗 Recursos clave

- Plan completo: [`CLAUDE.md`](../../CLAUDE.md) secciones P1.9 y P1.10
- Parámetros Z2 extraídos: [`docs/marelec-z2/parameters.md`](./parameters.md)
- Mockup visual: [`apps/pwa/public/producto-v2-mockup.html`](../../apps/pwa/public/producto-v2-mockup.html)
- Docs internos Z2: `C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/`
- Memory session anterior: [`C:/Users/pc hp/.claude/projects/.../memory/session_2026-04-17_grader_sugerencias_alometricas.md`](...)
