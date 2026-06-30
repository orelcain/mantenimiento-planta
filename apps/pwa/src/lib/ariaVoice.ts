/**
 * ariaVoice — voz TTS de ARIA. Dos motores:
 *   1) Navegador (Web Speech API) — voces del SO, funciona para todos.
 *   2) Piper local — servidor http://localhost:8008 (solo donde corra), voces .onnx.
 *
 * La voz/velocidad se define en Configuración → ARIA. voiceURI con prefijo
 * "piper:" usa el servidor local; cualquier otro valor usa el navegador.
 * ARIA es mujer: se excluyen voces masculinas en ambos motores.
 */
import { getAriaConfig } from '@/services/ariaThinkingTracker'
import { normalizeForSpeech, plainForSpeech, splitForTTS } from '@/lib/speechNormalize'

export interface VoicePref {
  voiceURI?: string
  rate: number
}

export const PIPER_SERVER = 'http://localhost:8008'
const PIPER_PREFIX = 'piper:'
const GCLOUD_PREFIX = 'gcloud:'
// Clave para Google Cloud TTS (reusa la de Gemini si no hay una dedicada).
const GOOGLE_TTS_KEY =
  (import.meta.env.VITE_GOOGLE_TTS_API_KEY as string | undefined) ||
  (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
  ''

let pref: VoicePref = { rate: 1.0 }
let currentAudio: HTMLAudioElement | null = null
// Secuencia de habla: cada speak()/stopSpeaking() la incrementa. La cadena de frases
// en curso compara su número; si cambió, abandona (la superó otra orden o un stop).
let speakSeq = 0

// Voz neuronal por defecto de ARIA en producción (Google Cloud, español latino, femenina).
// Elegida por Orel comparando contra la voz local Chatterbox: Chirp-HD-F a 0.96 (enérgica
// pero calmada, pega con el avatar joven). Se usa cuando hay key de Google TTS y el admin
// no eligió explícitamente otra voz cloud/local. Cambiable en Configuración → ARIA sin deploy.
// (Alternativa que Orel valoró: gcloud:es-US-Neural2-A a 1.08 — más suave.)
const DEFAULT_GCLOUD_VOICE = 'gcloud:es-US-Chirp-HD-F'
const DEFAULT_GCLOUD_RATE = 0.96

/**
 * Voces curadas que se ofrecen en Configuración → ARIA. Cada una con su velocidad
 * recomendada (se aplica al elegirla). La primera es la recomendada/por defecto.
 * Se acotó a estas dos tras la comparación de Orel (el resto del catálogo Google se
 * dejó fuera para no saturar el selector).
 */
export const ARIA_VOICE_OPTIONS: { uri: string; label: string; rate: number }[] = [
  { uri: 'gcloud:es-US-Chirp-HD-F', label: 'ARIA · Chirp-HD-F — recomendada (es-US)', rate: 0.96 },
  { uri: 'gcloud:es-US-Neural2-A', label: 'ARIA · Neural2-A — alternativa, más suave (es-US)', rate: 1.08 },
]

// Voz local Chatterbox = la voz clonada elegida para ARIA (ref_clip4_voz). Corre en el
// stack local (GPU, :8801) y se reproduce con <audio> (GET, sin CORS). Si está arriba se
// prefiere; si no, cae a Google neuronal y luego al navegador.
const CHATTERBOX_PREFIX = 'chatterbox:'
export const CHATTERBOX_SERVER = 'http://127.0.0.1:8801'
export function isChatterboxVoice(uri?: string): boolean {
  return !!uri && uri.startsWith(CHATTERBOX_PREFIX)
}
async function isChatterboxUp(): Promise<boolean> {
  try {
    const r = await fetch(`${CHATTERBOX_SERVER}/health`, { signal: AbortSignal.timeout(1200) })
    return r.ok
  } catch {
    return false
  }
}

// ── Estado "hablando" (para el avatar de video) ─────────────────────
// El motor por defecto (Web Speech API) no expone un stream de audio analizable,
// así que el avatar engancha aquí: notificamos true al empezar a hablar (cualquier
// motor) y false al terminar/cancelar. Cubre los 3 motores vía speakWith.
type SpeakingListener = (speaking: boolean) => void
const speakingListeners = new Set<SpeakingListener>()
/** Suscribe a cambios de "ARIA está hablando". Devuelve la función de baja. */
export function onSpeakingChange(fn: SpeakingListener): () => void {
  speakingListeners.add(fn)
  return () => { speakingListeners.delete(fn) }
}
function emitSpeaking(v: boolean): void {
  speakingListeners.forEach((fn) => {
    try { fn(v) } catch { /* un listener roto no debe cortar la voz */ }
  })
}

// ── Carga / set de la preferencia ──────────────────────────────────
export async function loadVoicePref(): Promise<VoicePref> {
  let rateFromConfig = true
  try {
    const cfg = await getAriaConfig()
    rateFromConfig = cfg.speechRate !== undefined
    pref = { voiceURI: cfg.voiceURI, rate: cfg.speechRate ?? 1.0 }
  } catch {
    rateFromConfig = false
  }
  // Preferencia automática de motor cuando el admin no eligió uno cloud/local:
  //   1) Chatterbox local (la voz elegida de ARIA) si su server está arriba
  //   2) Google Cloud neuronal por defecto (Chirp-HD-F @ 0.96) si hay key
  //   3) (si no) voz del navegador
  if (!isGcloudVoice(pref.voiceURI) && !isPiperVoice(pref.voiceURI) && !isChatterboxVoice(pref.voiceURI)) {
    if (await isChatterboxUp()) {
      pref.voiceURI = CHATTERBOX_PREFIX + 'local'
    } else if (GOOGLE_TTS_KEY) {
      pref.voiceURI = DEFAULT_GCLOUD_VOICE
      // Aplicar la velocidad por defecto de la voz elegida, salvo que el admin haya fijado una.
      if (!rateFromConfig) pref.rate = DEFAULT_GCLOUD_RATE
    }
  }
  return pref
}
export function setVoicePref(p: VoicePref): void {
  pref = { ...p, rate: p.rate || 1.0 }
}

// ── Género: ARIA es mujer (LISTA BLANCA) ────────────────────────────
// Solo se aceptan voces con nombre femenino conocido. Cualquier voz que no
// esté en la lista (incluidos todos los hombres) queda fuera por defecto.
// Cubre las voces es-* de Microsoft (todas las locales), Google y Piper.
const FEMALE_NAMES = [
  // Microsoft (por locale)
  'elena', 'sofia', 'sofía', 'catalina', 'salome', 'salomé', 'maria', 'maría',
  'belkys', 'ramona', 'andrea', 'elvira', 'helena', 'laura', 'abril', 'triana',
  'vera', 'ximena', 'teresa', 'marta', 'karla', 'dalia', 'beatriz', 'candela',
  'carlota', 'larissa', 'marina', 'nuria', 'renata', 'yolanda', 'margarita',
  'camila', 'karina', 'tania', 'lorena', 'paloma', 'valentina', 'paola',
  'estrella', 'irene', 'lia', 'lía', 'esperanza', 'monica', 'mónica', 'marisol',
  'lucia', 'lucía', 'sabina', 'noelia', 'paz', 'consuelo',
  // Genéricos
  'female', 'mujer', 'femenin', 'femal',
]
// Voces Piper femeninas (nombres tipo "es_AR-daniela-high")
const PIPER_FEMALE = ['daniela', 'claude', 'sharvard']

function isFemaleName(name: string): boolean {
  const n = name.toLowerCase()
  // Google: sus voces en español son femeninas por defecto.
  if (n.includes('google') && (n.includes('españ') || n.includes('spanish') || n.includes('es-'))) {
    return true
  }
  // Piper: nombre estructurado (es_xx-nombre-calidad) -> subcadena.
  if (/^es[_-]/.test(n)) {
    return PIPER_FEMALE.some((t) => n.includes(t))
  }
  // Microsoft/otros: coincidencia EXACTA del primer nombre, para no confundir
  // p.ej. "Elias" (hombre) con "Lia" (mujer).
  const first = (n.replace(/^microsoft\s+/, '').match(/^[a-záéíóúñ]+/) || [n])[0]
  return FEMALE_NAMES.includes(first)
}
function isMaleName(name: string): boolean {
  // Con lista blanca, "no femenina" = se descarta (cubre a los hombres).
  return !isFemaleName(name)
}

// ── Voces del navegador ─────────────────────────────────────────────
export function getSpanishVoices(femaleOnly = true): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  const es = window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('es'))
  if (!femaleOnly) return es
  const noMale = es.filter((v) => !isMaleName(v.name))
  return noMale.sort((a, b) => Number(isFemaleName(b.name)) - Number(isFemaleName(a.name)))
}
export function pickDefaultFemaleVoice(): SpeechSynthesisVoice | undefined {
  const fems = getSpanishVoices(true)
  if (fems.length === 0) return undefined
  // Prefiere voces instaladas (localService) que sí suenan en Chrome.
  const pool = fems.filter((v) => v.localService).length > 0
    ? fems.filter((v) => v.localService)
    : fems
  const byLang = (p: string) => pool.find((v) => v.lang.toLowerCase().startsWith(p))
  return byLang('es-mx') || byLang('es-419') || byLang('es-cl') || byLang('es-us') || pool[0]
}

