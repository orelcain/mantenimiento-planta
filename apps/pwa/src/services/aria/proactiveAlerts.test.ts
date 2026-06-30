import { describe, it, expect } from 'vitest'
import { kpiTurnoAlerts, formatKpiAlertsMessage } from './proactiveAlerts'
import type { PlantKPIs } from '@/services/grader/plantKpiCompute'

function makeKpis(over: Partial<PlantKPIs>): PlantKPIs {
  return {
    dateKey: '2026-02-27',
    shiftId: 'Turno 2',
    periodLabel: 'Turno 2 · 2026-02-27',
    shiftsCount: 1,
    availability: 0.95,
    performance: 0.95,
    quality: 0.98,
    oee: 0.88,
    mttrMin: 3,
    mtbfHours: 4,
    failureCount: 1,
    microCount: 0,
    microMin: 0,
    machines: [],
    ...over,
  }
}

describe('kpiTurnoAlerts', () => {
  it('turno sano → sin avisos', () => {
    expect(kpiTurnoAlerts(makeKpis({}), 'chonchi', 'Planta Principal (Chonchi)')).toEqual([])
  })

  it('dispara por KPI bajo umbral, con severidad correcta y críticos primero', () => {
    const alerts = kpiTurnoAlerts(
      makeKpis({ oee: 0.4, availability: 0.8, mttrMin: 20, mtbfHours: 4 }),
      'chonchi',
      'Planta Principal (Chonchi)',
    )
    // OEE 40% (<50 = crítico), Disp 80% (70–85 = warn), MTTR 20min (>15 = crítico)
    expect(alerts.map((a) => `${a.metric}:${a.severity}`)).toEqual([
      'oee:critical',
      'mttr:critical',
      'availability:warn',
    ])
    expect(alerts[0]!.id).toBe('kpi:oee:chonchi:2026-02-27:Turno 2')
    expect(alerts[0]!.valueText).toBe('40%')
    expect(alerts.find((a) => a.metric === 'mttr')!.valueText).toBe('20.0 min')
  })

  it('KPI sin dato (null) NO genera aviso', () => {
    const alerts = kpiTurnoAlerts(
      makeKpis({ oee: null, quality: null, availability: 0.9, performance: 0.95, mttrMin: 2, mtbfHours: 3 }),
      'yal',
      'Planta Yal',
    )
    expect(alerts).toEqual([])
  })

  it('warn intermedio: OEE 60% (50–65) = warn, no crítico', () => {
    const alerts = kpiTurnoAlerts(makeKpis({ oee: 0.6 }), 'chonchi', 'Planta Principal (Chonchi)')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.metric).toBe('oee')
    expect(alerts[0]!.severity).toBe('warn')
  })
})

describe('formatKpiAlertsMessage', () => {
  it('sin avisos → null', () => {
    expect(formatKpiAlertsMessage([])).toBeNull()
  })
  it('arma mensaje con planta, turno y avisos', () => {
    const alerts = kpiTurnoAlerts(
      makeKpis({ oee: 0.4, mttrMin: 20 }),
      'chonchi',
      'Planta Principal (Chonchi)',
    )
    const msg = formatKpiAlertsMessage(alerts)!
    expect(msg).toContain('Planta Principal (Chonchi)')
    expect(msg).toContain('Turno 2 · 2026-02-27')
    expect(msg).toContain('OEE en 40%')
    expect(msg).toContain('Análisis de Turno')
  })
})
