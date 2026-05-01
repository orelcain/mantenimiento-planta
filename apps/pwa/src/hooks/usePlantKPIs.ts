/**
 * usePlantKPIs / usePlantKPIsForPeriod
 *
 * OEE = Disponibilidad × Rendimiento × Calidad
 *   A = shiftRuntime promedio de las Baaders
 *   P = overallRatio promedio (capped 1.0)
 *   Q = 1 − P0Pct (solo si hay Grader data)
 *
 * MTTR = Σ durationSec de eventos downtime / n_paros  (min)
 * MTBF = uptimeSec total / n_paros                    (horas)
 *
 * usePlantKPIsForPeriod agrega múltiples turnos para Día/Semana/Mes.
 */

import { useEffect, useState } from 'react'
import {
  listShoplogixShiftIdsForDay,
  loadShoplogixShift,
} from '@/services/shoplogix/shoplogixShift.service'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import type { GraderDailySummary } from '@/services/grader/types'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type KpiPeriod = 'day' | 'week' | 'month'

export interface MachineKPI {
  machineid: string
  machineName: string
  availability: number
  performance: number
  mttrMin: number
  mtbfHours: number
  failureCount: number
  shoplogixTargetCpm: number | null
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
  machines: MachineKPI[]
  /** true cuando solo hay calidad Grader, sin datos Shoplogix */
  graderOnly?: boolean
}

export interface UsePlantKPIsResult {
  loading: boolean
  error: string | null
  kpis: PlantKPIs | null
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function computeMachineKPI(m: UpstreamMachineShift): MachineKPI {
  const downtimes    = m.states.filter((s) => s.type === 'downtime')
  const uptimeSec    = m.shiftRuntimeBreakdown.uptimeSec
  const totalDtSec   = downtimes.reduce((a, s) => a + s.durationSec, 0)
  const firstInterval = m.intervals.find((iv) => iv.expectedCycles > 0)
  return {
    machineid:          m.machineid,
    machineName:        m.machineName,
    availability:       m.shiftRuntime,
    performance:        Math.min(1, m.overallRatio),
    mttrMin:            downtimes.length > 0 ? totalDtSec / downtimes.length / 60 : 0,
    mtbfHours:          downtimes.length > 0 ? uptimeSec / downtimes.length / 3600 : uptimeSec / 3600,
    failureCount:       downtimes.length,
    shoplogixTargetCpm: firstInterval ? firstInterval.expectedCycles / 5 : null,
  }
}

/** Agrega un array de {dateKey, shiftId, machines} en un PlantKPIs único. */
function aggregateShifts(
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
    const allDowntimes  = ms.flatMap(m => m.states.filter(s => s.type === 'downtime'))
    const totalDtSec    = allDowntimes.reduce((a, s) => a + s.durationSec, 0)
    const totalUptimeSec = ms.reduce((a, m) => a + m.shiftRuntimeBreakdown.uptimeSec, 0)
    const nFailures     = allDowntimes.length
    const firstInterval = ms[0]?.intervals.find(iv => iv.expectedCycles > 0)
    machineKPIs.push({
      machineid:          ms[0]!.machineid,
      machineName:        ms[0]!.machineName,
      availability:       avg(ms.map(m => m.shiftRuntime)),
      performance:        Math.min(1, avg(ms.map(m => m.overallRatio))),
      mttrMin:            nFailures > 0 ? totalDtSec / nFailures / 60 : 0,
      mtbfHours:          nFailures > 0 ? totalUptimeSec / nFailures / 3600 : totalUptimeSec / 3600,
      failureCount:       nFailures,
      shoplogixTargetCpm: firstInterval ? firstInterval.expectedCycles / 5 : null,
    })
  }

  const availability = avg(machineKPIs.map(m => m.availability))
  const performance  = avg(machineKPIs.map(m => m.performance))

  // Calidad: promedio de (1 − P0%) de los turnos con Grader data
  const qualityValues = shifts
    .map(s => graderSummaries.find(g => g.dateKey === s.dateKey && g.shiftId === s.shiftId))
    .filter((g): g is GraderDailySummary => g !== undefined && typeof g.pointZeroPct === 'number')
    .map(g => Math.max(0, Math.min(1, 1 - g.pointZeroPct / 100)))
  const quality = qualityValues.length > 0 ? avg(qualityValues) : null
  const oee     = quality !== null ? availability * performance * quality : null

  const first = shifts[0]!
  return {
    dateKey:      first.dateKey,
    shiftId:      first.shiftId,
    periodLabel,
    shiftsCount:  shifts.length,
    availability,
    performance,
    quality,
    oee,
    mttrMin:      avg(machineKPIs.map(m => m.mttrMin)),
    mtbfHours:    avg(machineKPIs.map(m => m.mtbfHours)),
    failureCount: machineKPIs.reduce((a, m) => a + m.failureCount, 0),
    machines:     machineKPIs,
  }
}

