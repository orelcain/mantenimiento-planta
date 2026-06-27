/**
 * Transcripción de audio con Groq Whisper large-v3 vía Cloud Function `whisperProxy`.
 * Mucho más precisa que la Web Speech API del navegador para español chileno +
 * vocabulario técnico de planta. La API key vive en el servidor (secret).
 */
import { httpsCallable, getFunctions } from 'firebase/functions'
import app from '@/services/firebase'

/**
 * Prompt de contexto que sesga a Whisper hacia el vocabulario correcto de
 * mantención industrial de la planta (mejora nombres de equipos y términos
 * técnicos que un ASR genérico suele errar).
 */
export const PLANTA_VOCAB_PROMPT =
  'Reporte de mantención industrial en planta procesadora de salmón. ' +
  'Vocabulario: rodamiento, chumacera, sello mecánico, bomba centrífuga, motor, ' +
  'variador de frecuencia, válvula, correa, cadena, reductor, compresor, evaporador, ' +
  'condensador, amoníaco, freón, tablero eléctrico, contactor, breaker, fusible, ' +
  'termografía, vibración, fuga, sobrecalentamiento, Baader, eviscerado, fileteadora, ' +
  'grader, Marelec, enzunchadora, glaseador, empacadora, acopio, riles, agua de mar.'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result) // descartar el prefijo data:...;base64,
    }
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el audio'))
    reader.readAsDataURL(blob)
  })
}

export interface TranscribeOptions {
  language?: string
  prompt?: string
}

/** Transcribe un blob de audio (MediaRecorder) y devuelve el texto. */
export async function transcribeAudioBlob(blob: Blob, opts?: TranscribeOptions): Promise<string> {
  const audioBase64 = await blobToBase64(blob)
  if (!audioBase64) return ''
  const fn = httpsCallable<
    { audioBase64: string; mimeType: string; language: string; prompt: string },
    { text: string }
  >(getFunctions(app), 'whisperProxy')
  const res = await fn({
    audioBase64,
    mimeType: blob.type || 'audio/webm',
    language: opts?.language ?? 'es',
    prompt: opts?.prompt ?? PLANTA_VOCAB_PROMPT,
  })
  return (res.data?.text ?? '').trim()
}
