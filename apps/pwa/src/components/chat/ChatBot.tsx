/**
 * Componente ChatBot — v4 ARIA
 * Burbuja flotante con streaming, voz, fotos, acciones ejecutables,
 * confirmación inline, auto-asignación y tamaño ampliado
 */
import { SkeletonFilas } from '@/components/piel'
import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Wrench, Factory, HardHat, KeyRound, ClipboardList, Clock, Zap, MessageCircle, X, Send, Trash2, Loader2, Bot, User, Mic, MicOff, ExternalLink, AlertTriangle, CheckCircle, XCircle, Camera, GripVertical, ThumbsUp, ThumbsDown, Copy, Check, Database, Volume2, VolumeX, RotateCcw, Star, ChevronUp, ChevronDown, Brain, Cpu, Headphones, Eye, EyeOff, Pencil, MoreHorizontal } from 'lucide-react'
import DOMPurify from 'dompurify'
import { useChatBot } from '@/hooks/useChatBot'
import type { ChatMessage, ChatAction, MiniChartData } from '@/services/chatbot'
import { saveFeedback } from '@/services/ariaLearning'
import { desbloquearAudio, loadVoicePref, onSpeakingChange, speak, stopSpeaking } from '@/lib/ariaVoice'
import { logger } from '@/lib/logger'
import { useBurbujaChatOculta, registrarAbrirAria, type OpcionesAria } from '@/lib/pantallaCompletaMovil'
import { useOcultarAlBajar } from '@/hooks/useOcultarAlBajar'
import { ContextoHojaAria } from './ContextoHojaAria'
import { useHojaAria } from './useHojaAria'
import { AriaAvatar } from './AriaAvatar'
import { elegirColor } from '@/lib/coloresGrafico'

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
    html += `<th class="border border-border px-2 py-1 bg-muted text-left font-semibold">${formatLine(cell)}</th>`
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
    .replace(/^(\s*)\* /, '$1• ')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded-ctl text-xs">$1</code>')
    // #7 — Links internos clickeables
    .replace(/\[\[equipo:(.+?)\]\]/g, '<a class="text-primary underline cursor-pointer" data-aria-link="equipment" data-name="$1">$1</a>')
    .replace(/\[\[incidencia:(.+?)\]\]/g, '<a class="text-primary underline cursor-pointer" data-aria-link="incident" data-name="$1">$1</a>')
    .replace(/\[\[ir:(.+?)\|(.+?)\]\]/g, '<a class="text-primary underline cursor-pointer" data-aria-link="navigate" data-route="$1">$2</a>')
}

