/**
 * turnoKpis — acceso NO-React a los KPIs de turno (OEE/disponibilidad/rendimiento/
 * calidad/MTTR/MTBF) para que ARIA (chatbot) los reporte.
 *
 * Reusa las MISMAS fórmulas que el board (plantKpiCompute) y las MISMAS fuentes
 * de datos que el hook usePlantKPIs (Shoplogix + Grader) → los números que dice
 * ARIA coinciden con los del módulo Análisis de Turno.
 */
import {
  listShoplogixShiftIdsForDay,
  loadShoplogixShift,
} from '@/services/shoplogix/shoplogixShift.service'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import type { GraderDailySummary } from './types'
import { aggregateShifts, type PlantKPIs } from './plantKpiCompute'

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

export interface LatestShift {
  dateKey: string
  shiftId: string
  machines: UpstreamMachineShift[]
}

/**
 * Recorre `dateKeys` (orden dado = más reciente primero) y devuelve el primer
 * turno Shoplogix con actividad real (alguna máquina con shiftRuntime>0).
 * Si `allowEmpty`, y ninguno tiene actividad, devuelve el primero con datos
 * (turno cargado pero sin producción aún: ARIA dirá "turno en inicio").
 */
async function loadShiftForDates(
  plantSlug: PlantSlug,
  dateKeys: string[],
  allowEmpty: boolean,
): Promise<LatestShift | null> {
  let empty: LatestShift | null = null
  for (const dk of dateKeys) {
    const ids = await listShoplogixShiftIdsForDay(dk, plantSlug).catch(() => [] as string[])
    for (const sid of [...ids].reverse()) {
      const res = await loadShoplogixShift(dk, sid, plantSlug).catch(() => null)
      if (!res?.snapshot || res.snapshot.machines.length === 0) continue
      if (res.snapshot.machines.some((m) => m.shiftRuntime > 0)) {
        return { dateKey: dk, shiftId: sid, machines: res.snapshot.machines }
      }
      if (!empty) empty = { dateKey: dk, shiftId: sid, machines: res.snapshot.machines }
    }
  }
  return allowEmpty ? empty : null
}

/** Turno Shoplogix más reciente CON actividad dentro de los últimos `maxDaysBack` días. */
export async function loadLatestActiveShift(
  plantSlug: PlantSlug,
  maxDaysBack = 7,
): Promise<LatestShift | null> {
  const dates = Array.from({ length: maxDaysBack + 1 }, (_, i) => daysAgo(i))
  return loadShiftForDates(plantSlug, dates, false)
}

/**
 * KPIs del último turno con actividad (OEE/disp/rend/cal/MTTR/MTBF). Estrategia:
 *   1) Ventana reciente CON actividad (operación viva: hoy/ayer).
 *   2) Si no, fechas con datos del Grader como candidatas → último turno DISPONIBLE
 *      (histórico) con actividad. Así ARIA reporta el último turno cargado aunque
 *      sea de hace semanas.
 *   3) Si `allowEmpty` y nada tiene actividad, devuelve el turno reciente sin
 *      producción (ARIA dirá "turno en inicio / 0%").
 *
 * `graderSummaries` aporta calidad (1 − P0%) y las fechas candidatas del paso 2.
 * Devuelve null si no hay ningún turno Shoplogix relevante.
 */
export async function getLatestTurnoKPIs(
  plantSlug: PlantSlug,
  graderSummaries: GraderDailySummary[],
  allowEmpty = false,
): Promise<PlantKPIs | null> {
  const recentDates = Array.from({ length: 8 }, (_, i) => daysAgo(i))
  let shift = await loadShiftForDates(plantSlug, recentDates, false)
  if (!shift && graderSummaries.length > 0) {
    const graderDates = [...new Set(graderSummaries.map((g) => g.dateKey))].sort().reverse().slice(0, 25)
    shift = await loadShiftForDates(plantSlug, graderDates, false)
  }
  if (!shift && allowEmpty) {
    shift = await loadShiftForDates(plantSlug, recentDates, true)
  }
  if (!shift) return null
  return aggregateShifts([shift], `${shift.dateKey} ${shift.shiftId}`, graderSummaries)
}
