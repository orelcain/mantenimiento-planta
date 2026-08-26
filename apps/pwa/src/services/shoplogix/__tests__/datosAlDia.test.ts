/**
 * Turno 2 del 26-08: cerraba 15:00, el último tramo con datos era el de las
 * 15:10 y a las 15:35 el monitor seguía mostrando «34,1 pz/min andando ·
 * últimos 15 min · a ritmo».
 */
import { describe, it, expect } from 'vitest'
import { frescuraDelRitmo } from '../datosAlDia'

const wall = (iso: string) => Date.parse(iso)
const CORTE = wall('2026-08-26T15:10:00Z')

describe('frescuraDelRitmo', () => {
  it('OJO: a los 25 minutos sin dato, el ritmo ya no es «de ahora»', () => {
    const f = frescuraDelRitmo(CORTE, wall('2026-08-26T15:35:00Z'))!
    expect(f.viejo).toBe(true)
    expect(Math.round(f.haceMin)).toBe(25)
  })

  it('un hueco de un tramo es normal: la serie viene de a 5 min', () => {
    expect(frescuraDelRitmo(CORTE, wall('2026-08-26T15:16:00Z'))!.viejo).toBe(false)
    expect(frescuraDelRitmo(CORTE, wall('2026-08-26T15:11:00Z'))!.viejo).toBe(false)
  })

  it('dos tramos sin dato ya no', () => {
    expect(frescuraDelRitmo(CORTE, wall('2026-08-26T15:22:00Z'))!.viejo).toBe(true)
  })

  it('un corte en el futuro es desfase de relojes, no dato fresco', () => {
    const f = frescuraDelRitmo(CORTE, wall('2026-08-26T15:05:00Z'))!
    expect(f.viejo).toBe(false)
    expect(f.haceMin).toBe(0)
  })

  it('sin corte o sin reloj no se inventa un juicio', () => {
    expect(frescuraDelRitmo(null, wall('2026-08-26T15:35:00Z'))).toBeNull()
    expect(frescuraDelRitmo(CORTE, null)).toBeNull()
    expect(frescuraDelRitmo(Number.NaN, 1)).toBeNull()
  })
})
