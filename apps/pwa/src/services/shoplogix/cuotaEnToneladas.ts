/**
 * La cuota que pide producción viene en TONELADAS; el monitor cuenta PIEZAS.
 *
 * POR QUÉ EXISTE
 * --------------
 * Orel (26-08): «están pidiendo toneladas, no cantidad de piezas… y para hacer
 * 70 toneladas depende del peso promedio del pescado, entonces a veces la hacen
 * con 15.000 o más».
 *
 * Shoplogix entrega ciclos, no kilos: en el payload del monitor no hay ni un
 * campo de peso. Así que la conversión se hace acá, con el peso promedio que
 * dice quien carga la cuota, y el pedido original se guarda al lado para poder
 * mostrarlo y recalcularlo cuando cambia el calibre.
 */

/** Un salmón fuera de este rango es un dedo de más, no un pescado. */
export const PESO_MIN_KG = 0.5
export const PESO_MAX_KG = 25

export interface CuotaConvertida {
  piezas: number
  /** Para mostrar de dónde salió: "70 t a 4,6 kg". */
  detalle: string
}

export function piezasDeToneladas(
  toneladas: number,
  pesoPromedioKg: number,
): CuotaConvertida {
  if (!(toneladas > 0)) throw new Error('Las toneladas tienen que ser mayores que cero.')
  if (!(pesoPromedioKg >= PESO_MIN_KG && pesoPromedioKg <= PESO_MAX_KG)) {
    throw new Error(`El peso promedio tiene que estar entre ${PESO_MIN_KG} y ${PESO_MAX_KG} kg.`)
  }
  const piezas = Math.round((toneladas * 1000) / pesoPromedioKg)
  const kg = pesoPromedioKg.toLocaleString('es-CL', { maximumFractionDigits: 2 })
  const t = toneladas.toLocaleString('es-CL', { maximumFractionDigits: 1 })
  return { piezas, detalle: `${t} t a ${kg} kg` }
}

/** El camino inverso, para mostrar cuántas toneladas van con lo producido. */
export function toneladasDePiezas(piezas: number, pesoPromedioKg: number): number | null {
  if (!(piezas >= 0) || !(pesoPromedioKg > 0)) return null
  return (piezas * pesoPromedioKg) / 1000
}
