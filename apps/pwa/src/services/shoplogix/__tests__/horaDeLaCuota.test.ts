/**
 * Turno del 25-08 de noche, cerrado a las 05:00. A las 05:11 el monitor decía
 * «Van 13.871 de las 21.104 que tocaban a las 05:11».
 */
import { describe, it, expect } from 'vitest'
import { horaDeLaCuota } from '../horaDeLaCuota'

const CIERRE = '2026-08-26T05:00:00.000Z'
const wall = (iso: string) => Date.parse(iso)

describe('horaDeLaCuota', () => {
  it('mientras el turno corre, es la hora de ahora', () => {
    expect(horaDeLaCuota(CIERRE, wall('2026-08-26T03:07:00Z'))).toBe('03:07')
  })

  it('⚠ pasado el cierre se topa: 05:00, no 05:11', () => {
    expect(horaDeLaCuota(CIERRE, wall('2026-08-26T05:11:00Z'))).toBe('05:00')
    // Y tres horas después sigue diciendo lo mismo.
    expect(horaDeLaCuota(CIERRE, wall('2026-08-26T08:30:00Z'))).toBe('05:00')
  })

  it('justo en el minuto del cierre no se adelanta', () => {
    expect(horaDeLaCuota(CIERRE, wall('2026-08-26T05:00:00Z'))).toBe('05:00')
  })

  it('sin hora de cierre conocida sigue el reloj', () => {
    expect(horaDeLaCuota(null, wall('2026-08-26T05:11:00Z'))).toBe('05:11')
    expect(horaDeLaCuota('no es una fecha', wall('2026-08-26T05:11:00Z'))).toBe('05:11')
  })

  it('rellena con cero a la izquierda', () => {
    expect(horaDeLaCuota(null, wall('2026-08-26T09:05:00Z'))).toBe('09:05')
    expect(horaDeLaCuota(null, wall('2026-08-26T00:00:00Z'))).toBe('00:00')
  })
})
