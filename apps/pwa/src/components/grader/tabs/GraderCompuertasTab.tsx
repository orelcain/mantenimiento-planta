/**
 * Tab "Compuertas" (balance de gates + stats avanzadas + sugerencias swap)
 * del Dashboard del Grader. Extraído en la iter 3 de refactor 2026-04-10.
 *
 * Iter 19 / P0.5:
 *  - Semáforo de tiempo de reacción por gate (usando `computeGateTimingSignals`)
 *  - Asignación óptima de calibres a gates (usando `computeOptimalGateAssignment`)
 */
import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge, InfoTooltip } from '@/components/ui'
import { AlertTriangle, Info, Zap, BarChart3, ArrowRightLeft, Clock, Target, CheckCircle2, XCircle } from 'lucide-react'
import { Bar } from 'react-chartjs-2'
import { cn } from '@/lib/utils'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { SwapSuggestionCard } from '@/components/grader/GraderInlinePanels'
import {
  computeGateTimingSignals,
  computeOptimalGateAssignment,
} from '@/services/grader/graderGateTiming'
import type {
  GateAssignment,
  GraderAnalyticsResult,
  GraderPhysicalConfig,
  GraderAnalysisConfig,
} from '@/services/grader/types'
import type { TimingThresholdOverrides } from '@/services/grader/graderGateTiming'

interface Props {
  analytics: GraderAnalyticsResult
  physicalConfig?: GraderPhysicalConfig
  gates: GateAssignment[]
  /** Umbrales actuales del config (para edición inline) */
  errorThresholds?: GraderAnalysisConfig['errorThresholds']
  /** Callback para cambiar umbrales desde la UI */
  onThresholdsChange?: (patch: Partial<NonNullable<GraderAnalysisConfig['errorThresholds']>>) => void
}

