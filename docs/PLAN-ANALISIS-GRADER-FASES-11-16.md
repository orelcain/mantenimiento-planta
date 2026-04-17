# Plan técnico — Refactor "Análisis Grader" · FASES 11 a 16

> **Autor:** Opus 4.7 (plan) · **Ejecutor:** Sonnet 4.6 (código)
> **Fecha plan:** 2026-04-17
> **Módulo:** `apps/pwa/src/pages/AnalisisGrader/` + `apps/pwa/src/components/grader/` + `apps/pwa/src/services/grader/`
> **Base:** `D:\a\APP leventamiento de insidencias en planta\`
> **Versión inicial:** 2.115.0 (post FASE 10)

---

## 0. Contexto y objetivo

### Por qué existe este refactor

Hoy el módulo Análisis Grader está organizado alrededor de la **máquina** (tabs: Producto, Cintas, Distancias, Calibración, Gates, Rangos). Para un supervisor que carga un Excel post-turno, esa estructura lo obliga a mentalmente correlacionar KPIs de producción con configuraciones técnicas de 4 sub-tabs distintos.

El objetivo es invertir la arquitectura para que se organice alrededor del **trabajo del supervisor**:

1. **Cargar** el Excel (puede ser durante el turno o al cerrar)
2. **Ver resultado** — ¿cómo me fue?
3. **Entender por qué** — ¿qué causó el P0?
4. **Tomar acción** — ¿qué hago ahora o mañana?
5. **Validar** — cuando vuelva a cargar, ¿sirvió lo que cambié?

Además, la app debe soportar dos modos del mismo turno:

- **Turno en vivo** — carga parcial durante el turno (30 min, 2h, 4h), decisiones intra-turno
- **Turno cerrado** — carga final, decisiones para el próximo turno

### Qué NO se toca

- Motor de análisis (`graderAnalytics.ts`) — se mantiene, solo se enriquece
- Parser Excel (`graderExcelParser.ts`) — se mantiene
- Segmentador (`graderSegmenter.ts`) — se mantiene
- Config física (tabs Producto/Cintas/Distancias/Calibración refactorizados en FASE 10) — se mantienen, pasan a modo "setup avanzado"
- Firestore: colecciones existentes (`graderDailySummaries`, `graderUploads`, `gatesTemplates`, etc.) — se mantienen, se agregan nuevas

### Los dos Excel de Matrix (CRÍTICO para entender el flujo)

Matrix exporta **dos archivos distintos** por turno que se complementan. La app ya distingue ambos tipos en `graderExcelParser.ts` (`detectTipo: PIEZA_PIEZA | PUERTA_0`), pero el plan debe manejar explícitamente que un "upload" puede traer uno, otro, o ambos.

| Excel | Columnas clave | Qué aporta | Si falta |
|---|---|---|---|
| **Pieza a pieza (PP)** | `Fecha · Hora · Peso · Cantidad · Lote · Gate · Calidad · Conservación · Calibre · Producto · Turno` | **TODAS las piezas procesadas**, incluidos los P0 (gate=0). Dice cuántos P0 hubo y en qué timestamp. | Sin PP no hay análisis del turno |
| **Punto 0 (P0)** | `Especie · Lote · Fecha · Hora · Turno · Gate · Cantidad · Calidad · Peso · Error · peso en Gr` | **Motivo de cada P0**: columna `Error` = "Fuera de límites" / "No leído por fotocélula" / "Puerta no preparada" | Sin P0 sabemos cuántos P0 pero **no las causas Matrix** |

**Implicaciones para el diseño:**

1. **Cada "upload event" en el timeline representa uno o los dos archivos.** La estructura `UploadEntry` debe tener `files: { pp?, p0? }` y un flag `completeness: 'pp-only' | 'p0-only' | 'complete'`.
2. **La UI debe guiar al usuario:** si tiene PP sin P0, mostrar banner "Sin el Excel de Punto Cero no podemos mostrar las causas. Subilo para el análisis completo".
3. **El panel "Por qué" se degrada elegantemente:** si solo hay PP, muestra "P0 total: 5.2% · causas: sin datos (falta Excel P0)" en vez de las 3 causas Matrix.
4. **El motor de análisis ya maneja merges parciales** (`hasPieceData` y `hasGate0Data` en `GraderDailySummary`). Solo hay que exponer ese estado en UI.
5. **En modo live**, el flujo típico es: supervisor exporta ambos Excel de Matrix cada vez que quiere un check → sube ambos → análisis completo. Excel P0 "solo" se usa raro (solo si olvidó exportar el PP).

### Hallazgos clave del análisis previo

**A. Causas P0 oficiales Matrix son 3, no 6**
Los exports reales en `C:\Users\pc hp\OneDrive\ANTARFOOD\⚙️ GRADER\temporada 2025-2026\punto 0\` confirman que Matrix clasifica solo en:

- `Fuera de límites` (57.9%)
- `No leído por fotocélula` (40.1%)
- `Puerta no preparada` (2.0%)

Nuestras 6 sub-causas (`fuera_de_rango`, `fuera_de_limites`, `no_leido_fotocelula`, `too_close_too_long`, `puerta_no_preparada`, `otro`) son drill-down. **UI debe titular con las 3, drill con las 6.**

**B. Umbrales oficiales del manual Marelec**
- Pocket vacío: **-5 g a +5 g** (check diario)
- Drift contra peso patrón: **±20 g / 5000 g** (0.4%)
- Velocidad máx cinta: **1.4 m/s**
- Precisión stdev: **20 g (0-5kg), 50 g (5-15kg)**
- Aire comprimido: **mín 0.7 MPa seco**
- Dimensiones máx pieza: **1100 mm × 290 mm**

**C. Runbooks Z2 embebidos**
- Clave servicio Z2: `8620`
- Ruta contrastación: `MENU → Servicio → Cambiar parámetros → 8620 → Static Grader → ZBelt → Pocket [1-4] → fsWc`
- Fórmula recalibración: `Vp_nuevo = Vp_actual × 5000 / Vb`

**D. Jerga oficial a adoptar**
`pocket (1-4)` · `flipper (1-12)` · `gate` · `buchaca` · `capacho` · `bandejón` · `peso patrón (5000 gr)` · `fsWc` · **contrastación** (no "calibración balanza") · `fotocélula` · `eye sync` · `turno A/B` · `COHO/SALAR`

**E. Benchmark histórico**
Archivo maestro con ~206k piezas P0 de temporada 2025-2026 en OneDrive. Usable como baseline entrenable.

---

## 1. Diagrama conceptual del user journey

```
┌──────────────────────────────────────────────────────────────┐
│                    LANDING (/analisis-grader)                 │
│  ┌───────────────┐ ┌──────────────┐ ┌───────────────────┐   │
│  │ 📥 Cargar     │ │ 📅 Calendario│ │ 📈 Análisis       │   │
│  │   Excel       │ │   mes        │ │   período         │   │
│  └───────┬───────┘ └──────┬───────┘ └─────────┬─────────┘   │
└──────────┼────────────────┼─────────────────────┼───────────┘
           │                │                     │
           ▼                ▼                     ▼
  ┌──────────────────────────────┐    ┌─────────────────────┐
  │  VISTA TURNO                 │    │  VISTA PERÍODO      │
  │  /turno/:shiftId             │    │  /periodo?preset=.. │
  │                              │    │                     │
  │  modo = live | closed        │    │  agregado multi-    │
  │                              │    │  turno + benchmark  │
  │  ┌── Hero Scorecard ──┐      │    │                     │
  │  ├── Timeline         │      │    │                     │
  │  ├── Por Qué (3 P0)   │      │    │                     │
  │  ├── Acciones         │      │    │                     │
  │  └── Setup avanzado ──┘      │    │                     │
  └──────────────────────────────┘    └─────────────────────┘
           │                                    │
           │  (drill acciones)                  │
           ▼                                    │
  ┌──────────────────────────────┐              │
  │  CONFIG FÍSICA (setup)       │              │
  │  /turno/:id/setup            │──────────────┘
  │  (tabs Producto/Cintas/...)  │
  └──────────────────────────────┘
           │
           │  (runbooks)
           ▼
  ┌──────────────────────────────┐
  │  AYUDA                       │
  │  /ayuda                      │
  │  (manual, SOP, runbooks Z2)  │
  └──────────────────────────────┘
```

---

## 2. Mapa de decisiones antes de ejecutar

| Decisión | Resolución | Impacto |
|---|---|---|
| ¿Consolidar DetallePage en /turno/:id? | **SÍ** — una sola vista para turno actual e histórico | Elimina duplicación |
| ¿3 causas Matrix como titular, 6 como drill? | **SÍ** — alinearse con lo que supervisor ve en Matrix | Coherencia terminológica |
| ¿Keep Wizard page? | **Deprecate** — se renombra y su rol pasa a LandingPage + TurnoPage | Simplificación |
| ¿Tocamos config física refactorizada? | **NO** — queda intacta, solo pasa a segundo plano | Preserva FASE 10 |
| ¿Adoptamos jerga Marelec? | **SÍ** — contrastación, fsWc, pocket, etc. | Reconocimiento usuario |
| ¿Firestore: nueva colección `graderShifts`? | **SÍ** — para uploads[] + actions[] | Necesario para timeline |
| ¿Prefijo rutas? | `/analisis-grader/...` actual | Sin cambios breaking |

---

## 3. FASE 11 — Fundamentos (4h)

### Objetivo
Crear las piezas de infraestructura que las demás fases consumirán: detección de estado de turno, motor del timeline, centralización de umbrales y alineación de la taxonomía P0.

### 3.1 Archivos a crear

#### `apps/pwa/src/services/grader/graderThresholds.ts`

Centraliza **todos** los umbrales dispersos + los del manual Marelec. Reemplaza constantes hardcoded en múltiples archivos.

```typescript
/**
 * Umbrales centralizados del módulo Grader.
 * Fuentes:
 *   - Manual Marelec MS4/12 (OneDrive: ⚙️ GRADER/instruction manual Grader.pdf)
 *   - SOP CH-MT-ME-0002 (Instructivo Paso a Paso Calibracion Grader)
 *   - Análisis histórico de turnos (temporada 2025-2026)
 */

