/**
 * graderMidShiftCheck — el corte de control a mitad de turno.
 *
 * Los casos usan el reparto REAL de un turno de Chonchi (2026-08-11 Turno 2,
 * 13.366 piezas) y la plantilla de gates vigente: el 8-10 lb se lleva el 59% con
 * 3 de 12 gates. Si la tarjeta no acusa ESE caso, no sirve.
 */
import { describe, it, expect } from 'vitest'
import { distributionFromShift, buildMidShiftCheck, excelGapMinutes } from '../graderMidShiftCheck'
import type { GateAssignment, GraderDailySummary } from '../types'

const TURNO_REAL = {
  id: '2026-08-11__Turno 2',
  dateKey: '2026-08-11',
  shiftId: 'Turno 2',
  endAt: '2026-08-11T11:00:00',
  productionRatePerHour: 2000,
  calibreDistribution: [
    { calibre: '8-10 lb', pieces: 7703, pct: 59 },
    { calibre: '6-8 lb', pieces: 3028, pct: 23.2 },
    { calibre: '10-12 lb', pieces: 1791, pct: 13.7 },
    { calibre: '4-6 lb', pieces: 454, pct: 3.5 },
    { calibre: '2-4 lb', pieces: 86, pct: 0.7 },
  ],
} as unknown as GraderDailySummary

const GATES: GateAssignment[] = [
  { gateNumber: 1, assignedCalibre: '2-4 lb', assignedQuality: 'Industrial', active: true },
  { gateNumber: 2, assignedCalibre: '4-6 lb', assignedQuality: 'Industrial', active: true },
  { gateNumber: 3, assignedCalibre: '6-8 lb', assignedQuality: 'Industrial', active: true },
  { gateNumber: 4, assignedCalibre: '2-4 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 5, assignedCalibre: '4-6 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 6, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 7, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 8, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 9, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 10, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 11, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 12, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
] as unknown as GateAssignment[]

describe('distributionFromShift', () => {
  it('convierte el turno en curso a la forma del histórico, sin exigir mínimo de turnos', () => {
    const d = distributionFromShift(TURNO_REAL)!
    expect(d.shiftIds).toEqual(['2026-08-11__Turno 2'])
    expect(d.totalPieces).toBe(7703 + 3028 + 1791 + 454 + 86)
    expect(d.rows[0]!.key).toBe('8-10lb')
    expect(d.rows[0]!.pct).toBeCloseTo(59, 0)
  })

  it('normaliza la escritura del calibre igual que el histórico', () => {
    const mezclado = {
      ...TURNO_REAL,
      calibreDistribution: [
        { calibre: '8-10 lb', pieces: 100, pct: 50 },
        { calibre: '8 - 10 LB', pieces: 100, pct: 50 },
      ],
    } as unknown as GraderDailySummary
    const d = distributionFromShift(mezclado)!
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0]!.pieces).toBe(200)
  })

  it('devuelve null sin calibres (Yal llega con el array vacío)', () => {
    expect(distributionFromShift({ ...TURNO_REAL, calibreDistribution: [] } as unknown as GraderDailySummary)).toBeNull()
  })
})

