/**
 * En la planta hay DOS turnos; lo producido fuera de su horario es hora extra
 * de ese turno, al inicio o al final.
 *
 * Casos reales de Chonchi, nov-2026 (graderDailySummaries): con la tolerancia
 * de ±60 min la cola del T2 del 11-11 (16:00–16:02, 124 pz) quedó como
 * «Turno día» y los disparos de las 17:22 / 17:54 / 18:23 como «Sin turno».
 * «Turnos del período» mostraba 4 filas.
 */
import { describe, it, expect } from 'vitest'
import {
  assignByProductionBlocks,
  segmentByDayAndShift,
  PRODUCTION_BLOCK_GAP_MS,
  type ShoplogixShiftWindow,
} from '../graderSegmenter'
import type { GraderShiftSchedule, PieceRecord } from '../types'

const wall = (d: string, hhmm: string) =>
  `${d}T${hhmm.length === 5 ? `${hhmm}:00` : hhmm}.000Z`
const ms = (d: string, hhmm: string) => Date.parse(wall(d, hhmm))
const piece = (ts: string, pieces = 1): PieceRecord => ({ ts, gate: 3, pieces })

/** Ventanas que Shoplogix sincronizó para Chonchi el 10 y 11-11-2026. */
const NOV: ShoplogixShiftWindow[] = [
  { sessionDate: '2026-11-10', shiftId: 'Turno 1', startMs: ms('2026-11-10', '21:15'), endMs: ms('2026-11-11', '05:00') },
  { sessionDate: '2026-11-11', shiftId: 'Turno 2', startMs: ms('2026-11-11', '07:15'), endMs: ms('2026-11-11', '15:00') },
  { sessionDate: '2026-11-11', shiftId: 'Turno 1', startMs: ms('2026-11-11', '21:15'), endMs: ms('2026-11-12', '05:00') },
]

/** Producción cada 5 min entre dos horas (bloque continuo). */
function tramo(d: string, desde: string, hasta: string, dHasta = d): PieceRecord[] {
  const out: PieceRecord[] = []
  for (let t = ms(d, desde); t <= ms(dHasta, hasta); t += 5 * 60_000) {
    out.push(piece(new Date(t).toISOString()))
  }
  return out
}

// Schedule viejo de la config global: el que fabricaba «Turno día».
const SCHEDULE_VIEJO: GraderShiftSchedule[] = [
  { shiftId: 'Turno día', startHour: 9, startMinute: 0, endHour: 17, endMinute: 15 },
  { shiftId: 'Turno noche', startHour: 21, startMinute: 0, endHour: 7, endMinute: 0 },
]

describe('11-11-2026: dos turnos, no cuatro', () => {
  const t1Anterior = tramo('2026-11-10', '21:40', '05:45', '2026-11-11') // hasta 05:45 + extra
  const t2 = [...tramo('2026-11-11', '06:20', '15:55'), piece(wall('2026-11-11', '16:00')),
    piece(wall('2026-11-11', '16:02:16'))]
  const sueltos = [
    piece(wall('2026-11-11', '17:22:27')),
    piece(wall('2026-11-11', '17:54:08')),
    piece(wall('2026-11-11', '18:23:19')),
  ]
  const t1 = tramo('2026-11-11', '21:24', '05:35', '2026-11-12')
  const todo = [...t1Anterior, ...t2, ...sueltos, ...t1]

  const segs = segmentByDayAndShift(todo, [], SCHEDULE_VIEJO, NOV)

  it('solo aparecen los turnos de Shoplogix', () => {
    expect(Array.from(segs.keys()).sort()).toEqual([
      '2026-11-10|Turno 1', '2026-11-11|Turno 1', '2026-11-11|Turno 2',
    ])
  })

  it('la cola de las 16:00 sigue en el Turno 2 (no «Turno día»)', () => {
    const tss = segs.get('2026-11-11|Turno 2')!.pieceRecords.map((r) => r.ts)
    expect(tss).toContain(wall('2026-11-11', '16:02:16'))
  })

  it('los disparos de 17:22 a 18:23 son hora extra del Turno 2, incluso el de 18:23', () => {
    // 18:23 está más cerca del INICIO OFICIAL del T1 (21:15) que del fin
    // oficial del T2 (15:00), pero el T2 produjo hasta 16:02 y el T1 partió
    // 21:24: manda la producción real.
    const tss = segs.get('2026-11-11|Turno 2')!.pieceRecords.map((r) => r.ts)
    for (const s of sueltos) expect(tss).toContain(s.ts)
  })

  it('la brecha corta de la mañana (05:45 → 06:20) no mezcla los turnos', () => {
    const t1Tss = segs.get('2026-11-10|Turno 1')!.pieceRecords.map((r) => r.ts)
    const t2Tss = segs.get('2026-11-11|Turno 2')!.pieceRecords.map((r) => r.ts)
    expect(t1Tss).toContain(wall('2026-11-11', '05:45'))
    expect(t2Tss).toContain(wall('2026-11-11', '06:20'))
  })

  it('no se pierde ninguna pieza', () => {
    const suma = Array.from(segs.values()).reduce((a, s) => a + s.pieceRecords.length, 0)
    expect(suma).toBe(todo.length)
  })
})

