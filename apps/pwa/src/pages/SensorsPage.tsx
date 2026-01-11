import { useEffect, useMemo, useState } from 'react'
import { Cpu, Link2, Unlink2, AlertTriangle, Thermometer, Droplets, Activity } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import type { Equipment } from '@/types'
import type { DeviceRow } from '@/services/devicesRtdb'
import type { SensorSummaryNode } from '@/services/sensorsRtdb'
import { assignDeviceToEquipment, subscribeDevices } from '@/services/devicesRtdb'
import { subscribeSensorSummary } from '@/services/sensorsRtdb'

function normalizeTs(ts: number | undefined): number | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  if (ts > 0 && ts < 1e12) return ts * 1000
  return ts
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
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)

  useEffect(() => {
    console.log('[SensorsPage] Iniciando suscripción a devices...')
    const unsub = subscribeDevices(
      (rows) => {
        console.log('[SensorsPage] Dispositivos recibidos:', rows)
        setDevices(rows)
        // Auto seleccionar el primer dispositivo si no hay selección.
        if (!selectedDeviceId && rows[0]?.deviceId) {
          setSelectedDeviceId(rows[0].deviceId)
        }
      },
      (err) => {
        console.error('[SensorsPage] Error:', err)
        setLoadError(err instanceof Error ? err.message : 'Error leyendo dispositivos (RTDB).')
      }
    )

    return () => unsub()
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

    console.log('[SensorsPage] Suscribiendo a telemetría de equipo:', assignedEquipment.id)
    const unsub = subscribeSensorSummary(
      assignedEquipment.id,
      (data) => {
        console.log('[SensorsPage] Telemetría recibida:', data)
        setSensorData(data)
      },
      (err) => {
        console.error('[SensorsPage] Error telemetría:', err)
      }
    )

    return () => unsub()
  }, [assignedEquipment?.id])

  const filteredEquipment = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase()
    return equipment.filter((e) => {
      if (filterEstado !== 'todas' && e.estado !== filterEstado) return false
      if (filterCriticidad !== 'todas' && e.criticidad !== filterCriticidad) return false
      if (!q) return true
      return toEquipmentSearchText(e).includes(q)
    })
  }, [equipment, equipmentSearch, filterCriticidad, filterEstado])

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sensores</h1>
        <p className="text-muted-foreground">
          Empareja dispositivos (ESP32) con equipos sin editar firmware por equipo.
        </p>
      </div>

      {loadError && (
        <div className="text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {loadError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Columna 1: Lista de dispositivos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Dispositivos detectados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-xl">
              <Label>Buscar dispositivo</Label>
              <Input
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                placeholder="Buscar por deviceId (MAC)…"
              />
              <div className="mt-1 text-xs text-muted-foreground">{filteredDevices.length} dispositivo(s)</div>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-auto">
              {filteredDevices.length === 0 ? (
                <div className="text-sm text-muted-foreground">No hay dispositivos aún.</div>
              ) : (
                filteredDevices.map((d) => {
                  const lastSeen = normalizeTs(d.lastSeen)
                  const isSelected = d.deviceId === selectedDeviceId
                  return (
                    <button
                      key={d.deviceId}
                      type="button"
                      onClick={() => setSelectedDeviceId(d.deviceId)}
                      className={`w-full text-left rounded border p-3 transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{d.deviceId}</div>
                        {onlineBadge(Boolean(d.online))}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {lastSeen ? `Último reporte: ${new Date(lastSeen).toLocaleString()}` : 'Sin lastSeen'}
                      </div>
                      {d.assignedEquipmentId && (
                        <div className="mt-1 text-xs">
                          <span className="text-muted-foreground">Equipo: </span>
                          <span className="font-medium">
                            {equipment.find((e) => e.id === d.assignedEquipmentId)?.nombre || d.assignedEquipmentId}
                          </span>
                        </div>
                      )}
                      {!d.assignedEquipmentId && (
                        <div className="mt-1 text-xs text-amber-600">Sin asignar</div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Columna 2: Telemetría en tiempo real */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Telemetría
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedDevice ? (
              <div className="text-sm text-muted-foreground">Selecciona un dispositivo para ver su telemetría.</div>
            ) : !assignedEquipment ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Dispositivo sin asignar</div>
                <div className="text-xs text-muted-foreground">
                  Este sensor no está asignado a ningún equipo. Asígnalo para ver su telemetría.
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Equipo asociado</div>
                  <div className="text-xs">
                    <div className="font-medium">{assignedEquipment.nombre}</div>
                    <div className="text-muted-foreground">{assignedEquipment.codigo}</div>
                    {assignedEquipment.hierarchyPath && (
                      <div className="text-muted-foreground mt-1">{assignedEquipment.hierarchyPath}</div>
                    )}
                  </div>
                </div>

                {sensorData ? (
                  <div className="space-y-3">
                    {/* Temperatura */}
                    {sensorData.temperatura && (
                      <div className="rounded border p-3 bg-orange-50 dark:bg-orange-950/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Thermometer className="h-4 w-4 text-orange-600" />
                          <span className="text-sm font-medium">Temperatura</span>
                        </div>
                        <div className="text-2xl font-bold">
                          {sensorData.temperatura.value?.toFixed(1) ?? '—'} {sensorData.temperatura.unit ?? '°C'}
                        </div>
                        {sensorData.temperatura.status && (
                          <Badge variant={sensorData.temperatura.status === 'normal' ? 'default' : 'destructive'} className="mt-2">
                            {sensorData.temperatura.status}
                          </Badge>
                        )}
                        {sensorData.temperatura.timestamp && (
                          <div className="text-xs text-muted-foreground mt-2">
                            {new Date(sensorData.temperatura.timestamp).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Humedad */}
                    {sensorData.humedad && (
                      <div className="rounded border p-3 bg-blue-50 dark:bg-blue-950/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Droplets className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium">Humedad</span>
                        </div>
                        <div className="text-2xl font-bold">
                          {sensorData.humedad.value?.toFixed(1) ?? '—'} {sensorData.humedad.unit ?? '%'}
                        </div>
                        {sensorData.humedad.status && (
                          <Badge variant={sensorData.humedad.status === 'normal' ? 'default' : 'destructive'} className="mt-2">
                            {sensorData.humedad.status}
                          </Badge>
                        )}
                        {sensorData.humedad.timestamp && (
                          <div className="text-xs text-muted-foreground mt-2">
                            {new Date(sensorData.humedad.timestamp).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Estado online */}
                    {sensorData.online !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Estado del sensor:</span>
                        {onlineBadge(sensorData.online)}
                      </div>
                    )}

                    {sensorData.lastSeen && (
                      <div className="text-xs text-muted-foreground">
                        Última actualización: {new Date(sensorData.lastSeen).toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Esperando datos del sensor...
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Columna 3: Emparejar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Emparejar</span>
              {selectedDevice ? onlineBadge(Boolean(selectedDevice.online)) : <Badge variant="secondary">—</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedDevice ? (
              <div className="text-sm text-muted-foreground">Selecciona un dispositivo para emparejarlo.</div>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Dispositivo</div>
                  <div className="font-medium break-all">{selectedDevice.deviceId}</div>
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

                  <div>
                    <Label>Buscar equipo (opcional)</Label>
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
