import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { RegistrarTrabajoJKSheet, type DetencionParaTrabajo } from '../RegistrarTrabajoJKSheet'

vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(),
}))

const detencion: DetencionParaTrabajo = {
  turnoJkId: '2026-11-25_Turno 1',
  dateKey: '2026-11-25',
  shiftId: 'Turno 1',
  inicioMs: Date.UTC(2026, 10, 25, 21, 15),
  min: 124,
  causa: 'Knuro',
  comentario: 'cilindro quebrado expulsador',
}

afterEach(() => cleanup())

describe('RegistrarTrabajoJKSheet · montaje', () => {
  it('muestra el título con la causa y los minutos, y el botón único de guardar', () => {
    render(<RegistrarTrabajoJKSheet open onClose={() => {}} detencion={detencion} sugerencias={['expulsador']} />)
    expect(screen.getByRole('heading', { name: 'Knuro detuvo la línea 124 min' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar en la Bitácora' })).toBeTruthy()
  })

  it('pide la máquina antes de guardar', () => {
    render(<RegistrarTrabajoJKSheet open onClose={() => {}} detencion={detencion} sugerencias={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar en la Bitácora' }))
    expect(screen.getByRole('alert').textContent).toContain('Escribe la máquina o el equipo.')
  })

  it('el campo del N° de aviso solo acepta dígitos', () => {
    render(<RegistrarTrabajoJKSheet open onClose={() => {}} detencion={detencion} sugerencias={[]} />)
    const aviso = screen.getByLabelText('N° de aviso SAP (opcional)') as HTMLInputElement
    fireEvent.change(aviso, { target: { value: '45a00' } })
    expect(aviso.value).toBe('4500')
  })
})

// ── Máquina prellenada desde el turno (SPEC_BUSCADOR_JACK_KNIFE_2 §2) ───────
// Fixture real (25-11 Chonchi, solo lectura): en el Knuro de 22:53 solo Evisceradora 1 marcó KNURO.
import { waitFor } from '@testing-library/react'
import maquinas25 from '../../../services/shoplogix/__tests__/fixtures/chonchi-2026-11-25-maquinas.json'

const detencion2511: DetencionParaTrabajo = {
  turnoJkId: '2026-11-25_Turno 1',
  dateKey: '2026-11-25',
  shiftId: 'Turno 1',
  inicioMs: 1795647183251,
  min: 124,
  causa: 'Knuro',
  comentario: 'cilindro quebrado expulsador',
}

describe('RegistrarTrabajoJKSheet · máquina desde el turno', () => {
  it('una sola candidata (25-11, Knuro 22:53) queda elegida sin chips', async () => {
    render(
      <RegistrarTrabajoJKSheet open onClose={() => {}} detencion={detencion2511} sugerencias={[]}
        cargarMaquinas={async () => maquinas25} />,
    )
    await waitFor(() => expect((screen.getByLabelText('Máquina o equipo') as HTMLInputElement).value).toBe('Evisceradora 1'))
    expect(screen.queryByRole('group', { name: 'Máquinas' })).toBeNull()
  })

  it('varias candidatas muestran chips solo con ellas y no eligen ninguna', async () => {
    const dos = [
      { machineName: 'Evisceradora 1', states: [{ s: 1795647183251, e: 1795650783251, reason: 'KNURO', name: 'Detencion' }] },
      { machineName: 'Evisceradora 2', states: [{ s: 1795647183251, e: 1795650783251, reason: 'KNURO', name: 'Detencion' }] },
      { machineName: 'Evisceradora 3', states: [] },
    ]
    render(
      <RegistrarTrabajoJKSheet open onClose={() => {}} detencion={detencion2511} sugerencias={[]}
        cargarMaquinas={async () => dos} />,
    )
    const grupo = await screen.findByRole('group', { name: 'Máquinas' })
    expect(grupo.textContent).toBe('Evisceradora 1Evisceradora 2')
    expect((screen.getByLabelText('Máquina o equipo') as HTMLInputElement).value).toBe('')
  })

  it('error al leer el turno: chips con toda la línea y el guardado no se bloquea', async () => {
    render(
      <RegistrarTrabajoJKSheet open onClose={() => {}} detencion={detencion2511} sugerencias={[]}
        cargarMaquinas={() => Promise.reject(new Error('sin red'))} />,
    )
    const grupo = await screen.findByRole('group', { name: 'Máquinas' })
    expect(grupo.textContent).toContain('Evisceradora 1')
    expect(screen.getByRole('button', { name: 'Guardar en la Bitácora' })).toBeTruthy()
  })
})
