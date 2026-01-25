import type { Repuesto } from '@/types/repuestos'
import { RepuestoActionsMenu } from './RepuestoActionsMenu'

interface RepuestosTableProps {
  repuestos: Repuesto[]
  loading?: boolean
  machineId?: string
  onEdit?: (repuesto: Repuesto) => void
  onDelete?: (repuesto: Repuesto) => void
  onViewManual?: (repuesto: Repuesto) => void
  onViewPhotos?: (repuesto: Repuesto) => void
  onViewHistory?: (repuesto: Repuesto) => void
  onViewSpecs?: (repuesto: Repuesto) => void
  onViewGallery?: (repuesto: Repuesto) => void
}

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('es-CL') : '-';


export function RepuestosTable({
  repuestos,
  loading,
  onEdit,
  onDelete,
  onViewManual,
  onViewPhotos,
  onViewHistory,
  onViewSpecs,
  onViewGallery,
}: RepuestosTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <span className="animate-pulse">Cargando repuestos...</span>
      </div>
    );
  }

  if (repuestos.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground border rounded-lg bg-card/50">
        No hay repuestos en esta máquina.
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 sm:hidden">
        {repuestos.map((rep) => (
          <div key={rep.id} className="bg-card border rounded-lg p-4 space-y-3 shadow-sm">
             <div className="flex justify-between items-start">
               <div>
                  <div className="text-xs font-mono text-muted-foreground mb-1">{rep.codigoSAP || 'S/C'}</div>
                  <div className="font-medium text-foreground line-clamp-2">{rep.textoBreve || 'Sin nombre'}</div>
               </div>
               <RepuestoActionsMenu
                  repuesto={rep}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onViewManual={onViewManual}
                  onViewPhotos={onViewPhotos}
                  onViewHistory={onViewHistory}
                  onViewSpecs={onViewSpecs}
                  onViewGallery={onViewGallery}
                />
             </div>
             
             {rep.descripcion && (
               <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 p-2 rounded">
                 {rep.descripcion}
               </p>
             )}

             <div className="flex items-center justify-between pt-2 border-t">
               <div className="flex flex-col">
                 <span className="text-[10px] text-muted-foreground uppercase">Valor Unit.</span>
                 <span className="font-semibold text-sm">${formatNumber(rep.valorUnitario || 0)}</span>
               </div>
               {/* Podemos agregar más info aquí si es necesario, como stock */}
               {(rep.cantidadStockBodega !== undefined && rep.cantidadStockBodega > 0) && (
                  <div className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs px-2 py-1 rounded-full font-medium">
                    Stock: {rep.cantidadStockBodega}
                  </div>
               )}
             </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-auto rounded-lg border bg-card">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Código SAP</th>
              <th className="px-4 py-3 font-semibold">Texto breve</th>
              <th className="px-4 py-3 font-semibold">Valor unitario</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {repuestos.map((rep) => (
              <tr key={rep.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">{rep.codigoSAP || '—'}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{rep.textoBreve || 'Sin nombre'}</div>
                  {rep.descripcion ? <div className="text-xs text-muted-foreground line-clamp-2 max-w-[300px]">{rep.descripcion}</div> : null}
                </td>
                <td className="px-4 py-3 text-right font-mono">${formatNumber(rep.valorUnitario || 0)}</td>
                <td className="px-4 py-3">
                  <RepuestoActionsMenu
                    repuesto={rep}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onViewManual={onViewManual}
                    onViewPhotos={onViewPhotos}
                    onViewHistory={onViewHistory}
                    onViewSpecs={onViewSpecs}
                    onViewGallery={onViewGallery}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
