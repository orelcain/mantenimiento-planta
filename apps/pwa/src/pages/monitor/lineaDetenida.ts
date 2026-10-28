/**
 * ¿La línea está detenida? El doc del corte lo dice con `machinesProducing === 0` y una causa (o una hora «desde»),
 * pero el pulso es MÁS FRESCO que ese corte: si alguna máquina ya cuenta piezas, la línea corre aunque el corte todavía
 * diga cero. Antes la tabla «Cada máquina» forzaba ceros y decía «la línea está detenida» con el pulso contando piezas.
 *
 * Solo en ese sentido (el pulso PROMUEVE a «andando»): un minuto sin piezas en el pulso no prueba una detención —su
 * ventana es corta—, así que nunca degrada a «detenida» lo que el corte da por andando. Puro: se prueba aparte.
 */
export function lineaDetenida(a: {
  machinesProducing: number | null | undefined
  conCausa: boolean
  /** Piezas/min del pulso por máquina (null sin pulso fresco o con el turno cerrado). */
  pulsoPorMaquina: ReadonlyArray<number | null | undefined> | null | undefined
}): boolean {
  if (a.machinesProducing !== 0 || !a.conCausa) return false
  return !(a.pulsoPorMaquina ?? []).some((v) => v != null && v > 0)
}
