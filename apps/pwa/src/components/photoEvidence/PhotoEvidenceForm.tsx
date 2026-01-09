import { useState, useEffect } from 'react'
import { MapPin, Tag, FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Textarea,
  Spinner,
} from '@/components/ui'
import { PhotoUploader } from './PhotoUploader'
import { HierarchySelector } from '@/components/hierarchy/HierarchySelector'
import { useAuthStore } from '@/store'
import { useHierarchyPath } from '@/hooks/useHierarchy'
import {
  createPhotoEvidence,
  uploadMultipleEvidencePhotos,
  updatePhotoEvidence,
} from '@/services/photoEvidence'
import type { PhotoItem } from '@/types'
import type { HierarchyPath } from '@/types/hierarchy'
import { logger } from '@/lib/logger'

interface PhotoEvidenceFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function PhotoEvidenceForm({ open, onClose, onSuccess }: PhotoEvidenceFormProps) {
  const user = useAuthStore((state) => state.user)
  
  const [isLoading, setIsLoading] = useState(false)
  const [photos, setPhotos] = useState<{ id: string; url: string; preview?: string; file?: File }[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    hierarchyNodeId: undefined as string | undefined,
    tags: '',
  })

  // Usar hook para obtener el path
  const { path: hierarchyPathData } = useHierarchyPath(selectedNodeId)
  const hierarchyPath = hierarchyPathData.map((p: HierarchyPath) => p.nombre).join(' > ')

  // Reset form cuando se abre
  useEffect(() => {
    if (open) {
      setFormData({
        titulo: '',
        descripcion: '',
        hierarchyNodeId: undefined,
        tags: '',
      })
      setPhotos([])
      setSelectedNodeId(null)
    }
  }, [open])

  // Obtener path cuando se selecciona un nodo
  const handleHierarchyChange = (nodeId: string | null) => {
    setFormData(prev => ({ ...prev, hierarchyNodeId: nodeId || undefined }))
    setSelectedNodeId(nodeId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) return
    if (!formData.titulo.trim()) return
    if (photos.length === 0) return

    setIsLoading(true)

    try {
      // Crear evidencia primero
      const evidence = await createPhotoEvidence({
        titulo: formData.titulo.trim(),
        descripcion: formData.descripcion.trim() || undefined,
        hierarchyNodeId: formData.hierarchyNodeId,
        hierarchyPath: hierarchyPath || undefined,
        fotosBefore: [], // Se agregarán después
        status: 'pendiente',
        reportadoPor: user.id,
        tags: formData.tags
          ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
          : undefined,
      })

      // Subir fotos
      const photosToUpload = photos.filter(p => p.file)
      if (photosToUpload.length > 0) {
        const uploadedPhotos = await uploadMultipleEvidencePhotos(
          evidence.id,
          photosToUpload.map(p => p.file!),
          'before'
        )

        // Actualizar evidencia con las URLs de las fotos
        const fotosBefore: PhotoItem[] = uploadedPhotos.map((uploaded) => ({
          id: uploaded.id,
          url: uploaded.url,
          descripcion: undefined,
          timestamp: new Date(),
        }))

        await updatePhotoEvidence(evidence.id, { fotosBefore })
      }

      logger.info('Photo evidence created', { id: evidence.id, titulo: formData.titulo })
      onSuccess()
      onClose()
    } catch (error) {
      logger.error('Error creating photo evidence', error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const isValid = formData.titulo.trim() && photos.length > 0

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Nueva Evidencia Fotográfica
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={formData.titulo}
              onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
              placeholder="Ej: Fuga de aceite en bomba hidráulica"
              disabled={isLoading}
            />
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              value={formData.descripcion}
              onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
              placeholder="Describe el problema o situación..."
              rows={3}
              disabled={isLoading}
            />
          </div>

          {/* Ubicación (opcional) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Ubicación (opcional)
            </Label>
            <HierarchySelector
              value={formData.hierarchyNodeId}
              onChange={handleHierarchyChange}
              minLevel={1} // Hacer opcional permitiendo nivel 1
              disabled={isLoading}
            />
            {hierarchyPath && (
              <p className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                📍 {hierarchyPath}
              </p>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags" className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Etiquetas (separadas por coma)
            </Label>
            <Input
              id="tags"
              value={formData.tags}
              onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
              placeholder="Ej: fuga, bomba, urgente"
              disabled={isLoading}
            />
          </div>

          {/* Fotos ANTES */}
          <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
            <PhotoUploader
              photos={photos}
              onPhotosChange={setPhotos}
              maxPhotos={10}
              disabled={isLoading}
              label="📷 Fotos ANTES (problema)"
              description="Sube las fotos del problema o incidencia a documentar"
            />
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p>
              <strong>💡 Consejo:</strong> Las fotos "DESPUÉS" se pueden agregar posteriormente
              cuando se corrija el problema. Esto te permite comparar el antes y después.
            </p>
          </div>

          {/* Acciones */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={!isValid || isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner className="w-4 h-4 mr-2" />
                  Guardando...
                </>
              ) : (
                'Crear Evidencia'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
