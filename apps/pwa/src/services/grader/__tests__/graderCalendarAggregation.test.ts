import { describe, it, expect } from 'vitest'
import {
  aggregateByCalendarDay,
  sortedCalendarDays,
  filterCalendarDaysInRange,
} from '../graderCalendarAggregation'
import type { GraderDailySummary, TimelineBucket } from '../types'

// ── Builders ────────────────────────────────────────────────────────────────

const mkSummary = (overrides: Partial<GraderDailySummary>): GraderDailySummary => ({
  id: '2026-04-12__Turno noche',
  dateKey: '2026-04-12',
  shiftId: 'Turno noche',
  totalPieces: 100,
  pointZeroPieces: 5,
  pointZeroPct: 5,
  durationMinutes: 60,
  totalWeightKg: 350,
  startAt: '2026-04-12T21:30:00.000Z',
  endAt: '2026-04-13T06:00:00.000Z',
  updatedBy: 'test',
  updatedAt: '2026-04-12T22:00:00.000Z',
  ...overrides,
})

const mkBucket = (
  tsMin: string,
  pieces: number,
  p0Pieces = 0,
  weightKg?: number,
): TimelineBucket => ({
  tsMin,
  pieces,
  p0Pieces,
  ...(weightKg != null ? { weightKg } : {}),
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('aggregateByCalendarDay', () => {
  it('devuelve Map vacío si no hay summaries', () => {
    const result = aggregateByCalendarDay({ summaries: [] })
    expect(result.size).toBe(0)
  })

  it('atribuye un turno día (sin cruce) al mismo dateKey vía timeline', () => {
    const summary = mkSummary({
      id: '2026-04-12__Turno día',
      dateKey: '2026-04-12',
      shiftId: 'Turno día',
      totalPieces: 1000,
      pointZeroPieces: 30,
      totalWeightKg: 3500,
      durationMinutes: 480,
      startAt: '2026-04-12T08:00:00.000Z',
      endAt: '2026-04-12T16:00:00.000Z',
    })
    const buckets: TimelineBucket[] = [
      mkBucket('2026-04-12T08:00:00.000Z', 500, 15, 1750),
      mkBucket('2026-04-12T12:00:00.000Z', 500, 15, 1750),
    ]
    const timelinesBySummaryId = new Map([[summary.id, buckets]])

    const result = aggregateByCalendarDay({ summaries: [summary], timelinesBySummaryId })

    expect(result.size).toBe(1)
    const day = result.get('2026-04-12')!
    expect(day.totalPieces).toBe(1000)
    expect(day.pointZeroPieces).toBe(30)
    expect(day.pointZeroPct).toBe(3)
    expect(day.totalWeightKg).toBe(3500)
    expect(day.activeMinutes).toBe(2)
    expect(day.contributingShifts).toHaveLength(1)
    expect(day.contributingShifts[0]!.source).toBe('timeline')
    expect(day.contributingShifts[0]!.shiftDateKey).toBe('2026-04-12')
  })

  it('split de turno noche que cruza medianoche entre dom y lun', () => {
    // Dom 12 abr 21:30 → Lun 13 abr 06:00
    // 3 buckets pre-medianoche (dom) + 5 buckets post-medianoche (lun)
    const summary = mkSummary({
      id: '2026-04-12__Turno noche',
      dateKey: '2026-04-12',
      shiftId: 'Turno noche',
      totalPieces: 800,
      pointZeroPieces: 24,
      totalWeightKg: 2800,
      durationMinutes: 480,
      startAt: '2026-04-12T21:30:00.000Z',
      endAt: '2026-04-13T06:00:00.000Z',
    })
    const buckets: TimelineBucket[] = [
      // Dom (3 minutos, 300 piezas, 12 P0)
      mkBucket('2026-04-12T21:30:00.000Z', 100, 4, 350),
      mkBucket('2026-04-12T22:00:00.000Z', 100, 4, 350),
      mkBucket('2026-04-12T23:30:00.000Z', 100, 4, 350),
      // Lun (5 minutos, 500 piezas, 12 P0)
      mkBucket('2026-04-13T00:30:00.000Z', 100, 3, 350),
      mkBucket('2026-04-13T01:00:00.000Z', 100, 3, 350),
      mkBucket('2026-04-13T02:00:00.000Z', 100, 2, 350),
      mkBucket('2026-04-13T04:00:00.000Z', 100, 2, 350),
      mkBucket('2026-04-13T05:00:00.000Z', 100, 2, 350),
    ]
    const timelinesBySummaryId = new Map([[summary.id, buckets]])

    const result = aggregateByCalendarDay({ summaries: [summary], timelinesBySummaryId })

    expect(result.size).toBe(2)

    const dom = result.get('2026-04-12')!
    expect(dom.totalPieces).toBe(300)
    expect(dom.pointZeroPieces).toBe(12)
    expect(dom.pointZeroPct).toBe(4)
    expect(dom.totalWeightKg).toBe(1050)
    expect(dom.activeMinutes).toBe(3)
    expect(dom.contributingShifts).toHaveLength(1)
    expect(dom.contributingShifts[0]!.source).toBe('timeline')
    expect(dom.contributingShifts[0]!.shiftDateKey).toBe('2026-04-12')
    expect(dom.contributingShifts[0]!.pieces).toBe(300)

    const lun = result.get('2026-04-13')!
    expect(lun.totalPieces).toBe(500)
    expect(lun.pointZeroPieces).toBe(12)
    expect(lun.pointZeroPct).toBe(2.4)
    expect(lun.totalWeightKg).toBe(1750)
    expect(lun.activeMinutes).toBe(5)
    expect(lun.contributingShifts).toHaveLength(1)
    // El mismo summary aparece en lun, pero su shiftDateKey sigue siendo dom
    expect(lun.contributingShifts[0]!.shiftDateKey).toBe('2026-04-12')
    expect(lun.contributingShifts[0]!.shiftId).toBe('Turno noche')
    expect(lun.contributingShifts[0]!.pieces).toBe(500)
  })

  it('conserva totales: suma de aportes por día = totales del summary original', () => {
    const summary = mkSummary({
      totalPieces: 800,
      pointZeroPieces: 24,
      totalWeightKg: 2800,
    })
    const buckets: TimelineBucket[] = [
      mkBucket('2026-04-12T22:00:00.000Z', 300, 12, 1050),
      mkBucket('2026-04-13T03:00:00.000Z', 500, 12, 1750),
    ]
    const result = aggregateByCalendarDay({
      summaries: [summary],
      timelinesBySummaryId: new Map([[summary.id, buckets]]),
    })

    const totalPieces = Array.from(result.values()).reduce((s, d) => s + d.totalPieces, 0)
    const totalP0 = Array.from(result.values()).reduce((s, d) => s + d.pointZeroPieces, 0)
    const totalWeight = Array.from(result.values()).reduce(
      (s, d) => s + (d.totalWeightKg ?? 0),
      0,
    )
    expect(totalPieces).toBe(800)
    expect(totalP0).toBe(24)
    expect(totalWeight).toBe(2800)
  })

  it('fallback legacy cuando no hay timelineBuckets: todo al dateKey de inicio', () => {
    const summary = mkSummary({
      id: '2026-04-12__Turno noche',
      dateKey: '2026-04-12',
      totalPieces: 800,
      pointZeroPieces: 24,
      totalWeightKg: 2800,
      durationMinutes: 480,
    })
    // Sin timelinesBySummaryId → path B
    const result = aggregateByCalendarDay({ summaries: [summary] })

    expect(result.size).toBe(1)
    const dom = result.get('2026-04-12')!
    expect(dom.totalPieces).toBe(800)
    expect(dom.pointZeroPieces).toBe(24)
    expect(dom.pointZeroPct).toBe(3)
    expect(dom.totalWeightKg).toBe(2800)
    expect(dom.activeMinutes).toBe(480)
    expect(dom.contributingShifts).toHaveLength(1)
    expect(dom.contributingShifts[0]!.source).toBe('legacy')
  })

  it('fallback legacy cuando timelinesBySummaryId no contiene el summary', () => {
    const summary = mkSummary({ totalPieces: 800, pointZeroPieces: 24 })
    const result = aggregateByCalendarDay({
      summaries: [summary],
      timelinesBySummaryId: new Map(), // map vacío
    })
    expect(result.get('2026-04-12')!.contributingShifts[0]!.source).toBe('legacy')
  })

  it('fallback legacy cuando array de buckets es vacío', () => {
    const summary = mkSummary({ totalPieces: 800, pointZeroPieces: 24 })
    const result = aggregateByCalendarDay({
      summaries: [summary],
      timelinesBySummaryId: new Map([[summary.id, []]]),
    })
    expect(result.get('2026-04-12')!.contributingShifts[0]!.source).toBe('legacy')
  })

  it('múltiples summaries del mismo dateKey suman aportes en contributingShifts', () => {
    const dia = mkSummary({
      id: '2026-04-12__Turno día',
      dateKey: '2026-04-12',
      shiftId: 'Turno día',
      totalPieces: 1000,
      pointZeroPieces: 30,
      totalWeightKg: 3500,
      durationMinutes: 480,
      startAt: '2026-04-12T08:00:00.000Z',
      endAt: '2026-04-12T16:00:00.000Z',
    })
    const noche = mkSummary({
      id: '2026-04-12__Turno noche',
      dateKey: '2026-04-12',
      shiftId: 'Turno noche',
      totalPieces: 800,
      pointZeroPieces: 24,
      totalWeightKg: 2800,
      durationMinutes: 480,
      startAt: '2026-04-12T21:30:00.000Z',
      endAt: '2026-04-13T06:00:00.000Z',
    })
    const buckets: TimelineBucket[] = [
      mkBucket('2026-04-12T22:00:00.000Z', 300, 12, 1050),
      mkBucket('2026-04-13T03:00:00.000Z', 500, 12, 1750),
    ]
    const result = aggregateByCalendarDay({
      summaries: [dia, noche],
      timelinesBySummaryId: new Map([[noche.id, buckets]]),
    })

    expect(result.size).toBe(2)
    const dom = result.get('2026-04-12')!
    expect(dom.totalPieces).toBe(1000 + 300) // turno día completo + parte dom de la noche
    expect(dom.pointZeroPieces).toBe(30 + 12)
    expect(dom.contributingShifts).toHaveLength(2)
    const fromDia = dom.contributingShifts.find((c) => c.shiftId === 'Turno día')!
    const fromNoche = dom.contributingShifts.find((c) => c.shiftId === 'Turno noche')!
    expect(fromDia.source).toBe('legacy') // sin buckets para el día
    expect(fromDia.pieces).toBe(1000)
    expect(fromNoche.source).toBe('timeline')
    expect(fromNoche.pieces).toBe(300)

    const lun = result.get('2026-04-13')!
    expect(lun.totalPieces).toBe(500)
    expect(lun.contributingShifts).toHaveLength(1)
    expect(lun.contributingShifts[0]!.shiftId).toBe('Turno noche')
  })

  it('P0% por día se recalcula sobre el agregado del día (no promedio de turnos)', () => {
    // Dos summaries en el mismo dateKey con P0% muy distintos
    // P0% día = (5 + 30) / (100 + 1000) ≈ 3.18, no (5%+3%)/2 = 4%
    const a = mkSummary({
      id: '2026-04-12__Turno día',
      dateKey: '2026-04-12',
      shiftId: 'Turno día',
      totalPieces: 100,
      pointZeroPieces: 5,
      pointZeroPct: 5,
      durationMinutes: 60,
      startAt: '2026-04-12T08:00:00.000Z',
      endAt: '2026-04-12T09:00:00.000Z',
    })
    const b = mkSummary({
      id: '2026-04-12__Turno noche',
      dateKey: '2026-04-12',
      shiftId: 'Turno noche',
      totalPieces: 1000,
      pointZeroPieces: 30,
      pointZeroPct: 3,
      durationMinutes: 480,
      startAt: '2026-04-12T21:00:00.000Z',
      endAt: '2026-04-13T05:00:00.000Z',
    })
    const result = aggregateByCalendarDay({ summaries: [a, b] })
    const dom = result.get('2026-04-12')!
    expect(dom.totalPieces).toBe(1100)
    expect(dom.pointZeroPieces).toBe(35)
    expect(dom.pointZeroPct).toBeCloseTo(3.18, 1)
  })

  it('día sin actividad neta (totalPieces=0) → P0% = 0 sin division by zero', () => {
    const summary = mkSummary({
      totalPieces: 0,
      pointZeroPieces: 0,
      totalWeightKg: 0,
      durationMinutes: 0,
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })
    const day = result.get('2026-04-12')!
    expect(day.totalPieces).toBe(0)
    expect(day.pointZeroPct).toBe(0)
  })

  it('totalWeightKg queda undefined si ningún contribuyente tenía peso', () => {
    const summary = mkSummary({ totalWeightKg: undefined })
    const result = aggregateByCalendarDay({ summaries: [summary] })
    expect(result.get('2026-04-12')!.totalWeightKg).toBeUndefined()
  })

  it('weightKg de buckets sin peso no infla el total', () => {
    // Algunos buckets tienen weightKg, otros no (común cuando hay piezas P0 puras)
    const summary = mkSummary({ totalPieces: 200, pointZeroPieces: 10 })
    const buckets: TimelineBucket[] = [
      mkBucket('2026-04-12T22:00:00.000Z', 100, 5, 350),
      mkBucket('2026-04-12T22:01:00.000Z', 100, 5), // sin peso
    ]
    const result = aggregateByCalendarDay({
      summaries: [summary],
      timelinesBySummaryId: new Map([[summary.id, buckets]]),
    })
    const dom = result.get('2026-04-12')!
    expect(dom.totalPieces).toBe(200)
    expect(dom.totalWeightKg).toBe(350)
    expect(dom.activeMinutes).toBe(2)
  })

  it('activeMinutes = count de buckets únicos por día (proxy de uptime Grader)', () => {
    const summary = mkSummary({})
    const buckets: TimelineBucket[] = [
      mkBucket('2026-04-12T22:00:00.000Z', 50),
      mkBucket('2026-04-12T22:01:00.000Z', 50),
      mkBucket('2026-04-12T22:02:00.000Z', 50),
      mkBucket('2026-04-13T01:00:00.000Z', 50),
      mkBucket('2026-04-13T01:01:00.000Z', 50),
    ]
    const result = aggregateByCalendarDay({
      summaries: [summary],
      timelinesBySummaryId: new Map([[summary.id, buckets]]),
    })
    expect(result.get('2026-04-12')!.activeMinutes).toBe(3)
    expect(result.get('2026-04-13')!.activeMinutes).toBe(2)
  })
})

describe('aggregateByCalendarDay — path hourly (sin timelineBuckets)', () => {
  it('turno noche que cruza medianoche se reparte entre día de inicio y siguiente', () => {
    // Dom 21:30 → Lun 06:00. hourlyBuckets típicos: [21,22,23,0,1,2,3,4,5]
    const summary = mkSummary({
      id: '2026-04-12__Turno noche',
      dateKey: '2026-04-12',
      shiftId: 'Turno noche',
      totalPieces: 900, // 300 dom + 600 lun
      pointZeroPieces: 27, // 9 dom + 18 lun
      totalWeightKg: 3000,
      durationMinutes: 480,
      startAt: '2026-04-12T21:30:00.000Z',
      endAt: '2026-04-13T06:00:00.000Z',
      hourlyBuckets: [
        { hour: 21, totalPieces: 100, p0Pieces: 3 },
        { hour: 22, totalPieces: 100, p0Pieces: 3 },
        { hour: 23, totalPieces: 100, p0Pieces: 3 },
        { hour: 0, totalPieces: 100, p0Pieces: 3 },
        { hour: 1, totalPieces: 100, p0Pieces: 3 },
        { hour: 2, totalPieces: 100, p0Pieces: 3 },
        { hour: 3, totalPieces: 100, p0Pieces: 3 },
        { hour: 4, totalPieces: 100, p0Pieces: 3 },
        { hour: 5, totalPieces: 100, p0Pieces: 3 },
      ],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })

    expect(result.size).toBe(2)

    const dom = result.get('2026-04-12')!
    expect(dom.totalPieces).toBe(300) // hours 21,22,23
    expect(dom.pointZeroPieces).toBe(9)
    expect(dom.totalWeightKg).toBe(1000) // 3000 × 300/900
    expect(dom.activeMinutes).toBe(160) // 480 × 300/900
    expect(dom.contributingShifts[0]!.source).toBe('hourly')

    const lun = result.get('2026-04-13')!
    expect(lun.totalPieces).toBe(600) // hours 0..5
    expect(lun.pointZeroPieces).toBe(18)
    expect(lun.totalWeightKg).toBe(2000) // 3000 × 600/900
    expect(lun.activeMinutes).toBe(320) // 480 × 600/900
    expect(lun.contributingShifts[0]!.source).toBe('hourly')
    expect(lun.contributingShifts[0]!.shiftDateKey).toBe('2026-04-12')
  })

  it('turno día (sin cruce) deja todas las horas en el mismo dateKey', () => {
    const summary = mkSummary({
      id: '2026-04-12__Turno día',
      dateKey: '2026-04-12',
      shiftId: 'Turno día',
      totalPieces: 1000,
      pointZeroPieces: 30,
      totalWeightKg: 3500,
      durationMinutes: 480,
      startAt: '2026-04-12T08:00:00.000Z',
      endAt: '2026-04-12T16:00:00.000Z',
      hourlyBuckets: [
        { hour: 8, totalPieces: 200, p0Pieces: 6 },
        { hour: 10, totalPieces: 300, p0Pieces: 9 },
        { hour: 14, totalPieces: 500, p0Pieces: 15 },
      ],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })

    expect(result.size).toBe(1)
    const dom = result.get('2026-04-12')!
    expect(dom.totalPieces).toBe(1000)
    expect(dom.pointZeroPieces).toBe(30)
    expect(dom.totalWeightKg).toBe(3500)
    expect(dom.contributingShifts[0]!.source).toBe('hourly')
  })

  it('hourly conserva totales: suma de aportes = totales originales', () => {
    const summary = mkSummary({
      totalPieces: 900,
      pointZeroPieces: 27,
      totalWeightKg: 3000,
      durationMinutes: 480,
      startAt: '2026-04-12T22:00:00.000Z',
      endAt: '2026-04-13T06:00:00.000Z',
      hourlyBuckets: [
        { hour: 22, totalPieces: 200, p0Pieces: 6 },
        { hour: 23, totalPieces: 100, p0Pieces: 3 },
        { hour: 0, totalPieces: 200, p0Pieces: 6 },
        { hour: 1, totalPieces: 200, p0Pieces: 6 },
        { hour: 2, totalPieces: 200, p0Pieces: 6 },
      ],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })

    const totalPieces = Array.from(result.values()).reduce((s, d) => s + d.totalPieces, 0)
    const totalP0 = Array.from(result.values()).reduce((s, d) => s + d.pointZeroPieces, 0)
    expect(totalPieces).toBe(900)
    expect(totalP0).toBe(27)
    // Peso puede tener pequeño error de redondeo por el ratio, pero suma cercana
    const totalWeight = Array.from(result.values()).reduce(
      (s, d) => s + (d.totalWeightKg ?? 0),
      0,
    )
    expect(totalWeight).toBeCloseTo(3000, 0)
  })

  it('hourly cae a legacy si falta startAt', () => {
    const summary = mkSummary({
      startAt: undefined,
      endAt: '2026-04-13T06:00:00.000Z',
      hourlyBuckets: [{ hour: 22, totalPieces: 100, p0Pieces: 3 }],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })
    expect(result.get('2026-04-12')!.contributingShifts[0]!.source).toBe('legacy')
  })

  it('hourly cae a legacy si falta endAt', () => {
    const summary = mkSummary({
      startAt: '2026-04-12T22:00:00.000Z',
      endAt: undefined,
      hourlyBuckets: [{ hour: 22, totalPieces: 100, p0Pieces: 3 }],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })
    expect(result.get('2026-04-12')!.contributingShifts[0]!.source).toBe('legacy')
  })

  it('timelineBuckets gana sobre hourlyBuckets (path A es preferido)', () => {
    const summary = mkSummary({
      id: '2026-04-12__Turno noche',
      dateKey: '2026-04-12',
      totalPieces: 900,
      pointZeroPieces: 27,
      hourlyBuckets: [
        { hour: 21, totalPieces: 100, p0Pieces: 3 },
        { hour: 22, totalPieces: 100, p0Pieces: 3 },
      ],
    })
    const buckets: TimelineBucket[] = [mkBucket('2026-04-12T22:00:00.000Z', 50, 1)]
    const result = aggregateByCalendarDay({
      summaries: [summary],
      timelinesBySummaryId: new Map([[summary.id, buckets]]),
    })
    // Si hubiera tomado hourly, totalPieces sería 200; con timeline es 50
    expect(result.get('2026-04-12')!.totalPieces).toBe(50)
    expect(result.get('2026-04-12')!.contributingShifts[0]!.source).toBe('timeline')
  })

  it('caso real Feb 2026: turno noche con startHour=22 y hours [22,23,0..5]', () => {
    // Reproduce el patrón típico del histórico: el lunes recibe la mayoría
    // del turno noche que arrancó el domingo
    const noche = mkSummary({
      id: '2026-02-15__Turno noche',
      dateKey: '2026-02-15',
      shiftId: 'Turno noche',
      totalPieces: 14000, // similar a los datos reales (~15k típico)
      pointZeroPieces: 420,
      totalWeightKg: 49000,
      durationMinutes: 480,
      startAt: '2026-02-15T22:00:00.000Z',
      endAt: '2026-02-16T06:00:00.000Z',
      hourlyBuckets: [
        { hour: 22, totalPieces: 1500, p0Pieces: 45 },
        { hour: 23, totalPieces: 1500, p0Pieces: 45 },
        { hour: 0, totalPieces: 2000, p0Pieces: 60 },
        { hour: 1, totalPieces: 2000, p0Pieces: 60 },
        { hour: 2, totalPieces: 2000, p0Pieces: 60 },
        { hour: 3, totalPieces: 2000, p0Pieces: 60 },
        { hour: 4, totalPieces: 2000, p0Pieces: 60 },
        { hour: 5, totalPieces: 1000, p0Pieces: 30 },
      ],
    })
    const result = aggregateByCalendarDay({ summaries: [noche] })

    const dom = result.get('2026-02-15')!
    const lun = result.get('2026-02-16')!
    expect(dom.totalPieces).toBe(3000) // 1500+1500
    expect(lun.totalPieces).toBe(11000) // 2000×5 + 1000
    // El lunes recibe la mayoría del peso, no el domingo
    expect(lun.totalWeightKg).toBeGreaterThan(dom.totalWeightKg!)
  })
})

describe('aggregateByCalendarDay — isPrimary y pctOfShift', () => {
  it('summary que solo aparece en 1 día → contribución única isPrimary=true, pctOfShift=100', () => {
    const summary = mkSummary({
      id: '2026-04-12__Turno día',
      dateKey: '2026-04-12',
      shiftId: 'Turno día',
      totalPieces: 1000,
      pointZeroPieces: 30,
      startAt: '2026-04-12T08:00:00.000Z',
      endAt: '2026-04-12T16:00:00.000Z',
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })
    const c = result.get('2026-04-12')!.contributingShifts[0]!
    expect(c.isPrimary).toBe(true)
    expect(c.pctOfShift).toBe(100)
    expect(c.dateKey).toBe('2026-04-12')
  })

  it('cruce 75/25: la madrugada (más carga) gana isPrimary, vespertina queda secundaria', () => {
    const summary = mkSummary({
      id: '2026-04-12__Turno noche',
      dateKey: '2026-04-12',
      shiftId: 'Turno noche',
      totalPieces: 800,
      pointZeroPieces: 24,
      durationMinutes: 480,
      startAt: '2026-04-12T22:00:00.000Z',
      endAt: '2026-04-13T06:00:00.000Z',
      hourlyBuckets: [
        // dom: 200 piezas (25%)
        { hour: 22, totalPieces: 100, p0Pieces: 3 },
        { hour: 23, totalPieces: 100, p0Pieces: 3 },
        // lun: 600 piezas (75%) — más carga, primary
        { hour: 0, totalPieces: 200, p0Pieces: 6 },
        { hour: 1, totalPieces: 200, p0Pieces: 6 },
        { hour: 2, totalPieces: 200, p0Pieces: 6 },
      ],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })

    const dom = result.get('2026-04-12')!.contributingShifts[0]!
    const lun = result.get('2026-04-13')!.contributingShifts[0]!

    expect(dom.pieces).toBe(200)
    expect(dom.pctOfShift).toBe(25)
    expect(dom.isPrimary).toBe(false)

    expect(lun.pieces).toBe(600)
    expect(lun.pctOfShift).toBe(75)
    expect(lun.isPrimary).toBe(true)
  })

  it('turno huérfano (100% en día siguiente) → la única contribución es primary', () => {
    // Caso real Feb 2026: turno noche del dom 1 con primera pieza lun 2 00:31
    const summary = mkSummary({
      id: '2026-02-01__Turno noche',
      dateKey: '2026-02-01',
      shiftId: 'Turno noche',
      totalPieces: 13534,
      pointZeroPieces: 410,
      durationMinutes: 324,
      startAt: '2026-02-02T00:31:06.000Z',
      endAt: '2026-02-02T06:59:59.000Z',
      hourlyBuckets: [
        { hour: 0, totalPieces: 1500, p0Pieces: 50 },
        { hour: 1, totalPieces: 2000, p0Pieces: 60 },
        { hour: 2, totalPieces: 2500, p0Pieces: 75 },
        { hour: 3, totalPieces: 2500, p0Pieces: 75 },
        { hour: 4, totalPieces: 2500, p0Pieces: 75 },
        { hour: 5, totalPieces: 2000, p0Pieces: 50 },
        { hour: 6, totalPieces: 534, p0Pieces: 25 },
      ],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })

    expect(result.size).toBe(1) // solo lun 2
    expect(result.has('2026-02-01')).toBe(false)

    const lun = result.get('2026-02-02')!.contributingShifts[0]!
    expect(lun.shiftDateKey).toBe('2026-02-01') // mantiene el legacy del summary
    expect(lun.dateKey).toBe('2026-02-02') // pero el calendar dateKey es lun
    expect(lun.isPrimary).toBe(true)
    expect(lun.pctOfShift).toBe(100)
  })

  it('empate 50/50: la contribución con dateKey menor (día anterior) gana primary', () => {
    const summary = mkSummary({
      id: '2026-04-12__Turno noche',
      dateKey: '2026-04-12',
      shiftId: 'Turno noche',
      totalPieces: 200,
      pointZeroPieces: 6,
      startAt: '2026-04-12T22:00:00.000Z',
      endAt: '2026-04-13T02:00:00.000Z',
      hourlyBuckets: [
        { hour: 22, totalPieces: 100, p0Pieces: 3 },
        { hour: 1, totalPieces: 100, p0Pieces: 3 },
      ],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })

    const dom = result.get('2026-04-12')!.contributingShifts[0]!
    const lun = result.get('2026-04-13')!.contributingShifts[0]!
    expect(dom.pieces).toBe(100)
    expect(lun.pieces).toBe(100)
    expect(dom.isPrimary).toBe(true) // empate → menor dateKey gana
    expect(lun.isPrimary).toBe(false)
  })

  it('pctOfShift suma a 100% por summary (con redondeo)', () => {
    const summary = mkSummary({
      totalPieces: 700,
      pointZeroPieces: 21,
      startAt: '2026-04-12T22:00:00.000Z',
      endAt: '2026-04-13T05:00:00.000Z',
      hourlyBuckets: [
        { hour: 22, totalPieces: 100, p0Pieces: 3 },
        { hour: 23, totalPieces: 100, p0Pieces: 3 },
        { hour: 0, totalPieces: 100, p0Pieces: 3 },
        { hour: 1, totalPieces: 100, p0Pieces: 3 },
        { hour: 2, totalPieces: 100, p0Pieces: 3 },
        { hour: 3, totalPieces: 100, p0Pieces: 3 },
        { hour: 4, totalPieces: 100, p0Pieces: 3 },
      ],
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })

    const all = Array.from(result.values()).flatMap((d) => d.contributingShifts)
    const totalPct = all.reduce((s, c) => s + c.pctOfShift, 0)
    expect(totalPct).toBeCloseTo(100, 0)
  })

  it('cada summary tiene exactamente 1 contribución isPrimary=true', () => {
    const summaries = [
      mkSummary({
        id: '2026-04-12__Turno día',
        dateKey: '2026-04-12',
        shiftId: 'Turno día',
        startAt: '2026-04-12T08:00:00.000Z',
        endAt: '2026-04-12T16:00:00.000Z',
      }),
      mkSummary({
        id: '2026-04-12__Turno noche',
        dateKey: '2026-04-12',
        shiftId: 'Turno noche',
        startAt: '2026-04-12T22:00:00.000Z',
        endAt: '2026-04-13T06:00:00.000Z',
        hourlyBuckets: [
          { hour: 22, totalPieces: 50, p0Pieces: 2 },
          { hour: 0, totalPieces: 50, p0Pieces: 1 },
        ],
      }),
    ]
    const result = aggregateByCalendarDay({ summaries })
    const bySummary = new Map<string, number>()
    for (const day of result.values()) {
      for (const c of day.contributingShifts) {
        if (c.isPrimary) bySummary.set(c.summaryId, (bySummary.get(c.summaryId) ?? 0) + 1)
      }
    }
    expect(bySummary.get('2026-04-12__Turno día')).toBe(1)
    expect(bySummary.get('2026-04-12__Turno noche')).toBe(1)
  })

  it('contribución legacy (sin granularidad) → isPrimary=true, pctOfShift=100', () => {
    const summary = mkSummary({
      totalPieces: 800,
      pointZeroPieces: 24,
      startAt: undefined,
      endAt: undefined,
    })
    const result = aggregateByCalendarDay({ summaries: [summary] })
    const c = result.get('2026-04-12')!.contributingShifts[0]!
    expect(c.source).toBe('legacy')
    expect(c.isPrimary).toBe(true)
    expect(c.pctOfShift).toBe(100)
  })
})

describe('sortedCalendarDays', () => {
  it('ordena los días ascendente por dateKey', () => {
    const map = aggregateByCalendarDay({
      summaries: [
        mkSummary({ id: '2026-04-15__Turno día', dateKey: '2026-04-15' }),
        mkSummary({ id: '2026-04-10__Turno día', dateKey: '2026-04-10' }),
        mkSummary({ id: '2026-04-12__Turno día', dateKey: '2026-04-12' }),
      ],
    })
    const sorted = sortedCalendarDays(map)
    expect(sorted.map((d) => d.dateKey)).toEqual(['2026-04-10', '2026-04-12', '2026-04-15'])
  })
})

describe('filterCalendarDaysInRange', () => {
  it('devuelve solo los días dentro del rango (inclusive)', () => {
    const map = aggregateByCalendarDay({
      summaries: [
        mkSummary({ id: '2026-04-01__Turno día', dateKey: '2026-04-01' }),
        mkSummary({ id: '2026-04-15__Turno día', dateKey: '2026-04-15' }),
        mkSummary({ id: '2026-04-30__Turno día', dateKey: '2026-04-30' }),
        mkSummary({ id: '2026-05-05__Turno día', dateKey: '2026-05-05' }),
      ],
    })
    const filtered = filterCalendarDaysInRange(map, '2026-04-10', '2026-04-30')
    expect(filtered.map((d) => d.dateKey)).toEqual(['2026-04-15', '2026-04-30'])
  })
})
