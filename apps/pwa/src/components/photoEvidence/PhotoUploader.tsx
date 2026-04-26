import { useState, useRef } from 'react'
import { Camera, X, Image as ImageIcon, Plus } from 'lucide-react'
import { Button, Spinner } from '@/components/ui'
import { compressImage } from '@/services/storage'
import { logger } from '@/lib/logger'

interface PhotoUploaderProps {
  photos: { id: string; url: string; preview?: string }[]
  onPhotosChange: (photos: { id: string; url: string; preview?: string; file?: File }[]) => void
  maxPhotos?: number
  disabled?: boolean
  label?: string
  description?: string
  selectedPhotoId?: string
  onSelectPhotoId?: (photoId: string) => void
}

export function PhotoUploader({
  photos,
  onPhotosChange,
  maxPhotos = 10,
  disabled = false,
  label = 'Fotos',
  description,
  selectedPhotoId,
  onSelectPhotoId,
}: PhotoUploaderProps) {
  const [isLoading, setIsLoading] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setIsLoading(true)
    const newPhotos: { id: string; url: string; preview: string; file: File }[] = []

    for (const file of files) {
      if (photos.length + newPhotos.length >= maxPhotos) break

      // Validar que sea imagen
      if (!file.type.startsWith('image/')) continue

      try {
        // Comprimir imagen
        const compressed = await compressImage(file, 1920, 0.8)
        
        // Crear preview
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(compressed)
        })

        newPhotos.push({
          id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          url: preview, // Temporalmente usar preview como URL
          preview,
          file: compressed,
        })
      } catch (error) {
        logger.error('Error processing photo', error instanceof Error ? error : new Error(String(error)))
      }
    }

    onPhotosChange([...photos, ...newPhotos])
    setIsLoading(false)

    // Limpiar inputs
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }

  const handleRemovePhoto = (photoId: string) => {
    onPhotosChange(photos.filter((p) => p.id !== photoId))
  }

  const canAddMore = photos.length < maxPhotos && !disabled

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">{label}</label>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {photos.length}/{maxPhotos}
        </span>
      </div>

      {/* Grid de fotos */}
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className={
              `relative aspect-square rounded-lg overflow-hidden bg-muted group ` +
              (selectedPhotoId && selectedPhotoId === photo.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '')
            }
          >
            <img
              src={photo.preview || photo.url}
              alt="Foto"
              className="w-full h-full object-cover"
              onClick={() => onSelectPhotoId?.(photo.id)}
              style={{ cursor: onSelectPhotoId ? 'pointer' : 'default' }}
              loading="lazy"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemovePhoto(photo.id)}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {/* Botón de agregar */}
        {canAddMore && (
          <div className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
            {isLoading ? (
              <Spinner className="w-6 h-6" />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Plus className="w-6 h-6 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Agregar</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botones de acción */}
      {canAddMore && !isLoading && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="w-4 h-4 mr-2" />
            Cámara
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => galleryInputRef.current?.click()}
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Galería
          </Button>
        </div>
      )}

      {/* Inputs ocultos */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoSelect}
        disabled={disabled || isLoading}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoSelect}
        disabled={disabled || isLoading}
      />
    </div>
  )
}
