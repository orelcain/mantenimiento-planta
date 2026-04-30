/**
 * StateTimelineEC — versión ECharts del Gantt de estados Baader.
 *
 * TOOLTIP: manejado por onMouseMove React en el div wrapper (NO eventos ECharts).
 * Los eventos mouseover/mouseout de ECharts se interrumpen cuando ReactECharts
 * re-enlaza onEvents durante re-renders del TimelineSyncContext → mouseout falso
 * → tooltip desaparece. El div React es inmune: sus eventos persisten a través
 * de re-renders sin interrupciones.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import { useTimelineSyncOptional } from './useTimelineSync'
import { useChartReadyConnect } from './useEChartsConnect'
import { fmtTime, fmtDurationSec } from '@/services/grader/graderTimeFormat'
import { slxStateColor } from '@/services/shoplogix/shoplogixColors'

interface Props {
  shift: UpstreamMachineShift
  windowStart?: Date
  windowEnd?: Date
  height?: number
  onStateClick?: (state: UpstreamMachineShift['states'][number]) => void
}

interface TooltipMeta {
  type: string
  name: string
  reason: string
  durationSec: number
  startAt: Date
  endAt: Date
  color: string
}

interface TooltipState {
  visible: boolean
  x: number
  meta: TooltipMeta | null
}

export function StateTimelineEC({ shift, windowStart, windowEnd, height = 20, onStateClick }: Props) {
  const echartsRef = useRef<any>(null)
  const myHoverId = useId()
  const timelineSync = useTimelineSyncOptional()
  const onChartReady = useChartReadyConnect(timelineSync?.connectGroupId ?? '__no-sync__')

  // Refs estables para usar dentro de callbacks sin deps cambiantes
  const timelineSyncRef = useRef(timelineSync)
  useEffect(() => { timelineSyncRef.current = timelineSync }, [timelineSync])

  // ── Rango temporal ─────────────────────────────────────────────────────────
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    if (windowStart && windowEnd) return [windowStart, windowEnd]
    return [shift.shiftStart, shift.shiftEnd]
  }, [timelineSync?.range, windowStart, windowEnd, shift.shiftStart, shift.shiftEnd])

  // ── Datos de la serie ──────────────────────────────────────────────────────
  const seriesData = useMemo(() => {
    return shift.states.map((st) => {
      const color = slxStateColor(st.type, st.reason, st.color)
      return {
        value: [st.startAt.getTime(), st.endAt.getTime(), color],
        itemStyle: { color },
        meta: {
          type: st.type,
          name: st.name,
          reason: st.reason,
          durationSec: st.durationSec,
          startAt: st.startAt,
          endAt: st.endAt,
          color,
        } satisfies TooltipMeta,
      }
    })
  }, [shift.states])

  // Ref para lookups sin deps en useCallback
  const seriesDataRef = useRef(seriesData)
  useEffect(() => { seriesDataRef.current = seriesData }, [seriesData])

  // ── Tooltip React (div wrapper) ────────────────────────────────────────────
  // NO usamos mouseover/mouseout de ECharts — se interrumpen con cada re-render
  // del contexto de sync. El div React persiste a través de re-renders.
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, meta: null })
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = useCallback(() => {
    if (tooltipTimerRef.current != null) {
      clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
  }, [])
  useEffect(() => () => clearTimer(), [clearTimer])

  // onMouseMove del div wrapper — calcula posición temporal y muestra tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return

    const divRect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - divRect.left

    // Convertir pixel X → ms usando el xAxis de ECharts
    const rawMs = inst.convertFromPixel({ xAxisIndex: 0 }, offsetX)
    if (typeof rawMs !== 'number' || !Number.isFinite(rawMs)) return

    // ── Timeline sync (crosshair en otros charts) ──────────────────────────
    const ts = timelineSyncRef.current
    if (ts) {
      const ms = Math.floor(rawMs / 60_000) * 60_000
      ts.setHover({ ms, originId: myHoverId })
    }

    // ── Buscar estado bajo el cursor ───────────────────────────────────────
    const hovered = seriesDataRef.current.find(
      (item) => rawMs >= (item.value[0] as number) && rawMs <= (item.value[1] as number),
    )

    if (hovered?.meta) {
      clearTimer()
      setTooltip({ visible: true, x: offsetX, meta: hovered.meta })
    } else {
      // Entre segmentos — ocultar con delay corto
      clearTimer()
      tooltipTimerRef.current = setTimeout(() => {
        setTooltip((s) => ({ ...s, visible: false }))
      }, 200)
    }
  }, [myHoverId, clearTimer]) // timelineSyncRef y seriesDataRef son refs, sin deps

  // onMouseLeave del div wrapper — ocultar tooltip y limpiar crosshair
  const handleMouseLeave = useCallback(() => {
    const ts = timelineSyncRef.current
    if (ts?.hover?.originId === myHoverId) {
      ts.setHover(null)
    }
    clearTimer()
    tooltipTimerRef.current = setTimeout(() => {
      setTooltip((s) => ({ ...s, visible: false }))
    }, 500)
  }, [myHoverId, clearTimer])

  // ── Click sobre segmento (sigue siendo evento ECharts) ────────────────────
  const onClick = useCallback((params: any) => {
    if (!onStateClick) return
    const idx = typeof params?.dataIndex === 'number' ? params.dataIndex : -1
    if (idx < 0 || idx >= shift.states.length) return
    const st = shift.states[idx]
    if (!st) return
    onStateClick(st)
  }, [onStateClick, shift.states])

  // ── Hover externo → axisPointer en este chart ─────────────────────────────
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
    const px = inst.convertToPixel({ xAxisIndex: 0 }, externalHoverMs)
    if (typeof px !== 'number' || !Number.isFinite(px)) return
    inst.dispatchAction({
      type: 'updateAxisPointer',
      currTrigger: 'mousemove',
      x: px,
      y: height / 2,
    })
  }, [externalHoverMs, height])

  // ── DataZoom ───────────────────────────────────────────────────────────────
  const onDataZoom = useCallback(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    const ts = timelineSyncRef.current
    if (!inst || !ts) return
    const opt = inst.getOption?.()
    const dz = Array.isArray(opt?.dataZoom) ? opt.dataZoom[0] : null
    if (!dz) return
    const startMs = typeof dz.startValue === 'number' ? dz.startValue : null
    const endMs = typeof dz.endValue === 'number' ? dz.endValue : null
    if (startMs == null || endMs == null) return
    const totalMs = rangeEnd.getTime() - rangeStart.getTime()
    const visibleMs = endMs - startMs
    if (visibleMs / totalMs >= 0.995) { ts.setRange(null); return }
    ts.setRange({ startMs, endMs })
  }, [rangeStart, rangeEnd])

  // ── Lot projection ─────────────────────────────────────────────────────────
  const lotMarkLines = useMemo(() => {
    if (!timelineSync || timelineSync.lotChanges.length === 0) return []
    return timelineSync.lotChanges
      .filter((lc) => lc.ms >= rangeStart.getTime() && lc.ms <= rangeEnd.getTime())
      .map((lc) => ({
        xAxis: lc.ms,
        lineStyle: { color: 'rgba(139,92,246,0.55)', type: 'dotted' as const, width: 1 },
        label: { show: false },
      }))
  }, [timelineSync, rangeStart, rangeEnd])

  const interactive = !!onStateClick

  // ── onEvents estable: solo datazoom y click (sin mouse*) ──────────────────
  // Excluimos mousemove/mouseover/mouseout de ECharts para evitar que los
  // re-renders del contexto de sync re-enlacen los eventos y disparen mouseout falsos.
  const onEvents = useMemo(() => ({
    datazoom: onDataZoom,
    click: onClick,
  }), [onDataZoom, onClick])

  // ── ECharts option ─────────────────────────────────────────────────────────
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
    xAxis: {
      type: 'time' as const,
      min: rangeStart.getTime(),
      max: rangeEnd.getTime(),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category' as const,
      data: [''],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    tooltip: { show: false },  // tooltip manejado por overlay React
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      type: 'line' as const,
      lineStyle: { color: 'rgba(148,163,184,0.6)', type: 'solid' as const, width: 1 },
    },
    series: [
      {
        type: 'custom' as const,
        renderItem: (_params: any, api: any) => {
          const start = api.coord([api.value(0), 0])
          const end = api.coord([api.value(1), 0])
          const widthPx = Math.max(0, end[0] - start[0])
          const yCenter = api.size([0, 1])[1] / 2
          return {
            type: 'rect',
            shape: { x: start[0], y: yCenter - height / 2, width: widthPx, height },
            style: {
              fill: api.value(2),
              stroke: 'rgba(15,23,42,0.4)',
              lineWidth: 0.5,
            },
            emphasis: { style: { opacity: 0.85 } },
            cursor: interactive ? 'pointer' : 'default',
          }
        },
        encode: { x: [0, 1], y: -1 },
        data: seriesData,
        tooltip: { show: false },
        markLine: lotMarkLines.length > 0 ? {
          silent: true,
          symbol: 'none',
          data: lotMarkLines,
          z: 5,
        } : undefined,
      },
    ],
  }), [rangeStart, rangeEnd, seriesData, height, lotMarkLines, interactive])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative w-full"
      style={{ height: height + 4 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <ReactECharts
        ref={echartsRef}
        option={option}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
        lazyUpdate={false}
        onChartReady={onChartReady}
        onEvents={onEvents}
      />

      {tooltip.visible && tooltip.meta && (
        <TooltipOverlay
          meta={tooltip.meta}
          anchorX={tooltip.x}
          barHeight={height}
        />
      )}
    </div>
  )
}

// ─── Tooltip overlay ─────────────────────────────────────────────────────────
function TooltipOverlay({ meta, anchorX, barHeight }: {
  meta: TooltipMeta
  anchorX: number
  barHeight: number
}) {
  const typeLabel =
    meta.type === 'uptime' ? 'Produciendo'
    : meta.type === 'break' ? 'Paro programado'
    : meta.type === 'setup' ? 'Setup'
    : 'Detención'

  return (
    <div
      className="pointer-events-none absolute z-50 min-w-[160px] max-w-[240px] rounded-lg border border-slate-600/60 bg-slate-900/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur-sm"
      style={{ bottom: barHeight + 10, left: anchorX, transform: 'translateX(-50%)' }}
    >
      <div className="flex items-center gap-1.5 font-semibold text-white leading-tight">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/20"
          style={{ backgroundColor: meta.color }}
        />
        <span className="truncate">{meta.reason || meta.name}</span>
      </div>
      <div className="mt-0.5 text-slate-400">{typeLabel}</div>
      <div className="mt-1 flex items-center gap-1 text-slate-200">
        <span className="text-slate-500">⏱</span>
        <b>{fmtDurationSec(meta.durationSec)}</b>
      </div>
      <div className="flex items-center gap-1 text-slate-400">
        <span>🕐</span>
        <span>{fmtTime(meta.startAt)} – {fmtTime(meta.endAt)}</span>
      </div>
    </div>
  )
}
