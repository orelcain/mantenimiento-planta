/**
 * Atribución por DÍA DE TURNO: Shoplogix manda con la asignación del día.
 *
 * `aggregateByCalendarDay` reparte un turno noche entre los dos días
 * calendario en que ocurrió físicamente — útil para "qué pasó el día X", pero
 * en el calendario hacía que un turno apareciera en dos celdas.
 * `aggregateByShiftDay` lo devuelve entero al día que le asignó Shoplogix,
 * conservando la señal del cruce para dibujar la marca “→”.
 *
 * Caso real: turno 1 del 31-jul-2026 (21:30 → 05:45). Toda su producción
 * ocurrió entre 01:34 y 05:11 del 1-ago, pero el turno es del 31.
 */
import { describe, it, expect } from 'vitest'
import {
  aggregateByCalendarDay,
  aggregateByShiftDay,
  buildShiftChipDescriptors,
} from '../graderCalendarAggregation'
import type { GraderDailySummary, TimelineBucket } from '../types'

const bucket = (tsMin: string, pieces: number, p0 = 0): TimelineBucket =>
  ({ tsMin, pieces, p0Pieces: p0 } as TimelineBucket)

const summary = (over: Partial<GraderDailySummary> = {}): GraderDailySummary =>
  ({
    id: '2026-07-31__Turno 1',
    dateKey: '2026-07-31',
    shiftId: 'Turno 1',
    totalPieces: 1533,
    pointZeroPieces: 109,
    pointZeroPct: 7.11,
    startAt: '2026-08-01T01:34:00.000Z',
    endAt: '2026-08-01T05:11:00.000Z',
    updatedBy: 'test',
    updatedAt: '2026-08-01T06:00:00.000Z',
    ...over,
  } as GraderDailySummary)

describe('aggregateByShiftDay', () => {
  it('el turno del 31-jul queda en el 31, aunque produjo el 1-ago', () => {
    const s = summary()
    const timelines = new Map([[s.id, [
      bucket('2026-08-01T01:34', 700, 50),
      bucket('2026-08-01T03:00', 500, 40),
      bucket('2026-08-01T05:11', 333, 19),
    ]]])

    // Por día físico: todo cae en el 1-ago (comportamiento previo)
    const fisico = aggregateByCalendarDay({ summaries: [s], timelinesBySummaryId: timelines })
    expect(Array.from(fisico.keys())).toEqual(['2026-08-01'])

    // Por día de turno: todo vuelve al 31-jul
    const porTurno = aggregateByShiftDay({ summaries: [s], timelinesBySummaryId: timelines })
    expect(Array.from(porTurno.keys())).toEqual(['2026-07-31'])
    const agg = porTurno.get('2026-07-31')!
    expect(agg.totalPieces).toBe(1533)
    expect(agg.pointZeroPieces).toBe(109)
    expect(agg.contributingShifts).toHaveLength(1)
  })

  it('marca el cruce de medianoche y cuánto ocurrió de madrugada', () => {
    const s = summary({ dateKey: '2026-02-25', id: '2026-02-25__Turno 1' })
    const timelines = new Map([[s.id, [
      bucket('2026-02-25T22:00', 400),
      bucket('2026-02-26T02:00', 900),
      bucket('2026-02-26T05:00', 233),
    ]]])
    const agg = aggregateByShiftDay({ summaries: [s], timelinesBySummaryId: timelines })
    const c = agg.get('2026-02-25')!.contributingShifts[0]!
    expect(c.crossesMidnight).toBe(true)
    expect(c.piecesAfterMidnight).toBe(1133)
    expect(c.pieces).toBe(1533)
  })

  it('un turno que no cruza no queda marcado', () => {
    const s = summary({
      dateKey: '2026-02-25', id: '2026-02-25__Turno 2',
      startAt: '2026-02-25T09:20:00.000Z', endAt: '2026-02-25T17:14:00.000Z',
    })
    const timelines = new Map([[s.id, [bucket('2026-02-25T09:20', 800), bucket('2026-02-25T14:00', 733)]]])
    const c = aggregateByShiftDay({ summaries: [s], timelinesBySummaryId: timelines })
      .get('2026-02-25')!.contributingShifts[0]!
    expect(c.crossesMidnight).toBe(false)
    expect(c.piecesAfterMidnight).toBe(0)
  })

  it('conserva los totales del reparto físico', () => {
    const s = summary()
    const timelines = new Map([[s.id, [
      bucket('2026-07-31T23:00', 533, 33),
      bucket('2026-08-01T02:00', 1000, 76),
    ]]])
    const fisico = aggregateByCalendarDay({ summaries: [s], timelinesBySummaryId: timelines })
    const porTurno = aggregateByShiftDay({ summaries: [s], timelinesBySummaryId: timelines })

    const sum = (m: Map<string, { totalPieces: number; pointZeroPieces: number }>) => ({
      pz: Array.from(m.values()).reduce((a, v) => a + v.totalPieces, 0),
      p0: Array.from(m.values()).reduce((a, v) => a + v.pointZeroPieces, 0),
    })
    expect(sum(porTurno)).toEqual(sum(fisico))
    expect(sum(porTurno)).toEqual({ pz: 1533, p0: 109 })
  })

  it('dos turnos del mismo día se suman en una sola celda', () => {
    const t1 = summary({ id: '2026-02-25__Turno 1', dateKey: '2026-02-25', totalPieces: 1000, pointZeroPieces: 20 })
    const t2 = summary({
      id: '2026-02-25__Turno 2', dateKey: '2026-02-25', shiftId: 'Turno 2',
      totalPieces: 500, pointZeroPieces: 30,
      startAt: '2026-02-25T09:00:00.000Z', endAt: '2026-02-25T17:00:00.000Z',
    })
    const timelines = new Map([
      [t1.id, [bucket('2026-02-25T22:00', 300, 5), bucket('2026-02-26T03:00', 700, 15)]],
      [t2.id, [bucket('2026-02-25T10:00', 500, 30)]],
    ])
    const agg = aggregateByShiftDay({ summaries: [t1, t2], timelinesBySummaryId: timelines })
    expect(Array.from(agg.keys())).toEqual(['2026-02-25'])
    const day = agg.get('2026-02-25')!
    expect(day.totalPieces).toBe(1500)
    expect(day.pointZeroPieces).toBe(50)
    expect(day.contributingShifts).toHaveLength(2)
    // P0% del día se recalcula sobre el agregado, no es promedio de turnos
    expect(day.pointZeroPct).toBe(3.33)
  })

  it('el fallback legacy (sin timeline ni hourly) ya atribuía al día del turno', () => {
    const s = summary()
    const agg = aggregateByShiftDay({ summaries: [s] })
    expect(Array.from(agg.keys())).toEqual(['2026-07-31'])
    expect(agg.get('2026-07-31')!.totalPieces).toBe(1533)
    expect(agg.get('2026-07-31')!.contributingShifts[0]!.crossesMidnight).toBe(false)
  })
})

