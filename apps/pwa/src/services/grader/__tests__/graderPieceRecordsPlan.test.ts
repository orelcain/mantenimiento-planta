import { describe, it, expect } from 'vitest'
import { planPieceRecordWrites, pieceIdentityKey, type FirestorePieceRecord } from '../graderDailySummary.service'

const rec = (over: Partial<FirestorePieceRecord> = {}): FirestorePieceRecord => ({
  ts: '2026-09-08T00:23:16.000Z', gate: 12, pieces: 1, weightKg: 6.34, lot: '720260492',
  quality: 'Premium', calibre: 'Other', dedupeKey: 'x', ...over,
})

describe('planPieceRecordWrites · recarga del Excel con un parser nuevo', () => {
  it('la misma pieza con otra etiqueta se ACTUALIZA en su doc, no se duplica (G12 "Other" → "12-UP lb")', () => {
    const existing = [{ id: 'doc1', rec: rec() }]
    const plan = planPieceRecordWrites(existing, [rec({ calibre: '12-UP lb', conservation: 'CONGELADO' })])
    expect(plan.add).toEqual([])
    expect(plan.update).toEqual([{ id: 'doc1', rec: rec({ calibre: '12-UP lb', conservation: 'CONGELADO' }) }])
    expect(plan.skipped).toBe(0)
  })

  it('sin cambio de etiqueta se salta; una pieza nueva se agrega', () => {
    const existing = [{ id: 'doc1', rec: rec() }]
    const nueva = rec({ ts: '2026-09-08T00:23:17.000Z' })
    const plan = planPieceRecordWrites(existing, [rec(), nueva])
    expect(plan.add).toEqual([nueva])
    expect(plan.update).toEqual([])
    expect(plan.skipped).toBe(1)
  })

  it('la identidad no depende de las etiquetas ni de la dedupeKey vieja', () => {
    expect(pieceIdentityKey(rec())).toBe(pieceIdentityKey(rec({ calibre: '12-UP lb', quality: 'Grado', dedupeKey: 'otra' })))
    expect(pieceIdentityKey(rec())).not.toBe(pieceIdentityKey(rec({ weightKg: 6.35 })))
  })

  it('la misma pieza repetida en el Excel se escribe una sola vez', () => {
    const plan = planPieceRecordWrites([], [rec(), rec()])
    expect(plan.add).toHaveLength(1)
    expect(plan.skipped).toBe(1)
  })
})
