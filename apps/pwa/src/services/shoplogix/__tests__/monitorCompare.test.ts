/**
 * monitorCompare — comparar el turno en curso con los anteriores.
 *
 * Dos errores de lectura que esto evita:
 *   · "hoy llevamos 3.028 y ayer hizo 3.275" — ayer eran las 15:30;
 *   · comparar por hora de RELOJ turnos que arrancan a horas distintas (07:45,
 *     07:48, 08:00): la primera "hora" de uno son 15 min y la de otro 60.
 *
 * Todo se indexa en minutos DESDE EL ARRANQUE, que además es como cuenta
 * Shoplogix (confirmado por Orel el 12-08).
 */
import { describe, it, expect } from 'vitest'
import {
  cumulativeFromStart, piecesAt, buildDayComparison, optimalPace, findGapWindow,
  plannedBreaks, mergeBreaks, diffCurve, resumenComparacion, findGapWindows,
  breakMinutesBetween, extendOngoingBreaks, prediccionConvenio,
} from '../monitorCompare'
import type { MonitorSeriesPoint } from '../monitorHourly'

/** Serie de tramos de 5 min desde `desde`. */
function serie(desde: string, piezasPorTramo: number[]): MonitorSeriesPoint[] {
  const t0 = Date.parse(desde)
  return piezasPorTramo.map((pieces, i) => ({
    t: new Date(t0 + i * 5 * 60_000).toISOString(),
    pieces,
  }))
}

describe('cumulativeFromStart', () => {
  it('indexa en minutos desde el ARRANQUE, no desde la hora de reloj', () => {
    // Turno que arranca 07:45. El primer tramo cubre hasta el minuto 5.
    const c = cumulativeFromStart(serie('2026-08-12T07:45:00Z', [50, 60, 40]))
    expect(c).toEqual([
      { minutes: 5, pieces: 50 },
      { minutes: 10, pieces: 110 },
      { minutes: 15, pieces: 150 },
    ])
  })

  it('dos turnos que arrancan a horas DISTINTAS quedan alineados', () => {
    const a = cumulativeFromStart(serie('2026-08-12T07:45:00Z', [50, 50]))
    const b = cumulativeFromStart(serie('2026-08-11T08:00:00Z', [40, 40]))
    // Mismo eje: el minuto 10 de cada turno, aunque uno empezó 15 min antes.
    expect(a.map((p) => p.minutes)).toEqual(b.map((p) => p.minutes))
  })

  it('arranca en la primera pieza y no en el horario programado', () => {
    // Si el turno "empieza" 07:00 pero la primera pieza sale 07:45, los 45 min
    // vacíos correrían la curva entera hacia la derecha.
    const c = cumulativeFromStart(serie('2026-08-12T07:45:00Z', [50]))
    expect(c[0]!.minutes).toBe(5)
  })

  it('ordena aunque la serie llegue desordenada', () => {
    const s = serie('2026-08-12T07:45:00Z', [10, 20, 30]).reverse()
    expect(cumulativeFromStart(s).map((p) => p.pieces)).toEqual([10, 30, 60])
  })

  it('sin serie no inventa nada', () => {
    expect(cumulativeFromStart([])).toEqual([])
    expect(cumulativeFromStart(null)).toEqual([])
  })
})

describe('piecesAt', () => {
  const curva = cumulativeFromStart(serie('2026-08-12T07:45:00Z', Array(12).fill(50)))  // 60 min

  it('devuelve el acumulado al minuto pedido', () => {
    expect(piecesAt(curva, 30)).toBe(300)
    expect(piecesAt(curva, 60)).toBe(600)
  })

  it('entre dos tramos toma el último cerrado, no interpola de más', () => {
    expect(piecesAt(curva, 32)).toBe(300)
  })

  it('NO extrapola más allá del último dato — ese turno no llegó ahí', () => {
    // Devolver el total haría ver una línea plana como si hubiera seguido.
    expect(piecesAt(curva, 120)).toBeNull()
  })

  it('antes del primer tramo es 0, no null', () => {
    expect(piecesAt(curva, 1)).toBe(0)
  })
})

