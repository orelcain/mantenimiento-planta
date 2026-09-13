import { describe, it, expect } from 'vitest'
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
  const claves: StockFilterKey[] = ['todos', 'configurados', 'bajo', 'sin', 'sinConfig', 'favoritos']

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
