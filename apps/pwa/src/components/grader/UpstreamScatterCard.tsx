/**
 * UpstreamScatterCard — Scatter plot: ritmo Baader vs P0% Grader.
 *
 * Muestra la correlación entre la producción de cada Evisceradora (ciclos cada
 * 5 min) y el P0% del Grader en el mismo período. Un punto = un intervalo de
 * 5 min con datos de ambos sistemas.
 *
 * - 3 series (E1, E2, E3) con colores distintos
 * - Línea de tendencia (regresión lineal) + R² en leyenda
 * - Tooltip con hora, ciclos Baader, P0% Grader, piezas
 * - Solo se muestra cuando hay ≥ 10 puntos con datos en al menos 1 serie
 *
 * Fase 3 iter 3 — Shoplogix Integration.
 */

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent } from '@/components/ui'
import { ScatterChart } from 'lucide-react'
import type { TimelineBucket } from '@/services/grader/types'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import { buildScatterData } from './shiftTimelineHelpers'

interface Props {
  snapshot: UpstreamLineSnapshot | null | undefined
  timelineBuckets: TimelineBucket[]
}

// Colores por máquina (consistentes con UpstreamMachinesPanel)
const MACHINE_COLORS = [
  'rgba(52, 211, 153, 0.85)',   // emerald-400  — Evisceradora 1
  'rgba(96, 165, 250, 0.85)',   // blue-400     — Evisceradora 2
  'rgba(251, 191, 36, 0.85)',   // amber-400    — Evisceradora 3
]
const TREND_COLORS = [
  '#34d399',   // emerald
  '#60a5fa',   // blue
  '#fbbf24',   // amber
]

function fmtHHmm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}


