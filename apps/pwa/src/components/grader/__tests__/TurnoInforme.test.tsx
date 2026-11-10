import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TurnoInforme } from '../TurnoInforme'
import { kpisDeTurno } from '@/services/shoplogix/kpisMantencionTurno'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'

vi.mock('@/hooks/useFallasRepetidas', () => ({
  useFallasRepetidas: () => ({ grupos: [{ repeticiones: 3 }, { repeticiones: 1 }], episodiosTurno: 8, turnosPrevios: 0, loading: false }),
}))
vi.mock('@/services/shoplogix/tendenciaMantencion', () => ({
  TURNOS_TENDENCIA: 12,
  cargarTendenciaMantencion: vi.fn(async () => [0, 40, 90].map((m, i) => ({
    dateKey: `2026-10-0${i + 1}`, shiftId: 'Turno 2', porMaquina: [{ name: 'x', fallaMin: m, eventos: 1 }],
  }))),
}))

const T0 = Date.UTC(2026, 9, 1, 7, 15)
const en = (m: number) => new Date(T0 + m * 60_000)
const st = (a: number, b: number, type: string, name: string, reason = '') =>
  ({ startAt: en(a), endAt: en(b), durationSec: (b - a) * 60, type, name, reason, color: '', isCurrent: false })

const snapshot = {
  machines: [{
    machineid: '2', machineName: 'Evisceradora 2', machineType: 'baader', dateKey: '2026-10-01', shiftId: 'Turno 2',
    shiftStart: en(0), shiftEnd: en(465), scheduledStart: en(0), scheduledEnd: en(465),
    totalCycles: 1000, expectedTotalCycles: 2000, totalPieces: 1000, expectedTotalPieces: 2000, comments: [],
    intervals: [{ startAt: en(0), endAt: en(5), cycles: 60, expectedCycles: 90 }],
    states: [st(0, 100, 'uptime', 'Produciendo'), st(100, 160, 'downtime', 'Detencion', 'LOGICA'), st(160, 465, 'uptime', 'Produciendo')],
  }],
} as unknown as UpstreamLineSnapshot

function montar(extra: Partial<Parameters<typeof TurnoInforme>[0]> = {}) {
  const onVerMantencion = vi.fn(), onVerPorHacer = vi.fn()
  render(
    <TurnoInforme
      kpis={kpisDeTurno(snapshot)!} plantSlug={'chonchi' as never} dateKey="2026-10-03" shiftId="Turno 2"
      identidad="Jueves 1 de octubre. Cerrado." enCurso={false} porDetallar={0}
      onVerMantencion={onVerMantencion} onVerPorHacer={onVerPorHacer} {...extra}
    />,
  )
  return { onVerMantencion, onVerPorHacer }
}

describe('TurnoInforme', () => {
  afterEach(cleanup)

  it('abre con lo que pasó, sin nombres de formulario', () => {
    montar()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^La Baader 2 estuvo 1.h en falla/)
    expect(screen.getByText('Jueves 1 de octubre. Cerrado.')).toBeTruthy()
  })

  it('muestra el aporte de Mantención en la misma lectura', async () => {
    montar()
    expect(screen.getAllByText('Lo que hizo Mantención').length).toBeGreaterThan(0)
    expect(screen.getAllByText('4 de 8').length).toBeGreaterThan(0)
    expect((await screen.findAllByTestId('informe-tendencia')).length).toBeGreaterThan(0)
  })

  it('las salidas llevan a las vistas que conservan el detalle', () => {
    const { onVerMantencion, onVerPorHacer } = montar()
    fireEvent.click(screen.getAllByRole('button', { name: /Gantt y comentarios/ })[0]!)
    expect(onVerMantencion).toHaveBeenCalledOnce()
    fireEvent.click(screen.getAllByRole('button', { name: 'Detallar' })[0]!)
    expect(onVerPorHacer).toHaveBeenCalledOnce()
  })

  it('el análisis técnico anterior sigue disponible y parte plegado', () => {
    montar({ analisisCompleto: <div>Panel técnico</div> })
    expect(screen.queryByText('Panel técnico')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Análisis técnico completo/ }))
    expect(screen.getByText('Panel técnico')).toBeTruthy()
  })
})
