/**
 * AriaMonitorPanel — Panel de administración para ARIA thinking mode
 * 
 * Muestra:
 * - Configuración global (límite diario, budget)
 * - Límites por usuario
 * - Consumo diario actual
 * - Historial de 7 días
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
  Spinner,
} from '@/components/ui'
import { Brain, Save, RefreshCw, Users, BarChart3, Settings2, AlertTriangle, Volume2, Play } from 'lucide-react'
import { setVoicePref, getSpanishVoices, pickDefaultFemaleVoice, getPiperVoices, getGoogleVoices, speakWith, stopSpeaking } from '@/lib/ariaVoice'
import { 
  getAriaConfig,
  saveAriaConfig,
  getDailyUsage,
  getUsageHistory,
  type AriaConfig,
  type DailyUsageSummary,
} from '@/services/ariaThinkingTracker'
import { getAllUsers } from '@/services/auth'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'
import type { User } from '@/types'

export function AriaMonitorPanel() {
  const { user: currentUser } = useAuthStore()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [config, setConfig] = useState<AriaConfig>({
    dailyThinkingLimit: 50,
    thinkingBudget: 2048,
    userLimits: {},
  })
  const [todayUsage, setTodayUsage] = useState<DailyUsageSummary | null>(null)
  const [history, setHistory] = useState<DailyUsageSummary[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [piperVoices, setPiperVoices] = useState<{ uri: string; label: string }[]>([])
  const [gcloudVoices, setGcloudVoices] = useState<{ uri: string; label: string }[]>([])

  // Cargar voces en español del navegador/SO (se cargan async)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const load = () => setVoices(getSpanishVoices()) // solo femeninas (ARIA es mujer)
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  // Cargar voces Piper del servidor local (si está corriendo)
  useEffect(() => {
    getPiperVoices().then(setPiperVoices)
    return () => stopSpeaking()
  }, [])

  // Cargar voces Google Cloud TTS (si la API/clave están habilitadas)
  useEffect(() => {
    getGoogleVoices().then(setGcloudVoices)
  }, [])

  // Asegura una voz femenina seleccionada una vez cargadas voces + config
  useEffect(() => {
    if (voices.length > 0 && !config.voiceURI) {
      const def = pickDefaultFemaleVoice()
      if (def) {
        setConfig(prev => prev.voiceURI ? prev : { ...prev, voiceURI: def.voiceURI, voiceName: def.name })
      }
    }
  }, [voices, config.voiceURI])

  const handleTestVoice = () => {
    speakWith(
      'Hola, soy ARIA. Así sueno con esta voz y velocidad.',
      config.voiceURI,
      config.speechRate ?? 1.0,
    )
  }

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [cfg, today, hist, allUsers] = await Promise.all([
        getAriaConfig(),
        getDailyUsage(),
        getUsageHistory(7),
        getAllUsers(),
      ])
      setConfig(cfg)
      setTodayUsage(today)
      setHistory(hist)
      setUsers(allUsers)
    } catch {
      toast({ title: 'Error', description: 'No se pudo cargar datos de ARIA', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSaveConfig = async () => {
    if (!currentUser) return
    setIsSaving(true)
    try {
      await saveAriaConfig(config, currentUser.id)
      // Aplica la voz al instante en esta sesión (ChatBot la usará al leer)
      setVoicePref({ voiceURI: config.voiceURI, rate: config.speechRate ?? 1.0 })
      toast({ title: 'Guardado', description: 'Configuración de ARIA actualizada' })
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar la configuración', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleUserLimitChange = (userId: string, value: string) => {
    const num = parseInt(value) || 0
    setConfig(prev => ({
      ...prev,
      userLimits: { ...prev.userLimits, [userId]: num },
    }))
  }

  const removeUserLimit = (userId: string) => {
    setConfig(prev => {
      const next = { ...prev.userLimits }
      delete next[userId]
      return { ...prev, userLimits: next }
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const usedPercent = todayUsage && config.dailyThinkingLimit > 0
    ? Math.round((todayUsage.totalRequests / (config.dailyThinkingLimit * Math.max(todayUsage.users.length, 1))) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Brain className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">ARIA — Pensamiento Profundo</h2>
            <p className="text-sm text-muted-foreground">
              Gestiona el consumo del modo thinking de Gemini
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Actualizar
        </Button>
      </div>

      {/* Config global */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Configuración Global
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Límite diario por usuario (0 = ilimitado)
              </label>
              <Input
                type="number"
                min={0}
                value={config.dailyThinkingLimit}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({ ...prev, dailyThinkingLimit: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Requests con pensamiento profundo al día por usuario
              </p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Budget de pensamiento (tokens)
              </label>
              <Input
                type="number"
                min={256}
                max={8192}
                step={256}
                value={config.thinkingBudget}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({ ...prev, thinkingBudget: parseInt(e.target.value) || 2048 }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Cuánto &quot;piensa&quot; Gemini por request (256-8192)
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} disabled={isSaving} className="gap-2">
              <Save className="h-4 w-4" />
              {isSaving ? 'Guardando...' : 'Guardar Configuración'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Voz del asistente (TTS) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            Voz del Asistente
            <span className="text-xs text-muted-foreground font-normal ml-2">
              (lectura en voz alta del chat)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {voices.length === 0 && piperVoices.length === 0 && gcloudVoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este navegador no reporta voces en español. Se usará la voz por
              defecto del sistema (es-CL).
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Voz (del navegador / Windows)
                </label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={config.voiceURI ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const uri = e.target.value
                    // La voz puede venir de cualquiera de los 3 motores.
                    const browser = voices.find((x) => x.voiceURI === uri)
                    const other = [...gcloudVoices, ...piperVoices].find((x) => x.uri === uri)
                    setConfig(prev => ({
                      ...prev,
                      voiceURI: uri || undefined,
                      voiceName: browser?.name ?? other?.label,
                    }))
                  }}
                >
                  <option value="">Voz femenina por defecto</option>
                  {gcloudVoices.length > 0 && (
                    <optgroup label="Google Cloud (neuronal — todos los usuarios)">
                      {gcloudVoices.map((v) => (
                        <option key={v.uri} value={v.uri}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {voices.some((v) => v.localService) && (
                    <optgroup label="Instaladas (suenan en este equipo)">
                      {voices.filter((v) => v.localService).map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {voices.some((v) => !v.localService) && (
                    <optgroup label="Online — requieren Edge o instalarlas en Windows">
                      {voices.filter((v) => !v.localService).map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {piperVoices.length > 0 && (
                    <optgroup label="Piper local (servidor)">
                      {piperVoices.map((v) => (
                        <option key={v.uri} value={v.uri}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Solo voces femeninas (ARIA es mujer). Las Piper requieren el servidor local activo.
                </p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Velocidad: {(config.speechRate ?? 1.0).toFixed(2)}x
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={config.speechRate ?? 1.0}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setConfig(prev => ({ ...prev, speechRate: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-purple-500"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  1.0 = normal · menor = más pausada · mayor = más rápida
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={handleTestVoice} className="gap-2">
              <Play className="h-4 w-4" />
              Probar voz
            </Button>
            <Button onClick={handleSaveConfig} disabled={isSaving} size="sm" className="gap-2">
              <Save className="h-4 w-4" />
              {isSaving ? 'Guardando...' : 'Guardar Voz'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Consumo de hoy */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Consumo de Hoy
            <Badge variant="outline" className="ml-auto text-xs">
              {todayUsage?.date || '-'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{todayUsage?.totalRequests || 0}</div>
              <div className="text-xs text-muted-foreground">Requests totales</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{todayUsage?.users.length || 0}</div>
              <div className="text-xs text-muted-foreground">Usuarios activos</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">
                {todayUsage?.totalTokens ? Math.round(todayUsage.totalTokens / 1000) + 'K' : '0'}
              </div>
              <div className="text-xs text-muted-foreground">Tokens usados</div>
            </div>
          </div>

          {/* Barra de progreso global */}
          {config.dailyThinkingLimit > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Uso promedio vs límite</span>
                <span className={usedPercent > 80 ? 'text-amber-500 font-medium' : 'text-muted-foreground'}>
                  {usedPercent}%
                </span>
              </div>
              <div className="h-2 w-full rounded bg-muted overflow-hidden">
                <div
                  className={`h-2 transition-all rounded ${
                    usedPercent > 90 ? 'bg-red-500' : usedPercent > 70 ? 'bg-amber-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(100, usedPercent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Detalle por usuario */}
          {todayUsage && todayUsage.users.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Detalle por usuario</h4>
              {todayUsage.users.map((u) => {
                const userLimit = config.userLimits[u.userId] ?? config.dailyThinkingLimit
                const pct = userLimit > 0 ? Math.round((u.count / userLimit) * 100) : 0
                return (
                  <div key={u.userId} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block" title={u.userName || u.userId}>{u.userName || u.userId.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono">{u.count}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-muted-foreground">{userLimit || '∞'}</span>
                      {pct > 80 && (
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      )}
                    </div>
                    <div className="w-20 h-1.5 rounded bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-purple-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay consumo de pensamiento profundo hoy
            </p>
          )}
        </CardContent>
      </Card>

      {/* Historial 7 días */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Historial (últimos 7 días)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="space-y-1">
              {history.map((day) => (
                <div key={day.date} className="flex items-center gap-3 text-sm py-1">
                  <span className="text-xs text-muted-foreground w-20 font-mono">{day.date.slice(5)}</span>
                  <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-purple-500/70 rounded transition-all"
                      style={{
                        width: `${Math.min(100, history.length > 0 ? (day.totalRequests / Math.max(...history.map(h => h.totalRequests), 1)) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono w-8 text-right">{day.totalRequests}</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {day.users.length} usr
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
          )}
        </CardContent>
      </Card>

      {/* Límites por usuario */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Límites por Usuario
            <span className="text-xs text-muted-foreground font-normal ml-2">
              (vacío = usa límite global de {config.dailyThinkingLimit})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {users.filter(u => u.rol !== 'usuario').map((u) => {
              const hasOverride = u.id in config.userLimits
              return (
                <div key={u.id} className="flex items-center gap-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block" title={`${u.nombre} ${u.apellido}`}>
                      {u.nombre} {u.apellido}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{u.rol}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      className="w-20 h-8 text-sm"
                      placeholder={String(config.dailyThinkingLimit)}
                      value={hasOverride ? config.userLimits[u.id] : ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUserLimitChange(u.id, e.target.value)}
                    />
                    {hasOverride && (
                      <button
                        onClick={() => removeUserLimit(u.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                        title="Usar límite global"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={handleSaveConfig} disabled={isSaving} size="sm" className="gap-2">
              <Save className="h-4 w-4" />
              {isSaving ? 'Guardando...' : 'Guardar Límites'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
