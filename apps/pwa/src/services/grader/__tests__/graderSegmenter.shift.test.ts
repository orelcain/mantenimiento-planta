/**
 * Regresión: el turno noche de Planta Principal debe contarse como UN turno.
 *
 * Caso real reportado (31-jul → 1-ago 2025, Grader Chonchi): el turno de
 * Shoplogix corría 21:30 → 05:45 y el Excel pieza-a-pieza traía 15.474 piezas
 * entre las 22:39 y las 05:42. La app mostraba solo ~7.100 (46%) porque
 * `assignShiftAndDate` leía los timestamps con `getHours()` (hora LOCAL) sobre
 * strings escritos con la convención wall-clock-as-UTC. En Chile (UTC-4) eso
 * corre todo 4 horas y parte un turno en 3 pedazos repartidos en 2 días:
 *
 *   31-jul Turno día    2.614      ← 22:39-23:59 leídas como 18:39-19:59
 *   31-jul Turno noche  7.115
 *   1-ago  Turno noche  5.745      ← la madrugada, como si fuera otro día
 *
 * Estos tests fallan con `getHours()` y pasan con `getUTCHours()`.
 */
import { describe, it, expect } from 'vitest'
import { assignShiftAndDate, segmentByDayAndShift } from '../graderSegmenter'
import { DEFAULT_SHIFT_SCHEDULE, inferShiftIdFromSchedule, shiftIdToKey } from '../graderShiftSchedule'
import type { GraderShiftSchedule, PieceRecord } from '../types'

/** Horario real de Planta Principal (chonchi-eviscerado). */
const PRINCIPAL: GraderShiftSchedule[] = [
  { shiftId: 'Turno 1', startHour: 21, startMinute: 30, endHour: 5, endMinute: 45 },
  { shiftId: 'Turno 2', startHour: 9, startMinute: 0, endHour: 17, endMinute: 15 },
]

/** Timestamp con la convención del parser: wall-clock de planta con sufijo Z. */
const wall = (d: string, hhmm: string) => `${d}T${hhmm}:00.000Z`

const piece = (ts: string, pieces = 1): PieceRecord => ({ ts, gate: 3, pieces })

describe('assignShiftAndDate — wall-clock, no hora local', () => {
  it('las 22:39 de planta caen en el turno noche, no en el de día', () => {
    const r = assignShiftAndDate(wall('2025-07-31', '22:39'), DEFAULT_SHIFT_SCHEDULE)
    expect(r.shiftId).toBe('Turno noche')
    expect(r.sessionDate).toBe('2025-07-31')
  })

  it('la madrugada del 1-ago pertenece al turno que arrancó el 31-jul', () => {
    const r = assignShiftAndDate(wall('2025-08-01', '05:42'), DEFAULT_SHIFT_SCHEDULE)
    expect(r.shiftId).toBe('Turno noche')
    expect(r.sessionDate).toBe('2025-07-31')
  })

  it('respeta el horario real de Shoplogix (Turno 1 = 21:30–05:45)', () => {
    expect(assignShiftAndDate(wall('2025-07-31', '21:30'), PRINCIPAL)).toEqual({
      shiftId: 'Turno 1', sessionDate: '2025-07-31',
    })
    expect(assignShiftAndDate(wall('2025-08-01', '05:44'), PRINCIPAL)).toEqual({
      shiftId: 'Turno 1', sessionDate: '2025-07-31',
    })
    // 05:45 ya está fuera del turno
    expect(assignShiftAndDate(wall('2025-08-01', '05:45'), PRINCIPAL).shiftId).toBe('Sin turno')
  })

  it('el Turno 2 diurno no se contamina con el nocturno', () => {
    expect(assignShiftAndDate(wall('2025-08-01', '09:30'), PRINCIPAL)).toEqual({
      shiftId: 'Turno 2', sessionDate: '2025-08-01',
    })
  })
})

describe('segmentByDayAndShift — un turno noche = UN segmento', () => {
  const records = [
    piece(wall('2025-07-31', '22:39'), 2614),
    piece(wall('2025-07-31', '23:50'), 3000),
    piece(wall('2025-08-01', '01:15'), 4115),
    piece(wall('2025-08-01', '05:42'), 5745),
  ]
  const totalPieces = records.reduce((s, r) => s + r.pieces, 0)

  it('no lo parte en 2 días con el horario por defecto', () => {
    const segs = segmentByDayAndShift(records, [], DEFAULT_SHIFT_SCHEDULE)
    expect(Array.from(segs.keys())).toEqual(['2025-07-31|Turno noche'])
    const seg = segs.get('2025-07-31|Turno noche')!
    expect(seg.pieceRecords.reduce((s, r) => s + r.pieces, 0)).toBe(totalPieces)
  })

  it('no lo parte en 2 días con el horario real de Planta Principal', () => {
    const segs = segmentByDayAndShift(records, [], PRINCIPAL)
    expect(Array.from(segs.keys())).toEqual(['2025-07-31|Turno 1'])
    expect(segs.get('2025-07-31|Turno 1')!.pieceRecords.reduce((s, r) => s + r.pieces, 0))
      .toBe(totalPieces)
  })
})

describe('inferShiftIdFromSchedule — no descarta los turnos reales', () => {
  it('devuelve el turno de la planta, no día/noche', () => {
    expect(inferShiftIdFromSchedule(wall('2025-07-31', '22:39'), PRINCIPAL)).toBe('Turno 1')
    expect(inferShiftIdFromSchedule(wall('2025-08-01', '09:30'), PRINCIPAL)).toBe('Turno 2')
  })

  it('sigue funcionando sin schedule (día/noche por defecto)', () => {
    expect(inferShiftIdFromSchedule(wall('2025-07-31', '10:00'))).toBe('Turno día')
    expect(inferShiftIdFromSchedule(wall('2025-07-31', '22:39'))).toBe('Turno noche')
  })
})

describe('shiftIdToKey — dos turnos distintos no comparten ID', () => {
  it('conserva las keys legacy', () => {
    expect(shiftIdToKey('Turno día')).toBe('dia')
    expect(shiftIdToKey('Turno noche')).toBe('noche')
    expect(shiftIdToKey(undefined)).toBe('noche')
  })

  it('separa los turnos reales de Shoplogix', () => {
    expect(shiftIdToKey('Turno 1')).toBe('turno-1')
    expect(shiftIdToKey('Turno 2')).toBe('turno-2')
    expect(shiftIdToKey('Turno 1 Lunes')).toBe('turno-1-lunes')
    // antes los tres colapsaban en 'noche' y se pisaban entre sí
    expect(new Set(['Turno 1', 'Turno 3', 'Turno 1 Lunes'].map(shiftIdToKey)).size).toBe(3)
  })
})
