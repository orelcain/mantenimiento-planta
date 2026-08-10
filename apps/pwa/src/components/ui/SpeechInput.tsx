import * as React from 'react'
import { Mic, StopCircle } from 'lucide-react'
import { Input, InputProps } from './input'
import { Button } from './button'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'


export interface SpeechInputProps extends InputProps {}

const SpeechInput = React.forwardRef<HTMLInputElement, SpeechInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const [isListening, setIsListening] = React.useState(false)
    const [isSupported, setIsSupported] = React.useState(true)
    const recognitionRef = React.useRef<SpeechRecognition | null>(null)
    const innerRef = React.useRef<HTMLInputElement>(null)

    // Sincronizar ref externa
    React.useImperativeHandle(ref, () => innerRef.current!)

    const handleTranscript = React.useCallback((text: string) => {
      const currentValue = String(value || '')
      const newValue = currentValue.trim()
        ? `${currentValue} ${text}`
        : text

      const event = {
        target: { value: newValue, name: props.name },
        currentTarget: { value: newValue, name: props.name }
      } as React.ChangeEvent<HTMLInputElement>

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
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'es-ES'

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let newText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]!
          if (result.isFinal) {
            newText += result[0]!.transcript + ' '
          }
        }
        
        if (newText) {
          handleTranscript(newText.trim())
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        logger.error('Error de reconocimiento de voz', new Error(String(event.error)))
        setIsListening(false)
        if (event.error === 'not-allowed') {
            // Toast or alert handled by parent ideally, but alert is consistent with SpeechTextarea
            // alert('Permiso de micrófono denegado.')
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
    }, [handleTranscript])

    const toggleListening = (e: React.MouseEvent) => {
      e.preventDefault()
      if (!recognitionRef.current) return

      if (isListening) {
        try {
          recognitionRef.current.stop()
        } catch {
          // Ignorar si ya estaba detenido
        }
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

    return (
      <div className="relative w-full">
        <Input
          ref={innerRef}
          value={value}
          onChange={onChange}
          className={cn("pr-12", className)}
          {...props}
        />
        {isSupported && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "absolute right-2 top-1 h-8 w-8 p-0 rounded-full",
              isListening 
                ? "bg-red-500/[0.15] text-red-600 hover:bg-red-500/[0.15] hover:text-ink-crit animate-pulse" 
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
SpeechInput.displayName = 'SpeechInput'

export { SpeechInput }
