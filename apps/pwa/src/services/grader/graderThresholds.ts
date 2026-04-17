/**
 * Umbrales centralizados del módulo Grader.
 * Fuentes:
 *   - Manual Marelec MS4/12 (OneDrive: ⚙️ GRADER/instruction manual Grader.pdf)
 *   - SOP CH-MT-ME-0002 (Instructivo Paso a Paso Calibracion Grader)
 *   - Análisis histórico de turnos (temporada 2025-2026)
 */

/** Umbrales P0 % (porcentaje de rechazo) */
export const P0_THRESHOLDS = {
  /** Objetivo ideal / warning: mismos para distinguir "en target" vs "sobre" */
  target: 2.0,
  warn: 2.0,
  critical: 4.0,
} as const

/** Umbrales gap entre peces */
export const GAP_THRESHOLDS = {
  /** Ratio largo/paso: >= 1.0 → overlapping (peces se solapan) */
  ratioCritical: 1.0,
  /** Ratio >= 0.7 → gap estrecho (warning) */
  ratioWarn: 0.7,
  /** Gap libre mínimo en metros */
  minGapM: 0.10,
  /** Gap óptimo */
  optimalGapM: 0.15,
} as const

/** Umbrales timing por gate */
export const TIMING_THRESHOLDS = {
  /** Margen OK en segundos */
  marginOkSec: 0.5,
  /** Margen warning */
  marginWarnSec: 0.15,
} as const

/** Umbrales balanza (Manual Marelec + SOP) */
export const BALANCE_THRESHOLDS = {
  /** Pocket vacío: rango aceptable en gramos */
  emptyPocketMinG: -5,
  emptyPocketMaxG: 5,
  /** Drift contra peso patrón 5000 g */
  driftWarnG: 20,
  /** Precisión stdev esperada por rango */
  precisionStdevLowG: 20,   // 0-5 kg
  precisionStdevHighG: 50,  // 5-15 kg
  /** Peso patrón oficial */
  standardWeightG: 5000,
} as const

/** Umbrales neumáticos (Manual Marelec) */
export const PNEUMATIC_THRESHOLDS = {
  /** Presión mínima suministro en bar (0.7 MPa = 7 bar) */
  minSupplyBar: 7.0,
  /** Presión efectiva mínima en gate */
  minEffectiveBar: 3.0,
  /** Presión efectiva warning */
  warnEffectiveBar: 4.0,
} as const

/** Umbrales físicos de la máquina (Manual Marelec) */
export const MACHINE_LIMITS = {
  /** Velocidad máxima cinta en m/s */
  maxBeltSpeedMps: 1.4,
  /** Dimensión máxima pieza - largo en mm */
  maxPieceLengthMm: 1100,
  /** Dimensión máxima pieza - ancho en mm */
  maxPieceWidthMm: 290,
  /** Rango de pesaje en kg */
  minWeightKg: 0,
  maxWeightKg: 15,
} as const

/** Umbrales de tendencia intra-turno */
export const INTRA_SHIFT_THRESHOLDS = {
  /** Piezas mínimas para validar cambio post-acción */
  minPiecesPostAction: 200,
  /** Minutos mínimos post-acción para ver impacto */
  minMinutesPostAction: 10,
  /** Incremento P0 que dispara alerta "empeorando" */
  deteriorationDeltaPct: 1.0,
  /** Mejora P0 que dispara "funcionó" */
  improvementDeltaPct: 0.5,
} as const

export type Verdict = 'ok' | 'warn' | 'critical'

export function verdictFromP0Pct(pct: number): Verdict {
  if (pct >= P0_THRESHOLDS.critical) return 'critical'
  if (pct >= P0_THRESHOLDS.warn) return 'warn'
  return 'ok'
}

export function verdictFromGapRatio(ratio: number): Verdict {
  if (ratio >= GAP_THRESHOLDS.ratioCritical) return 'critical'
  if (ratio >= GAP_THRESHOLDS.ratioWarn) return 'warn'
  return 'ok'
}

export function verdictFromMarginSec(marginSec: number): Verdict {
  if (marginSec < TIMING_THRESHOLDS.marginWarnSec) return 'critical'
  if (marginSec < TIMING_THRESHOLDS.marginOkSec) return 'warn'
  return 'ok'
}

export function verdictFromEffectivePressureBar(bar: number): Verdict {
  if (bar < PNEUMATIC_THRESHOLDS.minEffectiveBar) return 'critical'
  if (bar < PNEUMATIC_THRESHOLDS.warnEffectiveBar) return 'warn'
  return 'ok'
}
