import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
  Download,
  Plus,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  Button,
  Badge,
  Spinner,
} from '@/components/ui'
import { BeforeAfterViewer } from './BeforeAfterViewer'
import { PhotoUploader } from './PhotoUploader'
import { useAuthStore } from '@/store'
import {
  getPhotoEvidenceById,
  updatePhotoEvidence,
  uploadMultipleEvidencePhotos,
  deletePhotoEvidence,
  markAsVerified,
} from '@/services/photoEvidence'
import type { PhotoEvidence, PhotoItem, PhotoEvidenceStatus } from '@/types'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

interface PhotoEvidenceDetailProps {
  evidenceId: string | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
  onExportPDF?: (evidence: PhotoEvidence) => void
}

const STATUS_CONFIG: Record<PhotoEvidenceStatus, { label: string; color: string; icon: React.ElementType }> = {
  pendiente: {
    label: 'Pendiente',
    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    icon: Clock,
  },
  en_proceso: {
    label: 'En Proceso',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    icon: AlertCircle,
  },
  corregida: {
    label: 'Corregida',
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
    icon: CheckCircle,
  },
  verificada: {
    label: 'Verificada',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    icon: CheckCircle,
  },
}

export function PhotoEvidenceDetail({
  evidenceId,
  open,
  onClose,
  onUpdate,
  onExportPDF,
}: PhotoEvidenceDetailProps) {
  const user = useAuthStore((state) => state.user)
  const [evidence, setEvidence] = useState<PhotoEvidence | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showAfterUploader, setShowAfterUploader] = useState(false)
  const [afterPhotos, setAfterPhotos] = useState<{ id: string; url: string; preview?: string; file?: File }[]>([])
  const [selectedPairIndex, setSelectedPairIndex] = useState(0)

  // Cargar evidencia
  useEffect(() => {
    if (evidenceId && open) {
      loadEvidence()
    } else {
      setEvidence(null)
      setIsLoading(true)
    }
  }, [evidenceId, open])

  const loadEvidence = async () => {
    if (!evidenceId) return
    
    setIsLoading(true)
    try {
      const data = await getPhotoEvidenceById(evidenceId)
      setEvidence(data)
    } catch (error) {
      logger.error('Error loading evidence', error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddAfterPhotos = async () => {
    if (!evidence || !user || afterPhotos.length === 0) return

    setIsSaving(true)
    try {
      // Subir fotos
      const photosToUpload = afterPhotos.filter(p => p.file)
      if (photosToUpload.length > 0) {
        const uploadedPhotos = await uploadMultipleEvidencePhotos(
          evidence.id,
          photosToUpload.map(p => p.file!),
          'after'
        )

        // Actualizar evidencia
        const newAfterPhotos: PhotoItem[] = uploadedPhotos.map(uploaded => ({
          id: uploaded.id,
          url: uploaded.url,
          timestamp: new Date(),
        }))

        await updatePhotoEvidence(evidence.id, {
          fotosAfter: [...evidence.fotosAfter, ...newAfterPhotos],
          status: 'corregida',
          corregidoPor: user.id,
          corregidaAt: new Date(),
        })

        setAfterPhotos([])
        setShowAfterUploader(false)
        loadEvidence()
        onUpdate()
      }
    } catch (error) {
      logger.error('Error adding after photos', error as Error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleMarkAsVerified = async () => {
    if (!evidence || !user) return

    setIsSaving(true)
    try {
      await markAsVerified(evidence.id, user.id)
      loadEvidence()
      onUpdate()
    } catch (error) {
      logger.error('Error marking as verified', error as Error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!evidence) return
    
    if (!confirm('¿Estás seguro de eliminar esta evidencia? Esta acción no se puede deshacer.')) {
      return
    }

    setIsDeleting(true)
    try {
      await deletePhotoEvidence(evidence.id)
      onUpdate()
      onClose()
    } catch (error) {
      logger.error('Error deleting evidence', error as Error)
    } finally {
      setIsDeleting(false)
    }
  }

  if (!open) return null

  const statusConfig = evidence ? STATUS_CONFIG[evidence.status] : null
  const StatusIcon = statusConfig?.icon || Clock
  const canAddAfterPhotos = evidence && (evidence.status === 'pendiente' || evidence.status === 'en_proceso')
  const canVerify = evidence && evidence.status === 'corregida' && user?.rol !== 'tecnico'
  const canExport = evidence && evidence.fotosBefore.length > 0 && evidence.fotosAfter.length > 0

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Spinner className="w-8 h-8" />
          </div>
        ) : !evidence ? (
          <div className="p-6 text-center text-muted-foreground">
            Evidencia no encontrada
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-card z-10 border-b border-border">
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-lg line-clamp-2">{evidence.titulo}</h2>
                    {evidence.hierarchyPath && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-4 h-4" />
                        {evidence.hierarchyPath}
                      </p>
                    )}
                  </div>
                  <Badge className={cn('flex-shrink-0', statusConfig?.color)}>
                    <StatusIcon className="w-3.5 h-3.5 mr-1" />
                    {statusConfig?.label}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Contenido */}
            <div className="p-4 space-y-6">
              {/* Comparación Antes/Después */}
              <div className="space-y-3">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  Comparación de Fotos
                </h3>

                {/* Navegación de pares */}
                {evidence.fotosBefore.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {evidence.fotosBefore.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedPairIndex(index)}
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                          selectedPairIndex === index
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        Par {index + 1}
                      </button>
                    ))}
                  </div>
                )}

                <BeforeAfterViewer
                  before={evidence.fotosBefore[selectedPairIndex] || null}
                  after={evidence.fotosAfter[selectedPairIndex] || null}
                />
              </div>

              {/* Agregar fotos DESPUÉS */}
              {canAddAfterPhotos && (
                <div className="space-y-3">
                  {!showAfterUploader ? (
                    <Button
                      variant="outline"
                      className="w-full border-green-500 text-green-600 hover:bg-green-50"
                      onClick={() => setShowAfterUploader(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Agregar Fotos DESPUÉS (corrección)
                    </Button>
                  ) : (
                    <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 space-y-4">
                      <PhotoUploader
                        photos={afterPhotos}
                        onPhotosChange={setAfterPhotos}
                        maxPhotos={10}
                        disabled={isSaving}
                        label="📷 Fotos DESPUÉS (corrección)"
                        description="Sube las fotos mostrando la corrección realizada"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setShowAfterUploader(false)
                            setAfterPhotos([])
                          }}
                          disabled={isSaving}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={handleAddAfterPhotos}
                          disabled={afterPhotos.length === 0 || isSaving}
                        >
                          {isSaving ? (
                            <>
                              <Spinner className="w-4 h-4 mr-2" />
                              Guardando...
                            </>
                          ) : (
                            'Guardar Fotos'
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Descripción */}
              {evidence.descripcion && (
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Descripción</h3>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    {evidence.descripcion}
                  </p>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-muted-foreground">Reportado</span>
                  <p className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {format(evidence.createdAt, "d MMM yyyy, HH:mm", { locale: es })}
                  </p>
                </div>
                {evidence.corregidaAt && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Corregido</span>
                    <p className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      {format(evidence.corregidaAt, "d MMM yyyy, HH:mm", { locale: es })}
                    </p>
                  </div>
                )}
                {evidence.verificadaAt && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Verificado</span>
                    <p className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-purple-500" />
                      {format(evidence.verificadaAt, "d MMM yyyy, HH:mm", { locale: es })}
                    </p>
                  </div>
                )}
              </div>

              {/* Tags */}
              {evidence.tags && evidence.tags.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Etiquetas</h3>
                  <div className="flex flex-wrap gap-1">
                    {evidence.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                {canVerify && (
                  <Button
                    variant="default"
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    onClick={handleMarkAsVerified}
                    disabled={isSaving}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Verificar Corrección
                  </Button>
                )}
                
                {canExport && onExportPDF && (
                  <Button
                    variant="outline"
                    onClick={() => onExportPDF(evidence)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exportar PDF
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="text-red-600 hover:bg-red-50"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Spinner className="w-4 h-4" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
