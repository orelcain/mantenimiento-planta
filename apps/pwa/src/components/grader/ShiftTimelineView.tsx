/**
 * Visualización del timeline de turno: pulso P0% minuto a minuto +
 * checkpoints de uploads y acciones marcados como líneas verticales.
 *
 * Usa ECharts (consistente con GraderTimelineChart).
 */

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Upload, Wrench, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineBucket } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'

interface ShiftTimelineViewProps {
  timelineBuckets: TimelineBucket[]
  shiftDoc: GraderShiftDoc | null
  shiftWindow: ShiftTimeWindow
  /** Historial de cambios de config de gates (FASE 27) */
  configSnapshots?: GateConfigSnapshot[]
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}


export function ShiftTimelineView({ timelineBuckets, shiftDoc, shiftWindow, configSnapshots }: ShiftTimelineViewProps) {
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
      yAxis: {
        type: 'value' as const,
        name: 'P0%',
        nameTextStyle: { color: '#6b7280', fontSize: 10 },
        axisLabel: { color: '#6b7280', fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#1f2937' } },
        min: 0,
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontSize: 11 },
        formatter: (params: unknown[]) => {
          const p = params[0] as { name: string; value: number }
          return `${p.name}<br/>P0: <b>${p.value}%</b>`
        },
      },
      series: [
        {
          type: 'line' as const,
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
      ],
    }
  }, [timelineBuckets, shiftDoc])

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
        {!hasData ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Sin datos de minuto a minuto para este turno.
          </p>
        ) : (
          <ReactECharts
            option={chartOption}
            style={{ height: 180 }}
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
