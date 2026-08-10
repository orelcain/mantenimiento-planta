/**
 * Matriz turno × día — la vista de período del Análisis Grader.
 *
 * Reemplaza al calendario mensual. La diferencia no es estética: el calendario
 * usa el DÍA como contenedor, así que un turno que cruza medianoche no cabe en
 * una celda y termina partido en dos fragmentos (`salida` + `madrugada`). Acá
 * el contenedor es el TURNO: una fila por turno, una columna por día, y cada
 * turno ocupa UNA celda anclada al día en que arranca.
 *
 * DENSIDAD: el mes completo son 31 columnas. Medido a 900 px de card (el ancho
 * real con el panel lateral abierto), cada celda queda en ~22 px — ahí no entra
 * un número de 5 dígitos. Por eso la celda codifica magnitud SOLO con color, y
 * el valor aparece en el hover, en la celda seleccionada y en la Lista. Se
 * evaluó abreviar (`3,7k`) y se descartó: hace ver iguales dos turnos que
 * difieren en 100 piezas, que es justo la comparación que motiva abrir la vista.
 *
 * COLOR: la rampa (`--shift-ramp-*`) codifica MAGNITUD — un solo hue, 4 pasos,
 * validada. El ESTADO (bajo objetivo / sin anotar) va en un canal aparte, con
 * forma, para que se lea aunque el color no se distinga y para no competir con
 * la escala.
 */
import { useMemo, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Sun, Sunset, Moon, Sunrise, Clock } from 'lucide-react'
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import { formatShiftWindow } from '@/services/grader/graderShiftPeriod'
import { getShiftMeta, displayShiftName } from '@/services/grader/graderShiftDisplay'
import {
  matrixKpiMeta, matrixKpiValue, formatMatrixKpi, isBelowMatrixTarget,
  type MatrixKpi,
} from '@/services/grader/graderShiftMatrixKpi'

const ICONS = { Sun, Sunset, Moon, Sunrise, Clock } as const

/**
 * Corta la escala en 4 tramos por cuartiles de los valores PRESENTES.
 *
 * Por cuartiles y no por un rango absoluto: la producción varía un orden de
 * magnitud entre temporada y parada, y una escala fija pintaría meses enteros
 * de un solo tono. El costo es que el color es relativo al período — por eso la
 * leyenda dice "menos/más" y nunca un valor.
 */
function useQuartiles(shifts: readonly PeriodShift[], kpi: MatrixKpi): number[] {
  return useMemo(() => {
    const vs = shifts
      .map(s => matrixKpiValue(s, kpi))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)
    if (vs.length === 0) return [0, 0, 0]
    const q = (p: number) => vs[Math.min(vs.length - 1, Math.floor(p * vs.length))]!
    return [q(0.25), q(0.5), q(0.75)]
  }, [shifts, kpi])
}

function binOf(v: number, q: readonly number[]): 1 | 2 | 3 | 4 {
  return v <= q[0]! ? 1 : v <= q[1]! ? 2 : v <= q[2]! ? 3 : 4
}

export interface GraderShiftPeriodMatrixProps {
  shifts: readonly PeriodShift[]
  /** shiftIds presentes, ya ordenados por hora de inicio. */
  rows: readonly string[]
  /** `YYYY-MM-DD` de todos los días del período. */
  days: readonly string[]
  byKey: ReadonlyMap<string, PeriodShift>
  kpi: MatrixKpi
  loading?: boolean
  /** Turno seleccionado (`${dateKey}__${shiftId}`). Muestra su valor en la celda. */
  selectedKey?: string | null
  onSelect?: (shift: PeriodShift) => void
  /** Abrir el análisis completo del turno. Botón "Ver turno" del panel. */
  onOpenShift?: (shift: PeriodShift) => void
  className?: string
}

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

/** Día de la semana sin construir un Date local (evita el corrimiento por huso). */
function dowOf(dateKey: string): string {
  const t = Date.parse(`${dateKey}T12:00:00Z`)
  return isNaN(t) ? '' : DOW[new Date(t).getUTCDay()]!
}
function isWeekend(dateKey: string): boolean {
  const d = dowOf(dateKey)
  return d === 'sáb' || d === 'dom'
}