describe('buildDayComparison', () => {
  const hoy = serie('2026-08-12T07:45:00Z', Array(24).fill(50))    // 120 min, 1.200 pz
  const ayer = serie('2026-08-11T08:00:00Z', Array(36).fill(40))   // 180 min, 1.440 pz

  it('compara a la MISMA altura de turno, no a la misma hora de reloj', () => {
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: ayer }],
    })
    expect(r.currentMinute).toBe(120)
    expect(r.days[0]!.atCurrentMinute).toBe(1200)  // hoy a los 120 min
    expect(r.days[1]!.atCurrentMinute).toBe(960)   // ayer a los 120 min (24 × 40)
  })

  it('el TOTAL de ayer sigue disponible y es distinto del de la misma altura', () => {
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: ayer }],
    })
    expect(r.days[1]!.totalPieces).toBe(1440)
    expect(r.days[1]!.atCurrentMinute).toBe(960)
  })

  it('un día más corto da null a esa altura, no su total', () => {
    const corto = serie('2026-08-11T08:00:00Z', Array(6).fill(40))  // solo 30 min
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: corto }],
    })
    expect(r.days[1]!.atCurrentMinute).toBeNull()
  })

  it('dibuja la recta objetivo sobre el tiempo ÚTIL, no sobre el turno entero', () => {
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', previous: [],
      targetPieces: 5_000, usefulMin: 372,
    })
    expect(r.optimal).not.toBeNull()
    // A los 120 min: 120 × (5.000/372) = 1.613
    expect(r.optimalAtCurrentMinute).toBe(Math.round(120 * (5_000 / 372)))
    // Y nunca pasa de la meta.
    expect(Math.max(...r.optimal!.map((p) => p.pieces))).toBeLessThanOrEqual(5_000)
  })

  it('sin meta no inventa una recta objetivo', () => {
    const r = buildDayComparison({ todaySeries: hoy, todayDateKey: '2026-08-12', previous: [] })
    expect(r.optimal).toBeNull()
    expect(r.optimalAtCurrentMinute).toBeNull()
  })

  it('limita cuántos días entran — en un celular no caben cinco curvas', () => {
    const previous = ['2026-08-11', '2026-08-10', '2026-08-08', '2026-08-07']
      .map((dateKey) => ({ dateKey, series: ayer }))
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', previous, maxDays: 2,
    })
    expect(r.days).toHaveLength(3)
  })

  it('descarta días sin datos en vez de dibujar una línea plana', () => {
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: [] }],
    })
    expect(r.days).toHaveLength(1)
  })

  it('sin turno en curso no compara nada', () => {
    const r = buildDayComparison({ todaySeries: [], todayDateKey: 'x', previous: [] })
    expect(r.days).toEqual([])
    expect(r.currentMinute).toBeNull()
  })
})

describe('optimalPace', () => {
  it('descuenta las paradas de convenio — el reparto lineal es tramposo', () => {
    // Turno real de Filete: 450 min de ventana, 78 planificados → 372 útiles.
    const r = optimalPace({ targetPieces: 5_000, windowMin: 450, plannedMin: 78 })!
    expect(r.usefulMin).toBe(372)
    expect(r.requiredCpm).toBeCloseTo(5_000 / 372, 4)
    expect(r.requiredCpm).toBeGreaterThan(5_000 / 450)
  })

  it('sin meta o sin tiempo útil no inventa un ritmo', () => {
    expect(optimalPace({ targetPieces: 0, windowMin: 450, plannedMin: 78 })).toBeNull()
    expect(optimalPace({ targetPieces: 5_000, windowMin: 60, plannedMin: 60 })).toBeNull()
    expect(optimalPace({ targetPieces: 5_000, windowMin: 60, plannedMin: 90 })).toBeNull()
  })
})

