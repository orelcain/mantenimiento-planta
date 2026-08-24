/**
 * La hora de planta de un instante del monitor, en HH:MM.
 *
 * Los ISO que publica el monitor (`series[].t`, `effectiveStart`, `plannedEnd`)
 * son **wall-clock sellados como UTC**: el instante YA está en hora de planta.
 * Formatearlos con el reloj del que mira les resta el huso — un celular en
 * Chile (UTC−4) mostraba "hasta las 02:50" para un tramo cerrado a las 06:50.
 *
 * Por eso se lee el ISO tal cual, sin convertir. Es el mismo criterio que
 * `fmtDiaCorto` (timeZone UTC) y que el eje de los gráficos del turno.
 */
export function horaPlanta(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(11, 16)
}
