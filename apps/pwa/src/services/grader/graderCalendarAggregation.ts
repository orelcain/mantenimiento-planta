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
  /** Día calendario al que aporta esta contribución (igual al key del agregado padre) */
  dateKey: string
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
   * Origen de los datos:
   * - `timeline`: precision por minuto desde TimelineBucket sub-collection
   * - `hourly`: precision por hora desde hourlyBuckets del summary (turno
   *   noche que cruza medianoche se reparte heurísticamente por hour del bucket)
   * - `legacy`: sin granularidad — todo el summary atribuido al día de inicio
   */
  source: 'timeline' | 'hourly' | 'legacy'
  /**
   * % de las piezas TOTALES del summary que cayeron en este día calendario (0-100).
   * Se computa después de procesar todos los aportes del summary.
   * Para summaries que solo aparecen en 1 día (sin cruce real) → 100.
   * Suma de pctOfShift across days del mismo summary === 100 (con redondeo).
   */
  pctOfShift: number
  /**
   * `true` si este es el día con MÁS carga del summary (suele ser donde se
   * espera ver el "Ver detalle" prominente en el calendario).
   * Para summaries que solo aparecen en 1 día (turno completo o huérfano) → true.
   * Tiebreaker en empate (50/50): la contribución con menor `dateKey` (día anterior)
   * gana — criterio determinista para que el render sea estable.
   */
  isPrimary: boolean
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
 * Path C (hourly): si no hay timelineBuckets pero el summary trae
 * `hourlyBuckets` + `startAt` + `endAt`, las horas se reparten entre día de
 * inicio y día siguiente usando la heurística "hours >= startHour van al día
 * de inicio, hours < startHour van al día siguiente" (sólo si el turno cruza
 * medianoche). Precision por hora. Es el path que usa el panel mensual sin
 * pagar el costo de cargar 40+ docs `meta/timeline`.
 *
 * Path B (legacy fallback): si no hay buckets ni hourly+bounds, el summary
 * completo se atribuye a `summary.dateKey` (mismo comportamiento que hoy).
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
    } else if (canUseHourlyPath(summary)) {
      contributeFromHourly(summary, getOrCreate)
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

  // Post-process: marcar contribución principal por summary y computar pctOfShift.
  // Un summary puede aparecer en hasta 2 días (cuando su turno cruza medianoche).
  // El "principal" es donde tuvo más piezas — usado por el calendario para
  // decidir qué chip pintar prominente vs secundario.
  markPrimaryAndComputePct(result)

  return result
}

function markPrimaryAndComputePct(
  result: Map<string, CalendarDayAggregate>,
): void {
  const contribsBySummary = new Map<string, CalendarDayContribution[]>()
  for (const agg of result.values()) {
    for (const c of agg.contributingShifts) {
      const arr = contribsBySummary.get(c.summaryId) ?? []
      arr.push(c)
      contribsBySummary.set(c.summaryId, arr)
    }
  }

  for (const contribs of contribsBySummary.values()) {
    const totalPieces = contribs.reduce((s, c) => s + c.pieces, 0)
    for (const c of contribs) {
      c.pctOfShift = totalPieces > 0 ? r(c.pieces / totalPieces * 100, 1) : 0
    }
    // Determinar primary: max pieces; empate → menor dateKey (día anterior gana)
    let primary: CalendarDayContribution = contribs[0]!
    for (const c of contribs) {
      if (c.pieces > primary.pieces) {
        primary = c
      } else if (c.pieces === primary.pieces && c.dateKey < primary.dateKey) {
        primary = c
      }
    }
    for (const c of contribs) {
      c.isPrimary = c === primary
    }
  }
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
      dateKey,
      summaryId: summary.id,
      shiftDateKey: summary.dateKey,
      shiftId: summary.shiftId,
      pieces: contrib.pieces,
      pointZeroPieces: contrib.p0,
      weightKg: contrib.hasWeight ? r(contrib.weightKg, 2) : undefined,
      activeMinutes: contrib.minutes,
      source: 'timeline',
      // pctOfShift y isPrimary se calculan en markPrimaryAndComputePct
      pctOfShift: 0,
      isPrimary: false,
    })
  }
}

// ── Path C: precision por hora (hourlyBuckets + startAt/endAt) ────────────────

