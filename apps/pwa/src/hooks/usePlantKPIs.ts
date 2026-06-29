/**
 * usePlantKPIs / usePlantKPIsForPeriod — hooks React del board "Indicadores de
 * Rendimiento" (Análisis de Turno).
 *
 * Las FÓRMULAS (OEE = Disponibilidad×Rendimiento×Calidad, MTTR/MTBF de averías
 * macro) viven en `services/grader/plantKpiCompute` — fuente única compartida con
 * el servicio `turnoKpis` que alimenta a ARIA, para que el chatbot reporte los
 * MISMOS números que el board.
 *
 * usePlantKPIs: un turno auto-detectado. usePlantKPIsForPeriod: agrega Día/Semana/Mes.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  listShoplogixShiftIdsForDay,
  loadShoplogixShift,
} from '@/services/shoplogix/shoplogixShift.service'
import { avg, computeMachineKPI, aggregateShifts } from '@/services/grader/plantKpiCompute'
import type { MachineKPI, PlantKPIs } from '@/services/grader/plantKpiCompute'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import type { GraderDailySummary } from '@/services/grader/types'

// Re-export para consumidores que importaban estos tipos desde el hook.
export type { MachineKPI, PlantKPIs }

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type KpiPeriod = 'day' | 'week' | 'month'

export interface UsePlantKPIsResult {
  loading: boolean
  error: string | null
  kpis: PlantKPIs | null
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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
          microCount:   machineKPIs.reduce((a, m) => a + m.microCount, 0),
          microMin:     machineKPIs.reduce((a, m) => a + m.microMin, 0),
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

/** Datos crudos de Shoplogix cargados para un período — separados de graderSummaries. */
type SlxLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ok'
      shifts: { dateKey: string; shiftId: string; machines: UpstreamMachineShift[] }[]
      anchor: string
      label: string
      dateKeys: string[]
    }

/**
 * Agrega KPIs para un período (Día / Semana / Mes).
 *
 * Diseño en dos capas:
 *   1. Effect: carga Shoplogix (costoso). Se re-ejecuta solo cuando cambia
 *      plantSlug / period / anchorDateKey / currentMonth.
 *   2. useMemo: agrega calidad (Q = 1 − P0%) desde graderSummaries. Se
 *      re-ejecuta cuando llegan nuevos summaries SIN re-fetchear Shoplogix.
 */
export function usePlantKPIsForPeriod(
  plantSlug: PlantSlug,
  period: KpiPeriod,
  anchorDateKey: string | null,
  currentMonth: Date,
  graderSummaries: GraderDailySummary[],
): UsePlantKPIsResult {
  const [slx, setSlx] = useState<SlxLoad>({ status: 'loading' })

  // ── Capa 1: carga Shoplogix ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setSlx({ status: 'loading' })

    async function load() {
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
            if (!cancelled) setSlx({ status: 'ok', shifts: [], anchor: daysAgo(0), label: '', dateKeys: [] })
            return
          }
          if (!cancelled) setSlx({
            status: 'ok',
            shifts: [{ dateKey: foundDateKey, shiftId: foundShiftId, machines: foundSnapshot.machines }],
            anchor: foundDateKey,
            label: getPeriodLabel('day', foundDateKey, currentMonth),
            dateKeys: [foundDateKey],
          })
          return
        }

        // Casos con rango de fechas explícito
        const anchor   = anchorDateKey ?? daysAgo(0)
        const dateKeys = getDateKeys(period, anchor, currentMonth)
        const label    = getPeriodLabel(period, anchor, currentMonth)
        const shifts   = await loadShiftsForDates(dateKeys, plantSlug)
        if (!cancelled) setSlx({ status: 'ok', shifts, anchor, label, dateKeys })
      } catch {
        if (!cancelled) setSlx({ status: 'error', message: 'No se pudo cargar los indicadores' })
      }
    }

    load()
    return () => { cancelled = true }
  }, [plantSlug, period, anchorDateKey, currentMonth])

  // ── Capa 2: agrega calidad desde graderSummaries (reactivo) ─────────────
  return useMemo<UsePlantKPIsResult>(() => {
    if (slx.status === 'loading') return { loading: true, error: null, kpis: null }
    if (slx.status === 'error')   return { loading: false, error: slx.message, kpis: null }

    const { shifts, anchor, label, dateKeys } = slx

    if (shifts.length === 0) {
      const graderForPeriod = graderSummaries.filter(g => dateKeys.includes(g.dateKey))
      if (graderForPeriod.length === 0) return { loading: false, error: null, kpis: null }
      const qualityVals = graderForPeriod
        .filter(g => typeof g.pointZeroPct === 'number')
        .map(g => Math.max(0, Math.min(1, 1 - g.pointZeroPct / 100)))
      const quality = qualityVals.length > 0 ? avg(qualityVals) : null
      return {
        loading: false, error: null,
        kpis: {
          dateKey: anchor, shiftId: '', periodLabel: label,
          shiftsCount: graderForPeriod.length,
          availability: null, performance: null, quality, oee: null,
          mttrMin: 0, mtbfHours: 0, failureCount: 0, microCount: 0, microMin: 0, machines: [],
          graderOnly: true,
        },
      }
    }

    return { loading: false, error: null, kpis: aggregateShifts(shifts, label, graderSummaries) }
  }, [slx, graderSummaries])
}
