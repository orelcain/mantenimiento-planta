import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Trash2,
  Save,
  X,
  Pencil,
  MousePointer,
  ZoomIn,
  ZoomOut,
  Maximize,
  Upload,
  Undo2,
  Check,
  Layers,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import { getZones, createZone, deleteZone } from '@/services/zones'
import { uploadMapImage, getMapImages } from '@/services/storage'
import type { Zone, ZoneType, MapPoint } from '@/types'
import { cn } from '@/lib/utils'
import { getAssetUrl, isFirebaseStorageUrl } from '@/lib/config'

// Tipos de zona con información visual
const ZONE_TYPES: { value: ZoneType; label: string; color: string; icon: string }[] = [
  { value: 'produccion', label: 'Producción', color: '#2196f3', icon: '🏭' },
  { value: 'almacen', label: 'Almacén', color: '#4caf50', icon: '📦' },
  { value: 'oficinas', label: 'Oficinas', color: '#9c27b0', icon: '🏢' },
  { value: 'mantenimiento', label: 'Mantenimiento', color: '#ff9800', icon: '🔧' },
  { value: 'carga_descarga', label: 'Carga/Descarga', color: '#795548', icon: '🚚' },
  { value: 'servicios', label: 'Servicios', color: '#00bcd4', icon: '🚿' },
  { value: 'seguridad', label: 'Seguridad', color: '#f44336', icon: '🛡️' },
  { value: 'otro', label: 'Otro', color: '#607d8b', icon: '📍' },
]

// Colores adicionales
const EXTRA_COLORS = [
  '#e91e63', '#673ab7', '#3f51b5', '#009688', 
  '#8bc34a', '#cddc39', '#ffc107', '#ff5722'
]

type Tool = 'select' | 'draw' | 'edit'

interface DrawingState {
  points: MapPoint[]
  isComplete: boolean
}

