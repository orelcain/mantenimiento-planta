/**
 * Orel, mirando el monitor con la línea en colación (26-08, 01:56):
 * «el que vale más es el ritmo real, ese debería estar en grande, para saber el
 * ritmo de cada Baader y el sumado de las 3, y también el promedio de las 3».
 *
 * El payload ya traía `piecesPerHour` por máquina; lo que faltaba era mostrarlo.
 */
import { describe, it, expect } from 'vitest'
import { ritmoPorMaquina, nombreCorto } from '../ritmoPorMaquina'

/** Las tres Baader de Planta Principal, una rezagada. */
const MAQUINAS = [
  { name: 'Evisceradora 1', piecesPerHour: 780, pieces: 2_600, status: 'Produciendo' },
  { name: 'Evisceradora 2', piecesPerHour: 810, pieces: 2_700, status: 'Produciendo' },
  { name: 'Evisceradora 3', piecesPerHour: 630, pieces: 2_100, status: 'Detenida' },
]

describe('ritmoPorMaquina', () => {
  it('da cada máquina, la suma y el promedio', () => {
    const r = ritmoPorMaquina(MAQUINAS)!
    expect(r.maquinas.map((m) => Number(m.cpm.toFixed(1)))).toEqual([13, 13.5, 10.5])
    expect(r.suma).toBeCloseTo(37, 1)
    expect(r.promedio).toBeCloseTo(12.3, 1)
  })

  it('la suma es lo que da la línea, no el promedio — no confundirlos', () => {
    const r = ritmoPorMaquina(MAQUINAS)!
    expect(r.suma).toBeCloseTo(r.promedio * 3, 5)
  })

  it('marca cuál está detenida', () => {
    const r = ritmoPorMaquina(MAQUINAS)!
    expect(r.maquinas.map((m) => m.detenida)).toEqual([false, false, true])
  })

  it('ignora máquinas sin ritmo publicado en vez de contarlas como 0', () => {
    const r = ritmoPorMaquina([...MAQUINAS, { name: 'Ev 4', piecesPerHour: null }])!
    expect(r.maquinas).toHaveLength(3)
    expect(r.promedio).toBeCloseTo(12.3, 1)
  })

  it('sin máquinas utilizables no inventa', () => {
    expect(ritmoPorMaquina([])).toBeNull()
    expect(ritmoPorMaquina(null)).toBeNull()
    expect(ritmoPorMaquina([{ name: 'x', piecesPerHour: null }])).toBeNull()
  })

  it('una máquina sin nombre igual se puede mirar', () => {
    expect(ritmoPorMaquina([{ piecesPerHour: 600 }])!.maquinas[0]!.nombre).toBe('Máquina 1')
  })
})

describe('nombreCorto', () => {
  it('las tres entran en una línea a 375 px', () => {
    expect(nombreCorto('Evisceradora 2')).toBe('Ev 2')
    expect(nombreCorto('Baader 200')).toBe('Ba 200')
  })

  it('un nombre sin número no se destroza', () => {
    expect(nombreCorto('Grader')).toBe('Grader')
  })
})
