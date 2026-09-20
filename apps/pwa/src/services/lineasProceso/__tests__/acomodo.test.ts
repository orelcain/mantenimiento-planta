import { describe, expect, it } from 'vitest'
import { ACOMODO, ENTRE_CONTENEDORES, MARGEN_ZONA, NODO, PREFIJO_GRUPO, acomodarEnCapas, acomodarPlanta, type GrafoLineas } from '../modeloLineas'

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

  it('un grupo ocupa UNA sola capa: sus miembros se apilan ahí', () => {
    const base = grafo(
      [
        { id: 'ducto', x: 0, y: 0 },
        { id: 'tachoA', x: 0, y: 100 },
        { id: 'tachoB', x: 0, y: 200 },
        { id: 'hidroforo', x: 0, y: 300 },
      ],
      [
        ['ducto', `${PREFIJO_GRUPO}tachos`],
        [`${PREFIJO_GRUPO}tachos`, 'hidroforo'],
      ],
    )
    const r = acomodarEnCapas({ ...base, grupos: [{ id: 'tachos', miembros: ['tachoA', 'tachoB'] }] }, 'ev')
    // Los dos tachos comparten columna, y el hidróforo va a la siguiente.
    expect(en(r, 'tachoA')!.x).toBe(en(r, 'tachoB')!.x)
    expect(en(r, 'tachoA')!.x).toBe(x0 + paso)
    expect(en(r, 'hidroforo')!.x).toBe(x0 + paso * 2)
    expect(en(r, 'tachoA')!.y).toBeLessThan(en(r, 'tachoB')!.y)
  })

  it('un habilitador va DEBAJO de lo que habilita, en su misma columna', () => {
    const base = grafo(
      [
        { id: 'ducto', x: 0, y: 0 },
        { id: 'hidroforo', x: 0, y: 100 },
        { id: 'compresor', x: 900, y: 900 },
      ],
      [['ducto', 'hidroforo']],
    )
    const r = acomodarEnCapas({ ...base, habilitan: [['compresor', 'hidroforo']] }, 'ev')
    expect(en(r, 'compresor')!.x).toBe(en(r, 'hidroforo')!.x)
    expect(en(r, 'compresor')!.y).toBeGreaterThan(en(r, 'hidroforo')!.y)
  })

  it('dos habilitadores de lo mismo se apilan, no se enciman', () => {
    const base = grafo(
      [
        { id: 'ducto', x: 0, y: 0 },
        { id: 'hidroforo', x: 0, y: 100 },
        { id: 'compresor', x: 900, y: 900 },
        { id: 'tablero', x: 900, y: 950 },
      ],
      [['ducto', 'hidroforo']],
    )
    const r = acomodarEnCapas({ ...base, habilitan: [['compresor', 'hidroforo'], ['tablero', 'hidroforo']] }, 'ev')
    expect(en(r, 'compresor')!.x).toBe(en(r, 'tablero')!.x)
    expect(en(r, 'compresor')!.y).not.toBe(en(r, 'tablero')!.y)
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

describe('acomodarPlanta', () => {
  const planta = (): Pick<GrafoLineas, 'lineas' | 'nodos' | 'aristas'> => ({
    lineas: [
      // A propósito encimadas y en desorden: es el caso que hay que arreglar.
      { id: 'evis', nombre: 'Eviscerado', zona: { x: 400, y: 0, w: 600, h: 400 } },
      { id: 'acopio', nombre: 'Acopio', zona: { x: 0, y: 0, w: 900, h: 400 } },
      { id: 'apoyo', nombre: 'Servicios', tipo: 'apoyo', zona: { x: 200, y: 100, w: 500, h: 200 } },
    ],
    nodos: [
      { id: 'a1', x: 10, y: 10, zona: 'acopio' },
      { id: 'a2', x: 20, y: 20, zona: 'acopio' },
      { id: 'e1', x: 30, y: 30, zona: 'evis' },
      { id: 'e2', x: 40, y: 40, zona: 'evis' },
      { id: 's1', x: 50, y: 50, zona: 'apoyo' },
    ],
    aristas: [
      ['a1', 'a2'],
      ['e1', 'e2'],
    ],
  })

  it('pone los contenedores en fila, sin pisarse y en el orden que ya tenían', () => {
    const { zonas } = acomodarPlanta(planta())
    const acopio = zonas.find((z) => z.id === 'acopio')!.zona
    const evis = zonas.find((z) => z.id === 'evis')!.zona
    // Acopio estaba a la izquierda (x=0) y sigue primero.
    expect(acopio.x).toBe(0)
    expect(evis.x).toBe(acopio.x + acopio.w + ENTRE_CONTENEDORES)
    // Y no se solapan.
    expect(evis.x).toBeGreaterThanOrEqual(acopio.x + acopio.w)
  })

  it('las zonas de apoyo quedan DEBAJO de las líneas', () => {
    const { zonas } = acomodarPlanta(planta())
    const apoyo = zonas.find((z) => z.id === 'apoyo')!.zona
    const lineas = zonas.filter((z) => z.id !== 'apoyo').map((z) => z.zona)
    expect(apoyo.y).toBeGreaterThan(Math.max(...lineas.map((l) => l.y + l.h)) - 1)
  })

  it('cada equipo queda dentro de la caja de su contenedor', () => {
    const { nodos, zonas } = acomodarPlanta(planta())
    const de = { a1: 'acopio', a2: 'acopio', e1: 'evis', e2: 'evis', s1: 'apoyo' }
    for (const n of nodos) {
      const z = zonas.find((x) => x.id === de[n.id as keyof typeof de])!.zona
      expect(n.x).toBeGreaterThanOrEqual(z.x)
      expect(n.x + NODO.ancho).toBeLessThanOrEqual(z.x + z.w)
      expect(n.y).toBeGreaterThanOrEqual(z.y)
      expect(n.y + NODO.alto).toBeLessThanOrEqual(z.y + z.h)
    }
  })
})
