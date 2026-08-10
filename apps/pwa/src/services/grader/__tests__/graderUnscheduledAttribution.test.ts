import { describe, it, expect } from 'vitest'
import {
  attributeUnscheduledCycles,
  applyUnscheduledAttribution,
  MAX_ADJACENCY_MIN,
  type CycleInterval,
} from '../graderUnscheduledAttribution'
import type { PeriodShift } from '../graderShiftPeriod'

const wall = (s: string) => new Date(`${s}.000Z`)

function shift(over: Partial<PeriodShift> & { shiftId: string; dateKey: string }): PeriodShift {
  return {
    key: `${over.dateKey}__${over.shiftId}`,
    meta: {} as PeriodShift['meta'],
    start: null, end: null, windowSource: 'effective',
    startDayOffset: 0, endDayOffset: 0, crossesMidnight: false, endDateKey: null,
    durationMin: null, cycles: 0, uptimePct: null, expectedCycles: 0,
    pieces: null, p0Pieces: null, p0Pct: null,
    hasSlx: true, hasGrader: false, lowActivity: false, unscheduled: false,
    ...over,
  } as PeriodShift
}

const iv = (hhmm: string, cycles: number, day = '2026-07-10'): CycleInterval =>
  ({ startAt: wall(`${day}T${hhmm}:00`), cycles })

/** Los turnos reales del 10-jul-2026 en Yal, medidos contra Firestore. */
const turnosYal10 = [
  shift({ dateKey: '2026-07-10', shiftId: 'Turno 3', cycles: 8717,
          start: wall('2026-07-10T00:00:00'), end: wall('2026-07-10T04:43:00') }),
  shift({ dateKey: '2026-07-10', shiftId: 'Turno 2', cycles: 20493,
          start: wall('2026-07-10T15:15:00'), end: wall('2026-07-10T23:54:00') }),
]

describe('caso real Yal 10-jul: la planta entró antes del Turno 2', () => {
  // 2.296 ciclos repartidos en las horas 14 y 15; el Turno 2 arrancó 15:15.
  const intervals = [iv('14:05', 800), iv('14:40', 783), iv('15:00', 713)]

  it('los atribuye enteros al turno que arranca después', () => {
    const r = attributeUnscheduledCycles(intervals, turnosYal10)
    expect(r.total).toBe(2296)
    expect(r.unattributed).toBe(0)
    expect(r.byShiftKey.get('2026-07-10__Turno 2')).toBe(2296)
    expect(r.byShiftKey.has('2026-07-10__Turno 3')).toBe(false)
  })

  it('no se pierde ni se duplica un solo ciclo', () => {
    const r = attributeUnscheduledCycles(intervals, turnosYal10)
    const repartidos = [...r.byShiftKey.values()].reduce((a, b) => a + b, 0)
    expect(repartidos + r.unattributed).toBe(r.total)
  })

  it('el Unscheduled desaparece y el Turno 2 queda con el total real', () => {
    const uns = shift({ dateKey: '2026-07-10', shiftId: 'Unscheduled', cycles: 2296, unscheduled: true,
                        start: wall('2026-07-10T14:05:00'), end: wall('2026-07-10T23:54:00') })
    const out = applyUnscheduledAttribution([...turnosYal10, uns],
      new Map([['2026-07-10__Unscheduled', intervals]]))

    expect(out.find(s => s.unscheduled)).toBeUndefined()
    const t2 = out.find(s => s.shiftId === 'Turno 2')!
    expect(t2.cycles).toBe(20493 + 2296)
    expect(t2.attributedCycles).toBe(2296)      // queda auditable
    expect(out.find(s => s.shiftId === 'Turno 3')!.cycles).toBe(8717)
  })
})

describe('un ciclo dentro de la ventana del turno va a ese turno', () => {
  it('caso real Chonchi 29-jul: los 61 ciclos caían dentro del Turno 2', () => {
    const t2 = shift({ dateKey: '2026-07-29', shiftId: 'Turno 2', cycles: 1000,
                       start: wall('2026-07-29T15:58:00'), end: wall('2026-07-29T17:00:00') })
    const r = attributeUnscheduledCycles([iv('16:30', 61, '2026-07-29')], [t2])
    expect(r.byShiftKey.get('2026-07-29__Turno 2')).toBe(61)
    expect(r.unattributed).toBe(0)
  })
})

