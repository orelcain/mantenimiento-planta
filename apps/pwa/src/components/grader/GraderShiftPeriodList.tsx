/**
 * Lista de turnos del período — la otra cara de la Matriz.
 *
 * NO se muestra junto a la Matriz: es la MISMA consulta dibujada de otra forma
 * (ver `GraderShiftPeriodView`).
 *
 * POR QUÉ NO ES UNA TABLA PLANA
 * -----------------------------
 * La primera versión fue una tabla de 47 filas iguales, y no se podía leer: sin
 * separación entre días, las fechas se perdían en una columna de texto y no se
 * veía en absoluto que el tiempo avanza. Cuarenta y siete renglones idénticos
 * no son una lista, son una pared.
 *
 * Esta versión recorre el CALENDARIO, no los turnos, y dibuja el tiempo:
 *   - Están TODOS los días del período, correlativos. Los que no tuvieron
 *     proceso ocupan su línea igual: colapsarlos en "2 días sin proceso"
 *     ahorraba espacio pero rompía la lectura rápida. Con la columna de fechas
 *     pareja se ven las rachas y las paradas sin leer una sola fecha.
 *   - Cada turno lleva una barra de 24 h que muestra CUÁNDO ocurrió y cuánto
 *     duró, así el solapamiento y el cruce de medianoche se ven, no se leen.
 */
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Sun, Sunset, Moon, Sunrise, Clock, ArrowUp, ArrowDown, CalendarOff } from 'lucide-react'
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import { formatShiftWindow } from '@/services/grader/graderShiftPeriod'
import { isBelowMatrixTarget, type MatrixKpi } from '@/services/grader/graderShiftMatrixKpi'

const ICONS = { Sun, Sunset, Moon, Sunrise, Clock } as const
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

type SortKey = 'when' | 'cycles' | 'uptime' | 'pieces' | 'p0'

const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'when',   label: 'Cronológico' },
  { key: 'cycles', label: 'Ciclos' },
  { key: 'uptime', label: 'UPT' },
  { key: 'pieces', label: 'Piezas' },
  { key: 'p0',     label: 'P0 %' },
]

function sortValue(s: PeriodShift, key: SortKey): number {
  switch (key) {
    case 'when':   return s.start ? s.start.getTime() : Number.MAX_SAFE_INTEGER
    case 'cycles': return s.cycles
    case 'uptime': return s.uptimePct ?? -1
    case 'pieces': return s.pieces ?? -1
    case 'p0':     return s.p0Pct ?? -1
  }
}

function dayLabel(dateKey: string): { num: string; dow: string; month: string } {
  const t = Date.parse(`${dateKey}T12:00:00Z`)
  const d = new Date(t)
  return {
    num: String(d.getUTCDate()),
    dow: DOW[d.getUTCDay()] ?? '',
    month: d.toLocaleDateString('es-CL', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
  }
}

/** Minutos desde 00:00 del día de anclaje — puede pasar de 1440 si cruza. */
function minutesFromAnchor(s: PeriodShift, which: 'start' | 'end'): number | null {
  const d = which === 'start' ? s.start : s.end
  if (!d) return null
  const offset = which === 'start' ? s.startDayOffset : s.endDayOffset
  return offset * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes()
}

/**
 * Barra de 24 h que ubica el turno en el día. Es lo que convierte la lista en
 * una línea de tiempo: dos turnos del mismo día se ven uno al lado del otro, y
 * el que se pasa de medianoche se ve tocando el borde derecho.
 */
function TimeBar({ shift }: { shift: PeriodShift }) {
  const from = minutesFromAnchor(shift, 'start')
  const to = minutesFromAnchor(shift, 'end')
  if (from == null || to == null || to <= from) {
    return <div className="h-1.5 rounded-full" style={{ background: 'var(--shift-empty)' }} />
  }
  const left = Math.max(0, Math.min(100, (from / 1440) * 100))
  const width = Math.max(1.5, Math.min(100 - left, ((to - from) / 1440) * 100))
  const overflows = to > 1440

  return (
    <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--shift-empty)' }}>
      {/* marcas de 06 / 12 / 18 h para poder leer la hora sin números */}
      {[25, 50, 75].map(p => (
        <span key={p} aria-hidden className="absolute top-0 bottom-0 w-px opacity-40"
              style={{ left: `${p}%`, background: 'var(--lc-border-hi)' }} />
      ))}
      <span
        className={cn('absolute top-0 bottom-0 rounded-full', overflows && 'rounded-r-none')}
        style={{ left: `${left}%`, width: `${width}%`, background: 'var(--shift-ramp-3)' }}
      />
    </div>
  )
}

