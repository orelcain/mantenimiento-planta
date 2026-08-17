/**
 * monitorHourly — el turno en horas CORRIDAS desde el arranque.
 *
 * El caso que lo motivó: un supervisor dijo "en la primera hora hicieron 800".
 * Para contrastarlo, la "primera hora" tiene que ser la hora real de trabajo
 * (07:45 → 08:45) y no el pedazo de hora de reloj que quedó antes de las 08:00.
 * Es además como cuenta Shoplogix (confirmado por Orel, 12-08).
 */
import { describe, it, expect } from 'vitest'
import { buildHourlyRows, peakPieces, type MonitorSeriesPoint } from '../monitorHourly'

/** Serie de tramos de 5 min desde `desde`. */
function serie(desde: string, piezasPorTramo: number[]): MonitorSeriesPoint[] {
  const t0 = Date.parse(desde)
  return piezasPorTramo.map((pieces, i) => ({
    t: new Date(t0 + i * 5 * 60_000).toISOString(),
    pieces,
  }))
}

describe('buildHourlyRows', () => {
  it('la hora 1 va del ARRANQUE a +60 min, no hasta el cambio de hora', () => {
    // Turno que arranca 07:45. Por hora de reloj la primera fila serían 15 min.
    const rows = buildHourlyRows(serie('2026-08-12T07:45:00Z', Array(24).fill(50)))
    expect(rows).toHaveLength(2)
    expect(rows[0]!.from.slice(11, 16)).toBe('07:45')
    expect(rows[0]!.to.slice(11, 16)).toBe('08:45')
    expect(rows[0]!.pieces).toBe(600)   // 12 tramos × 50
    expect(rows[0]!.partial).toBe(false)
  })

  it('numera las horas del turno, 1-based', () => {
    const rows = buildHourlyRows(serie('2026-08-12T07:45:00Z', Array(30).fill(10)))
    expect(rows.map((r) => r.index)).toEqual([1, 2, 3])
  })

  it('el ritmo pz/h de una hora completa es su propio total', () => {
    const rows = buildHourlyRows(serie('2026-08-12T07:45:00Z', Array(12).fill(50)))
    expect(rows[0]!.piecesPerHour).toBe(600)
  })

  it('solo la ÚLTIMA hora puede quedar parcial — el turno sigue en curso', () => {
    // 90 min: la hora 1 completa, la 2 a medias.
    const rows = buildHourlyRows(serie('2026-08-12T07:45:00Z', Array(18).fill(50)))
    expect(rows[0]!.partial).toBe(false)
    expect(rows[1]!.partial).toBe(true)
    expect(rows[1]!.minutesCovered).toBe(30)
  })

  it('en una hora parcial las piezas son menos pero el RITMO se compara igual', () => {
    // Media hora al mismo ritmo que una hora completa: 300 pz, 600 pz/h.
    const rows = buildHourlyRows(serie('2026-08-12T07:45:00Z', Array(6).fill(50)))
    expect(rows[0]!.pieces).toBe(300)
    expect(rows[0]!.piecesPerHour).toBe(600)
  })

  it('el nocturno cruza la medianoche sin romper el orden', () => {
    const rows = buildHourlyRows(serie('2026-08-11T23:15:00Z', Array(24).fill(10)))
    expect(rows.map((r) => r.index)).toEqual([1, 2])
    expect(rows[0]!.from.slice(11, 16)).toBe('23:15')
    expect(rows[1]!.from.startsWith('2026-08-12T00:15')).toBe(true)
  })

  it('lee el reloj como wall-clock, no en el huso de quien mira', () => {
    // Con getHours() esta fila se correría al huso local del celular.
    const rows = buildHourlyRows(serie('2026-08-12T21:30:00Z', Array(12).fill(10)))
    expect(rows[0]!.from.slice(11, 16)).toBe('21:30')
  })

  it('ordena aunque la serie llegue desordenada', () => {
    const s = serie('2026-08-12T07:45:00Z', Array(24).fill(50)).reverse()
    const rows = buildHourlyRows(s)
    expect(rows.map((r) => r.index)).toEqual([1, 2])
    expect(rows[0]!.from.slice(11, 16)).toBe('07:45')
  })

  it('un hueco de sincronización deja la hora corta, no la borra', () => {
    const s: MonitorSeriesPoint[] = [
      ...serie('2026-08-12T07:45:00Z', Array(6).fill(50)),
      ...serie('2026-08-12T08:25:00Z', Array(4).fill(50)),  // faltan 10 min
    ]
    const [fila] = buildHourlyRows(s)
    expect(fila!.minutesCovered).toBe(50)
    expect(fila!.pieces).toBe(500)
    expect(fila!.partial).toBe(true)
  })

  it('sin serie no inventa filas', () => {
    expect(buildHourlyRows([])).toEqual([])
    expect(buildHourlyRows(null)).toEqual([])
    expect(buildHourlyRows(undefined)).toEqual([])
  })
})

describe('peakPieces', () => {
  it('devuelve la hora más productiva', () => {
    const s: MonitorSeriesPoint[] = [
      ...serie('2026-08-12T07:45:00Z', Array(12).fill(50)),   // 600
      ...serie('2026-08-12T08:45:00Z', Array(12).fill(80)),   // 960
    ]
    expect(peakPieces(buildHourlyRows(s))).toBe(960)
  })

  it('sin filas es 0 y no NaN — divide el ancho de las barras', () => {
    expect(peakPieces([])).toBe(0)
  })
})

/*
 * ⚠⚠ El caso Filete del 17-08-2026: turno sin definir en Shoplogix. La serie
 * arranca a las 09:45 (Shoplogix sincroniza tramos vacíos desde el borde de la
 * ventana) y la primera pieza llega a las 21:45. Antes salían doce filas h1..h12
 * con 0 pz antes de la primera con producción.
 */
describe('buildHourlyRows · el turno empieza en la primera pieza', () => {
  const punto = (h: number, m: number, pieces: number) => ({
    t: `2026-08-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`,
    pieces,
  })

  it('no cuenta las horas vacías previas a la primera pieza', () => {
    const series = [
      // 12 tramos vacíos: 09:45 → 10:40
      ...Array.from({ length: 12 }, (_, i) => punto(9 + Math.floor((45 + i * 5) / 60), (45 + i * 5) % 60, 0)),
      punto(21, 45, 40),
      punto(21, 50, 50),
    ]
    const rows = buildHourlyRows(series)
    // Una sola hora: la que arranca con la primera pieza.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.index).toBe(1)
    expect(rows[0]!.pieces).toBe(90)
    expect(rows[0]!.from).toContain('21:45')
  })

  it('un turno que produce desde el primer tramo no cambia', () => {
    const rows = buildHourlyRows([punto(7, 45, 30), punto(7, 50, 30)])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.pieces).toBe(60)
    expect(rows[0]!.from).toContain('07:45')
  })
})
