import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Cpu, Thermometer, Droplets, Link2 } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import { useCanSee } from '@/store'
import { getEquipments } from '@/services/equipment'
import { subscribeDevices, type DeviceRow } from '@/services/devicesRtdb'
import { subscribeSensorReadings, type SensorReading } from '@/services/sensorsRtdb'
import type { Equipment } from '@/types'

function formatDateTime(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '—'
  const ts = timestamp > 0 && timestamp < 1e12 ? timestamp * 1000 : timestamp
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function getAreaLabel(equipment?: Equipment): string {
  if (!equipment?.hierarchyPath) return 'Sin área'
  const parts = equipment.hierarchyPath.split('>').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[1]!
  return parts[0] ?? 'Sin área'
}

function getTelemetryAlert(device: DeviceRow): 'normal' | 'warning' | 'critical' {
  const temp = device.telemetry?.temperatura?.status
  const hum = device.telemetry?.humedad?.status
  if (temp === 'critical' || hum === 'critical') return 'critical'
  if (temp === 'warning' || hum === 'warning') return 'warning'
  return 'normal'
}

function isDeviceFresh(device: DeviceRow, nowMs: number): boolean {
  if (!device.online) return false
  const lastSeen = device.lastSeen
  if (!lastSeen || !Number.isFinite(lastSeen)) return false

  const intervalSec = device.sendInterval && device.sendInterval > 0 ? device.sendInterval : 10
  const freshnessWindowMs = Math.max(intervalSec * 3 * 1000, 30000)
  return nowMs - lastSeen <= freshnessWindowMs
}

function buildSparklineCoordinates(values: number[], width: number, height: number, padding: number, fixedMin?: number, fixedMax?: number) {
  if (values.length < 2) return []

  const min = fixedMin ?? Math.min(...values)
  const max = fixedMax ?? Math.max(...values)
  const range = Math.max(1e-9, max - min)
  const step = (width - padding * 2) / (values.length - 1)

  return values.map((value, index) => {
      const x = padding + index * step
      const y = height - padding - ((value - min) / range) * (height - padding * 2)
      return { x, y }
    })
}

/** Convierte un valor numérico a coordenada Y en el SVG */
function valueToY(value: number, min: number, max: number, height: number, padding: number): number {
  const range = Math.max(1e-9, max - min)
  return height - padding - ((value - min) / range) * (height - padding * 2)
}

// Umbrales por defecto (sincronizados con firmware ESP32)
const DEFAULT_THRESHOLDS = {
  tempWarnLow: 15,
  tempWarnHigh: 30,
  tempCritLow: 10,
  tempCritHigh: 40,
  humWarnLow: 30,
  humWarnHigh: 70,
  humCritLow: 20,
  humCritHigh: 85,
}

type ChartMode = 'dual' | 'temperature' | 'humidity'

function TrendSparkline({ readings, sendIntervalSec }: { readings?: SensorReading[]; sendIntervalSec?: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [windowStart, setWindowStart] = useState(0)
  const [windowSize, setWindowSize] = useState(0)
  const [chartMode, setChartMode] = useState<ChartMode>('dual')
  const [showThresholds, setShowThresholds] = useState(true)

  const normalizedReadings = useMemo(() => {
    if (!readings) return []
    return readings.filter(
      (r) => Number.isFinite(r.timestamp) && Number.isFinite(r.temperature) && Number.isFinite(r.humidity)
    )
  }, [readings])

  useEffect(() => {
    if (!sendIntervalSec || sendIntervalSec <= 0) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sendIntervalSec])

  if (normalizedReadings.length < 2) {
    return (
      <div className="rounded-md border p-2 text-xs text-muted-foreground">
        Sin histórico suficiente para graficar cambios.
      </div>
    )
  }

  const width = 420
  const height = chartMode === 'dual' ? 88 : 130
  const padding = 6
  const th = DEFAULT_THRESHOLDS

  const effectiveWindowSize = windowSize > 0 ? Math.min(windowSize, normalizedReadings.length) : normalizedReadings.length
  const maxStart = Math.max(0, normalizedReadings.length - effectiveWindowSize)
  const effectiveWindowStart = Math.min(windowStart, maxStart)
  const visibleReadings = normalizedReadings.slice(effectiveWindowStart, effectiveWindowStart + effectiveWindowSize)

  const tempValues = visibleReadings.map((r) => r.temperature)
  const humValues = visibleReadings.map((r) => r.humidity)

  if (tempValues.length < 2 || humValues.length < 2) {
    return (
      <div className="rounded-md border p-2 text-xs text-muted-foreground">
        Sin histórico suficiente para graficar cambios.
      </div>
    )
  }

  // Para modos individuales, incluir los umbrales en el rango para que se vean las zonas completas
  const computeRange = (values: number[], _wL: number, _wH: number, cL: number, cH: number) => {
    const dataMin = Math.min(...values)
    const dataMax = Math.max(...values)
    if (!showThresholds) return { min: dataMin, max: dataMax }
    const rangeMin = Math.min(dataMin, cL - 2)
    const rangeMax = Math.max(dataMax, cH + 2)
    return { min: rangeMin, max: rangeMax }
  }

  // Coords para cada modo
  const showTemp = chartMode === 'dual' || chartMode === 'temperature'
  const showHum = chartMode === 'dual' || chartMode === 'humidity'

  let tempCoords: ReturnType<typeof buildSparklineCoordinates> = []
  let humCoords: ReturnType<typeof buildSparklineCoordinates> = []
  let tempRange = { min: 0, max: 1 }
  let humRange = { min: 0, max: 1 }

  if (chartMode === 'dual') {
    tempCoords = buildSparklineCoordinates(tempValues, width, height, padding)
    humCoords = buildSparklineCoordinates(humValues, width, height, padding)
  } else if (chartMode === 'temperature') {
    tempRange = computeRange(tempValues, th.tempWarnLow, th.tempWarnHigh, th.tempCritLow, th.tempCritHigh)
    tempCoords = buildSparklineCoordinates(tempValues, width, height, padding, tempRange.min, tempRange.max)
  } else {
    humRange = computeRange(humValues, th.humWarnLow, th.humWarnHigh, th.humCritLow, th.humCritHigh)
    humCoords = buildSparklineCoordinates(humValues, width, height, padding, humRange.min, humRange.max)
  }

  const tempPoints = tempCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const humPoints = humCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const selectedIndex = hoverIndex != null ? hoverIndex : visibleReadings.length - 1
  const selectedReading = visibleReadings[selectedIndex]
  const selectedTempPoint = tempCoords[selectedIndex]
  const selectedHumPoint = humCoords[selectedIndex]

  const lastTs = normalizedReadings[normalizedReadings.length - 1]?.timestamp
  const nextUpdateTs = sendIntervalSec && lastTs ? lastTs + sendIntervalSec * 1000 : undefined
  const remainingSec = nextUpdateTs ? Math.max(0, Math.ceil((nextUpdateTs - nowMs) / 1000)) : undefined

  const handleMouseMove: React.MouseEventHandler<SVGSVGElement> = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || visibleReadings.length <= 1) return

    const relative = (event.clientX - rect.left) / rect.width
    const index = Math.max(0, Math.min(visibleReadings.length - 1, Math.round(relative * (visibleReadings.length - 1))))
    setHoverIndex(index)
  }

  const handleWheel: React.WheelEventHandler<SVGSVGElement> = (event) => {
    const total = normalizedReadings.length
    if (total <= 8) return
    event.preventDefault()

    const currentSize = effectiveWindowSize
    const currentStart = effectiveWindowStart

    if (event.shiftKey) {
      const panStep = Math.max(1, Math.round(currentSize * 0.18))
      const nextStart = event.deltaY > 0 ? currentStart + panStep : currentStart - panStep
      setWindowStart(Math.max(0, Math.min(total - currentSize, nextStart)))
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const relative = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0.5
    const cursorIndex = Math.round(relative * Math.max(1, currentSize - 1))
    const cursorGlobalIndex = currentStart + cursorIndex

    const zoomStep = Math.max(1, Math.round(total * 0.12))
    const minWindow = Math.min(8, total)
    const nextSize = event.deltaY > 0
      ? Math.min(total, currentSize + zoomStep)
      : Math.max(minWindow, currentSize - zoomStep)

    if (nextSize >= total) {
      setWindowSize(0)
      setWindowStart(0)
      return
    }

    const ratio = currentSize > 1 ? cursorIndex / (currentSize - 1) : 0.5
    const nextStart = Math.round(cursorGlobalIndex - ratio * Math.max(1, nextSize - 1))

    setWindowSize(nextSize)
    setWindowStart(Math.max(0, Math.min(total - nextSize, nextStart)))
  }

  /** Renderiza zonas de alerta (rectángulos con relleno transparente) + líneas de umbral */
  const renderThresholdZones = (
    range: { min: number; max: number },
    warnLow: number,
    warnHigh: number,
    critLow: number,
    critHigh: number,
    warnColor: string,
    critColor: string,
  ) => {
    if (!showThresholds) return null
    const rMin = range.min
    const rMax = range.max
    const toY = (v: number) => valueToY(Math.max(rMin, Math.min(rMax, v)), rMin, rMax, height, padding)

    const yTop = padding
    const yBot = height - padding
    const x0 = padding
    const x1 = width - padding

    // Clamp to visible range
    const yCritHigh = toY(critHigh)
    const yWarnHigh = toY(warnHigh)
    const yWarnLow = toY(warnLow)
    const yCritLow = toY(critLow)

    return (
      <>
        {/* Zona crítica superior: por encima de critHigh */}
        {critHigh < rMax && (
          <rect x={x0} y={yTop} width={x1 - x0} height={Math.max(0, yCritHigh - yTop)}
            fill={critColor} fillOpacity="0.18" />
        )}
        {/* Zona warning superior: entre warnHigh y critHigh */}
        {warnHigh < rMax && (
          <rect x={x0} y={yCritHigh} width={x1 - x0} height={Math.max(0, yWarnHigh - yCritHigh)}
            fill={warnColor} fillOpacity="0.15" />
        )}
        {/* Zona warning inferior: entre critLow y warnLow */}
        {warnLow > rMin && (
          <rect x={x0} y={yWarnLow} width={x1 - x0} height={Math.max(0, yCritLow - yWarnLow)}
            fill={warnColor} fillOpacity="0.15" />
        )}
        {/* Zona crítica inferior: por debajo de critLow */}
        {critLow > rMin && (
          <rect x={x0} y={yCritLow} width={x1 - x0} height={Math.max(0, yBot - yCritLow)}
            fill={critColor} fillOpacity="0.18" />
        )}
        {/* Líneas de umbral */}
        <line x1={x0} x2={x1} y1={yCritHigh} y2={yCritHigh} stroke={critColor} strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.7" />
        <line x1={x0} x2={x1} y1={yWarnHigh} y2={yWarnHigh} stroke={warnColor} strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.6" />
        <line x1={x0} x2={x1} y1={yWarnLow} y2={yWarnLow} stroke={warnColor} strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.6" />
        <line x1={x0} x2={x1} y1={yCritLow} y2={yCritLow} stroke={critColor} strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.7" />
        {/* Etiquetas de umbral */}
        <text x={x1 - 2} y={yCritHigh - 2} textAnchor="end" fontSize="7" fill={critColor} fillOpacity="0.9">
          {critHigh}
        </text>
        <text x={x1 - 2} y={yWarnHigh - 2} textAnchor="end" fontSize="7" fill={warnColor} fillOpacity="0.85">
          {warnHigh}
        </text>
        <text x={x1 - 2} y={yWarnLow + 9} textAnchor="end" fontSize="7" fill={warnColor} fillOpacity="0.85">
          {warnLow}
        </text>
        <text x={x1 - 2} y={yCritLow + 9} textAnchor="end" fontSize="7" fill={critColor} fillOpacity="0.9">
          {critLow}
        </text>
      </>
    )
  }

  return (
    <div className="rounded-md border p-2 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Cambios recientes del sensor</span>
        <span>{Math.min(tempValues.length, humValues.length)} muestras</span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium">Tipo de gráfico</span>
          <select
            value={chartMode}
            onChange={(e) => setChartMode(e.target.value as ChartMode)}
            className="h-6 rounded border bg-background px-1.5 text-[11px]"
          >
            <option value="dual">Doble eje (Recomendado)</option>
            <option value="temperature">Solo Temperatura</option>
            <option value="humidity">Solo Humedad</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium">Rango temporal</span>
          <select className="h-6 rounded border bg-background px-1.5 text-[11px]">
            <option>Últimas 24 horas</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Intervalo configurado: {sendIntervalSec && sendIntervalSec > 0 ? `${sendIntervalSec}s` : 'N/D'}</span>
        <span>
          {remainingSec != null ? `Próxima actualización estimada: ${remainingSec}s` : 'Actualización en tiempo real'}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Ventana visible: {visibleReadings.length}/{normalizedReadings.length} muestras</span>
        <span>{windowSize > 0 ? 'Rueda: zoom horizontal · Shift+rueda: desplazar' : 'Seguimiento en tiempo real (auto)'}</span>
      </div>

      {chartMode !== 'dual' && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showThresholds}
            onChange={() => setShowThresholds(!showThresholds)}
            className="h-3 w-3 accent-primary"
          />
          Mostrar zonas de alerta
        </label>
      )}

      <div className={`${chartMode === 'dual' ? 'h-20' : 'h-32'} w-full rounded-md bg-muted/20 overflow-hidden`}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          onWheel={handleWheel}
        >
          {/* Zonas de alerta (solo en modo individual) */}
          {chartMode === 'temperature' && renderThresholdZones(
            tempRange, th.tempWarnLow, th.tempWarnHigh, th.tempCritLow, th.tempCritHigh,
            '#f59e0b', '#ef4444' // amarillo/rojo para temperatura
          )}
          {chartMode === 'humidity' && renderThresholdZones(
            humRange, th.humWarnLow, th.humWarnHigh, th.humCritLow, th.humCritHigh,
            '#06b6d4', '#3b82f6' // cyan/azul para humedad
          )}

          {/* Línea de cursor */}
          {(selectedTempPoint || selectedHumPoint) && (
            <line
              x1={(selectedTempPoint ?? selectedHumPoint)!.x}
              x2={(selectedTempPoint ?? selectedHumPoint)!.x}
              y1={padding}
              y2={height - padding}
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeDasharray="2 3"
              className="text-muted-foreground"
            />
          )}

          {/* Línea de humedad */}
          {showHum && humPoints && (
            <polyline
              points={humPoints}
              fill="none"
              stroke={chartMode === 'humidity' ? '#06b6d4' : 'currentColor'}
              strokeWidth="2"
              strokeDasharray={chartMode === 'dual' ? '5 4' : undefined}
              className={chartMode === 'dual' ? 'text-muted-foreground' : ''}
            />
          )}

          {/* Línea de temperatura */}
          {showTemp && tempPoints && (
            <polyline
              points={tempPoints}
              fill="none"
              stroke={chartMode === 'temperature' ? '#f97316' : 'currentColor'}
              strokeWidth="2"
              className={chartMode === 'dual' ? 'text-primary' : ''}
            />
          )}

          {/* Puntos de cursor */}
          {showTemp && selectedTempPoint && (
            <circle cx={selectedTempPoint.x} cy={selectedTempPoint.y} r="2.6"
              fill={chartMode === 'temperature' ? '#f97316' : 'currentColor'}
              className={chartMode === 'dual' ? 'text-primary' : ''} />
          )}
          {showHum && selectedHumPoint && (
            <circle cx={selectedHumPoint.x} cy={selectedHumPoint.y} r="2.6"
              fill={chartMode === 'humidity' ? '#06b6d4' : 'currentColor'}
              className={chartMode === 'dual' ? 'text-muted-foreground' : ''} />
          )}
        </svg>
      </div>

      {selectedReading && (
        <div className="text-[11px] text-muted-foreground rounded-md border px-2 py-1">
          {formatDateTime(selectedReading.timestamp)}
          {showTemp && ` · Temp ${selectedReading.temperature.toFixed(1)} °C`}
          {showHum && ` · Hum ${selectedReading.humidity.toFixed(1)} %`}
        </div>
      )}

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        {showTemp && (
          <span className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-4 rounded ${chartMode === 'temperature' ? 'bg-orange-500' : 'bg-primary'}`} /> Temperatura
          </span>
        )}
        {showHum && (
          <span className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-4 rounded ${chartMode === 'humidity' ? 'bg-cyan-500' : 'bg-muted-foreground'}`} /> Humedad
          </span>
        )}
        {chartMode !== 'dual' && showThresholds && (
          <>
            <span className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-4 rounded ${chartMode === 'temperature' ? 'bg-amber-500/50' : 'bg-cyan-500/50'}`} /> Advertencia
            </span>
            <span className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-4 rounded ${chartMode === 'temperature' ? 'bg-red-500/50' : 'bg-blue-500/50'}`} /> Peligro
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export function SensorsMonitorPage() {
  const canSeeSensors = useCanSee('sensores')
  const navigate = useNavigate()

  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [readingsByEquipment, setReadingsByEquipment] = useState<Record<string, SensorReading[]>>({})
  const [panelNowMs, setPanelNowMs] = useState(() => Date.now())

  useEffect(() => {
    let isMounted = true
    setLoading(true)

    getEquipments()
      .then((rows) => {
        if (!isMounted) return
        setEquipment(rows)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los equipos')
      })

    const unsub = subscribeDevices(
      (rows) => {
        if (!isMounted) return
        setDevices(rows)
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'No se pudo leer RTDB de dispositivos')
        setLoading(false)
      }
    )

    return () => {
      isMounted = false
      unsub()
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setPanelNowMs(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  const assignedEquipmentIds = useMemo(() => {
    return [...new Set(devices.map((device) => device.assignedEquipmentId).filter(Boolean) as string[])].sort()
  }, [devices])

  useEffect(() => {
    if (!assignedEquipmentIds.length) {
      setReadingsByEquipment({})
      return
    }

    setReadingsByEquipment((prev) => {
      const next: Record<string, SensorReading[]> = {}
      for (const equipmentId of assignedEquipmentIds) {
        if (prev[equipmentId]) next[equipmentId] = prev[equipmentId]
      }
      return next
    })

    const unsubs = assignedEquipmentIds.map((equipmentId) =>
      subscribeSensorReadings(
        equipmentId,
        30,
        (rows) => {
          setReadingsByEquipment((prev) => ({
            ...prev,
            [equipmentId]: rows,
          }))
        },
        () => {
          setReadingsByEquipment((prev) => ({
            ...prev,
            [equipmentId]: [],
          }))
        }
      )
    )

    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [assignedEquipmentIds])

  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment]
  )

  const areaOptions = useMemo(() => {
    const areas = new Set<string>()
    for (const item of equipment) {
      const area = getAreaLabel(item)
      if (area !== 'Sin área') areas.add(area)
    }
    return [...areas].sort((a, b) => a.localeCompare(b))
  }, [equipment])

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase()

    return devices.filter((device) => {
      const assignedEquipment = device.assignedEquipmentId ? equipmentById.get(device.assignedEquipmentId) : undefined
      const area = getAreaLabel(assignedEquipment)
      const equipmentName = assignedEquipment?.nombre ?? ''
      const equipmentCode = assignedEquipment?.codigo ?? ''

      const passesArea = areaFilter === 'all' || area === areaFilter
      const passesQuery =
        query.length === 0 ||
        device.deviceId.toLowerCase().includes(query) ||
        equipmentName.toLowerCase().includes(query) ||
        equipmentCode.toLowerCase().includes(query) ||
        area.toLowerCase().includes(query)

      return passesArea && passesQuery
    })
  }, [devices, equipmentById, areaFilter, search])

  const metrics = useMemo(() => {
    let online = 0
    let warning = 0
    let critical = 0
    let unassigned = 0

    for (const device of devices) {
      if (isDeviceFresh(device, panelNowMs)) online += 1
      const alert = getTelemetryAlert(device)
      if (alert === 'warning') warning += 1
      if (alert === 'critical') critical += 1
      if (!device.assignedEquipmentId) unassigned += 1
    }

    return {
      total: devices.length,
      online,
      warning,
      critical,
      unassigned,
    }
  }, [devices, panelNowMs])

  if (!canSeeSensors) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Panel Técnico de Sensores
          </h1>
          <p className="text-sm text-muted-foreground">Monitoreo operativo en tiempo real para técnicos de planta.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/sensors')}>
          Ir a gestión IoT completa
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Dispositivos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{metrics.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Online</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{metrics.online}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Warning</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{metrics.warning}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Crítico</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{metrics.critical}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sin asignar</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-slate-600">{metrics.unassigned}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por deviceId, equipo o área"
          />
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Todas las áreas</option>
            {areaOptions.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {loading && <Card><CardContent className="py-8 text-sm text-muted-foreground">Cargando panel...</CardContent></Card>}

      {error && (
        <Card className="border-red-400">
          <CardContent className="py-4 text-sm text-red-600">Error de monitoreo: {error}</CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {filteredDevices.map((device) => {
          const assignedEquipment = device.assignedEquipmentId ? equipmentById.get(device.assignedEquipmentId) : undefined
          const alert = getTelemetryAlert(device)
          const area = getAreaLabel(assignedEquipment)
          const trendReadings = device.assignedEquipmentId ? readingsByEquipment[device.assignedEquipmentId] : undefined
          const isFresh = isDeviceFresh(device, panelNowMs)

          return (
            <Card key={device.deviceId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      {device.deviceId}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {assignedEquipment ? `${assignedEquipment.nombre} (${assignedEquipment.codigo})` : 'Sin equipo asignado'}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    <Badge variant={isFresh ? 'default' : 'secondary'}>{isFresh ? 'Online' : 'Sin datos recientes'}</Badge>
                    {alert === 'critical' && <Badge variant="destructive">Crítico</Badge>}
                    {alert === 'warning' && <Badge className="bg-amber-600 hover:bg-amber-600">Warning</Badge>}
                    {alert === 'normal' && <Badge variant="outline">Normal</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Link2 className="h-4 w-4" />
                  Área: {area}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" />Temperatura</div>
                    <div className="font-semibold">
                      {device.telemetry?.temperatura?.value?.toFixed(1) ?? '—'} {device.telemetry?.temperatura?.unit ?? '°C'}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="h-3.5 w-3.5" />Humedad</div>
                    <div className="font-semibold">
                      {device.telemetry?.humedad?.value?.toFixed(1) ?? '—'} {device.telemetry?.humedad?.unit ?? '%'}
                    </div>
                  </div>
                </div>

                <TrendSparkline readings={trendReadings} sendIntervalSec={device.sendInterval} />

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Última actualización</span>
                  <span>{formatDateTime(device.lastSeen)}</span>
                </div>

                {alert !== 'normal' && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Revisar condición anómala y evaluar creación de incidencia.
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate('/sensors')}>
                    Detalle IoT
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => navigate('/incidents')}>
                    Incidencias
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {!loading && filteredDevices.length === 0 && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">No hay dispositivos para el filtro aplicado.</CardContent>
        </Card>
      )}
    </div>
  )
}
