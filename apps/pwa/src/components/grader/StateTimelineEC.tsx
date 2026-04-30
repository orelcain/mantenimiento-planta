/**
 * StateTimelineEC — Gantt de estados Baader (ECharts).
 *
 * TOOLTIP: trigger:'item' directo sobre los rects de la custom series.
 * El formatter usa params.dataIndex para resolver el estado (sin axisValue).
 *
 * AISLAMIENTO echarts.connect(): el componente usa myHoverId como group ID,
 * quedando aislado del grupo principal del contexto. Esto evita que hideTip /
 * showTip de ProductionRateLineEC o ProductionBarsEC destruyan el tooltip local
 * (echarts.connect() propaga hideTip a todo el grupo automáticamente).
 * El cross-chart sync se hace 100% via TimelineSyncContext, no via connect().
 *
 * SINCRONIZACIÓN: onMouseMove React en el wrapper div para llamar setHover()
 * sin añadir handlers ECharts que causarían re-bind de onEvents.
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
  // Aislado del grupo principal: cada instancia usa su propio group ID.
  // Esto evita que hideTip propagado por echarts.connect() destruya el tooltip.
  const onChartReady = useChartReadyConnect(myHoverId)

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
  // shift.states en deps: formatter usa shift.states[dataIndex] (solo cambia al cargar nuevo turno).
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
    // trigger:'item' — el formatter recibe dataIndex del rect hovered.
    // Más confiable que trigger:'axis' para custom series con rects pequeños.
    // El chart está aislado de echarts.connect() (ver constructor) para que
    // hideTip/showTip de otros charts no interfieran.
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#f9fafb', fontSize: 11 },
      padding: [8, 10],
      // enterable: el cursor puede entrar al tooltip sin cerrarlo.
      // Sin esto, mover el cursor hacia arriba para leer el tooltip
      // sale del rect (20px) → mouseout → tooltip desaparece.
      enterable: true,
      // SIN confine: el chart mide 24px, confinar dentro es imposible.
      hideDelay: 1200,
      formatter: (params: any) => {
        // trigger:'item': params.dataIndex = índice del rect hovered
        const idx = typeof params?.dataIndex === 'number' ? params.dataIndex : -1
        if (idx < 0 || idx >= shift.states.length) return ''
        const st = shift.states[idx]!
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
        markLine: lotMarkLines.length > 0 ? {
          silent: true,
          symbol: 'none',
          data: lotMarkLines,
          z: 5,
        } : undefined,
      },
      // Serie auxiliar invisible solo para axisPointer cross-chart (crosshair).
      // No se usa para tooltip (trigger:'item' lo maneja directamente).
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
        tooltip:     { show: false },
      },
    ],
  // shift.states en deps: el formatter lo necesita actualizado (solo cambia al cargar nuevo turno)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rangeStart, rangeEnd, seriesData, height, lotMarkLines, interactive, shift.states])

  // onEvents mínimo y estable: solo datazoom + click, sin mouse* que causarían re-bind
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
