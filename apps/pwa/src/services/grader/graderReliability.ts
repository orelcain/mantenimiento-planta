/**
 * graderReliability.ts — Confiabilidad de Mantención sobre el período.
 *
 * "Lente de Mantención": aísla el tiempo de paro ATRIBUIBLE a Mantención
 * (pausas tagueadas `falla_equipo` = avería, `mantencion` = intervención) y
 * calcula los indicadores de confiabilidad de forma profesional y bien definida:
 *
 *   - MTTR-macro = tiempo total de paro de mantención / N° eventos (paros relevantes)
 *   - MTBF       = tiempo en operación (uptime) / N° fallas
 *   - Disponibilidad atribuible = uptime / tiempo operativo
 *   - Micro-detenciones (interferencias breves <5min) se reportan APARTE: su MTTR
 *     de pocos segundos no es accionable individualmente (no inflar el MTTR macro).
 *
 * Reutiliza:
 *   - GraderDailySummary (duración del turno + agregados de tiempo muerto/micro)
 *   - loadPausesAggregates() para el detalle de pausas ≥5min con su tag
 *   - El catálogo de tags (mantencion / falla_equipo) de graderPauseTags
 *
 * Diseño: `loadPausesForSummaries` hace el I/O (batched); `computeMaintenanceReliability`
 * es PURO (testeable sin Firestore).
 */

import type { GraderDailySummary, Pause } from './types'
import { loadPausesAggregates } from './graderDailySummary.service'

/** Tags de pausa atribuibles a Mantención. */
const FALLA_TAG = 'falla_equipo'        // avería del equipo
const INTERVENCION_TAG = 'mantencion'   // intervención de mantención
export const MAINTENANCE_PAUSE_TAG_IDS: ReadonlySet<string> = new Set([FALLA_TAG, INTERVENCION_TAG])

/** Tag efectivo de una pausa (manual gana sobre auto). */
function effectiveTagId(p: Pause): string | undefined {
  return p.tag ?? p.autoTag
}

export interface MaintenanceReliabilityTrendPoint {
  key: string
  label: string
  downtimeSec: number
  events: number
  /** true si la agrupación es por semana (período largo) */
  grouped?: boolean
}

export interface MaintenanceReliability {
  /** Turnos del período con datos de tiempo muerto. */
  shiftsWithData: number
  /** Tiempo operativo del período (suma de duración de turnos), en segundos. */
  operatingSec: number

  // ── Mantención (macro: paros relevantes ≥5min tagueados) ──
  /** Tiempo total de paro atribuible a Mantención (avería + intervención). */
  maintenanceDowntimeSec: number
  /** N° de eventos de mantención (fallas + intervenciones). */
  eventsCount: number
  fallasCount: number
  intervencionesCount: number
  /** MTTR macro = downtime / eventos. */
  mttrMacroSec: number
  /** MTBF = uptime / N° fallas. */
  mtbfSec: number
  /** Disponibilidad atribuible = uptime / operativo (0..100). null si no hay operativo. */
  availabilityPct: number | null

  // ── Micro-detenciones (se reportan aparte, poco accionables) ──
  microCount: number
  microSec: number
  mttrMicroSec: number

  // ── Contexto ──
  totalDeadSec: number
  /** % del tiempo muerto total que es de Mantención. null si no hay muerto. */
  maintenanceShareOfDeadPct: number | null
  /** N° de pausas ≥5min aún sin clasificar (afecta la confianza del cálculo). */
  unclassifiedPauses: number

  /** Tendencia de paro de mantención por día (o semana si período largo). */
  trend: MaintenanceReliabilityTrendPoint[]
}

/**
 * Carga las pausas ≥5min de los turnos con `pausesCount > 0`, en batches.
 * Mismo patrón que PauseKpiDashboard (BATCH=15) para no saturar Firestore.
 */
export async function loadPausesForSummaries(
  summaries: GraderDailySummary[],
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ summary: GraderDailySummary; pauses: Pause[] }>> {
  const withPauses = summaries.filter((s) => (s.pausesCount ?? 0) > 0)
  const out: Array<{ summary: GraderDailySummary; pauses: Pause[] }> = []
  const BATCH = 15
  let done = 0
  for (let i = 0; i < withPauses.length; i += BATCH) {
    const slice = withPauses.slice(i, i + BATCH)
    const results = await Promise.all(slice.map((s) => loadPausesAggregates(s.id)))
    results.forEach((r, j) => {
      if (r) out.push({ summary: slice[j]!, pauses: r.pauses })
    })
    done += slice.length
    onProgress?.(done, withPauses.length)
  }
  return out
}

