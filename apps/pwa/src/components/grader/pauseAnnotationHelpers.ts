/**
 * Helpers puros para PauseAnnotationDialog.
 *
 * Extraído del archivo del componente para satisfacer la regla
 * `react-refresh/only-export-components` (Vite HMR no funciona si un módulo
 * exporta funciones no-componente junto con un componente).
 */

import type { TimelineBucket } from '@/services/grader/types'

/**
 * Calcula el contexto P0% de una pausa: antes de empezar (window móvil
 * `windowMin` minutos previos al `pauseStartIso`) y durante toda su duración.
 *
 * La hipótesis operacional: las pausas largas suelen seguir a un deterioro
 * de calidad — ver "antes → durante" ayuda al admin a clasificar el motivo
 * (mantención reactiva vs. preventiva, colación, falla de planta, etc).
 *
 * Devuelve `null` cuando no hay buckets ni en la window "antes" ni en
 * "durante" — sin data útil que mostrar.
 *
 * Los timestamps siguen la convención Z-as-wall-clock-local del módulo:
 * los ISO con sufijo 'Z' representan hora local Chile sin conversión TZ.
 * `Date.parse` y comparación numérica en ms son válidos porque ambos
 * lados (buckets y pausa) usan la misma convención.
 *
 * Bordes:
 *   - bucket en `pauseStartIso` exacto → "durante" (inclusive)
 *   - bucket en `pauseEndIso` exacto   → excluido (exclusive)
 *   - bucket en `pauseStartIso − windowMin*60s` exacto → "antes" (inclusive)
 */
export function computePauseP0Context(
  buckets: TimelineBucket[],
  pauseStartIso: string,
  pauseEndIso: string,
  windowMin: number,
): { beforePct: number | null; duringPct: number | null; beforePieces: number; duringPieces: number } | null {
  if (buckets.length === 0) return null
  const startMs = Date.parse(pauseStartIso)
  const endMs = Date.parse(pauseEndIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  const beforeFromMs = startMs - windowMin * 60_000

  let beforePieces = 0
  let beforeP0 = 0
  let duringPieces = 0
  let duringP0 = 0
  for (const b of buckets) {
    const ms = Date.parse(b.tsMin)
    if (!Number.isFinite(ms)) continue
    if (ms >= beforeFromMs && ms < startMs) {
      beforePieces += b.pieces
      beforeP0 += b.p0Pieces ?? 0
    } else if (ms >= startMs && ms < endMs) {
      duringPieces += b.pieces
      duringP0 += b.p0Pieces ?? 0
    }
  }

  const beforePct = beforePieces > 0 ? (beforeP0 / beforePieces) * 100 : null
  const duringPct = duringPieces > 0 ? (duringP0 / duringPieces) * 100 : null
  // Sin información útil en ambos lados → no mostrar chip.
  if (beforePct === null && duringPct === null && beforePieces === 0 && duringPieces === 0) return null
  return { beforePct, duringPct, beforePieces, duringPieces }
}
