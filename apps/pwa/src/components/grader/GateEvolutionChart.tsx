/**
 * GateEvolutionChart — evolución de piezas/min por gate a lo largo del turno.
 *
 * Usa gateCounts de TimelineBucket (ya precalculados por el backend).
 * Marca verticalmente cada cambio de configSnapshot con tooltip de qué cambió.
 * Permite seleccionar qué gates mostrar (por defecto: activos en el último snapshot).
 */
import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Activity, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineBucket } from '@/services/grader/types'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'

// Paleta para 12 gates (saturada, distinguible en dark mode)
const GATE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

function gateColor(gateNumber: number): string {
  return GATE_COLORS[(gateNumber - 1) % GATE_COLORS.length]!
}

interface GateEvolutionChartProps {
  timelineBuckets: TimelineBucket[]
  configSnapshots: GateConfigSnapshot[]
}

export function GateEvolutionChart({ timelineBuckets, configSnapshots }: GateEvolutionChartProps) {
  const [open, setOpen] = useState(false)

  // Gates activos en el último snapshot (para pre-selección)
  const activeGates = useMemo<Set<number>>(() => {
    if (configSnapshots.length === 0) {
      return new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    }
    const last = configSnapshots[configSnapshots.length - 1]!
    return new Set(last.gates.filter(g => g.active).map(g => g.gateNumber))
  }, [configSnapshots])

  const [selectedGates, setSelectedGates] = useState<Set<number>>(activeGates)

  // Sincronizar selectedGates cuando cambia activeGates (nuevo snapshot)
  const [prevActive, setPrevActive] = useState(activeGates)
  if (prevActive !== activeGates) {
    setPrevActive(activeGates)
    setSelectedGates(activeGates)
  }

  // Verificar si hay datos de gateCounts en los buckets
  const hasGateData = useMemo(() =>
    timelineBuckets.some(b => b.gateCounts && Object.keys(b.gateCounts).length > 0),
  [timelineBuckets])

  // Cambios de config para markLine (solo non-synthetic)
  const configChanges = useMemo(() =>
    configSnapshots.filter(s => !s.synthetic && s.changes.length > 0),
  [configSnapshots])

  function toggleGate(n: number) {
    setSelectedGates(prev => {
      const next = new Set(prev)
      if (next.has(n)) {
        if (next.size > 1) next.delete(n)
      } else {
        next.add(n)
      }
      return next
    })
  }

  const option = useMemo<EChartsOption>(() => {
    const xData = timelineBuckets.map(b => b.tsMin)

    // Construir markLine data para el primer gate (ECharts lo asocia a una serie)
    const markLines = configChanges.map(snap => {
      const gate = snap.changes[0]?.gateNumber
      const calibre = snap.changes.find(c => c.field === 'assignedCalibre')
      const label = gate
        ? `G${gate}${calibre ? ` →${String(calibre.after).split(' ')[0]}` : ''}`
        : 'cambio'
      return {
        xAxis: snap.at,
        label: {
          formatter: label,
          fontSize: 9,
          color: '#f59e0b',
          position: 'insideStartBottom' as const,
        },
        lineStyle: { type: 'dashed' as const, color: '#f59e0b88', width: 1.5 },
      }
    })

    const gateNumbers = Array.from({ length: 12 }, (_, i) => i + 1)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = gateNumbers.map((n, idx) => ({
      type: 'line' as const,
      name: `G${n}`,
      data: timelineBuckets.map(b => b.gateCounts?.[String(n)] ?? 0),
      smooth: true,
      symbol: 'none',
      lineStyle: { width: selectedGates.has(n) ? 1.5 : 0 },
      itemStyle: { color: gateColor(n) },
      emphasis: { disabled: true },
      // Solo el primer gate activo lleva las markLines
      ...(idx === 0 && markLines.length > 0 ? {
        markLine: {
          silent: false,
          symbol: ['none', 'none'],
          data: markLines,
          animation: false,
        },
      } : {}),
    }))

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { top: 8, bottom: 28, left: 36, right: 12, containLabel: false },
      xAxis: {
        type: 'category',
        data: xData,
        axisLabel: {
          fontSize: 9,
          color: '#94a3b8',
          formatter: (val: string) => {
            const d = new Date(val)
            return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
          },
          interval: Math.floor(timelineBuckets.length / 8),
        },
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'pzas/min',
        nameTextStyle: { fontSize: 9, color: '#64748b' },
        axisLabel: { fontSize: 9, color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        minInterval: 1,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        formatter: (params: unknown) => {
          const p = params as Array<{ seriesName: string; value: number; color: string }>
          if (!p.length) return ''
          const active = p.filter(s => selectedGates.has(parseInt(s.seriesName.slice(1))))
          if (!active.length) return ''
          const lines = active
            .filter(s => s.value > 0)
            .sort((a, b) => b.value - a.value)
            .map(s => `<span style="color:${s.color}">■</span> ${s.seriesName}: <b>${s.value}</b>`)
          return lines.join('<br/>') || ''
        },
        axisPointer: {
          type: 'line',
          lineStyle: { color: '#475569', type: 'dashed' },
        },
      },
      series,
    }
  }, [timelineBuckets, selectedGates, configChanges])

  if (!hasGateData) return null

  return (
    <Card>
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Evolución de gates
          <span className="text-[11px] font-normal text-muted-foreground">
            piezas/min por gate
          </span>
          {configChanges.length > 0 && (
            <span className="text-[10px] text-amber-400/70">
              {configChanges.length} cambio{configChanges.length > 1 ? 's' : ''} marcado{configChanges.length > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setOpen(v => !v)}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="pt-2 pb-3 space-y-2">
          {/* Selectores de gate */}
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => {
              const active = activeGates.has(n)
              const selected = selectedGates.has(n)
              return (
                <button
                  key={n}
                  onClick={() => toggleGate(n)}
                  className={cn(
                    'w-7 h-6 text-[10px] font-semibold rounded-ctl transition-all border',
                    selected
                      ? 'opacity-100 border-transparent'
                      : 'opacity-25 border-border/30 bg-transparent',
                    !active && 'opacity-10',
                  )}
                  style={selected ? { backgroundColor: gateColor(n) + '33', borderColor: gateColor(n) + '88', color: gateColor(n) } : {}}
                  title={`Gate ${n}${!active ? ' (inactivo)' : ''}`}
                >
                  {n}
                </button>
              )
            })}
            <button
              onClick={() => setSelectedGates(activeGates)}
              className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground px-1.5 transition-colors ml-1"
            >
              reset
            </button>
          </div>

          {/* Chart */}
          <div className="h-[180px]">
            <ReactECharts
              option={option}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge
            />
          </div>

          {configChanges.length > 0 && (
            <p className="text-[10px] text-muted-foreground/40">
              Líneas verticales: cambios de configuración de gates
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