describe('findGapWindow', () => {
  /** 24 tramos de 5 min (2 h) a ritmo parejo, con un bache donde se indique. */
  function conBache(base: number, desdeTramo: number, tramos: number, valor: number) {
    const arr = Array(24).fill(base)
    for (let i = desdeTramo; i < desdeTramo + tramos; i++) arr[i] = valor
    return serie('2026-08-12T07:45:00Z', arr)
  }

  it('ubica el tramo donde hoy perdió terreno', () => {
    const hoy = cumulativeFromStart(conBache(50, 12, 4, 0))   // parado 60-80 min
    const ayer = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(24).fill(50)))
    const g = findGapWindow(hoy, ayer)!
    expect(g.fromMin).toBe(60)
    expect(g.toMin).toBe(80)
    expect(g.lostPieces).toBe(200)
  })

  it('junta la racha entera — una parada larga son varios tramos seguidos', () => {
    // Quedarse con el peor tramo suelto haría ver la brecha 4 veces más chica.
    const hoy = cumulativeFromStart(conBache(50, 12, 4, 0))
    const ayer = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(24).fill(50)))
    const g = findGapWindow(hoy, ayer)!
    expect(g.toMin - g.fromMin).toBe(20)
  })

  it('elige la racha de MÁS pérdida, no la primera', () => {
    const arr = Array(24).fill(50)
    arr[4] = 30                              // bache chico: −20
    arr[14] = 0; arr[15] = 0                 // bache grande: −100
    const hoy = cumulativeFromStart(serie('2026-08-12T07:45:00Z', arr))
    const ayer = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(24).fill(50)))
    const g = findGapWindow(hoy, ayer)!
    expect(g.lostPieces).toBe(100)
    expect(g.fromMin).toBe(70)
  })

  it('dice qué parte del atraso total explica ese tramo', () => {
    const hoy = cumulativeFromStart(conBache(50, 12, 4, 0))
    const ayer = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(24).fill(50)))
    expect(findGapWindow(hoy, ayer)!.share).toBeCloseTo(1, 2)
  })

  it('un tramo que el día de referencia no alcanzó NO cuenta como pérdida', () => {
    // Ayer duró 30 min; el resto del turno de hoy no tiene contra qué medirse.
    const hoy = cumulativeFromStart(serie('2026-08-12T07:45:00Z', Array(24).fill(50)))
    const corto = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(6).fill(50)))
    expect(findGapWindow(hoy, corto)).toBeNull()
  })

  it('si hoy nunca estuvo por debajo, no hay brecha que mostrar', () => {
    const hoy = cumulativeFromStart(serie('2026-08-12T07:45:00Z', Array(24).fill(60)))
    const ayer = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(24).fill(50)))
    expect(findGapWindow(hoy, ayer)).toBeNull()
  })

  it('sin curvas no inventa un tramo', () => {
    expect(findGapWindow([], [])).toBeNull()
  })
})

describe('plannedBreaks', () => {
  const base = {
    series: serie('2026-08-12T07:45:00Z', [1]),
    stopReasons: ['COLACION', 'ATASCAMIENTO', 'DETENCION PROGRAMADA'],
    plannedReasons: ['COLACION', 'DETENCION PROGRAMADA'],
  }

  it('ubica las paradas de convenio en minutos de turno', () => {
    const r = plannedBreaks({
      ...base,
      stopEvents: [{ r: 0, f: '2026-08-12T12:56:00Z', s: 55 * 60 }],
    })
    expect(r).toEqual([{ fromMin: 311, toMin: 366, reason: 'COLACION' }])
  })

  it('fusiona los tramos solapados — el sensor parte una colacion en varios', () => {
    // Caso real de Filete el 12-08: 311→318 y 317→356 son una sola parada.
    const r = plannedBreaks({
      ...base,
      stopEvents: [
        { r: 0, f: '2026-08-12T12:56:00Z', s: 7 * 60 },
        { r: 0, f: '2026-08-12T13:02:00Z', s: 39 * 60 },
      ],
    })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ fromMin: 311, toMin: 356 })
  })

  it('IGNORA las paradas recuperables — solo el convenio aplana la meta', () => {
    const r = plannedBreaks({
      ...base,
      stopEvents: [{ r: 1, f: '2026-08-12T09:45:00Z', s: 20 * 60 }],
    })
    expect(r).toEqual([])
  })

  it('sin la lista de causas de convenio no adivina cuales son', () => {
    // La clasificacion la hace el backend; duplicarla en el cliente garantiza
    // que un dia las dos versiones digan cosas distintas.
    expect(plannedBreaks({ ...base, plannedReasons: [], stopEvents: [{ r: 0, f: 'x', s: 60 }] })).toEqual([])
  })
})

