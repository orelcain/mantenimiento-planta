import { isCommonPartSap } from '@/data/commonPartsByMachine'

/**
 * Los predicados de los filtros de la lista de repuestos, en un solo sitio.
 *
 * Misma razón que `filtrosDeStock.ts`: el contador de un botón y el filtro que ese botón
 * aplica tienen que salir de la MISMA expresión. Cuando se escriben dos veces, tarde o
 * temprano alguien corrige una y deja la otra — así aparecieron "Mis favoritos (7)" que
 * mostraba 1 fila y "Sin stock 545" que mostraba 21.
 */

/** Lo mínimo que necesita una fila de la lista para clasificarse. */
export interface FilaFiltrable {
  rowKey: string
  codigoSAP?: string | null
  comunEn?: unknown[] | null
}

/** Repuesto de la lista curada de comunes (estática por SAP) o marcado como común en su equipo. */
export const esComun = (r: FilaFiltrable): boolean =>
  isCommonPartSap(r.codigoSAP ?? undefined) || (r.comunEn?.length ?? 0) > 0

/** Pieza de despiece: identificada por código de fabricante, sin código SAP propio. */
export const esDespiece = (r: FilaFiltrable): boolean => !r.codigoSAP

/**
 * Favorito personal del usuario. Se construye con el set de claves porque depende de quién
 * mira; el resto de predicados no dependen de nadie.
 */
export const esFavoritoDe =
  (favKeys: ReadonlySet<string>) =>
  (r: FilaFiltrable): boolean =>
    favKeys.has(r.rowKey)

/** Cuenta con el mismo predicado que filtra: el número del botón es el de filas que salen. */
export function contarCon<T>(items: readonly T[], cumple: (item: T) => boolean): number {
  let n = 0
  for (const item of items) if (cumple(item)) n++
  return n
}
