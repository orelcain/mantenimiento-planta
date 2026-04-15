/**
 * ETTFixedText — Texto fijo no editable
 *
 * Renderiza texto de las zonas inmutables del documento ETT (consideraciones
 * previas, bases administrativas, suministros, etc.). Se muestra en color
 * gris suave para indicar visualmente al usuario que NO puede modificarlo.
 *
 * Estas partes son parte del formato corporativo AquaChile y no deben
 * cambiarse desde el editor — el único lugar donde viven sus textos es
 * en `utils/exportETTWord.ts`.
 */

import { cn } from '@/lib/utils'

export interface ETTFixedTextProps {
  children: React.ReactNode
  /** Variantes de estilo */
  variant?: 'body' | 'heading' | 'bullet' | 'section-title'
  /** Si true, texto en rojo (para cláusulas destacadas) */
  danger?: boolean
  /** Clase adicional */
  className?: string
}

export function ETTFixedText({
  children,
  variant = 'body',
  danger = false,
  className,
}: ETTFixedTextProps) {
  const variantStyles: Record<NonNullable<ETTFixedTextProps['variant']>, string> = {
    body: 'text-sm text-gray-600',
    heading: 'text-base font-semibold text-gray-700',
    'section-title': 'text-lg font-bold text-blue-900 mt-4 mb-2',
    bullet: 'text-sm text-gray-600 flex gap-2 ml-4',
  }

  return (
    <div
      className={cn(
        variantStyles[variant],
        danger && 'text-red-600 font-semibold',
        'select-text', // permitir seleccionar para copiar si quisiera
        className,
      )}
      aria-label="Texto fijo no editable"
    >
      {variant === 'bullet' && <span className="text-gray-500">➤</span>}
      <div className="flex-1">{children}</div>
    </div>
  )
}
