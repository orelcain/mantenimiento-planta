/**
 * graderPauseTiers.ts — etiquetas y colores para los tiers de pausa.
 *
 * FUENTE ÚNICA DE VERDAD para la representación visible de `PauseTier`
 * (`pausa | larga | parada`). Antes vivía duplicado en al menos 2 lugares:
 *   - `graderTurnToPDF.ts` (TIER_LABEL para tabla del PDF exportado)
 *   - `PauseAnnotationDialog.tsx` (objeto literal inline)
 *
 * Las definiciones de los tiers (tipos + lógica de detección) viven en
 * `graderPauseDetector.ts` y `types.ts`; este módulo se ocupa solo de
 * cómo presentarlos al usuario.
 *
 * Aplica el principio "consistencia entre elementos" del CLAUDE.md.
 */

import type { PauseTier } from './types'

/** Etiqueta legible (es-CL) por tier. */
export const PAUSE_TIER_LABEL: Record<PauseTier, string> = {
  pausa:  'Pausa',
  larga:  'Pausa larga',
  parada: 'Parada',
}

/**
 * Devuelve la etiqueta legible para un tier dado. Acepta también string
 * arbitrario (legacy) y devuelve el valor crudo cuando no matchea —
 * comportamiento idéntico al inline `{ pausa, larga, parada }[tier]`
 * que existía antes.
 */
export function pauseTierLabel(tier: PauseTier | string): string {
  return PAUSE_TIER_LABEL[tier as PauseTier] ?? tier
}
