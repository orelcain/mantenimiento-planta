/**
 * SwipeRow — fila de lista con acciones por deslizamiento (patrón Correo /
 * Recordatorios de iOS). Deslizar a la izquierda descubre las acciones de
 * `trailing`; deslizar a la derecha más allá del umbral dispara `leading`
 * (una sola acción de "un gesto", como marcar favorito).
 *
 * En PC, con puntero fino, las mismas acciones aparecen al pasar el mouse
 * como botones circulares sobre el borde derecho, sin mover la fila (mover el
 * contenido escondía el nombre). Nada de íconos de color visibles por fila.
 *
 * Solo maneja el gesto; el contenido (`children`) es una ListCell o similar.
 * DESIGN.md §10: el estado no vive en botones de color; vive en el rótulo.
 */
import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { cn } from '@/lib/utils'

export interface SwipeAction {
  label: string
  icon: ReactNode
  /** brand = acción principal (azul), neutral = gris del sistema, destructive = rojo. */
  tone?: 'brand' | 'neutral' | 'destructive'
  onClick: () => void
}

export interface SwipeRowProps {
  children: ReactNode
  /** Acciones que se descubren deslizando a la izquierda (máx. 2, la primera queda más a la derecha). */
  trailing?: SwipeAction[]
  /** Acción de un gesto al deslizar a la derecha (p. ej. favorito). */
  leading?: SwipeAction & { active?: boolean }
  className?: string
}

const ACTION_W = 76
const LEADING_THRESHOLD = 88

const TONE: Record<NonNullable<SwipeAction['tone']>, string> = {
  brand: 'bg-primary text-primary-foreground',
  neutral: 'bg-muted-foreground text-background',
  destructive: 'bg-destructive text-destructive-foreground',
}

export function SwipeRow({ children, trailing = [], leading, className }: SwipeRowProps) {
  const [dx, setDx] = useState(0)
  const [open, setOpen] = useState(false)
  const start = useRef<{ x: number; y: number; locked: 'h' | 'v' | null } | null>(null)
  const trailingW = trailing.length * ACTION_W

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    start.current = { x: t.clientX, y: t.clientY, locked: null }
  }
  const onTouchMove = (e: TouchEvent) => {
    const s = start.current
    if (!s) return
    const t = e.touches[0]
    if (!t) return
    const mx = t.clientX - s.x
    const my = t.clientY - s.y
    if (!s.locked) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return
      s.locked = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'
    }
    if (s.locked === 'v') return
    const base = open ? -trailingW : 0
    let next = base + mx
    if (!leading && next > 0) next = 0
    if (next > LEADING_THRESHOLD + 24) next = LEADING_THRESHOLD + 24
    if (next < -trailingW - 24) next = -trailingW - 24
    setDx(next)
  }
  const onTouchEnd = () => {
    const s = start.current
    start.current = null
    if (!s || s.locked !== 'h') return
    if (dx > LEADING_THRESHOLD && leading) {
      leading.onClick()
      setOpen(false)
      setDx(0)
      return
    }
    const shouldOpen = trailing.length > 0 && dx < -trailingW / 2
    setOpen(shouldOpen)
    setDx(shouldOpen ? -trailingW : 0)
  }
  const close = () => {
    if (open) {
      setOpen(false)
      setDx(0)
    }
  }
  const dragging = start.current?.locked === 'h'

  return (
    <div
      className={cn('group relative overflow-hidden', className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {leading && (
        <div
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 flex items-center justify-start pl-5 transition-colors',
            dx > LEADING_THRESHOLD ? 'bg-amber-400 text-white' : 'bg-muted text-muted-foreground',
          )}
          style={{ width: Math.max(0, dx) }}
        >
          <span className="flex flex-col items-center gap-0.5 text-caption font-medium">
            {leading.icon}
            {dx > 56 && <span>{leading.label}</span>}
          </span>
        </div>
      )}

      {/* PC (puntero fino): al pasar el mouse aparecen botones circulares sobre el
          borde derecho, SIN mover la fila — correr el contenido escondía el nombre. */}
      {trailing.length > 0 && (
        <div className="absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 gap-1.5 rounded-full bg-card/90 p-1 backdrop-blur-sm [@media(hover:hover)]:group-hover:flex">
          {trailing.map(a => (
            <button
              key={a.label}
              type="button"
              title={a.label}
              aria-label={a.label}
              onClick={a.onClick}
              className={cn(
                'flex size-10 items-center justify-center rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.25)] [&>svg]:size-5',
                TONE[a.tone ?? 'neutral'],
              )}
            >
              {a.icon}
            </button>
          ))}
        </div>
      )}

      {trailing.length > 0 && (
        <div
          className={cn(
            'absolute inset-y-0 right-0 flex',
            // Táctil: las acciones solo se ven cuando la fila está abierta o en movimiento.
            !open && dx === 0 && 'invisible',
          )}
          style={{ width: trailingW }}
        >
          {trailing.map(a => (
            <button
              key={a.label}
              type="button"
              onClick={() => { a.onClick(); close() }}
              className={cn(
                'flex h-full flex-col items-center justify-center gap-0.5 text-caption font-medium',
                TONE[a.tone ?? 'neutral'],
              )}
              style={{ width: ACTION_W }}
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          'relative',
          !dragging && 'transition-transform duration-200 ease-out',
        )}
        style={{ transform: dx !== 0 ? `translateX(${dx}px)` : undefined }}
        onClickCapture={e => {
          // Con la fila abierta, el primer toque la cierra en vez de abrir la ficha.
          if (open) {
            e.stopPropagation()
            close()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