function buildTrend(byDay: Record<string, { downtimeSec: number; events: number }>): MaintenanceReliabilityTrendPoint[] {
  const days = Object.keys(byDay).sort()
  const dayLabel = (k: string) =>
    new Date(`${k}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')

  if (days.length <= 60) {
    return days.map((k) => ({ key: k, label: dayLabel(k), downtimeSec: byDay[k]!.downtimeSec, events: byDay[k]!.events }))
  }
  // Período largo → agrupar por semana (lunes)
  const weekMap: Record<string, { downtimeSec: number; events: number; label: string }> = {}
  for (const k of days) {
    const d = new Date(`${k}T12:00:00`)
    const mon = new Date(d)
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const wk = mon.toISOString().slice(0, 10)
    const e = weekMap[wk] ?? (weekMap[wk] = { downtimeSec: 0, events: 0, label: dayLabel(wk) })
    e.downtimeSec += byDay[k]!.downtimeSec
    e.events += byDay[k]!.events
  }
  return Object.keys(weekMap).sort().map((wk) => ({
    key: wk, label: weekMap[wk]!.label, downtimeSec: weekMap[wk]!.downtimeSec, events: weekMap[wk]!.events, grouped: true,
  }))
}

/**
 * Calcula la confiabilidad de Mantención del período. PURO: recibe los resúmenes
 * y las pausas ya cargadas (de `loadPausesForSummaries`).
 */
export function computeMaintenanceReliability(
  summaries: GraderDailySummary[],
  loaded: Array<{ summary: GraderDailySummary; pauses: Pause[] }>,
): MaintenanceReliability {
  const withData = summaries.filter((s) => s.totalDeadTimeSec !== undefined)
  const operatingSec = withData.reduce((a, s) => a + (s.durationMinutes ?? 0) * 60, 0)
  const totalDeadSec = withData.reduce((a, s) => a + (s.totalDeadTimeSec ?? 0), 0)
  const microCount = withData.reduce((a, s) => a + (s.microDetentionsCount ?? 0), 0)
  const microSec = withData.reduce((a, s) => a + (s.microDetentionsTotalSec ?? 0), 0)

  let maintenanceDowntimeSec = 0
  let fallasCount = 0
  let intervencionesCount = 0
  let unclassifiedPauses = 0
  const byDay: Record<string, { downtimeSec: number; events: number }> = {}

  for (const { summary, pauses } of loaded) {
    for (const p of pauses) {
      const tag = effectiveTagId(p)
      if (!tag) { unclassifiedPauses++; continue }
      if (!MAINTENANCE_PAUSE_TAG_IDS.has(tag)) continue
      maintenanceDowntimeSec += p.durationSec
      if (tag === FALLA_TAG) fallasCount++
      else intervencionesCount++
      const d = byDay[summary.dateKey] ?? (byDay[summary.dateKey] = { downtimeSec: 0, events: 0 })
      d.downtimeSec += p.durationSec
      d.events++
    }
  }

  const eventsCount = fallasCount + intervencionesCount
  const mttrMacroSec = eventsCount > 0 ? maintenanceDowntimeSec / eventsCount : 0
  const uptime = Math.max(0, operatingSec - maintenanceDowntimeSec)
  const mtbfSec = fallasCount > 0 ? uptime / fallasCount : 0
  const availabilityPct = operatingSec > 0 ? (uptime / operatingSec) * 100 : null
  const mttrMicroSec = microCount > 0 ? microSec / microCount : 0
  const maintenanceShareOfDeadPct = totalDeadSec > 0 ? (maintenanceDowntimeSec / totalDeadSec) * 100 : null

  return {
    shiftsWithData: withData.length,
    operatingSec,
    maintenanceDowntimeSec,
    eventsCount,
    fallasCount,
    intervencionesCount,
    mttrMacroSec,
    mtbfSec,
    availabilityPct,
    microCount,
    microSec,
    mttrMicroSec,
    totalDeadSec,
    maintenanceShareOfDeadPct,
    unclassifiedPauses,
    trend: buildTrend(byDay),
  }
}

/** Formatea segundos a "Xh Ym" / "Ym" / "Zs" legible. */
export function formatReliabilityDuration(totalSec: number): string {
  if (totalSec < 60) return `${Math.round(totalSec)}s`
  const h = Math.floor(totalSec / 3600)
  const m = Math.round((totalSec % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}
