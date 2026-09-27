import { describe, expect, it } from 'vitest'
import { MARGEN_ZONA, NODO, formatoPeso, limitesDeZonas, lineaEnPunto, pesosPorLinea, relacionesDeServicios, serviciosDe, zonaDeNodo, type GrafoLineas } from '../modeloLineas'
import { LINEAS_CHONCHI, propuestaChonchi } from '../propuestaChonchi'

const L = [
  { id: 'evis', nombre: 'Eviscerado', zona: { x: 0, y: 0, w: 1000, h: 500 } },
  { id: 'emp', nombre: 'Empaque', zona: { x: 1000, y: 0, w: 1000, h: 500 } },
]
const grafo = (nodos: string[], aristas: [string, string][]): GrafoLineas => ({
  version: 1,
  lineas: L,
  nodos: nodos.map((id) => ({ id, x: 0, y: 0 })),
  aristas,
})

describe('peso de cada máquina en su línea (flujo)', () => {
  it('en serie, todo el flujo pasa por cada máquina: 100 %', () => {
    const p = pesosPorLinea(grafo(['in:evis', 'des', 'cinta'], [['in:evis', 'des'], ['des', 'cinta']]))
    expect(p.get('des')).toEqual({ lineaId: 'evis', peso: 1 })
    expect(p.get('cinta')?.peso).toBe(1)
  })

  it('3 Baader en paralelo: 33,3 % cada una, y al juntarse vuelve a 100 %', () => {
    const p = pesosPorLinea(
      grafo(['in:evis', 'cco', 'b1', 'b2', 'b3', 'cts'], [['in:evis', 'cco'], ['cco', 'b1'], ['cco', 'b2'], ['cco', 'b3'], ['b1', 'cts'], ['b2', 'cts'], ['b3', 'cts']]),
    )
    expect(p.get('b2')?.peso).toBeCloseTo(1 / 3)
    expect(p.get('cts')?.peso).toBeCloseTo(1)
    expect(formatoPeso(p.get('b1')!.peso)).toBe('33,3 %')
  })

  it('lo no conectado desde la entrada queda fuera (sin peso)', () => {
    const p = pesosPorLinea(grafo(['in:evis', 'des', 'cortina'], [['in:evis', 'des']]))
    expect(p.has('cortina')).toBe(false)
  })

  it('la flecha a la entrada de otra línea corta el cálculo', () => {
    const p = pesosPorLinea(grafo(['in:evis', 'cec', 'in:emp', 'grader'], [['in:evis', 'cec'], ['cec', 'in:emp'], ['in:emp', 'grader']]))
    expect(p.get('cec')?.lineaId).toBe('evis')
    expect(p.get('grader')).toEqual({ lineaId: 'emp', peso: 1 })
  })

  it('un ciclo no inventa flujo: sus máquinas quedan en 0', () => {
    const p = pesosPorLinea(grafo(['in:evis', 'a', 'b'], [['in:evis', 'a'], ['a', 'b'], ['b', 'a']]))
    expect(p.get('a')?.peso).toBe(0)
    expect(p.get('b')?.peso).toBe(0)
  })

  it('flechas repetidas o hacia sí misma no cuentan', () => {
    const p = pesosPorLinea(grafo(['in:evis', 'a', 'b'], [['in:evis', 'a'], ['in:evis', 'a'], ['a', 'a'], ['a', 'b']]))
    expect(p.get('a')?.peso).toBe(1)
    expect(p.get('b')?.peso).toBe(1)
  })

  it('dice en qué zona de línea cae un punto', () => {
    expect(lineaEnPunto(L, 1200, 10)?.nombre).toBe('Empaque')
    expect(lineaEnPunto(L, 5000, 10)).toBeUndefined()
  })
})

describe('servicios de apoyo (influyen indirectamente)', () => {
  const LA = [...L, { id: 'apoyo', nombre: 'Servicios', tipo: 'apoyo' as const, zona: { x: 0, y: 600, w: 2000, h: 300 } }]
  const g: GrafoLineas = {
    version: 1,
    lineas: LA,
    nodos: [
      { id: 'in:evis', x: 0, y: 0 },
      { id: 'baader', x: 200, y: 0 },
      { id: 'cinta', x: 400, y: 0 },
      { id: 'agua', x: 100, y: 700 },
      { id: 'riles', x: 500, y: 700 },
    ],
    aristas: [['in:evis', 'baader'], ['baader', 'cinta'], ['agua', 'in:evis'], ['baader', 'riles']],
  }
  it('lo que está en la zona de apoyo es servicio', () => {
    expect([...serviciosDe(g)].sort()).toEqual(['agua', 'riles'])
  })
  it('sus flechas NO reparten flujo: la Baader sigue al 100 %', () => {
    const p = pesosPorLinea(g)
    expect(p.get('baader')?.peso).toBe(1)
    expect(p.has('riles')).toBe(false)
    expect(p.has('agua')).toBe(false)
  })
  it('dice a qué línea abastece y de cuál recibe', () => {
    const r = relacionesDeServicios(g, pesosPorLinea(g))
    expect(r.get('agua')).toEqual({ abastece: ['evis'], recibe: [] })
    expect(r.get('riles')).toEqual({ abastece: [], recibe: ['evis'] })
  })
})

