/**
 * Tests para computeSegmentVerdicts — Fase C del módulo Grader.
 *
 * Cubre: filtrado synthetic, cálculo de P0% antes/después, umbrales
 * improved/worsened/neutral/insufficient-data, ventanas multi-snapshot,
 * cálculo de afterMinutes y boundeo de beforeBuckets por snapshot previo.
 */

import { describe, it, expect } from 'vitest'
import { computeSegmentVerdicts } from '../graderP0Segmentation'
import type { GateConfigSnapshot } from '../graderConfigSnapshot.service'
import type { TimelineBucket } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSnap(overrides: Partial<GateConfigSnapshot> & Pick<GateConfigSnapshot, 'id' | 'at'>): GateConfigSnapshot {
  return {
    shiftDocId: '2024-01-15__Turno día',
    changedBy: { uid: 'u1', name: 'Test' },
    gates: [],
    changes: [],
    synthetic: false,
    ...overrides,
  }
}

function makeBucket(tsMin: string, pieces: number, p0Pieces: number): TimelineBucket {
  return { tsMin, pieces, p0Pieces }
}

/** Genera serie de buckets por minuto a partir de tsMin base (ISO), n minutos */
function bucketSeries(
  baseIso: string,
  count: number,
  pieces: number,
  p0Pieces: number,
): TimelineBucket[] {
  const base = new Date(baseIso).getTime()
  return Array.from({ length: count }, (_, i) => {
    const ts = new Date(base + i * 60_000).toISOString()
    return makeBucket(ts, pieces, p0Pieces)
  })
}

// ── Casos base ─────────────────────────────────────────────────────────────

describe('computeSegmentVerdicts — entradas vacías', () => {
  it('devuelve Map vacío cuando no hay snapshots', () => {
    const result = computeSegmentVerdicts([], [])
    expect(result.size).toBe(0)
  })

  it('devuelve Map vacío cuando no hay buckets', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const result = computeSegmentVerdicts([snap], [])
    // afterPieces=0 → insufficient-data
    expect(result.get('s1')?.status).toBe('insufficient-data')
  })
})

// ── Filtrado synthetic ──────────────────────────────────────────────────────

describe('computeSegmentVerdicts — synthetic se ignora', () => {
  it('no genera entry para un snapshot synthetic', () => {
    const snap = makeSnap({ id: 'synth1', at: '2024-01-15T08:00:00.000Z', synthetic: true })
    const buckets = bucketSeries('2024-01-15T08:00:00.000Z', 10, 100, 5)
    const result = computeSegmentVerdicts([snap], buckets)
    expect(result.has('synth1')).toBe(false)
    expect(result.size).toBe(0)
  })

  it('mezcla synthetic + manual: solo el manual aparece en result', () => {
    const synth = makeSnap({ id: 'synth1', at: '2024-01-15T07:50:00.000Z', synthetic: true })
    const manual = makeSnap({ id: 'man1', at: '2024-01-15T08:10:00.000Z' })
    const buckets = bucketSeries('2024-01-15T08:00:00.000Z', 30, 100, 3)
    const result = computeSegmentVerdicts([synth, manual], buckets)
    expect(result.has('synth1')).toBe(false)
    expect(result.has('man1')).toBe(true)
  })
})

// ── insufficient-data ───────────────────────────────────────────────────────

describe('computeSegmentVerdicts — insufficient-data', () => {
  it('status insufficient-data cuando afterPieces < 30', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    // Antes: 5 buckets × 20 piezas = 100 before; Después: solo 2 buckets × 14 = 28 piezas
    const before = bucketSeries('2024-01-15T08:00:00.000Z', 5, 20, 0)
    const after  = bucketSeries('2024-01-15T08:10:00.000Z', 2, 14, 0)
    const result = computeSegmentVerdicts([snap], [...before, ...after])
    expect(result.get('s1')?.status).toBe('insufficient-data')
    expect(result.get('s1')?.afterPieces).toBe(28)
  })

  it('status insufficient-data cuando afterPieces === 29 (límite -1)', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const before = bucketSeries('2024-01-15T08:00:00.000Z', 3, 20, 1)
    const after  = [makeBucket('2024-01-15T08:10:00.000Z', 29, 1)]
    const result = computeSegmentVerdicts([snap], [...before, ...after])
    expect(result.get('s1')?.status).toBe('insufficient-data')
  })

  it('no insuficiente cuando afterPieces === 30 (límite exacto)', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const before = bucketSeries('2024-01-15T08:00:00.000Z', 3, 20, 1)
    const after  = [makeBucket('2024-01-15T08:10:00.000Z', 30, 0)]
    const result = computeSegmentVerdicts([snap], [...before, ...after])
    // delta < 0 y afterPieces = 30 → no es insufficient
    expect(result.get('s1')?.status).not.toBe('insufficient-data')
  })
})

// ── improved / worsened / neutral ───────────────────────────────────────────

