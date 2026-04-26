/**
 * Tests para graderP0Thresholds.ts — fuente única de umbrales P0%.
 *
 * Cubre defaults, p0StatusFromPct (3 zonas + bordes exactos), y los
 * helpers visuales (color/label/hex).
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_P0_ALERT_PCT,
  DEFAULT_P0_CRITICAL_PCT,
  DEFAULT_P0_THRESHOLDS,
  p0StatusFromPct,
  p0StatusColor,
  p0StatusHex,
  p0StatusLabel,
} from '../graderP0Thresholds'

describe('Defaults', () => {
  it('alert=2 y critical=3.5 (valores históricos del módulo)', () => {
    expect(DEFAULT_P0_ALERT_PCT).toBe(2)
    expect(DEFAULT_P0_CRITICAL_PCT).toBe(3.5)
  })
  it('DEFAULT_P0_THRESHOLDS contiene ambos campos', () => {
    expect(DEFAULT_P0_THRESHOLDS).toEqual({ alert: 2, critical: 3.5 })
  })
})

describe('p0StatusFromPct', () => {
  it('ok cuando p0Pct <= alert', () => {
    expect(p0StatusFromPct(0)).toBe('ok')
    expect(p0StatusFromPct(1)).toBe('ok')
    expect(p0StatusFromPct(2)).toBe('ok')      // borde exacto = ok
  })
  it('alert cuando alert < p0Pct <= critical', () => {
    expect(p0StatusFromPct(2.01)).toBe('alert')
    expect(p0StatusFromPct(2.5)).toBe('alert')
    expect(p0StatusFromPct(3)).toBe('alert')
    expect(p0StatusFromPct(3.5)).toBe('alert')  // borde exacto = alert
  })
  it('critical cuando p0Pct > critical', () => {
    expect(p0StatusFromPct(3.51)).toBe('critical')
    expect(p0StatusFromPct(5)).toBe('critical')
    expect(p0StatusFromPct(100)).toBe('critical')
  })
  it('respeta thresholds custom (no usa defaults)', () => {
    const custom = { alert: 1.5, critical: 4 }
    expect(p0StatusFromPct(1.5, custom)).toBe('ok')        // borde alert
    expect(p0StatusFromPct(2, custom)).toBe('alert')        // bajo critical
    expect(p0StatusFromPct(4, custom)).toBe('alert')        // borde critical
    expect(p0StatusFromPct(4.01, custom)).toBe('critical')
  })
})

describe('p0Status helpers (color/hex/label)', () => {
  it('color tailwind para los 3 status', () => {
    expect(p0StatusColor('ok')).toContain('emerald')
    expect(p0StatusColor('alert')).toContain('amber')
    expect(p0StatusColor('critical')).toContain('rose')
  })
  it('hex para canvas/echarts', () => {
    expect(p0StatusHex('ok')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(p0StatusHex('alert')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(p0StatusHex('critical')).toMatch(/^#[0-9a-f]{6}$/i)
    // Específicos esperados (paleta del módulo)
    expect(p0StatusHex('ok')).toBe('#22c55e')
    expect(p0StatusHex('alert')).toBe('#f59e0b')
    expect(p0StatusHex('critical')).toBe('#ef4444')
  })
  it('label corto operacional', () => {
    expect(p0StatusLabel('ok')).toBe('OK')
    expect(p0StatusLabel('alert')).toBe('alerta')
    expect(p0StatusLabel('critical')).toBe('crítico')
  })
})
