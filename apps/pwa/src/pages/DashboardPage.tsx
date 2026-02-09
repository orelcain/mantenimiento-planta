import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Wrench,
  MapPin,
  TrendingUp,
  Plus,
  ChevronRight,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import { useAppStore, useAuthStore, useCanValidateIncidents } from '@/store'
import { formatRelativeTime } from '@/lib/utils'
import { fetchLastSensorReadings, fetchSensorSummaryOnce } from '@/services/sensorsRtdb'
import { DEFAULT_PREDICTIVE_THRESHOLDS } from '@/lib/predictive/predictor'
import { useEffect, useMemo, useState } from 'react'
import { IncidentDetail } from '@/components/incidents/IncidentDetail'
import type { User, UserRole, Zone } from '@/types'
import { getUserById } from '@/services/auth'

export function DashboardPage() {
  const navigate = useNavigate()
  const canValidate = useCanValidateIncidents()
  const user = useAuthStore((state) => state.user)
  const { incidents, equipment, zones, selectedIncident, setSelectedIncident } = useAppStore()
  const [selectedZoneForDetail, setSelectedZoneForDetail] = useState<Zone | null>(null)
  const [usersCache, setUsersCache] = useState<Record<string, User>>({})

  // Cache local de detalles IoT por equipo
  const [iotDetails, setIotDetails] = useState<Record<string, {
    temp?: { current: number; avg: number; unit?: string }
    hum?: { current: number; avg: number; unit?: string }
    source?: string
  }>>({})

  // Preparar equipoIds involucrados en tarjetas visibles
  const visibleEquipmentIds = Array.from(
    new Set([
      ...incidents.filter(i => i.prioridad === 'critica' && i.status !== 'cerrada')
        .map(i => i.equipmentId).filter(Boolean) as string[],
      ...incidents.slice(0, 5).map(i => i.equipmentId).filter(Boolean) as string[],
    ])
  )

  const roleLabels: Record<UserRole, string> = {
    admin: 'Admin',
    supervisor: 'Supervisor',
    tecnico: 'Técnico',
    usuario: 'Usuario',
  }

  const isLikelyUserId = (value?: string) =>
    !!value && value.length > 20 && !value.includes(' ')

  const formatUserLabel = (userData?: User, fallback?: string) => {
    if (userData) {
      const providerLabel = userData.authProvider === 'google' ? 'Google' : 'Email'
      return `${userData.nombre} ${userData.apellido} · ${roleLabels[userData.rol]} · ${providerLabel}`
    }
    if (!fallback) return 'Desconocido'
    return fallback
  }

  const recentIncidents = incidents.slice(0, 5)

  const recentUserIds = useMemo(() => {
    const ids = new Set<string>()
    for (const incident of recentIncidents) {
      if (isLikelyUserId(incident.reportadoPor)) ids.add(incident.reportadoPor)
      if (isLikelyUserId(incident.asignadoA)) ids.add(incident.asignadoA!)
    }
    return Array.from(ids)
  }, [recentIncidents])

  useEffect(() => {
    const pending = recentUserIds.filter((id) => !usersCache[id])
    if (pending.length === 0) return

    let active = true
    Promise.all(
      pending.map(async (id) => {
        try {
          const userData = await getUserById(id)
          return { id, userData }
        } catch {
          return null
        }
      })
    ).then((results) => {
      if (!active) return
      const next = { ...usersCache }
      results.forEach((item) => {
        if (item?.userData) next[item.id] = item.userData
      })
      setUsersCache(next)
    })

    return () => {
      active = false
    }
  }, [recentUserIds, usersCache])

  useEffect(() => {
    const load = async () => {
      for (const eqId of visibleEquipmentIds) {
        if (iotDetails[eqId]) continue
        try {
          const [summary, readings] = await Promise.all([
            fetchSensorSummaryOnce(eqId),
            fetchLastSensorReadings(eqId, 15),
          ])
          const last = readings.length > 0 ? readings[readings.length - 1]! : undefined
          const avgTemp = readings.length ? readings.reduce((s, r) => s + (r.temperature || 0), 0) / readings.length : undefined
          const avgHum = readings.length ? readings.reduce((s, r) => s + (r.humidity || 0), 0) / readings.length : undefined
          const source = last?.source ?? summary?.temperatura?.source ?? summary?.humedad?.source

          setIotDetails(prev => ({
            ...prev,
            [eqId]: {
              temp: (typeof last?.temperature === 'number' || typeof avgTemp === 'number' || summary?.temperatura?.value != null) ? {
                current: (typeof last?.temperature === 'number' ? last!.temperature : (summary?.temperatura?.value ?? NaN)),
                avg: Number.isFinite(avgTemp) ? Number(avgTemp!.toFixed(1)) : Number((summary?.temperatura?.value ?? NaN).toFixed?.(1) ?? NaN),
                unit: summary?.temperatura?.unit ?? '°C',
              } : undefined,
              hum: (typeof last?.humidity === 'number' || typeof avgHum === 'number' || summary?.humedad?.value != null) ? {
                current: (typeof last?.humidity === 'number' ? last!.humidity : (summary?.humedad?.value ?? NaN)),
                avg: Number.isFinite(avgHum) ? Number(avgHum!.toFixed(1)) : Number((summary?.humedad?.value ?? NaN).toFixed?.(1) ?? NaN),
                unit: summary?.humedad?.unit ?? '%',
              } : undefined,
              source,
            }
          }))
        } catch (e) {
          // Ignorar errores silenciosamente para no bloquear el dashboard
          console.warn('IoT details load error for', eqId, e)
        }
      }
    }
    if (visibleEquipmentIds.length > 0) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEquipmentIds.join('|')])

  // Estadísticas
  const stats = {
    incidentesActivos: incidents.filter((i) =>
      ['pendiente', 'confirmada', 'en_proceso'].includes(i.status)
    ).length,
    incidentesCriticos: incidents.filter(
      (i) => i.prioridad === 'critica' && i.status !== 'cerrada'
    ).length,
    equiposOperativos: equipment.filter((e) => e.estado === 'operativo').length,
    equiposTotal: equipment.length,
    zonasConIncidentes: new Set(
      incidents.filter((i) => i.status !== 'cerrada').map((i) => i.zoneId)
    ).size,
  }

  // Últimas incidencias
  // Incidencias críticas
  const criticalIncidents = incidents.filter(
    (i) => i.prioridad === 'critica' && i.status !== 'cerrada'
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Bienvenido, {user?.nombre || 'Usuario'}
          </h1>
          <p className="text-muted-foreground">
            Panel de control de mantenimiento industrial
          </p>
        </div>
        <Button onClick={() => navigate('/incidents')}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Incidencia
        </Button>
      </div>

      {/* Alertas críticas */}
      {criticalIncidents.length > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alertas Críticas ({criticalIncidents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {criticalIncidents.slice(0, 3).map((incident) => (
                <div key={incident.id} className="space-y-1">
                  <div
                    className="flex items-center justify-between p-2 bg-card rounded cursor-pointer hover:bg-muted"
                    onClick={() => {
                      setSelectedIncident(incident)
                      navigate('/incidents')
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="font-medium">{incident.titulo}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatRelativeTime(incident.createdAt)}
                    </span>
                  </div>
                  {incident.equipmentId && iotDetails[incident.equipmentId] && (
                    <div className="pl-6 text-xs text-muted-foreground space-y-1">
                      {iotDetails[incident.equipmentId]?.source === 'simulated' && (
                        <div className="text-[11px] uppercase tracking-wide text-amber-600">Dato simulado</div>
                      )}
                      {iotDetails[incident.equipmentId]?.temp && (
                        <div>
                          Temp: {iotDetails[incident.equipmentId]!.temp!.current.toFixed(1)}{iotDetails[incident.equipmentId]!.temp!.unit} 
                          (prom {iotDetails[incident.equipmentId]!.temp!.avg.toFixed(1)}{iotDetails[incident.equipmentId]!.temp!.unit}, 
                          warn {DEFAULT_PREDICTIVE_THRESHOLDS.tempWarnLow}-{DEFAULT_PREDICTIVE_THRESHOLDS.tempWarnHigh}, 
                          crit {DEFAULT_PREDICTIVE_THRESHOLDS.tempCritLow}-{DEFAULT_PREDICTIVE_THRESHOLDS.tempCritHigh})
                        </div>
                      )}
                      {iotDetails[incident.equipmentId]?.hum && (
                        <div>
                          Hum: {iotDetails[incident.equipmentId]!.hum!.current.toFixed(1)}{iotDetails[incident.equipmentId]!.hum!.unit} 
                          (prom {iotDetails[incident.equipmentId]!.hum!.avg.toFixed(1)}{iotDetails[incident.equipmentId]!.hum!.unit}, 
                          warn {DEFAULT_PREDICTIVE_THRESHOLDS.humWarnLow}-{DEFAULT_PREDICTIVE_THRESHOLDS.humWarnHigh}, 
                          crit {DEFAULT_PREDICTIVE_THRESHOLDS.humCritLow}-{DEFAULT_PREDICTIVE_THRESHOLDS.humCritHigh})
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/incidents')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Incidencias Activas
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.incidentesActivos}</div>
            <p className="text-xs text-muted-foreground">
              {stats.incidentesCriticos > 0 && (
                <span className="text-destructive font-medium">
                  {stats.incidentesCriticos} críticas
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/equipment')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Equipos</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.equiposOperativos}/{stats.equiposTotal}
            </div>
            <p className="text-xs text-muted-foreground">operativos</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/map')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Zonas</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{zones.length}</div>
            <p className="text-xs text-muted-foreground">
              {stats.zonasConIncidentes} con incidencias
            </p>
          </CardContent>
        </Card>

        <Card className="-mx-4 sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Tasa Resolución
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {incidents.length > 0
                ? Math.round(
                    (incidents.filter((i) => i.status === 'cerrada').length /
                      incidents.length) *
                      100
                  )
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">
              incidencias cerradas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Últimas incidencias */}
        <Card className="-mx-3 sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Últimas Incidencias</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/incidents')}
              >
                Ver todas
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentIncidents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay incidencias recientes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="flex items-start gap-3 cursor-pointer hover:bg-muted px-3 py-3 rounded-lg"
                    onClick={() => setSelectedIncident(incident)}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        incident.prioridad === 'critica'
                          ? 'bg-destructive'
                          : incident.prioridad === 'alta'
                          ? 'bg-warning'
                          : 'bg-primary'
                      }`}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-medium text-base break-words">{incident.titulo}</p>
                      
                      {/* Estado y Tiempos */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 py-0 font-normal">
                          {incident.status === 'pendiente' && 'Pendiente'}
                          {incident.status === 'confirmada' && 'Confirmada'}
                          {incident.status === 'en_proceso' && 'En proceso'}
                          {incident.status === 'cerrada' && 'Cerrada'}
                        </Badge>
                        <span>•</span>
                        <span>{formatRelativeTime(incident.createdAt)}</span>
                      </div>

                      {/* Información de Creador y Asignado */}
                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground/80 pt-0.5">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-muted-foreground">Reportado:</span>
                          <span className="break-words whitespace-normal">
                            {formatUserLabel(usersCache[incident.reportadoPor], incident.reportadoPor)}
                          </span>
                        </div>
                        {incident.asignadoA && (
                           <div className="flex items-center gap-1">
                             <span className="font-medium text-muted-foreground">Asignado:</span>
                             <span className="break-words whitespace-normal text-primary">
                               {formatUserLabel(usersCache[incident.asignadoA], incident.asignadoA)}
                             </span>
                           </div>
                        )}
                      </div>
                      {incident.equipmentId && iotDetails[incident.equipmentId] && (
                        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                          {iotDetails[incident.equipmentId]?.source === 'simulated' && (
                            <div className="text-[11px] uppercase tracking-wide text-amber-600">Dato simulado</div>
                          )}
                          {iotDetails[incident.equipmentId]?.temp && (
                            <div>
                              Temp: {iotDetails[incident.equipmentId]!.temp!.current.toFixed(1)}{iotDetails[incident.equipmentId]!.temp!.unit} 
                              (prom {iotDetails[incident.equipmentId]!.temp!.avg.toFixed(1)}{iotDetails[incident.equipmentId]!.temp!.unit})
                            </div>
                          )}
                          {iotDetails[incident.equipmentId]?.hum && (
                            <div>
                              Hum: {iotDetails[incident.equipmentId]!.hum!.current.toFixed(1)}{iotDetails[incident.equipmentId]!.hum!.unit} 
                              (prom {iotDetails[incident.equipmentId]!.hum!.avg.toFixed(1)}{iotDetails[incident.equipmentId]!.hum!.unit})
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumen por zona */}
        <Card className="-mx-4 sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Incidencias por Zona</span>
              <Button variant="ghost" size="sm" onClick={() => navigate('/map')}>
                Ver mapa
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {zones.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay zonas configuradas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {zones.map((zone) => {
                  const zoneIncidents = incidents.filter(
                    (i) => i.zoneId === zone.id && i.status !== 'cerrada'
                  )
                  const criticalCount = zoneIncidents.filter(
                    (i) => i.prioridad === 'critica'
                  ).length

                  return (
                    <div
                      key={zone.id}
                      className="flex items-center gap-4 cursor-pointer hover:bg-muted px-3 py-3 rounded-lg"
                      onClick={() => setSelectedZoneForDetail(zone)}
                    >
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: zone.color || '#2196f3' }}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{zone.nombre}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {criticalCount > 0 && (
                          <Badge variant="destructive">{criticalCount}</Badge>
                        )}
                        <Badge variant="outline">{zoneIncidents.length}</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Incident Detail Modal */}
      {selectedIncident && (
        <IncidentDetail
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          canValidate={canValidate}
        />
      )}

      {/* Zone Detail Modal */}
      <Dialog open={!!selectedZoneForDetail} onOpenChange={(open) => !open && setSelectedZoneForDetail(null)}>
        <DialogContent className="max-w-md w-[98vw] md:w-full max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col rounded-xl">
          <DialogHeader className="p-4 border-b shrink-0 bg-card z-10 sticky top-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                {selectedZoneForDetail?.nombre}
              </DialogTitle>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {selectedZoneForDetail && incidents.filter(i => i.zoneId === selectedZoneForDetail.id && i.status !== 'cerrada').length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay incidencias activas en esta zona</p>
              </div>
            ) : (
              selectedZoneForDetail && incidents
                .filter(i => i.zoneId === selectedZoneForDetail.id && i.status !== 'cerrada')
                .map(incident => (
                  <div
                    key={incident.id}
                    className="flex items-center gap-3 cursor-pointer hover:bg-muted p-3 rounded-lg border bg-card/50"
                    onClick={() => {
                      setSelectedZoneForDetail(null)
                      setSelectedIncident(incident)
                    }}
                  >
                    <div className={`w-3 h-3 rounded-full shrink-0 ${
                      incident.prioridad === 'critica' ? 'bg-destructive' :
                      incident.prioridad === 'alta' ? 'bg-warning' : 'bg-primary'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{incident.titulo}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">{incident.status.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(incident.createdAt)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
              ))
            )}
          </div>

          <div className="p-4 border-t bg-card shrink-0">
            <Button variant="outline" className="w-full" onClick={() => setSelectedZoneForDetail(null)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