export interface GraderShiftPeriodListProps {
  shifts: readonly PeriodShift[]
  /**
   * TODOS los días del período. La lista los recorre completos, incluidos los
   * que no tuvieron proceso: colapsarlos en un "2 días sin proceso" ahorraba
   * espacio pero rompía la lectura rápida — con los días correlativos se ve el
   * ritmo del mes (rachas, paradas, fines de semana) sin leer una sola fecha.
   */
  days: readonly string[]
  kpi: MatrixKpi
  loading?: boolean
  selectedKey?: string | null
  onSelect?: (shift: PeriodShift) => void
  className?: string
}

export function GraderShiftPeriodList({
  shifts, days, kpi, loading = false, selectedKey = null, onSelect, className,
}: GraderShiftPeriodListProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'when', dir: 1 })

  /**
   * En orden cronológico se agrupa por día (con los saltos de días sin
   * proceso). En cualquier otro orden NO se agrupa: si el usuario pidió "por
   * peor UPT", agrupar por día rompería justamente el orden que pidió.
   */
  const grouped = useMemo(() => {
    if (sort.key !== 'when') return null
    const byDay = new Map<string, PeriodShift[]>()
    for (const s of [...shifts].sort((a, b) => sortValue(a, 'when') - sortValue(b, 'when'))) {
      const arr = byDay.get(s.dateKey)
      if (arr) arr.push(s); else byDay.set(s.dateKey, [s])
    }
    // Todos los días del período, tengan o no turnos, en orden correlativo.
    const all = [...days]
    if (sort.dir === -1) all.reverse()
    return all.map(dk => [dk, byDay.get(dk) ?? []] as const)
  }, [shifts, days, sort])

  const flat = useMemo(
    () => [...shifts].sort((a, b) => (sortValue(a, sort.key) - sortValue(b, sort.key)) * sort.dir),
    [shifts, sort],
  )

  const Arrow = sort.dir === 1 ? ArrowUp : ArrowDown

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3 flex-wrap">
        <h3 className="font-semibold tracking-tight text-base">Turnos del período</h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">Ordenar</span>
          {SORTS.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(p => (p.key === s.key
                ? { key: s.key, dir: p.dir === 1 ? -1 : 1 }
                : { key: s.key, dir: s.key === 'when' ? 1 : -1 }))}
              aria-pressed={sort.key === s.key}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                sort.key === s.key
                  ? 'border-primary text-primary font-semibold bg-primary/10'
                  : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              {s.label}
              {sort.key === s.key && <Arrow className="h-3 w-3" aria-hidden />}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Cargando turnos…</div>
        ) : shifts.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            Sin turnos con datos en este período.
          </div>
        ) : grouped ? (
          <div className="flex flex-col">
            {grouped.map(([dateKey, dayShifts]) => {
              const d = dayLabel(dateKey)
              const vacio = dayShifts.length === 0
              const finde = d.dow === 'sáb' || d.dow === 'dom'
              const totalCycles = dayShifts.reduce((a, s) => a + s.cycles, 0)

              // Día sin proceso: una sola línea, misma altura para todos, para
              // que la columna de fechas quede pareja y las rachas se vean.
              if (vacio) {
                return (
                  <div key={dateKey}
                       className="flex items-center gap-2 h-7 border-b border-border/30 last:border-b-0">
                    <span className={cn('font-mono text-[13px] tabular-nums w-6 text-right shrink-0',
                      finde ? 'text-primary' : 'text-muted-foreground')}>{d.num}</span>
                    <span className={cn('text-[10px] uppercase w-7 shrink-0',
                      finde ? 'text-primary/70' : 'text-muted-foreground/70')}>{d.dow}</span>
                    <span className="flex-1 border-t border-dashed border-border/50" />
                    <CalendarOff className="h-3 w-3 text-muted-foreground/50 shrink-0" aria-hidden />
                    <span className="text-[10px] text-muted-foreground/70 shrink-0">sin proceso</span>
                  </div>
                )
              }

              return (
                <div key={dateKey} className="border-b border-border/30 last:border-b-0 py-1">
                  <div className="flex items-center gap-2 py-0.5">
                    <span className={cn('font-mono font-bold text-[15px] tabular-nums w-6 text-right shrink-0',
                      finde && 'text-primary')}>{d.num}</span>
                    <span className={cn('text-[10px] uppercase w-7 shrink-0',
                      finde ? 'text-primary/80' : 'text-muted-foreground')}>{d.dow}</span>
                    <span className="flex-1 border-t border-border" />
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {totalCycles.toLocaleString('es-CL')} cic · {dayShifts.length} turno{dayShifts.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 pl-8">
                    {dayShifts.map(s => (
                      <ShiftRow key={s.key} shift={s} kpi={kpi}
                                selected={selectedKey === s.key} onSelect={onSelect} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {flat.map(s => (
              <ShiftRow key={s.key} shift={s} kpi={kpi} showDate
                        selected={selectedKey === s.key} onSelect={onSelect} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ShiftRow({
  shift: s, kpi, selected, onSelect, showDate = false,
}: {
  shift: PeriodShift; kpi: MatrixKpi; selected: boolean
  onSelect?: (s: PeriodShift) => void; showDate?: boolean
}) {
  const Icon = ICONS[s.meta.iconName] ?? Clock
  const below = isBelowMatrixTarget(s, kpi)
  const d = dayLabel(s.dateKey)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(s)}
      aria-pressed={selected}
      className={cn(
        'w-full text-left rounded-md border px-2.5 py-2 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-accent' : 'border-border hover:bg-accent/60',
        s.unscheduled && 'border-dashed opacity-80',
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', s.meta.textColorClass)} aria-hidden />
        {showDate && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {d.num}/{d.month}
          </span>
        )}
        <span className="font-semibold text-[12.5px]">{s.shiftId}</span>
        <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {formatShiftWindow(s)}
        </span>
        {s.durationMin != null && (
          <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
            ({Math.floor(s.durationMin / 60)}h{String(s.durationMin % 60).padStart(2, '0')})
          </span>
        )}

        <span className="flex-1" />

        <span className="flex items-center gap-3 font-mono text-[11.5px] tabular-nums">
          {s.cycles > 0 && (
            <span title="ciclos">
              {s.cycles.toLocaleString('es-CL')}
              {s.attributedCycles ? (
                <span className="text-[9.5px] ml-0.5" style={{ color: 'var(--lc-warn)' }}
                      title={`incluye ${s.attributedCycles.toLocaleString('es-CL')} ciclos que Shoplogix no había asignado a este turno`}>
                  +{s.attributedCycles.toLocaleString('es-CL')}
                </span>
              ) : null}
            </span>
          )}
          {s.uptimePct != null && (
            <span className={cn(below && 'font-bold')} style={below ? { color: 'var(--lc-crit)' } : undefined}
                  title="uptime">
              {Math.round(s.uptimePct)}%
            </span>
          )}
          {s.pieces != null && <span title="piezas del Grader">{s.pieces.toLocaleString('es-CL')} pz</span>}
          {s.p0Pct != null && <span title="P0">{s.p0Pct.toFixed(1).replace('.', ',')}% P0</span>}
        </span>
      </div>

      <div className="mt-1.5"><TimeBar shift={s} /></div>

      {(below || s.unscheduled || s.windowSource !== 'effective') && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[10px]">
          {below && <span className="font-semibold" style={{ color: 'var(--lc-crit)' }}>▲ bajo objetivo</span>}
          {s.unscheduled && (
            <span className="font-semibold" style={{ color: 'var(--lc-warn)' }}>
              ⏱ sin turno que lo explique
            </span>
          )}
          {s.windowSource !== 'effective' && (
            <span className="text-muted-foreground italic">horario {s.windowSource}</span>
          )}
        </div>
      )}
    </button>
  )
}
