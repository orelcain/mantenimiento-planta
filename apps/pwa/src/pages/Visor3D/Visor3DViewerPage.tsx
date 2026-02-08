/**
 * Visor3DViewerPage - Página de visualización de un modelo 3D
 *
 * Features:
 * - Carga y visualiza el modelo 3D con Three.js
 * - Orbit/zoom/pan controls
 * - Fullscreen
 * - Copiar link / mostrar QR
 * - Ver/crear cotas (admin)
 * - Modo pintura: colorear piezas con colores mate (admin)
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Copy,
  QrCode,
  Maximize,
  Minimize,
  RotateCcw,
  Ruler,
  Trash2,
  Check,
  AlertCircle,
  Box,
  Loader2,
  X,
  Paintbrush,
  MapPin,
  Camera,
  ImageIcon,
  Loader2 as Loader2Icon,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Button,
  Card,
  CardContent,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useIsAdmin, useAuthStore } from '@/store'
import { getModel3DById } from '@/services/models3d'
import { subscribeToDimensions, createDimension, deleteDimension, calculateDistance, convertUnit, calculatePolygonArea, calculateCircleFrom3Points, calculateOrientedBoxVolume, convertAreaUnit, convertVolumeUnit, getRequiredPoints, formatMeasurement } from '@/services/dimensions'
import { subscribeToMaterialOverrides, setMaterialOverride, deleteMaterialOverride, deleteAllMaterialOverrides } from '@/services/materials3d'
import { subscribeToAnnotations, createAnnotation, updateAnnotation, deleteAnnotation, uploadAnnotationPhotos } from '@/services/annotations3d'
import { Viewer3D } from '@/components/visor3d/Viewer3D'
import { DimensionsTool } from '@/components/visor3d/DimensionsTool'
import { ColorPalette } from '@/components/visor3d/ColorPalette'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { Model3D, MaterialOverride, Annotation3D, AnnotationStatus, AnnotationPriority } from '@/types/models3d'
import type { Dimension3D, DimensionUnit, Point3D, MeasurementType } from '@/types/models3d'
import { getUnitSuffix } from '@/types/models3d'

export function Visor3DViewerPage() {
  const { modelId } = useParams<{ modelId: string }>()
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const user = useAuthStore((s) => s.user)

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

  // Annotation state
  const [annotations, setAnnotations] = useState<Annotation3D[]>([])
  const [annotationMode, setAnnotationMode] = useState(false)
  const [showAnnotationDialog, setShowAnnotationDialog] = useState(false)
  const [newAnnotationPos, setNewAnnotationPos] = useState<Point3D | null>(null)
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation3D | null>(null)
  
  // Annotation form
  const [annTitle, setAnnTitle] = useState('')
  const [annDesc, setAnnDesc] = useState('')
  const [annPriority, setAnnPriority] = useState<AnnotationPriority>('medium')
  const [annStatus, setAnnStatus] = useState<AnnotationStatus>('open')
  const [annPhotos, setAnnPhotos] = useState<{ file: File; preview: string }[]>([])
  const [annExistingPhotos, setAnnExistingPhotos] = useState<string[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Lightbox state (photo viewer with zoom/pan)
  const [lightboxPhotos, setLightboxPhotos] = useState<string[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Focus camera on point
  const [focusPoint, setFocusPoint] = useState<import('@/types/models3d').Point3D | null>(null)

  // Viewer reset trigger
  const [resetKey, setResetKey] = useState(0)

  // Cargar modelo
  useEffect(() => {
    if (!modelId) return
    setLoading(true)
    setError(null)
    getModel3DById(modelId)
      .then((m) => {
        if (!m) {
          setError('Modelo no encontrado')
        } else {
          setModel(m)
        }
      })
      .catch((err) => setError(`Error cargando modelo: ${(err as Error).message}`))
      .finally(() => setLoading(false))
  }, [modelId])

  // Suscribirse a cotas
  useEffect(() => {
    if (!modelId) return
    const unsub = subscribeToDimensions(modelId, (dims) => {
      setDimensions(dims)
    })
    return () => unsub()
  }, [modelId])

  // Suscribirse a material overrides
  useEffect(() => {
    if (!modelId) return
    const unsub = subscribeToMaterialOverrides(modelId, (overrides) => {
      setMaterialOverrides(overrides)
    })
    return () => unsub()
  }, [modelId])

  // Suscribirse a anotaciones
  useEffect(() => {
    if (!modelId) return
    const unsub = subscribeToAnnotations(modelId, (anns) => {
      setAnnotations(anns)
    })
    return () => unsub()
  }, [modelId])


  // Init creation of annotation
  const handleAddAnnotationPoint = useCallback((point: Point3D) => {
    setNewAnnotationPos(point)
    setAnnTitle('')
    setAnnDesc('')
    setAnnPriority('medium')
    setAnnPhotos([])
    setAnnExistingPhotos([])
    setSelectedAnnotation(null) // New creation
    setShowAnnotationDialog(true)
  }, [])

  // Click on existing annotation
  const handleAnnotationClick = useCallback((annotation: Annotation3D) => {
    setSelectedAnnotation(annotation)
    setAnnTitle(annotation.title)
    setAnnDesc(annotation.description || '')
    setAnnPriority(annotation.priority)
    setAnnStatus(annotation.status)
    setAnnPhotos([])
    setAnnExistingPhotos(annotation.photos || [])
    setShowAnnotationDialog(true)
  }, [])

  // Submit annotation (Create or Update)
  const handleSubmitAnnotation = async () => {
    if (!modelId || !annTitle) return
    
    try {
      setUploadingPhotos(true)
      
      if (selectedAnnotation) {
        // Upload new photos if any
        let photoUrls = [...annExistingPhotos]
        if (annPhotos.length > 0) {
          const newUrls = await uploadAnnotationPhotos(
            modelId, 
            selectedAnnotation.id, 
            annPhotos.map(p => p.file)
          )
          photoUrls = [...photoUrls, ...newUrls]
        }
        // Update
        await updateAnnotation(modelId, selectedAnnotation.id, {
          title: annTitle,
          description: annDesc,
          priority: annPriority,
          status: annStatus,
          photos: photoUrls,
        })
      } else if (newAnnotationPos) {
        // Create annotation first
        const annId = await createAnnotation(modelId, {
          position: newAnnotationPos,
          title: annTitle,
          description: annDesc,
          priority: annPriority,
          status: 'open',
          photos: [],
          createdBy: user?.id || 'anonymous'
        })
        // Then upload photos if any
        if (annPhotos.length > 0) {
          const urls = await uploadAnnotationPhotos(
            modelId, 
            annId, 
            annPhotos.map(p => p.file)
          )
          await updateAnnotation(modelId, annId, { photos: urls })
        }
      }
      setShowAnnotationDialog(false)
      setAnnotationMode(false)
      setAnnPhotos([])
      setAnnExistingPhotos([])
    } catch (err) {
      console.error(err)
    } finally {
      setUploadingPhotos(false)
    }
  }

  // Delete annotation
  const handleDeleteAnnotation = async () => {
    if (!modelId || !selectedAnnotation) return
    if (confirm('¿Eliminar esta anotación?')) {
      await deleteAnnotation(modelId, selectedAnnotation.id)
      setShowAnnotationDialog(false)
    }
  }

  // QR URL: ruta pública aislada
  const modelUrl = `${window.location.origin}/mantenimiento-planta/v/${modelId}`

  // Copiar link
  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(modelUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [modelUrl])

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
      if (!creatingDimension || !modelId || !user) return

      const newPoints = [...pendingPoints, point]
      const required = getRequiredPoints(measurementType)

      // For area: accumulate, don't auto-close
      if (required === 'multi') {
        setPendingPoints(newPoints)
        return
      }

      // Not enough points yet
      if (newPoints.length < required) {
        setPendingPoints(newPoints)
        return
      }

      // Create the dimension
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
          createdBy: user.id,
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
          createdBy: user.id,
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
          createdBy: user.id,
        })
      }

      setPendingPoints([])
      setCreatingDimension(false)
    },
    [creatingDimension, pendingPoints, modelId, user, selectedUnit, measurementType]
  )

  // Close area polygon manually
  const handleClosePolygon = useCallback(async () => {
    if (!modelId || !user || pendingPoints.length < 3) return
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
      createdBy: user.id,
    })
    setPendingPoints([])
    setCreatingDimension(false)
  }, [modelId, user, pendingPoints, selectedUnit])

  // Handle paint mesh
  const handleMeshPainted = useCallback(
    async (meshId: string, color: string | null) => {
      if (!modelId || !user) return
      if (color) {
        await setMaterialOverride(modelId, {
          meshId,
          color,
          opacity: 1,
          createdBy: user.id,
        })
      } else {
        // Borrar override
        const overrideId = meshId.replace(/[/#[\]]/g, '_').replace(/\./g, '_')
        await deleteMaterialOverride(modelId, overrideId).catch(() => {})
      }
    },
    [modelId, user]
  )

  // Reset all paint
  const handleResetAllPaint = useCallback(async () => {
    if (!modelId) return
    await deleteAllMaterialOverrides(modelId)
    // Force reload model by incrementing resetKey
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

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando modelo...</p>
        </div>
      </div>
    )
  }

  // Error
  if (error || !model) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-medium">Error</h2>
            <p className="text-sm text-muted-foreground text-center">
              {error || 'Modelo no encontrado'}
            </p>
            <Button variant="outline" onClick={() => navigate('/visor-3d')} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver al listado
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/visor-3d">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">{model.name}</h1>
              <Badge variant="outline" className="text-xs uppercase">
                {model.format}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground ml-7">
              {model.originalFileName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Dimension controls */}
          <Button
            variant={showDimensions ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setShowDimensions(!showDimensions)}
          >
            <Ruler className="h-4 w-4" />
            Cotas ({dimensions.length})
          </Button>

          {isAdmin && !paintMode && (
            <Button
              variant={creatingDimension ? 'destructive' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setCreatingDimension(!creatingDimension)
                setPendingPoints([])
              }}
            >
              {creatingDimension ? (
                <>
                  <X className="h-4 w-4" />
                  Cancelar
                </>
              ) : (
                <>
                  <Ruler className="h-4 w-4" />
                  Nueva cota
                </>
              )}
            </Button>
          )}

          {/* Annotation mode toggle */}
          {!creatingDimension && !paintMode && (
            <Button
              variant={annotationMode ? 'destructive' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setAnnotationMode(!annotationMode)}
            >
              {annotationMode ? (
                <>
                  <X className="h-4 w-4" />
                  Cancelar
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4" />
                  Anotar
                </>
              )}
            </Button>
          )}

          {/* Paint mode toggle (admin) */}
          {isAdmin && !creatingDimension && (
            <Button
              variant={paintMode ? 'destructive' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={togglePaintMode}
            >
              {paintMode ? (
                <>
                  <X className="h-4 w-4" />
                  Cerrar pintura
                </>
              ) : (
                <>
                  <Paintbrush className="h-4 w-4" />
                  Pintar
                </>
              )}
            </Button>
          )}

          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyLink}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado' : 'Link'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setQrOpen(true)}>
            <QrCode className="h-4 w-4" />
            QR
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setResetKey((k) => k + 1)}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Dimension creation mode indicator */}
      {creatingDimension && (
        <div className="flex flex-col gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          {/* Measurement type selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {([
              { type: 'distance' as MeasurementType, label: '📏 Distancia' },
              { type: 'area' as MeasurementType, label: '📐 Área' },
              { type: 'circumference' as MeasurementType, label: '⭕ Circunferencia' },
              { type: 'volume' as MeasurementType, label: '📦 Volumen' },
            ]).map(({ type, label }) => (
              <button
                key={type}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
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
          <div className="flex items-center gap-3">
            <Ruler className="h-5 w-5 text-blue-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-400">
                {measurementType === 'distance' && (pendingPoints.length === 0 ? 'Clic en el 1er punto' : 'Clic en el 2do punto')}
                {measurementType === 'area' && (pendingPoints.length < 3 ? `Clic punto ${pendingPoints.length + 1} (mín. 3)` : `${pendingPoints.length} puntos — clic más o cerrar polígono`)}
                {measurementType === 'circumference' && `Clic punto ${pendingPoints.length + 1} de 3`}
                {measurementType === 'volume' && `Clic punto ${pendingPoints.length + 1} de 4 — ${['esquina origen', 'fin arista largo', 'fin arista ancho', 'fin arista alto'][pendingPoints.length] ?? ''}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Snap: <span className="text-green-400">●</span> vértice &nbsp;
                <span className="text-blue-400">●</span> arista &nbsp;
                <span className="text-gray-400">●</span> superficie
                &nbsp;— Unidad:&nbsp;
                {(['mm', 'cm', 'm'] as DimensionUnit[]).map((u, i) => (
                  <span key={u}>
                    {i > 0 && ' | '}
                    <button
                      className={`underline ${selectedUnit === u ? 'text-blue-400 font-bold' : ''}`}
                      onClick={() => setSelectedUnit(u)}
                    >{u}</button>
                  </span>
                ))}
              </p>
            </div>
            {pendingPoints.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPendingPoints(pendingPoints.slice(0, -1))}>
                Deshacer punto
              </Button>
            )}
            {measurementType === 'area' && pendingPoints.length >= 3 && (
              <Button
                variant="default"
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={handleClosePolygon}
              >
                Cerrar polígono
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Annotation mode indicator */}
      {annotationMode && (
        <div className="flex flex-col gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-500">
                Haz clic sobre el modelo para colocar una anotación
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3D Viewer */}
      <div
        className={`relative rounded-lg overflow-hidden border bg-card ${
          isFullscreen ? 'h-screen' : 'h-[60vh] min-h-[400px]'
        }`}
      >
        <Viewer3D
          url={model.downloadURL}
          format={model.format}
          resetKey={resetKey}
          onPointClick={handleModelClick}
          pendingPoints={pendingPoints}
          measurementType={measurementType}
          onClosePolygon={handleClosePolygon}
          paintMode={paintMode}
          paintColor={paintColor}
          paintErase={paintErase}
          materialOverrides={materialOverrides}
          onMeshPainted={handleMeshPainted}
          annotations={annotations}
          annotationMode={annotationMode}
          onAnnotationClick={handleAnnotationClick}
          onPhotoClick={(photos, idx) => {
            setLightboxPhotos(photos)
            setLightboxIndex(idx)
          }}
          focusPoint={focusPoint}
          onAddAnnotation={handleAddAnnotationPoint}
        >
          {showDimensions && (
            <DimensionsTool dimensions={dimensions} pendingPoints={pendingPoints} measurementType={measurementType} />
          )}
        </Viewer3D>

        {/* Annotation Creation/Edit Dialog */}
        <Dialog open={showAnnotationDialog} onOpenChange={setShowAnnotationDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedAnnotation ? 'Editar Anotación' : 'Nueva Anotación'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título</label>
                <input 
                  className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={annTitle} 
                  onChange={e => setAnnTitle(e.target.value)} 
                  placeholder="Ej. Revisar corrosión"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descripción</label>
                <textarea 
                  className="w-full flex min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={annDesc} 
                  onChange={e => setAnnDesc(e.target.value)} 
                  placeholder="Detalles adicionales..."
                />
              </div>
              <div className="flex gap-4">
                <div className="space-y-2 flex-1">
                  <label className="text-sm font-medium">Prioridad</label>
                  <Select value={annPriority} onValueChange={(v: AnnotationPriority) => setAnnPriority(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baja (Azul)</SelectItem>
                      <SelectItem value="medium">Media (Ámbar)</SelectItem>
                      <SelectItem value="high">Alta (Rojo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selectedAnnotation && (
                  <div className="space-y-2 flex-1">
                    <label className="text-sm font-medium">Estado</label>
                    <Select value={annStatus} onValueChange={(v: AnnotationStatus) => setAnnStatus(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Abierta</SelectItem>
                        <SelectItem value="resolved">Resuelta (Verde)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Photos section */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Fotos ({annExistingPhotos.length + annPhotos.length}/5)
                </label>
                
                {/* Existing photos (from Firestore) */}
                {(annExistingPhotos.length > 0 || annPhotos.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {annExistingPhotos.map((url, i) => (
                      <div key={`existing-${i}`} className="relative group">
                        <img 
                          src={url} 
                          alt={`Foto ${i + 1}`}
                          className="w-16 h-16 object-cover rounded-lg border border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                          onClick={() => {
                            setLightboxPhotos([...annExistingPhotos, ...annPhotos.map(p => p.preview)])
                            setLightboxIndex(i)
                          }}
                        />
                        <button
                          type="button"
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setAnnExistingPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {annPhotos.map((photo, i) => (
                      <div key={`new-${i}`} className="relative group">
                        <img 
                          src={photo.preview} 
                          alt={`Nueva ${i + 1}`}
                          className="w-16 h-16 object-cover rounded-lg border-2 border-blue-500/50 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                          onClick={() => {
                            setLightboxPhotos([...annExistingPhotos, ...annPhotos.map(p => p.preview)])
                            setLightboxIndex(annExistingPhotos.length + i)
                          }}
                        />
                        <button
                          type="button"
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setAnnPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-blue-500/80 text-white text-[8px] text-center rounded-b-lg">
                          Nueva
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add photo buttons */}
                {(annExistingPhotos.length + annPhotos.length) < 5 && (
                  <div className="flex gap-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || [])
                        if (files.length === 0) return
                        const remaining = 5 - annExistingPhotos.length - annPhotos.length
                        const toProcess = files.slice(0, remaining)
                        const newPhotos: { file: File; preview: string }[] = []
                        for (const file of toProcess) {
                          if (!file.type.startsWith('image/')) continue
                          const preview = await new Promise<string>((resolve) => {
                            const reader = new FileReader()
                            reader.onloadend = () => resolve(reader.result as string)
                            reader.readAsDataURL(file)
                          })
                          newPhotos.push({ file, preview })
                        }
                        setAnnPhotos(prev => [...prev, ...newPhotos])
                        if (photoInputRef.current) photoInputRef.current.value = ''
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 flex-1"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <ImageIcon className="h-4 w-4" />
                      Galería
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 flex-1"
                      onClick={() => {
                        // Create camera-only input
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.setAttribute('capture', 'environment')
                        input.onchange = async () => {
                          const file = input.files?.[0]
                          if (!file) return
                          const preview = await new Promise<string>((resolve) => {
                            const reader = new FileReader()
                            reader.onloadend = () => resolve(reader.result as string)
                            reader.readAsDataURL(file)
                          })
                          setAnnPhotos(prev => [...prev, { file, preview }])
                        }
                        input.click()
                      }}
                    >
                      <Camera className="h-4 w-4" />
                      Cámara
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Las fotos se optimizan automáticamente a WebP de alta calidad.
                </p>
              </div>
            </div>
            <div className="flex justify-between items-center mt-4">
              {selectedAnnotation ? (
                <Button variant="destructive" size="sm" onClick={handleDeleteAnnotation}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              ) : (
                <div />
              )}
              <Button onClick={handleSubmitAnnotation} disabled={!annTitle || uploadingPhotos}>
                {uploadingPhotos ? (
                  <>
                    <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                    Subiendo fotos...
                  </>
                ) : (
                  selectedAnnotation ? 'Guardar Cambios' : 'Crear Anotación'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Color palette overlay (inside viewer container) */}
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

      {/* Dimensions & Annotations panel */}
      {(showDimensions && dimensions.length > 0) || annotations.length > 0 ? (
        <Card>
          <CardContent className="py-3 max-h-48 overflow-y-auto">
            {/* Cotas section */}
            {showDimensions && dimensions.length > 0 && (
              <>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Ruler className="h-4 w-4" />
                  Mediciones ({dimensions.length})
                </h3>
                <div className="space-y-1 mb-3">
                  {dimensions.map((dim) => {
                    const typeIcon = dim.type === 'area' ? '📐' : dim.type === 'circumference' ? '⭕' : dim.type === 'volume' ? '📦' : '📏'
                    const suffix = getUnitSuffix(dim.unit, dim.type)
                    // Calculate center of all points for focus
                    const center = dim.points.reduce(
                      (acc, p) => ({ x: acc.x + p.x / dim.points.length, y: acc.y + p.y / dim.points.length, z: acc.z + p.z / dim.points.length }),
                      { x: 0, y: 0, z: 0 }
                    )
                    return (
                      <div
                        key={dim.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-xs cursor-pointer transition-colors"
                        onClick={() => setFocusPoint({ ...center })}
                        title="Clic para enfocar"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm">{typeIcon}</span>
                          <span className="font-mono font-medium">
                            {dim.type === 'circumference' && dim.diameter
                              ? `⌀${dim.diameter.toFixed(1)} ${suffix}`
                              : formatMeasurement(dim.value, dim.unit, dim.type)}
                          </span>
                          {dim.label && (
                            <span className="text-muted-foreground">{dim.label}</span>
                          )}
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDeleteDimension(dim.id) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Anotaciones section */}
            {annotations.length > 0 && (
              <>
                {showDimensions && dimensions.length > 0 && (
                  <div className="border-t my-2" />
                )}
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Anotaciones ({annotations.length})
                </h3>
                <div className="space-y-1">
                  {annotations.map((ann) => {
                    const priorityColors: Record<string, string> = {
                      high: 'text-red-500',
                      medium: 'text-amber-500',
                      low: 'text-blue-500',
                    }
                    const priorityLabels: Record<string, string> = {
                      high: 'Alta',
                      medium: 'Media',
                      low: 'Baja',
                    }
                    return (
                      <div
                        key={ann.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-xs cursor-pointer transition-colors"
                        onClick={() => setFocusPoint({ ...ann.position })}
                        title="Clic para enfocar"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-bold ${priorityColors[ann.priority] ?? 'text-amber-500'}`}>
                            #{ann.number}
                          </span>
                          <span className="truncate max-w-[140px] font-medium">{ann.title}</span>
                          {ann.status === 'resolved' && (
                            <span className="text-emerald-500 text-[10px]">✓</span>
                          )}
                          {(ann.photos?.length ?? 0) > 0 && (
                            <span className="text-muted-foreground text-[10px]">📷{ann.photos!.length}</span>
                          )}
                        </div>
                        <span className={`text-[10px] ${priorityColors[ann.priority] ?? 'text-amber-500'}`}>
                          {ann.status === 'resolved' ? 'Resuelta' : (priorityLabels[ann.priority] ?? 'Media')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* QR Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{model.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG value={modelUrl} size={200} level="M" includeMargin />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all px-4">
              {modelUrl}
            </p>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiado' : 'Copiar link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
