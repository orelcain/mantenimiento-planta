import { stockStatusOf, type ItemConStock } from './estadoDeStock'

/**
 * Un filtro de stock = UN predicado. El contador y la lista salen del mismo.
 *
 * POR QUÉ EXISTE
 * --------------
 * Tres veces apareció el mismo defecto en este módulo: una tarjeta que anunciaba un número y
 * un filtro que mostraba otro, porque cada uno calculaba lo suyo por su lado y alguien
 * corrigió solo uno de los dos:
 *
 * - "Exportar Selección (903)" → el archivo traía 27 posiciones.
 * - "Mis favoritos (7)" dentro de un equipo → al activarlo, 1 fila.
 * - "Sin stock 545" → el filtro mostraba 21, porque seguía exigiendo `stockMinimo > 0`
 *   después de que `estadoDeStock.ts` unificara la definición para las tarjetas.
 *
 * `estadoDeStock.ts` unificó qué ES cada estado. Esto unifica quién QUEDA en cada filtro:
 * mientras la tarjeta y la lista deriven de la misma entrada de `FILTROS_DE_STOCK`, no pueden
 * volver a divergir. Si mañana se agrega un filtro, se agrega aquí y el contador viene gratis.
 */

export type StockFilterKey = 'todos' | 'configurados' | 'bajo' | 'sin' | 'sinConfig' | 'favoritos'

/** Lo mínimo que necesita un ítem para poder clasificarse. */
export interface ItemFiltrable extends ItemConStock {
  isWatched?: boolean
}

export const FILTROS_DE_STOCK: Record<StockFilterKey, (item: ItemFiltrable) => boolean> = {
  todos: () => true,
  configurados: (i) => !!i.bodegaId,
  bajo: (i) => stockStatusOf(i) === 'low',
  sin: (i) => stockStatusOf(i) === 'out',
  sinConfig: (i) => !i.bodegaId,
  favoritos: (i) => !!i.isWatched,
}

/** Aplica el filtro. Es la ÚNICA forma en que la lista debe filtrarse. */
export function aplicarFiltroDeStock<T extends ItemFiltrable>(items: readonly T[], key: StockFilterKey): T[] {
  return items.filter(FILTROS_DE_STOCK[key])
}

/**
 * Cuenta lo que ese filtro va a mostrar. Es la ÚNICA forma en que una tarjeta debe contar:
 * así el número del botón siempre es el número de filas que aparecen al pulsarlo.
 */
export function contarParaFiltro(items: readonly ItemFiltrable[], key: StockFilterKey): number {
  const cumple = FILTROS_DE_STOCK[key]
  let n = 0
  for (const item of items) if (cumple(item)) n++
  return n
}
