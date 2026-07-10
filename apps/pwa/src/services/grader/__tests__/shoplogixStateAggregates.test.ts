/**
 * Tests de PARIDAD: los números derivados de `stateAggregates` (doc padre) deben
 * ser idénticos a los derivados de `states[]` (subcolección).
 *
 * Toda la Fase C descansa en esta equivalencia. Si se rompe, la vista mensual
 * empieza a mostrar MTTR y paretos distintos según de dónde leyó los datos —
 * y el usuario no tendría forma de notarlo.
 *
 * El "oráculo" de cada test es la implementación ACTUAL que consume `states[]`:
 *   - `computeMaintenanceTotals` (shoplogixMaintenance)
 *   - `paretoFromStates` más abajo, réplica literal del bucle que hoy vive en
 *     GraderHistoricalCalendar.tsx (~línea 2113).
 */

import { describe, it, expect } from 'vitest'
import type { UpstreamMachineState } from '@/services/shoplogix/types'
import { computeMaintenanceTotals, isMaintenanceState } from '../shoplogixMaintenance'
import {
  aggregatesFromStates,
  maintenanceTotalsFromAggregates,
  paretoFromAggregates,
  deserializeStateAggregates,
  type ParetoBucket,
} from '../shoplogixStateAggregates'

// ── Oráculo: el pareto tal como se computa hoy desde states[] ────────────────

function paretoFromStates(states: UpstreamMachineState[], maintOnly: boolean): ParetoBucket[] {
  const reasonMap = new Map<string, { durationSec: number; color: string; count: number; type: UpstreamMachineState['type'] }>()
  for (const s of states) {
    if (s.type === 'uptime') continue
    if (maintOnly && !isMaintenanceState(s)) continue
    const reason = s.reason?.trim() || s.name?.trim() || 'Sin causa'
    const entry = reasonMap.get(reason)
    if (entry) {
      entry.durationSec += s.durationSec
      entry.count += 1
    } else {
      reasonMap.set(reason, { durationSec: s.durationSec, color: s.color, count: 1, type: s.type })
    }
  }
  return [...reasonMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.durationSec - a.durationSec)
}

// ── Fixture: mezcla realista basada en la distribución observada en Yal ──────

const st = (over: Partial<UpstreamMachineState>): UpstreamMachineState => ({
  startAt: new Date(0), endAt: new Date(0), durationSec: 60,
  type: 'downtime', name: '', reason: '', color: '#ff0000', isCurrent: false,
  ...over,
})

/** 1400+ microparos, averías macro, paros operacionales y breaks — como en planta. */
function realisticStates(): UpstreamMachineState[] {
  const out: UpstreamMachineState[] = []
  for (let i = 0; i < 140; i++) out.push(st({ name: 'Micro Detencion', durationSec: 3 + (i % 5) }))
  for (let i = 0; i < 7; i++)   out.push(st({ name: 'Detencion', durationSec: 500 + i * 10 }))
  for (let i = 0; i < 4; i++)   out.push(st({ reason: 'AJUSTE MANTENIMIENTO', name: 'Detencion', durationSec: 300 }))
  for (let i = 0; i < 3; i++)   out.push(st({ reason: 'FALTA MMPP', durationSec: 4000 }))          // operacional
  for (let i = 0; i < 2; i++)   out.push(st({ reason: 'CONTRASTACION', durationSec: 600 }))        // operacional
  out.push(st({ reason: 'AJUSTE OPERADOR', durationSec: 30 }))                                     // operacional
  out.push(st({ type: 'break', reason: 'COLACION', name: 'Break', durationSec: 3600, color: '#0000ff' }))
  out.push(st({ type: 'break', reason: 'Planned Downtime', durationSec: 7200, color: '#00ff00' }))
  out.push(st({ type: 'setup', name: 'Setup', durationSec: 120, color: '#ffff00' }))
  out.push(st({ type: 'uptime', durationSec: 20000, color: '#00ffff' }))
  // Mismo reason en dos types distintos: NO deben colapsarse en el agregado,
  // pero SÍ caen en el mismo bucket del pareto.
  out.push(st({ type: 'break', reason: 'AJUSTE MANTENIMIENTO', durationSec: 90 }))
  return out
}

