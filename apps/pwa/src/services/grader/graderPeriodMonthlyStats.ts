/**
 * Stats mensuales de Shoplogix, calculadas desde los turnos del período.
 *
 * Este cálculo vivía DENTRO de `GraderHistoricalCalendar` y se emitía por
 * `onSlxMonthStatsLoaded`. Al retirar el calendario se habría ido con él y el
 * panel de resumen mensual se habría quedado vacío, así que se porta acá — a
 * partir de `PeriodShift[]`, que ya tiene todo lo necesario.
 *
 * Se conservan las reglas que el calendario había ido acumulando, porque cada
 * una arregla algo real:
 *
 *  - `Unscheduled` NO entra a los promedios ni al ranking de turnos. No es un
 *    turno: no tiene ventana declarada por la planta, y Shoplogix mismo lo
 *    excluye de su cascada de OEE. Se reporta aparte.
 *  - El uptime del mes es el promedio de los uptimes POR TURNO, no un
 *    total/total: un turno corto y uno largo pesan lo mismo en "cómo rindió".
 *  - Un turno sin ciclos significativos no entra: ensuciaría el mínimo del
 *    ranking con turnos que nunca arrancaron.
 */
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import { isSignificantCycleCount } from '@/services/grader/graderShiftDisplay'
import {
  isMaintenanceMacro,
  isMaintenanceMicro,
  type ClassifiableState,
} from '@/services/grader/shoplogixMaintenance'
import { deserializeStateAggregates } from '@/services/grader/shoplogixStateAggregates'

export interface PeriodMonthlyStats {
  totalCycles: number
  /** 0-100, promedio entre turnos. */
  avgUptimePct: number
  totalUptimeSec: number
  perMachineMonth: Array<{
    machineid: string
    name: string
    uptimeSec: number
    totalCycles: number
    expectedTotalCycles: number
    shiftCount: number
    avgUptimePct: number
    maintMacroSec: number
    maintMacroCount: number
    maintMicroSec: number
    maintMicroCount: number
  }>
  turnosWithData: number
  dayShiftsWithData: number
  nightShiftsWithData: number
  daysWithData: number
  bestShift: { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number } | null
  worstShift: { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number } | null
  unscheduled: { cycles: number; uptimeSec: number; daysWithData: number }
}

export function computePeriodMonthlyStats(
  shifts: readonly PeriodShift[],
): PeriodMonthlyStats | null {
  // Solo turnos REALES con producción significativa entran a promedios y ranking.
  const ranked = shifts.filter(s => !s.unscheduled && isSignificantCycleCount(s.cycles))
  const uns = shifts.filter(s => s.unscheduled)

  if (ranked.length === 0 && uns.length === 0) return null

  let totalCycles = 0
  let totalUptimeSec = 0
  let sumUptimePct = 0
  const days = new Set<string>()
  let dayShifts = 0
  let nightShifts = 0
  let best: PeriodMonthlyStats['bestShift'] = null
  let worst: PeriodMonthlyStats['worstShift'] = null

  const perMachine = new Map<string, PeriodMonthlyStats['perMachineMonth'][number]>()

  for (const s of ranked) {
    totalCycles += s.cycles
    totalUptimeSec += s.uptimeSec
    days.add(s.dateKey)
    if (s.meta.isDayLike) dayShifts++; else nightShifts++

    const pct = s.uptimePct ?? 0
    sumUptimePct += pct

    const entry = { dateKey: s.dateKey, shiftId: s.shiftId, uptimePct: pct, totalCycles: s.cycles }
    if (!best || pct > best.uptimePct) best = entry
    if (!worst || pct < worst.uptimePct) worst = entry

    for (const m of s.machines) {
      let acc = perMachine.get(m.machineid)
      if (!acc) {
        acc = {
          machineid: m.machineid, name: m.name,
          uptimeSec: 0, totalCycles: 0, expectedTotalCycles: 0,
          shiftCount: 0, avgUptimePct: 0,
          maintMacroSec: 0, maintMacroCount: 0, maintMicroSec: 0, maintMicroCount: 0,
        }
        perMachine.set(m.machineid, acc)
      }
      acc.uptimeSec += m.uptimeSec
      acc.totalCycles += m.totalCycles
      acc.expectedTotalCycles += m.expectedTotalCycles
      acc.shiftCount += 1
      acc.avgUptimePct += m.shiftRuntime * 100

      // Mantención macro/micro desde los estados agregados de la máquina. Sin
      // esto el panel mostraría 0 min de mantención, que es peor que no
      // mostrarlo: 0 se lee como "no hubo", no como "no se midió".
      for (const st of deserializeStateAggregates(m.stateAggregates) ?? []) {
        const cs = st as unknown as ClassifiableState
        if (isMaintenanceMacro(cs)) {
          acc.maintMacroSec += st.durationSec
          acc.maintMacroCount += st.count
        } else if (isMaintenanceMicro(cs)) {
          acc.maintMicroSec += st.durationSec
          acc.maintMicroCount += st.count
        }
      }
    }
  }

  for (const acc of perMachine.values()) {
    acc.avgUptimePct = acc.shiftCount > 0 ? acc.avgUptimePct / acc.shiftCount : 0
  }

  return {
    totalCycles,
    avgUptimePct: ranked.length > 0 ? sumUptimePct / ranked.length : 0,
    totalUptimeSec,
    perMachineMonth: [...perMachine.values()].sort((a, b) => b.totalCycles - a.totalCycles),
    turnosWithData: ranked.length,
    dayShiftsWithData: dayShifts,
    nightShiftsWithData: nightShifts,
    daysWithData: days.size,
    bestShift: best,
    worstShift: worst,
    unscheduled: {
      cycles: uns.reduce((a, s) => a + s.cycles, 0),
      uptimeSec: uns.reduce((a, s) => a + s.uptimeSec, 0),
      daysWithData: new Set(uns.map(s => s.dateKey)).size,
    },
  }
}
