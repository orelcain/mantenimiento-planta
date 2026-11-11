/**
 * PeriodoNavegador — el período único de la pantalla (piel Apple).
 *
 * Día / Semana / Mes como texto (modo lectura) y, al lado, «‹ 7 nov ›»: la fecha del día, la semana o
 * el mes elegido. Las flechas mueven la referencia (un día, siete días o un mes).
 * La referencia vive en la página y la matriz y los indicadores la leen de ahí.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OpcionesLectura } from '@/components/piel/Lectura'
import type { KpiPeriod } from '@/hooks/usePlantKPIs'
import { etiquetaPeriodo } from '@/services/grader/periodoNavegacion'

const PERIODOS: readonly { value: KpiPeriod; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
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
    // Modo lectura: el período como texto subrayado y, al lado, «‹ 7 nov ›». Sin cápsula.
    <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-1', className)}>
      <OpcionesLectura nombre="Período del análisis" valor={period} opciones={PERIODOS} onCambio={onPeriodChange} />
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => onStep(-1)} aria-label="Período anterior" className={BOTON_FLECHA}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span aria-live="polite" className="min-w-[6.5rem] text-center text-footnote font-medium tabular-nums text-foreground">
          {etiqueta}
        </span>
        <button type="button" onClick={() => onStep(1)} aria-label="Período siguiente" className={BOTON_FLECHA}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
