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
 *
 * UX iter 20: ejes Y separados, tooltip enriquecido, leyenda colores,
 *             scatter con opacidad, header con stats.
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
  '0-2': '#94a3b8',
  '1-2': '#94a3b8',
  '2-3': '#3b82f6',
  '2-4': '#3b82f6',
  '3-4': '#10b981',
  '4-5': '#f59e0b',
  '4-6': '#f59e0b',
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

function getCalibreColor(calibre: string): string {
  // Buscar match parcial (ej: "6-8 lb" → "6-8")
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

const LAYER_COLORS: Record<LayerKey, string> = {
  weights: '#3b82f6',
  p0pct: '#ef4444',
  errors: '#f59e0b',
  production: '#10b981',
}

// ── Componente ──────────────────────────────────────────────────────────────

export function GraderTimelineChart({ records, shiftId, dateKey }: Props) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    weights: true,
    p0pct: true,
    errors: true,
    production: false,
  })
  const [showLegend, setShowLegend] = useState(false)

  const toggleLayer = (key: LayerKey) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))

  // Pre-procesar data + stats
  const { weightSeries, p0PctSeries, errorSeries, productionSeries, stats } = useMemo(() => {
    if (records.length === 0) return {
      weightSeries: [], p0PctSeries: [], errorSeries: [], productionSeries: [],
      stats: { withWeight: 0, avgWeight: 0, minWeight: 0, maxWeight: 0, p0Count: 0, uniqueCalibres: [] as string[], uniqueErrors: [] as string[] },
    }

    const sorted = [...records].sort((a, b) => a.ts.localeCompare(b.ts))

    // Scatter de pesos (solo piezas con peso)
    // weightPerPieceGrams puede venir directo del Excel o calculado desde weightKg
    const wts: Array<[number, number, string]> = []
    let sumW = 0
    let minW = Infinity
    let maxW = 0
    for (const r of sorted) {
      let w = r.weightPerPieceGrams
      // Fallback: calcular desde weightKg solo si pieces=1 (peso individual real)
      if ((w == null || w <= 0) && r.weightKg != null && r.weightKg > 0) {
        w = r.pieces === 1 ? r.weightKg * 1000 : (r.weightKg * 1000) / r.pieces
      }
      if (w != null && w > 200 && w < 8000) {  // sanity: salmón 200g–8kg
        wts.push([new Date(r.ts).getTime(), Math.round(w), r.calibre ?? '?'])
        sumW += w
        if (w < minW) minW = w
        if (w > maxW) maxW = w
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

    // Stats para header
    const calibreSet = new Set<string>()
    for (const [, , cal] of wts) calibreSet.add(cal)
    const errorSet = new Set<string>()
    for (const [, , err] of errs) errorSet.add(err)

    return {
      weightSeries: wts,
      p0PctSeries: p0Pts,
      errorSeries: errs,
      productionSeries: prodPts,
      stats: {
        withWeight: wts.length,
        avgWeight: wts.length > 0 ? Math.round(sumW / wts.length) : 0,
        minWeight: wts.length > 0 ? Math.round(minW) : 0,
        maxWeight: wts.length > 0 ? Math.round(maxW) : 0,
        p0Count: errs.length,
        uniqueCalibres: Array.from(calibreSet).sort(),
        uniqueErrors: Array.from(errorSet).sort(),
      },
    }
  }, [records])

  const option = useMemo<EChartsOption>(() => {
    const series: any[] = []
    const yAxes: any[] = []
    let yIdx = 0

    // ── Eje Y izquierdo: siempre Peso (g) cuando weights activo ──
    if (layers.weights && weightSeries.length > 0) {
      yAxes.push({
        type: 'value',
        name: 'Peso (g)',
        position: 'left',
        axisLabel: { formatter: '{value}', fontSize: 10, color: '#94a3b8' },
        nameTextStyle: { fontSize: 10, color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } },
      })
      series.push({
        name: 'Peso pieza',
        type: 'scatter',
        yAxisIndex: yIdx,
        symbolSize: 2.5,
        data: weightSeries.map(([ts, w, cal]) => ({
          value: [ts, w],
          itemStyle: { color: getCalibreColor(cal), opacity: 0.4 },
        })),
        large: true,
        largeThreshold: 2000,
        emphasis: {
          itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1 },
          scale: 3,
        },
      })
      yIdx++
    }

    // ── Eje Y derecho 1: P0% ──
    if (layers.p0pct && p0PctSeries.length > 0) {
      yAxes.push({
        type: 'value',
        name: 'P0%',
        position: 'right',
        axisLabel: { formatter: (v: number) => `${Math.round(v)}%`, fontSize: 10, color: '#ef4444' },
        nameTextStyle: { fontSize: 10, color: '#ef4444' },
        min: 0,
        max: (v: any) => Math.ceil(Math.max(v.max * 1.1, 5)),
        splitLine: { show: false },
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
        areaStyle: { color: 'rgba(239,68,68,0.06)' },
      })
      yIdx++
    }

    // ── Errores P0 como markPoints sobre el eje de pesos o propio ──
    if (layers.errors && errorSeries.length > 0) {
      const errYIdx = layers.weights ? 0 : yIdx
      if (!layers.weights) {
        yAxes.push({
          type: 'value',
          name: 'Piezas',
          position: 'left',
          axisLabel: { fontSize: 10, color: '#94a3b8' },
          nameTextStyle: { fontSize: 10, color: '#94a3b8' },
          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } },
        })
        yIdx++
      }
      series.push({
        name: 'Errores P0',
        type: 'scatter',
        yAxisIndex: errYIdx,
        symbolSize: (val: number[]) => Math.max(4, Math.min(12, (val[1] ?? 1) * 2)),
        data: errorSeries.map(([ts, pcs, err]) => ({
          value: [ts, layers.weights ? stats.avgWeight : pcs],
          itemStyle: { color: getErrorColor(err), opacity: 0.85, borderColor: '#fff', borderWidth: 0.5 },
          _error: err,
          _pieces: pcs,
        })),
        z: 10,
      })
    }

    // ── Eje Y derecho 2: Producción ──
    if (layers.production && productionSeries.length > 0) {
      yAxes.push({
        type: 'value',
        name: 'Pzas/min',
        position: 'right',
        offset: layers.p0pct ? 55 : 0,
        axisLabel: { fontSize: 10, color: '#10b981' },
        nameTextStyle: { fontSize: 10, color: '#10b981' },
        splitLine: { show: false },
      })
      series.push({
        name: 'Producción/min',
        type: 'line',
        yAxisIndex: yIdx,
        data: productionSeries,
        smooth: true,
        lineStyle: { width: 1.5, color: '#10b981' },
        itemStyle: { color: '#10b981' },
        showSymbol: false,
        areaStyle: { color: 'rgba(16,185,129,0.06)' },
      })
      yIdx++
    }

    if (yAxes.length === 0) {
      yAxes.push({ type: 'value', name: '', position: 'left' })
    }

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(148,163,184,0.2)',
        textStyle: { fontSize: 11, color: '#e2e8f0' },
        formatter: (params: any) => {
          const d = new Date(params.value[0])
          const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          const sn = params.seriesName

          if (sn.includes('Peso')) {
            const w = params.value[1]
            const cal = weightSeries.find(([ts]) => ts === params.value[0])?.[2] ?? '?'
            return `<b style="color:${params.color}">● ${cal}</b><br/>` +
              `⏱ ${time}<br/>` +
              `⚖ <b>${Math.round(w).toLocaleString('es-CL')}g</b> (${(w / 453.592).toFixed(1)} lb)`
          }
          if (sn.includes('P0%')) {
            return `<b style="color:#ef4444">● P0%</b><br/>` +
              `⏱ ${time}<br/>` +
              `📊 <b>${params.value[1]}%</b> (ventana 5 min)`
          }
          if (sn.includes('Error')) {
            const err = params.data._error ?? '?'
            const pcs = params.data._pieces ?? params.value[1]
            return `<b style="color:${params.color}">● Error P0</b><br/>` +
              `⏱ ${time}<br/>` +
              `⚠ <b>${err}</b><br/>` +
              `📦 ${pcs} pz`
          }
          if (sn.includes('Producción')) {
            return `<b style="color:#10b981">● Producción</b><br/>` +
              `⏱ ${time}<br/>` +
              `🏭 <b>${params.value[1]}</b> pz/min`
          }
          return `${sn}: ${params.value[1]}`
        },
      },
      grid: { left: 55, right: layers.p0pct && layers.production ? 120 : 60, top: 35, bottom: 75 },
      xAxis: {
        type: 'time',
        axisLabel: {
          formatter: (v: number) => new Date(v).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
          fontSize: 10,
          color: '#94a3b8',
        },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.05)' } },
      },
      yAxis: yAxes,
      series,
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          height: 20,
          bottom: 8,
          borderColor: 'rgba(148,163,184,0.15)',
          fillerColor: 'rgba(59,130,246,0.12)',
          handleStyle: { color: '#3b82f6', borderColor: '#3b82f6' },
          textStyle: { fontSize: 9, color: '#94a3b8' },
          dataBackground: {
            lineStyle: { color: 'rgba(59,130,246,0.3)' },
            areaStyle: { color: 'rgba(59,130,246,0.05)' },
          },
        },
        { type: 'inside', xAxisIndex: 0 },
      ],
      legend: { show: false },
      animation: false,
    }
  }, [layers, weightSeries, p0PctSeries, errorSeries, productionSeries, stats.avgWeight])

  if (records.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" />
            Timeline segundo a segundo
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {stats.withWeight > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1">
                ⚖ {stats.avgWeight.toLocaleString('es-CL')}g prom
              </Badge>
            )}
            {stats.withWeight > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1">
                {stats.minWeight.toLocaleString('es-CL')}–{stats.maxWeight.toLocaleString('es-CL')}g
              </Badge>
            )}
            <Badge variant="outline" className={cn('text-[10px]', stats.p0Count > 0 ? 'text-red-400' : '')}>
              {stats.p0Count.toLocaleString('es-CL')} P0
            </Badge>
          </div>
        </div>
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
            {showLegend ? 'Ocultar leyenda' : 'Leyenda colores'}
          </button>
        </div>
        {showLegend && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-border/50">
            {layers.weights && stats.uniqueCalibres.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">Calibres:</span>
                {stats.uniqueCalibres.map((cal) => (
                  <span key={cal} className="flex items-center gap-1 text-[10px]">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: getCalibreColor(cal) }} />
                    {cal}
                  </span>
                ))}
              </div>
            )}
            {layers.errors && stats.uniqueErrors.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">Errores:</span>
                {stats.uniqueErrors.map((err) => (
                  <span key={err} className="flex items-center gap-1 text-[10px]">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: getErrorColor(err) }} />
                    {err}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[340px] lg:h-[440px]">
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
