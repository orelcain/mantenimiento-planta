import { FileText, Image, History, Pencil, Trash2 } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import { Button } from '@/components/ui'

interface RepuestoActionsProps {
  repuesto: Repuesto
  onEdit?: (repuesto: Repuesto) => void
  onDelete?: (repuesto: Repuesto) => void
  onViewManual?: (repuesto: Repuesto) => void
  onViewPhotos?: (repuesto: Repuesto) => void
  onViewHistory?: (repuesto: Repuesto) => void
}

export function RepuestoActionsMenu({
  repuesto,
  onEdit,
  onDelete,
  onViewManual,
  onViewPhotos,
  onViewHistory,
}: RepuestoActionsProps) {
  const hasManual = (repuesto.vinculosManual?.length || 0) > 0
  const hasPhotos = (repuesto.fotosReales?.length || 0) > 0
  const hasImagenes = (repuesto.imagenesManual?.length || 0) > 0

  return (
    <div className="flex justify-end gap-1.5">
      {/* Ver Manual */}
      {hasManual && onViewManual ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewManual(repuesto)}
          title="Ver Manual/Datasheet"
          className="h-8 w-8 p-0"
        >
          <FileText className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Ver Fotos */}
      {(hasPhotos || hasImagenes) && onViewPhotos ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewPhotos(repuesto)}
          title="Ver Fotos"
          className="h-8 w-8 p-0"
        >
          <Image className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Historial */}
      {onViewHistory ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewHistory(repuesto)}
          title="Historial de cambios"
          className="h-8 w-8 p-0"
        >
          <History className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Editar */}
      {onEdit ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(repuesto)}
          title="Editar"
          className="h-8 w-8 p-0"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Eliminar */}
      {onDelete ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(repuesto)}
          title="Eliminar"
          className="h-8 w-8 p-0 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}

