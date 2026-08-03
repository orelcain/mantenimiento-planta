/**
 * Vista de período del Análisis Grader — Matriz o Lista, nunca las dos.
 *
 * Un solo hook de datos, dos presentaciones. La Matriz responde "¿cómo viene el
 * mes y dónde está el problema?"; la Lista responde "¿cuáles son y en qué orden?".
 * Mostrarlas juntas obligaba al ojo a elegir cuál mirar y ninguna ganaba, así
 * que se alternan:
 *
 *   - Por defecto: Matriz.
 *   - Bajo ~700 px la Matriz no es honesta (31 columnas no entran), así que la
 *     vista pasa a Lista SOLA. No es una preferencia: es que a ese ancho la
 *     grilla miente.
 *   - Al activar un filtro la pregunta cambia de "cómo viene el mes" a "cuáles
 *     son", y ahí la Lista es la respuesta — se sugiere el cambio sin forzarlo.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LayoutGrid, List, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { GraderShiftPeriodMatrix } from '@/components/grader/GraderShiftPeriodMatrix'
import { GraderShiftPeriodList } from '@/components/grader/GraderShiftPeriodList'
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import { MATRIX_KPIS, DEFAULT_MATRIX_KPI, type MatrixKpi } from '@/services/grader/graderShiftMatrixKpi'

/** Bajo este ancho la Matriz deja de ser legible y la vista pasa a Lista. */
const MATRIX_MIN_WIDTH = 700

export type PeriodViewMode = 'matrix' | 'list'

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
  className?: string
}

export function GraderShiftPeriodView({
  shifts, rows, days, byKey, loading = false, error = null,
  slxDegraded = false, selectedKey = null, onSelect, onOpenShift,
  month, onMonthChange, className,
}: GraderShiftPeriodViewProps) {
  const [kpi, setKpi] = useState<MatrixKpi>(DEFAULT_MATRIX_KPI)
  const [mode, setMode] = useState<PeriodViewMode>('matrix')
  const [onlyOutOfShift, setOnlyOutOfShift] = useState(false)
  const [narrow, setNarrow] = useState(false)

  const hostRef = useRef<HTMLDivElement>(null)

  // Ancho del CONTENEDOR, no del viewport: la vista convive con un panel
  // lateral que se abre y cierra, así que el tamaño de la ventana no dice si
  // la grilla entra.
  //
  // Se mide por tres vías a propósito. `ResizeObserver` es la correcta, pero no
  // siempre corre: depende del ciclo de layout, y en una pestaña que no se está
  // pintando (segundo plano, pane oculto) puede no disparar nunca. Sin el
  // respaldo, la vista se queda en Matriz a 600 px mostrando una grilla que no
  // entra — que es exactamente lo que se quería evitar.
  useEffect(() => {
    const measure = () => {
      const el = hostRef.current
      if (!el) return
      const w = el.getBoundingClientRect().width
      // 0 = aún sin layout; medir ahí daría un falso "angosto".
      if (w > 0) setNarrow(w < MATRIX_MIN_WIDTH)
    }

    measure()                                    // 1. al montar
    window.addEventListener('resize', measure)   // 2. al cambiar la ventana

    let ro: ResizeObserver | null = null          // 3. al cambiar el contenedor
    if (hostRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(hostRef.current)
    }
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [])

  const effectiveMode: PeriodViewMode = narrow ? 'list' : mode

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
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'bg-primary text-primary-foreground border-primary font-semibold'
      : 'bg-card text-muted-foreground border-border hover:bg-accent',
  )

  return (
    <div ref={hostRef} className={cn('flex flex-col gap-3', className)}>
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

        <div className="inline-flex rounded-md border border-border overflow-hidden" role="group" aria-label="Indicador">
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

        <span className="flex-1" />

        {/* El toggle desaparece cuando el ancho ya decidió por nosotros:
            ofrecer "Matriz" en una pantalla donde no entra sería mentir. */}
        {!narrow && (
          <div className="inline-flex rounded-md border border-border overflow-hidden" role="group" aria-label="Vista">
            <button
              type="button" onClick={() => setMode('matrix')} aria-pressed={mode === 'matrix'}
              className={cn('px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10',
                mode === 'matrix' ? 'bg-primary text-primary-foreground font-semibold'
                                  : 'bg-card text-muted-foreground hover:bg-accent')}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Matriz
            </button>
            <button
              type="button" onClick={() => setMode('list')} aria-pressed={mode === 'list'}
              className={cn('px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10',
                mode === 'list' ? 'bg-primary text-primary-foreground font-semibold'
                                : 'bg-card text-muted-foreground hover:bg-accent')}
            >
              <List className="h-3.5 w-3.5" aria-hidden /> Lista
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border px-3 py-2 text-xs"
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
      {narrow && !loading && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground
                        inline-flex items-center gap-2">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          A este ancho el mes completo no entra en la grilla — se muestra la lista.
        </div>
      )}
      {onlyOutOfShift && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Mostrando solo producción <b className="text-foreground">fuera de turno</b>:{' '}
          <b className="text-foreground font-mono">{outOfShift.cycles.toLocaleString('es-CL')}</b> ciclos en{' '}
          {outOfShift.count} registro{outOfShift.count === 1 ? '' : 's'} — el{' '}
          <b className="text-foreground font-mono">{outOfShift.pct.toFixed(1).replace('.', ',')} %</b> del período.
          Son ciclos que Shoplogix no pudo atribuir a ninguna ventana de turno configurada.
        </div>
      )}

      {effectiveMode === 'matrix' ? (
        <GraderShiftPeriodMatrix
          shifts={visible} rows={visibleRows} days={days} byKey={byKey} kpi={kpi}
          loading={loading} selectedKey={selectedKey} onSelect={onSelect}
          onOpenShift={onOpenShift}
        />
      ) : (
        <GraderShiftPeriodList
          shifts={visible} days={days} kpi={kpi} loading={loading}
          selectedKey={selectedKey} onSelect={onSelect}
        />
      )}
    </div>
  )
}
