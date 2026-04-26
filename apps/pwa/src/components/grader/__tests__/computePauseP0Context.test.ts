/**
 * Tests para computePauseP0Context.
 *
 * Función pura que calcula el P0% en una ventana antes de una pausa y
 * durante toda su duración. Usada por PauseAnnotationDialog para mostrar
 * el chip "antes → durante" como pista del motivo de la pausa.
 */

import { describe, it, expect } from 'vitest'
import type { TimelineBucket } from '@/services/grader/types'
import { computePauseP0Context } from '../pauseAnnotationHelpers'

function bucket(tsMin: string, pieces: number, p0Pieces: number): TimelineBucket {
  return {
    tsMin,
    pieces,
    p0Pieces,
    avgWeight: null,
    gateCounts: {},
  } as unknown as TimelineBucket
}

describe('computePauseP0Context', () => {
  it('devuelve null cuando no hay buckets', () => {
    const res = computePauseP0Context([], '2026-04-25T10:00:00.000Z', '2026-04-25T10:10:00.000Z', 10)
    expect(res).toBeNull()
  })

  it('devuelve null cuando no hay buckets en ninguna ventana', () => {
    // Buckets a las 12:00, pausa a las 10:00–10:10 con window 10min → todos fuera
    const buckets = [
      bucket('2026-04-25T12:00:00.000Z', 100, 1),
      bucket('2026-04-25T12:01:00.000Z', 100, 1),
    ]
    const res = computePauseP0Context(buckets, '2026-04-25T10:00:00.000Z', '2026-04-25T10:10:00.000Z', 10)
    expect(res).toBeNull()
  })

  it('calcula P0% antes (window 10 min) y durante correctamente', () => {
    // Pausa: 10:00 → 10:10
    // Antes window: 09:50 → 09:59 (10 min antes del start, exclusivo del start)
    // Durante: 10:00 → 10:09 (inclusivo del start, exclusivo del end)
    const buckets = [
      bucket('2026-04-25T09:50:00.000Z', 100, 5),  // antes → 5/100
      bucket('2026-04-25T09:55:00.000Z', 100, 5),  // antes → 5/100
      bucket('2026-04-25T10:00:00.000Z',  20, 1),  // durante (parada bajando)
      bucket('2026-04-25T10:05:00.000Z',   0, 0),  // durante (sin pzas)
    ]
    const res = computePauseP0Context(buckets, '2026-04-25T10:00:00.000Z', '2026-04-25T10:10:00.000Z', 10)
    expect(res).not.toBeNull()
    expect(res!.beforePct).toBeCloseTo((10 / 200) * 100, 6) // = 5%
    expect(res!.beforePieces).toBe(200)
    expect(res!.duringPct).toBeCloseTo((1 / 20) * 100, 6) // = 5%
    expect(res!.duringPieces).toBe(20)
  })

  it('beforePct es null cuando no hay piezas en la ventana antes', () => {
    const buckets = [
      bucket('2026-04-25T09:55:00.000Z', 0, 0), // pieces=0 no aporta
      bucket('2026-04-25T10:00:00.000Z', 50, 2),
    ]
    const res = computePauseP0Context(buckets, '2026-04-25T10:00:00.000Z', '2026-04-25T10:10:00.000Z', 10)
    expect(res).not.toBeNull()
    expect(res!.beforePct).toBeNull()
    expect(res!.beforePieces).toBe(0)
    expect(res!.duringPct).toBeCloseTo(4, 6) // 2/50 = 4%
  })

  it('duringPct es null cuando no hay piezas dentro de la pausa (caso típico)', () => {
    // Caso operacional típico: la línea está parada → 0 pzs durante
    const buckets = [
      bucket('2026-04-25T09:55:00.000Z', 100, 3),
      bucket('2026-04-25T10:00:00.000Z',   0, 0),
      bucket('2026-04-25T10:05:00.000Z',   0, 0),
    ]
    const res = computePauseP0Context(buckets, '2026-04-25T10:00:00.000Z', '2026-04-25T10:10:00.000Z', 10)
    expect(res).not.toBeNull()
    expect(res!.beforePct).toBeCloseTo(3, 6)
    expect(res!.duringPct).toBeNull()
    expect(res!.duringPieces).toBe(0)
  })

  it('respeta la ventana antes — buckets fuera del window NO se cuentan', () => {
    // Window 5 min: 09:55 → 10:00 (exclusive start). Bucket de 09:50 NO debe contarse.
    const buckets = [
      bucket('2026-04-25T09:50:00.000Z', 100, 90), // FUERA del window 5 min
      bucket('2026-04-25T09:56:00.000Z',  50,  1), // DENTRO
    ]
    const res = computePauseP0Context(buckets, '2026-04-25T10:00:00.000Z', '2026-04-25T10:10:00.000Z', 5)
    expect(res!.beforePieces).toBe(50)
    expect(res!.beforePct).toBeCloseTo(2, 6) // 1/50 = 2%
  })

  it('borde: bucket exactamente en startMs es "durante", no "antes"', () => {
    const buckets = [
      bucket('2026-04-25T10:00:00.000Z', 10, 1),
    ]
    const res = computePauseP0Context(buckets, '2026-04-25T10:00:00.000Z', '2026-04-25T10:10:00.000Z', 10)
    expect(res!.duringPieces).toBe(10)
    expect(res!.beforePieces).toBe(0)
  })

  it('borde: bucket exactamente en endMs es excluido de "durante"', () => {
    const buckets = [
      bucket('2026-04-25T10:10:00.000Z', 10, 1), // = endMs → excluido
    ]
    const res = computePauseP0Context(buckets, '2026-04-25T10:00:00.000Z', '2026-04-25T10:10:00.000Z', 10)
    expect(res).toBeNull() // Sin datos en ninguna ventana
  })

  it('timestamps inválidos → null', () => {
    const buckets = [bucket('2026-04-25T09:55:00.000Z', 100, 5)]
    const res = computePauseP0Context(buckets, 'not-a-date', '2026-04-25T10:10:00.000Z', 10)
    expect(res).toBeNull()
  })
})
