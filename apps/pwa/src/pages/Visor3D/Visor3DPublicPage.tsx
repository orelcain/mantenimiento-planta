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
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  Badge,
} from '@/components/ui'
import { getModel3DById } from '@/services/models3d'
import { subscribeToDimensions, createDimension, deleteDimension, calculateDistance, convertUnit } from '@/services/dimensions'
import { subscribeToMaterialOverrides, setMaterialOverride, deleteMaterialOverride, deleteAllMaterialOverrides } from '@/services/materials3d'
import { Viewer3D } from '@/components/visor3d/Viewer3D'
import { DimensionsTool } from '@/components/visor3d/DimensionsTool'
import { ColorPalette } from '@/components/visor3d/ColorPalette'
import type { Model3D, MaterialOverride, Dimension3D, DimensionUnit, Point3D } from '@/types/models3d'

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
  const [pendingPoint, setPendingPoint] = useState<Point3D | null>(null)

  // Paint state
  const [paintMode, setPaintMode] = useState(false)
  const [paintColor, setPaintColor] = useState<string | null>(null)
  const [paintErase, setPaintErase] = useState(false)
  const [materialOverrides, setMaterialOverrides] = useState<MaterialOverride[]>([])

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

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

      if (!pendingPoint) {
        setPendingPoint(point)
      } else {
        const distance = calculateDistance(pendingPoint, point)
        const length = convertUnit(distance, selectedUnit)

        await createDimension(modelId, {
          p1: pendingPoint,
          p2: point,
          length,
          unit: selectedUnit,
          createdBy: PUBLIC_USER_ID,
        })

        setPendingPoint(null)
        setCreatingDimension(false)
      }
    },
    [creatingDimension, pendingPoint, modelId, selectedUnit]
  )

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
        const overrideId = meshId.replace(/[\/\.#\[\]]/g, '_')
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
      setPendingPoint(null)
    }
  }, [paintMode])

  // Toggle dimension creation
  const toggleDimensionCreation = useCallback(() => {
    if (creatingDimension) {
      setCreatingDimension(false)
      setPendingPoint(null)
    } else {
      setCreatingDimension(true)
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
          {/* Cotas toggle */}
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

          {/* Nueva cota */}
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

          {/* Pintar */}
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

          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setResetKey((k) => k + 1)}
            title="Reset vista"
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

      {/* Dimension creation indicator */}
      {creatingDimension && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border-b border-blue-500/30 shrink-0">
          <Ruler className="h-4 w-4 text-blue-400 shrink-0" />
          <p className="text-xs font-medium text-blue-400 flex-1">
            {pendingPoint ? 'Clic en el 2do punto' : 'Clic en el 1er punto del modelo'}
          </p>
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
          {pendingPoint && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setPendingPoint(null)}>
              Deshacer
            </Button>
          )}
        </div>
      )}

      {/* 3D Viewer */}
      <div className="flex-1 relative">
        <Viewer3D
          url={model.downloadURL}
          format={model.format}
          resetKey={resetKey}
          onPointClick={creatingDimension ? handleModelClick : undefined}
          pendingPoint={pendingPoint}
          paintMode={paintMode}
          paintColor={paintColor}
          paintErase={paintErase}
          materialOverrides={materialOverrides}
          onMeshPainted={handleMeshPainted}
        >
          {showDimensions && <DimensionsTool dimensions={dimensions} />}
        </Viewer3D>

        {/* Color palette overlay */}
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
      </div>

      {/* Panel de cotas (colapsable en la parte inferior) */}
      {showDimensions && dimensions.length > 0 && (
        <div className="border-t bg-card shrink-0 max-h-32 overflow-y-auto">
          <div className="px-3 py-1.5">
            <h3 className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              Cotas ({dimensions.length})
            </h3>
            <div className="space-y-0.5">
              {dimensions.map((dim) => (
                <div
                  key={dim.id}
                  className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-muted/50 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-[11px]">
                      {dim.length.toFixed(1)} {dim.unit}
                    </span>
                    {dim.label && (
                      <span className="text-muted-foreground text-[10px]">{dim.label}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteDimension(dim.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer branding mínimo */}
      <div className="px-3 py-1 border-t bg-card text-center shrink-0">
        <p className="text-[10px] text-muted-foreground">
          Mantenimiento Industrial — Visor 3D
        </p>
      </div>
    </div>
  )
}
