/**
 * InfoTooltip — Icono de información con tooltip hover.
 * v2 — Soporte para título + descripción, fórmula, ejemplo.
 * Usa CSS puro (sin dependencia de @radix-ui/react-tooltip).
 */
import { Info, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  /** Texto simple del tooltip */
  text?: string
  /** Título en negrita (opcional para tooltips ricos) */
  title?: string
  /** Fórmula o definición técnica */
  formula?: string
  /** Ejemplo práctico */
  example?: string
  className?: string
  iconSize?: number
  /** Posición preferida del tooltip */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** Variante del icono */
  variant?: 'info' | 'help'
}

export function InfoTooltip({
  text,
  title,
  formula,
  example,
  className,
  iconSize = 14,
  position = 'top',
  variant = 'info',
}: InfoTooltipProps) {
  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const Icon = variant === 'help' ? HelpCircle : Info
  const hasRichContent = title || formula || example

  return (
    <span className={cn('relative inline-flex items-center group cursor-help', className)}>
      <Icon
        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        style={{ width: iconSize, height: iconSize }}
      />
      <span
        className={cn(
          'absolute z-50 hidden group-hover:block',
          'p-2.5 rounded-lg shadow-xl',
          'bg-popover text-popover-foreground border border-border/80',
          'text-xs leading-relaxed',
          'pointer-events-none',
          hasRichContent ? 'w-72' : 'w-64',
          positionClasses[position],
        )}
      >
        {hasRichContent ? (
          <span className="space-y-1.5 block">
            {title && <span className="font-semibold text-[13px] block">{title}</span>}
            {text && <span className="block text-muted-foreground">{text}</span>}
            {formula && (
              <span className="block font-mono text-[11px] bg-muted/60 px-2 py-1 rounded">
                {formula}
              </span>
            )}
            {example && (
              <span className="block text-muted-foreground/80 italic">
                Ej: {example}
              </span>
            )}
          </span>
        ) : (
          text
        )}
      </span>
    </span>
  )
}