describe('círculos de flechas', () => {
  it('marca `ciclo` y deja en 0 a los que quedan atrapados, sin tocar al resto', () => {
    // in:evis → a → b → c, y c vuelve a b: b y c quedan en el círculo.
    const p = pesosPorLinea({
      lineas: L,
      nodos: [{ id: 'in:evis', x: 0, y: 0 }, { id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }, { id: 'c', x: 0, y: 0 }],
      aristas: [
        ['in:evis', 'a'],
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'b'],
      ],
    })
    expect(p.get('a')).toEqual({ lineaId: 'evis', peso: 1 })
    expect(p.get('b')).toEqual({ lineaId: 'evis', peso: 0, ciclo: true })
    expect(p.get('c')).toEqual({ lineaId: 'evis', peso: 0, ciclo: true })
  })
})

describe('contenedores: pertenencia explícita y límites que siguen a sus equipos', () => {
  it('la pertenencia manda sobre la posición', () => {
    expect(zonaDeNodo(L, { id: 'b', x: 10, y: 10, zona: 'emp' })).toBe('emp')
    expect(zonaDeNodo(L, { id: 'b', x: 10, y: 10 })).toBe('evis') // sin campo: por posición
    expect(zonaDeNodo(L, { id: 'in:emp', x: 10, y: 10 })).toBe('emp') // una entrada es de su línea
    expect(zonaDeNodo(L, { id: 'b', x: 10, y: 10, zona: '' })).toBeUndefined() // sacado del contenedor, aunque esté encima
  })

  it('empujar un equipo arriba y a la izquierda amplía su contenedor hacia ese lado', () => {
    const lim = limitesDeZonas({ lineas: L, nodos: [{ id: 'b', x: -100, y: -80, zona: 'evis' }] })
    expect(lim.get('evis')).toEqual({ x: -100 - MARGEN_ZONA.lado, y: -80 - MARGEN_ZONA.arriba, w: 1000 + 100 + MARGEN_ZONA.lado, h: 500 + 80 + MARGEN_ZONA.arriba })
    // El otro contenedor no cambia.
    expect(lim.get('emp')).toEqual(L[1]!.zona)
  })

  it('y hacia la derecha o abajo, aunque el equipo esté encima del contenedor vecino', () => {
    const lim = limitesDeZonas({ lineas: L, nodos: [{ id: 'b', x: 1500, y: 600, zona: 'evis' }] })
    expect(lim.get('evis')!.w).toBe(1500 + NODO.ancho + MARGEN_ZONA.lado)
    expect(lim.get('evis')!.h).toBe(600 + NODO.alto + MARGEN_ZONA.abajo)
  })

  it('un servicio es servicio por pertenencia, aunque se haya movido fuera de la zona', () => {
    const LA = [...L, { id: 'apoyo', nombre: 'S', tipo: 'apoyo' as const, zona: { x: 0, y: 600, w: 100, h: 100 } }]
    expect([...serviciosDe({ lineas: LA, nodos: [{ id: 'agua', x: 5000, y: 5000, zona: 'apoyo' }] })]).toEqual(['agua'])
  })
})

describe('propuesta de Chonchi', () => {
  it('con el árbol real: Baader 33,3 %, bombeo 50 %, cortinas fuera', () => {
    const nombres = [
      'DUCTO SUCCION PECES SISTEMA N1', 'BOMBA VACIO ANILLO LIQUIDO N1', 'BOMBA VACIO ANILLO LIQUIDO N2', 'DUCTO DESCARGA N1',
      'SISTEMA BOMBEO PECES N2', 'ESTANQUE AGUA DULCE 1', 'BOMBA VACIO ANILLO LIQ TOLVA VISCERA N1', 'DESANGRADOR', 'CINTA ACELERACION MAREL', 'BALANZA PESAJE MAREL',
      'CINTA ACELERACION LARGA ENTRADA BAADER', 'CINTA CORTA DE ACELERACION', 'EVISCERADORA BAADER 142 N1', 'EVISCERADORA BAADER 142 N2',
      'EVISCERADORA BAADER 142 N3', 'CINTA TRANSVERSAL SALIDA BAADER', 'CINTA ELEVADORA CLASIFICADO', 'CORTINA AIRE ENTRADA SACRIFICIO',
    ]
    const g = propuestaChonchi((n) => (nombres.includes(n) ? n : undefined))
    const p = pesosPorLinea(g)
    // Acopio por componentes: las 2 bombas de vacío en paralelo; el Sistema N2 (Yal) no se dibuja.
    expect(p.get('BOMBA VACIO ANILLO LIQUIDO N2')).toEqual({ lineaId: 'acopio', peso: 0.5 })
    expect(p.get('DUCTO DESCARGA N1')?.peso).toBe(1)
    expect(g.nodos.some((n) => n.id === 'SISTEMA BOMBEO PECES N2')).toBe(false)
    // Servicios: abastecen o reciben, sin peso.
    expect(p.has('ESTANQUE AGUA DULCE 1')).toBe(false)
    const r = relacionesDeServicios(g, p)
    expect(r.get('ESTANQUE AGUA DULCE 1')?.abastece).toEqual(['eviscerado'])
    expect(r.get('BOMBA VACIO ANILLO LIQ TOLVA VISCERA N1')?.recibe).toEqual(['eviscerado'])
    expect(p.get('EVISCERADORA BAADER 142 N3')?.peso).toBeCloseTo(1 / 3)
    expect(p.get('CINTA ELEVADORA CLASIFICADO')).toEqual({ lineaId: 'eviscerado', peso: 1 })
    expect(p.has('CORTINA AIRE ENTRADA SACRIFICIO')).toBe(false)
    // Los equipos que no están en el árbol no se dibujan.
    expect(g.nodos.some((n) => n.id === 'BAADER 200')).toBe(false)
    expect(g.lineas).toBe(LINEAS_CHONCHI)
  })
})
