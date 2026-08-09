/**
 * Tests de lossBuckets — la taxonomía se prueba contra los reasons REALES
 * observados en Firestore (Yal, julio 2026), no contra strings inventados.
 * Si Shoplogix renombra una causal, el caso nuevo cae en `sin-clasificar`
 * y este archivo documenta dónde agregar la regla.
 */

import { describe, it, expect } from 'vitest'
import { classifyLossState, cascadeFromAggregates, cascadeFromStates, cascadeFromMonthAggregates } from '../lossBuckets'

const agg = (type: string, name: string, reason: string, durationSec: number, count = 1) =>
  ({ type: type as 'uptime' | 'break' | 'downtime' | 'setup', name, reason, color: '#000', durationSec, count })

describe('classifyLossState — reasons reales de julio 2026', () => {
  it('uptime → produccion', () => {
    expect(classifyLossState({ type: 'uptime' })).toBe('produccion')
  })
  it('Planned Downtime → fuera-turno (relleno post-turno de Shoplogix)', () => {
    expect(classifyLossState({ type: 'break', reason: 'Planned Downtime' })).toBe('fuera-turno')
  })
  it('DETENCION PROGRAMADA → planificado, NO fuera-turno', () => {
    // Antes se trataba como alias de Planned Downtime y se descartaba del
    // cálculo. Firestore muestra que conviven en el mismo mes (feb-2026 Yal:
    // 1.902 min de DETENCION PROGRAMADA junto a 17.955 de Planned Downtime),
    // así que nunca fue un renombre: es un paro programado real.
    expect(classifyLossState({ type: 'break', reason: 'DETENCION PROGRAMADA' })).toBe('planificado')
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

  // ── Causales que ANTES caían en sin-clasificar por no tener regla ──────────
  it('fallas de equipo del árbol → mantencion', () => {
    for (const r of ['LOGICA', 'BOMBAS', 'MOTORES', 'BALANZAS', 'GRADER', 'CORREAS', 'PUNTO CERO', 'KNURO']) {
      expect(classifyLossState({ type: 'downtime', reason: r })).toBe('mantencion')
    }
  })
  it('servicios y MMPP del árbol → externo', () => {
    for (const r of ['AIRE', 'AGUA', 'SAP', 'INNOVA', 'FLOW ICE', 'ATASCAMIENTO', 'MATERIA PRIMA INACTIVA']) {
      expect(classifyLossState({ type: 'downtime', reason: r })).toBe('externo')
    }
  })
  it('operacionales del árbol → externo, salvo los de mantención', () => {
    expect(classifyLossState({ type: 'downtime', reason: 'CONTRASTACION' })).toBe('externo')
    expect(classifyLossState({ type: 'downtime', reason: 'AJUSTE OPERADOR' })).toBe('externo')
    expect(classifyLossState({ type: 'downtime', reason: 'LIBERACION' })).toBe('externo')
    expect(classifyLossState({ type: 'downtime', reason: 'TRABAJOS CONTRATISTAS / PROPIOS' })).toBe('mantencion')
  })
  it('RETRASO ASEO es pérdida operacional; un ASEO a secas sigue siendo pausa acordada', () => {
    expect(classifyLossState({ type: 'downtime', reason: 'RETRASO ASEO' })).toBe('externo')
    expect(classifyLossState({ type: 'break', reason: 'ASEO' })).toBe('planificado')
  })
  it('REUNION INICIO TURNO → planificado', () => {
    expect(classifyLossState({ type: 'break', reason: 'REUNION INICIO TURNO' })).toBe('planificado')
  })
})

describe('items de la cascada traen causal y categoría del árbol', () => {
  it('etiqueta la causal y avisa cuando el dato no distingue eléctrica de mecánica', () => {
    const c = cascadeFromAggregates([
      agg('downtime', 'Detencion', 'LOGICA', 3600),
      agg('downtime', 'Detencion', 'BOMBAS', 1800),
      agg('downtime', 'Detencion', 'CAUSAL RARA', 600),
    ])
    const [logica, bombas, rara] = c.items
    expect(logica).toMatchObject({ causal: 'Lógica', categoria: 'Eléctrica', ambigua: false })
    expect(bombas).toMatchObject({ causal: 'Bombas', categoria: 'Eléctrica o Mecánica', ambigua: true })
    expect(rara).toMatchObject({ causal: null, categoria: null, ambigua: false })
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

describe('cascadeFromMonthAggregates', () => {
  it('inyecta el uptime del doc padre (los aggregates lo excluyen) y recalcula techo/usoReal', () => {
    const c = cascadeFromMonthAggregates(6 * 3600, [
      agg('break', 'Detencion', 'COLACION', 3600),
      agg('downtime', 'Detencion', 'FALTA MMPP', 2 * 3600),
    ])
    expect(c.produccionSec).toBe(6 * 3600)
    expect(c.planificadoSec).toBe(3600)
    expect(c.techoSec).toBe(8 * 3600)                 // uptime + externo (colación queda fuera del techo)
    expect(c.usoReal).toBeCloseTo(6 / 8)
  })
})

describe('cascadeFromStates', () => {
  it('INCLUYE uptime (a diferencia de aggregatesFromStates, que lo excluye para el pareto)', () => {
    // Regresión del bug real 2026-07-21: la card usaba aggregatesFromStates →
    // produccionSec=0 → "Uso real 0%" en prod aunque la máquina produjo 5h.
    const c = cascadeFromStates([
      { type: 'uptime', durationSec: 5 * 3600 },
      { type: 'break', name: 'Detencion', reason: 'COLACION', durationSec: 3600 },
      { type: 'downtime', name: 'Detencion', reason: 'FALTA MMPP', durationSec: 1800 },
    ])
    expect(c.produccionSec).toBe(5 * 3600)
    expect(c.techoSec).toBe(5 * 3600 + 1800)
    expect(c.usoReal).toBeGreaterThan(0.9)
  })
})
