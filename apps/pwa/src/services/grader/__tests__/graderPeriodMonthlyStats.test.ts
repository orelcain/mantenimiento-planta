import { describe, it, expect } from 'vitest'
import { computePeriodMonthlyStats } from '../graderPeriodMonthlyStats'
import { buildPeriodShifts } from '../graderShiftPeriod'
import type { ShoplogixShiftParent } from '@/services/shoplogix/shoplogixShift.service'
import type { GraderDailySummary } from '@/services/grader/types'
import fixture from './fixtures/shiftPeriod.real.json'

function revive(raw: (typeof fixture)['yal_2026_07']['parents']): ShoplogixShiftParent[] {
  const d = (s: string | null) => (s ? new Date(s) : null)
  return raw.map(p => ({
    ...p,
    scheduledStart: d(p.scheduledStart), scheduledEnd: d(p.scheduledEnd),
    effectiveStart: d(p.effectiveStart), effectiveEnd: d(p.effectiveEnd),
    officialStart: d(p.officialStart), officialEnd: d(p.officialEnd),
    lastSyncAt: null,
    machines: p.machines.map(m => ({ ...m, stateAggregates: undefined })),
  })) as unknown as ShoplogixShiftParent[]
}

const shifts = buildPeriodShifts({
  parents: revive(fixture.yal_2026_07.parents),
  summaries: fixture.yal_2026_07.summaries as unknown as GraderDailySummary[],
  plantSlug: 'yal',
  getCandidates: (id: string) => [id],
})

describe('stats mensuales sobre Yal julio 2026 (datos reales)', () => {
  const stats = computePeriodMonthlyStats(shifts)!

  it('devuelve stats para un mes con datos', () => {
    expect(stats).not.toBeNull()
    expect(stats.turnosWithData).toBeGreaterThan(30)
    expect(stats.daysWithData).toBeGreaterThan(10)
  })

  it('el uptime promedio es un porcentaje creíble, no una suma', () => {
    // Con 3 Baaders, sumar en vez de promediar daría >100.
    expect(stats.avgUptimePct).toBeGreaterThan(0)
    expect(stats.avgUptimePct).toBeLessThanOrEqual(100)
  })

  it('Unscheduled NO entra a los promedios ni al ranking, se reporta aparte', () => {
    const unsShifts = shifts.filter(s => s.unscheduled)
    expect(unsShifts.length).toBeGreaterThan(0)

    expect(stats.bestShift!.shiftId).not.toBe('Unscheduled')
    expect(stats.worstShift!.shiftId).not.toBe('Unscheduled')
    expect(stats.turnosWithData).toBe(shifts.filter(s => !s.unscheduled && s.cycles >= 50).length)

    // pero su producción sí queda contabilizada, aparte
    expect(stats.unscheduled.cycles).toBe(unsShifts.reduce((a, s) => a + s.cycles, 0))
  })

  it('el total de ciclos excluye Unscheduled (no lo doble-cuenta)', () => {
    const soloTurnos = shifts
      .filter(s => !s.unscheduled && s.cycles >= 50)
      .reduce((a, s) => a + s.cycles, 0)
    expect(stats.totalCycles).toBe(soloTurnos)
  })

  it('mejor y peor turno son coherentes entre sí', () => {
    expect(stats.bestShift!.uptimePct).toBeGreaterThanOrEqual(stats.worstShift!.uptimePct)
  })

  it('agrega por máquina: las 3 Baaders de Yal', () => {
    expect(stats.perMachineMonth.length).toBe(3)
    for (const m of stats.perMachineMonth) {
      expect(m.name).toBeTruthy()
      expect(m.shiftCount).toBeGreaterThan(0)
      expect(m.avgUptimePct).toBeGreaterThan(0)
      expect(m.avgUptimePct).toBeLessThanOrEqual(100)
    }
    // ordenadas por producción
    const c = stats.perMachineMonth.map(m => m.totalCycles)
    expect([...c].sort((a, b) => b - a)).toEqual(c)
  })

  it('la suma por máquina cuadra con el total del mes', () => {
    const suma = stats.perMachineMonth.reduce((a, m) => a + m.totalCycles, 0)
    expect(suma).toBe(stats.totalCycles)
  })

  it('un período vacío devuelve null, no ceros', () => {
    // Ceros se leerían como "el mes rindió 0", que es distinto de "no hay datos".
    expect(computePeriodMonthlyStats([])).toBeNull()
  })
})
