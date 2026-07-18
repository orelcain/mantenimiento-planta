import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, AlertTriangle, Clock, CheckCircle, XCircle, User, MapPin } from 'lucide-react'
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
import { useAppStore, useAuthStore, useCanValidateIncidents } from '@/store'
import { usePermissions } from '@/hooks/usePermissions'
import { getMapLocations } from '@/services/maps'
import type { Incident, IncidentStatus, IncidentPriority } from '@/types'
import type { MapLocation } from '@/types/maps'
import { logger } from '@/lib/logger'
import { formatRelativeTime } from '@/lib/utils'
import { IncidentForm } from '@/components/incidents/IncidentForm'
import { IncidentDetail } from '@/components/incidents/IncidentDetail'
import { debounce } from '@/lib/rate-limit'
import { getUserDisplayNameMap, getUserInfoLabelMap } from '@/services/userDisplay'

const getStatusIcon = (status: IncidentStatus) => {
  const iconMap: Record<IncidentStatus, any> = {
    pendiente: Clock,
    confirmada: CheckCircle,
    rechazada: XCircle,
    en_proceso: AlertTriangle,
    resuelta: CheckCircle,
    cerrada: CheckCircle,
  }
  return iconMap[status]
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; variant: any }> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  confirmada: { label: 'Confirmada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
  en_proceso: { label: 'En Proceso', variant: 'secondary' },
  resuelta: { label: 'Resuelta (Por Validar)', variant: 'outline' },
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
  const { user } = useAuthStore()
  const permissions = usePermissions()
  const { incidents, selectedIncident, setSelectedIncident } = useAppStore()
  
  const [searchParams, setSearchParams] = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('q') ?? '')
  const [activeFilter, setActiveFilter] = useState<string | null>(() => searchParams.get('filter'))
  const [mapLocations, setMapLocations] = useState<MapLocation[]>([])
  const [selectedMapLocation, setSelectedMapLocation] = useState<string>(() => searchParams.get('location') ?? 'all')
  const [selectedReporter, setSelectedReporter] = useState<string>(() => searchParams.get('reporter') ?? 'all')
  const [reporterNames, setReporterNames] = useState<Record<string, string>>({})
  const [userInfoLabels, setUserInfoLabels] = useState<Record<string, string>>({})

  const isAdminOrSupervisor = user?.rol === 'admin' || user?.rol === 'supervisor'

  // Cargar ubicaciones de mapa
  useEffect(() => {
    let cancelled = false
    getMapLocations()
      .then(locs => { if (!cancelled) setMapLocations(locs) })
      .catch((err) => logger.error('Error loading map locations', err instanceof Error ? err : new Error(String(err))))
    return () => { cancelled = true }
  }, [])

  // Debounce search con 300ms
  const debouncedSetSearch = useMemo(
    () => debounce((value: string) => setDebouncedSearch(value), 300),
    []
  )

  useEffect(() => {
    debouncedSetSearch(searchQuery)
  }, [searchQuery, debouncedSetSearch])

  // Sincronizar filtros activos a URL params
  useEffect(() => {
    setSearchParams(p => {
      if (searchQuery) p.set('q', searchQuery); else p.delete('q')
      if (activeFilter) p.set('filter', activeFilter); else p.delete('filter')
      if (selectedMapLocation !== 'all') p.set('location', selectedMapLocation); else p.delete('location')
      if (selectedReporter !== 'all') p.set('reporter', selectedReporter); else p.delete('reporter')
      return p
    }, { replace: true })
  }, [searchQuery, activeFilter, selectedMapLocation, selectedReporter, setSearchParams])

  // Suscripción global en MainLayout

  // Filtrar incidencias basado en búsqueda y filtro activo
  const canSeeAllIncidents = permissions.isAdmin || permissions.isSupervisor
  const visibleIncidents = useMemo(() => canSeeAllIncidents
    ? incidents
    : incidents.filter((incident) =>
        incident.reportadoPor === user?.id ||
        incident.creadoPor === user?.id ||
        incident.asignadoA === user?.id
      ), [canSeeAllIncidents, incidents, user?.id])

  const filteredIncidents = useMemo(() => visibleIncidents.filter((incident) => {
    const matchesSearch =
      incident.titulo.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      incident.descripcion.toLowerCase().includes(debouncedSearch.toLowerCase())
    
    if (!matchesSearch) return false
    
    // Filtro por ubicación de mapa
    if (selectedMapLocation !== 'all') {
      if (selectedMapLocation === 'with-map') {
        // Solo incidencias con marcador en mapa
        if (!incident.mapLocationId) return false
      } else if (selectedMapLocation === 'without-map') {
        // Solo incidencias sin marcador en mapa
        if (incident.mapLocationId) return false
      } else {
        // Ubicación específica
        if (incident.mapLocationId !== selectedMapLocation) return false
      }
    }
    
    // Filtro por creador (solo admin/supervisor)
    if (isAdminOrSupervisor && selectedReporter !== 'all') {
      if (incident.reportadoPor !== selectedReporter && incident.creadoPor !== selectedReporter) return false
    }

    // Aplicar filtro activo
    if (activeFilter === null) return true
    
    // Filtros específicos
    if (activeFilter === 'pendientes') return incident.status === 'pendiente'
    if (activeFilter === 'confirmadas') return incident.status === 'confirmada'
    if (activeFilter === 'confirmadas-asignadas') return !!incident.asignadoA && ['en_proceso', 'resuelta'].includes(incident.status)
    if (activeFilter === 'confirmadas-sin-asignar') return incident.status === 'confirmada' && !incident.asignadoA
    if (activeFilter === 'mis-asignadas') return !!user?.id && incident.asignadoA === user.id && incident.status === 'en_proceso'
    if (activeFilter === 'mis-resueltas') return !!user?.id && (incident.asignadoA === user.id || incident.resolvedBy === user.id) && incident.status === 'resuelta'
    if (activeFilter === 'mis-creadas') return !!user?.id && (incident.reportadoPor === user.id || incident.creadoPor === user.id)
    if (activeFilter === 'en-proceso') return incident.status === 'en_proceso'
    if (activeFilter === 'por-validar') return incident.status === 'resuelta'
    if (activeFilter === 'cerradas') return incident.status === 'cerrada'
    if (activeFilter === 'rechazadas') return incident.status === 'rechazada'
    if (activeFilter === 'criticas') return incident.prioridad === 'critica' && incident.status !== 'cerrada'
    
    return true
  }), [visibleIncidents, debouncedSearch, selectedMapLocation, selectedReporter, activeFilter, isAdminOrSupervisor, user?.id])

  // Estadísticas
  const stats = useMemo(() => ({
    total: visibleIncidents.length,
    pendientes: visibleIncidents.filter((i) => i.status === 'pendiente').length,
    confirmadas: visibleIncidents.filter((i) => i.status === 'confirmada').length,
    confirmadas_asignadas: visibleIncidents.filter((i) => !!i.asignadoA && ['en_proceso', 'resuelta'].includes(i.status)).length,
    confirmadas_sin_asignar: visibleIncidents.filter((i) => i.status === 'confirmada' && !i.asignadoA).length,
    mis_asignadas: user?.id
      ? visibleIncidents.filter((i) => i.asignadoA === user.id && i.status === 'en_proceso').length
      : 0,
    mis_resueltas: user?.id
      ? visibleIncidents.filter((i) => (i.asignadoA === user.id || i.resolvedBy === user.id) && i.status === 'resuelta').length
      : 0,
    por_validar: visibleIncidents.filter((i) => i.status === 'resuelta').length,
    mis_creadas: user?.id
      ? visibleIncidents.filter((i) => i.reportadoPor === user.id || i.creadoPor === user.id).length
      : 0,
    enProceso: visibleIncidents.filter((i) => i.status === 'en_proceso').length,
    cerradas: visibleIncidents.filter((i) => i.status === 'cerrada').length,
    rechazadas: visibleIncidents.filter((i) => i.status === 'rechazada').length,
    criticas: visibleIncidents.filter((i) => i.prioridad === 'critica' && i.status !== 'cerrada').length,
  }), [visibleIncidents, user?.id])

  useEffect(() => {
    if (!isAdminOrSupervisor) return
    const ids = Array.from(
      new Set(
        incidents
          .map((i) => i.reportadoPor || i.creadoPor)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )
    if (ids.length === 0) return
    getUserDisplayNameMap(ids).then(setReporterNames).catch(() => {
      setReporterNames({})
    })
  }, [incidents, isAdminOrSupervisor])

  useEffect(() => {
    const ids = Array.from(
      new Set(
        visibleIncidents
          .flatMap((i) => [i.reportadoPor, i.creadoPor, i.asignadoA])
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )
    if (ids.length === 0) return
    getUserInfoLabelMap(ids).then(setUserInfoLabels).catch(() => {
      setUserInfoLabels({})
    })
  }, [visibleIncidents])

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

        {/* Confirmadas Asignadas (En Proceso + Resueltas/PorValidar) */}
        <Card
          className={`cursor-pointer transition-all hover:border-blue-400/50 ${activeFilter === 'confirmadas-asignadas' ? 'border-blue-400 bg-blue-400/10' : ''}`}
          onClick={() => setActiveFilter('confirmadas-asignadas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.confirmadas_asignadas}</div>
            <div className="text-xs text-muted-foreground">En curso / Resueltas</div>
          </CardContent>
        </Card>

        {/* Por Validar (Técnico ha resuelto) - Solo Admin/Supervisor */}
        {isAdminOrSupervisor && (
          <Card
            className={`cursor-pointer transition-all hover:border-violet-500/50 ${activeFilter === 'por-validar' ? 'border-violet-500 bg-violet-500/15' : ''}`}
            onClick={() => setActiveFilter('por-validar')}
          >
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-violet-600">{stats.por_validar}</div>
              <div className="text-xs text-muted-foreground">Por Validar (Cierre Téc.)</div>
            </CardContent>
          </Card>
        )}

        {/* Mis Asignadas */}
        <Card
          className={`cursor-pointer transition-all hover:border-violet-400/50 ${activeFilter === 'mis-asignadas' ? 'border-violet-400 bg-violet-400/10' : ''}`}
          onClick={() => setActiveFilter('mis-asignadas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-violet-600">{stats.mis_asignadas}</div>
            <div className="text-xs text-muted-foreground">Mis asignadas</div>
          </CardContent>
        </Card>

        {/* Mis Resueltas */}
        <Card
          className={`cursor-pointer transition-all hover:border-green-400/50 ${activeFilter === 'mis-resueltas' ? 'border-green-400 bg-green-400/10' : ''}`}
          onClick={() => setActiveFilter('mis-resueltas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.mis_resueltas}</div>
            <div className="text-xs text-muted-foreground">Mis resueltas</div>
          </CardContent>
        </Card>

        {/* Mis creadas */}
        <Card
          className={`cursor-pointer transition-all hover:border-emerald-400/50 ${activeFilter === 'mis-creadas' ? 'border-emerald-400 bg-emerald-400/10' : ''}`}
          onClick={() => setActiveFilter('mis-creadas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.mis_creadas}</div>
            <div className="text-xs text-muted-foreground">Mis creadas</div>
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
          className={`cursor-pointer transition-all hover:border-blue-500/50 ${activeFilter === 'en-proceso' ? 'border-blue-500 bg-blue-500/15' : ''}`}
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
          className={`cursor-pointer transition-all hover:border-green-500/50 ${activeFilter === 'cerradas' ? 'border-green-500 bg-green-500/15' : ''}`}
          onClick={() => setActiveFilter('cerradas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.cerradas}</div>
            <div className="text-sm text-muted-foreground">Cerradas</div>
          </CardContent>
        </Card>

        {/* Rechazadas */}
        <Card
          className={`cursor-pointer transition-all hover:border-red-500/50 ${activeFilter === 'rechazadas' ? 'border-red-500 bg-red-500/15' : ''}`}
          onClick={() => setActiveFilter('rechazadas')}
        >
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.rechazadas}</div>
            <div className="text-sm text-muted-foreground">Rechazadas</div>
          </CardContent>
        </Card>
      </div>

      {/* Search - Simplificado */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar incidencias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {/* Filtro por ubicación de mapa */}
        {mapLocations.length > 0 && (
          <Select value={selectedMapLocation} onValueChange={setSelectedMapLocation}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Ubicación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las ubicaciones</SelectItem>
              <SelectItem value="with-map">📍 Con marcador</SelectItem>
              <SelectItem value="without-map">Sin marcador</SelectItem>
              {mapLocations.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filtro por creador (admin/supervisor) */}
        {isAdminOrSupervisor && (
          <Select value={selectedReporter} onValueChange={setSelectedReporter}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <User className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Creador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los usuarios</SelectItem>
              {Object.entries(reporterNames).map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {(activeFilter || selectedMapLocation !== 'all' || (isAdminOrSupervisor && selectedReporter !== 'all')) && (
          <Button
            variant="outline"
            onClick={() => {
              setActiveFilter(null)
              setSelectedMapLocation('all')
              setSelectedReporter('all')
            }}
          >
            Limpiar filtros
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
              userInfoLabels={userInfoLabels}
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
  userInfoLabels,
  onClick,
}: {
  incident: Incident
  userInfoLabels: Record<string, string>
  onClick: () => void
}) {
  const statusConfig = STATUS_CONFIG[incident.status] || STATUS_CONFIG['pendiente']
  const priorityConfig = PRIORITY_CONFIG[incident.prioridad] || PRIORITY_CONFIG['media']
  const StatusIcon = getStatusIcon(incident.status) || getStatusIcon('pendiente')

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
            <h3 className="font-medium truncate" title={incident.titulo}>{incident.titulo}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {incident.descripcion}
            </p>
            <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
              {(incident.creadoPor || incident.reportadoPor) && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Creado por:{' '}
                  <span className="font-medium">
                    {userInfoLabels[incident.creadoPor || incident.reportadoPor] || incident.creadoPor || incident.reportadoPor}
                  </span>
                </span>
              )}
              {incident.asignadoA && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Asignado a:{' '}
                  <span className="font-medium">
                    {userInfoLabels[incident.asignadoA] || incident.asignadoA}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground shrink-0">
            <div>{formatRelativeTime(incident.createdAt)}</div>
            {(incident.fotos?.length || 0) > 0 && (
              <div className="text-xs mt-1">{incident.fotos?.length || 0} foto(s)</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
