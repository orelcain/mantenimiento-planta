/**
 * Orel (26-08): «el estimado no debe considerar la colación; por si acaso, ese
 * tiempo de colación es el tiempo planificado FUERA de proceso».
 *
 * El pronóstico por ritmo extrapolaba minutos de RELOJ. De madrugada el
 * convenio se lleva casi tres horas del turno, así que repartía las piezas
 * producidas sobre un tiempo en que la línea estaba apagada y después las
 * proyectaba sobre otro tanto de línea apagada: el número salía bajo por
 * ambos lados.
 */
import { describe, it, expect } from 'vitest'
import { PREDICTORES } from '../monitorForecast'
import type { HistoryShift } from '../monitorForecast'

/** Turnos de 480 min, para que la duración mediana sea esa. */
const HISTORIA: HistoryShift[] = [1, 2, 3].map((n) => ({
  dateKey: `2026-08-2${n}`,
  shiftId: 'Turno 2',
  totalPieces: 12_000,
  curve: [{ minutes: 0, pieces: 0 }, { minutes: 480, pieces: 12_000 }],
})) as unknown as HistoryShift[]

const ritmo = PREDICTORES.ritmo

describe('pronóstico por ritmo, con el convenio fuera', () => {
  it('sin convenio se comporta como antes: 6.000 en 240 min → 12.000', () => {
    expect(ritmo(6_000, 240, HISTORIA, null)).toBeCloseTo(12_000, 0)
  })

  it('descuenta la colación ya transcurrida: las piezas salieron en menos tiempo', () => {
    // 6.000 piezas en 240 min de reloj, de los cuales 60 fueron colación:
    // el ritmo real es 6.000/180 = 33,3 pz/min.
    const conColacion = ritmo(6_000, 240, HISTORIA, { transcurridoMin: 60, porDelanteMin: 0 })!
    expect(conColacion).toBeCloseTo(6_000 + (6_000 / 180) * 240, 0)
    expect(conColacion).toBeGreaterThan(ritmo(6_000, 240, HISTORIA, null)!)
  })

  it('descuenta la colación que falta: ese tiempo no produce', () => {
    // Quedan 240 min de reloj pero 60 son colación → solo 180 productivos.
    const r = ritmo(6_000, 240, HISTORIA, { transcurridoMin: 0, porDelanteMin: 60 })!
    expect(r).toBeCloseTo(6_000 + 25 * 180, 0)
    expect(r).toBeLessThan(ritmo(6_000, 240, HISTORIA, null)!)
  })

  it('los dos descuentos juntos se compensan cuando la colación es simétrica', () => {
    const r = ritmo(6_000, 240, HISTORIA, { transcurridoMin: 60, porDelanteMin: 60 })!
    // 33,3 pz/min sobre 180 min productivos que faltan.
    expect(r).toBeCloseTo(12_000, 0)
  })

  it('nunca proyecta tiempo negativo si el convenio se pasa de lo que falta', () => {
    const r = ritmo(6_000, 240, HISTORIA, { transcurridoMin: 60, porDelanteMin: 999 })!
    expect(r).toBe(6_000)
  })

  it('un convenio que se comiera todo el turno no divide por cero', () => {
    expect(ritmo(6_000, 240, HISTORIA, { transcurridoMin: 240, porDelanteMin: 0 }))
      .not.toBe(Infinity)
  })
})
