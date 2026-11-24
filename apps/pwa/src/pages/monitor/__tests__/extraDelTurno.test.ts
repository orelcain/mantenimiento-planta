import { describe, expect, it } from 'vitest'
import { extraDelTurno } from '../cuantoLlevamosDatos'

describe('extraDelTurno (ritmo, P0 y cierre)', () => {
  const pz = Array.from({ length: 120 }, (_, m) => (m < 60 ? 20 : 40))
  it('ritmo de la última hora contra el promedio del turno', () => {
    const e = extraDelTurno(pz, 120, 480, true, 36)
    expect(e.ritmoHora).toBe(2400)
    expect(e.ritmoTurno).toBe(1800)
    expect(e.p0Pct).toBeCloseTo(1, 2)
  })
  it('proyecta al cierre al ritmo de la última hora y calla si el turno ya cerró', () => {
    const e = extraDelTurno(pz, 120, 480, true, 0)
    expect(e.faltanMin).toBe(360)
    expect(e.alCierre).toBe(3600 + 2400 * 6)
    expect(extraDelTurno(pz, 120, 120, false, 0).alCierre).toBeNull()
  })
  it('no proyecta con menos de 15 minutos de datos', () => {
    expect(extraDelTurno([30, 30, 30], 3, 480, true, 0).alCierre).toBeNull()
  })
  it('velocidad de máquina: solo minutos con producción; distinta de la de reloj si hubo pausas', () => {
    // 60 min: 30 produciendo a 40 pz/min y 30 parados.
    const con = Array.from({ length: 60 }, (_, m) => (m < 30 ? 40 : 0))
    const e = extraDelTurno(con, 60, 480, true, 0)
    expect(e.minActivos).toBe(30)
    expect(e.ritmoTurno).toBe(1200)
    expect(e.ritmoMaquina).toBe(2400)
    expect(e.ritmoMaquina).toBeGreaterThan(e.ritmoTurno)
  })
  it('sin pausas la de máquina iguala a la de reloj; sin minutos activos es 0', () => {
    const e = extraDelTurno(pz, 120, 480, true, 0)
    expect(e.ritmoMaquina).toBe(e.ritmoTurno)
    expect(extraDelTurno([0, 0, 0], 3, 480, true, 0).ritmoMaquina).toBe(0)
  })
  it('sin Gate 0 el P0 es null, no 0', () => {
    expect(extraDelTurno(pz, 120, 480, true, 0).p0Pct).toBeNull()
  })
})
