import { describe, it, expect } from 'vitest'
import {
  attributeUnscheduledCycles,
  applyUnscheduledAttribution,
  esColaDeEsteTurno,
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
  it('un ciclo lejano YA NO se atribuye: no es continuo a ningún turno', () => {
    // ⚠ CAMBIO DE DECISIÓN (Orel, 11-ago-2026): antes ganaba el turno más
    // cercano sin importar la distancia. 07:00 está a 2 h 17 del fin del Turno 3
    // (04:43) y a 8 h del inicio del Turno 2: no es la cola de ninguno de los
    // dos. Lo que lo motivó: en Eviscerado el turno noche se quedaba con las
    // piezas de las 07:15 de la mañana.
    const r = attributeUnscheduledCycles([iv('07:00', 29)], turnosYal10)
    expect(r.unattributed).toBe(29)
    expect(r.byShiftKey.size).toBe(0)
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

  it('ser el único turno del día no alcanza: la lejanía manda', () => {
    // Lo que Orel pidió explícitamente el 11-ago: "no sumarle piezas de otro
    // tiempo horas después". Sin esto, en un día de un solo turno se le colgaba
    // cualquier producción por lejos que estuviera.
    const t = shift({ dateKey: '2026-07-10', shiftId: 'Turno 2', cycles: 100,
                      start: wall('2026-07-10T15:00:00'), end: wall('2026-07-10T23:00:00') })
    // 10 h antes del turno: no es su arranque anticipado, es otro momento.
    expect(attributeUnscheduledCycles([iv('05:00', 30)], [t]).unattributed).toBe(30)
    // Pegado al turno sí, aunque sea el mismo turno solitario.
    expect(attributeUnscheduledCycles([iv('14:30', 30)], [t]).byShiftKey.get(t.key)).toBe(30)
  })

  it('caso real Yal 2026-08-03: la producción de media mañana va al turno que la contiene', () => {
    // ⚠ Este test fijaba un escenario RECORTADO (solo el Turno 3, 00:06–07:18) y
    // por eso los 1.835 cic dependían de la regla sin límite. Contra Firestore,
    // ese día Yal tuvo TRES turnos —T3 00:00–07:45, T1 07:45–15:00 y T2 15:00–
    // 00:00— y la producción del Unscheduled (08:00–12:12, 3.396 cic) cae DENTRO
    // del Turno 1. Con la regla de continuidad el resultado no cambia: lo que
    // está dentro de una ventana es de ese turno, por suelto que esté.
    //
    // El 1 ciclo de las 09:30 sí quedó fuera el 10-ago al unificar el umbral de
    // ruido con el del monitor (tramo bajo OUTSIDE_MIN_PIECES).
    const t3 = shift({ dateKey: '2026-08-03', shiftId: 'Turno 3', cycles: 16460,
                       start: wall('2026-08-03T00:00:00'), end: wall('2026-08-03T07:45:00') })
    const t1 = shift({ dateKey: '2026-08-03', shiftId: 'Turno 1', cycles: 9183,
                       start: wall('2026-08-03T07:45:00'), end: wall('2026-08-03T15:00:00') })
    const uns = shift({ dateKey: '2026-08-03', shiftId: 'Unscheduled', cycles: 1836, unscheduled: true })
    const out = applyUnscheduledAttribution([t3, t1, uns], new Map([
      ['2026-08-03__Unscheduled',
       [iv('09:30', 1, '2026-08-03'), iv('10:30', 777, '2026-08-03'), iv('11:30', 1058, '2026-08-03')]],
    ]))
    expect(out.find(s => s.unscheduled)).toBeUndefined()
    const t = out.find(s => s.shiftId === 'Turno 1')!
    expect(t.cycles).toBe(9183 + 1836)
    expect(t.attributedCycles).toBe(1836)
    // El Turno 3, que cerró 07:45, no se lleva nada de media mañana.
    expect(out.find(s => s.shiftId === 'Turno 3')!.cycles).toBe(16460)
  })

  it('el arranque anticipado se reparte y lo que no es continuo queda a la vista', () => {
    // ⚠ CAMBIO (11-ago): antes NADA quedaba fuera. Los 2.296 de las 14:05 son el
    // arranque anticipado del Turno 2 (15:15) y se le siguen sumando; los 30 de
    // las 07:00 están a 2 h 17 del Turno 3 y a 8 h del Turno 2 — no son la cola
    // de ninguno, así que el bloque se conserva visible en vez de colgarse del
    // turno de al lado.
    const uns = shift({ dateKey: '2026-07-10', shiftId: 'Unscheduled', cycles: 2326, unscheduled: true })
    const out = applyUnscheduledAttribution([...turnosYal10, uns],
      new Map([['2026-07-10__Unscheduled', [iv('14:05', 2296), iv('07:00', 30)]]]))

    expect(out.find(s => s.shiftId === 'Turno 2')!.cycles).toBe(20493 + 2296)
    expect(out.find(s => s.shiftId === 'Turno 3')!.cycles).toBe(8717)
    expect(out.find(s => s.unscheduled)!.cycles).toBe(30)
  })

  it('a las 23:30 la planta está arrancando el turno de la medianoche, no cerrando el de la tarde', () => {
    // ⚠ CAMBIO (11-ago) Y ES MEJOR: antes ganaba el turno del MISMO DÍA aunque
    // hubiera cerrado 8 h antes. Con la continuidad gana el T3 del día 11, que
    // arranca 30 min después — que es lo que físicamente estaba pasando.
    const t10 = shift({ dateKey: '2026-07-10', shiftId: 'Turno 2', cycles: 5000,
                        start: wall('2026-07-10T08:00:00'), end: wall('2026-07-10T15:00:00') })
    const t11 = shift({ dateKey: '2026-07-11', shiftId: 'Turno 3', cycles: 500,
                        start: wall('2026-07-11T00:00:00'), end: wall('2026-07-11T05:00:00') })
    const uns = shift({ dateKey: '2026-07-10', shiftId: 'Unscheduled', cycles: 50, unscheduled: true })
    const out = applyUnscheduledAttribution([t10, t11, uns],
      new Map([['2026-07-10__Unscheduled', [iv('23:30', 50)]]]))
    expect(out.find(s => s.shiftId === 'Turno 2')!.cycles).toBe(5000)
    expect(out.find(s => s.shiftId === 'Turno 3')!.cycles).toBe(550)
    expect(out.find(s => s.unscheduled)).toBeUndefined()
  })

  it('caso real Chonchi 02-ago: un día sin turnos NO se cuelga del turno de otro día', () => {
    // ⚠ CAMBIO DE DECISIÓN (Orel, 11-ago). Antes: "ningún ciclo queda sin turno"
    // y esta madrugada del domingo se repartía entre el sábado y el lunes. Ahora
    // manda la continuidad: estos bloques están a 10 h del turno del sábado y a
    // 17 h del lunes, así que no son la cola de ninguno y el bloque se conserva
    // VISIBLE. Vuelve a lo que dice la cabecera del módulo: inventar un turno ahí
    // es peor que mostrar el resto, y la causa de fondo —que esos turnos no están
    // configurados en Shoplogix— queda a la vista en vez de disimulada.
    //
    // Nada se pierde: los ciclos siguen contados en el bloque Unscheduled.
    const t2sab = shift({ dateKey: '2026-08-01', shiftId: 'Turno 2', cycles: 2397,
                          start: wall('2026-08-01T08:10:00'), end: wall('2026-08-01T14:52:00') })
    const t1lun = shift({ dateKey: '2026-08-03', shiftId: 'Turno 1 Lunes', cycles: 12000,
                          start: wall('2026-08-03T00:06:00'), end: wall('2026-08-03T07:18:00') })
    const uns = shift({ dateKey: '2026-08-02', shiftId: 'Unscheduled', cycles: 293, unscheduled: true })
    const out = applyUnscheduledAttribution([t2sab, t1lun, uns], new Map([
      ['2026-08-02__Unscheduled',
       [iv('00:30', 100, '2026-08-02'), iv('03:30', 100, '2026-08-02'), iv('07:30', 93, '2026-08-02')]],
    ]))

    expect(out.find(s => s.unscheduled)!.cycles).toBe(293)
    const totalAntes = 2397 + 12000 + 293
    expect(out.reduce((a, s) => a + s.cycles, 0)).toBe(totalAntes)
    expect(out.reduce((a, s) => a + (s.attributedCycles ?? 0), 0)).toBe(0)
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

describe('esColaDeEsteTurno — la cola es del turno que siguió de largo', () => {
  // Regla de Orel (11-ago-2026): "solo si las piezas son continuas al turno, no
  // sumarle piezas de otro tiempo horas después". Lo que la motivó: en Chonchi
  // el turno NOCHE se estaba llevando 1.048 piezas de las 07:15 de la mañana.
  const v = (a: string, b: string) => ({ start: wall(a), end: wall(b) })
  /** Tramo cuyo `end` es el inicio del último intervalo, como agruparTramos. */
  const tramo = (a: string, b: string) => ({ start: wall(a).getTime(), end: wall(b).getTime() })

  const NOCHE = v('2026-08-10T21:15:00', '2026-08-11T05:00:00')
  const CERRO_0715 = v('2026-08-10T00:00:00', '2026-08-10T07:15:00')
  const DIA = v('2026-08-10T09:15:00', '2026-08-10T17:00:00')

  it('el turno noche NO se lleva el bloque de las 07:15', () => {
    const bloque = tramo('2026-08-10T07:15:00', '2026-08-10T07:40:00')
    expect(esColaDeEsteTurno(bloque, NOCHE, [CERRO_0715, DIA])).toBe(false)
  })

  it('ese bloque es del turno que cerró justo a esa hora', () => {
    const bloque = tramo('2026-08-10T07:15:00', '2026-08-10T07:40:00')
    expect(esColaDeEsteTurno(bloque, CERRO_0715, [NOCHE, DIA])).toBe(true)
  })

  it('sin nadie que compita, la lejanía igual lo descarta', () => {
    const lejos = tramo('2026-08-10T20:00:00', '2026-08-10T20:25:00')
    expect(esColaDeEsteTurno(lejos, v('2026-08-10T07:45:00', '2026-08-10T15:30:00'), [])).toBe(false)
  })

  it('pegado al cierre es cola aunque el bloque dure horas', () => {
    const largo = tramo('2026-08-10T15:40:00', '2026-08-10T18:35:00')
    expect(esColaDeEsteTurno(largo, v('2026-08-10T07:45:00', '2026-08-10T15:30:00'), [])).toBe(true)
  })

  it('un arranque anticipado pegado al turno sí cuenta', () => {
    // 07:00→07:30 (el último intervalo arranca 07:25) contra un turno de las 08:00.
    const antes = tramo('2026-08-10T07:00:00', '2026-08-10T07:25:00')
    expect(esColaDeEsteTurno(antes, v('2026-08-10T08:00:00', '2026-08-10T15:30:00'), [])).toBe(true)
  })

  it('a igual distancia gana el que ya cerró — y solo uno', () => {
    const entre = tramo('2026-08-10T07:20:00', '2026-08-10T07:35:00')  // fin real 07:40
    const cerro = v('2026-08-10T00:00:00', '2026-08-10T07:00:00')      // a 20 min
    const abre  = v('2026-08-10T08:00:00', '2026-08-10T16:00:00')      // a 20 min
    expect(esColaDeEsteTurno(entre, cerro, [abre])).toBe(true)
    expect(esColaDeEsteTurno(entre, abre, [cerro])).toBe(false)
  })

  it('lo que cae DENTRO de otro turno es de ese turno', () => {
    const dentro = tramo('2026-08-10T10:00:00', '2026-08-10T10:25:00')
    expect(esColaDeEsteTurno(dentro, v('2026-08-10T07:45:00', '2026-08-10T09:30:00'), [DIA])).toBe(false)
  })
})
