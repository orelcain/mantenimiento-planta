/**
 * Clases del tablero de Jack-Knife en PC (opción B, 10-11-2026): controles reales
 * de 36 px, letra 22/15/13 en px (en PC la raíz es 14 px y los rem encogen).
 */
import { cn } from '@/lib/utils'

export const TJK_TITULO = 'm-0 text-[length:calc(22px*var(--escala-texto,1))] leading-[28px] font-semibold tracking-[-0.01em] text-foreground text-balance'
export const TJK_CUERPO = 'text-[length:calc(15px*var(--escala-texto,1))] leading-5 text-foreground'
export const TJK_NOTA = 'text-[length:calc(13px*var(--escala-texto,1))] leading-[18px] text-muted-foreground'
export const TJK_SECCION = 'm-0 text-[length:calc(15px*var(--escala-texto,1))] leading-5 font-semibold text-foreground'

/** Grupo segmentado: filete de 1 px, radio 8, sin píldora. */
export const TJK_SEG = 'inline-grid grid-flow-col overflow-hidden rounded-ctl border border-border'

export function claseSegmento(activo: boolean): string {
  return cn(
    'min-h-[36px] min-w-[56px] border-l border-border px-3 first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
    TJK_CUERPO,
    activo ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
  )
}

/** Botón secundario: mide lo que su texto. */
export const TJK_BOTON = cn(
  'min-h-[36px] shrink-0 rounded-ctl border border-border bg-muted px-4 font-medium disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
  TJK_CUERPO,
)

/** Botón principal (una acción por vista). */
export const TJK_BOTON_PRI = cn(
  'min-h-[36px] shrink-0 rounded-ctl bg-primary px-4 font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  'text-[length:calc(15px*var(--escala-texto,1))] leading-5',
)

export const TJK_ENLACE = 'min-h-[36px] text-left text-brand-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
