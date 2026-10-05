/**
 * Regleta X5 recorrible: los 144 bornes en una tira horizontal, en el orden del plano,
 * con el LED (si el plano lo dibuja), el número y un código corto. En el teléfono cada
 * celda mide 44 px de ancho (se recorre con el pulgar); en PC, 30 px (mouse).
 * En PC va `vertical`: una columna junto a la tarjeta, con filas de 30 px (mouse) o 44 px
 * (táctil) y el rango de cada regleta fijo arriba mientras se recorre.
 */
import { forwardRef, memo, useMemo } from 'react'
import type { Borne } from '@/data/baader142A3c'
import { cn } from '@/lib/utils'
import { REGLETAS, codigoCorto, colorLed, rotuloBorne, type Idioma } from '@/utils/aprendizaje/a3c'

export interface RegletaX5Props {
  bornes: Map<number, Borne>
  /** Bornes resaltados (los del elemento elegido + el borne tocado). */
  elegidos: Set<number>
  encendidos: Set<number>
  idioma: Idioma
  compacta: boolean
  /** Columna vertical (PC) en vez de tira horizontal (teléfono). */
  vertical?: boolean
  onElegir: (n: number) => void
}

export const RegletaX5 = memo(forwardRef<HTMLDivElement, RegletaX5Props>(function RegletaX5(
  { bornes, elegidos, encendidos, idioma, compacta, vertical = false, onElegir },
  ref,
) {
  // El código corto solo depende de los bornes: no se recalcula en cada hover del padre.
  const codigos = useMemo(() => new Map([...bornes].map(([n, b]) => [n, codigoCorto(b)])), [bornes])
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Regleta X5, 144 bornes"
      data-orientacion={vertical ? 'vertical' : 'horizontal'}
      className={
        vertical
          ? cn('flex h-full flex-col overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]', compacta ? 'gap-[3px]' : 'gap-1')
          : cn('a3c-regleta flex snap-x snap-proximity overflow-x-auto px-0.5 pb-1.5 pt-2', compacta ? 'gap-[3px]' : 'gap-1')
      }
    >
      {REGLETAS.map(r => {
        const celdas = []
        for (let n = r.desde; n <= r.hasta; n++) {
          const b = bornes.get(n)
          if (!b) continue
          const sin = b.sentido === 'sin_etiqueta'
          const salida = b.sentido === 'salida'
          const on = encendidos.has(n)
          celdas.push(
            <button
              key={n}
              type="button"
              data-n={n}
              aria-pressed={elegidos.has(n)}
              aria-label={`Borne ${n}, ${sin ? 'sin etiqueta' : rotuloBorne(b)}${b.led ? '' : ', sin LED'}`}
              onClick={() => onElegir(n)}
              className={cn(
                vertical
                  ? cn('flex w-full flex-none items-center gap-2 rounded-ctl bg-card px-2 text-left', compacta ? 'h-[30px]' : 'h-[44px]')
                  : cn('flex flex-none snap-center flex-col items-center justify-between rounded-ctl bg-card px-0.5 pb-1.5 pt-1.5', compacta ? 'h-[58px] w-[30px]' : 'h-[64px] w-[44px]'),
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                elegidos.has(n) && 'bg-primary/[0.13] ring-2 ring-inset ring-primary',
              )}
            >
              <span aria-hidden className={cn('a3c-punto', !b.led && 'a3c-sin-led', b.led && colorLed(n) === 'g' && 'a3c-verde', b.led && on && 'a3c-encendido')} />
              <span className={cn('font-mono text-footnote font-semibold leading-none tabular-nums', vertical && 'w-[3ch] flex-none text-right', sin && 'text-muted-foreground/70')}>{n}</span>
              <span
                className={cn(
                  'max-w-full overflow-hidden whitespace-nowrap font-mono text-caption leading-none',
                  vertical && 'min-w-0 flex-1 text-ellipsis',
                  sin ? 'text-muted-foreground/70' : salida ? 'text-brand-ink' : 'text-muted-foreground',
                )}
              >
                {salida ? '→' : ''}{codigos.get(n)}
              </span>
            </button>,
          )
        }
        return [
          <div
            key={`sep-${r.desde}`}
            className={cn(
              'flex flex-none flex-col justify-center font-mono text-caption font-semibold text-muted-foreground',
              vertical ? 'sticky top-0 z-[1] bg-background px-1 pb-1 pt-2 leading-tight' : 'whitespace-nowrap pl-2.5 pr-2',
            )}
          >
            {r.desde}–{r.hasta}
            <span className="font-sans font-normal">{idioma === 'or' ? r.original : r.es}</span>
          </div>,
          ...celdas,
        ]
      })}
    </div>
  )
}))
