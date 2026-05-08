/**
 * Sugerencias específicas para Planta Yal (eviscerado simplificado).
 *
 * Diferencias vs Chonchi (graderInsights/actionPlanSuggestions):
 * - Yal NO clasifica por calibre + calidad. Sus 3-4 gates físicas alimentan
 *   las 3 Baader 142 corriente arriba; el Marelec pesa pero solo deriva al
 *   Camión (gate 1) o al rechazo (gate 0).
 * - Las causas P0 dominantes son "Peso por debajo del mínimo" (peso bajo)
 *   y "No puede pesar. Productos demasiado próximos" (proximidad). NO hay
 *   fotocélula ni eye-sync que limpiar.
 * - Las acciones útiles son: revisar lotes/cosecha (peso bajo), bajar
 *   cadencia de entrada o aumentar separación (proximidad), chequear
 *   uptime Baader, validar throughput vs target.
 *
 * Reusa el tipo `SuggestedAction` para que ActionPlanPanel pueda renderizar
 * las sugerencias sin cambios. Los `actionTrigger` quedan undefined porque
 * Yal no tiene los modales de Chonchi (belt-rpm, gate-change).
 */

import type { PointZeroClassification } from './types'
import type { SuggestedAction } from './actionPlanSuggestions'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'

/**
 * Throughput target para Planta Yal (eviscerado puro, descabezado opcional):
 * 22 pz/min por Baader 142 × 3 máquinas = 66 pz/min nominal.
 * Margen del 10% bajo nominal antes de alertar.
 */
const YAL_TARGET_PIECES_PER_MIN = 60

/** Umbral P0 más conservador que Chonchi: Yal típicamente <0.5%. */
const YAL_P0_WARN_PCT = 1
const YAL_P0_CRITICAL_PCT = 3

/** Umbrales de causas P0 específicas: cuándo cada causa amerita acción. */
const YAL_LOW_WEIGHT_PCT_TOTAL_WARN = 0.3
const YAL_TOO_CLOSE_PCT_TOTAL_WARN = 0.3

/** Umbral de uptime Baader 142 (lineAvailability ∈ 0..1). */
const YAL_BAADER_UPTIME_WARN = 0.7

export interface YalSuggestionContext {
  /** P0% del turno (0..100). */
  p0Pct: number
  /** Total de piezas procesadas en el turno. Usado para calcular % por causa. */
  totalPieces: number
  /** Desglose Matrix de causas P0. Null si no hay datos clasificados. */
  byMatrixCause: PointZeroClassification['byMatrixCause'] | null
  /** Duración del turno en minutos (solo el rango productivo, sin colación). */
  shiftMinutes: number
  /** Snapshot Shoplogix de la línea Baader 142 upstream. Null si no hay datos. */
  upstreamSnapshot?: UpstreamLineSnapshot | null
}

