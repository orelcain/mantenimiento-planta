/**
 * URL canónica de la pestaña Gates de un turno, absoluta: se pega en Telegram
 * y quien la toca cae exactamente donde está la pauta. `shiftDocId` es el id
 * de ruta (`{dateKey}__{shiftId}`), con espacio y todo — se codifica entero.
 */
export function urlTurnoGates(shiftDocId: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}analisis-grader/turno/${encodeURIComponent(shiftDocId)}?vista=gates`
}
