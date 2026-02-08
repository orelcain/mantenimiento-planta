import { useState, useEffect } from 'react'
import { logger } from '@/lib/logger'
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  UserPlus,
  MapPin,
  Camera,
  X,
  Trash2,
  TrendingUp,
  Thermometer,
  Droplets,
  Edit,
  Wand2,
  Map,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Badge,
  SpeechTextarea,
  Label,
  Spinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import { usePermissions } from '@/hooks/usePermissions'
import { confirmIncident, rejectIncident, closeIncident, assignIncident, deleteIncident, resolveIncident } from '@/services/incidents'
import { getTechnicians, getUserById } from '@/services/auth'
import { refineText, isAIConfigured } from '@/services/ai'
import { useToast } from '@/hooks/useToast'
import type { Incident, IncidentStatus, IncidentPriority, User as UserType } from '@/types'
import { formatDate } from '@/lib/utils'
import { fetchLastSensorReadings, fetchSensorSummaryOnce } from '@/services/sensorsRtdb'
import { DEFAULT_PREDICTIVE_THRESHOLDS } from '@/lib/predictive/predictor'
import { getMapVersionById, getMapLocationById } from '@/services/maps'
import { MapViewer } from '@/components/maps'
import type { MapVersion, MapLocation } from '@/types/maps'
import { IncidentForm } from './IncidentForm'

const STATUS_CONFIG: Record<IncidentStatus, { label: string; icon: any; color: string }> = {
  pendiente: { label: 'Pendiente de validación', icon: Clock, color: 'text-warning' },
  confirmada: { label: 'Confirmada', icon: CheckCircle, color: 'text-primary' },
  rechazada: { label: 'Rechazada', icon: XCircle, color: 'text-destructive' },
  en_proceso: { label: 'En proceso', icon: AlertTriangle, color: 'text-blue-400' },
  resuelta: { label: 'Resuelta', icon: CheckCircle, color: 'text-green-500' },
  cerrada: { label: 'Cerrada', icon: CheckCircle, color: 'text-success' },
}

const PRIORITY_CONFIG: Record<IncidentPriority, { label: string; className: string }> = {
  critica: { label: 'Crítica', className: 'bg-destructive text-destructive-foreground' },
  alta: { label: 'Alta', className: 'bg-warning text-warning-foreground' },
  media: { label: 'Media', className: 'bg-primary text-primary-foreground' },
  baja: { label: 'Baja', className: 'bg-muted text-muted-foreground' },
}

interface IncidentDetailProps {
  incident: Incident
  onClose: () => void
  canValidate: boolean
}

