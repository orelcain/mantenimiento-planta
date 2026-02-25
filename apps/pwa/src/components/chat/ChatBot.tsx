/**
 * Componente ChatBot — v4 ARIA
 * Burbuja flotante con streaming, voz, fotos, acciones ejecutables,
 * confirmación inline, auto-asignación y tamaño ampliado
 */
import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Send, Trash2, Loader2, Bot, User, Mic, MicOff, ExternalLink, AlertTriangle, CheckCircle, XCircle, Camera, GripVertical, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useChatBot } from '@/hooks/useChatBot'
import type { ChatMessage, ChatAction } from '@/services/chatbot'
import { saveFeedback } from '@/services/ariaLearning'

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

// ─── Preview de foto en chat ────────────────────────────────────────
function PhotoPreview({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative inline-block mr-2 mb-2">
      <img 
        src={src} 
        alt="Preview" 
        className="w-20 h-20 object-cover rounded-lg border border-border"
      />
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs shadow"
      >
        ×
      </button>
    </div>
  )
}

// ─── Imagen inline en burbuja ───────────────────────────────────────
function MessagePhotos({ urls }: { urls: string[] }) {
  if (!urls.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {urls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
          <img 
            src={url} 
            alt={`Foto ${i + 1}`}
            className="w-24 h-24 object-cover rounded-md border border-border hover:opacity-80 transition-opacity cursor-pointer" 
          />
        </a>
      ))}
    </div>
  )
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
function MessageBubble({
  msg,
  onNavigate,
  onFeedback,
}: {
  msg: ChatMessage
  onNavigate: (route: string) => void
  onFeedback?: (msgId: string, rating: 'positive' | 'negative') => void
}) {
  const isUser = msg.role === 'user'
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null)

  const handleFeedback = (rating: 'positive' | 'negative') => {
    if (feedbackGiven) return // Ya se dio feedback
    setFeedbackGiven(rating)
    onFeedback?.(msg.id, rating)
  }

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
        {msg.photoUrls && msg.photoUrls.length > 0 && <MessagePhotos urls={msg.photoUrls} />}
        {msg.actions && <ActionButtons actions={msg.actions} onNavigate={onNavigate} />}
        <div className={`flex items-center justify-between mt-1 ${
          isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
        }`}>
          <span className="text-[10px]">
            {msg.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {/* Feedback thumbs — solo en mensajes de ARIA (no welcome ni errores cortos) */}
          {!isUser && msg.id !== 'welcome' && msg.content.length > 30 && (
            <div className="flex items-center gap-0.5 ml-2">
              {feedbackGiven ? (
                <span className="text-[10px]">
                  {feedbackGiven === 'positive' ? '✓ Útil' : '✓ Registrado'}
                </span>
              ) : (
                <>
                  <button
                    onClick={() => handleFeedback('positive')}
                    className="p-0.5 rounded hover:bg-background/50 transition-colors"
                    title="Respuesta útil"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleFeedback('negative')}
                    className="p-0.5 rounded hover:bg-background/50 transition-colors"
                    title="Respuesta no útil"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          )}
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
  '📋 Historial de ARIA',
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
    userId,
    toggle,
    sendMessage,
    clearHistory,
  } = useChatBot()

  const [input, setInput] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ─── Chat width (resizable) ──────────────────────────────
  const MIN_WIDTH = 380
  const MAX_WIDTH = 900
  const DEFAULT_WIDTH = 532

  const [chatWidth, setChatWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('aria_chat_width')
      if (saved) {
        const w = parseInt(saved, 10)
        if (w >= MIN_WIDTH && w <= MAX_WIDTH) return w
      }
    } catch { /* ignore */ }
    return DEFAULT_WIDTH
  })
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(DEFAULT_WIDTH)

  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = chatWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      if (!isResizingRef.current) return
      // Dragging LEFT edge: moving left = wider, moving right = narrower
      const delta = startXRef.current - ev.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta))
      setChatWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      // Persist
      try { localStorage.setItem('aria_chat_width', String(chatWidth)) } catch { /* ignore */ }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [chatWidth])

  // Persist width changes
  useEffect(() => {
    try { localStorage.setItem('aria_chat_width', String(chatWidth)) } catch { /* ignore */ }
  }, [chatWidth])

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

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      photoPreviews.forEach(url => URL.revokeObjectURL(url))
    }
  }, [photoPreviews])

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const maxPhotos = 3
    const newFiles = Array.from(files).slice(0, maxPhotos - photoFiles.length)
    if (newFiles.length === 0) return
    
    const previews = newFiles.map(f => URL.createObjectURL(f))
    setPhotoFiles(prev => [...prev, ...newFiles])
    setPhotoPreviews(prev => [...prev, ...previews])
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    const url = photoPreviews[index]
    if (url) URL.revokeObjectURL(url)
    setPhotoFiles(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSend = () => {
    if ((!input.trim() && photoFiles.length === 0) || isLoading) return
    sendMessage(input.trim(), photoFiles.length > 0 ? photoFiles : undefined)
    setInput('')
    // Clean up photo previews
    photoPreviews.forEach(url => URL.revokeObjectURL(url))
    setPhotoFiles([])
    setPhotoPreviews([])
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

  const handleFeedback = useCallback((messageId: string, rating: 'positive' | 'negative') => {
    if (!userId) return
    // Encontrar el mensaje y el query del usuario anterior
    const msgIdx = messages.findIndex(m => m.id === messageId)
    const ariaMsg = messages[msgIdx]
    const userMsg = messages.slice(0, msgIdx).reverse().find(m => m.role === 'user')

    saveFeedback({
      messageId,
      userId,
      userQuery: userMsg?.content || '',
      ariaResponse: ariaMsg?.content || '',
      rating,
      intents: [],
    }).catch(() => { /* non-blocking */ })
  }, [messages, userId])

  // 380 * 1.4 ≈ 532px ancho | 520 * 1.3 ≈ 676px alto
  return (
    <>
      {/* Panel de chat */}
      {isOpen && (
        <div
          style={{ width: chatWidth }}
          className="fixed bottom-20 right-4 z-50 max-w-[calc(100vw-2rem)] h-[676px] max-h-[calc(100vh-6rem)] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
        >
          {/* Resize handle (left edge) */}
          <div
            onMouseDown={handleResizeStart}
            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-10 group flex items-center"
            title="Arrastrar para redimensionar"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary/20 rounded-r px-px py-6">
              <GripVertical className="w-3 h-3 text-primary/60" />
            </div>
          </div>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">ARIA — Asistente de Planta</h3>
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
              <MessageBubble key={msg.id} msg={msg} onNavigate={handleNavigate} onFeedback={handleFeedback} />
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
            {/* Photo previews */}
            {photoPreviews.length > 0 && (
              <div className="flex flex-wrap mb-2">
                {photoPreviews.map((src, i) => (
                  <PhotoPreview key={i} src={src} onRemove={() => removePhoto(i)} />
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Botón de foto */}
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={isLoading || photoFiles.length >= 3}
                className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
                title={photoFiles.length >= 3 ? 'Máximo 3 fotos' : 'Adjuntar foto'}
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />

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
                disabled={(!input.trim() && photoFiles.length === 0) || isLoading}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Enviar"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              ARIA v5 · Powered by Groq AI · Acciones en tiempo real
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