describe('no inventa atribuciones', () => {
  it('un ciclo lejano SÍ se atribuye: al turno más cercano del día', () => {
    // Decisión de Orel: sin límite de distancia. 07:00 está a 2 h 17 del fin
    // del Turno 3 (04:43) y a 8 h del inicio del Turno 2 → gana el Turno 3.
    const r = attributeUnscheduledCycles([iv('07:00', 29)], turnosYal10)
    expect(r.unattributed).toBe(0)
    expect(r.byShiftKey.get('2026-07-10__Turno 3')).toBe(29)
  })

  it('sin NINGÚN turno ese día no hay a quién atribuir', () => {
    // Caso real Chonchi 2026-08-02: 293 cic a las 07 h, cero turnos.
    const r = attributeUnscheduledCycles([iv('07:00', 293, '2026-08-02')], [])
    expect(r.unattributed).toBe(293)
    expect(r.byShiftKey.size).toBe(0)
  })

  it('un ciclo DENTRO de la ventana se atribuye aunque esté lejos del borde', () => {
    // 20:00 cae dentro del Turno 2 (15:15–23:54): la contención manda sobre
    // cualquier tolerancia de cercanía.
    const r = attributeUnscheduledCycles([iv('20:00', 1)], turnosYal10)
    expect(r.byShiftKey.get('2026-07-10__Turno 2')).toBe(1)
    expect(r.unattributed).toBe(0)
  })

  it('ya no hay límite de cercanía', () => {
    expect(MAX_ADJACENCY_MIN).toBe(Number.POSITIVE_INFINITY)
    const t = shift({ dateKey: '2026-07-10', shiftId: 'Turno 2', cycles: 100,
                      start: wall('2026-07-10T15:00:00'), end: wall('2026-07-10T23:00:00') })
    // 10 h antes del turno y aun así se atribuye: es el único del día.
    expect(attributeUnscheduledCycles([iv('05:00', 10)], [t]).unattributed).toBe(0)
  })

  it('caso real Yal 2026-08-03: 1.836 cic de media mañana van al Turno 3', () => {
    // El Turno 3 corrió 00:06–07:18 y la producción fue 09–11 h. Con la regla
    // sin límite, esos ciclos se suman al turno y quedan marcados.
    const t3 = shift({ dateKey: '2026-08-03', shiftId: 'Turno 3', cycles: 12000,
                       start: wall('2026-08-03T00:06:00'), end: wall('2026-08-03T07:18:00') })
    const uns = shift({ dateKey: '2026-08-03', shiftId: 'Unscheduled', cycles: 1836, unscheduled: true })
    const out = applyUnscheduledAttribution([t3, uns], new Map([
      ['2026-08-03__Unscheduled',
       [iv('09:30', 1, '2026-08-03'), iv('10:30', 777, '2026-08-03'), iv('11:30', 1058, '2026-08-03')]],
    ]))
    expect(out.find(s => s.unscheduled)).toBeUndefined()
    const t = out.find(s => s.shiftId === 'Turno 3')!
    expect(t.cycles).toBe(12000 + 1836)
    expect(t.attributedCycles).toBe(1836)
  })

  it('si el día tiene turnos, no queda resto: el bloque desaparece', () => {
    const uns = shift({ dateKey: '2026-07-10', shiftId: 'Unscheduled', cycles: 2326, unscheduled: true })
    const out = applyUnscheduledAttribution([...turnosYal10, uns],
      new Map([['2026-07-10__Unscheduled', [iv('14:05', 2296), iv('07:00', 30)]]]))

    expect(out.find(s => s.unscheduled)).toBeUndefined()
    expect(out.find(s => s.shiftId === 'Turno 2')!.cycles).toBe(20493 + 2296)
    expect(out.find(s => s.shiftId === 'Turno 3')!.cycles).toBe(8717 + 30)
  })

  it('el mismo día tiene prioridad: con turnos propios, no se cruza de día', () => {
    // El T3 del día 11 arranca a 30 min del ciclo, pero el día 10 tiene su
    // propio turno (a 8 h de distancia) — gana el del mismo día igual.
    const t10 = shift({ dateKey: '2026-07-10', shiftId: 'Turno 2', cycles: 5000,
                        start: wall('2026-07-10T08:00:00'), end: wall('2026-07-10T15:00:00') })
    const t11 = shift({ dateKey: '2026-07-11', shiftId: 'Turno 3', cycles: 500,
                        start: wall('2026-07-11T00:00:00'), end: wall('2026-07-11T05:00:00') })
    const uns = shift({ dateKey: '2026-07-10', shiftId: 'Unscheduled', cycles: 50, unscheduled: true })
    const out = applyUnscheduledAttribution([t10, t11, uns],
      new Map([['2026-07-10__Unscheduled', [iv('23:30', 50)]]]))
    expect(out.find(s => s.shiftId === 'Turno 2')!.cycles).toBe(5050)
    expect(out.find(s => s.shiftId === 'Turno 3')!.cycles).toBe(500)
    expect(out.find(s => s.unscheduled)).toBeUndefined()
  })

  it('caso real Chonchi 02-ago: día sin turnos → cruza al turno más cercano de otro día', () => {
    // Decisión de Orel (reafirmada 3 veces): NINGÚN ciclo queda sin turno.
    // La madrugada del domingo 02-ago (00:06–07:41, sin turnos ese día) se
    // reparte por cercanía entre el T2 del sábado 01 y la madrugada del lunes 03.
    const t2sab = shift({ dateKey: '2026-08-01', shiftId: 'Turno 2', cycles: 2397,
                          start: wall('2026-08-01T08:10:00'), end: wall('2026-08-01T14:52:00') })
    const t1lun = shift({ dateKey: '2026-08-03', shiftId: 'Turno 1 Lunes', cycles: 12000,
                          start: wall('2026-08-03T00:06:00'), end: wall('2026-08-03T07:18:00') })
    const uns = shift({ dateKey: '2026-08-02', shiftId: 'Unscheduled', cycles: 293, unscheduled: true })
    const out = applyUnscheduledAttribution([t2sab, t1lun, uns], new Map([
      ['2026-08-02__Unscheduled',
       [iv('00:30', 100, '2026-08-02'), iv('03:30', 100, '2026-08-02'), iv('07:30', 93, '2026-08-02')]],
    ]))

    // El bloque desaparece y no se pierde ni un ciclo.
    expect(out.find(s => s.unscheduled)).toBeUndefined()
    const totalAntes = 2397 + 12000 + 293
    const totalDespues = out.reduce((a, s) => a + s.cycles, 0)
    expect(totalDespues).toBe(totalAntes)
    // Todo lo agregado quedó marcado como atribuido (auditable).
    const atribuidos = out.reduce((a, s) => a + (s.attributedCycles ?? 0), 0)
    expect(atribuidos).toBe(293)
  })
})

