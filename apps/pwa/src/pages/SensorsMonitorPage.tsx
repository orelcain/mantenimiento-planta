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

function buildSparklineCoordinates(values: number[], width: number, height: number, padding: number) {
  if (values.length < 2) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1e-9, max - min)
  const step = (width - padding * 2) / (values.length - 1)

  return values.map((value, index) => {
      const x = padding + index * step
      const y = height - padding - ((value - min) / range) * (height - padding * 2)
      return { x, y }
    })
}

function TrendSparkline({ readings, sendIntervalSec }: { readings?: SensorReading[]; sendIntervalSec?: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [windowStart, setWindowStart] = useState(0)
  const [windowSize, setWindowSize] = useState(0)

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

  useEffect(() => {
    const total = normalizedReadings.length
    if (total <= 0) {
      setWindowStart(0)
      setWindowSize(0)
      return
    }

    setWindowSize((prev) => {
      if (prev <= 0) return total
      return Math.min(prev, total)
    })

    setWindowStart((prev) => {
      const size = windowSize > 0 ? Math.min(windowSize, total) : total
      const maxStart = Math.max(0, total - size)
      return Math.min(prev, maxStart)
    })
  }, [normalizedReadings.length, windowSize])

  if (normalizedReadings.length < 2) {
    return (
      <div className="rounded-md border p-2 text-xs text-muted-foreground">
        Sin histórico suficiente para graficar cambios.
      </div>
    )
  }

  const width = 420
  const height = 88
  const padding = 6

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

  const tempCoords = buildSparklineCoordinates(tempValues, width, height, padding)
  const humCoords = buildSparklineCoordinates(humValues, width, height, padding)

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

    const ratio = currentSize > 1 ? cursorIndex / (currentSize - 1) : 0.5
    const nextStart = Math.round(cursorGlobalIndex - ratio * Math.max(1, nextSize - 1))

    setWindowSize(nextSize)
    setWindowStart(Math.max(0, Math.min(total - nextSize, nextStart)))
  }

  return (
    <div className="rounded-md border p-2 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Cambios recientes del sensor</span>
        <span>{Math.min(tempValues.length, humValues.length)} muestras</span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Intervalo configurado: {sendIntervalSec && sendIntervalSec > 0 ? `${sendIntervalSec}s` : 'N/D'}</span>
        <span>
          {remainingSec != null ? `Próxima actualización estimada: ${remainingSec}s` : 'Actualización en tiempo real'}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Ventana visible: {visibleReadings.length}/{normalizedReadings.length} muestras</span>
        <span>Rueda: zoom horizontal · Shift+rueda: desplazar</span>
      </div>

      <div className="h-20 w-full rounded-md bg-muted/20 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          onWheel={handleWheel}
        >
          {selectedTempPoint && selectedHumPoint && (
            <line
              x1={selectedTempPoint.x}
              x2={selectedTempPoint.x}
              y1={padding}
              y2={height - padding}
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeDasharray="2 3"
              className="text-muted-foreground"
            />
          )}
          <polyline
            points={humPoints}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="5 4"
            className="text-muted-foreground"
          />
          <polyline
            points={tempPoints}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary"
          />
          {selectedTempPoint && (
            <circle cx={selectedTempPoint.x} cy={selectedTempPoint.y} r="2.6" fill="currentColor" className="text-primary" />
          )}
          {selectedHumPoint && (
            <circle cx={selectedHumPoint.x} cy={selectedHumPoint.y} r="2.6" fill="currentColor" className="text-muted-foreground" />
          )}
        </svg>
      </div>

      {selectedReading && (
        <div className="text-[11px] text-muted-foreground rounded-md border px-2 py-1">
          {formatDateTime(selectedReading.timestamp)} · Temp {selectedReading.temperature.toFixed(1)} °C · Hum {selectedReading.humidity.toFixed(1)} %
        </div>
      )}

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-4 rounded bg-primary" /> Temperatura
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-4 rounded bg-muted-foreground" /> Humedad
        </span>
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
      if (device.online) online += 1
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
  }, [devices])

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
                    <Badge variant={device.online ? 'default' : 'secondary'}>{device.online ? 'Online' : 'Offline'}</Badge>
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
