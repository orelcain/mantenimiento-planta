/**
 * El estado de stock de un repuesto — UNA sola definición.
 *
 * POR QUÉ EXISTE
 * --------------
 * La regla ya estaba corregida en la vista por área: *"Cero es «sin stock»
 * SIEMPRE, tenga o no mínimo definido"*. Pero las estadísticas de la pestaña
 * Bodega seguían con la versión vieja:
 *
 *     sinStock: i.stockActual === 0 && i.stockMinimo > 0
 *     stockOk:  i.stockMinimo === 0 || i.stockActual > i.stockMinimo
 *
 * Como solo unos pocos ítems tienen mínimo definido, la tarjeta decía
 * **"21 Sin stock"** cuando en bodega hay **545 ítems con cero unidades**: los
 * otros 524 caían en `stockOk` y se contaban como disponibles.
 *
 * Dos definiciones distintas de lo mismo en dos pantallas es lo que hace que
 * los números no cuadren. Acá vive la única.
 */

export type StockStatus = 'ok' | 'low' | 'out' | 'unset'

export interface ItemConStock {
  bodegaId?: string | null
  stockActual: number
  stockMinimo: number
}

export function stockStatusOf(item: ItemConStock): StockStatus {
  if (!item.bodegaId) return 'unset' // sin configuración de bodega
  if (item.stockActual === 0) return 'out'
  if (item.stockMinimo > 0 && item.stockActual <= item.stockMinimo) return 'low'
  return 'ok'
}

export interface ConteoDeStock {
  ok: number
  low: number
  out: number
  unset: number
}

export function contarPorEstado(items: readonly ItemConStock[]): ConteoDeStock {
  const conteo: ConteoDeStock = { ok: 0, low: 0, out: 0, unset: 0 }
  for (const item of items) conteo[stockStatusOf(item)] += 1
  return conteo
}
