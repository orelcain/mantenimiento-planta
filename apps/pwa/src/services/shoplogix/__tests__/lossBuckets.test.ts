/**
 * Tests de lossBuckets — la taxonomía se prueba contra los reasons REALES
 * observados en Firestore (Yal, julio 2026), no contra strings inventados.
 * Si Shoplogix renombra una causal, el caso nuevo cae en `sin-clasificar`
 * y este archivo documenta dónde agregar la regla.
 */

import { describe, it, expect } from 'vitest'
import { classifyLossState, cascadeFromAggregates } from '../lossBuckets'

const agg = (type: string, name: string, reason: string, durationSec: number, count = 1) =>
  ({ type: type as 'uptime' | 'break' | 'downtime' | 'setup', name, reason, color: '#000', durationSec, count })

describe('classifyLossState — reasons reales de julio 2026', () => {
  it('uptime → produccion', () => {
    expect(classifyLossState({ type: 'uptime' })).toBe('produccion')
  })
  it('Planned Downtime (y alias legacy) → fuera-turno', () => {
    expect(classifyLossState({ type: 'break', reason: 'Planned Downtime' })).toBe('fuera-turno')
    expect(classifyLossState({ type: 'break', reason: 'DETENCION PROGRAMADA' })).toBe('fuera-turno')
  })
  it('COLACION / EJERCICIO COMPENSATORIO / CAMBIO TURNO → planificado', () => {
    expect(classifyLossState({ type: 'break', reason: 'COLACION' })).toBe('planificado')
    expect(classifyLossState({ type: 'break', reason: 'EJERCICIO COMPENSATORIO - Paro' })).toBe('planificado')
    expect(classifyLossState({ type: 'break', reason: 'CAMBIO TURNO' })).toBe('planificado')
  })
  it('FALTA MMPP / CUMPLIMIENTO CUOTA / ENERGIA → externo (aunque vengan como downtime)', () => {
    expect(classifyLossState({ type: 'downtime', reason: 'FALTA MMPP' })).toBe('externo')
    expect(classifyLossState({ type: 'break', reason: 'CUMPLIMIENTO CUOTA' })).toBe('externo')
    expect(classifyLossState({ type: 'downtime', reason: 'ENERGIA' })).toBe('externo')
  })
  it('AJUSTE MANTENIMIENTO / CINTAS / Micro Detencion → mantencion', () => {
    expect(classifyLossState({ type: 'downtime', reason: 'AJUSTE MANTENIMIENTO' })).toBe('mantencion')
    expect(classifyLossState({ type: 'downtime', reason: 'CINTAS' })).toBe('mantencion')
    expect(classifyLossState({ type: 'downtime', name: 'Micro Detencion', reason: '' })).toBe('mantencion')
  })
  it('downtime sin causal o reason desconocido → sin-clasificar (nunca se esconde)', () => {
    expect(classifyLossState({ type: 'downtime', name: 'Detencion', reason: '' })).toBe('sin-clasificar')
    expect(classifyLossState({ type: 'break', reason: 'CAUSAL NUEVA QUE NADIE VIO' })).toBe('sin-clasificar')
  })
})

describe('cascadeFromAggregates', () => {
  it('cascada de un turno tipo: techo excluye planificado y fuera-turno; usoReal = uptime/techo', () => {
    const c = cascadeFromAggregates([
      agg('uptime', 'Produccion', '', 5 * 3600),
      agg('break', 'Detencion', 'COLACION', 3600),
      agg('break', 'Detencion', 'Planned Downtime', 10 * 3600),
      agg('downtime', 'Detencion', 'FALTA MMPP', 1800),
      agg('downtime', 'Detencion', 'AJUSTE MANTENIMIENTO', 900),
      agg('downtime', 'Detencion', '', 300),
    ])
    expect(c.techoSec).toBe(5 * 3600 + 1800 + 900 + 300)
    expect(c.planificadoSec).toBe(3600)
    expect(c.fueraTurnoSec).toBe(10 * 3600)
    expect(c.usoReal).toBeCloseTo((5 * 3600) / c.techoSec)
    // items ordenados por impacto: COLACION (60m) > FALTA MMPP (30m) > AJUSTE (15m) > sin causal (5m)
    expect(c.items.map((i) => i.reason)).toEqual(['COLACION', 'FALTA MMPP', 'AJUSTE MANTENIMIENTO', ''])
    expect(c.items.every((i) => i.bucket !== 'fuera-turno')).toBe(true)
  })
  it('turno sin datos → usoReal 0, sin NaN', () => {
    const c = cascadeFromAggregates([])
    expect(c.techoSec).toBe(0)
    expect(c.usoReal).toBe(0)
  })
})
