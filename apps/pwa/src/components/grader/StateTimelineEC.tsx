/**
 * StateTimelineEC — versión ECharts del Gantt de estados Baader.
 *
 * Reemplaza el StateTimeline HTML (divs con position:absolute) con un chart
 * ECharts. Esto permite:
 *   - Zoom y axisPointer cross-chart vía echarts.connect() — el zoom del
 *     Grader propaga al Gantt automáticamente, mismo crosshair vertical
 *   - dataZoom interno propio (slider/wheel) que también propaga
 *   - Mismo rendering visual: rectángulos coloreados con la altura del lane
 *
 * Props compatibles con StateTimeline original (drop-in replacement).
 *
 * Sincroniza con TimelineSyncContext (Fase 1):
 *   - Lee windowStart/End del context si está, sino usa la prop
 *   - Escribe al context cuando el usuario hace zoom local en este chart
 *
 * TOOLTIP: se usa un overlay React en lugar del tooltip de ECharts.
 * ECharts custom series tiene hit-detection inestable para rectángulos
 * delgados — el cursor sale 1px del rect y ECharts dispara `mouseout`,
 * iniciando el countdown de `hideDelay`. El overlay React es controlado
 * por los eventos `mouseover`/`mouseout` de la serie, con hide-delay
 * manejado por un ref de timeout → tooltip se mantiene mientras el
 * cursor está sobre el segmento.
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
  /** Override del rango — si no se provee, se usa shift.shiftStart/End */
  windowStart?: Date
  windowEnd?: Date
  /** Altura del Gantt en pixels (default 20 = h-5 del HTML viejo) */
  height?: number
  /**
   * Callback al clickear un segmento de estado. Se le pasa el state seleccionado.
   * Si no se provee, click se ignora (sólo tooltip al hover).
   */
  onStateClick?: (state: UpstreamMachineShift['states'][number]) => void
}

// ─── Tipo del meta del tooltip ───────────────────────────────────────────────
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
  /** offsetX dentro del contenedor del chart (px desde la izquierda) */
  x: number
  meta: TooltipMeta | null
}

const TOOLTIP_HIDE_DELAY_MS = 900

