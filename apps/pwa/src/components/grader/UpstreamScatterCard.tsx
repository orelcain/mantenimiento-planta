/**
 * UpstreamScatterCard — Scatter plot: ritmo Baader vs P0% Grader.
 *
 * Cada punto = intervalo de 5 min con datos de ambos sistemas.
 * Lo que el operador debe ver de un vistazo:
 *
 *   1. **¿Cuánto del turno fue malo?** → KPI "Zona crítica: N de M min (X%)"
 *      Define malo = P0% > 3.5% (umbral crítico) Y ritmo Baader < mediana del turno.
 *
 *   2. **¿Hay relación causal?** → narrativa "↘ negativa — más Baader, menos P0%"
 *      + magnitud legible: "cada -10 ciclos/5min → +N puntos P0%".
 *
 *   3. **Líneas de referencia visibles**:
 *      - Horizontal en P0%=3.5% (rojo)  — frontera crítica del Grader
 *      - Vertical en mediana de ciclos Baader (slate) — ritmo típico del turno
 *      Cuadrante inferior-derecho (P0 alto + Baader lento) tinte rojo tenue.
 *
 *   4. **Tamaño del punto = piezas Grader** (confianza del minuto). Documentado.
 *
 * Solo se muestra cuando hay ≥ 10 puntos con datos en al menos 1 serie.
 *
 * Fase 3 iter 3 — Shoplogix Integration. Iter 3.1 — accionabilidad (2026-04-25).
 */

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent } from '@/components/ui'
import { ScatterChart, AlertTriangle, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { TimelineBucket } from '@/services/grader/types'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import {
  buildScatterData,
  scatterBaaderMedian,
  scatterCriticalZone,
  scatterSlopeMagnitude,
  usableScatterPoints,
} from './shiftTimelineHelpers'
import { DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import { fmtTime } from '@/services/grader/graderTimeFormat'

interface Props {
  snapshot: UpstreamLineSnapshot | null | undefined
  timelineBuckets: TimelineBucket[]
  /**
   * Umbral crítico de P0% (en puntos %, ej. 3.5).
   * Si no se provee, usa el default `DEFAULT_P0_CRITICAL_PCT`. La página padre
   * debe pasar el valor configurado por el usuario en `system/graderConfig`
   * para que el scatter respete la misma frontera que el resto del módulo.
   */
  criticalThreshold?: number
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



export function UpstreamScatterCard({
  snapshot,
  timelineBuckets,
  criticalThreshold = DEFAULT_P0_CRITICAL_PCT,
}: Props) {
  const seriesData = useMemo(() => {
    if (!snapshot) return []
    return buildScatterData(snapshot, timelineBuckets)
  }, [snapshot, timelineBuckets])

  // No renderizar si no hay datos suficientes — early return DESPUÉS de todos los hooks
  const totalPoints = seriesData.reduce((a, s) => a + s.points.length, 0)

  // ── Analytics extraídos a funciones puras (testables) ──────────────────────
  const baaderMedian = useMemo(() => scatterBaaderMedian(seriesData), [seriesData])
  const criticalKpi  = useMemo(() => scatterCriticalZone(seriesData, criticalThreshold, baaderMedian), [seriesData, criticalThreshold, baaderMedian])

  const option = useMemo(() => {
    const series: object[] = []

    // ── Capa de fondo: zona crítica (cuadrante inferior-derecho invertido) ───
    // En ECharts y va de 0 hacia arriba — "P0% alto" significa Y > 3.5
    // y "Baader lento" significa X < median. Por eso markArea va:
    //   - X: [0, baaderMedian]
    //   - Y: [criticalThreshold, ∞]
    // markArea + markLine se asocian a una serie "fantasma" sin datos visibles.
    if (baaderMedian > 0) {
      series.push({
        name: '__zona_critica__',
        type: 'scatter',
        data: [],
        silent: true,
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(220, 38, 38, 0.06)' },  // red-600 muy tenue
          data: [[
            { coord: [0, criticalThreshold], name: 'Zona crítica' },
            { coord: [baaderMedian, 'max'] },
          ]],
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          data: [
            // Horizontal: P0%=3.5 (umbral crítico) — rojo dashed
            {
              yAxis: criticalThreshold,
              lineStyle: { color: 'rgba(220, 38, 38, 0.45)', type: 'dashed', width: 1 },
              label: {
                show: true,
                position: 'insideEndTop',
                formatter: `Crítico ${criticalThreshold}%`,
                color: 'rgba(220, 38, 38, 0.7)',
                fontSize: 9,
              },
            },
            // Vertical: mediana del ritmo Baader — slate dotted
            {
              xAxis: baaderMedian,
              lineStyle: { color: 'rgba(148, 163, 184, 0.45)', type: 'dotted', width: 1 },
              label: {
                show: true,
                position: 'insideEndBottom',
                formatter: `Mediana ${Math.round(baaderMedian)}`,
                color: 'rgba(148, 163, 184, 0.7)',
                fontSize: 9,
              },
            },
          ],
        },
        legendHoverLink: false,
        // No aparece en leyenda
        z: 0,
      })
    }

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
            `<b>${fmtTime(tsMs)}</b>`,
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
        // Ocultar la serie fantasma "__zona_critica__" del legend
        data: series
          .map((s: any) => s.name)
          .filter((n: string) => n !== '__zona_critica__'),
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
  }, [seriesData, baaderMedian, criticalThreshold])

  // Resumen estadístico rápido (R² + slope) — secundario al KPI accionable.
  const stats = useMemo(() => {
    return seriesData.map(s => {
      const usable = usableScatterPoints(s.points)
      return {
        name: s.machineName.replace('Evisceradora', 'E'),
        pts: usable.length,
        r2:  s.regression?.r2 ?? null,
        slope: s.regression?.slope ?? null,
      }
    }).filter(s => s.pts >= 3)
  }, [seriesData])

  // Pendiente con magnitud operacional ("cada -10 ciclos → ±N pts P0%")
  const slopeMagnitude = useMemo(() => scatterSlopeMagnitude(seriesData), [seriesData])

  // Early return post-hooks: no renderizar si no hay datos suficientes
  if (!snapshot || totalPoints < 10) return null

  // Color del KPI zona crítica según severidad
  const criticalColor =
    criticalKpi.pct >= 20 ? 'text-cat-5-ink'
    : criticalKpi.pct >= 10 ? 'text-amber-400'
    : 'text-emerald-400'

  // Narrativa direccional con magnitud operacional
  const trendNarrative = slopeMagnitude == null
    ? null
    : slopeMagnitude.direction === 'neg'
      ? {
          icon: <TrendingDown className="w-3 h-3" />,
          text: `Cada -10 ciclos/5min Baader → +${slopeMagnitude.deltaP0_per_minus10cycles.toFixed(2)} pts P0%`,
          color: 'text-cat-5-ink',
          tone: 'Más Baader → menos P0%. Confirma que ritmo upstream impacta calidad.',
        }
      : slopeMagnitude.direction === 'pos'
      ? {
          icon: <TrendingUp className="w-3 h-3" />,
          text: `Cada -10 ciclos/5min Baader → ${slopeMagnitude.deltaP0_per_minus10cycles.toFixed(2)} pts P0%`,
          color: 'text-amber-400',
          tone: 'P0% sube cuando Baader sube. Anti-intuitivo — investigar.',
        }
      : {
          icon: <Minus className="w-3 h-3" />,
          text: 'Sin tendencia significativa',
          color: 'text-slate-400',
          tone: 'P0% del Grader no se explica por el ritmo Baader en este turno.',
        }

  return (
    <Card className="border-border bg-card dark:border-slate-800 dark:bg-muted-foreground/[0.10]">
      <CardContent className="py-3 px-4">
        {/* Header: ícono + título + KPI accionable de zona crítica */}
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ScatterChart className="w-4 h-4 text-cat-6-ink" />
            <span className="font-medium text-sm">Correlación Baader → P0%</span>
          </div>

          {/* KPI accionable: zona crítica (lo que el operador debe ver primero) */}
          {criticalKpi.total > 0 && (
            <div
              className={`flex items-center gap-1.5 text-xs tabular-nums ${criticalColor}`}
              title={`Zona crítica = P0% > ${criticalThreshold}% (umbral) Y ritmo Baader < mediana del turno (${Math.round(baaderMedian)} ciclos/5min). Cuadrante inferior-derecho del scatter.`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="font-semibold">
                Zona crítica: {criticalKpi.critical} de {criticalKpi.total} min
                <span className="ml-1 opacity-80">({criticalKpi.pct.toFixed(1)}%)</span>
              </span>
            </div>
          )}
        </div>

        {/* Sub-header: tendencia con magnitud operacional + tono narrativo */}
        {trendNarrative && (
          <div className={`flex items-center gap-1.5 text-caption mb-1 ${trendNarrative.color}`}>
            {trendNarrative.icon}
            <span className="font-medium tabular-nums">{trendNarrative.text}</span>
            <span className="text-slate-500">— {trendNarrative.tone}</span>
          </div>
        )}

        {/* Nota explicativa pequeña */}
        <div className="text-caption text-slate-500 mb-2">
          Punto = 5 min · X = ciclos Baader · Y = P0% Grader · tamaño = piezas Grader (confianza).
          {' '}Líneas: <span className="text-cat-5-ink">P0% crítico {criticalThreshold}%</span>
          {' · '}<span className="text-slate-400">mediana ritmo {Math.round(baaderMedian)} ciclos</span>.
        </div>

        {/* Stats por máquina (R² ahora secundario, en línea sutil) */}
        {stats.length > 0 && (
          <div className="flex items-center gap-3 mb-2">
            {stats.map((s, idx) => {
              const trendColor = TREND_COLORS[idx % TREND_COLORS.length]!
              return (
                <span
                  key={s.name}
                  className="text-caption tabular-nums opacity-70"
                  style={{ color: trendColor }}
                  title={`${s.name}: ${s.pts} puntos, R²=${s.r2?.toFixed(2) ?? '—'}, slope=${s.slope?.toFixed(4) ?? '—'}`}
                >
                  {s.name} {s.r2 != null ? `R²${s.r2.toFixed(2)}` : '—'}
                </span>
              )
            })}
          </div>
        )}

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
