/**
 * ¿La línea tiene un turno en curso? Lógica pura, sin Firestore (ver
 * `turnoEnCursoDePlanta` en `monitorDeLinea.ts`).
 */

/** Lo mínimo de un doc padre `shoplogix/{plant}/shifts/{fecha}_{turno}`. */
export interface TurnoLigero {
  id: string
  effectiveStart?: unknown
  endBriefSentAt?: unknown
  /** UTC real (Timestamp de Firestore). */
  lastSyncAt?: { toMillis(): number } | null
}

/** El sync corre cada ~5 min con el turno vivo; sin noticias en 20, no hay turno. */
const SYNC_VIVO_MS = 20 * 60_000

/**
 * Hay turno en curso si algún turno con nombre (no el `Unscheduled`, que
 * duplica los intervalos) ya arrancó, todavía no tiene el brief de cierre y
 * el sync lo tocó hace poco.
 *
 * El cierre se lee de `endBriefSentAt` y no de `scheduledEnd`: ese se deriva
 * del último intervalo y hacía ver cerrado un turno vivo. El brief sale ~10
 * min después del fin, así que el estado se queda «en turno» ese rato.
 * Solo compara `lastSyncAt` (UTC real) contra el reloj: los horarios del turno
 * son wall-clock serializado como UTC y no se mezclan acá.
 */
export function hayTurnoEnCurso(turnos: readonly TurnoLigero[], ahoraMs: number): boolean {
  return turnos.some((t) => {
    if (t.id.endsWith('_Unscheduled')) return false
    if (t.effectiveStart == null || t.endBriefSentAt != null) return false
    const sync = t.lastSyncAt?.toMillis?.()
    return sync != null && ahoraMs - sync <= SYNC_VIVO_MS
  })
}