export function StateTimelineEC({ shift, windowStart, windowEnd, height = 20, onStateClick }: Props) {
  const echartsRef = useRef<any>(null)
  const myHoverId = useId()
  const timelineSync = useTimelineSyncOptional()
  const onChartReady = useChartReadyConnect(timelineSync?.connectGroupId ?? '__no-sync__')

  // ── Tooltip React ──────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, meta: null })
  const tooltipHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTooltipTimer = useCallback(() => {
    if (tooltipHideTimerRef.current != null) {
      clearTimeout(tooltipHideTimerRef.current)
      tooltipHideTimerRef.current = null
    }
  }, [])

  // Limpiar timer al desmontar
  useEffect(() => () => clearTooltipTimer(), [clearTooltipTimer])

  // Rango temporal efectivo. Prioridad: context.range > prop window > shift bounds
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    if (windowStart && windowEnd) return [windowStart, windowEnd]
    return [shift.shiftStart, shift.shiftEnd]
  }, [timelineSync?.range, windowStart, windowEnd, shift.shiftStart, shift.shiftEnd])

  // Data para la custom series
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

  // ── Hover cross-chart (Fase 4b) ────────────────────────────────────────────
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

  // Entra sobre un segmento de la serie → mostrar tooltip React
  const onMouseOver = useCallback((params: any) => {
    const meta: TooltipMeta | undefined = params?.data?.meta
    if (!meta) return
    clearTooltipTimer()
    const offsetX = params?.event?.offsetX ?? params?.offsetX ?? 0
    setTooltip({ visible: true, x: offsetX, meta })
  }, [clearTooltipTimer])

  // Sale del segmento → iniciar timer de ocultamiento
  const onMouseOut = useCallback(() => {
    // Limpiar crosshair del timeline sync
    if (timelineSync?.hover?.originId === myHoverId) {
      timelineSync.setHover(null)
    }
    // Ocultar tooltip con delay para que el usuario lo pueda leer
    clearTooltipTimer()
    tooltipHideTimerRef.current = setTimeout(() => {
      setTooltip(s => ({ ...s, visible: false }))
    }, TOOLTIP_HIDE_DELAY_MS)
  }, [timelineSync, myHoverId, clearTooltipTimer])

  // Click sobre un segmento
  const onClick = useCallback((params: any) => {
    if (!onStateClick) return
    const idx = typeof params?.dataIndex === 'number' ? params.dataIndex : -1
    if (idx < 0 || idx >= shift.states.length) return
    const st = shift.states[idx]
    if (!st) return
    onStateClick(st)
  }, [onStateClick, shift.states])

  // ── Hover externo (crosshair de otro chart) ────────────────────────────────
  const externalHoverMs = timelineSync?.hover && timelineSync.hover.originId !== myHoverId
    ? timelineSync.hover.ms
    : null
  const hadExternalHoverRef = useRef(false)
  useEffect(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    if (externalHoverMs == null) {
      if (hadExternalHoverRef.current) {
        inst.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' })
      }
      hadExternalHoverRef.current = false
      return
    }
    hadExternalHoverRef.current = true
    const pixelX = inst.convertToPixel({ xAxisIndex: 0 }, externalHoverMs)
    if (typeof pixelX !== 'number' || !Number.isFinite(pixelX)) return
    inst.dispatchAction({
      type: 'updateAxisPointer',
      currTrigger: 'mousemove',
      x: pixelX,
      y: height / 2,
    })
  }, [externalHoverMs, height])

  // ── DataZoom ───────────────────────────────────────────────────────────────
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
    const visibleMs = endMs - startMs
    if (visibleMs / totalMs >= 0.995) { timelineSync.setRange(null); return }
    timelineSync.setRange({ startMs, endMs })
  }, [timelineSync, rangeStart, rangeEnd])

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
    // Tooltip de ECharts desactivado — usamos overlay React (ver arriba)
    tooltip: { show: false },
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
            shape: {
              x: start[0],
              y: yCenter - height / 2,
              width: widthPx,
              height,
            },
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
    <div className="relative w-full" style={{ height: height + 4 }}>
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
          mouseover: onMouseOver,
          mouseout: onMouseOut,
          click: onClick,
        }}
      />

      {/* ── Tooltip React (overlay) ──────────────────────────────────────── */}
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

// ─── Tooltip overlay separado para evitar re-renders del chart ───────────────
function TooltipOverlay({
  meta,
  anchorX,
  barHeight,
}: {
  meta: TooltipMeta
  anchorX: number
  barHeight: number
}) {
  const typeLabel =
    meta.type === 'uptime' ? 'Produciendo'
    : meta.type === 'break' ? 'Paro programado'
    : meta.type === 'setup' ? 'Setup'
    : 'Detención'

  const causeLabel = meta.reason || meta.name

  return (
    <div
      className="pointer-events-none absolute z-50 min-w-[160px] max-w-[240px] rounded-lg border border-slate-600/60 bg-slate-900/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur-sm"
      style={{
        // Posicionar encima de la barra, centrado en el cursor X
        bottom: barHeight + 10,
        left: anchorX,
        transform: 'translateX(-50%)',
        // Triángulo apuntando hacia abajo
      }}
    >
      {/* Título con punto de color */}
      <div className="flex items-center gap-1.5 font-semibold text-white leading-tight">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/20"
          style={{ backgroundColor: meta.color }}
        />
        <span className="truncate">{causeLabel}</span>
      </div>

      {/* Tipo */}
      <div className="mt-0.5 text-slate-400">{typeLabel}</div>

      {/* Duración */}
      <div className="mt-1 flex items-center gap-1 text-slate-200">
        <span className="text-slate-500">⏱</span>
        <b>{fmtDurationSec(meta.durationSec)}</b>
      </div>

      {/* Rango horario */}
      <div className="flex items-center gap-1 text-slate-400">
        <span>🕐</span>
        <span>{fmtTime(meta.startAt)} – {fmtTime(meta.endAt)}</span>
      </div>
    </div>
  )
}
