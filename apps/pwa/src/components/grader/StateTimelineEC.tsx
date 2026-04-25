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
 */

import { useCallback, useEffect, useId, useMemo, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import { useTimelineSyncOptional } from './useTimelineSync'
import { useChartReadyConnect } from './useEChartsConnect'

interface Props {
  shift: UpstreamMachineShift
  /** Override del rango — si no se provee, se usa shift.shiftStart/End */
  windowStart?: Date
  windowEnd?: Date
  /** Altura del Gantt en pixels (default 20 = h-5 del HTML viejo) */
  height?: number
}

/**
 * Mapea state.type a un nombre humano para el tooltip.
 * Coincide con la convención del StateTimeline HTML.
 */
function fmtHHmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function fmtDuration(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rm = min % 60
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`
}

export function StateTimelineEC({ shift, windowStart, windowEnd, height = 20 }: Props) {
  const echartsRef = useRef<any>(null)
  const myHoverId = useId()
  const timelineSync = useTimelineSyncOptional()
  // Callback que inscribe la instancia al grupo cuando ECharts inicializa.
  // Más confiable que useEffect porque corre exactamente cuando la instancia
  // está lista (vía onChartReady de ReactECharts).
  const onChartReady = useChartReadyConnect(timelineSync?.connectGroupId ?? '__no-sync__')

  // Rango temporal efectivo. Prioridad: context.range > prop window > shift bounds
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    if (windowStart && windowEnd) return [windowStart, windowEnd]
    return [shift.shiftStart, shift.shiftEnd]
  }, [timelineSync?.range, windowStart, windowEnd, shift.shiftStart, shift.shiftEnd])

  // Data para la custom series: una entrada por cada state, con tiempos y meta
  const seriesData = useMemo(() => {
    return shift.states.map((st) => ({
      value: [
        st.startAt.getTime(),
        st.endAt.getTime(),
        st.color,
      ],
      itemStyle: { color: st.color },
      // Meta para tooltip
      meta: {
        name: st.name,
        reason: st.reason,
        durationSec: st.durationSec,
        startAt: st.startAt,
        endAt: st.endAt,
      },
    }))
  }, [shift.states])

  // ── Hover cross-chart (Fase 4b del Synchronized Timeline) ───────────────
  // Cuando el mouse se mueve sobre este chart, capturamos el ms del axis
  // bajo el cursor y lo broadcastemos al context. Otros charts del grupo
  // muestran un axisPointer en su pixel correspondiente al mismo ms.
  // OPTIMIZACIÓN: snap al minuto (floor / 60_000) para que setHover sea
  // idempotente entre pixels del mismo minuto — sin esto, mover el mouse
  // un pixel re-renderiza los 7 charts del grupo.
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

  // Listener: cuando OTRO chart originó hover, dispatchear axisPointer manual
  // sobre este chart para mostrar la línea vertical en el ms correspondiente.
  const externalHoverMs = timelineSync?.hover && timelineSync.hover.originId !== myHoverId
    ? timelineSync.hover.ms
    : null
  useEffect(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    if (externalHoverMs == null) {
      inst.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' })
      inst.dispatchAction({ type: 'hideTip' })
      return
    }
    const pixelX = inst.convertToPixel({ xAxisIndex: 0 }, externalHoverMs)
    if (typeof pixelX !== 'number' || !Number.isFinite(pixelX)) return
    inst.dispatchAction({
      type: 'updateAxisPointer',
      currTrigger: 'mousemove',
      x: pixelX,
      y: height / 2,
    })
  }, [externalHoverMs, height])

  // Handler: cuando el usuario zoom-ea localmente, propaga al context.
  // ECharts emite el rango en ms (no en %) cuando xAxis es type 'time'.
  const onDataZoom = useCallback(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst || !timelineSync) return
    const opt = inst.getOption?.()
    const dz = Array.isArray(opt?.dataZoom) ? opt.dataZoom[0] : null
    if (!dz) return
    // En xAxis type 'time', dataZoom expone startValue/endValue (ms)
    const startMs = typeof dz.startValue === 'number' ? dz.startValue : null
    const endMs = typeof dz.endValue === 'number' ? dz.endValue : null
    if (startMs == null || endMs == null) return
    const totalMs = rangeEnd.getTime() - rangeStart.getTime()
    const visibleMs = endMs - startMs
    // Tolerance: si visible >= 99.5% del total, considera "full zoom"
    if (visibleMs / totalMs >= 0.995) { timelineSync.setRange(null); return }
    timelineSync.setRange({ startMs, endMs })
  }, [timelineSync, rangeStart, rangeEnd])

  // ── Lot projection (Fase 4c) ────────────────────────────────────────────
  // markLines verticales para cada cambio de lote del Grader. Solo se
  // muestran si el lot change cae dentro del rango visible.
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

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    // Padding mínimo: el Gantt es solo una franja horizontal
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
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#f9fafb', fontSize: 11 },
      formatter: (params: any) => {
        const meta = params?.data?.meta
        if (!meta) return ''
        const label = meta.reason ? `${meta.name}: ${meta.reason}` : meta.name
        return [
          `<b>${label}</b>`,
          `⏱ ${fmtDuration(meta.durationSec)}`,
          `🕐 ${fmtHHmm(meta.startAt)}–${fmtHHmm(meta.endAt)} (Chile)`,
        ].join('<br/>')
      },
    },
    // axisPointer link='all' permite que echarts.connect propague crosshair
    // vertical entre todos los charts del grupo. Importante para correlación.
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
            // Hover: brightness (consistente con StateTimeline HTML)
            emphasis: {
              style: { opacity: 0.85 },
            },
          }
        },
        encode: { x: [0, 1], y: -1 },
        data: seriesData,
        // Allow tooltip al hover de cada rect
        tooltip: { show: true },
        // Lot projection: verticales tenues violetas en cambios de lote
        markLine: lotMarkLines.length > 0 ? {
          silent: true,
          symbol: 'none',
          data: lotMarkLines,
          z: 5,
        } : undefined,
      },
    ],
  }), [rangeStart, rangeEnd, seriesData, height, lotMarkLines])

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
          mouseout: onMouseOut,
        }}
      />
    </div>
  )
}