/** Umbrales P0 % (porcentaje de rechazo) */
export const P0_THRESHOLDS = {
  /** Objetivo ideal */
  target: 2.0,
  /** Warning */
  warn: 2.0,
  /** Critical */
  critical: 4.0,
} as const

/** Umbrales gap entre peces */
export const GAP_THRESHOLDS = {
  /** Ratio largo/paso máximo aceptable (overlapping) */
  ratioCritical: 1.0,
  /** Ratio warning (apretado) */
  ratioWarn: 0.7,
  /** Gap libre mínimo en metros */
  minGapM: 0.10,
  /** Gap óptimo */
  optimalGapM: 0.15,
} as const

/** Umbrales timing por gate */
export const TIMING_THRESHOLDS = {
  /** Margen OK en segundos */
  marginOkSec: 0.5,
  /** Margen warning */
  marginWarnSec: 0.15,
} as const

/** Umbrales balanza (Manual Marelec + SOP) */
export const BALANCE_THRESHOLDS = {
  /** Pocket vacío: rango aceptable en gramos */
  emptyPocketMinG: -5,
  emptyPocketMaxG: 5,
  /** Drift contra peso patrón 5000 g */
  driftWarnG: 20,
  /** Precisión stdev esperada por rango */
  precisionStdevLowG: 20,   // 0-5 kg
  precisionStdevHighG: 50,  // 5-15 kg
  /** Peso patrón oficial */
  standardWeightG: 5000,
} as const

/** Umbrales neumáticos (Manual Marelec) */
export const PNEUMATIC_THRESHOLDS = {
  /** Presión mínima suministro en bar */
  minSupplyBar: 7.0,
  /** Presión efectiva mínima en gate */
  minEffectiveBar: 3.0,
  /** Presión efectiva warning */
  warnEffectiveBar: 4.0,
} as const

/** Umbrales físicos de la máquina (Manual Marelec) */
export const MACHINE_LIMITS = {
  /** Velocidad máxima cinta en m/s */
  maxBeltSpeedMps: 1.4,
  /** Dimensión máxima pieza - largo en mm */
  maxPieceLengthMm: 1100,
  /** Dimensión máxima pieza - ancho en mm */
  maxPieceWidthMm: 290,
  /** Rango de pesaje en kg */
  minWeightKg: 0,
  maxWeightKg: 15,
} as const

/** Umbrales de tendencia intra-turno */
export const INTRA_SHIFT_THRESHOLDS = {
  /** Piezas mínimas para validar cambio post-acción */
  minPiecesPostAction: 200,
  /** Minutos mínimos post-acción para ver impacto */
  minMinutesPostAction: 10,
  /** Incremento P0 que dispara alerta "empeorando" */
  deteriorationDeltaPct: 1.0,
  /** Mejora P0 que dispara "funcionó" */
  improvementDeltaPct: 0.5,
} as const

/** Computa veredicto semafórico a partir de valor y umbrales */
export type Verdict = 'ok' | 'warn' | 'critical'

export function verdictFromP0Pct(pct: number): Verdict {
  if (pct >= P0_THRESHOLDS.critical) return 'critical'
  if (pct >= P0_THRESHOLDS.warn) return 'warn'
  return 'ok'
}

export function verdictFromGapRatio(ratio: number): Verdict {
  if (ratio >= GAP_THRESHOLDS.ratioCritical) return 'critical'
  if (ratio >= GAP_THRESHOLDS.ratioWarn) return 'warn'
  return 'ok'
}

export function verdictFromMarginSec(marginSec: number): Verdict {
  if (marginSec < TIMING_THRESHOLDS.marginWarnSec) return 'critical'
  if (marginSec < TIMING_THRESHOLDS.marginOkSec) return 'warn'
  return 'ok'
}

export function verdictFromEffectivePressureBar(bar: number): Verdict {
  if (bar < PNEUMATIC_THRESHOLDS.minEffectiveBar) return 'critical'
  if (bar < PNEUMATIC_THRESHOLDS.warnEffectiveBar) return 'warn'
  return 'ok'
}
```

**Acción de Sonnet:** después de crear este archivo, hacer un grep de las constantes viejas:
```
0.7 (ratio), 1.0 (ratio), 0.5 (margin), 0.15 (margin), 2.0 (p0), 4.0 (p0),
1.4 (maxSpeed), 0.7 (MPa→Bar conv), 3.0 (minPressure)
```
en los archivos: `graderAnalytics.ts`, `graderInsights.ts`, `graderGateTiming.ts`, `ProductoTab.tsx`, `NeumaticaTab.tsx`, y reemplazar por imports desde `graderThresholds.ts`.

#### `apps/pwa/src/services/grader/graderShiftStatus.ts`

Detecta si un turno está "vivo" o "cerrado" basado en fecha/hora del Excel vs reloj del sistema.

```typescript
import { DEFAULT_SHIFT_SCHEDULE, inferShiftIdFromSchedule, type ShiftSchedule } from './graderShiftSchedule'

export type ShiftStatus = 'live' | 'closed' | 'future'

export interface ShiftTimeWindow {
  status: ShiftStatus
  /** ISO timestamp de inicio del turno */
  startAt: string
  /** ISO timestamp de cierre esperado del turno */
  endAt: string
  /** Progreso del turno en porcentaje (0 a 100), null si cerrado */
  progressPct: number | null
  /** Minutos transcurridos desde inicio */
  elapsedMin: number
  /** Minutos restantes al cierre (null si ya cerró) */
  remainingMin: number | null
}

/**
 * Detecta estado del turno.
 *
 * Reglas:
 *   - Si hora actual > endAt → 'closed'
 *   - Si hora actual < startAt → 'future' (raro, pero posible)
 *   - Si startAt <= hora actual <= endAt → 'live'
 *
 * @param dateKey "YYYY-MM-DD" del turno
 * @param shiftId "Turno día" o "Turno noche"
 * @param schedule cronograma de turnos (default DEFAULT_SHIFT_SCHEDULE)
 * @param now fecha de referencia (default Date.now())
 */
export function computeShiftTimeWindow(
  dateKey: string,
  shiftId: string,
  schedule: ShiftSchedule = DEFAULT_SHIFT_SCHEDULE,
  now: Date = new Date(),
): ShiftTimeWindow {
  // ... implementación que:
  // 1. Busca el shift en schedule
  // 2. Construye startAt y endAt con dateKey + startTime/endTime del shift
  // 3. Si endTime < startTime (turno noche cruza medianoche) → endAt = dateKey+1
  // 4. Compara now contra startAt y endAt
}

/**
 * Detecta si un Excel recién cargado corresponde a un turno que aún está vivo.
 * Usa el último pieceRecord timestamp vs reloj actual.
 */
export function detectShiftStatusFromData(
  lastPieceRecordTs: string,
  shiftId: string,
  now: Date = new Date(),
): ShiftStatus {
  // Si el último record fue hace < 30 min y el turno no ha cerrado → 'live'
  // Sino → 'closed'
}
```

#### `apps/pwa/src/services/grader/graderShiftTimeline.ts`

Motor que une uploads + acciones + piezas en una estructura unificada.

```typescript
import type { PieceRecord, Gate0Record } from './types'

/** Checkpoint en el timeline: upload o acción */
export type TimelineCheckpoint =
  | { kind: 'upload'; at: string; by: string; fileName: string; snapshot: ShiftSnapshot }
  | { kind: 'action'; at: string; by: string; action: AppliedAction; outcome?: ActionOutcome }
  | { kind: 'shift-start'; at: string }
  | { kind: 'shift-end'; at: string }

export interface ShiftSnapshot {
  totalPieces: number
  p0Pct: number
  topCause: string | null
  throughputPzPerMin: number
}

export interface AppliedAction {
  field: string                // ej: 'physicalConfig.pocketCount'
  before: unknown
  after: unknown
  reason?: string              // texto libre del supervisor
}

export interface ActionOutcome {
  /** P0% antes de la acción (ventana de 15 min previa) */
  p0BeforePct: number
  /** P0% después de la acción (hasta el siguiente upload) */
  p0AfterPct: number
  /** Piezas procesadas post-acción */
  piecesAfter: number
  /** Veredicto automático */
  verdict: 'improved' | 'neutral' | 'worsened' | 'insufficient-data'
}

export interface ShiftSegmentAnalysis {
  /** Ventana analizada */
  fromAt: string
  toAt: string
  /** Métricas */
  totalPieces: number
  p0Pieces: number
  p0Pct: number
  /** Top 3 causas (las 3 oficiales Matrix) */
  topCauses: Array<{ cause: MatrixP0Cause; pieces: number; pct: number }>
  /** Breakdown por minuto si hay datos */
  pulseByMinute?: Array<{ minute: string; p0Pct: number; pieces: number }>
}

export type MatrixP0Cause =
  | 'fuera_de_limites'
  | 'no_leido_fotocelula'
  | 'puerta_no_preparada'
  | 'otro'

/**
 * Construye el timeline unificado de un turno.
 */
export function buildShiftTimeline(input: {
  dateKey: string
  shiftId: string
  uploads: Array<{ at: string; by: string; fileName: string }>
  actions: Array<{ at: string; by: string; action: AppliedAction }>
  pieceRecords: PieceRecord[]
  gate0Records: Gate0Record[]
  shiftWindow: ShiftTimeWindow
}): {
  checkpoints: TimelineCheckpoint[]
  globalAnalysis: ShiftSegmentAnalysis
  segmentsPrePostActions: ShiftSegmentAnalysis[]
} {
  // 1. Merge uploads + actions en timeline ordenada
  // 2. Para cada par (action_i, nextEvent) → segmento
  // 3. Computar ShiftSegmentAnalysis por segmento
  // 4. Computar ActionOutcome por cada acción (con min piezas/minutos validados)
}

