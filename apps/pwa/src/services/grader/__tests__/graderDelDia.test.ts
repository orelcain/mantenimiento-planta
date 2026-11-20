import { describe, expect, it } from 'vitest'
import { graderDelDia } from '../graderDelDia'
import type { GraderDailySummary } from '../types'

const s = (o: Partial<GraderDailySummary>): GraderDailySummary => ({
  id: 'x', dateKey: '2026-11-14', shiftId: 'Turno día', totalPieces: 0, pointZeroPieces: 0, pointZeroPct: 0,
  updatedBy: 't', updatedAt: '2026-11-14T00:00:00Z', ...o,
} as GraderDailySummary)

describe('graderDelDia', () => {
  it('sin resúmenes del día devuelve null (hueco)', () => {
    expect(graderDelDia([], '2026-11-14')).toBeNull()
    expect(graderDelDia([s({ dateKey: '2026-11-13', totalPieces: 100 })], '2026-11-14')).toBeNull()
  })

  it('ignora turnos sin piezas', () => {
    expect(graderDelDia([s({ totalPieces: 0, pointZeroPieces: 5 })], '2026-11-14')).toBeNull()
  })

  it('pondera la Puerta 0 por piezas y ordena por inicio', () => {
    const r = graderDelDia([
      s({ shiftId: 'Turno noche', totalPieces: 1000, pointZeroPieces: 50, pointZeroPct: 5, startAt: '2026-11-14T16:00:00.000Z', endAt: '2026-11-15T01:00:00.000Z' }),
      s({ shiftId: 'Turno día', totalPieces: 3000, pointZeroPieces: 90, pointZeroPct: 3, startAt: '2026-11-14T07:15:00.000Z', endAt: '2026-11-14T14:58:00.000Z' }),
    ], '2026-11-14')!
    expect(r.turnos.map((t) => t.shiftId)).toEqual(['Turno día', 'Turno noche'])
    expect(r.turnos[0]!.ventana).toBe('07:15–14:58')
    expect(r.piezas).toBe(4000)
    expect(r.p0Pct).toBeCloseTo(3.5)
  })

  it('sin horas la ventana queda null', () => {
    expect(graderDelDia([s({ totalPieces: 10 })], '2026-11-14')!.turnos[0]!.ventana).toBeNull()
  })
})
