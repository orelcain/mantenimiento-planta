import { useState } from 'react'
import { Package, ImageIcon, X, BookOpen, Eye, ClipboardList, Camera, Pencil, Trash2, FileText } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import { RepuestoActionsMenu } from './RepuestoActionsMenu'
import { InlineEditName } from './InlineEditName'

interface RepuestosTableProps {
  repuestos: Repuesto[]
  loading?: boolean
  machineId?: string
  isAdmin?: boolean
  onEdit?: (repuesto: Repuesto) => void
  onDelete?: (repuesto: Repuesto) => void
  onViewManual?: (repuesto: Repuesto) => void
  onViewPhotos?: (repuesto: Repuesto) => void
  onViewSpecs?: (repuesto: Repuesto) => void
  onViewGallery?: (repuesto: Repuesto) => void
  onRenameRepuesto?: (repuestoId: string, newName: string) => Promise<void>
  onSearchInManual?: (repuesto: Repuesto) => void
  onViewInManual?: (repuesto: Repuesto) => void
  onEditAnnotation?: (repuesto: Repuesto) => void
}

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('es-CL') : '-';

/** Thumbnail de la primera imagen disponible — click para preview rápido */
function RepuestoThumbnail({ rep, onPreview }: { rep: Repuesto; onPreview?: (url: string, name: string) => void }) {
  const img = rep.fotosReales?.[0] || rep.imagenesManual?.[0] || rep.gallery?.[0]
  const totalImages = (rep.fotosReales?.length || 0) + (rep.imagenesManual?.length || 0) + (rep.gallery?.length || 0)

  if (!img) {
    return (
      <div className="h-11 w-11 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 border border-dashed border-border">
        <Package className="h-4 w-4 text-muted-foreground/40" />
      </div>
    )
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onPreview?.(img.url, rep.textoBreve || rep.codigoSAP || 'Repuesto') }}
      className="relative h-11 w-11 rounded-lg overflow-hidden shrink-0 ring-1 ring-border hover:ring-primary/50 transition-all cursor-pointer group"
    >
      <img
        src={img.url}
        alt=""
        className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-200"
        loading="lazy"
      />
      {totalImages > 1 && (
        <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[8px] font-bold px-1 rounded-tl">
          +{totalImages - 1}
        </span>
      )}
    </button>
  )
}

/** Preview rápido de imagen overlay */
function QuickImagePreview({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-2xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <img
          src={url}
          alt={name}
          className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
        />
        <div className="text-center mt-2 text-white/80 text-sm truncate">{name}</div>
      </div>
    </div>
  )
}


