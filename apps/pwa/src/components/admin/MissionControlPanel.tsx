/**
 * MissionControlPanel — Sala de control de agentes IA
 *
 * Muestra:
 * - Status en tiempo real de cada agente (Online/Rate-limited/Offline/Disabled)
 * - Log de misiones con resultados, fallbacks, latencia
 * - Configuración: habilitar/deshabilitar agentes, prioridades
 * - Estadísticas: requests y tokens por agente
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Switch,
  Spinner,
} from '@/components/ui'
import {
  Satellite,
  RefreshCw,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Brain,
  TrendingUp,
  MessageSquare,
  AlertTriangle,
  Trash2,
  Eye,
  Code2,
  BarChart3,
  Wrench,
  ThumbsUp,
  ThumbsDown,
  Dot,
  Check,
  HelpCircle,
  X,
  ChevronRight,
} from 'lucide-react'
import {
  getAllAgents,
  getAgentsConfig,
  saveAgentsConfig,
  loadTodayLogs,
  getMissionLogs,
  getTodayCostSummary,
  type AIAgent,
  type AgentsConfig,
  type MissionLog,
} from '@/services/aiAgents'
import {
  getLearningStats,
  deleteCorrection,
  toggleCorrection,
  type LearningStats,
  type AriaCorrection,
} from '@/services/ariaLearning'
import { ListCell, ListGroup } from '@/components/piel'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'
import { dec1, dec2 } from '@/utils/formatoNumeros'

// ═══════════════════════════════════════════════════════════════════════
// STATUS HELPERS
// ═══════════════════════════════════════════════════════════════════════

function statusColor(status: AIAgent['status']): string {
  switch (status) {
    case 'online': return 'bg-fill-ok'
    case 'rate-limited': return 'bg-fill-warning'
    case 'offline': return 'bg-fill-critical'
    case 'disabled': return 'bg-muted-foreground'
    default: return 'bg-muted-foreground'
  }
}

function CorrectionRow({ correction: c, onDelete, onToggle }: {
  correction: AriaCorrection
  onDelete: (id: string) => void
  onToggle: (id: string, active: boolean) => void
}) {
  return (
    <div className={`flex items-start gap-2 p-2 rounded-ctl border text-xs ${c.active ? 'border-transparent bg-ink-warn/[0.15]' : 'border-border bg-muted opacity-60'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1 text-muted-foreground" title={c.userQuery}>
          <HelpCircle className="mt-0.5 size-2.5 shrink-0" aria-label="Preguntó" />
          <span className="truncate">"{c.userQuery}"</span>
        </div>
        <div className="flex items-start gap-1 text-ink-crit text-caption" title={c.wrongResponse}>
          <X className="mt-0.5 size-2.5 shrink-0" aria-label="Respuesta incorrecta" />
          <span className="truncate">{c.wrongResponse.slice(0, 80)}...</span>
        </div>
        <div className="flex items-start gap-1 text-ink-ok text-caption">
          <Check className="mt-0.5 size-2.5 shrink-0" aria-label="Respuesta correcta" />
          <span>{c.correctResponse.slice(0, 120)}</span>
        </div>
        {c.equipmentName && <div className="flex items-center gap-1 text-caption text-muted-foreground"><Wrench className="size-2.5" /> {c.equipmentName}</div>}
        <div className="text-caption text-muted-foreground mt-0.5">Usada {c.usageCount}x</div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={() => onToggle(c.id!, !c.active)}
          className="text-caption px-1.5 py-0.5 rounded-ctl border border-border hover:bg-muted"
          title={c.active ? 'Desactivar' : 'Activar'}
        >
          {c.active ? 'Off' : 'On'}
        </button>
        <button
          onClick={() => onDelete(c.id!)}
          className="p-0.5 rounded-ctl hover:bg-ink-crit/[0.15] text-ink-crit"
          title="Eliminar corrección"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function statusLabel(status: AIAgent['status']): string {
  switch (status) {
    case 'online': return 'En línea'
    case 'rate-limited': return 'En su límite'
    case 'offline': return 'Sin conexión'
    case 'disabled': return 'Deshabilitado'
    default: return status
  }
}

function statusBadgeVariant(status: MissionLog['status']): 'default' | 'destructive' | 'outline' {
  switch (status) {
    case 'success': return 'default'
    case 'fallback': return 'outline'
    case 'error': return 'destructive'
    default: return 'outline'
  }
}

/** Ícono por capacidad del agente. Devuelve COMPONENTE, no emoji: así hereda
 *  color y tamaño del tema, y se ve igual en Windows, Android e iOS. */
