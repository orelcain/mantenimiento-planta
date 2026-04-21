/**
 * GateBreakdownCard — distribución de piezas por gate del turno completo.
 *
 * Responde las preguntas:
 *   - ¿Qué gate clasificó más piezas? ¿Cuál estuvo casi vacío?
 *   - ¿El turno estuvo balanceado entre gates?
 *   - ¿Qué calibre/calidad estaba asignado a cada gate?
 *
 * Diseño: barras horizontales ordenadas por volumen desc, con config del gate
 * (calibre + calidad) desde el último configSnapshot del turno.
 * Badge de balance calculado via coeficiente de variación de piezas productivas.
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'
import { LayoutGrid } from 'lucide-react'
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

/** Coeficiente de variación → badge de balance del turno */
function computeBalance(productiveRows: GateRow[]): {
  label: string
  color: string
  detail: string
} {
  if (productiveRows.length === 0) return { label: 'Sin datos', color: 'zinc', detail: '' }
  const active = productiveRows.filter(r => r.pieces > 0)
  if (active.length === 0) return { label: 'Sin datos', color: 'zinc', detail: '' }
  const mean = active.reduce((s, r) => s + r.pieces, 0) / active.length
  const variance = active.reduce((s, r) => s + Math.pow(r.pieces - mean, 2), 0) / active.length
  const stdDev = Math.sqrt(variance)
  const cv = mean > 0 ? stdDev / mean : 0

  const maxRow = active.reduce((a, b) => (b.pieces > a.pieces ? b : a))
  const minRow = active.reduce((a, b) => (b.pieces < a.pieces ? b : a))

  if (cv < 0.2) {
    return {
      label: 'Balanceado',
      color: 'emerald',
      detail: `CV ${(cv * 100).toFixed(0)}% — distribución uniforme entre ${active.length} gates activos`,
    }
  }
  if (cv < 0.4) {
    return {
      label: 'Moderado',
      color: 'amber',
      detail: `CV ${(cv * 100).toFixed(0)}% — G${maxRow.gate} más cargado, G${minRow.gate} menos`,
    }
  }
  return {
    label: 'Desequilibrado',
    color: 'red',
    detail: `CV ${(cv * 100).toFixed(0)}% — G${maxRow.gate} muy sobrecargado vs G${minRow.gate}`,
  }
}

/** Colores de calidad → hex aproximado */
const QUALITY_COLOR: Record<string, string> = {
  superior:  '#10b981', // emerald
  primera:   '#3b82f6', // blue
  segunda:   '#f59e0b', // amber
  tercera:   '#f97316', // orange
  descarte:  '#ef4444', // red
}

function qualityColor(q?: string): string {
  const k = (q ?? '').toLowerCase().replace(/[^a-z]/g, '')
  for (const [key, hex] of Object.entries(QUALITY_COLOR)) {
    if (k.includes(key)) return hex
  }
  return '#6366f1' // indigo fallback
}

export function GateBreakdownCard({
  gateDistribution,
  configSnapshots,
  totalPieces,
  pointZeroPieces,
  pointZeroPct,
}: GateBreakdownCardProps) {
  // Último configSnapshot → mapa gateNumber → GateAssignment
  const gateConfigMap = useMemo(() => {
    const m = new Map<number, { calibre: string; quality: string }>()
    if (!configSnapshots || configSnapshots.length === 0) return m
    const last = configSnapshots[configSnapshots.length - 1]!
    for (const g of last.gates) {
      if (g.active) m.set(g.gateNumber, { calibre: g.assignedCalibre, quality: g.assignedQuality })
    }
    return m
  }, [configSnapshots])

  const { productiveRows, maxPieces } = useMemo(() => {
    const productive = gateDistribution
      .filter(r => r.gate !== 0)
      .sort((a, b) => b.pieces - a.pieces)
    const max = productive.reduce((m, r) => Math.max(m, r.pieces), 1)
    return { productiveRows: productive, maxPieces: max }
  }, [gateDistribution])

  const balance = useMemo(() => computeBalance(productiveRows), [productiveRows])
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
              'ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium',
              balance.color === 'emerald' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
              balance.color === 'amber'   && 'border-amber-500/40 bg-amber-500/10 text-amber-400',
              balance.color === 'red'     && 'border-red-500/40 bg-red-500/10 text-red-400',
              balance.color === 'zinc'    && 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400',
            )}
            title={balance.detail}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {balance.label}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-1.5">
        {/* Gates productivos ordenados por volumen */}
        {productiveRows.map(row => {
          const cfg = gateConfigMap.get(row.gate)
          const barPct = maxPieces > 0 ? (row.pieces / maxPieces) * 100 : 0
          const color = cfg ? qualityColor(cfg.quality) : '#6366f1'
          const isTop = row === productiveRows[0]

          return (
            <div key={row.gate} className="flex items-center gap-2 group">
              {/* Label gate */}
              <div className="w-8 shrink-0 text-right">
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    isTop ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  G{row.gate}
                </span>
              </div>

              {/* Config (calibre · calidad) */}
              <div className="w-32 shrink-0 truncate text-[11px] text-muted-foreground">
                {cfg ? `${cfg.calibre} · ${cfg.quality}` : '—'}
              </div>

              {/* Barra horizontal */}
              <div className="flex-1 h-4 rounded-sm bg-muted/20 overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-300"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: color + (isTop ? 'cc' : '80'),
                  }}
                />
              </div>

              {/* Piezas + % */}
              <div className="w-28 shrink-0 text-right text-xs tabular-nums">
                <span className={cn(isTop ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {row.pieces.toLocaleString('es-CL')}
                </span>
                <span className="text-muted-foreground/60 ml-1">
                  {row.pct.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}

        {/* Separador + fila P0 */}
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
                <span className="text-orange-400 font-medium">
                  {pointZeroPieces.toLocaleString('es-CL')}
                </span>
                <span className="text-muted-foreground/60 ml-1">
                  {pointZeroPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </>
        )}

        {/* Footer — resumen */}
        <div className="pt-1 flex items-center gap-3 text-[11px] text-muted-foreground border-t border-border/30 mt-1">
          <span>{activeGates} gates activos de 12</span>
          <span>·</span>
          <span>{totalPieces.toLocaleString('es-CL')} pzas totales</span>
          {balance.detail && (
            <>
              <span>·</span>
              <span className="truncate" title={balance.detail}>{balance.detail}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
