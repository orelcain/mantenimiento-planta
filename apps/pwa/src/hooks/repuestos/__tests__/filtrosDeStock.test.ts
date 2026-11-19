import { describe, it, expect } from 'vitest'
import { contarAlertas, esAlertaDeStock } from '../estadoDeStock'
import {
  FILTROS_DE_STOCK,
  aplicarFiltroDeStock,
  contarParaFiltro,
  type ItemFiltrable,
  type StockFilterKey,
} from '../filtrosDeStock'

const item = (p: Partial<ItemFiltrable>): ItemFiltrable => ({
  bodegaId: 'b1',
  stockActual: 5,
  stockMinimo: 0,
  ...p,
})

/** El caso real que destapó el defecto: 545 en cero, de los cuales solo 21 tienen mínimo. */
const catalogoReal = [
  ...Array.from({ length: 21 }, () => item({ stockActual: 0, stockMinimo: 3 })),
  ...Array.from({ length: 524 }, () => item({ stockActual: 0, stockMinimo: 0 })),
  ...Array.from({ length: 40 }, () => item({ stockActual: 2, stockMinimo: 5 })),
  ...Array.from({ length: 100 }, () => item({ stockActual: 10, stockMinimo: 1 })),
  ...Array.from({ length: 7 }, () => item({ bodegaId: null, stockActual: 0, stockMinimo: 0 })),
]

describe('el contador dice lo que el filtro muestra', () => {
  const claves: StockFilterKey[] = ['todos', 'configurados', 'bajo', 'sin', 'sinConfig', 'favoritos', 'alertas']

  it.each(claves)('%s: contarParaFiltro coincide con aplicarFiltroDeStock', (key) => {
    expect(contarParaFiltro(catalogoReal, key)).toBe(aplicarFiltroDeStock(catalogoReal, key).length)
  })

  it('con una lista vacía todos los contadores dan 0', () => {
    claves.forEach((k) => expect(contarParaFiltro([], k)).toBe(0))
  })
})

describe('"sin stock" incluye los que NO tienen mínimo definido', () => {
  it('cuenta los 545 en cero, no solo los 21 con mínimo', () => {
    // Este es el defecto que se arregló: el filtro exigía `stockMinimo > 0` y dejaba fuera 524.
    expect(contarParaFiltro(catalogoReal, 'sin')).toBe(545)
  })

  it('un ítem en cero sin mínimo NO cuenta como disponible', () => {
    const enCeroSinMinimo = item({ stockActual: 0, stockMinimo: 0 })
    expect(FILTROS_DE_STOCK.sin(enCeroSinMinimo)).toBe(true)
    expect(FILTROS_DE_STOCK.bajo(enCeroSinMinimo)).toBe(false)
  })
})

describe('"alertas" usa el mismo criterio que las estadísticas', () => {
  it('cuenta exactamente lo mismo que contarAlertas y esAlertaDeStock', () => {
    expect(contarParaFiltro(catalogoReal, 'alertas')).toBe(61)
    expect(contarParaFiltro(catalogoReal, 'alertas')).toBe(contarAlertas(catalogoReal))
    expect(aplicarFiltroDeStock(catalogoReal, 'alertas')).toEqual(catalogoReal.filter(esAlertaDeStock))
  })

  it('incluye sin stock con mínimo, bajo mínimo e igual al mínimo', () => {
    const lista = [
      item({ stockActual: 0, stockMinimo: 3 }),
      item({ stockActual: 2, stockMinimo: 3 }),
      item({ stockActual: 3, stockMinimo: 3 }),
    ]
    expect(aplicarFiltroDeStock(lista, 'alertas')).toEqual(lista)
    expect(contarParaFiltro(lista, 'alertas')).toBe(aplicarFiltroDeStock(lista, 'alertas').length)
  })

  it('excluye los en cero sin mínimo y los sin configurar con mínimo cero', () => {
    const lista = [
      item({ stockActual: 0, stockMinimo: 0 }),
      item({ bodegaId: null, stockActual: 0, stockMinimo: 0 }),
      item({ bodegaId: undefined, stockActual: 0, stockMinimo: 0 }),
    ]
    expect(aplicarFiltroDeStock(lista, 'alertas')).toEqual([])
    expect(contarParaFiltro(lista, 'alertas')).toBe(0)
  })
})

