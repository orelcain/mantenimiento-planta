import type { Repuesto } from '@/types/repuestos'
import type { TagAsignado } from '@/types/tags'
import { getTagNombre, isTagAsignado } from '@/types/tags'
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

const getStockTotal = (repuesto: Repuesto) => {
  const stockFromTags = Array.isArray(repuesto.tags)
    ? repuesto.tags.reduce((sum, tag) => {
        if (isTagAsignado(tag) && tag.tipo === 'stock') {
          return sum + (tag.cantidad || 0);
        }
        return sum;
      }, 0)
    : 0;

  if (stockFromTags > 0) return stockFromTags;
  return repuesto.cantidadStockBodega || 0;
};

const getSolicitudTotal = (repuesto: Repuesto) => {
  const solicitudFromTags = Array.isArray(repuesto.tags)
    ? repuesto.tags.reduce((sum, tag) => {
        if (isTagAsignado(tag) && tag.tipo === 'solicitud') {
          return sum + (tag.cantidad || 0);
        }
        return sum;
      }, 0)
    : 0;

  if (solicitudFromTags > 0) return solicitudFromTags;
  return repuesto.cantidadSolicitada || 0;
};

const TagsBadge = ({ tags }: { tags: (string | TagAsignado)[] }) => {
  if (!tags || tags.length === 0) return <span className="text-xs text-muted-foreground">Sin tags</span>;
  const parsed = tags.map((t) => ({ nombre: getTagNombre(t), tipo: isTagAsignado(t) ? t.tipo : undefined }));
  return (
    <div className="flex flex-wrap gap-1">
      {parsed.slice(0, 4).map((tag, idx) => (
        <span
          key={`${tag.nombre}-${idx}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-muted text-foreground/80"
        >
          <span className="font-semibold">{tag.tipo === 'stock' ? 'ST' : tag.tipo === 'solicitud' ? 'SQ' : 'TG'}</span>
          <span className="truncate max-w-[120px]">{tag.nombre}</span>
        </span>
      ))}
      {parsed.length > 4 ? (
        <span className="text-[11px] text-muted-foreground">+{parsed.length - 4}</span>
      ) : null}
    </div>
  );
};

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
            <th className="px-4 py-3 font-semibold">Solicitado</th>
            <th className="px-4 py-3 font-semibold">Stock</th>
            <th className="px-4 py-3 font-semibold">Valor unitario</th>
            <th className="px-4 py-3 font-semibold">Tags</th>
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
              <td className="px-4 py-3 text-right">{formatNumber(getSolicitudTotal(rep))}</td>
              <td className="px-4 py-3 text-right">{formatNumber(getStockTotal(rep))}</td>
              <td className="px-4 py-3 text-right">${formatNumber(rep.valorUnitario || 0)}</td>
              <td className="px-4 py-3"><TagsBadge tags={rep.tags || []} /></td>
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
