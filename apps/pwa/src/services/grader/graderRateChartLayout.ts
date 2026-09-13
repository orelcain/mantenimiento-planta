/**
 * Alto del gráfico de tasa de producción (`ProductionRateLineEC`).
 *
 * Módulo aparte del componente por el mismo motivo que `graderPurezaNivel`: para
 * poder testearlo y para no romper el fast-refresh del archivo de la tarjeta.
 *
 * El alto sale del ANCHO disponible y de las filas de leyenda. Hasta el 11-09
 * era solo `108 + filas * 15`, o sea que dependía únicamente de cuántas filas
 * ocupaba la leyenda. En un celular la leyenda va en 2-3 filas y el gráfico
 * crecía; en PC, donde entra en una sola, se quedaba en el mínimo: medido a
 * 1440 px daba **1.109 × 123 px (ratio 9:1), más BAJO que los 138 px del mismo
 * gráfico en un teléfono** — 8 h de turno y tres máquinas aplastadas, con la
 * pestaña usando 1.933 px de scroll en una pantalla de 900. Cuanto más ancha la
 * pantalla, más chico el gráfico.
 */

/** Piso del área de trazado. Es el alto que tenía el gráfico en un teléfono. */
export const ALTO_MIN_PLOT = 108
/**
 * Techo: en un monitor muy ancho el gráfico no tiene por qué seguir creciendo.
 *
 * Subido de 280 a 380 el 11-09: al llevar el contenedor del turno a 1.760 px, el
 * gráfico pasó a medir 1.703 px de ancho y el techo viejo lo dejaba en ratio
 * 5,8:1 — el mismo achatamiento que este módulo existe para evitar, esta vez
 * provocado por ensanchar la página.
 */
export const ALTO_MAX_PLOT = 380
/** Relación ancho/alto objetivo del área de trazado. */
export const RELACION_ANCHO_ALTO = 4.2

/**
 * @param anchoDisponible ancho medido del contenedor (0 hasta que mide el
 *   ResizeObserver — ahí gana el piso, no queda en cero).
 * @param filasDeLeyenda cuántas filas ocupa la leyenda con ese ancho.
 */
export function altoDelGrafico(anchoDisponible: number, filasDeLeyenda: number): number {
  const plot = Math.max(
    ALTO_MIN_PLOT,
    Math.min(ALTO_MAX_PLOT, Math.round(anchoDisponible / RELACION_ANCHO_ALTO)),
  )
  return plot + filasDeLeyenda * 15
}

/**
 * Alto del TIMELINE del turno (`ShiftTimelineView`).
 *
 * Tenía alto FIJO (320 px, o 360 con el eje del scatter). Con el contenedor
 * del turno en 1.760 px pasó a medir 1.689 px de ancho: **ratio 5,3:1** para un
 * gráfico de barras minuto a minuto de las 8 h del turno, con su riel de
 * eventos encima.
 *
 * A diferencia del gráfico de tasa, acá el piso NO es 108: es el alto que el
 * timeline ya tenía. Así el teléfono y 1440 px quedan exactamente igual (a
 * 278 px de ancho la división da 66 y a 1.223 px da 291, los dos por debajo
 * del piso) y solo crece en monitores anchos.
 */
export function altoDelTimeline(anchoDisponible: number, conEjeScatter: boolean): number {
  const piso = conEjeScatter ? 360 : 320
  return Math.max(
    piso,
    Math.min(ALTO_MAX_PLOT, Math.round(anchoDisponible / RELACION_ANCHO_ALTO)),
  )
}
