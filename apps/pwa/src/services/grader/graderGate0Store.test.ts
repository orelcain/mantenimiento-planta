import { describe, it, expect } from 'vitest'
import { classifyGate0Records, type StoredGate0Record } from './graderGate0Store'
import type { GateAssignment } from './types'

const gate = (n: number, calibre: string, quality: string, active = true): GateAssignment =>
  ({ gateNumber: n, assignedCalibre: calibre, assignedQuality: quality, active } as GateAssignment)

// 2000 g cae en "4-6 lb" (1833–2749 g).
const rec = (over: Partial<StoredGate0Record> = {}): StoredGate0Record => ({
  ts: '2026-08-03T10:00:00.000Z', pieces: 1, error: '', weightPerPieceGrams: 2000, quality: 'Industrial', ...over,
})

const CON_46 = [gate(1, '4-6 lb', 'Industrial'), gate(2, '6-8 lb', 'Premium')]
const CON_24 = [gate(1, '2-4 lb', 'Industrial'), gate(2, '6-8 lb', 'Premium')]

const pieces = (causes: Array<{ error: string; pieces: number }>, name: string) =>
  causes.find((c) => c.error === name)?.pieces ?? 0

describe('classifyGate0Records', () => {
  it('CONSERVA las causas oficiales del Marelec al recalcular', () => {
    // Este es el motivo de guardar el input: sin la columna Error, estas piezas
    // reaparecerían como "fuera de límites" y el turno perdería información real.
    const records = [
      rec({ error: 'No leído por fotocélula', pieces: 31, weightPerPieceGrams: 0 }),
      rec({ error: 'Puerta no preparada', pieces: 1 }),
      rec({ error: 'Fuera de límites', pieces: 10 }),
    ]
    const out = classifyGate0Records(records, CON_46, 42)
    expect(pieces(out, 'no_leido_fotocelula')).toBe(31)
    expect(pieces(out, 'puerta_no_preparada')).toBe(1)
    // Y el total sigue cuadrando con las piezas del turno.
    expect(out.reduce((s, c) => s + c.pieces, 0)).toBe(42)
  })

  it('reclasifica las causas derivadas al cambiar las gates', () => {
    const records = [rec({ error: 'Fuera de límites', pieces: 10 })]
    // Con gate para 4-6 lb Industrial la pieza calza → residual "fuera de límites".
    expect(pieces(classifyGate0Records(records, CON_46, 10), 'fuera_de_limites')).toBe(10)
    // Movida esa gate a 2-4 lb, ya no hay gate que cubra su peso.
    expect(pieces(classifyGate0Records(records, CON_24, 10), 'fuera_de_calibre')).toBe(10)
  })

  it('los porcentajes se calculan sobre las piezas de puerta 0 del turno', () => {
    const out = classifyGate0Records([rec({ error: 'Fuera de límites', pieces: 25 })], CON_46, 100)
    expect(out[0]!.pct).toBe(25)
  })

  it('sin gates activas cae al error crudo del Marelec en vez de inventar una causa', () => {
    const out = classifyGate0Records([rec({ error: 'No leído por fotocélula', pieces: 3 })], [], 3)
    expect(out).toEqual([{ error: 'No leído por fotocélula', pieces: 3, pct: 100 }])
  })

  it('un turno sin piezas en puerta 0 no produce causas', () => {
    expect(classifyGate0Records([], CON_46, 0)).toEqual([])
  })
})
