/**
 * MapPage — Visor de Mapas Isométrico 3D
 * 
 * Mapa isométrico interactivo de la planta con:
 * - Vista 3D con cámara ortográfica y rotación FFT (Q/E o botones)
 * - Equipos representados como nodos 3D con estado en tiempo real
 * - Panel lateral de incidencias activas (reutilizado del visor anterior)
 * - Leyenda de estados con colores
 * - Controles de zoom, rotación y filtros
 * 
 * v2.67.0 — Mapa Isométrico
 */

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import {
  MapPin,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize,
  AlertTriangle,
  X,
  ChevronRight,
  Eye,
  EyeOff,
  Compass,
  Activity,
  CircleCheck,
  Layers,
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
} from '@/components/ui'
import { IncidentDetail } from '@/components/incidents/IncidentDetail'
import { useAppStore, useAuthStore, useCanValidateIncidents } from '@/store'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { generateDemoMap, generateDemoRuntimeData } from '@/services/isometricMap'
import type { CameraAngle, IsometricViewerState, NodeRuntimeData } from '@/types/isometricMap'
import { 
  DEFAULT_VIEWER_STATE,
  CAMERA_ANGLE_NAMES,
  STATUS_LABELS,
  STATUS_COLORS,
  EQUIPMENT_TYPE_LABELS,
} from '@/types/isometricMap'
import type { Incident, IncidentPriority, IncidentStatus } from '@/types'

// Lazy load del componente 3D pesado
const IsometricScene = lazy(() =>
  import('@/components/map/isometric/IsometricScene').then((m) => ({ default: m.IsometricScene }))
)

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
  resuelta: { label: 'Resuelta', variant: 'success' },
  cerrada: { label: 'Cerrada', variant: 'outline' },
}

