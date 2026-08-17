import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * TabBar móvil de la NUEVA PIEL (docs §4 y §5.5).
 *
 * El botón central elevado NO es adorno: registrar una incidencia es el gesto
 * más frecuente de la app en planta, y con esto queda a un toque desde
 * cualquier pantalla (precargando la máquina si vienes de su ficha). Es el
 * principio de "deferencia" del HIG aplicado al caso real: la UI cede ante la
 * tarea principal.
 *
 * Material: translúcido con blur — es cromo de navegación, el único lugar donde
 * la piel permite translucidez (§6). El contenido siempre va sólido.
 */
export interface TabItem {
  id: string
  label: string
  icon: React.ReactNode
}

export interface TabBarProps {
  items: TabItem[]
  activeId: string
  onSelect: (id: string) => void
  /** Botón central elevado. Si se omite, la barra queda simétrica sin él. */
  center?: { label: string; icon: React.ReactNode; onClick: () => void }
  className?: string
}

export function TabBar({ items, activeId, onSelect, center, className }: TabBarProps) {
  // El centro parte los tabs en dos mitades para que quede simétrico.
  const half = Math.ceil(items.length / 2)
  const groups = center ? [items.slice(0, half), items.slice(half)] : [items]

  return (
    <nav
      className={cn(
        'flex items-end border-t border-border px-1 pb-4 pt-1.5',
        'bg-card/80 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-card',
        className,
      )}
      aria-label="Navegación principal"
    >
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {group.map((item) => {
            const active = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // `min-h-[44px]` literal: el root global va al 87.5% (85% en
                  // móvil, ver index.css), así que `min-h-11` (2.75rem) rinde
                  // ~37-38px y no los 44 del piso táctil de la Constitución §3.
                  'flex min-h-[44px] flex-1 flex-col items-center justify-end gap-0.5 rounded-ctl py-1',
                  'transition-colors duration-150 motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="[&_svg]:size-[1.3rem]">{item.icon}</span>
                <span className="text-[0.6rem] font-medium leading-none">{item.label}</span>
              </button>
            )
          })}
          {center && gi === 0 && (
            <div className="flex flex-1 justify-center">
              <button
                type="button"
                onClick={center.onClick}
                aria-label={center.label}
                className={cn(
                  'flex size-[3.25rem] -mt-6 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground shadow-[0_6px_18px_rgb(var(--brand)/0.45)]',
                  'transition-transform duration-200 [transition-timing-function:cubic-bezier(.32,.72,0,1)]',
                  'hover:scale-[1.07] active:scale-[.94] motion-reduce:transition-none motion-reduce:hover:scale-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                  '[&_svg]:size-7',
                )}
              >
                {center.icon}
              </button>
            </div>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}
