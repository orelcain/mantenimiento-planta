/**
 * Gráfico segundo a segundo del turno con ECharts.
 *
 * 4 capas toggleables:
 *  1. Pesos (scatter + moving avg) — cada pieza coloreada por calibre + línea promedio móvil
 *  2. P0% ventana móvil (line) — calculado en ventana de 5 minutos
 *  3. Errores P0 (markLines verticales) — marcas en el eje X donde ocurren errores
 *  4. Producción (area) — piezas/minuto en grid inferior separado
 *
 * Zoom: dataZoom nativo, crosshair vertical, stats dinámicos por rango visible.
 * Layout: dual grid (peso arriba 70%, producción abajo 25%), bandas de calibre.
 *
 * UX iter 20 (rondas 1-15): ejes separados, tooltip enriquecido, leyenda,
 *   scatter con opacidad, dual grid, moving avg, bandas calibre, gap markers,
 *   crosshair, dark theme polish.
 */
import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import type ReactEChartsCore from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { Activity, Coffee } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'
import type { TimelineBucket } from '@/services/grader/types'

// ── Paleta ──────────────────────────────────────────────────────────────────

const CALIBRE_COLORS: Record<string, string> = {
  '0-2': '#94a3b8', '1-2': '#94a3b8',
  '2-3': '#3b82f6', '2-4': '#3b82f6',
  '3-4': '#10b981',
  '4-5': '#f59e0b', '4-6': '#f59e0b',
  '5-6': '#ef4444',
  '6-8': '#ec4899',
  '8-10': '#8b5cf6',
  '10-12': '#14b8a6',
  '12+': '#f97316',
}
const DEFAULT_CALIBRE_COLOR = '#6b7280'

const ERROR_COLORS: Record<string, string> = {
  'Fuera de rango': '#ef4444',
  'Fuera de límites': '#f59e0b',
  'No leído por fotocélula': '#8b5cf6',
  'No leido por fotocelula': '#8b5cf6',
  'Too close or too long': '#3b82f6',
  'Puerta no preparada': '#10b981',
  'Desconocido': '#6b7280',
}
const DEFAULT_ERROR_COLOR = '#6b7280'

// Bandas de peso por calibre (lb→gramos) para markArea
const CALIBRE_BANDS = [
  { label: '2-4 lb', min: 907, max: 1814, color: 'rgba(59,130,246,0.04)' },
  { label: '4-6 lb', min: 1814, max: 2722, color: 'rgba(245,158,11,0.04)' },
  { label: '6-8 lb', min: 2722, max: 3629, color: 'rgba(236,72,153,0.04)' },
  { label: '8-10 lb', min: 3629, max: 4536, color: 'rgba(139,92,246,0.04)' },
]

function getCalibreColor(calibre: string): string {
  for (const [key, color] of Object.entries(CALIBRE_COLORS)) {
    if (calibre.includes(key)) return color
  }
  return DEFAULT_CALIBRE_COLOR
}

function getErrorColor(error: string): string {
  for (const [key, color] of Object.entries(ERROR_COLORS)) {
    if (error.toLowerCase().includes(key.toLowerCase())) return color
  }
  return DEFAULT_ERROR_COLOR
}

// ── Tipos ───────────────────────────────────────────────────────────────────

interface Props {
  /** Records crudos (detalle pieza-a-pieza). Opcional si se pasan `aggregates`. */
  records?: FirestorePieceRecord[]
  /**
   * Agregados pre-computados por minuto (desde `summary.timelineAggregates`).
   * Cuando están presentes, se usan en lugar de `records` para pintar el chart
   * al instante sin bajar los ~14k registros crudos.
   */
  aggregates?: TimelineBucket[]
  shiftId: string
  dateKey: string
}

// ── Tipo del output del pipeline de procesamiento ─────────────────────────
interface ChartSeries {
  weightSeries: Array<[number, number, string]>
  weightMovingAvg: Array<[number, number]>
  p0PctSeries: Array<[number, number]>
  p0CumulativeSeries: Array<[number, number]>
  errorSeries: Array<[number, number, string]>
  productionSeries: Array<[number, number]>
  gateTimeSeries: Array<{ gate: number; data: Array<[number, number]> }>
  gaps: Array<{ start: number; end: number; durationMin: number }>
  stats: {
    withWeight: number
    avgWeight: number
    minWeight: number
    maxWeight: number
    p0Count: number
    totalPieces: number
    uniqueCalibres: string[]
    uniqueErrors: string[]
    uniqueGates: number[]
  }
}

