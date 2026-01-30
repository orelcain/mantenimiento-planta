/**
 * Hook para captura de voz usando Web Speech API
 * Soporta transcripción en tiempo real
 */

import { useState, useCallback, useRef } from 'react'

const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const isSupported = !!SpeechRecognition
  const recognitionRef = useRef<any>(null)

  const startListening = useCallback(() => {
    if (!isSupported) {
      console.error('Speech Recognition no es soportado en este navegador')
      return
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'es-ES'

      recognitionRef.current.onstart = () => {
        setIsListening(true)
        setTranscript('')
      }

      recognitionRef.current.onresult = (event: any) => {
        let interim = ''
        let final = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript

          if (event.results[i].isFinal) {
            final += transcript + ' '
          } else {
            interim += transcript
          }
        }

        setTranscript(final || interim)
      }

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech Recognition error:', event.error)
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }

    recognitionRef.current.start()
  }, [isSupported])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
  }, [])

  return {
    transcript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  }
}
