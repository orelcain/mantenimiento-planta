/**
 * SegmentedControl — selector de 2 a 4 vistas hermanas (UISegmentedControl).
 *
 * Desde iOS 26 el control es una cápsula: pista en `systemGray5` y el segmento
 * elegido como una pastilla clara que "flota" con sombra corta. Reemplaza las
 * pestañas con subrayado (patrón Material) que la app arrastraba en Repuestos.
 *
 * Altura 44 px: la pista entera es el área táctil (Constitución §3), el
 * segmento visual queda a 40 y sigue concéntrico (cápsula dentro de cápsula).
 * Nunca lleva contadores ni íconos de color: el estado va en la celda que
 * corresponda, no en el selector de vistas.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Segment<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  segments: readonly Segment<T>[]
  /** Nombre accesible del grupo, p. ej. "Vista de Repuestos". */
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string>({ value, onChange, segments, ariaLabel, className }: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex h-11 w-full rounded-full bg-muted', className)}
    >
      {segments.map(s => {
        const on = s.value === value
        return (
          // El <button> mide los 44 px completos (área táctil); la pastilla
          // visual es el <span> interior de 40, concéntrica con la pista.
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(s.value)}
            className="flex h-11 min-w-0 flex-1 rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          >
            <span
              className={cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-subhead transition-[background-color,box-shadow] duration-150',
                on
                  ? 'bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
                  : 'font-medium text-foreground/80 hover:text-foreground',
              )}
            >
              {s.icon && <span className="shrink-0 [&>svg]:size-4">{s.icon}</span>}
              <span className="truncate">{s.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
