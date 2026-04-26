/**
 * Insights determinísticos generados desde un `GraderDailySummary`.
 *
 * A diferencia de `graderInsights.ts` (que opera sobre `GraderAnalyticsResult`
 * completo parseado de Excel), este módulo trabaja con los KPIs pre-computados
 * y guardados en Firestore — sin re-parsear ningún archivo.
 *
 * Reglas implementadas:
 *  1. P0% elevado (warn ≥2%, critical ≥3.5%)
 *  2. Concentración de causa P0 (una causa > 60% del total P0)
 *  3. Muestra pequeña (<500 piezas → P0% poco fiable)
 *  4. Tendencia ascendente de P0% (si se pasan turnos recientes)
 *  5. Turno muy largo (>13 h → posible error de timestamps o turno combinado)
 */

import type { GraderDailySummary } from './types'
import { DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT } from './graderP0Thresholds'

export interface SummaryInsight {
  id: string
  severity: 'info' | 'warn' | 'critical'
  title: string
  evidence: string[]
  recommendations: string[]
}

const P0_WARN     = DEFAULT_P0_ALERT_PCT
const P0_CRITICAL = DEFAULT_P0_CRITICAL_PCT
const MIN_PIECES  = 500  // muestra mínima confiable
const CAUSE_CONCENTRATION = 60 // % de una sola causa sobre el total P0

let _counter = 0
function nextId(): string { return `si-${++_counter}` }

export function computeInsightsFromSummary(
  summary: GraderDailySummary,
  recentTurns?: GraderDailySummary[],
): SummaryInsight[] {
  _counter = 0
  const insights: SummaryInsight[] = []

  // ── 1. P0% general ──────────────────────────────────────────────────────────
  if (summary.pointZeroPct >= P0_WARN) {
    const sev = summary.pointZeroPct >= P0_CRITICAL ? 'critical' : 'warn'
    insights.push({
      id: nextId(),
      severity: sev,
      title: sev === 'critical' ? 'Punto Cero crítico' : 'Punto Cero elevado',
      evidence: [
        `P0%: ${summary.pointZeroPct}% (${summary.pointZeroPieces.toLocaleString('es-CL')} piezas)`,
        `Umbral advertencia: ${P0_WARN}% · Crítico: ${P0_CRITICAL}%`,
      ],
      recommendations: [
        'Verificar calibración y limpieza de la grader.',
        'Revisar configuración de rangos de clasificación.',
        'Comparar con el turno anterior para identificar cambio.',
      ],
    })
  }

  // ── 2. Concentración de causa P0 ────────────────────────────────────────────
  const causes = summary.topP0Causes ?? []
  const top = causes[0]
  if (top && summary.pointZeroPieces > 0 && top.pct >= CAUSE_CONCENTRATION) {
    insights.push({
      id: nextId(),
      severity: 'warn',
      title: `Causa dominante: "${top.error}"`,
      evidence: [
        `${top.error}: ${top.pieces.toLocaleString('es-CL')} piezas (${top.pct}% del total P0)`,
        `Concentración sobre ${CAUSE_CONCENTRATION}% en una sola causa.`,
      ],
      recommendations: [
        'Concentrar revisión en esta causa específica.',
        'Verificar la sección del equipo relacionada con este tipo de error.',
      ],
    })
  }

  // ── 3. Muestra pequeña ──────────────────────────────────────────────────────
  if (summary.totalPieces < MIN_PIECES) {
    insights.push({
      id: nextId(),
      severity: 'info',
      title: 'Muestra pequeña — P0% poco fiable',
      evidence: [
        `Solo ${summary.totalPieces.toLocaleString('es-CL')} piezas procesadas.`,
        `Mínimo recomendado para estadísticas fiables: ${MIN_PIECES.toLocaleString('es-CL')} piezas.`,
      ],
      recommendations: [
        'Interpretar el P0% con cautela — la variabilidad es alta con muestras pequeñas.',
        'Verificar si el turno estuvo completo o fue interrumpido.',
      ],
    })
  }

  // ── 4. Tendencia ascendente ──────────────────────────────────────────────────
  if (recentTurns && recentTurns.length >= 3) {
    // Tomar hasta los 5 turnos más recientes antes del turno actual
    const prior = [...recentTurns]
      .filter((t) => t.dateKey < summary.dateKey || (t.dateKey === summary.dateKey && t.shiftId < summary.shiftId))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.shiftId.localeCompare(b.shiftId))
      .slice(-5)
      .filter((t) => t.totalPieces >= MIN_PIECES) // excluir muestras pequeñas

    if (prior.length >= 3) {
      // Calcular pendiente simple (últimos N vs primeros N de la ventana)
      const half = Math.floor(prior.length / 2)
      const avgFirst = prior.slice(0, half).reduce((s, t) => s + t.pointZeroPct, 0) / half
      const avgLast  = prior.slice(-half).reduce((s, t) => s + t.pointZeroPct, 0) / half
      const delta = avgLast - avgFirst

      if (delta >= 0.5 && summary.pointZeroPct > avgLast) {
        insights.push({
          id: nextId(),
          severity: 'warn',
          title: 'Tendencia ascendente de P0%',
          evidence: [
            `P0% promedio primeros ${half} turnos analizados: ${avgFirst.toFixed(2)}%`,
            `P0% promedio últimos ${half} turnos analizados: ${avgLast.toFixed(2)}%`,
            `Turno actual: ${summary.pointZeroPct}%`,
            `Incremento detectado: +${delta.toFixed(2)} puntos porcentuales.`,
          ],
          recommendations: [
            'Monitorear el próximo turno con atención.',
            'Revisar si hay deterioro progresivo en fotocélulas o rodillos.',
            'Comparar configuración de gates con los turnos de menor P0%.',
          ],
        })
      }
    }
  }

  // ── 5. Turno muy largo (posible error de timestamps) ─────────────────────────
  if (summary.durationMinutes != null && summary.durationMinutes > 13 * 60) {
    insights.push({
      id: nextId(),
      severity: 'info',
      title: 'Duración inusualmente larga',
      evidence: [
        `Duración: ${Math.round(summary.durationMinutes / 60 * 10) / 10} h (${summary.durationMinutes} min).`,
        'Los turnos normales son de 12 h máx. (Turno día 07-19, Turno noche 19-07).',
      ],
      recommendations: [
        'Verificar si el turno fue cargado desde múltiples archivos solapados.',
        'Revisar los tiempos de inicio y fin en los Excel fuente.',
      ],
    })
  }

  return insights
}
