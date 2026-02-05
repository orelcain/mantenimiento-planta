/**
 * Componente MapViewer - Visualizador de mapas con marcadores interactivos
 * 
 * Soporta:
 * - Renderizar imagen de mapa
 * - Mostrar marcadores existentes
 * - Modo edición: click para colocar/mover marcador
 * - Zoom con scroll y pinch táctil
 * - Pan con arrastre (mouse y táctil)
 */

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { MapPin, ZoomIn, ZoomOut, RotateCcw, Hand, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Marcador simplificado para visualización
 */
export interface ViewerMarker {
  id: string
  position: { x: number; y: number }
  title?: string
  label?: string
  inspectionIndex?: number
}

export interface MapViewerHandle {
  zoomToPoints: (points: { x: number; y: number }[]) => void
  resetView: () => void
}

interface MapViewerProps {
  // Acepta mapVersion o imageUrl directamente
  mapVersion?: { imageUrl: string }
  imageUrl?: string
  markers?: ViewerMarker[]
  // Modo edición
  editable?: boolean
  pendingPosition?: { x: number; y: number } | null
  onPositionSelect?: (position: { x: number; y: number }) => void
  onPositionConfirm?: () => void
  onPositionCancel?: () => void
  // Interacción con marcadores
  onMarkerClick?: (marker: ViewerMarker) => void
  selectedMarkerId?: string
  // Personalización
  className?: string
  showControls?: boolean
  markerColor?: string
  pendingMarkerColor?: string
  // Opciones de vista automática
  autoFitMarkers?: boolean
}

export const MapViewer = forwardRef<MapViewerHandle, MapViewerProps>(({
  mapVersion,
  imageUrl,
  markers = [],
  editable = false,
  pendingPosition,
  onPositionSelect,
  onPositionConfirm,
  onPositionCancel,
  onMarkerClick,
  selectedMarkerId,
  className,
  showControls = true,
  markerColor = '#ef4444', // red-500
  pendingMarkerColor = '#3b82f6', // blue-500
  autoFitMarkers = false
}, ref) => {
  // Usar imageUrl directa o desde mapVersion
  const mapImageUrl = imageUrl || mapVersion?.imageUrl || ''
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)
  
  // Función para hacer zoom a puntos específicos
  const zoomToPoints = useCallback((points: { x: number; y: number }[]) => {
    if (!points.length || !containerRef.current || !imageRef.current) return

    const padding = 0.1 // 10% de margen
    
    // Calcular bounding box
    const minX = Math.min(...points.map(p => p.x))
    const maxX = Math.max(...points.map(p => p.x))
    const minY = Math.min(...points.map(p => p.y))
    const maxY = Math.max(...points.map(p => p.y))

    // Centro
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    
    // Dimensiones (añadir un mínimo para evitar zoom infinito si es un solo punto)
    // Usamos 0.2 (20%) para mostrar contexto suficiente sin pixelar la imagen
    // Al usar un contenedor más cuadrado, esto se equilibrará mejor
    const width = Math.max(maxX - minX, 0.2) 
    const height = Math.max(maxY - minY, 0.2)

    const container = containerRef.current
    const img = imageRef.current
    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight

    if (!naturalWidth || !naturalHeight) return

    // Calcular zoom necesario
      const zoomX = container.clientWidth / (naturalWidth * width * (1 + padding))
      const zoomY = container.clientHeight / (naturalHeight * height * (1 + padding))
      
      // Limitar zoom (máximo 3x para evitar pixelación excesiva)
      let newZoom = Math.min(zoomX, zoomY, 3) 
      newZoom = Math.max(newZoom, 1) // Min zoom 1

      // Calcular Pan para centrar
      const scaledWidth = naturalWidth * newZoom
      const scaledHeight = naturalHeight * newZoom
      
      const panX = scaledWidth * (0.5 - centerX)
      const panY = scaledHeight * (0.5 - centerY)

      setZoom(newZoom)
      setPan({ x: panX, y: panY })
  }, [])

  // Exponer métodos
  useImperativeHandle(ref, () => ({
    resetView: () => {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    },
    zoomToPoints
  }))

  // Auto-fit cuando se carga la imagen o cambian los marcadores
  useEffect(() => {
    if (imageLoaded && autoFitMarkers && markers.length > 0) {
      zoomToPoints(markers.map(m => m.position))
    }
  }, [imageLoaded, autoFitMarkers, markers, zoomToPoints])

  // Estado para distinguir entre pan y click
  const [hasMoved, setHasMoved] = useState(false)
  
  // Touch state para pinch zoom
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null)

  // Reset zoom/pan cuando cambia el mapa
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setImageLoaded(false)
  }, [mapImageUrl])

  // Manejar eventos táctiles con passive: false para permitir preventDefault
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleTouchMoveNative = (e: TouchEvent) => {
      e.preventDefault() // Esto ahora funciona sin warning
    }

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault() // Prevenir scroll de la página
    }

    container.addEventListener('touchmove', handleTouchMoveNative, { passive: false })
    container.addEventListener('wheel', handleWheelNative, { passive: false })

    return () => {
      container.removeEventListener('touchmove', handleTouchMoveNative)
      container.removeEventListener('wheel', handleWheelNative)
    }
  }, [])

  // Calcular posición del click en coordenadas normalizadas
  const getClickPosition = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current || !imageRef.current) return null

    const rect = containerRef.current.getBoundingClientRect()
    const img = imageRef.current

    // Posición del click relativa al contenedor
    const clickX = clientX - rect.left
    const clickY = clientY - rect.top

    // Calcular dimensiones de la imagen escalada
    const scaledWidth = img.naturalWidth * zoom
    const scaledHeight = img.naturalHeight * zoom

    // Calcular offset de la imagen (centrada + pan)
    const offsetX = (rect.width - scaledWidth) / 2 + pan.x
    const offsetY = (rect.height - scaledHeight) / 2 + pan.y

    // Posición relativa a la imagen
    const imgX = clickX - offsetX
    const imgY = clickY - offsetY

    // Normalizar a 0-1
    const x = imgX / scaledWidth
    const y = imgY / scaledHeight

    // Validar que está dentro de la imagen
    if (x < 0 || x > 1 || y < 0 || y > 1) return null

    return { x, y }
  }, [zoom, pan])

  // Controles de zoom
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 5))
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.25))
  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Zoom con wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // preventDefault se maneja en el listener nativo con passive: false
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.min(Math.max(z * delta, 0.25), 5))
  }, [])

  // --- MOUSE EVENTS ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return // Solo click izquierdo
    
    setIsPanning(true)
    setHasMoved(false)
    setPanStart({ 
      x: e.clientX, 
      y: e.clientY, 
      panX: pan.x, 
      panY: pan.y 
    })
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    
    const dx = e.clientX - panStart.x
    const dy = e.clientY - panStart.y
    
    // Si se movió más de 5px, es pan, no click
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setHasMoved(true)
    }
    
    setPan({
      x: panStart.panX + dx,
      y: panStart.panY + dy,
    })
  }, [isPanning, panStart])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    
    setIsPanning(false)
    
    // Si no se movió y es modo editable, colocar marcador
    if (!hasMoved && editable && onPositionSelect) {
      const position = getClickPosition(e.clientX, e.clientY)
      if (position) {
        console.log('📍 Marcador colocado:', position) // DEBUG
        onPositionSelect(position)
      }
    }
  }, [isPanning, hasMoved, editable, onPositionSelect, getClickPosition])

  // --- TOUCH EVENTS ---
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return null
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch - pan
      setIsPanning(true)
      setHasMoved(false)
      setPanStart({ 
        x: e.touches[0].clientX, 
        y: e.touches[0].clientY, 
        panX: pan.x, 
        panY: pan.y 
      })
    } else if (e.touches.length === 2) {
      // Two fingers - prepare for pinch
      setLastTouchDistance(getTouchDistance(e.touches))
    }
  }, [pan])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // preventDefault se maneja en el listener nativo con passive: false
    
    if (e.touches.length === 1 && isPanning) {
      // Single touch - pan
      const dx = e.touches[0].clientX - panStart.x
      const dy = e.touches[0].clientY - panStart.y
      
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setHasMoved(true)
      }
      
      setPan({
        x: panStart.panX + dx,
        y: panStart.panY + dy,
      })
    } else if (e.touches.length === 2) {
      // Pinch zoom
      const distance = getTouchDistance(e.touches)
      if (distance && lastTouchDistance) {
        const scale = distance / lastTouchDistance
        setZoom((z) => Math.min(Math.max(z * scale, 0.25), 5))
        setLastTouchDistance(distance)
      }
    }
  }, [isPanning, panStart, lastTouchDistance])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // All fingers lifted
      if (isPanning && !hasMoved && editable && onPositionSelect && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0]
        const position = getClickPosition(touch.clientX, touch.clientY)
        if (position) {
          console.log('📍 Marcador colocado (touch):', position) // DEBUG
          onPositionSelect(position)
        }
      }
      setIsPanning(false)
      setLastTouchDistance(null)
    } else if (e.touches.length === 1) {
      // One finger remaining - continue pan from new position
      setPanStart({ 
        x: e.touches[0].clientX, 
        y: e.touches[0].clientY, 
        panX: pan.x, 
        panY: pan.y 
      })
      setLastTouchDistance(null)
    }
  }, [isPanning, hasMoved, editable, onPositionSelect, getClickPosition, pan])

  // Calcular posición de marcador en píxeles
  const getMarkerPosition = useCallback((position: { x: number; y: number }) => {
    if (!containerRef.current || !imageRef.current || !imageLoaded) {
      return { left: 0, top: 0 }
    }

    const container = containerRef.current
    const img = imageRef.current

    const scaledWidth = img.naturalWidth * zoom
    const scaledHeight = img.naturalHeight * zoom

    const offsetX = (container.clientWidth - scaledWidth) / 2 + pan.x
    const offsetY = (container.clientHeight - scaledHeight) / 2 + pan.y

    return {
      left: offsetX + position.x * scaledWidth,
      top: offsetY + position.y * scaledHeight,
    }
  }, [zoom, pan, imageLoaded])

  // DEBUG: Log para verificar si los botones deberían mostrarse
  console.log('🗺️ MapViewer render - pendingPosition:', pendingPosition, 'onPositionConfirm:', !!onPositionConfirm, 'onPositionCancel:', !!onPositionCancel)

  return (
    <div className={cn('relative flex flex-col', className)}>
      {/* Contenedor del mapa con overflow hidden */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-muted rounded-lg touch-none">
        {/* Controles de zoom optimizados para móvil */}
        {showControls && (
          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 bg-background/90 backdrop-blur rounded-lg p-1 shadow-md">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:h-8 md:w-8"
              onClick={handleZoomIn}
              title="Acercar"
            >
              <ZoomIn className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:h-8 md:w-8"
              onClick={handleZoomOut}
              title="Alejar"
            >
              <ZoomOut className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:h-8 md:w-8"
              onClick={handleReset}
              title="Restablecer"
            >
              <RotateCw className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
          </div>
        )}

      {/* Indicador de modo edición */}
      {editable && (
        <div className="absolute top-2 left-2 z-10 bg-blue-500 text-white text-xs px-2 py-1 rounded-md shadow-md flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          Toca para colocar marcador
        </div>
      )}

      {/* Indicador de navegación - ocultar cuando hay marcador pendiente */}
      {editable && !pendingPosition && (
        <div className="absolute bottom-2 left-2 z-10 bg-background/80 text-muted-foreground text-xs px-2 py-1 rounded-md flex items-center gap-1">
          <Hand className="h-3 w-3" />
          Arrastra para mover
        </div>
      )}

      {/* Contenedor del mapa */}
      <div
        ref={containerRef}
        className={cn(
          'relative w-full h-full min-h-[300px] flex items-center justify-center',
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Imagen del mapa */}
        <img
          ref={imageRef}
          src={mapImageUrl}
          alt="Mapa"
          className="max-w-none select-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
          }}
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />

        {/* Marcadores existentes */}
        {imageLoaded && markers.map((marker) => {
          const pos = getMarkerPosition(marker.position)
          const isSelected = marker.id === selectedMarkerId
          
          return (
            <div
              key={marker.id}
              className={cn(
                'absolute transform -translate-x-1/2 -translate-y-full cursor-pointer transition-transform hover:scale-110',
                isSelected && 'scale-125'
              )}
              style={{ left: pos.left, top: pos.top }}
              onClick={(e) => {
                e.stopPropagation()
                onMarkerClick?.(marker)
              }}
            >
              <div className="relative">
                <MapPin
                  className="h-8 w-8 drop-shadow-md"
                  style={{ color: markerColor }}
                  fill={markerColor}
                />
                {marker.inspectionIndex !== undefined && (
                  <span className="absolute -top-1 -right-1 bg-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md border"
                    style={{ color: markerColor }}
                  >
                    {marker.inspectionIndex}
                  </span>
                )}
                {marker.label && (
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-background/90 text-xs px-1 rounded whitespace-nowrap shadow">
                    {marker.label}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* Marcador pendiente (modo edición) */}
        {imageLoaded && pendingPosition && (
          <div
            className="absolute transform -translate-x-1/2 -translate-y-full animate-bounce"
            style={getMarkerPosition(pendingPosition)}
          >
            <MapPin
              className="h-10 w-10 drop-shadow-lg"
              style={{ color: pendingMarkerColor }}
              fill={pendingMarkerColor}
            />
          </div>
        )}
      </div>
      </div>

      {/* Botones de confirmación para posición pendiente - FUERA del overflow */}
      {pendingPosition && onPositionConfirm && onPositionCancel && (
        <div className="shrink-0 flex justify-center gap-2 p-3 bg-background border-t rounded-b-lg">
          <Button
            variant="outline"
            size="sm"
            onClick={onPositionCancel}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            Modificar
          </Button>
          <Button
            size="sm"
            onClick={onPositionConfirm}
            className="gap-1 bg-primary"
          >
            <Check className="h-4 w-4" />
            Confirmar Posición
          </Button>
        </div>
      )}
    </div>
  )
})
