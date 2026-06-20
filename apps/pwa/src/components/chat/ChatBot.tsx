/**
 * Componente ChatBot — v4 ARIA
 * Burbuja flotante con streaming, voz, fotos, acciones ejecutables,
 * confirmación inline, auto-asignación y tamaño ampliado
 */
import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Send, Trash2, Loader2, Bot, User, Mic, MicOff, ExternalLink, AlertTriangle, CheckCircle, XCircle, Camera, GripVertical, ThumbsUp, ThumbsDown, Copy, Check, Database, Volume2, VolumeX, RotateCcw, Star, ChevronUp, ChevronDown, Brain, Cpu } from 'lucide-react'
import DOMPurify from 'dompurify'
import { useChatBot } from '@/hooks/useChatBot'
import type { ChatMessage, ChatAction, MiniChartData } from '@/services/chatbot'
import { saveFeedback } from '@/services/ariaLearning'
import { loadVoicePref, speak, stopSpeaking } from '@/lib/ariaVoice'
import { logger } from '@/lib/logger'

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
    // #7 — Links internos clickeables
    .replace(/\[\[equipo:(.+?)\]\]/g, '<a class="text-primary underline cursor-pointer" data-aria-link="equipment" data-name="$1">🔧 $1</a>')
    .replace(/\[\[incidencia:(.+?)\]\]/g, '<a class="text-primary underline cursor-pointer" data-aria-link="incident" data-name="$1">🎫 $1</a>')
    .replace(/\[\[ir:(.+?)\|(.+?)\]\]/g, '<a class="text-primary underline cursor-pointer" data-aria-link="navigate" data-route="$1">$2</a>')
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