describe('sin datos para repartir no toca nada', () => {
  it('devuelve los turnos tal cual', () => {
    const out = applyUnscheduledAttribution(turnosYal10, new Map())
    expect(out).toHaveLength(2)
    expect(out[0]!.cycles).toBe(8717)
    expect(out.every(s => s.attributedCycles === undefined)).toBe(true)
  })
})

describe('doble conteo: los minutos que el turno YA tiene no se suman otra vez', () => {
  // Caso real Filete 10-ago-2026. El doc del turno guarda intervals MÁS ALLÁ de
  // su propio cierre (15:30) y Shoplogix repite esos mismos minutos dentro de
  // `Unscheduled`: 15:30=47 y 15:35=65 estaban idénticos en los dos docs. Sin
  // dedupe, esas 112 piezas se contaban dos veces.
  const turno = shift({
    dateKey: '2026-08-10', shiftId: 'Turno Dia', cycles: 4410,
    start: wall('2026-08-10T07:45:00'), end: wall('2026-08-10T15:30:00'),
  })
  const uns = shift({
    dateKey: '2026-08-10', shiftId: 'Unscheduled', cycles: 617, unscheduled: true,
    start: wall('2026-08-10T00:00:00'), end: wall('2026-08-11T00:00:00'),
  })

  const ivm = (hhmm: string, cycles: number): CycleInterval =>
    ({ startAt: wall(`2026-08-10T${hhmm}:00`), cycles, machineid: 'b200' })

  // Los dos primeros son los repetidos; los tres siguientes son producción real
  // posterior al cierre, que sí debe sumarse.
  const intervals = [ivm('15:30', 47), ivm('15:35', 65), ivm('15:40', 62), ivm('15:45', 52), ivm('15:50', 50)]
  const yaContados = new Set(['b200|' + wall('2026-08-10T15:30:00').getTime(),
                              'b200|' + wall('2026-08-10T15:35:00').getTime()])

  it('descarta los repetidos y atribuye solo lo nuevo', () => {
    const res = attributeUnscheduledCycles(intervals, [turno], yaContados)
    expect(res.duplicated).toBe(112)
    expect(res.byShiftKey.get(turno.key)).toBe(164)   // 62 + 52 + 50
    expect(res.unattributed).toBe(0)
  })

  it('sin las claves del turno se cuentan de más (lo que pasaba antes)', () => {
    const res = attributeUnscheduledCycles(intervals, [turno])
    expect(res.byShiftKey.get(turno.key)).toBe(276)   // 164 + las 112 repetidas
  })

  it('el total del turno sube solo con lo que de verdad falta', () => {
    const out = applyUnscheduledAttribution(
      [turno, uns],
      new Map([[uns.key, intervals]]),
      new Map([['2026-08-10', yaContados]]),
    )
    const t = out.find(s => s.shiftId === 'Turno Dia')!
    expect(t.cycles).toBe(4574)          // 4.410 + 164, no 4.686
    expect(t.attributedCycles).toBe(164)
  })
})
