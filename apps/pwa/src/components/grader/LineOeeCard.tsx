/**
 * LineOeeCard — OEE del ÁREA (estimado), Fase C del roadmap OEE de área.
 *
 * Combina las máquinas instrumentadas en Shoplogix con las etapas que no lo
 * están. El cálculo vive en `services/grader/areaOeeCompute.ts` (testeado);
 * acá solo se presenta.
 *
 * Dos casos reales distintos:
 *   - Eviscerado: 3 Baader + Grader → hay calidad, OEE = A×R×Q.
 *   - Filete: UNA Baader 200 instrumentada + una GEA sin integración y sin
 *     Grader → no hay calidad, el OEE se muestra como A×R y se rotula.
 *
 * HONESTO: es un ESTIMADO. R sigue siendo el de la máquina instrumentada (proxy
 * del cuello de botella) y las demás etapas entran vía sus paros registrados.
 * Ver docs/OEE_AREA_ROADMAP.md.
 */
import { useEffect, useMemo, useState } from 'react'
import { GitMerge, AlertTriangle, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Spinner, InfoTooltip } from '@/components/ui'
import { cn } from '@/lib/utils'
import { usePlantKPIsForPeriod } from '@/hooks/usePlantKPIs'
import { getParosByPlantLine } from '@/services/paros'
import { computeAreaOee } from '@/services/grader/areaOeeCompute'
import { lineMachinesLabel } from '@/services/shoplogix/shoplogixMachines'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { GraderDailySummary } from '@/services/grader/types'
import type { ParoEtapa } from '@/types'

interface LineOeeCardProps {
  plantLineId: string
  plantSlug: PlantSlug
  graderSummaries: GraderDailySummary[]
  currentMonth?: Date
  areaLabel?: string
  /** Cambiar este número fuerza a releer los paros (ver `onChanged` de ParoEtapaCapture). */
  refreshKey?: number
  className?: string
}

