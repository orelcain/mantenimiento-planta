/**
 * ProductionRateLineEC — Gráfico de tasa de producción por Baader.
 *
 * Muestra piezas/minuto para cada máquina upstream (Baader 142 × N) y el
 * promedio de la línea, todo solapado en el mismo eje temporal. Permite
 * identificar cuál máquina baja primero y qué tan sincronizadas están.
 *
 * Sincroniza con TimelineSyncContext: zoom + axisPointer cross-chart.
 *
 * Datos de entrada: `machines[].intervals` (buckets de 5 min con `cycles`).
 * Rate = cycles / duracion_min del intervalo.
 */

import { useCallback, useEffect, useId, useMemo, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import { useTimelineSyncOptional } from './useTimelineSync'
import { useChartReadyConnect } from './useEChartsConnect'
import { fmtTime } from '@/services/grader/graderTimeFormat'

// ── Colores por máquina (sky, violet, emerald) + ámbar para el promedio ──────
const MACHINE_COLORS = [
  { line: 'rgba(56,189,248,0.9)',  area: 'rgba(56,189,248,0.08)'  },  // sky-400
  { line: 'rgba(167,139,250,0.9)', area: 'rgba(167,139,250,0.08)' },  // violet-400
  { line: 'rgba(52,211,153,0.9)',  area: 'rgba(52,211,153,0.08)'  },  // emerald-400
  { line: 'rgba(251,191,36,0.9)',  area: 'rgba(251,191,36,0.06)'  },  // amber-400 (más)
]
const AVG_COLOR  = { line: 'rgba(251,191,36,0.95)', area: 'rgba(251,191,36,0.12)' }  // amber
const GRID_COLOR = '#1e293b'

interface Props {
  machines: UpstreamMachineShift[]
  windowStart?: Date
  windowEnd?: Date
}

// ── Helper: toma nombre de máquina y devuelve etiqueta corta ─────────────────
function shortMachineName(name: string): string {
  // "Baader 142 / 1" → "B1" | "Evisceradora 1" → "E1" | fallback: primeras 4 chars
  const mSlash = name.match(/\/\s*(\d+)$/)
  if (mSlash) return `B${mSlash[1]}`
  const mNum = name.match(/(\d+)$/)
  if (mNum) return `M${mNum[1]}`
  return name.slice(0, 4)
}

/** Compila series de tasa pz/min unificando todos los buckets de tiempo. */
function buildRateSeries(machines: UpstreamMachineShift[]): {
  timeAxis: number[]
  series: { name: string; data: (number | null)[] }[]
  avgSeries: { name: string; data: (number | null)[] }
  expectedRate: number
} {
  if (machines.length === 0) {
    return { timeAxis: [], series: [], avgSeries: { name: 'Promedio', data: [] }, expectedRate: 0 }
  }

  // Colección de todos los timestamps únicos (alineados al inicio del bucket)
  const tsSet = new Set<number>()
  for (const m of machines) {
    for (const iv of m.intervals) tsSet.add(iv.startAt.getTime())
  }
  const timeAxis = [...tsSet].sort((a, b) => a - b)

  // Índice de cycles por máquina y timestamp
  const machineRates: Map<number, number>[] = machines.map((m) => {
    const map = new Map<number, number>()
    for (const iv of m.intervals) {
      const durationMin = Math.max(1, (iv.endAt.getTime() - iv.startAt.getTime()) / 60_000)
      map.set(iv.startAt.getTime(), iv.cycles / durationMin)
    }
    return map
  })

  const series = machines.map((m, i) => ({
    name: shortMachineName(m.machineName),
    data: timeAxis.map((ts) => {
      const r = machineRates[i]!.get(ts)
      return r !== undefined ? Math.round(r * 10) / 10 : null
    }),
  }))

  // Promedio: solo promediamos máquinas que tienen dato en ese bucket
  const avgData = timeAxis.map((ts) => {
    const vals = machineRates
      .map((r) => r.get(ts))
      .filter((v): v is number => v !== undefined)
    if (vals.length === 0) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  })

  // Expected rate: primer bucket con expectedCycles > 0
  let expectedRate = 0
  for (const m of machines) {
    const iv = m.intervals.find((x) => x.expectedCycles > 0)
    if (iv) {
      const durationMin = Math.max(1, (iv.endAt.getTime() - iv.startAt.getTime()) / 60_000)
      expectedRate = iv.expectedCycles / durationMin
      break
    }
  }

  return {
    timeAxis,
    series,
    avgSeries: { name: 'Promedio', data: avgData },
    expectedRate,
  }
}

export function ProductionRateLineEC({ machines, windowStart, windowEnd }: Props) {
  const echartsRef = useRef<any>(null)
  const myHoverId  = useId()
  const timelineSync = useTimelineSyncOptional()
  const onChartReady = useChartReadyConnect(timelineSync?.connectGroupId ?? '__no-sync__')

  const { timeAxis, series, avgSeries, expectedRate } = useMemo(
    () => buildRateSeries(machines),
    [machines],
  )

  // Rango temporal efectivo
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    if (windowStart && windowEnd) return [windowStart, windowEnd]
    if (timeAxis.length >= 2) {
      return [new Date(timeAxis[0]!), new Date(timeAxis[timeAxis.length - 1]!)]
    }
    return [new Date(), new Date()]
  }, [timelineSync?.range, windowStart, windowEnd, timeAxis])

  // Hover cross-chart
  const onMouseMove = useCallback((params: any) => {
    if (!timelineSync) return
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    const offsetX = params?.event?.offsetX ?? params?.offsetX
    if (typeof offsetX !== 'number') return
    const rawMs = inst.convertFromPixel({ xAxisIndex: 0 }, offsetX)
    if (typeof rawMs !== 'number' || !Number.isFinite(rawMs)) return
    timelineSync.setHover({ ms: Math.floor(rawMs / 60_000) * 60_000, originId: myHoverId })
  }, [timelineSync, myHoverId])

  const onMouseOut = useCallback(() => {
    if (timelineSync?.hover?.originId === myHoverId) timelineSync.setHover(null)
  }, [timelineSync, myHoverId])

  const externalHoverMs = timelineSync?.hover?.originId !== myHoverId
    ? timelineSync?.hover?.ms ?? null
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
    inst.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'mousemove', x: pixelX, y: 30 })
  }, [externalHoverMs])

  // Zoom sync
  const onDataZoom = useCallback(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst || !timelineSync) return
    const opt = inst.getOption?.()
    const dz = Array.isArray(opt?.dataZoom) ? opt.dataZoom[0] : null
    if (!dz) return
    const startMs = typeof dz.startValue === 'number' ? dz.startValue : null
    const endMs   = typeof dz.endValue   === 'number' ? dz.endValue   : null
    if (startMs == null || endMs == null) return
    const totalMs = rangeEnd.getTime() - rangeStart.getTime()
    if ((endMs - startMs) / totalMs >= 0.995) { timelineSync.setRange(null); return }
    timelineSync.setRange({ startMs, endMs })
  }, [timelineSync, rangeStart, rangeEnd])

  // Max Y para escalar bien
  const maxRate = useMemo(() => {
    let m = expectedRate * 1.3 || 1
    for (const s of series) {
      for (const v of s.data) { if (v != null && v > m) m = v }
    }
    for (const v of avgSeries.data) { if (v != null && v > m) m = v }
    return Math.ceil(m)
  }, [series, avgSeries, expectedRate])

  const option = useMemo(() => {
    const machineSeries = series.map((s, i) => {
      const col = MACHINE_COLORS[i % MACHINE_COLORS.length]!
      return {
        name:        s.name,
        type:        'line' as const,
        data:        timeAxis.map((ts, ti) => [ts, s.data[ti]] as [number, number | null]),
        smooth:      0.3,
        connectNulls: false,
        symbol:      'circle',
        symbolSize:  4,
        lineStyle:   { color: col.line, width: 1.5 },
        itemStyle:   { color: col.line },
        areaStyle:   { color: col.area },
        emphasis:    { lineStyle: { width: 2.5 } },
      }
    })

    const avgS = {
      name:        'Promedio',
      type:        'line' as const,
      data:        timeAxis.map((ts, ti) => [ts, avgSeries.data[ti]] as [number, number | null]),
      smooth:      0.3,
      connectNulls: false,
      symbol:      'diamond',
      symbolSize:  5,
      lineStyle:   { color: AVG_COLOR.line, width: 2.5 },
      itemStyle:   { color: AVG_COLOR.line },
      areaStyle:   { color: AVG_COLOR.area },
      z:           5,
      emphasis:    { lineStyle: { width: 3.5 } },
      // markLine objetivo
      markLine: expectedRate > 0 ? {
        silent: true,
        animation: false,
        data: [{
          yAxis: expectedRate,
          lineStyle: { color: 'rgba(139,92,246,0.6)', type: 'dashed', width: 1 },
          label: {
            show: true,
            formatter: `${expectedRate.toFixed(0)} pz/m`,
            color: 'rgba(139,92,246,0.9)',
            fontSize: 9,
            position: 'end',
          },
        }],
      } : undefined,
    }

    return {
      backgroundColor: 'transparent',
      grid:   { left: 0, right: 0, top: 6, bottom: 0, containLabel: true },
      legend: {
        show: true,
        top: 0,
        right: 0,
        textStyle: { color: '#64748b', fontSize: 9 },
        itemWidth: 12,
        itemHeight: 8,
        data: [...series.map(s => s.name), 'Promedio'],
      },
      xAxis: {
        type: 'time' as const,
        min:  rangeStart.getTime(),
        max:  rangeEnd.getTime(),
        axisLine: { show: false },
        axisTick: { show: true, lineStyle: { color: GRID_COLOR }, length: 3 },
        axisLabel: {
          show: true,
          color: '#64748b',
          fontSize: 9,
          formatter: (value: number) => fmtTime(value),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type:  'value' as const,
        min:   0,
        max:   maxRate,
        name:  'pz/min',
        nameTextStyle: { color: '#475569', fontSize: 8 },
        axisLine:  { show: false },
        axisTick:  { show: false },
        axisLabel: { show: true, color: '#475569', fontSize: 9, formatter: (v: number) => v.toFixed(0) },
        splitLine: { lineStyle: { color: GRID_COLOR, type: 'dashed' } },
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1f2937',
        borderColor:     '#374151',
        textStyle:       { color: '#f1f5f9', fontSize: 11 },
        axisPointer: {
          type:      'line' as const,
          lineStyle: { color: '#475569', type: 'dashed', width: 1 },
        },
        formatter: (params: any[]) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const ts  = params[0]?.value?.[0] as number
          const time = fmtTime(ts)
          const rows = params
            .filter(p => p.value?.[1] != null)
            .map(p => {
              const v = p.value[1] as number
              return `<span style="color:${p.color}">●</span> ${p.seriesName}: <strong>${v.toFixed(1)}</strong> pz/min`
            })
            .join('<br/>')
          return `<div style="font-size:10px;color:#94a3b8">${time}</div>${rows}`
        },
      },
      dataZoom: timelineSync ? [{
        type: 'inside' as const,
        xAxisIndex: 0,
        startValue: rangeStart.getTime(),
        endValue:   rangeEnd.getTime(),
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseWheel: false,
      }] : [],
      series: [...machineSeries, avgS],
    }
  }, [series, avgSeries, timeAxis, rangeStart, rangeEnd, maxRate, expectedRate, timelineSync])

  if (timeAxis.length < 2) return null

  return (
    <ReactECharts
      ref={echartsRef}
      option={option}
      style={{ height: 120, width: '100%' }}
      onChartReady={onChartReady}
      onEvents={{
        mousemove: onMouseMove,
        mouseout:  onMouseOut,
        dataZoom:  onDataZoom,
      }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