/** Genera lista de dateKeys para el período dado. */
function getDateKeys(period: KpiPeriod, anchor: string, currentMonth: Date): string[] {
  if (period === 'month') {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const days = new Date(y, m + 1, 0).getDate()
    return Array.from({ length: days }, (_, i) =>
      `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    )
  }
  const anchorMs = new Date(`${anchor}T12:00:00`).getTime()
  const numDays  = period === 'week' ? 7 : 1
  return Array.from({ length: numDays }, (_, i) =>
    new Date(anchorMs - (numDays - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  )
}

/** Etiqueta de período en español. */
function getPeriodLabel(period: KpiPeriod, anchor: string, currentMonth: Date): string {
  if (period === 'month') {
    return `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
  }
  const anchorDate = new Date(`${anchor}T12:00:00`)
  if (period === 'week') {
    const startDate = new Date(anchorDate.getTime() - 6 * 86_400_000)
    const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
    return `${fmt(startDate)} – ${fmt(anchorDate)}`
  }
  return anchorDate.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
}

/** Carga todos los turnos de un array de dateKeys en paralelo. */
async function loadShiftsForDates(
  dateKeys: string[],
  plantSlug: PlantSlug,
): Promise<{ dateKey: string; shiftId: string; machines: UpstreamMachineShift[] }[]> {
  const perDay = await Promise.all(
    dateKeys.map(async (dk) => {
      const ids = await listShoplogixShiftIdsForDay(dk, plantSlug).catch(() => [] as string[])
      const loaded = await Promise.all(
        ids.map(async (sid) => {
          const res = await loadShoplogixShift(dk, sid, plantSlug).catch(() => null)
          if (!res?.snapshot || res.snapshot.machines.length === 0) return null
          return { dateKey: dk, shiftId: sid, machines: res.snapshot.machines }
        }),
      )
      return loaded.filter((x): x is NonNullable<typeof x> => x !== null)
    }),
  )
  return perDay.flat()
}

// ── Hook original (un turno auto-detectado) ───────────────────────────────────

export function usePlantKPIs(
  plantSlug: PlantSlug,
  graderSummaries: GraderDailySummary[],
): UsePlantKPIsResult {
  const [state, setState] = useState<UsePlantKPIsResult>({ loading: true, error: null, kpis: null })

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState({ loading: true, error: null, kpis: null })
      try {
        let dateKey: string | null = null
        let shiftId: string | null = null
        let snapshot: Awaited<ReturnType<typeof loadShoplogixShift>>['snapshot'] = null
        let fbDateKey: string | null = null
        let fbShiftId: string | null = null
        let fbSnapshot: Awaited<ReturnType<typeof loadShoplogixShift>>['snapshot'] = null

        outer: for (let i = 0; i <= 7; i++) {
          const dk  = daysAgo(i)
          const ids = await listShoplogixShiftIdsForDay(dk, plantSlug)
          if (cancelled) return
          for (const sid of [...ids].reverse()) {
            const res = await loadShoplogixShift(dk, sid, plantSlug)
            if (cancelled) return
            if (!res.snapshot || res.snapshot.machines.length === 0) continue
            if (!fbSnapshot) { fbDateKey = dk; fbShiftId = sid; fbSnapshot = res.snapshot }
            if (res.snapshot.machines.some(m => m.shiftRuntime > 0)) {
              dateKey = dk; shiftId = sid; snapshot = res.snapshot; break outer
            }
          }
        }

        if (!snapshot && fbSnapshot) { dateKey = fbDateKey; shiftId = fbShiftId; snapshot = fbSnapshot }
        if (!dateKey || !shiftId || !snapshot) {
          if (!cancelled) setState({ loading: false, error: null, kpis: null })
          return
        }

        const machineKPIs  = snapshot.machines.map(computeMachineKPI)
        const availability = avg(machineKPIs.map(m => m.availability))
        const performance  = avg(machineKPIs.map(m => m.performance))
        const graderSummary = graderSummaries.find(s => s.dateKey === dateKey && s.shiftId === shiftId)
        const quality: number | null = graderSummary && typeof graderSummary.pointZeroPct === 'number'
          ? Math.max(0, Math.min(1, 1 - graderSummary.pointZeroPct / 100))
          : null
        const oee = quality !== null ? availability * performance * quality : null

        const kpis: PlantKPIs = {
          dateKey: dateKey!, shiftId: shiftId!,
          periodLabel: getPeriodLabel('day', dateKey!, new Date()),
          shiftsCount: 1,
          availability, performance, quality, oee,
          mttrMin:      avg(machineKPIs.map(m => m.mttrMin)),
          mtbfHours:    avg(machineKPIs.map(m => m.mtbfHours)),
          failureCount: machineKPIs.reduce((a, m) => a + m.failureCount, 0),
          machines:     machineKPIs,
        }
        if (!cancelled) setState({ loading: false, error: null, kpis })
      } catch {
        if (!cancelled) setState({ loading: false, error: 'No se pudo cargar los indicadores de rendimiento', kpis: null })
      }
    }

    load()
    return () => { cancelled = true }
  // graderSummaries intencionalmente excluido
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantSlug])

  return state
}