function pct(v: number | null, d = 0): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(d)}%`
}
function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
function oeeColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  if (v >= 0.85) return 'text-emerald-400'
  if (v >= 0.65) return 'text-sky-400'
  if (v >= 0.50) return 'text-amber-400'
  return 'text-rose-400'
}

export function LineOeeCard({ plantLineId, plantSlug, graderSummaries, currentMonth, areaLabel, refreshKey = 0, className }: LineOeeCardProps) {
  const month = useMemo(() => currentMonth ?? new Date(), [currentMonth])
  // OEE de las Baader del mes (reutiliza el cálculo existente).
  const { loading, kpis } = usePlantKPIsForPeriod(plantSlug, 'month', null, month, graderSummaries)

  const [paros, setParos] = useState<ParoEtapa[]>([])
  const [loadingParos, setLoadingParos] = useState(true)
  useEffect(() => {
    let cancel = false
    setLoadingParos(true)
    getParosByPlantLine(plantLineId)
      .then((p) => { if (!cancel) setParos(p) })
      .catch(() => { if (!cancel) setParos([]) })
      .finally(() => { if (!cancel) setLoadingParos(false) })
    return () => { cancel = true }
  }, [plantLineId, refreshKey])

  const calc = useMemo(() => {
    if (!kpis) return null
    // Paros del mes visible. `computeAreaOee` decide qué suma tiempo y qué es
    // solo la causa de un paro que el sensor ya midió (ver su nota de doble
    // conteo) — acá no se filtra por `origen` para no duplicar esa regla.
    const parosMes = paros.filter((p) =>
      p.fecha.getMonth() === month.getMonth() && p.fecha.getFullYear() === month.getFullYear())
    return computeAreaOee(kpis, parosMes)
  }, [kpis, paros, month])

  // Cómo llamar a la máquina instrumentada, sin hardcodear "Baader".
  const machineLabel = useMemo(
    () => (kpis ? lineMachinesLabel(kpis.machines) : ''),
    [kpis],
  )

  const busy = loading || loadingParos

  return (
    <Card className={cn('border-primary/[0.25]', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-sky-400" />
          OEE del área (estimado)
          <InfoTooltip
            text={'Aproxima el OEE de TODA el área, no solo la máquina instrumentada.\n\nA_área = uptime de la máquina / (tiempo rastreado por el sensor + paros de etapa registrados)\nR_área ≈ R de la máquina (proxy del cuello de botella)\nQ_área = calidad del Grader donde existe; donde no hay Grader el OEE se muestra como A×R y se rotula.\n\nUn paro de etapa solo SUMA tiempo si no detuvo a la máquina: si la detuvo, ya está en el downtime del sensor y se anota como causa de ese paro. Así el mismo minuto no se castiga dos veces.\n\nESTIMADO: mejora a medida que registrás paros de etapa.'}
            iconSize={11}
            position="top"
          />
          {areaLabel && <span className="text-caption font-normal text-muted-foreground">· {areaLabel} · este mes</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Spinner /> Cargando…</div>}

        {!busy && !calc && (
          <p className="text-xs text-muted-foreground/70 py-1">Sin datos del mes para estimar el OEE del área.</p>
        )}

        {!busy && calc && (
          <>
            {/* OEE Baader → línea */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted rounded-card px-3 py-2">
                <div className="text-caption text-muted-foreground mb-0.5">
                  OEE de la máquina{machineLabel ? ` · ${machineLabel}` : ''}
                </div>
                <div className={cn('text-xl font-bold tabular-nums', oeeColor(calc.oeeMachine))}>{pct(calc.oeeMachine)}</div>
              </div>
              <div className="bg-primary/[0.15] rounded-card px-3 py-2">
                <div className="text-caption text-sky-800/90 dark:text-sky-300/80 mb-0.5 flex items-center gap-1 flex-wrap">
                  OEE del área (estimado)
                  {calc.sinCalidad && (
                    <span
                      className="text-caption px-1 rounded-ctl bg-muted-foreground/15 text-muted-foreground"
                      title="El área no tiene medición de calidad (no pasa por Grader): el OEE mostrado es Disponibilidad × Rendimiento. No se asume calidad 100%."
                    >
                      A×R
                    </span>
                  )}
                </div>
                <div className={cn('text-xl font-bold tabular-nums', oeeColor(calc.oeeArea))}>{pct(calc.oeeArea)}</div>
              </div>
            </div>

            {/* Explicación del ajuste */}
            <p className="text-caption text-muted-foreground leading-relaxed">
              {calc.etapaMin > 0
                ? <>Área = la máquina penalizada por <b className="text-cat-5-ink">{fmtDur(calc.etapaMin)}</b> de paros de etapa este mes (disponibilidad {pct(calc.availabilityMachine)} → {pct(calc.availabilityArea)}, sobre una base de {fmtDur(calc.baseMin)}). El rendimiento sigue siendo el de la máquina instrumentada.</>
                : <>Todavía no registraste paros de etapa → el OEE del área es el de la máquina. Registrá abajo los paros de las etapas sin sensor (la GEA, cintas) y este número se separa.</>}
            </p>

            {/* Pareto unificado de pérdidas de la línea */}
            {calc.perdidas.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border/40">
                <p className="text-caption font-medium text-muted-foreground flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" /> Dónde pierde tiempo el área · este mes
                  <span className="text-muted-foreground/60">({fmtDur(calc.perdidasTotal)} total)</span>
                </p>
                {calc.perdidas.map((p, i) => {
                  const w = calc.perdidas[0]!.min > 0 ? (p.min / calc.perdidas[0]!.min) * 100 : 0
                  return (
                    <div key={p.label} className="space-y-0.5">
                      <div className="flex items-center justify-between text-caption">
                        <span className={cn('font-medium flex items-center gap-1.5 min-w-0', i === 0 ? 'text-cat-5-ink' : 'text-foreground')}>
                          <span className="truncate">{i + 1}. {p.label}</span>
                          <span
                            className="text-caption px-1 rounded-ctl bg-muted-foreground/12 text-muted-foreground shrink-0"
                            title={p.fuente === 'maquina'
                              ? 'Paro de la máquina instrumentada (lo midió el sensor)'
                              : 'Paro de una etapa sin sensor (registrado a mano)'}
                          >
                            {p.fuente === 'maquina' ? 'máquina' : 'etapa'}
                          </span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{fmtDur(p.min)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', i === 0 ? 'bg-rose-500' : 'bg-cat-5-tint/[0.15]')} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-start gap-1.5 text-caption text-muted-foreground/70">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Estimado. El rendimiento es el de la máquina instrumentada{calc.sinCalidad ? ' y el área no tiene medición de calidad' : ' y la calidad viene del Grader'}; las demás etapas entran a la disponibilidad vía sus paros registrados. Mejora al instrumentar o registrar más.
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
