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
import { cumulativeFromStart, piecesAt, buildDayComparison, optimalPace, findGapWindow } from '../monitorCompare'
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
