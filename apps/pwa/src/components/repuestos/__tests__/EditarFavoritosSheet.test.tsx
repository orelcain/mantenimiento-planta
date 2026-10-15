// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FavList } from '@/services/userPreferences'

// La clave real usa Firebase: aquí solo importa CUÁNDO se pide y que al confirmar se guarde.
vi.mock('@/components/admin/ReAuthConfirmDialog', () => ({
  ReAuthConfirmDialog: ({ open, reason, onConfirmed }: { open: boolean; reason?: string; onConfirmed: () => void }) =>
    open ? (
      <div data-testid="clave">
        <span>{reason}</span>
        <button type="button" onClick={() => onConfirmed()}>Confirmar clave</button>
      </div>
    ) : null,
}))

import { EditarFavoritosSheet } from '../EditarFavoritosSheet'

const LISTAS: FavList[] = [
  { name: 'Fileteo', machineIds: ['b200', 'b142'], machineNames: { b200: 'BAADER 200', b142: 'BAADER 142' } },
  { name: 'Cintas', machineIds: ['c1'], machineNames: { c1: 'Cinta 1' } },
]

function montar(extra: Partial<React.ComponentProps<typeof EditarFavoritosSheet>> = {}) {
  const onOpenChange = vi.fn<(o: boolean) => void>()
  const onGuardar = vi.fn<(n: FavList[]) => Promise<void>>().mockResolvedValue(undefined)
  render(
    <EditarFavoritosSheet
      open
      onOpenChange={onOpenChange}
      listas={LISTAS}
      nombreDe={(id) => id}
      plantaDe={() => 'PLANTA CHONCHI'}
      onGuardar={onGuardar}
      {...extra}
    />,
  )
  return { onOpenChange, onGuardar }
}

afterEach(() => cleanup())

describe('EditarFavoritosSheet', () => {
  it('quitar un equipo y Guardar abre la clave; no guarda hasta confirmar', async () => {
    const p = montar()
    expect(screen.getByText('Sin cambios')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Quitar BAADER 142 de Fileteo'))
    expect(screen.getByText('· se quitará')).toBeTruthy()
    fireEvent.click(screen.getByText('Quitar y guardar'))
    expect(screen.getByTestId('clave').textContent).toContain('para quitar BAADER 142 · Chonchi de Fileteo')
    expect(p.onGuardar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Confirmar clave'))
    await waitFor(() => expect(p.onGuardar).toHaveBeenCalledTimes(1))
    expect(p.onGuardar.mock.calls[0]![0]).toEqual([
      { name: 'Fileteo', machineIds: ['b200'], machineNames: { b200: 'BAADER 200' } },
      { name: 'Cintas', machineIds: ['c1'], machineNames: { c1: 'Cinta 1' } },
    ])
    await waitFor(() => expect(p.onOpenChange).toHaveBeenCalledWith(false))
  })

  it('solo agregar guarda directo, sin clave', async () => {
    const p = montar({ equipoInicial: { id: 'm1', nombre: 'MAREL HG' }, listaInicial: 'Cintas' })
    // llega preseleccionado desde la estrella
    expect(screen.getByRole('checkbox', { name: /MAREL HG/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByText('Agregar 1 equipo'))
    expect(screen.getByText('Se agregarán 1')).toBeTruthy()
    fireEvent.click(screen.getByText('Guardar'))
    expect(screen.queryByTestId('clave')).toBeNull()
    await waitFor(() => expect(p.onGuardar).toHaveBeenCalledTimes(1))
    const guardado = p.onGuardar.mock.calls[0]![0] as FavList[]
    expect(guardado[1]!.machineIds).toEqual(['c1', 'm1'])
  })

  it('Deshacer revierte la marca de quitar', () => {
    montar()
    fireEvent.click(screen.getByLabelText('Quitar Cinta 1 de Cintas'))
    expect(screen.getByText('Quitar y guardar')).toBeTruthy()
    fireEvent.click(screen.getByText('Deshacer'))
    expect(screen.queryByText('· se quitará')).toBeNull()
    expect(screen.getByText('Sin cambios')).toBeTruthy()
    expect((screen.getByText('Guardar') as HTMLButtonElement).disabled).toBe(true)
  })

  it('cancelar con cambios pide descartar; sin cambios cierra directo', () => {
    const p = montar()
    fireEvent.click(screen.getByText('Cancelar'))
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
    p.onOpenChange.mockClear()

    fireEvent.click(screen.getByLabelText('Quitar Cinta 1 de Cintas'))
    fireEvent.click(screen.getByText('Cancelar'))
    expect(p.onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText('Descartar cambios')).toBeTruthy()
    fireEvent.click(screen.getByText('Seguir editando'))
    expect(p.onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Cancelar'))
    fireEvent.click(screen.getByText('Descartar cambios'))
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
    expect(p.onGuardar).not.toHaveBeenCalled()
  })
})
