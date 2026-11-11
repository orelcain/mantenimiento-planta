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
import { dec } from '@/utils/formatoNumeros'
import { usePielApple } from '@/hooks/usePielApple'
import { Skeleton, SkeletonBloque } from '@/components/piel'
import { fmtDurationSec } from '@/services/grader/graderTimeFormat'

/** Porcentaje de la piel Apple: «61 %», con espacio duro. «sin datos» si no hay cifra. */
const ESPACIO_DURO = String.fromCharCode(160)
const pctAp = (v: number | null, d = 0): string =>
  v === null || !Number.isFinite(v) ? 'sin datos' : `${dec(v * 100, d)}${ESPACIO_DURO}%`

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
  return `${dec(v * 100, d)}%`
}
function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
// Número grande: la tinta de estado se retiró (no hay rótulo/punto chico al
// lado que la sostenga) y pasa a la tinta de etiqueta estándar.
function oeeColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  return 'text-foreground'
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
  const apple = usePielApple()

  if (apple) {
    return (
      <section className={cn('space-y-3', className)} aria-labelledby="oee-area-titulo">
        <div className="flex items-center gap-2">
          <h2 id="oee-area-titulo" className="text-headline">OEE del área (estimado)</h2>
          <InfoTooltip
            text={'Aproxima el OEE de TODA el área, no solo la máquina instrumentada.\n\nA_área = uptime de la máquina / (tiempo rastreado por el sensor + detenciones de etapa registradas)\nR_área ≈ R de la máquina (proxy del cuello de botella)\nQ_área = calidad del Grader donde existe; donde no hay Grader el OEE se muestra como A×R y se rotula.\n\nUna detención de etapa solo SUMA tiempo si no detuvo a la máquina: si la detuvo, ya está en el downtime del sensor y se anota como causa de esa detención. Así el mismo minuto no se castiga dos veces.'}
            iconSize={11}
            position="top"
          />
        </div>

        {busy && (
          <SkeletonBloque label="Cargando OEE del área" className="space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
          </SkeletonBloque>
        )}

        {!busy && !calc && (
          <p className="text-subhead text-muted-foreground">Sin datos del mes para estimar el OEE del área.</p>
        )}

        {/* Igual que la máquina: una línea. No hay nada que comparar. */}
        {!busy && calc && calc.etapaMin <= 0 && (
          <p className="text-subhead tabular-nums">
            {`OEE del área igual al de la máquina (${pctAp(calc.oeeMachine)}): sin detenciones de etapa registradas.`}
          </p>
        )}

        {!busy && calc && calc.etapaMin > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-headline tabular-nums">{pctAp(calc.oeeMachine)}</p>
                <p className="text-footnote text-muted-foreground">
                  {machineLabel ? `OEE de la máquina, ${machineLabel}` : 'OEE de la máquina'}
                </p>
              </div>
              <div>
                <p className="text-headline tabular-nums">{pctAp(calc.oeeArea)}</p>
                <p className="text-footnote text-muted-foreground">
                  {calc.sinCalidad ? 'OEE del área, disponibilidad por rendimiento' : 'OEE del área'}
                </p>
              </div>
            </div>

            <p className="text-subhead text-muted-foreground tabular-nums">
              {`Área = la máquina penalizada por ${fmtDurationSec(calc.etapaMin * 60)} de detenciones de etapa este mes (disponibilidad ${pctAp(calc.availabilityMachine)} a ${pctAp(calc.availabilityArea)}, sobre una base de ${fmtDurationSec(calc.baseMin * 60)}).`}
            </p>

            {calc.perdidas.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-headline">Dónde pierde tiempo el área</h3>
                <p className="text-footnote text-muted-foreground">
                  {`Este mes, ${fmtDurationSec(calc.perdidasTotal * 60)} en total.`}
                </p>
                {/* Tres columnas: tabla bordered simple, sin desplegar. */}
                <div className="overflow-hidden rounded-ctl border border-border">
                  <table className="w-full border-collapse text-subhead tabular-nums">
                    <caption className="sr-only">Dónde pierde tiempo el área este mes</caption>
                    <thead className="bg-muted/50 text-footnote text-muted-foreground">
                      <tr>
                        <th scope="col" className="border-b border-border px-2.5 py-2 text-left font-normal">Pérdida</th>
                        <th scope="col" className="border-b border-border px-2.5 py-2 text-left font-normal">Origen</th>
                        <th scope="col" className="border-b border-border px-2.5 py-2 text-right font-normal">Tiempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.perdidas.map((p) => (
                        <tr key={p.label} className="border-b border-border last:border-b-0">
                          <td className="px-2.5 py-2.5 align-middle">{p.label}</td>
                          <td className="px-2.5 py-2.5 align-middle text-muted-foreground">
                            {p.fuente === 'maquina' ? 'Máquina' : 'Etapa sin sensor'}
                          </td>
                          <td className="px-2.5 py-2.5 align-middle text-right">{fmtDurationSec(p.min * 60)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* La nota larga, una sola vez, en 13 px. */}
            <p className="text-footnote text-muted-foreground">
              {`Estimado. El rendimiento es el de la máquina instrumentada${calc.sinCalidad ? ' y el área no tiene medición de calidad' : ' y la calidad viene del Grader'}; las demás etapas entran a la disponibilidad vía sus detenciones registradas. Mejora al instrumentar o registrar más.`}
            </p>
          </>
        )}
      </section>
    )
  }

  return (
    <Card className={cn('border-primary/[0.25]', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-ink-info" />
          OEE del área (estimado)
          <InfoTooltip
            text={'Aproxima el OEE de TODA el área, no solo la máquina instrumentada.\n\nA_área = uptime de la máquina / (tiempo rastreado por el sensor + detenciones de etapa registradas)\nR_área ≈ R de la máquina (proxy del cuello de botella)\nQ_área = calidad del Grader donde existe; donde no hay Grader el OEE se muestra como A×R y se rotula.\n\nUna detención de etapa solo SUMA tiempo si no detuvo a la máquina: si la detuvo, ya está en el downtime del sensor y se anota como causa de esa detención. Así el mismo minuto no se castiga dos veces.\n\nESTIMADO: mejora a medida que registras detenciones de etapa.'}
            iconSize={11}
            position="top"
          />
          {areaLabel && <span className="text-caption font-normal text-muted-foreground">· {areaLabel} · este mes</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Spinner /> Cargando…</div>}

        {!busy && !calc && (
          <p className="text-xs text-muted-foreground py-1">Sin datos del mes para estimar el OEE del área.</p>
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
                <div className="text-caption text-ink-info mb-0.5 flex items-center gap-1 flex-wrap">
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
                ? <>Área = la máquina penalizada por <b className="text-ink-crit">{fmtDur(calc.etapaMin)}</b> de detenciones de etapa este mes (disponibilidad {pct(calc.availabilityMachine)} → {pct(calc.availabilityArea)}, sobre una base de {fmtDur(calc.baseMin)}). El rendimiento sigue siendo el de la máquina instrumentada.</>
                : <>Sin detenciones de etapa: igual al OEE de la máquina.{' '}<InfoTooltip text={"Todavía no registraste detenciones de etapa → el OEE del área es el de la máquina. Registra abajo las detenciones de las etapas sin sensor (la GEA, cintas) y este número se separa."} iconSize={11} /></>}
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
                        <span className={cn('font-medium flex items-center gap-1.5 min-w-0', i === 0 ? 'text-ink-crit' : 'text-foreground')}>
                          <span className="truncate">{i + 1}. {p.label}</span>
                          <span
                            className="text-caption px-1 rounded-ctl bg-muted-foreground/12 text-muted-foreground shrink-0"
                            title={p.fuente === 'maquina'
                              ? 'Detención de la máquina instrumentada (la midió el sensor)'
                              : 'Detención de una etapa sin sensor (registrada a mano)'}
                          >
                            {p.fuente === 'maquina' ? 'máquina' : 'etapa'}
                          </span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{fmtDur(p.min)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', i === 0 ? 'bg-fill-critical' : 'bg-destructive/[0.15]')} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-start gap-1.5 text-caption text-muted-foreground">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Estimado. El rendimiento es el de la máquina instrumentada{calc.sinCalidad ? ' y el área no tiene medición de calidad' : ' y la calidad viene del Grader'}; las demás etapas entran a la disponibilidad vía sus detenciones registradas. Mejora al instrumentar o registrar más.
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
