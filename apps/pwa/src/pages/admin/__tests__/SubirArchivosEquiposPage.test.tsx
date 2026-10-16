import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/services/firebase', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {}, storage: {} }))
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytesResumable: vi.fn(), getDownloadURL: vi.fn(), deleteObject: vi.fn() }))
vi.mock('firebase/firestore', () => ({ addDoc: vi.fn(), collection: vi.fn(), serverTimestamp: vi.fn() }))
vi.mock('@/hooks/repuestos/useManualesDeEquipos', () => ({ useManualesDeEquipos: () => ({ manuales: [], loading: false }) }))
vi.mock('@/hooks/useGlobalEquipmentSearch', () => ({
  useGlobalEquipmentSearch: (q: string) => ({
    results: q.length >= 2 ? [{ id: 'gea1', nombre: 'TERMOFORMADORA GEA', codigo: '720011999', parentId: null, path: [] }] : [],
    loading: false,
  }),
}))

import { SubirArchivosEquiposPage } from '../SubirArchivosEquiposPage'

const archivo = (name: string, size: number) => {
  const f = new File(['x'], name, { type: 'application/pdf' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('SubirArchivosEquiposPage', () => {
  it('pide equipo antes de subir y rechaza lo que pasa de 100 MB', () => {
    const { container } = render(<SubirArchivosEquiposPage />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [archivo('catalogo.pdf', 90 * 1024 * 1024), archivo('enorme.zip', 120 * 1024 * 1024)] } })

    expect(screen.getByText('catalogo.pdf')).toBeTruthy()
    expect(screen.getByText(/No se sube enorme\.zip: pesa 120 MB/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Elige un equipo primero' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText(/Buscar equipo/), { target: { value: 'gea' } })
    fireEvent.click(screen.getByRole('button', { name: /TERMOFORMADORA GEA/ }))
    expect((screen.getByRole('button', { name: 'Subir 1 archivo' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