describe('mergeBreaks', () => {
  it('a las de hoy les suma las de dias anteriores que TODAVIA no pasaron', () => {
    const hoy = [{ fromMin: 5, toMin: 9, reason: 'REUNION' }]
    const ayer = [
      { fromMin: 5, toMin: 10, reason: 'REUNION' },      // ya paso: no se duplica
      { fromMin: 310, toMin: 365, reason: 'COLACION' },  // falta: se pronostica
    ]
    expect(mergeBreaks(hoy, ayer, 120)).toEqual([
      { fromMin: 5, toMin: 9, reason: 'REUNION' },
      { fromMin: 310, toMin: 365, reason: 'COLACION' },
    ])
  })

  it('lo que ya ocurrio manda: no se pronostica sobre un hecho', () => {
    const hoy = [{ fromMin: 300, toMin: 340, reason: 'COLACION' }]
    const ayer = [{ fromMin: 310, toMin: 380, reason: 'COLACION' }]
    expect(mergeBreaks(hoy, ayer, 400)).toEqual([{ fromMin: 300, toMin: 340, reason: 'COLACION' }])
  })
})

describe('la curva objetivo con las paradas de convenio', () => {
  const hoy = serie('2026-08-12T07:45:00Z', Array(96).fill(50))  // 480 min

  it('se APLANA durante la colacion en vez de seguir subiendo', () => {
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', previous: [],
      targetPieces: 5_000, usefulMin: 372,
      breaks: [{ fromMin: 310, toMin: 365, reason: 'COLACION' }],
    })
    expect(piecesAt(r.optimal!, 365)).toBe(piecesAt(r.optimal!, 310))
  })

  it('una recta pediria produccion justo cuando la linea esta parada', () => {
    const conParada = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', previous: [],
      targetPieces: 5_000, usefulMin: 372,
      breaks: [{ fromMin: 310, toMin: 365, reason: 'COLACION' }],
    })
    const recta = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', previous: [],
      targetPieces: 5_000, usefulMin: 372,
    })
    expect(piecesAt(conParada.optimal!, 365)!).toBeLessThan(piecesAt(recta.optimal!, 365)!)
  })

  it('igual llega a la cuota: el ritmo se reparte sobre el tiempo UTIL', () => {
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', previous: [],
      targetPieces: 5_000, usefulMin: 372,
      breaks: [{ fromMin: 310, toMin: 365, reason: 'COLACION' }],
    })
    expect(Math.max(...r.optimal!.map((p) => p.pieces))).toBe(5_000)
  })

  it('nunca pasa de la cuota', () => {
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', previous: [],
      targetPieces: 5_000, usefulMin: 200,
    })
    expect(Math.max(...r.optimal!.map((p) => p.pieces))).toBeLessThanOrEqual(5_000)
  })
})

describe('etiquetas de los días comparados', () => {
  const hoy = serie('2026-08-12T15:00:00Z', Array(12).fill(50))
  const otro = serie('2026-08-12T07:00:00Z', Array(12).fill(40))

  it('distingue los turnos del MISMO día — Yal corre tres por jornada', () => {
    // Sin esto el comparador mostraba tres filas "lun 10" indistinguibles.
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', todayShiftId: 'Turno 2',
      previous: [
        { dateKey: '2026-08-10', shiftId: 'Turno 1', series: otro },
        { dateKey: '2026-08-10', shiftId: 'Turno 2', series: otro },
        { dateKey: '2026-08-10', shiftId: 'Turno 3', series: otro },
      ],
      maxDays: 6,
    })
    expect(r.days.slice(1).map((d) => d.label)).toEqual(['lun 10 T1', 'lun 10 T2', 'lun 10 T3'])
  })

  it('con un turno por día la etiqueta queda corta — no se agrega nada', () => {
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [
        { dateKey: '2026-08-11', shiftId: 'Turno Dia', series: otro },
        { dateKey: '2026-08-10', shiftId: 'Turno Dia', series: otro },
      ],
      maxDays: 6,
    })
    expect(r.days.slice(1).map((d) => d.label)).toEqual(['mar 11', 'lun 10'])
  })

  it('el turno anterior de HOY se lee "hoy", no con la fecha', () => {
    // Aparecía como "mié 12" al lado de "Hoy" y parecía otro día.
    const r = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', todayShiftId: 'Turno 2',
      previous: [{ dateKey: '2026-08-12', shiftId: 'Turno 1', series: otro }],
      maxDays: 6,
    })
    expect(r.days[1]!.label).toBe('hoy T1')
  })
})


