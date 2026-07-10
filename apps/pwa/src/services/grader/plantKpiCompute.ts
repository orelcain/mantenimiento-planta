/**
 * plantKpiCompute — cálculo PURO de KPIs de planta (OEE / disponibilidad /
 * rendimiento / calidad / MTTR / MTBF) a partir de turnos Shoplogix + Grader.
 *
 * Fuente ÚNICA de las fórmulas: lo usan tanto el hook React `usePlantKPIs`
 * (board "Indicadores de Rendimiento") como el servicio no-React `turnoKpis`
 * que alimenta a ARIA. Así el chatbot reporta EXACTAMENTE los mismos números
 * que muestra la app (regla del CLAUDE.md: un concepto se calcula igual en todos lados).
 *
 * OEE = Disponibilidad × Rendimiento × Calidad  (estándar ISO 22400 / World-Class OEE)
 *   A = uptime / (uptime + downtime + setup)   ← EXCLUYE colación/break (no es pérdida)
 *   P = ciclos reales / esperados SOLO en los buckets donde produjo (velocidad real)
 *   Q = 1 − P0% (solo si hay Grader data)
 * A y P se calculan con `availabilityISO`/`performanceISO`. NO se usa `shiftRuntime`
 * ni `overallRatio` del normalizer: aquéllos metían la colación en A y el tiempo
 * de paro en P (doble conteo con A). Ver project_oee_doble_conteo_shoplogix.
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

type Breakdown = UpstreamMachineShift['shiftRuntimeBreakdown']
type Interval = UpstreamMachineShift['intervals'][number]

/**
 * DISPONIBILIDAD estándar (A) — convención ISO 22400 / World-Class OEE.
 *   A = uptime / (uptime + downtime + setup)
 * El denominador es el "tiempo que la máquina DEBÍA estar produciendo". EXCLUYE
 * la colación/break y el planned downtime: la colación es tiempo planificado de
 * no-producción, no una pérdida de disponibilidad (decisión Orel 2026-07-09).
 *
 * ANTES usábamos `m.shiftRuntime` (normalizer.js), que SÍ mete la colación en el
 * denominador (uptime/(uptime+break+downtime+setup)) → subestimaba A. Ver
 * memoria project_oee_doble_conteo_shoplogix.
 */
export function availabilityISO(bd: Pick<Breakdown, 'uptimeSec' | 'downtimeSec' | 'setupSec'>): number {
  const runTimeBase = bd.uptimeSec + bd.downtimeSec + bd.setupSec
  return runTimeBase > 0 ? bd.uptimeSec / runTimeBase : 0
}

/**
 * RENDIMIENTO estándar (P) — velocidad REAL cuando la máquina produce.
 *   P = ciclos reales / ciclos esperados SOLO en los buckets donde hubo producción
 * NO sobre todo el turno. El tiempo parado ya lo castiga la Disponibilidad;
 * incluirlo también en P sería DOBLE CONTEO — que es justo el error del
 * `overallRatio` (= totalCycles/expected de TODOS los buckets) que usábamos
 * antes, y la razón por la que el "OEE" de Shoplogix es en realidad A×P sin Q.
 * Ver memoria project_oee_doble_conteo_shoplogix (verificado con datos crudos).
 */
export function performanceISO(intervals: Pick<Interval, 'cycles' | 'expectedCycles'>[]): number {
  let cyc = 0, exp = 0
  for (const iv of intervals) {
    if ((iv.cycles || 0) > 0) { cyc += iv.cycles || 0; exp += iv.expectedCycles || 0 }
  }
  return exp > 0 ? Math.min(1, cyc / exp) : 0
}

/**
 * TARGET NOMINAL (pz/min) — velocidad de referencia configurada en Shoplogix.
 * Se toma el MÁXIMO de `expectedCycles` entre los buckets, no el primero: los
 * buckets de arranque/cierre de turno son PARCIALES (la máquina entra a mitad
 * del bucket de 5 min) y Shoplogix escala `expectedCycles` a ese tiempo parcial.
 * El bucket completo es el techo natural → el máximo es el target real.
 *
 * Observado 2026-07-09 (yal, Turno 3): 1er bucket con expected>0 valía 37.95
 * ciclos en vez de 80 → el board mostraba 7.6 pz/min en vez de 16.0.
 */
export function targetCpmFromIntervals(intervals: Pick<Interval, 'expectedCycles'>[]): number | null {
  let maxExpected = 0
  for (const iv of intervals) {
    if ((iv.expectedCycles || 0) > maxExpected) maxExpected = iv.expectedCycles
  }
  return maxExpected > 0 ? maxExpected / 5 : null
}

export function computeMachineKPI(m: UpstreamMachineShift): MachineKPI {
  const uptimeSec = m.shiftRuntimeBreakdown.uptimeSec
  // Averías MACRO (sin micro ni paros operacionales) para MTTR/MTBF profesional.
  const { macroSec, macroCount, microSec, microCount } = computeMaintenanceTotals(m.states)
  return {
    machineid: m.machineid,
    machineName: m.machineName,
    availability: availabilityISO(m.shiftRuntimeBreakdown),
    performance: performanceISO(m.intervals),
    mttrMin: macroCount > 0 ? macroSec / macroCount / 60 : 0,
    mtbfHours: macroCount > 0 ? uptimeSec / macroCount / 3600 : uptimeSec / 3600,
    failureCount: macroCount,
    microCount,
    microMin: microSec / 60,
    shoplogixTargetCpm: targetCpmFromIntervals(m.intervals),
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
    // A/P ISO agregados: sumar segundos y ciclos de TODAS las instancias del
    // turno (no promediar ratios) → disponibilidad y rendimiento ponderados reales.
    const aggBreakdown = ms.reduce(
      (acc, m) => ({
        uptimeSec:   acc.uptimeSec   + m.shiftRuntimeBreakdown.uptimeSec,
        downtimeSec: acc.downtimeSec + m.shiftRuntimeBreakdown.downtimeSec,
        setupSec:    acc.setupSec    + m.shiftRuntimeBreakdown.setupSec,
      }),
      { uptimeSec: 0, downtimeSec: 0, setupSec: 0 },
    )
    machineKPIs.push({
      machineid: ms[0]!.machineid,
      machineName: ms[0]!.machineName,
      availability: availabilityISO(aggBreakdown),
      performance: performanceISO(ms.flatMap(m => m.intervals)),
      mttrMin: macroCount > 0 ? macroSec / macroCount / 60 : 0,
      mtbfHours: macroCount > 0 ? totalUptimeSec / macroCount / 3600 : totalUptimeSec / 3600,
      failureCount: macroCount,
      microCount,
      microMin: microSec / 60,
      shoplogixTargetCpm: targetCpmFromIntervals(ms.flatMap(m => m.intervals)),
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
