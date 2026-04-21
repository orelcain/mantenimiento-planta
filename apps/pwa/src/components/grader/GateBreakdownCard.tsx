/**
 * GateBreakdownCard — distribución y análisis de asignación de gates.
 *
 * Responde las preguntas operativas reales:
 *   1. ¿Qué gate clasificó más/menos piezas?
 *   2. ¿La configuración de gates era apropiada para la composición del turno?
 *   3. ¿Hay gates sobredimensionados que conviene reasignar?
 *
 * El "desequilibrio" entre gates puede ser natural (el turno tuvo 60% de 6-8 lb
 * y eso no es un problema) o estructural (se asignaron 2 gates a un calibre que
 * representó solo 3% del turno, mientras el calibre dominante tenía 4 gates al tope).
 *
 * La métrica clave es el RATIO DE EFICIENCIA por calibre:
 *   ratio = (% producción del calibre) / (% de gates asignados al calibre)
 *   ratio > 1.5  → calibre saturado  (necesita más gates)
 *   0.5–1.5      → calibre óptimo
 *   ratio < 0.5  → calibre sobredimensionado (tiene más gates de los que necesita)
 */

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'
import { LayoutGrid, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'

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
}

// ── Tipos internos ────────────────────────────────────────────────────────────

interface CalibreGroup {
  /** Label compuesto: "6-8 lb · Premium" */
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
  fromLabel: string   // "2-4 lb · Premium"
  toLabel: string     // "6-8 lb · Premium"
  fromPieces: number
  fromPct: number
  satRatio: number
  cautela: string     // razón de cautela específica
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUALITY_COLOR: Record<string, string> = {
  premium:    '#6366f1', // indigo
  superior:   '#10b981', // emerald
  primera:    '#3b82f6', // blue
  segunda:    '#f59e0b', // amber
  tercera:    '#f97316', // orange
  industrial: '#94a3b8', // slate
  descarte:   '#ef4444', // red
}

function qualityColor(q?: string): string {
  const k = (q ?? '').toLowerCase().replace(/[^a-z]/g, '')
  for (const [key, hex] of Object.entries(QUALITY_COLOR)) {
    if (k.includes(key)) return hex
  }
  return '#6366f1'
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

  // Agrupar por COMBINACIÓN calibre + calidad — son dimensiones independientes
  // G3 "6-8 lb · Industrial" y G10 "6-8 lb · Premium" NO son intercambiables
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
      status: (ratio > 1.5 ? 'saturado' : ratio < 0.5 ? 'sobredimensionado' : 'optimo') as CalibreGroup['status'],
    }
  }).sort((a, b) => b.productionPct - a.productionPct)

  const saturados = calibreGroups.filter(g => g.status === 'saturado')
  const sobredimensionados = calibreGroups.filter(g => g.status === 'sobredimensionado')

  // Diagnóstico global
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

  // Sugerencias — solo cuando la calidad del grupo sobredimensionado es compatible
  // con el grupo saturado (misma calidad o calidad "superior" asignable al destino).
  // Se emite nota de cautela cuando las calidades difieren: un gate Industrial no
  // puede recibir producto Premium sin reconfigurar los criterios de aceptación.
  const suggestions: Suggestion[] = []
  const seenPairs = new Set<string>()

  for (const sat of saturados) {
    for (const sobre of sobredimensionados) {
      const pairKey = `${sat.label}__${sobre.label}`
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)

      const sameQuality = sobre.quality.toLowerCase() === sat.quality.toLowerCase()
      const sameCalibre = sobre.calibre.toLowerCase() === sat.calibre.toLowerCase()

      // Cautela: si calibre o calidad difieren, el cambio implica reconfiguración
      let cautela = ''
      if (!sameQuality && !sameCalibre) {
        cautela = `Requiere cambiar calibre (${sobre.calibre}→${sat.calibre}) Y calidad (${sobre.quality}→${sat.quality}) — verificar criterios de aceptación`
      } else if (!sameQuality) {
        cautela = `Mismo calibre pero calidad diferente (${sobre.quality}→${sat.quality}) — revisar si el grader acepta el cambio sin ajuste de parámetros`
      } else if (!sameCalibre) {
        cautela = `Misma calidad pero calibre diferente (${sobre.calibre}→${sat.calibre}) — ajustar rango de peso del gate`
      } else {
        cautela = 'Misma calidad y calibre — cambio directo sin riesgo de reconfiguración'
      }

      // Gate a mover: el menos productivo del grupo sobredimensionado
      const gateToMove = sobre.gates
        .map(g => ({ gate: g, pieces: productiveRows.find(r => r.gate === g)?.pieces ?? 0 }))
        .sort((a, b) => a.pieces - b.pieces)[0]
      if (!gateToMove) continue

      const fromPct = totalProductivePieces > 0
        ? (gateToMove.pieces / totalProductivePieces) * 100
        : 0

      suggestions.push({
        fromGate: gateToMove.gate,
        fromLabel: sobre.label,
        toLabel: sat.label,
        fromPieces: gateToMove.pieces,
        fromPct,
        satRatio: sat.ratio,
        cautela,
      })
    }
  }

  return { calibreGroups, diagnosis, suggestions }
}

