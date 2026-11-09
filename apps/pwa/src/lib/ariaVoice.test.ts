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

import { speakWith, stopSpeaking, onSpeakingChange, loadVoicePref, AIKO_VOICE, AIKO_SERVERS } from './ariaVoice'

// ── Fakes de navegador (happy-dom no reproduce audio real) ──────────
class FakeAudio {
  static instances: FakeAudio[] = []
  static reproducciones = 0
  src: string
  onplaying: (() => void) | null = null
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused = false
  constructor(src?: string) { this.src = src || ''; FakeAudio.instances.push(this) }
  play(): Promise<void> {
    FakeAudio.reproducciones++
    // simula reproducción: "suena" y "termina" en microtasks sucesivos
    queueMicrotask(() => { this.onplaying?.(); queueMicrotask(() => this.onended?.()) })
    return Promise.resolve()
  }
  pause(): void { this.paused = true }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  FakeAudio.instances = []
  FakeAudio.reproducciones = 0
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
    expect(FakeAudio.reproducciones).toBe(3)    // un audio por frase
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

describe('voz de Aiko (servidor local)', () => {
  const dos = 'Primera frase larga de prueba aquí. Segunda frase larga de prueba aquí.'
  const respuesta = (ok: boolean): Response => ({ ok, status: ok ? 200 : 503, blob: async () => new Blob(['x']) }) as unknown as Response

  it('pide una frase por vez al servidor y no usa Google', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => respuesta(true))
    vi.stubGlobal('fetch', fetchMock)
    const onend = vi.fn()
    speakWith(dos, AIKO_VOICE, 1, { onend })
    for (let i = 0; i < 20 && onend.mock.calls.length === 0; i++) await flush()

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([`${AIKO_SERVERS[0]}/frase`, `${AIKO_SERVERS[0]}/frase`])
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).texto).toContain('Primera frase')
    expect(ttsCallableMock).not.toHaveBeenCalled()
    expect(FakeAudio.reproducciones).toBe(2)
    expect(onend).toHaveBeenCalledTimes(1)
  })

  it('si el servidor no responde, ARIA habla igual con Google', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('apagado') }))
    const onend = vi.fn()
    speakWith(dos, AIKO_VOICE, 1, { onend })
    for (let i = 0; i < 20 && onend.mock.calls.length === 0; i++) await flush()

    expect(ttsCallableMock).toHaveBeenCalledTimes(2)
    expect(FakeAudio.reproducciones).toBe(2)
    expect(onend).toHaveBeenCalledTimes(1)
  })

  it('elige Aiko solo si su servidor responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(true)))
    expect((await loadVoicePref()).voiceURI).toBe(AIKO_VOICE)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red privada') }))
    expect((await loadVoicePref()).voiceURI).not.toBe(AIKO_VOICE)
  })

  it('desde el iPhone usa Tailscale: 127.0.0.1 no responde allí', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith(AIKO_SERVERS[0])) throw new Error('no es el PC')
      return respuesta(true)
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await loadVoicePref()).voiceURI).toBe(AIKO_VOICE)
    const onend = vi.fn()
    speakWith('Primera frase larga de prueba aquí.', AIKO_VOICE, 1, { onend })
    for (let i = 0; i < 20 && onend.mock.calls.length === 0; i++) await flush()
    expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]![0]).toBe(`${AIKO_SERVERS[1]}/frase`)
  })
})
