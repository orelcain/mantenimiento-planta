import { useState } from 'react'
import { ArrowLeftRight, ZoomIn } from 'lucide-react'
import { Dialog, DialogContent, Button } from '@/components/ui'
import type { PhotoItem } from '@/types'
import { cn } from '@/lib/utils'

interface BeforeAfterViewerProps {
  before: PhotoItem | null
  after: PhotoItem | null
  titulo?: string
}

export function BeforeAfterViewer({ before, after, titulo }: BeforeAfterViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenImage, setFullscreenImage] = useState<'before' | 'after' | null>(null)
  const [viewMode, setViewMode] = useState<'side-by-side' | 'slider'>('side-by-side')
  const [sliderPosition, setSliderPosition] = useState(50)

  const handleImageClick = (type: 'before' | 'after') => {
    setFullscreenImage(type)
    setIsFullscreen(true)
  }

  const handleSliderChange = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = (x / rect.width) * 100
    setSliderPosition(Math.min(100, Math.max(0, percentage)))
  }

  if (!before && !after) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center">
        <p className="text-muted-foreground">No hay fotos disponibles</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {titulo && (
          <h4 className="font-medium text-sm text-foreground">{titulo}</h4>
        )}

        {/* Controles de vista */}
        {before && after && (
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'side-by-side' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('side-by-side')}
            >
              Lado a lado
            </Button>
            <Button
              variant={viewMode === 'slider' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('slider')}
            >
              <ArrowLeftRight className="w-4 h-4 mr-1" />
              Deslizar
            </Button>
          </div>
        )}

        {/* Vista lado a lado */}
        {viewMode === 'side-by-side' && (
          <div className="grid grid-cols-2 gap-2">
            {/* Antes */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-red-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                ANTES
              </span>
              {before ? (
                <div
                  className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted cursor-pointer group"
                  onClick={() => handleImageClick('before')}
                >
                  <img
                    src={before.url}
                    alt="Antes"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {before.descripcion && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                      <p className="text-white text-xs truncate">{before.descripcion}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-[4/3] rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Sin foto</span>
                </div>
              )}
            </div>

            {/* Después */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-green-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                DESPUÉS
              </span>
              {after ? (
                <div
                  className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted cursor-pointer group"
                  onClick={() => handleImageClick('after')}
                >
                  <img
                    src={after.url}
                    alt="Después"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {after.descripcion && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                      <p className="text-white text-xs truncate">{after.descripcion}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-[4/3] rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Pendiente</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Vista con slider */}
        {viewMode === 'slider' && before && after && (
          <div
            className="relative aspect-[4/3] rounded-lg overflow-hidden cursor-ew-resize select-none"
            onMouseMove={handleSliderChange}
            onTouchMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const touch = e.touches[0]
              if (!touch) return
              const x = touch.clientX - rect.left
              const percentage = (x / rect.width) * 100
              setSliderPosition(Math.min(100, Math.max(0, percentage)))
            }}
          >
            {/* Imagen después (fondo) */}
            <img
              src={after.url}
              alt="Después"
              className="absolute inset-0 w-full h-full object-cover"
            />
            
            {/* Imagen antes (recortada) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPosition}%` }}
            >
              <img
                src={before.url}
                alt="Antes"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ width: `${100 / (sliderPosition / 100)}%`, maxWidth: 'none' }}
              />
            </div>

            {/* Línea divisoria */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                <ArrowLeftRight className="w-4 h-4 text-gray-600" />
              </div>
            </div>

            {/* Labels */}
            <div className="absolute top-2 left-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded">
              ANTES
            </div>
            <div className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs font-medium rounded">
              DESPUÉS
            </div>
          </div>
        )}
      </div>

      {/* Modal fullscreen */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden">
          <div className="relative w-full h-full">
            <img
              src={fullscreenImage === 'before' ? before?.url : after?.url}
              alt={fullscreenImage === 'before' ? 'Antes' : 'Después'}
              className="w-full h-full object-contain"
            />
            <div className={cn(
              "absolute top-4 left-4 px-3 py-1.5 text-white text-sm font-medium rounded",
              fullscreenImage === 'before' ? 'bg-red-500' : 'bg-green-500'
            )}>
              {fullscreenImage === 'before' ? 'ANTES' : 'DESPUÉS'}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
