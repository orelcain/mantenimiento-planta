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
 *
 * Teclado (WAI-ARIA APG «Tabs», activación automática): un solo tope de Tab
 * (el segmento elegido), flechas ←/→ con vuelta circular, Inicio/Fin. Al mover
 * se llama a `onChange` y el foco acompaña al segmento nuevo.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
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
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  // Tabulable: el elegido; si ningún valor coincide, el primero.
  const tabulable = Math.max(0, segments.findIndex(s => s.value === value))

  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const n = segments.length
    const destino =
      e.key === 'ArrowRight' ? (i + 1) % n
      : e.key === 'ArrowLeft' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : null
    if (destino == null) return
    e.preventDefault()
    const seg = segments[destino]
    if (!seg) return
    onChange(seg.value)
    botones.current[destino]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex h-11 w-full rounded-full bg-muted', className)}
    >
      {segments.map((s, i) => {
        const on = s.value === value
        return (
          // El <button> mide los 44 px completos (área táctil); la pastilla
          // visual es el <span> interior de 40, concéntrica con la pista.
          <button
            key={s.value}
            ref={el => { botones.current[i] = el }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={i === tabulable ? 0 : -1}
            onClick={() => onChange(s.value)}
            onKeyDown={e => alTeclear(e, i)}
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
