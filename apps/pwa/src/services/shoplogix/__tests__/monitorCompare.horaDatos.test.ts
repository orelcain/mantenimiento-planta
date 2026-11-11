/**
 * PR A2 — las cifras de «El turno» a la HORA DE LOS DATOS.
 *
 * D1: la cuota se evaluaba al FIN del tramo de 5 min en curso (escalón) mientras las piezas que se le restan son las del
 *     último minuto cerrado: «A esta hora» hacía diente de sierra (subía ~1 min y caía 5 × cpm al cambiar de tramo).
 * D2: el convenio y el punto vivo medían desde el primer tramo de la serie (vacío si el turno arrancó tarde), y la
 *     curva desde la primera pieza: el plano de la cuota quedaba corrido los minutos vacíos del arranque.
 * Δ43: «Comparado con otros días» leía al día anterior en escalón, en el fin del tramo; la leyenda del gráfico lo
 *     interpola en T. Dos cifras del mismo turno anterior.
 */
import { describe, it, expect } from 'vitest'
import {
  alinearAHoraDeDatos, buildDayComparison, conPuntoVivo, cuotaA, piezasALaAltura, plannedBreaks,
} from '../monitorCompare'
import { desdePrimeraPieza } from '../monitorActividad'
import type { MonitorSeriesPoint } from '../monitorHourly'
import { aEstaHora, barrasDesdeMs, horaDeLosDatos, minutoDeDatos } from '@/pages/monitor/aEstaHora'
import { cifraTurnoAnterior } from '@/pages/monitor/ejeTurno'

function serie(desde: string, piezasPorTramo: number[]): MonitorSeriesPoint[] {
  const t0 = Date.parse(desde)
  return piezasPorTramo.map((pieces, i) => ({ t: new Date(t0 + i * 5 * 60_000).toISOString(), pieces }))
}

/** La serie de hoy vista a los `m` min de la primera pieza, a 10 pz/min: tramos cerrados y el tramo en curso parcial. */
function serieAl(m: number): MonitorSeriesPoint[] {
  const llenos = Math.floor(m / 5)
  const parcial = Math.round((m - llenos * 5) * 10)
  return serie('2026-10-28T07:00:00Z', [...Array(llenos).fill(50), ...(parcial > 0 ? [parcial] : [])])
}

describe('cuotaA · la cuota interpolada en la hora de los datos', () => {
  const curva = [{ minutes: 0, pieces: 0 }, { minutes: 5, pieces: 50 }, { minutes: 10, pieces: 100 }]
  it('interpola dentro del tramo (el escalón daba 50 a los 7,5 min)', () => {
    expect(cuotaA(curva, 7.5)).toBe(75)
  })
  it('0 antes del arranque; pasado el último punto, la meta; null sin curva o sin minuto', () => {
    expect(cuotaA(curva, -1)).toBe(0)
    expect(cuotaA(curva, 12, 120)).toBe(120)
    expect(cuotaA(curva, 12)).toBe(100)
    expect(cuotaA(null, 3)).toBeNull()
    expect(cuotaA(curva, null)).toBeNull()
  })
})

describe('«A esta hora» no salta al cruzar un tramo (D1)', () => {
  it('produciendo justo al ritmo de la meta, la resta es 0 en todo minuto, también dentro del tramo en curso', () => {
    for (let m = 6; m <= 19; m += 0.5) {
      const base = buildDayComparison({
        todaySeries: serieAl(m), todayDateKey: '2026-10-28', previous: [], targetPieces: 4800, usefulMin: 480,
      })
      const mostradas = 10 * m
      const cmp = alinearAHoraDeDatos(base, { minutoDatos: m, mostradas })
      expect(cmp.currentMinute).toBe(m)
      expect(aEstaHora(mostradas, cmp.optimalAtCurrentMinute, 4800)).toBe(0)
    }
  })
})

