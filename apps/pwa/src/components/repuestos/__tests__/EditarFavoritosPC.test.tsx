// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { FavList } from '@/services/userPreferences'

vi.mock('@/hooks/useEsPC', () => ({ useEsPC: () => true }))
vi.mock('@/components/admin/ReAuthConfirmDialog', () => ({
  ReAuthConfirmDialog: ({ open, reason, onConfirmed }: { open: boolean; reason?: string; onConfirmed: () => void }) =>
    open ? (
      <div data-testid="clave">
        <span>{reason}</span>
        <button type="button" onClick={() => onConfirmed()}>Confirmar clave</button>
      </div>
    ) : null,
}))
vi.mock('@/hooks/useGlobalEquipmentSearch', () => ({
  getGlobalEquipmentCache: () => [
    { id: 'b200', nombre: 'BAADER 200', codigo: '720004417', parentId: null, path: [] },
    { id: 'b142', nombre: 'BAADER 142', codigo: '720004441', parentId: null, path: [] },
    { id: 'c1', nombre: 'Cinta 1', codigo: '720000001', parentId: null, path: [] },
    { id: 'c2', nombre: 'Cinta 2', codigo: '720000002', parentId: null, path: [] },
    { id: 'c0', nombre: 'Cinta 0', codigo: '720000003', parentId: null, path: [] },
  ],
}))
vi.mock('@/hooks/repuestos/useRespaldoEquipos', () => ({
  useRespaldoEquipos: () => ({
    repuestos: new Map([['b200', 1562], ['b142', 1882], ['c1', 0], ['c2', 4]]),
    conSap: new Map([['b200', 398], ['b142', 676], ['c1', 0]]),
    eventos: new Map([['720004417', 8], ['720004441', 3], ['720000001', 0]]),
    sinRepetir: { total: 3000, conSap: 1000 },
  }),
}))

import { EditarFavoritosSheet } from '../EditarFavoritosSheet'

const LISTAS: FavList[] = [
  { name: 'Fileteo', machineIds: ['b200', 'b142'], machineNames: { b200: 'BAADER 200', b142: 'BAADER 142' } },
  { name: 'Cintas', machineIds: ['c1'], machineNames: { c1: 'Cinta 1' } },
]

function montar() {
  const onGuardar = vi.fn<(n: FavList[]) => Promise<void>>().mockResolvedValue(undefined)
  render(
    <EditarFavoritosSheet
      open
      onOpenChange={vi.fn()}
      listas={LISTAS}
      nombreDe={(id) => id}
      plantaDe={() => 'PLANTA CHONCHI'}
      seccionDe={(id) => (id === 'b200' ? 'FILETE' : 'EVISCERADO')}
      onGuardar={onGuardar}
    />,
  )
  return { onGuardar }
}

const titulo = () => (screen.getByLabelText(/^Nombre de la lista/) as HTMLInputElement).value

afterEach(() => cleanup())

describe('Mis equipos en PC', () => {
  it('abre con la primera lista, sus cifras reales y el total', () => {
    montar()
    expect(titulo()).toBe('Fileteo')
    expect(screen.getByText('1.562')).toBeTruthy()
    expect(screen.getByText('3.444')).toBeTruthy()
    expect(screen.getByText('2 equipos')).toBeTruthy()
    expect(screen.getByText('3.000')).toBeTruthy()
    expect(screen.getByText('1.000 · 33 %')).toBeTruthy()
  })

  it('cambiar de lista cambia la tabla y el destino', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Cintas/ }))
    expect(titulo()).toBe('Cintas')
    expect(screen.getByText('1 equipo')).toBeTruthy()
    expect(screen.queryByText('BAADER 200')).toBeNull()
  })

  it('quitar se puede deshacer y, si se mantiene, pide la clave antes de guardar', async () => {
    const { onGuardar } = montar()
    fireEvent.click(screen.getByLabelText('Quitar BAADER 142 de Fileteo'))
    expect(screen.getByText('Se quitará')).toBeTruthy()
    expect(screen.getByText('Para quitar se pide tu clave de usuario.')).toBeTruthy()
    fireEvent.click(screen.getByText('Deshacer'))
    expect(screen.queryByText('Se quitará')).toBeNull()

    fireEvent.click(screen.getByLabelText('Quitar BAADER 142 de Fileteo'))
    fireEvent.click(screen.getByText('Quitar y guardar'))
    expect(screen.getByTestId('clave').textContent).toContain('para quitar BAADER 142 · Chonchi de Fileteo')
    expect(onGuardar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Confirmar clave'))
    await vi.waitFor(() => expect(onGuardar).toHaveBeenCalled())
    expect(onGuardar.mock.calls[0]![0][0]!.machineIds).toEqual(['b200'])
  })

  it('al buscar muestra primero lo disponible, cuenta por planta y agrega a la lista elegida', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Cintas/ }))
    fireEvent.change(screen.getByLabelText('Buscar equipo para agregar'), { target: { value: 'cinta' } })
    expect(screen.getByText('3 equipos con «cinta»')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chonchi 3' })).toBeTruthy()
    const nombres = screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))
    expect(nombres).toEqual(['Cinta 0', 'Cinta 2', 'Cinta 1'])
    expect(screen.getByText('En Cintas')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Cinta 2' }))
    fireEvent.click(screen.getByText('Agregar 1 equipo'))
    expect(titulo()).toBe('Cintas')
    expect(screen.getByText('Nuevo')).toBeTruthy()
    const alGuardar = screen.getByText('Al guardar').parentElement!
    expect(within(alGuardar).getByText('Se agregan')).toBeTruthy()
    expect(screen.getByText('Guardar')).toBeTruthy()
  })

  it('renombrar por el título entra al resumen y no pide clave', () => {
    montar()
    const input = screen.getByLabelText(/^Nombre de la lista/)
    fireEvent.change(input, { target: { value: 'Filete Chonchi' } })
    fireEvent.blur(input)
    expect(screen.getByText('Listas renombradas')).toBeTruthy()
    expect(screen.getByText('Guardar')).toBeTruthy()
    expect(screen.getByText(/antes «Fileteo»/)).toBeTruthy()
  })

  it('una lista nueva desde el panel queda abierta y vacía', () => {
    montar()
    fireEvent.click(screen.getByText('Nueva lista'))
    const campo = screen.getByLabelText('Nombre de la lista nueva')
    fireEvent.change(campo, { target: { value: 'Motores' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(titulo()).toBe('Motores')
    expect(screen.getByText('Sin equipos todavía. Agrégalos desde el buscador.')).toBeTruthy()
  })
})
