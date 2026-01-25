import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, CheckCircle2, LineChart, Cpu } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui'
import { Slider } from '@/components/ui/slider'
import type { BadgeProps } from '@/components/ui/badge'
import { useAppStore } from '@/store'
import { useAuthStore } from '@/store'
import { useIoTPrediction } from '@/hooks/useIoTPrediction'
import { formatRelativeTime } from '@/lib/utils'
import { ensurePredictiveIncident } from '@/services/predictiveIncidents'
import { predictSensorForecast, suggestPredictiveThresholds } from '@/services/ai'
import type { DeviceRow } from '@/services/devicesRtdb'
import { subscribeDevices } from '@/services/devicesRtdb'
import { getEquipments, updateEquipment } from '@/services/equipment'
import type { Equipment, PredictiveThresholds } from '@/types'
import { DEFAULT_PREDICTIVE_THRESHOLDS } from '@/lib/predictive/predictor'
import { FailureAnalysis } from '@/components/predictive/FailureAnalysis'

function normalizeTs(ts: number | undefined): number | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  if (ts > 0 && ts < 1e12) return ts * 1000
  return ts
}


function Sparkline({
  points,
  height = 56,
  colorClass = 'stroke-primary',
}: {
  points: Array<number>
  height?: number
  colorClass?: string
}) {
  const values = points.filter((p) => Number.isFinite(p))
  if (values.length < 2) {
    return <div className="h-14 rounded border bg-muted/20" />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1e-6, max - min)

  const width = 320
  const padding = 6
  const innerW = width - padding * 2
  const innerH = height - padding * 2

  const d = values
    .map((v, idx) => {
      const x = padding + (idx / (values.length - 1)) * innerW
      const y = padding + (1 - (v - min) / range) * innerH
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <polyline
        fill="none"
        strokeWidth="2"
        className={colorClass}
        points={d}
      />
    </svg>
  )
}

function riskBadgeVariant(risk: string): BadgeProps['variant'] {
  switch (risk) {
    case 'critico':
      return 'destructive'
    case 'alto':
      return 'warning'
    case 'medio':
      return 'secondary'
    default:
      return 'default'
  }
}

export function PredictivePage() {
  const navigate = useNavigate()
  const equipment = useAppStore((s) => s.equipment)
  const setEquipment = useAppStore((s) => s.setEquipment)
  const user = useAuthStore((s) => s.user)

  const [selectedId, setSelectedId] = useState<string>(() => equipment[0]?.id ?? '')
  const [filterEstado, setFilterEstado] = useState<Equipment['estado'] | 'todas'>('todas')
  const [filterCriticidad, setFilterCriticidad] = useState<Equipment['criticidad'] | 'todas'>('todas')
  const [autoCreate, setAutoCreate] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createdIncidentId, setCreatedIncidentId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const lastHandledTimestampRef = useRef<number | null>(null)

  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [devicesError, setDevicesError] = useState<string | null>(null)

  const [loadingEquipment, setLoadingEquipment] = useState(false)
  const loadedRef = useRef(false)

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiForecast, setAiForecast] = useState<{
    riesgo: 'bajo' | 'medio' | 'alto' | 'critico'
    confianza: number
    resumen: string
    recomendacion: string
  } | null>(null)

  const [aiThresholdsLoading, setAiThresholdsLoading] = useState(false)
  const [aiThresholdsError, setAiThresholdsError] = useState<string | null>(null)

  const [thresholds, setThresholds] = useState<PredictiveThresholds>(DEFAULT_PREDICTIVE_THRESHOLDS)
  const [thresholdsDirty, setThresholdsDirty] = useState(false)
  const [thresholdsSaving, setThresholdsSaving] = useState(false)
  const [thresholdsError, setThresholdsError] = useState<string | null>(null)
  const [thresholdsOk, setThresholdsOk] = useState<string | null>(null)

  const [testMode, setTestMode] = useState(false)
  const [testTemp, setTestTemp] = useState(32)
  const [testHum, setTestHum] = useState(65)
  const [testTempSlope, setTestTempSlope] = useState(0.2)
  const [testHumSlope, setTestHumSlope] = useState(0.3)

  const hasGroqKey = Boolean(import.meta.env.VITE_GROQ_API_KEY)

  const equipmentWithSensorIds = useMemo(() => {
    const ids = new Set<string>()
    devices.forEach((d) => {
      if (d.assignedEquipmentId) ids.add(d.assignedEquipmentId)
    })
    return ids
  }, [devices])

  const filteredEquipment = useMemo(() => {
    return equipment.filter((e) => {
      if (!equipmentWithSensorIds.has(e.id)) return false
      if (filterEstado !== 'todas' && e.estado !== filterEstado) return false
      if (filterCriticidad !== 'todas' && e.criticidad !== filterCriticidad) return false
      return true
    })
  }, [equipment, equipmentWithSensorIds, filterCriticidad, filterEstado])

  const selectedEquipment = useMemo(
    () => equipment.find((e) => e.id === selectedId) ?? null,
    [equipment, selectedId]
  )

  const linkedDevice = useMemo(
    () => devices.find((d) => d.assignedEquipmentId === selectedEquipment?.id) ?? null,
    [devices, selectedEquipment?.id]
  )

  const testReadings = useMemo(() => {
    if (!testMode) return null
    const count = 15
    const now = Date.now()
    const rows = Array.from({ length: count }, (_, i) => {
      const minutesAgo = (count - 1) - i
      return {
        timestamp: now - minutesAgo * 60_000,
        temperature: Number((testTemp - testTempSlope * minutesAgo).toFixed(2)),
        humidity: Number((testHum - testHumSlope * minutesAgo).toFixed(2)),
        source: 'simulated',
      }
    })
    return rows
  }, [testHum, testHumSlope, testMode, testTemp, testTempSlope])

  const override = useMemo(() => {
    if (!testMode || !testReadings) return undefined
    return {
      summary: { online: true, lastSeen: Date.now() },
      readings: testReadings,
    }
  }, [testMode, testReadings])

  const { summary, readings, prediction, error, effectiveReadings, effectiveSummary } = useIoTPrediction(selectedId || null, {
    thresholds,
    override,
  })

  const displayReadings = testMode && effectiveReadings.length > 0 ? effectiveReadings : readings
  const displaySummary = effectiveSummary ?? summary
  const lastReading = displayReadings[displayReadings.length - 1]
  const lastReadingTs = normalizeTs(lastReading?.timestamp)

  const canCreateIncident = Boolean(user?.id && selectedEquipment && lastReading && !testMode)

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  async function copyEquipmentId() {
    if (!selectedEquipment) return
    await copyToClipboard(selectedEquipment.id)
  }

  async function copyConfigSnippet() {
    if (!selectedEquipment) return
    const snippet = [
      `#define EQUIPMENT_ID "${selectedEquipment.id}"`,
      '',
      '// Firmware: iot/esp32-sensor/src/config.h',
    ].join('\n')
    await copyToClipboard(snippet)
  }

  function updateThreshold<K extends keyof PredictiveThresholds>(key: K, value: number) {
    setThresholds((prev) => ({ ...prev, [key]: value }))
    setThresholdsDirty(true)
  }

  async function saveThresholds() {
    if (!selectedEquipment) return
    setThresholdsSaving(true)
    setThresholdsError(null)
    setThresholdsOk(null)
    try {
      await updateEquipment(selectedEquipment.id, { predictiveThresholds: thresholds })
      setThresholdsOk('Umbrales guardados')
      setThresholdsDirty(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error guardando umbrales'
      setThresholdsError(msg)
    } finally {
      setThresholdsSaving(false)
    }
  }

  function resetThresholds() {
    setThresholds(DEFAULT_PREDICTIVE_THRESHOLDS)
    setThresholdsDirty(true)
  }

  async function applyAiThresholds() {
    if (!selectedEquipment) return
    setAiThresholdsError(null)
    setAiThresholdsLoading(true)
    try {
      const result = await suggestPredictiveThresholds({
        equipment: selectedEquipment,
        readings,
      })
      if (!result) {
        setAiThresholdsError('No se pudo sugerir umbrales con IA.')
        return
      }
      setThresholds({ ...DEFAULT_PREDICTIVE_THRESHOLDS, ...result })
      setThresholdsDirty(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error sugiriendo umbrales'
      setAiThresholdsError(msg)
    } finally {
      setAiThresholdsLoading(false)
    }
  }

  async function createPredictiveIncidentNow() {
    if (testMode) {
      setCreateError('Desactiva modo prueba para crear incidencias.')
      return
    }
    if (!user?.id || !selectedEquipment) return

    setCreateError(null)
    setCreating(true)
    try {
      const created = await ensurePredictiveIncident({
        equipment: {
          id: selectedEquipment.id,
          nombre: selectedEquipment.nombre,
          codigo: selectedEquipment.codigo,
          hierarchyNodeId: selectedEquipment.hierarchyNodeId,
        },
        prediction,
        lastReading,
        reportedByUserId: user.id,
      })

      if (created) {
        setCreatedIncidentId(created.id)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error creando incidencia predictiva.'
      setCreateError(msg)
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    if (!selectedEquipment) return
    const next = {
      ...DEFAULT_PREDICTIVE_THRESHOLDS,
      ...(selectedEquipment.predictiveThresholds ?? {}),
    }
    setThresholds(next)
    setThresholdsDirty(false)
    setThresholdsError(null)
    setThresholdsOk(null)
  }, [selectedEquipment?.id])

  useEffect(() => {
    if (testMode) return
    if (typeof lastReading?.temperature === 'number') {
      setTestTemp(Number(lastReading.temperature.toFixed(1)))
    }
    if (typeof lastReading?.humidity === 'number') {
      setTestHum(Number(lastReading.humidity.toFixed(1)))
    }
  }, [lastReading?.temperature, lastReading?.humidity, testMode])

  async function generateAiForecast() {
    if (!selectedEquipment) return
    setAiError(null)
    setAiLoading(true)
    try {
      const result = await predictSensorForecast({
        equipment: selectedEquipment,
        summary: displaySummary,
        readings,
      })
      if (!result) {
        setAiError('No se pudo generar predicción IA. Revisa API key y datos.')
      }
      setAiForecast(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error generando predicción IA.'
      setAiError(msg)
      setAiForecast(null)
    } finally {
      setAiLoading(false)
    }
  }

  // Auto-creación cuando llega una nueva lectura y el riesgo es alto/critico.
  useEffect(() => {
    if (!autoCreate) return
    if (testMode) return
    if (!user?.id) return
    if (!selectedEquipment) return
    if (!lastReading?.timestamp) return

    // Solo intentar una vez por timestamp de lectura.
    if (lastHandledTimestampRef.current === lastReading.timestamp) return

    // Señal clara de riesgo
    if (prediction.nivelRiesgo !== 'alto' && prediction.nivelRiesgo !== 'critico') {
      lastHandledTimestampRef.current = lastReading.timestamp
      return
    }

    // Lanzar creación (idempotente por el guard en Firestore)
    void (async () => {
      await createPredictiveIncidentNow()
      lastHandledTimestampRef.current = lastReading.timestamp
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate, user?.id, selectedEquipment?.id, lastReading?.timestamp, prediction.nivelRiesgo, prediction.confianza, testMode])

  useEffect(() => {
    if (loadedRef.current || loadingEquipment) return

    if (equipment.length > 0) {
      loadedRef.current = true
      return
    }

    loadedRef.current = true
    setLoadingEquipment(true)
    void (async () => {
      try {
        const data = await getEquipments()
        setEquipment(data)
      } finally {
        setLoadingEquipment(false)
      }
    })()
  }, [equipment.length, loadingEquipment, setEquipment])

  useEffect(() => {
    const unsub = subscribeDevices(
      (rows) => {
        setDevices(rows)
        setDevicesError(null)
      },
      () => setDevicesError('No se pudo leer devices/ (RTDB).')
    )
    return () => unsub()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Módulo Predictivo</h1>
          <p className="text-muted-foreground">
            Gestión inteligente: IoT y Análisis de Fallas
          </p>
        </div>
      </div>

      <Tabs defaultValue="iot" className="space-y-4">
        <TabsList>
            <TabsTrigger value="iot" className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Monitoreo IoT
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center gap-2">
                <LineChart className="h-4 w-4" />
                Análisis de Fallas
            </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis">
            <FailureAnalysis />
        </TabsContent>

        <TabsContent value="iot" className="space-y-6">
          <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Seleccionar equipo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 max-w-3xl">
            <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Estado</Label>
                  <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="operativo">Operativo</SelectItem>
                      <SelectItem value="en_mantenimiento">En mantenimiento</SelectItem>
                      <SelectItem value="fuera_servicio">Fuera de servicio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Criticidad</Label>
                  <Select value={filterCriticidad} onValueChange={(v) => setFilterCriticidad(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Criticidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            </div>

            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="min-w-[280px] flex-1">
                <Label>Equipo</Label>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger className="max-w-xl">
                    <SelectValue placeholder="Selecciona un equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingEquipment ? (
                      <div className="p-2 text-sm text-muted-foreground">Cargando equipos…</div>
                    ) : filteredEquipment.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">Sin resultados</div>
                    ) : (
                      filteredEquipment.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nombre} ({e.codigo})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <div className="mt-1 text-xs text-muted-foreground">
                  {filteredEquipment.length} resultado(s)
                </div>
                {filteredEquipment.length === 0 && !loadingEquipment && (
                  <div className="mt-1 text-xs text-amber-600">
                    No hay equipos con sensor asociado.
                  </div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  Usa el selector para elegir un equipo disponible.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={copyEquipmentId} disabled={!selectedEquipment}>
                  Copiar ID
                </Button>
                <Button type="button" variant="secondary" onClick={copyConfigSnippet} disabled={!selectedEquipment}>
                  Copiar config
                </Button>
              </div>
            </div>
          </div>
          {error && (
            <div className="mt-3 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
          {devicesError && (
            <div className="mt-2 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {devicesError}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 max-w-xl">
              <div className="space-y-0.5">
                <Label>Auto-crear incidencia predictiva</Label>
                <div className="text-xs text-muted-foreground">
                  Crea una incidencia (tipo predictivo) cuando el riesgo sea alto/crítico.
                </div>
              </div>
              <Switch checked={autoCreate} onCheckedChange={setAutoCreate} disabled={testMode} />
            </div>
            {testMode && (
              <div className="text-xs text-amber-600">
                Modo prueba activo: auto-creación deshabilitada.
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={createPredictiveIncidentNow}
                disabled={!canCreateIncident || creating}
              >
                {creating ? 'Creando…' : 'Crear incidencia ahora'}
              </Button>
              {createdIncidentId && (
                <div className="text-xs text-muted-foreground">
                  Incidencia creada: {createdIncidentId}
                </div>
              )}
            </div>

            {createError && (
              <div className="text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {createError}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedEquipment && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>Configuración predictiva</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={applyAiThresholds}
                    disabled={aiThresholdsLoading || !hasGroqKey || readings.length < 5}
                  >
                    {aiThresholdsLoading ? 'IA…' : 'Sugerir umbrales IA'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={resetThresholds}
                    disabled={!thresholdsDirty}
                  >
                    Restaurar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveThresholds}
                    disabled={!thresholdsDirty || thresholdsSaving}
                  >
                    {thresholdsSaving ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-xs text-muted-foreground">
                Ajusta umbrales de temperatura/humedad y tendencias. Usa IA para sugerencias basadas en lecturas reales.
              </div>
              {!hasGroqKey && (
                <div className="text-xs text-muted-foreground">
                  Configura VITE_GROQ_API_KEY para habilitar sugerencias IA.
                </div>
              )}
              {aiThresholdsError && (
                <div className="text-xs text-destructive">{aiThresholdsError}</div>
              )}
              {thresholdsError && (
                <div className="text-xs text-destructive">{thresholdsError}</div>
              )}
              {thresholdsOk && (
                <div className="text-xs text-emerald-600">{thresholdsOk}</div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded border p-3 space-y-3">
                  <div className="text-sm font-medium">Temperatura (°C)</div>
                  <div className="space-y-2">
                    <Label>Advertencia baja: {thresholds.tempWarnLow.toFixed(1)}°C</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.tempWarnLow]}
                        onValueChange={(v) => updateThreshold('tempWarnLow', v[0] ?? thresholds.tempWarnLow)}
                        min={-5}
                        max={80}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.tempWarnLow}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('tempWarnLow', next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Advertencia alta: {thresholds.tempWarnHigh.toFixed(1)}°C</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.tempWarnHigh]}
                        onValueChange={(v) => updateThreshold('tempWarnHigh', v[0] ?? thresholds.tempWarnHigh)}
                        min={-5}
                        max={80}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.tempWarnHigh}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('tempWarnHigh', next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Crítico bajo: {thresholds.tempCritLow.toFixed(1)}°C</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.tempCritLow]}
                        onValueChange={(v) => updateThreshold('tempCritLow', v[0] ?? thresholds.tempCritLow)}
                        min={-5}
                        max={80}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.tempCritLow}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('tempCritLow', next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Crítico alto: {thresholds.tempCritHigh.toFixed(1)}°C</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.tempCritHigh]}
                        onValueChange={(v) => updateThreshold('tempCritHigh', v[0] ?? thresholds.tempCritHigh)}
                        min={-5}
                        max={80}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.tempCritHigh}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('tempCritHigh', next)
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded border p-3 space-y-3">
                  <div className="text-sm font-medium">Humedad (%)</div>
                  <div className="space-y-2">
                    <Label>Advertencia baja: {thresholds.humWarnLow.toFixed(1)}%</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.humWarnLow]}
                        onValueChange={(v) => updateThreshold('humWarnLow', v[0] ?? thresholds.humWarnLow)}
                        min={10}
                        max={100}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.humWarnLow}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('humWarnLow', next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Advertencia alta: {thresholds.humWarnHigh.toFixed(1)}%</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.humWarnHigh]}
                        onValueChange={(v) => updateThreshold('humWarnHigh', v[0] ?? thresholds.humWarnHigh)}
                        min={10}
                        max={100}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.humWarnHigh}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('humWarnHigh', next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Crítico bajo: {thresholds.humCritLow.toFixed(1)}%</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.humCritLow]}
                        onValueChange={(v) => updateThreshold('humCritLow', v[0] ?? thresholds.humCritLow)}
                        min={10}
                        max={100}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.humCritLow}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('humCritLow', next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Crítico alto: {thresholds.humCritHigh.toFixed(1)}%</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.humCritHigh]}
                        onValueChange={(v) => updateThreshold('humCritHigh', v[0] ?? thresholds.humCritHigh)}
                        min={10}
                        max={100}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.humCritHigh}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('humCritHigh', next)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded border p-3 space-y-3">
                  <div className="text-sm font-medium">Tendencia temperatura (°C/min)</div>
                  <div className="space-y-2">
                    <Label>Advertencia: {thresholds.tempSlopeWarn.toFixed(2)}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.tempSlopeWarn]}
                        onValueChange={(v) => updateThreshold('tempSlopeWarn', v[0] ?? thresholds.tempSlopeWarn)}
                        min={0}
                        max={3}
                        step={0.05}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.tempSlopeWarn}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('tempSlopeWarn', next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Crítica: {thresholds.tempSlopeCrit.toFixed(2)}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.tempSlopeCrit]}
                        onValueChange={(v) => updateThreshold('tempSlopeCrit', v[0] ?? thresholds.tempSlopeCrit)}
                        min={0}
                        max={3}
                        step={0.05}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.tempSlopeCrit}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('tempSlopeCrit', next)
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded border p-3 space-y-3">
                  <div className="text-sm font-medium">Tendencia humedad (%/min)</div>
                  <div className="space-y-2">
                    <Label>Advertencia: {thresholds.humSlopeWarn.toFixed(2)}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.humSlopeWarn]}
                        onValueChange={(v) => updateThreshold('humSlopeWarn', v[0] ?? thresholds.humSlopeWarn)}
                        min={0}
                        max={3}
                        step={0.05}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.humSlopeWarn}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('humSlopeWarn', next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Crítica: {thresholds.humSlopeCrit.toFixed(2)}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[thresholds.humSlopeCrit]}
                        onValueChange={(v) => updateThreshold('humSlopeCrit', v[0] ?? thresholds.humSlopeCrit)}
                        min={0}
                        max={3}
                        step={0.05}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={thresholds.humSlopeCrit}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('humSlopeCrit', next)
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded border p-3 space-y-3">
                  <div className="text-sm font-medium">Offline</div>
                  <div className="space-y-2">
                    <Label>Tiempo sin reporte: {Math.round(thresholds.offlineMs / 60000)} min</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[Math.round(thresholds.offlineMs / 60000)]}
                        onValueChange={(v) => updateThreshold('offlineMs', (v[0] ?? 1) * 60000)}
                        min={1}
                        max={10}
                        step={1}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={Math.round(thresholds.offlineMs / 60000)}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) updateThreshold('offlineMs', Math.max(1, next) * 60000)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded border p-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">Modo prueba</div>
                    <div className="text-xs text-muted-foreground">
                      Simula lecturas para ver cómo cambia el riesgo. No crea incidencias.
                    </div>
                  </div>
                  <Switch checked={testMode} onCheckedChange={setTestMode} />
                </div>
                {testMode && (
                  <div className="text-xs text-amber-600">
                    Usando lecturas simuladas.
                  </div>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Temperatura simulada: {testTemp.toFixed(1)}°C</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[testTemp]}
                        onValueChange={(v) => setTestTemp(v[0] ?? testTemp)}
                        min={-5}
                        max={80}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={testTemp}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) setTestTemp(next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Humedad simulada: {testHum.toFixed(1)}%</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[testHum]}
                        onValueChange={(v) => setTestHum(v[0] ?? testHum)}
                        min={10}
                        max={100}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={testHum}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) setTestHum(next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Subida temp (°C/min): {testTempSlope.toFixed(2)}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[testTempSlope]}
                        onValueChange={(v) => setTestTempSlope(v[0] ?? testTempSlope)}
                        min={0}
                        max={3}
                        step={0.05}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={testTempSlope}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) setTestTempSlope(next)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Subida hum (%/min): {testHumSlope.toFixed(2)}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[testHumSlope]}
                        onValueChange={(v) => setTestHumSlope(v[0] ?? testHumSlope)}
                        min={0}
                        max={3}
                        step={0.05}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        className="w-24"
                        value={testHumSlope}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next)) setTestHumSlope(next)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span>Estado actual</span>
                  <Badge variant={riskBadgeVariant(prediction.nivelRiesgo)}>
                    Riesgo: {prediction.nivelRiesgo}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Equipo: <span className="text-foreground font-medium">{selectedEquipment.nombre}</span>
                </div>

                <div className="text-xs text-muted-foreground">
                  ID: <span className="text-foreground">{selectedEquipment.id}</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Temperatura</div>
                    <div className="text-xl font-semibold">
                      {typeof lastReading?.temperature === 'number' && Number.isFinite(lastReading.temperature)
                        ? `${lastReading.temperature.toFixed(1)} °C`
                        : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      fuente: {lastReading?.source ?? displaySummary?.temperatura?.source ?? '—'}
                    </div>
                  </div>
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Humedad</div>
                    <div className="text-xl font-semibold">
                      {typeof lastReading?.humidity === 'number' && Number.isFinite(lastReading.humidity)
                        ? `${lastReading.humidity.toFixed(1)} %`
                        : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      online: {displaySummary?.online ? 'sí' : 'no'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded border">
                  <div className="text-xs text-muted-foreground">Sensor vinculado</div>
                  {linkedDevice ? (
                    <div className="mt-1 space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={linkedDevice.online ? 'default' : 'secondary'}>
                          {linkedDevice.online ? 'Online' : 'Offline'}
                        </Badge>
                        <span className="text-muted-foreground">ID:</span>
                        <span className="font-mono text-xs">{linkedDevice.deviceId}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Último reporte: {linkedDevice.lastSeen ? formatRelativeTime(new Date(linkedDevice.lastSeen)) : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        RSSI: {typeof linkedDevice.rssi === 'number' ? `${linkedDevice.rssi} dBm` : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        SSID: {linkedDevice.wifiSsid || '—'} · IP: {linkedDevice.ip || '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        AP: {linkedDevice.apSsid || '—'} · {linkedDevice.apIp || '—'}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Sin sensor vinculado al equipo.
                    </div>
                  )}
                  <div className="mt-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => navigate('/sensors')}>
                      Abrir sensores
                    </Button>
                  </div>
                </div>

                <div className="text-sm">
                  <div className="font-medium mb-1">Indicadores</div>
                  <ul className="list-disc pl-5 space-y-1">
                    {prediction.indicadores.map((i) => (
                      <li key={i} className="text-muted-foreground">
                        {i}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="text-sm">
                  <div className="font-medium mb-1">Recomendación</div>
                  <div className="text-muted-foreground">{prediction.recomendacion}</div>
                </div>

                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Confianza estimada: {Math.round(prediction.confianza * 100)}%
                </div>

                <div className="p-3 rounded border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Predicción IA (opcional)</div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={generateAiForecast}
                      disabled={aiLoading || readings.length < 5 || !hasGroqKey}
                    >
                      {aiLoading ? 'Generando…' : 'Generar'}
                    </Button>
                  </div>
                  {!hasGroqKey && (
                    <div className="text-xs text-muted-foreground">
                      Configura VITE_GROQ_API_KEY para habilitar IA.
                    </div>
                  )}
                  {aiError && (
                    <div className="text-xs text-destructive">{aiError}</div>
                  )}
                  {aiForecast && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>
                        Riesgo IA: <span className="text-foreground">{aiForecast.riesgo}</span>
                        {' '}· Confianza: {Math.round(aiForecast.confianza * 100)}%
                      </div>
                      <div>{aiForecast.resumen}</div>
                      <div className="text-foreground">{aiForecast.recomendacion}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Últimas lecturas</CardTitle>
              </CardHeader>
              <CardContent>
                {displayReadings.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Aún no hay histórico. El ESP32 empezará a poblar la ruta "sensors/&lt;equipmentId&gt;/readings".
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded border p-2">
                        <div className="text-xs text-muted-foreground">Temperatura (últimas {Math.min(displayReadings.length, 60)})</div>
                        <Sparkline
                          points={displayReadings.slice(-60).map((r) => r.temperature)}
                          colorClass="stroke-orange-500"
                        />
                        <div className="mt-1 text-xs text-muted-foreground">
                          Último: {typeof lastReading?.temperature === 'number' && Number.isFinite(lastReading.temperature)
                            ? `${lastReading.temperature.toFixed(1)} °C`
                            : '—'}
                        </div>
                      </div>
                      <div className="rounded border p-2">
                        <div className="text-xs text-muted-foreground">Humedad (últimas {Math.min(displayReadings.length, 60)})</div>
                        <Sparkline
                          points={displayReadings.slice(-60).map((r) => r.humidity)}
                          colorClass="stroke-sky-500"
                        />
                        <div className="mt-1 text-xs text-muted-foreground">
                          Último: {typeof lastReading?.humidity === 'number' && Number.isFinite(lastReading.humidity)
                            ? `${lastReading.humidity.toFixed(1)} %`
                            : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {lastReadingTs ? `Última lectura: ${new Date(lastReadingTs).toLocaleString()}` : 'Última lectura: —'}
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-auto">
                      {displayReadings
                        .slice(-12)
                        .reverse()
                        .map((r) => (
                          <div key={r.timestamp} className="flex items-center justify-between p-2 rounded border">
                            <div className="text-sm">
                              <div className="font-medium">
                                {r.temperature.toFixed(1)}°C · {r.humidity.toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatRelativeTime(new Date(normalizeTs(r.timestamp) ?? r.timestamp))} · {r.source ?? '—'}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(normalizeTs(r.timestamp) ?? r.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
