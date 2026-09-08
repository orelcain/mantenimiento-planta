/**
 * Seteo inicial de un turno nuevo al cargar el Excel.
 *
 * Hasta el 08-09 el wizard registraba como snapshot inicial SU borrador
 * (localStorage / autosave), que suele ser de otro día: en la carga parcial
 * del 2026-09-07 Turno 1, 8 de 12 puertas quedaron "seteo ≠ máquina" y 74
 * piezas de P0 salieron "fuera de calidad" por eso. El seteo que más
 * probablemente rige hoy es el último conocido de la línea: el \`gatesUsed\` del
 * turno más reciente (que la página mantiene al día con los snapshots y las
 * adopciones). Si el usuario tocó las gates en el wizard, manda lo suyo.
 */
import type { GateAssignment, GraderDailySummary } from './types'

export type SummaryConSeteo = Pick<GraderDailySummary, 'dateKey' | 'shiftId' | 'updatedAt' | 'gatesUsed'>

/** El seteo del turno más reciente que tenga uno (por fecha de turno, luego por actualización). */
export function pickUltimoSeteo(summaries: readonly SummaryConSeteo[]): GateAssignment[] | null {
  const conSeteo = summaries.filter((s) => (s.gatesUsed?.length ?? 0) > 0)
  if (conSeteo.length === 0) return null
  conSeteo.sort((a, b) => (b.dateKey.localeCompare(a.dateKey)) || ((b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')))
  return [...conSeteo[0]!.gatesUsed!]
}

/**
 * Qué seteo registrar como inicial: el del turno si ya tiene snapshot (no
 * llega acá), el que el usuario editó en el wizard si lo tocó, y si no, el
 * último conocido de la línea; sin ninguno, el borrador del wizard.
 */
export function elegirSeteoInicial(params: {
  wizardGates: GateAssignment[]
  gatesEditadas: boolean
  ultimoConocido: GateAssignment[] | null
}): { gates: GateAssignment[]; origen: 'wizard' | 'ultimo-conocido' } {
  if (params.gatesEditadas || !params.ultimoConocido) return { gates: params.wizardGates, origen: 'wizard' }
  return { gates: params.ultimoConocido, origen: 'ultimo-conocido' }
}
