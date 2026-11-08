/**
 * PeriodoNavegador — el período único de la pantalla (piel Apple).
 *
 * Día / Semana / Mes y, a la derecha, «‹ 7 nov ›»: la fecha del día, la semana o
 * el mes elegido. Las flechas mueven la referencia (un día, siete días o un mes).
 * La referencia vive en la página y la matriz y los indicadores la leen de ahí.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SegmentedControl } from '@/components/piel'
import type { KpiPeriod } from '@/hooks/usePlantKPIs'
import { etiquetaPeriodo } from '@/services/grader/periodoNavegacion'

const PERIODOS: { id: KpiPeriod; label: string }[] = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
]

const BOTON_FLECHA = cn(
  'size-11 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground',
  'hover:text-foreground hover:bg-accent transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
)

export interface PeriodoNavegadorProps {
  period: KpiPeriod
  onPeriodChange: (p: KpiPeriod) => void
  /** Día elegido: la referencia de la que salen el período y la fecha que se muestra. */
  referencia: Date
  onStep: (dir: -1 | 1) => void
  className?: string
}

export function PeriodoNavegador({ period, onPeriodChange, referencia, onStep, className }: PeriodoNavegadorProps) {
  const etiqueta = etiquetaPeriodo(referencia, period)
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <div className="min-w-0 flex-1">
        <SegmentedControl
          ariaLabel="Período del análisis"
          value={period}
          onChange={onPeriodChange}
          segments={PERIODOS.map((p) => ({ value: p.id, label: p.label }))}
          className="w-full"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => onStep(-1)} aria-label="Período anterior" className={BOTON_FLECHA}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span aria-live="polite" className="min-w-[7.5rem] text-center text-subhead font-medium tabular-nums">
          {etiqueta}
        </span>
        <button type="button" onClick={() => onStep(1)} aria-label="Período siguiente" className={BOTON_FLECHA}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
