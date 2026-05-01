/**
 * Helpers de DISPLAY de turnos — convención calendárica vs convención CF.
 *
 * El Cloud Function de Shoplogix sync guarda los shifts en Firestore con la
 * convención del "día laboral" (08:00→08:00). Esto significa que:
 *
 *   - Turno 1 (07:45–14:45) → dateKey = día calendárico ✓ (coincide)
 *   - Turno 2 (14:45–00:00) → dateKey = día calendárico ✓ (coincide)
 *   - Turno 3 (00:00–07:45) → dateKey = día anterior ❌ (NO coincide)
 *
 * Shoplogix UI, en cambio, usa la convención calendárica: el Turno 3 cuyo
 * horario real es 00:00–07:45 del 27 de abril se llama "Turno 3 del 27 abril",
 * pero en nuestro Firestore está guardado como `2026-04-26_Turno 3`.
 *
 * Estos helpers ALINEAN el display con Shoplogix sin tocar el data layer:
 * la URL, la clave Firestore y la lógica de carga conservan la convención CF
 * (dateKey = día anterior para Turno 3). Solo el display visible al usuario
 * (etiquetas, agrupación visual en el calendario) usa la convención calendárica.
 */

/**
 * Convierte un (dateKey, shiftId) almacenado en Firestore al "día visual"
 * en que el turno ocurre realmente según el calendario.
 *
 * - Turno 3 con dateKey=X → display dateKey = X+1 (madrugada del día siguiente CF)
 * - Cualquier otro shift → display dateKey = X (sin cambio)
 *
 * @example
 *   getShiftDisplayDateKey('2026-04-26', 'Turno 3') // → '2026-04-27'
 *   getShiftDisplayDateKey('2026-04-26', 'Turno 2') // → '2026-04-26'
 */
export function getShiftDisplayDateKey(dateKey: string, shiftId: string): string {
  if (!isMidnightShift(shiftId)) return dateKey
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Inversa de `getShiftDisplayDateKey`: dado el día visual y un shiftId, devuelve
 * el dateKey CF que se debe usar para consultar Firestore.
 *
 * - Día visual Y, shiftId='Turno 3' → CF dateKey = Y-1
 * - Día visual Y, otros shifts       → CF dateKey = Y
 *
 * Útil cuando el usuario selecciona un día visual y queremos cargar los turnos
 * que pertenecen a ese día calendáricamente.
 */
export function getCfDateKeyForDisplayDay(displayDay: string, shiftId: string): string {
  if (!isMidnightShift(shiftId)) return displayDay
  const d = new Date(`${displayDay}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Detecta si un shiftId corresponde a un turno que cruza la medianoche EMPEZANDO
 * a las 00:00 (es decir, una "madrugada" cuyo dateKey CF apunta al día anterior).
 *
 * Por ahora hardcodeado a "Turno 3" (la convención de Yal en Shoplogix). Si en
 * el futuro otras plantas tienen otros nombres, esto se extiende leyendo la
 * config de plantLines.
 */
export function isMidnightShift(shiftId: string): boolean {
  return shiftId === 'Turno 3'
}

/**
 * Suma N días a un dateKey YYYY-MM-DD. Usa UTC noon para evitar saltos por DST.
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Para un shift identificado por (dateKey, shiftId) almacenado en Firestore,
 * devuelve el día visual al que pertenece según la convención calendárica
 * (alineada con Shoplogix UI).
 *
 * Equivalente a `getShiftDisplayDateKey` pero con un nombre que enfatiza la
 * intención semántica (visual-day vs CF-day).
 */
export function visualDayForCfShift(cfDateKey: string, shiftId: string): string {
  return getShiftDisplayDateKey(cfDateKey, shiftId)
}

/**
 * Para un día visual Y, devuelve el par de dateKeys CF que se deben consultar
 * para encontrar todos los shifts que pertenecen visualmente a ese día:
 *
 *   - T1, T2, "Turno día", "Turno noche": dateKey CF = Y
 *   - Turno 3:                            dateKey CF = Y - 1
 *
 * Útil para construir las claves del Map slxByShift (que tiene formato
 * `${dateKeyCF}__${shiftId}`) sabiendo solo el día visual.
 */
export function cfKeysForVisualDay(visualDay: string): {
  ownDay: string       // visualDay
  prevDay: string      // visualDay - 1 (donde están los Turno 3 del día visual)
} {
  return {
    ownDay:  visualDay,
    prevDay: addDaysToDateKey(visualDay, -1),
  }
}

/**
 * Construye la clave Firestore `${dateKeyCF}__${shiftId}` correcta para un
 * shift que se quiere mostrar visualmente bajo el día `visualDay`.
 */
export function slxKeyForVisualShift(visualDay: string, shiftId: string): string {
  const cfDateKey = getCfDateKeyForDisplayDay(visualDay, shiftId)
  return `${cfDateKey}__${shiftId}`
}
