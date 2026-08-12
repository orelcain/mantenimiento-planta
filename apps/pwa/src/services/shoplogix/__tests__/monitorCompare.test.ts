/**
 * monitorCompare — comparar el turno en curso con los anteriores.
 *
 * El error que esto evita, dicho en voz alta: "hoy llevamos 3.028 y ayer hizo
 * 3.275". Ayer eran las 15:30 y hoy son las 13:00. Todo se compara a la misma
 * hora o no se compara.
 */
import { describe, it, expect } from 'vitest'
import { cumulativeByHour, buildDayComparison, optimalPace } from '../monitorCompare'
import type { MonitorSeriesPoint } from '../monitorHourly'

/** Serie de tramos de 5 min desde `desde`. */
function serie(desde: string, piezasPorTramo: number[]): MonitorSeriesPoint[] {
  const t0 = Date.parse(desde)
  return piezasPorTramo.map((pieces, i) => ({
    t: new Date(t0 + i * 5 * 60_000).toISOString(),
    pieces,
  }))
}

describe('cumulativeByHour', () => {
  it('acumula: cada hora incluye todo lo anterior', () => {
    // 08h: 12 tramos de 50 = 600 · 09h: 12 de 60 = 720 → acumulado 1.320
    const c = cumulativeByHour(serie('2026-08-12T08:00:00Z', [...Array(12).fill(50), ...Array(12).fill(60)]))
    expect(c).toEqual([{ hour: 8, pieces: 600 }, { hour: 9, pieces: 1320 }])
  })

  it('lee la hora en wall-clock de planta', () => {
    expect(cumulativeByHour(serie('2026-08-12T08:00:00Z', [10]))[0]!.hour).toBe(8)
  })

  it('un turno NOCHE no pone la madrugada antes de la tarde', () => {
    // 22h, 23h, 0h, 1h — ordenar por número daría 0,1,22,23 y el acumulado
    // saldría al revés.
    const s = [
      ...serie('2026-08-11T22:00:00Z', Array(12).fill(10)),
      ...serie('2026-08-11T23:00:00Z', Array(12).fill(10)),
      ...serie('2026-08-12T00:00:00Z', Array(12).fill(10)),
      ...serie('2026-08-12T01:00:00Z', Array(12).fill(10)),
    ]
    expect(cumulativeByHour(s).map((c) => c.hour)).toEqual([22, 23, 0, 1])
  })

  it('sin serie no inventa nada', () => {
    expect(cumulativeByHour([])).toEqual([])
    expect(cumulativeByHour(null)).toEqual([])
  })
})

describe('buildDayComparison', () => {
  // Hoy: 3 horas completas + una a medio andar.
  const hoy = [
    ...serie('2026-08-12T08:00:00Z', Array(12).fill(50)),   // 600
    ...serie('2026-08-12T09:00:00Z', Array(12).fill(50)),   // 1.200
    ...serie('2026-08-12T10:00:00Z', Array(12).fill(50)),   // 1.800
    ...serie('2026-08-12T11:00:00Z', Array(3).fill(50)),    // 1.950 (hora en curso)
  ]
  // Ayer: turno completo, más lento al principio y más largo.
  const ayer = [
    ...serie('2026-08-11T08:00:00Z', Array(12).fill(40)),   // 480
    ...serie('2026-08-11T09:00:00Z', Array(12).fill(40)),   // 960
    ...serie('2026-08-11T10:00:00Z', Array(12).fill(40)),   // 1.440
    ...serie('2026-08-11T11:00:00Z', Array(12).fill(40)),   // 1.920
    ...serie('2026-08-11T12:00:00Z', Array(12).fill(40)),   // 2.400
  ]

  it('compara a la ÚLTIMA HORA COMPLETA, no a la que está corriendo', () => {
    // Si comparara la hora 11 (a medio llenar) contra la 11 entera de ayer,
    // hoy parecería en caída todas las horas, siempre.
    const { currentHour } = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: ayer }],
    })
    expect(currentHour).toBe(10)
  })

  it('da el acumulado de cada día A ESA hora', () => {
    const { days } = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: ayer }],
    })
    expect(days[0]!.atCurrentHour).toBe(1800)   // hoy a las 10h
    expect(days[1]!.atCurrentHour).toBe(1440)   // ayer a las 10h
  })

  it('el TOTAL de ayer sigue disponible, y es distinto del de la misma hora', () => {
    const { days } = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: ayer }],
    })
    // 2.400 al cierre contra 1.440 a las 10h: comparar contra el total es el
    // error que motivó todo esto.
    expect(days[1]!.totalPieces).toBe(2400)
    expect(days[1]!.atCurrentHour).toBe(1440)
  })

  it('marca cuál es hoy', () => {
    const { days } = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: ayer }],
    })
    expect(days[0]!.esHoy).toBe(true)
    expect(days.filter((d) => d.esHoy)).toHaveLength(1)
  })

  it('limita cuántos días entran — en un celular no caben cinco líneas', () => {
    const previous = ['2026-08-11', '2026-08-10', '2026-08-08', '2026-08-07']
      .map((dateKey) => ({ dateKey, series: ayer }))
    const { days } = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12', previous, maxDays: 2,
    })
    expect(days).toHaveLength(3) // hoy + 2
  })

  it('descarta los días anteriores sin datos en vez de dibujar una línea plana', () => {
    const { days } = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: [] }],
    })
    expect(days).toHaveLength(1)
  })

  it('un día que todavía no llegó a esa hora da null, no cero', () => {
    // Cero se leería como "no produjo"; null es "no hay dato de esa hora".
    const corto = serie('2026-08-11T08:00:00Z', Array(12).fill(40))
    const { days } = buildDayComparison({
      todaySeries: hoy, todayDateKey: '2026-08-12',
      previous: [{ dateKey: '2026-08-11', series: corto }],
    })
    expect(days[1]!.atCurrentHour).toBeNull()
  })

  it('sin turno en curso no compara nada', () => {
    expect(buildDayComparison({ todaySeries: [], todayDateKey: 'x', previous: [] }).days).toEqual([])
  })
})

describe('optimalPace', () => {
  it('descuenta las paradas de convenio — el reparto lineal es tramposo', () => {
    // Turno real de Filete: 450 min de ventana, 78 planificados → 372 útiles.
    const r = optimalPace({ targetPieces: 5_000, windowMin: 450, plannedMin: 78 })!
    expect(r.usefulMin).toBe(372)
    expect(r.requiredCpm).toBeCloseTo(5_000 / 372, 4)
    // Y ese número es MAYOR que el reparto ingenuo sobre el turno completo.
    expect(r.requiredCpm).toBeGreaterThan(5_000 / 450)
  })

  it('sin meta o sin tiempo útil no inventa un ritmo', () => {
    expect(optimalPace({ targetPieces: 0, windowMin: 450, plannedMin: 78 })).toBeNull()
    expect(optimalPace({ targetPieces: 5_000, windowMin: 60, plannedMin: 60 })).toBeNull()
    expect(optimalPace({ targetPieces: 5_000, windowMin: 60, plannedMin: 90 })).toBeNull()
  })
})
