/**
 * GateChangeModal — el ÚNICO formulario de cambio de gate.
 *
 * Cubre lo que aportaba `QuickGateChangeButton`, el segundo formulario que
 * escribía el mismo snapshot y se borró al unificar: conservación, producto,
 * pre-relleno desde una sugerencia, y funcionar sin recibir los snapshots.
 * Si algo de esto se cae, se pierde una capacidad que el usuario ya tenía.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

const saveConfigSnapshot = vi.fn()
const getLatestSnapshot = vi.fn()

vi.mock('@/services/grader/graderConfigSnapshot.service', () => ({
  saveConfigSnapshot: (...args: unknown[]) => saveConfigSnapshot(...args),
  getLatestSnapshot: (...args: unknown[]) => getLatestSnapshot(...args),
}))
vi.mock('@/services/grader/graderModuleConfig.service', () => ({
  getModuleRanges: () => Promise.resolve(null),
}))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/store/authStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: 'u1', nombre: 'Test', apellido: 'User', email: 't@e.cl' } }),
}))

import { GateChangeModal } from '../modals/GateChangeModal'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'

const gates = [
  { gateNumber: 1, assignedCalibre: '2-4 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 2, assignedCalibre: '4-6 lb', assignedQuality: 'Premium', active: true },
] as GateConfigSnapshot['gates']

const snapshot = { id: 's1', at: new Date().toISOString(), gates, changes: [] } as unknown as GateConfigSnapshot

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  shiftDocId: '2026-08-03__Turno 2',
  onSaved: vi.fn(),
}

afterEach(cleanup)
beforeEach(() => {
  saveConfigSnapshot.mockReset().mockResolvedValue({ at: new Date().toISOString() })
  getLatestSnapshot.mockReset().mockResolvedValue(snapshot)
})

describe('GateChangeModal', () => {
  it('sin configSnapshots carga el último por su cuenta', async () => {
    render(<GateChangeModal {...baseProps} />)
    await waitFor(() => expect(getLatestSnapshot).toHaveBeenCalledWith('2026-08-03__Turno 2'))
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    await waitFor(() => expect(screen.getByText('G1 actual:')).toBeTruthy())
  })

  it('no vuelve a pedir el snapshot si el contenedor ya lo pasó', async () => {
    render(<GateChangeModal {...baseProps} configSnapshots={[snapshot]} />)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    await waitFor(() => expect(screen.getByText('G1 actual:')).toBeTruthy())
    expect(getLatestSnapshot).not.toHaveBeenCalled()
  })

  it('ofrece conservación y producto, y los guarda en el snapshot', async () => {
    render(<GateChangeModal {...baseProps} configSnapshots={[snapshot]} />)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    await waitFor(() => expect(screen.getByText('Conservación')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'CONGELADO' }))
    fireEvent.click(screen.getByRole('button', { name: 'HG' }))
    fireEvent.click(screen.getByRole('button', { name: /Registrar cambio/ }))

    await waitFor(() => expect(saveConfigSnapshot).toHaveBeenCalled())
    const savedGates = saveConfigSnapshot.mock.calls[0]![1] as typeof gates
    const g1 = savedGates.find(g => g.gateNumber === 1)!
    expect(g1.assignedConservation).toBe('CONGELADO')
    expect(g1.assignedProduct).toBe('HG')
  })

  it('el pre-relleno de una sugerencia deja el gate listo para confirmar', async () => {
    render(
      <GateChangeModal
        {...baseProps}
        configSnapshots={[snapshot]}
        initialGate={2}
        initialCalibre="6-8 lb"
        initialQuality="Industrial"
        initialReason="Sugerencia: G2 4-6 lb → 6-8 lb"
      />,
    )
    await waitFor(() => expect(screen.getByText('G2 actual:')).toBeTruthy())
    expect(screen.getByDisplayValue('Sugerencia: G2 4-6 lb → 6-8 lb')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Registrar cambio/ }))
    await waitFor(() => expect(saveConfigSnapshot).toHaveBeenCalled())
    const savedGates = saveConfigSnapshot.mock.calls[0]![1] as typeof gates
    const g2 = savedGates.find(g => g.gateNumber === 2)!
    expect(g2.assignedCalibre).toBe('6-8 lb')
    expect(g2.assignedQuality).toBe('Industrial')
  })

  it('sin cambios respecto al snapshot, no deja registrar', async () => {
    render(<GateChangeModal {...baseProps} configSnapshots={[snapshot]} />)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    await waitFor(() => expect(screen.getByText('G1 actual:')).toBeTruthy())
    const submit = screen.getByRole('button', { name: /Registrar cambio/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })
})
