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
  /** Modelo de la máquina — para que la UI la nombre sin hardcodear "Baader". */
  machineType?: UpstreamMachineShift['machineType']
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
  /** Piezas dejadas de producir por velocidad baja (buckets productivos). */
  lostBySpeed: number
  /** Piezas dejadas de producir por tiempo detenido (downtime × target). */
  lostByStops: number
  /**
   * Minutos del breakdown del turno. Se exponen para no tener que DERIVAR la
   * base de tiempo desde `downtime/(1−A)`: esa derivación fallaba justo cuando
   * hacía falta (sin averías macro no había base) y no cuadraba con el downtime
   * real cuando MTTR×N° ≠ downtime medido.
   */
  uptimeMin: number
  downtimeMin: number
  setupMin: number
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

/** Cadencia real EN MARCHA de una máquina (pz/min): ciclos / tiempo activo. */
export function cadenceCpm(totalCycles: number, uptimeSec: number): number {
  return uptimeSec > 0 ? totalCycles / (uptimeSec / 60) : 0
}

/**
 * CADENCIA DE LA LÍNEA (pz/min) — mediana de las cadencias de las máquinas que
 * produjeron. Es la referencia COMÚN contra la que se miden las piezas perdidas.
 */
export function lineCadenceCpm(cadences: number[]): number | null {
  const activas = cadences.filter(c => c > 0).sort((a, b) => a - b)
  if (activas.length === 0) return null
  const mid = Math.floor(activas.length / 2)
  return activas.length % 2 === 0 ? (activas[mid - 1]! + activas[mid]!) / 2 : activas[mid]!
}

/**
 * PIEZAS PERDIDAS — cuánto le costó a la LÍNEA cada máquina.
 *
 * Se mide contra la cadencia de la línea, NO contra el target propio de cada
 * máquina. Motivo: las 3 Baader 142 de yal no son iguales — la Evisceradora 3
 * es el modelo antiguo (19 pz/min) y las 1 y 2 el nuevo (16 pz/min). Medir
 * contra el target propio castiga a la de mayor capacidad: la Ev3 corre MÁS
 * rápido que sus pares (16.2 vs 15.4 pz/min) y entrega más piezas, pero contra
 * su target de 19 "pierde" el doble que las otras. Eso hacía que el board
 * señalara como culpable justo a la mejor máquina.
 *
 * Con la línea como referencia:
 *   - por velocidad: solo pierde la que corre MÁS LENTO que sus pares
 *   - por paros:     el tiempo detenido, valorado a la cadencia de la línea
 *
 * Nota: esto mide "quién arrastra la línea", no capacidad ociosa. Que la Ev3
 * pueda dar 19 y dé 16 es una pérdida real de la planta, pero su causa es el
 * balance de alimentación, no la máquina.
 */
export function computeLostPieces(
  totalCycles: number,
  uptimeSec: number,
  downtimeSec: number,
  lineCpm: number | null,
): { lostBySpeed: number; lostByStops: number } {
  // Sin línea de referencia (una sola máquina) usamos su propia cadencia: no hay
  // con quién compararla, así que no pierde nada por velocidad.
  const ref = lineCpm ?? cadenceCpm(totalCycles, uptimeSec)
  const uptimeMin = uptimeSec / 60
  return {
    lostBySpeed: Math.max(0, ref * uptimeMin - totalCycles),
    lostByStops: (downtimeSec / 60) * ref,
  }
}

export interface OfficialCompliance {
  /** Suma de piezas producidas (todas las máquinas con target oficial). */
  totalCycles: number
  /** Suma de `officialTargetsByMachineId` — piezas esperadas del turno. */
  targetTotal: number
  /** `totalCycles / targetTotal`, 0..1+ (sin techo — un turno puede superar el target). */
  pct: number
  /** Mismos umbrales que `componerBriefFinTurno` (functions/shoplogix/turnoBrief.js):
   *  ≥95% ok · ≥75% warn · resto critical. Mantener alineados — es el mismo
   *  número que ve el operador en el brief de Telegram del mismo turno. */
  level: 'ok' | 'warn' | 'critical'
}

/**
 * Cumplimiento vs TARGET OFICIAL del turno (rollup de Shoplogix), no contra
 * el target nominal/nameplate. Solo tiene sentido para el turno VIGENTE — el
 * rollup nunca se captura en backfill (ver `fetchOfficialRollup` en
 * `functions/shoplogix/sync.js`), así que para turnos históricos
 * `officialTargetsByMachineId` es `null` y esta función devuelve `null`
 * (degrada limpio: no inventar un target donde no lo hay).
 */
