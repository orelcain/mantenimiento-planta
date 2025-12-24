import { useState, useEffect } from 'react'
import { Plus, Search, AlertTriangle, Clock, CheckCircle, XCircle, Filter } from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Input,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useAppStore, useCanValidateIncidents } from '@/store'
import { subscribeToIncidents } from '@/services/incidents'
import type { Incident, IncidentStatus, IncidentPriority } from '@/types'
import { formatRelativeTime } from '@/lib/utils'
import { IncidentForm } from '@/components/incidents/IncidentForm'
import { IncidentDetail } from '@/components/incidents/IncidentDetail'

const STATUS_CONFIG: Record<IncidentStatus, { label: string; icon: any; variant: any }> = {
  pendiente: { label: 'Pendiente', icon: Clock, variant: 'warning' },
  confirmada: { label: 'Confirmada', icon: CheckCircle, variant: 'default' },
  rechazada: { label: 'Rechazada', icon: XCircle, variant: 'destructive' },
  en_proceso: { label: 'En Proceso', icon: AlertTriangle, variant: 'secondary' },
  cerrada: { label: 'Cerrada', icon: CheckCircle, variant: 'success' },
}

const PRIORITY_CONFIG: Record<IncidentPriority, { label: string; className: string }> = {
  critica: { label: 'Crítica', className: 'bg-destructive text-destructive-foreground' },
  alta: { label: 'Alta', className: 'bg-warning text-warning-foreground' },
  media: { label: 'Media', className: 'bg-primary text-primary-foreground' },
  baja: { label: 'Baja', className: 'bg-muted text-muted-foreground' },
}

export function IncidentsPage() {
  const canValidate = useCanValidateIncidents()
  const { incidents, setIncidents, selectedIncident, setSelectedIncident } = useAppStore()
  
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')

  // Suscribirse a cambios en tiempo real
  useEffect(() => {
    const unsubscribe = subscribeToIncidents((newIncidents) => {
      setIncidents(newIncidents)
    })
    return () => unsubscribe()
  }, [setIncidents])

  // Filtrar incidencias
  const filteredIncidents = incidents.filter((incident) => {
    const matchesSearch =
      incident.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.descripcion.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = filterStatus === 'all' || incident.status === filterStatus
    const matchesPriority = filterPriority === 'all' || incident.prioridad === filterPriority
    
    return matchesSearch && matchesStatus && matchesPriority
  })

  // Estadísticas
  const stats = {
    total: incidents.length,
    pendientes: incidents.filter((i) => i.status === 'pendiente').length,
    enProceso: incidents.filter((i) => i.status === 'en_proceso').length,
    criticas: incidents.filter((i) => i.prioridad === 'critica' && i.status !== 'cerrada').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Incidencias</h1>
          <p className="text-muted-foreground">Gestión de mantenimiento correctivo</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Incidencia
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-warning">{stats.pendientes}</div>
            <div className="text-sm text-muted-foreground">Pendientes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-primary">{stats.enProceso}</div>
            <div className="text-sm text-muted-foreground">En Proceso</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">{stats.criticas}</div>
            <div className="text-sm text-muted-foreground">Críticas</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar incidencias..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="confirmada">Confirmada</SelectItem>
                <SelectItem value="en_proceso">En Proceso</SelectItem>
                <SelectItem value="cerrada">Cerrada</SelectItem>
                <SelectItem value="rechazada">Rechazada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las prioridades</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Incident List */}
      <div className="space-y-4">
        {filteredIncidents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No hay incidencias</h3>
              <p className="text-muted-foreground">
                {searchQuery || filterStatus !== 'all' || filterPriority !== 'all'
                  ? 'No se encontraron incidencias con los filtros aplicados'
                  : 'Comienza creando una nueva incidencia'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredIncidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onClick={() => setSelectedIncident(incident)}
            />
          ))
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <IncidentForm
          onClose={() => setShowForm(false)}
          onSuccess={() => setShowForm(false)}
        />
      )}

      {/* Detail Modal */}
      {selectedIncident && (
        <IncidentDetail
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          canValidate={canValidate}
        />
      )}
    </div>
  )
}

function IncidentCard({
  incident,
  onClick,
}: {
  incident: Incident
  onClick: () => void
}) {
  const statusConfig = STATUS_CONFIG[incident.status]
  const priorityConfig = PRIORITY_CONFIG[incident.prioridad]
  const StatusIcon = statusConfig.icon

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={statusConfig.variant} className="gap-1">
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
              </Badge>
              <Badge className={priorityConfig.className}>
                {priorityConfig.label}
              </Badge>
            </div>
            <h3 className="font-medium truncate">{incident.titulo}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {incident.descripcion}
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground shrink-0">
            <div>{formatRelativeTime(incident.createdAt)}</div>
            {incident.fotos.length > 0 && (
              <div className="text-xs mt-1">{incident.fotos.length} foto(s)</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
