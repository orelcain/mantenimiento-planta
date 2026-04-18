import type { GraderShiftDoc, ShiftActionEntry } from './graderShifts.service'

export interface AttributionEntry {
  action: ShiftActionEntry
  impact: {
    metric: 'P0%'
    beforePct: number
    afterPct: number
    /** negativo = mejora */
    deltaPct: number
    confidence: 'high' | 'medium' | 'low'
  }
}

export interface AttributionReport {
  shiftId: string
  actionsApplied: AttributionEntry[]
  /** suma de deltaPct — negativo = mejora neta del turno */
  totalImprovement: number
}

export interface AggregatedAttribution {
  topImpactfulActions: Array<{
    field: string
    totalDelta: number
    timesApplied: number
    avgDelta: number
  }>
  totalShiftsWithActions: number
  avgImprovementPerAction: number
}

/** Confidence según tamaño de muestra post-acción */
function confidenceLevel(piecesAfter: number): 'high' | 'medium' | 'low' {
  if (piecesAfter >= 1000) return 'high'
  if (piecesAfter >= 300) return 'medium'
  return 'low'
}

export function computeShiftAttribution(shift: GraderShiftDoc): AttributionReport {
  const actionsApplied: AttributionEntry[] = []

  for (const action of shift.actions) {
    if (!action.outcome || action.outcome.verdict === 'insufficient-data') continue
    const { p0BeforePct, p0AfterPct, piecesAfter } = action.outcome
    const deltaPct = +(p0AfterPct - p0BeforePct).toFixed(3)

    actionsApplied.push({
      action,
      impact: {
        metric: 'P0%',
        beforePct: p0BeforePct,
        afterPct: p0AfterPct,
        deltaPct,
        confidence: confidenceLevel(piecesAfter),
      },
    })
  }

  const totalImprovement = +actionsApplied
    .reduce((sum, e) => sum + e.impact.deltaPct, 0)
    .toFixed(3)

  return { shiftId: shift.id, actionsApplied, totalImprovement }
}

export function aggregateAttribution(shifts: GraderShiftDoc[]): AggregatedAttribution {
  const fieldMap = new Map<string, { totalDelta: number; count: number }>()
  let totalShiftsWithActions = 0
  let totalActionCount = 0
  let totalDeltaSum = 0

  for (const shift of shifts) {
    const report = computeShiftAttribution(shift)
    if (report.actionsApplied.length === 0) continue
    totalShiftsWithActions++

    for (const entry of report.actionsApplied) {
      const { field } = entry.action
      const existing = fieldMap.get(field) ?? { totalDelta: 0, count: 0 }
      fieldMap.set(field, {
        totalDelta: existing.totalDelta + entry.impact.deltaPct,
        count: existing.count + 1,
      })
      totalActionCount++
      totalDeltaSum += entry.impact.deltaPct
    }
  }

  const topImpactfulActions = Array.from(fieldMap.entries())
    .map(([field, v]) => ({
      field,
      totalDelta: +v.totalDelta.toFixed(3),
      timesApplied: v.count,
      avgDelta: +(v.totalDelta / v.count).toFixed(3),
    }))
    .sort((a, b) => a.totalDelta - b.totalDelta) // más negativo primero (= más mejora)
    .slice(0, 10)

  const avgImprovementPerAction =
    totalActionCount > 0 ? +(totalDeltaSum / totalActionCount).toFixed(3) : 0

  return { topImpactfulActions, totalShiftsWithActions, avgImprovementPerAction }
}
