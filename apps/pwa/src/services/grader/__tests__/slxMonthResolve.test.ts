/**
 * Tests de `resolveMonthShiftKeys` — decide qué doc padre alimenta cada clave del
 * caché mensual del calendario.
 *
 * Es la pieza que reemplaza a la resolución de candidatos que antes hacía
 * `loadOne` a fuerza de reads. Un error acá no rompe nada visiblemente: hace
 * desaparecer un turno del calendario, o peor, le atribuye la producción de otro.
 * De ahí que se pruebe con los nombres y las anomalías reales de Shoplogix.
 */

import { describe, it, expect } from 'vitest'
import { resolveMonthShiftKeys, parentTotalCycles, UNSCHEDULED_MIN_CYCLES } from '../slxMonthResolve'
import type { ShoplogixShiftParent } from '@/services/shoplogix/shoplogixShift.service'

const BASES = ['Turno día', 'Turno noche', 'Turno 1', 'Turno 2', 'Turno 3']

/** Candidatos de Yal (ver SHIFT_CANDIDATES_BY_PLANT en el service). */
const yalCandidates = (base: string): string[] => ({
  'Turno día':   ['Turno día', 'Turno 1', 'Turno 1*', 'Turno 2', 'Turno 2*'],
  'Turno noche': ['Turno noche', 'Turno 3', 'Turno 3*'],
  'Turno 1':     ['Turno 1', 'Turno 1*'],
  'Turno 2':     ['Turno 2', 'Turno 2*'],
  'Turno 3':     ['Turno 3', 'Turno 3*'],
}[base] ?? [base])

const parent = (
  dateKey: string, shiftId: string, cycles: number,
  opts: { hasAggregates?: boolean } = {},
): ShoplogixShiftParent => ({
  dateKey, shiftId,
  scheduledStart: new Date(`${dateKey}T08:00:00Z`),
  scheduledEnd:   new Date(`${dateKey}T16:00:00Z`),
  lastSyncAt: new Date(`${dateKey}T16:30:00Z`),
  parentSchemaVersion: 2,
  hasAggregates: opts.hasAggregates ?? true,
  correctionDetected: false,
  reconciliationNote: null,
  effectiveStart: null,
  effectiveEnd: null,
  machines: [
    { machineid: 'm1', name: 'Ev 1', totalCycles: cycles, uptimeSec: 1000, shiftRuntime: 0.8,
      overallRatio: 0.9, expectedTotalCycles: cycles, breakdown: null, stateAggregates: [] },
  ],
})

const resolve = (ps: ShoplogixShiftParent[]) => resolveMonthShiftKeys(ps, BASES, yalCandidates)