// ─── #2 Mini-chart inline (canvas) ──────────────────────────────────
function MiniChart({ data }: { data: MiniChartData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const colors = data.colors ?? ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

    if (data.type === 'bar') {
      const max = Math.max(...data.values, 1)
      const barW = Math.min(28, (w - 20) / data.values.length - 4)
      const gap = 4
      const totalBarArea = data.values.length * (barW + gap) - gap
      const startX = (w - totalBarArea) / 2
      const barAreaH = h - 28

      data.values.forEach((v, i) => {
        const barH = (v / max) * (barAreaH - 4)
        const x = startX + i * (barW + gap)
        const y = barAreaH - barH
        ctx.fillStyle = colors[i % colors.length]!
        ctx.beginPath()
        ctx.roundRect(x, y, barW, barH, 3)
        ctx.fill()
        // Value on top
        ctx.fillStyle = '#888'
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(v), x + barW / 2, y - 3)
        // Label at bottom
        ctx.fillStyle = '#888'
        ctx.font = '8px sans-serif'
        ctx.fillText(
          (data.labels[i] || '').slice(0, 8),
          x + barW / 2,
          h - 4
        )
      })
    } else if (data.type === 'donut') {
      const total = data.values.reduce((a, b) => a + b, 0)
      if (total === 0) return
      const cx = w / 2, cy = h / 2 - 4
      const r = Math.min(cx, cy) - 14
      let angle = -Math.PI / 2

      data.values.forEach((v, i) => {
        const slice = (v / total) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, r, angle, angle + slice)
        ctx.closePath()
        ctx.fillStyle = colors[i % colors.length]!
        ctx.fill()
        // Label
        const mid = angle + slice / 2
        const lx = cx + (r + 10) * Math.cos(mid)
        const ly = cy + (r + 10) * Math.sin(mid)
        ctx.fillStyle = '#888'
        ctx.font = '8px sans-serif'
        ctx.textAlign = lx > cx ? 'left' : 'right'
        ctx.fillText(`${(data.labels[i] || '').slice(0, 8)} ${v}`, lx, ly)
        angle += slice
      })
      // Donut hole
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2)
      ctx.fillStyle = getComputedStyle(canvasRef.current!).getPropertyValue('--background') || '#fff'
      ctx.fill()
      // Center total
      ctx.fillStyle = '#666'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(total), cx, cy)
    }
  }, [data])

  return (
    <div className="mt-2 mb-1">
      {data.title && <p className="text-[10px] text-muted-foreground font-medium mb-1">{data.title}</p>}
      <canvas
        ref={canvasRef}
        className="w-full rounded-md border border-border/50 bg-background"
        style={{ height: data.type === 'donut' ? 120 : 100 }}
      />
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
  onFeedback?: (msgId: string, rating: 'positive' | 'negative', correction?: string) => void
}) {
  const isUser = msg.role === 'user'
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null)
  const [copied, setCopied] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showCorrection, setShowCorrection] = useState(false)
  const [correctionText, setCorrectionText] = useState('')

  const handleFeedback = (rating: 'positive' | 'negative') => {
    if (feedbackGiven) return
    if (rating === 'negative') {
      // Mostrar formulario de corrección en vez de enviar inmediatamente
      setShowCorrection(true)
      return
    }
    setFeedbackGiven(rating)
    onFeedback?.(msg.id, rating)
  }

  const handleSubmitCorrection = () => {
    setFeedbackGiven('negative')
    setShowCorrection(false)
    onFeedback?.(msg.id, 'negative', correctionText.trim() || undefined)
  }

  const handleSkipCorrection = () => {
    setFeedbackGiven('negative')
    setShowCorrection(false)
    onFeedback?.(msg.id, 'negative')
  }

  // #6 — Copiar mensaje al clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => { /* ignore */ })
  }

  // #3 — TTS: leer respuesta en voz alta (motor navegador o Piper, según config)
  const handleSpeak = () => {
    if (isSpeaking) {
      stopSpeaking()
      setIsSpeaking(false)
      return
    }
    const plainText = msg.content.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').replace(/\[\[.*?\]\]/g, '')
    setIsSpeaking(true)
    speak(plainText, {
      onend: () => setIsSpeaking(false),
      onerror: () => setIsSpeaking(false),
    })
  }

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      if (isSpeaking) stopSpeaking()
    }
  }, [isSpeaking])

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
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatMessage(msg.content)) }} />
        {msg.photoUrls && msg.photoUrls.length > 0 && <MessagePhotos urls={msg.photoUrls} />}
        {/* #2 — Mini-chart inline */}
        {!isUser && msg.chartData && <MiniChart data={msg.chartData} />}
        {msg.actions && <ActionButtons actions={msg.actions} onNavigate={onNavigate} />}
        {/* #7 — Indicador fuente de datos */}
        {dataSource.length > 0 && (
          <div className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground/70">
            <Database className="w-2.5 h-2.5" />
            <span>{dataSource.join(' · ')}</span>
          </div>
        )}
        {/* Badge de agente IA que generó la respuesta */}
        {!isUser && msg.agentInfo && <AgentBadge agentInfo={msg.agentInfo} />}
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
            {/* #3 — Botón TTS: leer en voz alta */}
            {!isUser && msg.content.length > 30 && 'speechSynthesis' in window && (
              <button
                onClick={handleSpeak}
                className={`p-0.5 rounded hover:bg-background/50 transition-colors ${isSpeaking ? 'text-primary' : ''}`}
                title={isSpeaking ? 'Detener lectura' : 'Leer en voz alta'}
              >
                {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
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
                    className={`p-0.5 rounded hover:bg-background/50 transition-colors ${showCorrection ? 'text-amber-500' : ''}`}
                    title="Respuesta incorrecta — corregir"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </>
              )
            )}
          </div>

          {/* Formulario de corrección (se expande tras thumbs down) */}
          {showCorrection && !feedbackGiven && (
            <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-1.5">
              <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                ✏️ ¿Cuál era la respuesta correcta?
              </div>
              <textarea
                value={correctionText}
                onChange={e => setCorrectionText(e.target.value)}
                placeholder="Ej: Solo hay 4 motores para la Baader 142, el AMPLIFICADOR ELECTRONICO no es un motor..."
                className="w-full text-xs px-2 py-1.5 rounded-md border border-amber-500/30 bg-background resize-none focus:ring-1 focus:ring-amber-500/50 focus:outline-none"
                rows={3}
                autoFocus
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleSubmitCorrection}
                  className="flex-1 text-[10px] py-1 px-2 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
                >
                  {correctionText.trim() ? 'Enviar corrección' : 'Marcar como incorrecto'}
                </button>
                <button
                  onClick={handleSkipCorrection}
                  className="text-[10px] py-1 px-2 rounded border border-border hover:bg-muted transition-colors text-muted-foreground"
                >
                  Omitir
                </button>
              </div>
              <div className="text-[9px] text-muted-foreground">
                Tu corrección ayuda a ARIA a mejorar. Se usa como contexto en futuras consultas similares.
              </div>
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
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatMessage(content)) }} />
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

// ─── Indicador de actividad de agente IA ─────────────────────────────
import type { AgentStatusEvent } from '@/services/ariaOrchestrator'

