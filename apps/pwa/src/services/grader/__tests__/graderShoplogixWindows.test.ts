/**
 * Shoplogix manda: define EN QUÉ TURNO cae cada registro y A QUÉ DÍA se asigna.
 *
 * El schedule declarado en `plantLines.ts` es solo fallback para días que no
 * están sincronizados. Antes el wizard ni siquiera pasaba un schedule: cortaba
 * todo con día 07-19 / noche 19-07, así que el Excel del turno real
 * (T1 21:30–05:45 de Planta Principal) nunca calzaba con su tarjeta.
 */
import { describe, it, expect } from 'vitest'
import {
  assignFromShoplogixWindows,
  segmentByDayAndShift,
  type ShoplogixShiftWindow,
} from '../graderSegmenter'
import { dateKeysToQuery } from '../graderShoplogixWindows'
import type { GraderShiftSchedule, PieceRecord } from '../types'

const wall = (d: string, hhmm: string) => `${d}T${hhmm}:00.000Z`
const ms = (d: string, hhmm: string) => Date.parse(wall(d, hhmm))
const piece = (ts: string, pieces = 1): PieceRecord => ({ ts, gate: 3, pieces })

/** Turnos tal como los sincroniza Shoplogix para el 31-jul-2025 en chonchi. */
const WINDOWS_31_JUL: ShoplogixShiftWindow[] = [
  {
    sessionDate: '2025-07-31', shiftId: 'Turno 1',
    startMs: ms('2025-07-31', '21:30'), endMs: ms('2025-08-01', '05:45'),
  },
  {
    sessionDate: '2025-07-31', shiftId: 'Turno 2',
    startMs: ms('2025-07-31', '09:00'), endMs: ms('2025-07-31', '17:15'),
  },
]

describe('assignFromShoplogixWindows', () => {
  it('la madrugada del 1-ago se asigna al turno del 31-jul', () => {
    expect(assignFromShoplogixWindows(wall('2025-08-01', '03:00'), WINDOWS_31_JUL))
      .toEqual({ shiftId: 'Turno 1', sessionDate: '2025-07-31' })
  })

  it('usa el nombre real del turno, no día/noche', () => {
    expect(assignFromShoplogixWindows(wall('2025-07-31', '22:39'), WINDOWS_31_JUL)?.shiftId)
      .toBe('Turno 1')
    expect(assignFromShoplogixWindows(wall('2025-07-31', '10:00'), WINDOWS_31_JUL)?.shiftId)
      .toBe('Turno 2')
  })

  it('el fin de ventana es exclusivo para la CONTENCIÓN', () => {
    // Con tolerancia 0 se ve el borde puro: 05:44 dentro, 05:45 ya fuera.
    expect(assignFromShoplogixWindows(wall('2025-08-01', '05:44'), WINDOWS_31_JUL, 0)).not.toBeNull()
    expect(assignFromShoplogixWindows(wall('2025-08-01', '05:45'), WINDOWS_31_JUL, 0)).toBeNull()
    // Con la tolerancia por defecto, esa pieza igual pertenece al turno.
    expect(assignFromShoplogixWindows(wall('2025-08-01', '05:45'), WINDOWS_31_JUL)?.shiftId)
      .toBe('Turno 1')
  })

  it('fuera de toda tolerancia devuelve null (el caller cae al fallback)', () => {
    // 19:00 está a 2h30 del T1 (21:30) y a 1h45 del cierre del T2 (17:15)
    expect(assignFromShoplogixWindows(wall('2025-07-31', '19:00'), WINDOWS_31_JUL)).toBeNull()
  })

  it('la cola del turno se pega al turno, no arma uno nuevo', () => {
    // Caso real feb-2026: el T1 cierra 05:45 y hay piezas hasta 05:48.
    expect(assignFromShoplogixWindows(wall('2025-08-01', '05:48'), WINDOWS_31_JUL))
      .toEqual({ shiftId: 'Turno 1', sessionDate: '2025-07-31' })
    // …y el T2 cierra 17:15 con piezas hasta 17:27
    expect(assignFromShoplogixWindows(wall('2025-07-31', '17:27'), WINDOWS_31_JUL))
      .toEqual({ shiftId: 'Turno 2', sessionDate: '2025-07-31' })
  })

  it('arrancar un poco antes tambien cuenta como el turno', () => {
    expect(assignFromShoplogixWindows(wall('2025-07-31', '21:05'), WINDOWS_31_JUL)?.shiftId)
      .toBe('Turno 1')
  })

  it('gana el turno mas cercano, no el primero del array', () => {
    // 18:00 está a 45min del cierre del T2 y a 3h30 del inicio del T1
    expect(assignFromShoplogixWindows(wall('2025-07-31', '18:00'), WINDOWS_31_JUL)?.shiftId)
      .toBe('Turno 2')
    expect(assignFromShoplogixWindows(wall('2025-07-31', '18:00'), [...WINDOWS_31_JUL].reverse())?.shiftId)
      .toBe('Turno 2')
  })

  it('estar DENTRO de un turno le gana a estar cerca de otro', () => {
    // 09:30 está dentro del T2; también a menos de 1h de su propio borde.
    expect(assignFromShoplogixWindows(wall('2025-07-31', '09:30'), WINDOWS_31_JUL))
      .toEqual({ shiftId: 'Turno 2', sessionDate: '2025-07-31' })
  })

  it('la tolerancia es configurable (0 = corte estricto al horario)', () => {
    expect(assignFromShoplogixWindows(wall('2025-08-01', '05:48'), WINDOWS_31_JUL, 0)).toBeNull()
  })

  it('si dos turnos se solapan gana el de arranque más tardío', () => {
    // Caso real: 'Turno 1' (21:30→05:45 del domingo) y 'Turno 1 Lunes'
    // (00:00→07:00) se pisan la madrugada del lunes.
    const solapados: ShoplogixShiftWindow[] = [
      {
        sessionDate: '2025-08-03', shiftId: 'Turno 1',
        startMs: ms('2025-08-03', '21:30'), endMs: ms('2025-08-04', '05:45'),
      },
      {
        sessionDate: '2025-08-04', shiftId: 'Turno 1 Lunes',
        startMs: ms('2025-08-04', '00:00'), endMs: ms('2025-08-04', '07:00'),
      },
    ]
    expect(assignFromShoplogixWindows(wall('2025-08-04', '02:00'), solapados))
      .toEqual({ shiftId: 'Turno 1 Lunes', sessionDate: '2025-08-04' })
    // …y es determinista: el orden del array no cambia el resultado
    expect(assignFromShoplogixWindows(wall('2025-08-04', '02:00'), [...solapados].reverse()))
      .toEqual({ shiftId: 'Turno 1 Lunes', sessionDate: '2025-08-04' })
  })
})