describe('diffCurve', () => {
  const hoy = cumulativeFromStart(serie('2026-08-12T07:45:00Z', Array(12).fill(50)))   // 60 min
  const ayer = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(12).fill(40)))

  it('dice cuántas piezas de ventaja llevás en cada tramo', () => {
    const d = diffCurve(hoy, ayer)
    expect(d[0]).toEqual({ minutes: 5, pieces: 10 })
    expect(d[d.length - 1]).toEqual({ minutes: 60, pieces: 120 })
  })

  it('la diferencia BAJA en el tramo donde se pierde terreno', () => {
    // Hoy se para 15 min a mitad de camino: ahí la línea tiene que caer.
    const arr = Array(12).fill(50); arr[6] = 0; arr[7] = 0; arr[8] = 0
    const conParada = cumulativeFromStart(serie('2026-08-12T07:45:00Z', arr))
    const d = diffCurve(conParada, ayer)
    const en30 = d.find((p) => p.minutes === 30)!.pieces
    const en45 = d.find((p) => p.minutes === 45)!.pieces
    expect(en45).toBeLessThan(en30)
  })

  it('NO se estira más allá de donde llegó la referencia', () => {
    // Sin esto la línea seguiría plana e inventaría una ventaja que nadie sacó.
    const corto = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(4).fill(40)))
    const d = diffCurve(hoy, corto)
    expect(d[d.length - 1]!.minutes).toBe(20)
  })

  it('sin curvas no dibuja nada', () => {
    expect(diffCurve([], ayer)).toEqual([])
    expect(diffCurve(hoy, [])).toEqual([])
  })
})

describe('resumenComparacion', () => {
  const hoyS = serie('2026-08-12T07:45:00Z', Array(24).fill(50))    // 1.200 pz a 120 min
  const flojo = serie('2026-08-11T08:00:00Z', Array(24).fill(30))   // 720
  const bueno = serie('2026-08-10T08:00:00Z', Array(24).fill(45))   // 1.080

  const armar = (previous: Array<{ dateKey: string; series: MonitorSeriesPoint[] }>, meta = 0) =>
    resumenComparacion(buildDayComparison({
      todaySeries: hoyS, todayDateKey: '2026-08-12', previous,
      ...(meta ? { targetPieces: meta, usefulMin: 372 } : {}),
    }))

  it('separa el día más RECIENTE del MEJOR: no siempre son el mismo', () => {
    const r = armar([
      { dateKey: '2026-08-11', series: flojo },
      { dateKey: '2026-08-10', series: bueno },
    ])
    // Cada comparación lleva el valor del OTRO: "480 arriba" no dice nada si
    // no se sabe que ese día llevaba 720 a esta misma altura.
    expect(r.actual).toBe(1_200)
    expect(r.reciente).toEqual({ label: 'mar 11', dif: 480, valor: 720, mismoDia: false })
    expect(r.mejor).toEqual({ label: 'lun 10', dif: 120, valor: 1_080 })
  })

  it('contra la cuota, un número negativo es ir atrasado', () => {
    // A los 120 min la cuota pide 1.613 y hoy lleva 1.200.
    const c = armar([], 5_000).cuota!
    expect(c.dif).toBeLessThan(0)
    expect(c.valor).toBe(1_613)
    expect(c.meta).toBe(5_000)
  })

  it('el rango dice entre cuánto y cuánto se movieron los días anteriores', () => {
    /*
     * Reemplazó a la tarjeta "Para la cuota", que repetía el mismo número que
     * la cabecera y la frase del bloque. Esto contesta otra pregunta: si el
     * turno cae dentro de lo normal o afuera.
     */
    const r = armar([
      { dateKey: '2026-08-11', series: flojo },
      { dateKey: '2026-08-10', series: bueno },
    ])
    expect(r.rango).toEqual({ min: 720, max: 1_080, dias: 2 })
  })

  it('⚠ con UN solo día anterior no hay rango: sería ese día dos veces', () => {
    expect(armar([{ dateKey: '2026-08-11', series: flojo }]).rango).toBeNull()
  })

  it('sin días anteriores ni meta no inventa una conclusión', () => {
    const r = armar([])
    expect(r.reciente).toBeNull()
    expect(r.mejor).toBeNull()
    expect(r.cuota).toBeNull()
    expect(r.rango).toBeNull()
    // Las piezas de hoy sí: son el "llevamos X" del titular.
    expect(r.actual).toBe(1_200)
  })

  it('ignora los días que no llegaron a esta altura de turno', () => {
    const corto = serie('2026-08-11T08:00:00Z', Array(6).fill(50))
    const r = armar([{ dateKey: '2026-08-11', series: corto }, { dateKey: '2026-08-10', series: bueno }])
    expect(r.reciente?.label).toBe('lun 10')
  })
})

