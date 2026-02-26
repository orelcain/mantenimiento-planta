/**
 * Componente ChatBot — v4 ARIA
 * Burbuja flotante con streaming, voz, fotos, acciones ejecutables,
 * confirmación inline, auto-asignación y tamaño ampliado
 */
import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Send, Trash2, Loader2, Bot, User, Mic, MicOff, ExternalLink, AlertTriangle, CheckCircle, XCircle, Camera, GripVertical, ThumbsUp, ThumbsDown, Copy, Check, Database } from 'lucide-react'
import { useChatBot } from '@/hooks/useChatBot'
import type { ChatMessage, ChatAction } from '@/services/chatbot'
import { saveFeedback } from '@/services/ariaLearning'

// ─── Formateador de markdown básico + #9 tablas ────────────────────
function formatMessage(text: string): string {
  // Ocultar línea de sugerencias si aparece en streaming
  const clean = text.replace(/\n?\[SUGERENCIAS\]\s*:.*$/im, '')

  // #9 — Detectar y renderizar tablas markdown
  const lines = clean.split('\n')
  const result: string[] = []
  let inTable = false
  let tableRows: string[][] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const isTableRow = /^\|(.+)\|$/.test(line.trim())
    const isSeparator = /^\|[\s\-:|]+\|$/.test(line.trim())

    if (isTableRow && !isSeparator) {
      if (!inTable) inTable = true
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim())
      tableRows.push(cells)
    } else if (isSeparator && inTable) {
      // Skip separator row
      continue
    } else {
      if (inTable && tableRows.length > 0) {
        result.push(renderTable(tableRows))
        tableRows = []
        inTable = false
      }
      // Format as normal markdown line
      result.push(formatLine(line))
    }
  }
  // Flush remaining table
  if (inTable && tableRows.length > 0) {
    result.push(renderTable(tableRows))
  }

  return result.join('<br/>')
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) return ''
  const header = rows[0]!
  const body = rows.slice(1)
  let html = '<table class="text-xs w-full border-collapse mt-1 mb-1">'
  html += '<thead><tr>'
  for (const cell of header) {
    html += `<th class="border border-border/50 px-2 py-1 bg-muted/50 text-left font-semibold">${formatLine(cell)}</th>`
  }
  html += '</tr></thead>'
  if (body.length > 0) {
    html += '<tbody>'
    for (const row of body) {
      html += '<tr>'
      for (let j = 0; j < header.length; j++) {
        html += `<td class="border border-border/50 px-2 py-1">${formatLine(row[j] || '')}</td>`
      }
      html += '</tr>'
    }
    html += '</tbody>'
  }
  html += '</table>'
  return html
}