export function PolygonZoneEditor() {
  const { user } = useAuthStore()
  const { zones, setZones, mapImage, setMapImage } = useAppStore()
  
  // Estado del editor
  const [tool, setTool] = useState<Tool>('select')
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // Estado de dibujo de polígono
  const [drawing, setDrawing] = useState<DrawingState | null>(null)
  const [hoveringFirstPoint, setHoveringFirstPoint] = useState(false)
  
  // Zona seleccionada para editar
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  
  // Estado del formulario
  const [showZoneDialog, setShowZoneDialog] = useState(false)
  const [zoneForm, setZoneForm] = useState({
    nombre: '',
    codigo: '',
    tipo: 'produccion' as ZoneType,
    descripcion: '',
    color: '#2196f3',
  })
  
  // Imagen del plano
  const [imageLoaded, setImageLoaded] = useState(false)
  const [availableMaps, setAvailableMaps] = useState<string[]>([])
  const [showMapSelector, setShowMapSelector] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isAdmin = user?.rol === 'admin'
  
  // Dimensiones del canvas
  const CANVAS_WIDTH = 1400
  const CANVAS_HEIGHT = 800

  // Cargar zonas y mapas
  useEffect(() => {
    getZones().then(setZones)
    loadAvailableMaps()
  }, [setZones])

  // Cargar mapas disponibles
  const loadAvailableMaps = async () => {
    try {
      const maps = await getMapImages()
      setAvailableMaps(maps)
      // Si no hay mapa seleccionado, usar el primero disponible
      if (!mapImage && maps.length > 0) {
        setMapImage(maps[0]!)
      }
    } catch (error) {
      console.error('Error cargando mapas:', error)
    }
  }

  // Cargar imagen del mapa
  useEffect(() => {
    if (!mapImage) {
      setImageLoaded(false)
      return
    }
    
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageRef.current = img
      setImageLoaded(true)
    }
    img.onerror = () => {
      console.error('Error cargando imagen del mapa')
      setImageLoaded(false)
    }
    img.src = mapImage
  }, [mapImage])

  // Calcular bounds de un polígono
  const calculateBounds = (points: MapPoint[]) => {
    if (points.length === 0) return undefined
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    points.forEach(p => {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    })
    return { minX, minY, maxX, maxY }
  }

  // Verificar si un punto está dentro de un polígono (ray casting)
  const isPointInPolygon = (point: MapPoint, polygon: MapPoint[]): boolean => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i]!
      const pj = polygon[j]!
      
      if (((pi.y > point.y) !== (pj.y > point.y)) &&
          (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x)) {
        inside = !inside
      }
    }
    return inside
  }

  // Dibujar canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Fondo
    if (imageRef.current && imageLoaded) {
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height)
    } else {
      // Grid de fondo si no hay imagen
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      ctx.strokeStyle = '#2a2a4e'
      ctx.lineWidth = 1
      const gridSize = 50
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }
      
      // Mensaje
      ctx.fillStyle = '#666'
      ctx.font = '18px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Sube una imagen del plano para comenzar', canvas.width / 2, canvas.height / 2)
    }

    // Dibujar zonas existentes
    zones.forEach((zone) => {
      if (!zone.polygon || zone.polygon.length < 3) return
      
      const isSelected = selectedZone?.id === zone.id
      const color = zone.color || '#2196f3'
      
      // Convertir puntos normalizados a píxeles
      const pixelPoints = zone.polygon.map(p => ({
        x: p.x * canvas.width,
        y: p.y * canvas.height
      }))

      // Dibujar polígono relleno
      ctx.beginPath()
      ctx.moveTo(pixelPoints[0]!.x, pixelPoints[0]!.y)
      pixelPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      
      ctx.fillStyle = isSelected ? `${color}55` : `${color}33`
      ctx.fill()
      
      // Borde
      ctx.strokeStyle = color
      ctx.lineWidth = isSelected ? 3 : 2
      ctx.stroke()

      // Calcular centro del polígono
      const centerX = pixelPoints.reduce((sum, p) => sum + p.x, 0) / pixelPoints.length
      const centerY = pixelPoints.reduce((sum, p) => sum + p.y, 0) / pixelPoints.length

      // Etiqueta
      const zoneType = ZONE_TYPES.find(t => t.value === zone.tipo)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = 4
      ctx.fillText(`${zoneType?.icon || '📍'} ${zone.codigo}`, centerX, centerY - 8)
      ctx.font = '12px Inter, sans-serif'
      ctx.fillText(zone.nombre, centerX, centerY + 10)
      ctx.shadowBlur = 0

      // Dibujar vértices si está seleccionada
      if (isSelected) {
        pixelPoints.forEach((p) => {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.stroke()
        })
      }
    })

    // Dibujar polígono en construcción
    if (drawing && drawing.points.length > 0) {
      const pixelPoints = drawing.points.map(p => ({
        x: p.x * canvas.width,
        y: p.y * canvas.height
      }))

      // Líneas conectando puntos
      ctx.beginPath()
      ctx.moveTo(pixelPoints[0]!.x, pixelPoints[0]!.y)
      pixelPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      
      ctx.strokeStyle = zoneForm.color
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.stroke()
      ctx.setLineDash([])

      // Dibujar puntos
      pixelPoints.forEach((p, i) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, i === 0 ? 10 : 6, 0, Math.PI * 2)
        
        if (i === 0 && hoveringFirstPoint && pixelPoints.length >= 3) {
          // Punto inicial resaltado cuando se puede cerrar
          ctx.fillStyle = '#4caf50'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 3
        } else {
          ctx.fillStyle = i === 0 ? zoneForm.color : '#fff'
          ctx.strokeStyle = zoneForm.color
          ctx.lineWidth = 2
        }
        
        ctx.fill()
        ctx.stroke()
        
        // Número del punto
        ctx.fillStyle = i === 0 ? '#fff' : zoneForm.color
        ctx.font = 'bold 10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${i + 1}`, p.x, p.y)
      })

      // Instrucción
      if (pixelPoints.length >= 3) {
        ctx.fillStyle = '#4caf50'
        ctx.font = '14px Inter, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('✓ Click en punto 1 para cerrar el polígono', 20, canvas.height - 20)
      }
    }
  }, [zones, drawing, hoveringFirstPoint, imageLoaded, selectedZone, zoneForm.color])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  // Obtener coordenadas normalizadas del mouse
  const getCanvasCoords = (e: React.MouseEvent): MapPoint => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    return {
      x: ((e.clientX - rect.left) * scaleX) / canvas.width,
      y: ((e.clientY - rect.top) * scaleY) / canvas.height,
    }
  }

  // Distancia entre dos puntos
  const distance = (p1: MapPoint, p2: MapPoint, canvas: HTMLCanvasElement) => {
    const dx = (p1.x - p2.x) * canvas.width
    const dy = (p1.y - p2.y) * canvas.height
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Handlers del canvas
  const handleCanvasClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const coords = getCanvasCoords(e)

    if (tool === 'draw' && isAdmin) {
      if (!drawing) {
        // Iniciar nuevo polígono
        setDrawing({ points: [coords], isComplete: false })
      } else if (!drawing.isComplete) {
        const firstPoint = drawing.points[0]!
        const dist = distance(coords, firstPoint, canvas)
        
        // Si está cerca del primer punto y hay al menos 3 puntos, cerrar polígono
        if (drawing.points.length >= 3 && dist < 20) {
          setDrawing({ ...drawing, isComplete: true })
          setShowZoneDialog(true)
        } else {
          // Agregar nuevo punto
          setDrawing({
            ...drawing,
            points: [...drawing.points, coords]
          })
        }
      }
    } else if (tool === 'select') {
      // Buscar zona clickeada
      const clickedZone = zones.find(zone => 
        zone.polygon && zone.polygon.length >= 3 && isPointInPolygon(coords, zone.polygon)
      )
      setSelectedZone(clickedZone || null)
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    if (tool === 'draw' && drawing && !drawing.isComplete && drawing.points.length >= 3) {
      const coords = getCanvasCoords(e)
      const firstPoint = drawing.points[0]!
      const dist = distance(coords, firstPoint, canvas)
      setHoveringFirstPoint(dist < 20)
    }
    
    if (isDragging && tool === 'select') {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (tool === 'select' && e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleCanvasMouseUp = () => {
    setIsDragging(false)
  }

  // Deshacer último punto
  const handleUndo = () => {
    if (drawing && drawing.points.length > 1) {
      setDrawing({
        ...drawing,
        points: drawing.points.slice(0, -1)
      })
    } else if (drawing && drawing.points.length === 1) {
      setDrawing(null)
    }
  }

  // Cancelar dibujo
  const handleCancelDraw = () => {
    setDrawing(null)
    setShowZoneDialog(false)
    setHoveringFirstPoint(false)
    resetForm()
  }

  // Reset form
  const resetForm = () => {
    setZoneForm({
      nombre: '',
      codigo: '',
      tipo: 'produccion',
      descripcion: '',
      color: '#2196f3',
    })
  }

  // Guardar zona
  const handleSaveZone = async () => {
    if (!drawing || !drawing.isComplete || drawing.points.length < 3) return

    const bounds = calculateBounds(drawing.points)
    
    // Generar código si no se proporcionó
    const codigo = zoneForm.codigo || `Z${zones.length + 1}`

    const newZone = {
      id: `zone_${Date.now()}`,
      nombre: zoneForm.nombre || `Zona ${codigo}`,
      codigo,
      tipo: zoneForm.tipo,
      descripcion: zoneForm.descripcion,
      polygon: drawing.points,
      bounds,
      color: zoneForm.color,
      parentId: null,
      nivel: 1 as const,
      activa: true,
    }

    try {
      await createZone(newZone)
      await getZones().then(setZones)
      
      handleCancelDraw()
      setTool('select')
    } catch (error) {
      console.error('Error creando zona:', error)
      alert('Error al guardar la zona')
    }
  }

  // Eliminar zona
  const handleDeleteZone = async (zoneId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta zona?')) return
    
    try {
      await deleteZone(zoneId)
      await getZones().then(setZones)
      setSelectedZone(null)
    } catch (error) {
      console.error('Error eliminando zona:', error)
    }
  }

  // Subir imagen del mapa
  const handleUploadMap = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen')
      return
    }

    // Validar tamaño (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es muy grande. Máximo 10MB')
      return
    }

    setUploading(true)
    try {
      const url = await uploadMapImage(file)
      setMapImage(url)
      await loadAvailableMaps()
    } catch (error) {
      console.error('Error subiendo mapa:', error)
      alert('Error al subir la imagen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Zoom
  const handleZoom = (delta: number) => {
    setScale((prev) => Math.max(0.3, Math.min(3, prev + delta)))
  }

  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  // Cambiar tipo de zona (actualiza color automáticamente)
  const handleTypeChange = (tipo: ZoneType) => {
    const typeInfo = ZONE_TYPES.find(t => t.value === tipo)
    setZoneForm({
      ...zoneForm,
      tipo,
      color: typeInfo?.color || zoneForm.color
    })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Herramientas */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Herramientas:</span>
              <Button
                variant={tool === 'select' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setTool('select'); handleCancelDraw(); }}
              >
                <MousePointer className="h-4 w-4 mr-1" />
                Seleccionar
              </Button>
              {isAdmin && (
                <Button
                  variant={tool === 'draw' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTool('draw')}
                  disabled={!imageLoaded}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Dibujar Zona
                </Button>
              )}
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => handleZoom(0.25)}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
              <Button variant="outline" size="icon" onClick={() => handleZoom(-0.25)}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleReset}>
                <Maximize className="h-4 w-4" />
              </Button>
            </div>

            {/* Mapa */}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadMap}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {uploading ? 'Subiendo...' : 'Subir Plano'}
                  </Button>
                </>
              )}
              {availableMaps.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMapSelector(true)}
                >
                  <Layers className="h-4 w-4 mr-1" />
                  Mapas ({availableMaps.length})
                </Button>
              )}
            </div>
          </div>

          {/* Barra de dibujo activa */}
          {tool === 'draw' && drawing && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t">
              <Badge variant="secondary">
                {drawing.points.length} puntos
              </Badge>
              <Button variant="outline" size="sm" onClick={handleUndo} disabled={drawing.points.length === 0}>
                <Undo2 className="h-4 w-4 mr-1" />
                Deshacer
              </Button>
              <Button variant="destructive" size="sm" onClick={handleCancelDraw}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              {drawing.isComplete && (
                <Button size="sm" onClick={() => setShowZoneDialog(true)}>
                  <Check className="h-4 w-4 mr-1" />
                  Completar Zona
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Canvas del mapa */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className={cn(
              'relative w-full overflow-hidden bg-muted',
              tool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
            )}
            style={{ height: '70vh', minHeight: '500px' }}
          >
            <div
              className="absolute transition-transform duration-75"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="block"
              />
            </div>

            {/* Indicador de modo */}
            {tool === 'draw' && (
              <div className="absolute top-4 left-4 bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg shadow-lg">
                <div className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  <span className="font-medium">Modo Dibujo</span>
                </div>
                <p className="text-sm mt-1 opacity-90">
                  {!drawing 
                    ? 'Click para colocar el primer punto'
                    : drawing.points.length < 3
                      ? `Click para agregar punto ${drawing.points.length + 1}`
                      : 'Click en punto 1 para cerrar o continúa agregando puntos'
                  }
                </p>
              </div>
            )}

            {/* Info zona seleccionada */}
            {selectedZone && tool === 'select' && (
              <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur p-4 rounded-lg shadow-lg border max-w-xs">
                <div className="flex items-center justify-between mb-2">
                  <Badge style={{ backgroundColor: selectedZone.color }}>
                    {selectedZone.codigo}
                  </Badge>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleDeleteZone(selectedZone.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <h4 className="font-medium">{selectedZone.nombre}</h4>
                <p className="text-sm text-muted-foreground">
                  {ZONE_TYPES.find(t => t.value === selectedZone.tipo)?.label}
                </p>
                {selectedZone.descripcion && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedZone.descripcion}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de zonas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Zonas Configuradas ({zones.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {zones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No hay zonas configuradas</p>
              {isAdmin && imageLoaded && (
                <p className="text-sm mt-1">
                  Usa "Dibujar Zona" para crear polígonos punto a punto
                </p>
              )}
              {!imageLoaded && (
                <p className="text-sm mt-1">
                  Primero sube una imagen del plano de la planta
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {zones.map((zone) => {
                const typeInfo = ZONE_TYPES.find(t => t.value === zone.tipo)
                const isSelected = selectedZone?.id === zone.id
                return (
                  <div
                    key={zone.id}
                    className={cn(
                      'p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md',
                      isSelected ? 'ring-2 ring-primary' : ''
                    )}
                    style={{ borderColor: zone.color }}
                    onClick={() => setSelectedZone(isSelected ? null : zone)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{typeInfo?.icon}</span>
                      <Badge className="text-xs" style={{ backgroundColor: zone.color }}>
                        {zone.codigo}
                      </Badge>
                    </div>
                    <h4 className="font-medium text-sm truncate">{zone.nombre}</h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {typeInfo?.label}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para configurar zona */}
      <Dialog open={showZoneDialog} onOpenChange={(open) => !open && handleCancelDraw()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Nueva Zona</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="zoneCodigo">Código</Label>
                <Input
                  id="zoneCodigo"
                  value={zoneForm.codigo}
                  onChange={(e) => setZoneForm({ ...zoneForm, codigo: e.target.value.toUpperCase() })}
                  placeholder="A, B, PROD-1..."
                  maxLength={10}
                />
              </div>
              <div>
                <Label htmlFor="zoneTipo">Tipo de Zona</Label>
                <Select value={zoneForm.tipo} onValueChange={(v) => handleTypeChange(v as ZoneType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZONE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <span className="flex items-center gap-2">
                          <span>{type.icon}</span>
                          <span>{type.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="zoneName">Nombre de la Zona</Label>
              <Input
                id="zoneName"
                value={zoneForm.nombre}
                onChange={(e) => setZoneForm({ ...zoneForm, nombre: e.target.value })}
                placeholder="Ej: Línea de producción 1"
              />
            </div>
            
            <div>
              <Label htmlFor="zoneDescription">Descripción (opcional)</Label>
              <Textarea
                id="zoneDescription"
                value={zoneForm.descripcion}
                onChange={(e) => setZoneForm({ ...zoneForm, descripcion: e.target.value })}
                placeholder="Descripción detallada de la zona..."
                rows={2}
              />
            </div>
            
            <div>
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {[...ZONE_TYPES.map(t => t.color), ...EXTRA_COLORS].map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 transition-all',
                      zoneForm.color === color ? 'scale-110 border-white ring-2 ring-primary' : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setZoneForm({ ...zoneForm, color })}
                  />
                ))}
              </div>
            </div>

            <div className="bg-muted rounded-lg p-3">
              <p className="text-sm text-muted-foreground">
                <strong>Polígono:</strong> {drawing?.points.length || 0} puntos
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDraw}>
              <X className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
            <Button onClick={handleSaveZone}>
              <Save className="h-4 w-4 mr-1" />
              Guardar Zona
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog selector de mapas */}
      <Dialog open={showMapSelector} onOpenChange={setShowMapSelector}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seleccionar Plano</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {availableMaps.map((url, i) => (
              <div
                key={url}
                className={cn(
                  'relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-all',
                  mapImage === url ? 'border-primary ring-2 ring-primary' : 'border-muted hover:border-primary/50'
                )}
                onClick={() => { setMapImage(url); setShowMapSelector(false); }}
              >
                <img src={url} alt={`Plano ${i + 1}`} className="w-full h-full object-cover" />
                {mapImage === url && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <Check className="h-8 w-8 text-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
