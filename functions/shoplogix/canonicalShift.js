/**
 * Nombre CANÓNICO de turno por horario de inicio — "el histórico manda".
 *
 * Shoplogix es inconsistente: a veces etiqueta un turno con un nombre distinto
 * del que usó históricamente para ese mismo horario. Caso real verificado en
 * Firestore (2026-04→07): el turno de MADRUGADA de Yal (arranca 00:00) se llamó
 * "Turno 3" 20 veces, y una sola vez (8-jul-2026) Shoplogix lo etiquetó
 * "Turno 1". El operador ve "Turno 3" en el whiteboard; la app debe respetar el
 * nombre histórico, no la anomalía.
 *
 * Regla: el nombre del turno se canoniza por su HORA de inicio (wall-clock-as-UTC),
 * según lo que esa planta ha usado históricamente. Solo se definen reglas para
 * plantas/horarios con anomalías confirmadas; sin regla, se respeta el nombre
 * que emite Shoplogix (comportamiento previo).
 *
 * Chonchi NO tiene reglas: su etiquetado es consistente (Turno 1 21:30 noche,
 * "Turno 1 Lunes" 00:00 madrugada de lunes, Turno 2 09:00 día).
 */

/**
 * Reglas por planta: rangos de hora de inicio → nombre canónico.
 * `fromMin`/`toMin` en minutos desde medianoche (wall-clock-as-UTC). Un rango
 * con from > to cruza medianoche (ej. 22:00→08:00).
 */
const CANONICAL_SHIFTS = {
  yal: [
    // Madrugada/noche (arranca 22:00–08:00, típico 00:00) → "Turno 3".
    // Histórico: 20× "Turno 3" a las 00:00; el "Turno 1" del 8-jul fue anomalía.
    { fromMin: 22 * 60, toMin: 8 * 60, name: 'Turno 3' },
    // Tarde (arranca 11:00–22:00, típico 14:45/15:15/16:15) → "Turno 2".
    { fromMin: 11 * 60, toMin: 22 * 60, name: 'Turno 2' },
  ],
  // chonchi: sin reglas (etiquetado consistente).
}

/**
 * @param {string} plantSlug — 'yal' | 'chonchi'
 * @param {Date} scheduledStart — inicio real del turno (wall-clock-as-UTC)
 * @param {string} rawName — nombre que emite Shoplogix (campo shift del interval)
 * @returns {string} nombre canónico (o rawName si no hay regla que aplique)
 */
function canonicalShiftName(plantSlug, scheduledStart, rawName) {
  const rules = CANONICAL_SHIFTS[plantSlug]
  if (!rules || !scheduledStart || isNaN(scheduledStart.getTime())) return rawName
  // "Unscheduled" NUNCA se canoniza — es producción sin turno asignado, se
  // preserva tal cual (política existente).
  if (rawName === 'Unscheduled') return rawName
  const min = scheduledStart.getUTCHours() * 60 + scheduledStart.getUTCMinutes()
  for (const r of rules) {
    const inRange = r.fromMin < r.toMin
      ? (min >= r.fromMin && min < r.toMin)
      : (min >= r.fromMin || min < r.toMin) // cruza medianoche
    if (inRange) return r.name
  }
  return rawName
}

module.exports = { CANONICAL_SHIFTS, canonicalShiftName }
