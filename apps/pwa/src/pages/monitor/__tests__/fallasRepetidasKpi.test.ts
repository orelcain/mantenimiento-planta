/**
 * KPI «fallas repetidas de Mantención»: el golden con el fixture semanal real (Chonchi y Yal, hoy 2026-11-02),
 * las sintéticas de los umbrales y de la historia mínima, y que la semana en curso no entra en la cifra.
 */
import { describe, expect, it } from 'vitest'
import type { FallaRepetidaSemana } from '@/services/shoplogix/publicShiftMonitor.service'
import fixture from './fixtures/fallas_mantencion_semanas_2026-11-02.json'
import { resumenFallasRepetidas, type ResumenFallasRepetidas } from '../fallasRepetidasKpi'

const HOY = '2026-11-02'
const chonchi: FallaRepetidaSemana[] = fixture.chonchi
const yal: FallaRepetidaSemana[] = fixture.yal

/** El resumen, o un error si no lo hay (las pruebas que lo esperan no deben pasar con null). */
const resumen = (semanas: readonly FallaRepetidaSemana[] | null | undefined, hoy: string | null | undefined = HOY): ResumenFallasRepetidas => {
  const r = resumenFallasRepetidas(semanas, hoy)
  if (!r) throw new Error('se esperaba un resumen y salió null')
  return r
}

/** Dos semanas de 100 fallas cada una: una en la ventana «anteriores» (2026-09-07) y otra en «últimas» (2026-10-05). */
const par = (repUltimas: number, repAnteriores: number): FallaRepetidaSemana[] => [
  { semana: '2026-09-07', turnos: 12, fallas: 100, repetidas: repAnteriores },
  { semana: '2026-10-05', turnos: 12, fallas: 100, repetidas: repUltimas },
]

describe('resumenFallasRepetidas · golden con el fixture real', () => {
  it('Chonchi: 4 de 44 (9 %) contra 13 de 35 (37 %): −28 pts, mejor', () => {
    const r = resumen(chonchi)
    expect(r.ultimas).toMatchObject({ desde: '2026-10-05', hasta: '2026-11-01', fallas: 44, repetidas: 4 })
    expect(r.ultimas.pct).toBeCloseTo(100 * 4 / 44, 6)
    expect(r.anteriores).toMatchObject({ desde: '2026-09-07', hasta: '2026-10-04', fallas: 35, repetidas: 13 })
    expect(r.anteriores.pct).toBeCloseTo(100 * 13 / 35, 6)
    expect(r.deltaPts).toBe(-28)
    expect(r.estado).toBe('mejor')
  })

  it('Chonchi: promedio de 52 de 200 (26 %) en 31 semanas cerradas desde el 02-02, 9 meses', () => {
    const r = resumen(chonchi)
    expect(r.promedio).toMatchObject({ desde: '2026-02-02', hasta: '2026-11-01', fallas: 200, repetidas: 52, semanas: 31, meses: 9 })
    expect(r.promedio.pct).toBe(26)
  })

  it('Chonchi: la semana en curso (2026-11-02, 3 fallas, 0 repetidas) no entra en ninguna cifra y va primera en filas como «curso»', () => {
    const r = resumen(chonchi)
    expect(r.ultimas.fallas).toBe(44)
    expect(r.promedio.fallas).toBe(200)
    expect(r.filas[0]).toMatchObject({ semana: '2026-11-02', tramo: 'curso', turnos: 3, fallas: 3, repetidas: 0 })
  })

  it('Chonchi: filas = curso + 4 últimas + 4 anteriores, de la más nueva a la más vieja', () => {
    const r = resumen(chonchi)
    expect(r.filas.map((f) => f.semana)).toEqual([
      '2026-11-02', '2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07',
    ])
    expect(r.filas.map((f) => f.tramo)).toEqual(['curso', 'ultimas', 'ultimas', 'ultimas', 'ultimas', 'anteriores', 'anteriores', 'anteriores', 'anteriores'])
  })

  it('Yal: 11 de 46 (24 %) contra 2 de 30 (7 %): +17 pts, peor; promedio 35 de 216 (16 %) en 33 semanas', () => {
    const r = resumen(yal)
    expect(r.ultimas).toMatchObject({ fallas: 46, repetidas: 11 })
    expect(r.ultimas.pct).toBeCloseTo(100 * 11 / 46, 6)
    expect(r.anteriores).toMatchObject({ fallas: 30, repetidas: 2 })
    expect(r.anteriores.pct).toBeCloseTo(100 * 2 / 30, 6)
    expect(r.deltaPts).toBe(17)
    expect(r.estado).toBe('peor')
    expect(r.promedio).toMatchObject({ fallas: 216, repetidas: 35, semanas: 33, meses: 9 })
    expect(r.promedio.pct).toBeCloseTo(100 * 35 / 216, 6)
  })
})

