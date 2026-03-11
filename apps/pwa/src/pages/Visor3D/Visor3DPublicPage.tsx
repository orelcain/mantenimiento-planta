/**
 * Visor3DPublicPage - Vista 100% pública para acceso directo por QR
 *
 * - NO requiere autenticación
 * - Sin sidebar, sin navegación, sin acceso a otras partes de la app
 * - Visor 3D completo con:
 *   · Orbit/zoom/pan
 *   · Pintar piezas con paleta de colores
 *   · Crear, ver y eliminar cotas/dimensiones
 *   · Fullscreen
 * - Ruta: /v/:modelId
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Maximize,
  Minimize,
  RotateCcw,
  Ruler,
  AlertCircle,
  Box,
  Loader2,
  Paintbrush,
  Trash2,
  X,
  Circle,
  SquareDashed,
  PenTool,
  MapPin,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { getModel3DById } from '@/services/models3d'
import {
  subscribeToDimensions,
  createDimension,
  deleteDimension,
  calculateDistance,
  convertUnit,
  calculatePolygonArea,
  calculateCircleFrom3Points,
  calculateOrientedBoxVolume,
  convertAreaUnit,
  convertVolumeUnit,
  getRequiredPoints,
  formatMeasurement,
} from '@/services/dimensions'
import { subscribeToMaterialOverrides, setMaterialOverride, deleteMaterialOverride, deleteAllMaterialOverrides } from '@/services/materials3d'
import { subscribeToAnnotations } from '@/services/annotations3d'
import { Viewer3D } from '@/components/visor3d/Viewer3D'
import { DimensionsTool } from '@/components/visor3d/DimensionsTool'
import { ColorPalette } from '@/components/visor3d/ColorPalette'
import { AnnotationListItems } from '@/components/visor3d/AnnotationListItems'
import { SopladorasBaader142InteractiveExperience } from '@/components/visor3d/interactive/SopladorasBaader142InteractiveExperience'
import { ToboganInteractiveExperience } from '@/components/visor3d/interactive/ToboganInteractiveExperience'
import { getInteractiveExperienceForModel } from '@/components/visor3d/interactive/experienceRegistry'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { Model3D, MaterialOverride, Annotation3D, Dimension3D, DimensionUnit, Point3D, MeasurementType } from '@/types/models3d'
import { getUnitSuffix } from '@/types/models3d'

/** ID anónimo para vista pública */
const PUBLIC_USER_ID = 'public-viewer'

