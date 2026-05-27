import { useState } from 'react'
import type { ImagenRepuesto } from '@/types/repuestos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import { ImageLightbox } from '@/components/ui/ImageLightbox'

interface RepuestoPhotosModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fotosReales: ImagenRepuesto[]
  imagenesManual: ImagenRepuesto[]
  repuestoName: string
}

export function RepuestoPhotosModal({
  open,
  onOpenChange,
  fotosReales,
  imagenesManual,
  repuestoName,
}: RepuestoPhotosModalProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const allPhotos = [...fotosReales, ...imagenesManual]
  const allPhotoUrls = allPhotos.map(p => p.url).filter((u): u is string => !!u)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fotos - {repuestoName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Fotos Reales */}
            {fotosReales.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">📸 Fotos Reales ({fotosReales.length})</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {fotosReales.map((foto, idx) => (
                    <div
                      key={`real-${idx}`}
                      className="relative group rounded-lg overflow-hidden bg-muted aspect-square cursor-pointer"
                      onClick={() => {
                        if (!foto.url) return
                        const i = allPhotoUrls.indexOf(foto.url)
                        setLightboxIndex(i >= 0 ? i : 0)
                      }}
                    >
                      {foto.url ? (
                        <img
                          src={foto.url}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                          Sin imagen
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <span className="text-white text-xs">Ver</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Imágenes Manual */}
            {imagenesManual.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">📋 Imágenes Manual ({imagenesManual.length})</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {imagenesManual.map((img, idx) => (
                    <div
                      key={`manual-${idx}`}
                      className="relative group rounded-lg overflow-hidden bg-muted aspect-square cursor-pointer"
                      onClick={() => {
                        if (!img.url) return
                        const i = allPhotoUrls.indexOf(img.url)
                        setLightboxIndex(i >= 0 ? i : 0)
                      }}
                    >
                      {img.url ? (
                        <img
                          src={img.url}
                          alt={`Imagen ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                          Sin imagen
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <span className="text-white text-xs">Ver</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allPhotos.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                No hay fotos disponibles para este repuesto.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Visor de foto ampliada con pan+zoom (componente unificado @/components/ui/ImageLightbox).
          Trade-off conocido vs visor anterior: se pierde el botón "Descargar" y el caption con
          `foto.descripcion`. A cambio: pan+zoom+pinch+doble-tap+teclado+navegación entre las
          fotos del repuesto (reales + manual). Si descargar duele lo bastante, se suma al global
          como prop opcional `onDownload?:(url:string)=>void` sin romper los demás callsites. */}
      {lightboxIndex !== null && allPhotoUrls.length > 0 && (
        <ImageLightbox
          photos={allPhotoUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
