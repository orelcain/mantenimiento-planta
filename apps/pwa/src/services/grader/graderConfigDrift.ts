/**
 * Detección de desfase de configuración en un turno ya analizado.
 *
 * El análisis de un turno se CONGELA al guardarlo: `computeShiftSummary` clasifica
 * las piezas de puerta 0 con las gates vigentes en ese momento y escribe
 * `topP0Causes` en el doc. Si después se editan las gates (queda snapshot en
 * `graderShifts/{id}/configHistory`), nada recalcula el turno — el desglose que
 * ve el supervisor puede corresponder a una configuración que ya no existe.
 *
 * Este módulo compara y responde: "¿el desglose de abajo cambiaría con la config
 * de ahora?". NO recalcula ni escribe nada — solo avisa.
 *
 * Importante: el % de punto cero NO depende de la configuración. Es el conteo
 * físico de piezas que la máquina mandó a puerta 0; ninguna config retroactiva
 * lo mueve. Solo cambia la DESCOMPOSICIÓN de esas piezas en causas derivadas.
 */

import { classifyRecordToMatrix, CALIBRE_WEIGHT_RANGES } from './graderAnalytics'
import type { GateAssignment, Gate0Record, MatrixP0Cause } from './types'

/** Causas cuya clasificación depende de la config de gates (las 4 derivadas). */
export const GATE_DEPENDENT_CAUSES: MatrixP0Cause[] = [
  'fuera_de_calibre',
  'fuera_de_calidad',
  'fuera_de_conservacion',
  'fuera_de_producto',
]

/** Campos de una gate que afectan la clasificación de una pieza. */
const GATE_FIELDS: Array<keyof GateAssignment> = [
  'assignedCalibre', 'assignedQuality', 'assignedConservation', 'assignedProduct', 'active',
]

/**
 * `exact`   — el summary guardó las gates que usó (`gatesUsed`): se comparan las
 *             dos configuraciones sobre el mismo set de piezas. Sin falsos positivos.
 * `estimated` — turno viejo sin `gatesUsed`: se compara el recálculo con las gates
 *             actuales contra `topP0Causes` guardado. Los pieceRecords de Firestore
 *             pueden no traer la columna Error del Excel de Puerta 0, así que las
 *             causas oficiales (fotocélula, puerta no preparada) no se reproducen
 *             — por eso solo se comparan las causas derivadas, que sí dependen de
 *             las gates, y el aviso se muestra como estimado.
 */
export type ConfigDriftMode = 'exact' | 'estimated'

export interface ConfigDriftCause {
  cause: MatrixP0Cause
  /** Piezas en el análisis guardado. */
  saved: number
  /** Piezas que daría la configuración actual. */
  current: number
}

export interface ConfigDriftResult {
  /** true = el desglose guardado no coincide con lo que daría la config actual. */
  stale: boolean
  mode: ConfigDriftMode
  /** Causas dependientes de gates con su antes/después (solo las que aparecen en alguno de los dos). */
  causes: ConfigDriftCause[]
  /** Números de gate cuya asignación cambió. Solo en modo `exact`. */
  changedGateNumbers: number[]
}

/**
 * Forma mínima que necesita la clasificación. Acepta tanto `Gate0Record` (parseado
 * del Excel) como `FirestorePieceRecord` (leído del turno guardado), que trae
 * calidad/calibre como `string` suelto.
 */
type P0Record = {
  pieces: number
  ts?: string
  weightKg?: number
  weightPerPieceGrams?: number
  quality?: string
  calibre?: string
  error?: string
  product?: string
  conservation?: string
}

/** Clasifica un set de registros de puerta 0 con una config dada. Réplica exacta de computeShiftSummary. */
function tallyCauses(records: P0Record[], gates: GateAssignment[]): Map<string, number> {
  const active = gates.filter((g) => g.active)
  const out = new Map<string, number>()
  if (active.length === 0) return out
  for (const rec of records) {
    const cause = classifyRecordToMatrix(
      { ...(rec as Gate0Record), error: rec.error ?? '', gate: 0 as const },
      active,
      CALIBRE_WEIGHT_RANGES,
    )
    out.set(cause, (out.get(cause) ?? 0) + rec.pieces)
  }
  return out
}

/** Gates cuya asignación difiere entre dos configuraciones (por número de gate). */
export function changedGates(before: GateAssignment[], after: GateAssignment[]): number[] {
  const byNumber = new Map(before.map((g) => [g.gateNumber, g]))
  const changed = new Set<number>()
  for (const g of after) {
    const prev = byNumber.get(g.gateNumber)
    if (!prev) { changed.add(g.gateNumber); continue }
    if (GATE_FIELDS.some((f) => prev[f] !== g[f])) changed.add(g.gateNumber)
  }
  for (const g of before) {
    if (!after.some((a) => a.gateNumber === g.gateNumber)) changed.add(g.gateNumber)
  }
  return [...changed].sort((a, b) => a - b)
}

export function detectConfigDrift(params: {
  /** Config con la que se calculó el summary. Undefined en turnos anteriores a este campo. */
  gatesUsed?: GateAssignment[]
  /** Config vigente hoy — último snapshot de configHistory. */
  currentGates: GateAssignment[]
  /** pieceRecords con gate 0 del turno. */
  gate0Records: P0Record[]
  /** `topP0Causes` guardado en el summary. */
  savedCauses?: Array<{ error: string; pieces: number }>
}): ConfigDriftResult | null {
  const { gatesUsed, currentGates, gate0Records, savedCauses } = params

  // Sin config actual con la que comparar no hay nada que avisar. Cubre además
  // las líneas que no clasifican (Yal): sus gates no llevan calibre × calidad.
  if (currentGates.filter((g) => g.active).length === 0) return null
  if (gate0Records.length === 0) return null

  const currentTally = tallyCauses(gate0Records, currentGates)

  // Base de comparación: el recálculo con las gates originales (exacto) o, si el
  // turno no las guardó, el desglose persistido (estimado).
  const mode: ConfigDriftMode = gatesUsed && gatesUsed.length > 0 ? 'exact' : 'estimated'
  const savedTally = mode === 'exact'
    ? tallyCauses(gate0Records, gatesUsed!)
    : new Map((savedCauses ?? []).map((c) => [c.error, c.pieces]))

  // En modo estimado sin causas guardadas no hay base contra la cual comparar.
  if (mode === 'estimated' && savedTally.size === 0) return null

  const causes: ConfigDriftCause[] = []
  for (const cause of GATE_DEPENDENT_CAUSES) {
    const saved = savedTally.get(cause) ?? 0
    const current = currentTally.get(cause) ?? 0
    if (saved === 0 && current === 0) continue
    causes.push({ cause, saved, current })
  }

  const stale = causes.some((c) => c.saved !== c.current)

  return {
    stale,
    mode,
    causes,
    changedGateNumbers: mode === 'exact' ? changedGates(gatesUsed!, currentGates) : [],
  }
}
