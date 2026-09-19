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
  /**
   * `wide` = el doble de ancho en pantallas grandes (60rem), para formularios
   * largos que en el PC caben en dos columnas. En el teléfono no cambia nada.
   */
  size?: 'default' | 'wide'
  children?: React.ReactNode
  /**
   * Opcional: captura teclas en cualquier campo del panel (por ejemplo Cmd/Ctrl+Enter
   * para guardar sin soltar el teclado). No afecta a un Sheet que no lo pase.
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

export function Sheet({ open, onClose, title, description, actions, size = 'default', children, onKeyDown }: SheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const returnFocusRef = React.useRef<HTMLElement | null>(null)
  /** Arrastre hacia abajo para cerrar (HIG «Sheets», 19-09-2026): posición inicial del dedo y alto del panel. */
  const arrastreRef = React.useRef<{ y0: number; altura: number } | null>(null)
  // onClose en una ref: casi todos los que usan el Sheet le pasan una función
  // nueva en cada render. Con `onClose` en las dependencias, CADA tecla re-corría
  // el efecto: devolvía el foco al disparador y luego al panel → en el celular el
  // teclado se cerraba letra a letra (encontrado en la Bitácora, 15-09-2026).
  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose

  React.useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement as HTMLElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      returnFocusRef.current?.focus?.()
    }
  }, [open])

  /**
   * Mueve el panel con el dedo (`translateY`, solo hacia abajo). Manipula el
   * DOM directo en vez de estado de React: en un pointermove por frame, un
   * re-render de todo el Sheet en cada uno se sentía a los saltos.
   */
  const iniciarArrastre = (e: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    if (!panel) return
    arrastreRef.current = { y0: e.clientY, altura: panel.offsetHeight }
    // `.piel-sheet-in` anima con `both`: al terminar deja `transform: none`
    // fijado, y una animación le gana al estilo en línea → el panel no seguía
    // al dedo. La entrada ya se vio; se apaga para que mande el arrastre.
    panel.style.animation = 'none'
    panel.style.transition = 'none'
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const moverArrastre = (e: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    const a = arrastreRef.current
    if (!panel || !a) return
    panel.style.transform = `translateY(${Math.max(0, e.clientY - a.y0)}px)`
  }
  /** Suelta: más de 120 px (o 25% del alto) cierra; si no, el panel vuelve a 0. */
  const soltarArrastre = (e: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    const a = arrastreRef.current
    arrastreRef.current = null
    if (!panel || !a) return
    const dy = Math.max(0, e.clientY - a.y0)
    const cierra = dy > 120 || dy > a.altura * 0.25
    // Con prefers-reduced-motion: sin transición de vuelta (salta a 0).
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    panel.style.transition = reducido ? 'none' : 'transform 180ms ease-out'
    panel.style.transform = 'translateY(0px)'
    // onClose puede NO cerrar (pide confirmar cambios): el panel ya volvió a
    // su lugar arriba, cierre o no.
    if (cierra) onCloseRef.current()
  }
  const cancelarArrastre = () => {
    const panel = panelRef.current
    arrastreRef.current = null
    if (!panel) return
    panel.style.transition = 'none'
    panel.style.transform = 'translateY(0px)'
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/35 piel-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'relative w-full rounded-t-panel bg-card px-6 pb-8 pt-2.5',
          size === 'wide' ? 'max-w-[60rem]' : 'max-w-[30rem]',
          'shadow-[0_-10px_50px_rgba(0,0,0,0.3)] outline-none',
          'piel-sheet-in',
        )}
      >
        {/* Zona de arrastre: agarradera + título, con área táctil generosa
            (44 px) aunque la agarradera se vea igual. Invisible: Escape y los
            botones son la vía accesible, esto es puro gesto. */}
        <div
          aria-hidden
          onPointerDown={iniciarArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={soltarArrastre}
          onPointerCancel={cancelarArrastre}
          className="absolute inset-x-0 top-0 h-[44px] touch-none select-none"
        />
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