export function GraderShiftPeriodMatrix({
  shifts, rows, days, byKey, kpi, loading = false,
  selectedKey = null, onSelect, onOpenShift, className,
}: GraderShiftPeriodMatrixProps) {
  const quartiles = useQuartiles(shifts, kpi)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  // Posición del tooltip flotante, en coordenadas de viewport. Pedido explícito
  // de Orel: los datos del turno tienen que aparecer JUNTO al cursor — el panel
  // fijo de abajo quedaba tan lejos de la celda que parecía que no había datos.
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null)

  const kpiMeta = matrixKpiMeta(kpi)
  const gridCols = `minmax(96px, 128px) repeat(${days.length}, minmax(0, 1fr))`

  // Σ 24 h solo tiene sentido en magnitudes acumulables. Sumar el UPT o el P0%
  // de dos turnos no significa nada, así que la fila no se muestra vacía: no va.
  const showTotals = kpi === 'cycles' || kpi === 'pieces'
  const totals = useMemo(() => {
    if (!showTotals) return null
    const m = new Map<string, number>()
    for (const s of shifts) {
      const v = matrixKpiValue(s, kpi)
      if (v == null) continue
      m.set(s.dateKey, (m.get(s.dateKey) ?? 0) + v)
    }
    return m
  }, [shifts, kpi, showTotals])

  const handleSelect = useCallback((s: PeriodShift) => onSelect?.(s), [onSelect])

  // Dos superficies con roles distintos: el TOOLTIP flotante sigue al hover
  // (lectura rápida, junto al cursor), el PANEL de abajo muestra solo el turno
  // SELECCIONADO (permanente, con el botón para abrirlo — y es el camino en
  // tablet, donde no hay hover).
  const hovered = hoverKey ? byKey.get(hoverKey) ?? null : null
  const focused = selectedKey ? byKey.get(selectedKey) ?? null : null

  return (
    <Card className={cn('relative', className)}>
      <CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-3 flex-wrap">
        <h3 className="font-semibold tracking-tight text-base">Turnos del período</h3>
        <span className="text-xs text-muted-foreground">
          Color = {kpiMeta.label.toLowerCase()} · {shifts.length} turno{shifts.length === 1 ? '' : 's'}
        </span>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            Cargando turnos…
          </div>
        ) : rows.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            Sin turnos con datos en este período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* Cabecera de días */}
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: gridCols }}>
                <div />
                {days.map(dk => (
                  <div
                    key={dk}
                    className={cn(
                      'text-center text-caption font-mono leading-tight pb-1',
                      isWeekend(dk) ? 'text-primary font-semibold' : 'text-muted-foreground',
                    )}
                  >
                    {Number(dk.slice(8, 10))}
                  </div>
                ))}
              </div>

              {/* Una fila por turno presente */}
              {rows.map(shiftId => {
                // La fila se identifica por el nombre normalizado: `Turno 1` y
                // `Turno 1 Lunes` son la misma (ver `mergeSameNameShifts`).
                const sample = shifts.find(s => s.shiftId === shiftId)
                  ?? shifts.find(s => displayShiftName(s.shiftId) === shiftId)
                const meta = sample?.meta ?? getShiftMeta(shiftId)
                const Icon = ICONS[meta.iconName] ?? Clock
                // "Sin turno asignado" NO es un turno: es lo que Shoplogix no
                // pudo atribuir a ninguna ventana configurada. Se muestra —
                // esconderlo perdería producción real — pero subordinado: en
                // los datos reales pesa 0,8% de los ciclos, y darle el mismo
                // peso visual que a un turno de 20.000 ciclos exagera su
                // importancia. Va separado y atenuado, debajo de los turnos.
                const isOutOfShift = sample?.unscheduled ?? false
                return (
                  <div
                    key={shiftId}
                    className={cn(
                      'grid gap-[2px] mt-[2px]',
                      isOutOfShift && 'opacity-75 mt-2 pt-2 border-t border-dashed border-border',
                    )}
                    style={{ gridTemplateColumns: gridCols }}
                  >
                    <div className={cn('flex items-center gap-1.5 pl-2 pr-1 border-l-[3px] min-w-0',
                      meta.borderColorClass)}>
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.textColorClass)} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-footnote font-semibold leading-tight truncate">
                          {/* Los turnos llevan el nombre FIEL de Shoplogix. El
                              residuo sin turno no ES un turno — mostrar el
                              string interno "Unscheduled" se leía como bug; se
                              nombra por lo que significa y lo que hay que hacer. */}
                          {isOutOfShift ? 'Sin turno' : displayShiftName(shiftId)}
                        </span>
                        <span className="block text-caption text-muted-foreground font-mono leading-tight">
                          {isOutOfShift ? 'configurar en Shoplogix' : meta.scheduleHint}
                        </span>
                      </span>
                    </div>

                    {days.map(dk => {
                      const s = byKey.get(`${dk}__${shiftId}`)
                      const v = s ? matrixKpiValue(s, kpi) : null
                      if (!s || v == null) {
                        return (
                          <div
                            key={dk}
                            className="rounded-ctl min-h-[40px]"
                            style={{ background: 'var(--shift-empty)' }}
                            aria-hidden
                          />
                        )
                      }
                      const bin = binOf(v, quartiles)
                      const selected = selectedKey === s.key
                      return (
                        <button
                          key={dk}
                          type="button"
                          onClick={() => handleSelect(s)}
                          onMouseEnter={(e) => {
                            const r = e.currentTarget.getBoundingClientRect()
                            setHoverKey(s.key)
                            setTipPos({ x: r.left + r.width / 2, y: r.top })
                          }}
                          onMouseLeave={() => { setHoverKey(k => (k === s.key ? null : k)); setTipPos(null) }}
                          onFocus={(e) => {
                            const r = e.currentTarget.getBoundingClientRect()
                            setHoverKey(s.key)
                            setTipPos({ x: r.left + r.width / 2, y: r.top })
                          }}
                          onBlur={() => { setHoverKey(k => (k === s.key ? null : k)); setTipPos(null) }}
                          aria-label={`${displayShiftName(shiftId)}, ${dk}, ${formatMatrixKpi(v, kpi)}${s.crossesMidnight || s.startDayOffset > 0 ? ', termina otro día' : ''}${s.mergedFrom ? `, ${s.mergedFrom.length} jornadas` : ''}`}
                          aria-pressed={selected}
                          className={cn(
                            'relative rounded-ctl min-h-[40px]',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            'focus-visible:ring-offset-1 focus-visible:z-10',
                            selected && 'ring-2 ring-foreground ring-offset-1 z-10',
                          )}
                          style={{
                            background: `var(--shift-ramp-${bin})`,
                            color: `var(--shift-ramp-${bin}-ink)`,
                          }}
                        >
                          {/* Estado en FORMA, no en color: legible sin distinguir tonos. */}
                          {isBelowMatrixTarget(s, kpi) && (
                            <span
                              aria-hidden
                              className="absolute top-0 left-0 w-0 h-0 rounded-tl-sm"
                              style={{
                                borderTop: '11px solid var(--lc-crit)',
                                borderRight: '11px solid transparent',
                              }}
                            />
                          )}
                          {s.hasGrader === false && s.pieces == null && (
                            <span
                              aria-hidden
                              className="absolute bottom-[3px] right-[3px] w-[6px] h-[6px] rounded-full"
                              style={{ border: '1.5px solid var(--lc-warn)' }}
                            />
                          )}
                          {(s.crossesMidnight || s.startDayOffset > 0) && (
                            <span aria-hidden className="absolute top-0 right-[2px] text-caption font-bold opacity-90">
                              {s.startDayOffset > 0 ? '⁺¹' : '→'}
                            </span>
                          )}
                          {/* El turno corrió DOS veces este día (los lunes, con
                              el horario especial de arranque de semana). La
                              celda suma ambas; el desglose va en el tooltip. */}
                          {s.mergedFrom && (
                            <span
                              aria-hidden
                              className="absolute bottom-0 left-[2px] text-caption font-bold opacity-90 leading-none"
                            >
                              ×{s.mergedFrom.length}
                            </span>
                          )}
                          {/* Sin número: a 22-28 px se recorta y se lee peor que
                              no ponerlo. El valor va al tooltip y al detalle. */}
                        </button>
                      )
                    })}
                  </div>
                )
              })}

              {showTotals && totals && (
                <div
                  className="grid gap-[2px] mt-2 pt-2 border-t border-border"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <div className="pl-2 text-caption text-muted-foreground">Σ 24 h</div>
                  {days.map(dk => (
                    <div key={dk} className="text-center text-caption font-mono tabular-nums text-muted-foreground">
                      {totals.get(dk) ? Math.round(totals.get(dk)!).toLocaleString('es-CL') : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Leyenda: obligatoria en escala continua — sin ella el color no se puede leer. */}
        {!loading && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 pt-3 border-t border-border
                          text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {kpiMeta.scaleLo}
              <span className="inline-flex rounded-ctl overflow-hidden" aria-hidden>
                {[1, 2, 3, 4].map(i => (
                  <span key={i} className="block w-5 h-2.5" style={{ background: `var(--shift-ramp-${i})` }} />
                ))}
              </span>
              {kpiMeta.scaleHi}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-ctl border border-border" style={{ background: 'var(--shift-empty)' }} aria-hidden />
              sin proceso
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="w-0 h-0"
                    style={{ borderTop: '11px solid var(--lc-crit)', borderRight: '11px solid transparent' }} />
              bajo objetivo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="w-[6px] h-[6px] rounded-full" style={{ border: '1.5px solid var(--lc-warn)' }} />
              sin datos del Grader
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono font-bold">⁺¹</span> ocurre al día siguiente
            </span>
          </div>
        )}

        {/* Tooltip flotante junto al cursor — la lectura rápida al pasar por
            encima. `pointer-events-none` para que no robe el mouseleave de la
            celda; posición fija en viewport, clampeada a los bordes. */}
        {hovered && tipPos && (
          <div
            role="tooltip"
            className="fixed z-50 pointer-events-none rounded-md border border-border bg-card
                       shadow-lg px-3 py-2 text-xs leading-relaxed"
            style={{
              left: Math.max(8, Math.min(tipPos.x - 110, window.innerWidth - 228)),
              top: Math.max(8, tipPos.y - 8),
              transform: 'translateY(-100%)',
              maxWidth: 220,
            }}
          >
            <div className="font-semibold mb-0.5">
              {hovered.unscheduled ? 'Sin turno configurado' : displayShiftName(hovered.shiftId)}
              {/* Separador explícito: "Turno 2" + "01/08" pegados se lee "Turno 201/08". */}
              <span className="font-mono font-normal text-muted-foreground ml-1.5">
                · {hovered.dateKey.slice(8, 10)}/{hovered.dateKey.slice(5, 7)}
              </span>
            </div>
            <div className="font-mono text-muted-foreground">{formatShiftWindow(hovered)}</div>
            {/* Dos jornadas del mismo turno en un día: el total de arriba las
                suma, así que hay que poder ver de dónde sale. */}
            {hovered.mergedFrom && (
              <div className="mt-0.5 pl-1.5 border-l border-border/60 space-y-0.5">
                {hovered.mergedFrom.map(inst => (
                  <div key={inst.key} className="font-mono text-caption text-muted-foreground">
                    {formatShiftWindow(inst)} · {inst.cycles.toLocaleString('es-CL')} cic
                  </div>
                ))}
              </div>
            )}
            <div className="font-mono">
              <b>{hovered.cycles.toLocaleString('es-CL')}</b> cic
              {hovered.attributedCycles
                ? <span style={{ color: 'var(--lc-warn)' }}> (+{hovered.attributedCycles.toLocaleString('es-CL')})</span>
                : null}
              {hovered.uptimePct != null && <> · UPT <b>{Math.round(hovered.uptimePct)}%</b></>}
            </div>
            <div className="font-mono">
              {hovered.pieces != null
                ? <><b>{hovered.pieces.toLocaleString('es-CL')}</b> pz{hovered.p0Pct != null && <> · P0 <b>{hovered.p0Pct.toFixed(1).replace('.', ',')}%</b></>}</>
                : <span className="text-muted-foreground">sin Excel del Grader</span>}
            </div>
          </div>
        )}

        {/* Panel del turno SELECCIONADO — permanente, con el acceso al análisis.
            En tablet (sin hover) es la única superficie de lectura. */}
        <div className={cn(
          'mt-3 rounded-ctl border px-3 py-2 text-xs transition-colors',
          // Alto reservado: sin esto, al seleccionar un turno el panel pasa de
          // una linea de placeholder a una fila de datos (que ademas envuelve
          // a 2 en pantallas medianas) y toda la pagina da un salto.
          'min-h-[3.25rem] flex items-center',
          focused ? 'border-primary/40 bg-accent/40' : 'border-dashed border-border',
        )}>
          {focused ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 w-full">
              <span className="font-semibold">
                {focused.unscheduled ? 'Sin turno configurado' : displayShiftName(focused.shiftId)}
              </span>
              <span className="font-mono text-muted-foreground">
                {focused.dateKey.slice(8, 10)}/{focused.dateKey.slice(5, 7)} · {formatShiftWindow(focused)}
                {focused.durationMin != null && ` · ${Math.floor(focused.durationMin / 60)}h${String(focused.durationMin % 60).padStart(2, '0')}`}
              </span>
              <span className="font-mono">
                <b>{focused.cycles.toLocaleString('es-CL')}</b> cic
                {focused.attributedCycles ? (
                  <span style={{ color: 'var(--lc-warn)' }} className="ml-1"
                        title="ciclos que Shoplogix no había asignado a este turno">
                    (+{focused.attributedCycles.toLocaleString('es-CL')} fuera de horario)
                  </span>
                ) : null}
              </span>
              {focused.uptimePct != null && (
                <span className="font-mono">UPT <b>{Math.round(focused.uptimePct)}%</b></span>
              )}
              <span className="font-mono">
                {focused.pieces != null
                  ? <><b>{focused.pieces.toLocaleString('es-CL')}</b> pz</>
                  : <span className="text-muted-foreground">sin Excel del Grader</span>}
              </span>
              {focused.p0Pct != null && (
                <span className="font-mono">P0 <b>{focused.p0Pct.toFixed(1).replace('.', ',')}%</b></span>
              )}
              {focused.windowSource !== 'effective' && (
                <span className="text-muted-foreground italic">horario {focused.windowSource}</span>
              )}
              <span className="flex-1" />
              {onOpenShift && (
                <button
                  type="button"
                  onClick={() => onOpenShift(focused)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground
                             hover:opacity-90 transition-opacity
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ver turno →
                </button>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">
              Tocá un turno para fijarlo acá y poder abrir su análisis.
            </span>
          )}
        </div>

      </CardContent>
    </Card>
  )
}
