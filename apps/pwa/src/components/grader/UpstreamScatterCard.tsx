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
import { useTheme } from '@/hooks/useTheme'
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
  scatterYMax,
  usableScatterPoints,
} from './shiftTimelineHelpers'
import { DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import { shortMachineName } from '@/services/grader/graderMachineNames'

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
/**
 * Una paleta por tema. Hasta el 10-09 los colores estaban fijos en el tono
 * oscuro (emerald-400, blue-400, amber-400 al 85 %) y en tema claro los puntos
 * casi desaparecían sobre el fondo blanco; la grilla y los ejes iban en
 * `#1e293b` / `#64748b`, pensados para fondo oscuro. Los tonos claros son los
 * mismos matices dos pasos más oscuros, que es lo que les da contraste sobre
 * blanco sin cambiar la identidad de cada máquina.
 */
const MACHINE_COLORS_BY_THEME = {
  dark: [
    'rgba(52, 211, 153, 0.85)',   // emerald-400
    'rgba(96, 165, 250, 0.85)',   // blue-400
    'rgba(251, 191, 36, 0.85)',   // amber-400
  ],
  light: [
    'rgba(4, 120, 87, 0.85)',     // emerald-700
    'rgba(29, 78, 216, 0.85)',    // blue-700
    'rgba(180, 83, 9, 0.85)',     // amber-700
  ],
} as const
const TREND_COLORS_BY_THEME = {
  dark: ['#34d399', '#60a5fa', '#fbbf24'],
  light: ['#047857', '#1d4ed8', '#b45309'],
} as const
/** Ejes, grilla y tooltip — mismos valores que usa la tarjeta de pureza. */
const CHART_SKIN = {
  light: { axis: '#41566a', grid: '#c3d7e9', tipBg: '#ffffff', tipText: '#16242f', tipBorder: '#c3d7e9' },
  dark:  { axis: '#94a3b8', grid: '#22384a', tipBg: '#1e293b', tipText: '#e2e8f0', tipBorder: '#334155' },
} as const



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
  const ejeY = useMemo(() => scatterYMax(seriesData, criticalThreshold), [seriesData, criticalThreshold])
  const { isDark } = useTheme()
  const skin = isDark ? CHART_SKIN.dark : CHART_SKIN.light
  const MACHINE_COLORS = isDark ? MACHINE_COLORS_BY_THEME.dark : MACHINE_COLORS_BY_THEME.light
  const TREND_COLORS = isDark ? TREND_COLORS_BY_THEME.dark : TREND_COLORS_BY_THEME.light

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
          // Sin rótulo: iba pegado al borde superior del área y el grid lo
          // recortaba contra el techo del gráfico. Las dos líneas punteadas ya
          // dicen dónde empieza la zona, y la nota de abajo las nombra.
          label: { show: false },
          data: [[
            { coord: [0, criticalThreshold] },
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

      // Solo los puntos usables: los buckets de menos de 5 piezas ya quedaban
      // fuera de la regresión, de la mediana y de la zona crítica, pero el
      // gráfico los dibujaba igual — puntos que las estadísticas de la propia
      // tarjeta descartan.
      const scatterData = usableScatterPoints(s.points).map(p => ({
        value: [p.baaderCycles, p.graderP0Pct * 100, p.tsMs, p.graderPieces],
      }))

      series.push({
        name: shortMachineName(s.machineName),
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
      grid: { left: 44, right: 16, top: 10, bottom: 46, containLabel: false },
      tooltip: {
        trigger: 'item',
        backgroundColor: skin.tipBg,
        borderColor: skin.tipBorder,
        textStyle: { color: skin.tipText, fontSize: 11 },
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
        textStyle: { color: skin.axis, fontSize: 11 },
        itemWidth: 12, itemHeight: 8,
        // Solo las máquinas: la serie fantasma de la zona crítica y las líneas
        // de tendencia se van (su R² ya se lee en la fila de stats de abajo, y
        // seis entradas ocupaban tres líneas encima del gráfico).
        data: seriesData.map(s => shortMachineName(s.machineName)),
      },
      xAxis: {
        type: 'value',
        name: 'Ciclos Baader / 5 min',
        nameLocation: 'end',
        nameTextStyle: { color: skin.axis, fontSize: 11 },
        axisLine: { lineStyle: { color: skin.grid } },
        axisTick: { lineStyle: { color: skin.grid } },
        axisLabel: { color: skin.axis, fontSize: 11 },
        splitLine: { lineStyle: { color: skin.grid, type: 'dashed' } },
        min: 0,
      },
      yAxis: {
        type: 'value',
        // Sin nombre de eje: el rótulo «P0% Grader» caía justo sobre la
        // etiqueta «Zona crítica» del área marcada, y la nota de abajo ya dice
        // qué mide cada eje. Las etiquetas llevan el % igual.
        nameTextStyle: { color: skin.axis, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: skin.axis,
          fontSize: 11,
          formatter: (v: number) => `${v.toFixed(0)}%`,
        },
        splitLine: { lineStyle: { color: skin.grid, type: 'dashed' } },
        min: 0,
        max: ejeY.max,
      },
      series,
    }
  }, [seriesData, baaderMedian, criticalThreshold, skin, MACHINE_COLORS, TREND_COLORS, ejeY.max])

  // Pendiente con magnitud operacional ("cada -10 ciclos → ±N pts P0%")
  const slopeMagnitude = useMemo(() => scatterSlopeMagnitude(seriesData), [seriesData])

  // Early return post-hooks: no renderizar si no hay datos suficientes
  if (!snapshot || totalPoints < 10) return null

  // Color del KPI zona crítica según severidad
  const criticalColor =
    criticalKpi.pct >= 20 ? 'text-cat-5-ink'
    : criticalKpi.pct >= 10 ? 'text-amber-400'
    : 'text-emerald-400'

  /*
   * La frase depende del R², no solo del signo de la pendiente. Hasta el 10-09
   * decía «Confirma que ritmo upstream impacta calidad» con R² 0,00-0,02: en 14
   * de 25 turnos afirmaba una relación que sus propios números negaban. Con la
   * nube dispersa se dice eso mismo —que no se ve relación— y la pendiente no
   * se muestra: un número que sale de puntos sin correlación no significa nada.
   */
  const pctExplicado = slopeMagnitude?.r2Max != null ? Math.round(slopeMagnitude.r2Max * 100) : null
  const trendNarrative = slopeMagnitude == null
    ? null
    : !slopeMagnitude.explica
      ? {
          icon: <Minus className="w-3 h-3" />,
          text: 'Sin relación visible en este turno',
          color: 'text-muted-foreground',
          tone: pctExplicado != null
            ? `El ritmo de la línea explica el ${pctExplicado} % de la variación del P0: la nube está dispersa.`
            : 'Los puntos no alcanzan para medir una relación.',
        }
      : slopeMagnitude.direction === 'neg'
      ? {
          icon: <TrendingDown className="w-3 h-3" />,
          text: `Cada -10 ciclos/5min Baader → +${slopeMagnitude.deltaP0_per_minus10cycles.toFixed(2)} pts P0%`,
          color: 'text-cat-5-ink',
          tone: `Cuando la línea bajó el ritmo, el P0 subió. Explica el ${pctExplicado} % de la variación de este turno — no vale para otros.`,
        }
      : slopeMagnitude.direction === 'pos'
      ? {
          icon: <TrendingUp className="w-3 h-3" />,
          text: `Cada -10 ciclos/5min Baader → ${slopeMagnitude.deltaP0_per_minus10cycles.toFixed(2)} pts P0%`,
          color: 'text-amber-400',
          tone: `P0% sube cuando Baader sube, al revés de lo esperado. Explica el ${pctExplicado} % de la variación — mirar antes de concluir.`,
        }
      : {
          icon: <Minus className="w-3 h-3" />,
          text: 'Sin tendencia significativa',
          color: 'text-muted-foreground',
          tone: 'P0% del Grader no se explica por el ritmo Baader en este turno.',
        }

  return (
    <Card className="border-border bg-card dark:border-border dark:bg-muted-foreground/[0.10]">
      <CardContent className="py-3 px-4">
        {/* Header: ícono + título + KPI accionable de zona crítica */}
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ScatterChart className="w-4 h-4 text-cat-6-ink" />
            <span className="font-medium text-sm">Correlación Baader → P0%</span>
          </div>

          {/* KPI accionable: zona crítica (lo que el operador debe ver primero).
              La unidad son TRAMOS, no minutos: cada punto del scatter es un
              intervalo de 5 min de UNA máquina, así que con 3 Baader un turno de
              8 h da ~288 puntos. Hasta el 10-09 el chip decía «31 de 243 min» y
              se leía como que el turno había durado 243 minutos. */}
          {criticalKpi.total > 0 && (
            <div
              className={`flex items-center gap-1.5 text-xs tabular-nums ${criticalColor}`}
              title={`Zona crítica = P0% > ${criticalThreshold}% (umbral) Y ritmo Baader < mediana del turno (${Math.round(baaderMedian)} ciclos/5min). Cuadrante inferior-derecho del scatter.\n\nUn tramo = 5 min de una máquina: las ${seriesData.length} Baader del turno suman ${criticalKpi.total} tramos con producción.`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="font-semibold">
                Zona crítica: {criticalKpi.critical} de {criticalKpi.total} tramos
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
            <span className="text-muted-foreground">— {trendNarrative.tone}</span>
          </div>
        )}

        {/* Nota explicativa pequeña */}
        <div className="text-caption text-muted-foreground mb-2">
          Punto = 5 min · X = ciclos Baader · Y = P0% Grader · tamaño = piezas Grader (confianza).
          {ejeY.fuera > 0 && (
            <> <span className="text-ink-warn">{ejeY.fuera} {ejeY.fuera === 1 ? 'punto queda' : 'puntos quedan'} sobre el {ejeY.max} % y no {ejeY.fuera === 1 ? 'entra' : 'entran'} en la escala.</span></>
          )}
          {' '}Líneas: <span className="text-cat-5-ink">P0% crítico {criticalThreshold}%</span>
          {' · '}<span className="text-muted-foreground">mediana ritmo {Math.round(baaderMedian)} ciclos</span>.
        </div>

        {/* La fila de R² por máquina se fue el 10-09: decía lo mismo que el
            veredicto de arriba («explica el N %») repartido por serie, y con
            los nombres largos ocupaba dos líneas en 375 px. El detalle por
            máquina sigue en el tooltip de cada punto. */}

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
