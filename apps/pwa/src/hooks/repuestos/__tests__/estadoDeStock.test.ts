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
import { stockStatusOf, contarPorEstado, type ItemConStock } from '../estadoDeStock'

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
