import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, AlertTriangle, User, MapPin } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useAppStore, useAuthStore, useCanValidateIncidents } from '@/store'
import { usePermissions } from '@/hooks/usePermissions'
import { getMapLocations } from '@/services/maps'
import type { IncidentStatus, IncidentPriority } from '@/types'
import type { MapLocation } from '@/types/maps'
import { Button, Pill, ListGroup, ListCell, type PillTone } from '@/components/piel'
import { logger } from '@/lib/logger'
import { formatRelativeTime } from '@/lib/utils'
import { IncidentForm } from '@/components/incidents/IncidentForm'
import { IncidentDetail } from '@/components/incidents/IncidentDetail'
import { debounce } from '@/lib/rate-limit'
import { getUserDisplayNameMap, getUserInfoLabelMap } from '@/services/userDisplay'

const STATUS_CONFIG: Record<IncidentStatus, { label: string; variant: any }> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  confirmada: { label: 'Confirmada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
  en_proceso: { label: 'En Proceso', variant: 'secondary' },
  resuelta: { label: 'Resuelta (Por Validar)', variant: 'outline' },
  cerrada: { label: 'Cerrada', variant: 'success' },
}

/** Prioridad como ESTADO: tono de <Pill>, con la etiqueta siempre visible
 *  (el color nunca es el único canal). */
const PRIORITY_CONFIG: Record<IncidentPriority, { label: string; tone: PillTone }> = {
  critica: { label: 'Crítica', tone: 'critical' },
  alta: { label: 'Alta', tone: 'warning' },
  media: { label: 'Media', tone: 'info' },
  baja: { label: 'Baja', tone: 'neutral' },
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

  /**
   * Filtros como PÍLDORAS deslizables, no como 12 tarjetas con borde.
   *
   * Por qué cambió: la grilla de tarjetas iguales es el patrón que hacía ver la
   * app "genérica" — ocupaba media pantalla, competía con el contenido y no
   * dejaba claro que eran FILTROS y no indicadores. En el lenguaje de Apple un
   * filtro es una píldora en una fila que se desliza (Mail, Fotos, App Store):
   * ocupa una línea, se lee de un vistazo y el estado activo es evidente.
   */
  const filtros: { id: string | null; label: string; value: number; tone?: PillTone }[] = [
    { id: null, label: 'Todas', value: stats.total },
    { id: 'pendientes', label: 'Pendientes', value: stats.pendientes, tone: 'warning' },
    { id: 'criticas', label: 'Críticas', value: stats.criticas, tone: 'critical' },
    { id: 'confirmadas', label: 'Confirmadas', value: stats.confirmadas, tone: 'info' },
    { id: 'confirmadas-sin-asignar', label: 'Sin asignar', value: stats.confirmadas_sin_asignar, tone: 'warning' },
    { id: 'en-proceso', label: 'En proceso', value: stats.enProceso, tone: 'info' },
    ...(isAdminOrSupervisor
      ? [{ id: 'por-validar', label: 'Por validar', value: stats.por_validar, tone: 'warning' as PillTone }]
      : []),
    { id: 'mis-asignadas', label: 'Mías', value: stats.mis_asignadas },
    { id: 'mis-resueltas', label: 'Mías resueltas', value: stats.mis_resueltas, tone: 'ok' },
    { id: 'mis-creadas', label: 'Mías creadas', value: stats.mis_creadas },
    { id: 'cerradas', label: 'Cerradas', value: stats.cerradas, tone: 'ok' },
    { id: 'rechazadas', label: 'Rechazadas', value: stats.rechazadas, tone: 'critical' },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Título grande: el rol `display` de la escala (§2). Uno por pantalla. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-1">
        <div>
          <h1 className="text-[2.05rem] font-bold leading-none tracking-[-0.028em]">Incidencias</h1>
          <p className="mt-1 text-[0.85rem] text-muted-foreground">
            {filteredIncidents.length} de {stats.total} · mantenimiento correctivo
          </p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setShowForm(true)}>
            <Plus /> Nueva incidencia
          </Button>
        </div>
      </div>

      {/* Fila de filtros: una línea que se desliza, en vez de una grilla. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filtros.map((f) => {
          const activo = activeFilter === f.id
          return (
            <button
              key={String(f.id)}
              type="button"
              onClick={() => setActiveFilter(f.id)}
              className={[
                'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.8rem] font-medium',
                'transition-colors duration-150 motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                activo
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted-foreground/10 text-muted-foreground hover:text-foreground',
              ].join(' ')}
              aria-pressed={activo}
            >
              {f.label}
              <span className={`tabular-nums font-semibold ${activo ? '' : 'text-foreground'}`}>{f.value}</span>
            </button>
          )
        })}
      </div>

      {/* Search - Simplificado */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Buscador estilo iOS: relleno suave, sin borde, ícono adentro. */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar incidencias…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 w-full rounded-ctl border-0 bg-muted-foreground/10 pl-9 pr-3 text-[0.9rem] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
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
            variant="tinted"
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

      {/*
        La lista pasa de N tarjetas sueltas a UN grupo con celdas. Es el cambio
        que más ordena la pantalla: antes cada incidencia era una caja con su
        borde y su sombra —N bordes compitiendo—; ahora es una superficie con
        separadores insetados, y el ojo recorre una sola columna.
      */}
      {filteredIncidents.length === 0 ? (
        <div className="rounded-card bg-card px-6 py-12 text-center">
          <AlertTriangle className="mx-auto mb-3 size-9 text-muted-foreground/50" />
          <p className="text-[0.98rem] font-semibold">No hay incidencias</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[0.85rem] text-muted-foreground">
            {searchQuery || activeFilter !== null
              ? 'Ninguna coincide con los filtros aplicados. Prueba limpiándolos.'
              : 'Cuando registres la primera, aparecerá acá.'}
          </p>
        </div>
      ) : (
        <ListGroup>
          {filteredIncidents.map((incident) => {
            const st = STATUS_CONFIG[incident.status] || STATUS_CONFIG['pendiente']
            const pr = PRIORITY_CONFIG[incident.prioridad] || PRIORITY_CONFIG['media']
            const quien =
              userInfoLabels[incident.asignadoA || ''] ||
              userInfoLabels[incident.creadoPor || incident.reportadoPor || ''] ||
              null
            return (
              <ListCell
                key={incident.id}
                title={incident.titulo}
                subtitle={
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{st.label}</span>
                    {quien && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{quien}</span>
                      </>
                    )}
                    {(incident.fotos?.length || 0) > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{incident.fotos?.length} foto(s)</span>
                      </>
                    )}
                  </span>
                }
                trailing={<Pill tone={pr.tone}>{pr.label}</Pill>}
                value={formatRelativeTime(incident.createdAt)}
                onClick={() => setSelectedIncident(incident)}
              />
            )
          })}
        </ListGroup>
      )}

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