// ── Componente ────────────────────────────────────────────────────────────────

export function GateBreakdownCard({
  gateDistribution,
  configSnapshots,
  totalPieces,
  pointZeroPieces,
  pointZeroPct,
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

  // Mapa: gateNumber → status del calibre al que pertenece
  const gateStatusMap = useMemo(() => {
    const m = new Map<number, 'saturado' | 'optimo' | 'sobredimensionado'>()
    for (const g of calibreGroups) {
      for (const gate of g.gates) m.set(gate, g.status)
    }
    return m
  }, [calibreGroups])

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
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-1.5">
        {/* ── Barras por gate ──────────────────────────────────────────── */}
        {productiveRows.map(row => {
          const cfg = gateConfigMap.get(row.gate)
          const barPct = maxPieces > 0 ? (row.pieces / maxPieces) * 100 : 0
          const color = cfg ? qualityColor(cfg.quality) : '#6366f1'
          const isTop = row === productiveRows[0]
          const status = gateStatusMap.get(row.gate)

          return (
            <div key={row.gate} className="flex items-center gap-2">
              {/* Gate label */}
              <div className="w-8 shrink-0 text-right">
                <span className={cn(
                  'text-xs font-semibold tabular-nums',
                  isTop ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  G{row.gate}
                </span>
              </div>

              {/* Config */}
              <div className="w-32 shrink-0 truncate text-[11px] text-muted-foreground">
                {cfg ? `${cfg.calibre} · ${cfg.quality}` : '—'}
              </div>

              {/* Barra */}
              <div className="flex-1 h-4 rounded-sm bg-muted/20 overflow-hidden relative">
                <div
                  className="h-full rounded-sm transition-all duration-300"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: color + (isTop ? 'cc' : '80'),
                  }}
                />
                {/* Indicador de status del calibre */}
                {status === 'sobredimensionado' && row.pieces > 0 && (
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-amber-400/80 font-medium">↓</span>
                )}
                {status === 'saturado' && (
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-red-400/80 font-medium">↑</span>
                )}
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

        {/* ── Sección análisis de asignación (expandible) ──────────────── */}
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
                {/* Tabla por calibre */}
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
                            <span style={{ color: qualityColor(g.quality) }} className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" />
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
                            g.status === 'saturado'         && 'text-red-400',
                            g.status === 'sobredimensionado'&& 'text-amber-400',
                            g.status === 'optimo'           && 'text-emerald-400',
                          )}>
                            {g.ratio.toFixed(1)}×
                          </td>
                          <td className={cn(
                            'px-2 py-1.5',
                            g.status === 'saturado'         && 'text-red-400',
                            g.status === 'sobredimensionado'&& 'text-amber-400',
                            g.status === 'optimo'           && 'text-emerald-400',
                          )}>
                            {g.status === 'saturado'          ? '↑ saturado'
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

                {/* Sugerencias */}
                {suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Sugerencias para el próximo turno
                    </p>
                    {suggestions.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/5 text-xs"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground">
                            Reasignar G{s.fromGate}
                          </span>
                          <span className="text-muted-foreground ml-1">
                            de <span className="text-foreground/80">{s.fromLabel}</span>
                            {' → '}<span className="text-foreground/80">{s.toLabel}</span>
                          </span>
                          <div className="text-muted-foreground/70 mt-0.5">
                            G{s.fromGate} clasificó {s.fromPieces.toLocaleString('es-CL')} pzas ({s.fromPct.toFixed(1)}%) · destino saturado a {s.satRatio.toFixed(1)}×
                          </div>
                          <div className="text-amber-400/80 mt-0.5 text-[10px] italic">
                            ⚠ {s.cautela}
                          </div>
                        </div>
                      </div>
                    ))}
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
