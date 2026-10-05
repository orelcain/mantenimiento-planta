/**
 * Reparto de la Tarjeta A3C en PC: medidas y proporciones de los dibujos. Puro (sin React)
 * para probarlo sin navegador.
 */
/** Proporción ancho/alto del encuadre «Todo» de la tarjeta (hoja 23: 836×1131; placa: 1006×1420). */
export const ASPECTO_TARJETA = 0.74
/** Proporción del plano de ubicación (hoja 22, encuadre «Todo»: 1040×630). */
export const ASPECTO_UBICACION = 1040 / 630
/** Columna de la regleta X5 en PC, separación entre columnas y fila del selector Plano | Placa. */
export const ANCHO_REGLETA_PC = 120
export const GAP_PC = 20
export const FILA_SELECTOR_PC = 52
/** Bajo este alto útil la página hace scroll en vez de aplastar los dibujos. */
export const ALTO_MIN_PC = 560
export const MARGEN_INF_PC = 16
/** Divisor plano de ubicación | ficha: objetivo de 44 px; 16 px se montan sobre el relleno de la ficha. */
export const ALTO_DIVISOR = 44
export const SOLAPE_DIVISOR = 16
export const UBICACION_MIN = 260
export const FICHA_MIN = 160

export interface DistribucionPc {
  /** Ancho de la columna de la tarjeta (regleta + lienzo). */
  anchoTarjeta: number
  /** Alto por defecto del plano de ubicación (columna derecha, arriba). */
  altoUbicacion: number
  /** Alto máximo del plano de ubicación (deja `FICHA_MIN` a la ficha). */
  maxUbicacion: number
  /** La columna derecha es ancha: la ficha se lee a dos columnas. */
  fichaAncha: boolean
}

/**
 * Reparte el área útil de PC. La tarjeta (Plano | Placa) es la protagonista: al menos la mitad
 * del ancho y todo el alto; si su encuadre «Todo» pide más ancho (ventanas altas), crece hasta el
 * 62 %. El plano de ubicación es el segundo protagonista: arriba a la derecha, con su proporción
 * apaisada y al menos el 58 % del alto; la ficha, compacta, queda debajo.
 */
export function distribuirPc(ancho: number, alto: number): DistribucionPc {
  const lienzoT = Math.max(0, alto - FILA_SELECTOR_PC)
  const deseado = lienzoT * ASPECTO_TARJETA + ANCHO_REGLETA_PC + 8
  const anchoTarjeta = Math.round(Math.min(Math.max(deseado, ancho * 0.5), ancho * 0.62))
  const anchoDer = Math.max(0, ancho - anchoTarjeta - GAP_PC)
  const maxUbicacion = Math.max(UBICACION_MIN, alto - (ALTO_DIVISOR - SOLAPE_DIVISOR) - FICHA_MIN)
  const ideal = Math.max(anchoDer / ASPECTO_UBICACION + 40, alto * 0.58)
  const altoUbicacion = Math.round(Math.min(maxUbicacion, Math.max(UBICACION_MIN, ideal)))
  return { anchoTarjeta, altoUbicacion, maxUbicacion, fichaAncha: anchoDer >= 720 }
}
