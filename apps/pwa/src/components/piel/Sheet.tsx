import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Sheet — el modal de la NUEVA PIEL (docs §5.4). Sube desde abajo con la curva
 * iOS y atenúa el fondo; reemplaza los modales centrados con borde.
 *
 * Por qué importa además de estético: en un teléfono sostenido con una mano el
 * modal centrado deja los botones lejos del pulgar. El sheet los deja abajo.
 *
 * Accesibilidad: Escape cierra, el fondo cierra, foco al panel al abrir y
 * devuelto al disparador al cerrar, scroll del body bloqueado mientras está
 * abierto, y `prefers-reduced-motion` desactiva el deslizamiento.
 */
export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  /** Fila de acciones al pie (normalmente dos <Button>). */
  actions?: React.ReactNode
  children?: React.ReactNode
}

export function Sheet({ open, onClose, title, description, actions, children }: SheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const returnFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement as HTMLElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      returnFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/35 piel-fade-in motion-reduce:animate-none"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-[30rem] rounded-t-panel bg-card px-6 pb-8 pt-2.5',
          'shadow-[0_-10px_50px_rgba(0,0,0,0.3)] outline-none',
          'piel-sheet-in motion-reduce:animate-none',
        )}
      >
        {/* Agarradera: señal de "esto se arrastra/cierra", no decoración. */}
        <div className="mx-auto mb-3.5 h-[5px] w-9 rounded-full bg-muted-foreground/40" aria-hidden />
        {title && <h2 className="text-[1.1rem] font-semibold tracking-[-0.015em]">{title}</h2>}
        {description && (
          <p className="mt-1 text-[0.83rem] leading-snug text-muted-foreground">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {actions && <div className="mt-5 flex gap-2.5 [&>*]:flex-1">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}
