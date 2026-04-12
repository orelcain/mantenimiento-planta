/**
 * Tab "Punto Cero" del Dashboard del Grader.
 * Extraído de AnalisisGraderDashboardPage.tsx en la iter 4 de refactor 2026-04-10
 * para dividir el componente principal por tabs y reducir complejidad.
 *
 * Contiene:
 *  - Clasificación 100% Punto Cero (donut + tabla con drill-down)
 *  - Patrones (calibre + calidad + hora + pinning de puntos)
 *  - Pivote Error × Calidad × Calibre
 *  - Fuera de Rango — Distribución por Peso
 *  - Serie temporal Punto Cero
 *
 * Los estados locales del tab (expandedCause, p0ErrorFilter, pinnedPatternPoints)
 * viven dentro del componente. Los estados compartidos (selectedCauseLabel, filtros
 * de tiempo, intervalMinutes) se pasan como props porque también los consume la
 * exportación JSON del padre.
 */
import { useState, useRef, useEffect, Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, InfoTooltip } from '@/components/ui'
import { Activity, AlertTriangle, ChevronDown, Eye, Table2, Target } from 'lucide-react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import type { ChartData } from 'chart.js'
import { Chart as ChartJS } from 'chart.js'
import { cn } from '@/lib/utils'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { pctCalc, resolveCalibreLabel } from '@/services/grader/graderDashboardHelpers'
import type { GraderAnalyticsResult, GraderAnalysisConfig } from '@/services/grader/types'

// ─── Tipos locales ─────────────────────────────────────────────────────────

interface PinnedPatternPoint {
  id: string
  bucketKey: string
  label: string
  rangeLabel: string
  dataIndex: number
  pieces: number
  pct: number
  calibres: Array<{ key: string; pieces: number }>
  qualities: Array<{ key: string; pieces: number }>
  x: number
  y: number
}

const PIN_CARD_WIDTH = 224

// Los arrays pattern* vienen calculados del padre; usamos los tipos inline
// que corresponden al shape exacto devuelto por los useMemo.
type PatternRow = { key: string; pieces: number; pct: number }
type PatternHourRow = { key: string; hour: string; rangeLabel: string; pieces: number; pct: number }
type PatternIntervalDetail = {
  calibres: Array<{ key: string; pieces: number }>
  qualities: Array<{ key: string; pieces: number }>
}

export interface PatternCauseTrendView {
  labels: string[]
  ranges: string[]
  bucketKeys: number[]
  intervalTotals: number[]
  cumulativeTotals: number[]
  series: Array<{
    label: string
    pctCumulative: number[]
    piecesInterval: number[]
    piecesCumulative: number[]
  }>
}

// ─── Props del componente ──────────────────────────────────────────────────

interface Props {
  analytics: GraderAnalyticsResult
  kpis: GraderAnalyticsResult['kpis']
  config: GraderAnalysisConfig
  // Memos derivados calculados en el padre (compartidos con export JSON)
  patternByCalibre: PatternRow[]
  patternByQuality: PatternRow[]
  patternByHour: PatternHourRow[]
  patternTotalPieces: number
  patternCalibreChartData: ChartData<'bar'>
  patternQualityChartData: ChartData<'bar'>
  patternHourChartData: ChartData<'line'>
  patternCauseTrend: PatternCauseTrendView
  patternCauseTrendChartData: ChartData<'line'>
  patternIntervalDetailsByLabel: Map<string, PatternIntervalDetail>
  // Estados compartidos con export JSON (viven en el padre)
  selectedCauseLabel: string | null
  onSelectedCauseLabelChange: (value: string | null) => void
  timeFilterFrom: string
  onTimeFilterFromChange: (value: string) => void
  timeFilterTo: string
  onTimeFilterToChange: (value: string) => void
  patternIntervalMinutes: number
  onPatternIntervalMinutesChange: (value: number) => void
}

// ─── Componente ────────────────────────────────────────────────────────────

