/**
 * RepuestoGalleryModal v2.48.94
 *
 * Modal independiente para la Galería de imágenes de un repuesto.
 * Separado de la Ficha Técnica.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Camera, Trash2, Loader2, Save, ImageIcon,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogTitle, Button, Badge,
} from '@/components/ui'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { Repuesto, MachineImage } from '@/types/repuestos'
import { useStorage } from '@/hooks/repuestos/useStorage'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'

// ─── Props ──────────────────────────────────────────────────

interface RepuestoGalleryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repuesto: Repuesto | null
  machineId?: string
  readOnly?: boolean
  onSave?: (repuestoId: string, gallery: MachineImage[]) => Promise<void>
}

// ─── Helpers ────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  plate: 'Placa',
  equipment: 'Equipo',
  part: 'Repuesto',
  other: 'Otro',
}

// ─── Component ──────────────────────────────────────────────

export function RepuestoGalleryModal({
  open,
  onOpenChange,
  repuesto,
  machineId,
  readOnly = false,
  onSave,
}: RepuestoGalleryModalProps) {
  const [gallery, setGallery] = useState<MachineImage[]>([])
  const [saving, setSaving] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const { uploadImage, uploading } = useStorage(machineId || null)

  useEffect(() => {
    if (open && repuesto) {
      setGallery(repuesto.gallery ? [...repuesto.gallery] : [])
    }
  }, [open, repuesto])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !repuesto) return
    const file = e.target.files[0]
    if (!file) return

    if (!machineId) {
      toast({ title: 'Error', description: 'Falta ID de máquina para subir fotos', variant: 'destructive' })
      return
    }

    try {
      const uploadedImg = await uploadImage(file, repuesto.id, 'real')
      const newItem: MachineImage = {
        id: uploadedImg.id,
        url: uploadedImg.url,
        type: 'equipment',
        timestamp: Date.now(),
        notes: '',
        size: uploadedImg.sizeFinal,
        format: uploadedImg.formatFinal,
        dimensions:
          uploadedImg.width && uploadedImg.height
            ? { width: uploadedImg.width, height: uploadedImg.height }
            : undefined,
      }
      setGallery((prev) => [newItem, ...prev])
      toast({ title: 'Imagen subida', description: 'La imagen se agregó a la galería' })
    } catch (err) {
      logger.error('Error subiendo imagen a galería', err instanceof Error ? err : new Error(String(err)))
      toast({ title: 'Error subiendo imagen', description: 'Intente nuevamente', variant: 'destructive' })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteImage = (imgId: string) => {
    setGallery((prev) => prev.filter((img) => img.id !== imgId))
  }

  const handleSave = async () => {
    if (!repuesto || !onSave) return
    setSaving(true)
    try {
      await onSave(repuesto.id, gallery)
      onOpenChange(false)
    } catch (err) {
      logger.error('Error saving gallery', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  if (!repuesto) return null

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="p-4 border-b bg-muted/20 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ImageIcon className="w-4 h-4" />
            <span className="text-xs font-mono uppercase tracking-wider">Galería de Imágenes</span>
          </div>
          <DialogTitle className="text-lg font-bold truncate pr-8">
            {repuesto.textoBreve || 'Repuesto sin nombre'}
          </DialogTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span>SAP: {repuesto.codigoSAP || 'N/A'}</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              {gallery.length} {gallery.length === 1 ? 'imagen' : 'imágenes'}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileSelect}
          />

          {/* Upload zone */}
          {!readOnly && (
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed border-muted-foreground/25 hover:border-blue-500/50 hover:bg-muted/10 rounded-lg p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                uploading ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <div className="bg-muted p-3 rounded-full mb-3">
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                ) : (
                  <Camera className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm font-medium">
                {uploading ? 'Subiendo imagen...' : 'Click para subir nuevas fotos'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Placas, detalles o estado actual</p>
            </div>
          )}

          {/* Image grid */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              Imágenes Guardadas ({gallery.length})
            </h3>
            {gallery.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay imágenes en la galería
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {gallery.map((img, idx) => (
                  <div
                    key={img.id}
                    className="group relative aspect-square bg-muted rounded-lg overflow-hidden border border-border cursor-pointer"
                    onClick={() => setLightboxIndex(idx)}
                  >
                    <img src={img.url} alt="Gallery item" className="w-full h-full object-cover" loading="lazy" />

                    {/* Overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white truncate max-w-[70%]">
                          {new Date(img.timestamp).toLocaleDateString()}
                        </span>
                        {!readOnly && (
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteImage(img.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-col text-[9px] text-gray-300 font-mono leading-tight">
                        {img.dimensions && (
                          <span>
                            {img.dimensions.width}x{img.dimensions.height}
                          </span>
                        )}
                        {(img.size || img.format) && (
                          <span>
                            {img.size ? `${Math.round(img.size / 1024)}KB` : ''}
                            {img.format ? ` • ${img.format.toUpperCase()}` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Type badge */}
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur rounded text-[10px] text-white font-medium uppercase">
                      {TYPE_LABELS[img.type] || img.type}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-background flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> Guardar Cambios
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
    {/* Lightbox con pan+zoom para ampliar las miniaturas de la galería */}
    {lightboxIndex !== null && gallery.length > 0 && (
      <ImageLightbox
        photos={gallery.map(g => g.url)}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    )}
    </>
  )
}