describe('computeSegmentVerdicts — veredictos de delta', () => {
  // Helper: un snapshot en T08:10, before=100p con pctBefore, after=100p con pctAfter
  function oneSnapScenario(pctBefore: number, pctAfter: number) {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const before = [makeBucket('2024-01-15T08:00:00.000Z', 100, Math.round(pctBefore))]
    const after  = [makeBucket('2024-01-15T08:10:00.000Z', 100, Math.round(pctAfter))]
    return computeSegmentVerdicts([snap], [...before, ...after]).get('s1')!
  }

  it('improved cuando delta < -0.5 pts', () => {
    // P0 antes: 5%, después: 2% → delta = -3
    const v = oneSnapScenario(5, 2)
    expect(v.status).toBe('improved')
    expect(v.delta).toBeLessThan(-0.5)
  })

  it('worsened cuando delta > +0.5 pts', () => {
    // P0 antes: 2%, después: 5% → delta = +3
    const v = oneSnapScenario(2, 5)
    expect(v.status).toBe('worsened')
    expect(v.delta).toBeGreaterThan(0.5)
  })

  it('neutral cuando |delta| <= 0.5 pts — delta positivo pequeño', () => {
    // 100 piezas: antes 10p0 (10%), después 10p0 (10%) → delta = 0
    const v = oneSnapScenario(10, 10)
    expect(v.status).toBe('neutral')
    expect(v.delta).toBe(0)
  })

  it('neutral cuando delta = -0.3 (bajo el umbral de mejora)', () => {
    // 100 piezas: antes 10 P0 (10%), después 9.7 ≈ 10 P0 (10%) — mismo conteo
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    // 200 piezas antes: 100 P0 = 50%; 200 después: 99 P0 = 49.5% → delta = -0.5 → neutral
    const before = [makeBucket('2024-01-15T08:00:00.000Z', 200, 100)]
    const after  = [makeBucket('2024-01-15T08:10:00.000Z', 200, 99)]
    const v = computeSegmentVerdicts([snap], [...before, ...after]).get('s1')!
    expect(v.delta).toBeCloseTo(-0.5, 1)
    // delta = -0.5: la condición es < -0.5 (estricto) → neutral
    expect(v.status).toBe('neutral')
  })

  it('improved cuando delta = -0.51 (cruza el umbral)', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    // 1000 piezas: antes 100 P0 = 10%; 1000 después: 94 P0 = 9.4% → delta ≈ -0.6
    const before = [makeBucket('2024-01-15T08:00:00.000Z', 1000, 100)]
    const after  = [makeBucket('2024-01-15T08:10:00.000Z', 1000, 94)]
    const v = computeSegmentVerdicts([snap], [...before, ...after]).get('s1')!
    expect(v.status).toBe('improved')
  })

  it('calcula beforePct y afterPct correctamente', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    // Antes: 200 piezas, 10 P0 → 5%
    const before = [makeBucket('2024-01-15T08:00:00.000Z', 200, 10)]
    // Después: 100 piezas, 1 P0 → 1%
    const after  = [makeBucket('2024-01-15T08:10:00.000Z', 100, 1)]
    const v = computeSegmentVerdicts([snap], [...before, ...after]).get('s1')!
    expect(v.beforePct).toBeCloseTo(5, 1)
    expect(v.afterPct).toBeCloseTo(1, 1)
    expect(v.delta).toBeCloseTo(-4, 1)
    expect(v.status).toBe('improved')
  })

  it('beforePct = 0 cuando no hay buckets antes del primer snapshot', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:00:00.000Z' })
    // Todos los buckets son DESPUÉS del snapshot
    const after = bucketSeries('2024-01-15T08:00:00.000Z', 5, 10, 1)
    const v = computeSegmentVerdicts([snap], after).get('s1')!
    expect(v.beforePct).toBe(0)
  })
})

// ── afterMinutes ────────────────────────────────────────────────────────────

describe('computeSegmentVerdicts — afterMinutes', () => {
  it('calcula minutos transcurridos desde el cambio al último bucket after', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:00:00.000Z' })
    // 47 buckets de 1 minuto → último en T08:46:00
    const after = bucketSeries('2024-01-15T08:00:00.000Z', 47, 10, 0)
    const v = computeSegmentVerdicts([snap], after).get('s1')!
    expect(v.afterMinutes).toBe(46)  // T08:46 - T08:00 = 46 min
  })

  it('afterMinutes = 0 cuando solo hay un bucket after (coincide con snap.at)', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const before = [makeBucket('2024-01-15T08:00:00.000Z', 100, 5)]
    const after  = [makeBucket('2024-01-15T08:10:00.000Z', 50, 1)]
    const v = computeSegmentVerdicts([snap], [...before, ...after]).get('s1')!
    expect(v.afterMinutes).toBe(0)
  })
})

// ── Múltiples snapshots ─────────────────────────────────────────────────────

