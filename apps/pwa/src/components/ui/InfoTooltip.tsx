/**
 * InfoTooltip — Icono de información con tooltip hover.
 * Usa CSS puro (sin dependencia de @radix-ui/react-tooltip).
 */
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  text: string
  className?: string
  iconSize?: number
  /** Posición preferida del tooltip */
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function InfoTooltip({ text, className, iconSize = 14, position = 'top' }: InfoTooltipProps) {
  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <span className={cn('relative inline-flex items-center group cursor-help', className)}>
      <Info
        className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        style={{ width: iconSize, height: iconSize }}
      />
      <span
        className={cn(
          'absolute z-50 hidden group-hover:block',
          'w-64 p-2 rounded-md shadow-lg',
          'bg-popover text-popover-foreground border',
          'text-xs leading-relaxed',
          'pointer-events-none',
          positionClasses[position],
        )}
      >
        {text}
      </span>
    </span>
  )
}
