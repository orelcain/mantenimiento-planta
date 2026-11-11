/**
 * Lo que se toca en la franja «cinta» (FranjaCinta y la celda Camino a la meta): UNA sola señal en toda la franja, el
 * chevron de 14 px tras el rótulo, más el rol de botón y el teclado. Sin marco ni pastilla: el toque es la zona entera.
 * El hover y el `:active` están en `monitorGlass.css` (`.fc-tocable`, `.fc-chev`).
 */
import { ChevronRight } from 'lucide-react'
import { useId, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react'

/** El chevron que dice «esto abre su detalle». Decorativo: el rol y el nombre los lleva la zona tocable. */
export function ChevronFranja() {
  return <ChevronRight className="fc-chev" strokeWidth={2} aria-hidden />
}

/** El rótulo de una celda (15/600); con `tocable`, el chevron va pegado detrás. */
export function RotuloFranja({ children, tocable }: { children: ReactNode; tocable?: boolean }) {
  return <span className="fc-rotulo">{children}{tocable && <ChevronFranja />}</span>
}

/**
 * Una zona que abre un detalle (todas abren un diálogo): rol de botón, foco y Enter/Espacio. `nombre` reemplaza al nombre
 * accesible cuando la zona tiene cifras que decir (dentro de un botón los hijos no se leen aparte); `abierta` marca el
 * estado de la zona que controla su propio diálogo. Sin `nombre`, la zona se describe a sí misma (`aria-describedby` a su propio
 * id): el nombre sigue siendo «X: ver detalle» y un lector de pantalla además dice las cifras y la nota que la zona muestra.
 */
export function Tocable({ onAbrir, etiqueta, nombre, className, abierta, zonaRef, children }: {
  onAbrir: () => void
  etiqueta: string
  nombre?: string
  className?: string
  abierta?: boolean
  zonaRef?: Ref<HTMLDivElement>
  children: ReactNode
}) {
  const id = useId()
  return (
    <div
      ref={zonaRef}
      id={id}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded={abierta}
      aria-label={nombre ?? `${etiqueta}: ver detalle`}
      aria-describedby={nombre ? undefined : id}
      className={`fc-tocable ${className ?? ''}`}
      onClick={onAbrir}
      onKeyDown={(ev: ReactKeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onAbrir() } }}
    >
      {children}
    </div>
  )
}