describe('computeSegmentVerdicts — múltiples snapshots', () => {
  it('genera entry para cada snapshot manual', () => {
    const s1 = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const s2 = makeSnap({ id: 's2', at: '2024-01-15T08:30:00.000Z' })
    const buckets = bucketSeries('2024-01-15T08:00:00.000Z', 40, 100, 5)
    const result = computeSegmentVerdicts([s1, s2], buckets)
    expect(result.has('s1')).toBe(true)
    expect(result.has('s2')).toBe(true)
  })

  it('el "after" del primer snap está acotado por el inicio del segundo snap', () => {
    // s1 at T08:10, s2 at T08:20
    // after de s1 = buckets en [T08:10, T08:20)
    const s1 = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const s2 = makeSnap({ id: 's2', at: '2024-01-15T08:20:00.000Z' })
    // 10 buckets en [T08:10, T08:19]: 5 piezas c/u = 50 after para s1
    const afterS1 = bucketSeries('2024-01-15T08:10:00.000Z', 10, 5, 0)
    // 20 buckets en [T08:20, T08:39]: 3 piezas c/u = 60 after para s2
    const afterS2 = bucketSeries('2024-01-15T08:20:00.000Z', 20, 3, 0)
    // 5 buckets before s1
    const before = bucketSeries('2024-01-15T08:00:00.000Z', 10, 10, 0)
    const result = computeSegmentVerdicts([s1, s2], [...before, ...afterS1, ...afterS2])
    expect(result.get('s1')?.afterPieces).toBe(50)
    expect(result.get('s2')?.afterPieces).toBe(60)
  })

  it('el "before" del segundo snap está acotado por el inicio del primer snap (no incluye buckets previos a s1)', () => {
    // s1 at T08:10, s2 at T08:20
    // before de s2 = solo buckets en [T08:10, T08:20) — NO los de [T08:00, T08:10)
    const s1 = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const s2 = makeSnap({ id: 's2', at: '2024-01-15T08:20:00.000Z' })
    // Buckets antes de s1 (NO deben contar como "before" de s2)
    const beforeS1 = bucketSeries('2024-01-15T08:00:00.000Z', 10, 100, 50)  // 50% P0
    // Buckets entre s1 y s2 (sí son "before" de s2)
    const betweenSnaps = bucketSeries('2024-01-15T08:10:00.000Z', 10, 100, 2) // 2% P0
    // Buckets after s2
    const afterS2 = bucketSeries('2024-01-15T08:20:00.000Z', 10, 100, 4)     // 4% P0
    const result = computeSegmentVerdicts([s1, s2], [...beforeS1, ...betweenSnaps, ...afterS2])
    // before de s2 debe reflejar solo "between" (2% P0), no "beforeS1" (50% P0)
    expect(result.get('s2')?.beforePct).toBeCloseTo(2, 0)
  })

  it('el último snapshot usa el resto del timeline como "after"', () => {
    const s1 = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const s2 = makeSnap({ id: 's2', at: '2024-01-15T08:30:00.000Z' })
    const before = bucketSeries('2024-01-15T08:00:00.000Z', 10, 100, 5)
    const middle = bucketSeries('2024-01-15T08:10:00.000Z', 20, 100, 3)
    // 30 buckets después de s2 → deben ser todos el "after" de s2
    const afterS2 = bucketSeries('2024-01-15T08:30:00.000Z', 30, 10, 1)
    const result = computeSegmentVerdicts([s1, s2], [...before, ...middle, ...afterS2])
    expect(result.get('s2')?.afterPieces).toBe(30 * 10)
  })

  it('mantiene orden aunque los snapshots se pasen desordenados', () => {
    const s2 = makeSnap({ id: 's2', at: '2024-01-15T08:30:00.000Z' })
    const s1 = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const buckets = bucketSeries('2024-01-15T08:00:00.000Z', 50, 100, 5)
    const result = computeSegmentVerdicts([s2, s1], buckets)
    // Ambos deben aparecer
    expect(result.has('s1')).toBe(true)
    expect(result.has('s2')).toBe(true)
    // s2 es el último → su after abarca hasta fin del timeline
    expect((result.get('s2')?.afterPieces ?? 0)).toBeGreaterThan(0)
  })
})

// ── afterPieces en result ───────────────────────────────────────────────────

describe('computeSegmentVerdicts — afterPieces', () => {
  it('suma todas las piezas del segmento after', () => {
    const snap = makeSnap({ id: 's1', at: '2024-01-15T08:10:00.000Z' })
    const before = [makeBucket('2024-01-15T08:00:00.000Z', 50, 2)]
    const after  = [
      makeBucket('2024-01-15T08:10:00.000Z', 30, 1),
      makeBucket('2024-01-15T08:11:00.000Z', 40, 2),
      makeBucket('2024-01-15T08:12:00.000Z', 35, 1),
    ]
    const v = computeSegmentVerdicts([snap], [...before, ...after]).get('s1')!
    expect(v.afterPieces).toBe(105)
  })
})
