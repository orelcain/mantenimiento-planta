/**
 * ProductionBarsEC — versión ECharts de las barras de producción Baader.
 *
 * Reemplaza ProductionBars (HTML divs absolute) con un chart ECharts que se
 * inscribe al grupo de echarts.connect() del context. Esto activa zoom y
 * axisPointer cross-chart entre las barras de producción y el resto del
 * timeline (Grader chart + Gantts Baader).
 *
 * Mantiene el rendering visual:
 *   - Barras coloreadas por estado (green/yellow/red/gray)
 *   - Línea objetivo violeta horizontal (markLine)
 *   - Etiqueta "Objetivo X ± Y%" en la esquina
 *
 * Sincroniza con TimelineSyncContext: lee context.range para el x-axis y
 * escribe via setRange cuando el usuario hace zoom local.
 */

import { useCallback, useEffect, useId, useMemo, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import type { UpstreamProductionInterval } from '@/services/shoplogix/types'
import { useTimelineSyncOptional } from './useTimelineSync'
import { useChartReadyConnect } from './useEChartsConnect'
import { fmtTime } from '@/services/grader/graderTimeFormat'

interface Props {
  intervals: UpstreamProductionInterval[]
  threshold: number
  windowStart?: Date
  windowEnd?: Date
}

const COLOR_MAP: Record<UpstreamProductionInterval['color'], string> = {
  green:  'rgba(16, 185, 129, 0.9)',  // emerald-500
  yellow: 'rgba(245, 158, 11, 0.9)',  // amber-500
  red:    'rgba(244, 63, 94, 0.9)',   // rose-500
  gray:   'rgba(51, 65, 85, 0.6)',    // slate-700
}


function fmtPct(x: number, decimals = 1): string {
  if (!isFinite(x)) return '—'
  return `${(x * 100).toFixed(decimals)}%`
}

export function ProductionBarsEC({ intervals, threshold, windowStart, windowEnd }: Props) {
  const echartsRef = useRef<any>(null)
  const myHoverId = useId()
  const timelineSync = useTimelineSyncOptional()
  const onChartReady = useChartReadyConnect(timelineSync?.connectGroupId ?? '__no-sync__')

  // ── Hover cross-chart (Fase 4b) — snap al minuto para evitar re-render
  // por pixel (idempotencia del setHover skip cuando ms === prev.ms).
  const onMouseMove = useCallback((params: any) => {
    if (!timelineSync) return
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    const offsetX = params?.event?.offsetX ?? params?.offsetX
    if (typeof offsetX !== 'number') return
    const rawMs = inst.convertFromPixel({ xAxisIndex: 0 }, offsetX)
    if (typeof rawMs !== 'number' || !Number.isFinite(rawMs)) return
    const ms = Math.floor(rawMs / 60_000) * 60_000
    timelineSync.setHover({ ms, originId: myHoverId })
  }, [timelineSync, myHoverId])

  const onMouseOut = useCallback(() => {
    if (timelineSync?.hover?.originId === myHoverId) {
      timelineSync.setHover(null)
    }
  }, [timelineSync, myHoverId])

  const externalHoverMs = timelineSync?.hover && timelineSync.hover.originId !== myHoverId
    ? timelineSync.hover.ms
    : null
  const hadExternalRef = useRef(false)
  useEffect(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    if (externalHoverMs == null) {
      if (hadExternalRef.current) {
        inst.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' })
      }
      hadExternalRef.current = false
      return
    }
    hadExternalRef.current = true
    const pixelX = inst.convertToPixel({ xAxisIndex: 0 }, externalHoverMs)
    if (typeof pixelX !== 'number' || !Number.isFinite(pixelX)) return
    inst.dispatchAction({
      type: 'updateAxisPointer',
      currTrigger: 'mousemove',
      x: pixelX,
      y: 30,
    })
  }, [externalHoverMs])

  // Rango temporal efectivo. Mismo contrato que StateTimelineEC.
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    if (windowStart && windowEnd) return [windowStart, windowEnd]
    if (intervals.length > 0) {
      return [intervals[0]!.startAt, intervals[intervals.length - 1]!.endAt]
    }
    return [new Date(), new Date()]
  }, [timelineSync?.range, windowStart, windowEnd, intervals])

  // Línea objetivo: el primer interval que tenga expected > 0 dicta el target
  const expected = useMemo(
    () => intervals.find((x) => x.expectedCycles > 0)?.expectedCycles ?? 0,
    [intervals],
  )

  // Data para custom series — cada item lleva [startMs, endMs, cycles, color].
  // renderItem dibuja un rect por interval con ancho proporcional al span
  // temporal del interval (alineado pixel-perfect con Gantt y Grader).
  const seriesData = useMemo(() => {
    return intervals.map((it) => ({
      value: [it.startAt.getTime(), it.endAt.getTime(), it.cycles, COLOR_MAP[it.color]],
      meta: {
        startAt: it.startAt,
        cycles: it.cycles,
        expectedCycles: it.expectedCycles,
        ratio: it.ratio,
      },
    }))
  }, [intervals])

  // Valor máximo para escalar la altura (pixels) — usa el max de cycles
  // y expectedCycles para que la línea objetivo siempre quede dentro del rango
  const maxValue = useMemo(() => {
    let m = 1
    for (const it of intervals) {
      if (it.cycles > m) m = it.cycles
      if (it.expectedCycles > m) m = it.expectedCycles
    }
    return m
  }, [intervals])

  const onDataZoom = useCallback(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst || !timelineSync) return
    const opt = inst.getOption?.()
    const dz = Array.isArray(opt?.dataZoom) ? opt.dataZoom[0] : null
    if (!dz) return
    const startMs = typeof dz.startValue === 'number' ? dz.startValue : null
    const endMs = typeof dz.endValue === 'number' ? dz.endValue : null
    if (startMs == null || endMs == null) return
    const totalMs = rangeEnd.getTime() - rangeStart.getTime()
    if ((endMs - startMs) / totalMs >= 0.995) { timelineSync.setRange(null); return }
    timelineSync.setRange({ startMs, endMs })
  }, [timelineSync, rangeStart, rangeEnd])

  // ── Lot projection (Fase 4c) — verticales en cambios de lote del Grader
  const lotMarkLines = useMemo(() => {
    if (!timelineSync || timelineSync.lotChanges.length === 0) return []
    return timelineSync.lotChanges
      .filter((lc) => lc.ms >= rangeStart.getTime() && lc.ms <= rangeEnd.getTime())
      .map((lc) => ({
        xAxis: lc.ms,
        lineStyle: { color: 'rgba(139,92,246,0.55)', type: 'dotted' as const, width: 1 },
        label: { show: false },
      }))
  // Misma razón que StateTimelineEC: dep = lotChanges, no timelineSync completo.
  }, [timelineSync?.lotChanges, rangeStart, rangeEnd])

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    // containLabel: true → ECharts reserva espacio para labels del eje X sin
    // necesidad de calcular bottom manualmente. El plot area se reduce
    // automáticamente (~14 px) para que los labels "HH:mm" quepan.
    grid: { left: 0, right: 0, top: 4, bottom: 0, containLabel: true },
    xAxis: {
      type: 'time' as const,
      min: rangeStart.getTime(),
      max: rangeEnd.getTime(),
      axisLine: { show: false },
      // Tick marks pequeños + labels HH:mm wall-clock Chile (Shoplogix guarda
      // UTC-as-local, por eso usamos getUTCHours/Minutes).
      // ECharts elige automáticamente la densidad de ticks según el rango
      // visible (min..max). Al hacer zoom a 10 min: ~cada 1-2 min. A 8 h:
      // ~cada 1 h. Siempre sin overlap gracias al motor de layout nativo.
      axisTick: { show: true, lineStyle: { color: '#334155' }, length: 3 },
      axisLabel: {
        show: true,
        color: '#64748b',
        fontSize: 9,
        formatter: (value: number) => fmtTime(value),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: maxValue,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#f9fafb', fontSize: 11 },
      hideDelay: 800,
      formatter: (params: any) => {
        const m = params?.data?.meta
        if (!m) return ''
        return [
          `<b>${fmtTime(m.startAt)}</b>`,
          `<span style="color:#10b981">▮</span> Producido: <b>${m.cycles}</b> pz`,
          `<span style="color:#a78bfa">┄</span> Objetivo: ${Math.round(m.expectedCycles)} pz`,
          `<span style="color:#94a3b8">→</span> Cumplimiento: <b>${fmtPct(m.ratio, 0)}</b>`,
        ].join('<br/>')
      },
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      type: 'line' as const,
      lineStyle: { color: 'rgba(148,163,184,0.6)', type: 'solid' as const, width: 1 },
    },
    series: [
      {
        type: 'custom' as const,
        // renderItem: dibuja una barra por interval. La barra arranca en
        // [startMs, 0] y termina en [endMs, cycles] — pixel-perfect en el
        // rango temporal del interval, alineado al Gantt arriba.
        renderItem: (_params: any, api: any) => {
          const startMs = api.value(0)
          const endMs = api.value(1)
          const cycles = api.value(2)
          const color = api.value(3) as string
          const start = api.coord([startMs, cycles])
          const end = api.coord([endMs, 0])
          const widthPx = Math.max(1, end[0] - start[0])
          const heightPx = Math.max(2, end[1] - start[1])
          // Gap horizontal para separar barras (1px del lado derecho)
          const innerWidth = Math.max(1, widthPx - 1)
          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: start[1],
              width: innerWidth,
              height: heightPx,
              r: [2, 2, 0, 0] as [number, number, number, number],
            },
            style: { fill: color },
            emphasis: { style: { opacity: 0.85 } },
          }
        },
        encode: { x: [0, 1], y: 2 },
        data: seriesData,
        // markLines: línea objetivo horizontal + verticales lot projection
        markLine: (expected > 0 || lotMarkLines.length > 0) ? {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgba(167, 139, 250, 0.7)',
            type: 'dashed' as const,
            width: 1,
          },
          label: { show: false },
          data: [
            ...(expected > 0 ? [{
              yAxis: expected,
              label: {
                show: true,
                position: 'insideEndTop' as const,
                formatter: `Objetivo ${Math.round(expected)} ± ${threshold}%`,
                color: '#a78bfa',
                fontSize: 9,
                backgroundColor: 'rgba(15,23,42,0.9)',
                padding: [2, 4, 2, 4] as [number, number, number, number],
                borderRadius: 2,
              },
            }] : []),
            ...lotMarkLines,
          ],
        } : undefined,
      },
    ],
  }), [rangeStart, rangeEnd, seriesData, maxValue, expected, threshold, lotMarkLines])

  if (intervals.length === 0) {
    return <div className="h-16 rounded bg-slate-800/40" />
  }

  return (
    <div className="h-16 rounded bg-card border border-border dark:bg-slate-950/60 dark:border-slate-800">
      <ReactECharts
        ref={echartsRef}
        option={option}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
        lazyUpdate={false}
        onChartReady={onChartReady}
        onEvents={{
          datazoom: onDataZoom,
          mousemove: onMouseMove,
          mouseout: onMouseOut,
        }}
      />
    </div>
  )
}
