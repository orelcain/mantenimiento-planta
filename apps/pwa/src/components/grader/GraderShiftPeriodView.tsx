/**
 * Vista de período del Análisis Grader — la Matriz turno × día.
 *
 * Hubo una vista Lista alternativa con toggle. Se retiró a pedido de Orel
 * (2026-08-03): "no la entiendo, es difícil de entender". Dos formas de leer lo
 * mismo obligaban a elegir cuál mirar, y la que ganaba siempre era la matriz.
 * En pantalla angosta la matriz hace scroll horizontal, que es honesto: se ve
 * menos mes, pero lo que se ve es cierto.
 */
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Info, ChevronLeft, ChevronRight, Image as ImageIcon, FileText, Loader2 } from 'lucide-react'
import { GraderShiftPeriodMatrix } from '@/components/grader/GraderShiftPeriodMatrix'
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import { MATRIX_KPIS, DEFAULT_MATRIX_KPI, type MatrixKpi } from '@/services/grader/graderShiftMatrixKpi'

export interface GraderShiftPeriodViewProps {
  shifts: readonly PeriodShift[]
  rows: readonly string[]
  days: readonly string[]
  byKey: ReadonlyMap<string, PeriodShift>
  loading?: boolean
  error?: string | null
  /** Shoplogix no respondió: lo que se ve viene solo del Grader. */
  slxDegraded?: boolean
  selectedKey?: string | null
  onSelect?: (shift: PeriodShift) => void
  /** Abrir el análisis completo del turno. */
  onOpenShift?: (shift: PeriodShift) => void
  /** Mes visible. Si se pasa junto con `onMonthChange`, aparece el navegador. */
  month?: Date
  onMonthChange?: (next: Date) => void
  /** Descargar el comparativo del período. Sin esto los botones no aparecen. */
  onExport?: (format: 'png' | 'pdf') => void
  /** Formato que se está generando ahora mismo, para bloquear los botones. */
  exporting?: 'png' | 'pdf' | null
  className?: string
}

