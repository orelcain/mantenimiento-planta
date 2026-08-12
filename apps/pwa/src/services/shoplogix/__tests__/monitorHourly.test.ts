/**
 * monitorHourly — el turno hora por hora.
 *
 * El caso que lo motiva: un supervisor dice "en la primera hora hicimos 800
 * piezas" y hay que poder contrastarlo. Si el turno arranca 21:15, esa "primera
 * hora" son 45 minutos — comparar sus piezas contra una hora completa es el
 * error que esta vista existe para evitar.
 */
import { describe, it, expect } from 'vitest'
import { buildHourlyRows, peakPieces, type MonitorSeriesPoint } from '../monitorHourly'

/** Serie de tramos de 5 min desde `desde`, con las piezas dadas por tramo. */
function serie(desde: string, piezasPorTramo: number[]): MonitorSeriesPoint[] {
  const t0 = Date.parse(desde)
  return piezasPorTramo.map((pieces, i) => ({
    t: new Date(t0 + i * 5 * 60_000).toISOString(),
    pieces,
  }))
}

describe('buildHourlyRows', () => {
  it('agrupa los tramos de 5 min por hora de reloj', () => {
    // 21:00 → 12 tramos de 50 pz = 600; 22:00 → 12 tramos de 60 pz = 720
    const s = serie('2026-08-11T21:00:00Z', [...Array(12).fill(50), ...Array(12).fill(60)])
    const rows = buildHourlyRows(s)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ hour: 21, pieces: 600, minutesCovered: 60, partial: false })
    expect(rows[1]).toMatchObject({ hour: 22, pieces: 720, minutesCovered: 60, partial: false })
  })

  it('marca PARCIAL la primera hora de un turno que arranca 21:15', () => {
    // 21:15 → quedan 45 min de la hora 21 = 9 tramos.
    const s = serie('2026-08-11T21:15:00Z', Array(9).fill(50))
    const [primera] = buildHourlyRows(s)
    expect(primera).toMatchObject({ hour: 21, pieces: 450, minutesCovered: 45, partial: true })
  })

  it('el RITMO de una hora parcial se extrapola a la hora completa', () => {
    // 450 pz en 45 min = 600 pz/h. Ese es el número comparable, no las 450.
    const s = serie('2026-08-11T21:15:00Z', Array(9).fill(50))
    expect(buildHourlyRows(s)[0]!.piecesPerHour).toBe(600)
  })

  it('desmiente el caso real: 450 piezas en 45 min NO son 800 en la primera hora', () => {
    const s = serie('2026-08-11T21:15:00Z', Array(9).fill(50))
    const [primera] = buildHourlyRows(s)
    expect(primera!.pieces).toBeLessThan(800)
    expect(primera!.piecesPerHour).toBeLessThan(800)
  })

  it('y lo confirma cuando el ritmo SÍ da', () => {
    // 9 tramos de 67 pz = 603 pz en 45 min → 804 pz/h.
    const s = serie('2026-08-11T21:15:00Z', Array(9).fill(67))
    const [primera] = buildHourlyRows(s)
    expect(primera!.pieces).toBe(603)
    expect(primera!.piecesPerHour).toBe(804)
  })

  it('lee la hora en WALL-CLOCK de planta, no en el huso de quien mira', () => {
    // Los ISO del monitor llevan Z pero son hora de planta. `getUTCHours` de
    // 21:00Z es 21 en cualquier celular; `getHours` daría otra cosa en Chile.
    const rows = buildHourlyRows(serie('2026-08-11T21:00:00Z', Array(12).fill(10)))
    expect(rows[0]!.hour).toBe(21)
  })

  it('cruza la medianoche sin mezclar las horas de los dos días', () => {
    // 23:30 → 6 tramos (hora 23) y luego 12 tramos de la hora 0 del día 12.
    const s = serie('2026-08-11T23:30:00Z', [...Array(6).fill(40), ...Array(12).fill(70)])
    const rows = buildHourlyRows(s)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ hour: 23, pieces: 240, partial: true })
    expect(rows[1]).toMatchObject({ hour: 0, pieces: 840, partial: false })
    expect(rows[1]!.hourStart.startsWith('2026-08-12T00:00')).toBe(true)
  })

  it('una hora con la línea parada es 0, no un hueco', () => {
    const s = serie('2026-08-11T21:00:00Z', [...Array(12).fill(50), ...Array(12).fill(0)])
    const rows = buildHourlyRows(s)
    expect(rows[1]).toMatchObject({ hour: 22, pieces: 0, piecesPerHour: 0, partial: false })
  })

  it('sale en orden cronológico aunque la serie llegue desordenada', () => {
    const s = serie('2026-08-11T21:00:00Z', Array(24).fill(10)).reverse()
    expect(buildHourlyRows(s).map((r) => r.hour)).toEqual([21, 22])
  })

  it('ignora timestamps corruptos en vez de romper la vista entera', () => {
    const s: MonitorSeriesPoint[] = [
      { t: 'no-es-fecha', pieces: 999 },
      ...serie('2026-08-11T21:00:00Z', Array(12).fill(50)),
    ]
    const rows = buildHourlyRows(s)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.pieces).toBe(600)
  })

  it('sin serie no inventa filas', () => {
    expect(buildHourlyRows([])).toEqual([])
    expect(buildHourlyRows(null)).toEqual([])
    expect(buildHourlyRows(undefined)).toEqual([])
  })
})

describe('peakPieces', () => {
  it('devuelve la hora más productiva, para escalar las barras', () => {
    const s = serie('2026-08-11T21:00:00Z', [...Array(12).fill(50), ...Array(12).fill(80)])
    expect(peakPieces(buildHourlyRows(s))).toBe(960)
  })

  it('sin filas es 0 y no rompe la división de las barras', () => {
    expect(peakPieces([])).toBe(0)
  })
})