describe('assignByProductionBlocks', () => {
  it('la hora extra al inicio va entera al turno que arranca', () => {
    // T2 arrancó 06:20, 55 min antes de su ventana, sin parar hasta 08:00.
    const ts = tramo('2026-11-11', '06:20', '08:00').map((p) => p.ts)
    const a = assignByProductionBlocks(ts, NOV)
    expect(new Set(Array.from(a.values()).map((x) => `${x.sessionDate}|${x.shiftId}`)))
      .toEqual(new Set(['2026-11-11|Turno 2']))
  })

  it('una pausa menor a 20 min no corta el bloque; una de 20 sí', () => {
    // Fin de T1 a las 05:00. Pieza a 05:30 pegada a una a 05:49 (19 min):
    // mismo bloque que la de 05:49. La de 06:09 queda a 20 min → bloque aparte.
    // Con una ventana T2 que parte 06:09 se ve el corte.
    const ventanas: ShoplogixShiftWindow[] = [
      NOV[0]!,
      { sessionDate: '2026-11-11', shiftId: 'Turno 2', startMs: ms('2026-11-11', '06:09'), endMs: ms('2026-11-11', '15:00') },
    ]
    const ts = [wall('2026-11-11', '04:50'), wall('2026-11-11', '05:09'), wall('2026-11-11', '05:28'),
      wall('2026-11-11', '05:48'), wall('2026-11-11', '06:09')]
    expect(ms('2026-11-11', '06:09') - ms('2026-11-11', '05:48')).toBeGreaterThanOrEqual(PRODUCTION_BLOCK_GAP_MS)
    const a = assignByProductionBlocks(ts, ventanas)
    expect(a.get(wall('2026-11-11', '05:48'))?.shiftId).toBe('Turno 1')
    expect(a.get(wall('2026-11-11', '06:09'))?.shiftId).toBe('Turno 2')
  })

  it('si la línea no paró entre turnos, cada pieza va a su ventana', () => {
    // T1 hasta 07:00 y T2 desde 07:05 sin pausa de 20 min: un solo bloque que
    // toca dos ventanas.
    const ts = tramo('2026-11-11', '04:00', '08:00').map((p) => p.ts)
    const a = assignByProductionBlocks(ts, NOV)
    expect(a.get(wall('2026-11-11', '04:30'))?.shiftId).toBe('Turno 1')
    expect(a.get(wall('2026-11-11', '07:30'))?.shiftId).toBe('Turno 2')
  })

  it('un archivo con solo piezas fuera de turno va a la ventana más cercana', () => {
    const a = assignByProductionBlocks([wall('2026-11-11', '16:30')], NOV)
    expect(a.get(wall('2026-11-11', '16:30'))).toEqual({ sessionDate: '2026-11-11', shiftId: 'Turno 2' })
  })

  it('no depende del orden de las ventanas', () => {
    const ts = [wall('2026-11-11', '18:23'), wall('2026-11-11', '14:00'), wall('2026-11-11', '21:30')]
    const a = assignByProductionBlocks(ts, NOV)
    const b = assignByProductionBlocks(ts, [...NOV].reverse())
    expect(Array.from(b.entries()).sort()).toEqual(Array.from(a.entries()).sort())
  })

  it('Yal con tres turnos: la hora extra se pega al Turno 3 de la madrugada', () => {
    const yal: ShoplogixShiftWindow[] = [
      { sessionDate: '2026-11-11', shiftId: 'Turno 2', startMs: ms('2026-11-11', '15:15'), endMs: ms('2026-11-12', '00:00') },
      { sessionDate: '2026-11-12', shiftId: 'Turno 3', startMs: ms('2026-11-12', '00:00'), endMs: ms('2026-11-12', '06:55') },
      { sessionDate: '2026-11-12', shiftId: 'Turno 1', startMs: ms('2026-11-12', '08:00'), endMs: ms('2026-11-12', '15:15') },
    ]
    const ts = [
      ...tramo('2026-11-12', '01:00', '07:20').map((p) => p.ts), // T3 + 25 min de extra
      ...tramo('2026-11-12', '08:10', '09:00').map((p) => p.ts),
    ]
    const a = assignByProductionBlocks(ts, yal)
    expect(a.get(wall('2026-11-12', '07:20'))?.shiftId).toBe('Turno 3')
    expect(a.get(wall('2026-11-12', '08:10'))?.shiftId).toBe('Turno 1')
  })
})