describe('los demás filtros', () => {
  it('"bajo" es stock por debajo del mínimo pero mayor que cero', () => {
    expect(contarParaFiltro(catalogoReal, 'bajo')).toBe(40)
    expect(FILTROS_DE_STOCK.bajo(item({ stockActual: 0, stockMinimo: 5 }))).toBe(false)
  })

  it('"configurados" y "sinConfig" son complementarios', () => {
    const conf = contarParaFiltro(catalogoReal, 'configurados')
    const sinConf = contarParaFiltro(catalogoReal, 'sinConfig')
    expect(conf + sinConf).toBe(catalogoReal.length)
    expect(sinConf).toBe(7)
  })

  it('"todos" no descarta nada', () => {
    expect(contarParaFiltro(catalogoReal, 'todos')).toBe(catalogoReal.length)
  })

  it('"favoritos" mira la marca del usuario, no el stock', () => {
    const lista = [item({ isWatched: true }), item({ isWatched: false }), item({ stockActual: 0, isWatched: true })]
    expect(contarParaFiltro(lista, 'favoritos')).toBe(2)
  })
})

describe('aplicarFiltroDeStock', () => {
  it('devuelve los ítems, no solo el conteo', () => {
    const lista = [item({ stockActual: 0, stockMinimo: 0 }), item({ stockActual: 9 })]
    const out = aplicarFiltroDeStock(lista, 'sin')
    expect(out).toHaveLength(1)
    expect(out[0]?.stockActual).toBe(0)
  })

  it('no muta la lista original', () => {
    const lista = [item({ stockActual: 0 }), item({ stockActual: 5 })]
    aplicarFiltroDeStock(lista, 'sin')
    expect(lista).toHaveLength(2)
  })
})

// ── Etapa 2 de Bodega: filtros rápidos «Sin equipo» y «Sin contar» ──
// Los dos miran SOLO piezas de bodega (con bodegaId): es el universo de los KPI
// «% con equipo» y «% contadas» de la línea base del 18-11-2026.
describe('«Sin equipo»', () => {
  it('una pieza de bodega sin equipos entra', () => {
    expect(FILTROS_DE_STOCK.sinEquipo(item({ equipos: [] }))).toBe(true)
  })

  it('el marcador «Sin equipo» de useGlobalSearch (machineId vacío) no es un equipo', () => {
    expect(FILTROS_DE_STOCK.sinEquipo(item({ equipos: [{ machineId: '', machineName: 'Sin equipo' }] }))).toBe(true)
    expect(FILTROS_DE_STOCK.sinEquipo(item({ equipos: [{ machineId: '  ', machineName: 'Sin equipo' }] }))).toBe(true)
  })

  it('con un equipo real no entra, aunque también traiga el marcador', () => {
    expect(FILTROS_DE_STOCK.sinEquipo(item({ equipos: [{ machineId: 'm1', machineName: 'BAADER 200' }] }))).toBe(false)
    expect(FILTROS_DE_STOCK.sinEquipo(item({ equipos: [{ machineId: '', machineName: 'Sin equipo' }, { machineId: 'm1', machineName: 'BAADER 200' }] }))).toBe(false)
  })

  it('una pieza sin configurar en bodega no entra', () => {
    expect(FILTROS_DE_STOCK.sinEquipo(item({ bodegaId: null, equipos: [] }))).toBe(false)
  })
})

describe('«Sin contar»', () => {
  it('una pieza de bodega sin ultimoConteoAt entra; una contada no', () => {
    expect(FILTROS_DE_STOCK.sinContar(item({}))).toBe(true)
    expect(FILTROS_DE_STOCK.sinContar(item({ ultimoConteoAt: new Date('2026-11-18T10:00:00') }))).toBe(false)
  })

  it('contada y en cero sigue siendo contada (el sello distingue «da 0» de «nunca»)', () => {
    expect(FILTROS_DE_STOCK.sinContar(item({ stockActual: 0, ultimoConteoAt: new Date('2026-11-18T10:00:00') }))).toBe(false)
  })

  it('una pieza sin configurar en bodega no entra', () => {
    expect(FILTROS_DE_STOCK.sinContar(item({ bodegaId: null }))).toBe(false)
  })
})

describe('los filtros rápidos cuentan lo que muestran', () => {
  const lista = [
    item({ equipos: [] }),
    item({ equipos: [{ machineId: '', machineName: 'Sin equipo' }], ultimoConteoAt: new Date('2026-10-02T09:00:00') }),
    item({ equipos: [{ machineId: 'm1', machineName: 'BAADER 200' }] }),
    item({ equipos: [{ machineId: 'm2', machineName: 'KNURO N1' }], ultimoConteoAt: new Date('2026-09-25T09:00:00') }),
    item({ bodegaId: null, equipos: [] }),
  ]
  it.each(['sinEquipo', 'sinContar'] as StockFilterKey[])('%s: contarParaFiltro = aplicarFiltroDeStock', (key) => {
    expect(contarParaFiltro(lista, key)).toBe(aplicarFiltroDeStock(lista, key).length)
  })
  it('cifras esperadas', () => {
    expect(contarParaFiltro(lista, 'sinEquipo')).toBe(2)
    expect(contarParaFiltro(lista, 'sinContar')).toBe(2)
  })
})
