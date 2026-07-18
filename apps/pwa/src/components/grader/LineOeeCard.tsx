/**
 * LineOeeCard — OEE de LÍNEA (estimado), Fase C del roadmap OEE de área.
 *
 * Combina lo que ya medimos para aproximar el OEE de toda la línea (no solo las
 * Baader):
 *   A_línea = A_baader − (min de paros de etapa / min productivos)
 *   R_línea ≈ R_baader   (cuello de botella, proxy)
 *   Q_línea = Q_grader
 *   OEE_línea = A_línea × R_línea × Q_línea
 * Los min productivos se derivan de los datos Baader: downtime_macro / (1 − A).
 * + Pareto unificado de pérdidas de tiempo (averías Baader + paros por etapa).
 *
 * HONESTO: es un ESTIMADO que mejora al registrar paros de etapa; R y Q siguen
 * siendo de Baader/Grader. Ver docs/OEE_AREA_ROADMAP.md.
 */
import { useEffect, useMemo, useState } from 'react'
import { GitMerge, AlertTriangle, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Spinner, InfoTooltip } from '@/components/ui'
import { cn } from '@/lib/utils'
import { usePlantKPIsForPeriod } from '@/hooks/usePlantKPIs'
import { getParosByPlantLine } from '@/services/paros'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { GraderDailySummary } from '@/services/grader/types'
import type { ParoEtapa } from '@/types'

interface LineOeeCardProps {
  plantLineId: string
  plantSlug: PlantSlug
  graderSummaries: GraderDailySummary[]
  currentMonth?: Date
  areaLabel?: string
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

export function LineOeeCard({ plantLineId, plantSlug, graderSummaries, currentMonth, areaLabel, className }: LineOeeCardProps) {
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
  }, [plantLineId])

  const calc = useMemo(() => {
    if (!kpis) return null
    const aBaader = kpis.availability        // disponibilidad Baader (0..1) o null
    const r = kpis.performance
    const q = kpis.quality
    const oeeBaader = kpis.oee

    // Paros de etapa del mes (minutos) + por etapa.
    const now = month
    const parosMes = paros.filter((p) => p.fecha.getMonth() === now.getMonth() && p.fecha.getFullYear() === now.getFullYear())
    const parosMin = parosMes.reduce((a, p) => a + p.duracionMin, 0)
    const parosByEtapa = new Map<string, number>()
    for (const p of parosMes) parosByEtapa.set(p.etapa, (parosByEtapa.get(p.etapa) ?? 0) + p.duracionMin)

    // Downtime macro de las Baader (min) = MTTR × N° averías.
    const downtimeBaaderMin = kpis.mttrMin * kpis.failureCount
    // Minutos productivos derivados: productive = downtime / (1 − A).
    const productiveMin = (aBaader !== null && aBaader < 1 && downtimeBaaderMin > 0)
      ? downtimeBaaderMin / (1 - aBaader)
      : null

    // A_línea = A_baader − paros/productivos (penaliza por los paros de etapa).
    let aLinea = aBaader
    let baseTiempo = true
    if (aBaader !== null && parosMin > 0) {
      if (productiveMin && productiveMin > 0) {
        aLinea = Math.max(0, aBaader - parosMin / productiveMin)
      } else {
        baseTiempo = false // hay paros pero no podemos derivar la base de tiempo
      }
    }
    const oeeLinea = (aLinea !== null && r !== null && q !== null) ? aLinea * r * q : null

    // Pareto de pérdidas de tiempo (min): averías Baader + paros por etapa.
    const perdidas = [
      ...(downtimeBaaderMin > 0 ? [{ label: 'Baaders (averías)', min: downtimeBaaderMin }] : []),
      ...[...parosByEtapa.entries()].map(([etapa, min]) => ({ label: etapa, min })),
    ].sort((a, b) => b.min - a.min)
    const perdidasTotal = perdidas.reduce((a, p) => a + p.min, 0)

    return { oeeBaader, oeeLinea, aLinea, aBaader, r, q, parosMin, baseTiempo, productiveMin, perdidas, perdidasTotal }
  }, [kpis, paros, month])

  const busy = loading || loadingParos

  return (
    <Card className={cn('border-sky-500/20', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-sky-400" />
          OEE de Línea (estimado)
          <InfoTooltip
            text={'Aproxima el OEE de TODA la línea, no solo las Baader.\n\nA_línea = A_baader − (min de paros de etapa / min productivos)\nR_línea ≈ R_baader (cuello de botella)\nQ_línea = Q del Grader\n\nESTIMADO: mejora a medida que registrás paros de etapa. R y Q siguen siendo de Baader/Grader hasta instrumentar más etapas.'}
            iconSize={11}
            position="top"
          />
          {areaLabel && <span className="text-[10px] font-normal text-muted-foreground">· {areaLabel} · este mes</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Spinner /> Cargando…</div>}

        {!busy && !calc && (
          <p className="text-xs text-muted-foreground/70 py-1">Sin datos del mes para estimar el OEE de línea.</p>
        )}

        {!busy && calc && (
          <>
            {/* OEE Baader → línea */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted rounded-lg px-3 py-2 border border-border">
                <div className="text-[10px] text-muted-foreground mb-0.5">OEE Baader (máquina)</div>
                <div className={cn('text-xl font-bold tabular-nums', oeeColor(calc.oeeBaader))}>{pct(calc.oeeBaader)}</div>
              </div>
              <div className="bg-sky-500/15 rounded-lg px-3 py-2 border border-sky-500/30">
                <div className="text-[10px] text-sky-800/90 dark:text-sky-300/80 mb-0.5">OEE Línea (estimado)</div>
                <div className={cn('text-xl font-bold tabular-nums', oeeColor(calc.oeeLinea))}>{pct(calc.oeeLinea)}</div>
              </div>
            </div>

            {/* Explicación del ajuste */}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {calc.parosMin > 0
                ? calc.baseTiempo
                  ? <>Línea = Baader penalizado por <b className="text-rose-800 dark:text-rose-300">{fmtDur(calc.parosMin)}</b> de paros de etapa este mes (disponibilidad {pct(calc.aBaader)} → {pct(calc.aLinea)}). R y Q siguen siendo de Baader/Grader.</>
                  : <>Hay <b className="text-rose-800 dark:text-rose-300">{fmtDur(calc.parosMin)}</b> de paros de etapa, pero sin averías Baader este mes no se puede derivar la base de tiempo → no se penaliza aún.</>
                : <>Todavía no registraste paros de etapa → OEE línea ≈ OEE Baader. Empezá a registrarlos abajo y este número se separa.</>}
            </p>

            {/* Pareto unificado de pérdidas de la línea */}
            {calc.perdidas.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border/40">
                <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" /> Dónde pierde tiempo la línea · este mes
                  <span className="text-muted-foreground/60">({fmtDur(calc.perdidasTotal)} total)</span>
                </p>
                {calc.perdidas.map((p, i) => {
                  const w = calc.perdidas[0]!.min > 0 ? (p.min / calc.perdidas[0]!.min) * 100 : 0
                  return (
                    <div key={p.label} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={cn('font-medium', i === 0 ? 'text-rose-800 dark:text-rose-300' : 'text-foreground')}>{i + 1}. {p.label}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtDur(p.min)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', i === 0 ? 'bg-rose-500' : 'bg-rose-500/50')} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Estimado. R (rendimiento) y Q (calidad) son de las Baader y el Grader; las demás etapas suman a la disponibilidad vía sus paros. Mejora al instrumentar/registrar más.</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
