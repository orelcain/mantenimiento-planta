/**
 * Catálogo de tags para clasificar pausas del Grader.
 *
 * Cada tag tiene:
 *   - `id`: clave estable persistida en Firestore (no cambiar sin migración)
 *   - `label`: texto visible al usuario
 *   - `emoji`: icono corto para badges y chart
 *   - `color`: hex para texto/borde sobre fondo dark
 *   - `bandFill`: fill RGBA translúcido para la banda del markArea en el chart
 *
 * Hoy están hardcoded. Fase 4 moverá esto a Firestore (`graderPauseTags`) con
 * CRUD admin. La shape del tag se preserva para que la migración sea trivial.
 *
 * `colacion` existe tanto como auto-tag (asignado por `graderPauseDetector` cuando
 * la pausa cumple duración+horario esperado) como tag manual (admin lo confirma
 * o lo aplica a otra pausa que el detector no vio).
 */

export interface GraderPauseTag {
  id: string
  label: string
  emoji: string
  color: string
  bandFill: string
}

export const GRADER_PAUSE_TAGS: GraderPauseTag[] = [
  { id: 'colacion',     label: 'Colación',                    emoji: '🍽️', color: '#60a5fa', bandFill: 'rgba(59,130,246,0.16)' },
  { id: 'ejercicios',   label: 'Ejercicios compensatorios',   emoji: '🏃', color: '#fbbf24', bandFill: 'rgba(251,191,36,0.14)' },
  { id: 'mantencion',   label: 'Intervención de mantención',  emoji: '🔧', color: '#fb923c', bandFill: 'rgba(249,115,22,0.14)' },
  { id: 'cambio_lote',  label: 'Cambio de lote / calibre',    emoji: '📦', color: '#8b5cf6', bandFill: 'rgba(139,92,246,0.14)' },
  { id: 'limpieza',     label: 'Limpieza / sanitización',     emoji: '🧼', color: '#22d3ee', bandFill: 'rgba(34,211,238,0.14)' },
  { id: 'ajuste_gates', label: 'Ajuste configuración gates',  emoji: '⚙️', color: '#a78bfa', bandFill: 'rgba(167,139,250,0.14)' },
  { id: 'espera_mp',    label: 'Espera de materia prima',     emoji: '⏳', color: '#facc15', bandFill: 'rgba(250,204,21,0.14)' },
  { id: 'falla_equipo', label: 'Falla de equipo',             emoji: '⚠️', color: '#ef4444', bandFill: 'rgba(239,68,68,0.18)' },
  { id: 'otro',         label: 'Otro',                        emoji: '❓', color: '#94a3b8', bandFill: 'rgba(148,163,184,0.16)' },
]

export function getPauseTagById(id: string | undefined | null): GraderPauseTag | undefined {
  if (!id) return undefined
  return GRADER_PAUSE_TAGS.find((t) => t.id === id)
}

/**
 * Resuelve el tag efectivo de una pausa:
 *   1. `tag` manual anotado por admin (gana siempre)
 *   2. `autoTag` asignado por el detector
 *   3. undefined — sin clasificar
 */
export function resolveEffectiveTag(pause: { tag?: string; autoTag?: string }): GraderPauseTag | undefined {
  return getPauseTagById(pause.tag ?? pause.autoTag)
}
