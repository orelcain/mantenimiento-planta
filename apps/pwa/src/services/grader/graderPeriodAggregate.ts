/**
 * Agregador de `GraderDailySummary[]` para el análisis de período del Grader.
 *
 * Toma N resúmenes diarios por turno (cada uno ya tiene KPIs + distribuciones
 * + causas P0 pre-computados) y los consolida en un único objeto con:
 *  - KPIs globales del rango (P0% ponderado por piezas, no promedio simple)
 *  - Serie diaria de P0% (para el line chart de tendencia)
 *  - Breakdown por tipo de turno (día/tarde/noche)
 *  - Distribuciones consolidadas (calibre, calidad, compuerta)
 *  - Top 10 causas P0 consolidadas
 *  - Minimum/maximum day (para detectar días extremos)
 *
 * Todos los porcentajes se calculan sobre totales reales (piezas) para evitar
 * el sesgo de turnos cortos vs largos que afectaría un promedio simple.
 */

import type { GraderDailySummary } from './types'

// ── Tipos de salida ──────────────────────────────────────────────────────────

export interface PeriodRangeLabel {
  start: string // YYYY-MM-DD
  end: string   // YYYY-MM-DD
  label: string
}

export interface PeriodStats {
  totalPieces: number
  totalP0Pieces: number
  p0PctWeighted: number // ponderado por piezas
  totalWeightKg: number
  avgProductionRatePerHour: number // ponderado por duración
  totalDurationMinutes: number
  daysCount: number
  shiftsCount: number
  minP0Day: { dateKey: string; p0Pct: number } | null
  maxP0Day: { dateKey: string; p0Pct: number } | null
}

export interface DailyP0Point {
  dateKey: string
  /** P0% agregado del día (ambos turnos combinados, ponderado) */
  p0Pct: number
  totalPieces: number
  p0Pieces: number
  /** Turno día — null si no hay registro de ese turno en el día */
  dia: { p0Pct: number; totalPieces: number; p0Pieces: number } | null
  /** Turno noche — null si no hay registro de ese turno en el día */
  noche: { p0Pct: number; totalPieces: number; p0Pieces: number } | null
}

/**
 * Punto del drill-down por hora del día. Cada punto es una hora de un turno
 * específico, ordenado cronológicamente. Turno noche que cruza medianoche:
 * las horas < 12 se desplazan a `dateKey + 1` para ordenamiento correcto.
 */
export interface HourlyPoint {
  /** Timestamp ms del inicio de la hora, útil solo para ordenar */
  tsMs: number
  /** Día del turno (YYYY-MM-DD) */
  dateKey: string
  /** "Turno día" o "Turno noche" */
  shiftId: string
  /** Hora del día (0-23) en zona horaria del grader */
  hour: number
  totalPieces: number
  p0Pieces: number
  p0Pct: number
  /** Label humano "DD/MM HHh D/N" para el eje X del chart */
  label: string
}

export interface ShiftGroupStat {
  shiftId: string
  count: number
  p0PctWeighted: number
  totalPieces: number
  totalP0Pieces: number
}

export interface DistEntry {
  key: string
  pieces: number
  pct: number
}

export interface CauseEntry {
  error: string
  pieces: number
  pct: number
}

