/**
 * useWhisperDictation — dictado por voz preciso vía grabación + Groq Whisper.
 *
 * Reemplaza a la Web Speech API (imprecisa en es-CL + términos técnicos):
 * graba audio real con MediaRecorder y lo transcribe en el servidor.
 * El consumidor pasa `onText` (que se llama con el texto reconocido) y, si el
 * navegador no soporta grabación, debe caer a un fallback (p.ej. Web Speech).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudioBlob, type TranscribeOptions } from '@/services/transcription'
import { logger } from '@/lib/logger'

export interface UseWhisperDictation {
  isRecording: boolean
  isTranscribing: boolean
  supported: boolean
  error: string | null
  toggle: () => void
}

/** Tamaño mínimo del blob para intentar transcribir (evita taps accidentales). */
const MIN_BLOB_BYTES = 1500

export function useWhisperDictation(
  onText: (text: string) => void,
  opts?: TranscribeOptions,
): UseWhisperDictation {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const onTextRef = useRef(onText)
  const optsRef = useRef(opts)
  onTextRef.current = onText
  optsRef.current = opts

  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Limpieza al desmontar (no dejar el micrófono abierto).
  useEffect(() => () => {
    try { recorderRef.current?.stop() } catch { /* noop */ }
    stopTracks()
  }, [stopTracks])

  const start = useCallback(async () => {
    if (!supported) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)

      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stopTracks()
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size < MIN_BLOB_BYTES) return // grabación demasiado corta → ignorar
        setIsTranscribing(true)
        try {
          const text = await transcribeAudioBlob(blob, optsRef.current)
          if (text) onTextRef.current(text)
          else setError('No se reconoció voz. Intentá de nuevo.')
        } catch (err) {
          logger.error('Error transcribiendo audio', err instanceof Error ? err : new Error(String(err)))
          setError('No se pudo transcribir. Revisá tu conexión.')
        } finally {
          setIsTranscribing(false)
        }
      }

      recorderRef.current = rec
      rec.start()
      setIsRecording(true)
    } catch (err) {
      logger.error('No se pudo acceder al micrófono', err instanceof Error ? err : new Error(String(err)))
      setError('Permiso de micrófono denegado o no disponible.')
      setIsRecording(false)
      stopTracks()
    }
  }, [supported, stopTracks])

  const stop = useCallback(() => {
    setIsRecording(false)
    try { recorderRef.current?.stop() } catch { /* noop */ }
  }, [])

  const toggle = useCallback(() => {
    if (isRecording) stop()
    else void start()
  }, [isRecording, start, stop])

  return { isRecording, isTranscribing, supported, error, toggle }
}
