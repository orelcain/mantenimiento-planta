import { useState } from 'react'
import { MoreVertical, FileText, Image, History, Pencil, Trash2 } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui'

interface RepuestoActionsMenuProps {
  repuesto: Repuesto
  onEdit?: (repuesto: Repuesto) => void
  onDelete?: (repuesto: Repuesto) => void
  onViewManual?: (repuesto: Repuesto) => void
  onViewPhotos?: (repuesto: Repuesto) => void
  onViewHistory?: (repuesto: Repuesto) => void
  isCompact?: boolean
}

export function RepuestoActionsMenu({
  repuesto,
  onEdit,
  onDelete,
  onViewManual,
  onViewPhotos,
  onViewHistory,
  isCompact = false,
}: RepuestoActionsMenuProps) {
  const hasManual = (repuesto.vinculosManual?.length || 0) > 0
  const hasPhotos = (repuesto.fotosReales?.length || 0) > 0
  const hasImagenes = (repuesto.imagenesManual?.length || 0) > 0

  if (isCompact && !hasManual && !hasPhotos && !hasImagenes && !onViewHistory) {
    // Mostrar solo Editar y Eliminar en modo compacto si no hay contenido especial
    return (
      <div className="flex justify-end gap-2">
        {onEdit ? (
          <Button variant="ghost" size="sm" onClick={() => onEdit(repuesto)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        ) : null}
        {onDelete ? (
          <Button variant="ghost" size="sm" onClick={() => onDelete(repuesto)}>
            <Trash2 className="h-4 w-4" />
            Borrar
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Acciones de lectura */}
        {hasManual && onViewManual ? (
          <DropdownMenuItem onClick={() => onViewManual(repuesto)}>
            <FileText className="mr-2 h-4 w-4" />
            Ver Manual/Datasheet
          </DropdownMenuItem>
        ) : null}

        {(hasPhotos || hasImagenes) && onViewPhotos ? (
          <DropdownMenuItem onClick={() => onViewPhotos(repuesto)}>
            <Image className="mr-2 h-4 w-4" />
            Ver Fotos ({(repuesto.fotosReales?.length || 0) + (repuesto.imagenesManual?.length || 0)})
          </DropdownMenuItem>
        ) : null}

        {onViewHistory ? (
          <DropdownMenuItem onClick={() => onViewHistory(repuesto)}>
            <History className="mr-2 h-4 w-4" />
            Historial de cambios
          </DropdownMenuItem>
        ) : null}

        {(hasManual || hasPhotos || hasImagenes || onViewHistory) && (onEdit || onDelete) ? (
          <DropdownMenuSeparator />
        ) : null}

        {/* Acciones de edición */}
        {onEdit ? (
          <DropdownMenuItem onClick={() => onEdit(repuesto)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </DropdownMenuItem>
        ) : null}

        {onDelete ? (
          <DropdownMenuItem
            onClick={() => onDelete(repuesto)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
