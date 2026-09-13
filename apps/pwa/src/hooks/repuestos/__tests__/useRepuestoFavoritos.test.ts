import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRepuestoFavoritos } from '../useRepuestoFavoritos'

const getRepuestoFavs = vi.fn()
const saveRepuestoFavs = vi.fn()
vi.mock('@/services/userPreferences', () => ({
  getRepuestoFavs: (...a: unknown[]) => getRepuestoFavs(...a),
  saveRepuestoFavs: (...a: unknown[]) => saveRepuestoFavs(...a),
}))

/**
 * La lógica de «mis favoritos» estaba copiada en el hub y en el expediente, y Bodega tenía
 * una TERCERA lista sobre otra colección con la misma palabra y la misma estrella:
 *
 *     pestaña Áreas   ⭐ «Mis favoritos (8)»
 *     pestaña Bodega  ⭐ «Favoritos 0»
 */
describe('useRepuestoFavoritos', () => {
  beforeEach(() => {
    getRepuestoFavs.mockReset().mockResolvedValue(['3300138386', 'fab:999 0543'])
    saveRepuestoFavs.mockReset().mockResolvedValue(undefined)
  })

  it('carga los favoritos del usuario', async () => {
    const { result } = renderHook(() => useRepuestoFavoritos('u1'))
    await waitFor(() => expect(result.current.favKeys.size).toBe(2))
    expect(result.current.esFavorito('3300138386')).toBe(true)
  })

  it('sin usuario no consulta ni revienta', () => {
    const { result } = renderHook(() => useRepuestoFavoritos(undefined))
    expect(getRepuestoFavs).not.toHaveBeenCalled()
    expect(result.current.favKeys.size).toBe(0)
    expect(result.current.esFavorito('3300138386')).toBe(false)
  })

  it('la clave es la identidad de la pieza, no el docId', async () => {
    const { result } = renderHook(() => useRepuestoFavoritos('u1'))
    await waitFor(() => expect(result.current.favKeys.size).toBe(2))
    // El mismo repuesto llega con docId distinto por cada equipo: sigue siendo favorito.
    expect(result.current.esFavorito({ id: 'doc-A', codigoSAP: '3300138386' })).toBe(true)
    expect(result.current.esFavorito({ id: 'doc-B', codigoSAP: '3300138386' })).toBe(true)
  })

  it('una pieza sin SAP se identifica por el código de fabricante', async () => {
    const { result } = renderHook(() => useRepuestoFavoritos('u1'))
    await waitFor(() => expect(result.current.favKeys.size).toBe(2))
    expect(result.current.esFavorito({ id: 'x', codigoSAP: '', codigoFabricante: '999 0543' })).toBe(true)
  })

  it('marcar persiste y se refleja al instante', async () => {
    const { result } = renderHook(() => useRepuestoFavoritos('u1'))
    await waitFor(() => expect(result.current.favKeys.size).toBe(2))
    act(() => result.current.toggleFav('3300106148'))
    expect(result.current.esFavorito('3300106148')).toBe(true)
    expect(saveRepuestoFavs).toHaveBeenCalledWith('u1', expect.arrayContaining(['3300106148']))
  })

  it('desmarcar quita la clave', async () => {
    const { result } = renderHook(() => useRepuestoFavoritos('u1'))
    await waitFor(() => expect(result.current.favKeys.size).toBe(2))
    act(() => result.current.toggleFav('3300138386'))
    expect(result.current.esFavorito('3300138386')).toBe(false)
    expect(saveRepuestoFavs).toHaveBeenCalledWith('u1', expect.not.arrayContaining(['3300138386']))
  })

  it('marcar por objeto y por rowKey son lo mismo — es lo que une Áreas con Bodega', async () => {
    const { result } = renderHook(() => useRepuestoFavoritos('u1'))
    await waitFor(() => expect(result.current.favKeys.size).toBe(2))
    // Bodega marca por rowKey; el expediente marca pasando el repuesto entero.
    act(() => result.current.toggleFav({ id: 'd1', codigoSAP: '3300116693' }))
    expect(result.current.esFavorito('3300116693')).toBe(true)
  })

  it('sin usuario, marcar no persiste nada', () => {
    const { result } = renderHook(() => useRepuestoFavoritos(undefined))
    act(() => result.current.toggleFav('3300138386'))
    expect(saveRepuestoFavs).not.toHaveBeenCalled()
  })
})