const EMPTY_CHART_SERIES: ChartSeries = {
  weightSeries: [],
  weightMovingAvg: [],
  p0PctSeries: [],
  p0CumulativeSeries: [],
  errorSeries: [],
  productionSeries: [],
  gateTimeSeries: [],
  gaps: [],
  stats: { withWeight: 0, avgWeight: 0, minWeight: 0, maxWeight: 0, p0Count: 0, totalPieces: 0, uniqueCalibres: [], uniqueErrors: [], uniqueGates: [] },
}

// ── Pipeline desde records crudos (detalle pieza-a-pieza) ────────────────
function computeChartSeriesFromRecords(records: FirestorePieceRecord[]): ChartSeries {
  if (records.length === 0) return EMPTY_CHART_SERIES

  const sorted = [...records].sort((a, b) => a.ts.localeCompare(b.ts))

  // Scatter de pesos
  const wts: Array<[number, number, string]> = []
  let sumW = 0, minW = Infinity, maxW = 0
  for (const r of sorted) {
    let w = r.weightPerPieceGrams
    if ((w == null || w <= 0) && r.weightKg != null && r.weightKg > 0) {
      w = r.pieces === 1 ? r.weightKg * 1000 : (r.weightKg * 1000) / r.pieces
    }
    if (w != null && w > 200 && w < 8000) {
      wts.push([new Date(r.ts).getTime(), Math.round(w), r.calibre ?? '?'])
      sumW += w
      if (w < minW) minW = w
      if (w > maxW) maxW = w
    }
  }

  // Moving average (ventana 50 puntos)
  const wtsForAvg: Array<[number, number]> = wts.map(([ts, w]) => [ts, w])
  const movAvg = computeMovingAvg(wtsForAvg, 50)

  // Errores P0
  const errs: Array<[number, number, string]> = []
  for (const r of sorted) {
    if (r.gate === 0 && r.error) {
      errs.push([new Date(r.ts).getTime(), r.pieces, r.error])
    }
  }

  // P0% ventana móvil (5 min)
  const WINDOW_MS = 5 * 60 * 1000
  const p0Pts: Array<[number, number]> = []
  let windowTotal = 0, windowP0 = 0, left = 0
  for (let right = 0; right < sorted.length; right++) {
    const r = sorted[right]!
    const tsR = new Date(r.ts).getTime()
    windowTotal += r.pieces
    if (r.gate === 0) windowP0 += r.pieces
    while (left < right && tsR - new Date(sorted[left]!.ts).getTime() > WINDOW_MS) {
      windowTotal -= sorted[left]!.pieces
      if (sorted[left]!.gate === 0) windowP0 -= sorted[left]!.pieces
      left++
    }
    if (windowTotal > 0) {
      const pct = Math.min(100, +((windowP0 / windowTotal) * 100).toFixed(2))
      if (right >= 30) p0Pts.push([tsR, pct])
    }
  }

  // Producción: piezas por minuto (buckets 60s)
  const BUCKET_MS = 60_000
  const prodMap = new Map<number, number>()
  for (const r of sorted) {
    const bucket = Math.floor(new Date(r.ts).getTime() / BUCKET_MS) * BUCKET_MS
    prodMap.set(bucket, (prodMap.get(bucket) ?? 0) + r.pieces)
  }
  const prodPts = Array.from(prodMap.entries()).sort((a, b) => a[0] - b[0])

  // Detectar gaps (paradas/colación: >15 min sin datos)
  const GAP_THRESHOLD_MS = 15 * 60 * 1000
  const detectedGaps: Array<{ start: number; end: number; durationMin: number }> = []
  for (let i = 1; i < sorted.length; i++) {
    const prevTs = new Date(sorted[i - 1]!.ts).getTime()
    const currTs = new Date(sorted[i]!.ts).getTime()
    const delta = currTs - prevTs
    if (delta > GAP_THRESHOLD_MS) {
      detectedGaps.push({ start: prevTs, end: currTs, durationMin: Math.round(delta / 60_000) })
    }
  }

  // R21: P0% acumulado del turno (running total)
  const p0CumPts: Array<[number, number]> = []
  let cumTotal = 0, cumP0 = 0
  for (const r of sorted) {
    cumTotal += r.pieces
    if (r.gate === 0) cumP0 += r.pieces
    if (cumTotal > 30) {
      p0CumPts.push([new Date(r.ts).getTime(), +((cumP0 / cumTotal) * 100).toFixed(2)])
    }
  }
  const p0CumDownsampled = p0CumPts.filter((_, i) => i % 100 === 0 || i === p0CumPts.length - 1)

  // R23: Gate distribution over time (buckets 5min)
  const GATE_BUCKET_MS = 5 * 60_000
  const gateByBucket = new Map<number, Map<number, number>>()
  const gateSet = new Set<number>()
  for (const r of sorted) {
    if (r.gate === 0) continue
    gateSet.add(r.gate)
    const bucket = Math.floor(new Date(r.ts).getTime() / GATE_BUCKET_MS) * GATE_BUCKET_MS
    const gMap = gateByBucket.get(bucket) ?? new Map<number, number>()
    gMap.set(r.gate, (gMap.get(r.gate) ?? 0) + r.pieces)
    gateByBucket.set(bucket, gMap)
  }
  const sortedGates = Array.from(gateSet).sort((a, b) => a - b)
  const gateBuckets = Array.from(gateByBucket.keys()).sort((a, b) => a - b)
  const gateTS = sortedGates.map((gate) => ({
    gate,
    data: gateBuckets.map((bucket) => [bucket, gateByBucket.get(bucket)?.get(gate) ?? 0] as [number, number]),
  }))

  // Stats
  const calibreSet = new Set<string>()
  for (const [, , cal] of wts) calibreSet.add(cal)
  const errorSet = new Set<string>()
  for (const [, , err] of errs) errorSet.add(err)

  return {
    weightSeries: wts,
    weightMovingAvg: movAvg,
    p0PctSeries: p0Pts,
    p0CumulativeSeries: p0CumDownsampled,
    errorSeries: errs,
    productionSeries: prodPts,
    gateTimeSeries: gateTS,
    gaps: detectedGaps,
    stats: {
      withWeight: wts.length,
      avgWeight: wts.length > 0 ? Math.round(sumW / wts.length) : 0,
      minWeight: wts.length > 0 ? Math.round(minW) : 0,
      maxWeight: wts.length > 0 ? Math.round(maxW) : 0,
      p0Count: errs.length,
      totalPieces: sorted.reduce((s, r) => s + r.pieces, 0),
      uniqueCalibres: Array.from(calibreSet).sort(),
      uniqueErrors: Array.from(errorSet).sort(),
      uniqueGates: sortedGates,
    },
  }
}

