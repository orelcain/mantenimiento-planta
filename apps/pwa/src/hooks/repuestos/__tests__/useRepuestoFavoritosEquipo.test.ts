import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRepuestoFavoritosEquipo } from '../useRepuestoFavoritosEquipo'

const getRepuestoFavLists = vi.fn()
const saveRepuestoFavLists = vi.fn()
vi.mock('@/services/userPreferences', () => ({
  getRepuestoFavLists: (...a: unknown[]) => getRepuestoFavLists(...a),
  saveRepuestoFavLists: (...a: unknown[]) => saveRepuestoFavLists(...a),
}))

const A = { id: 'a', codigoSAP: '3300126381', codigoFabricante: '38010111' }
const B = { id: 'b', codigoSAP: '3300103452', codigoFabricante: '' }
const C = { id: 'c', codigoSAP: '3300000001', codigoFabricante: '' }
const filas = [A, B, C]

describe('useRepuestoFavoritosEquipo', () => {
  beforeEach(() => {
    getRepuestoFavLists.mockReset().mockResolvedValue([
      { name: 'Resortes', repuestoIds: ['inv-3300126381'] },
      { name: 'Sensores', repuestoIds: ['3300103452'] },
    ])
    saveRepuestoFavLists.mockReset().mockResolvedValue(undefined)
  })

  it('carga las listas del equipo y traduce los ids viejos', async () => {
    const { result } = renderHook(() => useRepuestoFavoritosEquipo('u1', 'nodo1'))
    await waitFor(() => expect(result.current.listas).toHaveLength(2))
    expect(getRepuestoFavLists).toHaveBeenCalledWith('u1', 'nodo1')
    expect(result.current.listas[0]?.repuestoIds).toEqual(['3300126381'])
    expect(result.current.contarFavoritos(filas)).toBe(2)
    expect(result.current.contarEnLista('Sensores', filas)).toBe(1)
  })

  it('marcar y desmarcar guarda en la clave del equipo y el contador acompaña', async () => {
    const { result } = renderHook(() => useRepuestoFavoritosEquipo('u1', 'nodo1'))
    await waitFor(() => expect(result.current.listas).toHaveLength(2))
    act(() => result.current.toggleFav(C))
    expect(result.current.esFavorito(C)).toBe(true)
    expect(result.current.contarFavoritos(filas)).toBe(3)
    expect(saveRepuestoFavLists).toHaveBeenLastCalledWith('u1', 'nodo1', expect.arrayContaining([{ name: 'Favoritos', repuestoIds: ['3300000001'] }]))
    act(() => result.current.toggleFav(C))
    expect(result.current.contarFavoritos(filas)).toBe(2)
  })

  it('toques seguidos no se pisan (crear lista y agregar otra pieza)', async () => {
    const { result } = renderHook(() => useRepuestoFavoritosEquipo('u1', 'nodo1'))
    await waitFor(() => expect(result.current.listas).toHaveLength(2))
    act(() => { result.current.crearLista('Correas', C); result.current.toggleEnLista('Correas', B) })
    expect(result.current.listas.find((l) => l.name === 'Correas')?.repuestoIds).toEqual(['3300000001', '3300103452'])
  })

  it('sin equipo no lee ni guarda', () => {
    const { result } = renderHook(() => useRepuestoFavoritosEquipo('u1', null))
    act(() => result.current.toggleFav(A))
    expect(getRepuestoFavLists).not.toHaveBeenCalled()
    expect(saveRepuestoFavLists).not.toHaveBeenCalled()
    expect(result.current.listas).toEqual([])
  })

  it('al cambiar de equipo se vuelve a leer y no quedan las listas del anterior', async () => {
    getRepuestoFavLists.mockImplementation(async (_u: string, k: string) => (k === 'n2' ? [{ name: 'X', repuestoIds: ['1'] }] : [{ name: 'A', repuestoIds: ['2'] }]))
    const { result, rerender } = renderHook(({ k }) => useRepuestoFavoritosEquipo('u1', k), { initialProps: { k: 'n1' } })
    await waitFor(() => expect(result.current.listas[0]?.name).toBe('A'))
    rerender({ k: 'n2' })
    await waitFor(() => expect(result.current.listas[0]?.name).toBe('X'))
  })
})
