/**
 * StateTimelineEC — Gantt de estados Baader (ECharts).
 *
 * TOOLTIP: overlay React puro (div position:fixed) — no usa el tooltip nativo
 * de ECharts. El tooltip nativo fallaba por interacción entre echarts.connect()
 * (hideTip propagado), re-renders de React (onEvents rebinding) y hit-testing
 * poco confiable en charts de 20px. El overlay React vive fuera del canvas y
 * no sufre esas interferencias.
 *
 * AISLAMIENTO echarts.connect(): el componente usa myHoverId como group ID,
 * aislado del grupo principal. El cross-chart sync se hace 100% via
 * TimelineSyncContext, no via connect().
 *
 * SINCRONIZACIÓN: onMouseMove React en el wrapper div para llamar setHover()
 * sin añadir handlers ECharts que causarían re-bind de onEvents.
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

export function StateTimelineEC({ shift, windowStart, windowEnd, height = 20, onStateClick }: Props) {
  const echartsRef = useRef<any>(null)
  const myHoverId  = useId()
  const timelineSync = useTimelineSyncOptional()
  // Aislado del grupo principal: cada instancia usa su propio group ID.
  const onChartReady = useChartReadyConnect(myHoverId)

  // Refs estables para callbacks sin deps cambiantes
  const timelineSyncRef = useRef(timelineSync)
  useEffect(() => { timelineSyncRef.current = timelineSync }, [timelineSync])

  // Tooltip overlay React (state local — NO va al context para no causar re-renders globales)
  const [hoverInfo, setHoverInfo] = useState<{
    state: UpstreamMachineShift['states'][number]
    x: number
    y: number
  } | null>(null)

  // ── Rango temporal ──────────────────────────────────────────────────────────
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    if (windowStart && windowEnd) return [windowStart, windowEnd]
    return [shift.shiftStart, shift.shiftEnd]
  }, [timelineSync?.range, windowStart, windowEnd, shift.shiftStart, shift.shiftEnd])

  const highlightRanges = timelineSync?.highlightRanges ?? []

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

    // Buscar estado bajo el cursor para el tooltip overlay React
    const found = shift.states.find(s =>
      rawMs >= s.startAt.getTime() && rawMs <= s.endAt.getTime(),
    )
    if (found) {
      setHoverInfo({ state: found, x: e.clientX, y: e.clientY })
    } else if (hoverInfo) {
      setHoverInfo(null)
    }

    // Sync cross-chart (crosshair en otros charts)
    const ts = timelineSyncRef.current
    if (ts) ts.setHover({ ms: Math.floor(rawMs / 60_000) * 60_000, originId: myHoverId })
  }, [myHoverId, shift.states, hoverInfo])

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null)
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
    // Tooltip nativo deshabilitado — usamos overlay React puro (ver render abajo).
    tooltip: { show: false },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      type: 'line' as const,
      lineStyle: { color: 'rgba(148,163,184,0.6)', type: 'solid' as const, width: 1 },
    },
    series: [
      // Serie visual: rectángulos coloreados de los estados
      {
        type: 'custom' as const,
        renderItem: (params: any, api: any) => {
          const start   = api.coord([api.value(0), 0])
          const end     = api.coord([api.value(1), 0])
          const widthPx = Math.max(0, end[0] - start[0])
          const yCenter = api.size([0, 1])[1] / 2
          const rect = {
            type: 'rect' as const,
            shape: { x: start[0], y: yCenter - height / 2, width: widthPx, height },
            style: {
              fill: api.value(2),
              stroke: 'rgba(15,23,42,0.4)',
              lineWidth: 0.5,
            },
            emphasis: { style: { opacity: 0.85 } },
            cursor: interactive ? 'pointer' : 'default',
          }
          // Etiqueta inline de duración — solo para PAROS (downtime/break/setup,
          // no uptime) y solo si el segmento es lo bastante ancho para leerla.
          // Antes la duración solo se veía al hover (una barra a la vez); el
          // operador pedía ver "tiempos de detención" sin tener que pasar el
          // mouse por cada una. Outline de texto (textBorderColor) para
          // legibilidad sobre cualquier color de fondo del estado.
          const st = shift.states[params.dataIndex as number]
          const MIN_LABEL_WIDTH = 30
          if (st && st.type !== 'uptime' && widthPx >= MIN_LABEL_WIDTH && height >= 14) {
            // Fondo propio (no solo textBorder) para contraste real sobre
            // cualquier color de estado — pedido Orel 2026-07-22: "el 32 min
            // no se ve bien". backgroundColor/padding/borderRadius son props
            // nativas de zrender 'text', se auto-ajustan al contenido sin
            // medir el texto a mano.
            const label = {
              type: 'text' as const,
              style: {
                text: fmtDurationSec(st.durationSec),
                x: start[0] + widthPx / 2,
                y: yCenter,
                fill: '#fff',
                backgroundColor: 'rgba(15,23,42,0.78)',
                padding: [2, 5] as [number, number],
                borderRadius: 3,
                fontSize: Math.min(12, height - 8),
                fontWeight: 700 as const,
                align: 'center' as const,
                verticalAlign: 'middle' as const,
              },
              z: 10,
              silent: true,
            }
            return { type: 'group' as const, children: [rect, label] }
          }
          return rect
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
      // No se usa para tooltip (trigger:'item' lo maneja directamente). También
      // carga el markArea de resaltado (highlightRanges): click en un evento del
      // Gantt o filtro de causal en la Cascada del turno — se ve en LAS TRES
      // Baader y en el chart de velocidad upstream, para "demostrar" cómo se
      // comportó cada máquina en ese tramo (pedido Orel 2026-07-22).
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
        markArea: highlightRanges.length > 0 ? {
          silent: true,
          itemStyle: { color: 'rgba(250,204,21,0.16)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.5)', borderType: 'dashed' as const },
          data: highlightRanges.map((r) => ([{ xAxis: r.startMs }, { xAxis: r.endMs }])),
        } : undefined,
      },
    ],
  // shift.states: renderItem lo lee directo (para la etiqueta de duración) además
  // de vía seriesData; se agrega explícito aunque cambie junto con seriesData.
  }), [rangeStart, rangeEnd, seriesData, height, lotMarkLines, interactive, shift.states, highlightRanges])

  // onEvents mínimo y estable: solo datazoom + click, sin mouse* que causarían re-bind
  const onEvents = useMemo(() => ({
    datazoom: onDataZoom,
    click:    onClick,
  }), [onDataZoom, onClick])

  // Render del overlay tooltip: vive fuera del canvas ECharts.
  // position:fixed → coordenadas viewport (e.clientX/Y), inmune a scroll/transform de padres.
  // pointerEvents:none → el cursor sigue interactuando con el chart debajo, no flickea.
  const tooltipNode = hoverInfo ? (() => {
    const st        = hoverInfo.state
    const color     = slxStateColor(st.type, st.reason, st.color)
    const cause     = st.reason || st.name
    const typeLabel = st.type === 'uptime'  ? 'Produciendo'
      : st.type === 'break'  ? 'Paro programado'
      : st.type === 'setup'  ? 'Setup'
      : 'Detención'
    // Offset cursor + clamp a viewport para que no se salga del lado derecho.
    const TOOLTIP_W = 240
    const left = Math.min(hoverInfo.x + 14, window.innerWidth - TOOLTIP_W - 8)
    const top  = hoverInfo.y + 16
    return (
      <div
        style={{
          position: 'fixed',
          left,
          top,
          zIndex: 9999,
          pointerEvents: 'none',
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: 4,
          padding: '8px 10px',
          color: '#f9fafb',
          fontSize: 11,
          lineHeight: 1.5,
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          maxWidth: TOOLTIP_W,
        }}
      >
        <div style={{ marginBottom: 2 }}>
          <span
            style={{
              display: 'inline-block',
              width: 9,
              height: 9,
              borderRadius: 2,
              background: color,
              marginRight: 5,
              verticalAlign: 'middle',
            }}
          />
          <b>{cause}</b>
        </div>
        <div style={{ color: '#9ca3af' }}>{typeLabel}</div>
        <div>⏱ <b>{fmtDurationSec(st.durationSec)}</b></div>
        <div>🕐 {fmtTime(st.startAt)} – {fmtTime(st.endAt)}</div>
      </div>
    )
  })() : null

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
      {tooltipNode}
    </div>
  )
}
