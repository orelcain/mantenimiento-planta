/**
 * plantKpiCompute — cálculo PURO de KPIs de planta (OEE / disponibilidad /
 * rendimiento / calidad / MTTR / MTBF) a partir de turnos Shoplogix + Grader.
 *
 * Fuente ÚNICA de las fórmulas: lo usan tanto el hook React `usePlantKPIs`
 * (board "Indicadores de Rendimiento") como el servicio no-React `turnoKpis`
 * que alimenta a ARIA. Así el chatbot reporta EXACTAMENTE los mismos números
 * que muestra la app (regla del CLAUDE.md: un concepto se calcula igual en todos lados).
 *
 * OEE = Disponibilidad × Rendimiento × Calidad
 *   A = shiftRuntime promedio de las Baaders
 *   P = overallRatio promedio (cap 1.0)
 *   Q = 1 − P0% (solo si hay Grader data)
 *
 * MTTR/MTBF de confiabilidad: SOLO sobre averías MACRO (paros relevantes),
 * excluyendo micro-detenciones (<5min). Fuente macro/micro:
 * `shoplogixMaintenance.computeMaintenanceTotals`.
 *   MTTR = Σ durationSec macro / n_macro   (min)
 *   MTBF = uptimeSec total / n_macro        (horas)
 */
import { computeMaintenanceTotals } from './shoplogixMaintenance'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import type { GraderDailySummary } from './types'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface MachineKPI {
  machineid: string
  machineName: string
  availability: number
  performance: number
  /** MTTR de averías MACRO (excluye micro-detenciones), en minutos. */
  mttrMin: number
  mtbfHours: number
  /** N° de averías macro (paros relevantes ≥5min, sin micro ni paros operacionales). */
  failureCount: number
  /** N° de micro-detenciones (<5min) — se reportan aparte, no inflan el MTTR. */
  microCount: number
  /** Tiempo total en micro-detenciones, en minutos. */
  microMin: number
  shoplogixTargetCpm: number | null
  /** Total de ciclos de la máquina en el período. */
  totalCycles: number
}

export interface PlantKPIs {
  dateKey: string
  shiftId: string
  /** Etiqueta legible del período: "lun 29 abr", "22–28 abr", "Abril 2026" */
  periodLabel: string
  /** Turnos agregados en este período */
  shiftsCount: number
  /** null = sin datos Shoplogix (solo Grader) */
  availability: number | null
  /** null = sin datos Shoplogix (solo Grader) */
  performance: number | null
  quality: number | null
  oee: number | null
  mttrMin: number
  mtbfHours: number
  failureCount: number
  /** N° de micro-detenciones (<5min) agregadas del período. */
  microCount: number
  /** Tiempo total en micro-detenciones del período, en minutos. */
  microMin: number
  machines: MachineKPI[]
  /** true cuando solo hay calidad Grader, sin datos Shoplogix */
  graderOnly?: boolean
}

// ── Cálculo ─────────────────────────────────────────────────────────────────────

export function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

export function computeMachineKPI(m: UpstreamMachineShift): MachineKPI {
  const uptimeSec = m.shiftRuntimeBreakdown.uptimeSec
  // Averías MACRO (sin micro ni paros operacionales) para MTTR/MTBF profesional.
  const { macroSec, macroCount, microSec, microCount } = computeMaintenanceTotals(m.states)
  const firstInterval = m.intervals.find((iv) => iv.expectedCycles > 0)
  return {
    machineid: m.machineid,
    machineName: m.machineName,
    availability: m.shiftRuntime,
    performance: Math.min(1, m.overallRatio),
    mttrMin: macroCount > 0 ? macroSec / macroCount / 60 : 0,
    mtbfHours: macroCount > 0 ? uptimeSec / macroCount / 3600 : uptimeSec / 3600,
    failureCount: macroCount,
    microCount,
    microMin: microSec / 60,
    shoplogixTargetCpm: firstInterval ? firstInterval.expectedCycles / 5 : null,
    totalCycles: m.totalCycles ?? 0,
  }
}

