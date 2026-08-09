/**
 * Tooltip/Popover con información detallada de una causa P0.
 *
 * Se dispara al pasar el mouse (desktop) o tocar el icono `?` (mobile).
 * Muestra:
 *  - Label + traducción técnica (inglés Marelec)
 *  - Badge Matrix oficial / Análisis derivado
 *  - Explicación simple (qué significa)
 *  - Cómo se detecta (para operarios avanzados)
 *  - Acción sugerida
 *  - Ejemplo concreto
 */

import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MatrixCauseMeta } from '@/services/grader/graderMatrixP0Causes'

interface Props {
  meta: MatrixCauseMeta
  /** Color semántico del badge de nivel — heredado de la causa */
  levelColor?: string
}

const LEVEL_LABELS = {
  official: 'Oficial Matrix',
  derived: 'Análisis derivado',
} as const

export function CauseTooltip({ meta }: Props) {
  const [open, setOpen] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Cerrar al hacer click fuera (mobile)
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`Información sobre ${meta.label}`}
        className="p-0.5 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            'absolute z-30 w-72 sm:w-80 rounded-card border bg-popover text-popover-foreground shadow-lg p-3 text-xs leading-relaxed',
            'right-0 top-6',
          )}
          onClick={(e) => e.stopPropagation()}
          data-no-swipe
        >
          {/* Header: label + traducción + badge */}
          <div className="space-y-1 pb-2 border-b border-border/60">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-sm">{meta.label}</span>
              <span
                className={cn(
                  'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border font-medium shrink-0',
                  meta.level === 'official'
                    ? 'border-primary/40 text-primary bg-primary/5'
                    : 'border-muted-foreground/30 text-muted-foreground bg-muted',
                )}
              >
                {LEVEL_LABELS[meta.level]}
              </span>
            </div>
            <p className="text-muted-foreground/80 italic text-[11px]">
              Marelec HMI: &ldquo;{meta.translation}&rdquo;
            </p>
          </div>

          {/* Secciones */}
          <div className="space-y-2 pt-2">
            <section>
              <p className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                ¿Qué significa?
              </p>
              <p>{meta.shortDescription}</p>
            </section>

            <section>
              <p className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Cómo se detecta
              </p>
              <p className="text-muted-foreground">{meta.howDetected}</p>
            </section>

            <section>
              <p className="font-medium text-[11px] uppercase tracking-wide text-emerald-500 mb-0.5">
                Qué hacer
              </p>
              <p>{meta.actionHint}</p>
            </section>

            <section>
              <p className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Ejemplo
              </p>
              <p className="text-muted-foreground italic">&ldquo;{meta.exampleTrigger}&rdquo;</p>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