// ── Pipeline desde aggregates pre-computados (buckets por minuto) ────────
function computeChartSeriesFromAggregates(aggregates: TimelineBucket[]): ChartSeries {
  if (aggregates.length === 0) return EMPTY_CHART_SERIES

  const sorted = [...aggregates].sort((a, b) => a.tsMin.localeCompare(b.tsMin))

  // Scatter de pesos: min/p50/max por bucket con dominantCalibre.
  // ~1500 puntos vs ~14k originales, conserva dispersión visible.
  const wts: Array<[number, number, string]> = []
  let sumWeighted = 0
  let totalWeightCount = 0
  let minW = Infinity, maxW = 0
  for (const b of sorted) {
    const tsMs = new Date(b.tsMin).getTime()
    const cal = b.dominantCalibre ?? '?'
    if (b.weightMinGrams != null) {
      wts.push([tsMs, b.weightMinGrams, cal])
      if (b.weightMinGrams < minW) minW = b.weightMinGrams
    }
    if (b.weightP50Grams != null && b.weightP50Grams !== b.weightMinGrams) {
      wts.push([tsMs, b.weightP50Grams, cal])
    }
    if (b.weightMaxGrams != null && b.weightMaxGrams !== b.weightP50Grams) {
      wts.push([tsMs, b.weightMaxGrams, cal])
      if (b.weightMaxGrams > maxW) maxW = b.weightMaxGrams
    }
    if (b.weightP50Grams != null && b.weightCount != null && b.weightCount > 0) {
      sumWeighted += b.weightP50Grams * b.weightCount
      totalWeightCount += b.weightCount
    }
  }

  // Moving avg: ventana 5 buckets (5 min) sobre los p50 por minuto.
  const p50Series: Array<[number, number]> = []
  for (const b of sorted) {
    if (b.weightP50Grams != null) {
      p50Series.push([new Date(b.tsMin).getTime(), b.weightP50Grams])
    }
  }
  const movAvg = computeMovingAvg(p50Series, Math.min(5, p50Series.length))

  // Errores P0 (markLines): un punto por (bucket × tipo error)
  const errs: Array<[number, number, string]> = []
  const errorSet = new Set<string>()
  for (const b of sorted) {
    if (!b.errorCounts) continue
    const tsMs = new Date(b.tsMin).getTime()
    for (const [err, pieces] of Object.entries(b.errorCounts)) {
      errs.push([tsMs, pieces, err])
      errorSet.add(err)
    }
  }

  // P0% ventana móvil (5 buckets = 5 min)
  const p0Pts: Array<[number, number]> = []
  const WINDOW_BUCKETS = 5
  for (let i = 0; i < sorted.length; i++) {
    const start = Math.max(0, i - WINDOW_BUCKETS + 1)
    let total = 0, p0 = 0
    for (let j = start; j <= i; j++) {
      total += sorted[j]!.pieces
      p0 += sorted[j]!.p0Pieces
    }
    if (total > 0 && i >= WINDOW_BUCKETS) {
      const pct = Math.min(100, +((p0 / total) * 100).toFixed(2))
      p0Pts.push([new Date(sorted[i]!.tsMin).getTime(), pct])
    }
  }

  // Producción: bucket.pieces ya ES piezas/minuto
  const prodPts: Array<[number, number]> = sorted.map((b) => [new Date(b.tsMin).getTime(), b.pieces])

  // Gaps: minutos faltantes > 15 min entre buckets consecutivos
  const detectedGaps: Array<{ start: number; end: number; durationMin: number }> = []
  for (let i = 1; i < sorted.length; i++) {
    const prevTs = new Date(sorted[i - 1]!.tsMin).getTime()
    const currTs = new Date(sorted[i]!.tsMin).getTime()
    const deltaMin = (currTs - prevTs) / 60_000
    if (deltaMin > 15) {
      detectedGaps.push({ start: prevTs, end: currTs, durationMin: Math.round(deltaMin) })
    }
  }

  // P0% acumulado del turno
  const p0CumPts: Array<[number, number]> = []
  let cumTotal = 0, cumP0 = 0
  for (const b of sorted) {
    cumTotal += b.pieces
    cumP0 += b.p0Pieces
    if (cumTotal > 30) {
      p0CumPts.push([new Date(b.tsMin).getTime(), +((cumP0 / cumTotal) * 100).toFixed(2)])
    }
  }

  // Gates stacked (buckets 5 min agrupando aggregates)
  const GATE_BUCKET_MS = 5 * 60_000
  const gateByBucket = new Map<number, Map<number, number>>()
  const gateSet = new Set<number>()
  for (const b of sorted) {
    if (!b.gateCounts) continue
    const tsMs = new Date(b.tsMin).getTime()
    const bucket5 = Math.floor(tsMs / GATE_BUCKET_MS) * GATE_BUCKET_MS
    for (const [gateStr, pieces] of Object.entries(b.gateCounts)) {
      const gate = Number(gateStr)
      if (gate === 0) continue
      gateSet.add(gate)
      const gMap = gateByBucket.get(bucket5) ?? new Map<number, number>()
      gMap.set(gate, (gMap.get(gate) ?? 0) + pieces)
      gateByBucket.set(bucket5, gMap)
    }
  }
  const sortedGates = Array.from(gateSet).sort((a, b) => a - b)
  const gateBuckets = Array.from(gateByBucket.keys()).sort((a, b) => a - b)
  const gateTS = sortedGates.map((gate) => ({
    gate,
    data: gateBuckets.map((bucket) => [bucket, gateByBucket.get(bucket)?.get(gate) ?? 0] as [number, number]),
  }))

  // Stats
  const calibreSet = new Set<string>()
  for (const b of sorted) if (b.dominantCalibre) calibreSet.add(b.dominantCalibre)

  let totalPieces = 0
  let totalP0 = 0
  for (const b of sorted) {
    totalPieces += b.pieces
    totalP0 += b.p0Pieces
  }

  return {
    weightSeries: wts,
    weightMovingAvg: movAvg,
    p0PctSeries: p0Pts,
    p0CumulativeSeries: p0CumPts,
    errorSeries: errs,
    productionSeries: prodPts,
    gateTimeSeries: gateTS,
    gaps: detectedGaps,
    stats: {
      withWeight: totalWeightCount,
      avgWeight: totalWeightCount > 0 ? Math.round(sumWeighted / totalWeightCount) : 0,
      minWeight: minW === Infinity ? 0 : Math.round(minW),
      maxWeight: Math.round(maxW),
      p0Count: totalP0,
      totalPieces,
      uniqueCalibres: Array.from(calibreSet).sort(),
      uniqueErrors: Array.from(errorSet).sort(),
      uniqueGates: sortedGates,
    },
  }
}

