import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Lista agrupada estilo iOS — el primitivo que más superficie cubre de la app
 * (docs §5.2). Máquinas, incidencias, repuestos, ajustes: todo es esto.
 *
 * Tres detalles que la hacen leerse "nativa" y que se pierden si se rehace a mano:
 *  1. El separador va INSETADO: arranca después del ícono, no toca el borde.
 *  2. La celda ENTERA es el área táctil (≥44px), nunca solo el chevron — en
 *     planta se usa con guantes.
 *  3. El grupo lleva su encabezado en `caption` fuera de la tarjeta, no dentro.
 */

// `Omit<'title'>`: el atributo HTML nativo solo acepta string y acá el título
// puede llevar marcado (contadores, Pill). El tooltip nativo no se usa.
export interface ListGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Encabezado en mayúsculas sobre el grupo (rol `caption` de §2). */
  title?: React.ReactNode
  /** Acción a la derecha del encabezado, ej. "Ver todas". */
  action?: React.ReactNode
  /** Nota al pie del grupo, en `footnote`. */
  footer?: React.ReactNode
}

export function ListGroup({ title, action, footer, className, children, ...props }: ListGroupProps) {
  return (
    <section className={cn('flex flex-col', className)} {...props}>
      {(title || action) && (
        <header className="flex items-baseline gap-2 px-4 pb-2">
          {/* Sentence case, no MAYÚSCULAS (Constitución §10). iOS moderno hizo el
              mismo cambio en los encabezados de lista agrupada: "Notificaciones",
              no "NOTIFICACIONES". */}
          {title && (
            <h3 className="text-caption font-semibold text-muted-foreground">
              {title}
            </h3>
          )}
          {action && <div className="ml-auto text-[0.8rem] font-medium text-primary">{action}</div>}
        </header>
      )}
      <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        {children}
      </div>
      {footer && <p className="px-4 pt-2 text-[0.75rem] text-muted-foreground">{footer}</p>}
    </section>
  )
}

export interface ListCellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Ícono/avatar cuadrado redondeado a la izquierda (28px). */
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Valor a la derecha; los números salen tabulares solos. */
  value?: React.ReactNode
  valueSub?: React.ReactNode
  /** Slot libre a la derecha (Pill, Switch…). Va antes del chevron. */
  trailing?: React.ReactNode
  /** Muestra el chevron de navegación. Se activa solo si hay onClick. */
  chevron?: boolean
  onClick?: React.MouseEventHandler<HTMLDivElement>
}

export function ListCell({
  leading,
  title,
  subtitle,
  value,
  valueSub,
  trailing,
  chevron,
  onClick,
  className,
  ...props
}: ListCellProps) {
  const interactive = Boolean(onClick)
  const showChevron = chevron ?? interactive
  return (
    <div
      // El separador es un ::before insetado; `first:` lo oculta en la 1ª celda.
      className={cn(
        'relative flex min-h-11 items-center gap-3 px-4 py-2.5',
        'before:absolute before:right-0 before:top-0 before:h-px before:bg-border before:content-[""]',
        leading ? 'before:left-[3.25rem]' : 'before:left-4',
        'first:before:hidden',
        interactive &&
          'cursor-pointer transition-colors duration-150 hover:bg-accent active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary motion-reduce:transition-none',
        className,
      )}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                ;(e.currentTarget as HTMLDivElement).click()
              }
            }
          : undefined
      }
      {...props}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.88rem] font-semibold leading-tight">{title}</div>
        {subtitle && (
          <div className="truncate text-[0.76rem] leading-tight text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {(value || valueSub) && (
        <div className="shrink-0 text-right tabular-nums">
          {value && <div className="text-[0.82rem] font-semibold leading-tight">{value}</div>}
          {valueSub && <div className="text-[0.72rem] leading-tight text-muted-foreground">{valueSub}</div>}
        </div>
      )}
      {trailing && <div className="shrink-0">{trailing}</div>}
      {showChevron && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />}
    </div>
  )
}

/** Ícono cuadrado de celda: la inicial del equipo sobre color de estado. */
export function CellIcon({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'flex size-7 items-center justify-center rounded-ctl text-[0.62rem] font-bold text-white',
        className,
      )}
    >
      {children}
    </span>
  )
}
