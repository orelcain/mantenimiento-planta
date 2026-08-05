/**
 * Confiabilidad de Mantención de un período completo.
 *
 * POR QUÉ NO SALE DEL HOOK DEL PERÍODO
 * ------------------------------------
 * `PeriodShift` trae ciclos y uptime de Shoplogix, pero las pausas ≥5 min viven
 * en una subcolección aparte (`graderDailySummaries/{id}/meta/pauses`) y hay que
 * leerlas turno por turno. Cargarlas siempre encarecería la matriz, que se abre
 * muchas veces al día y no las necesita. Acá se cargan SOLO cuando alguien pide
 * el comparativo del período.
 *
 * El conteo por turno se obtiene llamando `computeMaintenanceReliability` con un
 * turno a la vez, en vez de reimplementar el criterio de qué pausa cuenta como
 * avería de Mantención. Ese criterio (los tags atribuibles) tiene que vivir en
 * un solo lugar: si algún día se agrega un tag, la hoja del período lo hereda
 * sin tocarla.
 */

import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import type { GraderDailySummary } from '@/services/grader/types'
import {
  loadPausesForSummaries,
  computeMaintenanceReliability,
} from '@/services/grader/graderReliability'

export interface PeriodReliability {
  /** Agregado del período, con la forma que espera `buildPeriodSummary`. */
  reliability: {
    mttrMacroSec: number
    mtbfSec: number
    macroCount: number
    microCount: number
    microSec: number
    shiftsWithData: number
  } | null
  /** Averías macro por turno, indexadas por `PeriodShift.key`. */
  breakdownsByShiftKey: Map<string, number>
}

const EMPTY: PeriodReliability = { reliability: null, breakdownsByShiftKey: new Map() }

/**
 * Carga las pausas de los turnos del período que tengan Excel del Grader y
 * calcula la confiabilidad agregada y por turno.
 *
 * Devuelve `reliability: null` cuando no hay ningún turno con datos — que la
 * hoja distingue de "cero averías", porque no son lo mismo.
 */
export async function loadPeriodReliability(
  shifts: readonly PeriodShift[],
): Promise<PeriodReliability> {
  // Un mismo summary puede aparecer una sola vez, pero el índice por `key` se
  // arma acá para poder devolver el conteo por turno de la matriz.
  const bySummaryId = new Map<string, string>()
  const summaries: GraderDailySummary[] = []
  for (const s of shifts) {
    if (!s.graderSummary) continue
    summaries.push(s.graderSummary)
    bySummaryId.set(s.graderSummary.id, s.key)
  }
  if (summaries.length === 0) return EMPTY

  const loaded = await loadPausesForSummaries(summaries)
  if (loaded.length === 0) return EMPTY

  const agg = computeMaintenanceReliability(summaries, loaded)

  const breakdownsByShiftKey = new Map<string, number>()
  for (const entry of loaded) {
    const key = bySummaryId.get(entry.summary.id)
    if (!key) continue
    const one = computeMaintenanceReliability([entry.summary], [entry])
    breakdownsByShiftKey.set(key, one.eventsCount)
  }

  return {
    reliability: {
      mttrMacroSec: agg.mttrMacroSec,
      mtbfSec: agg.mtbfSec,
      macroCount: agg.eventsCount,
      microCount: agg.microCount,
      microSec: agg.microSec,
      shiftsWithData: agg.shiftsWithData,
    },
    breakdownsByShiftKey,
  }
}
