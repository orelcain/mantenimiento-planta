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
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
} from '@/components/ui'
import { BeforeAfterViewer } from './BeforeAfterViewer'
import { PhotoUploader } from './PhotoUploader'
import { ImageAnnotatorDialog } from './ImageAnnotatorDialog'
import { useAuthStore } from '@/store'
import {
  getPhotoEvidenceById,
  deletePhotoEvidence,
  removePhoto,
  markAsVerified,
  unmarkAsVerified,
  updatePhotoEvidencePairMeta,
  upsertEvidencePhotoAtIndex,
  deleteEvidencePair,
} from '@/services/photoEvidence'
import type { PhotoEvidence, PhotoEvidenceStatus } from '@/types'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

interface PhotoEvidenceDetailProps {
  evidenceId: string | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
  onExportPDF?: (evidence: PhotoEvidence) => void
  userDisplayNameById?: Record<string, string>
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
  userDisplayNameById,
}: PhotoEvidenceDetailProps) {
    const resolveUser = (value: unknown): string => {
      const raw = typeof value === 'string' ? value : ''
      if (!raw) return ''
      return userDisplayNameById?.[raw] ?? raw
    }
  const safeFormat = (date: Date, fmt: string) => {
    try {
      return format(date, fmt, { locale: es })
    } catch {
      return ''
    }
  }
  const user = useAuthStore((state) => state.user)
  const [evidence, setEvidence] = useState<PhotoEvidence | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedPairIndex, setSelectedPairIndex] = useState(0)
  const [pairUbicacion, setPairUbicacion] = useState('')
  const [pairDescripcion, setPairDescripcion] = useState('')
  const [pairEquipo, setPairEquipo] = useState('')
  const [pairOT, setPairOT] = useState('')
  const [pairCriticidad, setPairCriticidad] = useState<'baja' | 'media' | 'alta' | 'critica' | ''>('')
  const [pairTipoFalla, setPairTipoFalla] = useState('')
  const [pairBeforePhoto, setPairBeforePhoto] = useState<{ id: string; url: string; preview?: string; file?: File }[]>([])
  const [pairAfterPhoto, setPairAfterPhoto] = useState<{ id: string; url: string; preview?: string; file?: File }[]>([])

  const [pairAntesAnotada, setPairAntesAnotada] = useState(false)
  const [pairDespuesAnotada, setPairDespuesAnotada] = useState(false)

  const [annotateOpen, setAnnotateOpen] = useState(false)
  const [annotateTarget, setAnnotateTarget] = useState<'before' | 'after' | null>(null)
  const [annotateSourceUrl, setAnnotateSourceUrl] = useState<string | null>(null)
  const [annotatePreviewUrl, setAnnotatePreviewUrl] = useState<string | null>(null)

  // Cargar evidencia
  useEffect(() => {
    if (evidenceId && open) {
      loadEvidence()
    } else {
      setEvidence(null)
      setIsLoading(true)
    }
  }, [evidenceId, open])

  useEffect(() => {
    if (!evidence) return
    const meta = evidence.pairMeta?.[selectedPairIndex]
    setPairUbicacion(meta?.ubicacion ?? '')
    setPairDescripcion(meta?.descripcion ?? '')
    setPairEquipo(meta?.equipo ?? '')
    setPairOT(meta?.ot ?? '')
    setPairCriticidad(meta?.criticidad ?? '')
    setPairTipoFalla(meta?.tipoFalla ?? '')
    setPairAntesAnotada(Boolean(meta?.anotadaAntes))
    setPairDespuesAnotada(Boolean(meta?.anotadaDespues))

    const before = evidence.fotosBefore[selectedPairIndex]
    const after = evidence.fotosAfter[selectedPairIndex]
    setPairBeforePhoto(before ? [{ id: before.id, url: before.url }] : [])
    setPairAfterPhoto(after ? [{ id: after.id, url: after.url }] : [])
  }, [evidence, selectedPairIndex])

  useEffect(() => {
    return () => {
      if (annotatePreviewUrl) {
        URL.revokeObjectURL(annotatePreviewUrl)
      }
    }
  }, [annotatePreviewUrl])

  const openAnnotator = (target: 'before' | 'after') => {
    const current = target === 'before' ? pairBeforePhoto[0] : pairAfterPhoto[0]
    const src = current?.preview || current?.url
    if (!src) return
    setAnnotateTarget(target)
    setAnnotateSourceUrl(src)
    setAnnotateOpen(true)
  }

  const applyAnnotatedFile = (file: File) => {
    const nextPreview = URL.createObjectURL(file)
    if (annotatePreviewUrl) URL.revokeObjectURL(annotatePreviewUrl)
    setAnnotatePreviewUrl(nextPreview)

    if (annotateTarget === 'before') {
      const current = pairBeforePhoto[0]
      setPairBeforePhoto([
        {
          id: current?.id || 'before',
          url: current?.url || '',
          preview: nextPreview,
          file,
        },
      ])
      setPairAntesAnotada(true)
    } else if (annotateTarget === 'after') {
      const current = pairAfterPhoto[0]
      setPairAfterPhoto([
        {
          id: current?.id || 'after',
          url: current?.url || '',
          preview: nextPreview,
          file,
        },
      ])
      setPairDespuesAnotada(true)
    }

    setAnnotateOpen(false)
    setAnnotateTarget(null)
    setAnnotateSourceUrl(null)
  }

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

  const handleUnverify = async () => {
    if (!evidence || !user) return

    if (!confirm('¿Quitar la verificación para poder editar/ajustar la evidencia?')) {
      return
    }

    setIsSaving(true)
    try {
      await unmarkAsVerified(evidence.id)
      loadEvidence()
      onUpdate()
    } catch (error) {
      logger.error('Error removing verification', error as Error)
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
  const canVerify = evidence && evidence.status === 'corregida' && user?.rol !== 'tecnico'
  const canUnverify = evidence && evidence.status === 'verificada' && user?.rol !== 'tecnico'
  const canExport = evidence && evidence.fotosBefore.length > 0 && evidence.fotosAfter.length > 0
  const canEditPairMeta = evidence && (evidence.status === 'pendiente' || evidence.status === 'en_proceso' || evidence.status === 'corregida')

  const handleSavePair = async () => {
    if (!evidence || !user) return

    setIsSaving(true)
    try {
      // 1) Metadatos del par
      const metaUbicacion = pairUbicacion.trim() || undefined
      const metaDescripcion = pairDescripcion.trim() || undefined
      const metaEquipo = pairEquipo.trim() || undefined
      const metaOT = pairOT.trim() || undefined
      const metaCriticidad = pairCriticidad || undefined
      const metaTipoFalla = pairTipoFalla.trim() || undefined
      const metaAnotadaAntes = pairAntesAnotada || undefined
      const metaAnotadaDespues = pairDespuesAnotada || undefined
      const existingMeta = evidence.pairMeta?.[selectedPairIndex]
      const shouldPersistMeta = Boolean(
        metaUbicacion ||
          metaDescripcion ||
          metaEquipo ||
          metaOT ||
          metaCriticidad ||
          metaTipoFalla ||
          metaAnotadaAntes ||
          metaAnotadaDespues ||
          existingMeta
      )
      if (shouldPersistMeta) {
        await updatePhotoEvidencePairMeta(evidence.id, selectedPairIndex, {
          ubicacion: metaUbicacion,
          descripcion: metaDescripcion,
          equipo: metaEquipo,
          ot: metaOT,
          criticidad: metaCriticidad,
          tipoFalla: metaTipoFalla,
          anotadaAntes: metaAnotadaAntes,
          anotadaDespues: metaAnotadaDespues,
        })
      }

      // 2) Foto ANTES (reemplazar / agregar / eliminar)
      const currentBefore = evidence.fotosBefore[selectedPairIndex]
      const desiredBefore = pairBeforePhoto[0]
      if (!desiredBefore && currentBefore) {
        await removePhoto(evidence.id, currentBefore.id, 'before')
        setPairAntesAnotada(false)
      } else if (desiredBefore?.file) {
        await upsertEvidencePhotoAtIndex(evidence.id, selectedPairIndex, 'before', desiredBefore.file, user.id)
      }

      // 3) Foto DESPUÉS (reemplazar / agregar / eliminar)
      const currentAfter = evidence.fotosAfter[selectedPairIndex]
      const desiredAfter = pairAfterPhoto[0]
      if (!desiredAfter && currentAfter) {
        await removePhoto(evidence.id, currentAfter.id, 'after')
        setPairDespuesAnotada(false)
      } else if (desiredAfter?.file) {
        await upsertEvidencePhotoAtIndex(evidence.id, selectedPairIndex, 'after', desiredAfter.file, user.id)
      }

      await loadEvidence()
      onUpdate()
    } catch (error) {
      const message = (error as Error)?.message || 'Error guardando el par'
      logger.error('Error saving pair', error as Error)
      alert(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeletePair = async () => {
    if (!evidence) return

    const maxPairs = Math.max(evidence.fotosBefore.length, evidence.fotosAfter.length, evidence.pairMeta?.length ?? 0)
    if (maxPairs === 0) return

    if (!confirm(`¿Eliminar el Par ${selectedPairIndex + 1} completo (fotos y datos)?`)) {
      return
    }

    setIsSaving(true)
    try {
      await deleteEvidencePair(evidence.id, selectedPairIndex)
      const nextMax = Math.max(maxPairs - 1, 0)
      const nextIndex = nextMax === 0 ? 0 : Math.min(selectedPairIndex, nextMax - 1)
      setSelectedPairIndex(nextIndex)
      await loadEvidence()
      onUpdate()
    } catch (error) {
      logger.error('Error deleting pair', error as Error)
      alert((error as Error)?.message || 'Error eliminando el par')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{evidence?.titulo ?? 'Detalle de evidencia'}</DialogTitle>
        </DialogHeader>
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
                {(() => {
                  const maxPairs = Math.max(evidence.fotosBefore.length, evidence.fotosAfter.length, evidence.pairMeta?.length ?? 0)
                  if (maxPairs <= 1 && !canEditPairMeta) return null

                  return (
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      {Array.from({ length: Math.max(maxPairs, 1) }).map((_, index) => (
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

                      {canEditPairMeta && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setSelectedPairIndex(maxPairs)}
                          disabled={isSaving}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Nuevo par
                        </Button>
                      )}
                    </div>
                  )
                })()}

                <BeforeAfterViewer
                  before={evidence.fotosBefore[selectedPairIndex] || null}
                  after={evidence.fotosAfter[selectedPairIndex] || null}
                />

                {canEditPairMeta && (
                  <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30 space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
                          <PhotoUploader
                            photos={pairBeforePhoto}
                            onPhotosChange={(p) => {
                              setPairBeforePhoto(p.slice(0, 1))
                              setPairAntesAnotada(false)
                            }}
                            maxPhotos={1}
                            disabled={isSaving}
                            label="📷 Foto ANTES (este par)"
                            description="Para reemplazar: elimina y vuelve a agregar"
                          />
                          <div className="mt-2 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAnnotator('before')}
                              disabled={isSaving || pairBeforePhoto.length === 0}
                            >
                              Anotar
                            </Button>
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
                          <PhotoUploader
                            photos={pairAfterPhoto}
                            onPhotosChange={(p) => {
                              setPairAfterPhoto(p.slice(0, 1))
                              setPairDespuesAnotada(false)
                            }}
                            maxPhotos={1}
                            disabled={isSaving}
                            label="📷 Foto DESPUÉS (este par)"
                            description="Para reemplazar: elimina y vuelve a agregar"
                          />
                          <div className="mt-2 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAnnotator('after')}
                              disabled={isSaving || pairAfterPhoto.length === 0}
                            >
                              Anotar
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>Ubicación (solo para este par)</Label>
                        <Input
                          value={pairUbicacion}
                          onChange={(e) => setPairUbicacion(e.target.value)}
                          placeholder="Ej: Línea 2 > Bomba 3 (lado motor)"
                          disabled={isSaving}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Equipo (solo para este par)</Label>
                          <Input
                            value={pairEquipo}
                            onChange={(e) => setPairEquipo(e.target.value)}
                            placeholder="Ej: Bomba 3"
                            disabled={isSaving}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label>OT (solo para este par)</Label>
                          <Input
                            value={pairOT}
                            onChange={(e) => setPairOT(e.target.value)}
                            placeholder="Ej: OT-12345"
                            disabled={isSaving}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label>Criticidad (solo para este par)</Label>
                          <Select
                            value={pairCriticidad || '__none__'}
                            onValueChange={(v) => setPairCriticidad((v === '__none__' ? '' : v) as typeof pairCriticidad)}
                          >
                            <SelectTrigger disabled={isSaving}>
                              <SelectValue placeholder="Seleccionar criticidad" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Sin definir</SelectItem>
                              <SelectItem value="baja">Baja</SelectItem>
                              <SelectItem value="media">Media</SelectItem>
                              <SelectItem value="alta">Alta</SelectItem>
                              <SelectItem value="critica">Crítica</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label>Tipo de falla (solo para este par)</Label>
                          <Input
                            value={pairTipoFalla}
                            onChange={(e) => setPairTipoFalla(e.target.value)}
                            placeholder="Ej: Fuga, desgaste, vibración"
                            disabled={isSaving}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>Descripción / observación (solo para este par)</Label>
                        <Textarea
                          value={pairDescripcion}
                          onChange={(e) => setPairDescripcion(e.target.value)}
                          placeholder="Qué se observó y qué se corrigió en este par"
                          disabled={isSaving}
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSavePair}
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <>
                            <Spinner className="w-4 h-4 mr-2" />
                            Guardando...
                          </>
                        ) : (
                          'Guardar cambios del par'
                        )}
                      </Button>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500 text-red-600 hover:bg-red-50"
                        onClick={handleDeletePair}
                        disabled={isSaving}
                      >
                        Eliminar par completo
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <ImageAnnotatorDialog
                open={annotateOpen}
                title={annotateTarget === 'after' ? 'Anotar foto DESPUÉS' : 'Anotar foto ANTES'}
                sourceUrl={annotateSourceUrl}
                onClose={() => {
                  setAnnotateOpen(false)
                  setAnnotateTarget(null)
                  setAnnotateSourceUrl(null)
                }}
                onSave={applyAnnotatedFile}
              />

              {/* Nota: las fotos DESPUÉS ahora se editan por par (arriba) */}

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
                    {safeFormat(evidence.createdAt, "d MMM yyyy, HH:mm")}
                  </p>
                  {evidence.reportadoPor && (
                    <p className="text-xs text-muted-foreground">
                      Por: {resolveUser(evidence.reportadoPor)}
                    </p>
                  )}
                </div>
                {evidence.corregidaAt && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Corregido</span>
                    <p className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      {safeFormat(evidence.corregidaAt, "d MMM yyyy, HH:mm")}
                    </p>
                    {evidence.corregidoPor && (
                      <p className="text-xs text-muted-foreground">
                        Por: {resolveUser(evidence.corregidoPor)}
                      </p>
                    )}
                  </div>
                )}
                {evidence.verificadaAt && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Verificado</span>
                    <p className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-purple-500" />
                      {safeFormat(evidence.verificadaAt, "d MMM yyyy, HH:mm")}
                    </p>
                    {evidence.verificadoPor && (
                      <p className="text-xs text-muted-foreground">
                        Por: {resolveUser(evidence.verificadoPor)}
                      </p>
                    )}
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

                {canUnverify && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleUnverify}
                    disabled={isSaving}
                  >
                    Quitar verificación
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
