/**
 * Segmentación de P0% por cambio de configuración de gates.
 *
 * Dado un conjunto de `GateConfigSnapshot` (cambios registrados manualmente
 * por el admin) y los `TimelineBucket` del turno (P0% por minuto), calcula
 * para cada cambio su verdict: ¿mejoró o empeoró el P0% después?
 *
 * Usado en ConfigChangeHistory para mostrar "✅ -2.3pts en 47 min" debajo
 * de cada snapshot manual.
 *
 * Reglas:
 *  - Los snapshots synthetic se ignoran (representan config inicial, no
 *    cambios concretos de momento conocido).
 *  - El "antes" de un cambio = todos los buckets con tsMin < snap.at
 *  - El "después" de un cambio = buckets entre snap.at y el PRÓXIMO snapshot
 *    manual (o fin del turno si es el último)
 *  - Si el "después" tiene <30 piezas → 'insufficient-data' (espera más)
 *  - Si Δ < -0.5 pts → 'improved'
 *  - Si Δ > +0.5 pts → 'worsened'
 *  - Resto → 'neutral'
 */

import type { TimelineBucket } from './types'
import type { GateConfigSnapshot } from './graderConfigSnapshot.service'

export interface SegmentVerdict {
  beforePct: number
  afterPct: number
  /** Minutos transcurridos desde el cambio hasta el último dato disponible */
  afterMinutes: number
  /** Piezas contadas en el segmento "después" */
  afterPieces: number
  /** Diferencia (afterPct - beforePct) en puntos porcentuales */
  delta: number
  status: 'improved' | 'worsened' | 'neutral' | 'insufficient-data'
}

/**
 * Mínimo de piezas en el segmento "después" para emitir un veredicto.
 *
 * Si el cambio se acaba de hacer y aún no llegan suficientes piezas, no se
 * puede declarar mejora/empeoramiento — devuelve `'insufficient-data'`.
 *
 * Exportado para que la UI muestre el umbral en tooltips y mantenga
 * consistencia entre componentes (principio "fuente única de verdad").
 */
export const MIN_PIECES_AFTER_THRESHOLD = 30

/**
 * Magnitud mínima de delta P0% (puntos porcentuales) para clasificar como
 * mejora/empeoramiento. Por debajo (en magnitud) se clasifica `'neutral'`.
 *
 * Diseño: la condición es ESTRICTA (`< -0.5` y `> +0.5`), por lo que un delta
 * de ±0.5 exacto cae en `neutral`. Esto evita oscilaciones por ruido cuando
 * el cambio fue marginal.
 */
export const DELTA_THRESHOLD_PTS = 0.5

// Aliases internos legacy — no usar en código nuevo
const MIN_PIECES_AFTER = MIN_PIECES_AFTER_THRESHOLD
const DELTA_THRESHOLD  = DELTA_THRESHOLD_PTS

export function computeSegmentVerdicts(
  snapshots: GateConfigSnapshot[],
  timelineBuckets: TimelineBucket[],
): Map<string, SegmentVerdict> {
  // Solo cambios manuales en orden cronológico. Synthetic se ignora.
  const manualSnaps = snapshots
    .filter(s => !s.synthetic)
    .sort((a, b) => a.at.localeCompare(b.at))

  const result = new Map<string, SegmentVerdict>()

  for (let i = 0; i < manualSnaps.length; i++) {
    const snap = manualSnaps[i]
    if (!snap) continue
    const nextAt = manualSnaps[i + 1]?.at
    // El "antes" es el segmento entre el snapshot manual previo (o inicio del
    // turno si es el primero) y este snapshot. Comparar contra "todo el turno
    // hasta acá" sería sesgado si hubo varios cambios cercanos.
    const prevAt = manualSnaps[i - 1]?.at

    const beforeBuckets = timelineBuckets.filter(b => {
      if (prevAt && b.tsMin < prevAt) return false
      return b.tsMin < snap.at
    })
    const afterBuckets  = timelineBuckets.filter(b => {
      if (b.tsMin < snap.at) return false
      if (nextAt && b.tsMin >= nextAt) return false
      return true
    })

    const beforeTotal = beforeBuckets.reduce((s, b) => s + b.pieces, 0)
    const beforeP0    = beforeBuckets.reduce((s, b) => s + b.p0Pieces, 0)
    const afterTotal  = afterBuckets.reduce((s, b) => s + b.pieces, 0)
    const afterP0     = afterBuckets.reduce((s, b) => s + b.p0Pieces, 0)

    const beforePct = beforeTotal > 0 ? (beforeP0 / beforeTotal) * 100 : 0
    const afterPct  = afterTotal  > 0 ? (afterP0  / afterTotal)  * 100 : 0
    const delta = afterPct - beforePct

    let status: SegmentVerdict['status']
    if (afterTotal < MIN_PIECES_AFTER)   status = 'insufficient-data'
    else if (delta < -DELTA_THRESHOLD)   status = 'improved'
    else if (delta >  DELTA_THRESHOLD)   status = 'worsened'
    else                                 status = 'neutral'

    const lastAfter = afterBuckets[afterBuckets.length - 1]
    const afterMinutes = lastAfter
      ? Math.round((new Date(lastAfter.tsMin).getTime() - new Date(snap.at).getTime()) / 60_000)
      : 0

    result.set(snap.id, {
      beforePct: +beforePct.toFixed(2),
      afterPct:  +afterPct.toFixed(2),
      afterMinutes,
      afterPieces: afterTotal,
      delta: +delta.toFixed(2),
      status,
    })
  }

  return result
}
