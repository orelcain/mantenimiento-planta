import { useState, useEffect, useRef } from 'react'
import {
  MapPin,
  ZoomIn,
  ZoomOut,
  Maximize,
  AlertTriangle,
  Settings,
  Eye,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import { getZones } from '@/services/zones'
import { subscribeToIncidents } from '@/services/incidents'
import { PolygonZoneEditor } from '@/components/map'
import type { Zone, Incident } from '@/types'
import { cn } from '@/lib/utils'

type ViewMode = 'view' | 'edit'

export function MapPage() {
  const { user } = useAuthStore()
  const { zones, setZones, setSelectedZone, incidents, setIncidents, mapImage } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>('view')
  const mapUrl = mapImage || '/maps/map_1760411932641.png'
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

  // Control de zoom
  const handleZoom = (delta: number) => {
    setScale((prev) => Math.max(0.5, Math.min(3, prev + delta)))
  }

  // Reset view
  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

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
            className="relative w-full h-[500px] overflow-hidden bg-muted cursor-grab active:cursor-grabbing"
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
                <img
                  src={mapUrl}
                  alt="Plano de planta"
                  className="absolute inset-0 w-full h-full object-contain opacity-50"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />

                {/* Zonas sobre el plano */}
                {zones.length > 0 ? (
                  zones.map((zone) => (
                    <ZoneOverlay
                      key={zone.id}
                      zone={zone}
                      incidents={incidentsByZone[zone.id] || []}
                      onClick={() => setSelectedZone(zone)}
                    />
                  ))
                ) : (
                  <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-2 p-4">
                    <PlaceholderZone name="Zona A" color="#2196f3" />
                    <PlaceholderZone name="Zona B" color="#4caf50" />
                    <PlaceholderZone name="Zona C" color="#ff9800" />
                    <PlaceholderZone name="Zona D" color="#9c27b0" />
                  </div>
                )}
              </div>
            </div>

            {/* Zoom indicator */}
            <div className="absolute bottom-4 right-4 bg-card/80 backdrop-blur px-3 py-1 rounded text-sm">
              Zoom: {Math.round(scale * 100)}%
            </div>
          </div>
        </CardContent>
      </Card>

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
}) {
  const criticalCount = incidents.filter((i) => i.prioridad === 'critica').length
  const highCount = incidents.filter((i) => i.prioridad === 'alta').length

  let statusColor = 'border-success/50 bg-success/10'
  if (criticalCount > 0) {
    statusColor = 'border-destructive bg-destructive/20'
  } else if (highCount > 0) {
    statusColor = 'border-warning bg-warning/20'
  } else if (incidents.length > 0) {
    statusColor = 'border-primary bg-primary/20'
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
          'rounded-lg border-2 cursor-pointer transition-all hover:scale-[1.02]',
          statusColor
        )}
        style={style}
        onClick={onClick}
      >
        <div className="absolute top-1 left-1">
          <Badge
            style={{ backgroundColor: zone.color }}
            className="text-white text-xs"
          >
            {zone.id}
          </Badge>
        </div>
        <div className="flex flex-col items-center justify-center h-full p-2">
          <h3 className="font-medium text-center text-sm">{zone.nombre}</h3>
          {incidents.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-warning" />
              <span className="text-xs">{incidents.length}</span>
            </div>
          )}
        </div>
        {incidents.slice(0, 3).map((incident, index) => (
          <div
            key={incident.id}
            className={cn(
              'absolute w-2 h-2 rounded-full animate-pulse',
              incident.prioridad === 'critica'
                ? 'bg-destructive'
                : incident.prioridad === 'alta'
                  ? 'bg-warning'
                  : 'bg-primary'
            )}
            style={{
              top: `${20 + index * 20}%`,
              right: `${10 + index * 10}%`,
            }}
          />
        ))}
      </div>
    )
  }
  return null
}

function PlaceholderZone({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="relative rounded-lg border-2 border-dashed p-4 flex flex-col items-center justify-center"
      style={{ borderColor: color, backgroundColor: `${color}10` }}
    >
      <MapPin className="h-8 w-8 mb-2" style={{ color }} />
      <h3 className="font-medium">{name}</h3>
      <p className="text-xs text-muted-foreground mt-1">Sin configurar</p>
    </div>
  )
}
