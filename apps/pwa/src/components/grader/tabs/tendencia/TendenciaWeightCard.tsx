/**
 * Cards "Tendencia de Peso en el Tiempo" + "Proyección de Piezas" + "Detalle por Intervalo"
 * de la tab Tendencia. Contiene el chart principal de peso (simple/detallado),
 * el chart secundario de piezas proyectadas y la tabla de buckets temporales.
 *
 * Extraído de GraderTendenciaTab en el refactor iter 19 (P1.8).
 */
import { Card, CardContent, CardHeader, CardTitle, Badge, InfoTooltip } from '@/components/ui'
import { Line } from 'react-chartjs-2'
import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import type {
  GraderAnalysisConfig,
  GraderAnalyticsResult,
  WeightTrendBucket,
} from '@/services/grader/types'
import type { useGraderDashboardAnalytics } from '@/hooks/useGraderDashboardAnalytics'

type DashboardViews = ReturnType<typeof useGraderDashboardAnalytics>
type CvSignal = { cls: string; emoji: string; label: string; bar: string }

interface Props {
  analytics: GraderAnalyticsResult
  config: GraderAnalysisConfig
  weightTrendByTs: Map<number, WeightTrendBucket>
  wtStdDevTooltipProps: ReturnType<typeof getTooltipProps>
  getCvSignal: (cv: number) => CvSignal
  trendForecastView: DashboardViews['trendForecastView']
  weightChartMode: 'simple' | 'detailed'
  onSetWeightChartMode: (mode: 'simple' | 'detailed') => void
  getPointZeroSeverity: (pct: number) => 'critical' | 'warn' | 'ok'
}

