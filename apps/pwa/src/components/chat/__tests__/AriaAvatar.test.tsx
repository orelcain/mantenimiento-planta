// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { TonoAvatar } from '@/lib/ariaTono'

type Listener = (s: boolean, tono: TonoAvatar) => void
const listeners = new Set<Listener>()
vi.mock('@/lib/ariaVoice', () => ({
  onSpeakingChange: (fn: Listener) => { listeners.add(fn); return () => listeners.delete(fn) },
}))

import { AriaAvatar } from '../AriaAvatar'

const hablar = (s: boolean, tono: TonoAvatar) => act(() => { listeners.forEach((fn) => fn(s, tono)) })

beforeEach(() => {
  // Sin red: el avatar cae a la URL directa de cada clip.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => { cleanup(); listeners.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('AriaAvatar', () => {
  it('en reposo muestra el clip con la boca cerrada', async () => {
    const { container } = render(<AriaAvatar visible tamano="riel" />)
    await act(async () => { await Promise.resolve() })
    const reposo = container.querySelectorAll('video')[0]!
    expect(reposo.getAttribute('src') ?? reposo.src).toMatch(/aria\/polo\/reposo\.mp4$/)
  })

  it('al hablar carga el clip del tono de la respuesta', () => {
    const { container } = render(<AriaAvatar visible tamano="riel" />)
    const habla = container.querySelectorAll('video')[1]!
    hablar(true, 'alerta')
    expect(habla.src).toMatch(/aria\/polo\/alerta\.mp4$/)
    hablar(false, 'alerta')
    hablar(true, 'buena_noticia')
    expect(habla.src).toMatch(/aria\/polo\/buena_noticia\.mp4$/)
  })

  it('no cambia de clip al terminar de hablar (sale con fundido)', () => {
    const { container } = render(<AriaAvatar visible tamano="riel" />)
    const habla = container.querySelectorAll('video')[1]!
    hablar(true, 'saludo')
    hablar(false, 'explicando')
    expect(habla.src).toMatch(/saludo\.mp4$/)
  })
})
