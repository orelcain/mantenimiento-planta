import { useEffect, useMemo, useState } from 'react'
import { Cpu, Link2, Unlink2, AlertTriangle, Thermometer, Droplets, Activity, X, BarChart3, Wifi, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import type { Equipment } from '@/types'
import type { DeviceRow } from '@/services/devicesRtdb'
import type { SensorSummaryNode } from '@/services/sensorsRtdb'
import { assignDeviceToEquipment, subscribeDevices, deleteDevice } from '@/services/devicesRtdb'
import { subscribeSensorSummary } from '@/services/sensorsRtdb'
import { saveApConfig } from '@/services/apConfigRtdb'
import { TelemetryChart, type ChartType } from '@/components/telemetry/TelemetryChart'
import { TelemetryExportDialog } from '@/components/telemetry/TelemetryExportDialog'
import { useTelemetryHistory, type TimeRange } from '@/hooks/useTelemetryHistory'

function normalizeTs(ts: number | undefined): number | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  if (ts > 0 && ts < 1e12) return ts * 1000
  return ts
}

function formatDateTime(timestamp: number | Date | undefined): string {
  if (!timestamp) return '—'
  
  try {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
    
    // Validar que la fecha sea válida
    if (isNaN(date.getTime())) return 'Fecha inválida'
    
    // Verificar que la fecha esté en un rango razonable (2020-2035)
    // Ampliado el rango para ser más permisivo
    const year = date.getFullYear()
    if (year < 2020 || year > 2035) {
      // En lugar de mostrar "Fecha inválida", intentar normalizar si parece timestamp en segundos
      if (typeof timestamp === 'number') {
        const normalizedDate = new Date(timestamp * 1000)
        if (!isNaN(normalizedDate.getTime()) && normalizedDate.getFullYear() >= 2020 && normalizedDate.getFullYear() <= 2035) {
          return normalizedDate.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })
        }
      }
      // Silencioso en producción - no inundar consola
      return '—'
    }
    
    // Formatear con zona horaria local del usuario
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  } catch (err) {
    console.error('Error formateando fecha:', err, timestamp)
    return '—'
  }
}

function toEquipmentSearchText(e: Equipment): string {
  return `${e.nombre} ${e.codigo} ${e.hierarchyPath ?? ''} ${e.zonePath?.join(' ') ?? ''}`
    .toLowerCase()
    .trim()
}

function onlineBadge(online: boolean | undefined) {
  if (online) return <Badge variant="default">Online</Badge>
  return <Badge variant="secondary">Offline</Badge>
}

