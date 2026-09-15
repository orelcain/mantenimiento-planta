/**
 * Reglas del formulario «Solicitar repuesto» — puras y probadas.
 *
 * POR QUÉ EXISTE
 * --------------
 * 1. La cantidad era un número controlado que volvía a 1 apenas quedaba vacía:
 *    `Math.max(1, Math.round(Number(valor) || 1))`. En el teléfono, quien quiere 5 toca el
 *    campo, borra el «1» —vuelve a aparecer «1» al instante— y escribe «5»: queda **15**.
 *    Verificado en el navegador el 15-09. La solicitud sale así al grupo de Telegram.
 *    Ahora el campo guarda el TEXTO y la cantidad se valida al enviar.
 *
 * 2. El formulario no decía nada del stock. Pedir algo que está en cero en bodega es otra
 *    conversación (hay que comprarlo), y quien pide no lo sabía hasta que le contestaran.
 */

/** Tope sensato: una solicitud de 10.000 unidades es un dedo de más, no un pedido. */
export const CANTIDAD_MAXIMA = 9999

/** La cantidad escrita, o `null` si no es un entero entre 1 y el tope. */
export function cantidadDesdeTexto(texto: string): number | null {
  const limpio = texto.trim()
  if (!/^\d+$/.test(limpio)) return null
  const n = Number(limpio)
  return n >= 1 && n <= CANTIDAD_MAXIMA ? n : null
}

/**
 * Qué hace «Entregar» con bodega.
 *
 * Antes buscaba el repuesto en las filas del CATÁLOGO cargado, que va por área: una solicitud de
 * un repuesto de otra área no lo encontraba, se marcaba «Entregada» y el stock no se descontaba,
 * sin aviso. Y si se entregaba más de lo registrado, el stock quedaba en 0 en silencio mientras
 * el aviso decía «Stock descontado −5». Ahora se decide sobre el documento de BODEGA (que está
 * entero en memoria) y el faltante se dice.
 */
export type PlanDeEntrega =
  | { accion: 'sin-bodega' }
  | { accion: 'descontar'; stockAntes: number; stockDespues: number; faltante: number }

export function planDeEntrega(cantidad: number, bodega: { stockActual: number } | undefined): PlanDeEntrega {
  if (!bodega) return { accion: 'sin-bodega' }
  const stockAntes = Math.max(0, bodega.stockActual)
  return {
    accion: 'descontar',
    stockAntes,
    stockDespues: Math.max(0, stockAntes - cantidad),
    faltante: Math.max(0, cantidad - stockAntes),
  }
}

export interface StockDeSolicitud {
  /** Tiene documento en bodega. Sin él, el stock no se conoce: no es «cero». */
  configurado: boolean
  stockActual?: number
  unidad?: string
  ubicacionBodega?: string
}

export type NivelStock = 'desconocido' | 'sin-stock' | 'insuficiente' | 'ok'

/** Qué decirle a quien pide, según el stock y la cantidad que escribió. */
export function avisoDeStock(stock: StockDeSolicitud | undefined, cantidad: number | null): { nivel: NivelStock; texto: string } {
  if (!stock?.configurado || typeof stock.stockActual !== 'number') {
    return { nivel: 'desconocido', texto: 'Sin registro en bodega: no se sabe si hay.' }
  }
  const unidad = stock.unidad?.trim() || 'pzas'
  // «Sin ubicación» (sembrado por el conteo rápido) y «-» (importación) no son lugares.
  const ubic = stock.ubicacionBodega?.trim() ?? ''
  const donde = ubic && !/^[-–—.\s]*$/.test(ubic) && ubic.toLowerCase() !== 'sin ubicación' ? ` · ${ubic}` : ''
  if (stock.stockActual <= 0) return { nivel: 'sin-stock', texto: `Sin stock en bodega (0 ${unidad})${donde} — habrá que comprarlo.` }
  if (cantidad != null && cantidad > stock.stockActual) {
    return { nivel: 'insuficiente', texto: `En bodega hay ${stock.stockActual} ${unidad}${donde}: no alcanza para ${cantidad}.` }
  }
  return { nivel: 'ok', texto: `En bodega: ${stock.stockActual} ${unidad}${donde}.` }
}
