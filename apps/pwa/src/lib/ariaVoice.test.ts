import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ariaVoice importa getAriaConfig (que arrastra Firebase). Lo mockeamos para aislar
// la lógica de reproducción por frases sin inicializar Firebase en el test.
vi.mock('@/services/ariaThinkingTracker', () => ({
  getAriaConfig: vi.fn().mockResolvedValue({ voiceURI: undefined, speechRate: 1 }),
}))

import { speakWith, stopSpeaking, onSpeakingChange } from './ariaVoice'

// ── Fakes de navegador (happy-dom no reproduce audio real) ──────────
class FakeAudio {
  static instances: FakeAudio[] = []
  src: string
  onplaying: (() => void) | null = null
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused = false
  constructor(src?: string) { this.src = src || ''; FakeAudio.instances.push(this) }
  play(): Promise<void> {
    // simula reproducción: "suena" y "termina" en microtasks sucesivos
    queueMicrotask(() => { this.onplaying?.(); queueMicrotask(() => this.onended?.()) })
    return Promise.resolve()
  }
  pause(): void { this.paused = true }
}

const b64 = (s: string): string => Buffer.from(s).toString('base64')
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  FakeAudio.instances = []
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })
  // Google TTS: cada llamada (= una frase) devuelve audio. Guarda los cuerpos para inspeccionar.
  fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => ({
    ok: true,
    json: async () => ({ audioContent: b64('audio'), _sent: init?.body }),
  }))
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('speakWith — reproducción por frases (Google)', () => {
  const tres = 'Primera frase larga de prueba aquí. Segunda frase larga de prueba aquí. Tercera frase larga de prueba aquí.'

  it('trocea en frases, las reproduce en orden y termina una sola vez', async () => {
    const speaking: boolean[] = []
    const off = onSpeakingChange((v) => speaking.push(v))
    const onend = vi.fn()
    speakWith(tres, 'gcloud:es-US-Chirp-HD-F', 0.96, { onend })
    for (let i = 0; i < 20 && onend.mock.calls.length === 0; i++) await flush()
    off()

    expect(fetchMock.mock.calls.length).toBe(3)   // una síntesis por frase, no una sola gigante
    expect(FakeAudio.instances.length).toBe(3)    // un audio por frase
    // la 1ª petición lleva SOLO la 1ª frase (prueba el troceo + el orden)
    const body0 = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body0.input.text).toContain('Primera frase')
    expect(body0.input.text).not.toContain('Segunda frase')
    expect(onend).toHaveBeenCalledTimes(1)
    expect(speaking.includes(true)).toBe(true)    // avisó "hablando" al sonar la 1ª
    expect(speaking[speaking.length - 1]).toBe(false) // y termina en "no hablando"
  })

  it('stopSpeaking corta la cadena: no llama onend y deja "no hablando"', async () => {
    const speaking: boolean[] = []
    const off = onSpeakingChange((v) => speaking.push(v))
    const onend = vi.fn()
    speakWith(tres, 'gcloud:es-US-Chirp-HD-F', 0.96, { onend })
    stopSpeaking() // corta antes de que termine
    for (let i = 0; i < 10; i++) await flush()
    off()

    expect(onend).not.toHaveBeenCalled()
    expect(speaking[speaking.length - 1]).toBe(false)
  })
})
