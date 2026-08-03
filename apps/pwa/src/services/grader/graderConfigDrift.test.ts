import { describe, it, expect } from 'vitest'
import { detectConfigDrift, changedGates } from './graderConfigDrift'
import type { GateAssignment } from './types'

// Rangos reales de CALIBRE_WEIGHT_RANGES: 2-4 lb = 916–1833 g · 4-6 lb = 1833–2749 g.
// Las piezas de prueba pesan 2000 g → siempre caen en "4-6 lb".
const gate = (n: number, calibre: string, quality: string, active = true): GateAssignment =>
  ({ gateNumber: n, assignedCalibre: calibre, assignedQuality: quality, active } as GateAssignment)

const p0 = (grams: number, quality: string, pieces = 1) =>
  ({ ts: '2026-08-03T10:00:00.000Z', gate: 0 as const, pieces, weightPerPieceGrams: grams, quality } as never)

// Config con gate para 4-6 lb Industrial (la pieza de 2000 g Industrial calza).
const CON_46_INDUSTRIAL = [gate(1, '4-6 lb', 'Industrial'), gate(2, '6-8 lb', 'Premium')]
// Misma config con G1 movida a 2-4 lb: ya no hay ninguna gate que cubra 4-6 lb.
const CON_24_INDUSTRIAL = [gate(1, '2-4 lb', 'Industrial'), gate(2, '6-8 lb', 'Premium')]

describe('detectConfigDrift', () => {
  it('detecta que la config actual reclasificaría las piezas (modo exacto)', () => {
    const res = detectConfigDrift({
      gatesUsed: CON_46_INDUSTRIAL,
      currentGates: CON_24_INDUSTRIAL,
      gate0Records: [p0(2000, 'Industrial', 10)],
    })
    expect(res?.stale).toBe(true)
    expect(res?.mode).toBe('exact')
    // Con la config vieja la pieza calzaba (residual "fuera de límites"); con la
    // nueva ya no hay gate que cubra 4-6 lb → pasa a "fuera de calibre".
    const calibre = res?.causes.find((c) => c.cause === 'fuera_de_calibre')
    expect(calibre).toEqual({ cause: 'fuera_de_calibre', saved: 0, current: 10 })
    expect(res?.changedGateNumbers).toEqual([1])
  })

  it('no avisa cuando la config no cambió', () => {
    const res = detectConfigDrift({
      gatesUsed: CON_46_INDUSTRIAL,
      currentGates: CON_46_INDUSTRIAL,
      gate0Records: [p0(2000, 'Industrial', 10)],
    })
    expect(res?.stale).toBe(false)
    expect(res?.changedGateNumbers).toEqual([])
  })

  it('no avisa si la gate que cambió no afecta a ninguna pieza de puerta 0', () => {
    // G2 pasa de Premium a Industrial, pero ninguna pieza P0 pesa 6-8 lb.
    const res = detectConfigDrift({
      gatesUsed: CON_46_INDUSTRIAL,
      currentGates: [gate(1, '4-6 lb', 'Industrial'), gate(2, '6-8 lb', 'Industrial')],
      gate0Records: [p0(2000, 'Industrial', 10)],
    })
    expect(res?.changedGateNumbers).toEqual([2])
    expect(res?.stale).toBe(false)
  })

  it('turno viejo sin gatesUsed: compara contra las causas guardadas (modo estimado)', () => {
    const res = detectConfigDrift({
      currentGates: CON_24_INDUSTRIAL,
      gate0Records: [p0(2000, 'Industrial', 10)],
      savedCauses: [{ error: 'fuera_de_limites', pieces: 10 }],
    })
    expect(res?.mode).toBe('estimated')
    expect(res?.stale).toBe(true)
    expect(res?.causes).toEqual([{ cause: 'fuera_de_calibre', saved: 0, current: 10 }])
  })

  it('devuelve null cuando no hay con qué comparar', () => {
    // Sin gates activas (líneas que no clasifican, ej. Yal).
    expect(detectConfigDrift({
      currentGates: [gate(1, '4-6 lb', 'Industrial', false)],
      gate0Records: [p0(2000, 'Industrial')],
    })).toBeNull()
    // Sin piezas de puerta 0.
    expect(detectConfigDrift({ currentGates: CON_24_INDUSTRIAL, gate0Records: [] })).toBeNull()
    // Turno viejo sin causas guardadas.
    expect(detectConfigDrift({
      currentGates: CON_24_INDUSTRIAL,
      gate0Records: [p0(2000, 'Industrial')],
    })).toBeNull()
  })
})

describe('changedGates', () => {
  it('detecta altas, bajas y cambios de asignación', () => {
    expect(changedGates(CON_46_INDUSTRIAL, CON_24_INDUSTRIAL)).toEqual([1])
    expect(changedGates(CON_46_INDUSTRIAL, [...CON_46_INDUSTRIAL, gate(3, '8-10 lb', 'Premium')])).toEqual([3])
    expect(changedGates(CON_46_INDUSTRIAL, [gate(1, '4-6 lb', 'Industrial')])).toEqual([2])
    expect(changedGates(CON_46_INDUSTRIAL, [gate(1, '4-6 lb', 'Industrial', false), gate(2, '6-8 lb', 'Premium')])).toEqual([1])
  })
})
