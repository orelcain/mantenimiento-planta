/**
 * Selector de línea/planta para el módulo Análisis de Turno.
 * Muestra las 3 líneas disponibles como tabs horizontales.
 */
import { cn } from '@/lib/utils'
import { PLANT_LINES, type PlantLineId } from '@/config/plantLines'

interface PlantLineTabsProps {
  selected: PlantLineId
  onSelect: (id: PlantLineId) => void
  className?: string
}

export function PlantLineTabs({ selected, onSelect, className }: PlantLineTabsProps) {
  return (
    <div className={cn('flex gap-1 p-1 bg-muted/30 rounded-lg border border-border/40', className)}>
      {PLANT_LINES.map((line) => (
        <button
          key={line.id}
          onClick={() => !line.comingSoon && onSelect(line.id)}
          disabled={line.comingSoon}
          title={line.comingSoon ? `${line.label} — próximamente` : line.description}
          className={cn(
            'flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-md transition-all text-center relative',
            selected === line.id
              ? 'bg-background shadow-sm ring-1 ring-primary/30'
              : line.comingSoon
              ? 'text-muted-foreground/45 cursor-not-allowed bg-muted/15'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer',
          )}
        >
          <span
            className={cn(
              'text-xs font-semibold leading-tight',
              selected === line.id && 'text-primary',
              line.comingSoon && 'text-muted-foreground/60',
            )}
          >
            {line.label}
          </span>
          {/* Subtítulo: descripción en desktop; "próx." badge en cualquier tamaño */}
          {line.comingSoon ? (
            <span className="inline-flex items-center text-[9px] leading-none mt-0.5 px-1 py-0.5 rounded bg-muted-foreground/10 text-muted-foreground/70 font-medium uppercase tracking-wide">
              próx.
            </span>
          ) : (
            <span className="hidden sm:inline text-[10px] leading-none mt-0.5 text-muted-foreground">
              {line.description}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
