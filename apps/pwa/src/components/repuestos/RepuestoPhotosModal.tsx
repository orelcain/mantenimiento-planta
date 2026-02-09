import { useState } from 'react'
import { X, Download } from 'lucide-react'
import type { ImagenRepuesto } from '@/types/repuestos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'

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
  const [selectedPhoto, setSelectedPhoto] = useState<ImagenRepuesto | null>(null)
  const allPhotos = [...fotosReales, ...imagenesManual]

  const handleDownload = (photo: ImagenRepuesto) => {
    if (photo.url) {
      const a = document.createElement('a')
      a.href = photo.url
      a.download = photo.url?.split('/').pop() || 'foto'
      a.click()
    }
  }

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
                      onClick={() => setSelectedPhoto(foto)}
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
                      onClick={() => setSelectedPhoto(img)}
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

      {/* Visor de foto ampliada */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          <div className="relative w-full h-full flex items-center justify-center p-4">
            {/* Botón cerrar */}
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="h-6 w-6 text-white" />
            </button>

            {/* Botón descargar */}
            {selectedPhoto.url && (
              <button
                onClick={() => handleDownload(selectedPhoto)}
                className="absolute bottom-4 right-4 z-10 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="Descargar"
              >
                <Download className="h-6 w-6 text-white" />
              </button>
            )}

            {/* Imagen */}
            {selectedPhoto.url ? (
              <img
                src={selectedPhoto.url}
                alt="Foto expandida"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-white text-lg">Sin imagen disponible</div>
            )}

            {/* Nombre/descripción */}
            {selectedPhoto.descripcion && (
              <div className="absolute bottom-4 left-4 text-white text-sm bg-black/50 px-3 py-2 rounded">
                {selectedPhoto.descripcion}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
