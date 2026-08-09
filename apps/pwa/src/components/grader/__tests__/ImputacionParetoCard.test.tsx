/**
 * Render de la card de imputación del turno.
 *
 * El turno de prueba usa las causales REALES que Shoplogix manda desde Yal
 * (COLACION, FALTA MMPP, LOGICA, AJUSTE MANTENIMIENTO, BOMBAS, Micro Detencion
 * sin causal) más el Planned Downtime que la ventana de consulta arrastra.
 *
 * Se asierta sobre `container.textContent` porque los números viven partidos
 * entre varios nodos (`Con causal <b>95%</b>`).
 */
import { describe, it, expect } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import { ImputacionParetoCard } from '../ImputacionParetoCard'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

const st = (type: string, reason: string, min: number, name = 'Detencion') => ({
  type, name, reason,
  durationSec: min * 60,
  startAt: new Date('2026-07-15T12:00:00Z'),
  endAt: new Date('2026-07-15T12:00:00Z'),
  color: '#888',
})

function turno(states: ReturnType<typeof st>[]): UpstreamMachineShift[] {
  return [{ machineid: 'm1', machineName: 'Baader 142 Ev 1', totalCycles: 1000, states } as unknown as UpstreamMachineShift]
}

const TURNO_YAL = turno([
  st('uptime', '', 300),
  st('break', 'Planned Downtime', 600),
  st('break', 'COLACION', 45),
  st('downtime', 'FALTA MMPP', 30),
  st('downtime', 'LOGICA', 12),
  st('downtime', 'AJUSTE MANTENIMIENTO', 8),
  st('downtime', 'BOMBAS', 4),
  st('downtime', '', 5, 'Micro Detencion'),
])

describe('ImputacionParetoCard', () => {
  it('muestra la cobertura de imputación sobre el tiempo detenido', () => {
    // Detenido = 45+30+12+8+4+5 = 104 min. Con causal = 99 → 95%.
    // El uptime y el Planned Downtime no entran en el denominador.
    const { container } = render(<ImputacionParetoCard machines={TURNO_YAL} />)
    expect(container.textContent).toContain('Con causal')
    expect(container.textContent).toContain('95%')
    expect(container.textContent).toContain('1h 39m con causal')
    expect(container.textContent).toContain('5m sin anotar')
  })

  it('agrupa por categoría del árbol, ordenado por impacto', () => {
    const { container } = render(<ImputacionParetoCard machines={TURNO_YAL} />)
    const txt = container.textContent ?? ''
    expect(txt.indexOf('Paros Programados')).toBeLessThan(txt.indexOf('MMPP'))
    expect(txt).toContain('Falla Eléctrica')
    expect(txt).toContain('Eléctrica o Mecánica')
    expect(txt).toContain('Sin causal anotada')
  })

  it('muestra en cero las categorías sin registros, no las esconde', () => {
    const { container } = render(<ImputacionParetoCard machines={TURNO_YAL} />)
    expect(container.textContent).toContain('Sin registros en este turno')
    expect(container.textContent).toContain('Falla Mecánica')
  })

  it('el drill-down abre las causales de la categoría', () => {
    const { container } = render(<ImputacionParetoCard machines={TURNO_YAL} />)
    const getByRole = within(container).getByRole
    expect(container.textContent).not.toContain('Ajuste mantenimiento')
    fireEvent.click(getByRole('button', { name: /^Operacionales/ }))
    expect(container.textContent).toContain('Ajuste mantenimiento')
  })

  it('marca la causal ambigua entre eléctrica y mecánica', () => {
    const { container } = render(<ImputacionParetoCard machines={TURNO_YAL} />)
    const getByRole = within(container).getByRole
    fireEvent.click(getByRole('button', { name: /^Eléctrica o Mecánica/ }))
    expect(container.textContent).toContain('Bombas')
    expect(container.textContent).toContain('¿eléc. o mec.?')
  })

  it('el árbol completo lista las 46 causales del curso', () => {
    const { container } = render(<ImputacionParetoCard machines={TURNO_YAL} />)
    const getByRole = within(container).getByRole
    fireEvent.click(getByRole('button', { name: /árbol completo/ }))
    expect(container.textContent).toContain('Punto Cero')
    expect(container.textContent).toContain('Flow Ice')
    expect(container.textContent).toContain('Knuro')
  })

  it('no se renderiza si el turno no tuvo detenciones', () => {
    const { container } = render(<ImputacionParetoCard machines={turno([st('uptime', '', 480)])} />)
    expect(container.innerHTML).toBe('')
  })
})