describe('resolveMonthShiftKeys', () => {
  it('indexa el turno por su nombre real de Shoplogix', () => {
    const p = parent('2026-07-08', 'Turno 2', 8000)
    const out = resolve([p])
    expect(out.get('2026-07-08__Turno 2')).toBe(p)
  })

  it('resuelve el alias del Grader al turno real (Turno día -> Turno 2)', () => {
    const t2 = parent('2026-07-08', 'Turno 2', 8000)
    const out = resolve([t2])
    expect(out.get('2026-07-08__Turno día')).toBe(t2)
  })

  it('resuelve Turno noche -> Turno 3', () => {
    const t3 = parent('2026-07-08', 'Turno 3', 15000)
    const out = resolve([t3])
    expect(out.get('2026-07-08__Turno noche')).toBe(t3)
  })

  it('prefiere el primer candidato con producción cuando hay varios', () => {
    // Turno 1 no arrancó (0 ciclos), Turno 2 sí → "Turno día" debe apuntar a Turno 2.
    const t1 = parent('2026-07-08', 'Turno 1', 0)
    const t2 = parent('2026-07-08', 'Turno 2', 8000)
    const out = resolve([t1, t2])
    expect(out.get('2026-07-08__Turno día')).toBe(t2)
  })

  it('el turno nombrado con producción gana sobre sus candidatos', () => {
    const t1 = parent('2026-07-08', 'Turno 1', 5000)
    const t2 = parent('2026-07-08', 'Turno 2', 8000)
    const out = resolve([t1, t2])
    expect(out.get('2026-07-08__Turno 1')).toBe(t1)
    expect(out.get('2026-07-08__Turno 2')).toBe(t2)
    // El alias toma el primer candidato con producción, que es Turno 1.
    expect(out.get('2026-07-08__Turno día')).toBe(t1)
  })

  it('NO disfraza Unscheduled de turno real cuando es ruido', () => {
    // Caso verificado en planta: 5-20 ciclos sueltos entre turnos no son un turno.
    const uns = parent('2026-07-08', 'Unscheduled', UNSCHEDULED_MIN_CYCLES - 1)
    const out = resolve([uns])
    expect(out.get('2026-07-08__Unscheduled')).toBe(uns)   // existe por su nombre real
    expect(out.has('2026-07-08__Turno noche')).toBe(false) // pero no suplanta a un turno
    expect(out.has('2026-07-08__Turno día')).toBe(false)
  })

  it('Unscheduled tampoco suplanta turnos aunque supere el umbral (no es candidato en Yal)', () => {
    const uns = parent('2026-07-08', 'Unscheduled', 5000)
    const out = resolve([uns])
    expect(out.has('2026-07-08__Turno noche')).toBe(false)
  })

  it('sin ningún candidato con producción, el alias toma el turno que exista (0 ciclos)', () => {
    // Paridad con `loadOne`: dejaba la clave poblada con un snapshot vacío para que
    // la UI dijera "sin producción" y no "sin datos". Poblarla acá evita ese read.
    const t2 = parent('2026-07-08', 'Turno 2', 0)
    const out = resolve([t2])
    expect(out.get('2026-07-08__Turno 2')).toBe(t2)
    expect(out.get('2026-07-08__Turno día')).toBe(t2)
  })

  it('Unscheduled bajo el umbral no sirve ni como relleno del alias', () => {
    const uns = parent('2026-07-08', 'Unscheduled', 10)
    const out = resolveMonthShiftKeys([uns], BASES, () => ['Turno noche', 'Unscheduled'])
    expect(out.has('2026-07-08__Turno noche')).toBe(false)
  })

  it('ignora padres de esquema viejo: deben ir por la subcolección', () => {
    const legacy = parent('2026-07-08', 'Turno 2', 8000, { hasAggregates: false })
    expect(resolve([legacy]).size).toBe(0)
  })

  it('mezcla: los de esquema nuevo se resuelven, los viejos no', () => {
    const nuevo = parent('2026-07-08', 'Turno 2', 8000)
    const viejo = parent('2026-07-09', 'Turno 2', 9000, { hasAggregates: false })
    const out = resolve([nuevo, viejo])
    expect(out.has('2026-07-08__Turno 2')).toBe(true)
    expect(out.has('2026-07-09__Turno 2')).toBe(false)
    expect(out.has('2026-07-09__Turno día')).toBe(false)
  })

  it('descubre nombres inventados por Shoplogix ("Turno 1 Lunes")', () => {
    const raro = parent('2026-07-06', 'Turno 1 Lunes', 3000)
    const out = resolve([raro])
    expect(out.get('2026-07-06__Turno 1 Lunes')).toBe(raro)
  })

  it('no cruza días: el alias de un día no toma el turno de otro', () => {
    const t2 = parent('2026-07-08', 'Turno 2', 8000)
    const out = resolve([t2])
    expect(out.has('2026-07-09__Turno día')).toBe(false)
  })

  it('cada clave apunta a una única referencia de padre (para compartir el caché)', () => {
    const t2 = parent('2026-07-08', 'Turno 2', 8000)
    const out = resolve([t2])
    expect(out.get('2026-07-08__Turno 2')).toBe(out.get('2026-07-08__Turno día'))
  })

  it('lista vacía → mapa vacío', () => {
    expect(resolve([]).size).toBe(0)
  })

  it('parentTotalCycles suma todas las Baaders', () => {
    const p = parent('2026-07-08', 'Turno 2', 1000)
    p.machines.push({ ...p.machines[0]!, machineid: 'm2', totalCycles: 500 })
    expect(parentTotalCycles(p)).toBe(1500)
  })
})
