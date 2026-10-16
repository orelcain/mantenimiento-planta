// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ImagenRepuesto } from '@/types/repuestos'

const borrar = vi.fn(async (_url: string) => {})
vi.mock('@/services/storage', () => ({
  uploadRepuestoFoto: vi.fn(),
  deleteRepuestoFoto: (url: string) => borrar(url),
  SIN_EQUIPO_STORAGE_SEGMENT: 'sin-equipo',
}))
// La clave real usa Firebase Auth: aquí el diálogo expone un botón que simula «clave correcta».
vi.mock('@/components/admin/ReAuthConfirmDialog', () => ({
  ReAuthConfirmDialog: ({ open, onConfirmed }: { open: boolean; onConfirmed: () => void }) =>
    open ? <button type="button" onClick={onConfirmed}>Clave correcta</button> : null,
}))

import { RepuestoPhotosModal } from '../RepuestoPhotosModal'

const img = (id: string, tipo: 'real' | 'manual'): ImagenRepuesto =>
  ({ id, url: `https://x/${tipo}/${id}.jpg`, descripcion: id, orden: 0, esPrincipal: id === 'a', tipo, createdAt: new Date() })

function montar() {
  const onSaveFotos = vi.fn(async () => {})
  const onSaveImagenesManual = vi.fn(async () => {})
  render(
    <RepuestoPhotosModal
      open
      onOpenChange={() => {}}
      fotosReales={[img('a', 'real'), img('b', 'real')]}
      imagenesManual={[img('m1', 'manual'), img('m2', 'manual')]}
      repuestoName="Válvula magnética 34970060"
      isAdmin
      repuestoId="3300070160"
      onSaveFotos={onSaveFotos}
      onSaveImagenesManual={onSaveImagenesManual}
    />,
  )
  return { onSaveFotos, onSaveImagenesManual }
}

afterEach(() => { cleanup(); borrar.mockClear() })

describe('RepuestoPhotosModal · quitar con clave', () => {
  it('quitar una imagen del manual pide la clave y recién entonces guarda sin ella', async () => {
    const { onSaveImagenesManual } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar imagen del manual 2' }))
    expect(onSaveImagenesManual).not.toHaveBeenCalled()
    expect(borrar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Clave correcta'))
    await waitFor(() => expect(onSaveImagenesManual).toHaveBeenCalledTimes(1))
    expect(borrar).toHaveBeenCalledWith('https://x/manual/m2.jpg')
    const guardadas = (onSaveImagenesManual.mock.calls[0] as unknown as [ImagenRepuesto[]])[0]
    expect(guardadas.map((i) => i.id)).toEqual(['m1'])
  })

  it('quitar la foto principal pasa la siguiente a principal', async () => {
    const { onSaveFotos } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto 1' }))
    fireEvent.click(screen.getByText('Clave correcta'))
    await waitFor(() => expect(onSaveFotos).toHaveBeenCalledTimes(1))
    const guardadas = (onSaveFotos.mock.calls[0] as unknown as [ImagenRepuesto[]])[0]
    expect(guardadas.map((i) => [i.id, i.esPrincipal])).toEqual([['b', true]])
  })

  it('sin permiso de admin no hay botones de quitar', () => {
    render(
      <RepuestoPhotosModal open onOpenChange={() => {}} fotosReales={[img('a', 'real')]} imagenesManual={[img('m1', 'manual')]} repuestoName="X" />,
    )
    expect(screen.queryByRole('button', { name: /^Quitar/ })).toBeNull()
  })
})
