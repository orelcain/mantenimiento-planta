/**
 * Empareja comentarios de operador con el state (paro/estado) al que
 * corresponden, usando la correlación temporal + razón que Shoplogix ya trae
 * en cada comentario (ver `UpstreamShiftComment`). Reproduce la vista
 * "Análisis" nativa de Shoplogix (Tipo/Razón/Comentario por fila) en vez de
 * la lista de texto suelta sin relación al timeline que se mostraba antes.
 *
 * Lógica pura, sin dependencias externas — testeable con fixtures.
 */

import type { UpstreamMachineState, UpstreamShiftComment } from './types'
import { overlapSec } from './shoplogixCorrelation'

export interface CommentStateMatch {
  comment: UpstreamShiftComment
  /** State emparejado, o null si el turno no tiene NINGÚN state (huérfano real). */
  state: UpstreamMachineState | null
}

/**
 * Criterio de matching (en orden):
 *  1. Candidatos = states cuyo `reason` (case-insensitive, trim) === comment.reasonValue.
 *     Si reasonValue viene vacío, o ningún state calza esa razón, candidatos = TODOS los states del turno.
 *  2. Entre los candidatos, gana el de MAYOR solape temporal con [comment.startAt, comment.endAt].
 *  3. Si el mejor solape es 0 (ningún candidato se solapa), desempata por menor distancia
 *     temporal entre comment.startAt y el borde más cercano del state.
 *  4. Si el turno no tiene ningún state → el comentario queda huérfano (state: null),
 *     nunca se descarta silenciosamente.
 */
export function matchCommentToState(
  comment: UpstreamShiftComment,
  states: UpstreamMachineState[],
): UpstreamMachineState | null {
  if (states.length === 0) return null

  const reason = comment.reasonValue.trim().toUpperCase()
  const byReason = reason ? states.filter(s => s.reason.trim().toUpperCase() === reason) : []
  const candidates = byReason.length > 0 ? byReason : states

  let best: UpstreamMachineState | null = null
  let bestOverlap = -1
  for (const s of candidates) {
    const overlap = overlapSec(comment.startAt, comment.endAt, s.startAt, s.endAt)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = s
    }
  }
  if (bestOverlap > 0) return best

  // Sin solape entre ningún candidato: el más cercano en el tiempo.
  let closest: UpstreamMachineState | null = null
  let closestDist = Infinity
  for (const s of candidates) {
    const dist = Math.min(
      Math.abs(comment.startAt.getTime() - s.startAt.getTime()),
      Math.abs(comment.startAt.getTime() - s.endAt.getTime()),
    )
    if (dist < closestDist) {
      closestDist = dist
      closest = s
    }
  }
  return closest
}

/** Empareja TODOS los comentarios de un turno contra sus states. */
export function matchCommentsToStates(
  comments: UpstreamShiftComment[],
  states: UpstreamMachineState[],
): CommentStateMatch[] {
  return comments.map(comment => ({ comment, state: matchCommentToState(comment, states) }))
}