describe('resumenFallasRepetidas · umbral de «igual» (5 puntos)', () => {
  it.each([
    [36, 31, 5, 'peor'],
    [35, 31, 4, 'igual'],
    [31, 35, -4, 'igual'],
    [31, 36, -5, 'mejor'],
  ])('últimas %i de 100 contra anteriores %i de 100: Δ %i → %s', (repUltimas, repAnteriores, delta, estado) => {
    const r = resumen(par(repUltimas, repAnteriores))
    expect(r.deltaPts).toBe(delta)
    expect(r.estado).toBe(estado)
  })

  it('0 repetidas con fallas: pct 0 (no null), y 0 contra 0 es «igual»', () => {
    const r = resumen(par(0, 0))
    expect(r.ultimas.pct).toBe(0)
    expect(r.estado).toBe('igual')
  })
})

describe('resumenFallasRepetidas · cuándo no hay tarjeta', () => {
  it('sin semanas, sin hoy o con hoy inválido: null', () => {
    expect(resumenFallasRepetidas([], HOY)).toBeNull()
    expect(resumenFallasRepetidas(null, HOY)).toBeNull()
    expect(resumenFallasRepetidas(undefined, HOY)).toBeNull()
    expect(resumenFallasRepetidas(chonchi, null)).toBeNull()
    expect(resumenFallasRepetidas(chonchi, undefined)).toBeNull()
    expect(resumenFallasRepetidas(chonchi, '')).toBeNull()
    expect(resumenFallasRepetidas(chonchi, '02/11/2026')).toBeNull()
  })

  it('con menos de 8 semanas de historia (la primera cerrada es posterior al lunes de las 4 anteriores): null', () => {
    const semanas: FallaRepetidaSemana[] = [
      { semana: '2026-09-14', turnos: 12, fallas: 5, repetidas: 1 },
      { semana: '2026-10-05', turnos: 12, fallas: 5, repetidas: 1 },
    ]
    expect(resumenFallasRepetidas(semanas, HOY)).toBeNull()
  })

  it('con 8 semanas de historia (la primera cerrada cae el lunes de las 4 anteriores): sí hay tarjeta', () => {
    const semanas: FallaRepetidaSemana[] = [{ semana: '2026-09-07', turnos: 12, fallas: 5, repetidas: 1 }]
    expect(resumenFallasRepetidas(semanas, HOY)).not.toBeNull()
  })

  it('con solo la semana en curso (no hay semanas cerradas): null', () => {
    expect(resumenFallasRepetidas([{ semana: '2026-11-02', turnos: 3, fallas: 3, repetidas: 0 }], HOY)).toBeNull()
  })
})

describe('resumenFallasRepetidas · sin fallas en un tramo', () => {
  it('sin fallas en las últimas 4 semanas: pct null, sin delta ni estado; una semana que no viene cuenta 0', () => {
    const r = resumen([{ semana: '2026-09-07', turnos: 12, fallas: 10, repetidas: 3 }])
    expect(r.ultimas).toMatchObject({ fallas: 0, repetidas: 0, pct: null })
    expect(r.deltaPts).toBeNull()
    expect(r.estado).toBeNull()
    expect(r.filas.find((f) => f.semana === '2026-10-05')).toMatchObject({ turnos: 0, fallas: 0, pct: null, tramo: 'ultimas' })
  })
})