// ── Hook multi-período ────────────────────────────────────────────────────────

/**
 * Agrega KPIs para un período (Día / Semana / Mes).
 *
 * - 'day' sin anchorDateKey  → busca el turno más reciente con actividad (últimos 7 días)
 * - 'day' con anchorDateKey  → agrega todos los turnos de ese día específico
 * - 'week'                   → agrega 7 días terminando en anchorDateKey (o hoy)
 * - 'month'                  → agrega todos los días de currentMonth
 */
export function usePlantKPIsForPeriod(
  plantSlug: PlantSlug,
  period: KpiPeriod,
  anchorDateKey: string | null,
  currentMonth: Date,
  graderSummaries: GraderDailySummary[],
): UsePlantKPIsResult {
  const [state, setState] = useState<UsePlantKPIsResult>({ loading: true, error: null, kpis: null })

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState({ loading: true, error: null, kpis: null })
      try {
        // Caso especial: día sin anchor → buscar el turno más reciente con actividad
        if (period === 'day' && !anchorDateKey) {
          let foundDateKey: string | null = null
          let foundShiftId: string | null = null
          let foundSnapshot: Awaited<ReturnType<typeof loadShoplogixShift>>['snapshot'] = null
          let fbDateKey: string | null = null; let fbShiftId: string | null = null
          let fbSnapshot: Awaited<ReturnType<typeof loadShoplogixShift>>['snapshot'] = null

          outer: for (let i = 0; i <= 7; i++) {
            const dk  = daysAgo(i)
            const ids = await listShoplogixShiftIdsForDay(dk, plantSlug)
            if (cancelled) return
            for (const sid of [...ids].reverse()) {
              const res = await loadShoplogixShift(dk, sid, plantSlug)
              if (cancelled) return
              if (!res.snapshot || res.snapshot.machines.length === 0) continue
              if (!fbSnapshot) { fbDateKey = dk; fbShiftId = sid; fbSnapshot = res.snapshot }
              if (res.snapshot.machines.some(m => m.shiftRuntime > 0)) {
                foundDateKey = dk; foundShiftId = sid; foundSnapshot = res.snapshot; break outer
              }
            }
          }
          if (!foundSnapshot && fbSnapshot) { foundDateKey = fbDateKey; foundShiftId = fbShiftId; foundSnapshot = fbSnapshot }
          if (!foundDateKey || !foundShiftId || !foundSnapshot) {
            if (!cancelled) setState({ loading: false, error: null, kpis: null })
            return
          }
          const kpis = aggregateShifts(
            [{ dateKey: foundDateKey, shiftId: foundShiftId, machines: foundSnapshot.machines }],
            getPeriodLabel('day', foundDateKey, currentMonth),
            graderSummaries,
          )
          if (!cancelled) setState({ loading: false, error: null, kpis })
          return
        }

        // Casos con rango de fechas explícito
        const anchor   = anchorDateKey ?? daysAgo(0)
        const dateKeys = getDateKeys(period, anchor, currentMonth)
        const label    = getPeriodLabel(period, anchor, currentMonth)

        const shifts = await loadShiftsForDates(dateKeys, plantSlug)
        if (cancelled) return

        if (shifts.length === 0) {
          // Sin Shoplogix — intentar calidad solo desde Grader
          const graderForPeriod = graderSummaries.filter(g => dateKeys.includes(g.dateKey))
          if (graderForPeriod.length === 0) {
            setState({ loading: false, error: null, kpis: null })
            return
          }
          const qualityVals = graderForPeriod
            .filter(g => typeof g.pointZeroPct === 'number')
            .map(g => Math.max(0, Math.min(1, 1 - g.pointZeroPct / 100)))
          const quality = qualityVals.length > 0 ? avg(qualityVals) : null
          const graderKpi: PlantKPIs = {
            dateKey: anchor,
            shiftId: '',
            periodLabel: label,
            shiftsCount: graderForPeriod.length,
            availability: null,
            performance: null,
            quality,
            oee: null,
            mttrMin: 0,
            mtbfHours: 0,
            failureCount: 0,
            machines: [],
            graderOnly: true,
          }
          setState({ loading: false, error: null, kpis: graderKpi })
          return
        }

        const kpis = aggregateShifts(shifts, label, graderSummaries)
        setState({ loading: false, error: null, kpis })
      } catch {
        if (!cancelled) setState({ loading: false, error: 'No se pudo cargar los indicadores', kpis: null })
      }
    }

    load()
    return () => { cancelled = true }
  // graderSummaries intencionalmente excluido
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantSlug, period, anchorDateKey, currentMonth])

  return state
}
