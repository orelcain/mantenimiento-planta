/**
 * RepuestoPhotosModal — Ver y (si isAdmin) subir/eliminar fotos reales del repuesto.
 *
 * - Fotos Reales: grid editable (upload desde celular/galería + delete). Solo admin.
 * - Imágenes Manual: solo lectura (capturas del PDF, no se editan aquí).
 * - Lightbox compartido con pan+zoom para todas las imágenes.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
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
import { uploadRepuestoFoto, deleteRepuestoFoto, SIN_EQUIPO_STORAGE_SEGMENT } from '@/services/storage'
import { ReAuthConfirmDialog } from '@/components/admin/ReAuthConfirmDialog'
import { generateId } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'

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
  /**
   * nodeId del equipo — segmento del path de Storage. Puede venir vacío: en el
   * modelo plano un repuesto puede no tener equipo (`equipos: []`, fila
   * "Transversal"/"Sin equipo"), y esos también tienen que poder llevar fotos.
   */
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
  /** Persistir `imagenesManual` tras quitar un recorte del manual (solo admin). */
  onSaveImagenesManual?: (imgs: ImagenRepuesto[]) => Promise<void>
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
  onSaveImagenesManual,
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
  const { toast } = useToast()

  // Archivos seleccionados pendientes de confirmación de destino (no subidos aún)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([])

  const [imgsManual, setImgsManual] = useState<ImagenRepuesto[]>(imagenesManual)
  useEffect(() => { setImgsManual(imagenesManual) }, [imagenesManual])
  const allPhotos = [...fotosReales, ...imgsManual]
  // El lightbox indexa sobre TODAS las imágenes visibles: fotos reales + manual + galería heredada.
  const allPhotoUrls = [...allPhotos.map((p) => p.url), ...gallery.map((g) => g.url)].filter((u): u is string => !!u)

  // ⚠ NO exigir machineId: 3.025 de 7.673 repuestos (39 %) no tienen equipo
  // asignado y con esa condición el modal quedaba en solo-lectura sin avisar
  // (caso real 08-09-2026: "no me deja cargar imágenes a los repuestos").
  const canEdit = !!(isAdmin && repuestoId && onSaveFotos)

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
          // Sin equipo, el segmento del path lleva un marcador fijo para seguir
          // cumpliendo la regla de Storage repuestos/{machineId}/{repuestoId}/fotos/.
          const url = await uploadRepuestoFoto(machineId || SIN_EQUIPO_STORAGE_SEGMENT, repuestoId!, file)
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
      } catch (error) {
        // Sin esto el error muere mudo y el botón parece no hacer nada
        // (caso real: storage/unauthorized por regla faltante).
        toast({
          title: 'No se pudieron subir las fotos',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        })
      } finally {
        setUploading(false)
      }
    },
    [pendingFiles, canEdit, user, fotosReales, machineId, repuestoId, onSaveFotos, clearPending, toast],
  )

  // ── Quitar (foto real o recorte del manual) ──
  // Pide la clave de la cuenta (ReAuthConfirmDialog): una foto borrada no se recupera.
  const [porQuitar, setPorQuitar] = useState<{ tipo: 'real' | 'manual'; img: ImagenRepuesto } | null>(null)
  const puedeQuitarManual = canEdit && !!onSaveImagenesManual

  const quitarConfirmado = useCallback(async () => {
    if (!porQuitar) return
    const { tipo, img } = porQuitar
    setDeletingId(img.id || img.url)
    try {
      if (img.url) await deleteRepuestoFoto(img.url)
      const lista = tipo === 'real' ? fotosReales : imgsManual
      const restantes = lista.filter((f) => (f.id || f.url) !== (img.id || img.url))
      // Si era la principal y quedan fotos → la primera pasa a principal.
      const conPrincipal = restantes.map((f, i) => ({ ...f, orden: i, esPrincipal: img.esPrincipal && i === 0 ? true : f.esPrincipal }))
      if (tipo === 'real') { await onSaveFotos!(conPrincipal); setFotosReales(conPrincipal) }
      else { await onSaveImagenesManual!(conPrincipal); setImgsManual(conPrincipal) }
    } catch (error) {
      // Sin catch el fallo moría mudo y la foto «no se borraba» sin explicación.
      toast({
        title: 'No se pudo quitar la foto',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
      setPorQuitar(null)
    }
  }, [porQuitar, fotosReales, imgsManual, onSaveFotos, onSaveImagenesManual, toast])

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
                    <span className="ml-1.5 text-caption font-normal text-muted-foreground">
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
                            onClick={(e) => { e.stopPropagation(); setPorQuitar({ tipo: 'real', img: foto }) }}
                            disabled={deletingId === foto.id}
                            aria-label={`Quitar foto ${idx + 1}`}
                            className="rounded-ctl bg-black/60 p-2 text-ink-crit transition hover:brightness-95 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                            title="Quitar foto (pide la clave)"
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
                        <span className="absolute bottom-1 left-1 rounded-ctl bg-primary/80 px-1 py-0.5 text-caption font-bold text-primary-foreground">
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
            {imgsManual.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  Imágenes del manual
                  <span className="ml-1.5 text-caption font-normal text-muted-foreground">
                    ({imgsManual.length}){puedeQuitarManual ? '' : ' — solo lectura'}
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {imgsManual.map((img, idx) => (
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
                      <div className="absolute inset-0 flex items-start justify-end bg-black/0 p-1 transition group-hover:bg-black/20">
                        {puedeQuitarManual && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPorQuitar({ tipo: 'manual', img }) }}
                            disabled={deletingId === (img.id || img.url)}
                            aria-label={`Quitar imagen del manual ${idx + 1}`}
                            className="rounded-ctl bg-black/60 p-2 text-ink-crit transition hover:brightness-95 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                            title="Quitar imagen del manual (pide la clave)"
                          >
                            {deletingId === (img.id || img.url) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
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
                  <span className="ml-1.5 text-caption font-normal text-muted-foreground">
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
      <ReAuthConfirmDialog
        elevado
        open={!!porQuitar}
        onOpenChange={(o) => { if (!o) setPorQuitar(null) }}
        reason={porQuitar ? `para quitar ${porQuitar.tipo === 'real' ? 'esta foto' : 'esta imagen del manual'} de «${repuestoName}»` : ''}
        onConfirmed={quitarConfirmado}
      />
    </>
  )
}