export interface PeriodAggregate {
  range: PeriodRangeLabel
  shifts: GraderDailySummary[]
  stats: PeriodStats
  dailyP0Series: DailyP0Point[]
  /**
   * Serie por hora × turno para drill-down cuando zoom ≤ 2 días.
   * Construida desde `hourlyBuckets` de cada summary. Vacía si ningún
   * summary en el rango tiene hourlyBuckets (legacy pre-iter 18).
   */
  hourlySeries: HourlyPoint[]
  shiftBreakdown: ShiftGroupStat[]
  calibreDistribution: DistEntry[]
  qualityDistribution: DistEntry[]
  gateDistribution: DistEntry[]
  topP0Causes: CauseEntry[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function r(v: number, dec: number): number {
  const f = 10 ** dec
  return Math.round(v * f) / f
}

function safePct(num: number, den: number): number {
  return den > 0 ? r((num / den) * 100, 2) : 0
}

/** Consolida distribuciones sumando piezas por key y recalcula pct al final. */
function consolidateDistribution<T extends { pieces: number }>(
  items: Array<T & { calibre?: string; quality?: string; gate?: number }>,
  keyGetter: (x: T) => string,
): DistEntry[] {
  const map = new Map<string, number>()
  for (const it of items) {
    const k = keyGetter(it)
    map.set(k, (map.get(k) ?? 0) + it.pieces)
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0)
  return Array.from(map.entries())
    .map(([key, pieces]) => ({ key, pieces, pct: safePct(pieces, total) }))
    .sort((a, b) => b.pieces - a.pieces)
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Agrega una lista de `GraderDailySummary` en un único `PeriodAggregate`.
 *
 * El `range` se pasa explícitamente (label del preset o custom) porque los
 * summaries solos no conocen el rango que los motivó.
 */
export function aggregateDailySummaries(
  summaries: GraderDailySummary[],
  range: PeriodRangeLabel,
): PeriodAggregate {
  // ── Totales ──────────────────────────────────────────────────────────────
  let totalPieces = 0
  let totalP0Pieces = 0
  let totalWeightKg = 0
  let totalDurationMinutes = 0

  const uniqueDays = new Set<string>()
  const dailyByDate = new Map<string, {
    totalPieces: number; p0Pieces: number
    dia: { totalPieces: number; p0Pieces: number } | null
    noche: { totalPieces: number; p0Pieces: number } | null
  }>()
  const shiftGroups = new Map<string, { count: number; totalPieces: number; totalP0Pieces: number }>()
  const hourlySeries: HourlyPoint[] = []

  let minP0Day: { dateKey: string; p0Pct: number } | null = null
  let maxP0Day: { dateKey: string; p0Pct: number } | null = null

  // Acumular entradas de distribución y causas para consolidar después
  const allCalibres: Array<{ key: string; pieces: number }> = []
  const allQualities: Array<{ key: string; pieces: number }> = []
  const allGates: Array<{ key: string; pieces: number }> = []
  const allCauses = new Map<string, number>()
  let totalCausesPieces = 0

  for (const s of summaries) {
    totalPieces += s.totalPieces ?? 0
    totalP0Pieces += s.pointZeroPieces ?? 0
    if (s.totalWeightKg != null) totalWeightKg += s.totalWeightKg
    if (s.durationMinutes != null) totalDurationMinutes += s.durationMinutes
    uniqueDays.add(s.dateKey)

    // Serie diaria — acumular por dateKey, separando por turno
    const dayEntry = dailyByDate.get(s.dateKey) ?? { totalPieces: 0, p0Pieces: 0, dia: null, noche: null }
    dayEntry.totalPieces += s.totalPieces ?? 0
    dayEntry.p0Pieces += s.pointZeroPieces ?? 0
    if (s.shiftId === 'Turno día') {
      dayEntry.dia = dayEntry.dia ?? { totalPieces: 0, p0Pieces: 0 }
      dayEntry.dia.totalPieces += s.totalPieces ?? 0
      dayEntry.dia.p0Pieces += s.pointZeroPieces ?? 0
    } else if (s.shiftId === 'Turno noche') {
      dayEntry.noche = dayEntry.noche ?? { totalPieces: 0, p0Pieces: 0 }
      dayEntry.noche.totalPieces += s.totalPieces ?? 0
      dayEntry.noche.p0Pieces += s.pointZeroPieces ?? 0
    }
    dailyByDate.set(s.dateKey, dayEntry)

    // Breakdown por turno
    const group = shiftGroups.get(s.shiftId) ?? { count: 0, totalPieces: 0, totalP0Pieces: 0 }
    group.count += 1
    group.totalPieces += s.totalPieces ?? 0
    group.totalP0Pieces += s.pointZeroPieces ?? 0
    shiftGroups.set(s.shiftId, group)

    // Distribuciones — acumular entries para consolidar
    if (s.calibreDistribution) {
      for (const c of s.calibreDistribution) {
        allCalibres.push({ key: c.calibre, pieces: c.pieces })
      }
    }
    if (s.qualityDistribution) {
      for (const q of s.qualityDistribution) {
        allQualities.push({ key: q.quality, pieces: q.pieces })
      }
    }
    if (s.gateDistribution) {
      for (const g of s.gateDistribution) {
        allGates.push({ key: String(g.gate), pieces: g.pieces })
      }
    }

    // Causas P0 — merge por error string, recalculamos pct al final
    if (s.topP0Causes) {
      for (const c of s.topP0Causes) {
        allCauses.set(c.error, (allCauses.get(c.error) ?? 0) + c.pieces)
        totalCausesPieces += c.pieces
      }
    }

    // ── Hourly buckets → hourlySeries ───────────────────────────────────────
    // Para turno noche, horas 0-11 pertenecen al día siguiente calendario
    // (el turno arranca tarde en el dateKey y cruza medianoche).
    if (s.hourlyBuckets && s.hourlyBuckets.length > 0) {
      const [ystr, mstr, dstr] = s.dateKey.split('-')
      const y = Number(ystr)
      const m = Number(mstr)
      const d = Number(dstr)
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        const baseTime = new Date(y, m - 1, d).getTime()
        const isNoche = s.shiftId === 'Turno noche'
        const shiftTag = isNoche ? 'N' : 'D'
        for (const b of s.hourlyBuckets) {
          const dayOffset = isNoche && b.hour < 12 ? 86_400_000 : 0
          const tsMs = baseTime + dayOffset + b.hour * 3_600_000
          const dd = String(d).padStart(2, '0')
          const mm = String(m).padStart(2, '0')
          const hh = String(b.hour).padStart(2, '0')
          hourlySeries.push({
            tsMs,
            dateKey: s.dateKey,
            shiftId: s.shiftId,
            hour: b.hour,
            totalPieces: b.totalPieces,
            p0Pieces: b.p0Pieces,
            p0Pct: safePct(b.p0Pieces, b.totalPieces),
            label: `${dd}/${mm} ${hh}h ${shiftTag}`,
          })
        }
      }
    }
  }

  // Ordenar cronológicamente (tsMs incluye offset para noche post-medianoche)
  hourlySeries.sort((a, b) => a.tsMs - b.tsMs)

  // ── Serie diaria final ordenada por fecha ────────────────────────────────
  const dailyP0Series: DailyP0Point[] = Array.from(dailyByDate.entries())
    .map(([dateKey, v]) => ({
      dateKey,
      p0Pct: safePct(v.p0Pieces, v.totalPieces),
      totalPieces: v.totalPieces,
      p0Pieces: v.p0Pieces,
      dia: v.dia ? {
        p0Pct: safePct(v.dia.p0Pieces, v.dia.totalPieces),
        totalPieces: v.dia.totalPieces,
        p0Pieces: v.dia.p0Pieces,
      } : null,
      noche: v.noche ? {
        p0Pct: safePct(v.noche.p0Pieces, v.noche.totalPieces),
        totalPieces: v.noche.totalPieces,
        p0Pieces: v.noche.p0Pieces,
      } : null,
    }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1))

  // Min/max P0 del período
  for (const d of dailyP0Series) {
    if (d.totalPieces === 0) continue // día sin producción, ignorar para min/max
    if (!minP0Day || d.p0Pct < minP0Day.p0Pct) minP0Day = { dateKey: d.dateKey, p0Pct: d.p0Pct }
    if (!maxP0Day || d.p0Pct > maxP0Day.p0Pct) maxP0Day = { dateKey: d.dateKey, p0Pct: d.p0Pct }
  }

  // ── Breakdown por turno ordenado día → noche ─────────────────────────────
  const shiftOrder: Record<string, number> = {
    'Turno día': 0,
    'Turno noche': 1,
  }
  const shiftBreakdown: ShiftGroupStat[] = Array.from(shiftGroups.entries())
    .map(([shiftId, g]) => ({
      shiftId,
      count: g.count,
      totalPieces: g.totalPieces,
      totalP0Pieces: g.totalP0Pieces,
      p0PctWeighted: safePct(g.totalP0Pieces, g.totalPieces),
    }))
    .sort((a, b) => (shiftOrder[a.shiftId] ?? 9) - (shiftOrder[b.shiftId] ?? 9))

  // ── Consolidar distribuciones ────────────────────────────────────────────
  const calibreDist = consolidateDistribution(allCalibres, (x) => x.key).slice(0, 20)
  const qualityDist = consolidateDistribution(allQualities, (x) => x.key).slice(0, 10)
  const gateDist = consolidateDistribution(allGates, (x) => x.key).slice(0, 15)

  // ── Top causas P0 consolidadas ───────────────────────────────────────────
  const topP0Causes: CauseEntry[] = Array.from(allCauses.entries())
    .map(([error, pieces]) => ({
      error,
      pieces,
      pct: safePct(pieces, totalCausesPieces),
    }))
    .sort((a, b) => b.pieces - a.pieces)
    .slice(0, 10)

  // ── Production rate ponderado por duración ───────────────────────────────
  const avgProductionRatePerHour = totalDurationMinutes > 0
    ? r(totalPieces / (totalDurationMinutes / 60), 0)
    : 0

  return {
    range,
    shifts: summaries,
    stats: {
      totalPieces,
      totalP0Pieces,
      p0PctWeighted: safePct(totalP0Pieces, totalPieces),
      totalWeightKg: r(totalWeightKg, 2),
      avgProductionRatePerHour,
      totalDurationMinutes,
      daysCount: uniqueDays.size,
      shiftsCount: summaries.length,
      minP0Day,
      maxP0Day,
    },
    dailyP0Series,
    hourlySeries,
    shiftBreakdown,
    calibreDistribution: calibreDist,
    qualityDistribution: qualityDist,
    gateDistribution: gateDist,
    topP0Causes,
  }
}

// ── Recomputar stats desde un subset de summaries (para KPIs dinámicos) ─────

/**
 * Recomputa solo los KPIs básicos ({@link PeriodStats}) a partir de un
 * subset de summaries. Útil para actualizar el header de KPIs cuando el
 * usuario hace zoom/pan en el gráfico y quiere ver los números del rango
 * visible sin recomputar distribuciones ni causas completas.
 */
export function computeStatsFromSummaries(
  summaries: GraderDailySummary[],
): PeriodStats {
  let totalPieces = 0
  let totalP0Pieces = 0
  let totalWeightKg = 0
  let totalDurationMinutes = 0
  const uniqueDays = new Set<string>()
  const dayMap = new Map<string, { total: number; p0: number }>()

  for (const s of summaries) {
    totalPieces += s.totalPieces ?? 0
    totalP0Pieces += s.pointZeroPieces ?? 0
    if (s.totalWeightKg != null) totalWeightKg += s.totalWeightKg
    if (s.durationMinutes != null) totalDurationMinutes += s.durationMinutes
    uniqueDays.add(s.dateKey)
    const agg = dayMap.get(s.dateKey) ?? { total: 0, p0: 0 }
    agg.total += s.totalPieces ?? 0
    agg.p0 += s.pointZeroPieces ?? 0
    dayMap.set(s.dateKey, agg)
  }

  let minP0Day: { dateKey: string; p0Pct: number } | null = null
  let maxP0Day: { dateKey: string; p0Pct: number } | null = null
  for (const [dateKey, v] of dayMap.entries()) {
    if (v.total === 0) continue
    const p0Pct = safePct(v.p0, v.total)
    if (!minP0Day || p0Pct < minP0Day.p0Pct) minP0Day = { dateKey, p0Pct }
    if (!maxP0Day || p0Pct > maxP0Day.p0Pct) maxP0Day = { dateKey, p0Pct }
  }

  return {
    totalPieces,
    totalP0Pieces,
    p0PctWeighted: safePct(totalP0Pieces, totalPieces),
    totalWeightKg: r(totalWeightKg, 2),
    avgProductionRatePerHour: totalDurationMinutes > 0
      ? r(totalPieces / (totalDurationMinutes / 60), 0)
      : 0,
    totalDurationMinutes,
    daysCount: uniqueDays.size,
    shiftsCount: summaries.length,
    minP0Day,
    maxP0Day,
  }
}
