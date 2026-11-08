/**
 * Selector de Planta → Área para el módulo Análisis de Turno (2 niveles).
 *
 * Nivel 1: plantas (Principal / Yal / Acopio / Riles).
 * Nivel 2: áreas de la planta activa (ej. Principal → Eviscerado · Filete).
 *
 * El identificador que se emite (`onSelect`) sigue siendo el `PlantLineId` de la
 * ÁREA (hoja) — el resto del módulo (carga de datos por `?linea=`) no cambia.
 */
import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet } from '@/components/piel'
import { usePielApple } from '@/hooks/usePielApple'
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
  const apple = usePielApple()
  const [hojaAbierta, setHojaAbierta] = useState(false)

  const handlePlantClick = (plant: PlantId) => {
    if (plant === activePlant || isPlantComingSoon(plant)) return
    const target = getDefaultAreaOfPlant(plant)
    if (target && !target.comingSoon) onSelect(target.id)
  }

  if (apple) {
    // Piel Apple: una sola línea-botón «Planta, Área». Al tocarla se abre una hoja
    // con las dos listas. Las dos filas de chips de la forma anterior no se dibujan.
    const plantaLabel = PLANTS.find((p) => p.id === activePlant)?.label ?? ''
    const areaLabel = areas.find((a) => a.id === selected)?.areaLabel ?? ''
    return (
      <div className={cn('w-full', className)}>
        <button
          type="button"
          onClick={() => setHojaAbierta(true)}
          aria-haspopup="dialog"
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-ctl bg-muted px-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="min-w-0 text-subhead font-semibold">{`${plantaLabel}, ${areaLabel}`}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>

        <Sheet open={hojaAbierta} onClose={() => setHojaAbierta(false)} title="Planta y área">
          <div className="space-y-6">
            <section className="space-y-1" aria-label="Planta">
              <h3 className="text-footnote text-muted-foreground">Planta</h3>
              <ul className="divide-y divide-border">
                {PLANTS.map((p) => {
                  const soon = isPlantComingSoon(p.id)
                  const activa = p.id === activePlant
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={soon}
                        aria-current={activa || undefined}
                        onClick={() => {
                          handlePlantClick(p.id)
                          if (!soon) setHojaAbierta(false)
                        }}
                        className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-subhead disabled:text-muted-foreground/60"
                      >
                        <span>{p.label}</span>
                        {soon ? (
                          <span className="text-footnote">próximamente</span>
                        ) : activa ? (
                          <Check className="h-4 w-4 text-primary" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            {areas.length > 0 && (
              <section className="space-y-1" aria-label="Área">
                <h3 className="text-footnote text-muted-foreground">Área</h3>
                <ul className="divide-y divide-border">
                  {areas.map((area) => {
                    const activa = area.id === selected
                    return (
                      <li key={area.id}>
                        <button
                          type="button"
                          disabled={area.comingSoon}
                          aria-current={activa || undefined}
                          onClick={() => {
                            onSelect(area.id)
                            setHojaAbierta(false)
                          }}
                          className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-subhead disabled:text-muted-foreground/60"
                        >
                          <span>{area.areaLabel}</span>
                          {area.comingSoon ? (
                            <span className="text-footnote">próximamente</span>
                          ) : activa ? (
                            <Check className="h-4 w-4 text-primary" aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        </Sheet>
      </div>
    )
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
                // El 7px es a propósito y NO debe pasar a `rounded-ctl` (10px):
                // en un control segmentado el radio INTERIOR va menor que el del
                // contenedor para que las esquinas aniden, que es como lo hace iOS.
                'flex-1 flex flex-col items-center gap-0.5 px-2 py-1.5 min-h-[44px] rounded-full transition-all text-center',
                isActive
                  ? 'bg-card shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
                  : soon
                  ? 'text-muted-foreground/45 cursor-not-allowed bg-muted/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer',
              )}
            >
              <span
                className={cn(
                  'text-footnote font-medium leading-tight',
                  isActive && 'font-semibold text-foreground',
                  soon && 'text-muted-foreground/60',
                )}
              >
                {p.label}
              </span>
              {soon && (
                <span className="inline-flex items-center text-caption leading-none mt-0.5 px-1 py-0.5 rounded-ctl bg-muted-foreground/10 text-muted-foreground font-medium tracking-wide">
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
                  'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : area.comingSoon
                    ? 'bg-muted-foreground/[0.06] text-muted-foreground/45 cursor-not-allowed'
                    : 'bg-muted text-foreground hover:text-foreground',
                )}
              >
                {area.areaLabel}
                {area.comingSoon && (
                  <span className="text-caption leading-none px-1 py-0.5 rounded-ctl bg-muted-foreground/10 tracking-wide">
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
