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
          title={line.comingSoon ? 'Próximamente' : line.description}
          className={cn(
            'flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-md transition-all text-center',
            selected === line.id
              ? 'bg-background shadow-sm text-foreground'
              : line.comingSoon
              ? 'text-muted-foreground/35 cursor-not-allowed'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer',
          )}
        >
          <span
            className={cn(
              'text-xs font-semibold leading-none',
              selected === line.id && 'text-primary',
            )}
          >
            {line.label}
          </span>
          <span className="text-[10px] leading-none mt-0.5 text-muted-foreground">
            {line.comingSoon ? 'próx.' : line.description}
          </span>
        </button>
      ))}
    </div>
  )
}
