/**
 * RepuestoPhotosModal — Ver y (si isAdmin) subir/eliminar fotos reales del repuesto.
 *
 * - Fotos Reales: grid editable (upload desde celular/galería + delete). Solo admin.
 * - Imágenes Manual: solo lectura (capturas del PDF, no se editan aquí).
 * - Lightbox compartido con pan+zoom para todas las imágenes.
 */
import { useState, useRef, useCallback } from 'react'
import { Camera, Trash2, Loader2, ImageOff, Plus } from 'lucide-react'
import type { ImagenRepuesto, MachineImage } from '@/types/repuestos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import { Button } from '@/components/ui'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { ConfirmUploadDialog } from '@/components/repuestos/ConfirmUploadDialog'
import { uploadRepuestoFoto, deleteRepuestoFoto } from '@/services/storage'
import { generateId } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

interface RepuestoPhotosModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fotosReales: ImagenRepuesto[]
  imagenesManual: ImagenRepuesto[]
  /** Galería heredada (campo `gallery` del doc, ex-botón "Galería"). Solo lectura. */
  gallery?: MachineImage[]
  repuestoName: string
  /** Habilita subir / eliminar fotos reales. */
  isAdmin?: boolean
  /** machineId del doc raíz — requerido para el path de Storage cuando isAdmin. */
  machineId?: string
  /** repuestoId del doc — requerido para el path de Storage cuando isAdmin. */
  repuestoId?: string
  /** Nombre legible de la máquina/equipo — se muestra al confirmar el destino. */
  machineName?: string
  /** Código SAP del repuesto — se muestra al confirmar el destino. */
  codigoSAP?: string
  /**
   * Callback para persistir el array actualizado de fotosReales en Firestore.
   * El modal no escribe directamente: delega al hub que tiene colPathOf.
   */
  onSaveFotos?: (fotos: ImagenRepuesto[]) => Promise<void>
}