export function GraderPuntoCeroTab({
  analytics,
  kpis,
  config,
  patternByCalibre,
  patternByQuality,
  patternByHour,
  patternTotalPieces,
  patternCalibreChartData,
  patternQualityChartData,
  patternHourChartData,
  patternCauseTrend,
  patternCauseTrendChartData,
  patternIntervalDetailsByLabel,
  selectedCauseLabel,
  onSelectedCauseLabelChange,
  timeFilterFrom,
  onTimeFilterFromChange,
  timeFilterTo,
  onTimeFilterToChange,
  patternIntervalMinutes,
  onPatternIntervalMinutesChange,
}: Props) {
  // Estados locales
  const [expandedCause, setExpandedCause] = useState<string | null>(null)
  const [p0ErrorFilter, setP0ErrorFilter] = useState<string | null>(null)
  const [pinnedPatternPoints, setPinnedPatternPoints] = useState<PinnedPatternPoint[]>([])

  // Refs locales
  const patternLineChartRef = useRef<ChartJS<'line'> | null>(null)
  const patternChartContainerRef = useRef<HTMLDivElement>(null)

  // Derivados locales (no se usan fuera del tab)
  const topPatternCalibre = patternByCalibre[0]
  const topPatternQuality = patternByQuality[0]
  const peakPatternHour = patternByHour.reduce<{ hour: string; rangeLabel: string; pieces: number; pct: number } | null>(
    (best, bucket) => (bucket && (!best || bucket.pieces > best.pieces) ? bucket : best),
    null,
  )

  // Colores de causas (donut + leyenda + tabla)
  const causeColorMap: Record<string, string> = {
    fuera_de_limites: 'rgba(239,68,68,0.92)',
    no_leido_fotocelula: 'rgba(245,158,11,0.92)',
    puerta_no_preparada: 'rgba(16,185,129,0.92)',
    fuera_de_rango: 'rgba(59,130,246,0.92)',
    too_close_too_long: 'rgba(139,92,246,0.92)',
    otro: 'rgba(107,114,128,0.92)',
  }
  const getCauseColor = (cause: string): string => causeColorMap[cause] ?? 'rgba(107,114,128,0.92)'

  const classificationChartData = {
    labels: analytics.pointZeroClassification.causes.map((c) => c.label),
    datasets: [
      {
        data: analytics.pointZeroClassification.causes.map((c) => c.pieces),
        backgroundColor: analytics.pointZeroClassification.causes.map((c) => getCauseColor(c.cause)),
        borderColor: 'rgba(255,255,255,0.92)',
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  }

  const timeSeriesData = {
    labels: analytics.timeSeriesPointZero.map((p) => p.bucketStart),
    datasets: [
      {
        label: 'Punto Cero (piezas)',
        data: analytics.timeSeriesPointZero.map((p) => p.pointZeroPieces),
        borderColor: 'rgba(239,68,68,0.9)',
        backgroundColor: 'rgba(239,68,68,0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }

  // ─── Helpers de pin points ─────────────────────────────────────────────

  const getPatternPointPixels = (dataIndex: number): { x: number; y: number } | null => {
    const chart = patternLineChartRef.current
    if (!chart) return null
    const meta = chart.getDatasetMeta(0)
    const pointEl = meta?.data?.[dataIndex]
    if (!pointEl) return null
    const point = pointEl.getProps(['x', 'y'], true)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
    return { x: point.x, y: point.y }
  }

  const handlePinPatternPoint = (dataIndex: number) => {
    const bucket = patternByHour[dataIndex]
    if (!bucket) return

    const detail = patternIntervalDetailsByLabel.get(bucket.key)
    const pointPixels = getPatternPointPixels(dataIndex)

    setPinnedPatternPoints((prev) => {
      const existingIdx = prev.findIndex((p) => p.bucketKey === bucket.key)
      const existingPin = existingIdx >= 0 ? prev[existingIdx] : null
      const defaultX = pointPixels ? pointPixels.x + 14 : 16
      const defaultY = pointPixels ? Math.max(8, pointPixels.y - 12) : 16
      const nextPin: PinnedPatternPoint = {
        id: existingPin ? existingPin.id : `${bucket.key}-${dataIndex}`,
        bucketKey: bucket.key,
        label: bucket.hour,
        rangeLabel: bucket.rangeLabel,
        dataIndex,
        pieces: bucket.pieces,
        pct: bucket.pct,
        calibres: detail?.calibres ?? [],
        qualities: detail?.qualities ?? [],
        x: existingPin ? existingPin.x : defaultX,
        y: existingPin ? existingPin.y : defaultY,
      }

      if (existingIdx >= 0) {
        const copy = [...prev]
        copy[existingIdx] = nextPin
        return copy
      }

      return [...prev, nextPin]
    })
  }

  const removePinnedPatternPoint = (id: string) => {
    setPinnedPatternPoints((prev) => prev.filter((pin) => pin.id !== id))
  }

  // Resync pins cuando cambia patternByHour (filtros o interval)
  useEffect(() => {
    setPinnedPatternPoints((prev) => {
      return prev.flatMap((pin) => {
        const newIndex = patternByHour.findIndex((bucket) => bucket.key === pin.bucketKey)
        if (newIndex < 0) return []
        const bucket = patternByHour[newIndex]
        if (!bucket) return []
        const detail = patternIntervalDetailsByLabel.get(bucket.key)
        return [{
          ...pin,
          bucketKey: bucket.key,
          dataIndex: newIndex,
          label: bucket.hour,
          rangeLabel: bucket.rangeLabel,
          pieces: bucket.pieces,
          pct: bucket.pct,
          calibres: detail?.calibres ?? [],
          qualities: detail?.qualities ?? [],
        }]
      })
    })
  }, [patternByHour, patternIntervalDetailsByLabel])

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {/* Clasificación 100% Punto Cero */}
      {analytics.pointZeroClassification.causes.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-red-500" />
              Clasificación Punto Cero — 100%
              <InfoTooltip {...getTooltipProps('pz.clasificacion')} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString()} piezas totales en Punto Cero
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
                              const cause = analytics.pointZeroClassification.causes[ctx.dataIndex]
                              return cause
                                ? `${cause.label}: ${cause.pieces.toLocaleString()} pz (${cause.pctOfPointZero}% P.Cero | ${cause.pctOfTotal}% Total)`
                                : ''
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analytics.pointZeroClassification.causes.map((c) => (
                    <div key={`legend-${c.cause}`} className="rounded border bg-muted/20 px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getCauseColor(c.cause) }} />
                          <span className="truncate font-medium">{c.label}</span>
                        </div>
                        <span className="text-muted-foreground">{c.pctOfPointZero}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {c.pieces.toLocaleString()} pz · {c.pctOfTotal}% total
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
                    {analytics.pointZeroClassification.causes.map((c, i) => {
                      const isExpanded = expandedCause === c.cause
                      const hasRecords = c.records && c.records.length > 0
                      return (
                        <Fragment key={i}>
                          <tr
                            className={cn(
                              'border-b border-muted/30 hover:bg-muted/20',
                              i % 2 === 0 && 'bg-muted/[0.08]',
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
                                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getCauseColor(c.cause) }} />
                                  <span className="font-semibold text-sm leading-tight">{c.label}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-snug max-w-[38ch]">{c.description}</p>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right font-medium tabular-nums">{c.pieces.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums">
                              <span className={cn(
                                'font-semibold',
                                c.pctOfPointZero >= 50 && 'text-red-600',
                                c.pctOfPointZero >= 10 && c.pctOfPointZero < 50 && 'text-amber-600',
                              )}>
                                {c.pctOfPointZero}%
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{c.pctOfTotal}%</td>
                            <td className="py-2 px-2 text-right tabular-nums">{c.weightKg ? c.weightKg.toLocaleString() : '—'}</td>
                          </tr>
                          {/* Drill-down rows */}
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
                    {/* Total row */}
                    <tr className="border-t-2 border-muted/60 font-bold bg-muted/40">
                      <td className="py-2 px-1"></td>
                      <td className="py-2 px-2">TOTAL</td>
                      <td className="py-2 px-2 text-right tabular-nums">{analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString()}</td>
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
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-500" />
            Patrones Punto Cero (Causa + Horario)
            <InfoTooltip {...getTooltipProps('pz.pivote')} />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Filtra por causa y rango horario para identificar concentraciones por calibre, calidad y hora.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-2">
            <div className="md:col-span-2">
              <label className="text-[11px] text-muted-foreground block mb-1">Causa</label>
              <select
                className="w-full bg-background border rounded px-2 py-1.5 text-xs"
                value={selectedCauseLabel ?? ''}
                onChange={(e) => onSelectedCauseLabelChange(e.target.value || null)}
              >
                <option value="">Todas</option>
                {analytics.pointZeroClassification.causes
                  .filter((c) => (c.records?.length ?? 0) > 0)
                  .map((c) => (
                    <option key={c.label} value={c.label}>
                      {c.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Desde</label>
              <input
                type="time"
                className="w-full bg-background border rounded px-2 py-1.5 text-xs"
                value={timeFilterFrom}
                onChange={(e) => onTimeFilterFromChange(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Hasta</label>
              <input
                type="time"
                className="w-full bg-background border rounded px-2 py-1.5 text-xs"
                value={timeFilterTo}
                onChange={(e) => onTimeFilterToChange(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Intervalo (min)</label>
              <input
                type="range"
                min={1}
                max={60}
                step={1}
                className="w-full"
                value={patternIntervalMinutes}
                onChange={(e) => onPatternIntervalMinutesChange(Math.min(60, Math.max(1, Number(e.target.value) || 60)))}
              />
              <div className="text-[10px] text-muted-foreground mt-1">{patternIntervalMinutes} min</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[11px]">Piezas filtradas: {patternTotalPieces.toLocaleString()}</Badge>
            {topPatternCalibre && <Badge variant="secondary" className="text-[11px]">Top calibre: {topPatternCalibre.key} ({topPatternCalibre.pct}%)</Badge>}
            {topPatternQuality && <Badge variant="secondary" className="text-[11px]">Top calidad: {topPatternQuality.key} ({topPatternQuality.pct}%)</Badge>}
            {peakPatternHour && <Badge variant="secondary" className="text-[11px]">Ventana pico: {peakPatternHour.rangeLabel} ({peakPatternHour.pct}%)</Badge>}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs ml-auto"
              onClick={() => {
                onSelectedCauseLabelChange(null)
                onTimeFilterFromChange('')
                onTimeFilterToChange('')
                onPatternIntervalMinutesChange(60)
                setPinnedPatternPoints([])
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {patternTotalPieces === 0 ? (
            <p className="text-xs text-muted-foreground">No hay registros para el filtro seleccionado.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border rounded p-3">
                  <p className="text-xs font-medium mb-2">% por calibre</p>
                  <div className="w-full" style={{ height: Math.max(180, patternByCalibre.length * 34) }}>
                    <Bar
                      data={patternCalibreChartData}
                      options={{
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (ctx) => {
                                const d = patternByCalibre[ctx.dataIndex]
                                return d ? `${d.pieces.toLocaleString()} pz (${d.pct}%)` : ''
                              },
                            },
                          },
                        },
                        scales: {
                          x: { beginAtZero: true, max: 100 },
                          y: { grid: { display: false } },
                        },
                      }}
                    />
                  </div>
                </div>

                <div className="border rounded p-3">
                  <p className="text-xs font-medium mb-2">% por calidad</p>
                  <div className="w-full" style={{ height: Math.max(180, patternByQuality.length * 34) }}>
                    <Bar
                      data={patternQualityChartData}
                      options={{
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (ctx) => {
                                const d = patternByQuality[ctx.dataIndex]
                                return d ? `${d.pieces.toLocaleString()} pz (${d.pct}%)` : ''
                              },
                            },
                          },
                        },
                        scales: {
                          x: { beginAtZero: true, max: 100 },
                          y: { grid: { display: false } },
                        },
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="border rounded p-3">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <p className="text-xs font-medium">Patrón por intervalo ({patternIntervalMinutes} min)</p>
                  <p className="text-[10px] text-muted-foreground">Click fija · arrastra compara · X quita</p>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Cada punto resume un rango de {patternIntervalMinutes} min (ejemplo: 22:00 = 21:00 - 22:00).
                </p>
                <div ref={patternChartContainerRef} className="w-full relative" style={{ height: 220 }}>
                  <Line
                    ref={patternLineChartRef}
                    data={patternHourChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      onClick: (_event, elements) => {
                        const first = elements?.[0]
                        if (!first) return
                        handlePinPatternPoint(first.index)
                      },
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            title: (items) => {
                              const first = items?.[0]
                              if (!first) return ''
                              const bucket = patternByHour[first.dataIndex]
                              return bucket ? `Ventana: ${bucket.rangeLabel}` : ''
                            },
                            label: (ctx) => {
                              const bucket = patternByHour[ctx.dataIndex]
                              return bucket ? `Piezas: ${bucket.pieces.toLocaleString()} (${bucket.pct}%)` : ''
                            },
                            afterBody: (items) => {
                              const first = items?.[0]
                              if (!first) return []
                              const bucket = patternByHour[first.dataIndex]
                              if (!bucket) return []
                              const detail = patternIntervalDetailsByLabel.get(bucket.key)
                              if (!detail) return []

                              const lines: string[] = []
                              lines.push('')
                              lines.push('Calibre:')
                              for (const c of detail.calibres) {
                                lines.push(`- ${c.key}: ${c.pieces.toLocaleString()} pz`)
                              }
                              lines.push('')
                              lines.push('Calidad:')
                              for (const q of detail.qualities) {
                                lines.push(`- ${q.key}: ${q.pieces.toLocaleString()} pz`)
                              }
                              return lines
                            },
                          },
                        },
                      },
                      scales: {
                        y: { beginAtZero: true },
                        x: { grid: { color: 'rgba(128,128,128,0.1)' } },
                      },
                    }}
                  />

                  <svg className="absolute inset-0 pointer-events-none text-muted-foreground" width="100%" height="100%">
                    {pinnedPatternPoints.map((pin) => {
                      const point = getPatternPointPixels(pin.dataIndex)
                      if (!point) return null
                      const lineEndX = pin.x > point.x ? pin.x : pin.x + PIN_CARD_WIDTH
                      const lineEndY = pin.y + 18
                      return (
                        <line
                          key={`line-${pin.id}`}
                          x1={point.x}
                          y1={point.y}
                          x2={lineEndX}
                          y2={lineEndY}
                          stroke="currentColor"
                          strokeOpacity="0.65"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                      )
                    })}
                  </svg>

                  {pinnedPatternPoints.map((pin) => (
                    <div
                      key={pin.id}
                      className="absolute z-20 w-56 rounded border bg-card/95 shadow-sm p-2 text-[11px] select-none"
                      style={{ left: pin.x, top: pin.y }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{pin.label}</p>
                          <p className="text-muted-foreground">{pin.rangeLabel}</p>
                          <p className="text-muted-foreground">{pin.pieces.toLocaleString()} pz ({pin.pct}%)</p>
                        </div>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground leading-none"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            removePinnedPatternPoint(pin.id)
                          }}
                          aria-label={`Quitar comparación ${pin.label}`}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="mt-1">
                        <p className="font-medium">Calibre</p>
                        {pin.calibres.map((row) => (
                          <p key={`${pin.id}-c-${row.key}`} className="text-muted-foreground">- {row.key}: {row.pieces.toLocaleString()} pz</p>
                        ))}
                      </div>

                      <div className="mt-1">
                        <p className="font-medium">Calidad</p>
                        {pin.qualities.map((row) => (
                          <p key={`${pin.id}-q-${row.key}`} className="text-muted-foreground">- {row.key}: {row.pieces.toLocaleString()} pz</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border rounded p-3">
                <p className="text-xs font-medium mb-1">Evolución % acumulado por causa (sobre total del turno)</p>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Inicia en 0% y muestra cómo evoluciona cada causa en el turno. El último punto debe cuadrar con el % total final.
                </p>
                <div className="w-full" style={{ height: 240 }}>
                  <Line
                    data={patternCauseTrendChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
                        tooltip: {
                          callbacks: {
                            title: (items) => {
                              const first = items?.[0]
                              if (!first) return ''
                              const range = patternCauseTrend.ranges[first.dataIndex]
                              return range ? (first.dataIndex === 0 ? `${range}` : `Ventana: ${range}`) : ''
                            },
                            label: (ctx) => {
                              const cause = patternCauseTrend.series.find((s) => s.label === ctx.dataset.label)
                              if (!cause) return ''
                              const idx = ctx.dataIndex
                              const intervalPieces = cause.piecesInterval[idx] ?? 0
                              const intervalTotal = patternCauseTrend.intervalTotals[idx] ?? 0
                              const cumulativePieces = cause.piecesCumulative[idx] ?? 0
                              const cumulativeTotal = patternCauseTrend.cumulativeTotals[idx] ?? 0
                              const pct = cause.pctCumulative[idx] ?? 0
                              if (idx === 0) return `${cause.label}: 0% (inicio)`
                              return `${cause.label}: ${pct}% acum. (${cumulativePieces.toLocaleString()} / ${cumulativeTotal.toLocaleString()} pz) · int: ${intervalPieces.toLocaleString()} / ${intervalTotal.toLocaleString()}`
                            },
                          },
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: { callback: (v) => `${v}%` },
                          title: { display: true, text: '% acumulado del total del turno' },
                        },
                        x: { grid: { color: 'rgba(128,128,128,0.1)' } },
                      },
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="py-1.5 px-2 text-left">Calibre</th>
                        <th className="py-1.5 px-2 text-right">Piezas</th>
                        <th className="py-1.5 px-2 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patternByCalibre.map((row) => (
                        <tr key={row.key} className="border-b">
                          <td className="py-1 px-2">{row.key}</td>
                          <td className="py-1 px-2 text-right">{row.pieces.toLocaleString()}</td>
                          <td className="py-1 px-2 text-right">{row.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="py-1.5 px-2 text-left">Calidad</th>
                        <th className="py-1.5 px-2 text-right">Piezas</th>
                        <th className="py-1.5 px-2 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patternByQuality.map((row) => (
                        <tr key={row.key} className="border-b">
                          <td className="py-1 px-2">{row.key}</td>
                          <td className="py-1 px-2 text-right">{row.pieces.toLocaleString()}</td>
                          <td className="py-1 px-2 text-right">{row.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabla Pivote: Error × Calidad × Calibre */}
      {analytics.pointZeroClassification.hierarchy.length > 0 && (() => {
        const allRows = analytics.pointZeroClassification.hierarchy
        const filteredRows = p0ErrorFilter
          ? allRows.filter((r) => r.error === p0ErrorFilter)
          : allRows

        // Unique error labels for filter chips
        const uniqueErrors = Array.from(new Set(allRows.map((r) => r.error)))

        // Filtered total
        const filteredTotal = filteredRows.reduce((sum, r) => sum + r.pieces, 0)

        // Build grouped bar chart: one dataset per error type, grouped by calibre
        const allCalibres = Array.from(new Set(filteredRows.map((r) => r.calibre))).sort()

        const errorColorMap: Record<string, string> = {
          'Fuera de rango': 'rgba(239,68,68,0.75)',
          'Fuera de límites': 'rgba(245,158,11,0.75)',
          'No leído por fotocélula': 'rgba(139,92,246,0.75)',
          'Too close or too long': 'rgba(59,130,246,0.75)',
          'Puerta no preparada': 'rgba(16,185,129,0.75)',
          'Otro / Desconocido': 'rgba(107,114,128,0.75)',
        }

        // One dataset per error label
        const pivotBarDatasets = uniqueErrors.map((errorLabel) => {
          const data = allCalibres.map((cal) => {
            return filteredRows
              .filter((r) => r.error === errorLabel && r.calibre === cal)
              .reduce((sum, r) => sum + r.pieces, 0)
          })
          return {
            label: errorLabel,
            data,
            backgroundColor: errorColorMap[errorLabel] || 'rgba(107,114,128,0.6)',
            borderColor: errorColorMap[errorLabel]?.replace('0.75', '1') || 'rgba(107,114,128,1)',
            borderWidth: 1,
          }
        })

        return (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Table2 className="h-4 w-4 text-purple-500" />
              Pivote Error × Calidad × Calibre
              <InfoTooltip {...getTooltipProps('pz.pivote')} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Desglose jerárquico: Error → Calidad → Calibre. Filtra por tipo de error.
            </p>
            {/* Filtros por tipo de error */}
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge
                variant={p0ErrorFilter === null ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setP0ErrorFilter(null)}
              >
                Todos ({analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString()})
              </Badge>
              {uniqueErrors.map((errorLabel) => {
                const errorTotal = allRows.filter((r) => r.error === errorLabel).reduce((s, r) => s + r.pieces, 0)
                return (
                  <Badge
                    key={errorLabel}
                    variant={p0ErrorFilter === errorLabel ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => setP0ErrorFilter(p0ErrorFilter === errorLabel ? null : errorLabel)}
                  >
                    {errorLabel} ({errorTotal.toLocaleString()})
                  </Badge>
                )
              })}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Gráfico de barras agrupadas */}
            {allCalibres.length > 0 && pivotBarDatasets.length > 0 && (
              <div className="w-full" style={{ minHeight: 250 }}>
                <Bar
                  data={{ labels: allCalibres, datasets: pivotBarDatasets }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: { font: { size: 10 }, boxWidth: 14 },
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const v = ctx.parsed.y
                            if (!v) return ''
                            const pct = filteredTotal > 0 ? ((v / filteredTotal) * 100).toFixed(1) : '0'
                            return `${ctx.dataset.label}: ${v.toLocaleString()} pz (${pct}%)`
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        ticks: { font: { size: 10 } },
                        grid: { color: 'rgba(128,128,128,0.1)' },
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(128,128,128,0.1)' },
                      },
                    },
                  }}
                  height={280}
                />
              </div>
            )}

            {/* Tabla pivote */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-2">Etiquetas de fila</th>
                    <th className="py-2 px-2 text-right">Piezas</th>
                    <th className="py-2 px-2 text-right">% P.Cero</th>
                    <th className="py-2 px-2 text-right">% Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group by error then quality
                    const errorGroups = new Map<string, { cause: string; rows: typeof filteredRows; total: number }>()
                    for (const r of filteredRows) {
                      const g = errorGroups.get(r.error) || { cause: r.error, rows: [], total: 0 }
                      g.rows.push(r)
                      g.total += r.pieces
                      errorGroups.set(r.error, g)
                    }
                    const elements: React.ReactNode[] = []
                    for (const [errorLabel, eg] of Array.from(errorGroups.entries())) {
                      // Error header row
                      elements.push(
                        <tr key={`e-${errorLabel}`} className="bg-muted/60 font-bold border-b">
                          <td className="py-2 px-2">{errorLabel}</td>
                          <td className="py-2 px-2 text-right">{eg.total.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">{pctCalc(eg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{pctCalc(eg.total, analytics.kpis.totalPieces)}%</td>
                        </tr>
                      )
                      // Group by quality within this error
                      const qualityGroups = new Map<string, { rows: typeof filteredRows; total: number }>()
                      for (const r of eg.rows) {
                        const qg = qualityGroups.get(r.quality) || { rows: [], total: 0 }
                        qg.rows.push(r)
                        qg.total += r.pieces
                        qualityGroups.set(r.quality, qg)
                      }
                      for (const [qualLabel, qg] of Array.from(qualityGroups.entries())) {
                        // Quality sub-header row
                        elements.push(
                          <tr key={`q-${errorLabel}-${qualLabel}`} className="font-semibold border-b hover:bg-muted/20">
                            <td className="py-1.5 px-2 pl-6">{qualLabel}</td>
                            <td className="py-1.5 px-2 text-right">{qg.total.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right">{pctCalc(qg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                            <td className="py-1.5 px-2 text-right text-muted-foreground">{pctCalc(qg.total, analytics.kpis.totalPieces)}%</td>
                          </tr>
                        )
                        // Calibre detail rows
                        for (const r of qg.rows.sort((a, b) => b.pieces - a.pieces)) {
                          elements.push(
                            <tr key={`c-${errorLabel}-${qualLabel}-${r.calibre}`} className="border-b hover:bg-muted/10 text-muted-foreground">
                              <td className="py-1 px-2 pl-12">{r.calibre}</td>
                              <td className="py-1 px-2 text-right">{r.pieces.toLocaleString()}</td>
                              <td className="py-1 px-2 text-right">{r.pctOfPointZero}%</td>
                              <td className="py-1 px-2 text-right">{r.pctOfTotal}%</td>
                            </tr>
                          )
                        }
                      }
                    }
                    return elements
                  })()}
                  {/* Grand total */}
                  <tr className="border-t-2 font-bold bg-muted/50">
                    <td className="py-2 px-2">{p0ErrorFilter ? `Total ${p0ErrorFilter}` : 'Total general'}</td>
                    <td className="py-2 px-2 text-right">{filteredTotal.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right">{pctCalc(filteredTotal, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                    <td className="py-2 px-2 text-right">{pctCalc(filteredTotal, analytics.kpis.totalPieces)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        )
      })()}

      {/* Fuera de Rango — Distribución por Peso */}
      {analytics.pointZeroClassification.outOfRangeByWeight.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Fuera de Rango — Distribución por Peso
              <InfoTooltip {...getTooltipProps('pz.fueraRango')} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Piezas clasificadas como &quot;fuera de rango&quot; agrupadas por el calibre al que pertenecerían según su peso
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Bar chart — horizontal, contained height */}
              <div className="w-full" style={{ maxHeight: 220 }}>
                <Bar
                  data={{
                    labels: analytics.pointZeroClassification.outOfRangeByWeight.map((d) => d.rangeLabel),
                    datasets: [
                      {
                        label: 'Piezas fuera de rango',
                        data: analytics.pointZeroClassification.outOfRangeByWeight.map((d) => d.pieces),
                        backgroundColor: analytics.pointZeroClassification.outOfRangeByWeight.map((_, i, arr) => {
                          // Gradiente de color por posición
                          const t = arr.length > 1 ? i / (arr.length - 1) : 0
                          const r = Math.round(239 + (245 - 239) * t)
                          const g = Math.round(68 + (158 - 68) * t)
                          const b = Math.round(68 + (11 - 68) * t)
                          return `rgba(${r},${g},${b},0.75)`
                        }),
                        borderRadius: 4,
                        barThickness: 24,
                      },
                    ],
                  }}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const d = analytics.pointZeroClassification.outOfRangeByWeight[ctx.dataIndex]
                            return d ? `${d.pieces.toLocaleString()} piezas (${d.pct}%)` : ''
                          },
                        },
                      },
                    },
                    scales: {
                      x: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' } },
                      y: { ticks: { font: { size: 11 } } },
                    },
                  }}
                  height={Math.max(80, analytics.pointZeroClassification.outOfRangeByWeight.length * 40)}
                />
              </div>

              {/* Tables side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Weight ranges reference table */}
                <div>
                  <p className="text-xs font-medium mb-2">Rangos de Calibre (referencia)</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="py-1 px-2 text-left">Calibre</th>
                        <th className="py-1 px-2 text-right">Mín (g)</th>
                        <th className="py-1 px-2 text-right">Máx (g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.pointZeroClassification.calibreWeightRanges.map((r, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-1 px-2">{r.calibre}</td>
                          <td className="py-1 px-2 text-right font-mono">{r.minGrams.toLocaleString()}</td>
                          <td className="py-1 px-2 text-right font-mono">{r.maxGrams.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Out of range detail table */}
                <div>
                  <p className="text-xs font-medium mb-2">Desglose Fuera de Rango</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="py-1 px-2 text-left">Rango</th>
                        <th className="py-1 px-2 text-right">Piezas</th>
                        <th className="py-1 px-2 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.pointZeroClassification.outOfRangeByWeight.map((d, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="py-1 px-2">{d.rangeLabel}</td>
                          <td className="py-1 px-2 text-right font-medium">{d.pieces.toLocaleString()}</td>
                          <td className="py-1 px-2 text-right">{d.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Serie temporal Punto Cero */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Punto Cero en el Tiempo</CardTitle></CardHeader>
        <CardContent>
          {analytics.timeSeriesPointZero.length > 0 ? (
            <div className="w-full h-[260px] sm:h-[320px]">
              <Line
                data={timeSeriesData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: {
                      type: 'time',
                      time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' },
                      ticks: { maxRotation: 0, autoSkip: true },
                    },
                    y: { beginAtZero: true },
                  },
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sin serie temporal</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
