/**
 * graderGateAssignment.ts — Helpers puros para análisis de asignación de gates.
 *
 * Extraídos de `GateBreakdownCard.tsx` para:
 *   - **Consistencia**: umbrales de ratio como constantes exportadas — fuente
 *     única de verdad para clasificar un gate como saturado/óptimo/sobredim.
 *   - **Testabilidad**: lógica pura sin React, cubierta con tests unitarios.
 *   - **Reutilización**: otros componentes (futuros action plans, runbooks)
 *     pueden clasificar gates con el mismo criterio.
 *
 * Ver principios UI/UX en CLAUDE.md sección "Reglas de desarrollo".
 */

// ── Umbrales de ratio (gates) — fuente única de verdad ───────────────────────
//
// `ratio = % producción del grupo / % gates asignados al grupo`
//
//   - ratio > 1.5 → saturado     (clasifica más piezas de las que le tocan)
//   - ratio < 0.5 → sobredim.    (capacidad ociosa — gates desperdiciados)
//   - 0.5 ≤ ratio ≤ 1.5 → óptimo (balanceado)

export const GATE_RATIO_THRESHOLDS = {
  /** Por encima de este ratio, el grupo está saturado. */
  saturatedAbove: 1.5,
  /** Por debajo de este ratio, el grupo está sobredimensionado. */
  oversizedBelow: 0.5,
} as const

export type GateAssignmentStatus = 'saturado' | 'optimo' | 'sobredimensionado'

/** Clasifica un grupo según su ratio. */
export function gateStatusFromRatio(ratio: number): GateAssignmentStatus {
  if (ratio > GATE_RATIO_THRESHOLDS.saturatedAbove) return 'saturado'
  if (ratio < GATE_RATIO_THRESHOLDS.oversizedBelow) return 'sobredimensionado'
  return 'optimo'
}

// ── Severidad del cambio (cautela visual) ─────────────────────────────────────
//
// Cuando se sugiere reasignar G_X de grupo A a grupo B, hay 3 niveles de riesgo:
//
//   - direct        → mismo calibre Y misma calidad   (cambio sin reconfiguración)
//   - adjustment    → 1 dimensión cambia              (calibre o calidad — ajuste menor)
//   - reconfigure   → AMBAS dimensiones cambian       (alto riesgo, validación criterios)

export type ReassignmentSeverity = 'direct' | 'adjustment' | 'reconfigure'

export function cautelaSeverity(
  fromCalibre: string, fromQuality: string,
  toCalibre: string,   toQuality: string,
): ReassignmentSeverity {
  const sameCalibre = fromCalibre.toLowerCase().trim() === toCalibre.toLowerCase().trim()
  const sameQuality = fromQuality.toLowerCase().trim() === toQuality.toLowerCase().trim()
  if (sameCalibre && sameQuality) return 'direct'
  if (sameCalibre || sameQuality) return 'adjustment'
  return 'reconfigure'
}

/** Color tailwind para badge de severidad — alineado con paleta del módulo. */
export function severityBadgeClass(sev: ReassignmentSeverity): string {
  switch (sev) {
    case 'direct':       return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    case 'adjustment':   return 'bg-amber-500/10   text-amber-400   border-amber-500/30'
    case 'reconfigure':  return 'bg-rose-500/10    text-rose-400    border-rose-500/30'
  }
}

/** Label corto para badge. */
export function severityLabel(sev: ReassignmentSeverity): string {
  switch (sev) {
    case 'direct':       return 'directo'
    case 'adjustment':   return 'ajuste'
    case 'reconfigure':  return 'reconfigurar'
  }
}

// ── Estimación de impacto post-reasignación ──────────────────────────────────
//
// Antes:  G_origen aporta X gates al grupo origen, G_destino tiene K_destino gates
//         con producción P_destino → ratio_destino = P_destino% / K_destino%
//
// Después: G_origen se mueve al grupo destino → grupo destino gana 1 gate (K+1)
//          y SIGUE recibiendo la misma producción (P_destino + P_origen_inferido).
//
// Asumiendo que las piezas de G_origen se distribuyen al grupo destino al mismo
// ritmo de producción del grupo de origen (proxy razonable en el corto plazo):
//
//   ratio_destino_post = (P_destino + P_origen_movido) / ((K_destino + 1) / N_total_gates)
//
// Esto es una ESTIMACIÓN — la producción real depende del flujo del próximo
// turno. Sirve como guía para decidir "vale la pena el cambio".

export interface RebalanceEstimate {
  /** Ratio del grupo destino antes de reasignar (saturado actual). */
  destBeforeRatio: number
  /** Ratio estimado del grupo destino tras reasignar. */
  destAfterRatio: number
  /** Status del grupo destino después de reasignar (saturado/óptimo/sobredim). */
  destAfterStatus: GateAssignmentStatus
  /** True si la reasignación lleva al grupo destino al rango óptimo. */
  improvesDestination: boolean
}

export function estimateRebalanceImpact(args: {
  destProductionPct: number   // % producción del grupo destino (saturado)
  destGatesCount: number      // # gates del grupo destino
  numActiveGates: number      // total de gates activos en el turno
  fromGateProductionPct: number  // % producción del gate origen (movido)
}): RebalanceEstimate {
  const { destProductionPct, destGatesCount, numActiveGates, fromGateProductionPct } = args

  // % gates asignados al destino antes/después
  const destGatesPctBefore = (destGatesCount / numActiveGates) * 100
  const destGatesPctAfter  = ((destGatesCount + 1) / numActiveGates) * 100

  const destBeforeRatio = destGatesPctBefore > 0 ? destProductionPct / destGatesPctBefore : 0

  // Asumimos que la producción del destino aumenta en fromGateProductionPct (proxy)
  const destProdAfter   = destProductionPct + fromGateProductionPct
  const destAfterRatio  = destGatesPctAfter > 0 ? destProdAfter / destGatesPctAfter : 0

  const destAfterStatus = gateStatusFromRatio(destAfterRatio)
  const improvesDestination =
    destBeforeRatio > GATE_RATIO_THRESHOLDS.saturatedAbove &&
    destAfterStatus === 'optimo'

  return { destBeforeRatio, destAfterRatio, destAfterStatus, improvesDestination }
}

// ── Cuantificación del potencial total reasignable del turno ─────────────────
//
// Suma las piezas que las sugerencias proponen mover. Útil para mostrar en el
// badge de diagnóstico: "Asignación subóptima · ~3.5k pzas reasignables".

export function quantifyReassignable(suggestions: { fromPieces: number }[]): {
  totalPieces: number
  count: number
} {
  return {
    totalPieces: suggestions.reduce((s, x) => s + (x.fromPieces ?? 0), 0),
    count: suggestions.length,
  }
}