export function RepuestosTable({
  repuestos,
  loading,
  isAdmin,
  onEdit,
  onDelete,
  onViewManual,
  onViewPhotos,
  onViewSpecs,
  onViewGallery,
  onRenameRepuesto,
  onSearchInManual,
  onViewInManual,
  onEditAnnotation,
}: RepuestosTableProps) {
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Cargando repuestos...</span>
        </div>
      </div>
    );
  }

  if (repuestos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-xl bg-card/30 gap-3">
        <Package className="h-10 w-10 text-muted-foreground/30" />
        <span>No hay repuestos en esta máquina.</span>
      </div>
    );
  }

  return (
    <>
      {/* Quick Image Preview Overlay */}
      {preview && (
        <QuickImagePreview url={preview.url} name={preview.name} onClose={() => setPreview(null)} />
      )}

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-3 sm:hidden">
        {repuestos.map((rep) => {
          return (
            <div key={rep.id} className="bg-card border rounded-xl p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex gap-3 items-start">
                <RepuestoThumbnail rep={rep} onPreview={(url, name) => setPreview({ url, name })} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-muted-foreground">{rep.codigoSAP || 'S/C'}</div>
                  {onRenameRepuesto ? (
                    <InlineEditName
                      value={rep.textoBreve || 'Sin nombre'}
                      onSave={(n) => onRenameRepuesto(rep.id, n)}
                      canEdit
                      textClassName="font-medium text-foreground line-clamp-2 text-sm"
                    />
                  ) : (
                    <div className="font-medium text-foreground line-clamp-2 text-sm">{rep.textoBreve || 'Sin nombre'}</div>
                  )}
                </div>
                <RepuestoActionsMenu
                  repuesto={rep}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onViewManual={onViewManual}
                  onViewPhotos={onViewPhotos}
                  onViewSpecs={onViewSpecs}
                  onViewGallery={onViewGallery}
                  onSearchInManual={onSearchInManual}
                  onViewInManual={onViewInManual}
                />
              </div>

              {/* Código fabricante + buscar en manual */}
              {rep.codigoBaader && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Cód. Fab:</span>
                  <span className="font-mono text-xs text-foreground bg-muted/40 px-1.5 py-0.5 rounded">{rep.codigoBaader}</span>
                  {onSearchInManual && (
                    <button
                      onClick={() => onSearchInManual(rep)}
                      className="inline-flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <BookOpen className="h-3 w-3" />
                      <span>Buscar en manual</span>
                    </button>
                  )}
                  {onViewInManual && (rep.vinculosManual?.length ?? 0) > 0 && (
                    <button
                      onClick={() => onViewInManual(rep)}
                      className="inline-flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 transition-colors"
                    >
                      <Eye className="h-3 w-3" />
                      <span>Ver en manual</span>
                    </button>
                  )}
                </div>
              )}
             
              {rep.descripcion && (
                <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/20 p-2 rounded-lg">
                  {rep.descripcion}
                </p>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor Unit.</span>
                  <span className="font-semibold text-sm">${formatNumber(rep.valorUnitario || 0)}</span>
                </div>
                {(rep.cantidadPorMaquina || 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20">
                    {rep.cantidadPorMaquina} por máq.
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-auto rounded-xl border bg-card shadow-sm">
        <table className="min-w-full divide-y divide-border">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
              <th className="pl-4 pr-2 py-3 font-semibold w-12"></th>
              <th className="px-3 py-3 font-semibold">Código SAP</th>
              <th className="px-3 py-3 font-semibold">Repuesto</th>
              <th className="px-3 py-3 font-semibold">Cód. Fabricante</th>
              <th className="px-3 py-3 font-semibold text-center">Cant/Máq</th>
              <th className="px-3 py-3 font-semibold text-right">Valor Unit.</th>
              <th className="px-3 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-sm">
            {repuestos.map((rep, idx) => {
              const hasMedia = (rep.fotosReales?.length || 0) + (rep.imagenesManual?.length || 0) + (rep.gallery?.length || 0) > 0
              return (
                <tr
                  key={rep.id}
                  className={`group hover:bg-primary/5 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}
                >
                  {/* Thumbnail */}
                  <td className="pl-4 pr-2 py-2.5">
                    <RepuestoThumbnail rep={rep} onPreview={(url, name) => setPreview({ url, name })} />
                  </td>
                  {/* Código SAP */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                      {rep.codigoSAP || '—'}
                    </span>
                  </td>
                  {/* Nombre y descripción */}
                  <td className="px-3 py-2.5 max-w-[300px]">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        {onRenameRepuesto ? (
                          <InlineEditName
                            value={rep.textoBreve || 'Sin nombre'}
                            onSave={(n) => onRenameRepuesto(rep.id, n)}
                            canEdit
                            textClassName="font-medium text-foreground truncate"
                          />
                        ) : (
                          <div className="font-medium text-foreground truncate">{rep.textoBreve || 'Sin nombre'}</div>
                        )}
                        {rep.descripcion ? (
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{rep.descripcion}</div>
                        ) : null}
                      </div>
                      {hasMedia && (
                        <ImageIcon className="h-3.5 w-3.5 text-blue-400/60 shrink-0" />
                      )}
                    </div>
                  </td>
                  {/* Código fabricante */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {rep.codigoBaader ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                          {rep.codigoBaader}
                        </span>
                        {onSearchInManual && (
                          <button
                            onClick={() => onSearchInManual(rep)}
                            title="Buscar en manual de la máquina"
                            className="text-purple-400/60 hover:text-purple-400 transition-colors"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* Cantidad por máquina */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-mono text-sm">
                      {rep.cantidadPorMaquina || 0}
                    </span>
                  </td>
                  {/* Valor unitario */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span className="font-mono text-sm">
                      ${formatNumber(rep.valorUnitario || 0)}
                    </span>
                  </td>
                  {/* Acciones — botones inline */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {onViewSpecs && (
                        <button onClick={() => onViewSpecs(rep)} title="Ficha Técnica"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                          <ClipboardList className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onViewGallery && (
                        <button onClick={() => onViewGallery(rep)} title="Galería"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-indigo-400/60 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                          <Camera className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(rep.vinculosManual?.length ?? 0) > 0 && onViewManual && (
                        <button onClick={() => onViewManual(rep)} title="Manual / Datasheet"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onSearchInManual && rep.codigoBaader && (
                        <button onClick={() => onSearchInManual(rep)} title="Buscar en Manual"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-purple-400/60 hover:text-purple-400 hover:bg-purple-500/10 transition-colors">
                          <BookOpen className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onViewInManual && (rep.vinculosManual?.length ?? 0) > 0 && (
                        <button onClick={() => onViewInManual(rep)} title="Ver en Manual (ubicado)"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-green-400/60 hover:text-green-400 hover:bg-green-500/10 transition-colors">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isAdmin && onEditAnnotation && (rep.vinculosManual?.length ?? 0) > 0 && (
                        <button onClick={() => onEditAnnotation(rep)} title="Editar ubicación en manual"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-yellow-400/60 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {onEdit && (
                        <button onClick={() => onEdit(rep)} title="Editar repuesto"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(rep)} title="Eliminar"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-destructive/40 hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
