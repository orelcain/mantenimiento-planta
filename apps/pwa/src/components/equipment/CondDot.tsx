import { COND_COLOR, COND_LABEL } from '@/lib/ctd'
import { cn } from '@/lib/utils'

/**
 * Punto del semáforo de condición NFPA 70B (1 mejor → 3 peor).
 *
 * Vive acá y no en `components/piel/` a propósito: no es un primitivo de la piel,
 * es vocabulario del dominio. Los colores salen de `lib/ctd.ts`, que es la fuente
 * única — los tooltips de ECharts (HTML plano) consumen los mismos valores.
 *
 * El `aria-label` lleva siempre la etiqueta: el color nunca es el único canal (§13).
 */
export function CondDot({ cond, className }: { cond: 1 | 2 | 3; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full align-middle', className)}
      style={{ background: COND_COLOR[cond] }}
      title={COND_LABEL[cond]}
      role="img"
      aria-label={COND_LABEL[cond]}
    />
  )
}

/** Leyenda completa de las 3 condiciones, para formularios de captura. */
export function CondLeyenda({ detalle }: { detalle: Record<1 | 2 | 3, string> }) {
  return (
    <>
      {([1, 2, 3] as const).map((c, i) => (
        <span key={c} className="inline-flex items-center gap-1">
          {i > 0 && <span className="mr-1">·</span>}
          <CondDot cond={c} />
          <b>{c}</b> {detalle[c]}
        </span>
      ))}
    </>
  )
}
