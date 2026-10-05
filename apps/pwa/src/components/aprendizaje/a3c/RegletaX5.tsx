/**
 * Regleta X5 recorrible: los 144 bornes en una tira horizontal, en el orden del plano,
 * con el LED (si el plano lo dibuja), el número y un código corto. En el teléfono cada
 * celda mide 44 px de ancho (se recorre con el pulgar); en PC, 30 px (mouse).
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
  onElegir: (n: number) => void
}

export const RegletaX5 = memo(forwardRef<HTMLDivElement, RegletaX5Props>(function RegletaX5(
  { bornes, elegidos, encendidos, idioma, compacta, onElegir },
  ref,
) {
  // El código corto solo depende de los bornes: no se recalcula en cada hover del padre.
  const codigos = useMemo(() => new Map([...bornes].map(([n, b]) => [n, codigoCorto(b)])), [bornes])
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Regleta X5, 144 bornes"
      className={cn('a3c-regleta flex snap-x snap-proximity overflow-x-auto px-0.5 pb-1.5 pt-2', compacta ? 'gap-[3px]' : 'gap-1')}
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
                'flex flex-none snap-center flex-col items-center justify-between rounded-ctl bg-card px-0.5 pb-1.5 pt-1.5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                compacta ? 'h-[58px] w-[30px]' : 'h-[64px] w-[44px]',
                elegidos.has(n) && 'bg-primary/[0.13] ring-2 ring-inset ring-primary',
              )}
            >
              <span aria-hidden className={cn('a3c-punto', !b.led && 'a3c-sin-led', b.led && colorLed(n) === 'g' && 'a3c-verde', b.led && on && 'a3c-encendido')} />
              <span className={cn('font-mono text-footnote font-semibold leading-none tabular-nums', sin && 'text-muted-foreground/70')}>{n}</span>
              <span
                className={cn(
                  'max-w-full overflow-hidden whitespace-nowrap font-mono text-caption leading-none',
                  sin ? 'text-muted-foreground/70' : salida ? 'text-brand-ink' : 'text-muted-foreground',
                )}
              >
                {salida ? '→' : ''}{codigos.get(n)}
              </span>
            </button>,
          )
        }
        return [
          <div key={`sep-${r.desde}`} className="flex flex-none flex-col justify-center whitespace-nowrap pl-2.5 pr-2 font-mono text-caption font-semibold text-muted-foreground">
            {r.desde}–{r.hasta}
            <span className="font-sans font-normal">{idioma === 'or' ? r.original : r.es}</span>
          </div>,
          ...celdas,
        ]
      })}
    </div>
  )
}))
