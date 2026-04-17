import { describe, it, expect } from 'vitest'
import {
  verdictFromP0Pct,
  verdictFromGapRatio,
  verdictFromMarginSec,
  verdictFromEffectivePressureBar,
  P0_THRESHOLDS,
  GAP_THRESHOLDS,
  TIMING_THRESHOLDS,
  PNEUMATIC_THRESHOLDS,
} from '../graderThresholds'

describe('verdictFromP0Pct', () => {
  it('retorna ok cuando P0 es bajo el warn', () => {
    expect(verdictFromP0Pct(1.5)).toBe('ok')
    expect(verdictFromP0Pct(0)).toBe('ok')
  })
  it('retorna warn cuando P0 está en el rango warn', () => {
    expect(verdictFromP0Pct(P0_THRESHOLDS.warn)).toBe('warn')
    expect(verdictFromP0Pct(3.9)).toBe('warn')
  })
  it('retorna critical cuando P0 supera el umbral crítico', () => {
    expect(verdictFromP0Pct(P0_THRESHOLDS.critical)).toBe('critical')
    expect(verdictFromP0Pct(10)).toBe('critical')
  })
})

describe('verdictFromGapRatio', () => {
  it('retorna ok cuando ratio < warn', () => {
    expect(verdictFromGapRatio(0.5)).toBe('ok')
    expect(verdictFromGapRatio(0)).toBe('ok')
  })
  it('retorna warn en zona intermedia', () => {
    expect(verdictFromGapRatio(GAP_THRESHOLDS.ratioWarn)).toBe('warn')
    expect(verdictFromGapRatio(0.9)).toBe('warn')
  })
  it('retorna critical cuando peces se solapan', () => {
    expect(verdictFromGapRatio(GAP_THRESHOLDS.ratioCritical)).toBe('critical')
    expect(verdictFromGapRatio(1.5)).toBe('critical')
  })
})

describe('verdictFromMarginSec', () => {
  it('retorna ok con margen holgado', () => {
    expect(verdictFromMarginSec(TIMING_THRESHOLDS.marginOkSec)).toBe('ok')
    expect(verdictFromMarginSec(2.0)).toBe('ok')
  })
  it('retorna warn con margen ajustado', () => {
    expect(verdictFromMarginSec(0.30)).toBe('warn')
    expect(verdictFromMarginSec(0.49)).toBe('warn')
  })
  it('retorna critical con margen inferior al warn', () => {
    expect(verdictFromMarginSec(0.10)).toBe('critical')
    expect(verdictFromMarginSec(TIMING_THRESHOLDS.marginWarnSec - 0.01)).toBe('critical')
  })
})

describe('verdictFromEffectivePressureBar', () => {
  it('retorna ok con presión suficiente', () => {
    expect(verdictFromEffectivePressureBar(PNEUMATIC_THRESHOLDS.warnEffectiveBar)).toBe('ok')
    expect(verdictFromEffectivePressureBar(6)).toBe('ok')
  })
  it('retorna warn en zona intermedia', () => {
    expect(verdictFromEffectivePressureBar(3.5)).toBe('warn')
  })
  it('retorna critical bajo el mínimo', () => {
    expect(verdictFromEffectivePressureBar(PNEUMATIC_THRESHOLDS.minEffectiveBar - 0.1)).toBe('critical')
    expect(verdictFromEffectivePressureBar(1.0)).toBe('critical')
  })
})
