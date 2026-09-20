import { describe, expect, it } from 'vitest'
import { ACOMODO, MARGEN_ZONA, NODO, acomodarEnCapas, type GrafoLineas } from '../modeloLineas'

const ZONA = { x: 100, y: 200, w: 2000, h: 800 }
const paso = NODO.ancho + ACOMODO.entreCapas
const x0 = ZONA.x + MARGEN_ZONA.lado
const y0 = ZONA.y + MARGEN_ZONA.arriba

const grafo = (nodos: { id: string; x: number; y: number }[], aristas: [string, string][]): Pick<GrafoLineas, 'lineas' | 'nodos' | 'aristas'> => ({
  lineas: [{ id: 'ev', nombre: 'Eviscerado', zona: ZONA }],
  nodos: nodos.map((n) => ({ ...n, zona: 'ev' })),
  aristas,
})

const en = (r: { id: string; x: number; y: number }[], id: string) => r.find((a) => a.id === id)

describe('acomodarEnCapas', () => {
  it('en serie, cada equipo va una capa a la derecha del anterior', () => {
    const r = acomodarEnCapas(
      grafo(
        [
          { id: 'a', x: 900, y: 700 },
          { id: 'b', x: 150, y: 300 },
          { id: 'c', x: 500, y: 900 },
        ],
        [
          ['a', 'b'],
          ['b', 'c'],
        ],
      ),
      'ev',
    )
    expect(en(r, 'a')).toEqual({ id: 'a', x: x0, y: y0 })
    expect(en(r, 'b')).toEqual({ id: 'b', x: x0 + paso, y: y0 })
    expect(en(r, 'c')).toEqual({ id: 'c', x: x0 + paso * 2, y: y0 })
  })

  it('las ramas en paralelo se apilan en la misma capa, en el orden que ya tenían', () => {
    const r = acomodarEnCapas(
      grafo(
        [
          { id: 'cinta', x: 0, y: 0 },
          { id: 'b2', x: 0, y: 500 },
          { id: 'b1', x: 0, y: 100 },
        ],
        [
          ['cinta', 'b1'],
          ['cinta', 'b2'],
        ],
      ),
      'ev',
    )
    expect(en(r, 'b1')!.x).toBe(x0 + paso)
    expect(en(r, 'b2')!.x).toBe(x0 + paso)
    // b1 estaba más arriba que b2 y así queda.
    expect(en(r, 'b1')!.y).toBeLessThan(en(r, 'b2')!.y)
  })

  it('el que se junta de nuevo queda a la derecha de TODAS sus ramas (camino más largo)', () => {
    const r = acomodarEnCapas(
      grafo(
        [
          { id: 'a', x: 0, y: 0 },
          { id: 'corto', x: 0, y: 100 },
          { id: 'largo1', x: 0, y: 200 },
          { id: 'largo2', x: 0, y: 300 },
          { id: 'fin', x: 0, y: 400 },
        ],
        [
          ['a', 'corto'],
          ['a', 'largo1'],
          ['largo1', 'largo2'],
          ['corto', 'fin'],
          ['largo2', 'fin'],
        ],
      ),
      'ev',
    )
    expect(en(r, 'fin')!.x).toBe(x0 + paso * 3)
    expect(en(r, 'fin')!.x).toBeGreaterThan(en(r, 'largo2')!.x)
  })

  it('lo que no cuelga del flujo va abajo, fuera de la cadena', () => {
    const r = acomodarEnCapas(
      grafo(
        [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 0, y: 50 },
          { id: 'suelto', x: 0, y: 900 },
        ],
        [['a', 'b']],
      ),
      'ev',
    )
    expect(en(r, 'suelto')!.y).toBeGreaterThan(en(r, 'b')!.y)
    expect(en(r, 'suelto')!.x).toBe(x0)
  })

  it('un contenedor vacío o inexistente no devuelve nada', () => {
    expect(acomodarEnCapas(grafo([], []), 'ev')).toEqual([])
    expect(acomodarEnCapas(grafo([{ id: 'a', x: 0, y: 0 }], []), 'otra')).toEqual([])
  })

  it('no se cuelga con un círculo y lo deja fuera de la cadena', () => {
    const r = acomodarEnCapas(
      grafo(
        [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 0, y: 100 },
        ],
        [
          ['a', 'b'],
          ['b', 'a'],
        ],
      ),
      'ev',
    )
    expect(r).toHaveLength(2)
  })
})