export function IncidentDetail({ incident, onClose, canValidate }: IncidentDetailProps) {
  const user = useAuthStore((state) => state.user)
  const equipment = useAppStore((state) =>
    incident.equipmentId
      ? state.equipment.find((eq) => eq.id === incident.equipmentId)
      : null
  )
  const permissions = usePermissions()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [isRefiningRejection, setIsRefiningRejection] = useState(false)
  const [isRefiningResolution, setIsRefiningResolution] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [technicians, setTechnicians] = useState<UserType[]>([])
  const [selectedTechnician, setSelectedTechnician] = useState<string>('')
  const [assignedUser, setAssignedUser] = useState<UserType | null>(null)
  const [reporterUser, setReporterUser] = useState<UserType | null>(null)
  const [iotLoading, setIotLoading] = useState(false)
  const [iotError, setIotError] = useState<string | null>(null)
  const [iotData, setIotData] = useState<{
    temp?: { current: number; avg: number; unit?: string }
    hum?: { current: number; avg: number; unit?: string }
    source?: string
  } | null>(null)
  
  // Estados para visualización del mapa
  const [mapVersion, setMapVersion] = useState<MapVersion | null>(null)
  const [mapLocation, setMapLocation] = useState<MapLocation | null>(null)
  const [mapLoading, setMapLoading] = useState(false)
  const [reporterName, setReporterName] = useState<string>('')

  // Cargar lista de técnicos
  useEffect(() => {
    if (permissions.canAssignIncident) {
      getTechnicians()
        .then((list) => {
          const valid = list.filter((tech) => Boolean(tech.id))
          setTechnicians(valid)
        })
        .catch((error) => logger.error('Error loading technicians', error instanceof Error ? error : new Error(String(error))))
    }
  }, [permissions.canAssignIncident])

  useEffect(() => {
    if (!showAssignForm) return
    if (selectedTechnician) return
    if (technicians.length === 0) return
    setSelectedTechnician(technicians[0].id)
  }, [showAssignForm, selectedTechnician, technicians])

  // Cargar información del usuario asignado
  useEffect(() => {
    if (incident.asignadoA) {
      getUserById(incident.asignadoA)
        .then(setAssignedUser)
        .catch((error) => logger.error('Error loading assigned user', error instanceof Error ? error : new Error(String(error))))
    }
  }, [incident.asignadoA])

  const roleLabel = (role?: string) => {
    if (role === 'admin') return 'Admin'
    if (role === 'supervisor') return 'Supervisor'
    if (role === 'tecnico') return 'Técnico'
    return 'Usuario'
  }

  const providerLabel = (provider?: string) => (provider === 'google' ? 'Google' : 'Email')

  const formatUserLabel = (userInfo?: UserType | null, fallback?: string) => {
    if (!userInfo) return fallback || ''
    return `${userInfo.nombre} ${userInfo.apellido} · ${roleLabel(userInfo.rol)} · ${providerLabel(userInfo.authProvider)}`
  }

  useEffect(() => {
    if (incident.resolucion) {
      setResolution(incident.resolucion)
    }
  }, [incident.resolucion])

  // Cargar nombre del reportador
  useEffect(() => {
    if (incident.reportadoPor) {
      // Si parece un ID de Firebase (alphanumeric > 10 chars), intentar buscar
      if (incident.reportadoPor.length > 20 && !incident.reportadoPor.includes(' ')) {
        getUserById(incident.reportadoPor)
          .then(user => {
            if (user) {
              setReporterUser(user)
              setReporterName(`${user.nombre} ${user.apellido}`)
            }
          })
          .catch(() => setReporterName(incident.reportadoPor))
      } else {
        setReporterName(incident.reportadoPor)
      }
    }
  }, [incident.reportadoPor])

  // Cargar datos del mapa si la incidencia tiene posición en mapa
  useEffect(() => {
    const loadMapData = async () => {
      if (!incident.mapVersionId || !incident.mapLocationId) {
        setMapVersion(null)
        setMapLocation(null)
        return
      }
      
      setMapLoading(true)
      try {
        const [versionData, locationData] = await Promise.all([
          getMapVersionById(incident.mapVersionId),
          getMapLocationById(incident.mapLocationId)
        ])
        setMapVersion(versionData)
        setMapLocation(locationData)
      } catch (error) {
        logger.error('Error loading map data', error instanceof Error ? error : new Error(String(error)))
      } finally {
        setMapLoading(false)
      }
    }
    
    loadMapData()
  }, [incident.mapVersionId, incident.mapLocationId])

  // Cargar datos IoT del equipo asociado
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!incident.equipmentId) {
        setIotData(null)
        setIotError(null)
        return
      }
      setIotLoading(true)
      setIotError(null)
      try {
        const [summary, readings] = await Promise.all([
          fetchSensorSummaryOnce(incident.equipmentId),
          fetchLastSensorReadings(incident.equipmentId, 20),
        ])

        if (!active) return

        const validTemps = readings
          .map((r) => r.temperature)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        const validHums = readings
          .map((r) => r.humidity)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        const lastReading = readings[readings.length - 1]

        const tempCurrent = typeof validTemps[validTemps.length - 1] === 'number'
          ? validTemps[validTemps.length - 1]
          : (typeof summary?.temperatura?.value === 'number' ? summary.temperatura.value : undefined)
        const humCurrent = typeof validHums[validHums.length - 1] === 'number'
          ? validHums[validHums.length - 1]
          : (typeof summary?.humedad?.value === 'number' ? summary.humedad.value : undefined)

        const tempAvg = validTemps.length
          ? Number((validTemps.reduce((s, v) => s + v, 0) / validTemps.length).toFixed(1))
          : (typeof summary?.temperatura?.value === 'number' ? Number(summary.temperatura.value.toFixed?.(1) ?? summary.temperatura.value) : undefined)
        const humAvg = validHums.length
          ? Number((validHums.reduce((s, v) => s + v, 0) / validHums.length).toFixed(1))
          : (typeof summary?.humedad?.value === 'number' ? Number(summary.humedad.value.toFixed?.(1) ?? summary.humedad.value) : undefined)

        const source = lastReading?.source ?? summary?.temperatura?.source ?? summary?.humedad?.source

        setIotData({
          temp: typeof tempCurrent === 'number' && Number.isFinite(tempCurrent)
            ? { current: tempCurrent, avg: tempAvg ?? tempCurrent, unit: summary?.temperatura?.unit ?? '°C' }
            : undefined,
          hum: typeof humCurrent === 'number' && Number.isFinite(humCurrent)
            ? { current: humCurrent, avg: humAvg ?? humCurrent, unit: summary?.humedad?.unit ?? '%' }
            : undefined,
          source,
        })
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error('Error loading IoT data')
        logger.error('Error loading IoT data', err)
        if (active) setIotError('No se pudieron cargar los datos IoT del equipo.')
      } finally {
        if (active) setIotLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [incident.equipmentId])

  const statusConfig = STATUS_CONFIG[incident.status]
  const priorityConfig = PRIORITY_CONFIG[incident.prioridad]
  const StatusIcon = statusConfig.icon

  // Confirmar incidencia
  const handleConfirm = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      await confirmIncident(incident.id, user.id)
      logger.info('Incident confirmed', { incidentId: incident.id })
      onClose()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error confirming incident')
      logger.error('Error confirming incident', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Rechazar incidencia
  const handleReject = async () => {
    if (!user || !rejectionReason.trim()) return
    setIsLoading(true)
    try {
      await rejectIncident(incident.id, user.id, rejectionReason)
      logger.info('Incident rejected', { incidentId: incident.id, reason: rejectionReason })
      onClose()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error rejecting incident')
      logger.error('Error rejecting incident', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Asignar incidencia
  const handleAssign = async (technicianId = selectedTechnician) => {
    if (!user) return
    const normalizedTechnicianId = typeof technicianId === 'string'
      ? technicianId
      : (technicianId as any)?.id
    if (!normalizedTechnicianId) {
      toast({ variant: 'destructive', title: 'Error', description: 'No hay técnico válido para asignación.' })
      return
    }
    setIsLoading(true)
    try {
      await assignIncident(incident.id, normalizedTechnicianId, user.id)
      logger.info('Incident assigned', { incidentId: incident.id, technicianId: normalizedTechnicianId })
      toast({ title: 'Asignación realizada', description: 'La incidencia fue asignada correctamente.' })
      setShowAssignForm(false)
      onClose()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error assigning incident')
      logger.error('Error assigning incident', err)
      toast({ variant: 'destructive', title: 'Error al asignar', description: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-asignarse la incidencia
  const handleSelfAssign = async () => {
    if (!user) return
    if (!permissions.canWorkOnIncident(user.id) && user.rol !== 'admin') {
       // El usuario debe tener permiso para trabajar o ser admin
       // Aunque el permiso canAssignIncident quizás es suficiente,
       // idealmente solo técnicos se asignan.
       // Pero el requerimiento es "el que la crea debe poder asignarse"
       // Asumimos que si la creó, y tiene acceso a este botón, puede.
    }
    await handleAssign(user.id)
  }

  // Resolver incidencia (Técnico finaliza)
  const handleResolve = async () => {
    if (!resolution.trim()) return
    // Validación de longitud mínima (coincide con firestore.rules)
    if (resolution.trim().length < 3) {
      toast({ 
        variant: 'destructive', 
        title: 'Resolución muy corta', 
        description: 'Por favor detalla la solución (mínimo 3 caracteres).' 
      })
      return
    }
    setIsLoading(true)
    try {
      await resolveIncident(
        incident.id,
        resolution,
        undefined,
        user?.id,
        user ? `${user.nombre} ${user.apellido}` : ''
      )
      logger.info('Incident resolved', { incidentId: incident.id })
      toast({ title: 'Incidencia resuelta', description: 'Se ha notificado al supervisor para su validación.' })
      onClose()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error resolving incident')
      logger.error('Error resolving incident', err)
      toast({ variant: 'destructive', title: 'Error', description: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  // Cerrar incidencia
  const handleClose = async () => {
    if (!resolution.trim()) return
    setIsLoading(true)
    try {
      await closeIncident(incident.id, resolution)
      logger.info('Incident closed', { incidentId: incident.id })
      onClose()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error closing incident')
      logger.error('Error closing incident', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Eliminar incidencia (solo Admin)
  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de eliminar esta incidencia? Esta acción no se puede deshacer.')) {
      return
    }
    setIsLoading(true)
    try {
      await deleteIncident(incident.id)
      logger.info('Incident deleted', { incidentId: incident.id })
      onClose()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error deleting incident')
      logger.error('Error deleting incident', err)
      alert('Error al eliminar la incidencia')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefineRejection = async () => {
    if (!rejectionReason || rejectionReason.length < 5) return
    
    if (!isAIConfigured()) {
      toast({ variant: "destructive", title: "Error", description: "Falta API Key de IA" })
      return
    }

    setIsRefiningRejection(true)
    toast({ description: "Mejorando redacción..." })
    
    try {
      const refined = await refineText(rejectionReason)
      setRejectionReason(refined)
      toast({ title: "¡Listo!", description: "Texto mejorado." })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Falló la IA" })
    } finally {
      setIsRefiningRejection(false)
    }
  }

  const handleRefineResolution = async () => {
    if (!resolution || resolution.length < 5) return
    
    if (!isAIConfigured()) {
      toast({ variant: "destructive", title: "Error", description: "Falta API Key de IA" })
      return
    }

    setIsRefiningResolution(true)
    toast({ description: "Mejorando redacción..." })
    
    try {
      const refined = await refineText(resolution)
      setResolution(refined)
      toast({ title: "¡Listo!", description: "Texto mejorado." })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Falló la IA" })
    } finally {
      setIsRefiningResolution(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-4xl w-[98vw] md:w-full max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col rounded-xl">
          <DialogHeader className="p-4 border-b shrink-0 bg-card z-10 sticky top-0">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-xl line-clamp-1">{incident.titulo}</DialogTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatDate(incident.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={priorityConfig.className}>
                  {priorityConfig.label}
                </Badge>
                <Badge variant="outline" className={statusConfig.color}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig.label}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Descripción */}
            <div>
              <h4 className="font-medium mb-2">Descripción</h4>
              <p className="text-muted-foreground">{incident.descripcion}</p>
            </div>

            {/* Síntomas */}
            {incident.sintomas && incident.sintomas.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Síntomas observados</h4>
                <div className="flex flex-wrap gap-2">
                  {incident.sintomas.map((sintoma, index) => (
                    <Badge key={index} variant="outline">
                      {sintoma}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Datos IoT del equipo */}
            {incident.equipmentId && (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <div>
                      <h4 className="font-medium">Datos IoT del equipo</h4>
                      <p className="text-xs text-muted-foreground">
                        {equipment?.nombre || 'Equipo vinculado'}
                        {equipment?.codigo ? ` · ${equipment.codigo}` : ''}
                      </p>
                    </div>
                  </div>
                  {iotData?.source === 'simulated' && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                      Dato simulado
                    </Badge>
                  )}
                </div>

                {iotLoading && (
                  <p className="text-sm text-muted-foreground">Cargando lecturas...</p>
                )}

                {iotError && (
                  <p className="text-sm text-destructive">{iotError}</p>
                )}

                {!iotLoading && !iotError && !iotData && (
                  <p className="text-sm text-muted-foreground">Sin lecturas IoT para este equipo.</p>
                )}

                {!iotLoading && !iotError && iotData && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded border bg-background space-y-1">
                      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground tracking-wide">
                        <Thermometer className="h-4 w-4" />
                        <span>Temperatura</span>
                      </div>
                      {iotData.temp ? (
                        <>
                          <div className="text-lg font-semibold">
                            {iotData.temp.current.toFixed(1)}{iotData.temp.unit ?? '°C'}
                          </div>
                          <div className="text-xs text-muted-foreground leading-snug">
                            Prom {iotData.temp.avg.toFixed(1)}{iotData.temp.unit ?? '°C'} · Warn {DEFAULT_PREDICTIVE_THRESHOLDS.tempWarnLow}-{DEFAULT_PREDICTIVE_THRESHOLDS.tempWarnHigh} · Crit {DEFAULT_PREDICTIVE_THRESHOLDS.tempCritLow}-{DEFAULT_PREDICTIVE_THRESHOLDS.tempCritHigh}
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Sin lecturas recientes.</p>
                      )}
                    </div>

                    <div className="p-3 rounded border bg-background space-y-1">
                      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground tracking-wide">
                        <Droplets className="h-4 w-4" />
                        <span>Humedad</span>
                      </div>
                      {iotData.hum ? (
                        <>
                          <div className="text-lg font-semibold">
                            {iotData.hum.current.toFixed(1)}{iotData.hum.unit ?? '%'}
                          </div>
                          <div className="text-xs text-muted-foreground leading-snug">
                            Prom {iotData.hum.avg.toFixed(1)}{iotData.hum.unit ?? '%'} · Warn {DEFAULT_PREDICTIVE_THRESHOLDS.humWarnLow}-{DEFAULT_PREDICTIVE_THRESHOLDS.humWarnHigh} · Crit {DEFAULT_PREDICTIVE_THRESHOLDS.humCritLow}-{DEFAULT_PREDICTIVE_THRESHOLDS.humCritHigh}
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Sin lecturas recientes.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fotos */}
            {incident.fotos.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Fotos ({incident.fotos.length})
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  {incident.fotos.map((foto, index) => (
                    <img
                      key={index}
                      src={foto}
                      alt={`Foto ${index + 1}`}
                      className="aspect-square object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setSelectedPhoto(foto)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Ubicación en mapa */}
            {incident.mapPosition && mapVersion && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Map className="h-4 w-4" />
                  Ubicación en mapa
                  {mapLocation && (
                    <Badge variant="outline" className="ml-1">
                      {mapLocation.nombre}
                    </Badge>
                  )}
                </h4>
                {mapLoading ? (
                  <div className="h-40 flex items-center justify-center bg-muted rounded-lg">
                    <Spinner className="h-6 w-6" />
                  </div>
                ) : (
                  <div className="w-full aspect-square md:aspect-[4/3] max-h-[50vh] min-h-[300px] md:min-h-[400px] rounded-lg overflow-hidden border">
                  <MapViewer
                    imageUrl={mapVersion.imageUrl}
                    markers={[{
                      id: incident.id,
                      position: incident.mapPosition,
                      title: incident.titulo
                    }]}
                    editable={false}
                    showControls={true}
                    className="h-full w-full"
                    markerColor="#ef4444"
                    autoFitMarkers={true}
                  />
                  </div>
                )}
              </div>
            )}

            {/* Info adicional */}
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>Zona: {incident.zoneId}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>
                      Reportado por: {formatUserLabel(reporterUser, reporterName || incident.reportadoPor)}
                    </span>
                  </div>
                </div>

                {/* Usuario asignado */}
                {assignedUser ? (
                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">Asignado a:</span>
                    </div>
                    <p className="text-sm">
                      {assignedUser.nombre} {assignedUser.apellido}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge variant="outline">
                        {roleLabel(assignedUser.rol)}
                      </Badge>
                      <Badge variant="secondary">
                        {providerLabel(assignedUser.authProvider)}
                      </Badge>
                    </div>
                  </div>
                ) : incident.status === 'confirmada' && permissions.canAssignIncident && (
                  <div className="p-3 bg-warning/10 rounded-lg border border-warning/20">
                    <div className="flex items-center gap-2 text-warning">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-medium">Sin asignar</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Motivo de rechazo */}
            {incident.status === 'rechazada' && incident.rejectionReason && (
              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <h4 className="font-medium text-destructive mb-2">
                  Motivo de rechazo
                </h4>
                <p className="text-sm">{incident.rejectionReason}</p>
              </div>
            )}

            {/* Resolución */}
            {(incident.status === 'resuelta' || incident.status === 'cerrada') && incident.resolucion && (
              <div className="p-4 bg-success/10 rounded-lg border border-success/20">
                <h4 className="font-medium text-success mb-2">
                  {incident.status === 'resuelta' ? 'Resolución (Por Validar)' : 'Resolución'}
                </h4>
                <p className="text-sm">{incident.resolucion}</p>
                {/* Quién resolvió */}
                {incident.resolvedBy && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Resuelta por: {assignedUser && incident.resolvedBy === assignedUser.id
                      ? `${assignedUser.nombre} ${assignedUser.apellido}`
                      : incident.resolvedByName || incident.resolvedBy}
                  </p>
                )}
                {incident.resolvedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Fecha resolución: {incident.resolvedAt.toLocaleDateString('es-CL')} {incident.resolvedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {incident.tiempoResolucionMinutos != null && incident.tiempoResolucionMinutos > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Tiempo de resolución: {Math.round(incident.tiempoResolucionMinutos / 60)}h {incident.tiempoResolucionMinutos % 60}min
                  </p>
                )}
              </div>
            )}

            {/* Formulario de rechazo */}
            {showRejectForm && (
              <div className="p-4 bg-muted rounded-lg space-y-4">
                <h4 className="font-medium">Rechazar incidencia</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="rejectionReason">Motivo del rechazo *</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRefineRejection}
                      disabled={isRefiningRejection || !rejectionReason || rejectionReason.length < 5}
                      className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                    >
                      {isRefiningRejection ? (
                         <>
                           <Spinner size="sm" />
                           <span className="ml-2">Mejorando...</span>
                         </>
                      ) : (
                        <>
                           <Wand2 className="h-3 w-3 mr-1" />
                           <span>Mejorar redacción</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <SpeechTextarea
                    id="rejectionReason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explica por qué se rechaza... (o usa micrófono)"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowRejectForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={isLoading || !rejectionReason.trim()}
                  >
                    {isLoading ? <Spinner size="sm" /> : 'Confirmar Rechazo'}
                  </Button>
                </div>
              </div>
            )}

            {/* Formulario de resolución (Técnico) */}
            {showResolveForm && (
              <div className="p-4 bg-muted rounded-lg space-y-4">
                <h4 className="font-medium">Resolver incidencia</h4>
                <div className="space-y-2">
                   <div className="flex items-center justify-between">
                    <Label htmlFor="resolution">Resolución aplicada *</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRefineResolution}
                      disabled={isRefiningResolution || !resolution || resolution.length < 5}
                      className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                    >
                      {isRefiningResolution ? (
                         <>
                           <Spinner size="sm" />
                           <span className="ml-2">Mejorando...</span>
                         </>
                      ) : (
                        <>
                           <Wand2 className="h-3 w-3 mr-1" />
                           <span>Mejorar redacción</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <SpeechTextarea
                    id="resolution"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Describe el trabajo realizado... (o usa micrófono)"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowResolveForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleResolve}
                    disabled={isLoading || !resolution.trim()}
                  >
                    {isLoading ? <Spinner size="sm" /> : 'Marcar como Resuelta'}
                  </Button>
                </div>
              </div>
            )}

            {/* Formulario de cierre (Admin/Supervisor) */}
            {showCloseForm && (
              <div className="p-4 bg-muted rounded-lg space-y-4">
                <h4 className="font-medium">Cerrar incidencia (Validación Final)</h4>
                <div className="space-y-2">
                   <div className="flex items-center justify-between">
                    <Label htmlFor="resolution">Resolución (Validar/Editar) *</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRefineResolution}
                      disabled={isRefiningResolution || !resolution || resolution.length < 5}
                      className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                    >
                      {isRefiningResolution ? (
                         <>
                           <Spinner size="sm" />
                           <span className="ml-2">Mejorando...</span>
                         </>
                      ) : (
                        <>
                           <Wand2 className="h-3 w-3 mr-1" />
                           <span>Mejorar redacción</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <SpeechTextarea
                    id="resolution"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Valida o edita la resolución final..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCloseForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="success"
                    onClick={handleClose}
                    disabled={isLoading || !resolution.trim()}
                  >
                    {isLoading ? <Spinner size="sm" /> : 'Cerrar Definitivamente'}
                  </Button>
                </div>
              </div>
            )}

            {/* Formulario de asignación */}
            {showAssignForm && (
              <div className="p-4 bg-muted rounded-lg space-y-4">
                <h4 className="font-medium">Asignar técnico</h4>
                <div className="space-y-2">
                  <Label htmlFor="technician">Técnico responsable *</Label>
                  <Select value={selectedTechnician} onValueChange={(value) => setSelectedTechnician(String(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar técnico..." />
                    </SelectTrigger>
                    <SelectContent>
                      {technicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id}>
                          {tech.nombre} {tech.apellido} ({tech.rol === 'admin' ? 'Admin' :
                           tech.rol === 'supervisor' ? 'Supervisor' : 'Técnico'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAssignForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => handleAssign()}
                    disabled={isLoading || !selectedTechnician}
                  >
                    {isLoading ? <Spinner size="sm" /> : 'Asignar Técnico'}
                  </Button>
                </div>
              </div>
            )}
          </div>



          <DialogFooter className="p-4 border-t bg-card shrink-0 gap-2 sm:gap-2 flex-col sm:flex-row">
            {/* Acciones de Validación */}
            {canValidate && incident.status === 'pendiente' && (
              <>
                <Button 
                  onClick={handleConfirm} 
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                >
                  {isLoading ? <Spinner className="mr-2" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  Confirmar
                </Button>
                <Button 
                  onClick={() => setShowRejectForm(true)} 
                  variant="destructive"
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  {isLoading ? <Spinner className="mr-2" /> : <XCircle className="mr-2 h-4 w-4" />}
                  Rechazar
                </Button>
              </>
            )}

            {/* Asignación */}
            {permissions.canAssignIncident && incident.status === 'confirmada' && !incident.asignadoA && (
              <Button onClick={() => setShowAssignForm(true)} className="w-full sm:w-auto">
                <UserPlus className="mr-2 h-4 w-4" />
                Asignar Técnico
              </Button>
            )}

            {/* Auto-asignación para el creador (pendiente o confirmada sin asignar) */}
            {user?.id === incident.reportadoPor && ['pendiente', 'confirmada'].includes(incident.status) && !incident.asignadoA && (
              <Button 
                onClick={handleSelfAssign} 
                disabled={isLoading}
                variant="secondary"
                className="w-full sm:w-auto border-primary/20 text-primary hover:bg-primary/10"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Asignarme a mí
              </Button>
            )}

            {/* Resolver (Técnico) - se oculta cuando el formulario está abierto */}
            {(user?.id === incident.asignadoA || permissions.isAdmin) && incident.status === 'en_proceso' && !showResolveForm && (
              <Button 
                onClick={() => setShowResolveForm(true)}
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Resolver Incidencia
              </Button>
            )}

            {/* Cierre Definitivo (Validación Supervisor) */}
            {permissions.canValidateIncident && incident.status === 'resuelta' && (
              <Button 
                onClick={() => setShowCloseForm(true)}
                className="bg-success hover:bg-success/90 w-full sm:w-auto"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Cierre Técnico (Validar)
              </Button>
            )}

            {/* Botón de editar (Creator o Admin) */}
            {((user?.id === incident.reportadoPor) || permissions.isAdmin) && (
              <Button
                variant="outline"
                onClick={() => setShowEditForm(true)}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
            )}

            {/* Botón de eliminar (solo Admin) */}
            {permissions.canDeleteIncident && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? <Spinner size="sm" /> : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </>
                )}
              </Button>
            )}

            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de edición */}
      {showEditForm && (
        <IncidentForm
          incident={incident}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false)
            onClose()
          }}
        />
      )}

      {/* Modal de foto ampliada */}
      {selectedPhoto && (
        <Dialog open onOpenChange={() => setSelectedPhoto(null)}>
          <DialogContent className="max-w-4xl p-0">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-2 right-2 z-10 bg-background/80 rounded-full p-2"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={selectedPhoto}
              alt="Foto ampliada"
              className="w-full h-auto max-h-[80vh] object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
