/**
 * GraderGatesLector — el lector «qué mirar ahora» del tab Compuertas.
 *
 * Caso real que motivó el patrón (memoria del Grader): el 8-10 lb concentró
 * el 55% de las piezas con solo 3 de 12 gates asignados, y uno de esos
 * (G9) además crítico de timing. El lector debe destilar eso en un titular
 * accionable + pauta; y con todo verde NO debe existir (una alerta que
 * aparece siempre se deja de leer — regla heredada del protocolo 142).
 *
 * Se asierta sobre `container.textContent` porque los números viven
 * partidos entre varios nodos.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GraderGatesLector } from '../GraderGatesLector'
import type { GateAssignment, GraderAnalyticsResult } from '@/services/grader/types'
import type { GateTimingSignal } from '@/services/grader/graderGateTiming'

const gate = (n: number, calibre: string, active = true): GateAssignment => ({
  gateNumber: n,
  assignedQuality: 'HON' as GateAssignment['assignedQuality'],
  assignedCalibre: calibre,
  active,
})

const GATES: GateAssignment[] = [
  gate(1, '10-12 lb'), gate(2, '', false), gate(3, '8-10 lb'), gate(4, '6-8 lb'),
  gate(5, '6-8 lb'), gate(6, '10-12 lb'), gate(7, '8-10 lb'), gate(8, '12-14 lb'),
  gate(9, '8-10 lb'), gate(10, '4-6 lb'), gate(11, '14+ lb'), gate(12, '2-4 lb'),
]

const timing = (n: number, status: GateTimingSignal['status'], hint = ''): GateTimingSignal => ({
  gateNumber: n,
  distanceMeters: 1,
  beltSpeedMps: 1,
  tAvailableSec: 0.41,
  tRequiredSec: 0.52,
  marginSec: status === 'critical' ? -0.11 : 0.3,
  status,
  hint,
} as GateTimingSignal)

const TIMING: GateTimingSignal[] = [
  ...[1, 3, 4, 5, 6, 7, 8, 10, 11, 12].map((n) => timing(n, 'ok')),
  timing(9, 'critical', 'flipper con 0,41 s y necesita 0,52 s'),
]

const analytics = (overrides: Partial<GraderAnalyticsResult>): GraderAnalyticsResult =>
  ({
    gateBalance: [],
    gateSwapSuggestions: [],
    gateAdvancedStats: GATES.map((g) => ({
      gateNumber: g.gateNumber, pieces: 100, weightKg: 400, avgWeightGrams: 4000,
      stdDevWeightGrams: 200, cv: 0.05, utilizationPct: 8.3,
      assignedCalibre: g.assignedCalibre, assignedQuality: g.assignedQuality,
      mismatchPct: g.gateNumber === 7 ? 22 : 2, calibreBreakdown: {},
    })),
    ...overrides,
  } as unknown as GraderAnalyticsResult)

const CASO_REAL = analytics({
  gateBalance: [
    {
      calibre: '8-10 lb', demandPct: 55, gatesAssigned: 3, idealGates: 7, gap: -4,
      severity: 'critical',
      message: 'El calibre 8-10 lb concentra el 55% de las piezas y solo tiene 3 gates.',
    },
    {
      calibre: '6-8 lb', demandPct: 12, gatesAssigned: 2, idealGates: 1, gap: 1,
      severity: 'warn', message: 'A 6-8 lb le sobra un gate.',
    },
  ] as GraderAnalyticsResult['gateBalance'],
  gateSwapSuggestions: [
    {
      type: 'swap', gateNumber: 9, currentCalibre: '8-10 lb', suggestedCalibre: '6-8 lb',
      reason: 'G9 crítico de timing; 6-8 lb le da margen', impactScore: 8, evidence: [],
    },
  ] as GraderAnalyticsResult['gateSwapSuggestions'],
})

const montar = (a: GraderAnalyticsResult, sig: GateTimingSignal[] = TIMING) =>
  render(
    <MemoryRouter>
      <GraderGatesLector analytics={a} gates={GATES} timingSignals={sig} etiquetaPeriodo="T2 22-08" />
    </MemoryRouter>,
  )

describe('GraderGatesLector', () => {
  it('con desbalance crítico: titular con el calibre dominante + pill + pauta desde los swaps', () => {
    const { container } = montar(CASO_REAL)
    const texto = container.textContent ?? ''
    expect(texto).toContain('Repartir el 8-10 lb')
    expect(texto).toContain('3 gates no dan abasto')
    expect(texto).toContain('55% · 3/12')
    // pauta: el swap calculado + el paso de verificación en el HMI
    expect(texto).toContain('Gate 9: 8-10 lb → 6-8 lb')
    expect(texto).toContain('Verificar en el HMI')
    // grilla glanceable: los 12 gates presentes, el inactivo marcado
    expect(texto).toContain('G12')
    expect(texto).toContain('inactivo')
    // mismatch alto visible en el tile; el hint de timing como leyenda (touch)
    expect(texto).toContain('22% no calza')
    expect(texto).toContain('flipper con 0,41 s y necesita 0,52 s')
  })

  it('timing crítico sin desbalance: titular de timing y pauta con el hint', () => {
    const { container } = montar(analytics({}))
    const texto = container.textContent ?? ''
    expect(texto).toContain('Timing crítico en 1 gate')
    expect(texto).toContain('flipper con 0,41 s')
  })

  it('todo verde: el lector NO se renderiza', () => {
    const { container } = montar(
      analytics({}),
      TIMING.map((s) => ({ ...s, status: 'ok' as const })),
    )
    expect(container.querySelector('[aria-label="Qué mirar ahora en los gates"]')).toBeNull()
    expect(container.textContent).toBe('')
  })
})
