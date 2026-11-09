import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/ariaThinkingTracker', () => ({ getAriaConfig: vi.fn() }))

let creados: FakeAudio[]
let fallaPlay: Error | null

class FakeAudio {
  src = ''
  onplaying: (() => void) | null = null
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  fuentes: string[] = []
  constructor() { creados.push(this) }
  pause() {}
  play(): Promise<void> {
    this.fuentes.push(this.src)
    if (fallaPlay) return Promise.reject(fallaPlay)
    queueMicrotask(() => { this.onplaying?.(); this.onended?.() })
    return Promise.resolve()
  }
}

async function hablar(texto: string) {
  const voz = await import('@/lib/ariaVoice')
  return new Promise<'fin' | 'error'>((resolve) => {
    voz.speakWith(texto, voz.AIKO_VOICE, 1, { onend: () => resolve('fin'), onerror: () => resolve('error') })
  })
}

const dosFrases = 'Primera frase bastante larga para que no se junte con la otra frase del texto. Segunda frase también bastante larga para que quede aparte de la primera.'

describe('reproductor único de ariaVoice', () => {
  beforeEach(() => {
    vi.resetModules()
    creados = []
    fallaPlay = null
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x']), { status: 200 })))
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:audio-${++n}`)
    URL.revokeObjectURL = vi.fn()
  })

  it('todas las frases suenan en el elemento desbloqueado por el toque', async () => {
    const voz = await import('@/lib/ariaVoice')
    voz.desbloquearAudio()
    await Promise.resolve()
    await expect(hablar(dosFrases)).resolves.toBe('fin')
    expect(creados).toHaveLength(1)
    expect(creados[0]!.fuentes.length).toBeGreaterThanOrEqual(3) // silencio + al menos dos frases
  })

  it('si el navegador bloquea el sonido corta la cadena y avisa el error', async () => {
    fallaPlay = Object.assign(new Error('bloqueado'), { name: 'NotAllowedError' })
    await expect(hablar(dosFrases)).resolves.toBe('error')
    expect(creados[0]!.fuentes).toHaveLength(1)
  })

  it('otro fallo de reproducción salta la frase y sigue', async () => {
    fallaPlay = new Error('formato')
    await expect(hablar(dosFrases)).resolves.toBe('fin')
    expect(creados[0]!.fuentes.length).toBeGreaterThanOrEqual(2)
  })
})
