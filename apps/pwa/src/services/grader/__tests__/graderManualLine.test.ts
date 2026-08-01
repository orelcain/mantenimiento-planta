/**
 * Línea manual = Grader − Baader.
 *
 * Caso real que motivó el cambio: turno 1 del 31-jul-2026 con 1.533 piezas de
 * Grader y 759 ciclos de Baader. La app mostraba esas 774 piezas como
 * "Rechazo est. (bruto) 102,0%" — un rechazo imposible.
 */
import { describe, it, expect } from 'vitest'
import { estimateManualLine } from '../graderManualLine'

describe('estimateManualLine', () => {
  it('el caso real del 31-jul-2026', () => {
    const r = estimateManualLine({ graderPieces: 1533, baaderCycles: 759 })
    expect(r).not.toBeNull()
    expect(r!.manualPieces).toBe(774)
    expect(r!.pctOfGrader).toBe(50.5)
  })

  it('sin ciclos de Baader no afirma nada', () => {
    // Shoplogix no sincronizó: no hay con qué restar.
    expect(estimateManualLine({ graderPieces: 1533, baaderCycles: 0 })).toBeNull()
  })

  it('sin piezas de Grader no afirma nada', () => {
    expect(estimateManualLine({ graderPieces: 0, baaderCycles: 759 })).toBeNull()
  })

  it('si el Grader contó igual o menos que las Baader, devuelve null y no 0', () => {
    // Mostrar 0 diría "la línea manual no trabajó", y eso no lo sabemos: puede
    // haber trabajado y estar tapada por el rechazo de las Baader.
    expect(estimateManualLine({ graderPieces: 700, baaderCycles: 759 })).toBeNull()
    expect(estimateManualLine({ graderPieces: 759, baaderCycles: 759 })).toBeNull()
  })

  it('ignora valores no numéricos', () => {
    expect(estimateManualLine({ graderPieces: NaN, baaderCycles: 759 })).toBeNull()
    expect(estimateManualLine({ graderPieces: 1533, baaderCycles: Infinity })).toBeNull()
  })

  it('el porcentaje se redondea a un decimal', () => {
    const r = estimateManualLine({ graderPieces: 3000, baaderCycles: 1000 })
    expect(r!.pctOfGrader).toBe(66.7)
  })
})
