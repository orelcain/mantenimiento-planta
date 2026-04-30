/**
 * StateTimelineEC — Gantt de estados Baader (ECharts).
 *
 * TOOLTIP: usa trigger:'axis' igual que ProductionRateLineEC (probado y estable).
 * El trigger:'item' y los overlays React fallan porque setHover() → re-render →
 * ReactECharts re-enlaza onEvents → ECharts dispara mouseout falso → tooltip muerto.
 * Con trigger:'axis' ECharts gestiona show/hide según posición del axisPointer,
 * completamente al margen de los re-renders del TimelineSyncContext.
 *
 * SINCRONIZACIÓN: onMouseMove React en el wrapper div (no evento ECharts) para
 * llamar setHover() sin interferir con el tooltip nativo de ECharts.
 */

import { useCallback, useEffect, useId, useMemo, useRef } from 'react'
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

export function StateTimelineEC({ shift, windowStart, windowEnd, height = 20, onStateClick }: Props) {
  const echartsRef = useRef<any>(null)
  const myHoverId  = useId()
  const timelineSync = useTimelineSyncOptional()
  const onChartReady = useChartReadyConnect(timelineSync?.connectGroupId ?? '__no-sync__')

  // Refs estables para callbacks sin deps cambiantes
  const timelineSyncRef = useRef(timelineSync)
  useEffect(() => { timelineSyncRef.current = timelineSync }, [timelineSync])

  // ── Rango temporal ──────────────────────────────────────────────────────────
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    if (windowStart && windowEnd) return [windowStart, windowEnd]
    return [shift.shiftStart, shift.shiftEnd]
  }, [timelineSync?.range, windowStart, windowEnd, shift.shiftStart, shift.shiftEnd])

  // ── Datos de la serie ───────────────────────────────────────────────────────
  const seriesData = useMemo(() => shift.states.map((st) => {
    const color = slxStateColor(st.type, st.reason, st.color)
    return {
      value: [st.startAt.getTime(), st.endAt.getTime(), color],
      itemStyle: { color },
    }
  }), [shift.states])

  // ── Lot projection ──────────────────────────────────────────────────────────
  const lotMarkLines = useMemo(() => {
    if (!timelineSync || timelineSync.lotChanges.length === 0) return []
    return timelineSync.lotChanges
      .filter((lc) => lc.ms >= rangeStart.getTime() && lc.ms <= rangeEnd.getTime())
      .map((lc) => ({
        xAxis: lc.ms,
        lineStyle: { color: 'rgba(139,92,246,0.55)', type: 'dotted' as const, width: 1 },
        label: { show: false },
      }))
  // Dep: timelineSync?.lotChanges (NO timelineSync completo). El context crea
  // un nuevo objeto en cada setHover(), pero lotChanges solo cambia cuando hay
  // nuevos lotes (gestionado con igualdad estructural en TimelineSyncContext).
  // Si usamos timelineSync como dep → recomputa en cada hover → option cambia
  // → setOption(notMerge=true) → ECharts reconstruye → tooltip muerto.
  }, [timelineSync?.lotChanges, rangeStart, rangeEnd])

  // ── Hover cross-chart: React div (no evento ECharts) ────────────────────────
  // Usar onMouseMove React evita que el re-render causado por setHover() provoque
  // un re-enlace de onEvents de ECharts que dispara mouseout falso al tooltip.
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    const rect  = e.currentTarget.getBoundingClientRect()
    const rawMs = inst.convertFromPixel({ xAxisIndex: 0 }, e.clientX - rect.left)
    if (typeof rawMs !== 'number' || !Number.isFinite(rawMs)) return

    // Solo timeline sync — NO dispatchamos updateAxisPointer aquí.
    // Si lo hacemos, echarts.connect() lo propaga a todos los charts conectados:
    // ProductionRateLineEC recibe evento virtual → su onMouseMove dispara
    // setHover({productionRateId}) → context cambia → loop de re-renders que
    // genera la línea punteada parpadeante y mata el tooltip.
    // ECharts detecta el mouse sobre su canvas nativamente y activa
    // trigger:'axis' sin necesitar dispatch explícito.
    const ts = timelineSyncRef.current
    if (ts) ts.setHover({ ms: Math.floor(rawMs / 60_000) * 60_000, originId: myHoverId })
  }, [myHoverId])

  const handleMouseLeave = useCallback(() => {
    const ts = timelineSyncRef.current
    if (ts?.hover?.originId === myHoverId) ts.setHover(null)
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (inst) inst.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' })
  }, [myHoverId])

  // ── Click (sigue siendo evento ECharts) ─────────────────────────────────────
  const onClick = useCallback((params: any) => {
    if (!onStateClick) return
    const idx = typeof params?.dataIndex === 'number' ? params.dataIndex : -1
    if (idx < 0 || idx >= shift.states.length) return
    const st = shift.states[idx]
    if (!st) return
    onStateClick(st)
  }, [onStateClick, shift.states])

  // ── Hover externo → axisPointer en este chart ───────────────────────────────
  const externalHoverMs = timelineSync?.hover?.originId !== myHoverId
    ? (timelineSync?.hover?.ms ?? null)
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

  // ── DataZoom ────────────────────────────────────────────────────────────────
  const onDataZoom = useCallback(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    const ts = timelineSyncRef.current
    if (!inst || !ts) return
    const opt = inst.getOption?.()
    const dz = Array.isArray(opt?.dataZoom) ? opt.dataZoom[0] : null
    if (!dz) return
    const startMs = typeof dz.startValue === 'number' ? dz.startValue : null
    const endMs   = typeof dz.endValue   === 'number' ? dz.endValue   : null
    if (startMs == null || endMs == null) return
    const totalMs = rangeEnd.getTime() - rangeStart.getTime()
    if ((endMs - startMs) / totalMs >= 0.995) { ts.setRange(null); return }
    ts.setRange({ startMs, endMs })
  }, [rangeStart, rangeEnd])

  const interactive = !!onStateClick

  // ── Opción ECharts ──────────────────────────────────────────────────────────
  // shift.states incluido en deps para que el formatter del tooltip tenga la
  // versión más actualizada (cambia solo al cargar un nuevo turno, no en hover).
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
    xAxis: {
      type: 'time' as const,
      min:  rangeStart.getTime(),
      max:  rangeEnd.getTime(),
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
    // trigger:'axis' — mismo patrón que ProductionRateLineEC (estable, no depende
    // de hit-detection sobre rects delgados). El formatter resuelve el estado
    // usando axisValue sin necesidad de React state.
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'none' as const },  // línea gestionada por externalHoverMs
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#f9fafb', fontSize: 11 },
      padding: [8, 10],
      confine: true,
      hideDelay: 800,
      formatter: (params: any) => {
        // Para trigger:'axis' con time-axis, params[0].axisValue es el ms del cursor
        const p = Array.isArray(params) ? params[0] : params
        if (!p) return ''
        const axisMs: number | null =
          typeof p.axisValue === 'number'     ? p.axisValue
          : typeof p.axisValue === 'string'   ? new Date(p.axisValue).getTime()
          : p.axisValue instanceof Date       ? p.axisValue.getTime()
          : null
        if (axisMs == null || !Number.isFinite(axisMs)) return ''

        // Buscar el estado que contiene este instante
        const st = shift.states.find(
          (s) => axisMs >= s.startAt.getTime() && axisMs <= s.endAt.getTime(),
        )
        if (!st) return ''

        const color     = slxStateColor(st.type, st.reason, st.color)
        const cause     = st.reason || st.name
        const typeLabel = st.type === 'uptime'    ? 'Produciendo'
          : st.type === 'break'   ? 'Paro programado'
          : st.type === 'setup'   ? 'Setup'
          : 'Detención'
        const dot = `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};margin-right:5px;vertical-align:middle;"></span>`
        return [
          `${dot}<b>${cause}</b>`,
          `<span style="color:#9ca3af">${typeLabel}</span>`,
          `⏱ <b>${fmtDurationSec(st.durationSec)}</b>`,
          `🕐 ${fmtTime(st.startAt)} – ${fmtTime(st.endAt)}`,
        ].join('<br/>')
      },
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      type: 'line' as const,
      lineStyle: { color: 'rgba(148,163,184,0.6)', type: 'solid' as const, width: 1 },
    },
    series: [
      // Serie visual: rectángulos coloreados de los estados
      {
        type: 'custom' as const,
        renderItem: (_params: any, api: any) => {
          const start   = api.coord([api.value(0), 0])
          const end     = api.coord([api.value(1), 0])
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
        tooltip: { show: false },  // tooltip manejado por la serie auxiliar abajo
        markLine: lotMarkLines.length > 0 ? {
          silent: true,
          symbol: 'none',
          data: lotMarkLines,
          z: 5,
        } : undefined,
      },
      // Serie auxiliar invisible: activa trigger:'axis' en todo el ancho del turno.
      // Sin esta, ECharts no dispara el tooltip con trigger:'axis' para custom series.
      // CRÍTICO: NO poner tooltip.show:false aquí. Si todos los series tienen show:false,
      // ECharts omite llamar al formatter aunque trigger:'axis' esté configurado.
      // El formatter ignora el valor de esta serie (usa axisValue del eje X directamente).
      {
        type: 'line' as const,
        data: [
          [rangeStart.getTime(), 0],
          [rangeEnd.getTime(),   0],
        ],
        lineStyle:   { opacity: 0 },
        symbol:      'none',
        showSymbol:  false,
        silent:      true,
        z:           -1,
      },
    ],
  // shift.states en deps: el formatter lo necesita actualizado (solo cambia al cargar nuevo turno)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rangeStart, rangeEnd, seriesData, height, lotMarkLines, interactive, shift.states])

  // onEvents mínimo y estable (sin mouse* para no interferir con trigger:'axis')
  const onEvents = useMemo(() => ({
    datazoom: onDataZoom,
    click:    onClick,
  }), [onDataZoom, onClick])

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
    </div>
  )
}
