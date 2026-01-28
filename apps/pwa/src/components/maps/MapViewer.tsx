/**
 * Componente MapViewer - Visualizador de mapas con marcadores interactivos
 * 
 * Soporta:
 * - Renderizar imagen de mapa
 * - Mostrar marcadores existentes
 * - Modo edición: click para colocar/mover marcador
 * - Zoom y pan básico
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { MapPin, ZoomIn, ZoomOut, RotateCcw, Move, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Marcador simplificado para visualización
 */
interface ViewerMarker {
  id: string
  position: { x: number; y: number }
  title?: string
  label?: string
  inspectionIndex?: number
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
}

export function MapViewer({
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
}: MapViewerProps) {
  // Usar imageUrl directa o desde mapVersion
  const mapImageUrl = imageUrl || mapVersion?.imageUrl || ''
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)

  // Reset zoom/pan cuando cambia el mapa
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setImageLoaded(false)
  }, [mapImageUrl])

  // Calcular posición del click en coordenadas normalizadas
  const getClickPosition = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imageRef.current) return null

    const rect = containerRef.current.getBoundingClientRect()
    const img = imageRef.current

    // Posición del click relativa al contenedor
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

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

  // Manejar click en el mapa
  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable || isDragging) return

    const position = getClickPosition(e)
    if (position && onPositionSelect) {
      onPositionSelect(position)
    }
  }, [editable, isDragging, getClickPosition, onPositionSelect])

  // Controles de zoom
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 4))
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.5))
  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Pan con drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Solo click izquierdo
    if (editable && !e.ctrlKey && !e.metaKey) return // En modo edición, drag solo con ctrl/cmd
    
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

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

  return (
    <div className={cn('relative overflow-hidden bg-muted rounded-lg', className)}>
      {/* Controles de zoom */}
      {showControls && (
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 bg-background/90 backdrop-blur rounded-lg p-1 shadow-md">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomIn}
            title="Acercar"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomOut}
            title="Alejar"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleReset}
            title="Restablecer"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          {!editable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Mantener y arrastrar para mover"
            >
              <Move className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Indicador de modo edición */}
      {editable && (
        <div className="absolute top-2 left-2 z-10 bg-blue-500 text-white text-xs px-2 py-1 rounded-md shadow-md flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          Toca para colocar marcador
        </div>
      )}

      {/* Contenedor del mapa */}
      <div
        ref={containerRef}
        className={cn(
          'relative w-full h-full min-h-[300px] flex items-center justify-center',
          editable ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onClick={handleMapClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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

      {/* Botones de confirmación para posición pendiente */}
      {pendingPosition && onPositionConfirm && onPositionCancel && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-background/95 backdrop-blur p-2 rounded-lg shadow-lg">
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
            className="gap-1"
          >
            <Check className="h-4 w-4" />
            Confirmar Posición
          </Button>
        </div>
      )}

      {/* Indicador de zoom */}
      {showControls && zoom !== 1 && (
        <div className="absolute bottom-2 right-2 bg-background/80 text-xs px-2 py-1 rounded">
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  )
}
