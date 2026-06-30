/**
 * proactiveAlerts — ARIA detecta SOLA cuando un KPI del último turno está fuera de
 * umbral y genera "avisos" que se muestran en una tarjeta del dashboard ("ARIA te
 * avisa") y en un saludo proactivo del chat.
 *
 * v1: dispara por KPIs de turno bajo umbral (OEE / disponibilidad / rendimiento /
 * calidad / MTTR / MTBF) usando los MISMOS cortes que el board (`kpiThresholds`) y la
 * MISMA fuente de datos que el chatbot (`getLatestTurnoKPIs`). Así un aviso de ARIA
 * coincide con lo que la app pinta en rojo/amarillo.
 *
 * Sirve a la meta del proyecto: evidenciar con datos que Mantención mueve la aguja —
 * los avisos atan cada número (MTTR alto, MTBF bajo) a una acción de mantenimiento.
 */
import { listDailySummariesByRange } from '@/services/grader/graderDailySummary.service'
import type { GraderDailySummary } from '@/services/grader/types'
import { getLatestTurnoKPIs } from '@/services/grader/turnoKpis'
import type { PlantKPIs } from '@/services/grader/plantKpiCompute'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import { KPI_CUTOFFS, toneHigherBetter, toneLowerBetter, type KpiTone } from '@/services/grader/kpiThresholds'

export type AlertSeverity = 'warn' | 'critical'
export type AlertMetric = 'oee' | 'availability' | 'performance' | 'quality' | 'mttr' | 'mtbf'

export interface AriaAlert {
  /** Clave estable (dedup / persistencia futura): kpi:<metric>:<plant>:<date>:<shift>. */
  id: string
  severity: AlertSeverity
  metric: AlertMetric
  /** Etiqueta corta del KPI: "OEE", "MTTR". */
  label: string
  /** Valor formateado: "62%", "18.4 min". */
  valueText: string
  /** Frase lista para mostrar/decir. */
  message: string
  plantSlug: PlantSlug
  plantLabel: string
  /** "Turno 2 · 2026-02-27". */
  shiftLabel: string
}

function fmtFracPct(frac: number | null | undefined): string {
  if (frac === null || frac === undefined || !isFinite(frac)) return '—'
  return `${Math.round(frac * 100)}%`
}
function fmtMin(min: number): string {
  return `${min.toFixed(1)} min`
}
function fmtHours(h: number): string {
  return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warn: 1 }

/**
 * Builder PURO: de los KPIs de un turno → lista de avisos (los que están fuera de
 * umbral). Ordena críticos primero. Testeable sin Firestore.
 */
