import { useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet } from './Sheet'
import { CellIcon, ListCell, ListGroup } from './GroupedList'

/**
 * SelectorSeccion — «Sección ▾»: el control de las herramientas con MÁS de 4 secciones (fichas de
 * máquina y cursos). Con 2-4 opciones cortas se usa el SegmentedControl de tamaño `herramienta`;
 * aquí un botón de 48 px abre un Sheet con un ListGroup (HIG «Pull-down buttons» + «Sheets»).
 * Reemplaza la fila de pestañas con scroll horizontal, que escondía secciones fuera de pantalla.
 */
export interface OpcionSeccion<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Texto gris bajo el rótulo (por ejemplo cuántos elementos tiene). */
  subtitle?: string
  /** Marca de «hecho» a la derecha (por ejemplo evaluación aprobada). */
  hecho?: boolean
}

export interface SelectorSeccionProps<T extends string> {
  value: T
  onChange: (value: T) => void
  opciones: readonly OpcionSeccion<T>[]
  /** Título del Sheet y prefijo del botón. Por defecto «Sección». */
  etiqueta?: string
  className?: string
}

export function SelectorSeccion<T extends string>({ value, onChange, opciones, etiqueta = 'Sección', className }: SelectorSeccionProps<T>) {
  const [abierto, setAbierto] = useState(false)
  const actual = opciones.find((o) => o.value === value) ?? opciones[0]

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className={cn(
          'flex h-[48px] w-full items-center gap-2 rounded-full border border-border bg-card px-4 text-left',
          'transition-colors duration-150 hover:bg-accent active:bg-accent motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          className,
        )}
      >
        <span className="shrink-0 text-subhead text-muted-foreground">{etiqueta}</span>
        <span className="min-w-0 flex-1 truncate text-subhead font-semibold text-foreground">{actual?.label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Sheet open={abierto} onClose={() => setAbierto(false)} title={etiqueta} surface="grouped">
        <ListGroup>
          {opciones.map((o) => {
            const on = o.value === value
            return (
              <ListCell
                key={o.value}
                leading={o.icon ? <CellIcon tone="neutral">{o.icon}</CellIcon> : undefined}
                title={o.label}
                subtitle={o.subtitle}
                chevron={false}
                trailing={on || o.hecho ? <Check className={cn('size-4', on ? 'text-primary' : 'text-ink-ok')} aria-hidden /> : undefined}
                aria-current={on ? 'true' : undefined}
                onClick={() => { setAbierto(false); onChange(o.value) }}
                className="min-h-[52px]"
              />
            )
          })}
        </ListGroup>
      </Sheet>
    </>
  )
}