describe('buildShiftChipDescriptors con atribución por día de turno', () => {
  it('un solo chip, en el día del turno, marcado como saliente', () => {
    const s = summary()
    const timelines = new Map([[s.id, [
      bucket('2026-07-31T23:00', 533),
      bucket('2026-08-01T02:00', 1000),
    ]]])
    const agg = aggregateByShiftDay({ summaries: [s], timelinesBySummaryId: timelines })
    const chips = buildShiftChipDescriptors(agg, new Map([[s.id, s]]))

    expect(Array.from(chips.keys())).toEqual(['2026-07-31'])
    const cell = chips.get('2026-07-31')!
    expect(cell).toHaveLength(1)
    expect(cell[0]!.role).toBe('primary')
    expect(cell[0]!.direction).toBe('exits')   // dibuja “→”
    expect(cell[0]!.pieces).toBe(1533)
    expect(cell[0]!.pctOfShift).toBe(100)
  })

  it('sin cruce, el chip no lleva marca de dirección', () => {
    const s = summary({
      id: '2026-02-25__Turno 2', dateKey: '2026-02-25', shiftId: 'Turno 2',
      startAt: '2026-02-25T09:00:00.000Z', endAt: '2026-02-25T17:00:00.000Z',
    })
    const timelines = new Map([[s.id, [bucket('2026-02-25T10:00', 1533)]]])
    const agg = aggregateByShiftDay({ summaries: [s], timelinesBySummaryId: timelines })
    const chip = buildShiftChipDescriptors(agg, new Map([[s.id, s]])).get('2026-02-25')![0]!
    expect(chip.direction).toBe('same')
  })

  it('ya no se generan chips huérfanos: el turno vive donde Shoplogix dice', () => {
    // Antes, un turno cuya actividad ocurrió toda al día siguiente dejaba un
    // chip 'orphan-source' en su propio día y el real en el otro.
    const s = summary()
    const timelines = new Map([[s.id, [bucket('2026-08-01T03:00', 1533)]]])
    const agg = aggregateByShiftDay({ summaries: [s], timelinesBySummaryId: timelines })
    const chips = buildShiftChipDescriptors(agg, new Map([[s.id, s]]))
    const todos = Array.from(chips.values()).flat()
    expect(todos).toHaveLength(1)
    expect(todos[0]!.role).toBe('primary')
    expect(todos.some((c) => c.role === 'orphan-source')).toBe(false)
  })
})
