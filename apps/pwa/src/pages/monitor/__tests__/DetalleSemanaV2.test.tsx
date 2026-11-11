/**
 * Detalle por semana de «De quién fue la pérdida»: la grilla abre ESE turno y
 * la causa despliega las paradas en que ocurrió, con hora de inicio y fin.
 * Lo que se protege: que la lista de paradas cuadre con «N veces» y que un
 * turno sin el dato diga «sin dato» en vez de inventar horas.
 *
 * Sin `jest-dom` en este repo: se asierta sobre el texto renderizado.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { DetalleSemanaV2 } from '../DetalleSemanaV2'
import { repartoSemanal } from '../repartoSemanal'
import type { ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'

afterEach(cleanup)

const turno = (p: Partial<ShiftStat>): ShiftStat => ({
  shiftDocId: 'x', dateKey: '2026-10-20', shiftId: 'Turno Dia',
  total: 4000, producingMin: 400, windowMin: 460, plannedMin: 40,
  recoverableMin: 20, recoverable: [], tbv: 3, ...p,
})

const semanas = repartoSemanal([
  // Semana anterior: la base del Δ.
  turno({ shiftDocId: '2026-10-13_Turno Dia', dateKey: '2026-10-13', recoverableMin: 30, recoverable: [{ reason: 'KNURO', min: 30, count: 3 }] }),
  // Martes noche: con paradas en el reloj.
  turno({
    shiftDocId: '2026-10-20_Turno Noche', dateKey: '2026-10-20', shiftId: 'Turno Noche',
    recoverableMin: 12, recoverable: [{ reason: 'KNURO', min: 12, count: 2 }],
    porMaquina: [{ n: 'Baader 1', p: 2000 }, { n: 'Baader 2', p: 2000 }],
    paradas: [{ c: 0, t: '23:50:00', s: 420, m: [1] }, { c: 0, t: '02:10:00', s: 300, m: [0] }],
  }),
  // Miércoles día: anterior al dato de paradas.
  turno({ shiftDocId: '2026-10-21_Turno Dia', dateKey: '2026-10-21', recoverableMin: 4, recoverable: [{ reason: 'KNURO', min: 4, count: 1 }] }),
])

describe('DetalleSemanaV2', () => {
  it('abre por defecto la última semana cerrada y la compara por turno', () => {
    const { container } = render(<DetalleSemanaV2 semanas={semanas} hoy="2026-10-27" />)
    const t = container.textContent ?? ''
    expect(t).toContain('Semana del 19/10')
    // 30 min/turno → 8 min/turno: ▼ 73 %.
    expect(t).toContain('▼ 73 % por turno')
  })

  it('tocar una celda de la grilla muestra ese turno con sus paradas', () => {
    const { container, getByLabelText } = render(<DetalleSemanaV2 semanas={semanas} hoy="2026-10-27" />)
    fireEvent.click(getByLabelText(/^Mar Noche:/))
    const t = container.textContent ?? ''
    expect(t).toContain('Mar 20 · Noche')
    expect(t).toContain('23:50–23:57')
    expect(t).toContain('02:10–02:15')
    expect(t).toContain('Baader 2')
  })

  it('un turno sin el dato dice «sin dato», no inventa horas', () => {
    const { container, getByLabelText } = render(<DetalleSemanaV2 semanas={semanas} hoy="2026-10-27" />)
    fireEvent.click(getByLabelText(/^Mié Día:/))
    expect(container.textContent).toContain('Sin dato')
  })

  it('tocar una causa despliega TODAS las paradas en que ocurrió', () => {
    const { container, getByText } = render(<DetalleSemanaV2 semanas={semanas} hoy="2026-10-27" />)
    fireEvent.click(getByText('Causas'))
    fireEvent.click(getByText('KNURO'))
    const t = container.textContent ?? ''
    expect(t).toContain('3 veces')
    expect(t).toContain('Mar 20 · Noche')
    expect(t).toContain('1 turno de la semana sin dato de horas')
  })
})