function capabilityIcon(cap: string) {
  switch (cap) {
    case 'reasoning': return Brain
    case 'vision': return Eye
    case 'code': return Code2
    case 'speed': return Zap
    case 'general': return RefreshCw
    case 'analysis': return BarChart3
    default: return Dot
  }
}

type Tono = 'ok' | 'warning' | 'critical'
const PUNTO: Record<Tono, string> = { ok: 'bg-fill-ok', warning: 'bg-fill-warning', critical: 'bg-fill-critical' }

function tonoPorUmbral(valor: number, bueno: number, regular: number): Tono {
  return valor >= bueno ? 'ok' : valor >= regular ? 'warning' : 'critical'
}

/** Cifra con rótulo. El número va siempre en tinta neutra; el estado, en el punto. */
function Cifra({ valor, rotulo, tono, dentro = false }: {
  valor: ReactNode
  rotulo: string
  tono?: Tono
  /** `true` dentro de una tarjeta: relleno gris en vez de tarjeta sobre tarjeta. */
  dentro?: boolean
}) {
  return (
    <div className={`rounded-card p-3 text-center ${dentro ? 'bg-muted' : 'bg-card'}`}>
      <div className={`${dentro ? 'text-title3' : 'text-title2'} font-bold tabular-nums`}>{valor}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1.5 text-footnote text-muted-foreground">
        {tono && <span aria-hidden className={`size-2 shrink-0 rounded-full ${PUNTO[tono]}`} />}
        {rotulo}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export function MissionControlPanel() {
  const { user } = useAuthStore()
  const { toast } = useToast()
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [config, setConfig] = useState<AgentsConfig>({ disabledAgents: [], priorityOverrides: {} })
  const [logs, setLogs] = useState<MissionLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [cfg, todayLogs, lStats] = await Promise.all([
        getAgentsConfig(),
        loadTodayLogs(),
        getLearningStats(),
      ])
      setConfig(cfg)
      setAgents(getAllAgents())
      setLearningStats(lStats)
      // Merge memory logs + firestore logs, dedup by id
      const memoryLogs = getMissionLogs(100)
      const allLogs = [...memoryLogs, ...todayLogs]
      const seen = new Set<string>()
      const uniqueLogs = allLogs.filter(l => {
        if (seen.has(l.id)) return false
        seen.add(l.id)
        return true
      }).sort((a, b) => b.timestamp - a.timestamp)
      setLogs(uniqueLogs.slice(0, 100))
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh cada 10s (local) + learning stats cada 30s (Firestore)
  useEffect(() => {
    if (!autoRefresh) return
    let tick = 0
    const interval = setInterval(async () => {
      setAgents(getAllAgents())
      setLogs(getMissionLogs(100))
      tick++
      // Re-fetch learning stats from Firestore every 30s (every 3rd tick)
      if (tick % 3 === 0) {
        try {
          const lStats = await getLearningStats()
          setLearningStats(lStats)
        } catch { /* silent */ }
      }
    }, 10_000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleToggleAgent = async (agentId: string, enabled: boolean) => {
    const newDisabled = enabled
      ? config.disabledAgents.filter(id => id !== agentId)
      : [...config.disabledAgents, agentId]
    const newConfig = { ...config, disabledAgents: newDisabled }
    setConfig(newConfig)
    setIsSaving(true)
    try {
      await saveAgentsConfig(newConfig, user?.id || '')
      setAgents(getAllAgents())
      toast({ title: enabled ? 'Agente habilitado' : 'Agente deshabilitado' })
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const onlineCount = agents.filter(a => a.status === 'online').length
  const totalRequests = agents.reduce((s, a) => s + a.usedToday, 0)
  const totalTokens = agents.reduce((s, a) => s + a.tokensToday, 0)
  const costSummary = getTodayCostSummary()
  const totalCostUsd = costSummary.reduce((s, c) => s + c.estimatedCostUsd, 0)
  const successRate = logs.length > 0
    ? Math.round((logs.filter(l => l.status === 'success' || l.status === 'fallback').length / logs.length) * 100)
    : 100

  return (
    <div className="space-y-6">
      {/* ─── Encabezado ─── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-title3 font-semibold">Control de misión de ARIA</h2>
          <p className="text-subhead text-muted-foreground">
            Orquestación de agentes · {onlineCount} de {agents.length} en línea
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            aria-pressed={autoRefresh}
            className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-subhead text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span aria-hidden className={`size-2 rounded-full ${autoRefresh ? 'bg-fill-ok' : 'bg-muted-foreground/50'}`} />
            {autoRefresh ? 'En vivo' : 'En pausa'}
          </button>
          <button
            type="button"
            onClick={loadData}
            aria-label="Actualizar"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <RefreshCw className="size-5" />
          </button>
        </div>
      </div>

      {/* ─── Cifras del día ─── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Cifra
          valor={onlineCount}
          rotulo="Agentes en línea"
          tono={onlineCount === agents.length ? 'ok' : onlineCount > 0 ? 'warning' : 'critical'}
        />
        <Cifra valor={totalRequests} rotulo="Solicitudes hoy" />
        <Cifra valor={totalTokens > 1000 ? `${Math.round(totalTokens / 1000)}K` : totalTokens} rotulo="Tokens hoy" />
        <Cifra valor={`${successRate} %`} rotulo="Tasa de éxito" tono={tonoPorUmbral(successRate, 90, 70)} />
        <div className="col-span-2 md:col-span-1">
          <Cifra
            valor={`$${totalCostUsd < 0.01 && totalCostUsd > 0 ? '<0,01' : dec2(totalCostUsd)}`}
            rotulo="Costo estimado (USD)"
          />
        </div>
      </div>

      {/* ─── Agentes ─── */}
      <ListGroup title="Agentes de IA" footer="El punto indica el estado: verde en línea, ámbar en su límite, rojo sin conexión.">
        {agents.map((agent) => {
          const isEnabled = !config.disabledAgents.includes(agent.id)
          const hasKey = agent.status !== 'disabled' || isEnabled
          const cost = costSummary.find(c => c.agentId === agent.id)?.estimatedCostUsd || 0
          const tokens = agent.tokensToday > 1000 ? `${Math.round(agent.tokensToday / 1000)}K` : `${agent.tokensToday}`
          return (
            <ListCell
              key={agent.id}
              leading={
                <span className="flex w-7 justify-center" title={statusLabel(agent.status)}>
                  <span aria-hidden className={`size-2.5 rounded-full ${statusColor(agent.status)}`} />
                </span>
              }
              title={
                <span className="inline-flex items-center gap-2">
                  {agent.name}
                  {agent.thinking && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">Razona</span>
                  )}
                </span>
              }
              subtitle={
                // Texto en línea (no flex): así el recorte a una línea de la celda sí aplica.
                <>
                  {agent.provider} · P{agent.priority} · {agent.costTier} · {statusLabel(agent.status)}{' '}
                  <span className="ml-1 inline-flex translate-y-0.5 items-center gap-1" aria-label={`Capacidades: ${agent.capabilities.join(', ')}`}>
                    {agent.capabilities.map(c => {
                      const Icon = capabilityIcon(c)
                      return <Icon key={c} className="size-3" aria-hidden />
                    })}
                  </span>
                </>
              }
              value={`${agent.usedToday} solicitudes`}
              valueSub={`${tokens} tokens${cost > 0 ? ` · $${cost < 0.01 ? '<0,01' : cost.toFixed(3)}` : ''}`}
              trailing={
                <Switch
                  checked={isEnabled && hasKey}
                  onCheckedChange={(checked: boolean) => handleToggleAgent(agent.id, checked)}
                  disabled={isSaving}
                  aria-label={`Usar ${agent.name}`}
                />
              }
            />
          )
        })}
      </ListGroup>

      {/* ─── Mission Log ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-headline">
            Registro de misiones
            <span className="ml-auto text-footnote font-normal text-muted-foreground tabular-nums">
              {logs.length} hoy
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {logs.slice(0, 50).map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                  {/* Status icon */}
                  {log.status === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-ink-ok shrink-0" />
                  ) : log.status === 'fallback' ? (
                    <ArrowRightLeft className="h-3.5 w-3.5 text-ink-warn shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-ink-crit shrink-0" />
                  )}

                  {/* Time */}
                  <span className="text-muted-foreground font-mono w-12 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* Task type */}
                  <Badge variant={statusBadgeVariant(log.status)} className="text-caption px-1 py-0 shrink-0">
                    {log.taskType}
                  </Badge>

                  {/* Agent */}
                  <span className="font-medium shrink-0">{log.agentName}</span>

                  {/* Preview */}
                  <span className="text-muted-foreground truncate flex-1 min-w-0" title={log.taskPreview}>
                    {log.taskPreview}
                  </span>

                  {/* Latency + tokens + cost */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-0.5 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {log.latencyMs > 1000 ? `${dec1((log.latencyMs / 1000))}s` : `${log.latencyMs}ms`}
                    </span>
                    {log.tokens > 0 && (
                      <span className="flex items-center gap-0.5 text-muted-foreground">
                        <Zap className="h-3 w-3" />
                        {log.tokens}
                      </span>
                    )}
                    {(log.estimatedCostUsd ?? 0) > 0 && (
                      <span className="text-caption tabular-nums text-muted-foreground">
                        ${(log.estimatedCostUsd ?? 0).toFixed(4)}
                      </span>
                    )}
                  </div>

                  {/* Fallback indicator */}
                  {log.status === 'fallback' && log.fallbackTo && (
                    <span className="text-ink-warn" title={`Pasó a ${log.fallbackTo}`}>
                      <ArrowRightLeft className="h-3 w-3" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Satellite className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No hay misiones registradas aún.
              <br />
              <span className="text-xs">Las misiones se registran cuando ARIA usa agentes IA.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── API Keys (admin) ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-headline">
            Aprendizaje de ARIA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {learningStats ? (
            <>
              {/* Cifras de aprendizaje: neutras; la satisfacción lleva su punto */}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Cifra dentro valor={learningStats.totalFeedback} rotulo="Valoraciones" />
                <Cifra
                  dentro
                  valor={`${learningStats.satisfactionRate} %`}
                  rotulo="Satisfacción"
                  tono={learningStats.totalFeedback > 0 ? tonoPorUmbral(learningStats.satisfactionRate, 70, 40) : undefined}
                />
                <Cifra dentro valor={learningStats.totalKnowledge} rotulo="Conocimientos" />
                <Cifra dentro valor={learningStats.activeCorrections} rotulo="Correcciones" />
              </div>

              {/* Gráfico de satisfacción por día (barras simples CSS) */}
              {learningStats.feedbackByDay.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-footnote font-semibold">Tendencia de satisfacción</span>
                  </div>
                  <div className="flex items-end gap-0.5 h-16">
                    {learningStats.feedbackByDay.slice(-14).map((day, i) => {
                      const total = day.positive + day.negative
                      const rate = total > 0 ? (day.positive / total) * 100 : 100
                      const height = total > 0 ? Math.max(8, (total / Math.max(...learningStats.feedbackByDay.map(d => d.positive + d.negative))) * 100) : 5
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                          <div
                            className={`w-full rounded-t ${rate >= 70 ? 'bg-fill-ok' : rate >= 40 ? 'bg-fill-warning' : 'bg-fill-critical'} transition-all`}
                            style={{ height: `${height}%`, minHeight: 2 }}
                          />
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-caption px-1 py-0.5 rounded-ctl shadow whitespace-nowrap z-10">
                            {day.date.slice(5)}: {day.positive}<ThumbsUp className="inline size-3" /> {day.negative}<ThumbsDown className="inline size-3" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between text-caption text-muted-foreground mt-0.5">
                    <span>{learningStats.feedbackByDay.slice(-14)[0]?.date.slice(5) || ''}</span>
                    <span>Hoy</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-caption text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-fill-ok" /> &ge;70%</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-fill-warning" /> 40-69%</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-fill-critical" /> &lt;40%</span>
                  </div>
                </div>
              )}

              {/* Desglose de métricas */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 rounded-ctl bg-muted p-2">
                  <MessageSquare className="h-3.5 w-3.5 text-ink-ok" />
                  <div>
                    <div className="font-medium">{learningStats.positiveFeedback} {learningStats.positiveFeedback === 1 ? 'positiva' : 'positivas'}</div>
                    <div className="text-caption text-muted-foreground">Respuestas marcadas útiles</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-ctl bg-muted p-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-ink-crit" />
                  <div>
                    <div className="font-medium">{learningStats.negativeFeedback} {learningStats.negativeFeedback === 1 ? 'negativa' : 'negativas'}</div>
                    <div className="text-caption text-muted-foreground">Respuestas marcadas incorrectas</div>
                  </div>
                </div>
              </div>

              {/* Confianza promedio */}
              {learningStats.totalKnowledge > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Confianza promedio de la base de conocimiento</span>
                    <span className="font-medium">{learningStats.avgConfidence}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        learningStats.avgConfidence >= 70 ? 'bg-fill-ok'
                          : learningStats.avgConfidence >= 40 ? 'bg-fill-warning'
                          : 'bg-fill-critical'
                      }`}
                      style={{ width: `${learningStats.avgConfidence}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Correcciones activas */}
              {learningStats.topCorrections.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1.5">Correcciones activas ({learningStats.activeCorrections})</div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {learningStats.topCorrections.map((c) => (
                      <CorrectionRow key={c.id} correction={c} onDelete={async (id) => {
                        await deleteCorrection(id)
                        loadData()
                      }} onToggle={async (id, active) => {
                        await toggleCorrection(id, active)
                        loadData()
                      }} />
                    ))}
                  </div>
                </div>
              )}

              {learningStats.totalFeedback === 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  <Brain className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                  Sin datos de aprendizaje aún.<br />
                  <span className="text-caption">Los usuarios pueden puntuar las respuestas del chat para que ARIA aprenda.</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-4 w-4" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Arquitectura visual ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-headline">Cadena de respaldo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {agents
              .filter(a => a.status !== 'disabled')
              .sort((a, b) => b.priority - a.priority)
              .map((agent, i, arr) => (
                <div key={agent.id} className="flex items-center gap-1">
                  <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-footnote font-medium">
                    <span aria-hidden className={`size-2 rounded-full ${statusColor(agent.status)}`} />
                    <span>{agent.name}</span>
                    <span className="text-muted-foreground tabular-nums">P{agent.priority}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground/60" />
                  )}
                </div>
              ))}
          </div>
          <p className="mt-3 text-center text-footnote text-muted-foreground">
            Si un agente falla o llega a su límite, ARIA pasa solo al siguiente.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
