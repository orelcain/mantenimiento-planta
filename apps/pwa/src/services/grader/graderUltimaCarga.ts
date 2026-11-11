/**
 * Fecha de la última carga de Excel del Grader que la página YA tiene a mano.
 *
 * Sale de los resúmenes del mes visible (los mismos que alimentan el panel y
 * los KPI), así que no cuesta ninguna lectura extra de Firestore. Si el mes
 * visible no tiene ninguno devuelve `null`: la fila de carga dice entonces
 * «sin cargas en este mes» en vez de inventar una fecha de otro mes.
 */
import type { GraderDailySummary } from './types'

/** Último `dateKey` (YYYY-MM-DD) con piezas del Excel entre los resúmenes dados. */
export function ultimaCargaDateKey(
  summaries: ReadonlyArray<Pick<GraderDailySummary, 'dateKey' | 'totalPieces'>>,
): string | null {
  let last: string | null = null
  for (const s of summaries) {
    if (!s.dateKey || !(s.totalPieces > 0)) continue
    if (last === null || s.dateKey > last) last = s.dateKey
  }
  return last
}

/** 'YYYY-MM-DD' → 'dd-mm'. */
export function dateKeyDdMm(dateKey: string): string {
  return `${dateKey.slice(8, 10)}-${dateKey.slice(5, 7)}`
}