function canUseHourlyPath(summary: GraderDailySummary): boolean {
  return !!(
    summary.hourlyBuckets &&
    summary.hourlyBuckets.length > 0 &&
    summary.startAt &&
    summary.endAt
  )
}

/**
 * Reconstruye el día calendario al que pertenece cada hour bucket.
 *
 * Convención wall-clock-as-UTC: `startAt = "2026-04-12T21:30:00.000Z"`
 * representa 21:30 hora Chile, no UTC. La string slice del hour funciona
 * directamente sin conversión TZ.
 *
 * - Turno que NO cruza medianoche (start.dateKey === end.dateKey):
 *   todas las horas → start.dateKey
 * - Turno que SÍ cruza:
 *   hours >= startHour → start.dateKey (parte vespertina)
 *   hours <  startHour → end.dateKey   (parte madrugada del día siguiente)
 *
 * Esta heurística asume turnos de máximo 24h y schedules razonables. Para
 * turnos exóticos (ej. 30h continuos) se requeriría usar timelineBuckets.
 */
function dateKeyForHour(
  hour: number,
  startDateKey: string,
  endDateKey: string,
  startHour: number,
): string {
  if (startDateKey === endDateKey) return startDateKey
  return hour >= startHour ? startDateKey : endDateKey
}

function contributeFromHourly(
  summary: GraderDailySummary,
  getOrCreate: (k: string) => CalendarDayAggregate,
): void {
  const startDateKey = summary.startAt!.slice(0, 10)
  const endDateKey = summary.endAt!.slice(0, 10)
  const startHour = Number(summary.startAt!.slice(11, 13))

  // Agrupar piezas por día calendario
  interface PerDayAcc {
    pieces: number
    p0: number
    hours: Set<number>
  }
  const byDay = new Map<string, PerDayAcc>()

  for (const hb of summary.hourlyBuckets!) {
    const dateKey = dateKeyForHour(hb.hour, startDateKey, endDateKey, startHour)
    let acc = byDay.get(dateKey)
    if (!acc) {
      acc = { pieces: 0, p0: 0, hours: new Set() }
      byDay.set(dateKey, acc)
    }
    acc.pieces += hb.totalPieces
    acc.p0 += hb.p0Pieces
    acc.hours.add(hb.hour)
  }

  // Calcular ratio de cada día respecto al total de piezas para repartir
  // proporcionalmente weightKg y durationMinutes (que vienen como totales del turno).
  const totalPiecesInBuckets = Array.from(byDay.values()).reduce(
    (s, v) => s + v.pieces,
    0,
  )

  for (const [dateKey, contrib] of byDay) {
    const ratio = totalPiecesInBuckets > 0 ? contrib.pieces / totalPiecesInBuckets : 0
    const agg = getOrCreate(dateKey)

    agg.totalPieces += contrib.pieces
    agg.pointZeroPieces += contrib.p0

    let weightKg: number | undefined
    if (summary.totalWeightKg != null && summary.totalWeightKg > 0 && ratio > 0) {
      weightKg = r(summary.totalWeightKg * ratio, 2)
      agg.totalWeightKg = r((agg.totalWeightKg ?? 0) + weightKg, 2)
    }

    const activeMinutes = summary.durationMinutes
      ? Math.round(summary.durationMinutes * ratio)
      : 0
    agg.activeMinutes += activeMinutes

    agg.contributingShifts.push({
      dateKey,
      summaryId: summary.id,
      shiftDateKey: summary.dateKey,
      shiftId: summary.shiftId,
      pieces: contrib.pieces,
      pointZeroPieces: contrib.p0,
      weightKg,
      activeMinutes,
      source: 'hourly',
      pctOfShift: 0,
      isPrimary: false,
    })
  }
}

// ── Path B: fallback legacy (sin timeline ni hourly) ──────────────────────────

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
    dateKey: summary.dateKey,
    summaryId: summary.id,
    shiftDateKey: summary.dateKey,
    shiftId: summary.shiftId,
    pieces: summary.totalPieces,
    pointZeroPieces: summary.pointZeroPieces,
    weightKg: summary.totalWeightKg,
    activeMinutes: summary.durationMinutes ?? 0,
    source: 'legacy',
    pctOfShift: 0,
    isPrimary: false,
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