describe('buildMidShiftCheck', () => {
  it('acusa el 8-10 lb apretado con lo que va del turno', () => {
    const c = buildMidShiftCheck({ summary: TURNO_REAL, gates: GATES, remainingMin: 180 })!
    expect(c.saturated.map((f) => f.key)).toContain('8-10lb')
    expect(c.fits.find((f) => f.key === '8-10lb')!.ratio).toBeCloseTo(2.36, 1)
  })

  it('proyecta las piezas que faltan al ritmo medido', () => {
    const c = buildMidShiftCheck({ summary: TURNO_REAL, gates: GATES, remainingMin: 180 })!
    expect(c.estRemainingPieces).toBe(6000) // 2.000 pz/h × 3 h
    /*
     * La parte del calibre apretado se recalcula desde las PIEZAS
     * (7.703 / 13.062 = 58,97%), no desde el `pct: 59` que trae Matrix ya
     * redondeado. Por eso el esperado sale de la misma división y no de "0,59":
     * fijar el número redondo escondería que la fuente es distinta.
     */
    const share = 7703 / (7703 + 3028 + 1791 + 454 + 86)
    expect(c.estPiecesOnSaturated).toBe(Math.round(6000 * share))
    expect(c.estPiecesOnSaturated).toBe(3538)
  })

  it('propone mover una gate del calibre que sobra al apretado', () => {
    const c = buildMidShiftCheck({ summary: TURNO_REAL, gates: GATES, remainingMin: 180 })!
    expect(c.moves[0]!.toKey).toBe('8-10lb')
    expect(c.moves[0]!.fromKey).toBe('2-4lb')
  })

  it('NO proyecta si no hay ritmo — mejor sin número que con uno inventado', () => {
    const sinRitmo = { ...TURNO_REAL, productionRatePerHour: 0 } as unknown as GraderDailySummary
    const c = buildMidShiftCheck({ summary: sinRitmo, gates: GATES, remainingMin: 180 })!
    expect(c.estRemainingPieces).toBeNull()
    expect(c.estPiecesOnSaturated).toBeNull()
    // pero el diagnóstico de saturación sigue siendo válido
    expect(c.saturated.length).toBeGreaterThan(0)
  })

  it('no dice nada con el turno ya cerrado — ahí manda el análisis post-turno', () => {
    expect(buildMidShiftCheck({ summary: TURNO_REAL, gates: GATES, remainingMin: null })).toBeNull()
    expect(buildMidShiftCheck({ summary: TURNO_REAL, gates: GATES, remainingMin: 0 })).toBeNull()
  })

  it('no dice nada sin Excel ni sin gates activas', () => {
    expect(buildMidShiftCheck({ summary: null, gates: GATES, remainingMin: 180 })).toBeNull()
    const apagadas = GATES.map((g) => ({ ...g, active: false }))
    expect(buildMidShiftCheck({ summary: TURNO_REAL, gates: apagadas, remainingMin: 180 })).toBeNull()
  })

  it('sin nada apretado no proyecta piezas en riesgo', () => {
    // Ojo: TODOS los calibres con producción necesitan gate, incluso el 2-4 lb
    // con 0,7%. Dejarlo afuera no es "equilibrado", es 86 piezas sin salida.
    // 6 / 2 / 2 / 1 / 1: el reparto mínimo que deja a los cinco calibres bajo
    // 1,5×. Con 1 sola gate el 10-12 lb (13,7%) ya sale saturado — el mínimo no
    // es "una gate por calibre", es una por cada 8,3% de producción.
    const parejas: GateAssignment[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ gateNumber: i + 1, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true })),
      { gateNumber: 7, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
      { gateNumber: 8, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
      { gateNumber: 9, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
      { gateNumber: 10, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
      { gateNumber: 11, assignedCalibre: '4-6 lb', assignedQuality: 'Industrial', active: true },
      { gateNumber: 12, assignedCalibre: '2-4 lb', assignedQuality: 'Industrial', active: true },
    ] as unknown as GateAssignment[]
    const c = buildMidShiftCheck({ summary: TURNO_REAL, gates: parejas, remainingMin: 180 })!
    expect(c.saturated).toEqual([])
    expect(c.estPiecesOnSaturated).toBeNull()
    expect(c.moves).toEqual([])
  })

  it('un calibre con producción y SIN gate se acusa aunque sea el 0,7%', () => {
    // Sin gate esas piezas caen al rechazo: es el peor caso, no un detalle.
    const sinDosCuatro = GATES.filter((g) => g.assignedCalibre !== '2-4 lb')
    const c = buildMidShiftCheck({ summary: TURNO_REAL, gates: sinDosCuatro, remainingMin: 180 })!
    const f = c.saturated.find((x) => x.key === '2-4lb')!
    expect(f.gates).toEqual([])
    expect(f.ratio).toBe(Infinity)
  })

  it('el ritmo explícito le gana al del resumen', () => {
    const c = buildMidShiftCheck({ summary: TURNO_REAL, gates: GATES, remainingMin: 60, ratePerHour: 500 })!
    expect(c.estRemainingPieces).toBe(500)
  })
})

describe('excelGapMinutes', () => {
  it('mide el hueco entre la última pieza del Excel y el ahora de planta', () => {
    expect(excelGapMinutes(TURNO_REAL, new Date('2026-08-11T14:00:00'))).toBe(180)
  })

  it('un Excel más nuevo que el reloj no da negativo', () => {
    expect(excelGapMinutes(TURNO_REAL, new Date('2026-08-11T10:00:00'))).toBe(0)
  })

  it('sin endAt no inventa un hueco', () => {
    expect(excelGapMinutes({ ...TURNO_REAL, endAt: undefined } as unknown as GraderDailySummary, new Date())).toBeNull()
    expect(excelGapMinutes(null, new Date())).toBeNull()
  })
})
