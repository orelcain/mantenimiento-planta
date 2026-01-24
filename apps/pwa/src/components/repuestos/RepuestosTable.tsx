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
      <div className="flex items-center justify-center py-12 text-muted-foreground border rounded-lg">
        No hay repuestos en esta máquina.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border bg-card">
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
              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{rep.codigoSAP || '—'}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{rep.textoBreve || 'Sin nombre'}</div>
                {rep.descripcion ? <div className="text-xs text-muted-foreground line-clamp-2">{rep.descripcion}</div> : null}
              </td>
              <td className="px-4 py-3 text-right">${formatNumber(rep.valorUnitario || 0)}</td>
              <td className="px-4 py-3">
                <RepuestoActionsMenu
                  repuesto={rep}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onViewManual={onViewManual}
                  onViewPhotos={onViewPhotos}
                  onViewHistory={onViewHistory}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
