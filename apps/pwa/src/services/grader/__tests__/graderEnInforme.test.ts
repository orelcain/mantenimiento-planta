import { describe, expect, it } from 'vitest'
import { estadoBloqueGrader, intensidadP0, p0PorHora, purezaCompuertas } from '../graderEnInforme'
import type { GateMix } from '../graderGateMix'

const ms = (iso: string) => Date.parse(iso)

describe('estadoBloqueGrader', () => {
  it('línea sin grader → no-aplica, aunque haya resumen', () => {
    expect(estadoBloqueGrader({ tieneGrader: false, summary: { totalPieces: 10 }, enCurso: false })).toBe('no-aplica')
  })
  it('con piezas → con', () => {
    expect(estadoBloqueGrader({ tieneGrader: true, summary: { totalPieces: 36120 }, enCurso: false })).toBe('con')
  })
  it('resumen con 0 piezas (solo P0 o vacío) cuenta como sin datos', () => {
    expect(estadoBloqueGrader({ tieneGrader: true, summary: { totalPieces: 0 }, enCurso: false })).toBe('sin')
  })
  it('sin resumen: en curso o cerrado', () => {
    expect(estadoBloqueGrader({ tieneGrader: true, summary: null, enCurso: true })).toBe('en-curso')
    expect(estadoBloqueGrader({ tieneGrader: true, summary: undefined, enCurso: false })).toBe('sin')
  })
})

describe('p0PorHora', () => {
  it('alinea a las horas del turno y deja null donde el grader no tiene piezas', () => {
    const c = p0PorHora(
      [{ hour: 7, totalPieces: 1000, p0Pieces: 29 }, { hour: 9, totalPieces: 400, p0Pieces: 24 }],
      ms('2026-11-14T07:15:00Z'), ms('2026-11-14T10:00:00Z'),
    )
    expect(c.map((x) => x.hora)).toEqual(['07', '08', '09'])
    expect(c.map((x) => x.pct)).toEqual([2.9, null, 6])
    expect(c[1]!.piezas).toBe(0)
  })
  it('turno noche que cruza medianoche', () => {
    const c = p0PorHora(
      [{ hour: 23, totalPieces: 100, p0Pieces: 5 }, { hour: 0, totalPieces: 200, p0Pieces: 2 }],
      ms('2026-11-14T22:00:00Z'), ms('2026-11-15T01:30:00Z'),
    )
    expect(c.map((x) => x.hora)).toEqual(['22', '23', '00', '01'])
    expect(c.map((x) => x.pct)).toEqual([null, 5, 1, null])
  })
  it('sin hourlyBuckets: todas las horas en null, no revienta', () => {
    const c = p0PorHora(undefined, ms('2026-11-14T07:00:00Z'), ms('2026-11-14T09:00:00Z'))
    expect(c).toHaveLength(2)
    expect(c.every((x) => x.pct === null)).toBe(true)
  })
  it('ventana inválida → vacío', () => {
    expect(p0PorHora([], NaN, 5)).toEqual([])
    expect(p0PorHora([], 10, 5)).toEqual([])
  })
})

describe('purezaCompuertas', () => {
  const mix = (pur: Array<number | null>): GateMix => ({
    bucketsFrom: '2026-11-14T07:00:00.000Z', bucketMinutes: 30, bucketCount: 1,
    gates: pur.map((p, i) => ({ gate: i + 1, pieces: 10, matchPieces: 0, purityPct: p, byCalibre: {}, byQuality: {}, purityByBucket: [] })),
  })
  it('cuenta las ≥ 95 % sobre las asignadas', () => {
    expect(purezaCompuertas(mix([99, 95, 94.9, 80, null]))).toEqual({ ok: 2, asignadas: 4 })
  })
  it('sin gateMix o sin asignadas → null', () => {
    expect(purezaCompuertas(undefined)).toBeNull()
    expect(purezaCompuertas(mix([null, null]))).toBeNull()
  })
})

describe('intensidadP0', () => {
  it('escala 12–60 y 0 sin dato', () => {
    expect(intensidadP0(null, 5)).toBe(0)
    expect(intensidadP0(5, 5)).toBe(60)
    expect(intensidadP0(0, 5)).toBe(12)
    expect(intensidadP0(3, 0)).toBe(0)
  })
})
