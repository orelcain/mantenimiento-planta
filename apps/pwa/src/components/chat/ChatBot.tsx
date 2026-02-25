/**
 * Componente ChatBot — v3 JARVIS
 * Burbuja flotante con streaming, voz, acciones ejecutables (crear incidencias),
 * confirmación inline y tamaño ampliado
 */
import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Send, Trash2, Loader2, Bot, User, Mic, MicOff, ExternalLink, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { useChatBot } from '@/hooks/useChatBot'
import type { ChatMessage, ChatAction } from '@/services/chatbot'

// ─── Formateador de markdown básico ────────────────────────────────
function formatMessage(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
    .replace(/\n/g, '<br/>')
    .replace(/<br\/>• /g, '<br/>&#8226; ')
    .replace(/<br\/>- /g, '<br/>&#8211; ')
}

// ─── Botones de acción ──────────────────────────────────────────────
function ActionButtons({ actions, onNavigate }: { actions: ChatAction[]; onNavigate: (route: string) => void }) {
  if (!actions.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {actions.map(action => (
        <button
          key={action.route}
          onClick={() => onNavigate(action.route)}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {action.label}
        </button>
      ))}
    </div>
  )
}

// ─── Burbuja de mensaje ─────────────────────────────────────────────
function MessageBubble({ msg, onNavigate }: { msg: ChatMessage; onNavigate: (route: string) => void }) {
  const isUser = msg.role === 'user'

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
      }`}>
        <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
        {msg.actions && <ActionButtons actions={msg.actions} onNavigate={onNavigate} />}
        <div className={`text-[10px] mt-1 ${
          isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
        }`}>
          {msg.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// ─── Burbuja de streaming ───────────────────────────────────────────
function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-2 flex-row">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-muted text-foreground">
        <div dangerouslySetInnerHTML={{ __html: formatMessage(content) }} />
        <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
      </div>
    </div>
  )
}

// ─── Indicador de "consultando datos" ───────────────────────────────
function LoadingIndicator() {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div className="bg-muted rounded-lg px-3 py-2 flex gap-1.5 items-center">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Consultando datos de la planta...</span>
      </div>
    </div>
  )
}

// ─── Sugerencias rápidas ────────────────────────────────────────────
const QUICK_SUGGESTIONS = [
  '🔧 Reportar una falla',
  '¿Incidencias abiertas?',
  '¿Qué repuestos tenemos?',
  '¿Estado de los equipos?',
  '📊 Resumen de la planta',
  '¿Incidencias críticas?',
]

function QuickSuggestions({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-border bg-muted/30">
      <span className="w-full text-[10px] text-muted-foreground mb-0.5">Sugerencias rápidas:</span>
      {QUICK_SUGGESTIONS.map(suggestion => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="text-xs px-2.5 py-1.5 rounded-full border border-border bg-background hover:bg-muted transition-colors text-foreground"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}

// ─── Hook de reconocimiento de voz ──────────────────────────────────
function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<any>(null)

  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startListening = useCallback(() => {
    if (!isSupported) return

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'es-CL'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += t
        }
      }
      if (finalTranscript) {
        setTranscript(finalTranscript)
      }
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setTranscript('')
  }, [isSupported])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  return { isListening, transcript, startListening, stopListening, isSupported }
}

// ─── Barra de acción pendiente ──────────────────────────────────────
function PendingActionBar({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <span className="text-xs text-amber-800 dark:text-amber-300 flex-1">Acción pendiente de confirmación</span>
      <button
        onClick={onConfirm}
        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors font-medium"
      >
        <CheckCircle className="w-3 h-3" />
        Confirmar
      </button>
      <button
        onClick={onCancel}
        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
      >
        <XCircle className="w-3 h-3" />
        Cancelar
      </button>
    </div>
  )
}

// ─── Componente principal ───────────────────────────────────────────
export function ChatBot() {
  const navigate = useNavigate()
  const {
    messages,
    isLoading,
    isOpen,
    hasUnread,
    streamingContent,
    pendingAction,
    toggle,
    sendMessage,
    clearHistory,
  } = useChatBot()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { isListening, transcript, startListening, stopListening, isSupported: voiceSupported } = useSpeechRecognition()

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, streamingContent])

  // Focus input al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen])

  // Llenar input cuando termina la transcripción de voz
  useEffect(() => {
    if (transcript && !isListening) {
      setInput(prev => prev ? `${prev} ${transcript}` : transcript)
    }
  }, [transcript, isListening])

  const handleSend = () => {
    if (!input.trim() || isLoading) return
    sendMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleQuickSelect = (text: string) => {
    sendMessage(text)
  }

  const handleNavigate = (route: string) => {
    navigate(route)
    toggle() // cerrar chat al navegar
  }

  const handleConfirmAction = () => {
    sendMessage('Sí, crear la incidencia')
  }

  const handleCancelAction = () => {
    sendMessage('No, cancelar')
  }

  // 380 * 1.4 ≈ 532px ancho | 520 * 1.3 ≈ 676px alto
  return (
    <>
      {/* Panel de chat */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 w-[532px] max-w-[calc(100vw-2rem)] h-[676px] max-h-[calc(100vh-6rem)] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">JARVIS — Asistente de Planta</h3>
                <p className="text-[10px] text-muted-foreground">
                  {pendingAction?.status === 'confirming' ? '⚡ Acción pendiente de confirmación' : 'IA · Datos en tiempo real'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                title="Limpiar historial"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={toggle}
                className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} onNavigate={handleNavigate} />
            ))}
            {/* Streaming: mostrar respuesta parcial */}
            {streamingContent && <StreamingBubble content={streamingContent} />}
            {/* Loading: solo si no hay streaming aún */}
            {isLoading && !streamingContent && <LoadingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugerencias rápidas */}
          {messages.length <= 1 && !isLoading && (
            <QuickSuggestions onSelect={handleQuickSelect} />
          )}

          {/* Barra de acción pendiente */}
          {pendingAction?.status === 'confirming' && !isLoading && (
            <PendingActionBar onConfirm={handleConfirmAction} onCancel={handleCancelAction} />
          )}

          {/* Input */}
          <div className="border-t border-border px-3 py-2 bg-background">
            <div className="flex items-center gap-2">
              {/* Botón de voz */}
              {voiceSupported && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isLoading}
                  className={`p-2 rounded-lg transition-colors ${
                    isListening
                      ? 'bg-destructive text-destructive-foreground animate-pulse'
                      : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  } disabled:opacity-50`}
                  title={isListening ? 'Detener grabación' : 'Hablar'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Escuchando...' : pendingAction?.status === 'confirming' ? 'Sí / No / Modificar...' : 'Pregunta o describe una falla...'}
                disabled={isLoading}
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 placeholder:text-muted-foreground"
              />

              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Enviar"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              JARVIS v4 · Powered by Groq AI · Acciones en tiempo real
            </p>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={toggle}
        className={`fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${
          isOpen
            ? 'bg-muted text-muted-foreground hover:bg-muted/80'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
        title={isOpen ? 'Cerrar chat' : 'Abrir asistente'}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <MessageCircle className="w-6 h-6" />
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-destructive rounded-full border-2 border-background" />
            )}
          </>
        )}
      </button>
    </>
  )
}
