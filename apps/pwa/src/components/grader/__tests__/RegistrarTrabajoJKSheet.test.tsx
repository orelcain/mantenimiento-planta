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
