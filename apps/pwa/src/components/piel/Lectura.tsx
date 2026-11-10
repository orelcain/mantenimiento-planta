/**
 * Lectura — piezas del «modo lectura»: pantallas que se leen y se analizan.
 *
 * Filete y alineación en vez de tarjetas. Cuatro cuerpos: celular 28/20/17/13,
 * PC denso 24/17/15/13, y respetan la preferencia de tamaño de texto. Nacieron en el informe del detalle de turno.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const LECTURA_TITULO = 'text-[length:calc(28px*var(--escala-texto,1))] leading-[1.18] lg:text-[length:calc(24px*var(--escala-texto,1))] lg:leading-[1.25] font-semibold tracking-[-0.012em] text-foreground text-balance'
export const LECTURA_SECCION = 'text-[length:calc(20px*var(--escala-texto,1))] leading-[1.25] lg:text-[length:calc(17px*var(--escala-texto,1))] lg:leading-[1.35] font-semibold text-foreground'
export const LECTURA_CUERPO = 'text-[length:calc(17px*var(--escala-texto,1))] leading-[1.35] lg:text-[length:calc(15px*var(--escala-texto,1))] lg:leading-[1.4] font-normal text-foreground'
export const LECTURA_NOTA = 'text-[length:calc(13px*var(--escala-texto,1))] leading-[1.38] font-normal text-muted-foreground'
export const LECTURA_ENLACE = 'text-brand-ink hover:underline text-left min-h-11 lg:min-h-0'

export function SeccionLectura({ titulo, extra, children, className, testId }: {
  titulo: ReactNode
  extra?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <section className={cn('border-t border-border pt-3.5', className)} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h2 className={LECTURA_SECCION}>{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

export interface FilaLectura { rotulo: ReactNode; valor: ReactNode }

/** Pares rótulo/valor separados por filete; el valor, a la derecha y tabular. */
export function FilasLectura({ filas, className }: { filas: readonly FilaLectura[]; className?: string }) {
  return (
    <dl className={cn('m-0', LECTURA_CUERPO, className)}>
      {filas.map((f, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 border-t border-border py-[9px]">
          <dt className="min-w-0">{f.rotulo}</dt>
          <dd className="m-0 text-right tabular-nums shrink-0">{f.valor}</dd>
        </div>
      ))}
    </dl>
  )
}
