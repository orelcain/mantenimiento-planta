/**
 * La hora de planta que nombra la cuota acumulada («las 21.104 que tocaban a
 * las 05:00»).
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 * - **Se topa en el cierre.** Con el turno cerrado a las 05:00, a las 05:11 la
 *   pantalla decía «las 21.104 que tocaban a las 05:11»: una hora que envejece
 *   sola mientras el dato que nombra ya no se mueve.
 * - **Es hora de PLANTA, no del navegador.** El monitor trabaja en la
 *   convención wall-clock-as-UTC del doc, así que se leen las horas en UTC. Con
 *   `getHours()` sobre un timestamp ya convertido, un navegador en otro huso
 *   —o el propio equipo con la zona mal puesta— mostraba otra hora.
 */
export function horaDeLaCuota(
  plannedEnd: string | null | undefined,
  ahoraWallMs: number,
): string {
  const finMs = plannedEnd ? Date.parse(plannedEnd) : NaN
  const ms = !Number.isNaN(finMs) && ahoraWallMs > finMs ? finMs : ahoraWallMs
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
