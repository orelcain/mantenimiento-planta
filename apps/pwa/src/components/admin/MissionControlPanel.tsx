/**
 * MissionControlPanel — Sala de control de agentes IA
 * 
 * Muestra:
 * - Status en tiempo real de cada agente (Online/Rate-limited/Offline/Disabled)
 * - Log de misiones con resultados, fallbacks, latencia
 * - Configuración: habilitar/deshabilitar agentes, prioridades
 * - Estadísticas: requests y tokens por agente
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Switch,
  Spinner,
} from '@/components/ui'
import {
  Satellite,
  RefreshCw,
  Activity,
  Zap,
  Shield,
  Clock,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Radio,
  Key,
  Brain,
  TrendingUp,
  MessageSquare,
  AlertTriangle,
  Trash2,
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
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'

// ═══════════════════════════════════════════════════════════════════════
// STATUS HELPERS
// ═══════════════════════════════════════════════════════════════════════

function statusColor(status: AIAgent['status']): string {
  switch (status) {
    case 'online': return 'bg-green-500'
    case 'rate-limited': return 'bg-amber-500'
    case 'offline': return 'bg-red-500'
    case 'disabled': return 'bg-gray-400'
    default: return 'bg-gray-400'
  }
}

function CorrectionRow({ correction: c, onDelete, onToggle }: {
  correction: AriaCorrection
  onDelete: (id: string) => void
  onToggle: (id: string, active: boolean) => void
}) {
  return (
    <div className={`flex items-start gap-2 p-2 rounded border text-xs ${c.active ? 'border-amber-500/20 bg-amber-500/5' : 'border-border bg-muted/30 opacity-60'}`}>
      <div className="flex-1 min-w-0">
        <div className="text-muted-foreground truncate" title={c.userQuery}>❓ "{c.userQuery}"</div>
        <div className="text-red-400 truncate text-[10px]" title={c.wrongResponse}>❌ {c.wrongResponse.slice(0, 80)}...</div>
        <div className="text-green-400 text-[10px]">✅ {c.correctResponse.slice(0, 120)}</div>
        {c.equipmentName && <div className="text-[9px] text-muted-foreground">🔧 {c.equipmentName}</div>}
        <div className="text-[9px] text-muted-foreground mt-0.5">Usada {c.usageCount}x</div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={() => onToggle(c.id!, !c.active)}
          className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-muted"
          title={c.active ? 'Desactivar' : 'Activar'}
        >
          {c.active ? 'Off' : 'On'}
        </button>
        <button
          onClick={() => onDelete(c.id!)}
          className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
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
    case 'online': return 'Online'
    case 'rate-limited': return 'Rate Limited'
    case 'offline': return 'Offline'
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

function capabilityEmoji(cap: string): string {
  switch (cap) {
    case 'reasoning': return '🧠'
    case 'vision': return '👁️'
    case 'code': return '💻'
    case 'speed': return '⚡'
    case 'general': return '🔄'
    case 'analysis': return '📊'
    default: return '•'
  }
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
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
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
      // Init key inputs from config
      if (cfg.providerKeys) {
        setKeyInputs(prev => ({ ...cfg.providerKeys, ...prev }))
      }
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

  const handleSaveApiKey = async (provider: string) => {
    const key = keyInputs[provider]?.trim()
    if (!key) return
    const newConfig: AgentsConfig = {
      ...config,
      providerKeys: { ...config.providerKeys, [provider]: key },
    }
    setConfig(newConfig)
    setIsSaving(true)
    try {
      await saveAgentsConfig(newConfig, user?.id || '')
      setAgents(getAllAgents())
      toast({ title: `API key de ${provider} guardada`, description: 'El agente debería activarse automáticamente' })
    } catch {
      toast({ title: 'Error al guardar key', variant: 'destructive' })
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
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-xl">
              <Satellite className="h-6 w-6 text-purple-500" />
            </div>
            {/* Pulse indicador */}
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold">ARIA — Control de Misión</h2>
            <p className="text-sm text-muted-foreground">
              Orquestación multi-agente · {onlineCount}/{agents.length} agentes online
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className={`h-3 w-3 ${autoRefresh ? 'text-green-500 animate-pulse' : 'text-gray-400'}`} />
            <button onClick={() => setAutoRefresh(!autoRefresh)} className="hover:underline">
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3 bg-muted/50 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-500">{onlineCount}</div>
          <div className="text-xs text-muted-foreground">Agentes Online</div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg text-center">
          <div className="text-2xl font-bold">{totalRequests}</div>
          <div className="text-xs text-muted-foreground">Requests Hoy</div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg text-center">
          <div className="text-2xl font-bold">
            {totalTokens > 1000 ? `${Math.round(totalTokens / 1000)}K` : totalTokens}
          </div>
          <div className="text-xs text-muted-foreground">Tokens Hoy</div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg text-center">
          <div className={`text-2xl font-bold ${successRate >= 90 ? 'text-green-500' : successRate >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
            {successRate}%
          </div>
          <div className="text-xs text-muted-foreground">Tasa Éxito</div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg text-center col-span-2 md:col-span-1">
          <div className={`text-2xl font-bold ${totalCostUsd > 0 ? 'text-orange-500' : 'text-green-500'}`}>
            ${totalCostUsd < 0.01 && totalCostUsd > 0 ? '<0.01' : totalCostUsd.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">Costo Est. USD</div>
        </div>
      </div>

      {/* ─── Panel de Agentes ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Agentes IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {agents.map((agent) => {
            const isEnabled = !config.disabledAgents.includes(agent.id)
            const hasKey = agent.status !== 'disabled' || isEnabled
            return (
              <div
                key={agent.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  agent.status === 'online'
                    ? 'border-green-500/20 bg-green-500/5'
                    : agent.status === 'rate-limited'
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-border bg-muted/30'
                }`}
              >
                {/* Status dot */}
                <div className={`h-3 w-3 rounded-full ${statusColor(agent.status)} shrink-0`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{agent.emoji}</span>
                    <span className="font-semibold text-sm">{agent.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {agent.provider}
                    </Badge>
                    {agent.thinking && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-500">
                        Thinking
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {agent.capabilities.map(c => capabilityEmoji(c)).join(' ')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      · P{agent.priority} · {agent.costTier}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      · {statusLabel(agent.status)}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right text-xs shrink-0">
                  <div className="font-mono">{agent.usedToday} req</div>
                  <div className="text-muted-foreground">
                    {agent.tokensToday > 1000 ? `${Math.round(agent.tokensToday / 1000)}K tok` : `${agent.tokensToday} tok`}
                  </div>
                  {(() => {
                    const cost = costSummary.find(c => c.agentId === agent.id)?.estimatedCostUsd || 0
                    return cost > 0 ? (
                      <div className="text-orange-500 font-mono text-[10px]">
                        ${cost < 0.01 ? '<0.01' : cost.toFixed(3)}
                      </div>
                    ) : null
                  })()}
                </div>

                {/* Toggle */}
                <Switch
                  checked={isEnabled && hasKey}
                  onCheckedChange={(checked: boolean) => handleToggleAgent(agent.id, checked)}
                  disabled={isSaving}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ─── Mission Log ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Log de Misiones
            <Badge variant="outline" className="ml-auto text-xs">
              {logs.length} entradas hoy
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {logs.slice(0, 50).map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                  {/* Status icon */}
                  {log.status === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : log.status === 'fallback' ? (
                    <ArrowRightLeft className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  )}

                  {/* Time */}
                  <span className="text-muted-foreground font-mono w-12 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* Task type */}
                  <Badge variant={statusBadgeVariant(log.status)} className="text-[10px] px-1 py-0 shrink-0">
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
                      {log.latencyMs > 1000 ? `${(log.latencyMs / 1000).toFixed(1)}s` : `${log.latencyMs}ms`}
                    </span>
                    {log.tokens > 0 && (
                      <span className="flex items-center gap-0.5 text-muted-foreground">
                        <Zap className="h-3 w-3" />
                        {log.tokens}
                      </span>
                    )}
                    {(log.estimatedCostUsd ?? 0) > 0 && (
                      <span className="text-orange-500 text-[10px] font-mono">
                        ${(log.estimatedCostUsd ?? 0).toFixed(4)}
                      </span>
                    )}
                  </div>

                  {/* Fallback indicator */}
                  {log.status === 'fallback' && log.fallbackTo && (
                    <span className="text-amber-500" title={`Fallback a ${log.fallbackTo}`}>
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
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Aprendizaje ARIA
            {learningStats && learningStats.totalFeedback > 0 && (
              <Badge variant="outline" className="ml-auto text-xs">
                {learningStats.satisfactionRate}% satisfacción
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {learningStats ? (
            <>
              {/* KPIs de aprendizaje */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="p-2 bg-muted/50 rounded-lg text-center">
                  <div className="text-lg font-bold text-blue-500">{learningStats.totalFeedback}</div>
                  <div className="text-[10px] text-muted-foreground">Feedback Total</div>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg text-center">
                  <div className={`text-lg font-bold ${learningStats.satisfactionRate >= 70 ? 'text-green-500' : learningStats.satisfactionRate >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                    {learningStats.satisfactionRate}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">Satisfacción</div>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg text-center">
                  <div className="text-lg font-bold text-purple-500">{learningStats.totalKnowledge}</div>
                  <div className="text-[10px] text-muted-foreground">Conocimientos</div>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg text-center">
                  <div className="text-lg font-bold text-amber-500">{learningStats.activeCorrections}</div>
                  <div className="text-[10px] text-muted-foreground">Correcciones</div>
                </div>
              </div>

              {/* Gráfico de satisfacción por día (barras simples CSS) */}
              {learningStats.feedbackByDay.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Tendencia de Satisfacción</span>
                  </div>
                  <div className="flex items-end gap-0.5 h-16">
                    {learningStats.feedbackByDay.slice(-14).map((day, i) => {
                      const total = day.positive + day.negative
                      const rate = total > 0 ? (day.positive / total) * 100 : 100
                      const height = total > 0 ? Math.max(8, (total / Math.max(...learningStats.feedbackByDay.map(d => d.positive + d.negative))) * 100) : 5
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                          <div
                            className={`w-full rounded-t ${rate >= 70 ? 'bg-green-500' : rate >= 40 ? 'bg-amber-500' : 'bg-red-500'} transition-all`}
                            style={{ height: `${height}%`, minHeight: 2 }}
                          />
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-[9px] px-1 py-0.5 rounded shadow whitespace-nowrap z-10">
                            {day.date.slice(5)}: {day.positive}👍 {day.negative}👎
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
                    <span>{learningStats.feedbackByDay.slice(-14)[0]?.date.slice(5) || ''}</span>
                    <span>Hoy</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[9px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" /> &ge;70%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500" /> 40-69%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500" /> &lt;40%</span>
                  </div>
                </div>
              )}

              {/* Desglose de métricas */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2 bg-green-500/5 rounded border border-green-500/10">
                  <MessageSquare className="h-3.5 w-3.5 text-green-500" />
                  <div>
                    <div className="font-medium">{learningStats.positiveFeedback} positivos</div>
                    <div className="text-[10px] text-muted-foreground">Respuestas marcadas útiles</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-red-500/5 rounded border border-red-500/10">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <div>
                    <div className="font-medium">{learningStats.negativeFeedback} negativos</div>
                    <div className="text-[10px] text-muted-foreground">Respuestas marcadas incorrectas</div>
                  </div>
                </div>
              </div>

              {/* Confianza promedio */}
              {learningStats.totalKnowledge > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Confianza promedio del knowledge base</span>
                    <span className="font-medium">{learningStats.avgConfidence}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        learningStats.avgConfidence >= 70 ? 'bg-green-500'
                          : learningStats.avgConfidence >= 40 ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${learningStats.avgConfidence}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Correcciones activas */}
              {learningStats.topCorrections.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1.5">Correcciones Activas ({learningStats.activeCorrections})</div>
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
                  <span className="text-[10px]">Los usuarios pueden dar 👍/👎 en las respuestas del chat para que ARIA aprenda.</span>
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

      {/* ─── API Keys (admin) — original ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Keys de Proveedores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Si las env vars del build no incluyen una API key, puedes agregarla aquí. Las keys se guardan cifradas en Firestore.
          </p>
          {(['deepseek', 'groq', 'gemini'] as const).map(provider => {
            const providerLabel: Record<string, string> = { deepseek: 'DeepSeek', groq: 'Groq (Qwen/Llama)', gemini: 'Gemini (Google)' }
            const envVar: Record<string, string> = { deepseek: 'VITE_DEEPSEEK_API_KEY', groq: 'VITE_GROQ_API_KEY', gemini: 'VITE_GEMINI_API_KEY' }
            const hasSavedKey = !!config.providerKeys?.[provider]
            return (
              <div key={provider} className="flex items-center gap-2">
                <div className="w-32 shrink-0">
                  <div className="text-xs font-medium">{providerLabel[provider]}</div>
                  <div className="text-[9px] text-muted-foreground">{envVar[provider]}</div>
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={hasSavedKey ? '••••••••••• (guardada)' : 'Pegar API key...'}
                  value={keyInputs[provider] || ''}
                  onChange={e => setKeyInputs(prev => ({ ...prev, [provider]: e.target.value }))}
                  className="flex-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background focus:ring-1 focus:ring-primary/50 focus:outline-none"
                />
                <Button
                  size="sm"
                  variant={hasSavedKey ? 'outline' : 'default'}
                  onClick={() => handleSaveApiKey(provider)}
                  disabled={isSaving || !keyInputs[provider]?.trim()}
                  className="text-xs h-7 px-3"
                >
                  {hasSavedKey ? 'Actualizar' : 'Guardar'}
                </Button>
                {hasSavedKey && (
                  <span className="text-green-500 text-[10px]">✓</span>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ─── Arquitectura visual ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4" />
            Cadena de Fallback
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {agents
              .filter(a => a.status !== 'disabled')
              .sort((a, b) => b.priority - a.priority)
              .map((agent, i, arr) => (
                <div key={agent.id} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                    agent.status === 'online'
                      ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
                      : agent.status === 'rate-limited'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'border-border bg-muted text-muted-foreground'
                  }`}>
                    <span>{agent.emoji}</span>
                    <span>{agent.name}</span>
                    <span className="opacity-50">P{agent.priority}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <span className="text-muted-foreground text-xs">→</span>
                  )}
                </div>
              ))}
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Si el primer agente falla o está rate-limited, ARIA pasa automáticamente al siguiente
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
