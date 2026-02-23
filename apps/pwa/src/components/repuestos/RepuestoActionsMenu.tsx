import { MoreVertical, FileText, Image, Pencil, Trash2, ClipboardList, Camera, BookOpen } from 'lucide-react'
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
}: RepuestoActionsProps) {
  const hasManual = (repuesto.vinculosManual?.length || 0) > 0
  const hasPhotos = (repuesto.fotosReales?.length || 0) > 0
  const hasImagenes = (repuesto.imagenesManual?.length || 0) > 0
  const hasGallery = (repuesto.gallery?.length || 0) > 0
  const hasFabCode = !!repuesto.codigoBaader

  const hasViewActions = onViewSpecs || onViewGallery || onViewManual || onViewPhotos || onSearchInManual
  const hasEditActions = onEdit || onDelete

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
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal truncate">
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
                  <span className="ml-auto text-[10px] text-muted-foreground">{repuesto.gallery?.length}</span>
                )}
              </DropdownMenuItem>
            )}

            {(hasPhotos || hasImagenes) && onViewPhotos && (
              <DropdownMenuItem onClick={() => onViewPhotos(repuesto)} className="gap-2 cursor-pointer">
                <Image className="h-4 w-4 text-emerald-500" />
                <span>Fotos de referencia</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {(repuesto.fotosReales?.length || 0) + (repuesto.imagenesManual?.length || 0)}
                </span>
              </DropdownMenuItem>
            )}

            {hasManual && onViewManual && (
              <DropdownMenuItem onClick={() => onViewManual(repuesto)} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4 text-amber-500" />
                <span>Manual / Datasheet</span>
              </DropdownMenuItem>
            )}

            {onSearchInManual && hasFabCode && (
              <DropdownMenuItem onClick={() => onSearchInManual(repuesto)} className="gap-2 cursor-pointer">
                <BookOpen className="h-4 w-4 text-purple-500" />
                <span>Buscar en Manual</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground truncate max-w-[60px]">
                  {repuesto.codigoBaader}
                </span>
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