export function SensorsPage() {
  const equipment = useAppStore((s) => s.equipment)
  const user = useAuthStore((s) => s.user)

  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sensorData, setSensorData] = useState<SensorSummaryNode | null>(null)

  const [deviceSearch, setDeviceSearch] = useState('')

  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<Equipment['estado'] | 'todas'>('todas')
  const [filterCriticidad, setFilterCriticidad] = useState<Equipment['criticidad'] | 'todas'>('todas')
  const [filterPlanta, setFilterPlanta] = useState<string>('todas')
  const [filterSector, setFilterSector] = useState<string>('todas')
  const [filterArea, setFilterArea] = useState<string>('todas')
  const [filterSinSensor, setFilterSinSensor] = useState(false)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)

  // Estado para configuración AP
  const [apEnabled, setApEnabled] = useState(true)
  const [apSsid, setApSsid] = useState('')
  const [apPassword, setApPassword] = useState('')
  const [savingAp, setSavingAp] = useState(false)
  const [apSaveError, setApSaveError] = useState<string | null>(null)
  const [apSaveOk, setApSaveOk] = useState<string | null>(null)

  // Estado para eliminar dispositivos
  const [deletingDevice, setDeletingDevice] = useState<string | null>(null)

  // Estado para el gráfico de telemetría
  const [showChart, setShowChart] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('dual-axis')
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')

  useEffect(() => {
    console.log('[SensorsPage] Montando componente, iniciando suscripción devices')
    const unsub = subscribeDevices(
      (rows) => {
        console.log('[SensorsPage] Dispositivos recibidos:', rows.length)
        setDevices(rows)
        setLoadError(null) // Limpiar error si la suscripción funciona
        // Auto seleccionar el primer dispositivo si no hay selección.
        if (!selectedDeviceId && rows[0]?.deviceId) {
          setSelectedDeviceId(rows[0].deviceId)
        }
      },
      (err) => {
        console.error('[SensorsPage] Error suscripción devices:', err)
        const errorMsg = err instanceof Error ? err.message : 'Error leyendo dispositivos de Firebase RTDB'
        setLoadError(`${errorMsg}. Verifica que estés autenticado y que las reglas RTDB permitan lectura.`)
      }
    )

    return () => {
      console.log('[SensorsPage] Desmontando componente')
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredDevices = useMemo(() => {
    const q = deviceSearch.trim().toLowerCase()
    if (!q) return devices
    return devices.filter((d) => d.deviceId.toLowerCase().includes(q))
  }, [deviceSearch, devices])

  const selectedDevice = useMemo(
    () => devices.find((d) => d.deviceId === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  )

  const assignedEquipment = useMemo(() => {
    const id = selectedDevice?.assignedEquipmentId
    if (!id) return null
    return equipment.find((e) => e.id === id) ?? null
  }, [equipment, selectedDevice?.assignedEquipmentId])

  // Suscribirse a telemetría del sensor cuando hay equipo asignado
  useEffect(() => {
    if (!assignedEquipment?.id) {
      setSensorData(null)
      return
    }

    const unsub = subscribeSensorSummary(
      assignedEquipment.id,
      (data) => {
        setSensorData(data)
      },
      (err) => {
        console.error('[SensorsPage] Error telemetría equipo:', err)
      }
    )

    return () => unsub()
  }, [assignedEquipment?.id])

  // Telemetría para mostrar: priorizar la del dispositivo (devices/{id}/telemetry) sobre sensors/{equipmentId}
  // useMemo con comparación profunda para evitar re-renders innecesarios
  const displayTelemetry = useMemo(() => {
    // Si el dispositivo tiene telemetría directa, usarla
    if (selectedDevice?.telemetry) {
      return {
        temperatura: selectedDevice.telemetry.temperatura,
        humedad: selectedDevice.telemetry.humedad,
        online: selectedDevice.online,
        lastSeen: selectedDevice.lastSeen,
        source: selectedDevice.telemetry.source || 'device'
      }
    }
    // Si no, usar la del equipo asignado (sensors/{equipmentId})
    if (sensorData) {
      return {
        ...sensorData,
        source: 'equipment'
      }
    }
    return null
  }, [
    // Solo depender de los valores que realmente importan
    selectedDevice?.telemetry,
    selectedDevice?.online,
    selectedDevice?.lastSeen,
    sensorData
  ])

  // Hook para obtener historial de telemetría (datos simulados por ahora)
  const { data: historyData, loading: historyLoading } = useTelemetryHistory(
    assignedEquipment?.id ?? null,
    displayTelemetry?.temperatura?.value,
    displayTelemetry?.humedad?.value,
    timeRange
  )

  const filteredEquipment = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase()
    
    // Obtener equipos con sensores asignados
    const equiposConSensor = new Set(devices.filter(d => d.assignedEquipmentId).map(d => d.assignedEquipmentId))
    
    return equipment.filter((e) => {
      // Filtro de estado
      if (filterEstado !== 'todas' && e.estado !== filterEstado) return false
      
      // Filtro de criticidad
      if (filterCriticidad !== 'todas' && e.criticidad !== filterCriticidad) return false
      
      // Filtro "solo sin sensor"
      if (filterSinSensor && equiposConSensor.has(e.id)) return false
      
      // Filtros jerárquicos
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        
        if (filterPlanta !== 'todas') {
          const planta = parts[0]
          if (!planta || !planta.toLowerCase().includes(filterPlanta.toLowerCase())) return false
        }
        
        if (filterSector !== 'todas' && parts.length > 1) {
          const sector = parts[1]
          if (!sector || !sector.toLowerCase().includes(filterSector.toLowerCase())) return false
        }
        
        if (filterArea !== 'todas' && parts.length > 2) {
          const area = parts[2]
          if (!area || !area.toLowerCase().includes(filterArea.toLowerCase())) return false
        }
      } else if (filterPlanta !== 'todas' || filterSector !== 'todas' || filterArea !== 'todas') {
        // Si no tiene hierarchyPath y hay filtros jerárquicos activos, excluir
        return false
      }
      
      // Búsqueda por texto
      if (!q) return true
      return toEquipmentSearchText(e).includes(q)
    })
  }, [equipment, equipmentSearch, filterCriticidad, filterEstado, filterPlanta, filterSector, filterArea, filterSinSensor, devices])

  // Extraer opciones únicas de jerarquía
  const plantasDisponibles = useMemo(() => {
    const plantas = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        if (parts[0]) plantas.add(parts[0])
      }
    })
    return Array.from(plantas).sort()
  }, [equipment])

  const sectoresDisponibles = useMemo(() => {
    const sectores = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        if (filterPlanta === 'todas' || (parts[0] && parts[0].toLowerCase().includes(filterPlanta.toLowerCase()))) {
          if (parts[1]) sectores.add(parts[1])
        }
      }
    })
    return Array.from(sectores).sort()
  }, [equipment, filterPlanta])

  const areasDisponibles = useMemo(() => {
    const areas = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        const matchPlanta = filterPlanta === 'todas' || (parts[0] && parts[0].toLowerCase().includes(filterPlanta.toLowerCase()))
        const matchSector = filterSector === 'todas' || (parts[1] && parts[1].toLowerCase().includes(filterSector.toLowerCase()))
        
        if (matchPlanta && matchSector && parts[2]) {
          areas.add(parts[2])
        }
      }
    })
    return Array.from(areas).sort()
  }, [equipment, filterPlanta, filterSector])

  async function saveAssignment(equipmentId: string | null) {
    if (!user?.id) return
    if (!selectedDevice) return

    setSaveError(null)
    setSaveOk(null)
    setSaving(true)

    try {
      await assignDeviceToEquipment({ deviceId: selectedDevice.deviceId, equipmentId, userId: user.id })
      setSaveOk(equipmentId ? 'Asignación guardada.' : 'Asignación eliminada.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error guardando asignación (RTDB).')
    } finally {
      setSaving(false)
    }
  }

  async function saveApConfiguration() {
    if (!selectedDevice) return

    setApSaveError(null)
    setApSaveOk(null)
    setSavingAp(true)

    try {
      await saveApConfig(selectedDevice.deviceId, {
        enabled: apEnabled,
        ssid: apSsid.trim() || undefined,
        password: apPassword.trim() || undefined
      })
      setApSaveOk('✓ Configuración AP enviada al dispositivo')
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setApSaveOk(null), 3000)
    } catch (err) {
      setApSaveError(err instanceof Error ? err.message : 'Error guardando configuración AP')
    } finally {
      setSavingAp(false)
    }
  }

  async function handleDeleteDevice(deviceId: string) {
    if (!confirm(`¿Seguro que quieres eliminar el dispositivo ${deviceId}?\n\nEsta acción no se puede deshacer.`)) {
      return
    }

    setDeletingDevice(deviceId)
    try {
      await deleteDevice(deviceId)
      // Si era el dispositivo seleccionado, limpiar selección
      if (deviceId === selectedDeviceId) {
        setSelectedDeviceId('')
      }
    } catch (err) {
      console.error('[SensorsPage] Error eliminando dispositivo:', err)
      alert(err instanceof Error ? err.message : 'Error eliminando dispositivo')
    } finally {
      setDeletingDevice(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sensores IoT</h1>
        <p className="text-muted-foreground">
          Gestiona dispositivos ESP32, visualiza telemetría en tiempo real y configura WiFi local (AP).
        </p>
      </div>

      {loadError && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-destructive">Error de conexión</div>
              <div className="text-sm text-destructive/90 mt-1">{loadError}</div>
              <div className="text-xs text-muted-foreground mt-2">
                • Verifica que estés autenticado en Firebase
                <br />
                • Revisa que el ESP32 esté encendido y conectado
                <br />• Comprueba las reglas de seguridad de Firebase RTDB
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info rápida de estado */}
      {!loadError && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Dispositivos</div>
                  <div className="text-2xl font-bold">{devices.length}</div>
                </div>
                <Cpu className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Online</div>
                  <div className="text-2xl font-bold text-green-600">
                    {devices.filter(d => d.online).length}
                  </div>
                </div>
                <Activity className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Asignados</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {devices.filter(d => d.assignedEquipmentId).length}
                  </div>
                </div>
                <Link2 className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Layout principal */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Columna izquierda: Lista de dispositivos */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                Dispositivos ESP32
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {devices.length === 0 ? (
                <div className="text-center py-8">
                  <Cpu className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <div className="text-sm font-medium">No hay dispositivos detectados</div>
                  <div className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">
                    Verifica que tu ESP32 esté encendido, conectado a WiFi y publicando en Firebase RTDB.
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label>Buscar dispositivo</Label>
                    <Input
                      value={deviceSearch}
                      onChange={(e) => setDeviceSearch(e.target.value)}
                      placeholder="Buscar por ID (MAC)…"
                      className="mt-1"
                    />
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      {filteredDevices.length} de {devices.length} dispositivo(s)
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-auto">
                    {filteredDevices.map((d) => {
                      const lastSeen = normalizeTs(d.lastSeen)
                      const isSelected = d.deviceId === selectedDeviceId
                      const assignedEquip = d.assignedEquipmentId 
                        ? equipment.find((e) => e.id === d.assignedEquipmentId)
                        : null
                      const isDeleting = deletingDevice === d.deviceId
                      
                      return (
                        <div
                          key={d.deviceId}
                          className={`rounded-lg border transition-all ${
                            isSelected 
                              ? 'border-primary bg-primary/5 shadow-sm' 
                              : 'hover:border-muted-foreground/20'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedDeviceId(d.deviceId)}
                            disabled={isDeleting}
                            className="w-full text-left p-3"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-mono text-xs font-medium truncate text-muted-foreground mb-1">
                                  {d.deviceId}
                                </div>
                                {d.deviceName && (
                                  <div className="text-sm font-medium">{d.deviceName}</div>
                                )}
                                {d.apSsid && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    📶 {d.apSsid}
                                  </div>
                                )}
                              </div>
                              {onlineBadge(Boolean(d.online))}
                            </div>

                            {assignedEquip && (
                              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded text-xs">
                                <div className="font-medium text-blue-900 dark:text-blue-100">
                                  {assignedEquip.nombre}
                                </div>
                                <div className="text-blue-600 dark:text-blue-400 mt-0.5">
                                  {assignedEquip.codigo}
                                </div>
                              </div>
                            )}

                            {!assignedEquip && (
                              <div className="mt-2 text-xs">
                                <Badge variant="secondary" className="text-amber-600">
                                  Sin asignar
                                </Badge>
                              </div>
                            )}

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">
                                {lastSeen ? formatDateTime(lastSeen) : 'Sin reporte'}
                              </div>
                              {d.ip && (
                                <div className="text-xs text-muted-foreground">
                                  {d.ip}
                                </div>
                              )}
                            </div>
                          </button>
                          
                          {/* Botón de eliminar */}
                          <div className="px-3 pb-3 pt-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDevice(d.deviceId)}
                              disabled={isDeleting}
                              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              {isDeleting ? (
                                <>Eliminando...</>
                              ) : (
                                <>
                                  <Trash2 className="h-3 w-3 mr-2" />
                                  Eliminar dispositivo
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: Detalles del dispositivo seleccionado */}
        <div className="space-y-4">
          {!selectedDevice ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Cpu className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <div className="text-lg font-medium mb-2">Selecciona un dispositivo</div>
                <div className="text-sm text-muted-foreground max-w-md mx-auto">
                  Elige un ESP32 de la lista para ver su telemetría en tiempo real, asignarlo a un equipo y configurar su WiFi local.
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Card de Telemetría */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Telemetría en tiempo real
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {assignedEquipment && (
                    <div className="space-y-2 pb-3 border-b">
                      <div className="text-sm font-medium">Equipo asociado</div>
                      <div className="text-xs">
                        <div className="font-medium">{assignedEquipment.nombre}</div>
                        <div className="text-muted-foreground">{assignedEquipment.codigo}</div>
                        {assignedEquipment.hierarchyPath && (
                          <div className="text-muted-foreground mt-1">{assignedEquipment.hierarchyPath}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Dispositivo sin asignar */}
                  {!assignedEquipment && (
                    <div className="pb-3 border-b">
                      <div className="text-sm font-medium">Dispositivo sin asignar</div>
                      <div className="text-xs text-muted-foreground">
                        Este sensor no está asignado a ningún equipo. Puedes ver su telemetría en tiempo real para verificar que funciona.
                      </div>
                    </div>
                  )}

                  {displayTelemetry ? (
                    <div className="space-y-3">
                    {/* Temperatura */}
                    {displayTelemetry.temperatura && (
                      <div className="rounded border p-3 bg-orange-50 dark:bg-orange-950/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Thermometer className="h-4 w-4 text-orange-600" />
                          <span className="text-sm font-medium">Temperatura</span>
                        </div>
                        <div className="text-2xl font-bold">
                          {displayTelemetry.temperatura.value?.toFixed(1) ?? '—'} {displayTelemetry.temperatura.unit ?? '°C'}
                        </div>
                        {displayTelemetry.temperatura.status && (
                          <Badge variant={displayTelemetry.temperatura.status === 'normal' ? 'default' : 'destructive'} className="mt-2">
                            {displayTelemetry.temperatura.status}
                          </Badge>
                        )}
                        {displayTelemetry.temperatura.timestamp && (
                          <div className="text-xs text-muted-foreground mt-2">
                            {formatDateTime(displayTelemetry.temperatura.timestamp)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Humedad */}
                    {displayTelemetry.humedad && (
                      <div className="rounded border p-3 bg-blue-50 dark:bg-blue-950/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Droplets className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium">Humedad</span>
                        </div>
                        <div className="text-2xl font-bold">
                          {displayTelemetry.humedad.value?.toFixed(1) ?? '—'} {displayTelemetry.humedad.unit ?? '%'}
                        </div>
                        {displayTelemetry.humedad.status && (
                          <Badge variant={displayTelemetry.humedad.status === 'normal' ? 'default' : 'destructive'} className="mt-2">
                            {displayTelemetry.humedad.status}
                          </Badge>
                        )}
                        {displayTelemetry.humedad.timestamp && (
                          <div className="text-xs text-muted-foreground mt-2">
                            {formatDateTime(displayTelemetry.humedad.timestamp)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Estado online */}
                    {displayTelemetry.online !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Estado del sensor:</span>
                        {onlineBadge(displayTelemetry.online)}
                      </div>
                    )}

                    {displayTelemetry.lastSeen && (
                      <div className="text-xs text-muted-foreground">
                        Última actualización: {formatDateTime(displayTelemetry.lastSeen)}
                      </div>
                    )}

                    {/* Botón para mostrar/ocultar gráfico histórico */}
                    <div className="pt-4 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowChart(!showChart)}
                        className="w-full gap-2"
                      >
                        <BarChart3 className="h-4 w-4" />
                        {showChart ? 'Ocultar' : 'Ver'} Gráfico Histórico
                      </Button>

                      {/* Gráfico histórico expandible */}
                      {showChart && (
                        <div className="mt-4 space-y-3">
                          {/* Controles: Tipo de gráfico y Rango temporal */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label htmlFor="chart-type" className="text-sm">Tipo de gráfico</Label>
                              <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                                <SelectTrigger id="chart-type" className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="line">📈 Línea de tiempo</SelectItem>
                                  <SelectItem value="area">🌊 Área suavizada</SelectItem>
                                  <SelectItem value="dual-axis">🎯 Doble eje (Recomendado)</SelectItem>
                                  <SelectItem value="scatter">🔵 Scatter (Correlación)</SelectItem>
                                  <SelectItem value="bar">📊 Barras por hora</SelectItem>
                                  <SelectItem value="radar">🕸️ Radar de estado</SelectItem>
                                  <SelectItem value="gauge">🧭 Gauge (Temperatura)</SelectItem>
                                  <SelectItem value="heatmap">🧩 Heatmap (Día vs Hora)</SelectItem>
                                  <SelectItem value="candlestick">🕯️ Candlestick (OHLC)</SelectItem>
                                  <SelectItem value="mixed">🧪 Mixed (Combinado)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="time-range" className="text-sm">Rango temporal</Label>
                              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                                <SelectTrigger id="time-range" className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1h">⏱️ Última hora</SelectItem>
                                  <SelectItem value="6h">🕐 Últimas 6 horas</SelectItem>
                                  <SelectItem value="12h">🕛 Últimas 12 horas</SelectItem>
                                  <SelectItem value="24h">📅 Últimas 24 horas</SelectItem>
                                  <SelectItem value="48h">📆 Últimos 2 días</SelectItem>
                                  <SelectItem value="7d">📊 Última semana</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Gráfico */}
                          <div className="rounded border bg-card p-4">
                            {historyLoading ? (
                              <div className="text-sm text-muted-foreground text-center py-8">
                                🔄 Cargando historial...
                              </div>
                            ) : historyData.length === 0 ? (
                              <div className="text-sm text-muted-foreground text-center py-8">
                                No hay datos históricos disponibles
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-xs text-muted-foreground">
                                    {timeRange === '1h' && 'Última hora'}
                                    {timeRange === '6h' && 'Últimas 6 horas'}
                                    {timeRange === '12h' && 'Últimas 12 horas'}
                                    {timeRange === '24h' && 'Últimas 24 horas'}
                                    {timeRange === '48h' && 'Últimos 2 días'}
                                    {timeRange === '7d' && 'Última semana'}
                                    {' · '}{historyData.length} puntos de datos
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <TelemetryExportDialog
                                      devices={devices}
                                      equipment={equipment}
                                      defaultDeviceId={selectedDeviceId}
                                      defaultPreset={timeRange}
                                    />
                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                      💡 Zoom: scroll | Pan: Ctrl+arrastrar
                                    </div>
                                  </div>
                                </div>
                                {/* Key estable para evitar re-montaje del gráfico */}
                                <TelemetryChart 
                                  key={`${selectedDeviceId}-${chartType}-${timeRange}`}
                                  data={historyData} 
                                  type={chartType} 
                                  height={450} 
                                />
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Esperando datos del sensor...
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card de Emparejar */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Link2 className="h-5 w-5" />
                      Emparejar
                    </span>
                    {onlineBadge(Boolean(selectedDevice.online))}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Dispositivo</div>
                    <div className="font-mono text-sm">{selectedDevice.deviceId}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedDevice.ip ? `IP: ${selectedDevice.ip}` : ''}
                      {typeof selectedDevice.rssi === 'number' ? ` · RSSI: ${selectedDevice.rssi} dBm` : ''}
                    </div>
                    {selectedDevice.firmwareVersion && (
                      <div className="text-xs text-muted-foreground">Firmware: {selectedDevice.firmwareVersion}</div>
                    )}
                  </div>

                <div className="rounded border p-3 bg-muted/30">
                  <div className="text-sm font-medium mb-1">Asignación actual</div>
                  <div className="text-xs">
                    {assignedEquipment ? (
                      <>
                        <div className="font-medium">{assignedEquipment.nombre}</div>
                        <div className="text-muted-foreground">{assignedEquipment.codigo}</div>
                      </>
                    ) : selectedDevice.assignedEquipmentId ? (
                      <div className="text-muted-foreground">ID: {selectedDevice.assignedEquipmentId}</div>
                    ) : (
                      <div className="text-amber-600">Sin asignar</div>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <div className="text-sm font-medium">Cambiar asignación</div>
                  
                  {/* Filtros jerárquicos en cascada */}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <Label>Planta</Label>
                      <Select value={filterPlanta} onValueChange={(v) => { setFilterPlanta(v); setFilterSector('todas'); setFilterArea('todas') }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas las plantas</SelectItem>
                          {plantasDisponibles.map(p => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Sector</Label>
                      <Select value={filterSector} onValueChange={(v) => { setFilterSector(v); setFilterArea('todas') }} disabled={filterPlanta === 'todas'}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todos los sectores</SelectItem>
                          {sectoresDisponibles.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Área</Label>
                      <Select value={filterArea} onValueChange={setFilterArea} disabled={filterSector === 'todas'}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas las áreas</SelectItem>
                          {areasDisponibles.map(a => (
                            <SelectItem key={a} value={a}>{a}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Filtros de estado y criticidad */}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <Label>Estado</Label>
                      <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v as any)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todos</SelectItem>
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
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer h-10 px-3 rounded-md border bg-background hover:bg-muted/50 transition-colors w-full">
                        <input
                          type="checkbox"
                          checked={filterSinSensor}
                          onChange={(e) => setFilterSinSensor(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Sin sensor</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Buscar equipo (opcional)</Label>
                      {(equipmentSearch || filterPlanta !== 'todas' || filterSector !== 'todas' || filterArea !== 'todas' || filterEstado !== 'todas' || filterCriticidad !== 'todas' || filterSinSensor) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEquipmentSearch('')
                            setFilterPlanta('todas')
                            setFilterSector('todas')
                            setFilterArea('todas')
                            setFilterEstado('todas')
                            setFilterCriticidad('todas')
                            setFilterSinSensor(false)
                          }}
                          className="h-7 gap-1 text-xs"
                        >
                          <X className="h-3 w-3" />
                          Limpiar filtros
                        </Button>
                      )}
                    </div>
                    <Input
                      value={equipmentSearch}
                      onChange={(e) => setEquipmentSearch(e.target.value)}
                      placeholder="Escribe para filtrar por nombre o código..."
                    />
                  </div>

                  <div>
                    <Label>Selecciona un equipo ({filteredEquipment.length} de {equipment.length} totales)</Label>
                    <div className="mt-2 max-h-[300px] overflow-y-auto border rounded-md bg-muted/20">
                      {equipment.length === 0 ? (
                        <div className="p-4 text-sm text-center space-y-2">
                          <div className="text-muted-foreground">⏳ Cargando equipos...</div>
                          <div className="text-xs text-muted-foreground/70">
                            Si esto tarda mucho, recarga la página
                          </div>
                        </div>
                      ) : filteredEquipment.length === 0 ? (
                        <div className="p-4 text-sm text-center space-y-2">
                          <div className="text-amber-600">No se encontraron equipos con esos filtros</div>
                          <div className="text-xs text-muted-foreground">
                            Prueba cambiar los filtros de Estado o Criticidad
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {filteredEquipment.slice(0, 100).map((e) => {
                            const isSelected = e.id === selectedEquipmentId
                            return (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => setSelectedEquipmentId(e.id)}
                                className={`w-full text-left p-3 transition-colors hover:bg-muted/60 ${isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{e.nombre}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      Código: {e.codigo}
                                    </div>
                                    {e.hierarchyPath && (
                                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                        <span className="opacity-60">📍</span>
                                        <span className="truncate">{e.hierarchyPath}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-1 items-end shrink-0">
                                    <Badge
                                      variant={
                                        e.estado === 'operativo'
                                          ? 'default'
                                          : e.estado === 'en_mantenimiento'
                                            ? 'secondary'
                                            : 'destructive'
                                      }
                                      className="text-xs"
                                    >
                                      {e.estado === 'operativo' ? 'Operativo' : e.estado === 'en_mantenimiento' ? 'Mantención' : 'Fuera'}
                                    </Badge>
                                    <Badge
                                      variant={
                                        e.criticidad === 'alta' ? 'destructive' : e.criticidad === 'media' ? 'default' : 'secondary'
                                      }
                                      className="text-xs"
                                    >
                                      {e.criticidad === 'alta' ? '🔴 Alta' : e.criticidad === 'media' ? '🟡 Media' : '🟢 Baja'}
                                    </Badge>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {filteredEquipment.length > 100 && (
                        <div className="p-2 text-xs text-center text-muted-foreground bg-muted/40 border-t">
                          Mostrando primeros 100 de {filteredEquipment.length}. Usa los filtros para refinar la búsqueda.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => saveAssignment(selectedEquipmentId || null)}
                      disabled={!selectedEquipmentId || saving}
                      className="gap-2"
                    >
                      <Link2 className="h-4 w-4" />
                      {saving ? 'Guardando…' : 'Asignar'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => saveAssignment(null)}
                      disabled={saving}
                      className="gap-2"
                    >
                      <Unlink2 className="h-4 w-4" />
                      Desasignar
                    </Button>
                  </div>

                  {saveError && (
                    <div className="text-sm text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {saveError}
                    </div>
                  )}

                  {saveOk && <div className="text-sm text-muted-foreground">{saveOk}</div>}
                </div>
                </CardContent>
              </Card>

              {/* Card de Configuración AP */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5" />
                    <span>WiFi Local (AP)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Configura el Access Point local del ESP32 para acceder a sus datos sin internet.
                </div>

                {selectedDevice.apSsid && (
                  <div className="rounded border p-2 bg-muted/30">
                    <div className="text-xs font-medium mb-1">AP Actual</div>
                    <div className="text-xs">
                      <div className="font-mono">{selectedDevice.apSsid}</div>
                      <div className="text-muted-foreground">IP: {selectedDevice.apIp || '192.168.4.1'}</div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ap-enabled"
                      checked={apEnabled}
                      onChange={(e) => setApEnabled(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Label htmlFor="ap-enabled" className="text-sm cursor-pointer">
                      AP siempre activo (AP+STA)
                    </Label>
                  </div>

                  <div>
                    <Label htmlFor="ap-ssid">SSID del AP</Label>
                    <Input
                      id="ap-ssid"
                      placeholder="Ej: Sensor-Horno-1"
                      value={apSsid}
                      onChange={(e) => setApSsid(e.target.value)}
                      className="mt-1"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Vacío = ESP32-{selectedDevice.deviceId.slice(-6)}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="ap-password">Contraseña WPA2</Label>
                    <Input
                      id="ap-password"
                      type="password"
                      placeholder="Mínimo 8 caracteres"
                      value={apPassword}
                      onChange={(e) => setApPassword(e.target.value)}
                      className="mt-1"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Vacío = red abierta (sin contraseña)
                    </div>
                  </div>

                  <Button
                    onClick={saveApConfiguration}
                    disabled={savingAp}
                    className="w-full gap-2"
                  >
                    <Wifi className="h-4 w-4" />
                    {savingAp ? 'Enviando…' : 'Guardar Config AP'}
                  </Button>

                  {apSaveError && (
                    <div className="text-sm text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {apSaveError}
                    </div>
                  )}

                  {apSaveOk && (
                    <div className="text-sm text-green-600 font-medium">
                      {apSaveOk}
                    </div>
                  )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