export function GraderCompuertasTab({ analytics, physicalConfig, gates, errorThresholds, onThresholdsChange }: Props) {
  // Umbrales de timing (del config o defaults)
  const thresholdOverrides: TimingThresholdOverrides = useMemo(() => ({
    marginOkSec: errorThresholds?.timingMarginOkSec,
    marginWarnSec: errorThresholds?.timingMarginWarnSec,
  }), [errorThresholds])

  // Semáforo tiempo de reacción por gate (con umbrales configurables)
  const timingSignals = useMemo(
    () => computeGateTimingSignals(physicalConfig, gates, thresholdOverrides),
    [physicalConfig, gates, thresholdOverrides],
  )
  // Asignación óptima de calibres a gates
  const optimalAssignment = useMemo(
    () => computeOptimalGateAssignment(
      analytics.gateBalance,
      analytics.gateAdvancedStats,
      timingSignals,
      gates,
    ),
    [analytics.gateBalance, analytics.gateAdvancedStats, timingSignals, gates],
  )
  return (
    <>
      {/* Allocation Score KPI */}
      <div className="flex items-center gap-3 p-3 rounded-card border bg-muted">
        <div className={cn(
          'text-2xl font-bold',
          analytics.allocationScore >= 80 ? 'text-ink-ok' :
          analytics.allocationScore >= 60 ? 'text-ink-warn' : 'text-ink-crit',
        )}>
          {analytics.allocationScore ?? '—'}
        </div>
        <div>
          <p className="text-sm font-medium">Score de Asignación</p>
          <p className="text-xs text-muted-foreground">
            {(analytics.allocationScore ?? 0) >= 80 ? 'Buena distribución de gates relativa a demanda' :
             (analytics.allocationScore ?? 0) >= 60 ? 'Distribución mejorable — revisar sugerencias' :
             'Distribución muy desbalanceada — acción recomendada'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Balance Demanda vs Gates Asignados
            <InfoTooltip {...getTooltipProps('gate.balance')} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.gateBalance.length > 0 ? (
            <div className="space-y-3">
              {analytics.gateBalance.map((gb, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-card border flex items-start gap-3',
                    gb.severity === 'critical'
                      ? 'border-red-300 bg-red-500/[0.15]'
                      : gb.severity === 'warn'
                      ? 'border-amber-300 bg-amber-500/[0.15]'
                      : 'border-muted bg-muted',
                  )}
                >
                  {gb.severity === 'critical' ? (
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  ) : gb.severity === 'warn' ? (
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{gb.calibre}</Badge>
                      <span className="text-sm font-medium">
                        Demanda {gb.demandPct}% — {gb.gatesAssigned}/{gb.idealGates} gate(s)
                      </span>
                      {gb.gap > 0 && (
                        <Badge variant="destructive" className="text-caption">-{gb.gap} gate(s)</Badge>
                      )}
                      {gb.gap < 0 && (
                        <Badge variant="outline" className="text-caption text-ink-ok border-emerald-300">
                          +{-gb.gap} extra
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{gb.message}</p>
                  </div>
                </div>
              ))}

              {/* Bar chart: demand vs gates */}
              <div className="mt-4">
                <Bar
                  data={{
                    labels: analytics.gateBalance.map((g) => g.calibre),
                    datasets: [
                      {
                        label: 'Demanda (%)',
                        data: analytics.gateBalance.map((g) => g.demandPct),
                        backgroundColor: 'rgba(59,130,246,0.7)',
                      },
                      {
                        label: 'Gates Asignados',
                        data: analytics.gateBalance.map((g) => g.gatesAssigned),
                        backgroundColor: 'rgba(16,185,129,0.7)',
                      },
                      {
                        label: 'Gates Ideal',
                        data: analytics.gateBalance.map((g) => g.idealGates),
                        backgroundColor: 'rgba(168,85,247,0.4)',
                        borderColor: 'rgba(168,85,247,0.8)',
                        borderWidth: 1,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Configure los gates para ver el balance de demanda.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Gate Advanced Stats Table */}
      {analytics.gateAdvancedStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Estadísticas por Compuerta
              <InfoTooltip {...getTooltipProps('gate.stats')} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-2">Gate</th>
                    <th className="py-2 px-2 text-right">Piezas</th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        Prom. (g)
                        <InfoTooltip {...getTooltipProps('gate.avgWeight')} iconSize={11} />
                      </span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        σ (g)
                        <InfoTooltip {...getTooltipProps('gate.stdDev')} iconSize={11} />
                      </span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        CV
                        <InfoTooltip {...getTooltipProps('gate.cv')} iconSize={11} />
                      </span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        Utiliz.
                        <InfoTooltip {...getTooltipProps('gate.utilization')} iconSize={11} />
                      </span>
                    </th>
                    <th className="py-2 px-2">Asignado</th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        Mismatch
                        <InfoTooltip {...getTooltipProps('gate.mismatch')} iconSize={11} />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.gateAdvancedStats.map((gs) => (
                    <tr key={gs.gateNumber} className={cn(
                      'border-b hover:bg-muted/30',
                      gs.cv > 0.15 && 'bg-amber-500/[0.15]',
                      gs.mismatchPct > 30 && 'bg-red-500/[0.15]',
                    )}>
                      <td className="py-2 px-2 font-medium">Gate {gs.gateNumber}</td>
                      <td className="py-2 px-2 text-right">{gs.pieces.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2 text-right">{gs.avgWeightGrams.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2 text-right">{gs.stdDevWeightGrams.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={cn(
                          'font-medium',
                          gs.cv > 0.2 && 'text-ink-crit',
                          gs.cv > 0.15 && gs.cv <= 0.2 && 'text-ink-warn',
                        )}>
                          {(gs.cv * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">{gs.utilizationPct.toFixed(1)}%</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-caption">
                          {gs.assignedCalibre}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={cn(
                          'font-medium',
                          gs.mismatchPct > 30 && 'text-ink-crit',
                          gs.mismatchPct > 15 && gs.mismatchPct <= 30 && 'text-ink-warn',
                        )}>
                          {gs.mismatchPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* CV comparison chart */}
            <div className="mt-4">
              <p className="text-xs font-medium mb-2">Coeficiente de Variación por Gate</p>
              <Bar
                data={{
                  labels: analytics.gateAdvancedStats.map(g => `Gate ${g.gateNumber}`),
                  datasets: [{
                    label: 'CV (%)',
                    data: analytics.gateAdvancedStats.map(g => g.cv * 100),
                    backgroundColor: analytics.gateAdvancedStats.map(g =>
                      g.cv > 0.2 ? 'rgba(239,68,68,0.7)' :
                      g.cv > 0.15 ? 'rgba(245,158,11,0.7)' :
                      'rgba(16,185,129,0.7)'
                    ),
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, title: { display: true, text: 'CV (%)' } } },
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gate Swap Suggestions */}
      {analytics.gateSwapSuggestions.length > 0 && (
        <Card className="border-purple-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-purple-500" />
              Sugerencias de Reasignación
              <InfoTooltip {...getTooltipProps('gate.swap')} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Basadas en asignación ideal proporcional a demanda, mismatch real vs etiqueta, y variabilidad
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.gateSwapSuggestions.map((s, i) => (
              <SwapSuggestionCard key={i} suggestion={s} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Ajustes de umbrales (inline, configurable) ─────────────────── */}
      {onThresholdsChange && (
        <Card className="border-dashed border-muted-foreground/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Ajustes de Umbrales
              <InfoTooltip {...getTooltipProps('gate.timingSemaphore')} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-caption text-muted-foreground flex items-center gap-1">
                  Margen OK (s) <InfoTooltip {...getTooltipProps('threshold.timingOk')} iconSize={10} />
                </label>
                <input type="number" step="0.05" min="0.1" max="2"
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-background border rounded-ctl"
                  value={errorThresholds?.timingMarginOkSec ?? 0.5}
                  onChange={(e) => onThresholdsChange({ timingMarginOkSec: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-caption text-muted-foreground flex items-center gap-1">
                  Margen Warn (s) <InfoTooltip {...getTooltipProps('threshold.timingWarn')} iconSize={10} />
                </label>
                <input type="number" step="0.05" min="0" max="1"
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-background border rounded-ctl"
                  value={errorThresholds?.timingMarginWarnSec ?? 0.15}
                  onChange={(e) => onThresholdsChange({ timingMarginWarnSec: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-caption text-muted-foreground flex items-center gap-1">
                  Sobrecarga Warn (%) <InfoTooltip {...getTooltipProps('threshold.overloadWarn')} iconSize={10} />
                </label>
                <input type="number" step="5" min="10" max="80"
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-background border rounded-ctl"
                  value={errorThresholds?.gateOverloadWarnPct ?? 35}
                  onChange={(e) => onThresholdsChange({ gateOverloadWarnPct: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-caption text-muted-foreground flex items-center gap-1">
                  Sobrecarga Critical (%) <InfoTooltip {...getTooltipProps('threshold.overloadCritical')} iconSize={10} />
                </label>
                <input type="number" step="5" min="20" max="100"
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-background border rounded-ctl"
                  value={errorThresholds?.gateOverloadCriticalPct ?? 50}
                  onChange={(e) => onThresholdsChange({ gateOverloadCriticalPct: Number(e.target.value) })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Semáforo timing + desglose neumático por gate ───────────────── */}
      {timingSignals.length > 0 && (
        <Card className="border-primary/[0.25]">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-ink-info" />
              Tiempo de Reacción por Compuerta
              <InfoTooltip {...getTooltipProps('pneum.responseTime')} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {timingSignals[0]?.pneumaticBreakdown
                ? 'Modelo neumático real: t_válvula + t_carga_línea + t_cilindro por gate. Presión y timing varían por longitud de línea.'
                : `Tiempo disponible (dist / vel) vs requerido (salmón ${physicalConfig?.avgSalmonLengthCm ?? '—'}cm + reset ${(physicalConfig?.flipperResetTimeSec ?? 0.45).toFixed(2)}s plano). Configurar neumática para desglose per-gate.`
              }
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-2">Gate</th>
                    <th className="py-2 px-2 text-right">Dist (m)</th>
                    <th className="py-2 px-2 text-right">
                      t_disp <InfoTooltip text="Tiempo disponible = distancia / velocidad cinta" iconSize={10} />
                    </th>
                    {timingSignals[0]?.pneumaticBreakdown && (
                      <>
                        <th className="py-2 px-2 text-right">
                          Válv <InfoTooltip {...getTooltipProps('pneum.valveSwitch')} iconSize={10} />
                        </th>
                        <th className="py-2 px-2 text-right">
                          Línea <InfoTooltip {...getTooltipProps('pneum.lineCharge')} iconSize={10} />
                        </th>
                        <th className="py-2 px-2 text-right">
                          Cil <InfoTooltip {...getTooltipProps('pneum.cylinderStroke')} iconSize={10} />
                        </th>
                        <th className="py-2 px-2 text-right">
                          P_eff <InfoTooltip {...getTooltipProps('pneum.effectivePressure')} iconSize={10} />
                        </th>
                      </>
                    )}
                    <th className="py-2 px-2 text-right">t_req</th>
                    <th className="py-2 px-2 text-right">Margen</th>
                    <th className="py-2 px-2 text-center">
                      Estado <InfoTooltip {...getTooltipProps('gate.timingSemaphore')} iconSize={10} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {timingSignals.map((t) => {
                    const color =
                      t.status === 'ok' ? 'text-ink-ok' :
                      t.status === 'warn' ? 'text-ink-warn' :
                      t.status === 'critical' ? 'text-ink-crit' :
                      'text-muted-foreground'
                    const bg =
                      t.status === 'ok' ? 'bg-emerald-500/[0.15]' :
                      t.status === 'warn' ? 'bg-amber-500/[0.15]' :
                      t.status === 'critical' ? 'bg-red-500/[0.15]' :
                      ''
                    const label =
                      t.status === 'ok' ? 'OK' :
                      t.status === 'warn' ? 'AJUSTADO' :
                      t.status === 'critical' ? 'CRÍTICO' :
                      'INACTIVO'
                    const pb = t.pneumaticBreakdown
                    const pEffColor = pb
                      ? pb.effectivePressureBar >= 5 ? 'text-ink-ok'
                        : pb.effectivePressureBar >= 3 ? 'text-ink-warn'
                        : 'text-ink-crit'
                      : ''
                    return (
                      <tr key={t.gateNumber} className={cn('border-b hover:bg-muted/30', bg)} title={t.hint}>
                        <td className="py-2 px-2 font-medium">Gate {t.gateNumber}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{t.distanceMeters.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{t.tAvailableSec.toFixed(2)}s</td>
                        {pb && (
                          <>
                            <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{(pb.valveSwitchSec * 1000).toFixed(0)}ms</td>
                            <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{(pb.lineChargeSec * 1000).toFixed(0)}ms</td>
                            <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{(pb.cylinderStrokeSec * 1000).toFixed(0)}ms</td>
                            <td className={cn('py-2 px-2 text-right tabular-nums', pEffColor)}>{pb.effectivePressureBar.toFixed(1)}</td>
                          </>
                        )}
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{t.tRequiredSec.toFixed(2)}s</td>
                        <td className={cn('py-2 px-2 text-right tabular-nums font-semibold', color)}>
                          {t.marginSec >= 0 ? '+' : ''}{(t.marginSec * 1000).toFixed(0)}ms
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Badge variant="outline" className={cn('text-caption', color, 'border-current')}>
                            {label}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-3 text-caption text-muted-foreground flex-wrap">
              <span>Sorting Belt: {timingSignals[0]?.beltSpeedMps.toFixed(2)} m/s</span>
              {timingSignals[0]?.pneumaticBreakdown ? (
                <>
                  <span>·</span>
                  <span>FRL: {physicalConfig?.pneumaticConfig?.supplyPressureBar ?? '—'} bar</span>
                  <span>·</span>
                  <span>Tubo: Ø{physicalConfig?.pneumaticConfig?.tubeInnerDiameterMm ?? '—'}mm ID</span>
                  <span>·</span>
                  <span>Cilindro: Ø{physicalConfig?.pneumaticConfig?.cylinderBoreMm ?? '—'}×{physicalConfig?.pneumaticConfig?.cylinderStrokeMm ?? '—'}mm</span>
                </>
              ) : (
                <>
                  <span>·</span>
                  <span>Reset plano: {(physicalConfig?.flipperResetTimeSec ?? 0.45).toFixed(2)}s</span>
                  <span>·</span>
                  <span className="italic text-ink-warn">Configurar neumática en "Configurar compuertas" para desglose per-gate.</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Asignación óptima de calibres a gates (iter 19 / P0.5) ──────── */}
      {optimalAssignment.length > 0 && (
        <Card className="border-cat-6-tint/[0.25]">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              Asignación Óptima Sugerida
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Heurística: calibres con mayor demanda → gates con mejor tiempo de reacción. No reemplaza
              las sugerencias de swap; es una vista "desde cero" útil al reconfigurar para un nuevo lote.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-2">Gate</th>
                    <th className="py-2 px-2 text-right">Timing</th>
                    <th className="py-2 px-2">Actual</th>
                    <th className="py-2 px-2">Óptimo</th>
                    <th className="py-2 px-2 text-center">Match</th>
                    <th className="py-2 px-2">Razón</th>
                  </tr>
                </thead>
                <tbody>
                  {optimalAssignment.map((o) => (
                    <tr
                      key={o.gateNumber}
                      className={cn(
                        'border-b hover:bg-muted/30',
                        !o.isMatch && o.suggestedCalibre != null && 'bg-cat-6-tint/[0.15]',
                      )}
                    >
                      <td className="py-2 px-2 font-medium">Gate {o.gateNumber}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                        {o.timingScore}/100
                      </td>
                      <td className="py-2 px-2">
                        {o.currentCalibre ? (
                          <Badge variant="outline" className="text-caption">
                            {o.currentCalibre}
                          </Badge>
                        ) : (
                          <span className="text-caption text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {o.suggestedCalibre ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-caption',
                              o.isMatch
                                ? 'border-emerald-500/[0.25] text-ink-ok'
                                : 'border-cat-6-tint/[0.25] text-cat-6-ink',
                            )}
                          >
                            {o.suggestedCalibre}
                          </Badge>
                        ) : (
                          <span className="text-caption text-muted-foreground italic">desactivar</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {o.isMatch ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                        ) : o.suggestedCalibre != null ? (
                          <XCircle className="h-3.5 w-3.5 text-purple-500 inline" />
                        ) : (
                          <span className="text-caption text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-caption text-muted-foreground">{o.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const mismatchCount = optimalAssignment.filter(
                (o) => !o.isMatch && o.suggestedCalibre != null,
              ).length
              return (
                <p className="text-caption text-muted-foreground mt-3">
                  {mismatchCount === 0
                    ? '✓ Todas las gates coinciden con la asignación óptima sugerida.'
                    : `${mismatchCount} gate${mismatchCount !== 1 ? 's' : ''} con asignación sub-óptima — revisar razón y validar con el operador antes de aplicar.`}
                </p>
              )
            })()}
          </CardContent>
        </Card>
      )}
    </>
  )
}
