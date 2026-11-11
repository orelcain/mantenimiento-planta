/**
 * Reparto semanal de pérdidas por dueño. Protege las dos trampas pagadas:
 * el escalado máquina→línea (Pareto ×5,6) y la valorización al ritmo propio.
 * Usa la taxonomía REAL (duenoDe): si el árbol cambia, esto avisa.
 */
import { describe, expect, it } from 'vitest'
import { repartoSemanal, lunesDe } from '../repartoSemanal'
import type { ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'

const turno = (p: Partial<ShiftStat>): ShiftStat => ({
  shiftDocId: 'x', dateKey: '2026-08-26', shiftId: 'Turno 2',
  total: 12000, producingMin: 400, windowMin: 460, plannedMin: 40,
  recoverableMin: 20, recoverable: [], tbv: 2, ...p,
})

describe('lunesDe', () => {
  it('devuelve el lunes de la semana del dateKey', () => {
    expect(lunesDe('2026-08-26')).toBe('2026-08-24') // miércoles → lunes 24
    expect(lunesDe('2026-08-24')).toBe('2026-08-24') // lunes → sí mismo
    expect(lunesDe('2026-08-30')).toBe('2026-08-24') // domingo → lunes previo
  })
})

describe('repartoSemanal', () => {
  it('escala los minutos de MÁQUINA a minutos de LÍNEA con recoverableMin', () => {
    // 3 Baader: 30 min de máquina anotados, pero la LÍNEA solo perdió 10.
    const [s] = repartoSemanal([turno({
      recoverableMin: 10,
      recoverable: [
        { reason: 'KNURO', min: 15, count: 1 },        // mantención (árbol real)
        { reason: 'FALTA MMPP', min: 15, count: 2 },   // externo (árbol real)
      ],
    })])
    expect(s!.min.mantencion).toBeCloseTo(5)
    expect(s!.min.externo).toBeCloseTo(5)
    expect(s!.min.mantencion + s!.min.externo + s!.min['sin-imputar']).toBeCloseTo(10)
  })

  it('valoriza las piezas al ritmo PROPIO de cada turno', () => {
    // 12.000 pz en 400 min andando = 30 pz/min → 10 min de línea = 300 pz.
    const [s] = repartoSemanal([turno({
      recoverableMin: 10,
      recoverable: [{ reason: 'Detencion', min: 30, count: 3 }],
    })])
    expect(s!.min['sin-imputar']).toBeCloseTo(10)
    expect(s!.pz['sin-imputar']).toBeCloseTo(300)
  })

  it('agrupa por semana calendario y ordena cronológico', () => {
    const out = repartoSemanal([
      turno({ dateKey: '2026-08-26', shiftDocId: 'a' }),
      turno({ dateKey: '2026-08-19', shiftDocId: 'b' }),
      turno({ dateKey: '2026-08-18', shiftDocId: 'c' }),
    ])
    expect(out.map((s) => s.semana)).toEqual(['2026-08-17', '2026-08-24'])
    expect(out[0]!.turnos).toBe(2)
  })

  it('una detención genérica va a SIN IMPUTAR, nunca se le inventa dueño', () => {
    const [s] = repartoSemanal([turno({
      recoverableMin: 8,
      recoverable: [{ reason: 'Micro Detencion', min: 8, count: 12 }],
    })])
    expect(s!.min['sin-imputar']).toBeCloseTo(8)
    expect(s!.min.mantencion).toBe(0)
  })

  it('un turno sin desglose aporta al conteo y las piezas, no al reparto', () => {
    const [s] = repartoSemanal([
      turno({ recoverable: [], recoverableMin: 0 }),
      turno({ shiftDocId: 'y', recoverableMin: 5, recoverable: [{ reason: 'KNURO', min: 5, count: 1 }] }),
    ])
    expect(s!.turnos).toBe(2)
    expect(s!.piezas).toBe(24000)
    expect(s!.min.mantencion).toBeCloseTo(5)
  })

  it('junta las causas top por dueño para el detalle', () => {
    const [s] = repartoSemanal([turno({
      recoverableMin: 12,
      recoverable: [
        { reason: 'KNURO', min: 6, count: 1 },
        { reason: 'MOTORES (MECANICA)', min: 3, count: 1 },
        { reason: 'FALTA MMPP', min: 3, count: 1 },
      ],
    })])
    expect(s!.causas.mantencion[0]!.causa).toBe('KNURO')
    expect(s!.causas.externo[0]!.causa).toBe('FALTA MMPP')
  })
})

describe('detalle por semana (27-10-2026)', () => {
  it('guarda TODAS las causas con sus veces, no solo las 5 primeras', () => {
    const rec = Array.from({ length: 8 }, (_, i) => ({ reason: `CAUSA ${i}`, min: 8 - i, count: i + 1 }))
    const [s] = repartoSemanal([turno({ recoverableMin: 36, recoverable: rec })])
    expect(s!.causas['sin-imputar']).toHaveLength(8)
    expect(s!.causas['sin-imputar'].find((c) => c.causa === 'CAUSA 7')!.count).toBe(8)
  })

  it('suma las veces de una causa repetida en varios turnos de la semana', () => {
    const [s] = repartoSemanal([
      turno({ shiftDocId: 'a', recoverableMin: 5, recoverable: [{ reason: 'KNURO', min: 5, count: 2 }] }),
      turno({ shiftDocId: 'b', recoverableMin: 5, recoverable: [{ reason: 'KNURO', min: 5, count: 3 }] }),
    ])
    const k = s!.causas.mantencion[0]!
    expect(k.count).toBe(5)
    expect(k.min).toBeCloseTo(10)
    expect(k.equipo).toBe('Knuro')
  })

  it('guarda el detalle de cada turno, con su reparto propio', () => {
    const [s] = repartoSemanal([
      turno({ shiftDocId: '2026-08-25_Turno Noche', dateKey: '2026-08-25', shiftId: 'Turno Noche', recoverableMin: 4, recoverable: [{ reason: 'KNURO', min: 4, count: 1 }] }),
      turno({ shiftDocId: '2026-08-25_Turno Dia', dateKey: '2026-08-25', shiftId: 'Turno Dia', recoverableMin: 6, recoverable: [{ reason: 'FALTA MMPP', min: 6, count: 1 }] }),
    ])
    expect(s!.detalle.map((t) => t.shiftId)).toEqual(['Turno Dia', 'Turno Noche'])
    expect(s!.detalle[1]!.min.mantencion).toBeCloseTo(4)
    expect(s!.detalle[0]!.min.externo).toBeCloseTo(6)
  })

  it('las paradas: hora de inicio y fin, causa y máquina; null si el turno es anterior al dato', () => {
    const [s] = repartoSemanal([
      turno({
        shiftDocId: 'a', recoverableMin: 10,
        recoverable: [{ reason: 'KNURO', min: 10, count: 1 }],
        porMaquina: [{ n: 'Baader 1', p: 100 }, { n: 'Baader 2', p: 100 }],
        paradas: [{ c: 0, t: '23:55:30', s: 600, m: [1] }],
      }),
      turno({ shiftDocId: 'b', recoverableMin: 1, recoverable: [{ reason: 'KNURO', min: 1, count: 1 }] }),
    ])
    const [a, b] = s!.detalle
    expect(a!.paradas).toEqual([{ causa: 'KNURO', dueno: 'mantencion', inicio: '23:55', fin: '00:06', seg: 600, maquinas: ['Baader 2'] }])
    expect(b!.paradas).toBeNull()
  })
})
