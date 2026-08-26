/**
 * Medido en el monitor de Eviscerado de Planta Principal, noche del 25 al
 * 26-08: el «objetivo Shoplogix» del MISMO turno subió de 15.821 a 20.875
 * mientras el turno corría. La meta se movía debajo de los pies del operador.
 */
import { describe, it, expect } from 'vitest'
import { objetivoDelTurno } from '../objetivoDelTurno'

/** Los tres turnos cerrados que medí en Firestore. */
const CERRADOS = [{ expected: 21_274 }, { expected: 21_130 }, { expected: 20_714 }]

describe('objetivoDelTurno', () => {
  it('la mediana de los turnos cerrados, no el acumulado en curso', () => {
    const o = objetivoDelTurno(15_821, CERRADOS)!
    expect(o.piezas).toBe(21_130)
    expect(o.origen).toBe('historia')
    expect(o.turnos).toBe(3)
  })

  it('⚠ no se mueve cuando el acumulado del turno en curso sube', () => {
    // Las cuatro lecturas reales de la misma noche.
    const metas = [15_821, 20_287, 20_807, 20_875]
      .map((e) => objetivoDelTurno(e, CERRADOS)!.piezas)
    expect(new Set(metas).size).toBe(1)
  })

  it('la mediana aguanta un turno raro sin arrastrarse', () => {
    // Un turno corto y flojo no puede bajar la meta de los demás.
    const o = objetivoDelTurno(null, [...CERRADOS, { expected: 4_000 }])!
    expect(o.piezas).toBe(20_922)   // mediana de 4.000/20.714/21.130/21.274
    expect(o.piezas).toBeGreaterThan(20_000)
  })

  it('ignora los turnos sin el dato en vez de contarlos como 0', () => {
    const o = objetivoDelTurno(null, [{ expected: null }, { expected: 0 }, { expected: 21_130 }])!
    expect(o.piezas).toBe(21_130)
    expect(o.turnos).toBe(1)
  })

  it('sin historia usa el acumulado en curso, pero lo deja marcado', () => {
    const o = objetivoDelTurno(15_821, [])!
    expect(o.piezas).toBe(15_821)
    expect(o.origen).toBe('en-curso')
    expect(o.turnos).toBe(0)
  })

  it('sin nada no inventa una meta', () => {
    expect(objetivoDelTurno(null, [])).toBeNull()
    expect(objetivoDelTurno(0, [{ expected: 0 }])).toBeNull()
  })
})