/**
 * Segmenta pieceRecords por ventana temporal.
 */
export function analyzeSegment(
  pieceRecords: PieceRecord[],
  gate0Records: Gate0Record[],
  fromAt: string,
  toAt: string,
): ShiftSegmentAnalysis {
  // Filter by timestamp y computar métricas
}
```

#### `apps/pwa/src/services/grader/graderMatrixP0Causes.ts`

Mapeo 1→N de causa oficial Matrix a sub-causas internas.

```typescript
import type { MatrixP0Cause } from './graderShiftTimeline'
import type { PointZeroCause } from './types' // las 6 sub-causas actuales

export const MATRIX_P0_CAUSES: Record<MatrixP0Cause, {
  label: string             // para UI
  description: string       // tooltip
  icon: string              // nombre lucide
  color: 'red' | 'amber' | 'blue' | 'zinc'
  subCauses: PointZeroCause[]
  defaultActionHint: string
}> = {
  fuera_de_limites: {
    label: 'Fuera de límites',
    description: 'Peso fuera del rango de los calibres configurados',
    icon: 'ScaleOff',
    color: 'red',
    subCauses: ['fuera_de_rango', 'fuera_de_limites'],
    defaultActionHint: 'Revisar rangos de calibres configurados y verificar contrastación de balanza',
  },
  no_leido_fotocelula: {
    label: 'No leído por fotocélula',
    description: 'Sensor no detectó la pieza: peces muy juntos, fotocélula sucia o eye sync desajustado',
    icon: 'EyeOff',
    color: 'amber',
    subCauses: ['no_leido_fotocelula', 'too_close_too_long'],
    defaultActionHint: 'Limpiar fotocélula, revisar gap entre peces, verificar eye sync',
  },
  puerta_no_preparada: {
    label: 'Puerta no preparada',
    description: 'Flipper estaba ocupado cuando llegó la pieza: timing o cadencia mal ajustados',
    icon: 'Clock',
    color: 'blue',
    subCauses: ['puerta_no_preparada'],
    defaultActionHint: 'Bajar cadencia, revisar timing de gate crítico, verificar presión neumática',
  },
  otro: {
    label: 'Otra causa',
    description: 'Causa no clasificada o registro ambiguo',
    icon: 'HelpCircle',
    color: 'zinc',
    subCauses: ['otro'],
    defaultActionHint: 'Revisar registros individuales en drill-down',
  },
}

/**
 * Mapea una sub-causa interna (nuestras 6) a la causa oficial Matrix (3 + otra).
 */
export function toMatrixCause(subCause: PointZeroCause): MatrixP0Cause {
  for (const [matrixCause, def] of Object.entries(MATRIX_P0_CAUSES) as Array<[MatrixP0Cause, typeof MATRIX_P0_CAUSES['otro']]>) {
    if (def.subCauses.includes(subCause)) return matrixCause
  }
  return 'otro'
}

/**
 * Parsea el string de error que Matrix pone en la columna "Error" del Excel P0.
 */
export function parseMatrixErrorString(raw: string): MatrixP0Cause {
  const s = raw.toLowerCase().trim()
  if (s.includes('fuera de') && s.includes('límit')) return 'fuera_de_limites'
  if (s.includes('fuera de') && s.includes('limit')) return 'fuera_de_limites'
  if (s.includes('fotoc')) return 'no_leido_fotocelula'
  if (s.includes('puerta') && s.includes('prepar')) return 'puerta_no_preparada'
  return 'otro'
}
```

### 3.2 Archivos a modificar

#### `apps/pwa/src/services/grader/graderAnalytics.ts`

En `computePointZeroClassification()` y afines, agregar el campo `matrixCause: MatrixP0Cause` a cada record y expose agregados por causa Matrix (3 buckets) además de las 6 sub-causas.

```typescript
// Agregar al output del summary
interface PointZeroSummary {
  // ... campos actuales
  byMatrixCause: Record<MatrixP0Cause, {
    pieces: number
    pct: number
    subCauses: Array<{ cause: PointZeroCause; pieces: number; pct: number }>
  }>
}
```

### 3.3 Tests

Crear `apps/pwa/tests/grader/` (si no existe) con:

- `graderThresholds.test.ts` → verificar veredictos
- `graderShiftStatus.test.ts` → casos live/closed/future con y sin turno noche cruza-medianoche
- `graderShiftTimeline.test.ts` → timeline con upload→acción→upload
- `graderMatrixP0Causes.test.ts` → parser de strings Matrix + mapeo sub→matrix

Framework: vitest (ya configurado).

### 3.4 Definition of Done FASE 11

- [ ] Los 4 archivos nuevos en `services/grader/` compilan sin errores
- [ ] Tests pasan (mínimo 1 test por función pública)
- [ ] `npx tsc --noEmit` limpio
- [ ] Grep confirma cero constantes hardcoded de las listadas (se reemplazaron por imports)
- [ ] Commit: `feat(grader): FASE 11 - fundamentos (thresholds, shift status, timeline, P0 causes)`

---

## 4. FASE 12 — Landing + Vista Turno unificada (6h)

### Objetivo
Crear el landing nuevo y la vista de turno unificada (/turno/:shiftId) que sirve ambos modos (live/closed). Consolidar DetallePage en la nueva vista.

### 4.1 Rutas a agregar en routing (probablemente `App.tsx` o `router.tsx`)

```typescript
// Nuevas rutas
'/analisis-grader'                       → AnalisisGraderLandingPage (NEW)
'/analisis-grader/turno/:shiftId'        → AnalisisGraderTurnoPage (NEW, reemplaza Wizard + Detalle)
'/analisis-grader/turno/:shiftId/setup'  → AnalisisGraderGatesConfigPage (REUSE, pero accessed from turno)
'/analisis-grader/periodo'               → AnalisisGraderPeriodoPage (REUSE)
'/analisis-grader/ayuda'                 → AnalisisGraderAyudaPage (NEW, FASE 14)

// Rutas viejas con redirect 301 interno
'/analisis-grader/detalle?date=X&shift=Y' → redirect a /turno/{date}__{shift}
```

### 4.2 Archivos a crear

#### `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderLandingPage.tsx`

Landing unificado con 3 CTAs principales + widget calendario compacto + lista turnos recientes.

```typescript
interface LandingProps {}

export function AnalisisGraderLandingPage(): JSX.Element {
  // 1. Cargar últimos 7 días de graderDailySummaries
  // 2. Detectar si hay turno "vivo" (el de hoy y hora dentro de rango)
  // 3. Renderizar:
  //    - Hero: botón grande "Cargar Excel" + botón "Cargar turno actual si vivo"
  //    - Grid 2x2 de turnos recientes (cards con P0% y status)
  //    - Calendario compacto del mes (click → /turno/:id)
  //    - Links: análisis período + config avanzada + ayuda
}
```

Layout aproximado (dark mode compatible, usar tokens de Tailwind del proyecto):

```tsx
<div className="container mx-auto p-4 space-y-6">
  {/* Hero */}
  <Card className="p-6 border-primary/20">
    <h1>Análisis Grader</h1>
    <p>Cargá el Excel exportado de Matrix para ver el estado del proceso</p>
    <div className="flex gap-3 mt-4">
      <Button size="lg"><Upload /> Cargar turno actual</Button>
      {hasLiveShift && (
        <Button variant="outline" size="lg">
          <Activity /> Turno en vivo: {liveShift.label}
        </Button>
      )}
    </div>
  </Card>

  {/* Turnos recientes */}
  <section>
    <h2>Últimos turnos</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {recentShifts.map(s => <RecentShiftCard shift={s} />)}
    </div>
  </section>

  {/* Calendario compacto + links */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <Card className="lg:col-span-2">
      <CardHeader><h3>Calendario mes</h3></CardHeader>
      <CardContent>
        <GraderHistoricalCalendar compact={true} onSelectShift={...} />
      </CardContent>
    </Card>
    <div className="space-y-3">
      <Link to="/analisis-grader/periodo"><Card>📈 Análisis de período</Card></Link>
      <Link to="/analisis-grader/ayuda"><Card>📚 Manual y runbooks</Card></Link>
      <Link to="/configuracion-avanzada"><Card>⚙️ Configuración avanzada</Card></Link>
    </div>
  </div>
</div>
```

#### `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`

Vista unificada del turno. Maneja:
- `/turno/current` → no existe aún, pide cargar Excel
- `/turno/:shiftId` donde shiftId = `YYYY-MM-DD__Turno día` → carga desde Firestore O desde Excel cargado en sesión
- Modo `live` vs `closed` según `computeShiftTimeWindow()`

```typescript
export function AnalisisGraderTurnoPage(): JSX.Element {
  const { shiftId } = useParams()
  const [dateKey, shiftLabel] = parseShiftId(shiftId)
  const shiftWindow = useMemo(() => computeShiftTimeWindow(dateKey, shiftLabel), [...])

  // Carga datos (Firestore + posibles uploads en sesión)
  const { summary, pieceRecords, gate0Records, uploads, actions } = useShiftData(shiftId)

  // Motor del timeline
  const timeline = useMemo(
    () => buildShiftTimeline({ dateKey, shiftId: shiftLabel, uploads, actions, pieceRecords, gate0Records, shiftWindow }),
    [...]
  )

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Upload zone si modo live */}
      {shiftWindow.status === 'live' && (
        <CompactUploadZone onUpload={handleUpload} />
      )}

      {/* Hero Scorecard */}
      <HeroScorecard
        summary={summary}
        shiftWindow={shiftWindow}
        trend={timeline.globalAnalysis}
      />

      {/* Timeline si hay >1 checkpoint */}
      {timeline.checkpoints.length > 1 && (
        <ShiftTimelineView timeline={timeline} shiftWindow={shiftWindow} />
      )}

      {/* Por qué (P0 breakdown) */}
      <P0CausesPanel
        byMatrixCause={summary.byMatrixCause}
        onClickCause={openDrillDownModal}
      />

      {/* Acciones */}
      <ActionPlanPanel
        shiftId={shiftId}
        suggestions={suggestionsFromAnalytics(summary)}
        pastActions={actions}
        status={shiftWindow.status}
      />

      {/* Setup avanzado (collapsed por default, link) */}
      <Link to={`/analisis-grader/turno/${shiftId}/setup`}>
        <Card className="border-dashed"><CardContent className="py-3 text-sm text-muted-foreground">
          ⚙️ Abrir configuración física avanzada (12 Gates, Cintas, Distancias...)
        </CardContent></Card>
      </Link>
    </div>
  )
}
```

#### `apps/pwa/src/components/grader/HeroScorecard.tsx`

Hero card con el veredicto del turno.

```typescript
interface HeroScorecardProps {
  summary: GraderDailySummary
  shiftWindow: ShiftTimeWindow
  trend: ShiftSegmentAnalysis
}

