/**
 * GateBreakdownCard — distribución y análisis de asignación de gates.
 *
 * Responde las preguntas operativas reales:
 *   1. ¿Qué gate clasificó más/menos piezas?
 *   2. ¿La configuración de gates era apropiada para la composición del turno?
 *   3. ¿Hay gates sobredimensionados que conviene reasignar?
 *
 * Barra coloreada por STATUS de eficiencia (rojo=saturado, ámbar=sobredim., verde=óptimo).
 * La calidad sigue visible en el texto. Sugerencias ordenadas por impacto descendente.
 */

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'
import { LayoutGrid, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import {
  gateStatusFromRatio,
  cautelaSeverity,
  severityBadgeClass,
  severityLabel,
  estimateRebalanceImpact,
  quantifyReassignable,
  type ReassignmentSeverity,
} from '@/services/grader/graderGateAssignment'
import { qualityColorHex } from '@/services/grader/graderQualityColors'
import { QuickGateChangeButton } from './QuickGateChangeButton'

interface GateRow {
  gate: number
  pieces: number
  pct: number
}

interface GateBreakdownCardProps {
  gateDistribution: GateRow[]
  configSnapshots?: GateConfigSnapshot[]
  totalPieces: number
  pointZeroPieces: number
  pointZeroPct: number
  /** Si se provee, aparece botón "Aplicar →" en cada sugerencia (solo admin) */
  shiftDocId?: string
  /** Se llama tras guardar un cambio de gate desde una sugerencia */
  onSaved?: () => void
}

// ── Tipos internos ────────────────────────────────────────────────────────────

interface CalibreGroup {
  label: string
  calibre: string
  quality: string
  gates: number[]
  pieces: number
  productionPct: number
  gatesPct: number
  ratio: number
  status: 'saturado' | 'optimo' | 'sobredimensionado'
}

interface Suggestion {
  fromGate: number
  fromLabel: string
  fromCalibre: string  // calibre raw del grupo origen (para severidad)
  fromQuality: string  // calidad raw del grupo origen
  toLabel: string
  toCalibre: string   // calibre raw del grupo destino (para pre-rellenar el form)
  toQuality: string   // calidad raw del grupo destino
  fromPieces: number
  fromPct: number
  satRatio: number
  cautela: string
  /** Severidad operacional del cambio (directo / ajuste / reconfigurar). */
  severity: ReassignmentSeverity
  /** Estimación post-reasignación: ratio destino antes/después + status final. */
  estimate: ReturnType<typeof estimateRebalanceImpact>
  impact: number  // fromPieces × satRatio — usado para ordenar
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Color de barra por STATUS — no por calidad (calidad queda en el texto)
const STATUS_BAR_COLOR: Record<CalibreGroup['status'], string> = {
  saturado:         '#f87171', // red-400
  optimo:           '#34d399', // emerald-400
  sobredimensionado:'#fbbf24', // amber-400
}

function normKey(calibre: string, quality: string): string {
  return `${calibre.toLowerCase().replace(/\s+/g, '')}__${quality.toLowerCase().replace(/\s+/g, '')}`
}

// ── Análisis de asignación ────────────────────────────────────────────────────

function computeAssignmentAnalysis(
  productiveRows: GateRow[],
  gateConfigMap: Map<number, { calibre: string; quality: string }>,
  totalProductivePieces: number,
): {
  calibreGroups: CalibreGroup[]
  diagnosis: { label: string; color: string; detail: string }
  suggestions: Suggestion[]
} {
  const activeGates = productiveRows.filter(r => r.pieces > 0)
  if (activeGates.length === 0 || gateConfigMap.size === 0) {
    return {
      calibreGroups: [],
      diagnosis: { label: 'Sin config', color: 'zinc', detail: 'No hay snapshot de configuración para este turno' },
      suggestions: [],
    }
  }

  const byGroup = new Map<string, { calibre: string; quality: string; gates: number[]; pieces: number }>()

  for (const row of activeGates) {
    const cfg = gateConfigMap.get(row.gate)
    if (!cfg) continue
    const key = normKey(cfg.calibre, cfg.quality)
    const entry = byGroup.get(key) ?? { calibre: cfg.calibre, quality: cfg.quality, gates: [], pieces: 0 }
    entry.gates.push(row.gate)
    entry.pieces += row.pieces
    byGroup.set(key, entry)
  }

  const numActiveGates = activeGates.length

  const calibreGroups: CalibreGroup[] = [...byGroup.values()].map(g => {
    const label = `${g.calibre} · ${g.quality}`
    const productionPct = totalProductivePieces > 0 ? (g.pieces / totalProductivePieces) * 100 : 0
    const gatesPct = (g.gates.length / numActiveGates) * 100
    const ratio = gatesPct > 0 ? productionPct / gatesPct : 0
    return {
      label,
      calibre: g.calibre,
      quality: g.quality,
      gates: g.gates,
      pieces: g.pieces,
      productionPct,
      gatesPct,
      ratio,
      status: gateStatusFromRatio(ratio),
    }
  }).sort((a, b) => b.productionPct - a.productionPct)

  const saturados = calibreGroups.filter(g => g.status === 'saturado')
  const sobredimensionados = calibreGroups.filter(g => g.status === 'sobredimensionado')

  let diagnosis: { label: string; color: string; detail: string }
  if (saturados.length > 0 && sobredimensionados.length > 0) {
    const topSat = saturados[0]!
    const topSobre = sobredimensionados[0]!
    diagnosis = {
      label: 'Asignación subóptima',
      color: 'amber',
      detail: `${topSat.label} saturado (${topSat.ratio.toFixed(1)}×) · ${topSobre.label} sobredimensionado (${topSobre.ratio.toFixed(1)}×)`,
    }
  } else if (saturados.length > 0) {
    diagnosis = {
      label: 'Distribución natural',
      color: 'blue',
      detail: `${saturados[0]!.label} dominó el turno — no hay combinaciones disponibles para reasignar`,
    }
  } else {
    diagnosis = {
      label: 'Asignación óptima',
      color: 'emerald',
      detail: 'Todos los grupos calibre+calidad dentro del rango de eficiencia (0.5–1.5×)',
    }
  }

  const suggestions: Suggestion[] = []
  const seenPairs = new Set<string>()

  for (const sat of saturados) {
    for (const sobre of sobredimensionados) {
      const pairKey = `${sat.label}__${sobre.label}`
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)

      const severity = cautelaSeverity(sobre.calibre, sobre.quality, sat.calibre, sat.quality)

      let cautela = ''
      if (severity === 'reconfigure') {
        cautela = `Requiere cambiar calibre (${sobre.calibre}→${sat.calibre}) Y calidad (${sobre.quality}→${sat.quality}) — verificar criterios de aceptación`
      } else if (severity === 'adjustment') {
        const sameQuality = sobre.quality.toLowerCase() === sat.quality.toLowerCase()
        if (sameQuality) {
          cautela = `Misma calidad pero calibre diferente (${sobre.calibre}→${sat.calibre}) — ajustar rango de peso del gate`
        } else {
          cautela = `Mismo calibre pero calidad diferente (${sobre.quality}→${sat.quality}) — revisar si el grader acepta el cambio sin ajuste de parámetros`
        }
      } else {
        cautela = 'Misma calidad y calibre — cambio directo sin riesgo de reconfiguración'
      }

      const gateToMove = sobre.gates
        .map(g => ({ gate: g, pieces: productiveRows.find(r => r.gate === g)?.pieces ?? 0 }))
        .sort((a, b) => a.pieces - b.pieces)[0]
      if (!gateToMove) continue

      const fromPct = totalProductivePieces > 0
        ? (gateToMove.pieces / totalProductivePieces) * 100
        : 0

      const estimate = estimateRebalanceImpact({
        destProductionPct:     sat.productionPct,
        destGatesCount:        sat.gates.length,
        numActiveGates,
        fromGateProductionPct: fromPct,
      })

      suggestions.push({
        fromGate: gateToMove.gate,
        fromLabel: sobre.label,
        fromCalibre: sobre.calibre,
        fromQuality: sobre.quality,
        toLabel: sat.label,
        toCalibre: sat.calibre,
        toQuality: sat.quality,
        fromPieces: gateToMove.pieces,
        fromPct,
        satRatio: sat.ratio,
        cautela,
        severity,
        estimate,
        impact: gateToMove.pieces * sat.ratio,
      })
    }
  }

  // Ordenar por impacto descendente — la sugerencia más valiosa primero
  suggestions.sort((a, b) => b.impact - a.impact)

  return { calibreGroups, diagnosis, suggestions }
}

// ── Componente ────────────────────────────────────────────────────────────────

export function GateBreakdownCard({
  gateDistribution,
  configSnapshots,
  totalPieces,
  pointZeroPieces,
  pointZeroPct,
  shiftDocId,
  onSaved,
}: GateBreakdownCardProps) {
  const [showAnalysis, setShowAnalysis] = useState(false)

  const gateConfigMap = useMemo(() => {
    const m = new Map<number, { calibre: string; quality: string }>()
    if (!configSnapshots || configSnapshots.length === 0) return m
    const last = configSnapshots[configSnapshots.length - 1]!
    for (const g of last.gates) {
      if (g.active) m.set(g.gateNumber, { calibre: g.assignedCalibre, quality: g.assignedQuality })
    }
    return m
  }, [configSnapshots])

  const { productiveRows, maxPieces, totalProductivePieces } = useMemo(() => {
    const productive = gateDistribution
      .filter(r => r.gate !== 0)
      .sort((a, b) => b.pieces - a.pieces)
    const max = productive.reduce((m, r) => Math.max(m, r.pieces), 1)
    const totalProd = productive.reduce((s, r) => s + r.pieces, 0)
    return { productiveRows: productive, maxPieces: max, totalProductivePieces: totalProd }
  }, [gateDistribution])

  const { calibreGroups, diagnosis, suggestions } = useMemo(
    () => computeAssignmentAnalysis(productiveRows, gateConfigMap, totalProductivePieces),
    [productiveRows, gateConfigMap, totalProductivePieces],
  )

  // Cuantificar el potencial total reasignable — info útil para el badge.
  const reassignable = useMemo(() => quantifyReassignable(suggestions), [suggestions])

  // Mapa gate → status para colorear las barras
  const gateStatusMap = useMemo(() => {
    const m = new Map<number, CalibreGroup['status']>()
    for (const g of calibreGroups) {
      for (const gate of g.gates) m.set(gate, g.status)
    }
    return m
  }, [calibreGroups])

  // Conteo de grupos por status — para el KPI strip
  const kpi = useMemo(() => ({
    saturado:         calibreGroups.filter(g => g.status === 'saturado').length,
    optimo:           calibreGroups.filter(g => g.status === 'optimo').length,
    sobredimensionado:calibreGroups.filter(g => g.status === 'sobredimensionado').length,
  }), [calibreGroups])

  const activeGates = productiveRows.filter(r => r.pieces > 0).length

  if (gateDistribution.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <LayoutGrid className="w-4 h-4" />
          Distribución por gate
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium cursor-default',
              diagnosis.color === 'emerald' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
              diagnosis.color === 'amber'   && 'border-amber-500/40 bg-amber-500/10 text-amber-400',
              diagnosis.color === 'blue'    && 'border-blue-500/40 bg-blue-500/10 text-blue-400',
              diagnosis.color === 'zinc'    && 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400',
            )}
            title={diagnosis.detail}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {diagnosis.label}
            {/* Cuantificar potencial reasignable cuando la asignación es subóptima */}
            {reassignable.totalPieces > 0 && diagnosis.color === 'amber' && (
              <span className="opacity-80 tabular-nums">
                · ~{reassignable.totalPieces.toLocaleString('es-CL')} pzas reasignables
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-1.5">

        {/* ── KPI strip — foto instantánea antes de leer las barras ────── */}
        {calibreGroups.length > 0 && (
          <div className="flex items-center gap-2 pb-1 flex-wrap">
            {kpi.saturado > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-[11px] font-medium text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                {kpi.saturado} saturado{kpi.saturado > 1 ? 's' : ''}
              </span>
            )}
            {kpi.optimo > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {kpi.optimo} óptimo{kpi.optimo > 1 ? 's' : ''}
              </span>
            )}
            {kpi.sobredimensionado > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-medium text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {kpi.sobredimensionado} sobredim.
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/50 ml-auto">grupos calibre·calidad</span>
          </div>
        )}

        {/* ── Barras por gate — coloreadas por status de eficiencia ────── */}
        {productiveRows.map(row => {
          const cfg = gateConfigMap.get(row.gate)
          const barPct = maxPieces > 0 ? (row.pieces / maxPieces) * 100 : 0
          const status = gateStatusMap.get(row.gate)
          // Barra: color por STATUS (rojo/verde/ámbar). Calidad queda en el texto.
          const barColor = status ? STATUS_BAR_COLOR[status] : '#94a3b8'
          const isTop = row === productiveRows[0]

          return (
            <div key={row.gate} className="flex items-center gap-2">
              {/* Gate label */}
              <div className="w-8 shrink-0 text-right">
                <span className={cn(
                  'text-xs font-semibold tabular-nums',
                  status === 'saturado'          && 'text-red-400',
                  status === 'sobredimensionado' && 'text-amber-400',
                  status === 'optimo'            && 'text-emerald-400',
                  !status                        && (isTop ? 'text-foreground' : 'text-muted-foreground'),
                )}>
                  G{row.gate}
                </span>
              </div>

              {/* Config: calibre · calidad con punto de color por calidad */}
              <div className="w-32 shrink-0 truncate text-[11px] text-muted-foreground flex items-center gap-1">
                {cfg && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: qualityColorHex(cfg.quality) }}
                  />
                )}
                {cfg ? `${cfg.calibre} · ${cfg.quality}` : '—'}
              </div>

              {/* Barra coloreada por status */}
              <div className="flex-1 h-4 rounded-sm bg-muted/20 overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-300"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: barColor + (isTop ? 'dd' : '70'),
                  }}
                />
              </div>

              {/* Piezas + % */}
              <div className="w-28 shrink-0 text-right text-xs tabular-nums">
                <span className={cn(isTop ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {row.pieces.toLocaleString('es-CL')}
                </span>
                <span className="text-muted-foreground/60 ml-1">{row.pct.toFixed(1)}%</span>
              </div>
            </div>
          )
        })}

        {/* ── Fila P0 ──────────────────────────────────────────────────── */}
        {pointZeroPieces > 0 && (
          <>
            <div className="border-t border-border/40 my-1" />
            <div className="flex items-center gap-2">
              <div className="w-8 shrink-0 text-right">
                <span className="text-xs font-semibold text-orange-400 tabular-nums">P0</span>
              </div>
              <div className="w-32 shrink-0 text-[11px] text-orange-400/70">Rechazo</div>
              <div className="flex-1 h-4 rounded-sm bg-muted/20 overflow-hidden">
                <div
                  className="h-full rounded-sm bg-orange-500/50"
                  style={{ width: `${(pointZeroPieces / maxPieces) * 100}%` }}
                />
              </div>
              <div className="w-28 shrink-0 text-right text-xs tabular-nums">
                <span className="text-orange-400 font-medium">{pointZeroPieces.toLocaleString('es-CL')}</span>
                <span className="text-muted-foreground/60 ml-1">{pointZeroPct.toFixed(1)}%</span>
              </div>
            </div>
          </>
        )}

        {/* ── Análisis expandible ───────────────────────────────────────── */}
        {calibreGroups.length > 0 && (
          <>
            <div className="border-t border-border/30 mt-2" />
            <button
              onClick={() => setShowAnalysis(v => !v)}
              className="w-full flex items-center justify-between py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="font-medium">Análisis de asignación por calibre · calidad</span>
              {showAnalysis ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAnalysis && (
              <div className="space-y-3 pt-1">
                {/* Tabla de grupos */}
                <div className="rounded-md border border-border/40 overflow-hidden text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/20 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Calibre · Calidad</th>
                        <th className="px-2 py-1.5 text-center font-medium">Gates</th>
                        <th className="px-2 py-1.5 text-right font-medium">Producción</th>
                        <th className="px-2 py-1.5 text-right font-medium">Ratio</th>
                        <th className="px-2 py-1.5 text-left font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calibreGroups.map(g => (
                        <tr key={g.label} className="border-t border-border/30 hover:bg-muted/10">
                          <td className="px-2 py-1.5 font-medium">
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                              style={{ backgroundColor: qualityColorHex(g.quality) }}
                            />
                            {g.label}
                          </td>
                          <td className="px-2 py-1.5 text-center text-muted-foreground">
                            {g.gates.map(n => `G${n}`).join(' ')}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {g.productionPct.toFixed(1)}%
                          </td>
                          <td className={cn(
                            'px-2 py-1.5 text-right tabular-nums font-semibold',
                            g.status === 'saturado'          && 'text-red-400',
                            g.status === 'sobredimensionado' && 'text-amber-400',
                            g.status === 'optimo'            && 'text-emerald-400',
                          )}>
                            {g.ratio.toFixed(1)}×
                          </td>
                          <td className={cn(
                            'px-2 py-1.5',
                            g.status === 'saturado'          && 'text-red-400',
                            g.status === 'sobredimensionado' && 'text-amber-400',
                            g.status === 'optimo'            && 'text-emerald-400',
                          )}>
                            {g.status === 'saturado'           ? '↑ saturado'
                              : g.status === 'sobredimensionado' ? '↓ sobredim.'
                              : '✓ óptimo'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-2 py-1 bg-muted/10 text-[10px] text-muted-foreground border-t border-border/30">
                    Ratio = % producción ÷ % gates asignados · óptimo entre 0.5× y 1.5×
                  </div>
                </div>

                {/* Sugerencias ordenadas por impacto */}
                {suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Sugerencias para el próximo turno
                      <span className="ml-1 text-muted-foreground/50 font-normal">— ordenadas por impacto</span>
                    </p>
                    {suggestions.map((s, i) => {
                      const isTop = i === 0
                      return (
                        <div
                          key={i}
                          className={cn(
                            'flex items-start gap-2.5 px-3 py-2.5 rounded-md border text-xs transition-colors',
                            isTop
                              ? 'border-red-500/30 bg-red-500/5'
                              : 'border-amber-500/20 bg-amber-500/5',
                          )}
                        >
                          {/* Número de prioridad */}
                          <span className={cn(
                            'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5',
                            isTop
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-amber-500/15 text-amber-400',
                          )}>
                            {i + 1}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-foreground">
                                Reasignar G{s.fromGate}
                              </span>
                              <ArrowRight className={cn(
                                'w-3 h-3 shrink-0',
                                isTop ? 'text-red-400' : 'text-amber-400',
                              )} />
                              <span className="text-muted-foreground">
                                <span className="text-foreground/70">{s.fromLabel}</span>
                                {' → '}
                                <span className="text-foreground/70">{s.toLabel}</span>
                              </span>
                              {/* Badge severidad — visible primero, comunica complejidad del cambio */}
                              <span
                                className={cn(
                                  'inline-flex items-center px-1.5 py-0 rounded-full border text-[9px] font-medium uppercase tracking-wide',
                                  severityBadgeClass(s.severity),
                                )}
                                title={s.cautela}
                              >
                                {severityLabel(s.severity)}
                              </span>
                            </div>
                            <div className="text-muted-foreground/70 mt-0.5">
                              G{s.fromGate} clasificó {s.fromPieces.toLocaleString('es-CL')} pzas ({s.fromPct.toFixed(1)}%)
                              {' · '}destino saturado a {s.satRatio.toFixed(1)}×
                            </div>
                            {/* Estimación post-reasignación — info útil concreta */}
                            <div className="text-[10px] mt-0.5 tabular-nums">
                              <span className="text-muted-foreground/60">Esperado:</span>{' '}
                              <span className={cn(
                                s.estimate.improvesDestination ? 'text-emerald-400' : 'text-amber-400/80',
                              )}>
                                {s.toLabel} {s.estimate.destBeforeRatio.toFixed(1)}× → {s.estimate.destAfterRatio.toFixed(1)}×
                              </span>
                              {s.estimate.improvesDestination && (
                                <span className="text-emerald-400 ml-1">(óptimo ✓)</span>
                              )}
                              {!s.estimate.improvesDestination && s.estimate.destAfterStatus === 'saturado' && (
                                <span className="text-amber-400/80 ml-1">(sigue saturado — considerar mover 2 gates)</span>
                              )}
                            </div>
                            <div className={cn(
                              'mt-1 text-[10px] italic',
                              isTop ? 'text-red-400/70' : 'text-amber-400/70',
                            )}>
                              ⚠ {s.cautela}
                            </div>
                          </div>

                          {/* Botón aplicar — solo si hay shiftDocId (solo admin lo ve) */}
                          {shiftDocId && (
                            <div className="shrink-0 self-start">
                              <QuickGateChangeButton
                                shiftDocId={shiftDocId}
                                variant="compact"
                                initialGate={s.fromGate}
                                initialCalibre={s.toCalibre}
                                initialQuality={s.toQuality}
                                initialReason={`Sugerencia: G${s.fromGate} ${s.fromLabel} → ${s.toLabel}`}
                                triggerLabel="Aplicar →"
                                onSaved={onSaved}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="pt-1 flex items-center gap-3 text-[11px] text-muted-foreground border-t border-border/30 mt-1">
          <span>{activeGates} gates activos de 12</span>
          <span>·</span>
          <span>{totalPieces.toLocaleString('es-CL')} pzas totales</span>
          {diagnosis.detail && (
            <>
              <span>·</span>
              <span className="truncate" title={diagnosis.detail}>{diagnosis.detail}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
