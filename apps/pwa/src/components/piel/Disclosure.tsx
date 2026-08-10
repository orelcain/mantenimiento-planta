import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Disclosure — sección que se despliega (Constitución §22).
 *
 * El principio: mostrar primero solo lo importante y dejar que el detalle se
 * abra al tocar. Es lo que separa una app que se lee de un tablero que hay que
 * escanear, y es de lo que más baja la carga visual sin perder ni un dato.
 *
 * Dos decisiones que importan:
 *
 *  1. **El resumen vive en la cabecera.** Cuando está plegado, la fila debe
 *     seguir respondiendo la pregunta de la sección (`summary`). Un acordeón que
 *     al cerrarse no dice nada obliga a abrirlo siempre y no ahorra nada.
 *  2. **El estado se recuerda** (`storageKey`). Si el usuario cierra un bloque
 *     que no le sirve, no debe reaparecer abierto en cada visita: eso es la app
 *     ignorando una decisión suya.
 *
 * Accesible: la cabecera es un `<button>` real con `aria-expanded` y
 * `aria-controls`; el contenido no se desmonta, se oculta, para no perder el
 * scroll ni el estado de lo que haya adentro.
 */
export interface DisclosureProps {
  title: React.ReactNode
  /** Lo que se ve cuando está PLEGADO. Sin esto, cerrar no ahorra nada. */
  summary?: React.ReactNode
  /** Si se omite, arranca abierto. */
  defaultOpen?: boolean
  /** Recuerda abierto/cerrado entre visitas. */
  storageKey?: string
  className?: string
  children: React.ReactNode
}

export function Disclosure({
  title,
  summary,
  defaultOpen = true,
  storageKey,
  className,
  children,
}: DisclosureProps) {
  const id = React.useId()
  const [open, setOpen] = React.useState(() => {
    if (!storageKey) return defaultOpen
    const v = localStorage.getItem(`disclosure:${storageKey}`)
    return v === null ? defaultOpen : v === '1'
  })

  React.useEffect(() => {
    if (storageKey) localStorage.setItem(`disclosure:${storageKey}`, open ? '1' : '0')
  }, [storageKey, open])

  return (
    <section className={cn('overflow-hidden rounded-card bg-card', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          // §16: 44px de área táctil. La cabecera ENTERA abre y cierra.
          'flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left',
          'transition-colors duration-150 hover:bg-accent motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        )}
      >
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
            !open && '-rotate-90',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-headline font-semibold">{title}</span>
        {/* El resumen solo aparece plegado: abierto, el detalle ya lo dice. */}
        {summary && !open && (
          <span className="shrink-0 text-footnote text-muted-foreground">{summary}</span>
        )}
      </button>
      <div id={id} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </section>
  )
}