export function HeroScorecard(props: HeroScorecardProps) {
  const verdict = verdictFromP0Pct(props.summary.pointZeroPct)
  const statusColor = VERDICT_COLORS[verdict]

  return (
    <Card className={cn('border-2', statusColor.border)}>
      {/* Header con badge live/closed + fecha */}
      <div className="flex justify-between items-center px-4 py-2 bg-muted/30">
        <div>
          <span>{props.summary.shiftId}</span>
          <span>· {props.summary.dateKey}</span>
          {props.shiftWindow.status === 'live' && (
            <Badge className="bg-red-500 animate-pulse">EN VIVO</Badge>
          )}
          {props.shiftWindow.status === 'closed' && (
            <Badge variant="outline">CERRADO</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {props.shiftWindow.status === 'live'
            ? `${props.shiftWindow.elapsedMin} min de ${props.shiftWindow.elapsedMin + props.shiftWindow.remainingMin} min`
            : `Duración: ${props.summary.durationMinutes} min`}
        </div>
      </div>

      {/* Hero metric: P0% gigante con color */}
      <div className={cn('p-6 flex items-center gap-6', statusColor.bg)}>
        <div>
          <div className="text-5xl font-bold">{props.summary.pointZeroPct.toFixed(1)}%</div>
          <div className="text-xs uppercase tracking-wider">P0 (Punto Cero)</div>
          <div className="text-sm mt-1">{statusColor.label}</div>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-2">
          <MetricTile label="Piezas" value={props.summary.totalPieces.toLocaleString()} />
          <MetricTile label="pz/min" value={`${(props.summary.productionRatePerHour / 60).toFixed(0)}`} />
          <MetricTile label="Kg" value={props.summary.totalWeightKg?.toFixed(0) ?? '—'} />
        </div>
      </div>

      {/* Tendencia intra-turno si modo live */}
      {props.shiftWindow.status === 'live' && (
        <div className="p-3 border-t bg-background/50">
          <TrendSparkline pulse={props.trend.pulseByMinute} />
        </div>
      )}
    </Card>
  )
}

const VERDICT_COLORS = {
  ok: { border: 'border-green-500', bg: 'bg-green-500/5', label: '✓ Turno en rango' },
  warn: { border: 'border-amber-500', bg: 'bg-amber-500/5', label: '⚠ Turno con oportunidades' },
  critical: { border: 'border-red-500', bg: 'bg-red-500/5', label: '✗ Turno fuera de rango' },
}
```

#### `apps/pwa/src/components/grader/P0CausesPanel.tsx`

Panel con las 3 causas Matrix y drill-down a 6 sub-causas.

```typescript
interface P0CausesPanelProps {
  byMatrixCause: PointZeroSummary['byMatrixCause']
  onClickCause?: (cause: MatrixP0Cause) => void
}

export function P0CausesPanel(props: P0CausesPanelProps): JSX.Element {
  const [expandedCause, setExpanded] = useState<MatrixP0Cause | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Por qué tu P0?</CardTitle>
        <CardDescription>De cada 100 peces, {totalP0Pct.toFixed(0)} fueron a P0. Estas son las razones:</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(Object.keys(MATRIX_P0_CAUSES) as MatrixP0Cause[]).map(cause => {
          const stats = props.byMatrixCause[cause]
          const def = MATRIX_P0_CAUSES[cause]
          return (
            <CauseRow
              key={cause}
              cause={cause}
              def={def}
              stats={stats}
              expanded={expandedCause === cause}
              onToggle={() => setExpanded(expandedCause === cause ? null : cause)}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}

function CauseRow({ cause, def, stats, expanded, onToggle }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full p-3 flex items-center gap-3 hover:bg-muted/50">
        <IconBadge color={def.color} icon={def.icon} />
        <div className="flex-1 text-left">
          <div className="font-medium">{def.label}</div>
          <div className="text-xs text-muted-foreground">{def.description}</div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold">{stats.pct.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">{stats.pieces} pzas</div>
        </div>
        <ChevronDown className={cn(expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="p-3 bg-muted/20 space-y-2">
          <p className="text-xs text-muted-foreground">{def.defaultActionHint}</p>
          <div className="space-y-1">
            {stats.subCauses.map(sc => (
              <div key={sc.cause} className="flex justify-between text-xs">
                <span>└─ {SUB_CAUSE_LABELS[sc.cause]}</span>
                <span className="font-mono">{sc.pct.toFixed(1)}% · {sc.pieces} pzas</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

### 4.3 Archivos a modificar

- **Routing** (App.tsx / router.tsx): agregar rutas nuevas + redirect del `/detalle?date=...&shift=...`
- **`GraderHistoricalCalendar.tsx`**: si clickeas una celda, navegar a `/turno/${dateKey}__${shiftId}` en lugar de `/detalle`
- **`AnalisisGraderDetallePage.tsx`**: marcar como `@deprecated`, reemplazar body por `<Navigate to={...} />`

### 4.4 Archivos a mantener intactos (no tocar)

- `AnalisisGraderWizardPage.tsx` — se conserva hasta FASE 16 para evitar breaking change. Su código se reutiliza dentro de TurnoPage via composición.
- `AnalisisGraderGatesConfigPage.tsx` — se reusa desde la sub-ruta `/turno/:shiftId/setup`
- `AnalisisGraderPeriodoPage.tsx` — sin cambios

### 4.5 DoD FASE 12

- [ ] `/analisis-grader` → Landing nuevo
- [ ] `/analisis-grader/turno/:shiftId` → TurnoPage nuevo
- [ ] `/analisis-grader/detalle?date=X&shift=Y` → redirige a TurnoPage (visible en Network o directamente en browser)
- [ ] Calendario histórico navega a TurnoPage
- [ ] Hero Scorecard muestra: P0%, piezas, throughput, peso, status badge (live/closed), duración
- [ ] P0 Causes Panel muestra las 3 causas Matrix como titular + sub-causas en drill
- [ ] Tests unit + snapshot de componentes críticos
- [ ] `npx tsc --noEmit` limpio
- [ ] Commit: `feat(grader): FASE 12 - landing unificado + vista turno /turno/:shiftId`

---

## 5. FASE 13 — Timeline + Acciones (5h)

### Objetivo
Agregar la visualización Timeline del turno (crucial para modo live) y el panel de acciones con checklist "terreno / oficina / verificar". Persistir uploads y acciones en nueva colección Firestore `graderShifts`.

### 5.1 Schema Firestore

Crear colección `graderShifts`:

```typescript
// apps/pwa/src/services/grader/graderShifts.service.ts

export interface GraderShiftDoc {
  id: string                      // `${dateKey}__${shiftId}` (igual que dailySummary)
  dateKey: string
  shiftId: string
  status: 'live' | 'closed'
  /** Un upload event representa una "subida" del supervisor, que puede incluir PP, P0 o ambos */
  uploads: Array<{
    id: string                    // uuid
    at: string                    // ISO timestamp
    by: string                    // user.id
    byName: string                // user.displayName snapshot
    files: {
      pp?: { fileName: string; fileSize: number; recordCount: number }    // pieza a pieza
      p0?: { fileName: string; fileSize: number; recordCount: number }    // punto 0 (detalle)
    }
    /** Completitud de este upload event */
    completeness: 'pp-only' | 'p0-only' | 'complete'
    snapshot: {
      totalPieces: number
      p0Pct: number
      /** null si completeness = 'pp-only' (sin datos de causa) */
      topMatrixCause: MatrixP0Cause | null
      throughputPzPerMin: number
      /** Flag para UI: indica si podemos mostrar causas Matrix */
      hasCauseData: boolean
    }
  }>
  actions: Array<{
    id: string                    // uuid
    at: string                    // ISO timestamp
    by: string
    byName: string
    field: string                 // ej: 'physicalConfig.pocketCount'
    before: unknown
    after: unknown
    reason?: string
    outcome?: {
      evaluatedAt: string
      p0BeforePct: number
      p0AfterPct: number
      piecesAfter: number
      verdict: 'improved' | 'neutral' | 'worsened' | 'insufficient-data'
    }
  }>
  createdAt: string
  updatedAt: string
}

export async function upsertShiftUpload(shiftId: string, upload: UploadEntry): Promise<void>
export async function appendShiftAction(shiftId: string, action: ActionEntry): Promise<void>
export async function updateActionOutcome(shiftId: string, actionId: string, outcome: ActionOutcome): Promise<void>
export async function getShift(shiftId: string): Promise<GraderShiftDoc | null>
export async function listShiftsByRange(fromDateKey: string, toDateKey: string): Promise<GraderShiftDoc[]>
```

### 5.2 Firestore Rules

Agregar a `firestore.rules`:

```
match /graderShifts/{shiftId} {
  allow read: if isAuthenticated();
  allow create, update: if isAuthenticated();
  allow delete: if isAdmin();
}
```

### 5.3 Componentes a crear

#### `apps/pwa/src/components/grader/ShiftTimelineView.tsx`

Visualización de timeline con:
- **Pulso** (mini line chart con P0% por minuto)
- **Checkpoints** (uploads y acciones) marcados en el eje temporal
- **Segmentación** visual: áreas entre acciones coloreadas según outcome

```typescript
interface ShiftTimelineViewProps {
  timeline: ReturnType<typeof buildShiftTimeline>
  shiftWindow: ShiftTimeWindow
}

export function ShiftTimelineView(props: ShiftTimelineViewProps): JSX.Element {
  // Render con Chart.js (ya disponible en proyecto):
  // - Line: P0% por minuto
  // - Annotations: vertical lines en at de cada checkpoint
  //   · Upload: línea azul con icono 📥
  //   · Action: línea amarilla con icono 🔧
  //   · Shift-start/end: líneas grises
  // - Tooltip: info del checkpoint al hover

  // Debajo: lista cronológica de checkpoints con detalle expandible
}
```

#### `apps/pwa/src/components/grader/ActionPlanPanel.tsx`

Panel de acciones tripartito.

```typescript
interface ActionPlanPanelProps {
  shiftId: string
  suggestions: Array<SuggestedAction>     // derivadas de analytics + causas P0
  pastActions: Array<GraderShiftDoc['actions'][0]>  // desde Firestore
  status: ShiftStatus
}

export interface SuggestedAction {
  id: string
  category: 'terreno' | 'oficina' | 'verificar'
  title: string
  description: string
  severity: 'critical' | 'warning' | 'recommended'
  /** Referencia a runbook si aplica */
  runbookId?: string
  /** Si es categoría 'oficina', el patch que aplicar */
  configPatch?: {
    field: string
    before: unknown
    after: unknown
  }
  /** Impacto esperado */
  estimatedImpact?: {
    metric: 'P0%' | 'throughput' | 'balance'
    deltaPct: number
  }
}

export function ActionPlanPanel(props: ActionPlanPanelProps): JSX.Element {
  const [checked, setChecked] = useLocalStorage<Set<string>>(`actions-${props.shiftId}`, new Set())

  const grouped = groupBy(props.suggestions, 'category')

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Qué hacer?</CardTitle>
        <CardDescription>
          {props.status === 'live'
            ? 'Acciones para aplicar YA en el turno actual'
            : 'Plan para aplicar en el próximo turno'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActionSection
          title="🏭 EN LA MÁQUINA"
          subtitle="Con llave / manómetro / cinta métrica"
          actions={grouped.terreno ?? []}
          checked={checked}
          onToggle={id => toggleChecked(id)}
        />
        <ActionSection
          title="💻 EN LA APP"
          subtitle="Cambios de configuración con un click"
          actions={grouped.oficina ?? []}
          checked={checked}
          onToggle={id => toggleChecked(id)}
          showApplyButton={true}
          onApply={handleApplyConfigPatch}
        />
        <ActionSection
          title="🔬 DESPUÉS"
          subtitle="Validar que los cambios funcionaron"
          actions={grouped.verificar ?? []}
          checked={checked}
          onToggle={id => toggleChecked(id)}
        />
      </CardContent>
      <CardFooter>
        <Button onClick={savePlan}>💾 Guardar plan</Button>
      </CardFooter>
    </Card>
  )
}
```

#### `apps/pwa/src/services/grader/graderActionSuggester.ts`

Genera `SuggestedAction[]` a partir del análisis del turno.

```typescript
/**
 * Genera sugerencias de acción a partir del análisis del turno.
 * Aplica reglas determinísticas basadas en thresholds + causas P0.
 */
export function suggestActions(input: {
  analytics: ReturnType<typeof computeAnalytics>
  physicalConfig: GraderPhysicalConfig
  timeline: ReturnType<typeof buildShiftTimeline>
}): SuggestedAction[] {
  const suggestions: SuggestedAction[] = []

  // Regla 1: Fuera de límites > 2% → contrastar balanza
  if (input.analytics.pointZero.byMatrixCause.fuera_de_limites.pct > 2) {
    suggestions.push({
      id: 'contrastar-balanza',
      category: 'terreno',
      title: 'Contrastar balanza con peso patrón',
      description: 'P0 por "Fuera de límites" supera 2%. Probable drift de una o más balanzas.',
      severity: 'warning',
      runbookId: 'contrastacion-pocket',
      estimatedImpact: { metric: 'P0%', deltaPct: -2 },
    })
  }

  // Regla 2: No leído fotocélula > 1% → limpiar/eye sync
  // Regla 3: Puerta no preparada > 0.5% → bajar cadencia
  // Regla 4: Gap ratio > 0.7 → bajar pockets
  // Regla 5: Margen timing < 0.5s en >= 3 gates → revisar distancias
  // Regla 6: Presión efectiva < 3 bar en cualquier gate → subir suministro
  // Regla 7: Desviación peso promedio vs histórico > 15% → revisar calibre
  // Regla 8: Degradación intra-turno > 1% → medir en terreno

  // Al final: incluir acción "Verificar" siempre
  suggestions.push({
    id: 'verificar-recarga',
    category: 'verificar',
    title: 'Recargar Excel tras aplicar cambios',
    description: 'Mínimo 200 pzas post-cambio para validar impacto',
    severity: 'recommended',
  })

  return suggestions
}
```

### 5.4 Multi-upload del mismo turno (con soporte PP + P0)

El usuario puede:
- Soltar **uno o dos archivos al mismo tiempo** (drag-drop múltiple) → se agrupan como **un solo upload event**
- Soltar **primero PP y después P0** (o viceversa) en intervalos cortos → el sistema debe agruparlos dentro de una ventana temporal (ej. 5 min) como **mismo upload event**
- Si pasan > 5 min entre PP y P0, se tratan como **uploads separados** (cada uno un checkpoint distinto en el timeline)

Lógica en `AnalisisGraderTurnoPage.tsx`:

```typescript
/** Ventana para agrupar archivos PP+P0 en un solo upload event */
const UPLOAD_GROUPING_WINDOW_MIN = 5

async function handleUpload(files: File[]) {
  // 1. Parse cada archivo y detectar tipo
  const parsed = await Promise.all(files.map(f => parseFile(f)))

  // 2. Separar PP y P0
  const ppFiles = parsed.filter(p => p.fileMeta.kind === 'PIEZA_PIEZA')
  const p0Files = parsed.filter(p => p.fileMeta.kind === 'PUERTA_0')

  // 3. Inferir dateKey + shiftId del primer archivo (con fallback a los otros)
  const { dateKey, shiftId } = inferShiftFromParsed(parsed)

  // 4. Ver si el último upload del shift fue hace < 5 min → si sí, MERGE como mismo event
  const existing = await getShift(`${dateKey}__${shiftId}`)
  const lastUpload = existing?.uploads.at(-1)
  const shouldMerge = lastUpload
    && minutesBetween(lastUpload.at, new Date()) < UPLOAD_GROUPING_WINDOW_MIN

  const uploadEntry: UploadEntry = shouldMerge
    ? {
        ...lastUpload,
        // agregar archivos nuevos al entry existente
        files: {
          pp: ppFiles[0] ? toFileInfo(ppFiles[0]) : lastUpload.files.pp,
          p0: p0Files[0] ? toFileInfo(p0Files[0]) : lastUpload.files.p0,
        },
        completeness: computeCompleteness(ppFiles.length > 0 || !!lastUpload.files.pp,
                                          p0Files.length > 0 || !!lastUpload.files.p0),
      }
    : {
        id: uuid(),
        at: new Date().toISOString(),
        by: user.id,
        byName: user.displayName,
        files: {
          pp: ppFiles[0] ? toFileInfo(ppFiles[0]) : undefined,
          p0: p0Files[0] ? toFileInfo(p0Files[0]) : undefined,
        },
        completeness: computeCompleteness(ppFiles.length > 0, p0Files.length > 0),
        snapshot: {} as any, // se llena abajo
      }

  // 5. Dedup + merge en pieceRecords/gate0Records (la lógica actual ya lo hace)
  const mergedRecords = mergePieceRecords([...existing?.pieceRecords ?? [], ...ppFiles.flatMap(p => p.pieceRecords)])
  const mergedGate0 = mergeGate0Records([...existing?.gate0Records ?? [], ...p0Files.flatMap(p => p.gate0Records)])

  // 6. Recomputar snapshot
  uploadEntry.snapshot = computeSnapshot(mergedRecords, mergedGate0)

  // 7. Persistir
  if (shouldMerge) {
    await updateShiftUpload(`${dateKey}__${shiftId}`, uploadEntry.id, uploadEntry)
  } else {
    await upsertShiftUpload(`${dateKey}__${shiftId}`, uploadEntry)
  }
  await saveDailySummary(buildDailySummary(mergedRecords, mergedGate0))

  // 8. Re-build timeline y mostrar feedback
  setTimeline(buildShiftTimeline({...}))
  if (uploadEntry.completeness === 'pp-only') {
    showBanner('Subí también el Excel de Punto Cero para ver las causas', 'warning')
  }
}

function computeCompleteness(hasPP: boolean, hasP0: boolean): UploadCompleteness {
  if (hasPP && hasP0) return 'complete'
  if (hasPP) return 'pp-only'
  return 'p0-only'
}
```

**UI en `P0CausesPanel`** — degradar si falta P0:

```typescript
if (!latestUpload.snapshot.hasCauseData) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Por qué tu P0?</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertCircle />
          <AlertTitle>Faltan datos de causa</AlertTitle>
          <AlertDescription>
            Tenés el Excel Pieza a Pieza cargado pero falta el Excel de Punto Cero.
            Subilo para ver en qué fallaron los {p0TotalPieces} peces rechazados.
          </AlertDescription>
          <Button onClick={openUpload}>Subir Excel P0</Button>
        </Alert>
      </CardContent>
    </Card>
  )
}
```

### 5.5 DoD FASE 13

- [ ] `ShiftTimelineView` muestra pulso + checkpoints
- [ ] `ActionPlanPanel` con 3 secciones (terreno/oficina/verificar)
- [ ] Checklist persiste check state (localStorage)
- [ ] Config patches desde "oficina" actualizan `physicalConfig` real
- [ ] Firestore `graderShifts` creado + rules
- [ ] Upload durante turno live: append a `graderShifts.uploads[]`, re-compute, re-render
- [ ] **Multi-file support:** drag-drop de PP y P0 al mismo tiempo → un solo upload event con `files.pp` + `files.p0`
- [ ] **Agrupamiento temporal:** PP subido a 10:00 y P0 a 10:03 → mismo upload event (ventana 5 min)
- [ ] **Degradación elegante:** si solo hay PP, `P0CausesPanel` muestra alerta "falta P0" con CTA para subirlo
- [ ] **Upload event completeness:** snapshot guarda `completeness: 'pp-only' | 'p0-only' | 'complete'`
- [ ] Attribution automática: al hacer upload post-acción, `outcome` se calcula y guarda
- [ ] Tests: suggester con casos fixtures de P0 alto/bajo/mixto
- [ ] Tests: upload PP sin P0 → causas "desconocidas"; luego upload P0 → causas aparecen
- [ ] `npx tsc --noEmit` limpio
- [ ] Commit: `feat(grader): FASE 13 - timeline intra-turno + action plan tripartito + soporte PP/P0`

---

## 6. FASE 14 — Runbooks + Ayuda embebida (4h)

### Objetivo
Crear un catálogo de runbooks (procedimientos Z2) embebido en la app, con paths de menú exactos, fórmulas y screenshots. Integrado en las acciones del TurnoPage y accesible desde una página Ayuda.

### 6.1 Archivos a crear

#### `apps/pwa/src/services/grader/graderRunbooks.ts`

Catálogo de runbooks.

```typescript
export interface Runbook {
  id: string                           // slug, ej: 'contrastacion-pocket'
  title: string
  summary: string                      // 1 línea
  category: 'contrastacion' | 'calibracion' | 'mantencion' | 'limpieza' | 'troubleshooting'
  /** Ruta exacta del menú Z2 */
  z2Path?: string[]                    // ej: ['MENU', 'Servicio', 'Cambiar parámetros', '8620', 'Static Grader', 'ZBelt', 'Pocket', 'fsWc']
  /** Clave de servicio si requiere */
  serviceKey?: string                  // ej: '8620'
  /** Fórmula si aplica */
  formula?: { expression: string; variables: Record<string, string> }
  /** Pasos secuenciales */
  steps: Array<{
    order: number
    instruction: string
    note?: string
    imageRef?: string                  // path relativo a assets si hay imagen
    durationMin?: number
    requiresTool?: string[]            // ej: ['Peso patrón 5000 g', 'Manómetro']
  }>
  /** Criterio de éxito */
  successCriteria: string[]
  /** Cuando sugerir este runbook */
  triggers: Array<{
    condition: string                  // texto descriptivo para UI
    metric?: string                    // ej: 'pointZero.byMatrixCause.fuera_de_limites.pct'
    comparator?: '>' | '<' | '==' | '>=' | '<='
    threshold?: number
  }>
  /** Fuente documental */
  source: string                       // ej: 'SOP CH-MT-ME-0002' o 'Manual Marelec p. 34'
}

export const RUNBOOKS: Record<string, Runbook> = {
  'contrastacion-pocket': {
    id: 'contrastacion-pocket',
    title: 'Contrastación de pocket con peso patrón',
    summary: 'Verificar y recalibrar la balanza de un pocket específico',
    category: 'contrastacion',
    z2Path: ['MENU', 'Servicio', 'Cambiar parámetros', '8620', 'Static Grader', 'ZBelt', 'Pocket [1-4]', 'fsWc'],
    serviceKey: '8620',
    formula: {
      expression: 'Vp_nuevo = Vp_actual × 5000 / Vb',
      variables: {
        'Vp_actual': 'Valor de calibración actual del pocket',
        'Vb': 'Lectura obtenida con el peso patrón (gramos)',
        'Vp_nuevo': 'Nuevo valor de calibración a ingresar',
      },
    },
    steps: [
      { order: 1, instruction: 'Detener la producción y asegurar cinta vacía' },
      { order: 2, instruction: 'Tarar el pocket con botón >0< si muestra gramos' },
      { order: 3, instruction: 'Colocar peso patrón de 5000 gr suavemente en pocket 1' },
      { order: 4, instruction: 'Anotar lectura mostrada (Vb)' },
      { order: 5, instruction: 'Ir a MENU → Servicio → Cambiar parámetros', note: 'Ingresar clave 8620' },
      { order: 6, instruction: 'Navegar a Static Grader → ZBelt → Pocket 1 → fsWc' },
      { order: 7, instruction: 'Anotar valor actual (Vp_actual)' },
      { order: 8, instruction: 'Calcular Vp_nuevo = Vp_actual × 5000 / Vb', requiresTool: ['Calculadora'] },
      { order: 9, instruction: 'Ingresar Vp_nuevo y guardar' },
      { order: 10, instruction: 'Repetir con el mismo peso patrón para validar (debe leer 5000 ± 20 g)' },
      { order: 11, instruction: 'Repetir pasos 1-10 para pockets 2, 3 y 4', durationMin: 15 },
    ],
    successCriteria: [
      'Lectura final del peso patrón en los 4 pockets: 4980-5020 g',
      'Pocket vacío: -5 a +5 g',
    ],
    triggers: [
      {
        condition: 'P0 "Fuera de límites" > 2% o drift > 20g',
        metric: 'pointZero.byMatrixCause.fuera_de_limites.pct',
        comparator: '>',
        threshold: 2,
      },
    ],
    source: 'SOP CH-MT-ME-0002 + Basculas Grader.pdf',
  },

  'limpieza-fotocelula': {
    id: 'limpieza-fotocelula',
    title: 'Limpieza y verificación de fotocélula',
    summary: 'Verificar sincronización de fotocélula elevador y 2ª cinta aceleración',
    category: 'limpieza',
    z2Path: ['MENU', 'Servicio', 'Probar entradas'],
    steps: [
      { order: 1, instruction: 'Detener producción' },
      { order: 2, instruction: 'Limpiar lente de fotocélula elevador con paño seco' },
      { order: 3, instruction: 'Limpiar fotocélula 2ª cinta aceleración' },
      { order: 4, instruction: 'Entrar a MENU → Servicio → Probar entradas' },
      { order: 5, instruction: 'Pasar producto manualmente y verificar que activa señales' },
      { order: 6, instruction: 'Verificar alineación — si no dispara, ajustar ángulo del emisor' },
    ],
    successCriteria: [
      'Ambas fotocélulas detectan 100% de piezas pasadas manualmente',
    ],
    triggers: [
      {
        condition: 'P0 "No leído por fotocélula" > 1%',
        metric: 'pointZero.byMatrixCause.no_leido_fotocelula.pct',
        comparator: '>',
        threshold: 1,
      },
    ],
    source: 'Manual Marelec MS4/12',
  },

  'presion-aire': {
    id: 'presion-aire',
    title: 'Verificación de presión de aire comprimido',
    summary: 'Presión mínima 0.7 MPa (7 bar) con aire seco',
    category: 'mantencion',
    steps: [
      { order: 1, instruction: 'Ubicar manómetro de entrada de aire al tablero neumático' },
      { order: 2, instruction: 'Verificar lectura: debe ser ≥ 7.0 bar (0.7 MPa)' },
      { order: 3, instruction: 'Si < 7 bar: revisar compresor y secador' },
      { order: 4, instruction: 'Si aire húmedo: revisar filtro y purgar trampa' },
    ],
    successCriteria: ['Presión ≥ 7 bar', 'Aire seco (sin condensación visible)'],
    triggers: [
      {
        condition: 'P0 "Fuera de límites" en los 4 pockets simultáneo (indicio de aire)',
        metric: 'custom:multiPocketP0Spike',
      },
    ],
    source: 'Manual Marelec MS4/12 - Compressed air section',
  },

  'pocket-vacio-check': {
    id: 'pocket-vacio-check',
    title: 'Check diario de pocket vacío',
    summary: 'Verificar que pockets vacíos leen entre -5 y +5 gramos',
    category: 'contrastacion',
    steps: [
      { order: 1, instruction: 'Al inicio del turno, asegurar cinta vacía' },
      { order: 2, instruction: 'Tarar con botón >0< si es necesario' },
      { order: 3, instruction: 'Esperar 30 segundos' },
      { order: 4, instruction: 'Anotar lectura de cada pocket' },
    ],
    successCriteria: ['Lectura de cada pocket vacío: -5 a +5 gramos'],
    triggers: [{ condition: 'Inicio de turno' }],
    source: 'Manual Marelec MS4/12 - Daily checkup',
  },

  // ... más runbooks (agregar al menos: 'slow-mo-flipper', 'tachometro-cinta', 'redistribuir-gates', 'cambio-sm221')
}

/**
 * Encuentra runbooks relevantes según análisis del turno.
 */
export function findTriggeredRunbooks(analytics: GraderAnalyticsResult): Runbook[] {
  const triggered: Runbook[] = []
  for (const runbook of Object.values(RUNBOOKS)) {
    for (const trigger of runbook.triggers) {
      if (evalTrigger(trigger, analytics)) {
        triggered.push(runbook)
        break
      }
    }
  }
  return triggered
}
```

**Nota para Sonnet:** el catálogo inicial debe tener **mínimo 10 runbooks**. Completar con: contrastación pocket, limpieza fotocélula, presión aire, pocket vacío check, slow-mo flipper, tachómetro cinta, redistribución gates, cambio tarjeta SM221, verificación motor tambor, ajuste eye sync.

#### `apps/pwa/src/components/grader/RunbookCard.tsx`

Card expandible con el runbook.

```typescript
interface RunbookCardProps {
  runbook: Runbook
  compact?: boolean     // si está embebido en una acción
}

export function RunbookCard(props: RunbookCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border rounded-lg">
      <button onClick={() => setExpanded(!expanded)}>
        <CategoryIcon category={props.runbook.category} />
        <div>
          <div className="font-medium">{props.runbook.title}</div>
          <div className="text-xs text-muted-foreground">{props.runbook.summary}</div>
        </div>
        {props.runbook.serviceKey && (
          <Badge>Clave: {props.runbook.serviceKey}</Badge>
        )}
      </button>
      {expanded && (
        <div className="p-4 space-y-3 bg-muted/20">
          {props.runbook.z2Path && (
            <PathBreadcrumb path={props.runbook.z2Path} />
          )}
          {props.runbook.formula && (
            <FormulaDisplay formula={props.runbook.formula} />
          )}
          <StepsList steps={props.runbook.steps} />
          <SuccessCriteriaList criteria={props.runbook.successCriteria} />
          <SourceFooter source={props.runbook.source} />
        </div>
      )}
    </div>
  )
}
```

#### `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderAyudaPage.tsx`

Página de ayuda con catálogo completo de runbooks + buscador + filtros.

```typescript
export function AnalisisGraderAyudaPage(): JSX.Element {
  const [query, setQuery] = useState('')
  const [filterCat, setFilterCat] = useState<RunbookCategory | 'all'>('all')

  const filtered = useMemo(() => filterRunbooks(RUNBOOKS, query, filterCat), [query, filterCat])

  return (
    <div className="container mx-auto p-4 space-y-6">
      <header>
        <h1>Ayuda y procedimientos</h1>
        <p>Runbooks oficiales Z2 · Manual Marelec MS4/12</p>
      </header>

      <div className="flex gap-3">
        <Input placeholder="Buscar procedimiento..." value={query} onChange={...} />
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectItem value="all">Todas las categorías</SelectItem>
          <SelectItem value="contrastacion">Contrastación</SelectItem>
          <SelectItem value="calibracion">Calibración</SelectItem>
          <SelectItem value="mantencion">Mantención</SelectItem>
          <SelectItem value="limpieza">Limpieza</SelectItem>
          <SelectItem value="troubleshooting">Troubleshooting</SelectItem>
        </Select>
      </div>

      <section>
        <h2>Glosario</h2>
        <GlosarioGrader />
      </section>

      <section>
        <h2>Runbooks ({filtered.length})</h2>
        <div className="space-y-3">
          {filtered.map(rb => <RunbookCard key={rb.id} runbook={rb} />)}
        </div>
      </section>

      <section>
        <h2>Manual oficial Marelec MS4/12</h2>
        <p>Documento de referencia completo (59 páginas, 7.5 MB)</p>
        <Button><Download /> Abrir manual</Button>
      </section>
    </div>
  )
}
```

### 6.2 Assets a copiar

De `C:\Users\pc hp\OneDrive\ANTARFOOD\⚙️ GRADER\` a `apps/pwa/public/docs/grader/`:

- `instruction manual Grader.pdf` → `manual-marelec-ms4-12.pdf`
- `CH-MT-ME-0002 Instructivo Paso a Paso Calibracion Grader.pdf` → `sop-contrastacion.pdf`
- `Basculas Grader.pdf` → `sop-balanzas.pdf`
- `Boton azul grader.jpg` → `troubleshooting/boton-azul.jpg`
- `Moto tambor cinta aceleración 2 grader.jpg` → `troubleshooting/moto-tambor.jpg`
- `PASOS Para cambio tarjeta sm221 grader.jpg` → `troubleshooting/cambio-sm221.jpg`

### 6.3 Adopción de jerga oficial

Crear `apps/pwa/src/services/grader/graderGlossary.ts`:

```typescript
export const GRADER_GLOSSARY = {
  pocket: { label: 'Pocket', alts: ['balanza', 'celda'], description: 'Balanza donde se pesa cada pieza (1-4)' },
  flipper: { label: 'Flipper', alts: ['paleta'], description: 'Paleta que desvía la pieza al capacho correcto (1-12)' },
  gate: { label: 'Gate', alts: ['compuerta', 'salida'], description: 'Número de salida asignada a un calibre' },
  buchaca: { label: 'Buchaca', description: 'Cajón donde cae cada calibre' },
  capacho: { label: 'Capacho', description: 'Cajón de recepción del pez clasificado' },
  bandejon: { label: 'Bandejón', description: 'Recipiente grande de recolección' },
  fsWc: { label: 'fsWc', description: 'Parámetro de calibración del pocket en el menú Z2' },
  pesoPatron: { label: 'Peso patrón', description: 'Peso calibrado de 5000 g usado para contrastación' },
  contrastacion: { label: 'Contrastación', alts: ['calibración'], description: 'Verificación y ajuste de la balanza con peso patrón' },
  fotocelula: { label: 'Fotocélula', description: 'Sensor óptico que detecta paso de producto' },
  eyeSync: { label: 'Eye sync', description: 'Sincronización del sensor óptico' },
  p0: { label: 'P0', alts: ['punto cero', 'gate 0'], description: 'Piezas rechazadas (no asignadas a calibre)' },
  z2: { label: 'Z2', description: 'Controlador Marelec Z2 de la clasificadora' },
}
```

Reemplazar en UI los términos "calibración de balanza" → "contrastación" (excepto en referencias a calibración de cinta/sensor que siguen siendo "calibración").

### 6.4 DoD FASE 14

- [ ] 10+ runbooks en catálogo
- [ ] RunbookCard con paths Z2, fórmula, pasos, criterios de éxito
- [ ] `/analisis-grader/ayuda` funcional con buscador + filtros
- [ ] PDFs copiados a `public/docs/grader/`
- [ ] Glosario embebido
- [ ] Jerga adoptada en textos UI (contrastación, pocket, etc.)
- [ ] Runbooks aparecen como sugerencia dentro de ActionPlanPanel cuando se cumplen triggers
- [ ] `npx tsc --noEmit` limpio
- [ ] Commit: `feat(grader): FASE 14 - runbooks Z2 + página Ayuda + jerga oficial`

---

## 7. FASE 15 — Benchmarks + Attribution (3h)

### Objetivo
Enriquecer el análisis de período con benchmark histórico (206k P0) + attribution (qué cambios aplicados resultaron en qué mejora).

### 7.1 Archivos a crear

#### `apps/pwa/src/services/grader/graderBenchmarks.ts`

Carga y expone el benchmark histórico.

```typescript
export interface SeasonBenchmark {
  seasonKey: string              // ej: '2025-2026'
  totalPieces: number
  totalP0: number
  p0Pct: number
  byMatrixCause: Record<MatrixP0Cause, { pieces: number; pct: number }>
  bySpecies: Record<'COHO' | 'SALAR', { pieces: number; p0Pct: number }>
  byCalibre: Record<string, { pieces: number; p0Pct: number }>
  byShift: Record<'A' | 'B', { pieces: number; p0Pct: number }>
  byMonth: Record<string, { pieces: number; p0Pct: number }>
}

export async function loadSeasonBenchmark(seasonKey: string): Promise<SeasonBenchmark | null>

/**
 * Compara un período contra el benchmark.
 */
export function compareAgainstBenchmark(
  period: PeriodAggregate,
  benchmark: SeasonBenchmark,
): {
  overallDelta: number           // P0% período - P0% benchmark
  byMatrixCauseDelta: Record<MatrixP0Cause, number>
  verdict: 'better' | 'similar' | 'worse'
  strongestDivergence: MatrixP0Cause | null
}
```

**Nota para Sonnet:** cargar el archivo maestro de P0 histórico desde OneDrive → `apps/pwa/src/data/benchmarks/temporada-2025-2026.json` (preprocesado, no el Excel). Preprocesado puede ser un script one-off en `scripts/preprocess-benchmark.mjs` que lee el Excel con xlsx y genera el JSON.

#### `apps/pwa/src/services/grader/graderAttribution.ts`

Motor de attribution.

```typescript
export interface AttributionReport {
  shiftId: string
  actionsApplied: Array<{
    action: GraderShiftDoc['actions'][0]
    impact: {
      metric: 'P0%'
      beforePct: number
      afterPct: number
      deltaPct: number                 // negativo = mejora
      confidence: 'high' | 'medium' | 'low'  // basado en tamaño muestra
    }
  }>
  totalImprovement: number            // suma de deltaPct si todos positivos
}

/**
 * Computa attribution de acciones dentro de un turno.
 * Usa ActionOutcome ya calculado en FASE 13.
 */
export function computeShiftAttribution(shift: GraderShiftDoc): AttributionReport

/**
 * Agrega attribution a lo largo de un rango.
 */
export function aggregateAttribution(shifts: GraderShiftDoc[]): {
  topImpactfulActions: Array<{ field: string; totalDelta: number; timesApplied: number }>
  totalShiftsWithActions: number
  avgImprovementPerAction: number
}
```

### 7.2 Archivos a modificar

#### `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderPeriodoPage.tsx`

Agregar secciones nuevas:

```typescript
<section>
  <h2>Comparativa vs. temporada</h2>
  <BenchmarkComparisonCard period={aggregate} benchmark={benchmark} />
</section>

<section>
  <h2>Acciones más efectivas</h2>
  <TopActionsCard shifts={shiftsInRange} />
</section>
```

### 7.3 DoD FASE 15

- [ ] Benchmark 2025-2026 preprocesado a JSON
- [ ] Motor compareAgainstBenchmark funcional
- [ ] Motor attribution funcional
- [ ] PeriodoPage muestra card de comparativa + top actions
- [ ] `npx tsc --noEmit` limpio
- [ ] Commit: `feat(grader): FASE 15 - benchmark 206k P0 + attribution motor`

---

## 8. FASE 16 — IA integrada + limpieza final (3h)

### Objetivo
Integrar `graderSummaryAI.ts` dentro de TurnoPage (hoy solo está en Detalle). Eliminar código muerto y páginas deprecated.

### 8.1 Trabajo a hacer

1. **Integrar IA en TurnoPage:**
   - Mover `<AIOutputPanel />` a un sub-componente del TurnoPage
   - Enriquecer el prompt con: timeline.checkpoints, actions aplicadas, benchmark comparison
   - Botón "Generar análisis IA" con loading state

2. **Mejorar prompt de IA:**
   - Agregar contexto del turno (fecha, shift, duration, especies)
   - Incluir runbooks triggered como contexto
   - Pedir recomendaciones alineadas con las 3 causas Matrix
   - Output structured: resumen, top 3 acciones, riesgo si no actúa

3. **Eliminar código muerto:**
   - `AnalisisGraderDetallePage.tsx` → eliminar (ya redirige en FASE 12)
   - `AnalisisGraderWizardPage.tsx` → evaluar si se puede eliminar (ver qué importa aún); si no se puede, dejar como `@deprecated` y usar `<Navigate>` al landing
   - `GraderMeasurements.service.ts` → confirmar si es dead, eliminar o usar
   - Cualquier import no usado post-refactor

4. **Cleanup de imports / console.logs / TODOs**:
   - `npx eslint --fix apps/pwa/src/`
   - Grep `TODO.*FASE 1[1-6]` → resolver o eliminar

5. **QA end-to-end** (ver checklist en Anexo C)

### 8.2 DoD FASE 16

- [ ] IA integrada en TurnoPage con prompt mejorado
- [ ] `AnalisisGraderDetallePage.tsx` eliminada
- [ ] Código muerto eliminado
- [ ] ESLint sin warnings
- [ ] QA checklist completo
- [ ] Bump versión a 2.120.0 (o la que corresponda según bumps intermedios)
- [ ] CLAUDE.md actualizado con la nueva arquitectura
- [ ] Commit: `feat(grader): FASE 16 - IA integrada + cleanup final + docs`

---

## 9. Anexos

### Anexo A — Esquema Firestore completo (post-FASES 11-16)

```
graderDailySummaries/{dateKey}__{shiftId}          (existente)
  └─ pieceRecords/{recordId}                       (existente, subcollection)
  └─ meta/timeline                                 (existente, subcollection)

graderUploads/{uploadId}                            (existente)

gatesTemplates/{templateId}                         (existente)

graderAutosaveDrafts/{draftId}                      (existente)

graderModuleConfig/config                           (existente)

graderConfigChangeLog/{entryId}                     (existente)

graderShifts/{dateKey}__{shiftId}                   (NUEVO FASE 13)
  fields:
    id, dateKey, shiftId, status
    uploads: UploadEntry[]
    actions: ActionEntry[]
    createdAt, updatedAt

beltSpeedMeasurements/{measurementId}               (existente)
flipperTimingMeasurements/{measurementId}           (existente)
```

Rules a agregar/verificar en `firestore.rules`:

```
match /graderShifts/{shiftId} {
  allow read: if isAuthenticated();
  allow create, update: if isAuthenticated();
  allow delete: if isAdmin();
}
```

### Anexo B — Taxonomía P0 (3 oficiales + 6 sub)

| Matrix (UI titular) | Nuestras sub-causas (drill) | Cuándo se dispara |
|---|---|---|
| **Fuera de límites** | `fuera_de_rango` | Peso fuera de los calibres configurados por el usuario |
| Fuera de límites | `fuera_de_limites` | Peso fuera de los límites físicos del sistema (0-15 kg) |
| **No leído por fotocélula** | `no_leido_fotocelula` | Sensor óptico no detectó la pieza |
| No leído por fotocélula | `too_close_too_long` | Peces solapados o gap insuficiente (sub-caso de no-lectura) |
| **Puerta no preparada** | `puerta_no_preparada` | Flipper ocupado cuando llegó la pieza |
| **Otro** | `otro` | No clasificable |

### Anexo C — Checklist QA final (FASE 16)

**Rutas:**
- [ ] `/analisis-grader` carga Landing
- [ ] `/analisis-grader/turno/2026-04-17__Turno día` carga TurnoPage
- [ ] `/analisis-grader/periodo` carga PeriodoPage enriquecida
- [ ] `/analisis-grader/ayuda` carga AyudaPage con runbooks
- [ ] `/analisis-grader/detalle?date=X&shift=Y` redirige a TurnoPage

**Landing:**
- [ ] Botón "Cargar Excel" abre file picker
- [ ] Turnos recientes muestran KPI correcto
- [ ] Calendario compacto navega a turno

**TurnoPage modo live:**
- [ ] Badge "EN VIVO" visible y pulsante
- [ ] Upload durante turno agrega checkpoint en timeline
- [ ] Timeline muestra pulso + marcadores de upload/acción
- [ ] Acciones muestran botón "Aplicar YA"
- [ ] Outcome post-acción se calcula al recargar

**TurnoPage modo closed:**
- [ ] Badge "CERRADO" visible
- [ ] Timeline muestra historial completo del turno
- [ ] Acciones muestran botón "Planear"

**P0 Causes Panel:**
- [ ] 3 causas Matrix como titular
- [ ] Click en causa expande sub-causas
- [ ] Números coherentes (% suma 100% del P0 total)
- [ ] Action hint visible en drill

**Actions Panel:**
- [ ] 3 secciones (terreno, oficina, verificar)
- [ ] Checkboxes persisten estado
- [ ] "Aplicar" patch de oficina actualiza physicalConfig en Firestore
- [ ] Runbooks aparecen como sub-card dentro de acciones cuando aplica

**Runbooks:**
- [ ] AyudaPage buscador filtra
- [ ] RunbookCard expande/colapsa
- [ ] Paths Z2 con formato breadcrumb correcto
- [ ] Fórmulas renderizadas con LaTeX-like (o monoespaciado)

**PeriodoPage:**
- [ ] Benchmark card muestra delta vs temporada
- [ ] Top actions card muestra ranking

**Performance:**
- [ ] TurnoPage carga < 2 s con datos cached
- [ ] Upload de Excel grande (5000 pzas) no bloquea UI
- [ ] Timeline con 10 checkpoints renderiza fluido

**Cross-device:**
- [ ] Desktop 1920x1080 ✓
- [ ] Tablet 1024x768 ✓
- [ ] Mobile 375x667 ✓ (al menos Landing + TurnoPage scorecard)

**Browser compatibility:**
- [ ] Chrome latest
- [ ] Firefox latest
- [ ] Safari latest
- [ ] Edge latest

### Anexo D — Prompts sugeridos para handoff a Sonnet

Cada fase se puede empezar con este prompt genérico, reemplazando `{N}`:

```
Ejecuta la FASE {N} del plan documentado en
docs/PLAN-ANALISIS-GRADER-FASES-11-16.md

Lee primero la sección correspondiente completa. Sigue los
archivos a crear/modificar listados. Corre tests. Asegura
tsc limpio. Al final commit con el formato indicado en el DoD
de esa fase.

Si encuentras ambigüedades o decisiones que el plan no cubre,
detén y pregúntame antes de inventar.
```

### Anexo E — Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Breaking change en rutas viejas | Media | Redirects 301 preservan URLs antiguas en bookmarks |
| Usuarios con sesiones viejas (Wizard) se pierden | Baja | Landing detecta y guía al nuevo flow |
| Motor de attribution da false positives | Media | Requiere min 200 pzas + 10 min post-acción; verdict 'insufficient-data' si no cumple |
| Runbooks con paths Z2 desactualizados | Media | Campo `source` con referencia documental; usuario puede reportar |
| Benchmark 206k pzas sesga si temporada cambia | Alta | Recargar benchmark por temporada (seasonKey config) |
| Firestore graderShifts crece sin límite | Baja | Uploads/actions arrays por turno son pocos (< 20); compactar si supera |

---

## 10. Resumen ejecutivo

**Total estimado:** 25 horas Sonnet repartidas en 6 fases.

**Entregables incrementales (cada fase independiente entrega valor):**

| Fase | Horas | Entregable usuario | Valor |
|---|---|---|---|
| 11 | 4 | Ninguno visible (solo infra) | Base para todo lo demás |
| 12 | 6 | Landing + Vista Turno unificada | **Experiencia visual nueva** |
| 13 | 5 | Timeline + Action plan | **Decisiones intra-turno** |
| 14 | 4 | Runbooks + Ayuda | **Autoservicio del operador** |
| 15 | 3 | Benchmark + Attribution | **Comparativa temporada** |
| 16 | 3 | IA + cleanup | **Pulido final** |

**Orden recomendado de ejecución:** 11 → 12 → 13 → (demostrar al usuario) → 14 → 15 → 16

**Checkpoint humano recomendado:** después de FASE 13 mostrar al supervisor real, validar que el flujo live/closed + timeline resuena. Si feedback positivo, continuar. Si necesita ajustes, iterar.

**Nota final:** este plan asume que el motor de análisis actual (`graderAnalytics.ts`) es confiable. Si durante FASE 11 se detectan bugs en la clasificación P0, pausar y arreglar antes de continuar.

---

**Fin del documento.**