describe('paridad agregados vs states', () => {
  const states = realisticStates()
  const aggs = aggregatesFromStates(states)

  it('los totales de avería macro/micro son idénticos', () => {
    expect(maintenanceTotalsFromAggregates(aggs)).toEqual(computeMaintenanceTotals(states))
  })

  it('los totales macro/micro no son triviales (el fixture ejercita ambos)', () => {
    const t = computeMaintenanceTotals(states)
    expect(t.microCount).toBe(140)
    expect(t.macroCount).toBe(11)   // 7 Detencion + 4 AJUSTE MANTENIMIENTO
    expect(t.macroSec).toBeGreaterThan(0)
  })

  it('el pareto completo es idéntico', () => {
    expect(paretoFromAggregates(aggs, false)).toEqual(paretoFromStates(states, false))
  })

  it('el pareto "solo mantención" es idéntico', () => {
    expect(paretoFromAggregates(aggs, true)).toEqual(paretoFromStates(states, true))
  })

  it('el pareto excluye uptime en ambos caminos', () => {
    expect(paretoFromAggregates(aggs, false).some(b => b.type === 'uptime')).toBe(false)
  })

  it('un reason presente en dos types cae en un solo bucket del pareto, sumado', () => {
    const bucket = paretoFromAggregates(aggs, false).find(b => b.name === 'AJUSTE MANTENIMIENTO')!
    expect(bucket.count).toBe(5)                       // 4 downtime + 1 break
    expect(bucket.durationSec).toBe(4 * 300 + 90)
  })

  it('"solo mantención" descarta el break con el mismo reason', () => {
    const bucket = paretoFromAggregates(aggs, true).find(b => b.name === 'AJUSTE MANTENIMIENTO')!
    expect(bucket.count).toBe(4)                       // el break queda fuera
    expect(bucket.durationSec).toBe(4 * 300)
  })

  it('los paros operacionales cuentan en el pareto pero no como avería', () => {
    expect(paretoFromAggregates(aggs, false).some(b => b.name === 'FALTA MMPP')).toBe(true)
    expect(paretoFromAggregates(aggs, true).some(b => b.name === 'FALTA MMPP')).toBe(false)
    expect(maintenanceTotalsFromAggregates(aggs).macroSec).toBeLessThan(3 * 4000)
  })

  it('states sin reason ni name caen en "Sin causa" por ambos caminos', () => {
    const s = [st({ type: 'downtime', name: '', reason: '', durationSec: 10 })]
    expect(paretoFromAggregates(aggresultOf(s), false)).toEqual(paretoFromStates(s, false))
    expect(paretoFromAggregates(aggresultOf(s), false)[0]!.name).toBe('Sin causa')
  })

  it('comprime de verdad: 160 states -> puñado de agregados', () => {
    expect(states.length).toBeGreaterThan(155)
    expect(aggs.length).toBeLessThan(15)
  })

  it('sobrevive a la serialización a Firestore y de vuelta', () => {
    const roundTrip = deserializeStateAggregates(JSON.parse(JSON.stringify(aggs)))
    expect(maintenanceTotalsFromAggregates(roundTrip)).toEqual(computeMaintenanceTotals(states))
    expect(paretoFromAggregates(roundTrip, false)).toEqual(paretoFromStates(states, false))
  })

  it('deserializa defensivamente basura del doc padre', () => {
    expect(deserializeStateAggregates(null)).toEqual([])
    expect(deserializeStateAggregates('nope')).toEqual([])
    expect(deserializeStateAggregates([null, 42, { sinType: true }])).toEqual([])
    const one = deserializeStateAggregates([{ type: 'downtime' }])
    expect(one).toEqual([{ type: 'downtime', name: '', reason: '', color: '#64748b', durationSec: 0, count: 0 }])
  })
})

function aggresultOf(s: UpstreamMachineState[]) {
  return aggregatesFromStates(s)
}
