/**
 * AnnotationListItems — lista de anotaciones con descripción expandible ("Ver más")
 * Se usa tanto en ViewerPage como en PublicPage.
 */
import { useState } from 'react'
import type { Annotation3D, Point3D } from '@/types/models3d'
import { Camera, Check, ChevronDown, ChevronUp } from 'lucide-react'

const DESC_LIMIT = 80

/** Check if description needs truncation (>2 visual lines or long text) */
function needsTruncation(text?: string | null): boolean {
  if (!text) return false
  const lines = text.split('\n')
  return lines.length > 2 || text.length > DESC_LIMIT
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-blue-500',
}
const PRIORITY_LABELS: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

interface Props {
  annotations: Annotation3D[]
  onFocus: (point: Point3D) => void
  /** Modo compacto para la vista pública (menos padding) */
  compact?: boolean
}

export function AnnotationListItems({ annotations, onFocus, compact }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const py = compact ? 'py-1 px-1.5' : 'py-1.5 px-2'
  const titleMax = compact ? 'max-w-[120px]' : 'max-w-[140px]'
  const titleSize = compact ? 'text-[11px]' : 'text-xs'

  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      {annotations.map((ann) => {
        const color = PRIORITY_COLORS[ann.priority] ?? 'text-amber-500'
        const isExpanded = expandedId === ann.id
        const hasLongDesc = needsTruncation(ann.description ?? '')

        return (
          <div key={ann.id} className="rounded hover:bg-muted/50 transition-colors">
            {/* Main row — click to focus camera */}
            <div
              className={`flex items-center justify-between ${py} text-xs cursor-pointer`}
              onClick={() => onFocus({ ...ann.position })}
              title="Clic para enfocar"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`font-bold ${color}`}>#{ann.number}</span>
                <span className={`truncate ${titleMax} font-medium ${titleSize}`}>
                  {ann.title}
                </span>
                {ann.status === 'resolved' && (
                  <Check className="size-2.5 text-emerald-500" aria-label="Resuelta" />
                )}
                {(ann.photos?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-caption text-muted-foreground"><Camera className="size-2.5" />{ann.photos!.length}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[10px] ${color}`}>
                  {ann.status === 'resolved'
                    ? 'Resuelta'
                    : (PRIORITY_LABELS[ann.priority] ?? 'Media')}
                </span>
                {/* Expand/collapse toggle — only when description exists */}
                {ann.description && (
                  <button
                    className="p-0.5 rounded hover:bg-muted transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedId(isExpanded ? null : ann.id)
                    }}
                    title={isExpanded ? 'Ocultar descripción' : 'Ver descripción'}
                  >
                    {isExpanded
                      ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </button>
                )}
              </div>
            </div>

            {/* Description — collapsed shows max 2 lines, expandable */}
            {ann.description && (
              <div className="px-2 pb-1.5">
                {isExpanded ? (
                  <p className="text-[11px] text-muted-foreground leading-snug whitespace-pre-wrap pl-5">
                    {ann.description}
                  </p>
                ) : (
                  <p
                    className="text-[11px] text-muted-foreground leading-snug whitespace-pre-wrap line-clamp-2 pl-5 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (hasLongDesc) setExpandedId(ann.id)
                    }}
                    title={hasLongDesc ? 'Clic para ver completo' : undefined}
                  >
                    {ann.description}
                  </p>
                )}
                {hasLongDesc && (
                  <button
                    className="text-[10px] text-primary hover:underline mt-0.5 pl-5 font-medium"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedId(isExpanded ? null : ann.id)
                    }}
                  >
                    {isExpanded ? 'Ver menos' : 'Ver más'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
