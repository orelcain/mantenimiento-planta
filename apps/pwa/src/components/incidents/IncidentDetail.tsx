import { useState } from 'react'
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  MapPin,
  Camera,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Badge,
  Textarea,
  Label,
  Spinner,
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { confirmIncident, rejectIncident, closeIncident } from '@/services/incidents'
import type { Incident, IncidentStatus, IncidentPriority } from '@/types'
import { formatDate } from '@/lib/utils'

const STATUS_CONFIG: Record<IncidentStatus, { label: string; icon: any; color: string }> = {
  pendiente: { label: 'Pendiente de validación', icon: Clock, color: 'text-warning' },
  confirmada: { label: 'Confirmada', icon: CheckCircle, color: 'text-primary' },
  rechazada: { label: 'Rechazada', icon: XCircle, color: 'text-destructive' },
  en_proceso: { label: 'En proceso', icon: AlertTriangle, color: 'text-blue-400' },
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
  const [isLoading, setIsLoading] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)

  const statusConfig = STATUS_CONFIG[incident.status]
  const priorityConfig = PRIORITY_CONFIG[incident.prioridad]
  const StatusIcon = statusConfig.icon

  // Confirmar incidencia
  const handleConfirm = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      await confirmIncident(incident.id, user.id)
      onClose()
    } catch (error) {
      console.error('Error confirming incident:', error)
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
      onClose()
    } catch (error) {
      console.error('Error rejecting incident:', error)
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
      onClose()
    } catch (error) {
      console.error('Error closing incident:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-xl">{incident.titulo}</DialogTitle>
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

          <div className="space-y-6">
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

            {/* Info adicional */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>Zona: {incident.zoneId}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>Reportado por: {incident.reportadoPor}</span>
                </div>
              </div>
              {incident.asignadoA && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>Asignado a: {incident.asignadoA}</span>
                  </div>
                </div>
              )}
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
            {incident.status === 'cerrada' && incident.resolucion && (
              <div className="p-4 bg-success/10 rounded-lg border border-success/20">
                <h4 className="font-medium text-success mb-2">Resolución</h4>
                <p className="text-sm">{incident.resolucion}</p>
                {incident.tiempoResolucionMinutos && (
                  <p className="text-xs text-muted-foreground mt-2">
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
                  <Label htmlFor="rejectionReason">Motivo del rechazo *</Label>
                  <Textarea
                    id="rejectionReason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explica por qué se rechaza esta incidencia..."
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

            {/* Formulario de cierre */}
            {showCloseForm && (
              <div className="p-4 bg-muted rounded-lg space-y-4">
                <h4 className="font-medium">Cerrar incidencia</h4>
                <div className="space-y-2">
                  <Label htmlFor="resolution">Resolución aplicada *</Label>
                  <Textarea
                    id="resolution"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Describe cómo se resolvió el problema..."
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
                    {isLoading ? <Spinner size="sm" /> : 'Cerrar Incidencia'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-wrap gap-2">
            {/* Acciones según estado y rol */}
            {incident.status === 'pendiente' && canValidate && !showRejectForm && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectForm(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Rechazar
                </Button>
                <Button onClick={handleConfirm} disabled={isLoading}>
                  {isLoading ? <Spinner size="sm" /> : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Confirmar
                    </>
                  )}
                </Button>
              </>
            )}

            {(incident.status === 'confirmada' || incident.status === 'en_proceso') && 
              !showCloseForm && (
              <Button
                variant="success"
                onClick={() => setShowCloseForm(true)}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Cerrar Incidencia
              </Button>
            )}

            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
