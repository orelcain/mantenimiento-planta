import { describe, it, expect } from 'vitest'
import { horaPlanta } from '../horaPlanta'

/**
 * A las 06:51 de planta, el monitor decía "Últimos 15 min · hasta las 02:50"
 * en cualquier teléfono de Chile: el tramo cerraba a las 06:50 wall-clock y se
 * formateaba con el huso del que miraba (−4 h).
 */
describe('horaPlanta', () => {
  it('lee el instante como hora de planta, sin restar el huso', () => {
    expect(horaPlanta(Date.parse('2026-08-24T06:50:00.000Z'))).toBe('06:50')
  })

  it('no se mueve con el huso del que mira', () => {
    // El test corre con el TZ de la máquina; el resultado no puede depender de él.
    const ms = Date.parse('2026-08-24T00:05:00.000Z')
    expect(horaPlanta(ms)).toBe('00:05')
  })

  it('sin dato, no inventa una hora', () => {
    expect(horaPlanta(null)).toBeNull()
    expect(horaPlanta(Number.NaN)).toBeNull()
  })
})
