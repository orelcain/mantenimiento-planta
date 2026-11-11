import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { esAtajoBuscador, useAtajoBuscador } from '../useAtajoBuscador'

function tecla(init: KeyboardEventInit) {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  window.dispatchEvent(e)
  return e
}

describe('atajo del buscador', () => {
  it('reconoce Ctrl+K y ⌘K, también con K mayúscula', () => {
    expect(esAtajoBuscador({ key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe(true)
    expect(esAtajoBuscador({ key: 'k', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false })).toBe(true)
    expect(esAtajoBuscador({ key: 'K', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe(true)
  })

  it('no reacciona a K sola ni a Ctrl+Shift+K o Ctrl+Alt+K', () => {
    expect(esAtajoBuscador({ key: 'k', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(false)
    expect(esAtajoBuscador({ key: 'k', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBe(false)
    expect(esAtajoBuscador({ key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: true })).toBe(false)
    expect(esAtajoBuscador({ key: 'j', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe(false)
  })

  it('alterna con Ctrl+K y le quita el atajo al navegador', () => {
    const alternar = vi.fn()
    const { unmount } = renderHook(() => useAtajoBuscador(alternar))
    const e = tecla({ key: 'k', ctrlKey: true })
    expect(alternar).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)

    const otra = tecla({ key: 'k' })
    expect(alternar).toHaveBeenCalledTimes(1)
    expect(otra.defaultPrevented).toBe(false)

    unmount()
    tecla({ key: 'k', metaKey: true })
    expect(alternar).toHaveBeenCalledTimes(1)
  })

  it('inactivo no escucha', () => {
    const alternar = vi.fn()
    renderHook(() => useAtajoBuscador(alternar, false))
    tecla({ key: 'k', ctrlKey: true })
    expect(alternar).not.toHaveBeenCalled()
  })
})