describe('segmentByDayAndShift con ventanas de Shoplogix', () => {
  const records = [
    piece(wall('2025-07-31', '22:39'), 2614),
    piece(wall('2025-07-31', '23:50'), 3000),
    piece(wall('2025-08-01', '01:15'), 4115),
    piece(wall('2025-08-01', '05:42'), 5745),
  ]
  const total = records.reduce((s, r) => s + r.pieces, 0)

  it('produce UN turno, con el nombre y el día que dice Shoplogix', () => {
    const segs = segmentByDayAndShift(records, [], undefined, WINDOWS_31_JUL)
    expect(Array.from(segs.keys())).toEqual(['2025-07-31|Turno 1'])
    expect(segs.get('2025-07-31|Turno 1')!.pieceRecords.reduce((s, r) => s + r.pieces, 0))
      .toBe(total)
  })

  it('Shoplogix le gana al schedule declarado de la planta', () => {
    // El schedule diría "Turno noche"; Shoplogix dice "Turno 1" y manda.
    const schedule: GraderShiftSchedule[] = [
      { shiftId: 'Turno noche', startHour: 19, startMinute: 0, endHour: 7, endMinute: 0 },
    ]
    const segs = segmentByDayAndShift(records, [], schedule, WINDOWS_31_JUL)
    expect(Array.from(segs.keys())).toEqual(['2025-07-31|Turno 1'])
  })

  it('sin días sincronizados cae al schedule sin perder piezas', () => {
    const schedule: GraderShiftSchedule[] = [
      { shiftId: 'Turno noche', startHour: 19, startMinute: 0, endHour: 7, endMinute: 0 },
    ]
    const segs = segmentByDayAndShift(records, [], schedule, [])
    expect(Array.from(segs.keys())).toEqual(['2025-07-31|Turno noche'])
    expect(segs.get('2025-07-31|Turno noche')!.pieceRecords.reduce((s, r) => s + r.pieces, 0))
      .toBe(total)
  })

  it('un registro fuera de toda ventana no se pierde: cae al fallback', () => {
    const conHuerfano = [...records, piece(wall('2025-07-31', '19:30'), 100)]
    const schedule: GraderShiftSchedule[] = [
      { shiftId: 'Turno noche', startHour: 19, startMinute: 0, endHour: 7, endMinute: 0 },
    ]
    const segs = segmentByDayAndShift(conHuerfano, [], schedule, WINDOWS_31_JUL)
    const suma = Array.from(segs.values())
      .flatMap((s) => s.pieceRecords)
      .reduce((s, r) => s + r.pieces, 0)
    expect(suma).toBe(total + 100)
    expect(segs.has('2025-07-31|Turno noche')).toBe(true)
  })
})

describe('dateKeysToQuery', () => {
  it('agrega el día anterior para alcanzar el turno que empezó ayer', () => {
    // Un registro de las 02:00 del 1-ago pertenece al turno con dateKey 31-jul,
    // que vive en el doc del día anterior.
    expect(dateKeysToQuery(['2025-08-01'])).toEqual(['2025-07-31', '2025-08-01'])
  })

  it('deduplica y ordena', () => {
    expect(dateKeysToQuery(['2025-08-01', '2025-08-01', '2025-07-31']))
      .toEqual(['2025-07-30', '2025-07-31', '2025-08-01'])
  })

  it('cruza fin de mes sin romperse', () => {
    expect(dateKeysToQuery(['2025-03-01'])).toEqual(['2025-02-28', '2025-03-01'])
  })

  it('sin fechas no consulta nada', () => {
    expect(dateKeysToQuery([])).toEqual([])
  })
})
