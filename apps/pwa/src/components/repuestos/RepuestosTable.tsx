import { Package, ImageIcon } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import { RepuestoActionsMenu } from './RepuestoActionsMenu'
import { InlineEditName } from './InlineEditName'

interface RepuestosTableProps {
  repuestos: Repuesto[]
  loading?: boolean
  machineId?: string
  onEdit?: (repuesto: Repuesto) => void
  onDelete?: (repuesto: Repuesto) => void
  onViewManual?: (repuesto: Repuesto) => void
  onViewPhotos?: (repuesto: Repuesto) => void
  onViewSpecs?: (repuesto: Repuesto) => void
  onViewGallery?: (repuesto: Repuesto) => void
  onRenameRepuesto?: (repuestoId: string, newName: string) => Promise<void>
}

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('es-CL') : '-';

/** Thumbnail de la primera imagen disponible */
function RepuestoThumbnail({ rep }: { rep: Repuesto }) {
  const img = rep.fotosReales?.[0] || rep.imagenesManual?.[0] || rep.gallery?.[0]
  if (!img) {
    return (
      <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
        <Package className="h-4 w-4 text-muted-foreground/50" />
      </div>
    )
  }
  return (
    <img
      src={img.url}
      alt=""
      className="h-10 w-10 rounded-lg object-cover ring-1 ring-border shrink-0"
      loading="lazy"
    />
  )
}


export function RepuestosTable({
  repuestos,
  loading,
  onEdit,
  onDelete,
  onViewManual,
  onViewPhotos,
  onViewSpecs,
  onViewGallery,
  onRenameRepuesto,
}: RepuestosTableProps) {
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
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-3 sm:hidden">
        {repuestos.map((rep) => {
          return (
            <div key={rep.id} className="bg-card border rounded-xl p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex gap-3 items-start">
                <RepuestoThumbnail rep={rep} />
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
                />
              </div>
             
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
                    <RepuestoThumbnail rep={rep} />
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
                    <span className="text-xs text-muted-foreground">
                      {rep.codigoBaader || '—'}
                    </span>
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
                  {/* Acciones */}
                  <td className="px-3 py-2.5">
                    <div className="opacity-60 group-hover:opacity-100 transition-opacity">
                      <RepuestoActionsMenu
                        repuesto={rep}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onViewManual={onViewManual}
                        onViewPhotos={onViewPhotos}
                        onViewSpecs={onViewSpecs}
                        onViewGallery={onViewGallery}
                      />
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
