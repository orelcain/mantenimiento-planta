import { useState, Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle, InfoTooltip } from '@/components/ui'
import { ChevronDown, Eye, Target } from 'lucide-react'
import { Doughnut } from 'react-chartjs-2'
import { cn } from '@/lib/utils'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { resolveCalibreLabel } from '@/services/grader/graderDashboardHelpers'
import type { GraderAnalyticsResult } from '@/services/grader/types'

const causeColorMap: Record<string, string> = {
  fuera_de_limites: 'rgba(239,68,68,0.92)',
  no_leido_fotocelula: 'rgba(245,158,11,0.92)',
  puerta_no_preparada: 'rgba(16,185,129,0.92)',
  fuera_de_rango: 'rgba(59,130,246,0.92)',
  too_close_too_long: 'rgba(139,92,246,0.92)',
  otro: 'rgba(107,114,128,0.92)',
}

const getCauseColor = (cause: string): string =>
  causeColorMap[cause] ?? 'rgba(107,114,128,0.92)'

interface Props {
  analytics: GraderAnalyticsResult
  kpis: GraderAnalyticsResult['kpis']
  selectedCauseLabel: string | null
  onSelectedCauseLabelChange: (value: string | null) => void
}

export function PuntoCeroClasificacionCard({
  analytics,
  kpis,
  selectedCauseLabel,
  onSelectedCauseLabelChange,
}: Props) {
  const [expandedCause, setExpandedCause] = useState<string | null>(null)

  const causes = analytics.pointZeroClassification.causes
  if (causes.length === 0) return null

  const classificationChartData = {
    labels: causes.map((c) => c.label),
    datasets: [
      {
        data: causes.map((c) => c.pieces),
        backgroundColor: causes.map((c) => getCauseColor(c.cause)),
        borderColor: 'rgba(255,255,255,0.92)',
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  }

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-red-500" />
          Clasificación Punto Cero — 100%
          <InfoTooltip {...getTooltipProps('pz.clasificacion')} />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString('es-CL')} piezas totales en Punto Cero
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] gap-8 items-start">
          {/* Donut chart */}
          <div className="space-y-3">
            <div className="mx-auto w-full max-w-[420px]" style={{ height: 360 }}>
              <Doughnut
                data={classificationChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '56%',
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const cause = causes[ctx.dataIndex]
                          return cause
                            ? `${cause.label}: ${cause.pieces.toLocaleString('es-CL')} pz (${cause.pctOfPointZero}% P.Cero | ${cause.pctOfTotal}% Total)`
                            : ''
                        },
                      },
                    },
                  },
                }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {causes.map((c) => (
                <div key={`legend-${c.cause}`} className="rounded-ctl border bg-muted/20 px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-block h-2.5 w-2.5 rounded-ctl" style={{ backgroundColor: getCauseColor(c.cause) }} />
                      <span className="truncate font-medium">{c.label}</span>
                    </div>
                    <span className="text-muted-foreground">{c.pctOfPointZero}%</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {c.pieces.toLocaleString('es-CL')} pz · {c.pctOfTotal}% total
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground/90">
                  <th className="py-2 px-2 w-6"></th>
                  <th className="py-2 px-2">Causa</th>
                  <th className="py-2 px-2 text-right">Piezas</th>
                  <th className="py-2 px-2 text-right">% P.Cero</th>
                  <th className="py-2 px-2 text-right">% Total</th>
                  <th className="py-2 px-2 text-right">Peso (kg)</th>
                </tr>
              </thead>
              <tbody>
                {causes.map((c, i) => {
                  const isExpanded = expandedCause === c.cause
                  const hasRecords = c.records && c.records.length > 0
                  return (
                    <Fragment key={i}>
                      <tr
                        className={cn(
                          'border-b border-muted/30 hover:bg-muted/20',
                          i % 2 === 0 && 'bg-muted/[0.15]',
                          hasRecords && 'cursor-pointer',
                          isExpanded && 'bg-muted/20',
                        )}
                        onClick={() => {
                          if (!hasRecords) return
                          setExpandedCause(isExpanded ? null : c.cause)
                          onSelectedCauseLabelChange(selectedCauseLabel === c.label ? null : c.label)
                        }}
                      >
                        <td className="py-2 px-1 text-center">
                          {hasRecords && (
                            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-2.5 w-2.5 rounded-ctl" style={{ backgroundColor: getCauseColor(c.cause) }} />
                              <span className="font-semibold text-sm leading-tight">{c.label}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug max-w-[38ch]">{c.description}</p>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-medium tabular-nums">{c.pieces.toLocaleString('es-CL')}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          <span className={cn(
                            'font-semibold',
                            c.pctOfPointZero >= 50 && 'text-ink-crit',
                            c.pctOfPointZero >= 10 && c.pctOfPointZero < 50 && 'text-ink-warn',
                          )}>
                            {c.pctOfPointZero}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{c.pctOfTotal}%</td>
                        <td className="py-2 px-2 text-right tabular-nums">{c.weightKg ? c.weightKg.toLocaleString('es-CL') : '—'}</td>
                      </tr>
                      {isExpanded && c.records && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <div className="bg-muted/[0.10] border-l-2 border-primary/30 px-3 py-2 max-h-[300px] overflow-y-auto">
                              <p className="text-xs font-medium mb-2 flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                Detalle pieza-pieza ({c.records.length} registros)
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-muted/30 text-left text-muted-foreground">
                                    <th className="py-1 px-1">Hora</th>
                                    <th className="py-1 px-1">Error</th>
                                    <th className="py-1 px-1 text-right">Pzas</th>
                                    <th className="py-1 px-1 text-right">Peso/pza (g)</th>
                                    <th className="py-1 px-1">Calidad</th>
                                    <th className="py-1 px-1">Calibre</th>
                                    <th className="py-1 px-1">Lote</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.records.map((r, j) => (
                                    <tr key={j} className="border-b border-muted/25 hover:bg-muted/20">
                                      <td className="py-0.5 px-1 font-mono text-muted-foreground">
                                        {new Date(r.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })}
                                      </td>
                                      <td className="py-0.5 px-1">{r.error}</td>
                                      <td className="py-0.5 px-1 text-right">{r.pieces}</td>
                                      <td className="py-0.5 px-1 text-right font-mono">
                                        {r.weightPerPieceGrams ? r.weightPerPieceGrams.toFixed(0) : '—'}
                                      </td>
                                      <td className="py-0.5 px-1">{r.quality || '—'}</td>
                                      <td className="py-0.5 px-1">{resolveCalibreLabel(r.calibre, r.weightPerPieceGrams)}</td>
                                      <td className="py-0.5 px-1 text-muted-foreground">{r.lot || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                <tr className="border-t-2 border-muted/60 font-bold bg-muted/40">
                  <td className="py-2 px-1"></td>
                  <td className="py-2 px-2">TOTAL</td>
                  <td className="py-2 px-2 text-right tabular-nums">{analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString('es-CL')}</td>
                  <td className="py-2 px-2 text-right tabular-nums">100%</td>
                  <td className="py-2 px-2 text-right tabular-nums">{kpis.pointZeroPct}%</td>
                  <td className="py-2 px-2 text-right">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
