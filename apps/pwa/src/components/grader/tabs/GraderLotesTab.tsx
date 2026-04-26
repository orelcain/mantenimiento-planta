/**
 * Tab "Lotes" (análisis por lote + comparativa + dispersión CV + P0 por lote).
 * Extraído en la iter 3 de refactor 2026-04-10.
 */
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, InfoTooltip } from '@/components/ui'
import { Layers } from 'lucide-react'
import { Bar } from 'react-chartjs-2'
import { cn } from '@/lib/utils'
import { getTooltipProps } from '@/services/grader/graderTooltips'

type TooltipPropsLike = ReturnType<typeof getTooltipProps>

type LotRow = {
  lot: string
  pieces: number
  avgWeightGrams: number
  medianWeightGrams: number
  stdDevWeightGrams: number
  weightKg: number
  pointZeroPieces: number
  pointZeroPctChecked: number
  calibreDistribution: Array<{ key: string; pieces: number; pct: number }>
}

type LotDispersion = LotRow & {
  cvPct: number
  cvSignal: { cls: string; emoji: string; label: string; bar: string }
}

type GateAction = {
  gateNumber: number
  suggestedCalibre: string
  suggestedQuality: string
  text: string
  canApply: boolean
  isApplied: boolean
  urgency?: 'high' | 'medium' | 'low'
}

interface Props {
  lotAnalysisView: LotRow[]
  lotDispersionView: LotDispersion[]
  lotDispersionSummary: { mostVariable: LotDispersion | undefined; high: LotDispersion[] }
  directGateActions: GateAction[]
  lotStdDevTooltipProps: TooltipPropsLike
  getCvSignal: (cv: number) => { cls: string; emoji: string; label: string; bar: string }
  getCalibreByWeightGrams: (weightGrams?: number | null) => string
  getPointZeroTextClass: (pct: number) => string
  getPointZeroBarColor: (pct: number) => string
  onApplyGateAction?: (action: GateAction) => void
  onApplyGateSuggestion?: (payload: { gateNumber: number; calibre: string; quality: string }) => void
}

