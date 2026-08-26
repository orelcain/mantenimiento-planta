/**
 * ¿El ritmo que muestra el monitor sigue siendo «de ahora»?
 *
 * POR QUÉ EXISTE
 * --------------
 * Orel, mirando el monitor con el turno ya terminado (26-08, ~15:35):
 * «ojo con los datos reales… ya terminó el turno y sigue mostrando velocidad».
 *
 * En pantalla:
 *
 *     34,1  pz/min andando · últimos 15 min            • a ritmo
 *     ...
 *     Últimos 15 min · hasta las 15:10
 *
 * El turno cerraba a las 15:00, el último tramo con datos era el de las 15:10
 * y el reloj iba en 15:35. Ese 34,1 es de hace media hora, pero el bloque lo
 * dice en presente y encima lo califica «a ritmo» —un veredicto sobre algo que
 * ya no está pasando—. Alguien que abre el link ve una línea corriendo.
 *
 * La serie llega en tramos de 5 minutos, así que un hueco de un tramo es
 * normal. Dos ya no: a partir de ahí el número deja de ser «ahora» y pasa a ser
 * «lo último que se supo», con su hora.
 */

/** Minutos sin dato nuevo a partir de los cuales el ritmo deja de ser «ahora». */
export const MIN_PARA_VIEJO = 12

export interface FrescuraDelRitmo {
  /** Minutos desde el último tramo con datos. */
  haceMin: number
  /** true = el número ya no describe el presente. */
  viejo: boolean
}

export function frescuraDelRitmo(
  corteMs: number | null | undefined,
  ahoraWallMs: number | null | undefined,
): FrescuraDelRitmo | null {
  if (corteMs == null || ahoraWallMs == null) return null
  if (!Number.isFinite(corteMs) || !Number.isFinite(ahoraWallMs)) return null
  const haceMin = (ahoraWallMs - corteMs) / 60_000
  // Un corte en el futuro es un desfase de relojes, no un dato fresco al revés.
  if (haceMin < 0) return { haceMin: 0, viejo: false }
  return { haceMin, viejo: haceMin >= MIN_PARA_VIEJO }
}
