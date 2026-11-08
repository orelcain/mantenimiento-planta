/**
 * Resumen del mes en la piel Apple: tabla de cuatro filas con el turno de mejor y
 * peor escrito como se dice en planta («miércoles 4 mañana»), no como «11-04 · T1».
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GraderMonthlyStatsPanel } from '../GraderMonthlyStatsPanel'

const slxStats = {
  avgUptimePct: 76,
  totalCycles: 176900,
  daysWithData: 12,
  turnosWithData: 12,
  dayShiftsWithData: 0,
  nightShiftsWithData: 0,
  t1ShiftsWithData: 0,
  t2ShiftsWithData: 0,
  t3ShiftsWithData: 0,
  bestShift: { dateKey: '2026-11-04', shiftId: 'Turno 1', uptimePct: 83 },
  worstShift: { dateKey: '2026-11-06', shiftId: 'Turno 2', uptimePct: 49 },
  unscheduled: { cycles: 0, uptimeSec: 0, daysWithData: 0 },
  imputacion: null,
} as never

function panel() {
  return render(
    <MemoryRouter>
      <GraderMonthlyStatsPanel
        currentMonth={new Date(2026, 10, 1)}
        summaries={[]}
        slxStats={slxStats}
        isClassificationPlant={true}
        tieneGrader={false}
        plantSlug={null}
      />
    </MemoryRouter>,
  )
}

describe('GraderMonthlyStatsPanel · piel Apple', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    document.documentElement.removeAttribute('data-skin')
  })

  it('el título dice el mes y los turnos', () => {
    const { container } = panel()
    expect(container.querySelector('h2')?.textContent).toBe('Noviembre 2026, 12 turnos')
  })

  it('el mejor y el peor turno se escriben con día de la semana, número y turno', () => {
    const { container } = panel()
    const texto = container.textContent ?? ''
    expect(texto).toContain('Mejor turno (uptime)83%, miércoles 4 mañana')
    expect(texto).toContain('Peor turno (uptime)49%, viernes 6 tarde')
    expect(texto).not.toContain('11-04')
  })

  it('la tabla trae uptime promedio y ciclos, sin marco', () => {
    const { container } = panel()
    const texto = container.textContent ?? ''
    expect(texto).toContain('Uptime promedio76%')
    expect(texto).toContain('Ciclos Baader176.900')
    expect(container.querySelector('table')?.className).not.toContain('border')
  })
})
