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
    <div className={cn('flex flex-col gap-2', className)}>
      {/* ── Nivel 1: Plantas ── */}
      {/*
        Control SEGMENTADO, no una caja con chips adentro. El borde exterior
        sobraba: en el lenguaje de Apple el segmentado es un riel de relleno
        suave y el activo es una superficie elevada. Quitar ese borde y el del
        contenedor es lo que baja la sensación de "caja dentro de caja".
      */}
      <div className="flex gap-1 rounded-ctl bg-muted-foreground/10 p-[3px]">
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
                'flex-1 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-[7px] transition-all text-center',
                isActive
                  ? 'bg-card shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
                  : soon
                  ? 'text-muted-foreground/45 cursor-not-allowed bg-muted/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer',
              )}
            >
              <span
                className={cn(
                  'text-[0.78rem] font-medium leading-tight',
                  isActive && 'font-semibold text-foreground',
                  soon && 'text-muted-foreground/60',
                )}
              >
                {p.label}
              </span>
              {soon && (
                <span className="inline-flex items-center text-[9px] leading-none mt-0.5 px-1 py-0.5 rounded-ctl bg-muted-foreground/10 text-muted-foreground/70 font-medium uppercase tracking-wide">
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
                  // Píldoras SIN borde: un borde por chip multiplica las líneas
                  // en pantalla y es de lo que más ensucia. El estado se
                  // comunica con relleno, no con contorno.
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : area.comingSoon
                    ? 'bg-muted-foreground/[0.06] text-muted-foreground/45 cursor-not-allowed'
                    : 'bg-muted-foreground/10 text-muted-foreground hover:text-foreground',
                )}
              >
                {area.areaLabel}
                {area.comingSoon && (
                  <span className="text-[8px] leading-none px-1 py-0.5 rounded-ctl bg-muted-foreground/10 uppercase tracking-wide">
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
