/** El aviso de cambio de programa de una gate en «Pide atención» (E-F), con el 19-11 Turno 2 real. */
import { describe, expect, it } from 'vitest'
import { armarPesca } from '../graderVivoDatos'
import { piezasHasta, turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'

const d = turnoReal('2026-11-19-turno_2')
const fin = d.t0Ms + 8 * 60 * 60_000
const a = (h: string) => {
  const ms = Date.parse(`2026-11-19T${h}:00Z`)
  return armarPesca(piezasHasta(d, ms), d.t0Ms, fin, null, null, ms)!
}

describe('aviso gate-cambio', () => {
  it('11:30: G6 cambió a 12-UP (sin confirmar) y lo avisa', () => {
    const av = a('11:30').avisos.filter((x) => x.regla === 'gate-cambio')
    expect(av.map((x) => x.titulo)).toEqual(['10:44 · G6 cambió a 12-UP lb · Premium (sin confirmar)'])
    expect(av[0]!.nivel).toBe('atento')
  })

  it('12:30: pasó más de una hora, ya no se avisa pero queda en «Cambios del turno»', () => {
    const p = a('12:30')
    expect(p.avisos.some((x) => x.regla === 'gate-cambio')).toBe(false)
    expect(p.seteo!.cambios).toHaveLength(1)
  })

  it('09:00: sin cambios, sin aviso', () => {
    expect(a('09:00').avisos.some((x) => x.regla === 'gate-cambio')).toBe(false)
  })
})