export function MapPage() {
  const canValidate = useCanValidateIncidents()
  const { incidents } = useAppStore()
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [showIncidentPanel, setShowIncidentPanel] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  // Estado del visor isométrico
  const [viewerState, setViewerState] = useState<IsometricViewerState>(DEFAULT_VIEWER_STATE)

  // Datos del mapa (demo por ahora, luego vendrá de Firestore)
  const demoData = useMemo(() => generateDemoMap(), [])
  const [runtimeData, setRuntimeData] = useState<Map<string, NodeRuntimeData>>(
    () => generateDemoRuntimeData(demoData.nodes)
  )

  // Incidencias activas
  const activeIncidents = useMemo(
    () => incidents.filter((i) =>
      i.status === 'pendiente' || i.status === 'confirmada' || i.status === 'en_proceso'
    ),
    [incidents]
  )

  // Resumen de estados para la leyenda
  const statusSummary = useMemo(() => {
    const summary = { ok: 0, warning: 0, critical: 0, offline: 0, maintenance: 0 }
    for (const [, data] of runtimeData) {
      summary[data.status]++
    }
    return summary
  }, [runtimeData])

  // ── Handlers de cámara ──
  const rotateLeft = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      cameraAngle: ((prev.cameraAngle + 3) % 4) as CameraAngle,
    }))
  }, [])

  const rotateRight = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      cameraAngle: ((prev.cameraAngle + 1) % 4) as CameraAngle,
    }))
  }, [])

  const zoomIn = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      zoom: Math.min(prev.zoom + 5, 120),
    }))
  }, [])

  const zoomOut = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom - 5, 15),
    }))
  }, [])

  const resetView = useCallback(() => {
    setViewerState(DEFAULT_VIEWER_STATE)
  }, [])

  // ── Handlers de nodos ──
  const handleNodeClick = useCallback((nodeId: string) => {
    setViewerState((prev) => ({
      ...prev,
      selectedNodeId: prev.selectedNodeId === nodeId ? null : nodeId,
    }))
  }, [])

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setViewerState((prev) => ({
      ...prev,
      hoveredNodeId: nodeId,
    }))
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      selectedNodeId: null,
    }))
  }, [])

  // ── Handlers de filtros ──
  const toggleFilter = useCallback((key: keyof IsometricViewerState['filters']) => {
    setViewerState((prev) => ({
      ...prev,
      filters: {
        ...prev.filters,
        [key]: !prev.filters[key],
      },
    }))
  }, [])

  // Keyboard shortcuts (Q/E ya los maneja useIsometricRotation internamente)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault()
          zoomIn()
          break
        case '-':
          e.preventDefault()
          zoomOut()
          break
        case 'r':
        case 'R':
          e.preventDefault()
          resetView()
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [zoomIn, zoomOut, resetView])

  // Nodo seleccionado data
  const selectedNode = viewerState.selectedNodeId
    ? demoData.nodes.find((n) => n.id === viewerState.selectedNodeId)
    : null
  const selectedNodeRuntime = viewerState.selectedNodeId
    ? runtimeData.get(viewerState.selectedNodeId)
    : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Compass className="h-6 w-6 text-primary" />
            Mapa Isométrico
          </h1>
          <p className="text-sm text-muted-foreground">
            Vista 3D de la planta — Rotar: Q/E · Zoom: +/- · Reset: R
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Ángulo actual */}
          <Badge variant="outline" className="gap-1 font-normal">
            <Compass className="h-3.5 w-3.5" />
            {CAMERA_ANGLE_NAMES[viewerState.cameraAngle]}
          </Badge>
          {/* Zoom */}
          <Badge variant="outline" className="gap-1 font-normal">
            Zoom: {viewerState.zoom}
          </Badge>
        </div>
      </div>

      {/* Status Legend */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((status) => (
              <div key={status} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <span>{STATUS_LABELS[status]}</span>
                <span className="font-semibold text-foreground">({statusSummary[status]})</span>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-1 text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              <span>{demoData.nodes.length} equipos</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main 3D Viewport + Controls */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="relative w-full h-[550px] md:h-[650px] lg:h-[700px]">
            {/* Three.js Scene */}
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-[#0d1117]">
                  <div className="text-center space-y-3">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-muted-foreground">Cargando escena 3D...</p>
                  </div>
                </div>
              }
            >
              <IsometricScene
                config={demoData.config}
                nodes={demoData.nodes}
                connectors={demoData.connectors}
                areas={demoData.areas}
                runtimeData={runtimeData}
                viewerState={viewerState}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                onBackgroundClick={handleBackgroundClick}
              />
            </Suspense>

            {/* ─── HUD Overlay Controls ─── */}

            {/* Camera rotation + zoom (izquierda abajo) */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
              <div className="flex items-center gap-1 bg-card/90 backdrop-blur rounded-lg p-1 shadow-lg border">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={rotateLeft} title="Rotar izq (Q)">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={rotateRight} title="Rotar der (E)">
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn} title="Acercar (+)">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut} title="Alejar (-)">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetView} title="Resetear (R)">
                    <Maximize className="h-4 w-4" />
                  </Button>
              </div>
            </div>

            {/* Filter toggles (izquierda arriba) */}
            <div className="absolute top-4 left-4">
              <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Filtros
                </Button>
                {showFilters && (
                  <div className="p-2 border-t space-y-1">
                    {[
                      { key: 'showLabels' as const, icon: Eye, label: 'Etiquetas' },
                      { key: 'showAreas' as const, icon: MapPin, label: 'Áreas' },
                      { key: 'showConnectors' as const, icon: Activity, label: 'Conectores' },
                      { key: 'showAlerts' as const, icon: AlertTriangle, label: 'Alertas' },
                    ].map(({ key, icon: Icon, label }) => (
                      <button
                        key={key}
                        className={cn(
                          'flex items-center gap-2 w-full text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors',
                          viewerState.filters[key] ? 'text-foreground' : 'text-muted-foreground'
                        )}
                        onClick={() => toggleFilter(key)}
                      >
                        {viewerState.filters[key] ? (
                          <Eye className="h-3 w-3 text-primary" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                        <Icon className="h-3 w-3" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Selected node info card (centro abajo) */}
            {selectedNode && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-sm w-full px-4">
                <Card className="bg-card/95 backdrop-blur shadow-xl border">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm">{selectedNode.label}</h4>
                        <p className="text-xs text-muted-foreground">
                          {EQUIPMENT_TYPE_LABELS[selectedNode.type]} · Pos ({selectedNode.position.x}, {selectedNode.position.z})m
                        </p>
                        {selectedNodeRuntime && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: STATUS_COLORS[selectedNodeRuntime.status] }}
                            />
                            <span className="text-xs font-medium">
                              {STATUS_LABELS[selectedNodeRuntime.status]}
                            </span>
                            {selectedNodeRuntime.activeIncidents > 0 && (
                              <Badge variant="destructive" className="text-xs h-5 gap-0.5">
                                <AlertTriangle className="h-3 w-3" />
                                {selectedNodeRuntime.activeIncidents}
                              </Badge>
                            )}
                            {selectedNodeRuntime.sensorValue !== undefined && (
                              <Badge variant="secondary" className="text-xs h-5">
                                {selectedNodeRuntime.sensorValue}{selectedNodeRuntime.sensorUnit || ''}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={handleBackgroundClick}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Panel lateral de incidencias (derecha) */}
            <div className={cn(
              'absolute top-0 right-0 h-full bg-card/95 backdrop-blur border-l shadow-lg transition-all duration-300 overflow-hidden',
              showIncidentPanel ? 'w-72 md:w-80' : 'w-0'
            )}>
              <div className="h-full flex flex-col">
                <div className="p-3 border-b flex items-center justify-between">
                  <h3 className="font-semibold text-sm">
                    Incidencias ({activeIncidents.length})
                  </h3>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowIncidentPanel(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {activeIncidents.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <CircleCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Sin incidencias activas</p>
                    </div>
                  ) : (
                    activeIncidents.map((incident) => {
                      const priorityConfig = PRIORITY_CONFIG[incident.prioridad]
                      const statusConfig = STATUS_CONFIG[incident.status]
                      
                      return (
                        <button
                          key={incident.id}
                          className={cn(
                            'w-full text-left p-2.5 rounded-lg border bg-card hover:bg-muted transition-colors',
                            selectedIncident?.id === incident.id && 'ring-2 ring-primary'
                          )}
                          onClick={() => setSelectedIncident(incident)}
                        >
                          <div className="flex items-start gap-2">
                            <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', priorityConfig.bg)} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-xs truncate">{incident.titulo}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <Badge variant={statusConfig.variant as any} className="text-[10px] h-4">
                                  {statusConfig.label}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatRelativeTime(incident.createdAt)}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1" />
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Botón para mostrar panel de incidencias */}
            {!showIncidentPanel && (
              <Button
                className="absolute top-4 right-4 shadow-lg"
                variant="secondary"
                size="sm"
                onClick={() => setShowIncidentPanel(true)}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                {activeIncidents.length}
              </Button>
            )}

            {/* Help hint (bottom right) */}
            <div className="absolute bottom-4 right-4 text-[10px] text-muted-foreground/60 select-none pointer-events-none hidden md:block">
              Q/E: rotar · +/-: zoom · R: reset · Click: seleccionar
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diálogo de detalle de incidencia */}
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
