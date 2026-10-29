/**
 * «Hora a hora» en la hora del cuadro: la hora en curso la decide el instante reproducido y las horas suman SIEMPRE las hechas, aunque
 * la serie de 5 min vaya adelante o atrás del cuadro en el cambio de hora.
 */
import { describe, expect, it } from 'vitest'
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'
import { horasEnCuadro } from '../horaAHoraViva'

const T0 = Date.UTC(2026, 9, 28, 20, 0)
const HORA = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const hhmm = (s: string) => s.slice(11, 16)

function fila(i: number, pieces: number, minutos = 60): HourlyRow {
  return {
    hourStart: iso(T0 + i * HORA), index: i + 1, from: iso(T0 + i * HORA), to: iso(T0 + i * HORA + minutos * 60_000),
    pieces, minutesCovered: minutos, piecesPerHour: Math.round((pieces / minutos) * 60), partial: minutos < 60,
  }
}
const suma = (xs: number[]) => xs.reduce((a, x) => a + x, 0)

describe('horasEnCuadro', () => {
  /* 20:00 → 22:00 cerradas (1.200 + 1.300) y, según la serie, 22:00 con 5 min (120 pz). */
  const base = [fila(0, 1200), fila(1, 1300), fila(2, 120, 5)]
  const maqBase = [
    { nombre: 'B1', piezas: [600, 650, 60] },
    { nombre: 'B2', piezas: [600, 650, 60] },
  ]

  it('el cuadro a mitad de hora: horas anteriores de la serie y la hora en curso = hechas − anteriores, línea y cada Baader', () => {
    const r = horasEnCuadro({
      filas: base, porMaquina: maqBase, hechas: 2500 + 300, tMs: T0 + 2 * HORA + 14 * 60_000 + 30_000,
      hechasPorMaquina: [{ nombre: 'B1', valor: 1400 }, { nombre: 'B2', valor: 1400 }],
    })
    expect(r.filas.map((h) => h.pieces)).toEqual([1200, 1300, 300])
    expect(r.filas[2]).toMatchObject({ partial: true, minutesCovered: 14 })
    expect(hhmm(r.filas[2]!.from)).toBe('22:00')
    expect(hhmm(r.filas[2]!.to)).toBe('22:14')
    expect(r.porMaquina.map((m) => m.piezas)).toEqual([[600, 650, 150], [600, 650, 150]])
    expect(suma(r.filas.map((h) => h.pieces))).toBe(2800)
  })

  it('caso A: la serie ya abrió las 22:00 y el cuadro va en 21:58: la hora 21:00 NO muestra piezas que el cuadro no reprodujo y las horas suman las hechas', () => {
    /* La serie ya cerró la hora de las 21:00 con 1.350 pz y abrió la de las 22:00; el cuadro está en 21:58 con 2.540 hechas. */
    const serieAdelante = [fila(0, 1200), fila(1, 1350), fila(2, 125, 5)]
    const r = horasEnCuadro({
      filas: serieAdelante, porMaquina: [], hechas: 2540, hechasPorMaquina: null, tMs: T0 + 1 * HORA + 58 * 60_000,
    })
    expect(r.filas).toHaveLength(2)
    expect(r.filas.map((h) => h.pieces)).toEqual([1200, 1340])
    expect(hhmm(r.filas[1]!.to)).toBe('21:58')
    expect(suma(r.filas.map((h) => h.pieces))).toBe(2540)
  })

  it('caso B: la serie va atrás (llega a 21:55) y el cuadro ya está en 22:03: la fila de las 21:00 queda como hora cerrada, no «21:00–21:55 en curso», y las 22:00 llevan lo que falta', () => {
    const serieAtras = [fila(0, 1200), fila(1, 1290, 55)]
    const r = horasEnCuadro({
      filas: serieAtras, porMaquina: [{ nombre: 'B1', piezas: [600, 640] }], hechas: 2560, tMs: T0 + 2 * HORA + 3 * 60_000,
      hechasPorMaquina: [{ nombre: 'B1', valor: 2560 }],
    })
    expect(r.filas).toHaveLength(3)
    expect(r.filas[1]).toMatchObject({ partial: false, pieces: 1290 })
    expect(hhmm(r.filas[1]!.to)).toBe('22:00')
    expect(r.filas[2]).toMatchObject({ partial: true, pieces: 70 })
    expect(hhmm(r.filas[2]!.from)).toBe('22:00')
    expect(suma(r.filas.map((h) => h.pieces))).toBe(2560)
    expect(suma(r.porMaquina[0]!.piezas)).toBe(2560)
  })

  it('en cada cuadro de un cambio de hora (cada 20 s) las horas suman exactamente las hechas, para la línea y las Baader', () => {
    const adelante = [fila(0, 1200), fila(1, 1350), fila(2, 125, 5)]
    for (let t = T0 + 1 * HORA + 50 * 60_000; t <= T0 + 2 * HORA + 10 * 60_000; t += 20_000) {
      const hechas = 1200 + Math.round(((t - (T0 + HORA)) / 60_000) * 22.5)
      const r = horasEnCuadro({
        filas: adelante, porMaquina: maqBase, hechas, tMs: t,
        hechasPorMaquina: [{ nombre: 'B1', valor: Math.floor(hechas / 2) }, { nombre: 'B2', valor: hechas - Math.floor(hechas / 2) }],
      })
      expect(suma(r.filas.map((h) => h.pieces))).toBe(hechas)
      expect(suma(r.porMaquina.map((m) => suma(m.piezas)))).toBe(hechas)
      /* la última fila es la hora del cuadro */
      expect(Date.parse(r.filas[r.filas.length - 1]!.from)).toBe(T0 + Math.floor((t - T0) / HORA) * HORA)
    }
  })

  it('sin instante del cuadro o sin filas devuelve lo de la serie tal cual', () => {
    expect(horasEnCuadro({ filas: base, porMaquina: maqBase, hechas: 10, hechasPorMaquina: null, tMs: null }).filas).toBe(base)
    expect(horasEnCuadro({ filas: [], porMaquina: [], hechas: 10, hechasPorMaquina: null, tMs: T0 }).filas).toEqual([])
  })

  it('las hechas por debajo de lo que sumaron las horas anteriores no dan una hora negativa', () => {
    const r = horasEnCuadro({ filas: base, porMaquina: [], hechas: 2400, hechasPorMaquina: null, tMs: T0 + 2 * HORA + 5 * 60_000 })
    expect(r.filas[2]!.pieces).toBe(0)
  })
})
