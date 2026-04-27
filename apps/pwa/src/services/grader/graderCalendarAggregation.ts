/**
 * Reagregación de turnos por DÍA CALENDARIO REAL.
 *
 * Convención actual (graderSegmenter.assignShiftAndDate): un turno noche que
 * va de dom 21:30 → lun 06:00 se guarda con `dateKey = domingo` (día de inicio).
 * Esto hace que el calendario muestre 49t completas bajo el domingo aunque
 * la mayoría del peso pasó físicamente el lunes — y el lunes aparece vacío
 * si no tuvo turno día propio.
 *
 * Esta función reagrega los datos de los summaries usando los timestamps reales
 * de los `TimelineBucket` (1 minuto granularidad) para producir un mapa
 * `{dateKey calendario → KPIs físicamente ocurridos ese día}`. Los IDs de los
 * summaries en Firestore NO cambian — esto es solo una vista derivada.
 *
 * Función pura: dado un input idéntico, output idéntico. Sin side effects.
 *
 * Ver `project_grader_night_shift_attribution.md` (Opción D) para el contexto
 * arquitectónico y decisión de diseño.
 */

import type { GraderDailySummary, TimelineBucket } from './types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function r(v: number, dec: number): number {
  const f = 10 ** dec
  return Math.round(v * f) / f
}

// ── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Aporte de un summary individual a un día calendario.
 *
 * Un mismo summary puede aparecer en `contributingShifts` de hasta 2 días
 * calendario distintos (cuando su turno cruza medianoche).
 */
export interface CalendarDayContribution {
  /** ID del summary fuente: `${dateKey}__${shiftId}` */
  summaryId: string
  /** dateKey del summary (día de inicio del turno, atribución legacy) */
  shiftDateKey: string
  /** 'Turno día' | 'Turno noche' */
  shiftId: string
  /** Piezas de este summary que cayeron en este día calendario */
  pieces: number
  /** Piezas P0 de este summary que cayeron en este día calendario */
  pointZeroPieces: number
  /** Peso (kg) de este summary atribuido a este día. Undefined si el summary no tiene peso. */
  weightKg?: number
  /** Minutos con actividad de este summary en este día calendario */
  activeMinutes: number
  /**
   * Si los datos provienen de los timelineBuckets (precision por minuto)
   * o de un fallback legacy (todo el summary atribuido al día de inicio).
   */
  source: 'timeline' | 'legacy'
}

/** Agregado de un día calendario completo (puede recibir aportes de varios turnos). */
export interface CalendarDayAggregate {
  /** YYYY-MM-DD del día calendario real */
  dateKey: string
  /** Piezas totales que físicamente pasaron este día */
  totalPieces: number
  /** Piezas P0 que físicamente pasaron este día */
  pointZeroPieces: number
  /** P0% recalculado: pointZeroPieces / totalPieces × 100 (0 si totalPieces=0) */
  pointZeroPct: number
  /** Peso total en kg. Undefined si ningún summary contribuyente tenía peso. */
  totalWeightKg?: number
  /** Minutos únicos con actividad real este día (proxy de uptime Grader) */
  activeMinutes: number
  /** Summaries que aportaron datos a este día calendario */
  contributingShifts: CalendarDayContribution[]
}

