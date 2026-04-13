/**
 * Gráfico segundo a segundo del turno con ECharts.
 *
 * 4 capas toggleables:
 *  1. Pesos (scatter) — cada pieza con su peso en gramos, coloreado por calibre
 *  2. P0% ventana móvil (line) — calculado en ventana de N minutos
 *  3. Tipos error P0 (scatter) — solo gate=0, color por tipo de error
 *  4. Producción (area) — piezas/minuto suavizado
 *
 * Zoom: dataZoom nativo de ECharts (turno completo → hora → minuto → segundo)
 */
import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'

// ── Paleta ──────────────────────────────────────────────────────────────────

const CALIBRE_COLORS: Record<string, string> = {
  '1-2': '#3b82f6',
  '2-3': '#10b981',
  '3-4': '#f59e0b',
  '4-5': '#ef4444',
  '5-6': '#8b5cf6',
  '6-8': '#ec4899',
}
const DEFAULT_CALIBRE_COLOR = '#6b7280'

const ERROR_COLORS: Record<string, string> = {
  'Fuera de rango': '#ef4444',
  'Fuera de límites': '#f59e0b',
  'No leído por fotocélula': '#8b5cf6',
  'Too close or too long': '#3b82f6',
  'Puerta no preparada': '#10b981',
}
const DEFAULT_ERROR_COLOR = '#6b7280'

// ── Tipos ───────────────────────────────────────────────────────────────────

interface Props {
  records: FirestorePieceRecord[]
  shiftId: string
  dateKey: string
}

type LayerKey = 'weights' | 'p0pct' | 'errors' | 'production'

const LAYER_LABELS: Record<LayerKey, string> = {
  weights: 'Pesos (g)',
  p0pct: 'P0% (5 min)',
  errors: 'Errores P0',
  production: 'Pzas/min',
}

// ── Componente ──────────────────────────────────────────────────────────────

