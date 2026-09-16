import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsDark } from '../useTheme'

// DESIGN.md §6b: el tema es uno y del sistema. `useIsDark` debe seguir la clase
// `dark` del documento EN VIVO, aunque quien la cambie sea otro componente.
describe('useIsDark', () => {
  it('lee el estado inicial y sigue los cambios de la clase dark', async () => {
    const root = document.documentElement
    root.classList.add('dark')
    const { result } = renderHook(() => useIsDark())
    expect(result.current).toBe(true)

    await act(async () => {
      root.classList.remove('dark')
      await new Promise(r => setTimeout(r, 0)) // el MutationObserver es asíncrono
    })
    expect(result.current).toBe(false)

    await act(async () => {
      root.classList.add('dark')
      await new Promise(r => setTimeout(r, 0))
    })
    expect(result.current).toBe(true)
  })
})
