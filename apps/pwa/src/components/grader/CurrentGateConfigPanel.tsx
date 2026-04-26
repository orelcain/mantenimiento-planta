/**
 * CurrentGateConfigPanel — vista compacta de la configuración actual de los 12 gates.
 *
 * Muestra el último snapshot disponible del turno en una grilla de 12 filas.
 * Permite al supervisor ver de un vistazo qué calibre/calidad tiene cada gate
 * sin navegar al wizard de configuración global.
 *
 * Read-only. Para cambiar, usar el botón del ConfigChangeHistory.
 */

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'
import { SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { qualityColorTextClass } from '@/services/grader/graderQualityColors'
import { fmtTime, fmtRelativeTime } from '@/services/grader/graderTimeFormat'

interface CurrentGateConfigPanelProps {
  configSnapshots: GateConfigSnapshot[]
}

export function CurrentGateConfigPanel({ configSnapshots }: CurrentGateConfigPanelProps) {
  const [open, setOpen] = useState(false)

  const latest = useMemo(() => {
    if (!configSnapshots || configSnapshots.length === 0) return null
    return configSnapshots[configSnapshots.length - 1]!
  }, [configSnapshots])

  if (!latest) return null

  const gates = [...latest.gates].sort((a, b) => a.gateNumber - b.gateNumber)
  const activeCount = gates.filter(g => g.active).length
  const snapshotAt = fmtTime(latest.at)
  const snapshotRelative = fmtRelativeTime(Date.parse(latest.at))
  const isSynthetic = latest.synthetic
  const configChangesCount = configSnapshots.length - 1

  // Distribución de calidades — visible incluso con el panel colapsado.
  // Permite al supervisor ver de un vistazo la combinación A/B/Super sin abrir.
  const qualityCount = gates
    .filter((g) => g.active)
    .reduce<Record<string, number>>((acc, g) => {
      const q = g.assignedQuality ?? '?'
      acc[q] = (acc[q] ?? 0) + 1
      return acc
    }, {})

  return (
    <Card>
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          Config actual del turno
          <span className="text-[11px] font-normal text-muted-foreground ml-1">
            {activeCount} de 12 activas
          </span>
          {Object.keys(qualityCount).length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-normal text-muted-foreground/70">
              {Object.entries(qualityCount).sort().flatMap(([q, n], i) => [
                ...(i > 0 ? [<span key={`sep-${i}`} className="text-muted-foreground/30 mx-0.5">·</span>] : []),
                <span key={q} className={qualityColorTextClass(q)}>{n}×{q}</span>,
              ])}
            </span>
          )}
          {configChangesCount > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
              title={`La configuración de gates cambió ${configChangesCount} vez${configChangesCount > 1 ? 'es' : ''} durante el turno`}
            >
              {configChangesCount} cambio{configChangesCount > 1 ? 's' : ''} mid-turno
            </span>
          )}
          {isSynthetic && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border/40 cursor-help"
              title="Inferida desde la última asignación efectiva — no se subió un snapshot manual al inicio del turno."
            >
              inferida
            </span>
          )}
          <button
            onClick={() => setOpen(v => !v)}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            title={`Última actualización: ${snapshotRelative}`}
          >
            <span>desde {snapshotAt}</span>
            <span className="text-muted-foreground/50">· {snapshotRelative}</span>
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="pt-2 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
            {gates.map(g => (
              <div
                key={g.gateNumber}
                className={cn(
                  'flex items-center gap-2 py-1 text-xs border-b border-border/20 last:border-0',
                  !g.active && 'opacity-40',
                )}
              >
                {/* Gate # */}
                <span className={cn(
                  'w-7 shrink-0 font-semibold tabular-nums',
                  g.active ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  G{g.gateNumber}
                </span>

                {/* Calibre */}
                <span className="text-muted-foreground truncate flex-1">
                  {g.active ? g.assignedCalibre : '—'}
                </span>

                {/* Calidad */}
                {g.active && (
                  <span className={cn('shrink-0 font-medium', qualityColorTextClass(g.assignedQuality))}>
                    {g.assignedQuality}
                  </span>
                )}

                {/* Inactiva */}
                {!g.active && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">inactiva</span>
                )}
              </div>
            ))}
          </div>

          {latest.changedBy?.name && (
            <p className="mt-2 text-[10px] text-muted-foreground/50">
              Último cambio por {latest.changedBy.name} · {snapshotAt}
              {latest.reason && ` · "${latest.reason}"`}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