export function GraderTimelineChart({ records, shiftId, dateKey }: Props) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    weights: true,
    p0pct: true,
    errors: true,
    production: false,
  })

  const toggleLayer = (key: LayerKey) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))

  // Pre-procesar data
  const { weightSeries, p0PctSeries, errorSeries, productionSeries } = useMemo(() => {
    if (records.length === 0) return { weightSeries: [], p0PctSeries: [], errorSeries: [], productionSeries: [] }

    const sorted = [...records].sort((a, b) => a.ts.localeCompare(b.ts))

    // Scatter de pesos (solo piezas con peso)
    const wts: Array<[number, number, string]> = []
    for (const r of sorted) {
      if (r.weightPerPieceGrams != null && r.weightPerPieceGrams > 0) {
        wts.push([new Date(r.ts).getTime(), r.weightPerPieceGrams, r.calibre ?? '?'])
      }
    }

    // Scatter de errores P0 (solo gate=0 con error)
    const errs: Array<[number, number, string]> = []
    for (const r of sorted) {
      if (r.gate === 0 && r.error) {
        errs.push([new Date(r.ts).getTime(), r.pieces, r.error])
      }
    }

    // P0% ventana móvil (5 min = 300000 ms)
    const WINDOW_MS = 5 * 60 * 1000
    const p0Pts: Array<[number, number]> = []
    let windowTotal = 0
    let windowP0 = 0
    let left = 0
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
        p0Pts.push([tsR, +((windowP0 / windowTotal) * 100).toFixed(2)])
      }
    }

    // Producción: piezas por minuto (buckets de 60s)
    const BUCKET_MS = 60_000
    const prodMap = new Map<number, number>()
    for (const r of sorted) {
      const bucket = Math.floor(new Date(r.ts).getTime() / BUCKET_MS) * BUCKET_MS
      prodMap.set(bucket, (prodMap.get(bucket) ?? 0) + r.pieces)
    }
    const prodPts = Array.from(prodMap.entries()).sort((a, b) => a[0] - b[0])

    return {
      weightSeries: wts,
      p0PctSeries: p0Pts,
      errorSeries: errs,
      productionSeries: prodPts,
    }
  }, [records])

  const option = useMemo<EChartsOption>(() => {
    const series: any[] = []
    const yAxes: any[] = []
    let yIdx = 0

    if (layers.weights && weightSeries.length > 0) {
      yAxes.push({
        type: 'value',
        name: 'Peso (g)',
        position: 'left',
        axisLabel: { formatter: '{value}g' },
      })
      series.push({
        name: 'Peso pieza',
        type: 'scatter',
        yAxisIndex: yIdx,
        symbolSize: 3,
        data: weightSeries.map(([ts, w, cal]) => ({
          value: [ts, w],
          itemStyle: { color: CALIBRE_COLORS[cal] ?? DEFAULT_CALIBRE_COLOR },
        })),
        large: true,
        largeThreshold: 2000,
      })
      yIdx++
    }

    if (layers.p0pct && p0PctSeries.length > 0) {
      yAxes.push({
        type: 'value',
        name: 'P0%',
        position: yIdx === 0 ? 'left' : 'right',
        axisLabel: { formatter: '{value}%' },
        min: 0,
      })
      series.push({
        name: 'P0% (5min)',
        type: 'line',
        yAxisIndex: yIdx,
        data: p0PctSeries,
        smooth: true,
        lineStyle: { width: 2, color: '#ef4444' },
        itemStyle: { color: '#ef4444' },
        showSymbol: false,
        areaStyle: { color: 'rgba(239,68,68,0.08)' },
      })
      yIdx++
    }

    if (layers.errors && errorSeries.length > 0) {
      if (yIdx === 0) {
        yAxes.push({ type: 'value', name: 'Piezas', position: 'left' })
      }
      const errorYIdx = 0
      series.push({
        name: 'Errores P0',
        type: 'scatter',
        yAxisIndex: errorYIdx,
        symbolSize: 6,
        data: errorSeries.map(([ts, pcs, err]) => ({
          value: [ts, pcs],
          itemStyle: { color: ERROR_COLORS[err] ?? DEFAULT_ERROR_COLOR },
        })),
      })
    }

    if (layers.production && productionSeries.length > 0) {
      yAxes.push({
        type: 'value',
        name: 'Pzas/min',
        position: yIdx === 0 ? 'left' : 'right',
        offset: yIdx > 1 ? 60 : 0,
      })
      series.push({
        name: 'Producción/min',
        type: 'line',
        yAxisIndex: yIdx,
        data: productionSeries,
        smooth: true,
        lineStyle: { width: 1.5, color: '#3b82f6' },
        itemStyle: { color: '#3b82f6' },
        showSymbol: false,
        areaStyle: { color: 'rgba(59,130,246,0.08)' },
      })
      yIdx++
    }

    if (yAxes.length === 0) {
      yAxes.push({ type: 'value', name: '', position: 'left' })
    }

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const d = new Date(params.value[0])
          const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          return `<b>${params.seriesName}</b><br/>${time}<br/>${params.value[1]}${params.seriesName.includes('P0') ? '%' : params.seriesName.includes('Peso') ? 'g' : ' pz'}`
        },
      },
      grid: { left: 60, right: 60, top: 40, bottom: 80 },
      xAxis: {
        type: 'time',
        axisLabel: {
          formatter: (v: number) => new Date(v).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        },
      },
      yAxis: yAxes,
      series,
      dataZoom: [
        { type: 'slider', xAxisIndex: 0, start: 0, end: 100, height: 24, bottom: 10 },
        { type: 'inside', xAxisIndex: 0 },
      ],
      legend: {
        show: false,
      },
    }
  }, [layers, weightSeries, p0PctSeries, errorSeries, productionSeries])

  if (records.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-purple-500" />
          Timeline segundo a segundo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {records.length.toLocaleString('es-CL')} registros · {shiftId} · {dateKey} · Scroll para zoom, arrastra para panear
        </p>
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleLayer(key)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                layers[key]
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted/50',
              )}
            >
              {LAYER_LABELS[key]}
            </button>
          ))}
          <Badge variant="outline" className="text-[10px] ml-auto">
            {records.filter((r) => r.gate === 0).length.toLocaleString('es-CL')} P0
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] lg:h-[420px]">
          <ReactECharts
            option={option}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge
          />
        </div>
      </CardContent>
    </Card>
  )
}
