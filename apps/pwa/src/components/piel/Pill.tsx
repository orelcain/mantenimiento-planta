import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Pill / chip de estado de la NUEVA PIEL (docs §5.3).
 *
 * Reemplaza los ~1.356 chips ad-hoc `bg-*-500/10` repartidos por la app: uno
 * solo, con las proporciones ya medidas.
 *
 * LA REGLA (medida el 2026-08-09, no elegida a ojo — ver check-contrast.mjs):
 *   texto = tono 600 (variante accesible)   ·   fondo = tono 500 al 8%
 * Con el tinte vivo como texto, el rojo daba 3.51:1 y reprobaba AA; con el tono
 * 600 pero fondo al 14% seguía reprobando (4.24:1). Al 8% cumplen los seis casos
 * (crítica/media/ok × claro/oscuro), peor caso 4.57:1. Si alguien "sube el tinte
 * para que se vea más", rompe accesibilidad — por eso está escrito acá.
 *
 * El color NUNCA es el único canal (§8): la Pill siempre lleva texto.
 */
const TONES = {
  critical: 'text-red-600 bg-red-500/[0.15]',
  warning: 'text-amber-600 bg-amber-500/[0.15]',
  ok: 'text-emerald-600 bg-emerald-500/[0.15]',
  info: 'text-brand-ink bg-primary/[0.15]',
  neutral: 'text-muted-foreground bg-muted-foreground/[0.10]',
} as const

const DOT_TONES = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  ok: 'bg-emerald-500',
  info: 'bg-primary',
  neutral: 'bg-muted-foreground',
} as const

export type PillTone = keyof typeof TONES

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone
  /** Punto de color a la izquierda. En `pulse` respira (uso: "En vivo"). */
  dot?: boolean | 'pulse'
}

export function Pill({ tone = 'neutral', dot, className, children, ...props }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
        'text-[0.7rem] font-semibold leading-none whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex h-[7px] w-[7px] shrink-0">
          <span className={cn('h-full w-full rounded-full', DOT_TONES[tone])} />
          {dot === 'pulse' && (
            <span
              aria-hidden
              className={cn(
                'absolute -inset-[3px] rounded-full border-2 piel-pulse motion-reduce:hidden',
                tone === 'ok' ? 'border-emerald-500' : tone === 'critical' ? 'border-red-500' : 'border-current',
              )}
            />
          )}
        </span>
      )}
      {children}
    </span>
  )
}
