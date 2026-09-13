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

/**
 * Una ALERTA de stock: un ítem con mínimo definido cuyo stock cayó al mínimo o por debajo.
 *
 * POR QUÉ NO ES `low + out`
 * -------------------------
 * Porque `out` incluye los ítems en cero que **nadie configuró**: no son una alerta, son un
 * pendiente de configuración. Nadie declaró cuántas unidades deben existir, así que cero no
 * es «se acabó», es «no sabemos».
 *
 * La divergencia estaba viva en la misma pantalla de Bodega, a 300 px de distancia:
 *
 *     badge rojo de la pestaña «Stock»   585   (bajoStock + sinStock)
 *     banda de alertas                    61   («21 sin stock · 40 bajo mínimo»)
 *                                              «+524 en cero sin mínimo definido»
 *
 * La banda ya llevaba un comentario explicando la diferencia — la habían encontrado y
 * arreglado ahí, pero el badge de la pestaña se quedó con la cuenta vieja y gritaba en rojo
 * casi 10 veces la urgencia real. Es el mismo defecto de siempre del módulo: dos expresiones
 * para lo mismo y una se queda atrás. Acá vive la única.
 */
export function esAlertaDeStock(item: ItemConStock): boolean {
  return item.stockMinimo > 0 && item.stockActual <= item.stockMinimo
}

/** Cuenta las alertas con el MISMO predicado que las lista. */
export function contarAlertas(items: readonly ItemConStock[]): number {
  let n = 0
  for (const item of items) if (esAlertaDeStock(item)) n++
  return n
}
