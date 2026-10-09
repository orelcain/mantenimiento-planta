import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../useTheme'

/**
 * useTheme con y sin la paleta Pizarra. Sin ella el hook se comporta como siempre
 * (oscuro por defecto, escribe `app-theme`); con ella sale de la intensidad.
 */
function simularSistema(oscuro: boolean, celular = false) {
  const oyentes = new Set<() => void>()
  const estado = { oscuro }
  vi.stubGlobal('matchMedia', (q: string) => ({
    get matches() { return q.includes('prefers-color-scheme') ? estado.oscuro : celular },
    media: q,
    addEventListener: (_t: string, f: () => void) => { oyentes.add(f) },
    removeEventListener: (_t: string, f: () => void) => { oyentes.delete(f) },
  }))
  window.matchMedia = globalThis.matchMedia
  return { cambiar: (v: boolean) => { estado.oscuro = v; oyentes.forEach(f => f()) } }
}

const root = document.documentElement

beforeEach(() => {
  localStorage.clear()
  root.classList.remove('dark')
  root.removeAttribute('data-paleta')
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useTheme SIN Pizarra', () => {
  it('oscuro por defecto y escribe app-theme, como siempre', () => {
    simularSistema(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.isDark).toBe(true)
    expect(result.current.pizarra).toBe(false)
    expect(localStorage.getItem('app-theme')).toBe('dark')
    expect(localStorage.getItem('app-intensidad')).toBeNull()
    act(() => result.current.toggleTheme())
    expect(result.current.isDark).toBe(false)
    expect(localStorage.getItem('app-theme')).toBe('light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('setIntensidad no hace nada sin Pizarra', () => {
    simularSistema(true)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setIntensidad('dia'))
    expect(result.current.isDark).toBe(true)
    expect(localStorage.getItem('app-intensidad')).toBeNull()
  })
})

describe('useTheme CON Pizarra', () => {
  beforeEach(() => { root.setAttribute('data-paleta', 'pizarra') })

  it('PC sin nada guardado: Automático, sigue al sistema en vivo y no fija app-theme', () => {
    const sis = simularSistema(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.intensidad).toBe('auto')
    expect(result.current.isDark).toBe(false)
    expect(localStorage.getItem('app-theme')).toBeNull()
    act(() => sis.cambiar(true))
    expect(result.current.isDark).toBe(true)
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('celular sin nada guardado: Día aunque el sistema sea oscuro', () => {
    simularSistema(true, true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.intensidad).toBe('dia')
    expect(result.current.isDark).toBe(false)
  })

  it('PC: respeta un app-theme previo (dark → Penumbra)', () => {
    simularSistema(false, false)
    localStorage.setItem('app-theme', 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.intensidad).toBe('penumbra')
    expect(result.current.isDark).toBe(true)
  })

  it('celular con app-theme=dark y sin app-intensidad: parte en Día y no escribe app-intensidad', () => {
    simularSistema(true, true)
    localStorage.setItem('app-theme', 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.intensidad).toBe('dia')
    expect(result.current.isDark).toBe(false)
    expect(root.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('app-intensidad')).toBeNull()
    expect(localStorage.getItem('app-theme')).toBe('dark') // intacto
  })

  it('celular con app-intensidad=penumbra elegida: se respeta', () => {
    simularSistema(false, true)
    localStorage.setItem('app-intensidad', 'penumbra')
    const { result } = renderHook(() => useTheme())
    expect(result.current.intensidad).toBe('penumbra')
    expect(result.current.isDark).toBe(true)
  })

  it('elegir Penumbra y Día guarda por dispositivo y fija app-theme; Automático no', () => {
    simularSistema(false)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setIntensidad('penumbra'))
    expect(localStorage.getItem('app-intensidad')).toBe('penumbra')
    expect(localStorage.getItem('app-theme')).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
    act(() => result.current.setIntensidad('auto'))
    expect(localStorage.getItem('app-intensidad')).toBe('auto')
    expect(localStorage.getItem('app-theme')).toBe('dark') // intacto: el último explícito
    expect(result.current.isDark).toBe(false) // el sistema es claro
  })

  it('el botón Sol/Luna alterna Día/Penumbra con Pizarra', () => {
    simularSistema(false, true)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.intensidad).toBe('penumbra')
    act(() => result.current.toggleTheme())
    expect(result.current.intensidad).toBe('dia')
  })

  it('si setItem lanza (cuota llena) igual aplica el tema, avisa a las demás instancias y no deja app-intensidad viejo', () => {
    simularSistema(false, true)
    localStorage.setItem('app-intensidad', 'dia')
    const a = renderHook(() => useTheme())
    const b = renderHook(() => useTheme())
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cuota llena', 'QuotaExceededError') })
    expect(() => act(() => a.result.current.setIntensidad('penumbra'))).not.toThrow()
    espia.mockRestore()
    expect(a.result.current.intensidad).toBe('penumbra')
    expect(a.result.current.isDark).toBe(true)
    expect(root.classList.contains('dark')).toBe(true)
    // la otra instancia se enteró aunque nada se guardó
    expect(b.result.current.intensidad).toBe('penumbra')
    // el 'dia' viejo no quedó contradiciendo la pantalla
    expect(localStorage.getItem('app-intensidad')).not.toBe('dia')
  })

  it('si el almacenamiento no puede ni leerse, el hook arranca igual', () => {
    simularSistema(false)
    const espia = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    const { result } = renderHook(() => useTheme())
    espia.mockRestore()
    expect(result.current.intensidad).toBe('auto')
  })

  it('otra instancia del hook se entera del cambio (evento)', () => {
    simularSistema(false, true)
    const a = renderHook(() => useTheme())
    const b = renderHook(() => useTheme())
    act(() => a.result.current.setIntensidad('penumbra'))
    expect(b.result.current.intensidad).toBe('penumbra')
    expect(b.result.current.isDark).toBe(true)
  })
})
