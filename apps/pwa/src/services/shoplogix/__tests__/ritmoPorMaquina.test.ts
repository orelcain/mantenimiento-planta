/**
 * Las tres Baader del Turno 2 del 26-08 en Eviscerado de Planta Principal, tal
 * como las publicaba el backend (ventana del turno: 420 min).
 *
 * En pantalla se leían 9,0 · 12,2 · 11,3 — como si la Ev 1 fuera un 35% más
 * lenta. No lo es: anda igual que las otras y para más.
 */
import { describe, it, expect } from 'vitest'
import { ritmoPorMaquina, nombreCorto } from '../ritmoPorMaquina'

const VENTANA_MIN = 420

const MAQUINAS = [
  { name: 'Evisceradora 1', pieces: 3791, piecesPerHour: 541.57, uptimePct: 62.07, status: 'produciendo' },
  { name: 'Evisceradora 2', pieces: 5144, piecesPerHour: 734.86, uptimePct: 81.63, status: 'produciendo' },
  { name: 'Evisceradora 3', pieces: 4754, piecesPerHour: 679.14, uptimePct: 77.24, status: 'produciendo' },
]

describe('ritmoPorMaquina', () => {
  it('OJO: el ritmo es el de cuando ANDA, no el repartido sobre el turno', () => {
    const r = ritmoPorMaquina(MAQUINAS, VENTANA_MIN)!
    const cpm = r.maquinas.map((m) => Number(m.cpm.toFixed(1)))
    expect(cpm).toEqual([14.5, 15.0, 14.7])
    // Lo que mostraba antes, para que quede escrito de qué se sale:
    expect(541.57 / 60).toBeCloseTo(9.0, 1)
  })

  it('OJO: y así se ve que las tres andan igual — la Ev 1 no es más lenta', () => {
    const r = ritmoPorMaquina(MAQUINAS, VENTANA_MIN)!
    expect(r.parejas).toBe(true)
    expect(r.promedio).toBeCloseTo(14.7, 1)
  })

  it('cada máquina lleva su uptime: es lo que explica la diferencia', () => {
    const r = ritmoPorMaquina(MAQUINAS, VENTANA_MIN)!
    expect(r.maquinas.map((m) => Math.round(m.uptimePct!))).toEqual([62, 82, 77])
  })

  it('una máquina de verdad más lenta SÍ se marca como despareja', () => {
    const r = ritmoPorMaquina([
      { ...MAQUINAS[0]!, pieces: 2500 },   // mismo uptime, menos piezas
      MAQUINAS[1]!, MAQUINAS[2]!,
    ], VENTANA_MIN)!
    expect(r.parejas).toBe(false)
  })

  it('sin uptime o sin ventana cae al ritmo sobre el turno, sin inventar', () => {
    const sinPct = ritmoPorMaquina(MAQUINAS.map(({ uptimePct: _u, ...m }) => m), VENTANA_MIN)!
    expect(sinPct.maquinas[0]!.cpm).toBeCloseTo(9.0, 1)
    expect(ritmoPorMaquina(MAQUINAS, null)!.maquinas[0]!.cpm).toBeCloseTo(9.0, 1)
  })

  it('marca cuál está detenida', () => {
    const r = ritmoPorMaquina([...MAQUINAS.slice(0, 2), { ...MAQUINAS[2]!, status: 'Detenida' }], VENTANA_MIN)!
    expect(r.maquinas.map((m) => m.detenida)).toEqual([false, false, true])
  })

  it('ignora la máquina sin ritmo publicado en vez de contarla como 0', () => {
    const r = ritmoPorMaquina([...MAQUINAS, { name: 'Ev 4', piecesPerHour: null }], VENTANA_MIN)!
    expect(r.maquinas).toHaveLength(3)
  })

  it('sin máquinas utilizables no inventa', () => {
    expect(ritmoPorMaquina([], VENTANA_MIN)).toBeNull()
    expect(ritmoPorMaquina(null, VENTANA_MIN)).toBeNull()
    expect(ritmoPorMaquina([{ name: 'x', piecesPerHour: null }], VENTANA_MIN)).toBeNull()
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
