/**
 * Nombre CANÓNICO de turno — mecanismo de override, HOY SIN REGLAS ACTIVAS.
 *
 * HISTORIA (revertido 2026-07-08): esta función nació para "corregir" un turno
 * de madrugada de Yal que el 8-jul Shoplogix etiquetó "Turno 1" cuando 20
 * ocurrencias previas (abr-jul) fueron "Turno 3" — decisión tomada como
 * "el histórico manda". ERROR: horas después, el propio WHITEBOARD de
 * Shoplogix (la interfaz que mira el operador) confirmó "Turno 1 - 8 Jul 2026"
 * para ESE MISMO turno — es decir, Shoplogix no tenía un dato inconsistente
 * consigo mismo; simplemente RENOMBRÓ ese turno recurrente, y nuestra regla
 * histórica quedó peleando contra la fuente de verdad actual. Resultado:
 * la app mostraba "Turno 3" mientras Shoplogix decía "Turno 1" — el MISMO
 * bug que esta función pretendía resolver, ahora en la dirección contraria.
 *
 * LECCIÓN: Shoplogix puede renombrar turnos recurrentes de un día para otro
 * (igual que cambia horarios). Un patrón histórico de N ocurrencias pasadas
 * NO predice ni debe imponerse sobre el nombre ACTUAL de una ocurrencia
 * nueva — eso es exactamente lo que todo este módulo (PR #157, #160) existe
 * para evitar. La regla correcta es: SIEMPRE el nombre crudo de Shoplogix,
 * sin importar el histórico.
 *
 * Se deja el mecanismo (vacío) por si en el futuro aparece evidencia de una
 * INCONSISTENCIA DENTRO DEL MISMO SYNC (Shoplogix literalmente contradiciéndose
 * a sí mismo en la misma consulta) — un caso distinto y mucho más raro que
 * justificaría una regla puntual y bien acotada, nunca una regla histórica.
 */

/**
 * Reglas por planta: rangos de hora de inicio → nombre canónico.
 * `fromMin`/`toMin` en minutos desde medianoche (wall-clock-as-UTC). Un rango
 * con from > to cruza medianoche (ej. 22:00→08:00).
 *
 * VACÍO A PROPÓSITO — ver historia arriba. No agregar reglas basadas en
 * patrones históricos; solo ante evidencia de auto-inconsistencia real.
 */
const CANONICAL_SHIFTS = {
  // yal: sin reglas (ver historia arriba — la regla anterior quedó revertida).
  // chonchi: sin reglas (etiquetado consistente, nunca las necesitó).
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
