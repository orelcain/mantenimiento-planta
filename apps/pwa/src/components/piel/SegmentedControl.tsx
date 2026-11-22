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
  /**
   * Agrupa el segmento en una pista propia dentro del mismo `tablist` (p. ej. «Planta Principal» | «Referencia»).
   * Si ningún segmento trae grupo, el control se dibuja igual que siempre.
   */
  grupo?: GrupoSegmento
}

export interface GrupoSegmento {
  clave: string
  /** Rótulo sobre la pista en celular, o a la izquierda en PC si no hay `tituloCorto`. */
  titulo: ReactNode
  /** Rótulo corto para PC (en línea con la pista). */
  tituloCorto?: ReactNode
  /** Pista ajustada al contenido (no ocupa la fila). */
  ajustado?: boolean
  /** Segmentos sin elegir con tinta atenuada (`text-muted-foreground`). */
  atenuado?: boolean
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  segments: readonly Segment<T>[]
  /** Nombre accesible del grupo, p. ej. "Vista de Repuestos". */
  ariaLabel: string
  className?: string
  /**
   * `herramienta`: 48 px LITERALES (pista) y 44 de pastilla, para el único control bajo el
   * encabezado de las herramientas del Centro de Aprendizaje. No usa `h-11` porque con la raíz al
   * 85 % del celular rinde ~37 px. El tamaño por defecto (44) no cambia: lo usa Repuestos.
   */
  tamano?: 'normal' | 'herramienta'
  /**
   * `ajustado`: el control mide lo que piden sus rótulos (no llena la fila). Cada
   * segmento conserva su rótulo completo: sin truncar, con 12 px de aire a cada lado.
   * Sin esto, `flex-1` reparte un ancho de contenido y el texto se corta.
   */
  ajustado?: boolean
  /**
   * Con grupos: `apilada` (celular) pone el rótulo encima de cada pista; `en-linea` (PC) lo pone a la izquierda,
   * con pistas de 32 px (44 con puntero táctil).
   */
  disposicionGrupos?: 'apilada' | 'en-linea'
}

export function SegmentedControl<T extends string>({ value, onChange, segments, ariaLabel, className, tamano = 'normal', ajustado = false, disposicionGrupos = 'apilada' }: SegmentedControlProps<T>) {
  const grande = tamano === 'herramienta'
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

  if (segments.some(s => s.grupo)) {
    // Un solo tablist con una pista por grupo: las flechas recorren todos los segmentos (`alTeclear`).
    const enLinea = disposicionGrupos === 'en-linea'
    const grupos: Array<{ clave: string; titulo: ReactNode; tituloCorto: ReactNode; ajustado: boolean; atenuado: boolean; items: Array<{ s: Segment<T>; i: number }> }> = []
    segments.forEach((s, i) => {
      const clave = s.grupo?.clave ?? ''
      let g = grupos.find(x => x.clave === clave)
      if (!g) {
        g = {
          clave,
          titulo: s.grupo?.titulo ?? null,
          tituloCorto: s.grupo?.tituloCorto ?? s.grupo?.titulo ?? null,
          ajustado: !!s.grupo?.ajustado,
          atenuado: !!s.grupo?.atenuado,
          items: [],
        }
        grupos.push(g)
      }
      g.items.push({ s, i })
    })
    return (
      <div role="tablist" aria-label={ariaLabel} className={cn('flex gap-2', enLinea ? 'items-center' : 'items-start', className)}>
        {grupos.map(g => (
          <div key={g.clave || 'sin-grupo'} className={cn('flex min-w-0', enLinea ? 'shrink-0 items-center gap-2' : 'flex-col', !enLinea && (g.ajustado ? 'shrink-0' : 'flex-1'))}>
            {g.titulo != null && (
              <span className={cn('font-medium text-muted-foreground', enLinea ? 'whitespace-nowrap text-footnote' : 'pb-1 pl-3 text-caption1')}>
                {enLinea ? g.tituloCorto : g.titulo}
              </span>
            )}
            <div className={cn('flex box-border rounded-full bg-muted p-0.5', enLinea ? 'h-8 [@media(pointer:coarse)]:h-11' : 'h-11', !enLinea && !g.ajustado && 'w-full')}>
              {g.items.map(({ s, i }) => {
                const on = s.value === value
                const flexible = !enLinea && !g.ajustado
                return (
                  <button
                    key={s.value}
                    ref={el => { botones.current[i] = el }}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    tabIndex={i === tabulable ? 0 : -1}
                    onClick={() => onChange(s.value)}
                    onKeyDown={e => alTeclear(e, i)}
                    className={cn(flexible ? 'flex min-w-0 flex-1' : 'flex flex-none', 'h-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40')}
                  >
                    <span
                      className={cn(
                        flexible ? 'flex min-w-0 flex-1 px-2' : 'flex flex-none px-3 whitespace-nowrap',
                        'items-center justify-center gap-1.5 rounded-full text-subhead transition-[background-color,box-shadow] duration-150',
                        on
                          ? 'bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
                          : cn('font-medium hover:text-foreground', g.atenuado ? 'text-muted-foreground' : 'text-foreground/80'),
                      )}
                    >
                      {s.icon && <span className="shrink-0 [&>svg]:size-4">{s.icon}</span>}
                      <span className={flexible ? 'truncate' : 'whitespace-nowrap'}>{s.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex rounded-full bg-muted', ajustado ? 'w-auto' : 'w-full', grande ? 'h-[48px]' : 'h-11', className)}
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
            className={cn(ajustado ? 'flex flex-auto' : 'flex min-w-0 flex-1', 'rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40', grande ? 'h-[48px]' : 'h-11')}
          >
            <span
              className={cn(
                ajustado ? 'flex flex-auto whitespace-nowrap px-3' : 'flex min-w-0 flex-1 px-2',
                'items-center justify-center gap-1.5 rounded-full text-subhead transition-[background-color,box-shadow] duration-150',
                on
                  ? 'bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
                  : 'font-medium text-foreground/80 hover:text-foreground',
              )}
            >
              {s.icon && <span className="shrink-0 [&>svg]:size-4">{s.icon}</span>}
              <span className={ajustado ? 'whitespace-nowrap' : 'truncate'}>{s.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
