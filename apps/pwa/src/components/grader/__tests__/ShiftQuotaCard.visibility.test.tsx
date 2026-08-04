/**
 * La card de cuota SIEMPRE se ve.
 *
 * Antes, sin cuota definida y sin permiso de edición, el componente devolvía
 * `null`: la card desaparecía entera. El efecto práctico es que la función
 * parecía no existir — Orel la buscó en el detalle del turno y concluyó que
 * se había perdido en algún cambio, cuando en realidad nunca se le había
 * mostrado. Un `return null` por permisos esconde la funcionalidad, no solo
 * el botón.
 *
 * Estos tests fijan el comportamiento nuevo para que no se vuelva a perder en
 * silencio: sin cuota siempre hay card; el BOTÓN es lo que depende del permiso.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ShiftQuotaCard } from '../ShiftQuotaCard'
import type { GraderDailySummary } from '@/services/grader/types'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'

const summary = {
  id: '2026-08-03__Turno 2',
  dateKey: '2026-08-03',
  shiftId: 'Turno 2',
  totalPieces: 1880,
  pointZeroPieces: 40,
  pointZeroPct: 2.1,
  updatedBy: 'test',
  updatedAt: '2026-08-03T12:00:00.000Z',
} as GraderDailySummary

const shiftWindow = {
  startAt: new Date('2026-08-03T08:10:00.000Z'),
  endAt: new Date('2026-08-03T14:52:00.000Z'),
} as unknown as ShiftTimeWindow

describe('ShiftQuotaCard — visibilidad sin cuota definida', () => {
  it('SIN permiso de edición: la card se muestra igual (antes devolvía null)', () => {
    const { container } = render(
      <ShiftQuotaCard summary={summary} shiftWindow={shiftWindow} allowEdit={false} />,
    )
    expect(container.textContent).toContain('Sin cuota definida')
    // Y explica quién puede definirla, en vez de dejar un hueco mudo.
    expect(container.textContent).toContain('supervisor')
  })

  it('SIN permiso NO ofrece el botón: sería un callejón sin salida', () => {
    const { container } = render(
      <ShiftQuotaCard summary={summary} shiftWindow={shiftWindow} allowEdit={false} />,
    )
    expect(container.textContent).not.toContain('Definir cuota')
  })

  it('CON permiso ofrece el CTA para definirla', () => {
    const { container } = render(
      <ShiftQuotaCard summary={summary} shiftWindow={shiftWindow} allowEdit />,
    )
    expect(container.textContent).toContain('Definir cuota')
  })

  it('nunca renderiza vacío: siempre hay algo en pantalla', () => {
    for (const allowEdit of [true, false]) {
      const { container } = render(
        <ShiftQuotaCard summary={summary} shiftWindow={shiftWindow} allowEdit={allowEdit} />,
      )
      expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0)
    }
  })
})