export function kpiTurnoAlerts(kpis: PlantKPIs, plantSlug: PlantSlug, plantLabel: string): AriaAlert[] {
  const shiftLabel = `Turno ${kpis.shiftId} · ${kpis.dateKey}`
  const alerts: AriaAlert[] = []
  const add = (metric: AlertMetric, tone: KpiTone, label: string, valueText: string, message: string): void => {
    if (tone === 'good') return
    alerts.push({
      id: `kpi:${metric}:${plantSlug}:${kpis.dateKey}:${kpis.shiftId}`,
      severity: tone,
      metric,
      label,
      valueText,
      message,
      plantSlug,
      plantLabel,
      shiftLabel,
    })
  }

  const adj = (tone: KpiTone): string => (tone === 'critical' ? 'muy bajo' : 'bajo el objetivo')
  add('oee', toneHigherBetter(kpis.oee, KPI_CUTOFFS.oee.warnBelow, KPI_CUTOFFS.oee.critBelow), 'OEE', fmtFracPct(kpis.oee),
    `OEE en ${fmtFracPct(kpis.oee)}, ${adj(toneHigherBetter(kpis.oee, KPI_CUTOFFS.oee.warnBelow, KPI_CUTOFFS.oee.critBelow))}.`)
  add('availability', toneHigherBetter(kpis.availability, KPI_CUTOFFS.availability.warnBelow, KPI_CUTOFFS.availability.critBelow), 'Disponibilidad', fmtFracPct(kpis.availability),
    `Disponibilidad en ${fmtFracPct(kpis.availability)}: la máquina estuvo detenida más de lo esperado.`)
  add('performance', toneHigherBetter(kpis.performance, KPI_CUTOFFS.performance.warnBelow, KPI_CUTOFFS.performance.critBelow), 'Rendimiento', fmtFracPct(kpis.performance),
    `Rendimiento en ${fmtFracPct(kpis.performance)}: se produjo por debajo del ritmo objetivo.`)
  add('quality', toneHigherBetter(kpis.quality, KPI_CUTOFFS.quality.warnBelow, KPI_CUTOFFS.quality.critBelow), 'Calidad', fmtFracPct(kpis.quality),
    `Calidad en ${fmtFracPct(kpis.quality)}: hubo rechazo (P0) por encima del umbral.`)
  add('mttr', toneLowerBetter(kpis.mttrMin, KPI_CUTOFFS.mttrMin.warnAbove, KPI_CUTOFFS.mttrMin.critAbove), 'MTTR', fmtMin(kpis.mttrMin),
    `MTTR en ${fmtMin(kpis.mttrMin)}: las reparaciones están tardando; revisar repuestos/método.`)
  add('mtbf', toneHigherBetter(kpis.mtbfHours, KPI_CUTOFFS.mtbfHours.warnBelow, KPI_CUTOFFS.mtbfHours.critBelow), 'MTBF', fmtHours(kpis.mtbfHours),
    `MTBF en ${fmtHours(kpis.mtbfHours)}: las fallas se repiten muy seguido; candidato a preventivo/RCM.`)

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

/**
 * Formatea los avisos como un mensaje proactivo (markdown) para que ARIA lo diga al
 * abrir el chat. Limita a los 4 más severos para que el saludo (y la voz) sea breve.
 * Devuelve null si no hay avisos.
 */
export function formatKpiAlertsMessage(alerts: AriaAlert[]): string | null {
  if (alerts.length === 0) return null
  const { plantLabel, shiftLabel } = alerts[0]!
  const top = alerts.slice(0, 4)
  const lines = top.map((a) => `- ${a.message}`)
  const more = alerts.length > top.length ? `\n…y ${alerts.length - top.length} más.` : ''
  return [
    `⚠️ **Atención — KPIs del último turno fuera de objetivo**`,
    `${plantLabel} · ${shiftLabel}`,
    lines.join('\n') + more,
    `Lo ves en detalle en *Análisis de Turno*.`,
  ].join('\n')
}

// ── Carga de datos (mismo patrón que la tool shift.kpis) ────────────────
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function todayKey(): string {
  return toDateKey(new Date())
}
function daysAgo(n: number): string {
  return toDateKey(new Date(Date.now() - n * 86_400_000))
}
function plantLabelFor(plantSlug: PlantSlug): string {
  return plantSlug === 'yal' ? 'Planta Yal' : 'Planta Principal (Chonchi)'
}

/**
 * Avisos del último turno con actividad de una planta. Estrategia idéntica a
 * `shift.kpis`: ventana reciente (operación viva) → si no, ventana amplia para el
 * último turno disponible (histórico). Devuelve [] si no hay datos o todo está OK.
 */
export async function getKpiTurnoAlerts(plantSlug: PlantSlug = 'chonchi'): Promise<AriaAlert[]> {
  let summaries: GraderDailySummary[] = await listDailySummariesByRange(daysAgo(8), todayKey()).catch(() => [])
  let kpis = await getLatestTurnoKPIs(plantSlug, summaries)
  if (!kpis) {
    summaries = await listDailySummariesByRange(daysAgo(210), todayKey()).catch(() => [])
    kpis = await getLatestTurnoKPIs(plantSlug, summaries, true)
  }
  if (!kpis) return []
  return kpiTurnoAlerts(kpis, plantSlug, plantLabelFor(plantSlug))
}
