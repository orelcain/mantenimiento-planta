/**
 * Selector de Planta → Área para el módulo Análisis de Turno (2 niveles).
 *
 * Nivel 1: plantas (Principal / Yal / Acopio / Riles).
 * Nivel 2: áreas de la planta activa (ej. Principal → Eviscerado · Filete).
 *
 * El identificador que se emite (`onSelect`) sigue siendo el `PlantLineId` de la
 * ÁREA (hoja) — el resto del módulo (carga de datos por `?linea=`) no cambia.
 */
import { cn } from '@/lib/utils'
import {
  PLANTS,
  getPlantOf,
  getAreasOfPlant,
  isPlantComingSoon,
  getDefaultAreaOfPlant,
  type PlantLineId,
  type PlantId,
} from '@/config/plantLines'

interface PlantLineTabsProps {
  selected: PlantLineId
  onSelect: (id: PlantLineId) => void
  className?: string
}

export function PlantLineTabs({ selected, onSelect, className }: PlantLineTabsProps) {
  const activePlant = getPlantOf(selected)
  const areas = getAreasOfPlant(activePlant)

  const handlePlantClick = (plant: PlantId) => {
    if (plant === activePlant || isPlantComingSoon(plant)) return
    const target = getDefaultAreaOfPlant(plant)
    if (target && !target.comingSoon) onSelect(target.id)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* ── Nivel 1: Plantas ── */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-lg border border-border/40">
        {PLANTS.map((p) => {
          const isActive = p.id === activePlant
          const soon = isPlantComingSoon(p.id)
          return (
            <button
              key={p.id}
              onClick={() => handlePlantClick(p.id)}
              disabled={soon}
              title={soon ? `${p.label} — próximamente` : p.label}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-md transition-all text-center',
                isActive
                  ? 'bg-background shadow-sm ring-1 ring-primary/30'
                  : soon
                  ? 'text-muted-foreground/45 cursor-not-allowed bg-muted/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer',
              )}
            >
              <span
                className={cn(
                  'text-xs font-semibold leading-tight',
                  isActive && 'text-primary',
                  soon && 'text-muted-foreground/60',
                )}
              >
                {p.label}
              </span>
              {soon && (
                <span className="inline-flex items-center text-[9px] leading-none mt-0.5 px-1 py-0.5 rounded bg-muted-foreground/10 text-muted-foreground/70 font-medium uppercase tracking-wide">
                  próx.
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Nivel 2: Áreas de la planta activa ── */}
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1 px-0.5">
          {areas.map((area) => {
            const isActive = area.id === selected
            return (
              <button
                key={area.id}
                onClick={() => !area.comingSoon && onSelect(area.id)}
                disabled={area.comingSoon}
                title={area.comingSoon ? `${area.areaLabel} — próximamente` : area.description}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                  isActive
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : area.comingSoon
                    ? 'border-border/40 bg-muted/15 text-muted-foreground/45 cursor-not-allowed'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {area.areaLabel}
                {area.comingSoon && (
                  <span className="text-[8px] leading-none px-1 py-0.5 rounded bg-muted-foreground/10 uppercase tracking-wide">
                    próx.
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