// ── Voces Piper (servidor local) ────────────────────────────────────
/** Devuelve nombres de voces Piper femeninas con prefijo listo para guardar. */
export async function getPiperVoices(): Promise<{ uri: string; label: string }[]> {
  try {
    const r = await fetch(`${PIPER_SERVER}/voices`, { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return []
    const d = (await r.json()) as { voices?: string[] }
    return (d.voices || [])
      .filter((n) => !isMaleName(n))
      .map((n) => ({ uri: PIPER_PREFIX + n, label: `${n} (Piper local)` }))
  } catch {
    return []
  }
}
export function isPiperVoice(uri?: string): boolean {
  return !!uri && uri.startsWith(PIPER_PREFIX)
}

// ── Voces Google Cloud TTS (neuronales, para todos los usuarios) ─────
interface GVoice { name: string; languageCodes: string[]; ssmlGender: string }
let gcloudCache: { uri: string; label: string }[] | null = null

function gLang(name: string): string {
  const m = name.match(/^([a-z]{2}-[A-Z]{2})/)
  return (m && m[1]) || 'es-US'
}

/**
 * Voces Google ofrecidas en el selector: solo las CURADAS (ARIA_VOICE_OPTIONS),
 * confirmando contra la API que existen (si la key no sirve → []). El resto del
 * catálogo Google se dejó fuera a propósito para no saturar el selector.
 */
export async function getGoogleVoices(): Promise<{ uri: string; label: string }[]> {
  if (gcloudCache) return gcloudCache
  if (!GOOGLE_TTS_KEY) return []
  try {
    const r = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?key=${GOOGLE_TTS_KEY}`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (!r.ok) return []
    const d = (await r.json()) as { voices?: GVoice[] }
    const available = new Set((d.voices || []).map((v) => GCLOUD_PREFIX + v.name))
    gcloudCache = ARIA_VOICE_OPTIONS
      .filter((o) => available.has(o.uri))
      .map((o) => ({ uri: o.uri, label: o.label }))
    return gcloudCache
  } catch {
    return []
  }
}
export function isGcloudVoice(uri?: string): boolean {
  return !!uri && uri.startsWith(GCLOUD_PREFIX)
}

// ── Reproducción EN CADENA por frases (baja la latencia) ────────────
// En vez de sintetizar toda la respuesta antes de sonar (Chirp-HD-F: 5-15 s), se
// trocea por frases: se reproduce la 1ª en cuanto está (~1-2 s) y se precargan las
// siguientes mientras suena. Cada motor expone un "fetcher": frase → URL de audio.
type AudioFetcher = (sentence: string) => Promise<string>

function safeRevoke(url: string): void {
  try { URL.revokeObjectURL(url) } catch { /* ignore */ }
}

/** base64 (Google) → Blob URL, para no crear data: URLs gigantes. */
function b64ToBlobUrl(b64: string, mime: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

/** Fetcher de Google Cloud TTS: sintetiza UNA frase y devuelve su Blob URL. */
function googleFetcher(voiceName: string, rate: number): AudioFetcher {
  return async (sentence: string) => {
    const body = {
      input: { text: sentence },
      voice: { languageCode: gLang(voiceName), name: voiceName },
      audioConfig: { audioEncoding: 'MP3', speakingRate: Math.max(0.5, Math.min(2, rate)) },
    }
    const r = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )
    if (!r.ok) throw new Error(`google tts ${r.status}`)
    const d = (await r.json()) as { audioContent?: string }
    if (!d.audioContent) throw new Error('google tts vacío')
    return b64ToBlobUrl(d.audioContent, 'audio/mp3')
  }
}

/** Fetcher para servidores locales (Chatterbox/Piper) que devuelven audio por GET. */
function httpGetFetcher(makeUrl: (sentence: string) => string): AudioFetcher {
  return async (sentence: string) => {
    const r = await fetch(makeUrl(sentence))
    if (!r.ok) throw new Error(`tts ${r.status}`)
    return URL.createObjectURL(await r.blob())
  }
}

/**
 * Reproduce las frases en orden con un fetch "1 adelante" (precarga la siguiente
 * mientras suena la actual). Emite "hablando" cuando suena la 1ª frase y onend al
 * terminar todas. Si la 1ª frase falla antes de sonar nada, llama onFirstFail
 * (p.ej. Chatterbox caído → caer a Google) sin quedarse mudo.
 */
async function playChunks(
  sentences: string[],
  fetcher: AudioFetcher,
  wrapped: SpeakOpts,
  onFirstFail?: () => void,
): Promise<void> {
  const myseq = ++speakSeq
  let started = false
  let nextP: Promise<string> | null = fetcher(sentences[0]!)
  const dropPrefetch = () => { if (nextP) { void nextP.then(safeRevoke).catch(() => {}); nextP = null } }
  for (let i = 0; i < sentences.length; i++) {
    let url: string | null = null
    try { url = nextP ? await nextP : null } catch { url = null }
    if (myseq !== speakSeq) { if (url) safeRevoke(url); return }            // superado/stop
    nextP = i + 1 < sentences.length ? fetcher(sentences[i + 1]!) : null     // precarga la siguiente
    if (!url) {
      if (i === 0 && !started && onFirstFail) { dropPrefetch(); onFirstFail(); return }
      continue                                                              // salta una frase fallida del medio
    }
    await new Promise<void>((resolve) => {
      const audio = new Audio(url!)
      currentAudio = audio
      audio.onplaying = () => { if (!started) { started = true; emitSpeaking(true) } }
      audio.onended = () => { safeRevoke(url!); resolve() }
      audio.onerror = () => { safeRevoke(url!); resolve() }
      audio.play().catch(() => { safeRevoke(url!); resolve() })
    })
    if (myseq !== speakSeq) { dropPrefetch(); return }                      // stop mientras sonaba
  }
  if (myseq !== speakSeq) return
  currentAudio = null
  wrapped.onend?.()
}

/** Habla por frases con la Web Speech API (encadena utterances; arregla el corte de Chrome en textos largos). */
function speakBrowserChunks(sentences: string[], voiceURI: string | undefined, rate: number, wrapped: SpeakOpts): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) { wrapped.onerror?.(); return }
  const myseq = ++speakSeq
  const v = (voiceURI && !isPiperVoice(voiceURI))
    ? window.speechSynthesis.getVoices().find((x) => x.voiceURI === voiceURI && !isMaleName(x.name))
    : undefined
  const chosen = v || pickDefaultFemaleVoice()
  let started = false
  let idx = 0
  const next = () => {
    if (myseq !== speakSeq) return
    if (idx >= sentences.length) { wrapped.onend?.(); return }
    const u = new SpeechSynthesisUtterance(sentences[idx++]!)
    if (chosen) { u.voice = chosen; u.lang = chosen.lang } else u.lang = 'es-CL'
    u.rate = rate
    u.onstart = () => { if (!started) { started = true; emitSpeaking(true) } }
    u.onend = () => next()
    u.onerror = () => next()
    window.speechSynthesis.speak(u)
  }
  next()
}

// ── Resolución / aplicación (navegador) ─────────────────────────────
export function resolveVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined
  if (pref.voiceURI && !isPiperVoice(pref.voiceURI) && !isGcloudVoice(pref.voiceURI)) {
    const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === pref.voiceURI)
    if (match && !isMaleName(match.name)) return match
  }
  return pickDefaultFemaleVoice()
}
export function applyVoicePref(u: SpeechSynthesisUtterance): void {
  const v = resolveVoice()
  if (v) {
    u.voice = v
    u.lang = v.lang
  }
  u.rate = pref.rate || 1.0
}

// ── API unificada de habla ──────────────────────────────────────────
export function stopSpeaking(): void {
  speakSeq++ // invalida cualquier cadena de frases en curso
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  emitSpeaking(false)
}

interface SpeakOpts { onend?: () => void; onerror?: () => void }

/** Habla con una voz/velocidad explícitas (para "Probar voz"). */
export function speakWith(text: string, voiceURI: string | undefined, rate: number, opts: SpeakOpts = {}): void {
  stopSpeaking()
  text = normalizeForSpeech(plainForSpeech(text)) // 1) quita tabla/emojis/markdown 2) números/acrónimos → forma hablada
  const r = rate || 1.0
  // Troceo por frases: la 1ª suena en ~1-2 s y las demás se precargan mientras suena,
  // en vez de esperar a sintetizar toda la respuesta (con Chirp-HD-F una respuesta larga
  // tardaba 10-15 s en empezar). Engine-agnóstico: Google/Chatterbox/Piper/navegador.
  const sentences = splitForTTS(text)
  // Notificamos al avatar el FIN del habla en cualquier motor (onend/onerror). El INICIO
  // se emite cuando el audio realmente empieza a sonar (onplaying/onstart) — así la boca
  // se mueve sincronizada con la voz, no antes (Chatterbox tarda ~3s en sintetizar).
  const wrapped: SpeakOpts = {
    onend: () => { emitSpeaking(false); opts.onend?.() },
    onerror: () => { emitSpeaking(false); opts.onerror?.() },
  }
  if (isChatterboxVoice(voiceURI)) {
    const chatterbox = httpGetFetcher((s) => `${CHATTERBOX_SERVER}/tts?text=${encodeURIComponent(s)}`)
    // Si el server local cayó (1ª frase falla), no quedarse mudo: caer a la voz de Google.
    void playChunks(sentences, chatterbox, wrapped, () => {
      if (GOOGLE_TTS_KEY) void playChunks(sentences, googleFetcher(DEFAULT_GCLOUD_VOICE.slice(GCLOUD_PREFIX.length), r), wrapped)
      else wrapped.onerror?.()
    })
    return
  }
  if (isGcloudVoice(voiceURI)) {
    void playChunks(sentences, googleFetcher(voiceURI!.slice(GCLOUD_PREFIX.length), r), wrapped, () => wrapped.onerror?.())
    return
  }
  if (isPiperVoice(voiceURI)) {
    const voice = voiceURI!.slice(PIPER_PREFIX.length)
    // En Piper, length-scale alto = más lento; invertimos para que el slider
    // (mayor = más rápida) sea coherente con el navegador.
    const lengthScale = Math.max(0.5, Math.min(2, 1 / r))
    const piper = httpGetFetcher(
      (s) => `${PIPER_SERVER}/tts?text=${encodeURIComponent(s)}&voice=${encodeURIComponent(voice)}&rate=${lengthScale.toFixed(2)}`,
    )
    void playChunks(sentences, piper, wrapped, () => wrapped.onerror?.())
    return
  }
  speakBrowserChunks(sentences, voiceURI, r, wrapped)
}

/** Habla con la preferencia guardada (usado por el ChatBot). */
export function speak(text: string, opts: SpeakOpts = {}): void {
  speakWith(text, pref.voiceURI, pref.rate, opts)
}
