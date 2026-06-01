/**
 * EquipmentHeaderPhoto — Fotos de un equipo (nodo hierarchy / máquina).
 *
 * Thumbnail + subida desde cámara (móvil) + lightbox con carrusel, zoom y
 * paneo. Las fotos se guardan en Storage keyed por `equipmentId`.
 *
 * Extraído de la pestaña "Por equipo" (Dashboard) para reuso en el hub
 * área-first (rescate G1). La copia local de Dashboard se retira cuando se
 * retire esa pestaña.
 */
import { useState, useEffect } from 'react'
import { Camera, X, ChevronLeft, ChevronRight, ZoomIn, Plus } from 'lucide-react'
import { useIsAdmin } from '@/store/authStore'
import { uploadEquipmentPhoto, deleteEquipmentPhoto, listEquipmentPhotos } from '@/services/storage'
import { logger } from '@/lib/logger'

export function EquipmentHeaderPhoto({ equipmentId }: { equipmentId: string }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<{ idx: number; zoom: number; panX: number; panY: number } | null>(null)
  const isAdmin = useIsAdmin()

  useEffect(() => {
    listEquipmentPhotos(equipmentId).then(setPhotos).catch(() => setPhotos([]))
  }, [equipmentId])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadEquipmentPhoto(equipmentId, file)
      setPhotos((prev) => [...prev, url])
    } catch (err) {
      logger.error('Error uploading equipment photo', err instanceof Error ? err : new Error(String(err)))
    }
    setUploading(false)
  }

  const handleDelete = async (url: string) => {
    if (!confirm('¿Eliminar esta foto?')) return
    await deleteEquipmentPhoto(url)
    setPhotos((prev) => prev.filter((p) => p !== url))
    setLightbox(null)
  }

  const mainPhoto = photos[0]

  return (
    <>
      {/* Thumbnail o upload */}
      {mainPhoto ? (
        <button
          onClick={() => setLightbox({ idx: 0, zoom: 1, panX: 0, panY: 0 })}
          className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-border transition-all hover:ring-primary/50 sm:h-14 sm:w-14"
        >
          <img src={mainPhoto} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-110" loading="lazy" />
          {photos.length > 1 && (
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[8px] font-bold text-white">+{photos.length - 1}</span>
          )}
        </button>
      ) : (
        <label className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-dashed transition-all sm:h-14 sm:w-14 ${
          uploading ? 'border-primary/50 bg-primary/5' : 'cursor-pointer border-border hover:border-primary/50 hover:bg-primary/5'
        }`}>
          {uploading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <Camera className="h-5 w-5 text-muted-foreground/40 transition-colors hover:text-primary/60" />
          )}
          {!uploading && (
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
          )}
        </label>
      )}

      {/* Lightbox con carrusel + zoom + paneo */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLightbox(null)}>
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-red-500">
              <X className="h-4 w-4" />
            </button>

            <div className="max-h-[75vh] cursor-grab overflow-hidden rounded-xl active:cursor-grabbing"
              onWheel={(e) => { e.preventDefault(); setLightbox((prev) => prev ? { ...prev, zoom: Math.max(0.5, Math.min(5, prev.zoom + (e.deltaY > 0 ? -0.3 : 0.3))) } : null) }}
              onMouseMove={(e) => { if (e.buttons === 1 && lightbox.zoom > 1) setLightbox((prev) => prev ? { ...prev, panX: prev.panX + e.movementX, panY: prev.panY + e.movementY } : null) }}
            >
              <img
                src={photos[lightbox.idx]}
                alt=""
                className="max-h-[75vh] max-w-full object-contain transition-transform"
                style={{ transform: `scale(${lightbox.zoom}) translate(${lightbox.panX / lightbox.zoom}px, ${lightbox.panY / lightbox.zoom}px)` }}
                draggable={false}
              />
            </div>

            <div className="mt-3 flex items-center gap-3">
              {photos.length > 1 && (
                <button onClick={() => setLightbox((prev) => prev ? { ...prev, idx: (prev.idx - 1 + photos.length) % photos.length, zoom: 1, panX: 0, panY: 0 } : null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft className="h-4 w-4" /></button>
              )}
              <span className="text-xs text-white/60 tabular-nums">{lightbox.idx + 1} / {photos.length}</span>
              <button onClick={() => setLightbox((prev) => prev ? { ...prev, zoom: prev.zoom < 2 ? 2 : 1, panX: 0, panY: 0 } : null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ZoomIn className="h-4 w-4" /></button>
              {photos.length > 1 && (
                <button onClick={() => setLightbox((prev) => prev ? { ...prev, idx: (prev.idx + 1) % photos.length, zoom: 1, panX: 0, panY: 0 } : null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight className="h-4 w-4" /></button>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              {photos.map((url, i) => (
                <button key={url} onClick={() => setLightbox((prev) => prev ? { ...prev, idx: i, zoom: 1, panX: 0, panY: 0 } : null)}
                  className={`h-12 w-12 overflow-hidden rounded-lg ring-2 transition-all ${lightbox.idx === i ? 'ring-primary' : 'ring-transparent hover:ring-white/30'}`}>
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              {isAdmin && (
                <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-white/20 transition-colors hover:border-white/40">
                  <Plus className="h-4 w-4 text-white/40" />
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
                </label>
              )}
              {isAdmin && (
                <button onClick={() => handleDelete(photos[lightbox.idx]!)}
                  className="ml-2 h-8 rounded-lg bg-red-500/20 px-3 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/30">
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
