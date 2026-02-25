/**
 * Componente ChatBot — burbuja flotante con panel de chat
 */
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { MessageCircle, X, Send, Trash2, Loader2, Bot, User } from 'lucide-react'
import { useChatBot } from '@/hooks/useChatBot'
import type { ChatMessage } from '@/services/chatbot'

// ─── Formateador de markdown básico ────────────────────────────────
function formatMessage(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
    // Line breaks
    .replace(/\n/g, '<br/>')
    // List items
    .replace(/<br\/>• /g, '<br/>&#8226; ')
    .replace(/<br\/>- /g, '<br/>&#8211; ')
}

// ─── Burbuja de mensaje ─────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground'
      }`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      {/* Mensaje */}
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-foreground'
      }`}>
        <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
        <div className={`text-[10px] mt-1 ${
          isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
        }`}>
          {msg.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// ─── Indicador de "escribiendo" ─────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div className="bg-muted rounded-lg px-3 py-2 flex gap-1 items-center">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Consultando datos...</span>
      </div>
    </div>
  )
}

// ─── Sugerencias rápidas ────────────────────────────────────────────
const QUICK_SUGGESTIONS = [
  '¿Cuántas incidencias abiertas hay?',
  '¿Qué repuestos tenemos?',
  '¿Cuál es el estado de los equipos?',
  'Dame un resumen de la planta',
]

function QuickSuggestions({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2">
      {QUICK_SUGGESTIONS.map((suggestion) => (
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

// ─── Componente principal ───────────────────────────────────────────
export function ChatBot() {
  const {
    messages,
    isLoading,
    isOpen,
    hasUnread,
    toggle,
    sendMessage,
    clearHistory,
  } = useChatBot()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll al final cuando hay nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen])

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

  return (
    <>
      {/* Panel de chat */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Asistente de Planta</h3>
                <p className="text-[10px] text-muted-foreground">Consulta datos en tiempo real</p>
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
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugerencias rápidas (solo si hay pocos mensajes) */}
          {messages.length <= 1 && !isLoading && (
            <QuickSuggestions onSelect={handleQuickSelect} />
          )}

          {/* Input */}
          <div className="border-t border-border px-3 py-2 bg-background">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pregunta algo sobre la planta..."
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
              Powered by Groq AI · Datos en tiempo real de Firestore
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
