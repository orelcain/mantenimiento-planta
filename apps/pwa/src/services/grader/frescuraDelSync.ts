/**
 * ¿Qué tan viejo es el dato de Shoplogix, y cuándo eso importa?
 *
 * El contador se escribió para el turno EN CURSO, donde cada sync trae piezas
 * nuevas: ahí «hace 7m» y el rojo a los 10 min son la señal correcta. Pero en un
 * turno CERRADO el mismo contador decía «hace 1924m 31s» y pintaba
 * «Desactualizado» en rojo por un turno del 11-09 que ya estaba completo:
 * alarma por un dato que no puede cambiar más, escrita además en minutos que
 * nadie va a dividir por 60.
 *
 * ⚠️ Las horas de turno son **wall-clock guardado como UTC** (hora de planta) y
 * `syncedAt` es un instante real. Para compararlos se le suma al fin de turno el
 * desfase de Chile, que es −3 o −4 según el horario de verano: se usa el mayor
 * (4 h), así el «está completo» nunca se afirma antes de tiempo.
 */

/** Chile es UTC−3 o UTC−4; el mayor deja el juicio del lado conservador. */
const DESFASE_MAX_H = 4

/** ¿El último sync ocurrió después de que el turno terminó? Entonces el dato ya está completo. */
export function syncCubreElTurno(
  syncedAt: Date | null | undefined,
  finDeTurnoPlanta: Date | null | undefined,
): boolean {
  if (!syncedAt || !finDeTurnoPlanta) return false
  const fin = finDeTurnoPlanta.getTime()
  if (!Number.isFinite(fin)) return false
  return syncedAt.getTime() >= fin + DESFASE_MAX_H * 3_600_000
}

/**
 * «hace 45s» · «hace 7m» · «hace 2 h 10 min» · «hace 3 días».
 *
 * Los segundos solo se muestran en el primer minuto y los minutos hasta la hora:
 * más allá, el segundero es ruido.
 */
export function etiquetaDeAntiguedad(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  if (s < 60) return `hace ${s}s`
  const min = Math.floor(s / 60)
  if (min < 60) {
    const resto = s % 60
    return resto > 0 ? `hace ${min}m ${resto}s` : `hace ${min}m`
  }
  const horas = Math.floor(min / 60)
  if (horas < 24) {
    const resto = min % 60
    return resto > 0 ? `hace ${horas} h ${resto} min` : `hace ${horas} h`
  }
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`
}
