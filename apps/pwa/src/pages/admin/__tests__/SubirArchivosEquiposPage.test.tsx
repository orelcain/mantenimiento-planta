import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/services/firebase', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {}, storage: {} }))
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  // La subida termina en el acto: progreso al 100 % y luego «completo».
  uploadBytesResumable: vi.fn(() => ({
    snapshot: { ref: {} },
    on: (_e: string, prog: (s: unknown) => void, _err: unknown, fin: () => void) => { prog({ bytesTransferred: 1, totalBytes: 1 }); void fin() },
  })),
  getDownloadURL: vi.fn(async () => 'https://x/archivo.pdf'),
  deleteObject: vi.fn(),
}))
vi.mock('firebase/firestore', () => ({ addDoc: vi.fn(async () => ({ id: 'm1' })), collection: vi.fn(), serverTimestamp: vi.fn(), getDocs: vi.fn(async () => ({ docs: [] })), query: vi.fn(), where: vi.fn() }))
vi.mock('@/hooks/repuestos/useManualesDeEquipos', () => ({ useManualesDeEquipos: () => ({ manuales: [], loading: false }) }))
vi.mock('@/hooks/useGlobalEquipmentSearch', () => ({
  getGlobalEquipmentCache: () => [],
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

describe('al terminar una tanda', () => {
  it('dice dónde quedó cada archivo y obliga a elegir el equipo de nuevo', async () => {
    const { container } = render(<SubirArchivosEquiposPage />)
    fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [archivo('manual.pdf', 1024)] } })
    fireEvent.change(screen.getByPlaceholderText(/Buscar equipo/), { target: { value: 'gea' } })
    fireEvent.click(screen.getByRole('button', { name: /TERMOFORMADORA GEA/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Subir 1 archivo' }))

    await waitFor(() => expect(screen.getByText('Guardado en TERMOFORMADORA GEA')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toContain('1 archivo guardado en TERMOFORMADORA GEA')
    // El equipo ya no queda elegido para la próxima tanda.
    expect(screen.queryByRole('button', { name: 'Quitar TERMOFORMADORA GEA' })).toBeNull()
  })
})