export function GraderLotesTab({
  lotAnalysisView,
  lotDispersionView,
  lotDispersionSummary,
  directGateActions,
  lotStdDevTooltipProps,
  getCvSignal,
  getCalibreByWeightGrams,
  getPointZeroTextClass,
  getPointZeroBarColor,
  onApplyGateAction,
  onApplyGateSuggestion,
}: Props) {
  if (lotAnalysisView.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">
            Sin datos de lotes. Cargue un archivo pieza-pieza con columna de lote.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="relative overflow-visible z-10">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-500" />
            Análisis por Lote
            <InfoTooltip {...getTooltipProps('lot.analysis')} />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {lotAnalysisView.length} lote(s) detectados en pieza-pieza
          </p>
        </CardHeader>
        <CardContent className="overflow-visible">
          {/* Bar chart: avg weight per lot */}
          <div className="overflow-visible" style={{ minHeight: 300 }}>
            <Bar
              data={{
                labels: lotAnalysisView.map(l => l.lot),
                datasets: [
                  {
                    label: 'Peso Promedio (g)',
                    data: lotAnalysisView.map(l => l.avgWeightGrams),
                    backgroundColor: 'rgba(59,130,246,0.7)',
                    borderRadius: 6,
                  },
                  {
                    label: 'Mediana (g)',
                    data: lotAnalysisView.map(l => l.medianWeightGrams),
                    backgroundColor: 'rgba(16,185,129,0.5)',
                    borderRadius: 6,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                  legend: { position: 'bottom' },
                  tooltip: {
                    callbacks: {
                      afterBody: (items) => {
                        const idx = items[0]?.dataIndex
                        if (idx == null) return ''
                        const lot = lotAnalysisView[idx]
                        if (!lot) return ''
                        return [
                          `Calibre prom.: ${getCalibreByWeightGrams(lot.avgWeightGrams)}`,
                          `Calibre med.: ${getCalibreByWeightGrams(lot.medianWeightGrams)}`,
                          `P0: ${lot.pointZeroPieces.toLocaleString('es-CL')} / ${lot.pieces.toLocaleString('es-CL')} (${lot.pointZeroPctChecked}%)`,
                        ]
                      },
                    },
                  },
                },
                scales: { y: { beginAtZero: false, title: { display: true, text: 'Peso (g)' } } },
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lot comparison table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Comparativa de Lotes</CardTitle>
          <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">Semáforo CV:</span>
            <span>🟢 &lt;8%</span>
            <span>🟡 8-11.9%</span>
            <span>🟠 12-19.9%</span>
            <span>🔴 ≥20%</span>
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Lote</th>
                  <th className="py-2 px-2 text-right">Piezas</th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      Peso Prom. (g)
                      <InfoTooltip {...getTooltipProps('lot.avgWeight')} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      Mediana (g)
                      <InfoTooltip {...getTooltipProps('lot.medianWeight')} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      σ (g)
                      <InfoTooltip {...lotStdDevTooltipProps} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      CV %
                      <InfoTooltip {...getTooltipProps('lot.cv')} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2 text-right">Peso (kg)</th>
                  <th className="py-2 px-2 text-right">Calibre (Prom)</th>
                  <th className="py-2 px-2 text-right">Calibre (Med)</th>
                  <th className="py-2 px-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      P0 %
                      <InfoTooltip {...getTooltipProps('lot.p0pct')} iconSize={12} />
                    </span>
                  </th>
                  <th className="py-2 px-2">Calibre Top</th>
                </tr>
              </thead>
              <tbody>
                {lotAnalysisView.map((lot, i) => {
                  const topCalibre = lot.calibreDistribution.length > 0
                    ? lot.calibreDistribution.reduce((a, b) => a.pieces > b.pieces ? a : b)
                    : null
                  return (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{lot.lot}</td>
                      <td className="py-2 px-2 text-right">{lot.pieces.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2 text-right">{lot.avgWeightGrams.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2 text-right">{lot.medianWeightGrams.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2 text-right">
                        {(() => {
                          const cv = lot.avgWeightGrams > 0 ? (lot.stdDevWeightGrams / lot.avgWeightGrams) * 100 : 0
                          const signal = getCvSignal(cv)
                          const minBand = Math.max(0, lot.avgWeightGrams - lot.stdDevWeightGrams)
                          const maxBand = lot.avgWeightGrams + lot.stdDevWeightGrams
                          return (
                            <span className="inline-flex items-center justify-end gap-1">
                              <span className={cn('font-medium tabular-nums', signal.cls)}>
                                {lot.stdDevWeightGrams.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span aria-hidden>{signal.emoji}</span>
                              <InfoTooltip
                                iconSize={11}
                                title={`σ del lote ${lot.lot}`}
                                text="Este valor sale al medir qué tan alejados están los pesos individuales de la media del lote."
                                formula="σ = √[ Σ(xᵢ − x̄)² / N ]"
                                example={`x̄=${lot.avgWeightGrams.toLocaleString('es-CL', { maximumFractionDigits: 2 })}g, σ=${lot.stdDevWeightGrams.toLocaleString('es-CL', { maximumFractionDigits: 2 })}g, N=${lot.pieces.toLocaleString('es-CL')}. Rango típico aprox.: ${minBand.toLocaleString('es-CL', { maximumFractionDigits: 0 })}g a ${maxBand.toLocaleString('es-CL', { maximumFractionDigits: 0 })}g. CV≈${cv.toLocaleString('es-CL', { maximumFractionDigits: 1 })}% (${signal.emoji} dispersión ${signal.label}).`}
                              />
                            </span>
                          )
                        })()}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {(() => {
                          const cv = lot.avgWeightGrams > 0 ? (lot.stdDevWeightGrams / lot.avgWeightGrams) * 100 : 0
                          const signal = getCvSignal(cv)
                          return (
                            <span className={cn('inline-flex items-center justify-end gap-1 font-medium tabular-nums', signal.cls)}>
                              {cv.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                              <span aria-hidden>{signal.emoji}</span>
                              <InfoTooltip
                                iconSize={11}
                                {...getTooltipProps('lot.cv')}
                                example={`CV=${cv.toLocaleString('es-CL', { maximumFractionDigits: 1 })}% en lote ${lot.lot}: ${signal.emoji} dispersión ${signal.label}. Se calcula como σ/x̄.`}
                              />
                            </span>
                          )
                        })()}
                      </td>
                      <td className="py-2 px-2 text-right">{lot.weightKg.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2 text-right">{getCalibreByWeightGrams(lot.avgWeightGrams)}</td>
                      <td className="py-2 px-2 text-right">{getCalibreByWeightGrams(lot.medianWeightGrams)}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={cn('font-medium', getPointZeroTextClass(lot.pointZeroPctChecked))}>
                          {lot.pointZeroPctChecked}%
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        {topCalibre ? `${topCalibre.key} (${topCalibre.pct}%)` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-visible z-10">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Dispersión por Lote (CV%)
            <InfoTooltip {...getTooltipProps('lot.cvChart')} />
          </CardTitle>
          <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">Semáforo CV:</span>
            <span>🟢 &lt;8%</span>
            <span>🟡 8-11.9%</span>
            <span>🟠 12-19.9%</span>
            <span>🔴 ≥20%</span>
          </p>
        </CardHeader>
        <CardContent className="overflow-visible space-y-3">
          <div className="overflow-visible" style={{ minHeight: 260 }}>
            <Bar
              data={{
                labels: lotDispersionView.map((lot) => lot.lot),
                datasets: [
                  {
                    label: 'CV %',
                    data: lotDispersionView.map((lot) => lot.cvPct),
                    backgroundColor: lotDispersionView.map((lot) => lot.cvSignal.bar),
                    borderRadius: 6,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const lot = lotDispersionView[ctx.dataIndex]
                        if (!lot) return ''
                        return `CV: ${lot.cvPct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}% (${lot.cvSignal.emoji} ${lot.cvSignal.label})`
                      },
                      afterBody: (items) => {
                        const idx = items[0]?.dataIndex
                        if (idx == null) return ''
                        const lot = lotDispersionView[idx]
                        if (!lot) return ''
                        return [
                          `x̄: ${lot.avgWeightGrams.toLocaleString('es-CL')} g`,
                          `σ: ${lot.stdDevWeightGrams.toLocaleString('es-CL')} g`,
                          `Piezas: ${lot.pieces.toLocaleString('es-CL')}`,
                        ]
                      },
                    },
                  },
                },
                scales: {
                  y: { beginAtZero: true, title: { display: true, text: 'CV %' } },
                },
              }}
            />
          </div>

          <div className="text-xs space-y-1.5 text-muted-foreground">
            {lotDispersionSummary.mostVariable && (
              <p>
                Lote más variable: <span className="font-medium text-foreground">{lotDispersionSummary.mostVariable.lot}</span> con
                {' '}<span className={cn('font-semibold', lotDispersionSummary.mostVariable.cvSignal.cls)}>{lotDispersionSummary.mostVariable.cvPct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%</span>.
              </p>
            )}
            {lotDispersionSummary.high.length > 0 && (
              <p>
                Recomendación directa: hay {lotDispersionSummary.high.length} lote(s) en zona roja. Aplique primero los cambios de gates sugeridos abajo.
              </p>
            )}
            {directGateActions.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium text-foreground">Cambios sugeridos (configuración actual):</p>
                {directGateActions.map((action) => (
                  <div key={action.gateNumber} className="flex items-start justify-between gap-2">
                    <p>• {action.text}</p>
                    {action.canApply && action.isApplied && (
                      <Badge variant="outline" className="text-[11px] border-emerald-500/40 text-emerald-600">
                        Aplicada
                      </Badge>
                    )}
                    {action.canApply && !action.isApplied && onApplyGateSuggestion && onApplyGateAction && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onApplyGateAction(action)}
                        className="h-7 px-2 text-[11px]"
                      >
                        Aplicar
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-[11px]">Estas sugerencias se recalculan automáticamente cuando modifica gates en Configuración y vuelve al Dashboard.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Point Zero per lot */}
      <Card className="relative overflow-visible z-10">
        <CardHeader>
          <CardTitle className="text-sm">Punto Cero por Lote</CardTitle>
        </CardHeader>
        <CardContent className="overflow-visible">
          <div className="overflow-visible" style={{ minHeight: 260 }}>
            <Bar
              data={{
                labels: lotAnalysisView.map(l => l.lot),
                datasets: [
                  {
                    label: 'P0 %',
                    data: lotAnalysisView.map(l => l.pointZeroPctChecked),
                    backgroundColor: lotAnalysisView.map((l) => getPointZeroBarColor(l.pointZeroPctChecked)),
                    borderRadius: 6,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const lot = lotAnalysisView[ctx.dataIndex]
                        if (!lot) return ''
                        return `P0: ${lot.pointZeroPctChecked}% (${lot.pointZeroPieces.toLocaleString('es-CL')} / ${lot.pieces.toLocaleString('es-CL')} pz)`
                      },
                    },
                  },
                },
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Punto Cero %' } } },
              }}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
