/**
 * El alcance de una exportación: qué se cuenta y qué se exporta — una sola definición.
 *
 * POR QUÉ EXISTE
 * --------------
 * El catálogo trae UNA FILA POR CADA EQUIPO donde sirve el repuesto, así que la misma pieza
 * aparece N veces. Lo que se exporta son los únicos; lo que contaban los botones del Centro de
 * Reportes era la lista cruda. Medido en producción el 12-09:
 *
 *     botón:   «Catálogo Completo (6026)»
 *     listado: «Mostrando 150 de 2102.»
 *
 * Casi 3x de diferencia entre el número que promete el botón y el que se va a exportar. Es el
 * mismo defecto de siempre en este módulo — el contador y lo contado escritos por separado —
 * con la cara de un alcance en vez de la de un filtro (ver `filtrosDeStock.ts`).
 */

export interface ConId {
  id: string
}

/**
 * Los ítems únicos por id, en el orden en que aparecen la primera vez.
 *
 * Es la ÚNICA forma de contar un alcance y la ÚNICA de armarlo: mientras el botón y la
 * exportación deriven de acá, el número del botón es el número de piezas que salen.
 */
export function unicosPorId<T extends ConId>(items: readonly T[]): T[] {
  const vistos = new Set<string>()
  const salida: T[] = []
  for (const item of items) {
    if (vistos.has(item.id)) continue
    vistos.add(item.id)
    salida.push(item)
  }
  return salida
}

/** Los ids de un alcance. Seleccionar «todo» es exactamente esto. */
export function idsDelAlcance(items: readonly ConId[]): Set<string> {
  return new Set(items.map((r) => r.id))
}