export function Visor3DPublicPage() {
  const { modelId } = useParams<{ modelId: string }>()

  const [model, setModel] = useState<Model3D | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dimensions state
  const [dimensions, setDimensions] = useState<Dimension3D[]>([])
  const [showDimensions, setShowDimensions] = useState(true)
  const [creatingDimension, setCreatingDimension] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState<DimensionUnit>('cm')
  const [pendingPoints, setPendingPoints] = useState<Point3D[]>([])
  const [measurementType, setMeasurementType] = useState<MeasurementType>('distance')

  // Paint state
  const [paintMode, setPaintMode] = useState(false)
  const [paintColor, setPaintColor] = useState<string | null>(null)
  const [paintErase, setPaintErase] = useState(false)
  const [materialOverrides, setMaterialOverrides] = useState<MaterialOverride[]>([])

  // Annotations state (read-only in public view)
  const [annotations, setAnnotations] = useState<Annotation3D[]>([])
  const [showAnnotations, setShowAnnotations] = useState(true)

  // Lightbox state
  const [lightboxPhotos, setLightboxPhotos] = useState<string[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeView, setActiveView] = useState<'model' | 'interactive'>('model')

  // Focus camera on point
  const [focusPoint, setFocusPoint] = useState<Point3D | null>(null)
  const interactiveExperience = getInteractiveExperienceForModel(model)

  // Cargar modelo (sin auth)
  useEffect(() => {
    if (!modelId) return
    setLoading(true)
    setError(null)
    getModel3DById(modelId)
      .then((m) => {
        if (!m) setError('Modelo no encontrado')
        else setModel(m)
      })
      .catch((err) => setError(`Error cargando modelo: ${(err as Error).message}`))
      .finally(() => setLoading(false))
  }, [modelId])

  useEffect(() => {
    if (interactiveExperience || activeView === 'model') return
    setActiveView('model')
  }, [activeView, interactiveExperience])

  useEffect(() => {
    if (activeView !== 'interactive') return
    setCreatingDimension(false)
    setPendingPoints([])
    setPaintMode(false)
    setPaintColor(null)
    setPaintErase(false)
  }, [activeView])

  // Suscribirse a cotas (sin auth)
  useEffect(() => {
    if (!modelId) return
    const unsub = subscribeToDimensions(modelId, setDimensions)
    return () => unsub()
  }, [modelId])

  // Suscribirse a material overrides (sin auth)
  useEffect(() => {
    if (!modelId) return
    const unsub = subscribeToMaterialOverrides(modelId, setMaterialOverrides)
    return () => unsub()
  }, [modelId])

  // Suscribirse a anotaciones (sin auth, solo lectura)
  useEffect(() => {
    if (!modelId) return
    const unsub = subscribeToAnnotations(modelId, setAnnotations)
    return () => unsub()
  }, [modelId])

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Handle click on 3D model for dimension creation
  const handleModelClick = useCallback(
    async (point: Point3D) => {
      if (!creatingDimension || !modelId) return

      const newPoints = [...pendingPoints, point]
      const required = getRequiredPoints(measurementType)

      // For area: accumulate, don't auto-close (needs manual close)
      if (required === 'multi') {
        setPendingPoints(newPoints)
        return
      }

      // Not enough points yet
      if (newPoints.length < required) {
        setPendingPoints(newPoints)
        return
      }

      // We have enough points — create the dimension
      if (measurementType === 'distance') {
        const distance = calculateDistance(newPoints[0]!, newPoints[1]!)
        const length = convertUnit(distance, selectedUnit)
        await createDimension(modelId, {
          type: 'distance',
          points: newPoints,
          p1: newPoints[0]!,
          p2: newPoints[1]!,
          value: length,
          length,
          unit: selectedUnit,
          createdBy: PUBLIC_USER_ID,
        })
      } else if (measurementType === 'circumference') {
        const circle = calculateCircleFrom3Points(newPoints[0]!, newPoints[1]!, newPoints[2]!)
        if (!circle) {
          setPendingPoints([])
          return
        }
        const radiusConverted = convertUnit(circle.radius, selectedUnit)
        const circumference = 2 * Math.PI * radiusConverted
        await createDimension(modelId, {
          type: 'circumference',
          points: newPoints,
          p1: newPoints[0]!,
          p2: newPoints[2]!,
          value: circumference,
          length: circumference,
          unit: selectedUnit,
          radius: radiusConverted,
          diameter: radiusConverted * 2,
          createdBy: PUBLIC_USER_ID,
        })
      } else if (measurementType === 'volume') {
        const result = calculateOrientedBoxVolume(newPoints[0]!, newPoints[1]!, newPoints[2]!, newPoints[3]!)
        const volConverted = convertVolumeUnit(result.volume, selectedUnit)
        await createDimension(modelId, {
          type: 'volume',
          points: newPoints,
          p1: newPoints[0]!,
          p2: newPoints[3]!,
          value: volConverted,
          length: volConverted,
          unit: selectedUnit,
          createdBy: PUBLIC_USER_ID,
        })
      }

      setPendingPoints([])
      setCreatingDimension(false)
    },
    [creatingDimension, pendingPoints, modelId, selectedUnit, measurementType]
  )

  // Close area polygon manually
  const handleClosePolygon = useCallback(async () => {
    if (!modelId || pendingPoints.length < 3) return
    const area = calculatePolygonArea(pendingPoints)
    const areaConverted = convertAreaUnit(area, selectedUnit)
    await createDimension(modelId, {
      type: 'area',
      points: pendingPoints,
      p1: pendingPoints[0]!,
      p2: pendingPoints[pendingPoints.length - 1]!,
      value: areaConverted,
      length: areaConverted,
      unit: selectedUnit,
      createdBy: PUBLIC_USER_ID,
    })
    setPendingPoints([])
    setCreatingDimension(false)
  }, [modelId, pendingPoints, selectedUnit])

  // Handle paint mesh
  const handleMeshPainted = useCallback(
    async (meshId: string, color: string | null) => {
      if (!modelId) return
      if (color) {
        await setMaterialOverride(modelId, {
          meshId,
          color,
          opacity: 1,
          createdBy: PUBLIC_USER_ID,
        })
      } else {
        const overrideId = meshId.replace(/[/#[\]]/g, '_').replace(/\./g, '_')
        await deleteMaterialOverride(modelId, overrideId).catch(() => {})
      }
    },
    [modelId]
  )

  // Reset all paint
  const handleResetAllPaint = useCallback(async () => {
    if (!modelId) return
    await deleteAllMaterialOverrides(modelId)
    setResetKey((k) => k + 1)
  }, [modelId])

  // Eliminar cota
  const handleDeleteDimension = useCallback(
    async (dimId: string) => {
      if (!modelId) return
      await deleteDimension(modelId, dimId)
    },
    [modelId]
  )

  // Toggle paint mode
  const togglePaintMode = useCallback(() => {
    if (paintMode) {
      setPaintMode(false)
      setPaintColor(null)
      setPaintErase(false)
    } else {
      setPaintMode(true)
      setCreatingDimension(false)
      setPendingPoints([])
    }
  }, [paintMode])

  // Toggle dimension creation
  const toggleDimensionCreation = useCallback(() => {
    if (creatingDimension) {
      setCreatingDimension(false)
      setPendingPoints([])
    } else {
      setCreatingDimension(true)
      setPendingPoints([])
      setPaintMode(false)
      setPaintColor(null)
      setPaintErase(false)
    }
  }, [creatingDimension])

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando modelo 3D...</p>
        </div>
      </div>
    )
  }

  // Error
  if (error || !model) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-medium">Error</h2>
            <p className="text-sm text-muted-foreground text-center">
              {error || 'Modelo no encontrado'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-screen w-screen flex flex-col bg-background overflow-hidden"
    >
      {/* Header con controles */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-sm font-bold truncate">{model.name}</h1>
          <Badge variant="outline" className="text-[10px] uppercase shrink-0">
            {model.format}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeView === 'model' && (
            <>
              <Button
                variant={showDimensions ? 'default' : 'outline'}
                size="sm"
                className="gap-1 h-7 text-xs"
                onClick={() => setShowDimensions(!showDimensions)}
              >
                <Ruler className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cotas ({dimensions.length})</span>
                <span className="sm:hidden">{dimensions.length}</span>
              </Button>

              {!paintMode && (
                <Button
                  variant={creatingDimension ? 'destructive' : 'outline'}
                  size="sm"
                  className="gap-1 h-7 text-xs"
                  onClick={toggleDimensionCreation}
                >
                  {creatingDimension ? (
                    <><X className="h-3.5 w-3.5" /><span className="hidden sm:inline">Cancelar</span></>
                  ) : (
                    <><Ruler className="h-3.5 w-3.5" /><span className="hidden sm:inline">+ Cota</span></>
                  )}
                </Button>
              )}

              <Button
                variant={showAnnotations ? 'default' : 'outline'}
                size="sm"
                className="gap-1 h-7 text-xs"
                onClick={() => setShowAnnotations(!showAnnotations)}
              >
                <MapPin className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Notas ({annotations.length})</span>
                <span className="sm:hidden">{annotations.length}</span>
              </Button>

              {!creatingDimension && (
                <Button
                  variant={paintMode ? 'destructive' : 'outline'}
                  size="sm"
                  className="gap-1 h-7 text-xs"
                  onClick={togglePaintMode}
                >
                  {paintMode ? (
                    <><X className="h-3.5 w-3.5" /><span className="hidden sm:inline">Cerrar</span></>
                  ) : (
                    <><Paintbrush className="h-3.5 w-3.5" /><span className="hidden sm:inline">Pintar</span></>
                  )}
                </Button>
              )}
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setResetKey((k) => k + 1)}
            title="Reset vista"
            disabled={activeView !== 'model'}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {interactiveExperience && (
        <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'model' | 'interactive')}>
          <div className="flex items-center justify-between border-b bg-card px-3 py-2 shrink-0">
            <TabsList className="h-auto bg-muted/70">
              <TabsTrigger value="model">Modelo 3D</TabsTrigger>
              <TabsTrigger value="interactive">Interactividad</TabsTrigger>
            </TabsList>
            <p className="hidden text-[11px] text-muted-foreground md:block">
              {interactiveExperience.id === 'tobogan'
                ? 'Vista publica con experiencia especifica del tobogan.'
                : `Vista publica con interactividad para ${interactiveExperience.label}.`}
            </p>
          </div>
        </Tabs>
      )}

      {/* Dimension creation indicator */}
      {activeView === 'model' && creatingDimension && (
        <div className="flex flex-col gap-1 px-3 py-1.5 bg-blue-500/10 border-b border-blue-500/30 shrink-0">
          {/* Measurement type selector */}
          <div className="flex items-center gap-1 flex-wrap">
            {([
              { type: 'distance' as MeasurementType, icon: <Ruler className="h-3 w-3" />, label: '📏 Distancia' },
              { type: 'area' as MeasurementType, icon: <PenTool className="h-3 w-3" />, label: '📐 Área' },
              { type: 'circumference' as MeasurementType, icon: <Circle className="h-3 w-3" />, label: '⭕ Circunf.' },
              { type: 'volume' as MeasurementType, icon: <SquareDashed className="h-3 w-3" />, label: '📦 Volumen' },
            ]).map(({ type, label }) => (
              <button
                key={type}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  measurementType === type
                    ? 'bg-blue-500 text-white'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => { setMeasurementType(type); setPendingPoints([]) }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Instructions + unit + undo */}
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-400">
                {measurementType === 'distance' && (pendingPoints.length === 0 ? 'Clic en el 1er punto' : 'Clic en el 2do punto')}
                {measurementType === 'area' && (pendingPoints.length < 3 ? `Clic punto ${pendingPoints.length + 1} (mín. 3)` : `${pendingPoints.length} puntos — clic más o cerrar`)}
                {measurementType === 'circumference' && `Clic punto ${pendingPoints.length + 1} de 3`}
                {measurementType === 'volume' && `Clic punto ${pendingPoints.length + 1} de 4 — ${['esquina origen', 'fin arista largo', 'fin arista ancho', 'fin arista alto'][pendingPoints.length] ?? ''}`}
              </p>
              <p className="text-[10px] text-muted-foreground">
                <span className="text-green-400">●</span> vértice &nbsp;
                <span className="text-blue-400">●</span> arista &nbsp;
                <span className="text-gray-400">●</span> superficie
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {(['mm', 'cm', 'm'] as DimensionUnit[]).map((u) => (
                <button
                  key={u}
                  className={`px-1.5 py-0.5 rounded ${selectedUnit === u ? 'bg-blue-500 text-white' : 'hover:bg-muted'}`}
                  onClick={() => setSelectedUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>
            {pendingPoints.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setPendingPoints(pendingPoints.slice(0, -1))}
              >
                Deshacer
              </Button>
            )}
            {measurementType === 'area' && pendingPoints.length >= 3 && (
              <Button
                variant="default"
                size="sm"
                className="h-6 text-[10px] px-2 bg-green-600 hover:bg-green-700"
                onClick={handleClosePolygon}
              >
                Cerrar polígono
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 3D Viewer */}
      <div className="flex-1 relative">
        {activeView === 'model' ? (
          <>
            <Viewer3D
              url={model.downloadURL}
              format={model.format}
              resetKey={resetKey}
              onPointClick={creatingDimension ? handleModelClick : undefined}
              pendingPoints={pendingPoints}
              measurementType={measurementType}
              onClosePolygon={handleClosePolygon}
              paintMode={paintMode}
              paintColor={paintColor}
              paintErase={paintErase}
              materialOverrides={materialOverrides}
              onMeshPainted={handleMeshPainted}
              annotations={showAnnotations ? annotations : undefined}
              onPhotoClick={(photos, idx) => {
                setLightboxPhotos(photos)
                setLightboxIndex(idx)
              }}
              focusPoint={focusPoint}
            >
              {showDimensions && <DimensionsTool dimensions={dimensions} pendingPoints={pendingPoints} measurementType={measurementType} />}
            </Viewer3D>

            {paintMode && (
              <ColorPalette
                selectedColor={paintColor}
                onSelectColor={(c) => { setPaintColor(c); setPaintErase(false) }}
                onClearMode={togglePaintMode}
                onResetAll={handleResetAllPaint}
                isEraseMode={paintErase}
                onToggleErase={() => { setPaintErase(!paintErase); setPaintColor(null) }}
                paintedCount={materialOverrides.length}
              />
            )}
          </>
        ) : interactiveExperience?.id === 'tobogan' ? (
          <ToboganInteractiveExperience modelName={model.name} className="h-full" />
        ) : interactiveExperience?.id === 'sopladorasBaader142' ? (
          <SopladorasBaader142InteractiveExperience
            modelId={model.id}
            modelName={model.name}
            modelUrl={model.downloadURL}
            modelFormat={model.format}
            canEditMappings={false}
            className="h-full"
          />
        ) : null}
      </div>

      {/* Panel de cotas + anotaciones (colapsable en la parte inferior) */}
      {activeView === 'model' && ((showDimensions && dimensions.length > 0) || annotations.length > 0) && (
        <div className="border-t bg-card shrink-0 max-h-40 overflow-y-auto">
          <div className="px-3 py-1.5">
            {/* Cotas */}
            {showDimensions && dimensions.length > 0 && (
              <>
                <h3 className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Ruler className="h-3 w-3" />
                  Mediciones ({dimensions.length})
                </h3>
                <div className="space-y-0.5 mb-2">
                  {dimensions.map((dim) => {
                    const typeIcon = dim.type === 'area' ? '📐' : dim.type === 'circumference' ? '⭕' : dim.type === 'volume' ? '📦' : '📏'
                    const suffix = getUnitSuffix(dim.unit, dim.type)
                    const center = dim.points.reduce(
                      (acc, p) => ({ x: acc.x + p.x / dim.points.length, y: acc.y + p.y / dim.points.length, z: acc.z + p.z / dim.points.length }),
                      { x: 0, y: 0, z: 0 }
                    )
                    return (
                      <div
                        key={dim.id}
                        className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-muted/50 text-xs cursor-pointer transition-colors"
                        onClick={() => setFocusPoint({ ...center })}
                        title="Clic para enfocar"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px]">{typeIcon}</span>
                          <span className="font-mono font-medium text-[11px]">
                            {dim.type === 'circumference' && dim.diameter
                              ? `⌀${dim.diameter.toFixed(1)} ${suffix}`
                              : formatMeasurement(dim.value, dim.unit, dim.type)}
                          </span>
                          {dim.label && (
                            <span className="text-muted-foreground text-[10px]">{dim.label}</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeleteDimension(dim.id) }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Anotaciones */}
            {annotations.length > 0 && (
              <>
                {showDimensions && dimensions.length > 0 && (
                  <div className="border-t my-1" />
                )}
                <h3 className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Anotaciones ({annotations.length})
                </h3>
                <AnnotationListItems annotations={annotations} onFocus={setFocusPoint} compact />
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer branding mínimo */}
      <div className="px-3 py-1 border-t bg-card text-center shrink-0">
        <p className="text-[10px] text-muted-foreground">
          Mantenimiento Industrial — Visor 3D
        </p>
      </div>

      {/* Image Lightbox (zoom + pan viewer) */}
      {lightboxPhotos && (
        <ImageLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxPhotos(null)}
        />
      )}
    </div>
  )
}