// ─── Preview de foto en chat ────────────────────────────────────────
function PhotoPreview({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative inline-block mr-2 mb-2">
      <img 
        src={src} 
        alt="Preview" 
        className="w-20 h-20 object-cover rounded-card border border-border"
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

    // Sin Pizarra: la lista de siempre; con Pizarra: series 1-5 y «otros» (máx. 5 series, ver index.css).
    const colors = data.colors ?? [
      elegirColor('#3b82f6', 'serie-1'), elegirColor('#ef4444', 'serie-2'), elegirColor('#22c55e', 'serie-3'),
      elegirColor('#f59e0b', 'serie-4'), elegirColor('#8b5cf6', 'serie-5'), elegirColor('#06b6d4', 'serie-otros'),
      elegirColor('#f97316', 'serie-otros'), elegirColor('#ec4899', 'serie-otros'),
    ]

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
      {data.title && <p className="text-caption text-muted-foreground font-medium mb-1">{data.title}</p>}
      <canvas
        ref={canvasRef}
        className="w-full rounded-ctl border border-border/50 bg-background"
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
            className="w-24 h-24 object-cover rounded-ctl border border-border hover:opacity-80 transition-opacity cursor-pointer" 
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
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-ctl border border-transparent bg-primary/5 text-brand-ink hover:bg-primary/10 transition-colors"
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

      <div className={`max-w-[85%] rounded-card px-3 py-2 text-sm leading-relaxed ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground'
      }`}>
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatMessage(msg.content)) }} />
        {msg.photoUrls && msg.photoUrls.length > 0 && <MessagePhotos urls={msg.photoUrls} />}
        {/* #2 — Mini-chart inline */}
        {!isUser && msg.chartData && <MiniChart data={msg.chartData} />}
        {msg.actions && <ActionButtons actions={msg.actions} onNavigate={onNavigate} />}
        {/* #7 — Indicador fuente de datos */}
        {dataSource.length > 0 && (
          <div className="flex items-center gap-1 mt-1 text-caption text-muted-foreground">
            <Database className="w-2.5 h-2.5" />
            <span>{dataSource.join(' · ')}</span>
          </div>
        )}
        {/* Badge de agente IA que generó la respuesta */}
        {!isUser && msg.agentInfo && <AgentBadge agentInfo={msg.agentInfo} />}
        <div className={`flex items-center justify-between mt-1 ${
          isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
        }`}>
          <span className="text-caption">
            {msg.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div className="flex items-center gap-0.5 ml-2">
            {/* #6 — Botón copiar */}
            {!isUser && msg.content.length > 20 && (
              <button
                onClick={handleCopy}
                className="p-0.5 rounded-ctl hover:bg-background/50 transition-colors"
                title={copied ? 'Copiado' : 'Copiar respuesta'}
              >
                {copied ? <Check className="w-3 h-3 text-ink-ok" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
            {/* #3 — Botón TTS: leer en voz alta */}
            {!isUser && msg.content.length > 30 && 'speechSynthesis' in window && (
              <button
                onClick={handleSpeak}
                className={`p-0.5 rounded-ctl hover:bg-background/50 transition-colors ${isSpeaking ? 'text-primary' : ''}`}
                title={isSpeaking ? 'Detener lectura' : 'Leer en voz alta'}
              >
                {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
            )}
            {/* Feedback thumbs */}
            {!isUser && msg.id !== 'welcome' && msg.content.length > 30 && (
              feedbackGiven ? (
                <span className="text-caption ml-1">
                  {feedbackGiven === 'positive' ? '✓ Útil' : '✓ Registrado'}
                </span>
              ) : (
                <>
                  <button
                    onClick={() => handleFeedback('positive')}
                    className="p-0.5 rounded-ctl hover:bg-background/50 transition-colors"
                    title="Respuesta útil"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleFeedback('negative')}
                    className={`p-0.5 rounded-ctl hover:bg-background/50 transition-colors ${showCorrection ? 'text-ink-warn' : ''}`}
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
            <div className="mt-2 p-2 bg-fill-warning/[0.15] border border-transparent rounded-card space-y-1.5">
              <div className="flex items-center gap-1 text-caption font-medium text-ink-warn">
                <Pencil className="size-3 shrink-0" />
                ¿Cuál era la respuesta correcta?
              </div>
              <textarea
                value={correctionText}
                onChange={e => setCorrectionText(e.target.value)}
                placeholder="Ej: Solo hay 4 motores para la Baader 142, el AMPLIFICADOR ELECTRONICO no es un motor..."
                className="w-full text-xs px-2 py-1.5 rounded-ctl border border-fill-warning/[0.25] bg-background resize-none focus:ring-1 focus:ring-fill-warning/50 focus:outline-none"
                rows={3}
                autoFocus
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleSubmitCorrection}
                  className="flex-1 text-caption py-1 px-2 rounded-ctl bg-fill-warning/[0.15] text-ink-warn hover:brightness-95 transition-colors font-medium"
                >
                  {correctionText.trim() ? 'Enviar corrección' : 'Marcar como incorrecto'}
                </button>
                <button
                  onClick={handleSkipCorrection}
                  className="text-caption py-1 px-2 rounded-ctl border border-border hover:bg-muted transition-colors text-muted-foreground"
                >
                  Omitir
                </button>
              </div>
              <div className="text-caption text-muted-foreground">
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
      <div className="max-w-[85%] rounded-card px-3 py-2 text-sm leading-relaxed bg-card border border-border text-foreground">
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
      <div className="bg-card border border-border rounded-card px-3 py-2 flex gap-1.5 items-center">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Consultando datos de la planta...</span>
      </div>
    </div>
  )
}

// ─── Indicador de actividad de agente IA ─────────────────────────────
import type { AgentStatusEvent } from '@/services/ariaOrchestrator'
import { dec1 } from '@/utils/formatoNumeros'

function AgentActivityIndicator({ status }: { status: AgentStatusEvent }) {
  const phaseStyles: Record<string, { color: string; animate: boolean }> = {
    analyzing: { color: 'text-brand-ink', animate: true },
    selecting: { color: 'text-cat-6-ink', animate: true },
    calling: { color: 'text-ink-warn', animate: true },
    streaming: { color: 'text-ink-ok', animate: true },
    fallback: { color: 'text-cat-4-ink', animate: true },
    done: { color: 'text-ink-ok', animate: false },
    error: { color: 'text-ink-crit', animate: false },
  }
  const style = phaseStyles[status.phase] || { color: 'text-muted-foreground', animate: true }

  return (
    <div className="flex gap-2 items-center mb-1">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/80 border border-border/50 text-caption max-w-[85%] overflow-hidden">
        {style.animate && (
          <Loader2 className={`w-3 h-3 animate-spin ${style.color} shrink-0`} />
        )}
        {!style.animate && status.phase === 'done' && (
          <span className="text-ink-ok shrink-0">✓</span>
        )}
        {status.agentEmoji && (
          <span className="shrink-0">{status.agentEmoji}</span>
        )}
        <span className={`${style.color} truncate`}>{status.message}</span>
      </div>
    </div>
  )
}

/** Modelo y tiempo, discretos bajo cada respuesta. Usa solo datos que ya trae agentInfo. */
function AgentBadge({ agentInfo }: { agentInfo: NonNullable<import('@/services/chatbot').ChatMessage['agentInfo']> }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-footnote tabular-nums text-muted-foreground">
      <span>{agentInfo.agentName}</span>
      <span>·</span>
      <span>{agentInfo.latencyMs > 1000 ? `${dec1((agentInfo.latencyMs / 1000))}s` : `${agentInfo.latencyMs}ms`}</span>
      {agentInfo.thinkingUsed && (
        <>
          <span>·</span>
          <span className="inline-flex items-center gap-1 text-cat-6-ink"><Brain className="size-3" /> deep think</span>
        </>
      )}
      {agentInfo.fallbackUsed && (
        <>
          <span>·</span>
          <span className="inline-flex items-center gap-1 text-ink-warn"><AlertTriangle className="size-3" /> fallback</span>
        </>
      )}
    </div>
  )
}

// ─── Sugerencias rápidas (inicio) ───────────────────────────────────
const QUICK_SUGGESTIONS = [
  'Reportar una falla',
  '¿Incidencias abiertas?',
  '¿Qué repuestos tenemos?',
  '¿Estado de los equipos?',
  'Resumen de la planta',
  'Historial de ARIA',
]

/** Tira de texto: hasta tres se reparten el ancho por igual; más de tres se deslizan en horizontal. */
function TiraSugerencias({ items, onSelect, disabled }: { items: string[]; onSelect: (text: string) => void; disabled?: boolean }) {
  const repartir = items.length <= 3
  return (
    <div className="flex h-11 overflow-x-auto">
      {items.map((s, i) => (
        <button
          key={`${i}-${s}`}
          onClick={() => onSelect(s)}
          disabled={disabled}
          className={`${repartir ? 'min-w-0 flex-1' : 'shrink-0'} h-11 whitespace-nowrap truncate px-3 text-footnote text-brand-ink transition-colors hover:bg-muted disabled:opacity-50 ${i > 0 ? 'border-l border-border' : ''}`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

function QuickSuggestions({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="border-t border-border bg-muted">
      <TiraSugerencias items={QUICK_SUGGESTIONS} onSelect={onSelect} />
    </div>
  )
}

// ─── Sugerencias contextuales (post-respuesta) ──────────────────────
function ContextualSuggestions({ suggestions, onSelect, disabled }: {
  suggestions: string[]
  onSelect: (text: string) => void
  disabled?: boolean
}) {
  if (!suggestions.length) return null
  return (
    <div className="mt-1 animate-in fade-in duration-300">
      <TiraSugerencias items={suggestions} onSelect={onSelect} disabled={disabled} />
    </div>
  )
}

/** Interruptor de la hoja Más (la misma pieza que el menú de la piel). */
function Interruptor({ encendido }: { encendido: boolean }) {
  return (
    <span aria-hidden className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${encendido ? 'bg-primary' : 'bg-muted'}`}>
      <span className={`absolute top-[2px] size-[22px] rounded-full bg-card shadow transition-[left] ${encendido ? 'left-[20px]' : 'left-[2px]'}`} />
    </span>
  )
}

/** true desde lg (1024 px): ventana de escritorio. Bajo lg el chat es una hoja con velo. */
function useEsEscritorio(): boolean {
  const consulta = '(min-width: 1024px)'
  const [es, setEs] = useState(() => window.matchMedia(consulta).matches)
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const alCambiar = () => setEs(mq.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])
  return es
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
    <div className="px-3 py-2 border-t border-transparent bg-fill-warning/[0.15] dark:border-transparent">
      <div className="flex items-center gap-2 mb-1.5">
        <AlertTriangle className="w-4 h-4 text-ink-warn flex-shrink-0" />
        <span className="text-xs text-ink-warn flex-1 font-medium">
          Borrador de incidencia ({completed}/{total} campos)
        </span>
      </div>
      {/* Progress bar */}
      <div className="flex gap-1 mb-2">
        {fields.map(f => (
          <div key={f.key} className="flex-1 flex flex-col items-center gap-0.5">
            <div className={`w-full h-1.5 rounded-full ${f.done ? 'bg-fill-ok' : 'bg-muted-foreground/[0.10]'}`} />
            <span className={`text-[9px] ${f.done ? 'text-ink-ok' : 'text-muted-foreground'}`}>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Selector de equipo con búsqueda (siempre visible) */}
      <div className="mb-2">
          <button
            onClick={() => { setShowEquipmentPicker(p => !p); setShowTechPicker(false) }}
            className="w-full text-left text-xs px-2 py-1.5 rounded-ctl border border-transparent bg-fill-warning/[0.15] transition-colors flex items-center justify-between"
          >
            <span className="truncate">
              <Factory className="inline size-3.5" /> {pendingData?.equipmentName
                ? `Equipo: ${pendingData.equipmentName as string}`
                : 'Seleccionar equipo...'}
            </span>
            <ChevronUp className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${showEquipmentPicker ? '' : 'rotate-180'}`} />
          </button>
          {showEquipmentPicker && (
            <div className="mt-1 rounded-ctl border border-border bg-background shadow-lg">
              {/* Buscador de equipos */}
              <div className="px-2 py-1.5 border-b border-border">
                <input
                  type="text"
                  value={equipmentSearch}
                  onChange={e => setEquipmentSearch(e.target.value)}
                  placeholder="Buscar equipo…"
                  className="w-full text-xs px-2 py-1 rounded-ctl border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              <div className="max-h-36 overflow-y-auto">
                {equipLoading ? (
                  <SkeletonFilas label="Cargando equipos" filas={3} lineas={1} cola={false} className="px-2 py-2" />
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
                        c.score >= 0.7 ? 'bg-fill-ok' : c.score >= 0.4 ? 'bg-fill-warning' : 'bg-muted-foreground'
                      }`} />
                      <span className="truncate flex-1" title={c.nombre}>{c.nombre}</span>
                      <span className="text-caption text-muted-foreground flex-shrink-0">{c.codigo}</span>
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
                className="w-full text-left text-xs px-2 py-1.5 rounded-ctl border border-transparent bg-ink-ok/[0.15] transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-3.5 h-3.5 text-ink-ok flex-shrink-0" />
                <span className="truncate"><HardHat className="inline size-3" /> Asignada a mí — <span className="text-muted-foreground italic">clic para quitar</span></span>
              </button>
            ) : (
              <button
                onClick={() => { if (userId && userName) onAssignTechnician(userId, userName) }}
                className="w-full text-left text-xs px-2 py-1.5 rounded-ctl border border-transparent bg-primary/[0.15] transition-colors flex items-center gap-2"
              >
                <span className="inline-flex items-center gap-1"><HardHat className="size-3" /> Autoasignarme esta incidencia</span>
              </button>
            )
          ) : (
            /* Admin/Supervisor: dropdown completo */
            <>
              <button
                onClick={() => { setShowTechPicker(p => !p); setShowEquipmentPicker(false) }}
                className="w-full text-left text-xs px-2 py-1.5 rounded-ctl border border-transparent bg-primary/[0.15] transition-colors flex items-center justify-between"
              >
                <span className="truncate">
                  <HardHat className="inline size-3" /> {currentTechName
                    ? `Asignado: ${currentTechName}`
                    : 'Asignar técnico (opcional)...'}
                </span>
                <ChevronUp className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${showTechPicker ? '' : 'rotate-180'}`} />
              </button>
              {showTechPicker && (
                <div className="mt-1 rounded-ctl border border-border bg-background shadow-lg">
                  <div className="px-2 py-1.5 border-b border-border">
                    <input
                      type="text"
                      value={techSearch}
                      onChange={e => setTechSearch(e.target.value)}
                      placeholder="Buscar técnico…"
                      className="w-full text-xs px-2 py-1 rounded-ctl border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {techLoading ? (
                      <SkeletonFilas label="Cargando técnicos" filas={3} lineas={1} cola={false} className="px-2 py-2" />
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
                          const RolIcon = t.rol === 'admin' ? KeyRound : t.rol === 'supervisor' ? ClipboardList : Wrench
                          return (
                            <button
                              key={t.id}
                              onClick={() => { onAssignTechnician(t.id, fullName); setShowTechPicker(false); setTechSearch('') }}
                              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2 border-b border-border last:border-0 ${
                                currentTechId === t.id ? 'bg-primary/10 font-medium' : ''
                              }`}
                            >
                              <RolIcon className="size-3 shrink-0 text-muted-foreground" />
                              <span className="truncate flex-1" title={fullName}>{fullName}</span>
                              <span className="text-caption text-muted-foreground flex-shrink-0 capitalize">{t.rol}</span>
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
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-ctl bg-ink-ok/[0.15] text-ink-ok hover:brightness-95 transition-colors font-medium"
        >
          <CheckCircle className="w-3 h-3" />
          Confirmar
        </button>
        <button
          onClick={onModify}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-ctl bg-primary/[0.12] text-brand-ink hover:bg-primary/[0.12] transition-colors font-medium"
        >
          <Pencil className="size-3" />
          Modificar
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-ctl bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
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
  const pantallaCompletaMovil = useBurbujaChatOculta()
  // Se esconde mientras la página baja. Con el chat abierto nunca se esconde: hay que poder cerrarlo.
  const ocultoAlBajar = useOcultarAlBajar()
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
  // Abrir ARIA desde fuera (menú ⋯ de Repuestos): solo abre, no cierra si ya estaba abierto.
  // Desde una herramienta del Centro de aprendizaje se abre como HOJA (media pantalla en el celular,
  // panel lateral en PC) con el contexto de la herramienta; es el MISMO chat, solo cambia el marco.
  const [hoja, setHoja] = useHojaAria(isOpen)
  const abrirDesdeFuera = useRef<(c?: string, o?: OpcionesAria) => void>(() => {})
  abrirDesdeFuera.current = (c, o) => {
    if (!isOpen) toggle()
    setHoja(o?.hoja ? { contexto: o.contexto ?? '' } : null)
    if (c) setInput(c)
  }
  useEffect(() => registrarAbrirAria((c, o) => abrirDesdeFuera.current(c, o)), [])
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const agentSelectorRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Modo conversación (manos libres): escucha → envía → habla → vuelve a escuchar
  const [convoMode, setConvoMode] = useState(false)
  const convoModeRef = useRef(false)
  useEffect(() => { convoModeRef.current = convoMode }, [convoMode])
  const prevLoadingRef = useRef(false)

  // Avatar de video + auto-leer respuestas. Preferencia POR DISPOSITIVO en localStorage
  // (igual que aria_chat_width): settings/ariaConfig es global/admin, esto es personal.
  const [avatarShow, setAvatarShow] = useState<boolean>(() => {
    try { return localStorage.getItem('aria_avatar_show') !== '0' } catch { return true } // default ON
  })
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    try { return localStorage.getItem('aria_avatar_autospeak') === '1' } catch { return false } // default OFF
  })
  useEffect(() => { try { localStorage.setItem('aria_avatar_show', avatarShow ? '1' : '0') } catch { /* ignore */ } }, [avatarShow])
  useEffect(() => { try { localStorage.setItem('aria_avatar_autospeak', autoSpeak ? '1' : '0') } catch { /* ignore */ } }, [autoSpeak])
  // Retrato de ARIA: al hablar (onSpeakingChange) se abre el grande en celular con la frase en curso.
  const [hablando, setHablando] = useState(false)
  const [fraseEnCurso, setFraseEnCurso] = useState('')
  useEffect(() => onSpeakingChange(setHablando), [])
  const esPC = useEsEscritorio()
  const [showMas, setShowMas] = useState(false)
  const masRef = useRef<HTMLDivElement>(null)

  // ─── Chat width (resizable) ──────────────────────────────
  const MIN_WIDTH = 380
  const MAX_WIDTH = 1200
  const DEFAULT_WIDTH = 1200

  const [chatWidth, setChatWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('aria_chat_width_v2')
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
      try { localStorage.setItem('aria_chat_width_v2', String(chatWidth)) } catch { /* ignore */ }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [chatWidth])

  // Persist width changes
  useEffect(() => {
    try { localStorage.setItem('aria_chat_width_v2', String(chatWidth)) } catch { /* ignore */ }
  }, [chatWidth])

  const { isListening, transcript, startListening, stopListening, isSupported: voiceSupported } = useSpeechRecognition()

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, streamingContent])

  // Cargar preferencia de voz (Configuración → ARIA) cada vez que se abre: el servidor de la voz de Aiko pudo encenderse después.
  useEffect(() => {
    loadVoicePref()
  }, [isOpen])

  // iOS exige un toque para permitir sonido; la respuesta llega segundos después.
  useEffect(() => {
    const opciones = { capture: true, passive: true }
    document.addEventListener('touchend', desbloquearAudio, opciones)
    document.addEventListener('click', desbloquearAudio, opciones)
    return () => {
      document.removeEventListener('touchend', desbloquearAudio, opciones)
      document.removeEventListener('click', desbloquearAudio, opciones)
    }
  }, [])

  // Esc cierra la hoja (la herramienta de atrás queda tal cual).
  useEffect(() => {
    if (!isOpen || !hoja) return
    const alTeclear = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') toggle() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [isOpen, hoja, toggle])

  // Focus input al abrir (en la hoja no: el teclado taparía la mitad que ocupa)
  useEffect(() => {
    if (isOpen && !hoja && esPC) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen, hoja, esPC])

  // Llenar input cuando termina la transcripción de voz.
  // En modo conversación, en vez de llenar el input, ENVÍA directo.
  useEffect(() => {
    if (transcript && !isListening) {
      if (convoModeRef.current) {
        const t = transcript.trim()
        if (t) sendMessage(resolveSlashCommand(t))
      } else {
        setInput(prev => prev ? `${prev} ${transcript}` : transcript)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, isListening])

  // Al terminar una respuesta, leerla en voz alta si está el modo conversación
  // (manos libres → re-escucha) o el toggle "🔊 Escuchar" (auto-lee, sin re-escuchar).
  // En ambos casos, speak() anima el avatar de video vía onSpeakingChange.
  useEffect(() => {
    const wasLoading = prevLoadingRef.current
    prevLoadingRef.current = isLoading
    if ((!convoModeRef.current && !autoSpeak) || !wasLoading || isLoading) return
    const last = messages[messages.length - 1]
    const text = last && last.role === 'assistant' ? last.content : ''
    const plain = text
      .replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '')
      .replace(/\[\[.*?\]\]/g, '').replace(/\n?\[SUGERENCIAS\]\s*:.*$/im, '')
    const relisten = () => { if (convoModeRef.current) startListening() }
    if (plain.trim()) {
      setFraseEnCurso(plain)
      speak(plain, { onend: relisten, onerror: relisten })
    } else {
      relisten()
    }
  }, [isLoading, messages, startListening, autoSpeak])



  const toggleConvo = () => {
    if (convoMode) {
      setConvoMode(false)
      stopListening()
      stopSpeaking()
    } else {
      setConvoMode(true)
      startListening()
    }
  }

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

  // Menú Más: se cierra al tocar fuera (incluye la lista de modelos que vive dentro)
  useEffect(() => {
    if (!showMas) return
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest?.('[aria-label="Más opciones"]')) return
      if (masRef.current && !masRef.current.contains(el)) {
        setShowMas(false)
        setShowAgentSelector(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMas])

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
    { cmd: '/lagunas', desc: 'Qué no supe responder', expand: '/lagunas' },
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
      if (tpls.length === 0) return [{ label: '(Sin plantillas guardadas — usa la estrella para guardar)', value: '', isTemplate: false, templateId: '' }]
      return tpls.map(t => ({ label: t.label, value: t.text, isTemplate: true, templateId: t.id }))
    }
    if (trimmed.startsWith('/')) {
      return SLASH_COMMANDS
        .filter(sc => sc.cmd.startsWith(trimmed) || trimmed === '/')
        .map(sc => ({ label: `${sc.cmd} — ${sc.desc}`, value: sc.cmd, isTemplate: false, templateId: '' }))
    }
    if (trimmed.length === 0 && showRecents) {
      return getRecentSearches().map(s => ({ label: s, value: s, isTemplate: false, templateId: '' }))
    }
    return []
  })()

  const nombreModelo = selectedAgent ? (availableAgents().find(a => a.id === selectedAgent)?.name ?? selectedAgent) : 'Automático'
  const estadoCabecera = hablando
    ? 'Hablando con la voz de Aiko'
    : pendingAction?.status === 'confirming'
      ? 'Acción pendiente de confirmación'
      : thinkingEnabled
        ? 'Pensamiento profundo · IA'
        : 'IA · Datos en tiempo real'

  return (
    <>
      {/* Panel de chat */}
      {isOpen && (hoja || !esPC) && (
        <div className="fixed inset-0 z-[39] bg-black/35 piel-fade-in lg:hidden" onClick={toggle} aria-hidden />
      )}
      {isOpen && (
        <div
          style={hoja || !esPC ? undefined : { width: `min(${chatWidth}px, calc(100vw - 240px))` }}
          role={hoja || !esPC ? 'dialog' : undefined}
          aria-label={hoja || !esPC ? 'ARIA' : undefined}
          className={hoja
            ? 'fixed inset-x-0 bottom-0 z-40 flex h-[58dvh] max-h-[calc(100dvh-4rem)] flex-col overflow-hidden rounded-t-panel border-t border-border bg-secondary pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_50px_rgba(0,0,0,0.3)] piel-sheet-in lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-20 lg:h-auto lg:max-h-none lg:w-[28rem] lg:rounded-card lg:border'
            : !esPC
              ? 'fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+8px)] z-40 flex flex-col overflow-hidden rounded-t-panel border-t border-border bg-secondary pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_50px_rgba(0,0,0,0.3)] piel-sheet-in'
              : 'fixed bottom-20 top-4 right-4 z-40 max-w-[calc(100vw-240px)] flex flex-col overflow-hidden bg-secondary border border-border rounded-card shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 landscape-mobile-hidden'}
        >
          {/* Resize handle (left edge) */}
          {!hoja && esPC && <div
            onMouseDown={handleResizeStart}
            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-10 group flex items-center"
            title="Arrastrar para redimensionar"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary/20 rounded-r px-px py-6">
              <GripVertical className="w-3 h-3 text-primary/60" />
            </div>
          </div>}
          {/* Celular: tirador de la hoja */}
          {!esPC && !hoja && <div aria-hidden className="absolute left-1/2 top-1.5 h-[5px] w-9 -translate-x-1/2 rounded-full bg-muted-foreground/40" />}
          {/* Cabecera: retrato de 40 px, título y estado. Solo quedan Más y Cerrar; lo demás está en Más. */}
          <div className="relative flex shrink-0 items-center gap-3 px-4 pb-2 pt-5">
            {!esPC && avatarShow && !hablando && <AriaAvatar visible={avatarShow} tamano="circulo" />}
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-headline">ARIA</h3>
              <p className="flex min-w-0 items-center gap-1.5 text-footnote text-muted-foreground">
                {hablando && <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full bg-primary animate-pulse" />}
                <span className="truncate">{estadoCabecera}</span>
              </p>
            </div>
            <div className="flex h-11 shrink-0 items-center rounded-full bg-muted">
              <button
                onClick={() => setShowMas(v => !v)}
                aria-label="Más opciones"
                aria-expanded={showMas}
                title="Más opciones"
                className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-background"
              >
                <MoreHorizontal className="size-5" />
              </button>
              <button
                onClick={toggle}
                aria-label="Cerrar"
                title="Cerrar"
                className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-background"
              >
                <X className="size-5" />
              </button>
            </div>
            {showMas && (
              <div
                ref={masRef}
                className="absolute right-3 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-card bg-card py-1 shadow-xl animate-in fade-in duration-150"
              >
                {canThink && (
                  <div ref={agentSelectorRef}>
                    <button
                      onClick={() => setShowAgentSelector(p => !p)}
                      aria-expanded={showAgentSelector}
                      className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
                    >
                      <Cpu className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-body">Modelo</span>
                      <span className="max-w-[8rem] truncate text-footnote text-muted-foreground">{nombreModelo}</span>
                      <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${showAgentSelector ? 'rotate-180' : ''}`} />
                    </button>
                    {showAgentSelector && (
                      <div className="pb-1">
                        <button
                          onClick={() => { changeAgent(null); setShowAgentSelector(false) }}
                          className={`flex w-full items-center gap-2 px-6 py-2 text-left text-footnote hover:bg-muted ${!selectedAgent ? 'font-medium text-brand-ink' : 'text-foreground'}`}
                        >
                          <RefreshCw className="size-3.5 shrink-0" />
                          <span className="flex-1">Auto <span className="text-muted-foreground">(ARIA elige)</span></span>
                          {!selectedAgent && <Check className="size-3.5 text-primary" />}
                        </button>
                        {availableAgents().map(agent => (
                          <button
                            key={agent.id}
                            onClick={() => { changeAgent(agent.id); setShowAgentSelector(false) }}
                            className={`flex w-full items-center gap-2 px-6 py-2 text-left text-footnote hover:bg-muted ${selectedAgent === agent.id ? 'font-medium text-brand-ink' : 'text-foreground'}`}
                          >
                            <span className="w-5 shrink-0 text-center">{agent.emoji}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate">{agent.name}</span>
                                <span className={`inline-block size-1.5 shrink-0 rounded-full ${
                                  agent.status === 'online' ? 'bg-fill-ok'
                                  : agent.status === 'rate-limited' ? 'bg-fill-warning'
                                  : agent.status === 'disabled' ? 'bg-muted-foreground'
                                  : 'bg-fill-critical'
                                }`} />
                              </span>
                              <span className="block text-caption text-muted-foreground">
                                {agent.costTier === 'free' ? 'Gratis' : agent.costTier === 'cheap' ? 'Económico' : 'Moderado'}
                                {' · '}
                                {agent.status === 'online' ? 'Disponible' : agent.status === 'disabled' ? 'Sin API key' : agent.status}
                              </span>
                            </span>
                            {selectedAgent === agent.id && <Check className="size-3.5 text-primary" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {canThink && (
                  <button onClick={toggleThinking} role="switch" aria-checked={thinkingEnabled} className="flex min-h-12 w-full items-center gap-3 px-4 text-left">
                    <Brain className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-body">Pensamiento profundo</span>
                    <Interruptor encendido={thinkingEnabled} />
                  </button>
                )}
                <button onClick={() => setAvatarShow(v => !v)} role="switch" aria-checked={avatarShow} className="flex min-h-12 w-full items-center gap-3 px-4 text-left">
                  {avatarShow ? <Eye className="size-4 shrink-0 text-muted-foreground" /> : <EyeOff className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 text-body">Mostrar a ARIA</span>
                  <Interruptor encendido={avatarShow} />
                </button>
                <button
                  onClick={() => { if (autoSpeak) stopSpeaking(); setAutoSpeak(v => !v) }}
                  role="switch"
                  aria-checked={autoSpeak}
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
                >
                  {autoSpeak ? <Volume2 className="size-4 shrink-0 text-muted-foreground" /> : <VolumeX className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 text-body">Leer en voz alta</span>
                  <Interruptor encendido={autoSpeak} />
                </button>
                <button
                  onClick={() => { setShowMas(false); clearHistory() }}
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-destructive"
                >
                  <Trash2 className="size-4 shrink-0" />
                  <span className="flex-1 text-body">Limpiar conversación</span>
                </button>
              </div>
            )}
          </div>

          {hoja?.contexto && <ContextoHojaAria contexto={hoja.contexto} />}

          {/* Cuerpo: conversación. En escritorio, el riel de ARIA va a la derecha (300 px). */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Celular: al hablar se abre el retrato grande con la frase en curso */}
            {!esPC && !hoja && avatarShow && hablando && (
              <div className="shrink-0">
                <AriaAvatar visible={avatarShow} tamano="escenario" />
                <p className="line-clamp-3 px-4 pb-1 pt-3 text-title3">{fraseEnCurso}</p>
              </div>
            )}
          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-3" onClick={handleInternalLinkClick}>
            <div className="mx-auto w-full space-y-3 lg:max-w-[820px]">
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
                        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-primary transition-colors px-2 py-0.5 rounded-ctl hover:bg-muted"
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
                    <span className="text-caption text-muted-foreground">
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
          </div>
          </div>
          {/* Escritorio: riel de ARIA (retrato de 300 px) */}
          {esPC && avatarShow && (
            <div className="flex w-[300px] shrink-0 flex-col border-l border-border bg-card p-3">
              <AriaAvatar visible={avatarShow} tamano="riel" />
            </div>
          )}
          </div>

          {/* Sugerencias rápidas */}
          {messages.length <= 1 && !isLoading && (
            <QuickSuggestions onSelect={handleQuickSelect} />
          )}

          {/* Barra de acción pendiente — solo incidencias (campos/selector de equipo
              específicos de ese flujo). Crear/editar repuesto confirma por texto
              plano ("sí"/"no"), igual que ARIA en Telegram — el mensaje del
              asistente ya deja explícito "¿Confirmas? (Sí / No)". */}
          {pendingAction?.status === 'confirming' && pendingAction.type === 'create_incident' && !isLoading && (
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
              <div className="absolute bottom-full left-0 right-0 mx-3 mb-1 bg-background border border-border rounded-card shadow-lg max-h-48 overflow-y-auto z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
                {input.trim().toLowerCase().startsWith('/mis') && (
                  <div className="px-3 py-1 text-caption text-muted-foreground border-b border-border"><Star className="inline size-3" /> Mis plantillas guardadas</div>
                )}
                {input.trim().startsWith('/') && !input.trim().toLowerCase().startsWith('/mis') && (
                  <div className="px-3 py-1 text-caption text-muted-foreground border-b border-border"><Zap className="inline size-3" /> Comandos rápidos</div>
                )}
                {!input.trim().startsWith('/') && showRecents && (
                  <div className="px-3 py-1 text-caption text-muted-foreground border-b border-border"><Clock className="inline size-3" /> Búsquedas recientes</div>
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
                      className="flex flex-1 items-center gap-1.5 px-3 py-2 text-left text-xs"
                    >
                      {item.isTemplate && <Star className="size-3 shrink-0 text-ink-warn" aria-label="Plantilla guardada" />}
                      <span className="truncate">{item.label}</span>
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
                  className={`p-2 rounded-card transition-colors ${showRecents ? 'bg-primary/10 text-brand-ink' : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'}`}
                  title={showRecents ? 'Ocultar recientes' : 'Búsquedas recientes'}
                >
                  <ChevronUp className={`w-4 h-4 transition-transform ${showRecents ? '' : 'rotate-180'}`} />
                </button>
              )}
              {/* Botón de foto */}
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={isLoading || photoFiles.length >= 3}
                className="p-2 rounded-card bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
                title={photoFiles.length >= 3 ? 'Máximo 3 fotos' : 'Adjuntar foto'}
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {/* Modo conversación manos libres */}
              {voiceSupported && (
                <button
                  onClick={toggleConvo}
                  className={`p-2 rounded-card transition-colors ${
                    convoMode
                      ? 'bg-primary text-primary-foreground animate-pulse'
                      : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  }`}
                  title={convoMode ? 'Salir del modo conversación' : 'Modo conversación (manos libres)'}
                >
                  <Headphones className="w-4 h-4" />
                </button>
              )}

              {/* Botón de voz */}
              {voiceSupported && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isLoading}
                  className={`p-2 rounded-card transition-colors ${
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
                placeholder={isListening ? 'Escuchando...' : pendingAction?.status === 'confirming' ? 'Sí / No / Modificar...' : esPC ? 'Pregunta, /comando o describe una falla...' : 'Pregunta…'}
                disabled={isLoading}
                className="min-w-0 flex-1 text-sm px-3 py-2 rounded-card border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 placeholder:text-muted-foreground"
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
                className="p-2 rounded-card bg-muted text-muted-foreground hover:text-ink-warn hover:bg-muted/80 disabled:opacity-30 transition-colors"
                title="Guardar como plantilla"
              >
                <Star className="w-4 h-4" />
              </button>

              <button
                onClick={handleSend}
                disabled={(!input.trim() && photoFiles.length === 0) || isLoading}
                className="p-2 rounded-card bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Enviar"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-caption text-muted-foreground mt-1 text-center">
              ARIA v6 · /ayuda · /mis para plantillas
            </p>
          </div>
        </div>
      )}

      {/* Botón flotante — oculto en landscape móvil para no tapar la tabla */}
      <button
        onClick={toggle}
        className={`fixed bottom-24 lg:bottom-4 right-4 z-[45] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 landscape-mobile-hidden ${
          // Detalle de repuesto a pantalla completa en el teléfono: la burbuja tapaba su barra inferior.
          (pantallaCompletaMovil && !isOpen) || hoja || (isOpen && !esPC) ? 'hidden' : ''
        } ${
          // Oculto al bajar (transform/opacity). Con el chat abierto no se oculta.
          ocultoAlBajar && !isOpen ? 'opacity-0 translate-y-24 pointer-events-none motion-reduce:transition-none' : 'opacity-100 translate-y-0'
        } ${
          isOpen
            ? 'bg-muted text-muted-foreground hover:bg-muted/80'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
        title={isOpen ? 'Cerrar chat' : 'Abrir asistente'}
        aria-hidden={ocultoAlBajar && !isOpen ? true : undefined}
        tabIndex={ocultoAlBajar && !isOpen ? -1 : undefined}
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
