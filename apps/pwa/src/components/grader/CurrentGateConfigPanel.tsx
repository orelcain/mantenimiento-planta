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

interface CurrentGateConfigPanelProps {
  configSnapshots: GateConfigSnapshot[]
}

const QUALITY_COLOR: Record<string, string> = {
  premium:    'text-indigo-400',
  superior:   'text-emerald-400',
  primera:    'text-blue-400',
  segunda:    'text-amber-400',
  tercera:    'text-orange-400',
  industrial: 'text-slate-400',
  descarte:   'text-red-400',
  grado:      'text-cyan-400',
  d:          'text-zinc-400',
}

function qualityClass(q: string): string {
  const k = q.toLowerCase().replace(/[^a-z]/g, '')
  for (const [key, cls] of Object.entries(QUALITY_COLOR)) {
    if (k.includes(key)) return cls
  }
  return 'text-muted-foreground'
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
  const snapshotAt = new Date(latest.at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const isSynthetic = latest.synthetic

  return (
    <Card>
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          Config actual del turno
          <span className="text-[11px] font-normal text-muted-foreground ml-1">
            {activeCount} de 12 activas
          </span>
          {isSynthetic && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border/40">
              inferida
            </span>
          )}
          <button
            onClick={() => setOpen(v => !v)}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>desde {snapshotAt}</span>
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
                  <span className={cn('shrink-0 font-medium', qualityClass(g.assignedQuality))}>
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
