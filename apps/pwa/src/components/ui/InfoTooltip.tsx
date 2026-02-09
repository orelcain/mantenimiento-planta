/**
 * InfoTooltip — Icono de información con tooltip hover mejorado.
 * v3 — Mejor contraste, arrow, animación suave, backdrop blur.
 * Usa CSS puro (sin dependencia de @radix-ui/react-tooltip).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
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
  const [visible, setVisible] = useState(false)
  const [adjustedPos, setAdjustedPos] = useState(position)
  const containerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const show = useCallback(() => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(true), 120)
  }, [])

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(false), 80)
  }, [])

  // Adjust position if tooltip overflows viewport
  useEffect(() => {
    if (!visible || !tooltipRef.current || !containerRef.current) return
    const rect = tooltipRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let newPos = position
    if (position === 'top' && rect.top < 8) newPos = 'bottom'
    if (position === 'bottom' && rect.bottom > vh - 8) newPos = 'top'
    if (position === 'left' && rect.left < 8) newPos = 'right'
    if (position === 'right' && rect.right > vw - 8) newPos = 'left'

    // Also check horizontal overflow for top/bottom
    if ((newPos === 'top' || newPos === 'bottom') && rect.right > vw - 8) {
      // Will be handled by CSS max-width + transform clamp
    }

    if (newPos !== adjustedPos) setAdjustedPos(newPos)
  }, [visible, position, adjustedPos])

  useEffect(() => {
    if (!visible) setAdjustedPos(position)
  }, [visible, position])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2.5',
  }

  const arrowClasses: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-[#1e293b] dark:border-t-[#1e293b]',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-[#1e293b] dark:border-b-[#1e293b]',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-[#1e293b] dark:border-l-[#1e293b]',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-[#1e293b] dark:border-r-[#1e293b]',
  }

  const Icon = variant === 'help' ? HelpCircle : Info
  const hasRichContent = title || formula || example

  return (
    <span
      ref={containerRef}
      className={cn('relative inline-flex items-center cursor-help', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <Icon
        className="text-muted-foreground/60 hover:text-blue-400 transition-colors duration-150"
        style={{ width: iconSize, height: iconSize }}
      />
      <span
        ref={tooltipRef}
        className={cn(
          'absolute z-[100]',
          'rounded-lg shadow-2xl',
          // Force high-contrast regardless of light/dark mode
          'bg-slate-800 text-slate-100',
          'text-xs leading-relaxed',
          'transition-all duration-150 ease-out',
          visible
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none',
          hasRichContent ? 'w-72 p-3' : 'w-56 p-2.5',
          positionClasses[adjustedPos],
        )}
        style={{ backdropFilter: 'blur(8px)' }}
      >
        {/* Arrow */}
        <span
          className={cn(
            'absolute w-0 h-0 border-[6px]',
            arrowClasses[adjustedPos],
          )}
        />

        {hasRichContent ? (
          <span className="space-y-1.5 block">
            {title && (
              <span className="font-semibold text-[13px] text-white block">
                {title}
              </span>
            )}
            {text && (
              <span className="block text-slate-300 leading-snug">
                {text}
              </span>
            )}
            {formula && (
              <span className="block font-mono text-[11px] bg-slate-700/80 text-emerald-300 px-2 py-1.5 rounded border border-slate-600/50">
                {formula}
              </span>
            )}
            {example && (
              <span className="block text-slate-400 italic text-[11px]">
                Ej: {example}
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-200">{text}</span>
        )}
      </span>
    </span>
  )
}
