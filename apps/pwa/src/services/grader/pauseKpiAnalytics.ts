/**
 * pauseKpiAnalytics.ts — Helpers puros del PauseKpiDashboard.
 *
 * Extraídos del componente para satisfacer
 * `react-refresh/only-export-components` y permitir reuso/tests sin React.
 */

import { isOperationalTag, isOrganizationalTag } from './graderPauseTags'

/** ID interno usado por el dashboard para "sin clasificar" en el tagBreakdown. */
export const SIN_TAG_ID = '__sin_tag'

/**
 * Suma agregada por categoría (operacional/organizacional/sin clasificar)
 * sobre un tagBreakdown — usada para distinguir tiempo evitable vs ineludible.
 *
 * - operacional: falla, mantención, espera MP, ajuste gates, otro
 * - organizacional: colación, ejercicios, cambio_lote, limpieza
 * - sin_clasificar: incluye SIN_TAG_ID + cualquier tag desconocido
 */
export function summarizeByCategory(tagBreakdown: Record<string, number>): {
  operationalSec: number
  organizationalSec: number
  unclassifiedSec: number
  totalSec: number
} {
  let operationalSec = 0
  let organizationalSec = 0
  let unclassifiedSec = 0
  for (const [id, sec] of Object.entries(tagBreakdown)) {
    if (id === SIN_TAG_ID) unclassifiedSec += sec
    else if (isOperationalTag(id)) operationalSec += sec
    else if (isOrganizationalTag(id)) organizationalSec += sec
    else unclassifiedSec += sec  // tag desconocido → "sin clasificar"
  }
  return {
    operationalSec,
    organizationalSec,
    unclassifiedSec,
    totalSec: operationalSec + organizationalSec + unclassifiedSec,
  }
}
