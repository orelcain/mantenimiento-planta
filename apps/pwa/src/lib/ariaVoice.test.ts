import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ariaVoice importa getAriaConfig (que arrastra Firebase). Lo mockeamos para aislar
// la lógica de reproducción por frases sin inicializar Firebase en el test.
vi.mock('@/services/ariaThinkingTracker', () => ({
  getAriaConfig: vi.fn().mockResolvedValue({ voiceURI: undefined, speechRate: 1 }),
}))

// La síntesis ya NO llama a texttospeech.googleapis.com directo con una API
// key en el cliente — pasa por googleTtsProxy (Cloud Function callable). El
// mock reemplaza httpsCallable en vez de fetch global. vi.hoisted() porque
// vi.mock() se eleva sobre todo el archivo (incl. imports) y no puede cerrar
// sobre un `const` normal declarado más abajo (TDZ).
const { ttsCallableMock } = vi.hoisted(() => {
  const b64Local = (s: string): string => Buffer.from(s).toString('base64')
  return {
    ttsCallableMock: vi.fn(async (data: { text: string }) => ({
      data: { audioContent: b64Local('audio'), _sent: data },
    })),
  }
})
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => ttsCallableMock),
}))
vi.mock('@/services/firebase', () => ({ default: {} }))

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

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  FakeAudio.instances = []
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })
  ttsCallableMock.mockClear()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('speakWith — reproducción por frases (Google)', () => {
  const tres = 'Primera frase larga de prueba aquí. Segunda frase larga de prueba aquí. Tercera frase larga de prueba aquí.'

  it('trocea en frases, las reproduce en orden y termina una sola vez', async () => {
    const speaking: boolean[] = []
    const off = onSpeakingChange((v) => speaking.push(v))
    const onend = vi.fn()
    speakWith(tres, 'gcloud:es-US-Chirp-HD-F', 0.96, { onend })
    for (let i = 0; i < 20 && onend.mock.calls.length === 0; i++) await flush()
    off()

    expect(ttsCallableMock.mock.calls.length).toBe(3) // una síntesis por frase, no una sola gigante
    expect(FakeAudio.instances.length).toBe(3)    // un audio por frase
    // la 1ª petición lleva SOLO la 1ª frase (prueba el troceo + el orden)
    const call0 = ttsCallableMock.mock.calls[0]![0] as { text: string }
    expect(call0.text).toContain('Primera frase')
    expect(call0.text).not.toContain('Segunda frase')
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
