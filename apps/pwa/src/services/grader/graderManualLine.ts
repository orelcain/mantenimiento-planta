/**
 * Línea manual — piezas que llegan al Grader sin pasar por las Baader.
 *
 * Desde la temporada 2026 la planta corre una línea manual que NO está
 * instrumentada en Shoplogix: sus piezas no generan ciclos de Baader, pero sí
 * pasan por el Marelec. La única huella que dejan es la diferencia:
 *
 *     Grader − Baader = 774        (turno 1 del 31-jul-2026)
 *
 * ── Por qué esto NO es rechazo ──────────────────────────────────────────────
 *
 * Hasta ahora esa diferencia se mostraba como "Rechazo est. (bruto)", asumiendo
 * que por la línea manual solo volvían los rechazos de las Baader. Con una
 * línea manual que produce, esa premisa se cayó y el número pasó a ser absurdo:
 * 774 sobre 759 ciclos daba un rechazo del 102%.
 *
 * La ecuación real tiene DOS incógnitas y UN dato:
 *
 *     Grader = Baader − rechazo + manual
 *     →  Grader − Baader = manual − rechazo
 *
 * Las 774 podrían ser 774 de manual con 0 de rechazo, o 900 de manual con 126
 * de rechazo. No es un problema de calibración: es indeterminado. Por eso el
 * rechazo se retiró de la UI en vez de mostrarlo mal, y lo que se informa acá
 * es el PISO de la línea manual (asume rechazo cero).
 *
 * Para poder despejar el rechazo hace falta cualquiera de estas dos cosas:
 *   a) un sensor de rechazo hacia Shoplogix, o
 *   b) un conteo declarado de la línea manual → rechazo = manual_declarado − delta
 */

export interface ManualLineEstimate {
  /** Piezas totales que registró el Grader (Marelec). */
  graderPieces: number
  /** Ciclos totales de las Baader según Shoplogix. */
  baaderCycles: number
  /**
   * Piezas atribuidas a la línea manual = Grader − Baader.
   * Es un PISO: asume rechazo cero en las Baader.
   */
  manualPieces: number
  /** Peso de la línea manual sobre el total del Grader (0-100). */
  pctOfGrader: number
}

/**
 * Estima la producción de la línea manual de un turno.
 *
 * Devuelve `null` cuando no se puede afirmar nada:
 *  - sin ciclos de Baader (Shoplogix no sincronizó): no hay con qué restar.
 *  - delta ≤ 0 (el Grader contó igual o menos que las Baader): no hubo línea
 *    manual detectable, o hubo rechazo que la tapa. Mostrar 0 sugeriría que la
 *    línea manual no trabajó, y eso no lo sabemos.
 */
export function estimateManualLine(args: {
  graderPieces: number
  baaderCycles: number
}): ManualLineEstimate | null {
  const { graderPieces, baaderCycles } = args
  if (!Number.isFinite(graderPieces) || !Number.isFinite(baaderCycles)) return null
  if (baaderCycles <= 0 || graderPieces <= 0) return null

  const manualPieces = graderPieces - baaderCycles
  if (manualPieces <= 0) return null

  return {
    graderPieces,
    baaderCycles,
    manualPieces,
    pctOfGrader: Math.round((manualPieces / graderPieces) * 1000) / 10,
  }
}

/** Texto del tooltip. Centralizado para que no se explique distinto en cada pantalla. */
export const MANUAL_LINE_TOOLTIP =
  'Piezas que llegaron al Grader sin pasar por las Baader: Grader − Baader. ' +
  'Es un piso — asume rechazo cero en las Baader. Sin un sensor de rechazo o un ' +
  'conteo de la línea manual no se pueden separar las dos cosas.'

export const MANUAL_LINE_LABEL = 'Línea manual (est.)'
/** Etiqueta corta para espacios apretados (celdas del calendario). */
export const MANUAL_LINE_SHORT = 'MAN'
/** Etiqueta corta de las Baader, para el mismo contexto. */
export const BAADER_SHORT = 'BAA'
