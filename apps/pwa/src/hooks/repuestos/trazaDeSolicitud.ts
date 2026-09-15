/**
 * La traza de una solicitud de repuesto: quién la aprobó, quién la entregó y cuánto tardó.
 *
 * POR QUÉ EXISTE
 * --------------
 * Avanzar el estado escribía solo `{ estado }`. La única solicitud real (AMORTIGUADOR
 * 1421003000 ×2, 31-05) dice «Entregada» y nada más: ni quién la aprobó, ni cuándo se entregó.
 * Cuando el SAP tiene bodega, la salida deja un movimiento con autor y fecha; la aprobación no
 * deja nada, y sin bodega tampoco la entrega.
 *
 * Es el dato que responde «¿cuánto tarda Mantención en conseguir un repuesto?» — la app existe
 * para poder mostrar eso con números.
 */

export type EstadoConTraza = 'aprobada' | 'entregada'

/** Campos que se escriben al pasar a `estado` (sin `serverTimestamp`, lo pone quien escribe). */
export function camposDeTraza(estado: EstadoConTraza, uid: string, nombre: string): Record<string, string> {
  return { [`${estado}Por`]: nombre || 'Usuario', [`${estado}PorUid`]: uid }
}

/** «40 min», «3 h 10 min», «2 d 4 h». `null` si falta una fecha o el orden es imposible. */
export function duracionLegible(desde: Date | undefined, hasta: Date | undefined): string | null {
  if (!desde || !hasta) return null
  const min = Math.round((hasta.getTime() - desde.getTime()) / 60000)
  if (!Number.isFinite(min) || min < 0) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}
