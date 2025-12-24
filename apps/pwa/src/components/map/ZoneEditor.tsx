import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Trash2,
  Save,
  X,
  Square,
  MousePointer,
  ZoomIn,
  ZoomOut,
  Maximize,
  Image as ImageIcon,
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
} from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import { getMainZones, createZone, deleteZone } from '@/services/zones'
import type { Zone } from '@/types'
import { cn } from '@/lib/utils'
import { getAssetUrl } from '@/lib/config'

interface Point {
  x: number
  y: number
}

interface DrawingZone {
  points: Point[]
  color: string
  nombre: string
}

type Tool = 'select' | 'draw'

// Colores predefinidos para zonas
const ZONE_COLORS: string[] = [
  '#2196f3', // Azul
  '#4caf50', // Verde
  '#ff9800', // Naranja
  '#9c27b0', // Púrpura
  '#f44336', // Rojo
  '#00bcd4', // Cyan
  '#ffeb3b', // Amarillo
  '#795548', // Marrón
]

const DEFAULT_COLOR = '#2196f3'

export function ZoneEditor() {
  const { user } = useAuthStore()
  const { zones, setZones } = useAppStore()
  
  // Estado del editor
  const [tool, setTool] = useState<Tool>('select')
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // Estado de dibujo
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentZone, setCurrentZone] = useState<DrawingZone | null>(null)
  
  // Estado del formulario
  const [showZoneDialog, setShowZoneDialog] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const [zoneColor, setZoneColor] = useState(ZONE_COLORS[0])
  const [zoneDescription, setZoneDescription] = useState('')
  
  // Imagen del plano
  const [mapImage, setMapImage] = useState<string>(getAssetUrl('/maps/plano-planta.png'))
  const [imageLoaded, setImageLoaded] = useState(false)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  // Verificar si es admin
  const isAdmin = user?.rol === 'admin'

  // Cargar zonas
  useEffect(() => {
    getMainZones().then(setZones)
  }, [setZones])

  // Cargar imagen del plano
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      setImageLoaded(true)
    }
    img.onerror = () => {
      // Si no carga la primera imagen, intentar con imagen por defecto
      const img2 = new Image()
      img2.onload = () => {
        imageRef.current = img2
        setMapImage(getAssetUrl('/maps/default-map.png'))
        setImageLoaded(true)
      }
      img2.src = getAssetUrl('/maps/default-map.png')
    }
    img.src = mapImage
  }, [mapImage])

  // Dibujar canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // Limpiar
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Dibujar imagen de fondo si está cargada
    if (imageRef.current && imageLoaded) {
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height)
    } else {
      // Fondo por defecto
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Grid
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }
    }

    // Dibujar zonas existentes
    zones.forEach((zone) => {
      if (zone.bounds) {
        const bounds = zone.bounds
        const x = bounds.minX * canvas.width
        const y = bounds.minY * canvas.height
        const width = (bounds.maxX - bounds.minX) * canvas.width
        const height = (bounds.maxY - bounds.minY) * canvas.height

        // Relleno semi-transparente
        ctx.fillStyle = `${zone.color || '#2196f3'}33`
        ctx.fillRect(x, y, width, height)

        // Borde
        ctx.strokeStyle = zone.color || '#2196f3'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, width, height)

        // Nombre de la zona
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 14px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(zone.nombre, x + width / 2, y + height / 2)
        
        // ID de la zona
        ctx.font = '12px Inter, sans-serif'
        ctx.fillStyle = zone.color || '#2196f3'
        ctx.fillText(zone.id, x + width / 2, y + height / 2 + 18)
      }
    })

    // Dibujar zona actual (en proceso de dibujo)
    if (currentZone && currentZone.points.length >= 2) {
      const start = currentZone.points[0]
      const end = currentZone.points[currentZone.points.length - 1]
      
      if (start && end) {
        const x = Math.min(start.x, end.x)
        const y = Math.min(start.y, end.y)
        const width = Math.abs(end.x - start.x)
        const height = Math.abs(end.y - start.y)

        // Relleno
        ctx.fillStyle = `${currentZone.color}33`
        ctx.fillRect(x, y, width, height)

        // Borde punteado
        ctx.setLineDash([5, 5])
        ctx.strokeStyle = currentZone.color
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, width, height)
        ctx.setLineDash([])
      }
    }
  }, [zones, currentZone, imageLoaded])

  // Redibujar cuando cambian las zonas
  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  // Obtener coordenadas del mouse relativas al canvas
  const getCanvasCoords = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    }
  }

  // Handlers del canvas
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (tool === 'draw' && isAdmin) {
      const coords = getCanvasCoords(e)
      setIsDrawing(true)
      setCurrentZone({
        points: [coords],
        color: zoneColor ?? DEFAULT_COLOR,
        nombre: '',
      })
    } else if (tool === 'select') {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isDrawing && currentZone) {
      const coords = getCanvasCoords(e)
      const firstPoint = currentZone.points[0]
      if (firstPoint) {
        setCurrentZone({
          ...currentZone,
          points: [firstPoint, coords],
        })
        drawCanvas()
      }
    } else if (isDragging && tool === 'select') {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  const handleCanvasMouseUp = () => {
    if (isDrawing && currentZone && currentZone.points.length >= 2) {
      // Mostrar diálogo para nombrar la zona
      setShowZoneDialog(true)
    }
    setIsDrawing(false)
    setIsDragging(false)
  }

  // Guardar nueva zona
  const handleSaveZone = async () => {
    if (!currentZone || currentZone.points.length < 2) return
    
    const canvas = canvasRef.current
    if (!canvas) return

    const start = currentZone.points[0]
    const end = currentZone.points[1]
    
    if (!start || !end) return

    // Normalizar coordenadas (0-1)
    const bounds = {
      minX: Math.min(start.x, end.x) / canvas.width,
      minY: Math.min(start.y, end.y) / canvas.height,
      maxX: Math.max(start.x, end.x) / canvas.width,
      maxY: Math.max(start.y, end.y) / canvas.height,
    }

    // Generar ID de zona (A, B, C... o A1, A2 si es subzona)
    const nextId = String.fromCharCode(65 + zones.length) // A, B, C...

    // Crear polígono rectangular desde bounds
    const polygon = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ]

    const newZone = {
      id: nextId,
      nombre: zoneName || `Zona ${nextId}`,
      codigo: nextId,
      tipo: 'otro' as const,
      descripcion: zoneDescription,
      nivel: 1 as const,
      polygon,
      bounds,
      color: zoneColor,
      parentId: null,
      activa: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    try {
      await createZone(newZone)
      await getMainZones().then(setZones)
      
      // Reset
      setCurrentZone(null)
      setZoneName('')
      setZoneDescription('')
      setShowZoneDialog(false)
      setTool('select')
    } catch (error) {
      console.error('Error creando zona:', error)
    }
  }

  // Eliminar zona
  const handleDeleteZone = async (zoneId: string) => {
    if (!confirm('¿Eliminar esta zona?')) return
    
    try {
      await deleteZone(zoneId)
      await getMainZones().then(setZones)
    } catch (error) {
      console.error('Error eliminando zona:', error)
    }
  }

  // Cancelar dibujo
  const handleCancelDraw = () => {
    setCurrentZone(null)
    setShowZoneDialog(false)
    setZoneName('')
    setZoneDescription('')
  }

  // Control de zoom
  const handleZoom = (delta: number) => {
    setScale((prev) => Math.max(0.5, Math.min(3, prev + delta)))
  }

  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Herramientas:</span>
              <Button
                variant={tool === 'select' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTool('select')}
              >
                <MousePointer className="h-4 w-4 mr-1" />
                Seleccionar
              </Button>
              {isAdmin && (
                <Button
                  variant={tool === 'draw' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTool('draw')}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Dibujar Zona
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Zoom:</span>
              <Button variant="outline" size="icon" onClick={() => handleZoom(0.25)}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => handleZoom(-0.25)}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleReset}>
                <Maximize className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground w-16">
                {Math.round(scale * 100)}%
              </span>
            </div>

            {isAdmin && tool === 'draw' && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Color:</span>
                {ZONE_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-transform',
                      zoneColor === color ? 'scale-125 border-white' : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setZoneColor(color)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Canvas */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className={cn(
              'relative w-full h-[600px] overflow-hidden bg-muted',
              tool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
            )}
          >
            <div
              className="absolute inset-0 transition-transform duration-100"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <canvas
                ref={canvasRef}
                width={1200}
                height={600}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />
            </div>

            {/* Indicador de modo */}
            {tool === 'draw' && (
              <div className="absolute top-4 left-4 bg-primary/90 text-primary-foreground px-3 py-1 rounded text-sm">
                🎨 Modo dibujo: Haz click y arrastra para crear una zona
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de zonas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Zonas ({zones.length})</span>
            {!imageLoaded && (
              <Badge variant="outline">
                <ImageIcon className="h-3 w-3 mr-1" />
                Sin imagen de plano
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {zones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Square className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No hay zonas configuradas</p>
              {isAdmin && (
                <p className="text-sm mt-1">
                  Usa la herramienta "Dibujar Zona" para crear una
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className="p-4 rounded-lg border-2 bg-card"
                  style={{ borderColor: zone.color }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge style={{ backgroundColor: zone.color }}>
                      {zone.id}
                    </Badge>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleDeleteZone(zone.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <h4 className="font-medium">{zone.nombre}</h4>
                  {zone.descripcion && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {zone.descripcion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para nombrar zona */}
      <Dialog open={showZoneDialog} onOpenChange={setShowZoneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Zona</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="zoneName">Nombre de la zona</Label>
              <Input
                id="zoneName"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="Ej: Área de producción"
              />
            </div>
            <div>
              <Label htmlFor="zoneDescription">Descripción (opcional)</Label>
              <Input
                id="zoneDescription"
                value={zoneDescription}
                onChange={(e) => setZoneDescription(e.target.value)}
                placeholder="Descripción de la zona"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-2">
                {ZONE_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 transition-transform',
                      zoneColor === color ? 'scale-110 border-white' : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setZoneColor(color)}
                  />
                ))}
              </div>
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
    </div>
  )
}