export interface CalendarAggregationInput {
  /** Summaries cuyos timelineBuckets pueden contribuir al rango deseado. */
  summaries: GraderDailySummary[]
  /**
   * TimelineBuckets indexados por id de summary (`dateKey__shiftId`).
   *
   * Si un summary no aparece en este map (o el array es vacío), se usa el
   * fallback legacy: todo el summary se atribuye a `summary.dateKey`,
   * preservando el comportamiento actual del calendario sin riesgo.
   *
   * Cargar los buckets es responsabilidad del caller (ver `loadTimelineAggregates`).
   */
  timelinesBySummaryId?: Map<string, TimelineBucket[]>
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Reagrupa summaries y sus timelineBuckets por día calendario real.
 *
 * Path A (preferido): si el summary tiene buckets en `timelinesBySummaryId`,
 * cada bucket aporta sus piezas al `tsMin.slice(0,10)`. Precision por minuto.
 *
 * Path B (fallback): si no hay buckets, el summary completo se atribuye a
 * `summary.dateKey` (mismo comportamiento que hoy). La contribución se marca
 * `source: 'legacy'` para que la UI pueda señalarlo si quisiera.
 *
 * NOTA convencional: los timestamps del Grader son wall-clock-as-UTC (ver
 * `graderSegmenter.computeShiftSummary` línea 486 — usa `getUTCHours()` para
 * extraer el wall-clock value). Por eso `tsMin.slice(0, 10)` produce el
 * día calendario local Chile correctamente.
 */
export function aggregateByCalendarDay(
  input: CalendarAggregationInput,
): Map<string, CalendarDayAggregate> {
  const { summaries, timelinesBySummaryId } = input
  const result = new Map<string, CalendarDayAggregate>()

  const getOrCreate = (dateKey: string): CalendarDayAggregate => {
    let agg = result.get(dateKey)
    if (!agg) {
      agg = {
        dateKey,
        totalPieces: 0,
        pointZeroPieces: 0,
        pointZeroPct: 0,
        activeMinutes: 0,
        contributingShifts: [],
      }
      result.set(dateKey, agg)
    }
    return agg
  }

  for (const summary of summaries) {
    const buckets = timelinesBySummaryId?.get(summary.id)
    if (buckets && buckets.length > 0) {
      contributeFromTimeline(summary, buckets, getOrCreate)
    } else {
      contributeFromLegacy(summary, getOrCreate)
    }
  }

  // Recalcular pointZeroPct final (después de sumar todas las contribuciones)
  for (const agg of result.values()) {
    agg.pointZeroPct = agg.totalPieces > 0
      ? r(agg.pointZeroPieces / agg.totalPieces * 100, 2)
      : 0
  }

  return result
}

// ── Path A: precision por minuto ──────────────────────────────────────────────

function contributeFromTimeline(
  summary: GraderDailySummary,
  buckets: TimelineBucket[],
  getOrCreate: (k: string) => CalendarDayAggregate,
): void {
  // Agrupar buckets por día calendario primero (un summary puede tocar 2 días)
  interface PerDayAcc {
    pieces: number
    p0: number
    weightKg: number
    hasWeight: boolean
    minutes: number
  }
  const byDay = new Map<string, PerDayAcc>()

  for (const b of buckets) {
    const dateKey = b.tsMin.slice(0, 10)
    let acc = byDay.get(dateKey)
    if (!acc) {
      acc = { pieces: 0, p0: 0, weightKg: 0, hasWeight: false, minutes: 0 }
      byDay.set(dateKey, acc)
    }
    acc.pieces += b.pieces
    acc.p0 += b.p0Pieces
    if (b.weightKg != null && b.weightKg > 0) {
      acc.weightKg += b.weightKg
      acc.hasWeight = true
    }
    acc.minutes += 1 // cada bucket es un minuto único (truncado en `tsMin`)
  }

  for (const [dateKey, contrib] of byDay) {
    const agg = getOrCreate(dateKey)
    agg.totalPieces += contrib.pieces
    agg.pointZeroPieces += contrib.p0
    if (contrib.hasWeight) {
      agg.totalWeightKg = r((agg.totalWeightKg ?? 0) + contrib.weightKg, 2)
    }
    agg.activeMinutes += contrib.minutes
    agg.contributingShifts.push({
      summaryId: summary.id,
      shiftDateKey: summary.dateKey,
      shiftId: summary.shiftId,
      pieces: contrib.pieces,
      pointZeroPieces: contrib.p0,
      weightKg: contrib.hasWeight ? r(contrib.weightKg, 2) : undefined,
      activeMinutes: contrib.minutes,
      source: 'timeline',
    })
  }
}

// ── Path B: fallback legacy (sin timeline) ────────────────────────────────────

function contributeFromLegacy(
  summary: GraderDailySummary,
  getOrCreate: (k: string) => CalendarDayAggregate,
): void {
  // Sin timelineBuckets: preservar comportamiento actual.
  // Todo el summary se atribuye al día de inicio del turno (summary.dateKey).
  const agg = getOrCreate(summary.dateKey)
  agg.totalPieces += summary.totalPieces
  agg.pointZeroPieces += summary.pointZeroPieces
  if (summary.totalWeightKg != null && summary.totalWeightKg > 0) {
    agg.totalWeightKg = r((agg.totalWeightKg ?? 0) + summary.totalWeightKg, 2)
  }
  agg.activeMinutes += summary.durationMinutes ?? 0
  agg.contributingShifts.push({
    summaryId: summary.id,
    shiftDateKey: summary.dateKey,
    shiftId: summary.shiftId,
    pieces: summary.totalPieces,
    pointZeroPieces: summary.pointZeroPieces,
    weightKg: summary.totalWeightKg,
    activeMinutes: summary.durationMinutes ?? 0,
    source: 'legacy',
  })
}

// ── Helpers de presentación ───────────────────────────────────────────────────

/** Devuelve los agregados ordenados por dateKey ascendente (útil para listas/tablas). */
export function sortedCalendarDays(
  map: Map<string, CalendarDayAggregate>,
): CalendarDayAggregate[] {
  return Array.from(map.values()).sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0,
  )
}

/**
 * Filtra los agregados a un rango (inclusive) de dateKeys.
 * Útil para acotar al mes que muestra el calendario sin recomputar.
 */
export function filterCalendarDaysInRange(
  map: Map<string, CalendarDayAggregate>,
  fromDateKey: string,
  toDateKey: string,
): CalendarDayAggregate[] {
  const out: CalendarDayAggregate[] = []
  for (const agg of map.values()) {
    if (agg.dateKey >= fromDateKey && agg.dateKey <= toDateKey) out.push(agg)
  }
  return out.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
}
