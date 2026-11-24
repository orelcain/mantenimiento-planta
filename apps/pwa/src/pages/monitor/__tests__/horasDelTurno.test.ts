import { describe, expect, it } from 'vitest'
import { extremosHoras, horasDelTurno } from '../cuantoLlevamosDatos'

describe('horasDelTurno', () => {
  it('agrupa por hora corrida y marca la última parcial', () => {
    const pz = [...Array(60).fill(10), ...Array(60).fill(20), ...Array(30).fill(40)]
    const h = horasDelTurno(pz, 150)
    expect(h.map((x) => x.pz)).toEqual([600, 1200, 1200])
    expect(h[2]).toMatchObject({ n: 3, desdeMin: 120, minutos: 30, parcial: true, ritmo: 2400 })
    expect(h[0]!.parcial).toBe(false)
  })
  it('cuenta minutos activos y tolera huecos', () => {
    const h = horasDelTurno([5, 0, undefined as unknown as number, 5], 4)
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ pz: 10, activos: 2, minutos: 4 })
  })
  it('sin minutos no hay horas', () => expect(horasDelTurno([], 0)).toEqual([]))
})

describe('extremosHoras', () => {
  it('ignora la hora parcial', () => {
    const h = horasDelTurno([...Array(60).fill(10), ...Array(60).fill(30), ...Array(10).fill(1)], 130)
    const e = extremosHoras(h)!
    expect(e.mejor.n).toBe(2)
    expect(e.peor.n).toBe(1)
  })
  it('null con menos de dos horas completas', () => {
    expect(extremosHoras(horasDelTurno(Array(90).fill(10), 90))).toBeNull()
  })
})
