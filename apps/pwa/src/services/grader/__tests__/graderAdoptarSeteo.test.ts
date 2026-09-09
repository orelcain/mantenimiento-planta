import { describe, it, expect } from 'vitest'
import { puertasAdoptadas, reescribirEnTodos } from '../graderAdoptarSeteo'
import type { GateAssignment } from '../types'
import type { GateConfigSnapshot } from '../graderConfigSnapshot.service'

const gate = (n: number, calibre: string, quality: GateAssignment['assignedQuality'], active = true): GateAssignment =>
  ({ gateNumber: n, assignedCalibre: calibre, assignedQuality: quality, active })
const snap = (id: string, gates: GateAssignment[], changes = 0): GateConfigSnapshot =>
  ({ id, shiftDocId: 'x', at: `2026-09-08T0${id}:00:00.000Z`, changedBy: { uid: 'u', name: 'u' }, gates, changes: Array.from({ length: changes }, () => ({ gateNumber: 10, field: 'assignedCalibre', before: 'a', after: 'b' })) as never })

describe('adoptar seteo en turno cerrado · G1 y G12 del 2026-09-07 T1', () => {
  const base = [gate(1, '2-4 lb', 'Grado'), gate(10, '8-10 lb', 'Premium'), gate(12, '10-12 lb', 'D')]
  const nuevas = [gate(1, '2-4 lb', 'Industrial'), gate(10, '8-10 lb', 'Premium'), gate(12, '12-UP lb', 'Premium')]

  it('detecta solo las puertas que cambian', () => {
    const a = puertasAdoptadas(base, nuevas)
    expect([...a.keys()]).toEqual([1, 12])
    expect(a.get(12)).toMatchObject({ assignedCalibre: '12-UP lb', assignedQuality: 'Premium' })
  })

  it('reescribe esas puertas en TODOS los snapshots sin tocar las demás ni los cambios a mano', () => {
    const snaps = [
      snap('2', [gate(1, '2-4 lb', 'Grado'), gate(10, '10-12 lb', 'Premium'), gate(12, '10-12 lb', 'D')]),
      snap('3', [gate(1, '2-4 lb', 'Grado'), gate(10, '8-10 lb', 'Premium'), gate(12, '10-12 lb', 'D')], 1),
    ]
    const out = reescribirEnTodos(snaps, puertasAdoptadas(base, nuevas))
    expect(out.every((o) => o.cambio)).toBe(true)
    expect(out[0]!.gates.find((g) => g.gateNumber === 10)?.assignedCalibre).toBe('10-12 lb')
    expect(out[0]!.gates.find((g) => g.gateNumber === 12)?.assignedCalibre).toBe('12-UP lb')
    expect(out[1]!.gates.find((g) => g.gateNumber === 1)?.assignedQuality).toBe('Industrial')
  })

  it('sin cambios no marca nada; una puerta ausente en el snapshot se agrega', () => {
    expect(reescribirEnTodos([snap('2', base)], puertasAdoptadas(base, base))[0]!.cambio).toBe(false)
    const out = reescribirEnTodos([snap('2', [gate(10, '8-10 lb', 'Premium')])], puertasAdoptadas(base, nuevas))
    expect(out[0]!.gates.map((g) => g.gateNumber).sort((a, b) => a - b)).toEqual([1, 10, 12])
  })
})
