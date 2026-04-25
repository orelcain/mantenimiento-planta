/**
 * Tests para graderGateAssignment.ts — helpers puros.
 *
 * Cubrimos:
 *   - Umbrales de ratio (constantes exportadas)
 *   - gateStatusFromRatio: clasificación + bordes exactos
 *   - cautelaSeverity: 4 combinaciones (calibre/calidad iguales/distintos)
 *   - severityBadgeClass + severityLabel: cobertura completa
 *   - estimateRebalanceImpact: casos típicos + bordes (división por cero, etc.)
 *   - quantifyReassignable: suma + casos vacíos
 */

import { describe, it, expect } from 'vitest'
import {
  GATE_RATIO_THRESHOLDS,
  gateStatusFromRatio,
  cautelaSeverity,
  severityBadgeClass,
  severityLabel,
  estimateRebalanceImpact,
  quantifyReassignable,
} from '../graderGateAssignment'

describe('GATE_RATIO_THRESHOLDS', () => {
  it('valores de umbral son los esperados (saturatedAbove=1.5, oversizedBelow=0.5)', () => {
    expect(GATE_RATIO_THRESHOLDS.saturatedAbove).toBe(1.5)
    expect(GATE_RATIO_THRESHOLDS.oversizedBelow).toBe(0.5)
  })
})

describe('gateStatusFromRatio', () => {
  it('saturado cuando ratio > 1.5', () => {
    expect(gateStatusFromRatio(1.51)).toBe('saturado')
    expect(gateStatusFromRatio(2.0)).toBe('saturado')
    expect(gateStatusFromRatio(10)).toBe('saturado')
  })
  it('sobredimensionado cuando ratio < 0.5', () => {
    expect(gateStatusFromRatio(0.49)).toBe('sobredimensionado')
    expect(gateStatusFromRatio(0.1)).toBe('sobredimensionado')
    expect(gateStatusFromRatio(0)).toBe('sobredimensionado')
  })
  it('óptimo en [0.5, 1.5] inclusive', () => {
    expect(gateStatusFromRatio(0.5)).toBe('optimo')
    expect(gateStatusFromRatio(1.0)).toBe('optimo')
    expect(gateStatusFromRatio(1.5)).toBe('optimo')
    expect(gateStatusFromRatio(0.75)).toBe('optimo')
    expect(gateStatusFromRatio(1.25)).toBe('optimo')
  })
})

describe('cautelaSeverity', () => {
  it('"direct" cuando calibre Y calidad son iguales (case insensitive + trim)', () => {
    expect(cautelaSeverity('250-300', 'premium', '250-300', 'premium')).toBe('direct')
    expect(cautelaSeverity('250-300', 'PREMIUM', '250-300', 'premium')).toBe('direct')
    expect(cautelaSeverity('  250-300  ', 'premium', '250-300', 'premium')).toBe('direct')
  })
  it('"adjustment" cuando solo cambia calibre', () => {
    expect(cautelaSeverity('250-300', 'premium', '300-400', 'premium')).toBe('adjustment')
  })
  it('"adjustment" cuando solo cambia calidad', () => {
    expect(cautelaSeverity('250-300', 'premium', '250-300', 'primera')).toBe('adjustment')
  })
  it('"reconfigure" cuando ambas dimensiones cambian', () => {
    expect(cautelaSeverity('250-300', 'premium', '300-400', 'primera')).toBe('reconfigure')
  })
})

describe('severityBadgeClass + severityLabel', () => {
  it('cubre los 3 niveles', () => {
    expect(severityLabel('direct')).toBe('directo')
    expect(severityLabel('adjustment')).toBe('ajuste')
    expect(severityLabel('reconfigure')).toBe('reconfigurar')

    expect(severityBadgeClass('direct')).toContain('emerald')
    expect(severityBadgeClass('adjustment')).toContain('amber')
    expect(severityBadgeClass('reconfigure')).toContain('rose')
  })
})

describe('estimateRebalanceImpact', () => {
  it('caso típico: destino saturado pasa a óptimo tras reasignación', () => {
    // Destino: 30% producción, 1 gate (de 6 totales) → ratio = 30/16.67 = 1.8 (saturado)
    // Origen mueve: 5% producción
    // Después: destino 35% producción, 2 gates de 6 → ratio = 35/33.33 = 1.05 (óptimo)
    const r = estimateRebalanceImpact({
      destProductionPct: 30,
      destGatesCount: 1,
      numActiveGates: 6,
      fromGateProductionPct: 5,
    })
    expect(r.destBeforeRatio).toBeCloseTo(1.8, 1)
    expect(r.destAfterRatio).toBeLessThan(GATE_RATIO_THRESHOLDS.saturatedAbove)
    expect(r.destAfterStatus).toBe('optimo')
    expect(r.improvesDestination).toBe(true)
  })

  it('si destino sigue saturado tras reasignación, improvesDestination=false', () => {
    // Destino: 60% producción, 1 gate (de 8 totales) → ratio = 60/12.5 = 4.8 (muy saturado)
    // Origen mueve: 5%
    // Después: 65% producción, 2 gates de 8 → ratio = 65/25 = 2.6 (sigue saturado)
    const r = estimateRebalanceImpact({
      destProductionPct: 60,
      destGatesCount: 1,
      numActiveGates: 8,
      fromGateProductionPct: 5,
    })
    expect(r.destAfterStatus).toBe('saturado')
    expect(r.improvesDestination).toBe(false)
  })

  it('improvesDestination requiere que el destino estaba saturado ANTES', () => {
    // Destino: 20% producción, 1 gate (de 5 totales) → ratio = 20/20 = 1.0 (óptimo, no saturado)
    // Aunque el resultado siga siendo óptimo, NO cuenta como "mejora" porque no había problema
    const r = estimateRebalanceImpact({
      destProductionPct: 20,
      destGatesCount: 1,
      numActiveGates: 5,
      fromGateProductionPct: 5,
    })
    expect(r.destBeforeRatio).toBeCloseTo(1.0, 1)
    expect(r.destAfterStatus).toBe('optimo')
    expect(r.improvesDestination).toBe(false)
  })

  it('numActiveGates=1 (caso límite) no rompe división', () => {
    const r = estimateRebalanceImpact({
      destProductionPct: 50,
      destGatesCount: 1,
      numActiveGates: 1,
      fromGateProductionPct: 0,
    })
    // No hay divisiones por cero, retorna valores finitos
    expect(Number.isFinite(r.destBeforeRatio)).toBe(true)
    expect(Number.isFinite(r.destAfterRatio)).toBe(true)
  })
})

describe('quantifyReassignable', () => {
  it('suma fromPieces de todas las sugerencias', () => {
    const result = quantifyReassignable([
      { fromPieces: 1500 },
      { fromPieces: 800 },
      { fromPieces: 200 },
    ])
    expect(result.totalPieces).toBe(2500)
    expect(result.count).toBe(3)
  })
  it('lista vacía retorna 0', () => {
    expect(quantifyReassignable([])).toEqual({ totalPieces: 0, count: 0 })
  })
  it('robusto frente a fromPieces faltantes (null/undefined)', () => {
    const result = quantifyReassignable([
      { fromPieces: 100 },
      { fromPieces: undefined as unknown as number },
      { fromPieces: 50 },
    ])
    expect(result.totalPieces).toBe(150)
  })
})