export function computeOfficialCompliance(
  machines: Pick<MachineKPI, 'machineid' | 'totalCycles'>[],
  officialTargetsByMachineId: Record<string, number> | null | undefined,
): OfficialCompliance | null {
  if (!officialTargetsByMachineId) return null
  const targetTotal = Object.values(officialTargetsByMachineId).reduce((a, b) => a + (b || 0), 0)
  if (targetTotal <= 0) return null
  const totalCycles = machines.reduce((a, m) => a + (m.totalCycles || 0), 0)
  const pct = totalCycles / targetTotal
  const level: OfficialCompliance['level'] = pct >= 0.95 ? 'ok' : pct >= 0.75 ? 'warn' : 'critical'
  return { totalCycles, targetTotal, pct, level }
}

export function computeMachineKPI(m: UpstreamMachineShift, lineCpm: number | null = null): MachineKPI {
  const uptimeSec = m.shiftRuntimeBreakdown.uptimeSec
  // Averías MACRO (sin micro ni paros operacionales) para MTTR/MTBF profesional.
  const { macroSec, macroCount, microSec, microCount } = computeMaintenanceTotals(m.states)
  const targetCpm = targetCpmFromIntervals(m.intervals)
  const lost = computeLostPieces(m.totalCycles ?? 0, uptimeSec, m.shiftRuntimeBreakdown.downtimeSec, lineCpm)
  return {
    machineid: m.machineid,
    machineName: m.machineName,
    machineType: m.machineType,
    availability: availabilityISO(m.shiftRuntimeBreakdown),
    performance: performanceISO(m.intervals),
    mttrMin: macroCount > 0 ? macroSec / macroCount / 60 : 0,
    mtbfHours: macroCount > 0 ? uptimeSec / macroCount / 3600 : uptimeSec / 3600,
    failureCount: macroCount,
    microCount,
    microMin: microSec / 60,
    shoplogixTargetCpm: targetCpm,
    totalCycles: m.totalCycles ?? 0,
    uptimeMin:   uptimeSec / 60,
    downtimeMin: m.shiftRuntimeBreakdown.downtimeSec / 60,
    setupMin:    m.shiftRuntimeBreakdown.setupSec / 60,
    ...lost,
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

  // Paso 1: acumular por máquina. Las piezas perdidas necesitan la cadencia de
  // la LÍNEA, que solo se conoce una vez agregadas todas → segunda pasada.
  const acc = [...byMachine.values()].map((entries) => {
    const ms = entries.map(e => e.machine)
    const breakdown = ms.reduce(
      (a, m) => ({
        uptimeSec:   a.uptimeSec   + m.shiftRuntimeBreakdown.uptimeSec,
        downtimeSec: a.downtimeSec + m.shiftRuntimeBreakdown.downtimeSec,
        setupSec:    a.setupSec    + m.shiftRuntimeBreakdown.setupSec,
      }),
      { uptimeSec: 0, downtimeSec: 0, setupSec: 0 },
    )
    const totalCycles = ms.reduce((a, m) => a + (m.totalCycles ?? 0), 0)
    return {
      ms,
      breakdown,
      totalCycles,
      intervals: ms.flatMap(m => m.intervals),
      maintenance: computeMaintenanceTotals(ms.flatMap(m => m.states)),
      cadence: cadenceCpm(totalCycles, breakdown.uptimeSec),
    }
  })

  const lineCpm = lineCadenceCpm(acc.map(a => a.cadence))

  // Paso 2: A/P ISO agregados — sumar segundos y ciclos de TODAS las instancias
  // del turno (no promediar ratios) → disponibilidad y rendimiento ponderados.
  const machineKPIs: MachineKPI[] = acc.map((a) => {
    const { macroSec, macroCount, microSec, microCount } = a.maintenance
    const lost = computeLostPieces(a.totalCycles, a.breakdown.uptimeSec, a.breakdown.downtimeSec, lineCpm)
    return {
      machineid: a.ms[0]!.machineid,
      machineName: a.ms[0]!.machineName,
      // Primer tipo CONOCIDO entre las instancias del período, no el del primer
      // doc: los turnos sin producción quedan congelados con el schema viejo
      // ('other'), y si justo son los primeros del mes la máquina perdía su
      // modelo en toda la vista.
      machineType: a.ms.find((m) => m.machineType && m.machineType !== 'other')?.machineType
        ?? a.ms[0]!.machineType,
      availability: availabilityISO(a.breakdown),
      performance: performanceISO(a.intervals),
      mttrMin: macroCount > 0 ? macroSec / macroCount / 60 : 0,
      mtbfHours: macroCount > 0 ? a.breakdown.uptimeSec / macroCount / 3600 : a.breakdown.uptimeSec / 3600,
      failureCount: macroCount,
      microCount,
      microMin: microSec / 60,
      shoplogixTargetCpm: targetCpmFromIntervals(a.intervals),
      totalCycles: a.totalCycles,
      uptimeMin:   a.breakdown.uptimeSec / 60,
      downtimeMin: a.breakdown.downtimeSec / 60,
      setupMin:    a.breakdown.setupSec / 60,
      ...lost,
    }
  })

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
