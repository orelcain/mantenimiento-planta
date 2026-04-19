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
import { parseMatrixErrorString, MATRIX_P0_CAUSES, MATRIX_CAUSE_ORDER_DERIVED } from '@/services/grader/graderMatrixP0Causes'

interface ShiftTimelineViewProps {
  timelineBuckets: TimelineBucket[]
  shiftDoc: GraderShiftDoc | null
  shiftWindow: ShiftTimeWindow
  /** Historial de cambios de config de gates (FASE 27) */
  configSnapshots?: GateConfigSnapshot[]
  /** Piezas gate=0 del turno (enriquecidas con peso+error por P0_EXCEL) */
  gate0Pieces?: FirestorePieceRecord[]
  /** Causa seleccionada en el P0CausesPanel — filtra el scatter */
  selectedCause?: MatrixP0Cause | null
  /** Callback para limpiar la selección desde el badge */
  onClearSelectedCause?: () => void
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
 * ¿El record pertenece a la causa seleccionada?
 * Lógica MVP:
 *  - Causas OFICIALES (no_leido_fotocelula, too_close_too_long, puerta_no_preparada):
 *    match directo por error string via parseMatrixErrorString.
 *  - "fuera_de_limites" (paraguas): todas las piezas con error "Fuera de límites"
 *    (incluye las sub-causas derivadas; no distinguimos aún en el front).
 *  - Sub-causas DERIVADAS (fuera_de_calidad, fuera_de_calibre, etc.):
 *    mismo bucket que el paraguas por ahora (se mostrarán todas las "Fuera de límites").
 *    TODO futuro: clasificar con classifyRecordToMatrix + config de gates del momento.
 */
function pieceMatchesCause(piece: FirestorePieceRecord, cause: MatrixP0Cause): boolean {
  const parsed = parseMatrixErrorString(piece.error ?? '')
  if (cause === 'fuera_de_limites' || MATRIX_CAUSE_ORDER_DERIVED.includes(cause)) {
    // Paraguas o sub-causa derivada → todas las "Fuera de límites"
    return parsed === 'fuera_de_limites' || parsed == null
  }
  return parsed === cause
}


export function ShiftTimelineView({
  timelineBuckets, shiftDoc, shiftWindow, configSnapshots,
  gate0Pieces, selectedCause, onClearSelectedCause,
}: ShiftTimelineViewProps) {
  // Piezas filtradas por causa seleccionada → scatter points
  const scatterPoints = useMemo(() => {
    if (!selectedCause || !gate0Pieces || gate0Pieces.length === 0) return []
    const filtered = gate0Pieces.filter(p => pieceMatchesCause(p, selectedCause))
    return filtered
      .filter(p => p.weightPerPieceGrams != null || p.weightKg != null)
      .map(p => {
        const grams = p.weightPerPieceGrams ?? (p.weightKg ? p.weightKg * 1000 : 0)
        return {
          time: fmtTime(p.ts),
          grams,
          ts: p.ts,
          calibre: p.calibre,
          quality: p.quality,
          error: p.error,
        }
      })
  }, [selectedCause, gate0Pieces])

  const scatterColor = selectedCause ? CAUSE_HEX[selectedCause] ?? '#ef4444' : '#ef4444'
  const scatterLabel = selectedCause ? MATRIX_P0_CAUSES[selectedCause].label : null

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
        },
        {
          type: 'value' as const,
          name: 'Peso (g)',
          nameTextStyle: { color: '#6b7280', fontSize: 10 },
          axisLabel: { color: scatterColor, fontSize: 10, formatter: '{value} g' },
          splitLine: { show: false },
          min: 0,
          show: scatterPoints.length > 0,
        },
      ],
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontSize: 11 },
        formatter: (params: unknown[]) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const arr = params as Array<{ name: string; value: number | [string, number]; seriesName: string; seriesType: string; dataIndex: number }>
          const linePt = arr.find(p => p.seriesType === 'line')
          const scatterPts = arr.filter(p => p.seriesType === 'scatter')
          const time = linePt?.name ?? (Array.isArray(scatterPts[0]?.value) ? scatterPts[0].value[0] : '')
          const lines: string[] = [time]
          if (linePt) lines.push(`P0: <b>${linePt.value}%</b>`)
          for (const sp of scatterPts) {
            const v = Array.isArray(sp.value) ? sp.value[1] : sp.value
            const pt = scatterPoints[sp.dataIndex]
            const extra = pt ? ` · ${pt.calibre ?? '?'} · ${pt.quality ?? '?'}` : ''
            lines.push(`<span style="color:${scatterColor}">●</span> ${v}g${extra}`)
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
        ...(scatterPoints.length > 0 ? [{
          name: scatterLabel ?? 'Piezas',
          type: 'scatter' as const,
          yAxisIndex: 1,
          data: scatterPoints.map(p => [p.time, p.grams]),
          symbolSize: 6,
          itemStyle: {
            color: scatterColor,
            opacity: 0.7,
            borderColor: '#1f2937',
            borderWidth: 0.5,
          },
          emphasis: { itemStyle: { opacity: 1, borderWidth: 2, borderColor: '#f9fafb' } },
          z: 5,
        }] : []),
      ],
    }
  }, [timelineBuckets, shiftDoc, scatterPoints, scatterColor, scatterLabel, configSnapshots])

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
        {selectedCause && scatterLabel && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-xs"
            style={{ borderColor: scatterColor + '40', backgroundColor: scatterColor + '10' }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: scatterColor }} />
            <span className="text-muted-foreground">Mostrando:</span>
            <span className="font-medium" style={{ color: scatterColor }}>{scatterLabel}</span>
            <span className="text-muted-foreground">
              — {scatterPoints.length.toLocaleString('es-CL')} pzas con peso
            </span>
            {onClearSelectedCause && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={onClearSelectedCause}
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
            style={{ height: scatterPoints.length > 0 ? 240 : 180 }}
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
