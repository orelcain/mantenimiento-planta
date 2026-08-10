import { MoreVertical, Image, Pencil, Trash2, ClipboardList, Camera, BookOpen, Eye, ArrowRightLeft } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui'

interface RepuestoActionsProps {
  repuesto: Repuesto
  onEdit?: (repuesto: Repuesto) => void
  onDelete?: (repuesto: Repuesto) => void
  onViewManual?: (repuesto: Repuesto) => void
  onViewPhotos?: (repuesto: Repuesto) => void
  onViewSpecs?: (repuesto: Repuesto) => void
  onViewGallery?: (repuesto: Repuesto) => void
  onSearchInManual?: (repuesto: Repuesto) => void
  onViewInManual?: (repuesto: Repuesto) => void
  onRelocate?: (repuesto: Repuesto) => void
}

export function RepuestoActionsMenu({
  repuesto,
  onEdit,
  onDelete,
  onViewManual,
  onViewPhotos,
  onViewSpecs,
  onViewGallery,
  onSearchInManual,
  onViewInManual,
  onRelocate,
}: RepuestoActionsProps) {
  const hasPhotos = (repuesto.fotosReales?.length || 0) > 0
  const hasImagenes = (repuesto.imagenesManual?.length || 0) > 0
  const hasGallery = (repuesto.gallery?.length || 0) > 0
  const hasFabCode = !!repuesto.codigoFabricante
  const hasVinculos = (repuesto.vinculosManual?.length || 0) > 0

  const hasViewActions = onViewSpecs || onViewGallery || onViewManual || onViewPhotos || onSearchInManual || onViewInManual
  const hasEditActions = onEdit || onDelete || onRelocate

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-caption tracking-wider text-muted-foreground font-normal truncate">
          {repuesto.textoBreve || repuesto.codigoSAP || 'Repuesto'}
        </DropdownMenuLabel>

        {/* ── Vista / Info ── */}
        {hasViewActions && (
          <>
            <DropdownMenuSeparator />

            {onViewSpecs && (
              <DropdownMenuItem onClick={() => onViewSpecs(repuesto)} className="gap-2 cursor-pointer">
                <ClipboardList className="h-4 w-4 text-blue-500" />
                <span>Ficha Técnica</span>
              </DropdownMenuItem>
            )}

            {onViewGallery && (
              <DropdownMenuItem onClick={() => onViewGallery(repuesto)} className="gap-2 cursor-pointer">
                <Camera className="h-4 w-4 text-indigo-500" />
                <span>Galería</span>
                {hasGallery && (
                  <span className="ml-auto text-caption text-muted-foreground">{repuesto.gallery?.length}</span>
                )}
              </DropdownMenuItem>
            )}

            {(hasPhotos || hasImagenes) && onViewPhotos && (
              <DropdownMenuItem onClick={() => onViewPhotos(repuesto)} className="gap-2 cursor-pointer">
                <Image className="h-4 w-4 text-emerald-500" />
                <span>Fotos de referencia</span>
                <span className="ml-auto text-caption text-muted-foreground">
                  {(repuesto.fotosReales?.length || 0) + (repuesto.imagenesManual?.length || 0)}
                </span>
              </DropdownMenuItem>
            )}

            {onSearchInManual && hasFabCode && (
              <DropdownMenuItem onClick={() => onSearchInManual(repuesto)} className="gap-2 cursor-pointer">
                <BookOpen className="h-4 w-4 text-cat-6-ink" />
                <span>Buscar en Manual</span>
                <span className="ml-auto text-caption font-mono text-muted-foreground truncate max-w-[60px]">
                  {repuesto.codigoFabricante}
                </span>
              </DropdownMenuItem>
            )}

            {onViewInManual && hasVinculos && (
              <DropdownMenuItem onClick={() => onViewInManual(repuesto)} className="gap-2 cursor-pointer">
                <Eye className="h-4 w-4 text-green-500" />
                <span>Ver en Manual</span>
                <span className="ml-auto text-caption text-green-400">✓ ubicado</span>
              </DropdownMenuItem>
            )}
          </>
        )}

        {/* ── Editar / Eliminar ── */}
        {hasEditActions && (
          <>
            <DropdownMenuSeparator />

            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(repuesto)} className="gap-2 cursor-pointer">
                <Pencil className="h-4 w-4" />
                <span>Editar repuesto</span>
              </DropdownMenuItem>
            )}

            {onRelocate && (
              <DropdownMenuItem onClick={() => onRelocate(repuesto)} className="gap-2 cursor-pointer text-amber-400 focus:text-amber-400">
                <ArrowRightLeft className="h-4 w-4" />
                <span>Reubicar a otra máquina</span>
              </DropdownMenuItem>
            )}

            {onDelete && (
              <DropdownMenuItem onClick={() => onDelete(repuesto)} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" />
                <span>Eliminar</span>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
