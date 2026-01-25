import * as React from 'react'
import { Mic, MicOff } from 'lucide-react'
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

    React.useEffect(() => {
      if (typeof window === 'undefined') return

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) {
        setIsSupported(false)
        return
      }

      const recognition = new SpeechRecognition()
      recognition.continuous = false // Para móviles es mejor false y dictar frases cortas
      recognition.interimResults = false
      recognition.lang = 'es-ES'

      recognition.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1]
        if (lastResult.isFinal) {
          const transcript = lastResult[0].transcript
          handleTranscript(transcript)
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
    }, [])

    const handleTranscript = (text: string) => {
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
    }

    const toggleListening = (e: React.MouseEvent) => {
      e.preventDefault() // Evitar submit del form
      if (!recognitionRef.current) return

      if (isListening) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
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
          ref={ref}
          value={value}
          onChange={onChange}
          className={cn("pr-12", className)} // Espacio para el botón
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
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}
      </div>
    )
  }
)
SpeechTextarea.displayName = 'SpeechTextarea'

export { SpeechTextarea }
