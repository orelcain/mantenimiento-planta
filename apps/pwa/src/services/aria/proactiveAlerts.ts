/**
 * proactiveAlerts — ARIA detecta SOLA condiciones que ameritan acción de Mantención
 * y genera "avisos" que se muestran en la tarjeta del dashboard ("ARIA te avisa") y
 * en un saludo proactivo del chat.
 *
 * Disparadores (v2):
 *   - KPI de turno fuera de umbral (OEE/disp/rend/cal/MTTR/MTBF) — mismos cortes que el board.
 *   - Preventiva vencida (proximaEjecucion pasada, tarea activa).
 *   - Equipo en condición crítica (CTD / NFPA 70B condición 3 = acción requerida).
 *   - Incidencia crítica/alta abierta hace demasiado tiempo.
 *
 * Sirve a la meta del proyecto: cada aviso ata un dato a una acción de Mantención.
 */
import { listDailySummariesByRange } from '@/services/grader/graderDailySummary.service'
import type { GraderDailySummary } from '@/services/grader/types'
import { getLatestTurnoKPIs } from '@/services/grader/turnoKpis'
import type { PlantKPIs } from '@/services/grader/plantKpiCompute'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import { getPreventiveTasks } from '@/services/preventive'
import type { PreventiveTask, Equipment, Incident } from '@/types'
import { KPI_CUTOFFS, toneHigherBetter, toneLowerBetter, type KpiTone } from '@/services/grader/kpiThresholds'

export type AlertSeverity = 'warn' | 'critical'
export type AlertKind = 'kpi' | 'preventiva' | 'equipo' | 'incidencia'

export interface AriaAlert {
  /** Clave estable (dedup): <kind>:<entidad>. */
  id: string
  kind: AlertKind
  severity: AlertSeverity
  /** Lead corto para la UI: "OEE", "Preventiva vencida", "Equipo en condición 3". */
  title: string
  /** Frase completa y autosuficiente (se muestra en la tarjeta y se dice por voz). */
  message: string
  /** Ruta a la que navegar al hacer click (opcional). */
  link?: string
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warn: 1 }
function bySeverity(a: AriaAlert, b: AriaAlert): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
}

