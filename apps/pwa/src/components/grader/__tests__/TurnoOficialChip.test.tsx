/**
 * Smoke tests para TurnoOficialChip — chip de rollup oficial (horario/especie/
 * % target) en Análisis de Turno. Datos calcados del caso real usado en los
 * tests de turnoBrief.js (chonchi Turno 1, COHO, targets 1109/934/934) para
 * que UI y brief de Telegram queden verificablemente alineados.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { TurnoOficialChip } from '../TurnoOficialChip'

const wall = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 16, h, m))

describe('TurnoOficialChip', () => {
  it('sin rollup (turno histórico) → no renderiza nada', () => {
    const { container } = render(<TurnoOficialChip rollup={null} machines={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('caso real: horario + especie + % cumplimiento (chonchi Turno 1 COHO)', () => {
    render(
      <TurnoOficialChip
        rollup={{
          officialSchedule: { start: wall(21, 30), end: new Date(Date.UTC(2026, 6, 17, 5, 45)) },
          currentJob: { name: 'COHO', jobMaxRunRate: 960, productionQuantityExpected: null },
          officialTargetsByMachineId: { a: 1109.4195, b: 934.248, c: 934.248 },
        }}
        machines={[
          { machineid: 'a', totalCycles: 1109 },
          { machineid: 'b', totalCycles: 900 },
          { machineid: 'c', totalCycles: 934 },
        ]}
      />,
    )
    expect(screen.getByText('21:30–05:45')).toBeTruthy()
    expect(screen.getByText('COHO')).toBeTruthy()
    expect(screen.getByText('99% del target oficial')).toBeTruthy()
  })

  it('sin targets (solo horario/especie) → no muestra badge de % ', () => {
    render(
      <TurnoOficialChip
        rollup={{
          officialSchedule: { start: wall(9, 0), end: wall(17, 15) },
          currentJob: null,
          officialTargetsByMachineId: null,
        }}
        machines={[]}
      />,
    )
    expect(screen.getByText('09:00–17:15')).toBeTruthy()
    expect(screen.queryByText(/del target oficial/)).toBeNull()
  })

  it('cumplimiento bajo (20%) usa el nivel critical', () => {
    render(
      <TurnoOficialChip
        rollup={{
          officialSchedule: null,
          currentJob: null,
          officialTargetsByMachineId: { a: 5000 },
        }}
        machines={[{ machineid: 'a', totalCycles: 1000 }]}
      />,
    )
    const badge = screen.getByText('20% del target oficial')
    expect(badge.closest('[class*="red-400"]')).not.toBeNull()
  })
})