describe('findGapWindows — varios tramos', () => {
  const ayer = cumulativeFromStart(serie('2026-08-11T08:00:00Z', Array(48).fill(50)))  // 4 h

  it('devuelve las DOS paradas cuando el atraso se repartió en dos golpes', () => {
    const arr = Array(48).fill(50)
    for (let i = 8; i < 12; i++) arr[i] = 0    // −200 en min 40-60
    for (let i = 30; i < 36; i++) arr[i] = 0   // −300 en min 150-180
    const hoy = cumulativeFromStart(serie('2026-08-12T07:45:00Z', arr))
    const v = findGapWindows(hoy, ayer, 3)
    expect(v).toHaveLength(2)
    // De mayor a menor pérdida: la grande primero aunque ocurrió después.
    expect(v[0]!.lostPieces).toBe(300)
    expect(v[0]!.fromMin).toBe(150)
    expect(v[1]!.lostPieces).toBe(200)
  })

  it('descarta los baches chicos: menos del 10% del atraso es ruido', () => {
    const arr = Array(48).fill(50)
    for (let i = 8; i < 16; i++) arr[i] = 0    // −400: el golpe real
    arr[30] = 45                                // −5: una respiración
    const hoy = cumulativeFromStart(serie('2026-08-12T07:45:00Z', arr))
    const v = findGapWindows(hoy, ayer, 3)
    expect(v).toHaveLength(1)
    expect(v[0]!.lostPieces).toBe(400)
  })

  it('las partes suman: los share de los tramos explican el atraso total', () => {
    const arr = Array(48).fill(50)
    for (let i = 8; i < 12; i++) arr[i] = 0
    for (let i = 30; i < 36; i++) arr[i] = 0
    const hoy = cumulativeFromStart(serie('2026-08-12T07:45:00Z', arr))
    const v = findGapWindows(hoy, ayer, 3)
    const suma = v.reduce((a, g) => a + g.share, 0)
    expect(suma).toBeCloseTo(1, 2)
  })

  it('findGapWindow sigue devolviendo solo la peor', () => {
    const arr = Array(48).fill(50)
    for (let i = 8; i < 12; i++) arr[i] = 0
    for (let i = 30; i < 36; i++) arr[i] = 0
    const hoy = cumulativeFromStart(serie('2026-08-12T07:45:00Z', arr))
    expect(findGapWindow(hoy, ayer)!.lostPieces).toBe(300)
  })
})

/**
 * Cuánto convenio falta de acá al cierre — lo que hay que descontar antes de
 * pedir un ritmo.
 *
 * Datos REALES de Filete leídos con `public-monitor-probe.js`. El 13-08 el
 * turno tuvo 56 stopEvents y solo TRES eran de convenio; el 14-08, 28 y dos.
 * Ese es el filtro que hay que respetar: `stopEvents.r` es un índice a
 * `stopReasons`, no el nombre de la causa, y dibujar/sumar todos daba las 23
 * bandas de ancho mínimo del intento anterior.
 */
