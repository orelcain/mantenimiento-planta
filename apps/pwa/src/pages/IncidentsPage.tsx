import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, AlertTriangle, Clock, CheckCircle, XCircle, User } from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Input,
  Badge,
} from '@/components/ui'
import { useAppStore, useCanValidateIncidents } from '@/store'
import { subscribeToIncidents } from '@/services/incidents'
import type { Incident, IncidentStatus, IncidentPriority } from '@/types'
import { formatRelativeTime } from '@/lib/utils'
import { IncidentForm } from '@/components/incidents/IncidentForm'
import { IncidentDetail } from '@/components/incidents/IncidentDetail'
import { debounce } from '@/lib/utils'

const getStatusIcon = (status: IncidentStatus) => {
  const iconMap: Record<IncidentStatus, any> = {
    pendiente: Clock,
    confirmada: CheckCircle,
    rechazada: XCircle,
    en_proceso: AlertTriangle,
    cerrada: CheckCircle,
  }
  return iconMap[status]
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; variant: any }> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  confirmada: { label: 'Confirmada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
  en_proceso: { label: 'En Proceso', variant: 'secondary' },
  cerrada: { label: 'Cerrada', variant: 'success' },
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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null) // null = todos

  // Debounce search con 300ms
  const debouncedSetSearch = useMemo(
    () => debounce((value: string) => setDebouncedSearch(value), 300),
    []
  )

  useEffect(() => {
    debouncedSetSearch(searchQuery)
  }, [searchQuery, debouncedSetSearch])

  // Suscribirse a cambios en tiempo real
  useEffect(() => {
    const unsubscribe = subscribeToIncidents((newIncidents) => {
      setIncidents(newIncidents)
    })
    return () => unsubscribe()
  }, [setIncidents])

  // Filtrar incidencias basado en búsqueda y filtro activo
  const filteredIncidents = incidents.filter((incident) => {
    const matchesSearch =
      incident.titulo.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      incident.descripcion.toLowerCase().includes(debouncedSearch.toLowerCase())
    
    if (!matchesSearch) return false
    
    // Aplicar filtro activo
    if (activeFilter === null) return true
    
    // Filtros específicos
    if (activeFilter === 'pendientes') return incident.status === 'pendiente'
    if (activeFilter === 'confirmadas') return incident.status === 'confirmada'
    if (activeFilter === 'confirmadas-asignadas') return incident.status === 'confirmada' && !!incident.asignadoA
    if (activeFilter === 'confirmadas-sin-asignar') return incident.status === 'confirmada' && !incident.asignadoA
    if (activeFilter === 'en-proceso') return incident.status === 'en_proceso'
    if (activeFilter === 'cerradas') return incident.status === 'cerrada'
    if (activeFilter === 'rechazadas') return incident.status === 'rechazada'
    if (activeFilter === 'criticas') return incident.prioridad === 'critica' && incident.status !== 'cerrada'
    
    return true
  })

  // Estadísticas
  const stats = {
    total: incidents.length,
    pendientes: incidents.filter((i) => i.status === 'pendiente').length,
    confirmadas: incidents.filter((i) => i.status === 'confirmada').length,
    confirmadas_asignadas: incidents.filter((i) => i.status === 'confirmada' && !!i.asignadoA).length,
    confirmadas_sin_asignar: incidents.filter((i) => i.status === 'confirmada' && !i.asignadoA).length,
    enProceso: incidents.filter((i) => i.status === 'en_proceso').length,
    cerradas: incidents.filter((i) => i.status === 'cerrada').length,
    rechazadas: incidents.filter((i) => i.status === 'rechazada').length,
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

      {/* Stats - Clickeable para filtrar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Total */}
        <Card
          className={`cursor-pointer transition-all hover:border-primary/50 ${activeFilter === null ? 'border-primary bg-primary/10' : ''}`}
          onClick={() => setActiveFilter(null)}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>

        {/* Pendientes */}
        <Card
          className={`cursor-pointer transition-all hover:border-warning/50 ${activeFilter === 'pendientes' ? 'border-warning bg-warning/10' : ''}`}
          onClick={() => setActiveFilter('pendientes')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-warning">{stats.pendientes}</div>
            <div className="text-sm text-muted-foreground">Pendientes</div>
          </CardContent>
        </Card>

        {/* Confirmadas */}
        <Card
          className={`cursor-pointer transition-all hover:border-primary/50 ${activeFilter === 'confirmadas' ? 'border-primary bg-primary/10' : ''}`}
          onClick={() => setActiveFilter('confirmadas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-primary">{stats.confirmadas}</div>
            <div className="text-sm text-muted-foreground">Confirmadas</div>
          </CardContent>
        </Card>

        {/* Confirmadas Asignadas */}
        <Card
          className={`cursor-pointer transition-all hover:border-blue-400/50 ${activeFilter === 'confirmadas-asignadas' ? 'border-blue-400 bg-blue-400/10' : ''}`}
          onClick={() => setActiveFilter('confirmadas-asignadas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.confirmadas_asignadas}</div>
            <div className="text-xs text-muted-foreground">Asignadas</div>
          </CardContent>
        </Card>

        {/* Confirmadas Sin Asignar */}
        <Card
          className={`cursor-pointer transition-all hover:border-orange-400/50 ${activeFilter === 'confirmadas-sin-asignar' ? 'border-orange-400 bg-orange-400/10' : ''}`}
          onClick={() => setActiveFilter('confirmadas-sin-asignar')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-orange-500">{stats.confirmadas_sin_asignar}</div>
            <div className="text-xs text-muted-foreground">Sin Asignar</div>
          </CardContent>
        </Card>

        {/* En Proceso */}
        <Card
          className={`cursor-pointer transition-all hover:border-blue-500/50 ${activeFilter === 'en-proceso' ? 'border-blue-500 bg-blue-500/10' : ''}`}
          onClick={() => setActiveFilter('en-proceso')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-500">{stats.enProceso}</div>
            <div className="text-sm text-muted-foreground">En Proceso</div>
          </CardContent>
        </Card>

        {/* Críticas */}
        <Card
          className={`cursor-pointer transition-all hover:border-destructive/50 ${activeFilter === 'criticas' ? 'border-destructive bg-destructive/10' : ''}`}
          onClick={() => setActiveFilter('criticas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">{stats.criticas}</div>
            <div className="text-sm text-muted-foreground">Críticas</div>
          </CardContent>
        </Card>

        {/* Cerradas */}
        <Card
          className={`cursor-pointer transition-all hover:border-green-500/50 ${activeFilter === 'cerradas' ? 'border-green-500 bg-green-500/10' : ''}`}
          onClick={() => setActiveFilter('cerradas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.cerradas}</div>
            <div className="text-sm text-muted-foreground">Cerradas</div>
          </CardContent>
        </Card>

        {/* Rechazadas */}
        <Card
          className={`cursor-pointer transition-all hover:border-red-500/50 ${activeFilter === 'rechazadas' ? 'border-red-500 bg-red-500/10' : ''}`}
          onClick={() => setActiveFilter('rechazadas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.rechazadas}</div>
            <div className="text-sm text-muted-foreground">Rechazadas</div>
          </CardContent>
        </Card>
      </div>

      {/* Search - Simplificado */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar incidencias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {activeFilter && (
          <Button
            variant="outline"
            onClick={() => setActiveFilter(null)}
          >
            Limpiar filtro
          </Button>
        )}
      </div>

      {/* Incident List */}
      <div className="space-y-4">
        {filteredIncidents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No hay incidencias</h3>
              <p className="text-muted-foreground">
                {searchQuery || activeFilter !== null
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
  const StatusIcon = getStatusIcon(incident.status)

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
            <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
              {incident.creadoPorNombre && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Creado por: <span className="font-medium">{incident.creadoPorNombre}</span>
                </span>
              )}
              {incident.asignadoANombre && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Asignado a: <span className="font-medium">{incident.asignadoANombre}</span>
                </span>
              )}
            </div>
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
