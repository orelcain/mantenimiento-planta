import { describe, it, expect } from 'vitest'
import { pickUltimoSeteo, elegirSeteoInicial } from '../graderSeteoInicial'
import type { GateAssignment } from '../types'

const g = (n: number, calibre: string): GateAssignment => ({ gateNumber: n, assignedCalibre: calibre, assignedQuality: 'Premium', active: true })

describe('pickUltimoSeteo', () => {
  it('toma el seteo del turno más reciente que tenga uno', () => {
    const out = pickUltimoSeteo([
      { dateKey: '2026-09-06', shiftId: 'Turno 2', updatedAt: '2026-09-06T20:00:00Z', gatesUsed: [g(1, '2-4 lb')] },
      { dateKey: '2026-09-07', shiftId: 'Turno 1 Lunes', updatedAt: '2026-09-08T01:18:00Z', gatesUsed: [g(1, '8-10 lb')] },
      { dateKey: '2026-09-07', shiftId: 'Turno 2', updatedAt: '2026-09-07T18:00:00Z', gatesUsed: [] },
    ])
    expect(out).toEqual([g(1, '8-10 lb')])
  })

  it('con dos del mismo día gana el actualizado más tarde; sin ninguno devuelve null', () => {
    const out = pickUltimoSeteo([
      { dateKey: '2026-09-07', shiftId: 'A', updatedAt: '2026-09-07T10:00:00Z', gatesUsed: [g(1, '2-4 lb')] },
      { dateKey: '2026-09-07', shiftId: 'B', updatedAt: '2026-09-07T12:00:00Z', gatesUsed: [g(1, '4-6 lb')] },
    ])
    expect(out).toEqual([g(1, '4-6 lb')])
    expect(pickUltimoSeteo([{ dateKey: '2026-09-07', shiftId: 'A', updatedAt: '', gatesUsed: [] }])).toBeNull()
  })
})

describe('elegirSeteoInicial', () => {
  it('prefiere el último conocido al borrador del wizard, salvo que el usuario haya tocado las gates', () => {
    const wizard = [g(1, '2-4 lb')]
    const ultimo = [g(1, '8-10 lb')]
    expect(elegirSeteoInicial({ wizardGates: wizard, gatesEditadas: false, ultimoConocido: ultimo })).toEqual({ gates: ultimo, origen: 'ultimo-conocido' })
    expect(elegirSeteoInicial({ wizardGates: wizard, gatesEditadas: true, ultimoConocido: ultimo })).toEqual({ gates: wizard, origen: 'wizard' })
    expect(elegirSeteoInicial({ wizardGates: wizard, gatesEditadas: false, ultimoConocido: null })).toEqual({ gates: wizard, origen: 'wizard' })
  })
})