export function deriveYalSuggestions(ctx: YalSuggestionContext): SuggestedAction[] {
  const actions: SuggestedAction[] = []

  // ── 1. P0 general elevado ──────────────────────────────────────────────────
  if (ctx.p0Pct >= YAL_P0_CRITICAL_PCT) {
    actions.push({
      id: 'yal-p0-critical',
      category: 'verificar',
      title: 'P0 crítico — escalar con supervisor',
      description: `Rechazo ${ctx.p0Pct.toFixed(2)}% supera umbral crítico (${YAL_P0_CRITICAL_PCT}%). Investigar causa raíz: revisar lotes en proceso, velocidad de línea y estado de Baader.`,
      severity: 'critical',
    })
  } else if (ctx.p0Pct >= YAL_P0_WARN_PCT) {
    actions.push({
      id: 'yal-p0-elevated',
      category: 'verificar',
      title: 'Punto Cero sobre el típico',
      description: `Rechazo ${ctx.p0Pct.toFixed(2)}% supera el típico de Yal (${YAL_P0_WARN_PCT}%). Revisar las causas dominantes abajo y validar que el lote actual cumpla peso mínimo.`,
      severity: 'warning',
    })
  }

  // ── 2. Peso bajo dominante ─────────────────────────────────────────────────
  // En Yal, "Peso por debajo del mínimo" indica salmones bajo el rango
  // configurado en Marelec. Acción: revisar el lote / cambiar tamaño objetivo.
  const lowWeight = ctx.byMatrixCause?.fuera_de_limites
  const lowWeightPctTotal = lowWeight && ctx.totalPieces > 0
    ? (lowWeight.pieces / ctx.totalPieces) * 100
    : 0
  if (lowWeight && lowWeightPctTotal >= YAL_LOW_WEIGHT_PCT_TOTAL_WARN) {
    actions.push({
      id: 'yal-low-weight',
      category: 'terreno',
      title: 'Rechazos por peso bajo elevados',
      description: `${lowWeight.pieces.toLocaleString('es-CL')} piezas (${lowWeightPctTotal.toFixed(2)}% del total) bajo el peso mínimo. Verificar tamaño de cosecha de los lotes en proceso. Posible mezcla con peces juveniles o subdimensionados.`,
      severity: lowWeightPctTotal >= YAL_LOW_WEIGHT_PCT_TOTAL_WARN * 3 ? 'critical' : 'warning',
      estimatedImpact: { metric: 'P0%', deltaPct: -Math.min(lowWeightPctTotal, 1) },
    })
    actions.push({
      id: 'yal-low-weight-config',
      category: 'oficina',
      title: 'Validar peso mínimo configurado en Marelec',
      description: 'Confirmar con planta si el peso mínimo del Marelec corresponde a la talla objetivo del cliente. Si la cosecha es realmente subdimensionada, considerar bajarlo temporalmente.',
      severity: 'recommended',
    })
  }

  // ── 3. Productos próximos (too close / too long) ───────────────────────────
  // El Marelec no logró pesar individualmente — piezas pegadas o alineadas
  // mal. Acción: bajar cadencia de entrada o ampliar separación entre piezas.
  const tooClose = ctx.byMatrixCause?.too_close_too_long
  const tooClosePctTotal = tooClose && ctx.totalPieces > 0
    ? (tooClose.pieces / ctx.totalPieces) * 100
    : 0
  if (tooClose && tooClosePctTotal >= YAL_TOO_CLOSE_PCT_TOTAL_WARN) {
    actions.push({
      id: 'yal-too-close',
      category: 'terreno',
      title: 'Productos muy próximos en banda',
      description: `${tooClose.pieces.toLocaleString('es-CL')} piezas (${tooClosePctTotal.toFixed(2)}%) llegaron demasiado próximas al sensor — el Marelec no las pudo pesar individualmente. Bajar cadencia de entrada al transportador o aumentar la separación entre productos en la cinta de alimentación.`,
      severity: tooClosePctTotal >= YAL_TOO_CLOSE_PCT_TOTAL_WARN * 3 ? 'critical' : 'warning',
      estimatedImpact: { metric: 'P0%', deltaPct: -Math.min(tooClosePctTotal, 1) },
    })
    actions.push({
      id: 'yal-too-close-belt-speed',
      category: 'verificar',
      title: 'Revisar velocidad de cinta de alimentación',
      description: 'Si la cinta upstream va más rápido que la del Marelec, los productos se acumulan. Validar sincronización con el operador de las Baader.',
      severity: 'recommended',
    })
  }

  // ── 4. Throughput bajo del target ──────────────────────────────────────────
  // Solo evaluar si hay al menos 60 min de producción (evita falsos positivos
  // en arranque o cierre).
  const piecesPerMin = ctx.shiftMinutes > 0
    ? ctx.totalPieces / ctx.shiftMinutes
    : 0
  if (ctx.shiftMinutes >= 60 && piecesPerMin > 0 && piecesPerMin < YAL_TARGET_PIECES_PER_MIN * 0.7) {
    actions.push({
      id: 'yal-low-throughput',
      category: 'verificar',
      title: 'Throughput bajo del objetivo',
      description: `${piecesPerMin.toFixed(0)} pzs/min vs target ~${YAL_TARGET_PIECES_PER_MIN} pzs/min (3 Baader 142 a 22 c/u). Verificar uptime de las Baader, paros recientes y velocidad efectiva de la línea.`,
      severity: piecesPerMin < YAL_TARGET_PIECES_PER_MIN * 0.5 ? 'critical' : 'warning',
    })
  }

  // ── 5. Baader uptime bajo ──────────────────────────────────────────────────
  if (ctx.upstreamSnapshot) {
    const uptimePct = ctx.upstreamSnapshot.lineAvailability
    if (uptimePct > 0 && uptimePct < YAL_BAADER_UPTIME_WARN) {
      actions.push({
        id: 'yal-baader-low-uptime',
        category: 'verificar',
        title: 'Uptime Baader 142 bajo',
        description: `Promedio de las 3 evisceradoras: ${(uptimePct * 100).toFixed(0)}% (umbral ${(YAL_BAADER_UPTIME_WARN * 100).toFixed(0)}%). Revisar Shoplogix por paros prolongados; un Baader detenido reduce el throughput total a 2/3.`,
        severity: uptimePct < YAL_BAADER_UPTIME_WARN * 0.7 ? 'critical' : 'warning',
      })
    }

    // Solo 1 o 2 Baader produciendo cuando deberían ser 3.
    if (
      ctx.upstreamSnapshot.machinesProducing > 0 &&
      ctx.upstreamSnapshot.machinesProducing < ctx.upstreamSnapshot.machines.length
    ) {
      const stoppedCount = ctx.upstreamSnapshot.machines.length - ctx.upstreamSnapshot.machinesProducing
      actions.push({
        id: 'yal-baader-machines-stopped',
        category: 'terreno',
        title: `${stoppedCount} Baader detenida${stoppedCount > 1 ? 's' : ''} ahora mismo`,
        description: `Solo ${ctx.upstreamSnapshot.machinesProducing} de ${ctx.upstreamSnapshot.machines.length} evisceradoras están en Uptime. Cada Baader detenida reduce ~33% del throughput.`,
        severity: stoppedCount >= 2 ? 'critical' : 'warning',
      })
    }
  }

  // ── 6. Sin causas dominantes y P0 bajo: turno saludable ────────────────────
  if (actions.length === 0) {
    actions.push({
      id: 'yal-healthy',
      category: 'verificar',
      title: 'Turno dentro de parámetros',
      description: `P0 ${ctx.p0Pct.toFixed(2)}% por debajo del umbral típico (${YAL_P0_WARN_PCT}%). Sin desvíos significativos en peso, proximidad ni throughput. Mantener monitoreo y validar al cierre.`,
      severity: 'recommended',
    })
  }

  return actions
}
