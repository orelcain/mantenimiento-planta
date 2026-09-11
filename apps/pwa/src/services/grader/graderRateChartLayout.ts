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
/** Techo: en un monitor muy ancho el gráfico no tiene por qué seguir creciendo. */
export const ALTO_MAX_PLOT = 280
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