export function TendenciaWeightCard({
  analytics,
  config,
  weightTrendByTs,
  wtStdDevTooltipProps,
  getCvSignal,
  trendForecastView,
  weightChartMode,
  onSetWeightChartMode,
  getPointZeroSeverity,
}: Props) {
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-500" />
                Tendencia de Peso en el Tiempo
                <InfoTooltip {...getTooltipProps('wt.trend')} />
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {weightChartMode === 'simple'
                  ? 'Modo simple: solo peso observado + proyección'
                  : 'Modo detallado: incluye media móvil y bandas ±1σ'}
              </p>
            </div>
            <div className="inline-flex rounded-ctl border bg-muted/30 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => onSetWeightChartMode('simple')}
                className={cn(
                  'px-2.5 py-1 text-[11px] rounded-ctl transition-colors',
                  weightChartMode === 'simple'
                    ? 'bg-background shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => onSetWeightChartMode('detailed')}
                className={cn(
                  'px-2.5 py-1 text-[11px] rounded-ctl transition-colors',
                  weightChartMode === 'detailed'
                    ? 'bg-background shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Detallado
              </button>
            </div>
          </div>
          {trendForecastView && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className="text-[10px]">
                Cobertura: {trendForecastView.completionPct.toFixed(1)}% ({trendForecastView.observedBuckets}/{trendForecastView.totalBuckets} intervalos)
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                Turno: {trendForecastView.shiftStartLabel} → {trendForecastView.shiftEndLabel}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                Piezas proyectadas cierre: {trendForecastView.projectedTotalPieces.toLocaleString('es-CL')}
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Line
            data={{
              labels: trendForecastView?.labels ?? analytics.weightTrendSeries.map((b) => b.bucketStart),
              datasets: [
                {
                  label: 'Peso observado (g)',
                  data: trendForecastView?.realAvgData ?? analytics.weightTrendSeries.map((b) => b.avgWeightGrams),
                  borderColor: 'rgba(59,130,246,0.9)',
                  backgroundColor: 'rgba(59,130,246,0.05)',
                  fill: false,
                  tension: 0.3,
                  pointRadius: 3,
                },
                ...(trendForecastView?.hasProjection
                  ? [{
                      label: 'Peso proyectado (g)',
                      data: trendForecastView.projectedAvgData,
                      borderColor: 'rgba(168,85,247,0.95)',
                      borderDash: [6, 4],
                      fill: false,
                      tension: 0.25,
                      pointRadius: 2,
                    }]
                  : []),
                ...(weightChartMode === 'detailed' ? [
                  {
                    label: 'Media Móvil 5',
                    data: trendForecastView?.realMovingAvgData ?? analytics.weightTrendSeries.map((b) => b.movingAvg5 ?? null),
                    borderColor: 'rgba(139,92,246,0.8)',
                    borderDash: [6, 3],
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                  },
                  {
                    label: '+1σ',
                    data: trendForecastView?.realUpperBand ?? analytics.weightTrendSeries.map((b) => b.avgWeightGrams + b.stdDevWeightGrams),
                    borderColor: 'rgba(16,185,129,0.3)',
                    backgroundColor: 'rgba(16,185,129,0.05)',
                    fill: '+1' as const,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 1,
                  },
                  {
                    label: '−1σ',
                    data: trendForecastView?.realLowerBand ?? analytics.weightTrendSeries.map((b) => Math.max(0, b.avgWeightGrams - b.stdDevWeightGrams)),
                    borderColor: 'rgba(16,185,129,0.3)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 1,
                  },
                ] : []),
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 } } },
                tooltip: {
                  callbacks: {
                    afterBody: (items) => {
                      const idx = items[0]?.dataIndex
                      if (idx == null) return ''
                      const bucketKey = trendForecastView?.labels?.[idx] ?? analytics.weightTrendSeries[idx]?.bucketStart
                      const bucketTs = bucketKey ? new Date(bucketKey).getTime() : NaN
                      const bucket = Number.isFinite(bucketTs) ? weightTrendByTs.get(bucketTs) : undefined
                      if (!bucket) return ''
                      const lines = [`Mediana: ${bucket.medianWeightGrams.toLocaleString('es-CL')} g`, `σ: ${bucket.stdDevWeightGrams.toLocaleString('es-CL')} g`, `Piezas: ${bucket.pieces.toLocaleString('es-CL')}`]
                      if (bucket.dominantLot) lines.push(`Lote: ${bucket.dominantLot}`)
                      return lines
                    },
                  },
                },
              },
              scales: {
                x: {
                  type: 'time',
                  time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' },
                },
                y: { beginAtZero: false, title: { display: true, text: 'Peso (g)' } },
              },
            }}
          />
          {trendForecastView?.hasProjection && (
            <p className="text-[11px] text-muted-foreground mt-2">
              La línea punteada muestra tendencia probable del resto del turno usando el comportamiento observado hasta ahora.
            </p>
          )}
        </CardContent>
      </Card>

      {trendForecastView && (() => {
        const projSeverity = getPointZeroSeverity(trendForecastView.projectedPointZeroPct)
        const projBadgeClass =
          projSeverity === 'critical' ? 'border-red-500/[0.25] text-ink-crit bg-red-500/[0.15]' :
          projSeverity === 'warn' ? 'border-amber-500/[0.25] text-ink-warn bg-amber-500/[0.15]' :
          'border-emerald-500/[0.25] text-ink-ok bg-emerald-500/[0.15]'
        return (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <CardTitle className="text-sm">Proyección de Piezas por Intervalo</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Si cargó 1-2 horas, se mantiene el eje completo del turno y se proyecta el tramo faltante.
                  </p>
                </div>
                <div className={cn(
                  'flex flex-col items-end gap-0.5 px-3 py-1.5 rounded-card border-2 shrink-0',
                  projBadgeClass,
                )}>
                  <p className="text-[9px] uppercase tracking-wide opacity-80">P0 al cierre</p>
                  <p className="text-lg font-bold tabular-nums leading-none">
                    {trendForecastView.projectedPointZeroPct.toFixed(2)}%
                  </p>
                  <p className="text-[10px] tabular-nums opacity-90">
                    {trendForecastView.projectedPointZeroPieces.toLocaleString('es-CL')} piezas
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Line
                data={{
                  labels: trendForecastView.labels,
                  datasets: [
                    {
                      label: 'Piezas observadas',
                      data: trendForecastView.realPiecesData,
                      borderColor: 'rgba(37,99,235,0.95)',
                      backgroundColor: 'rgba(37,99,235,0.12)',
                      fill: false,
                      tension: 0.25,
                      pointRadius: 2,
                    },
                    {
                      label: 'Piezas proyectadas',
                      data: trendForecastView.projectedPiecesData,
                      borderColor: 'rgba(217,70,239,0.95)',
                      borderDash: [6, 4],
                      fill: false,
                      tension: 0.2,
                      pointRadius: 2,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } },
                  },
                  scales: {
                    x: { type: 'time', time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Piezas / intervalo' } },
                  },
                }}
              />
            </CardContent>
          </Card>
        )
      })()}

      {/* Weight trend table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Detalle por Intervalo</CardTitle>
          <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">Semáforo CV:</span>
            <span>🟢 &lt;8%</span>
            <span>🟡 8-11.9%</span>
            <span>🟠 12-19.9%</span>
            <span>🔴 ≥20%</span>
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Hora</th>
                  <th className="py-2 px-2 text-right">Piezas</th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      Promedio (g)
                      <InfoTooltip {...getTooltipProps('wt.avgWeight')} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      Mediana (g)
                      <InfoTooltip {...getTooltipProps('wt.medianWeight')} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      σ (g)
                      <InfoTooltip {...wtStdDevTooltipProps} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      CV %
                      <InfoTooltip {...getTooltipProps('wt.cv')} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      MA(5) (g)
                      <InfoTooltip {...getTooltipProps('wt.movingAvg')} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2">
                    <span className="flex items-center gap-1">
                      Lote
                      <InfoTooltip {...getTooltipProps('wt.dominantLot')} iconSize={12} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.weightTrendSeries.map((b, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="py-1.5 px-2 text-xs">{new Date(b.bucketStart).toLocaleTimeString()}</td>
                    <td className="py-1.5 px-2 text-right">{b.pieces.toLocaleString('es-CL')}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{b.avgWeightGrams.toLocaleString('es-CL')}</td>
                    <td className="py-1.5 px-2 text-right">{b.medianWeightGrams.toLocaleString('es-CL')}</td>
                    <td className="py-1.5 px-2 text-right">
                      {(() => {
                        const cv = b.avgWeightGrams > 0 ? (b.stdDevWeightGrams / b.avgWeightGrams) * 100 : 0
                        const signal = getCvSignal(cv)
                        const minBand = Math.max(0, b.avgWeightGrams - b.stdDevWeightGrams)
                        const maxBand = b.avgWeightGrams + b.stdDevWeightGrams
                        return (
                          <span className="inline-flex items-center justify-end gap-1">
                            <span className={cn('font-medium tabular-nums', signal.cls)}>
                              {b.stdDevWeightGrams.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span aria-hidden>{signal.emoji}</span>
                            <InfoTooltip
                              iconSize={11}
                              title={`σ intervalo ${new Date(b.bucketStart).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`}
                              text="Este valor sale al medir qué tan alejados están los pesos del intervalo respecto a su media."
                              formula="σ = √[ Σ(xᵢ − x̄)² / N ]"
                              example={`x̄=${b.avgWeightGrams.toLocaleString('es-CL', { maximumFractionDigits: 2 })}g, σ=${b.stdDevWeightGrams.toLocaleString('es-CL', { maximumFractionDigits: 2 })}g, N=${b.pieces.toLocaleString('es-CL')}. Rango típico aprox.: ${minBand.toLocaleString('es-CL', { maximumFractionDigits: 0 })}g a ${maxBand.toLocaleString('es-CL', { maximumFractionDigits: 0 })}g. CV≈${cv.toLocaleString('es-CL', { maximumFractionDigits: 1 })}% (${signal.emoji} dispersión ${signal.label}).`}
                            />
                          </span>
                        )
                      })()}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {(() => {
                        const cv = b.avgWeightGrams > 0 ? (b.stdDevWeightGrams / b.avgWeightGrams) * 100 : 0
                        const signal = getCvSignal(cv)
                        return (
                          <span className={cn('inline-flex items-center justify-end gap-1 font-medium tabular-nums', signal.cls)}>
                            {cv.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
                            <span aria-hidden>{signal.emoji}</span>
                          </span>
                        )
                      })()}
                    </td>
                    <td className="py-1.5 px-2 text-right text-purple-600">
                      {b.movingAvg5 != null ? b.movingAvg5.toLocaleString('es-CL') : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-xs">{b.dominantLot || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