// ── Formato ─────────────────────────────────────────────────────────
function fmtFracPct(frac: number | null | undefined): string {
  if (frac === null || frac === undefined || !isFinite(frac)) return '—'
  return `${Math.round(frac * 100)}%`
}
function fmtMin(min: number): string { return `${min.toFixed(1)} min` }
function fmtHours(h: number): string { return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h` }
function daysBetween(a: Date, b: Date): number { return Math.floor((a.getTime() - b.getTime()) / 86_400_000) }
function hoursBetween(a: Date, b: Date): number { return (a.getTime() - b.getTime()) / 3_600_000 }
function plural(n: number, sing: string, plu: string): string { return `${n} ${n === 1 ? sing : plu}` }

// ── 1) KPI de turno fuera de umbral ─────────────────────────────────
export function kpiTurnoAlerts(kpis: PlantKPIs, plantSlug: PlantSlug, plantLabel: string): AriaAlert[] {
  const ctx = `${plantLabel} · turno ${kpis.shiftId} (${kpis.dateKey})`
  const alerts: AriaAlert[] = []
  const add = (metric: string, tone: KpiTone, label: string, message: string): void => {
    if (tone === 'good') return
    alerts.push({
      id: `kpi:${metric}:${plantSlug}:${kpis.dateKey}:${kpis.shiftId}`,
      kind: 'kpi', severity: tone, title: label, message, link: '/analisis-grader',
    })
  }
  const oeeTone = toneHigherBetter(kpis.oee, KPI_CUTOFFS.oee.warnBelow, KPI_CUTOFFS.oee.critBelow)
  add('oee', oeeTone, 'OEE', `OEE en ${fmtFracPct(kpis.oee)} ${oeeTone === 'critical' ? '(muy bajo)' : '(bajo el objetivo)'} — ${ctx}.`)
  add('availability', toneHigherBetter(kpis.availability, KPI_CUTOFFS.availability.warnBelow, KPI_CUTOFFS.availability.critBelow),
    'Disponibilidad', `Disponibilidad en ${fmtFracPct(kpis.availability)}: la máquina estuvo detenida más de lo esperado — ${ctx}.`)
  add('performance', toneHigherBetter(kpis.performance, KPI_CUTOFFS.performance.warnBelow, KPI_CUTOFFS.performance.critBelow),
    'Rendimiento', `Rendimiento en ${fmtFracPct(kpis.performance)}: se produjo bajo el ritmo objetivo — ${ctx}.`)
  add('quality', toneHigherBetter(kpis.quality, KPI_CUTOFFS.quality.warnBelow, KPI_CUTOFFS.quality.critBelow),
    'Calidad', `Calidad en ${fmtFracPct(kpis.quality)}: rechazo (P0) sobre el umbral — ${ctx}.`)
  add('mttr', toneLowerBetter(kpis.mttrMin, KPI_CUTOFFS.mttrMin.warnAbove, KPI_CUTOFFS.mttrMin.critAbove),
    'MTTR', `MTTR en ${fmtMin(kpis.mttrMin)}: las reparaciones están tardando — ${ctx}.`)
  add('mtbf', toneHigherBetter(kpis.mtbfHours, KPI_CUTOFFS.mtbfHours.warnBelow, KPI_CUTOFFS.mtbfHours.critBelow),
    'MTBF', `MTBF en ${fmtHours(kpis.mtbfHours)}: las fallas se repiten muy seguido — ${ctx}.`)
  return alerts.sort(bySeverity)
}

// ── 2) Preventiva vencida ───────────────────────────────────────────
export function preventivaVencidaAlerts(
  tasks: PreventiveTask[],
  equipoNombre: (id: string) => string,
  now: Date = new Date(),
): AriaAlert[] {
  const out: AriaAlert[] = []
  for (const t of tasks) {
    if (!t.activo || !t.proximaEjecucion) continue
    const due = t.proximaEjecucion instanceof Date ? t.proximaEjecucion : new Date(t.proximaEjecucion)
    if (isNaN(due.getTime()) || due >= now) continue
    const dias = daysBetween(now, due)
    out.push({
      id: `prev:${t.id}`,
      kind: 'preventiva',
      severity: dias > 30 ? 'critical' : 'warn',
      title: 'Preventiva vencida',
      message: `Preventiva "${t.nombre}" de ${equipoNombre(t.equipmentId)} vencida hace ${dias <= 0 ? 'menos de un día' : plural(dias, 'día', 'días')}.`,
      link: '/calendario-mantencion',
    })
  }
  return out.sort(bySeverity)
}

// ── 3) Equipo en condición crítica (CTD / NFPA 70B condición 3) ─────
export function equipoCondicionAlerts(equipment: Equipment[]): AriaAlert[] {
  const out: AriaAlert[] = []
  for (const e of equipment) {
    if (e.deleted) continue
    if (e.fichaTecnica?.condicion !== 3) continue
    const critTxt = e.criticidad === 'alta' ? ' (criticidad alta)' : ''
    out.push({
      id: `equipo:${e.id}`,
      kind: 'equipo',
      severity: 'critical',
      title: 'Equipo en condición 3',
      message: `${e.nombre} (${e.codigo}) en condición 3: acción requerida según NFPA 70B${critTxt}.`,
      link: '/equipment',
    })
  }
  return out
}

// ── 4) Incidencia crítica/alta abierta hace mucho ───────────────────
const OPEN_STATUS = new Set<Incident['status']>(['pendiente', 'confirmada', 'en_proceso'])
export function incidenciaCriticaAlerts(incidents: Incident[], now: Date = new Date()): AriaAlert[] {
  const out: AriaAlert[] = []
  for (const i of incidents) {
    if (!OPEN_STATUS.has(i.status)) continue
    if (i.prioridad !== 'critica' && i.prioridad !== 'alta') continue
    const created = i.createdAt instanceof Date ? i.createdAt : new Date(i.createdAt)
    if (isNaN(created.getTime())) continue
    const hrs = hoursBetween(now, created)
    const limit = i.prioridad === 'critica' ? 24 : 72 // horas antes de avisar
    if (hrs < limit) continue
    const ageTxt = hrs >= 48 ? plural(Math.floor(hrs / 24), 'día', 'días') : plural(Math.floor(hrs), 'hora', 'horas')
    out.push({
      id: `inc:${i.id}`,
      kind: 'incidencia',
      severity: i.prioridad === 'critica' ? 'critical' : 'warn',
      title: `Incidencia ${i.prioridad}`,
      message: `Incidencia ${i.prioridad} "${i.titulo}" lleva ${ageTxt} abierta sin resolver.`,
      link: '/incidents',
    })
  }
  return out.sort(bySeverity)
}

/**
 * Formatea los avisos como mensaje proactivo (markdown) para que ARIA lo diga al
 * abrir el chat. Limita a los 5 más severos para que el saludo (y la voz) sea breve.
 */
export function formatAlertsMessage(alerts: AriaAlert[]): string | null {
  if (alerts.length === 0) return null
  const top = alerts.slice(0, 5)
  const lines = top.map((a) => `- ${a.message}`)
  const more = alerts.length > top.length ? `\n…y ${alerts.length - top.length} aviso(s) más.` : ''
  return [
    `⚠️ **Atención — ${plural(alerts.length, 'aviso', 'avisos')} de Mantención**`,
    lines.join('\n') + more,
    `Pregúntame por cualquiera si quieres el detalle.`,
  ].join('\n')
}

// ── Carga de datos + agregación ─────────────────────────────────────
function toDateKey(d: Date): string { return d.toISOString().slice(0, 10) }
function todayKey(): string { return toDateKey(new Date()) }
function daysAgo(n: number): string { return toDateKey(new Date(Date.now() - n * 86_400_000)) }

/** Solo los avisos de KPI de turno del último turno con actividad. */
export async function getKpiTurnoAlerts(plantSlug: PlantSlug = 'chonchi'): Promise<AriaAlert[]> {
  let summaries: GraderDailySummary[] = await listDailySummariesByRange(daysAgo(8), todayKey()).catch(() => [])
  let kpis = await getLatestTurnoKPIs(plantSlug, summaries)
  if (!kpis) {
    summaries = await listDailySummariesByRange(daysAgo(210), todayKey()).catch(() => [])
    kpis = await getLatestTurnoKPIs(plantSlug, summaries, true)
  }
  if (!kpis) return []
  return kpiTurnoAlerts(kpis, plantSlug, plantSlug === 'yal' ? 'Planta Yal' : 'Planta Principal')
}

/**
 * TODOS los avisos proactivos: KPI de turno + preventivas vencidas + equipos en
 * condición crítica + incidencias críticas viejas. Recibe incidencias y equipos ya
 * cargados (del store, sin re-leer Firestore) y carga aparte preventivas + KPI.
 * Ordena críticos primero.
 */
export async function getAllProactiveAlerts(
  ctx: { incidents: Incident[]; equipment: Equipment[] },
): Promise<AriaAlert[]> {
  const now = new Date()
  const [kpi, tasks] = await Promise.all([
    getKpiTurnoAlerts('chonchi').catch(() => [] as AriaAlert[]),
    getPreventiveTasks().catch(() => [] as PreventiveTask[]),
  ])
  const nombreById = new Map(ctx.equipment.map((e) => [e.id, e.nombre]))
  const eqNombre = (id: string): string => nombreById.get(id) || 'un equipo'
  return [
    ...kpi,
    ...preventivaVencidaAlerts(tasks, eqNombre, now),
    ...equipoCondicionAlerts(ctx.equipment),
    ...incidenciaCriticaAlerts(ctx.incidents, now),
  ].sort(bySeverity)
}
