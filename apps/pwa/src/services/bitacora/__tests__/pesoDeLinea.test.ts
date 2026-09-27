import { describe, expect, it } from 'vitest'
import type { GrafoLineas } from '@/services/lineasProceso/modeloLineas'
import { perdidaDeLinea, respuestaPerdida } from '../pesoDeLinea'
import type { EquipoDelPeriodo } from '../historialBitacora'

/** Eviscerado: entrada → cinta (100 %) → tres BAADER en paralelo (1/3 cada una). */
const GRAFO: GrafoLineas = {
  version: 1,
  lineas: [{ id: 'evis', nombre: 'Eviscerado', zona: { x: 0, y: 0, w: 1000, h: 500 } }],
  nodos: [
    { id: 'in:evis', x: 0, y: 0 },
    { id: 'cinta', x: 100, y: 0 },
    { id: 'b1', x: 200, y: 0 },
    { id: 'b2', x: 200, y: 100 },
    { id: 'b3', x: 200, y: 200 },
    { id: 'suelto', x: 900, y: 400 },
  ],
  aristas: [
    ['in:evis', 'cinta'],
    ['cinta', 'b1'],
    ['cinta', 'b2'],
    ['cinta', 'b3'],
  ],
}

const equipo = (equipo: string, equipoId: string | null, minutos: number): EquipoDelPeriodo => ({
  equipo,
  equipoId,
  minutos,
  paradas: 1,
  fallas: 1,
  parte: 0,
  mtbfMin: null,
})

describe('de minutos de máquina a minutos de línea', () => {
  it('una BAADER de tres cuesta un tercio; la cinta en serie cuesta todo', () => {
    const p = perdidaDeLinea([equipo('BAADER 142 N1', 'b1', 30), equipo('CINTA ACELERACION', 'cinta', 20)], GRAFO)
    expect(p.equipos[0]).toMatchObject({ equipo: 'CINTA ACELERACION', minutosLinea: 20, cuota: 1 })
    expect(p.equipos[1]!.minutosLinea).toBeCloseTo(10)
    expect(p.minutosMaquina).toBe(50)
    expect(p.minutosLinea).toBeCloseTo(30)
    expect(p.porLinea).toEqual([{ linea: 'Eviscerado', minutos: 30, equipos: 2 }])
  })

  it('no inventa: sin equipoId, fuera de la línea o en un círculo quedan aparte, con su motivo', () => {
    const p = perdidaDeLinea([equipo('BOMBA A MANO', null, 15), equipo('SUELTO', 'suelto', 40), equipo('BAADER 142 N2', 'b2', 30)], GRAFO)
    expect(p.sinCuota).toEqual([
      { equipo: 'SUELTO', minutos: 40, motivo: 'fuera-de-linea' },
      { equipo: 'BOMBA A MANO', minutos: 15, motivo: 'sin-ubicar' },
    ])
    expect(p.minutosSinCuota).toBe(55)
    expect(p.minutosLinea).toBeCloseTo(10)
  })

  it('sin líneas guardadas, todo queda sin ubicar (nunca en cero disfrazado)', () => {
    const p = perdidaDeLinea([equipo('BAADER 142 N1', 'b1', 30)], null)
    expect(p.minutosLinea).toBe(0)
    expect(p.sinCuota).toEqual([{ equipo: 'BAADER 142 N1', minutos: 30, motivo: 'sin-ubicar' }])
  })

  it('la respuesta dice cuánto absorbió el paralelo, y cuál línea sufrió más', () => {
    const p = perdidaDeLinea([equipo('BAADER 142 N1', 'b1', 30), equipo('BAADER 142 N2', 'b2', 30)], GRAFO)
    const r = respuestaPerdida(p, (m) => `${Math.round(m)} min`)
    expect(r?.titulo).toBe('60 min de máquina detenida = 20 min de línea')
    expect(r?.detalle).toContain('absorbieron 40 min')
    expect(r?.detalle).toContain('Eviscerado')
  })

  it('sin equipos con cuota no hay respuesta que dar', () => {
    expect(respuestaPerdida(perdidaDeLinea([], GRAFO), (m) => `${m}`)).toBeNull()
  })
})
