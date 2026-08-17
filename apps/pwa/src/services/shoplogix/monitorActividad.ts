/**
 * El tramo del turno donde la línea REALMENTE hizo algo.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * La ventana de un turno la declara Shoplogix, y cuando el turno no está
 * definido —el caso de Filete de noche, que llega como `Unscheduled`— esa
 * ventana arranca a las 06:00 y se estira hasta ahora. La madrugada del
 * 17-08-2026 eso daba 16 horas de eje para 1 hora de producción: el 94 % del
 * gráfico era una línea plana pegada al suelo y la actividad real quedaba
 * aplastada contra el borde derecho, ilegible.
 *
 * Esto no se arregla escalando el eje vertical ni cambiando de tipo de
 * gráfico: sobra EJE HORIZONTAL. Lo que se recorta acá es el vacío de los
 * extremos.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 *
 * No comprime los huecos INTERIORES. Si la línea estuvo dos horas parada en
 * medio del turno, esas dos horas se ven planas y ocupando su ancho real:
 * son la verdad del turno y son justo lo que hay que notar. Acortarlas
 * dibujaría un turno que no existió.
 */

/** Un tramo de 5 minutos de la serie del monitor. */
export interface PuntoSerie {
  /** ISO del inicio del tramo. */
  t?: string | null
  /** Piezas del tramo. */
  pieces?: number | null
}

/** Tramo visible, en minutos desde el primer punto de la serie. */
export interface VentanaActividad {
  desdeMin: number
  hastaMin: number
  /** Minutos de vacío que se recortaron por delante y por detrás. */
  recortadoMin: number
}

/** Minutos que dura cada punto de la serie del monitor. */
const PASO_MIN = 5

/**
 * Recorta el vacío de los extremos: del primer tramo con piezas al último.
 *
 * Devuelve `null` cuando no hay nada que recortar, y ese `null` es
 * información: significa «el turno se ve completo», y quien llama no debe
 * anunciar ningún recorte.
 *
 * @param minRecorteMin  No vale la pena recortar 10 minutos de un turno de 8
 *   horas: mover el eje por eso solo confunde a quien ya se sabe el gráfico.
 *   Por debajo de este umbral se devuelve `null`.
 */
export function ventanaDeActividad(
  series: readonly PuntoSerie[] | null | undefined,
  { minRecorteMin = 45 }: { minRecorteMin?: number } = {},
): VentanaActividad | null {
  if (!series || series.length === 0) return null

  const conPiezas = series.map((p) => (p.pieces ?? 0) > 0)
  const primero = conPiezas.indexOf(true)
  if (primero < 0) return null                    // turno sin una sola pieza
  const ultimo = conPiezas.lastIndexOf(true)

  const dominioMin = series.length * PASO_MIN
  /*
   * El tramo se toma COMPLETO —de su inicio al final del último— y se le deja
   * un respiro de un paso a cada lado: una barra pegada al borde del gráfico
   * se lee como cortada.
   */
  const desdeMin = Math.max(0, primero * PASO_MIN - PASO_MIN)
  const hastaMin = Math.min(dominioMin, (ultimo + 1) * PASO_MIN + PASO_MIN)

  const recortadoMin = desdeMin + (dominioMin - hastaMin)
  if (recortadoMin < minRecorteMin) return null

  return { desdeMin, hastaMin, recortadoMin }
}

/** «06:00» del punto de la serie que cae en ese minuto del turno. */
export function horaDelMinuto(
  series: readonly PuntoSerie[] | null | undefined,
  minuto: number,
  fmt: (iso: string) => string,
): string | null {
  if (!series || series.length === 0) return null
  const i = Math.min(series.length - 1, Math.max(0, Math.floor(minuto / PASO_MIN)))
  const t = series[i]?.t
  return t ? fmt(t) : null
}

/**
 * La serie desde la PRIMERA PIEZA: el turno empieza cuando la línea produjo,
 * no cuando Shoplogix empezó a sincronizar tramos vacíos.
 *
 * ⚠ Esto no es cosmético, es el ORIGEN del eje de todo el monitor. «Hora por
 * hora» y el comparador miden minutos desde el primer punto de la serie, y sus
 * propios comentarios decían «el arranque es la primera pieza» — pero el código
 * tomaba el primer tramo sincronizado, con piezas o sin ellas. Con un turno sin
 * definir (Filete de noche: la serie arranca 09:45 y la primera pieza llega
 * 21:45) eso daba 12 horas de h1..h12 en cero y desplazaba la curva de hoy 12 h
 * respecto de los días de referencia, que sí arrancaban con producción: el
 * comparador quedaba con la mitad del ancho vacío.
 *
 * Se recorta SOLO por delante. La cola de tramos vacíos se conserva: el
 * backend la agrega a propósito para que el último paro se vea.
 */
export function desdePrimeraPieza<T extends PuntoSerie>(
  series: readonly T[] | null | undefined,
): T[] {
  if (!series || series.length === 0) return []
  const i = series.findIndex((p) => (p.pieces ?? 0) > 0)
  /* Sin una sola pieza se devuelve la serie tal cual: un turno que no produjo
     nada sigue siendo un turno, y su gráfico plano es la información. */
  if (i <= 0) return [...series]
  return series.slice(i)
}
