import { useState, useEffect, useRef } from 'react'
import {
  MapPin,
  ZoomIn,
  ZoomOut,
  Maximize,
  AlertTriangle,
  Settings,
  Eye,
  X,
  Clock,
  User,
  Camera,
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
import { useAppStore, useAuthStore } from '@/store'
import { getZones } from '@/services/zones'
import { subscribeToIncidents } from '@/services/incidents'
import { PolygonZoneEditor } from '@/components/map'
import type { Zone, Incident, IncidentPriority, IncidentStatus } from '@/types'
import { cn } from '@/lib/utils'
import { getAssetUrl, isFirebaseStorageUrl } from '@/lib/config'
import { formatRelativeTime } from '@/lib/utils'
import { logger } from '@/lib/logger'

type ViewMode = 'view' | 'edit'

const PRIORITY_CONFIG: Record<IncidentPriority, { color: string; bg: string; label: string }> = {
  critica: { color: 'text-red-500', bg: 'bg-red-500', label: 'Crítica' },
  alta: { color: 'text-orange-500', bg: 'bg-orange-500', label: 'Alta' },
  media: { color: 'text-blue-500', bg: 'bg-blue-500', label: 'Media' },
  baja: { color: 'text-gray-500', bg: 'bg-gray-500', label: 'Baja' },
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; variant: string }> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  confirmada: { label: 'Confirmada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
  en_proceso: { label: 'En proceso', variant: 'secondary' },
  cerrada: { label: 'Cerrada', variant: 'outline' },
}

export function MapPage() {
  const { user } = useAuthStore()
  const { zones, setZones, setSelectedZone, incidents, setIncidents, mapImage } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>('view')
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [showIncidentPanel, setShowIncidentPanel] = useState(true)
  // Si es URL de Firebase Storage, usarla directamente; si es local, agregar basePath
  // Si no hay mapa, será null y se mostrará un placeholder
  const mapUrl = mapImage 
    ? (isFirebaseStorageUrl(mapImage) ? mapImage : getAssetUrl(mapImage))
    : null
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const isAdmin = user?.rol === 'admin'

  // Cargar zonas
  useEffect(() => {
    getZones().then(setZones)
  }, [setZones])

  // Listener de wheel con passive: false para prevenir scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheelPassive = (e: WheelEvent) => {
      e.preventDefault()
      
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
      const newScale = Math.max(0.5, Math.min(10, scale * zoomFactor))
      
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      const scaleRatio = newScale / scale
      const newPosX = mouseX - (mouseX - position.x) * scaleRatio
      const newPosY = mouseY - (mouseY - position.y) * scaleRatio
      
      setScale(newScale)
      setPosition({ x: newPosX, y: newPosY })
    }

    container.addEventListener('wheel', handleWheelPassive, { passive: false })
    return () => container.removeEventListener('wheel', handleWheelPassive)
  }, [scale, position])

  // Suscribirse a incidencias activas
  useEffect(() => {
    const unsubscribe = subscribeToIncidents(setIncidents, {
      status: ['pendiente', 'confirmada', 'en_proceso'],
    })
    return () => unsubscribe()
  }, [setIncidents])

  // Incidencias por zona
  const incidentsByZone = incidents.reduce(
    (acc, incident) => {
      if (!acc[incident.zoneId]) {
        acc[incident.zoneId] = []
      }
      acc[incident.zoneId]!.push(incident)
      return acc
    },
    {} as Record<string, Incident[]>
  )

  // Control de zoom con límites optimizados para alta precisión
  const handleZoom = (delta: number) => {
    setScale((prev) => Math.max(0.5, Math.min(10, prev + delta)))
  }

  // Reset view
  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  // handleWheel ahora se maneja con addEventListener en useEffect para passive: false

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Touch handlers para móvil
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (e.touches.length === 1 && touch) {
      setIsDragging(true)
      setDragStart({
        x: touch.clientX - position.x,
        y: touch.clientY - position.y,
      })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (isDragging && e.touches.length === 1 && touch) {
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y,
      })
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // Efecto para resetear vista al cambiar de modo
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [viewMode])

  // Modo Editor - Usar el nuevo editor de polígonos
  if (viewMode === 'edit') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Editor de Zonas</h1>
            <p className="text-muted-foreground">
              Dibuja zonas poligonales punto a punto sobre el plano
            </p>
          </div>
          <Button variant="outline" onClick={() => setViewMode('view')}>
            <Eye className="h-4 w-4 mr-2" />
            Volver a Vista
          </Button>
        </div>

        <PolygonZoneEditor />
      </div>
    )
  }
  // Modo Vista
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Mapa de Planta</h1>
          <p className="text-muted-foreground">
            Vista general de zonas e incidencias
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setViewMode('edit')}>
              <Settings className="h-4 w-4 mr-2" />
              Editar Zonas
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => handleZoom(0.25)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => handleZoom(-0.25)}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleReset}>
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-destructive" />
              <span>Incidencias críticas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-warning" />
              <span>Incidencias altas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-primary" />
              <span>Incidencias medias</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-success" />
              <span>Sin incidencias</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map Container */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className="relative w-full h-[600px] md:h-[700px] overflow-hidden bg-muted cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="absolute transition-transform duration-100"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'top left',
                width: '100%',
                height: '100%',
              }}
            >
              {/* Plano de fondo */}
              <div className="relative w-full h-full">
                {/* Imagen del plano */}
                {mapUrl && (
                  <img
                    key={mapUrl}
                    src={mapUrl}
                    alt="Plano de planta"
                    className="absolute inset-0 w-full h-full"
                    style={{
                      imageRendering: 'crisp-edges' as const,
                      objectFit: 'contain',
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }}
                    loading="eager"
                    decoding="sync"
                    onLoad={(e) => {
                      logger.info('Map image loaded', { url: mapUrl, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
                    }}
                    onError={(e) => {
                      logger.error('Map image failed to load', new Error(`Failed to load map: ${mapUrl}`))
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}

                {/* Zonas sobre el plano */}
                {zones.length > 0 ? (
                  zones.map((zone) => (
                    <ZoneOverlay
                      key={zone.id}
                      zone={zone}
                      incidents={incidentsByZone[zone.id] || []}
                      onClick={() => setSelectedZone(zone)}
                      onIncidentClick={setSelectedIncident}
                    />
                  ))
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No hay zonas configuradas</p>
                      {isAdmin && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => setViewMode('edit')}
                        >
                          Configurar zonas
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Marcadores de incidencias individuales - Estilo Leaflet optimizado */}
                {incidents.map((incident) => {
                  const zone = zones.find(z => z.id === incident.zoneId)
                  if (!zone?.bounds) return null
                  
                  // Calcular posición dentro de la zona
                  const centerX = (zone.bounds.minX + zone.bounds.maxX) / 2
                  const centerY = (zone.bounds.minY + zone.bounds.maxY) / 2
                  
                  // Distribuir incidencias dentro de la zona con un pequeño offset
                  const zoneIncidents = incidents.filter(i => i.zoneId === incident.zoneId)
                  const idx = zoneIncidents.findIndex(i => i.id === incident.id)
                  const angle = (idx / zoneIncidents.length) * 2 * Math.PI
                  const radius = Math.min(
                    (zone.bounds.maxX - zone.bounds.minX) * 0.3,
                    (zone.bounds.maxY - zone.bounds.minY) * 0.3
                  )
                  const offsetX = Math.cos(angle) * radius
                  const offsetY = Math.sin(angle) * radius
                  
                  const x = (centerX + offsetX) * 100
                  const y = (centerY + offsetY) * 100
                  
                  const priorityConfig = PRIORITY_CONFIG[incident.prioridad]
                  
                  return (
                    <button
                      key={incident.id}
                      className={cn(
                        'absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-3 border-white shadow-xl cursor-pointer',
                        'hover:scale-150 transition-all duration-200 z-10 group',
                        'hover:shadow-2xl hover:ring-4 hover:ring-white/50',
                        priorityConfig.bg,
                        selectedIncident?.id === incident.id && 'ring-4 ring-white scale-150 z-20'
                      )}
                      style={{ left: `${x}%`, top: `${y}%` }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedIncident(incident)
                      }}
                      aria-label={`Incidencia: ${incident.titulo}`}
                      title={`${incident.titulo} - ${priorityConfig.label}`}
                    >
                      <AlertTriangle className="h-4 w-4 text-white mx-auto" />
                      {/* Tooltip hover */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap z-30">
                        <div className="bg-card text-card-foreground text-xs px-2 py-1 rounded shadow-lg border">
                          {incident.titulo}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Panel lateral de incidencias */}
            <div className={cn(
              'absolute top-0 right-0 h-full bg-card/95 backdrop-blur border-l shadow-lg transition-all duration-300 overflow-hidden',
              showIncidentPanel ? 'w-80' : 'w-0'
            )}>
              <div className="h-full flex flex-col">
                <div className="p-3 border-b flex items-center justify-between">
                  <h3 className="font-semibold">Incidencias Activas ({incidents.length})</h3>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setShowIncidentPanel(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {incidents.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No hay incidencias activas
                    </p>
                  ) : (
                    incidents.map((incident) => {
                      const zone = zones.find(z => z.id === incident.zoneId)
                      const priorityConfig = PRIORITY_CONFIG[incident.prioridad]
                      const statusConfig = STATUS_CONFIG[incident.status]
                      
                      return (
                        <button
                          key={incident.id}
                          className={cn(
                            'w-full text-left p-3 rounded-lg border bg-card hover:bg-muted transition-colors',
                            selectedIncident?.id === incident.id && 'ring-2 ring-primary'
                          )}
                          onClick={() => setSelectedIncident(incident)}
                        >
                          <div className="flex items-start gap-2">
                            <div className={cn('w-2 h-2 rounded-full mt-2 flex-shrink-0', priorityConfig.bg)} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{incident.titulo}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{zone?.nombre || 'Sin zona'}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant={statusConfig.variant as any} className="text-xs">
                                  {statusConfig.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatRelativeTime(incident.createdAt)}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Botón para mostrar panel */}
            {!showIncidentPanel && (
              <Button
                className="absolute top-4 right-4"
                variant="secondary"
                size="sm"
                onClick={() => setShowIncidentPanel(true)}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                {incidents.length}
              </Button>
            )}

            {/* Zoom indicator */}
            <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur px-3 py-1 rounded text-sm">
              Zoom: {Math.round(scale * 100)}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diálogo de detalle de incidencia */}
      {selectedIncident && (
        <IncidentQuickView 
          incident={selectedIncident} 
          zone={zones.find(z => z.id === selectedIncident.zoneId)}
          onClose={() => setSelectedIncident(null)} 
        />
      )}

      {/* Zone Stats */}
      {zones.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {zones.map((zone) => {
            const zoneIncidents = incidentsByZone[zone.id] || []
            const criticalCount = zoneIncidents.filter(
              (i) => i.prioridad === 'critica'
            ).length

            return (
              <Card
                key={zone.id}
                className={cn(
                  'cursor-pointer hover:border-primary/50 transition-colors',
                  criticalCount > 0 && 'border-destructive'
                )}
                onClick={() => setSelectedZone(zone)}
              >
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: zone.color || '#2196f3' }}
                    />
                    {zone.nombre}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {zoneIncidents.length}
                    </span>
                    {criticalCount > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {criticalCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    incidencias activas
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ZoneOverlay({
  zone,
  incidents,
  onClick,
}: {
  zone: Zone
  incidents: Incident[]
  onClick: () => void
  onIncidentClick?: (incident: Incident) => void
}) {
  const criticalCount = incidents.filter((i) => i.prioridad === 'critica').length
  const highCount = incidents.filter((i) => i.prioridad === 'alta').length

  let statusColor = 'border-success/40 bg-success/8 hover:bg-success/15'
  if (criticalCount > 0) {
    statusColor = 'border-destructive/60 bg-destructive/15 hover:bg-destructive/25'
  } else if (highCount > 0) {
    statusColor = 'border-warning/60 bg-warning/15 hover:bg-warning/25'
  } else if (incidents.length > 0) {
    statusColor = 'border-primary/60 bg-primary/15 hover:bg-primary/25'
  }

  if (zone.bounds) {
    const style = {
      position: 'absolute' as const,
      left: `${zone.bounds.minX * 100}%`,
      top: `${zone.bounds.minY * 100}%`,
      width: `${(zone.bounds.maxX - zone.bounds.minX) * 100}%`,
      height: `${(zone.bounds.maxY - zone.bounds.minY) * 100}%`,
      borderColor: zone.color,
    }

    return (
      <div
        className={cn(
          'rounded-lg border-2 cursor-pointer transition-all hover:shadow-lg',
          statusColor
        )}
        style={style}
        onClick={onClick}
      >
        <div className="absolute top-1 left-1">
          <div
            className="px-2 py-0.5 rounded text-white text-xs font-semibold shadow-sm"
            style={{ backgroundColor: zone.color }}
          >
            {zone.codigo || zone.nombre}
          </div>
        </div>
        {incidents.length > 0 && (
          <div className="absolute bottom-1 right-1">
            <div className="bg-yellow-500 text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-sm">
              {incidents.length}
            </div>
          </div>
        )}
      </div>
    )
  }
  return null
}

// Vista rápida de incidencia
function IncidentQuickView({ 
  incident, 
  zone,
  onClose 
}: { 
  incident: Incident
  zone?: Zone
  onClose: () => void 
}) {
  const priorityConfig = PRIORITY_CONFIG[incident.prioridad]
  const statusConfig = STATUS_CONFIG[incident.status]
  
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2">
            <div className={cn('w-3 h-3 rounded-full mt-1.5 flex-shrink-0', priorityConfig.bg)} />
            <span>{incident.titulo}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Estado y prioridad */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusConfig.variant as any}>
              {statusConfig.label}
            </Badge>
            <Badge variant="outline" className={priorityConfig.color}>
              {priorityConfig.label}
            </Badge>
          </div>
          
          {/* Zona */}
          {zone && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: zone.color || '#2196f3' }}
              />
              <span>{zone.nombre}</span>
            </div>
          )}
          
          {/* Descripción */}
          <div>
            <p className="text-sm text-muted-foreground">{incident.descripcion}</p>
          </div>
          
          {/* Síntomas */}
          {incident.sintomas && incident.sintomas.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Síntomas:</p>
              <div className="flex flex-wrap gap-1">
                {incident.sintomas.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Fotos */}
          {incident.fotos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Camera className="h-3 w-3" />
                Fotos ({incident.fotos.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {incident.fotos.slice(0, 3).map((foto, i) => (
                  <img 
                    key={i}
                    src={foto}
                    alt={`Foto ${i + 1}`}
                    className="w-full aspect-square object-cover rounded-md cursor-pointer hover:opacity-80"
                    onClick={() => window.open(foto, '_blank')}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(incident.createdAt)}
            </div>
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Reportado
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