// Mapeo Shoplogix → Grader por solapamiento horario (obs. 2026-07):
//   chonchi: "Turno 2" 09:00-17:15 = día · "Turno 1" 21:30-05:45 y
//            "Turno 1 Lunes" madrugada = noche
//   yal:     "Turno 3" 00:00-06:55 = noche · "Turno 2" tarde = día
// Los turnos nocturnos pueden estar guardados en Grader bajo el día ANTERIOR
// (cruzan medianoche). Nombres NO listados pasan tal cual (fallback identidad).
const SLX_TO_GRADER: Record<string, string> = {
  'Turno 1': 'Turno noche',
  'Turno 1 Lunes': 'Turno noche',
  'Turno 2': 'Turno día',
  'Turno 3': 'Turno noche',
  'Turno noche': 'Turno noche',
  'Turno día': 'Turno día',
}

function prevDay(dk: string): string {
  const d = new Date(`${dk}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function findGraderSummary(
  s: { dateKey: string; shiftId: string },
  graderSummaries: GraderDailySummary[],
): GraderDailySummary | undefined {
  const graderShiftId = SLX_TO_GRADER[s.shiftId] ?? s.shiftId
  return graderSummaries.find(g => g.dateKey === s.dateKey && g.shiftId === graderShiftId)
    ?? (graderShiftId === 'Turno noche'
      ? graderSummaries.find(g => g.dateKey === prevDay(s.dateKey) && g.shiftId === 'Turno noche')
      : undefined)
}

/** Agrega un array de {dateKey, shiftId, machines} en un PlantKPIs único. */
export function aggregateShifts(
  shifts: { dateKey: string; shiftId: string; machines: UpstreamMachineShift[] }[],
  periodLabel: string,
  graderSummaries: GraderDailySummary[],
): PlantKPIs | null {
  if (shifts.length === 0) return null

  // Agrupar instancias de cada máquina a lo largo de los turnos
  const byMachine = new Map<string, { machine: UpstreamMachineShift; dateKey: string; shiftId: string }[]>()
  for (const s of shifts) {
    for (const m of s.machines) {
      const list = byMachine.get(m.machineName) ?? []
      list.push({ machine: m, dateKey: s.dateKey, shiftId: s.shiftId })
      byMachine.set(m.machineName, list)
    }
  }

  const machineKPIs: MachineKPI[] = []
  for (const [, entries] of byMachine) {
    const ms = entries.map(e => e.machine)
    const { macroSec, macroCount, microSec, microCount } = computeMaintenanceTotals(ms.flatMap(m => m.states))
    const totalUptimeSec = ms.reduce((a, m) => a + m.shiftRuntimeBreakdown.uptimeSec, 0)
    const firstInterval = ms[0]?.intervals.find(iv => iv.expectedCycles > 0)
    machineKPIs.push({
      machineid: ms[0]!.machineid,
      machineName: ms[0]!.machineName,
      availability: avg(ms.map(m => m.shiftRuntime)),
      performance: Math.min(1, avg(ms.map(m => m.overallRatio))),
      mttrMin: macroCount > 0 ? macroSec / macroCount / 60 : 0,
      mtbfHours: macroCount > 0 ? totalUptimeSec / macroCount / 3600 : totalUptimeSec / 3600,
      failureCount: macroCount,
      microCount,
      microMin: microSec / 60,
      shoplogixTargetCpm: firstInterval ? firstInterval.expectedCycles / 5 : null,
      totalCycles: ms.reduce((a, m) => a + (m.totalCycles ?? 0), 0),
    })
  }

  const availability = avg(machineKPIs.map(m => m.availability))
  const performance = avg(machineKPIs.map(m => m.performance))

  // Calidad: promedio de (1 − P0%) de los turnos con Grader data
  const qualityValues = shifts
    .map(s => findGraderSummary(s, graderSummaries))
    .filter((g): g is GraderDailySummary => g !== undefined && typeof g.pointZeroPct === 'number')
    .map(g => Math.max(0, Math.min(1, 1 - g.pointZeroPct / 100)))
  const quality = qualityValues.length > 0 ? avg(qualityValues) : null
  const oee = quality !== null ? availability * performance * quality : null

  const first = shifts[0]!
  return {
    dateKey: first.dateKey,
    shiftId: first.shiftId,
    periodLabel,
    shiftsCount: shifts.length,
    availability,
    performance,
    quality,
    oee,
    mttrMin: avg(machineKPIs.map(m => m.mttrMin)),
    mtbfHours: avg(machineKPIs.map(m => m.mtbfHours)),
    failureCount: machineKPIs.reduce((a, m) => a + m.failureCount, 0),
    microCount: machineKPIs.reduce((a, m) => a + m.microCount, 0),
    microMin: machineKPIs.reduce((a, m) => a + m.microMin, 0),
    machines: machineKPIs,
  }
}
