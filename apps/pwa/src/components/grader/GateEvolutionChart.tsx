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
import { useTheme } from '@/hooks/useTheme'
import { realIsoToWallClockMs } from '@/services/grader/graderGateObservations'
import type { TimelineBucket } from '@/services/grader/types'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'

// Paleta para 12 gates (saturada, distinguible en dark mode)
const GATE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

// Cromo del gráfico por tema (mismo patrón que ProductionRateLineEC): los
// valores fijos de oscuro dejaban en claro una rejilla negra a rayas.
const CHART_INK = {
  dark:  { grid: '#1e293b', axis: '#94a3b8', axisName: '#64748b', axisLine: '#334155', pointer: '#475569', tipBg: '#1e293b', tipBorder: '#334155', tipText: '#e2e8f0' },
  light: { grid: '#c3d7e9', axis: '#41566a', axisName: '#41566a', axisLine: '#9aa6b1', pointer: '#7a8a99', tipBg: '#ffffff', tipBorder: '#c3d7e9', tipText: '#16242f' },
} as const

function gateColor(gateNumber: number): string {
  return GATE_COLORS[(gateNumber - 1) % GATE_COLORS.length]!
}

/** Tinta legible sobre el color del gate (los claros —lima, ámbar, cian— piden tinta oscura). */
function inkOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.55 ? '#0d1722' : '#ffffff'
}

interface GateEvolutionChartProps {
  timelineBuckets: TimelineBucket[]
  configSnapshots: GateConfigSnapshot[]
}

export function GateEvolutionChart({ timelineBuckets, configSnapshots }: GateEvolutionChartProps) {
  const [open, setOpen] = useState(false)
  const { isDark } = useTheme()
  const ink = isDark ? CHART_INK.dark : CHART_INK.light

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
        // snap.at es hora REAL UTC y el eje va en hora de pared marcada como Z
        // (tsMin): sin convertir, la marca caía 3–4 h corrida. Se ancla al
        // primer minuto del eje ≥ al cambio (el eje es categórico).
        xAxis: (() => {
          const wc = realIsoToWallClockMs(snap.at)
          const hit = timelineBuckets.find((b) => Date.parse(b.tsMin) >= wc)
          return hit?.tsMin ?? timelineBuckets[timelineBuckets.length - 1]?.tsMin ?? snap.at
        })(),
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

    const series: any[] = gateNumbers.map((n, idx) => ({
      type: 'line' as const,
      name: `G${n}`,
      data: timelineBuckets.map(b => b.gateCounts?.[String(n)] ?? 0),
      smooth: true,
      symbol: 'none',
      // Las seleccionadas van más gruesas, encima, y con su nombre al final
      // de la línea: antes solo las distinguía el color, y con 12 tonos
      // parecidos no se sabía cuál era cuál sin ir a las chips.
      lineStyle: { width: selectedGates.has(n) ? 2 : 0 },
      itemStyle: { color: gateColor(n) },
      z: selectedGates.has(n) ? 3 : 2,
      endLabel: {
        show: selectedGates.has(n),
        formatter: `G${n}`,
        color: gateColor(n),
        fontSize: 11,
        fontWeight: 'bold' as const,
        distance: 4,
      },
      // Si dos líneas terminan a la misma altura, sus nombres se apilan en
      // vez de pisarse (G11 sobre G12 desaparecía).
      labelLayout: { moveOverlap: 'shiftY' as const },
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
      grid: { top: 8, bottom: 28, left: 36, right: 34, containLabel: false },
      xAxis: {
        type: 'category',
        data: xData,
        axisLabel: {
          fontSize: 9,
          color: ink.axis,
          formatter: (val: string) => {
            const d = new Date(val)
            return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
          },
          interval: Math.floor(timelineBuckets.length / 8),
        },
        axisLine: { lineStyle: { color: ink.axisLine } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'pzas/min',
        nameTextStyle: { fontSize: 9, color: ink.axisName },
        axisLabel: { fontSize: 9, color: ink.axis },
        splitLine: { lineStyle: { color: ink.grid, type: 'dashed' } },
        minInterval: 1,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: ink.tipBg,
        borderColor: ink.tipBorder,
        textStyle: { color: ink.tipText, fontSize: 11 },
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
          lineStyle: { color: ink.pointer, type: 'dashed' },
        },
      },
      series,
    }
  }, [timelineBuckets, selectedGates, configChanges, ink])

  if (!hasGateData) return null

  return (
    <Card>
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Evolución de gates
          <span className="text-caption font-normal text-muted-foreground">
            piezas/min por gate
          </span>
          {configChanges.length > 0 && (
            <span className="text-caption text-ink-warn">
              {configChanges.length} cambio{configChanges.length > 1 ? 's' : ''} marcado{configChanges.length > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setOpen(v => !v)}
            className="ml-auto flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="pt-2 pb-3 space-y-2">
          {/* Selectores de gate. Seleccionada = relleno sólido del color del
              gate (el mismo de su línea); no seleccionada = contorno con texto
              atenuado, a opacidad completa. Antes las no seleccionadas iban al
              25 % y en oscuro desaparecían, y las seleccionadas se teñían al
              20 %: no se distinguían unas de otras. Targets de 44 px. */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gates a mostrar">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => {
              const active = activeGates.has(n)
              const selected = selectedGates.has(n)
              const color = gateColor(n)
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleGate(n)}
                  className={cn(
                    'h-[44px] min-w-[44px] px-2 text-footnote font-semibold rounded-ctl border tabular-nums',
                    'transition-[transform,opacity,background-color] duration-[180ms] active:scale-[.97] motion-reduce:active:scale-100',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    selected ? 'border-transparent' : 'border-border bg-transparent text-muted-foreground',
                    !active && 'opacity-40 line-through',
                  )}
                  style={selected ? { backgroundColor: color, color: inkOn(color) } : {}}
                  title={`Gate ${n}${!active ? ' (inactivo)' : ''}${selected ? ' · tocá para ocultar' : ' · tocá para mostrar'}`}
                >
                  G{n}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setSelectedGates(activeGates)}
              className="h-[44px] px-3 text-footnote font-medium text-primary rounded-ctl hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              todas las activas
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
            <p className="text-caption text-muted-foreground/40">
              Líneas verticales: cambios de configuración de gates
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