describe('breakMinutesBetween — la colación que todavía falta', () => {
  /** Serie de 5 min arrancando 07:40, como la real. */
  const serie = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      t: new Date(Date.parse('2026-08-13T07:40:00.000Z') + i * 5 * 60_000).toISOString(),
      pieces: 40,
    }))

  /** Turno del 13-08: colación de 43 min a las 12:50, más ruido recuperable. */
  const ayer = plannedBreaks({
    series: serie(118),
    stopReasons: ['REUNION INICIO TURNO', 'Micro Detencion', 'EJERCICIO  COMPENSATORIO', 'COLACION', 'Detencion'],
    stopEvents: [
      { r: 0, f: '2026-08-13T07:45:00.000Z', s: 300 },
      { r: 1, f: '2026-08-13T08:20:00.000Z', s: 15 },
      { r: 2, f: '2026-08-13T09:33:00.000Z', s: 180 },
      { r: 4, f: '2026-08-13T11:10:00.000Z', s: 90 },
      { r: 3, f: '2026-08-13T12:50:00.000Z', s: 43 * 60 },
    ],
    plannedReasons: ['COLACION', 'EJERCICIO  COMPENSATORIO', 'REUNION INICIO TURNO'],
  })

  it('de 5 detenciones toma las 3 de convenio, no las 5', () => {
    expect(ayer).toHaveLength(3)
    expect(ayer.map((b) => b.reason)).toContain('COLACION')
    expect(ayer.map((b) => b.reason)).not.toContain('Micro Detencion')
  })

  it('a la altura en que Orel lo miró, faltaban los 43 min de la colación', () => {
    // Turno en curso al minuto 305 (12:45): la colación de los días anteriores
    // vale como pronóstico, y el cierre programado cae en el minuto 470.
    const merged = mergeBreaks([], ayer, 305)
    expect(breakMinutesBetween(merged, 305, 470)).toBe(43)
  })

  it('una parada ya empezada aporta solo el pedazo que falta', () => {
    expect(breakMinutesBetween([{ fromMin: 310, toMin: 353, reason: 'COLACION' }], 330, 470)).toBe(23)
  })

  it('y lo que se pasa del cierre no se cuenta', () => {
    expect(breakMinutesBetween([{ fromMin: 440, toMin: 500, reason: 'COLACION' }], 305, 470)).toBe(30)
  })

  it('con la colación ya pasada no queda nada que descontar', () => {
    expect(breakMinutesBetween(ayer, 400, 470)).toBe(0)
  })
})

/**
 * La parada que está OCURRIENDO.
 *
 * Caso real, 14-08 13:41: la colación de Filete había arrancado a las 13:37 y
 * el payload decía 4 minutos, porque una parada en curso solo reporta lo que
 * lleva. Con esos 4 minutos, el ritmo necesario se repartía sobre 1 h 48 como
 * si la línea fuera a producir los ~50 min que todavía iba a estar parada.
 */
