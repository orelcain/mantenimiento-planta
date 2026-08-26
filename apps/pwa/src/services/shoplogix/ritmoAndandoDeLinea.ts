/**
 * El ritmo ANDANDO de la línea: piezas por minuto de LÍNEA produciendo.
 *
 * POR QUÉ EXISTE
 * --------------
 * El monitor lo calculaba con `uptimeSec`, que en el rollup de Shoplogix es la
 * **suma de las máquinas**. En Planta Principal, con tres Baader corriendo, eso
 * divide por casi tres:
 *
 *     26-08, 01:03 · 7.942 piezas
 *     uptimeSec / 60      = 571,8 min  (suma de las 3 máquinas)  → 13,9 pz/min
 *     producingMin        = 213 min    (tiempo de LÍNEA)         → 37,3 pz/min
 *     piecesPerMinute del backend                                → 37,2 pz/min
 *
 * En pantalla se leía **"Pide 23,4 pz/min y la línea, andando, va a 13,9"**
 * mientras el mismo monitor, tres bloques más abajo, valorizaba las paradas
 * "al promedio del turno (37,3)". Y peor: los turnos anteriores con los que se
 * compara SÍ se calculan sobre `producingMin`, así que el "rango normal" medía
 * el turno de hoy con otra vara.
 *
 * Ese número decide el veredicto de la meta y la proyección de cierre — y el
 * link lo mira producción.
 *
 * Con una sola máquina los dos denominadores coinciden, así que Filete y las
 * líneas de una máquina no cambian.
 */

export interface TiemposDeLinea {
  /** Minutos en que la LÍNEA estuvo produciendo (`timeBreakdown.producingMin`). */
  producingMin?: number | null
}

export function ritmoAndandoDeLinea(args: {
  totalPieces?: number | null
  tiempos?: TiemposDeLinea | null
  /** Suma del uptime de las máquinas, en segundos. Solo como último recurso. */
  uptimeSec?: number | null
  /** Cuántas máquinas suma ese uptime. */
  machinesTotal?: number | null
}): number | null {
  const piezas = args.totalPieces ?? 0
  if (piezas <= 0) return null

  const minLinea = args.tiempos?.producingMin ?? null
  if (minLinea != null && minLinea > 0) return piezas / minLinea

  // Sin `producingMin` se reparte el uptime entre las máquinas: sigue siendo
  // una aproximación, pero no una que multiplique el denominador por tres.
  const uptimeMin = (args.uptimeSec ?? 0) / 60
  const maquinas = Math.max(1, args.machinesTotal ?? 1)
  const minAprox = uptimeMin / maquinas
  if (minAprox > 0) return piezas / minAprox

  return null
}
