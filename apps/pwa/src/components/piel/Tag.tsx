/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Tag — etiqueta CATEGÓRICA (docs §1.6 y §5.6). Hermana de <Pill>, con un
 * trabajo distinto y no intercambiable:
 *
 *   <Pill> dice ESTADO      → crítica / media / ok. Hay un bueno y un malo.
 *   <Tag>  dice CATEGORÍA   → rodamiento / motor / sensor. No hay orden.
 *
 * Por qué importa la distinción: si un tipo de repuesto se pinta con el rojo
 * semántico, un rodamiento pasa a leerse como "alerta". El color categórico
 * solo separa; nunca jerarquiza.
 *
 * Los 8 tonos vienen de tokens theme-aware y pasan AA sobre su propio tinte en
 * claro y oscuro (medido en scripts/check-contrast.mjs). Se eligen por índice
 * estable —no por hash del texto— para que la misma categoría conserve su color
 * entre sesiones y entre pantallas.
 */
export type TagTone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 'neutral'

// Tailwind necesita las clases COMPLETAS en el código para no purgarlas: por eso
// el mapa es literal y no `text-cat-${n}-ink` interpolado.
const TONES: Record<TagTone, string> = {
  1: 'text-cat-1-ink bg-cat-1-tint/[0.08]',
  2: 'text-cat-2-ink bg-cat-2-tint/[0.08]',
  3: 'text-cat-3-ink bg-cat-3-tint/[0.08]',
  4: 'text-cat-4-ink bg-cat-4-tint/[0.08]',
  5: 'text-cat-5-ink bg-cat-5-tint/[0.08]',
  6: 'text-cat-6-ink bg-cat-6-tint/[0.08]',
  7: 'text-cat-7-ink bg-cat-7-tint/[0.08]',
  8: 'text-cat-8-ink bg-cat-8-tint/[0.08]',
  neutral: 'text-muted-foreground bg-muted-foreground/[0.10]',
}

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone
}

export function Tag({ tone = 'neutral', className, children, ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5',
        'text-[0.68rem] font-semibold leading-none whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

/** Clases sueltas del tono, para casos que no pueden usar el componente. */
export function tagToneClasses(tone: TagTone): string {
  return TONES[tone]
}
