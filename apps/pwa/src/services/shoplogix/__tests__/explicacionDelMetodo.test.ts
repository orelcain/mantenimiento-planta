/**
 * El 26-08 a las 00:34, el monitor de Chonchi decía en dos líneas seguidas:
 *
 *   "Al ritmo de ahora, hasta las 05:00 el turno cierra en 8.496 pz (85%)."
 *   "Si se estira como los últimos turnos (≈05:25), 18.212 pz ±6,7%."
 *
 * Veinticinco minutos no explican 9.716 piezas. La diferencia era el método:
 * el pronóstico extrapolaba el ritmo de RELOJ sin descontar las colaciones
 * —de madrugada el convenio se lleva casi tres horas del turno— mientras la
 * proyección de arriba sí las descuenta. El rótulo le echaba la culpa al
 * horario.
 */
import { describe, it, expect } from 'vitest'
import { explicacionDelMetodo, fraccionTipicaAEstaAltura } from '../monitorForecast'
import type { HistoryShift } from '../monitorForecast'

/** Tres turnos que a los 180 min llevaban ~40% y cerraron en 10.000. */
const HISTORIA: HistoryShift[] = [1, 2, 3].map((n) => ({
  dateKey: `2026-08-2${n}`,
  shiftId: 'Turno 1',
  totalPieces: 10_000,
  curve: [
    { minutes: 0, pieces: 0 },
    { minutes: 180, pieces: 4_000 },
    { minutes: 480, pieces: 10_000 },
  ],
})) as unknown as HistoryShift[]

describe('fraccionTipicaAEstaAltura', () => {
  it('dice qué parte del total llevaban a esta altura', () => {
    expect(fraccionTipicaAEstaAltura(HISTORIA, 180)).toBeCloseTo(0.4, 2)
  })

  it('sin historia utilizable no inventa', () => {
    expect(fraccionTipicaAEstaAltura([], 180)).toBeNull()
  })
})

describe('explicacionDelMetodo', () => {
  it('proporcional: dice el porcentaje que llevaban', () => {
    expect(explicacionDelMetodo('proporcional', HISTORIA, 180))
      .toBe('a esta altura llevaban el 40% de su total')
  })

  it('aditivo: dice cuántas piezas sumaron después', () => {
    expect(explicacionDelMetodo('aditivo', HISTORIA, 180))
      .toContain('desde esta altura sumaron')
  })

  it('ritmo: avisa que NO descuenta colaciones — que es lo que lo dispara', () => {
    const texto = explicacionDelMetodo('ritmo', HISTORIA, 180)
    expect(texto).toContain('sin descontar colaciones')
  })

  it('ninguna explicación culpa al horario', () => {
    for (const m of ['proporcional', 'aditivo', 'ritmo'] as const) {
      expect(explicacionDelMetodo(m, HISTORIA, 180)).not.toMatch(/se estira/i)
    }
  })
})
