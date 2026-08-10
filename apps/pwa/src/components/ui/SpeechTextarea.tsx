import * as React from 'react'
import { Mic, StopCircle, Loader2 } from 'lucide-react'
import { Textarea, TextareaProps } from './textarea'
import { Button } from './button'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { useWhisperDictation } from '@/hooks/useWhisperDictation'


export interface SpeechTextareaProps extends TextareaProps {}

const SpeechTextarea = React.forwardRef<HTMLTextAreaElement, SpeechTextareaProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const [isListening, setIsListening] = React.useState(false)        // Web Speech (fallback)
    const [webSpeechSupported, setWebSpeechSupported] = React.useState(false)
    const recognitionRef = React.useRef<SpeechRecognition | null>(null)
    const innerRef = React.useRef<HTMLTextAreaElement>(null)

    // Sincronizar ref externa
    React.useImperativeHandle(ref, () => innerRef.current!)

    // Refs estables para que el appender no se recree en cada cambio de `value`.
    const valueRef = React.useRef(value)
    const onChangeRef = React.useRef(onChange)
    const nameRef = React.useRef(props.name)
    valueRef.current = value
    onChangeRef.current = onChange
    nameRef.current = props.name

    // Auto-ajuste de altura (al cambiar valor externamente, ej: AI)
    React.useEffect(() => {
      const textarea = innerRef.current
      if (textarea) {
        textarea.style.height = 'auto'
        textarea.style.height = `${textarea.scrollHeight}px`
      }
    }, [value])

    // Agrega texto reconocido al valor actual (sintetiza un onChange compatible con React).
    const appendText = React.useCallback((text: string) => {
      const current = String(valueRef.current || '')
      const newValue = current.trim() ? `${current} ${text}` : text
      const event = {
        target: { value: newValue, name: nameRef.current },
        currentTarget: { value: newValue, name: nameRef.current },
      } as React.ChangeEvent<HTMLTextAreaElement>
      onChangeRef.current?.(event)
    }, [])

    // ── Dictado preciso: grabación + Groq Whisper (preferido) ──
    const whisper = useWhisperDictation(appendText)

    // ── Web Speech API (fallback si el navegador no soporta grabación/Whisper) ──
    React.useEffect(() => {
      if (typeof window === 'undefined') return
      if (whisper.supported) return // Whisper preferido → no montar Web Speech

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) {
        setWebSpeechSupported(false)
        return
      }
      setWebSpeechSupported(true)

      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'es-CL' // español de Chile (antes es-ES)

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let newText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]!
          if (result.isFinal) newText += result[0]!.transcript + ' '
        }
        if (newText) appendText(newText.trim())
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        logger.error('Error de reconocimiento de voz', new Error(event.error))
        setIsListening(false)
        if (event.error === 'not-allowed') {
          alert('Permiso de micrófono denegado. Por favor actívalo en la configuración.')
        }
      }

      recognition.onend = () => setIsListening(false)
      recognitionRef.current = recognition
    }, [appendText, whisper.supported])

    const toggleWebSpeech = () => {
      if (!recognitionRef.current) return
      if (isListening) {
        try { recognitionRef.current.stop() } catch { /* ya detenido */ }
        setIsListening(false)
      } else {
        try {
          recognitionRef.current.start()
          setIsListening(true)
        } catch (err) {
          logger.error('No se pudo iniciar el dictado', err instanceof Error ? err : new Error(String(err)))
          setIsListening(false)
        }
      }
    }

    const useWhisper = whisper.supported
    const showButton = useWhisper || webSpeechSupported
    const busy = whisper.isTranscribing
    const active = useWhisper ? whisper.isRecording : isListening

    const handleMicClick = (e: React.MouseEvent) => {
      e.preventDefault() // Evitar submit del form
      if (busy) return
      if (useWhisper) whisper.toggle()
      else toggleWebSpeech()
    }

    return (
      <div className="relative">
        <Textarea
          ref={innerRef}
          value={value}
          onChange={(e) => {
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
            onChange?.(e)
          }}
          className={cn("pr-12 resize-none overflow-hidden", className)}
          {...props}
        />
        {showButton && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "absolute right-2 top-2 h-8 w-8 p-0 rounded-full",
              busy
                ? "text-ink-info"
                : active
                ? "bg-red-500/[0.15] text-red-600 hover:bg-red-500/[0.15] hover:text-ink-crit animate-pulse"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={handleMicClick}
            disabled={busy}
            title={
              busy
                ? "Transcribiendo…"
                : active
                ? (useWhisper ? "Detener y transcribir" : "Detener dictado")
                : whisper.error || (useWhisper ? "Grabar y transcribir por voz" : "Dictar por voz")
            }
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : active ? (
              <StopCircle className="h-4 w-4 animate-pulse fill-current" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    )
  }
)
SpeechTextarea.displayName = 'SpeechTextarea'

export { SpeechTextarea }