export function RepuestoPhotosModal({
  open,
  onOpenChange,
  fotosReales: fotosRealesProp,
  imagenesManual,
  gallery = [],
  repuestoName,
  isAdmin,
  machineId,
  repuestoId,
  machineName,
  codigoSAP,
  onSaveFotos,
}: RepuestoPhotosModalProps) {
  // Estado local de fotos reales (para reflejar cambios sin esperar reload global)
  const [fotosReales, setFotosReales] = useState<ImagenRepuesto[]>(fotosRealesProp)
  // Sincronizar cuando cambia el repuesto seleccionado (el modal se reutiliza)
  const prevRepId = useRef(repuestoId)
  if (prevRepId.current !== repuestoId) {
    prevRepId.current = repuestoId
    setFotosReales(fotosRealesProp)
  }

  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)

  // Archivos seleccionados pendientes de confirmación de destino (no subidos aún)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([])

  const allPhotos = [...fotosReales, ...imagenesManual]
  // El lightbox indexa sobre TODAS las imágenes visibles: fotos reales + manual + galería heredada.
  const allPhotoUrls = [...allPhotos.map((p) => p.url), ...gallery.map((g) => g.url)].filter((u): u is string => !!u)

  const canEdit = !!(isAdmin && machineId && repuestoId && onSaveFotos)

  // ── Selección: NO sube todavía — pide confirmar el destino primero ──
  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || !canEdit) return
      const arr = Array.from(files)
      setPendingFiles(arr)
      setPendingPreviews(arr.map((f) => URL.createObjectURL(f)))
      if (inputRef.current) inputRef.current.value = ''
    },
    [canEdit],
  )

  const clearPending = useCallback(() => {
    setPendingPreviews((prev) => { prev.forEach((u) => URL.revokeObjectURL(u)); return [] })
    setPendingFiles([])
  }, [])

  // ── Upload (tras confirmar destino) ──
  const handleConfirmUpload = useCallback(
    async () => {
      if (pendingFiles.length === 0 || !canEdit) return
      setUploading(true)
      try {
        const subidaPor = user ? `${user.nombre} ${user.apellido}`.trim() : ''
        const nuevas: ImagenRepuesto[] = []
        for (const file of pendingFiles) {
          const url = await uploadRepuestoFoto(machineId!, repuestoId!, file)
          nuevas.push({
            id: generateId(),
            url,
            descripcion: '',
            orden: fotosReales.length + nuevas.length,
            esPrincipal: fotosReales.length === 0 && nuevas.length === 0,
            tipo: 'real',
            createdAt: new Date(),
            formatFinal: 'webp',
            // Firestore no admite undefined → solo incluir si hay usuario
            ...(subidaPor ? { subidaPor } : {}),
          })
        }
        const updated = [...fotosReales, ...nuevas]
        await onSaveFotos!(updated)
        setFotosReales(updated)
        clearPending()
      } finally {
        setUploading(false)
      }
    },
    [pendingFiles, canEdit, user, fotosReales, machineId, repuestoId, onSaveFotos, clearPending],
  )

  // ── Delete ──
  const handleDelete = useCallback(
    async (foto: ImagenRepuesto) => {
      if (!canEdit) return
      if (!confirm(`¿Eliminar esta foto?`)) return
      setDeletingId(foto.id)
      try {
        await deleteRepuestoFoto(foto.url)
        const updated = fotosReales.filter((f) => f.id !== foto.id)
        // Si era principal y quedan fotos → marcar la primera como principal
        const withPrincipal = updated.map((f, i) => ({
          ...f,
          esPrincipal: foto.esPrincipal && i === 0 ? true : f.esPrincipal,
        }))
        await onSaveFotos!(withPrincipal)
        setFotosReales(withPrincipal)
      } finally {
        setDeletingId(null)
      }
    },
    [canEdit, fotosReales, onSaveFotos],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          // Con el lightbox abierto ENCIMA, un tap/Esc sobre él contaría como
          // "interacción afuera" del Dialog y cerraría este modal por debajo
          onInteractOutside={(e) => { if (lightboxIndex !== null) e.preventDefault() }}
          onEscapeKeyDown={(e) => { if (lightboxIndex !== null) e.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle className="text-base truncate">
              Fotos — {repuestoName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Fotos Reales ── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Fotos reales
                  {fotosReales.length > 0 && (
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      ({fotosReales.length})
                    </span>
                  )}
                </h3>
                {canEdit && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => inputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="h-3.5 w-3.5" />
                      )}
                      {uploading ? 'Subiendo…' : 'Agregar foto'}
                    </Button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                  </>
                )}
              </div>

              {fotosReales.length === 0 ? (
                <div
                  className="flex h-24 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border text-muted-foreground/60 cursor-pointer hover:border-primary/40 hover:text-muted-foreground transition"
                  onClick={() => canEdit && inputRef.current?.click()}
                >
                  {canEdit ? (
                    <>
                      <Plus className="h-5 w-5" />
                      <span className="text-xs">Toca para agregar la primera foto</span>
                    </>
                  ) : (
                    <>
                      <ImageOff className="h-5 w-5" />
                      <span className="text-xs">Sin fotos reales</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {fotosReales.map((foto, idx) => (
                    <div
                      key={foto.id || `real-${idx}`}
                      className="group relative aspect-square overflow-hidden rounded-card border border-border bg-muted"
                    >
                      <img
                        src={foto.url}
                        alt={`Foto ${idx + 1}`}
                        className="h-full w-full cursor-pointer object-cover transition group-hover:scale-105"
                        onClick={() => {
                          const i = allPhotoUrls.indexOf(foto.url)
                          setLightboxIndex(i >= 0 ? i : 0)
                        }}
                      />
                      {/* Overlay hover */}
                      <div className="absolute inset-0 flex items-start justify-end bg-black/0 p-1 transition group-hover:bg-black/20">
                        {canEdit && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(foto) }}
                            disabled={deletingId === foto.id}
                            className="rounded-ctl bg-black/60 p-1 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"
                            title="Eliminar foto"
                          >
                            {deletingId === foto.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                      {/* Badge principal */}
                      {foto.esPrincipal && (
                        <span className="absolute bottom-1 left-1 rounded-ctl bg-primary/80 px-1 py-0.5 text-[9px] font-bold text-primary-foreground">
                          Principal
                        </span>
                      )}
                    </div>
                  ))}
                  {/* Celda "+" para agregar más */}
                  {canEdit && (
                    <button
                      onClick={() => inputRef.current?.click()}
                      disabled={uploading}
                      className="flex aspect-square items-center justify-center rounded-card border border-dashed border-border text-muted-foreground/50 transition hover:border-primary/40 hover:text-primary/60"
                    >
                      {uploading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Plus className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Imágenes Manual (solo lectura) ── */}
            {imagenesManual.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  Imágenes del manual
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    ({imagenesManual.length}) — solo lectura
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {imagenesManual.map((img, idx) => (
                    <div
                      key={`manual-${idx}`}
                      className="group relative aspect-square cursor-pointer overflow-hidden rounded-card border border-border bg-muted"
                      onClick={() => {
                        if (!img.url) return
                        const i = allPhotoUrls.indexOf(img.url)
                        setLightboxIndex(i >= 0 ? i : 0)
                      }}
                    >
                      {img.url ? (
                        <img
                          src={img.url}
                          alt={`Manual ${idx + 1}`}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          Sin imagen
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Galería heredada (ex-botón "Galería") — solo lectura ── */}
            {gallery.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  Galería (fotos anteriores)
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    ({gallery.length}) — solo lectura
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {gallery.map((img, idx) => (
                    <div
                      key={img.id || `gallery-${idx}`}
                      className="group relative aspect-square cursor-pointer overflow-hidden rounded-card border border-border bg-muted"
                      onClick={() => {
                        if (!img.url) return
                        const i = allPhotoUrls.indexOf(img.url)
                        setLightboxIndex(i >= 0 ? i : 0)
                      }}
                    >
                      <img
                        src={img.url}
                        alt={`Galería ${idx + 1}`}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allPhotos.length === 0 && gallery.length === 0 && !canEdit && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hay fotos disponibles para este repuesto.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {lightboxIndex !== null && allPhotoUrls.length > 0 && (
        <ImageLightbox
          photos={allPhotoUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Confirmar destino antes de subir (evita fotos en el repuesto equivocado) */}
      <ConfirmUploadDialog
        open={pendingFiles.length > 0}
        previews={pendingPreviews}
        repuestoName={repuestoName}
        machineName={machineName}
        codigoSAP={codigoSAP}
        uploading={uploading}
        onConfirm={handleConfirmUpload}
        onCancel={clearPending}
      />
    </>
  )
}
