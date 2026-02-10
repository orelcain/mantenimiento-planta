import * as React from 'react'
import { Mic, StopCircle } from 'lucide-react'
import { Textarea, TextareaProps } from './textarea'
import { Button } from './button'
import { cn } from '@/lib/utils'

// Definición básica de tipos para Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: (event: any) => void
  onerror: (event: any) => void
  onend: () => void
}

declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export interface SpeechTextareaProps extends TextareaProps {}

const SpeechTextarea = React.forwardRef<HTMLTextAreaElement, SpeechTextareaProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const [isListening, setIsListening] = React.useState(false)
    const [isSupported, setIsSupported] = React.useState(true)
    const recognitionRef = React.useRef<SpeechRecognition | null>(null)
    const innerRef = React.useRef<HTMLTextAreaElement>(null)

    // Sincronizar ref externa
    React.useImperativeHandle(ref, () => innerRef.current!)

    // Auto-ajuste de altura (al cambiar valor externamente, ej: AI)
    React.useEffect(() => {
      const textarea = innerRef.current
      if (textarea) {
        textarea.style.height = 'auto'
        textarea.style.height = `${textarea.scrollHeight}px`
      }
    }, [value])

    const handleTranscript = React.useCallback((text: string) => {
      const currentValue = String(value || '')
      // Concatenar con un espacio si no está vacío
      const newValue = currentValue.trim()
        ? `${currentValue} ${text}`
        : text

      // Crear evento sintético compatible con React
      const event = {
        target: { value: newValue, name: props.name },
        currentTarget: { value: newValue, name: props.name }
      } as React.ChangeEvent<HTMLTextAreaElement>

      onChange?.(event)
    }, [value, onChange, props.name])

    React.useEffect(() => {
      if (typeof window === 'undefined') return

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) {
        setIsSupported(false)
        return
      }

      const recognition = new SpeechRecognition()
      recognition.continuous = true // Permitir dictado continuo hasta que el usuario pare
      recognition.interimResults = true // Necesario para que Android no cierre prematuramente
      recognition.lang = 'es-ES'

      recognition.onresult = (event: any) => {
        let newText = ''
        // Iterar solo sobre los nuevos resultados
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            newText += result[0].transcript + ' '
          }
        }
        
        if (newText) {
          handleTranscript(newText.trim())
        }
      }

      recognition.onerror = (event: any) => {
        console.error('Error de reconocimiento de voz:', event.error)
        setIsListening(false)
        if (event.error === 'not-allowed') {
          alert('Permiso de micrófono denegado. Por favor actívalo en la configuración.')
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
    }, [handleTranscript])

    const toggleListening = (e: React.MouseEvent) => {
      e.preventDefault() // Evitar submit del form
      if (!recognitionRef.current) return

      if (isListening) {
        try {
          recognitionRef.current.stop()
        } catch {
          // Ignorar error si ya estaba detenido
        }
        setIsListening(false)
      } else {
        try {
          recognitionRef.current.start()
          setIsListening(true)
        } catch (err) {
          console.error('No se pudo iniciar el dictado:', err)
          setIsListening(false)
        }
      }
    }

    return (
      <div className="relative">
        <Textarea
          ref={innerRef}
          value={value}
          onChange={(e) => {
            // Ajuste inmediato al escribir
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
            onChange?.(e)
          }}
          className={cn("pr-12 resize-none overflow-hidden", className)}
          {...props}
        />
        {isSupported && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "absolute right-2 top-2 h-8 w-8 p-0 rounded-full",
              isListening 
                ? "bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 animate-pulse" 
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={toggleListening}
            title={isListening ? "Detener dictado" : "Dictar por voz"}
          >
            {isListening ? (
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