describe('el punto vivo reemplaza al tramo en curso', () => {
  it('con el contador a los 3 min, dentro del primer tramo, el «ahora» es 3 (antes quedaba en 5, el fin del tramo)', () => {
    const r = buildDayComparison({
      todaySeries: serie('2026-10-28T07:00:00Z', [20]), todayDateKey: '2026-10-28', previous: [],
      hoyVivo: { pieces: 30, minute: 3 },
    })
    expect(r.currentMinute).toBe(3)
    expect(r.days[0]!.atCurrentMinute).toBe(30)
    // El tramo parcial (rotulado en su fin, el minuto 5) sale: la curva no puede ir hacia atrás en el tiempo.
    expect(r.days[0]!.curve).toEqual([{ minutes: 3, pieces: 30 }])
  })
  it('un contador con menos piezas que la curva no la retrocede', () => {
    const hoy = [{ minutes: 5, pieces: 50 }, { minutes: 10, pieces: 90 }]
    expect(conPuntoVivo(hoy, { pieces: 60, minute: 8 })).toBe(hoy)
  })
})

describe('Comparado con otros días = la leyenda del gráfico (Δ43)', () => {
  it('el turno anterior se lee interpolado en T, la misma cifra que `cifraTurnoAnterior`', () => {
    const ayer = serie('2026-10-27T07:00:00Z', Array(36).fill(40))
    const m = 12
    const base = buildDayComparison({
      todaySeries: serieAl(m), todayDateKey: '2026-10-28', previous: [{ dateKey: '2026-10-27', series: ayer }],
    })
    const cmp = alinearAHoraDeDatos(base, { minutoDatos: m, mostradas: 120 })
    const previo = cmp.days.find((d) => !d.esHoy)!
    expect(previo.atCurrentMinute).toBe(96) // 8 pz/min × 12 min (el escalón en el fin del tramo daba 120)
    const leyenda = cifraTurnoAnterior({ curva: previo.curve, cerrado: false, ultimaMin: m + 7, baseMin: 7 })
    expect(leyenda?.piezas).toBe(previo.atCurrentMinute)
    expect(cmp.days.find((d) => d.esHoy)!.atCurrentMinute).toBe(120)
  })
  it('piezasALaAltura no extrapola más allá del último dato', () => {
    expect(piezasALaAltura([{ minutes: 5, pieces: 40 }], 6)).toBeNull()
    expect(piezasALaAltura([{ minutes: 5, pieces: 40 }], 2.5)).toBe(20)
  })
})

describe('origen P = primera pieza (D2)', () => {
  // La serie arranca 07:00 con 3 tramos vacíos: la primera pieza (P) es 07:15.
  const s = serie('2026-10-28T07:00:00Z', [0, 0, 0, 50, 50, 50, 50, 50])
  it('el convenio se ubica desde P: una colación a P+10 es el minuto 10 (antes 25)', () => {
    const r = plannedBreaks({
      series: s, stopReasons: ['COLACION'], plannedReasons: ['COLACION'],
      stopEvents: [{ r: 0, f: '2026-10-28T07:25:00Z', s: 30 * 60 }],
    })
    expect(r).toEqual([{ fromMin: 10, toMin: 40, reason: 'COLACION' }])
  })
  it('el minuto del contador se mide desde P: corte a P+18 es 18 (antes 33)', () => {
    const P = Date.parse(desdePrimeraPieza(s)[0]!.t)
    expect(minutoDeDatos(Date.parse('2026-10-28T07:33:00Z'), P)).toBe(18)
  })
})

describe('horaDeLosDatos', () => {
  it('con la reproducción, el fin del último minuto cerrado; sin ella, el corte del contador', () => {
    const entrada = { desdeMs: 0, maquinas: [{ id: 'a', nombre: 'a', modelo: null, esperado: null, cycles: [1, 2, 3] }], paradas: {}, pulsoAtMs: null }
    expect(horaDeLosDatos({ entrada }, 999_999)).toBe(3 * 60_000)
    expect(horaDeLosDatos(null, 123)).toBe(123)
    expect(horaDeLosDatos({ entrada: null }, null)).toBeNull()
  })
})

describe('barras desde la primera pieza si fue antes del inicio (D2, decisión de Orel)', () => {
  it('produjo antes: las barras parten en la primera pieza; si no, en el inicio del turno', () => {
    expect(barrasDesdeMs(1_000, 400)).toBe(400)
    expect(barrasDesdeMs(1_000, 1_600)).toBe(1_000)
    expect(barrasDesdeMs(1_000, null)).toBe(1_000)
  })
})