export function UpstreamScatterCard({ snapshot, timelineBuckets }: Props) {
  const seriesData = useMemo(() => {
    if (!snapshot) return []
    return buildScatterData(snapshot, timelineBuckets)
  }, [snapshot, timelineBuckets])

  // No renderizar si no hay datos suficientes
  const totalPoints = seriesData.reduce((a, s) => a + s.points.length, 0)
  if (!snapshot || totalPoints < 10) return null

  const option = useMemo(() => {
    const series: object[] = []

    seriesData.forEach((s, idx) => {
      const color = MACHINE_COLORS[idx % MACHINE_COLORS.length]!
      const trendColor = TREND_COLORS[idx % TREND_COLORS.length]!

      // Scatter points — [baaderCycles, graderP0Pct*100, tsMs, graderPieces]
      const scatterData = s.points.map(p => ({
        value: [p.baaderCycles, p.graderP0Pct * 100, p.tsMs, p.graderPieces],
      }))

      series.push({
        name: s.machineName,
        type: 'scatter',
        data: scatterData,
        symbolSize: (val: number[]) => {
          // Tamaño proporcional a piezas (confianza del punto), 4-12px
          const piezas = val[3] ?? 0
          return Math.max(4, Math.min(12, 4 + piezas / 20))
        },
        itemStyle: {
          color,
          opacity: 0.75,
        },
        emphasis: {
          itemStyle: { opacity: 1 },
        },
      })

      // Línea de tendencia (regresión lineal)
      if (s.regression) {
        const { slope, intercept, r2 } = s.regression
        // Calcular rango X de los puntos con datos (excluir zeros)
        const usable = s.points.filter(p => p.baaderCycles > 0 && p.graderPieces >= 5)
        if (usable.length >= 3) {
          const xMin = Math.min(...usable.map(p => p.baaderCycles))
          const xMax = Math.max(...usable.map(p => p.baaderCycles))
          const yMin = slope * xMin + intercept
          const yMax = slope * xMax + intercept
          const r2Label = r2 >= 0.05 ? ` R²=${r2.toFixed(2)}` : ''
          series.push({
            name: `Tendencia ${s.machineName.replace('Evisceradora ', 'E')}${r2Label}`,
            type: 'line',
            data: [[xMin, yMin], [xMax, yMax]],
            lineStyle: { color: trendColor, type: 'dashed', width: 1.5, opacity: 0.7 },
            symbol: 'none',
            smooth: false,
            itemStyle: { color: trendColor },
          })
        }
      }
    })

    return {
      backgroundColor: 'transparent',
      grid: { left: 40, right: 16, top: 8, bottom: 30, containLabel: false },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontSize: 11 },
        formatter: (params: any) => {
          if (params.seriesType !== 'scatter') return ''
          const [cycles, p0pct, tsMs, pieces] = params.value as [number, number, number, number]
          return [
            `<b>${fmtHHmm(tsMs)}</b>`,
            `${params.seriesName}`,
            `Ciclos Baader: <b>${cycles}</b>`,
            `P0% Grader: <b>${p0pct.toFixed(1)}%</b>`,
            `Piezas Grader: ${pieces}`,
          ].join('<br/>')
        },
      },
      legend: {
        show: true,
        bottom: 0,
        textStyle: { color: '#64748b', fontSize: 9 },
        itemWidth: 12, itemHeight: 8,
      },
      xAxis: {
        type: 'value',
        name: 'Ciclos Baader / 5 min',
        nameLocation: 'end',
        nameTextStyle: { color: '#64748b', fontSize: 8 },
        axisLine: { lineStyle: { color: '#1e293b' } },
        axisTick: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b', fontSize: 9 },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        min: 0,
      },
      yAxis: {
        type: 'value',
        name: 'P0% Grader',
        nameLocation: 'end',
        nameTextStyle: { color: '#64748b', fontSize: 8 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#64748b',
          fontSize: 9,
          formatter: (v: number) => `${v.toFixed(1)}%`,
        },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        min: 0,
      },
      series,
    }
  }, [seriesData])

  // Resumen estadístico rápido
  const stats = useMemo(() => {
    return seriesData.map(s => {
      const usable = s.points.filter(p => p.baaderCycles > 0 && p.graderPieces >= 5)
      return {
        name: s.machineName.replace('Evisceradora', 'E'),
        pts: usable.length,
        r2:  s.regression?.r2 ?? null,
        slope: s.regression?.slope ?? null,
      }
    }).filter(s => s.pts >= 3)
  }, [seriesData])

  return (
    <Card className="border-slate-800 bg-slate-950/50">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <ScatterChart className="w-4 h-4 text-violet-400" />
            <span className="font-medium text-sm">Correlación Baader → P0%</span>
          </div>
          {/* Stats por máquina: R² y signo de pendiente */}
          <div className="flex items-center gap-3">
            {stats.map((s, idx) => {
              const trendColor = TREND_COLORS[idx % TREND_COLORS.length]!
              const slopeSign = s.slope == null ? '—'
                : s.slope > 0.01  ? '↗ positiva'
                : s.slope < -0.01 ? '↘ negativa'
                : '→ nula'
              return (
                <span
                  key={s.name}
                  className="text-[10px] tabular-nums flex items-center gap-1"
                  style={{ color: trendColor }}
                  title={`${s.name}: ${s.pts} puntos, R²=${s.r2?.toFixed(2) ?? '—'}, tendencia ${slopeSign}`}
                >
                  {s.name}
                  {s.r2 != null && ` R²${s.r2.toFixed(2)}`}
                </span>
              )
            })}
          </div>
        </div>

        <div className="text-[10px] text-slate-500 mb-2">
          Cada punto = intervalo de 5 min. X = ciclos Baader, Y = P0% Grader en el mismo período.
          Tendencia {stats.find(s => s.slope != null && s.slope < -0.01)
            ? '↘ negativa — más producción Baader correlaciona con menor P0% Grader'
            : stats.find(s => s.slope != null && s.slope > 0.01)
            ? '↗ positiva — más producción Baader correlaciona con mayor P0% Grader'
            : '→ sin tendencia clara'}
        </div>

        <ReactECharts
          option={option}
          style={{ width: '100%', height: 220 }}
          opts={{ renderer: 'canvas' }}
          notMerge={true}
        />
      </CardContent>
    </Card>
  )
}
