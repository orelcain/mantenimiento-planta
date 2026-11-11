import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
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
   * `full` = casi todo el ancho del PC (92 vw, tope 90rem), para tablas y listas con columnas.
   */
  size?: 'default' | 'wide' | 'full'
  children?: React.ReactNode
  /**
   * Opcional: captura teclas en cualquier campo del panel (por ejemplo Cmd/Ctrl+Enter
   * para guardar sin soltar el teclado). No afecta a un Sheet que no lo pase.
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
  /**
   * `grouped` = hoja de lista agrupada (HIG «Lists»): el panel va en `bg-background` para que los
   * grupos `bg-card` se vean como tarjetas, márgenes de 16 px, altura según el contenido con tope
   * de 85 dvh y el cuerpo con su propio scroll. Sin esto el Sheet se comporta como siempre.
   */
  surface?: 'card' | 'grouped'
  /** Acción a la derecha del título (por ejemplo «Editar»). Debe medir ≥44 px de alto. */
  headerAction?: React.ReactNode
  /** Zona fija bajo el título, fuera del scroll (por ejemplo un buscador). */
  toolbar?: React.ReactNode
  /**
   * Opt-in: oculta la barra de desplazamiento del cuerpo (solo en hojas estructuradas). La barra
   * global de `index.css` (8 px) le quita ancho al cuerpo en PC, y el contenido queda más angosto
   * que el pie. Sin esto, ninguna hoja cambia.
   */
  ocultarBarra?: boolean
  /**
   * Opt-in, solo desde 1024 px. `ventana` = ventana ancha para formularios grandes: centrada, casi
   * toda la pantalla, esquinas en los cuatro lados, sin tirador y con botón de cerrar. El cuerpo
   * ocupa el alto que queda y la hoja debe desplazar su propio contenido. Sin esto, nada cambia.
   * `libre` = la misma ventana sin encabezado, sin pie y sin márgenes, del alto de su contenido: quien
   * la usa dibuja todo adentro, incluido el botón de cerrar. El título queda para lectores de pantalla.
   */
  presentacionPC?: 'hoja' | 'ventana' | 'libre'
}

export function Sheet({ open, onClose, title, description, actions, size = 'default', children, onKeyDown, surface = 'card', headerAction, toolbar, ocultarBarra = false, presentacionPC = 'hoja' }: SheetProps) {
  const ventana = presentacionPC === 'ventana'
  const libre = presentacionPC === 'libre'
  /** Con `grouped` o `toolbar` el panel es una columna: encabezado fijo y cuerpo que desplaza. */
  const estructurado = surface === 'grouped' || toolbar != null
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
    <div className={cn('fixed inset-0 z-[100] flex items-end justify-center', (ventana || libre) && 'lg:items-center')}>
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
          'relative w-full rounded-t-panel pt-2.5',
          surface === 'grouped' ? 'bg-background' : 'bg-card',
          estructurado ? 'flex max-h-[85dvh] flex-col px-4' : 'px-6 pb-8',
          size === 'full' ? 'max-w-[min(92vw,90rem)]' : size === 'wide' ? 'max-w-[60rem]' : 'max-w-[30rem]',
          'shadow-[0_-10px_50px_rgba(0,0,0,0.3)] outline-none',
          'piel-sheet-in',
          ventana &&
            'piel-ventana-in lg:flex lg:h-[min(844px,94dvh)] lg:w-[calc(100vw-48px)] min-[1440px]:w-[min(1560px,90vw)] lg:max-w-none lg:flex-col lg:rounded-panel lg:px-[44px] lg:pb-6 lg:pt-7 lg:shadow-[0_24px_80px_rgba(0,0,0,0.45)]',
          libre &&
            'piel-ventana-in lg:flex lg:max-h-[min(1000px,94dvh)] lg:w-[calc(100vw-48px)] min-[1440px]:w-[min(1560px,90vw)] lg:max-w-none lg:flex-col lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:p-0 lg:shadow-[0_24px_80px_rgba(0,0,0,0.45)]',
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
          className={cn('absolute inset-x-0 top-0 h-[44px] touch-none select-none', (ventana || libre) && 'lg:hidden')}
        />
        {/* Agarradera: señal de "esto se arrastra/cierra", no decoración. */}
        <div className={cn('mx-auto mb-3.5 h-[5px] w-9 rounded-full bg-muted-foreground/40', (ventana || libre) && 'lg:hidden')} aria-hidden />
        {estructurado || headerAction || ventana ? (
          <div className={cn('flex min-h-[44px] flex-none items-center gap-2', ventana && 'lg:gap-5')}>
            {title && <h2 className={cn('min-w-0 flex-1 text-[length:calc(1.1rem*var(--escala-texto,1))] font-semibold tracking-[-0.015em]', ventana && 'lg:text-title1')}>{title}</h2>}
            {/* Por encima de la zona de arrastre (absolute, 44 px de alto), que si no se comería el toque. */}
            {headerAction && <div className="relative z-10 flex-none">{headerAction}</div>}
            {ventana && (
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                className="hidden size-[44px] flex-none place-items-center rounded-full bg-muted-foreground/15 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:grid"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        ) : (
          title && <h2 className={cn('text-[length:calc(1.1rem*var(--escala-texto,1))] font-semibold tracking-[-0.015em]', libre && 'lg:sr-only')}>{title}</h2>
        )}
        {description && (
          <p className={cn('mt-1 text-[length:calc(0.83rem*var(--escala-texto,1))] leading-snug text-muted-foreground', ventana && 'lg:text-body')}>{description}</p>
        )}
        {toolbar && <div className="mt-2 flex-none">{toolbar}</div>}
        {children && (estructurado ? (
          <div className={cn('mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(12px,env(safe-area-inset-bottom))]', ocultarBarra && '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden')}>{children}</div>
        ) : (
          <div className={cn('mt-4', ventana && 'lg:mt-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col', libre && 'lg:mt-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col')}>{children}</div>
        ))}
        {actions && <div className={cn('mt-5 flex gap-2.5 [&>*]:flex-1', ventana && 'lg:mt-3 lg:flex-none lg:border-t lg:border-border lg:pt-3.5')}>{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}
