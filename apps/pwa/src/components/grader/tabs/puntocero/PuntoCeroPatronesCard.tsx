import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, InfoTooltip } from '@/components/ui'
import { Activity } from 'lucide-react'
import { Bar, Line } from 'react-chartjs-2'
import type { ChartData } from 'chart.js'
import { Chart as ChartJS } from 'chart.js'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import type { GraderAnalyticsResult } from '@/services/grader/types'
import type { PatternCauseTrendView } from '@/hooks/useGraderPatternAnalytics'

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

type PatternRow = { key: string; pieces: number; pct: number }
type PatternHourRow = { key: string; hour: string; rangeLabel: string; pieces: number; pct: number }
type PatternIntervalDetail = {
  calibres: Array<{ key: string; pieces: number }>
  qualities: Array<{ key: string; pieces: number }>
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface Props {
  analytics: GraderAnalyticsResult
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

export function PuntoCeroPatronesCard({
  analytics,
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
  const [pinnedPatternPoints, setPinnedPatternPoints] = useState<PinnedPatternPoint[]>([])
  const patternLineChartRef = useRef<ChartJS<'line'> | null>(null)
  const patternChartContainerRef = useRef<HTMLDivElement>(null)

  const topPatternCalibre = patternByCalibre[0]
  const topPatternQuality = patternByQuality[0]
  const peakPatternHour = patternByHour.reduce<{ hour: string; rangeLabel: string; pieces: number; pct: number } | null>(
    (best, bucket) => (bucket && (!best || bucket.pieces > best.pieces) ? bucket : best),
    null,
  )

  // ─── Pin point helpers ──────────────────────────────────────────────────

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

  useEffect(() => {
    setPinnedPatternPoints((prev) =>
      prev.flatMap((pin) => {
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
    )
  }, [patternByHour, patternIntervalDetailsByLabel])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-cat-7-ink" />
          Patrones Punto Cero (Causa + Horario)
          <InfoTooltip {...getTooltipProps('pz.pivote')} />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Filtra por causa y rango horario para identificar concentraciones por calibre, calidad y hora.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-2">
          <div className="md:col-span-2">
            <label className="text-caption text-muted-foreground block mb-1">Causa</label>
            <select
              className="w-full bg-background border rounded-ctl px-2 py-1.5 text-xs"
              value={selectedCauseLabel ?? ''}
              onChange={(e) => onSelectedCauseLabelChange(e.target.value || null)}
            >
              <option value="">Todas</option>
              {analytics.pointZeroClassification.causes
                .filter((c) => (c.records?.length ?? 0) > 0)
                .map((c) => (
                  <option key={c.label} value={c.label}>{c.label}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-caption text-muted-foreground block mb-1">Desde</label>
            <input type="time" className="w-full bg-background border rounded-ctl px-2 py-1.5 text-xs" value={timeFilterFrom} onChange={(e) => onTimeFilterFromChange(e.target.value)} />
          </div>
          <div>
            <label className="text-caption text-muted-foreground block mb-1">Hasta</label>
            <input type="time" className="w-full bg-background border rounded-ctl px-2 py-1.5 text-xs" value={timeFilterTo} onChange={(e) => onTimeFilterToChange(e.target.value)} />
          </div>
          <div>
            <label className="text-caption text-muted-foreground block mb-1">Intervalo (min)</label>
            <input type="range" min={1} max={60} step={1} className="w-full" value={patternIntervalMinutes} onChange={(e) => onPatternIntervalMinutesChange(Math.min(60, Math.max(1, Number(e.target.value) || 60)))} />
            <div className="text-caption text-muted-foreground mt-1">{patternIntervalMinutes} min</div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className="text-caption">Piezas filtradas: {patternTotalPieces.toLocaleString('es-CL')}</Badge>
          {topPatternCalibre && <Badge variant="secondary" className="text-caption">Top calibre: {topPatternCalibre.key} ({topPatternCalibre.pct}%)</Badge>}
          {topPatternQuality && <Badge variant="secondary" className="text-caption">Top calidad: {topPatternQuality.key} ({topPatternQuality.pct}%)</Badge>}
          {peakPatternHour && <Badge variant="secondary" className="text-caption">Ventana pico: {peakPatternHour.rangeLabel} ({peakPatternHour.pct}%)</Badge>}
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
              <div className="border rounded-ctl p-3">
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
                        tooltip: { callbacks: { label: (ctx) => { const d = patternByCalibre[ctx.dataIndex]; return d ? `${d.pieces.toLocaleString('es-CL')} pz (${d.pct}%)` : '' } } },
                      },
                      scales: { x: { beginAtZero: true, max: 100 }, y: { grid: { display: false } } },
                    }}
                  />
                </div>
              </div>

              <div className="border rounded-ctl p-3">
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
                        tooltip: { callbacks: { label: (ctx) => { const d = patternByQuality[ctx.dataIndex]; return d ? `${d.pieces.toLocaleString('es-CL')} pz (${d.pct}%)` : '' } } },
                      },
                      scales: { x: { beginAtZero: true, max: 100 }, y: { grid: { display: false } } },
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="border rounded-ctl p-3">
              <div className="flex items-center justify-between mb-2 gap-2">
                <p className="text-xs font-medium">Patrón por intervalo ({patternIntervalMinutes} min)</p>
                <p className="text-caption text-muted-foreground">Click fija · arrastra compara · X quita</p>
              </div>
              <p className="text-caption text-muted-foreground mb-2">
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
                          title: (items) => { const first = items?.[0]; if (!first) return ''; const bucket = patternByHour[first.dataIndex]; return bucket ? `Ventana: ${bucket.rangeLabel}` : '' },
                          label: (ctx) => { const bucket = patternByHour[ctx.dataIndex]; return bucket ? `Piezas: ${bucket.pieces.toLocaleString('es-CL')} (${bucket.pct}%)` : '' },
                          afterBody: (items) => {
                            const first = items?.[0]
                            if (!first) return []
                            const bucket = patternByHour[first.dataIndex]
                            if (!bucket) return []
                            const detail = patternIntervalDetailsByLabel.get(bucket.key)
                            if (!detail) return []
                            const lines: string[] = ['', 'Calibre:']
                            for (const c of detail.calibres) lines.push(`- ${c.key}: ${c.pieces.toLocaleString('es-CL')} pz`)
                            lines.push('', 'Calidad:')
                            for (const q of detail.qualities) lines.push(`- ${q.key}: ${q.pieces.toLocaleString('es-CL')} pz`)
                            return lines
                          },
                        },
                      },
                    },
                    scales: { y: { beginAtZero: true }, x: { grid: { color: 'rgba(128,128,128,0.1)' } } },
                  }}
                />

                <svg className="absolute inset-0 pointer-events-none text-muted-foreground" width="100%" height="100%">
                  {pinnedPatternPoints.map((pin) => {
                    const point = getPatternPointPixels(pin.dataIndex)
                    if (!point) return null
                    const lineEndX = pin.x > point.x ? pin.x : pin.x + PIN_CARD_WIDTH
                    const lineEndY = pin.y + 18
                    return (
                      <line key={`line-${pin.id}`} x1={point.x} y1={point.y} x2={lineEndX} y2={lineEndY} stroke="currentColor" strokeOpacity="0.65" strokeWidth="1.5" strokeDasharray="4 3" />
                    )
                  })}
                </svg>

                {pinnedPatternPoints.map((pin) => (
                  <div key={pin.id} className="absolute z-20 w-56 rounded-ctl border bg-card/95 shadow-sm p-2 text-caption select-none" style={{ left: pin.x, top: pin.y }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{pin.label}</p>
                        <p className="text-muted-foreground">{pin.rangeLabel}</p>
                        <p className="text-muted-foreground">{pin.pieces.toLocaleString('es-CL')} pz ({pin.pct}%)</p>
                      </div>
                      <button type="button" className="text-muted-foreground hover:text-foreground leading-none" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removePinnedPatternPoint(pin.id) }} aria-label={`Quitar comparación ${pin.label}`}>
                        ✕
                      </button>
                    </div>
                    <div className="mt-1">
                      <p className="font-medium">Calibre</p>
                      {pin.calibres.map((row) => <p key={`${pin.id}-c-${row.key}`} className="text-muted-foreground">- {row.key}: {row.pieces.toLocaleString('es-CL')} pz</p>)}
                    </div>
                    <div className="mt-1">
                      <p className="font-medium">Calidad</p>
                      {pin.qualities.map((row) => <p key={`${pin.id}-q-${row.key}`} className="text-muted-foreground">- {row.key}: {row.pieces.toLocaleString('es-CL')} pz</p>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-ctl p-3">
              <p className="text-xs font-medium mb-1">Evolución % acumulado por causa (sobre total del turno)</p>
              <p className="text-caption text-muted-foreground mb-2">
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
                            return `${cause.label}: ${pct}% acum. (${cumulativePieces.toLocaleString('es-CL')} / ${cumulativeTotal.toLocaleString('es-CL')} pz) · int: ${intervalPieces.toLocaleString('es-CL')} / ${intervalTotal.toLocaleString('es-CL')}`
                          },
                        },
                      },
                    },
                    scales: {
                      y: { beginAtZero: true, ticks: { callback: (v) => `${v}%` }, title: { display: true, text: '% acumulado del total del turno' } },
                      x: { grid: { color: 'rgba(128,128,128,0.1)' } },
                    },
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b"><th className="py-1.5 px-2 text-left">Calibre</th><th className="py-1.5 px-2 text-right">Piezas</th><th className="py-1.5 px-2 text-right">%</th></tr></thead>
                  <tbody>{patternByCalibre.map((row) => <tr key={row.key} className="border-b"><td className="py-1 px-2">{row.key}</td><td className="py-1 px-2 text-right">{row.pieces.toLocaleString('es-CL')}</td><td className="py-1 px-2 text-right">{row.pct}%</td></tr>)}</tbody>
                </table>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b"><th className="py-1.5 px-2 text-left">Calidad</th><th className="py-1.5 px-2 text-right">Piezas</th><th className="py-1.5 px-2 text-right">%</th></tr></thead>
                  <tbody>{patternByQuality.map((row) => <tr key={row.key} className="border-b"><td className="py-1 px-2">{row.key}</td><td className="py-1 px-2 text-right">{row.pieces.toLocaleString('es-CL')}</td><td className="py-1 px-2 text-right">{row.pct}%</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
