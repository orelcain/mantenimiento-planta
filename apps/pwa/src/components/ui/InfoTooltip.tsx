/**
 * InfoTooltip — Icono de información con tooltip hover mejorado.
 * v3 — Mejor contraste, arrow, animación suave, backdrop blur.
 * Usa CSS puro (sin dependencia de @radix-ui/react-tooltip).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  // adjustedPos como ref evita que sea dependencia del effect de posición,
  // rompiendo el loop: adjustedPos cambia → effect re-corre → adjustedPos cambia...
  const adjustedPosRef = useRef(position)
  const [adjustedPos, setAdjustedPos] = useState(position)
  const [mounted, setMounted] = useState(false)
  const [tooltipCoords, setTooltipCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const containerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const show = useCallback(() => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(true), 120)
  }, [])

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current)
    // 200ms: da tiempo suficiente al mouse para cruzar el gap trigger → portal tooltip
    timeoutRef.current = setTimeout(() => setVisible(false), 200)
  }, [])

  const updateTooltipPosition = useCallback(() => {
    if (!visible || !tooltipRef.current || !containerRef.current) return

    const triggerRect = containerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 10
    const edge = 8

    let newPos = position
    if (newPos === 'top' && (triggerRect.top - tooltipRect.height - gap) < edge) newPos = 'bottom'
    if (newPos === 'bottom' && (triggerRect.bottom + tooltipRect.height + gap) > (vh - edge)) newPos = 'top'
    if (newPos === 'left' && (triggerRect.left - tooltipRect.width - gap) < edge) newPos = 'right'
    if (newPos === 'right' && (triggerRect.right + tooltipRect.width + gap) > (vw - edge)) newPos = 'left'
    // Usar ref para detectar cambio sin re-crear el callback (evita loop de renders)
    if (newPos !== adjustedPosRef.current) {
      adjustedPosRef.current = newPos
      setAdjustedPos(newPos)
    }

    let left = 0
    let top = 0
    if (newPos === 'top') {
      left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
      top = triggerRect.top - tooltipRect.height - gap
    } else if (newPos === 'bottom') {
      left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
      top = triggerRect.bottom + gap
    } else if (newPos === 'left') {
      left = triggerRect.left - tooltipRect.width - gap
      top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2)
    } else {
      left = triggerRect.right + gap
      top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2)
    }

    const clampedLeft = Math.min(vw - tooltipRect.width - edge, Math.max(edge, left))
    const clampedTop = Math.min(vh - tooltipRect.height - edge, Math.max(edge, top))
    setTooltipCoords({ top: clampedTop, left: clampedLeft })
  }, [visible, position])

  useEffect(() => {
    if (!visible) {
      adjustedPosRef.current = position
      setAdjustedPos(position)
    }
  }, [visible, position])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!visible) return
    const raf = requestAnimationFrame(() => updateTooltipPosition())
    const onViewportChange = () => updateTooltipPosition()
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
    // adjustedPos eliminado de deps → evita loop: position correction → re-effect → re-correction
  }, [visible, updateTooltipPosition])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const arrowClasses: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-[#1e293b] dark:border-t-[#1e293b]',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-[#1e293b] dark:border-b-[#1e293b]',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-[#1e293b] dark:border-l-[#1e293b]',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-[#1e293b] dark:border-r-[#1e293b]',
  }

  const Icon = variant === 'help' ? HelpCircle : Info
  const hasRichContent = title || formula || example

  return (
    <>
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
      </span>

      {mounted && createPortal(
        <span
          ref={tooltipRef}
          onMouseEnter={show}
          onMouseLeave={hide}
          className={cn(
            'fixed z-[9999]',
            'rounded-lg shadow-2xl',
            'bg-slate-800 text-slate-100',
            'text-xs leading-relaxed',
            'transition-all duration-150 ease-out',
            visible
              ? 'opacity-100 scale-100 pointer-events-auto'
              : 'opacity-0 scale-95 pointer-events-none',
            hasRichContent ? 'w-72 p-3' : 'w-56 p-2.5',
          )}
          style={{
            top: `${tooltipCoords.top}px`,
            left: `${tooltipCoords.left}px`,
            backdropFilter: 'blur(8px)',
          }}
        >
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
        </span>,
        document.body,
      )}
    </>
  )
}
