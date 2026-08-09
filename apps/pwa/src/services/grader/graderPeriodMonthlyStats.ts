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
import { paretoByCategoria } from '@/services/shoplogix/imputacionPareto'

/**
 * Formatea segundos en forma compacta ("6h 18m"). Vivia en
 * `GraderHistoricalCalendar`; se mudo aca al retirar ese componente, porque
 * `GraderMonthlyStatsPanel` lo necesita y no tiene por que arrastrar un modulo
 * de 5.700 lineas para usar 8.
 */
export function fmtSecPanoramic(sec: number): string {
  if (sec <= 0) return '0s'
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

/**
 * Alias historico del tipo. `GraderMonthlyStatsPanel` y el Wizard lo importaban
 * desde el calendario; se conserva el nombre para no tocar esos consumidores.
 */
export type SlxMonthlyStats = PeriodMonthlyStats

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
  /**
   * Desglose por turno NUMERADO (Yal y la Chonchi nueva). Son subconjuntos de
   * day/nightShiftsWithData: el panel los muestra aparte porque "2 turnos de
   * dia" no dice si fueron dos T1 o un T1 y un T2. Se cuentan por shiftId
   * exacto — un nombre que Shoplogix no emita queda simplemente en 0.
   */
  t1ShiftsWithData: number
  t2ShiftsWithData: number
  t3ShiftsWithData: number
  daysWithData: number
  bestShift: { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number } | null
  worstShift: { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number } | null
  unscheduled: { cycles: number; uptimeSec: number; daysWithData: number }
  /**
   * Cobertura de imputación del período: cuánto del tiempo detenido llegó con
   * causal anotada en Shoplogix.
   *
   * No mide a Mantención — mide si los turnos quedaron documentados. Es el
   * número que la capacitación de imputación tiene que mover: en julio 2026 Yal
   * iba en 97% y Chonchi en 0% (255 turnos-máquina, 52 h detenidas, ninguna
   * causal). Sin causal, ese tiempo no se puede atribuir a nadie y cualquier
   * análisis de causa raíz se hace sobre media historia.
   *
   * `null` cuando ningún turno del período trae `stateAggregates` (esquema
   * legacy): 0% se leería como "no imputaron", que es distinto de "no se midió".
   */
  imputacion: PeriodImputacion | null
}

export interface PeriodImputacion {
  /** Tiempo detenido del período (sin uptime ni Planned Downtime). */
  totalSec: number
  /** Del total, cuánto llegó con una causal del árbol oficial. */
  imputadoSec: number
  /** imputadoSec / totalSec (0-1). */
  cobertura: number
  /** Serie cronológica por turno — sirve para ver si la imputación mejora. */
  porTurno: Array<{ dateKey: string; shiftId: string; cobertura: number; totalSec: number }>
  /** Categorías del árbol del período, por impacto. */
  topCategorias: Array<{ label: string; durationSec: number }>
  /** Turnos considerados (los que traen agregados). */
  turnos: number
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
  let t1 = 0, t2 = 0, t3 = 0
  let best: PeriodMonthlyStats['bestShift'] = null
  let worst: PeriodMonthlyStats['worstShift'] = null

  const perMachine = new Map<string, PeriodMonthlyStats['perMachineMonth'][number]>()

  // Imputación: se acumulan los agregados de estados de TODO el período para el
  // total, y se calcula turno a turno para la serie. Sale de `stateAggregates`
  // del doc padre, así que no cuesta ni una lectura extra de Firestore.
  const aggsPeriodo: Array<{ type: string; name?: string; reason?: string; durationSec?: number }> = []
  const impPorTurno: PeriodImputacion['porTurno'] = []
  let turnosConAgregados = 0

  for (const s of ranked) {
    totalCycles += s.cycles
    totalUptimeSec += s.uptimeSec
    days.add(s.dateKey)
    if (s.meta.isDayLike) dayShifts++; else nightShifts++
    if (s.shiftId === 'Turno 1') t1++
    else if (s.shiftId === 'Turno 2') t2++
    else if (s.shiftId === 'Turno 3') t3++

    const pct = s.uptimePct ?? 0
    sumUptimePct += pct

    const entry = { dateKey: s.dateKey, shiftId: s.shiftId, uptimePct: pct, totalCycles: s.cycles }
    if (!best || pct > best.uptimePct) best = entry
    if (!worst || pct < worst.uptimePct) worst = entry

    // Imputación del turno. Solo cuentan los turnos que traen agregados: los
    // legacy (esquema v1) no se pueden medir, y meterlos como 0% diría
    // "no imputaron" cuando la verdad es "no lo sabemos".
    const aggsTurno = s.machines.flatMap(m => deserializeStateAggregates(m.stateAggregates) ?? [])
    if (s.machines.some(m => Array.isArray(m.stateAggregates))) {
      turnosConAgregados++
      aggsPeriodo.push(...aggsTurno)
      const pTurno = paretoByCategoria(aggsTurno)
      if (pTurno.totalSec > 0) {
        impPorTurno.push({
          dateKey: s.dateKey,
          shiftId: s.shiftId,
          cobertura: pTurno.cobertura,
          totalSec: pTurno.totalSec,
        })
      }
    }

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

  const pPeriodo = turnosConAgregados > 0 ? paretoByCategoria(aggsPeriodo) : null
  const imputacion: PeriodImputacion | null = pPeriodo
    ? {
      totalSec: pPeriodo.totalSec,
      imputadoSec: pPeriodo.imputadoSec,
      cobertura: pPeriodo.cobertura,
      // Cronológico: la serie existe para ver si la imputación MEJORA, y para
      // eso el orden tiene que ser el del calendario, no el del ranking.
      porTurno: impPorTurno.sort((a, b) =>
        a.dateKey === b.dateKey ? a.shiftId.localeCompare(b.shiftId) : a.dateKey.localeCompare(b.dateKey),
      ),
      topCategorias: pPeriodo.categorias
        .filter(c => c.durationSec > 0)
        .map(c => ({ label: c.label, durationSec: c.durationSec })),
      turnos: turnosConAgregados,
    }
    : null

  return {
    totalCycles,
    avgUptimePct: ranked.length > 0 ? sumUptimePct / ranked.length : 0,
    totalUptimeSec,
    perMachineMonth: [...perMachine.values()].sort((a, b) => b.totalCycles - a.totalCycles),
    turnosWithData: ranked.length,
    dayShiftsWithData: dayShifts,
    nightShiftsWithData: nightShifts,
    t1ShiftsWithData: t1,
    t2ShiftsWithData: t2,
    t3ShiftsWithData: t3,
    daysWithData: days.size,
    bestShift: best,
    worstShift: worst,
    imputacion,
    unscheduled: {
      cycles: uns.reduce((a, s) => a + s.cycles, 0),
      uptimeSec: uns.reduce((a, s) => a + s.uptimeSec, 0),
      daysWithData: new Set(uns.map(s => s.dateKey)).size,
    },
  }
}