describe('extendOngoingBreaks', () => {
  const ayer = [
    { fromMin: 310, toMin: 353, reason: 'COLACION' },   // 43 min
    { fromMin: 312, toMin: 367, reason: 'COLACION' },   // 55 min
    { fromMin: 308, toMin: 358, reason: 'COLACION' },   // 50 min
  ]

  it('estira la colación en curso a lo que dura en los turnos anteriores', () => {
    const hoy = [{ fromMin: 357, toMin: 361, reason: 'COLACION' }]
    // Mediana de 43/50/55 = 50 min.
    expect(extendOngoingBreaks(hoy, ayer, 360)).toEqual([
      { fromMin: 357, toMin: 407, reason: 'COLACION' },
    ])
  })

  it('no toca una parada que ya cerró hace rato', () => {
    const hoy = [{ fromMin: 300, toMin: 320, reason: 'COLACION' }]
    expect(extendOngoingBreaks(hoy, ayer, 400)).toEqual(hoy)
  })

  it('nunca acorta lo que ya ocurrió, aunque haya durado más que la mediana', () => {
    const hoy = [{ fromMin: 357, toMin: 430, reason: 'COLACION' }]
    expect(extendOngoingBreaks(hoy, ayer, 428)[0]!.toMin).toBe(430)
  })

  it('sin historial de esa causa la deja como está', () => {
    const hoy = [{ fromMin: 357, toMin: 361, reason: 'REUNION INICIO TURNO' }]
    expect(extendOngoingBreaks(hoy, ayer, 360)).toEqual(hoy)
  })

  it('y con eso el descuento pasa de 1 minuto a los 47 que faltan de verdad', () => {
    const hoy = [{ fromMin: 357, toMin: 361, reason: 'COLACION' }]
    const crudo = mergeBreaks(hoy, ayer, 360)
    const estirado = mergeBreaks(extendOngoingBreaks(hoy, ayer, 360), ayer, 360)
    expect(breakMinutesBetween(crudo, 360, 470)).toBeLessThan(10)
    expect(breakMinutesBetween(estirado, 360, 470)).toBe(47)
  })
})

describe('prediccionConvenio', () => {
  /*
   * El caso REAL que motivó la función (simulación a minuto 150 con los 5
   * turnos del espejo, 15-08): volcando los breaks de todos los días crudos,
   * la próxima parada anunciada era un ejercicio fantasma y la DETENCION
   * PROGRAMADA de UN día quedaba pronosticada como diaria — mientras la
   * colación, la única que importa, no se anunciaba nunca.
   */
  const TURNOS = [
    [{ reason: 'REUNION INICIO TURNO', fromMin: 5, toMin: 10 },
     { reason: 'EJERCICIO  COMPENSATORIO', fromMin: 114, toMin: 117 },
     { reason: 'COLACION', fromMin: 310, toMin: 353 }],
    [{ reason: 'REUNION INICIO TURNO', fromMin: 5, toMin: 9 },
     { reason: 'DETENCION PROGRAMADA', fromMin: 143, toMin: 160 },
     { reason: 'COLACION', fromMin: 242, toMin: 244 },
     { reason: 'COLACION', fromMin: 311, toMin: 366 }],
    [{ reason: 'REUNION INICIO TURNO', fromMin: 5, toMin: 21 },
     { reason: 'EJERCICIO  COMPENSATORIO', fromMin: 62, toMin: 65 },
     { reason: 'COLACION', fromMin: 282, toMin: 346 }],
    [{ reason: 'EJERCICIO  COMPENSATORIO', fromMin: 92, toMin: 97 },
     { reason: 'COLACION', fromMin: 313, toMin: 366 }],
    [{ reason: 'REUNION INICIO TURNO', fromMin: 5, toMin: 10 },
     { reason: 'EJERCICIO  COMPENSATORIO', fromMin: 155, toMin: 160 },
     { reason: 'COLACION', fromMin: 301, toMin: 353 }],
  ]

  it('⚠⚠ lo de UN solo día no se pronostica como diario', () => {
    const p = prediccionConvenio(TURNOS)
    expect(p.some((b) => b.reason === 'DETENCION PROGRAMADA')).toBe(false)
  })

  it('la colación se predice con la mediana, robusta al día raro', () => {
    const p = prediccionConvenio(TURNOS)
    const col = p.find((b) => b.reason === 'COLACION')!
    // Mediana de inicios por turno: 242(raro),282,301,310,313 → 301.
    // El outlier del día partido no la arrastra.
    expect(col.fromMin).toBe(301)
    expect(col.toMin).toBeGreaterThan(340)
  })

  it('lo recurrente con horario variable igual entra, con su mediana', () => {
    const p = prediccionConvenio(TURNOS)
    const ej = p.find((b) => b.reason === 'EJERCICIO  COMPENSATORIO')!
    expect(ej.fromMin).toBe(114)   // mediana de 62/92/114/155 (par: se toma el alto)
  })

  it('sin turnos anteriores no se inventa convenio', () => {
    expect(prediccionConvenio([])).toEqual([])
    expect(prediccionConvenio([[], []])).toEqual([])
  })
})