export function GraderShiftPeriodView({
  shifts, rows, days, byKey, loading = false, error = null,
  slxDegraded = false, selectedKey = null, onSelect, onOpenShift,
  month, onMonthChange, onExport, exporting = null, className,
}: GraderShiftPeriodViewProps) {
  const [kpi, setKpi] = useState<MatrixKpi>(DEFAULT_MATRIX_KPI)
  const [onlyOutOfShift, setOnlyOutOfShift] = useState(false)

  const visible = useMemo(
    () => (onlyOutOfShift ? shifts.filter(s => s.unscheduled) : shifts),
    [shifts, onlyOutOfShift],
  )
  const visibleRows = useMemo(
    () => rows.filter(r => visible.some(s => s.shiftId === r)),
    [rows, visible],
  )

  // Cuánta producción ocurrió FUERA de las ventanas configuradas en Shoplogix.
  // Tras la atribución casi todo vive ya dentro de un turno (attributedCycles),
  // así que el número junta ambas cosas: lo atribuido + el residuo sin turno.
  // Se muestra para que el dato operacional no desaparezca al ordenarse la vista.
  const outOfShift = useMemo(() => {
    const total = shifts.reduce((a, s) => a + s.cycles, 0)
    const uns = shifts.filter(s => s.unscheduled)
    const unsCycles = uns.reduce((a, s) => a + s.cycles, 0)
    const attributed = shifts.reduce((a, s) => a + (s.attributedCycles ?? 0), 0)
    const cycles = unsCycles + attributed
    return {
      count: uns.length,
      cycles,
      pct: total > 0 ? (cycles / total) * 100 : 0,
    }
  }, [shifts])

  const chip = (active: boolean) => cn(
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-ctl border transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'bg-primary text-primary-foreground border-primary font-semibold'
      : 'bg-card text-muted-foreground border-border hover:bg-accent',
  )

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Una sola fila de filtros, arriba de todo lo que alcanza. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Navegación de mes. La traía el calendario que esta vista reemplaza:
            sin ella el período queda congelado en el mes actual. */}
        {month && onMonthChange && (
          <div className="inline-flex items-center gap-1 mr-1">
            <button
              type="button" aria-label="Mes anterior"
              onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border
                         text-muted-foreground hover:bg-accent transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="font-semibold text-sm min-w-[8.5rem] text-center capitalize">
              {month.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button" aria-label="Mes siguiente"
              onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border
                         text-muted-foreground hover:bg-accent transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => { const n = new Date(); onMonthChange(new Date(n.getFullYear(), n.getMonth(), 1)) }}
              className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground
                         hover:bg-accent transition-colors ml-0.5
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hoy
            </button>
          </div>
        )}

        <div className="inline-flex rounded-ctl border border-border overflow-hidden" role="group" aria-label="Indicador">
          {MATRIX_KPIS.map(k => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKpi(k.id)}
              aria-pressed={kpi === k.id}
              className={cn(
                'px-2.5 py-1.5 text-xs font-mono border-0 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10',
                kpi === k.id
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        {/* Con residuo sin turno el chip filtra; sin residuo (todo ya atribuido)
            queda informativo — el dato operacional "cuánto se produjo fuera de
            ventana" no debe desaparecer solo porque la vista lo ordenó. */}
        {outOfShift.count > 0 ? (
          <button
            type="button"
            onClick={() => setOnlyOutOfShift(v => !v)}
            aria-pressed={onlyOutOfShift}
            className={cn(chip(onlyOutOfShift), !onlyOutOfShift && 'border-dashed')}
            title="Ciclos que Shoplogix no pudo atribuir a ninguna ventana de turno configurada"
          >
            ⏱ fuera de turno
            <span className="font-mono tabular-nums opacity-80">
              {outOfShift.pct < 1 ? '<1' : Math.round(outOfShift.pct)} %
            </span>
          </button>
        ) : outOfShift.cycles > 0 ? (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border
                       border-dashed border-border text-muted-foreground cursor-help"
            title={`${outOfShift.cycles.toLocaleString('es-CL')} ciclos ocurrieron fuera de las ventanas de turno configuradas en Shoplogix; ya están sumados a sus turnos (marcados como "+N fuera de horario").`}
          >
            ⏱ fuera de ventana
            <span className="font-mono tabular-nums opacity-80">
              {outOfShift.pct < 1 ? '<1' : Math.round(outOfShift.pct)} %
            </span>
          </span>
        ) : null}

        {/* Comparativo del período: el entregable que contesta "¿vamos mejor?",
            que un turno aislado no puede responder. A la derecha, separado de
            los filtros, porque no cambia lo que se ve sino que se lo lleva. */}
        {onExport && (
          <div className="inline-flex items-center gap-1 ml-auto">
            <span className="text-caption text-muted-foreground mr-0.5 hidden sm:inline">
              Resumen del mes
            </span>
            <button
              type="button"
              onClick={() => onExport('png')}
              disabled={exporting !== null || shifts.length === 0}
              title="Descargar el comparativo del mes como imagen (PNG)"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border
                         text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {exporting === 'png'
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : <ImageIcon className="h-4 w-4" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => onExport('pdf')}
              disabled={exporting !== null || shifts.length === 0}
              title="Descargar el comparativo del mes como PDF"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border
                         text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {exporting === 'pdf'
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : <FileText className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-ctl border px-3 py-2 text-xs"
             style={{ borderColor: 'var(--lc-crit)', color: 'var(--lc-crit)' }}>
          {error}
        </div>
      )}
      {slxDegraded && !error && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground
                        inline-flex items-center gap-2">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Shoplogix no respondió: se muestran solo los turnos con Excel del Grader cargado.
        </div>
      )}
      {onlyOutOfShift && (
        <div className="rounded-ctl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Mostrando solo producción <b className="text-foreground">fuera de turno</b>:{' '}
          <b className="text-foreground font-mono">{outOfShift.cycles.toLocaleString('es-CL')}</b> ciclos en{' '}
          {outOfShift.count} registro{outOfShift.count === 1 ? '' : 's'} — el{' '}
          <b className="text-foreground font-mono">{outOfShift.pct.toFixed(1).replace('.', ',')} %</b> del período.
          Son ciclos que Shoplogix no pudo atribuir a ninguna ventana de turno configurada.
        </div>
      )}

      <GraderShiftPeriodMatrix
        shifts={visible} rows={visibleRows} days={days} byKey={byKey} kpi={kpi}
        loading={loading} selectedKey={selectedKey} onSelect={onSelect}
        onOpenShift={onOpenShift}
      />

    </div>
  )
}