type LayerKey = 'weights' | 'p0pct' | 'errors' | 'production' | 'gates'

const LAYER_LABELS: Record<LayerKey, string> = {
  weights: 'Pesos (g)',
  p0pct: 'P0% (5 min)',
  errors: 'Errores P0',
  production: 'Pzas/min',
  gates: 'Gates',
}

const LAYER_COLORS: Record<LayerKey, string> = {
  weights: '#3b82f6',
  p0pct: '#ef4444',
  errors: '#f59e0b',
  production: '#10b981',
  gates: '#8b5cf6',
}

const GATE_PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#e11d48']

// ── Moving average ─────────────────────────────────────────────────────────

function computeMovingAvg(data: Array<[number, number]>, windowSize: number): Array<[number, number]> {
  if (data.length < windowSize) return []
  const result: Array<[number, number]> = []
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]![1]
    if (i >= windowSize) sum -= data[i - windowSize]![1]
    if (i >= windowSize - 1) {
      result.push([data[i]![0], Math.round(sum / windowSize)])
    }
  }
  return result
}

// ── Componente ──────────────────────────────────────────────────────────────

export function GraderTimelineChart({ records, aggregates, shiftId, dateKey }: Props) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    weights: true,
    p0pct: true,
    errors: true,
    gates: false,
    production: false,
  })
  const [showLegend, setShowLegend] = useState(false)
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number }>({ start: 0, end: 100 })
  const chartRef = useRef<ReactEChartsCore>(null)
  useEffect(() => () => { try { chartRef.current?.getEchartsInstance()?.dispose() } catch { /* already disposed */ } }, [])

  const toggleLayer = (key: LayerKey) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))

  // Pre-procesar data + stats.
  // Si hay `aggregates` (buckets pre-computados del summary), los usamos para
  // evitar descargar los ~14k registros crudos. Si hay `records` raw, seguimos
  // el pipeline detallado pieza-a-pieza.
  const { weightSeries, weightMovingAvg, p0PctSeries, p0CumulativeSeries, errorSeries, productionSeries, gateTimeSeries, gaps, stats } = useMemo<ChartSeries>(() => {
    if (aggregates && aggregates.length > 0) return computeChartSeriesFromAggregates(aggregates)
    if (records && records.length > 0) return computeChartSeriesFromRecords(records)
    return EMPTY_CHART_SERIES
  }, [records, aggregates])

  // Stats dinámicos según zoom visible
  const visibleStats = useMemo(() => {
    if (weightSeries.length === 0) return null
    const allTs = weightSeries.map(([ts]) => ts)
    const minTs = Math.min(...allTs)
    const maxTs = Math.max(...allTs)
    const rangeMs = maxTs - minTs
    const visStart = minTs + (rangeMs * zoomRange.start / 100)
    const visEnd = minTs + (rangeMs * zoomRange.end / 100)

    const visible = weightSeries.filter(([ts]) => ts >= visStart && ts <= visEnd)
    if (visible.length === 0) return null
    const sum = visible.reduce((s, [, w]) => s + w, 0)
    return {
      count: visible.length,
      avg: Math.round(sum / visible.length),
      spanHours: ((visEnd - visStart) / 3_600_000).toFixed(1),
    }
  }, [weightSeries, zoomRange])

  const handleDataZoom = useCallback((params: any) => {
    if (params.batch?.[0]) {
      setZoomRange({ start: params.batch[0].start ?? 0, end: params.batch[0].end ?? 100 })
    } else if (params.start != null) {
      setZoomRange({ start: params.start, end: params.end })
    }
  }, [])

  const useDualGrid = layers.production || layers.gates

  const option = useMemo<EChartsOption>(() => {
    const series: any[] = []
    const yAxes: any[] = []
    const grids: any[] = []
    const xAxes: any[] = []
    let yIdx = 0

    // ── Grid principal (peso + P0%) ──
    grids.push({
      left: 55, right: 60, top: 30,
      bottom: useDualGrid ? '40%' : 70,
    })
    xAxes.push({
      type: 'time',
      gridIndex: 0,
      axisLabel: {
        formatter: (v: number) => new Date(v).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        fontSize: 10, color: '#64748b',
      },
      axisLine: { lineStyle: { color: 'rgba(100,116,139,0.2)' } },
      splitLine: { show: false },
      axisPointer: { show: true, lineStyle: { color: 'rgba(148,163,184,0.3)', type: 'dashed' } },
    })

    // ── Peso scatter + moving avg + bandas ──
    if (layers.weights && weightSeries.length > 0) {
      yAxes.push({
        type: 'value', name: 'Peso (g)', position: 'left', gridIndex: 0,
        axisLabel: { formatter: '{value}', fontSize: 10, color: '#64748b' },
        nameTextStyle: { fontSize: 10, color: '#64748b', padding: [0, 0, 0, -10] },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.06)' } },
        min: (v: any) => Math.max(0, v.min - 200),
        max: (v: any) => v.max + 200,
      })

      // Bandas de calibre (markArea) con labels al borde derecho
      const markAreaData = CALIBRE_BANDS.map((b) => ([
        {
          yAxis: b.min,
          itemStyle: { color: b.color },
          label: {
            show: true,
            position: 'insideTopRight',
            formatter: b.label,
            fontSize: 9,
            color: 'rgba(148,163,184,0.5)',
            padding: [2, 4],
          },
        },
        { yAxis: b.max },
      ]))

      series.push({
        name: 'Peso pieza',
        type: 'scatter',
        xAxisIndex: 0, yAxisIndex: yIdx,
        symbolSize: 2,
        data: weightSeries.map(([ts, w, cal]) => ({
          value: [ts, w],
          itemStyle: { color: getCalibreColor(cal), opacity: 0.35 },
        })),
        large: true, largeThreshold: 2000,
        emphasis: { itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1 }, scale: 4 },
        markArea: { silent: true, data: markAreaData },
      })

      // Moving average con glow para contraste
      if (weightMovingAvg.length > 0) {
        // Shadow layer (glow effect)
        series.push({
          name: '_shadow',
          type: 'line',
          xAxisIndex: 0, yAxisIndex: yIdx,
          data: weightMovingAvg,
          smooth: true,
          lineStyle: { width: 6, color: 'rgba(0,0,0,0.5)' },
          itemStyle: { color: 'transparent' },
          showSymbol: false,
          z: 4,
          silent: true,
          tooltip: { show: false },
        })
        // Main line
        series.push({
          name: 'Peso promedio',
          type: 'line',
          xAxisIndex: 0, yAxisIndex: yIdx,
          data: weightMovingAvg,
          smooth: true,
          lineStyle: { width: 2.5, color: '#fbbf24', shadowColor: 'rgba(251,191,36,0.4)', shadowBlur: 6 },
          itemStyle: { color: '#fbbf24' },
          showSymbol: false,
          z: 5,
        })
      }
      yIdx++
    }

    // ── P0% ──
    if (layers.p0pct && p0PctSeries.length > 0) {
      yAxes.push({
        type: 'value', name: 'P0%', position: 'right', gridIndex: 0,
        axisLabel: { formatter: (v: number) => `${Math.round(v)}%`, fontSize: 10, color: '#ef4444' },
        nameTextStyle: { fontSize: 10, color: '#ef4444' },
        min: 0, max: (v: any) => Math.ceil(Math.max(v.max * 1.1, 5)),
        splitLine: { show: false },
      })
      series.push({
        name: 'P0% (5min)',
        type: 'line',
        xAxisIndex: 0, yAxisIndex: yIdx,
        data: p0PctSeries,
        smooth: true,
        lineStyle: { width: 2, color: '#ef4444' },
        itemStyle: { color: '#ef4444' },
        showSymbol: false,
        areaStyle: { color: 'rgba(239,68,68,0.05)' },
      })

      // R21: P0% acumulado del turno (dashed, más suave)
      if (p0CumulativeSeries.length > 0) {
        series.push({
          name: 'P0% acum.',
          type: 'line',
          xAxisIndex: 0, yAxisIndex: yIdx,
          data: p0CumulativeSeries,
          smooth: true,
          lineStyle: { width: 1.5, color: '#fb923c', type: 'dashed' as const },
          itemStyle: { color: '#fb923c' },
          showSymbol: false,
        })
      }

      // Target P0% horizontal (2% = ok threshold)
      series.push({
        name: '_target',
        type: 'line',
        xAxisIndex: 0, yAxisIndex: yIdx,
        data: p0PctSeries.length > 0 ? [[p0PctSeries[0]![0], 2], [p0PctSeries[p0PctSeries.length - 1]![0], 2]] : [],
        lineStyle: { width: 1, color: 'rgba(16,185,129,0.4)', type: 'dotted' as const },
        itemStyle: { color: 'transparent' },
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
      })

      yIdx++
    }

    // ── Errores P0 como markLines verticales ──
    if (layers.errors && errorSeries.length > 0) {
      const errMarkLines = errorSeries.map(([ts, , err]) => ({
        xAxis: ts,
        lineStyle: { color: getErrorColor(err), width: 1, type: 'solid' as const, opacity: 0.6 },
        label: { show: false },
      }))

      // Agregar markLine al scatter de peso (o crear serie invisible)
      if (series.length > 0) {
        const targetSeries = series[0]
        targetSeries.markLine = {
          silent: false,
          symbol: 'none',
          data: errMarkLines,
          tooltip: {
            formatter: (params: any) => {
              const ts = params.data.xAxis
              const match = errorSeries.find(([t]) => t === ts)
              const time = new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              return `<b style="color:${params.data.lineStyle.color}">⚠ Error P0</b><br/>⏱ ${time}<br/>${match ? match[2] : '?'} (${match ? match[1] : '?'} pz)`
            },
          },
        }
      }
    }

    // ── Gap markers (paradas/colación) con labels ──
    if (gaps.length > 0 && series.length > 0) {
      const gapAreas = gaps.map((g) => {
        const label = g.durationMin >= 60
          ? `${Math.floor(g.durationMin / 60)}h ${g.durationMin % 60}m`
          : `${g.durationMin}min`
        return [
          {
            xAxis: g.start,
            itemStyle: { color: 'rgba(100,116,139,0.1)' },
            label: {
              show: true,
              position: 'insideTop',
              formatter: `☕ ${label}`,
              fontSize: 9,
              color: 'rgba(148,163,184,0.6)',
              padding: [4, 0],
            },
          },
          { xAxis: g.end },
        ]
      })
      if (!series[0].markArea) series[0].markArea = { silent: true, data: [] }
      series[0].markArea.data.push(...gapAreas)
    }

    // ── Grid inferior: Producción ──
    if (useDualGrid) {
      const lowerLabel = layers.gates ? 'Gates' : 'pz/min'
      const lowerColor = layers.gates ? '#8b5cf6' : '#10b981'
      grids.push({
        left: 55, right: 60,
        top: '66%', bottom: 45,
      })
      xAxes.push({
        type: 'time', gridIndex: 1,
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: 'rgba(100,116,139,0.2)' } },
        splitLine: { show: false },
      })
      yAxes.push({
        type: 'value', name: lowerLabel, position: 'left', gridIndex: 1,
        axisLabel: { fontSize: 9, color: lowerColor },
        nameTextStyle: { fontSize: 9, color: lowerColor },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.06)' } },
      })
      if (layers.production) {
        series.push({
          name: 'Producción/min',
          type: 'line',
          xAxisIndex: 1, yAxisIndex: yIdx,
          data: productionSeries,
          smooth: 0.3,
          lineStyle: { width: 1.5, color: '#10b981' },
          itemStyle: { color: '#10b981' },
          showSymbol: false,
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(16,185,129,0.5)' },
                { offset: 1, color: 'rgba(16,185,129,0.05)' },
              ],
            },
          },
        })
      }

      // R23: Gate distribution as stacked area
      if (layers.gates && gateTimeSeries.length > 0) {
        for (const gts of gateTimeSeries) {
          const color = GATE_PALETTE[(gts.gate - 1) % GATE_PALETTE.length]!
          series.push({
            name: `G${gts.gate}`,
            type: 'line',
            xAxisIndex: 1, yAxisIndex: yIdx,
            data: gts.data,
            stack: 'gates',
            smooth: 0.2,
            lineStyle: { width: 0 },
            itemStyle: { color },
            showSymbol: false,
            areaStyle: { opacity: 0.6 },
            emphasis: { focus: 'series' },
          })
        }
      }
      yIdx++
    }

    if (yAxes.length === 0) {
      yAxes.push({ type: 'value', name: '', position: 'left', gridIndex: 0 })
    }

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(148,163,184,0.15)',
        borderWidth: 1,
        textStyle: { fontSize: 11, color: '#e2e8f0' },
        formatter: (params: any) => {
          const d = new Date(params.value[0])
          const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          const sn = params.seriesName

          if (sn.includes('Peso pieza')) {
            const w = params.value[1]
            const cal = weightSeries.find(([ts]) => ts === params.value[0])?.[2] ?? '?'
            return `<b style="color:${params.color}">● ${cal}</b><br/>⏱ ${time}<br/>⚖ <b>${w.toLocaleString('es-CL')}g</b> (${(w / 453.592).toFixed(1)} lb)`
          }
          if (sn.includes('promedio')) {
            return `<b style="color:#fbbf24">━ Promedio móvil</b><br/>⏱ ${time}<br/>⚖ <b>${params.value[1].toLocaleString('es-CL')}g</b>`
          }
          if (sn.includes('acum')) {
            return `<b style="color:#fb923c">┅ P0% acumulado</b><br/>⏱ ${time}<br/>📊 <b>${params.value[1]}%</b> del turno`
          }
          if (sn.includes('P0%')) {
            return `<b style="color:#ef4444">● P0% instantáneo</b><br/>⏱ ${time}<br/>📊 <b>${params.value[1]}%</b> (ventana 5 min)`
          }
          if (sn.includes('Producción')) {
            return `<b style="color:#10b981">▊ Producción</b><br/>⏱ ${time}<br/>🏭 <b>${params.value[1]}</b> pz/min`
          }
          if (sn.startsWith('G')) {
            return `<b style="color:${params.color}">■ Gate ${sn.slice(1)}</b><br/>⏱ ${time}<br/>📦 <b>${params.value[1]}</b> pz (5 min)`
          }
          if (sn.startsWith('_')) return ''
          return `${sn}: ${params.value[1]}`
        },
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: { backgroundColor: '#1e293b' },
      },
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      series,
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: useDualGrid ? [0, 1] : [0],
          start: zoomRange.start, end: zoomRange.end,
          height: 18, bottom: 6,
          borderColor: 'rgba(148,163,184,0.1)',
          fillerColor: 'rgba(59,130,246,0.1)',
          handleStyle: { color: '#3b82f6', borderColor: '#3b82f6' },
          textStyle: { fontSize: 9, color: '#64748b' },
          dataBackground: {
            lineStyle: { color: 'rgba(59,130,246,0.2)', width: 1 },
            areaStyle: { color: 'rgba(59,130,246,0.03)' },
          },
          selectedDataBackground: {
            lineStyle: { color: '#3b82f6' },
            areaStyle: { color: 'rgba(59,130,246,0.08)' },
          },
        },
        { type: 'inside', xAxisIndex: useDualGrid ? [0, 1] : [0] },
      ],
      legend: { show: false },
      animation: false,
    }
  }, [layers, weightSeries, weightMovingAvg, p0PctSeries, p0CumulativeSeries, errorSeries, productionSeries, gateTimeSeries, gaps, useDualGrid, zoomRange])

  if (stats.totalPieces === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" />
            Timeline segundo a segundo
          </CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            {stats.withWeight > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1">
                ⚖ {stats.avgWeight.toLocaleString('es-CL')}g
              </Badge>
            )}
            {stats.withWeight > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {stats.minWeight.toLocaleString('es-CL')}–{stats.maxWeight.toLocaleString('es-CL')}g
              </Badge>
            )}
            <Badge variant="outline" className={cn('text-[10px]', stats.p0Count > 0 ? 'text-red-400' : '')}>
              {stats.p0Count.toLocaleString('es-CL')} P0
            </Badge>
            {gaps.length > 0 && (
              <Badge variant="outline" className="text-[10px] text-amber-400 gap-0.5">
                <Coffee className="h-2.5 w-2.5" />{gaps.length} pausa{gaps.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Sub-header: registro count + zoom stats */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {stats.totalPieces.toLocaleString('es-CL')} pzs · {shiftId} · {dateKey}
          </p>
          {visibleStats && (zoomRange.start > 0 || zoomRange.end < 100) && (
            <p className="text-[10px] text-sky-400">
              Zoom: {visibleStats.count.toLocaleString('es-CL')} pts · {visibleStats.avg.toLocaleString('es-CL')}g prom · {visibleStats.spanHours}h
            </p>
          )}
        </div>

        {/* Layer toggles */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleLayer(key)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                layers[key]
                  ? 'border-transparent text-white'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted/50',
              )}
              style={layers[key] ? { backgroundColor: LAYER_COLORS[key] } : undefined}
            >
              {LAYER_LABELS[key]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowLegend((v) => !v)}
            className="px-2 py-1 rounded-md text-[10px] font-medium border border-border text-muted-foreground hover:bg-muted/50 ml-auto"
          >
            {showLegend ? 'Ocultar leyenda' : 'Leyenda'}
          </button>
        </div>

        {showLegend && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 pt-2 border-t border-border/30 text-[10px]">
            {layers.weights && stats.uniqueCalibres.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="text-muted-foreground font-semibold">Calibres:</span>
                {stats.uniqueCalibres.map((cal) => (
                  <span key={cal} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCalibreColor(cal) }} />
                    {cal}
                  </span>
                ))}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <span className="w-6 h-[2px] rounded" style={{ backgroundColor: '#fbbf24' }} />prom (50)
                </span>
              </div>
            )}
            {layers.errors && stats.uniqueErrors.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="text-muted-foreground font-semibold">Errores:</span>
                {stats.uniqueErrors.map((err) => (
                  <span key={err} className="flex items-center gap-1">
                    <span className="w-2 h-0.5 rounded" style={{ backgroundColor: getErrorColor(err) }} />
                    {err}
                  </span>
                ))}
              </div>
            )}
            {layers.p0pct && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="text-muted-foreground font-semibold">P0%:</span>
                <span className="flex items-center gap-1"><span className="w-4 h-[2px] rounded" style={{ backgroundColor: '#ef4444' }} />instantáneo (5min)</span>
                <span className="flex items-center gap-1"><span className="w-4 h-[2px] rounded border-b border-dashed" style={{ borderColor: '#fb923c' }} />acumulado turno</span>
                <span className="flex items-center gap-1"><span className="w-4 h-[1px] rounded" style={{ backgroundColor: 'rgba(16,185,129,0.5)', borderTop: '1px dotted rgba(16,185,129,0.5)' }} />target 2%</span>
              </div>
            )}
            {layers.gates && stats.uniqueGates.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="text-muted-foreground font-semibold">Gates:</span>
                {stats.uniqueGates.map((g) => (
                  <span key={g} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: GATE_PALETTE[(g - 1) % GATE_PALETTE.length] }} />
                    G{g}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className={cn('w-full', useDualGrid ? 'h-[420px] lg:h-[520px]' : 'h-[340px] lg:h-[440px]')}>
          <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge
            onEvents={{ datazoom: handleDataZoom }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
