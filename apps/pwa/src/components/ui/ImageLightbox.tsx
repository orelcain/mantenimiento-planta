/**
 * ImageLightbox – Visor de imágenes a pantalla completa
 *
 * Features:
 * - Zoom con scroll del mouse y pinch en móvil
 * - Paneo arrastrando la imagen (cuando hay zoom)
 * - Navegación entre fotos con flechas
 * - Doble-clic / doble-tap para zoom ×2
 * - Teclas: Esc cerrar, ←/→ navegar, +/- zoom
 * - Fondo oscuro con botón de cierre
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

interface ImageLightboxProps {
  photos: string[]
  initialIndex?: number
  onClose: () => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 5
const ZOOM_STEP = 0.3

export function ImageLightbox({ photos, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const lastTap = useRef(0)
  const pinchStartDist = useRef(0)
  const pinchStartZoom = useRef(1)

  const photo = photos[index]

  // Reset zoom/pan on photo change
  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    resetView()
  }, [index, resetView])

  // Precargar imágenes vecinas (anterior + siguiente)
  useEffect(() => {
    const toPreload = [photos[index - 1], photos[index + 1]].filter(Boolean)
    toPreload.forEach(src => {
      const img = new Image()
      img.src = src
    })
  }, [index, photos])

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          if (index > 0) setIndex(i => i - 1)
          break
        case 'ArrowRight':
          if (index < photos.length - 1) setIndex(i => i + 1)
          break
        case '+':
        case '=':
          setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))
          break
        case '-':
          setZoom(z => {
            const next = Math.max(MIN_ZOOM, z - ZOOM_STEP)
            if (next <= 1) setPan({ x: 0, y: 0 })
            return next
          })
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, photos.length, onClose])

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
    setZoom(z => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta))
      if (next <= 1) setPan({ x: 0, y: 0 })
      return next
    })
  }, [])

  // Double click/tap to toggle zoom
  const handleDoubleAction = useCallback((clientX: number, clientY: number) => {
    if (zoom > 1) {
      resetView()
    } else {
      setZoom(2.5)
      // Center on click point
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const cx = rect.width / 2
        const cy = rect.height / 2
        setPan({
          x: (cx - clientX + rect.left) * 0.8,
          y: (cy - clientY + rect.top) * 0.8,
        })
      }
    }
  }, [zoom, resetView])

  // --- Mouse drag for panning ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return
    e.preventDefault()
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    panStart.current = { ...pan }
  }, [zoom, pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    setPan({
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y),
    })
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  // --- Touch: drag + pinch-zoom ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const t0 = e.touches[0]!
      const t1 = e.touches[1]!
      const dx = t0.clientX - t1.clientX
      const dy = t0.clientY - t1.clientY
      pinchStartDist.current = Math.hypot(dx, dy)
      pinchStartZoom.current = zoom
    } else if (e.touches.length === 1) {
      const t0 = e.touches[0]!
      // Double-tap detection
      const now = Date.now()
      if (now - lastTap.current < 300) {
        handleDoubleAction(t0.clientX, t0.clientY)
        lastTap.current = 0
        return
      }
      lastTap.current = now

      // Drag start
      if (zoom > 1) {
        dragStart.current = { x: t0.clientX, y: t0.clientY }
        panStart.current = { ...pan }
        setDragging(true)
      }
    }
  }, [zoom, pan, handleDoubleAction])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      const t0 = e.touches[0]!
      const t1 = e.touches[1]!
      const dx = t0.clientX - t1.clientX
      const dy = t0.clientY - t1.clientY
      const dist = Math.hypot(dx, dy)
      const scale = dist / pinchStartDist.current
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStartZoom.current * scale))
      setZoom(newZoom)
      if (newZoom <= 1) setPan({ x: 0, y: 0 })
    } else if (e.touches.length === 1 && dragging) {
      const t0 = e.touches[0]!
      // Drag
      setPan({
        x: panStart.current.x + (t0.clientX - dragStart.current.x),
        y: panStart.current.y + (t0.clientY - dragStart.current.y),
      })
    }
  }, [dragging])

  const handleTouchEnd = useCallback(() => {
    setDragging(false)
  }, [])

  const goTo = (dir: 'prev' | 'next') => {
    setIndex(i => dir === 'prev' ? Math.max(0, i - 1) : Math.min(photos.length - 1, i + 1))
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex flex-col select-none"
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 text-white">
        <span className="text-sm font-medium">
          {photos.length > 1 ? `${index + 1} / ${photos.length}` : 'Vista de imagen'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="Acercar"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              setZoom(z => {
                const next = Math.max(MIN_ZOOM, z - ZOOM_STEP)
                if (next <= 1) setPan({ x: 0, y: 0 })
                return next
              })
            }}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="Alejar"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          {zoom > 1 && (
            <button
              onClick={resetView}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title="Restablecer"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          )}
          <div className="w-px h-5 bg-white/20 mx-1" />
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={(e) => handleDoubleAction(e.clientX, e.clientY)}
        style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
      >
        <img
          src={photo}
          alt={`Foto ${index + 1}`}
          className="max-w-full max-h-full object-contain transition-transform duration-150 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
          draggable={false}
        />

        {/* Nav arrows */}
        {photos.length > 1 && (
          <>
            {index > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); goTo('prev') }}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {index < photos.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goTo('next') }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Bottom thumbnails (if multiple) */}
      {photos.length > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-black/60 overflow-x-auto">
          {photos.map((url, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                i === index ? 'border-white scale-110' : 'border-white/20 opacity-60 hover:opacity-100'
              }`}
            >
              <img src={url} alt={`Miniatura ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Zoom indicator */}
      {zoom > 1 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 text-white text-xs rounded-full font-mono">
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  )
}
