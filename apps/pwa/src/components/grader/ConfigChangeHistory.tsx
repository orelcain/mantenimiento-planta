/**
 * Tabla de historial de cambios de configuración del turno.
 *
 * Lista los GateConfigSnapshot del turno ordenados cronológicamente, mostrando:
 *  - Hora del cambio
 *  - Usuario que lo hizo
 *  - Diff legible: "Gate 3: calibre 4-6 lb → 6-8 lb · calidad Premium → Industrial"
 *  - Motivo si lo dejó
 *  - Si es synthetic (inferido por el reclassify), se marca distinto
 *
 * El componente vive en el detalle del turno, debajo del timeline. Las marcas
 * verticales 🔧 del timeline corresponden 1:1 con las filas de esta tabla.
 *
 * Incluye un QuickGateChangeButton en el header para registrar nuevos cambios
 * sin tener que volver al calendario.
 */

import { useMemo } from 'react'
import { Wrench, Sparkles, User, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { QuickGateChangeButton } from './QuickGateChangeButton'
import type { GateConfigSnapshot, ConfigDiff } from '@/services/grader/graderConfigSnapshot.service'

interface Props {
  shiftDocId: string
  snapshots: GateConfigSnapshot[]
  /** Callback tras guardar un nuevo cambio — el caller refresca snapshots */
  onChange?: () => void
}

const FIELD_LABELS: Record<ConfigDiff['field'], string> = {
  assignedCalibre:      'calibre',
  assignedQuality:      'calidad',
  assignedConservation: 'conservación',
  assignedProduct:      'producto',
  active:               'activa',
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  })
}

function fmtValue(field: ConfigDiff['field'], value: unknown): string {
  if (field === 'active') return value ? 'sí' : 'no'
  if (value == null || value === '') return '—'
  return String(value)
}

/** Agrupa los diffs por gateNumber para presentación más limpia */
function groupChangesByGate(changes: ConfigDiff[]): Map<number, ConfigDiff[]> {
  const m = new Map<number, ConfigDiff[]>()
  for (const c of changes) {
    if (!m.has(c.gateNumber)) m.set(c.gateNumber, [])
    m.get(c.gateNumber)!.push(c)
  }
  return m
}

interface RowProps {
  snap: GateConfigSnapshot
  isFirst: boolean
}

function ConfigChangeRow({ snap, isFirst }: RowProps) {
  const grouped = useMemo(() => groupChangesByGate(snap.changes), [snap.changes])
  const isSynthetic = snap.synthetic === true

  return (
    <li className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-b-0">
      {/* Indicador timeline lateral */}
      <div className="flex flex-col items-center pt-1">
        {isSynthetic
          ? <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          : <Wrench className="w-3.5 h-3.5 text-amber-500" />}
      </div>

      {/* Hora */}
      <div className="text-xs font-mono tabular-nums shrink-0 w-12 text-muted-foreground pt-0.5">
        {fmtTime(snap.at)}
      </div>

      {/* Contenido principal */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {isFirst
              ? 'Config inicial del turno'
              : isSynthetic
                ? 'Inferido por reclassify'
                : `${grouped.size} ${grouped.size === 1 ? 'gate cambiada' : 'gates cambiadas'}`}
          </span>
          {snap.changedBy?.name && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <User className="w-2.5 h-2.5" />
              {snap.changedBy.name}
            </span>
          )}
        </div>

        {/* Diff por gate */}
        {grouped.size > 0 && (
          <ul className="text-xs space-y-0.5">
            {[...grouped.entries()].sort(([a], [b]) => a - b).map(([gateNumber, changes]) => (
              <li key={gateNumber} className="text-muted-foreground">
                <span className="font-mono text-foreground/80">Gate {gateNumber}:</span>{' '}
                {changes.map((c, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-muted-foreground/60"> · </span>}
                    {FIELD_LABELS[c.field]}{' '}
                    <span className="text-muted-foreground/80 font-mono">{fmtValue(c.field, c.before)}</span>
                    <span className="mx-0.5 text-muted-foreground/60">→</span>
                    <span className="text-foreground font-mono">{fmtValue(c.field, c.after)}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}

        {snap.reason && (
          <div className="text-[11px] italic text-muted-foreground/80">
            "{snap.reason}"
          </div>
        )}
      </div>
    </li>
  )
}

export function ConfigChangeHistory({ shiftDocId, snapshots, onChange }: Props) {
  // Ordenar por at asc (deberían venir así, pero por seguridad)
  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.at.localeCompare(b.at)),
    [snapshots],
  )

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="w-4 h-4 text-amber-500" />
          Historial de configuración
          {sorted.length > 0 && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {sorted.length} {sorted.length === 1 ? 'snapshot' : 'snapshots'}
            </Badge>
          )}
        </CardTitle>
        <QuickGateChangeButton
          shiftDocId={shiftDocId}
          variant="compact"
          onSaved={onChange}
        />
      </CardHeader>

      <CardContent className={cn('pt-1', sorted.length === 0 && 'py-4')}>
        {sorted.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center flex flex-col items-center gap-2 py-4">
            <Clock className="w-5 h-5 text-muted-foreground/50" />
            <p>Sin cambios registrados todavía.</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-sm">
              Cuando control de producción cambie un gate, registralo con el botón de arriba —
              quedará en el timeline y se usará para clasificar las piezas posteriores.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {sorted.map((snap, i) => (
              <ConfigChangeRow key={snap.id} snap={snap} isFirst={i === 0} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
