/**
 * PieceScatterChart — dispersión segundo a segundo de piezas P0.
 *
 * Cada punto = 1 pieza rechazada (gate 0).
 * X = timestamp real (resolución segundos — vs. minutos del timeline principal).
 * Y = peso por pieza (gramos) si ≥20% de las piezas tienen el dato;
 *     jitter visual determinístico en caso contrario.
 * Color = causa Matrix.
 *
 * Valor diferencial respecto del timeline: ver ráfagas de rechazos dentro
 * de un mismo minuto y ver si el peso de las piezas rechazadas tiene un
 * perfil por causa (e.g. "fuera de límites" ocurre en piezas <300 g).
 *
 * Solo se monta cuando hay ≥ 5 piezas P0. Colapsado por defecto.
 */

import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent } from '@/components/ui'
import { Crosshair, ChevronDown, ChevronUp } from 'lucide-react'
import { fmtTime, fmtTimeWithSec } from '@/services/grader/graderTimeFormat'
import { parseMatrixErrorString } from '@/services/grader/graderMatrixP0Causes'
import type { FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'

const MIN_PIECES = 5

// Colores ECharts por causa — alineados con el color semántico de MATRIX_P0_CAUSES
const CAUSE_COLOR: Record<string, string> = {
  fuera_de_limites:      'rgba(239,68,68,0.85)',    // red-500
  no_leido_fotocelula:   'rgba(245,158,11,0.85)',   // amber-500
  too_close_too_long:    'rgba(180,83,9,0.85)',     // brown (amber-700)
  puerta_no_preparada:   'rgba(59,130,246,0.85)',   // blue-500
  fuera_de_calibre:      'rgba(249,115,22,0.85)',   // orange-500
  fuera_de_calidad:      'rgba(168,85,247,0.85)',   // purple-500
  fuera_de_conservacion: 'rgba(6,182,212,0.85)',    // cyan-500
  fuera_de_producto:     'rgba(16,185,129,0.85)',   // emerald-500
  otro:                  'rgba(113,113,122,0.85)',  // zinc-500
}

const CAUSE_LABEL: Record<string, string> = {
  fuera_de_limites:      'Fuera límites',
  no_leido_fotocelula:   'Sin fotocélula',
  too_close_too_long:    'Too close/long',
  puerta_no_preparada:   'Puerta no prep.',
  fuera_de_calibre:      'Fuera calibre',
  fuera_de_calidad:      'Fuera calidad',
  fuera_de_conservacion: 'Fuera conserv.',
  fuera_de_producto:     'Fuera producto',
  otro:                  'Otro',
}

export interface PieceScatterChartProps {
  gate0Pieces: FirestorePieceRecord[]
}

export function PieceScatterChart({ gate0Pieces }: PieceScatterChartProps) {
  const [expanded, setExpanded] = useState(false)

  // ── Todos los hooks ANTES del early return (rules-of-hooks) ─────────────

  // Normalizar causa + extraer peso de cada registro
  const processed = useMemo(() => gate0Pieces.map((r, idx) => ({
    tsMs: Date.parse(r.ts),
    tsIso: r.ts,
    cause: parseMatrixErrorString(r.error ?? ''),
    weightGrams: r.weightPerPieceGrams ?? (r.weightKg != null ? r.weightKg * 1000 : null),
    idx,
  })), [gate0Pieces])

  // % de piezas con dato de peso (calculado antes del return para poder usarlo en option)
  const weightPct = processed.length > 0
    ? (processed.filter(p => p.weightGrams != null).length / processed.length) * 100
    : 0
  const hasWeight = weightPct >= 20

  // Conteo por causa para KPI badges
  const causeCounts = useMemo(() => {
    const acc = new Map<string, number>()
    for (const p of processed) acc.set(p.cause, (acc.get(p.cause) ?? 0) + 1)
    return [...acc.entries()].sort((a, b) => b[1] - a[1])
  }, [processed])

  // Construcción de series ECharts (una por causa)
  const option = useMemo(() => {
    if (processed.length === 0) return {}

    const causeMap = new Map<string, typeof processed>()
    for (const p of processed) {
      const list = causeMap.get(p.cause) ?? []
      list.push(p)
      causeMap.set(p.cause, list)
    }

    const series: object[] = []
    let seriesIdx = 0
    for (const [cause, points] of causeMap) {
      const color = CAUSE_COLOR[cause] ?? CAUSE_COLOR['otro']!
      const data = points.map((p, i) => {
        // Y = peso en gramos si disponible; jitter determinístico si no.
        // Desplazamiento por pieza para evitar apilamiento total en eje Y.
        const y = p.weightGrams != null
          ? p.weightGrams
          : 10 + ((seriesIdx * 19 + i * 7) % 80)
        return { value: [p.tsMs, y, p.tsIso] }
      })
      seriesIdx++
      series.push({
        name: CAUSE_LABEL[cause] ?? cause,
        type: 'scatter',
        data,
        symbolSize: 5,
        itemStyle: { color, borderWidth: 0 },
        emphasis: { scale: 1.6, itemStyle: { opacity: 1 } },
      })
    }

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 44, right: 12, top: 8, bottom: 60, containLabel: false },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const [, y, tsIso] = params.value as [number, number, string]
          const weightLine = hasWeight ? `<br/>Peso: <b>${Math.round(y)} g</b>` : ''
          return `<b>${fmtTimeWithSec(tsIso)}</b>${weightLine}<br/>Causa: ${params.seriesName as string}`
        },
      },
      legend: {
        show: true,
        bottom: 0,
        textStyle: { color: '#64748b', fontSize: 9 },
        itemWidth: 10,
        itemHeight: 8,
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'filter' },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 14,
          bottom: 38,
          textStyle: { color: '#64748b', fontSize: 8 },
          borderColor: '#334155',
          fillerColor: 'rgba(100,116,139,0.15)',
          handleStyle: { color: '#64748b' },
        },
      ],
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#1e293b' } },
        axisTick: { lineStyle: { color: '#334155' } },
        axisLabel: {
          color: '#64748b',
          fontSize: 9,
          formatter: (val: number) => fmtTime(val),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: hasWeight ? 'Peso (g)' : '',
        nameTextStyle: { color: '#64748b', fontSize: 8 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: hasWeight
          ? { color: '#64748b', fontSize: 9, formatter: (v: number) => `${Math.round(v)}g` }
          : { show: false },
        splitLine: hasWeight
          ? { lineStyle: { color: '#1e293b', type: 'dashed' } }
          : { show: false },
      },
      series,
    }
  }, [processed, hasWeight])

  // Early return post-hooks (ver patrón UpstreamScatterCard)
  if (processed.length < MIN_PIECES) return null

  return (
    <Card className="border-border bg-card dark:border-slate-800 dark:bg-slate-950/50">
      <CardContent className="py-3 px-4">
        {/* Header — clic para expandir/colapsar */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Crosshair className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="font-medium text-sm">Dispersión P0 por pieza</span>
            <span
              className="text-xs text-muted-foreground tabular-nums truncate cursor-help"
              title={`Cada punto = 1 pieza P0 (rechazada). Eje X = momento de paso por el Marelec, eje Y = peso en gramos. ${hasWeight ? `${Math.round(weightPct)}% de las piezas P0 tienen peso registrado por el Marelec — el resto pasaron por gate=0 sin peso (típicamente "no leído por fotocélula" o "productos demasiado próximos").` : 'Ninguna de estas piezas tiene peso registrado — el Marelec no pudo pesarlas individualmente.'}`}
            >
              · {processed.length} piezas
              {hasWeight ? ` · ${Math.round(weightPct)}% con peso` : ''}
            </span>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </button>

        {/* KPI badges: top 4 causas con conteo */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {causeCounts.slice(0, 4).map(([cause, count]) => {
            const color = CAUSE_COLOR[cause] ?? CAUSE_COLOR['otro']!
            return (
              <span
                key={cause}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border tabular-nums"
                style={{
                  borderColor: color.replace('0.85)', '0.35)'),
                  color: color.replace('0.85)', '1)'),
                  backgroundColor: color.replace('0.85)', '0.08)'),
                }}
              >
                <span className="font-semibold">{count}</span>
                {CAUSE_LABEL[cause] ?? cause}
              </span>
            )
          })}
        </div>

        {/* Chart (colapsado por defecto) */}
        {expanded && (
          <>
            <p className="text-[10px] text-slate-500 mt-2 mb-1">
              Cada punto = 1 pieza rechazada · X = hora exacta (segundos)
              {hasWeight ? ' · Y = peso por pieza (g)' : ' · Y = posición visual — sin peso disponible'}
              {' · '}Zoom con scroll o el slider inferior
            </p>
            <ReactECharts
              option={option}
              style={{ width: '100%', height: 260 }}
              opts={{ renderer: 'canvas' }}
              notMerge
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