function formatLine(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
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
  const [copied, setCopied] = useState(false)

  const handleFeedback = (rating: 'positive' | 'negative') => {
    if (feedbackGiven) return
    setFeedbackGiven(rating)
    onFeedback?.(msg.id, rating)
  }

  // #6 — Copiar mensaje al clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => { /* ignore */ })
  }

  // #7 — Extraer fuente de datos del contexto
  const dataSource = !isUser && msg.context
    ? msg.context.split('\n').filter(l => l.match(/^(REPUESTOS|INCIDENCIAS|EQUIPOS|SENSORES|MANTENIMIENTO|PLANIFICADOR|ETT|MAPAS|MODELOS|EVIDENCIAS|ANÁLISIS)/i)).map(l => l.split(/[(:]/)[0]?.trim()).filter(Boolean).slice(0, 3)
    : []

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
        {/* #7 — Indicador fuente de datos */}
        {dataSource.length > 0 && (
          <div className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground/70">
            <Database className="w-2.5 h-2.5" />
            <span>{dataSource.join(' · ')}</span>
          </div>
        )}
        <div className={`flex items-center justify-between mt-1 ${
          isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
        }`}>
          <span className="text-[10px]">
            {msg.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div className="flex items-center gap-0.5 ml-2">
            {/* #6 — Botón copiar */}
            {!isUser && msg.content.length > 20 && (
              <button
                onClick={handleCopy}
                className="p-0.5 rounded hover:bg-background/50 transition-colors"
                title={copied ? 'Copiado' : 'Copiar respuesta'}
              >
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
            {/* Feedback thumbs */}
            {!isUser && msg.id !== 'welcome' && msg.content.length > 30 && (
              feedbackGiven ? (
                <span className="text-[10px] ml-1">
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
              )
            )}
          </div>
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

// ─── Sugerencias rápidas (inicio) ───────────────────────────────────
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

// ─── Chips de sugerencias contextuales (post-respuesta) ─────────────
function ContextualSuggestions({ suggestions, onSelect, disabled }: {
  suggestions: string[]
  onSelect: (text: string) => void
  disabled?: boolean
}) {
  if (!suggestions.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 ml-9 mt-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 rounded-full border border-primary/25 bg-primary/5 text-primary hover:bg-primary/15 hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow"
        >
          {s}
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

// ─── #5 Barra de acción pendiente con progreso visual ───────────────
function PendingActionBar({ onConfirm, onCancel, pendingData }: {
  onConfirm: () => void
  onCancel: () => void
  pendingData?: Record<string, unknown>
}) {
  // Calcular campos completados del draft
  const fields = [
    { key: 'titulo', label: 'Título', done: !!pendingData?.titulo },
    { key: 'equipmentName', label: 'Equipo', done: !!pendingData?.equipmentName },
    { key: 'prioridad', label: 'Prioridad', done: !!pendingData?.prioridad },
    { key: 'descripcion', label: 'Descripción', done: !!pendingData?.descripcion },
  ]
  const completed = fields.filter(f => f.done).length
  const total = fields.length
  const pct = Math.round((completed / total) * 100)

  return (
    <div className="px-3 py-2 border-t border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
      <div className="flex items-center gap-2 mb-1.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-xs text-amber-800 dark:text-amber-300 flex-1 font-medium">
          Borrador de incidencia ({completed}/{total} campos)
        </span>
      </div>
      {/* Progress bar */}
      <div className="flex gap-1 mb-2">
        {fields.map(f => (
          <div key={f.key} className="flex-1 flex flex-col items-center gap-0.5">
            <div className={`w-full h-1.5 rounded-full ${f.done ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            <span className={`text-[9px] ${f.done ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>{f.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
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
    retryCountdown,
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
    const textToSend = input.trim()
    
    // #10 — Slash commands: resolver antes de enviar
    const resolved = resolveSlashCommand(textToSend)
    
    sendMessage(resolved, photoFiles.length > 0 ? photoFiles : undefined)

    // #8 — Guardar en historial de búsquedas recientes
    if (textToSend.length > 3) {
      saveRecentSearch(textToSend)
    }
    
    setInput('')
    setShowDropdown(false)
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
    if (text.length > 3) saveRecentSearch(text)
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

  // #10 — Slash commands definitions
  const SLASH_COMMANDS = [
    { cmd: '/repuestos', desc: 'Buscar repuestos', expand: '¿Qué repuestos tenemos?' },
    { cmd: '/incidencias', desc: 'Incidencias abiertas', expand: '¿Cuáles son las incidencias abiertas?' },
    { cmd: '/equipos', desc: 'Estado de equipos', expand: '¿Cuál es el estado de los equipos?' },
    { cmd: '/resumen', desc: 'Resumen de planta', expand: 'Dame un resumen general de la planta' },
    { cmd: '/preventivo', desc: 'Tareas preventivas', expand: '¿Qué tareas preventivas hay programadas?' },
    { cmd: '/sensores', desc: 'Datos de sensores', expand: '¿Cuál es el estado de los sensores IoT?' },
    { cmd: '/falla', desc: 'Reportar falla', expand: 'Quiero reportar una falla: ' },
    { cmd: '/gantt', desc: 'Planificación Gantt', expand: '¿Cómo va la planificación del Gantt?' },
    { cmd: '/ayuda', desc: 'Qué puedo hacer', expand: '¿Qué puedes hacer?' },
  ]

  function resolveSlashCommand(text: string): string {
    const lower = text.toLowerCase().trim()
    for (const sc of SLASH_COMMANDS) {
      if (lower === sc.cmd || lower.startsWith(sc.cmd + ' ')) {
        const extra = text.slice(sc.cmd.length).trim()
        return extra ? `${sc.expand}${extra}` : sc.expand
      }
    }
    return text
  }

  // #8 — Recent searches
  const RECENT_KEY = 'aria_recent_searches'
  const MAX_RECENT = 8
  const [showDropdown, setShowDropdown] = useState(false)

  function getRecentSearches(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  function saveRecentSearch(text: string) {
    try {
      const recent = getRecentSearches().filter(s => s !== text)
      recent.unshift(text)
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
    } catch { /* ignore */ }
  }

  // Items to show in the dropdown: slash commands if input starts with /, else recent searches
  const dropdownItems = (() => {
    const trimmed = input.trim().toLowerCase()
    if (trimmed.startsWith('/')) {
      return SLASH_COMMANDS
        .filter(sc => sc.cmd.startsWith(trimmed) || trimmed === '/')
        .map(sc => ({ label: `${sc.cmd} — ${sc.desc}`, value: sc.cmd }))
    }
    if (trimmed.length === 0) {
      return getRecentSearches().map(s => ({ label: `🕐 ${s}`, value: s }))
    }
    return []
  })()

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
            {messages.map((msg, idx) => {
              const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1
              return (
                <div key={msg.id}>
                  <MessageBubble msg={msg} onNavigate={handleNavigate} onFeedback={handleFeedback} />
                  {/* Chips de sugerencias contextuales — solo en el último mensaje de ARIA */}
                  {isLastAssistant && msg.suggestions && msg.suggestions.length > 0 && !isLoading && (
                    <ContextualSuggestions
                      suggestions={msg.suggestions}
                      onSelect={handleQuickSelect}
                      disabled={isLoading}
                    />
                  )}
                </div>
              )
            })}
            {/* Streaming: mostrar respuesta parcial */}
            {streamingContent && <StreamingBubble content={streamingContent} />}
            {/* Loading: solo si no hay streaming aún y no hay countdown */}
            {isLoading && !streamingContent && retryCountdown === 0 && <LoadingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugerencias rápidas */}
          {messages.length <= 1 && !isLoading && (
            <QuickSuggestions onSelect={handleQuickSelect} />
          )}

          {/* Barra de acción pendiente */}
          {pendingAction?.status === 'confirming' && !isLoading && (
            <PendingActionBar
              onConfirm={handleConfirmAction}
              onCancel={handleCancelAction}
              pendingData={pendingAction.data as Record<string, unknown> | undefined}
            />
          )}

          {/* Input */}
          <div className="border-t border-border px-3 py-2 bg-background relative">
            {/* #8 + #10 — Dropdown: búsquedas recientes o slash commands */}
            {showDropdown && dropdownItems.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mx-3 mb-1 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
                {input.trim().startsWith('/') && (
                  <div className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border">⚡ Comandos rápidos</div>
                )}
                {!input.trim().startsWith('/') && input.trim().length === 0 && (
                  <div className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border">🕐 Búsquedas recientes · Escribe / para comandos</div>
                )}
                {dropdownItems.map((item, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => {
                      e.preventDefault() // Evitar blur del input
                      if (item.value.startsWith('/')) {
                        setInput(item.value + ' ')
                      } else {
                        sendMessage(item.value)
                        setShowDropdown(false)
                        setInput('')
                      }
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors truncate"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

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
                onChange={e => { setInput(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Escuchando...' : pendingAction?.status === 'confirming' ? 'Sí / No / Modificar...' : 'Pregunta, /comando o describe una falla...'}
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
              ARIA v6 · Powered by Gemini AI · /ayuda para comandos
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