function AgentActivityIndicator({ status }: { status: AgentStatusEvent }) {
  const phaseStyles: Record<string, { color: string; animate: boolean }> = {
    analyzing: { color: 'text-blue-400', animate: true },
    selecting: { color: 'text-purple-400', animate: true },
    calling: { color: 'text-amber-400', animate: true },
    streaming: { color: 'text-green-400', animate: true },
    fallback: { color: 'text-orange-400', animate: true },
    done: { color: 'text-green-500', animate: false },
    error: { color: 'text-red-400', animate: false },
  }
  const style = phaseStyles[status.phase] || { color: 'text-muted-foreground', animate: true }

  return (
    <div className="flex gap-2 items-center mb-1">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/80 border border-border/50 text-[11px] max-w-[85%] overflow-hidden">
        {style.animate && (
          <Loader2 className={`w-3 h-3 animate-spin ${style.color} shrink-0`} />
        )}
        {!style.animate && status.phase === 'done' && (
          <span className="text-green-500 shrink-0">✓</span>
        )}
        {status.agentEmoji && (
          <span className="shrink-0">{status.agentEmoji}</span>
        )}
        <span className={`${style.color} truncate`}>{status.message}</span>
      </div>
    </div>
  )
}

/** Badge pequeño que muestra qué agente generó una respuesta */
function AgentBadge({ agentInfo }: { agentInfo: NonNullable<import('@/services/chatbot').ChatMessage['agentInfo']> }) {
  const taskLabels: Record<string, string> = {
    reasoning: '🧠 razonamiento',
    analysis: '📊 análisis',
    code: '💻 código',
    speed: '⚡ rápido',
    general: '🔄 general',
    vision: '👁️ visión',
  }
  return (
    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground opacity-70 flex-wrap">
      <span>{agentInfo.agentEmoji}</span>
      <span>{agentInfo.agentName}</span>
      <span>·</span>
      <span>{agentInfo.latencyMs > 1000 ? `${(agentInfo.latencyMs / 1000).toFixed(1)}s` : `${agentInfo.latencyMs}ms`}</span>
      {agentInfo.taskType && (
        <>
          <span>·</span>
          <span>{taskLabels[agentInfo.taskType] || agentInfo.taskType}</span>
        </>
      )}
      {agentInfo.thinkingUsed && (
        <>
          <span>·</span>
          <span className="text-purple-400">🧠 deep think</span>
        </>
      )}
      {agentInfo.fallbackUsed && (
        <>
          <span>·</span>
          <span className="text-amber-500">⚠ fallback</span>
        </>
      )}
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
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startListening = useCallback(() => {
    if (!isSupported) return

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'es-CL'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i]![0]!.transcript
        if (event.results[i]!.isFinal) {
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

// ─── #5 Barra de acción pendiente con progreso visual + selector de equipo + asignación ──
interface EquipmentCandidateUI { id: string; nombre: string; codigo: string; score: number }
interface TechnicianUI { id: string; nombre: string; apellido: string; rol: string }

function PendingActionBar({ onConfirm, onCancel, onModify, onSelectEquipment, onAssignTechnician, pendingData, userRole, userId, userName }: {
  onConfirm: () => void
  onCancel: () => void
  onModify: () => void
  onSelectEquipment: (id: string, nombre: string) => void
  onAssignTechnician: (id: string, nombre: string) => void
  pendingData?: Record<string, unknown>
  userRole?: string
  userId?: string
  userName?: string
}) {
  const [showEquipmentPicker, setShowEquipmentPicker] = useState(false)
  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [showTechPicker, setShowTechPicker] = useState(false)
  const [technicians, setTechnicians] = useState<TechnicianUI[]>([])
  const [techLoading, setTechLoading] = useState(false)
  const [techSearch, setTechSearch] = useState('')
  const [allEquipment, setAllEquipment] = useState<EquipmentCandidateUI[]>([])
  const [equipLoading, setEquipLoading] = useState(false)

  const canAssignOthers = userRole === 'admin' || userRole === 'supervisor'
  const canSelfAssign = userRole === 'tecnico'
  const showTechSection = canAssignOthers || canSelfAssign

  // Cargar todos los equipos al escribir en el buscador (lazy)
  useEffect(() => {
    if (!showEquipmentPicker || allEquipment.length > 0) return
    setEquipLoading(true)
    import('@/services/equipment').then(({ getEquipments }) => {
      getEquipments().then(eqs => {
        setAllEquipment(eqs
          .filter(e => !e.deleted)
          .map(e => ({ id: e.id, nombre: e.nombre, codigo: e.codigo, score: 0 }))
        )
        setEquipLoading(false)
      }).catch(() => setEquipLoading(false))
    })
  }, [showEquipmentPicker, allEquipment.length])

  // Cargar técnicos al abrir el picker
  useEffect(() => {
    if (!showTechPicker || technicians.length > 0) return
    setTechLoading(true)
    import('@/services/auth').then(({ getTechnicians }) => {
      getTechnicians().then(techs => {
        setTechnicians(techs.map(t => ({ id: t.id, nombre: t.nombre, apellido: t.apellido, rol: t.rol })))
        setTechLoading(false)
      }).catch(() => setTechLoading(false))
    })
  }, [showTechPicker, technicians.length])

  // Calcular campos completados del draft
  const fields = [
    { key: 'titulo', label: 'Título', done: !!pendingData?.titulo },
    { key: 'equipmentName', label: 'Equipo', done: !!pendingData?.equipmentName },
    { key: 'prioridad', label: 'Prioridad', done: !!pendingData?.prioridad },
    { key: 'descripcion', label: 'Descripción', done: !!pendingData?.descripcion },
  ]
  const completed = fields.filter(f => f.done).length
  const total = fields.length

  // Candidatos de equipo
  const candidates = (pendingData?.equipmentCandidates as EquipmentCandidateUI[] | undefined) || []
  const currentEquipmentId = pendingData?.equipmentId as string | undefined
  const currentTechId = pendingData?.asignadoA as string | undefined
  const currentTechName = pendingData?.asignadoANombre as string | undefined

  // Filtrar equipos por búsqueda (usa candidatos + lista completa)
  const filteredCandidates = equipmentSearch.trim()
    ? (() => {
        const q = equipmentSearch.toLowerCase()
        // Combinar candidatos con todos los equipos, eliminar duplicados
        const candidateIds = new Set(candidates.map(c => c.id))
        const fromAll = allEquipment.filter(e => !candidateIds.has(e.id) && (
          e.nombre.toLowerCase().includes(q) || e.codigo.toLowerCase().includes(q)
        ))
        const fromCandidates = candidates.filter(c =>
          c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q)
        )
        return [...fromCandidates, ...fromAll].slice(0, 20)
      })()
    : candidates

  // Filtrar técnicos por búsqueda
  const filteredTechs = techSearch.trim()
    ? technicians.filter(t => {
        const q = techSearch.toLowerCase()
        return `${t.nombre} ${t.apellido}`.toLowerCase().includes(q)
      })
    : technicians

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

      {/* Selector de equipo con búsqueda (siempre visible) */}
      <div className="mb-2">
          <button
            onClick={() => { setShowEquipmentPicker(p => !p); setShowTechPicker(false) }}
            className="w-full text-left text-xs px-2 py-1.5 rounded-md border border-amber-300 dark:border-amber-600 bg-amber-100/50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors flex items-center justify-between"
          >
            <span className="truncate">
              🏭 {pendingData?.equipmentName
                ? `Equipo: ${pendingData.equipmentName as string}`
                : 'Seleccionar equipo...'}
            </span>
            <ChevronUp className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${showEquipmentPicker ? '' : 'rotate-180'}`} />
          </button>
          {showEquipmentPicker && (
            <div className="mt-1 rounded-md border border-border bg-background shadow-lg">
              {/* Buscador de equipos */}
              <div className="px-2 py-1.5 border-b border-border">
                <input
                  type="text"
                  value={equipmentSearch}
                  onChange={e => setEquipmentSearch(e.target.value)}
                  placeholder="🔍 Buscar equipo..."
                  className="w-full text-xs px-2 py-1 rounded border border-border bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              <div className="max-h-36 overflow-y-auto">
                {equipLoading ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Cargando equipos...
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground text-center">
                    {equipmentSearch.trim() ? 'Sin resultados — intenta otro término' : 'Escribe para buscar equipos'}
                  </div>
                ) : (
                  filteredCandidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSelectEquipment(c.id, c.nombre)
                        setShowEquipmentPicker(false)
                        setEquipmentSearch('')
                      }}
                      className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2 border-b border-border last:border-0 ${
                        currentEquipmentId === c.id ? 'bg-primary/10 font-medium' : ''
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        c.score >= 0.7 ? 'bg-green-500' : c.score >= 0.4 ? 'bg-amber-500' : 'bg-gray-400'
                      }`} />
                      <span className="truncate flex-1" title={c.nombre}>{c.nombre}</span>
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">{c.codigo}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

      {/* Selector de técnico (admin/supervisor: lista completa, técnico: autoasignarse) */}
      {showTechSection && (
        <div className="mb-2">
          {canSelfAssign && !canAssignOthers ? (
            /* Técnico: botón simple de autoasignación */
            currentTechId === userId ? (
              <button
                onClick={() => { onAssignTechnician('', '') }}
                className="w-full text-left text-xs px-2 py-1.5 rounded-md border border-green-300 dark:border-green-600 bg-green-50/50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="truncate">👷 Asignada a mí — <span className="text-muted-foreground italic">clic para quitar</span></span>
              </button>
            ) : (
              <button
                onClick={() => { if (userId && userName) onAssignTechnician(userId, userName) }}
                className="w-full text-left text-xs px-2 py-1.5 rounded-md border border-blue-300 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-2"
              >
                <span>👷 Autoasignarme esta incidencia</span>
              </button>
            )
          ) : (
            /* Admin/Supervisor: dropdown completo */
            <>
              <button
                onClick={() => { setShowTechPicker(p => !p); setShowEquipmentPicker(false) }}
                className="w-full text-left text-xs px-2 py-1.5 rounded-md border border-blue-300 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-between"
              >
                <span className="truncate">
                  👷 {currentTechName
                    ? `Asignado: ${currentTechName}`
                    : 'Asignar técnico (opcional)...'}
                </span>
                <ChevronUp className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${showTechPicker ? '' : 'rotate-180'}`} />
              </button>
              {showTechPicker && (
                <div className="mt-1 rounded-md border border-border bg-background shadow-lg">
                  <div className="px-2 py-1.5 border-b border-border">
                    <input
                      type="text"
                      value={techSearch}
                      onChange={e => setTechSearch(e.target.value)}
                      placeholder="🔍 Buscar técnico..."
                      className="w-full text-xs px-2 py-1 rounded border border-border bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {techLoading ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
                      </div>
                    ) : filteredTechs.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground text-center">Sin resultados</div>
                    ) : (
                      <>
                        {currentTechId && (
                          <button
                            onClick={() => { onAssignTechnician('', ''); setShowTechPicker(false); setTechSearch('') }}
                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted transition-colors border-b border-border text-muted-foreground italic"
                          >
                            ✕ Quitar asignación
                          </button>
                        )}
                        {filteredTechs.map((t) => {
                          const fullName = `${t.nombre} ${t.apellido}`.trim()
                          const rolLabel = t.rol === 'admin' ? '🔑' : t.rol === 'supervisor' ? '📋' : '🔧'
                          return (
                            <button
                              key={t.id}
                              onClick={() => { onAssignTechnician(t.id, fullName); setShowTechPicker(false); setTechSearch('') }}
                              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2 border-b border-border last:border-0 ${
                                currentTechId === t.id ? 'bg-primary/10 font-medium' : ''
                              }`}
                            >
                              <span className="flex-shrink-0">{rolLabel}</span>
                              <span className="truncate flex-1" title={fullName}>{fullName}</span>
                              <span className="text-[9px] text-muted-foreground flex-shrink-0 capitalize">{t.rol}</span>
                            </button>
                          )
                        })}
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Botones Sí / No / Modificar */}
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirm}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors font-medium"
        >
          <CheckCircle className="w-3 h-3" />
          Confirmar
        </button>
        <button
          onClick={onModify}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
        >
          ✏️ Modificar
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
    agentStatus,
    pendingAction,
    retryCountdown,
    userId,
    userName,
    userRole,
    toggle,
    sendMessage,
    clearHistory,
    retryLastMessage,
    thinkingEnabled,
    canThink,
    toggleThinking,
    selectedAgent,
    changeAgent,
    availableAgents,
  } = useChatBot()

  const [input, setInput] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const agentSelectorRef = useRef<HTMLDivElement>(null)
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

  // Cargar preferencia de voz (definida en Configuración → ARIA)
  useEffect(() => {
    loadVoicePref()
  }, [])

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

  // Click outside to close agent selector
  useEffect(() => {
    if (!showAgentSelector) return
    const handler = (e: MouseEvent) => {
      if (agentSelectorRef.current && !agentSelectorRef.current.contains(e.target as Node)) {
        setShowAgentSelector(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAgentSelector])

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

  const handleModifyAction = () => {
    sendMessage('Modificar el borrador')
  }

  const handleSelectEquipment = (equipmentId: string, equipmentName: string) => {
    // Informar selección al chat — chatbot actualizará el draft
    void equipmentId // Used by chatbot via equipment name lookup
    sendMessage(`Selecciono el equipo: ${equipmentName}`)
  }

  const handleAssignTechnician = (techId: string, techName: string) => {
    if (!techId) {
      // Quitar asignación
      sendMessage('Asignar técnico: |')
    } else {
      sendMessage(`Asignar técnico: ${techName}|${techId}`)
    }
  }

  const handleFeedback = useCallback((messageId: string, rating: 'positive' | 'negative', correction?: string) => {
    if (!userId) return
    // Encontrar el mensaje y el query del usuario anterior
    const msgIdx = messages.findIndex(m => m.id === messageId)
    const ariaMsg = messages[msgIdx]
    const userMsg = messages.slice(0, msgIdx).reverse().find(m => m.role === 'user')

    // Auto-detectar intents del contenido para mejor matching
    const content = (userMsg?.content || '').toLowerCase()
    const autoIntents: string[] = []
    if (/equipo|m[aá]quina|motor|bomba|cinta|sensor|compresor/.test(content)) autoIntents.push('equipos')
    if (/incidencia|falla|reporte|problema/.test(content)) autoIntents.push('incidencias')
    if (/repuesto|pieza|rodamiento|correa|filtro/.test(content)) autoIntents.push('repuestos')
    if (/manteni|preventiv|predictiv/.test(content)) autoIntents.push('mantenimiento')
    if (autoIntents.length === 0) autoIntents.push('general')

    // Extraer equipo mencionado si hay
    const equipMatch = content.match(/(?:cinta|motor|bomba|compresor|reductor|baader|marel|volcador|grader|sensor|v[aá]lvula|chiller|caldera)\s*\d*/i)

    saveFeedback({
      messageId,
      userId,
      userQuery: userMsg?.content || '',
      ariaResponse: ariaMsg?.content || '',
      rating,
      correction,
      intents: autoIntents,
      equipmentMentioned: equipMatch?.[0],
    }).then(() => {
    }).catch((err) => {
      logger.error('Error guardando feedback en ARIA Learning', err instanceof Error ? err : new Error(String(err)))
    })
  }, [messages, userId])

  // #7 — Handler para links internos clickeables en mensajes
  const handleInternalLinkClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-aria-link]') as HTMLElement | null
    if (!target) return
    e.preventDefault()
    const linkType = target.dataset.ariaLink
    const name = target.dataset.name || ''
    const route = target.dataset.route || ''

    if (linkType === 'equipment' && name) {
      // Buscar equipo por nombre → navegar a ficha técnica
      sendMessage(`Muéstrame la ficha técnica de ${name}`)
    } else if (linkType === 'incident' && name) {
      // Buscar incidencia por título
      sendMessage(`Dame detalles de la incidencia: ${name}`)
    } else if (linkType === 'navigate' && route) {
      navigate(route)
      toggle()
    }
  }, [sendMessage, navigate, toggle])

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
    { cmd: '/mis', desc: 'Mis plantillas guardadas', expand: '__TEMPLATES__' },
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

  // #8 — Recent searches — colapsadas por defecto, solo mostrar al escribir /
  const RECENT_KEY = 'aria_recent_searches'
  const MAX_RECENT = 8
  const [showDropdown, setShowDropdown] = useState(false)
  const [showRecents, setShowRecents] = useState(false)

  // #5 v2.60 — Custom query templates
  const TEMPLATES_KEY = `aria_templates_${userId || 'anon'}`
  const MAX_TEMPLATES = 20

  interface UserTemplate { id: string; text: string; label: string; createdAt: number }

  function getTemplates(): UserTemplate[] {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  function saveTemplate(text: string) {
    const templates = getTemplates()
    if (templates.some(t => t.text === text)) return // already saved
    const label = text.length > 50 ? text.slice(0, 50) + '…' : text
    templates.unshift({ id: Date.now().toString(36), text, label, createdAt: Date.now() })
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)))
  }

  function removeTemplate(id: string) {
    const templates = getTemplates().filter(t => t.id !== id)
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
  }

  const [templateRefresh, setTemplateRefresh] = useState(0)

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

  // Items to show in the dropdown: slash commands if input starts with /, else recent searches only if expanded
  const dropdownItems = (() => {
    void templateRefresh // Force re-render when templates added/removed
    const trimmed = input.trim().toLowerCase()
    if (trimmed === '/mis' || trimmed.startsWith('/mis ')) {
      // #5 v2.60 — Show saved templates
      const tpls = getTemplates()
      if (tpls.length === 0) return [{ label: '(Sin plantillas guardadas — usa ⭐ para guardar)', value: '', isTemplate: false, templateId: '' }]
      return tpls.map(t => ({ label: `⭐ ${t.label}`, value: t.text, isTemplate: true, templateId: t.id }))
    }
    if (trimmed.startsWith('/')) {
      return SLASH_COMMANDS
        .filter(sc => sc.cmd.startsWith(trimmed) || trimmed === '/')
        .map(sc => ({ label: `${sc.cmd} — ${sc.desc}`, value: sc.cmd, isTemplate: false, templateId: '' }))
    }
    if (trimmed.length === 0 && showRecents) {
      return getRecentSearches().map(s => ({ label: `🕐 ${s}`, value: s, isTemplate: false, templateId: '' }))
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
          className="fixed bottom-[9rem] lg:bottom-20 right-4 z-40 max-w-[calc(100vw-2rem)] h-[676px] max-h-[calc(100vh-6rem)] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200 landscape-mobile-hidden"
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
                  {pendingAction?.status === 'confirming'
                    ? '⚡ Acción pendiente de confirmación'
                    : thinkingEnabled
                      ? '🧠 Pensamiento profundo · IA'
                      : 'IA · Datos en tiempo real'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Selector de modelo IA */}
              {canThink && (
                <div className="relative" ref={agentSelectorRef}>
                  <button
                    onClick={() => setShowAgentSelector(p => !p)}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] transition-colors ${
                      selectedAgent
                        ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                        : 'hover:bg-background text-muted-foreground hover:text-foreground'
                    }`}
                    title={selectedAgent ? `Modelo: ${availableAgents().find(a => a.id === selectedAgent)?.name || selectedAgent}` : 'Seleccionar modelo IA (Auto)'}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span className="max-w-[60px] truncate">
                      {selectedAgent
                        ? (availableAgents().find(a => a.id === selectedAgent)?.emoji || '🤖') + ' ' + (availableAgents().find(a => a.id === selectedAgent)?.name?.split(' ')[0] || '')
                        : 'Auto'}
                    </span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showAgentSelector ? 'rotate-180' : ''}`} />
                  </button>
                  {showAgentSelector && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-lg shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Modelo IA</div>
                      {/* Auto option */}
                      <button
                        onClick={() => { changeAgent(null); setShowAgentSelector(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${
                          !selectedAgent ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
                        }`}
                      >
                        <span className="w-5 text-center">🔄</span>
                        <div className="flex-1 text-left">
                          <div>Auto <span className="text-muted-foreground">(ARIA elige)</span></div>
                        </div>
                        {!selectedAgent && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                      <div className="h-px bg-border mx-2 my-1" />
                      {availableAgents().map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => { changeAgent(agent.id); setShowAgentSelector(false) }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${
                            selectedAgent === agent.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
                          }`}
                        >
                          <span className="w-5 text-center">{agent.emoji}</span>
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-1.5">
                              {agent.name}
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                                agent.status === 'online' ? 'bg-green-500'
                                : agent.status === 'rate-limited' ? 'bg-yellow-500'
                                : agent.status === 'disabled' ? 'bg-gray-400'
                                : 'bg-red-500'
                              }`} />
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {agent.costTier === 'free' ? 'Gratis' : agent.costTier === 'cheap' ? 'Económico' : 'Moderado'}
                              {' · '}
                              {agent.status === 'online' ? 'Disponible' : agent.status === 'disabled' ? 'Sin API key' : agent.status}
                            </div>
                          </div>
                          {selectedAgent === agent.id && <Check className="w-3.5 h-3.5 text-primary" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {canThink && (
                <button
                  onClick={toggleThinking}
                  className={`p-1.5 rounded-md transition-colors ${
                    thinkingEnabled
                      ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                      : 'hover:bg-background text-muted-foreground hover:text-foreground'
                  }`}
                  title={thinkingEnabled ? 'Pensamiento profundo: ACTIVO — click para desactivar' : 'Activar pensamiento profundo'}
                >
                  <Brain className="w-4 h-4" />
                </button>
              )}
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
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" onClick={handleInternalLinkClick}>
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
                  {/* Botón reintentar — solo en el último mensaje de ARIA si no está cargando */}
                  {isLastAssistant && !isLoading && msg.id !== 'welcome' && (
                    <div className="flex items-center gap-2 ml-9 mt-1">
                      <button
                        onClick={retryLastMessage}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors px-2 py-0.5 rounded-md hover:bg-muted"
                        title="Reintentar respuesta"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {/* Indicador de actividad de agente IA */}
            {isLoading && agentStatus && !streamingContent && agentStatus.phase !== 'done' && (
              <AgentActivityIndicator status={agentStatus} />
            )}
            {/* Streaming: mostrar respuesta parcial */}
            {streamingContent && (
              <div>
                {agentStatus && (
                  <div className="mb-1 ml-9">
                    <span className="text-[10px] text-muted-foreground">
                      {agentStatus.agentEmoji} {agentStatus.agentName}
                    </span>
                  </div>
                )}
                <StreamingBubble content={streamingContent} />
              </div>
            )}
            {/* Loading: solo si no hay streaming aún y no hay countdown */}
            {isLoading && !streamingContent && retryCountdown === 0 && !agentStatus && <LoadingIndicator />}
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
              onModify={handleModifyAction}
              onSelectEquipment={handleSelectEquipment}
              onAssignTechnician={handleAssignTechnician}
              pendingData={pendingAction.data as Record<string, unknown> | undefined}
              userRole={userRole}
              userId={userId}
              userName={userName}
            />
          )}

          {/* Input */}
          <div className="border-t border-border px-3 py-2 bg-background relative">
            {/* #8 + #10 — Dropdown: búsquedas recientes (colapsable) o slash commands */}
            {showDropdown && dropdownItems.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mx-3 mb-1 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
                {input.trim().toLowerCase().startsWith('/mis') && (
                  <div className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border">⭐ Mis plantillas guardadas</div>
                )}
                {input.trim().startsWith('/') && !input.trim().toLowerCase().startsWith('/mis') && (
                  <div className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border">⚡ Comandos rápidos</div>
                )}
                {!input.trim().startsWith('/') && showRecents && (
                  <div className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border">🕐 Búsquedas recientes</div>
                )}
                {dropdownItems.map((item, i) => (
                  <div key={i} className="flex items-center hover:bg-muted transition-colors">
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault()
                        if (!item.value) return // placeholder "(Sin plantillas...)"
                        if (item.value.startsWith('/')) {
                          setInput(item.value + ' ')
                        } else {
                          sendMessage(item.value)
                          setShowDropdown(false)
                          setInput('')
                        }
                      }}
                      className="flex-1 text-left px-3 py-2 text-xs truncate"
                    >
                      {item.label}
                    </button>
                    {item.isTemplate && (
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault()
                          removeTemplate(item.templateId)
                          setTemplateRefresh(p => p + 1)
                          // Re-trigger dropdown
                          setInput('/mis')
                        }}
                        className="px-2 py-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Eliminar plantilla"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
              {/* Botón de recientes (toggle) */}
              {getRecentSearches().length > 0 && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setShowRecents(prev => !prev)
                    setShowDropdown(prev => !prev)
                  }}
                  className={`p-2 rounded-lg transition-colors ${showRecents ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'}`}
                  title={showRecents ? 'Ocultar recientes' : 'Búsquedas recientes'}
                >
                  <ChevronUp className={`w-4 h-4 transition-transform ${showRecents ? '' : 'rotate-180'}`} />
                </button>
              )}
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
                onChange={e => { setInput(e.target.value); setShowDropdown(true); if (!e.target.value.trim()) setShowRecents(false) }}
                onFocus={() => { if (input.trim().startsWith('/')) setShowDropdown(true) }}
                onBlur={() => setTimeout(() => { setShowDropdown(false); setShowRecents(false) }, 150)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Escuchando...' : pendingAction?.status === 'confirming' ? 'Sí / No / Modificar...' : 'Pregunta, /comando o describe una falla...'}
                disabled={isLoading}
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 placeholder:text-muted-foreground"
              />

              {/* #5 v2.60 — Save template button */}
              <button
                onClick={() => {
                  const t = input.trim()
                  if (t && !t.startsWith('/')) {
                    saveTemplate(t)
                    setTemplateRefresh(p => p + 1)
                  }
                }}
                disabled={!input.trim() || input.trim().startsWith('/') || isLoading}
                className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-amber-500 hover:bg-muted/80 disabled:opacity-30 transition-colors"
                title="Guardar como plantilla (⭐)"
              >
                <Star className="w-4 h-4" />
              </button>

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
              ARIA v6 · Powered by Gemini AI · /ayuda · /mis para plantillas
            </p>
          </div>
        </div>
      )}

      {/* Botón flotante — oculto en landscape móvil para no tapar la tabla */}
      <button
        onClick={toggle}
        className={`fixed bottom-20 lg:bottom-4 right-4 z-[45] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 landscape-mobile-hidden ${
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
