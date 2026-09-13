/**
 * La pestaña Bodega decía **"21 Sin stock"** cuando en la bodega real hay
 * **545 ítems con cero unidades**. La definición vieja de las estadísticas
 * exigía tener mínimo definido:
 *
 *     sinStock: stockActual === 0 && stockMinimo > 0
 *     stockOk:  stockMinimo === 0 || stockActual > stockMinimo
 *
 * Como casi ningún ítem tiene mínimo, los otros 524 caían en `stockOk` y se
 * contaban como disponibles. La vista por área ya tenía la regla corregida
 * ("cero es sin stock SIEMPRE"); las estadísticas no.
 */
import { describe, it, expect } from 'vitest'
import { stockStatusOf, contarPorEstado, esAlertaDeStock, contarAlertas, type ItemConStock } from '../estadoDeStock'

const item = (over: Partial<ItemConStock>): ItemConStock =>
  ({ bodegaId: 'b1', stockActual: 5, stockMinimo: 0, ...over })

describe('stockStatusOf', () => {
  it('cero es SIN STOCK aunque no tenga mínimo definido', () => {
    expect(stockStatusOf(item({ stockActual: 0, stockMinimo: 0 }))).toBe('out')
    expect(stockStatusOf(item({ stockActual: 0, stockMinimo: 3 }))).toBe('out')
  })

  it('por debajo o igual al mínimo es bajo', () => {
    expect(stockStatusOf(item({ stockActual: 2, stockMinimo: 3 }))).toBe('low')
    expect(stockStatusOf(item({ stockActual: 3, stockMinimo: 3 }))).toBe('low')
  })

  it('con unidades y sin mínimo está ok', () => {
    expect(stockStatusOf(item({ stockActual: 1, stockMinimo: 0 }))).toBe('ok')
    expect(stockStatusOf(item({ stockActual: 4, stockMinimo: 3 }))).toBe('ok')
  })

  it('sin fila de bodega no se afirma nada', () => {
    expect(stockStatusOf(item({ bodegaId: null, stockActual: 0, stockMinimo: 0 }))).toBe('unset')
  })
})

describe('contarPorEstado', () => {
  it('el caso real: 545 en cero, no 21', () => {
    const items: ItemConStock[] = []
    // 21 con cero unidades Y mínimo definido — los únicos que contaba antes.
    for (let i = 0; i < 21; i++) items.push(item({ stockActual: 0, stockMinimo: 2 }))
    // 524 con cero unidades y sin mínimo — los que se contaban como "ok".
    for (let i = 0; i < 524; i++) items.push(item({ stockActual: 0, stockMinimo: 0 }))
    // 40 por debajo del mínimo, con unidades.
    for (let i = 0; i < 40; i++) items.push(item({ stockActual: 1, stockMinimo: 3 }))
    // 100 con stock de sobra.
    for (let i = 0; i < 100; i++) items.push(item({ stockActual: 9, stockMinimo: 1 }))

    const c = contarPorEstado(items)
    expect(c.out).toBe(545)
    expect(c.low).toBe(40)
    expect(c.ok).toBe(100)
    expect(c.out + c.low + c.ok + c.unset).toBe(items.length)
  })

  it('los ítems sin bodega van aparte y no inflan ningún otro grupo', () => {
    const c = contarPorEstado([
      item({ bodegaId: null, stockActual: 0, stockMinimo: 0 }),
      item({ stockActual: 0, stockMinimo: 0 }),
    ])
    expect(c).toEqual({ ok: 0, low: 0, out: 1, unset: 1 })
  })
})

/**
 * El badge rojo de la pestaña «Stock» decía **585** (`bajoStock + sinStock`) mientras la banda
 * de alertas de la MISMA pantalla, 300 px más abajo, decía **«61 alertas de stock»**. El badge
 * sumaba los 524 ítems en cero que nadie configuró: no son una alerta, son un pendiente de
 * configuración — nadie declaró cuántas unidades deben existir.
 */
describe('una alerta de stock es solo la de los ítems con mínimo definido', () => {
  /** La bodega real del 13-09: 21 en cero CON mínimo, 524 en cero SIN mínimo, 40 bajo mínimo. */
  const bodegaReal = [
    ...Array.from({ length: 21 }, () => item({ stockActual: 0, stockMinimo: 3 })),
    ...Array.from({ length: 524 }, () => item({ stockActual: 0, stockMinimo: 0 })),
    ...Array.from({ length: 40 }, () => item({ stockActual: 2, stockMinimo: 5 })),
    ...Array.from({ length: 100 }, () => item({ stockActual: 10, stockMinimo: 1 })),
  ]

  it('son 61, no 585', () => {
    expect(contarAlertas(bodegaReal)).toBe(61)
    const viejo = contarPorEstado(bodegaReal)
    expect(viejo.low + viejo.out).toBe(585) // lo que decía el badge
  })

  it('un ítem en cero SIN mínimo definido no es una alerta', () => {
    const sinConfigurar = item({ stockActual: 0, stockMinimo: 0 })
    expect(esAlertaDeStock(sinConfigurar)).toBe(false)
    expect(stockStatusOf(sinConfigurar)).toBe('out') // sí está sin stock: son cosas distintas
  })

  it('un ítem en cero CON mínimo sí es alerta', () => {
    expect(esAlertaDeStock(item({ stockActual: 0, stockMinimo: 3 }))).toBe(true)
  })

  it('estar justo EN el mínimo ya es alerta', () => {
    expect(esAlertaDeStock(item({ stockActual: 3, stockMinimo: 3 }))).toBe(true)
    expect(esAlertaDeStock(item({ stockActual: 4, stockMinimo: 3 }))).toBe(false)
  })

  it('el contador coincide con la lista que se muestra', () => {
    // El badge cuenta y la banda lista: tienen que salir del mismo predicado.
    expect(contarAlertas(bodegaReal)).toBe(bodegaReal.filter(esAlertaDeStock).length)
  })

  it('sin ítems no hay alertas y no revienta', () => {
    expect(contarAlertas([])).toBe(0)
  })
})
