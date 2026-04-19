/**
 * Visualización del timeline de turno: pulso P0% minuto a minuto +
 * checkpoints de uploads y acciones marcados como líneas verticales.
 *
 * Cuando el usuario clica una causa del P0CausesPanel, el timeline agrega
 * una capa de scatter points (una por cada pieza gate=0 de esa causa),
 * con peso en Y y color por causa.
 *
 * Usa ECharts (consistente con GraderTimelineChart).
 */

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { Upload, Wrench, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineBucket, MatrixP0Cause } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'
import { MATRIX_P0_CAUSES } from '@/services/grader/graderMatrixP0Causes'
import { classifyRecordToMatrix, CALIBRE_WEIGHT_RANGES } from '@/services/grader/graderAnalytics'

interface ShiftTimelineViewProps {
  timelineBuckets: TimelineBucket[]
  shiftDoc: GraderShiftDoc | null
  shiftWindow: ShiftTimeWindow
  /** Historial de cambios de config de gates (FASE 27) */
  configSnapshots?: GateConfigSnapshot[]
  /** Piezas gate=0 del turno (enriquecidas con peso+error por P0_EXCEL) */
  gate0Pieces?: FirestorePieceRecord[]
  /** Causas seleccionadas (multi-select) en el P0CausesPanel — filtran el scatter */
  selectedCauses?: Set<MatrixP0Cause>
  /** Callback para limpiar todas las selecciones desde el badge */
  onClearSelectedCauses?: () => void
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

/** Mapeo Tailwind → hex aproximado para ECharts (tailwind se resuelve server-side). */
const CAUSE_HEX: Record<MatrixP0Cause, string> = {
  fuera_de_limites:     '#ef4444', // red-500
  no_leido_fotocelula:  '#f97316', // orange-500
  too_close_too_long:   '#a855f7', // purple-500
  puerta_no_preparada:  '#06b6d4', // cyan-500
  fuera_de_calibre:     '#6366f1', // indigo-500
  fuera_de_calidad:     '#10b981', // emerald-500
  fuera_de_conservacion:'#f59e0b', // amber-500
  fuera_de_producto:    '#92400e', // amber-800
  otro:                 '#71717a', // zinc-500
}

/**
 * Clasifica una pieza gate=0 a su MatrixP0Cause final, usando la config de
 * gates más reciente del turno (la última snapshot disponible, o la única si
 * sólo hay una). Para piezas sin error explícito o con "Fuera de límites" hace
 * descomposición en sub-causa (calidad/calibre/etc.) cuando hay datos por pieza.
 *
 * Si no hay configSnapshots, las sub-causas no se distinguen — el paraguas
 * "Fuera de límites" agrupa todo.
 */
function classifyPiece(piece: FirestorePieceRecord, configSnapshots?: GateConfigSnapshot[]): MatrixP0Cause {
  // Encontrar el snapshot más reciente con at <= piece.ts (o el último si todos son posteriores)
  let activeGates: GateConfigSnapshot['gates'] = []
  if (configSnapshots && configSnapshots.length > 0) {
    const eligible = configSnapshots.filter(s => s.at <= piece.ts)
    activeGates = (eligible[eligible.length - 1] ?? configSnapshots[configSnapshots.length - 1]).gates
  }
  // El record para classifyRecordToMatrix debe verse como Gate0Record
  const gate0Record = {
    ts: piece.ts,
    pieces: piece.pieces,
    weightKg: piece.weightKg,
    weightPerPieceGrams: piece.weightPerPieceGrams,
    quality: piece.quality,
    calibre: piece.calibre,
    error: piece.error ?? '',
  } as Parameters<typeof classifyRecordToMatrix>[0]
  return classifyRecordToMatrix(gate0Record, activeGates, CALIBRE_WEIGHT_RANGES)
}


export function ShiftTimelineView({
  timelineBuckets, shiftDoc, shiftWindow, configSnapshots,
  gate0Pieces, selectedCauses, onClearSelectedCauses,
}: ShiftTimelineViewProps) {
  const causesArr = useMemo(() => [...(selectedCauses ?? new Set<MatrixP0Cause>())], [selectedCauses])
  const hasSelection = causesArr.length > 0

  // Indexar piezas con peso por su causa clasificada (cliente-side)
  const piecesByCause = useMemo(() => {
    type Point = { time: string; grams: number; ts: string; calibre?: string; quality?: string; error?: string }
    const map = new Map<MatrixP0Cause, Point[]>()
    if (!hasSelection || !gate0Pieces || gate0Pieces.length === 0) return map
    for (const p of gate0Pieces) {
      const grams = p.weightPerPieceGrams ?? (p.weightKg ? p.weightKg * 1000 : 0)
      if (grams <= 0) continue
      const cause = classifyPiece(p, configSnapshots)
      if (!causesArr.includes(cause)) continue
      const pt: Point = { time: fmtTime(p.ts), grams, ts: p.ts, calibre: p.calibre, quality: p.quality, error: p.error }
      if (!map.has(cause)) map.set(cause, [])
      map.get(cause)!.push(pt)
    }
    return map
  }, [causesArr, hasSelection, gate0Pieces, configSnapshots])

  const totalScatterPts = [...piecesByCause.values()].reduce((s, arr) => s + arr.length, 0)
  const scatterAxisShow = totalScatterPts > 0

  const chartOption = useMemo(() => {
    const buckets = timelineBuckets.filter(b => b.pieces > 0)
    const times = buckets.map(b => fmtTime(b.tsMin))
    const p0Pcts = buckets.map(b => b.pieces > 0 ? +((b.p0Pieces / b.pieces) * 100).toFixed(1) : 0)

    // Checkpoints como markLine
    const uploadLines = (shiftDoc?.uploads ?? []).map(u => ({
      name: `Upload\n${fmtTime(u.at)}`,
      xAxis: fmtTime(u.at),
      lineStyle: { color: '#3b82f6', type: 'dashed' as const, width: 1.5 },
      label: { show: true, formatter: '↑', color: '#3b82f6', fontSize: 10 },
    }))

    const actionLines = (shiftDoc?.actions ?? []).map(a => ({
      name: `Acción\n${fmtTime(a.at)}`,
      xAxis: fmtTime(a.at),
      lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1.5 },
      label: { show: true, formatter: '⚙', color: '#f59e0b', fontSize: 10 },
    }))

    // Markers de cambio de config de gates (FASE 27) — skip primer snapshot (config inicial)
    const configChangeLines = (configSnapshots ?? []).slice(1).map(s => ({
      name: `Config gates\n${fmtTime(s.at)}`,
      xAxis: fmtTime(s.at),
      lineStyle: { color: '#06b6d4', type: 'dashed' as const, width: 1.5 },
      label: { show: true, formatter: '🔧', color: '#06b6d4', fontSize: 10 },
    }))

    return {
      backgroundColor: 'transparent',
      // Más margen bajo para el slider de zoom
      grid: { left: 40, right: 16, top: 20, bottom: 60 },
      toolbox: {
        right: 10,
        top: 0,
        feature: {
          dataZoom: { yAxisIndex: false, title: { zoom: 'Zoom', back: 'Reset zoom' } },
          restore: { title: 'Resetear' },
        },
        iconStyle: { borderColor: '#6b7280' },
        emphasis: { iconStyle: { borderColor: '#f9fafb' } },
      },
      // Zoom: rueda para pan, slider visible, pinch-zoom en móvil
      dataZoom: [
        { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false },
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 18,
          bottom: 10,
          backgroundColor: '#1f2937',
          fillerColor: 'rgba(239,68,68,0.2)',
          borderColor: '#374151',
          handleStyle: { color: '#ef4444' },
          moveHandleStyle: { color: '#ef4444' },
          emphasis: { handleStyle: { color: '#f87171' } },
          textStyle: { color: '#6b7280', fontSize: 9 },
        },
      ],
      xAxis: {
        type: 'category' as const,
        data: times,
        axisLine: { lineStyle: { color: '#374151' } },
        axisLabel: { color: '#6b7280', fontSize: 10, interval: Math.floor(times.length / 8) },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: 'P0%',
          nameTextStyle: { color: '#6b7280', fontSize: 10 },
          axisLabel: { color: '#6b7280', fontSize: 10, formatter: '{value}%' },
          splitLine: { lineStyle: { color: '#1f2937' } },
          min: 0,
          // Escala dinámica: techo = max(10, p98 + 20%) para que la línea se lea
          // bien cuando el P0% es bajo, sin que outliers iniciales (turnos
          // arrancando con 100% si sólo hubo 1 pieza) aplasten todo el chart.
          max: (() => {
            const sorted = [...p0Pcts].filter(v => v > 0).sort((a, b) => a - b)
            if (sorted.length === 0) return 10
            const p98 = sorted[Math.floor(sorted.length * 0.98)] ?? sorted[sorted.length - 1] ?? 10
            const ceil = Math.ceil(p98 * 1.2 / 5) * 5  // redondear a múltiplo de 5
            return Math.max(10, ceil)
          })(),
        },
        {
          type: 'value' as const,
          name: 'Peso (g)',
          nameTextStyle: { color: '#6b7280', fontSize: 10 },
          axisLabel: { color: '#6b7280', fontSize: 10, formatter: '{value} g' },
          splitLine: { show: false },
          min: 0,
          show: scatterAxisShow,
        },
      ],
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontSize: 11 },
        formatter: (params: unknown[]) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const arr = params as Array<{ name: string; value: number | [string, number]; seriesName: string; seriesType: string; dataIndex: number; color?: string }>
          const linePt = arr.find(p => p.seriesType === 'line')
          const scatterPts = arr.filter(p => p.seriesType === 'scatter')
          const time = linePt?.name ?? (Array.isArray(scatterPts[0]?.value) ? scatterPts[0].value[0] : '')
          const lines: string[] = [time]
          if (linePt) lines.push(`P0: <b>${linePt.value}%</b>`)
          for (const sp of scatterPts) {
            const v = Array.isArray(sp.value) ? sp.value[1] : sp.value
            lines.push(`<span style="color:${sp.color}">●</span> ${sp.seriesName}: ${v}g`)
          }
          return lines.join('<br/>')
        },
      },
      series: [
        {
          name: 'P0%',
          type: 'line' as const,
          yAxisIndex: 0,
          data: p0Pcts,
          smooth: true,
          lineStyle: { color: '#ef4444', width: 2 },
          areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(239,68,68,0.25)' }, { offset: 1, color: 'rgba(239,68,68,0)' }] } },
          symbol: 'none',
          markLine: {
            silent: false,
            animation: false,
            data: [...uploadLines, ...actionLines, ...configChangeLines],
          },
        },
        // Una serie scatter por cada causa seleccionada (multi-select)
        ...causesArr.map(cause => {
          const pts = piecesByCause.get(cause) ?? []
          const color = CAUSE_HEX[cause] ?? '#ef4444'
          return {
            name: MATRIX_P0_CAUSES[cause].label,
            type: 'scatter' as const,
            yAxisIndex: 1,
            data: pts.map(p => [p.time, p.grams]),
            symbolSize: 6,
            itemStyle: {
              color,
              opacity: 0.75,
              borderColor: '#1f2937',
              borderWidth: 0.5,
            },
            emphasis: { itemStyle: { opacity: 1, borderWidth: 2, borderColor: '#f9fafb' } },
            z: 5,
          }
        }),
      ],
    }
  }, [timelineBuckets, shiftDoc, configSnapshots, causesArr, piecesByCause, scatterAxisShow])

  // Lista cronológica de checkpoints
  const checkpoints = useMemo(() => {
    const list: Array<{
      kind: 'upload' | 'action'
      at: string
      label: string
      sub: string
      verdict?: string
    }> = []

    for (const u of shiftDoc?.uploads ?? []) {
      const files = [u.files.pp && 'PP', u.files.p0 && 'P0'].filter(Boolean).join(' + ')
      list.push({
        kind: 'upload',
        at: u.at,
        label: `Carga: ${files}`,
        sub: `${u.byName} · ${u.snapshot.totalPieces.toLocaleString('es-CL')} pzas · P0 ${u.snapshot.p0Pct.toFixed(1)}%`,
      })
    }

    for (const a of shiftDoc?.actions ?? []) {
      list.push({
        kind: 'action',
        at: a.at,
        label: a.field,
        sub: `${a.byName}${a.reason ? ` · ${a.reason}` : ''}`,
        verdict: a.outcome?.verdict,
      })
    }

    return list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [shiftDoc])

  const hasData = timelineBuckets.some(b => b.pieces > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Timeline del turno
          {shiftWindow.status === 'live' && (
            <span className="text-xs font-normal text-red-400 animate-pulse">● en vivo</span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasSelection && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/60 bg-muted/30 text-xs flex-wrap">
            <span className="text-muted-foreground shrink-0">Mostrando:</span>
            {causesArr.map(cause => {
              const color = CAUSE_HEX[cause] ?? '#ef4444'
              const label = MATRIX_P0_CAUSES[cause].label
              const count = (piecesByCause.get(cause) ?? []).length
              return (
                <span
                  key={cause}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium"
                  style={{ borderColor: color + '60', backgroundColor: color + '15', color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                  <span className="text-muted-foreground/80 font-normal">{count.toLocaleString('es-CL')}</span>
                </span>
              )
            })}
            <span className="text-muted-foreground ml-1">
              · {totalScatterPts.toLocaleString('es-CL')} pzas con peso
            </span>
            {onClearSelectedCauses && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={onClearSelectedCauses}
              >
                <X className="w-3 h-3 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        )}
        {!hasData ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Sin datos de minuto a minuto para este turno.
          </p>
        ) : (
          <ReactECharts
            option={chartOption}
            style={{ height: scatterAxisShow ? 240 : 180 }}
            theme="dark"
            opts={{ renderer: 'svg' }}
          />
        )}

        {/* Checkpoints list */}
        {checkpoints.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Eventos del turno
            </p>
            {checkpoints.map((cp, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs">
                <span className="shrink-0 mt-0.5">
                  {cp.kind === 'upload'
                    ? <Upload className="w-3.5 h-3.5 text-blue-400" />
                    : <Wrench className="w-3.5 h-3.5 text-amber-400" />}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums w-11">
                  {fmtTime(cp.at)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{cp.label}</span>
                  <span className="text-muted-foreground ml-1.5">{cp.sub}</span>
                  {cp.verdict && cp.verdict !== 'insufficient-data' && (
                    <span
                      className={cn('ml-2 font-medium', {
                        'text-emerald-400': cp.verdict === 'improved',
                        'text-red-400': cp.verdict === 'worsened',
                        'text-zinc-400': cp.verdict === 'neutral',
                      })}
                    >
                      {cp.verdict === 'improved' ? '↓ mejoró'
                        : cp.verdict === 'worsened' ? '↑ empeoró'
                        : '→ sin cambio'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {checkpoints.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Sin cargas ni acciones registradas para este turno.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
