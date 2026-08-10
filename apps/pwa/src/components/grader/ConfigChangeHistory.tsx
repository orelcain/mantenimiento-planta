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
 * Incluye un botón de cambio de gate en el header para registrar nuevos cambios
 * sin tener que volver al calendario.
 */

import { useMemo } from 'react'
import { Wrench, Sparkles, User, Clock, AlertTriangle, TrendingDown, TrendingUp, Minus, Hourglass } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { GateChangeTrigger } from './GateChangeTrigger'
import {
  computeSegmentVerdicts,
  verdictColor,
  verdictLabel,
  type SegmentVerdict,
} from '@/services/grader/graderP0Segmentation'
import type { GateConfigSnapshot, ConfigDiff } from '@/services/grader/graderConfigSnapshot.service'
import type { TimelineBucket } from '@/services/grader/types'
import { fmtTime } from '@/services/grader/graderTimeFormat'

interface Props {
  shiftDocId: string
  snapshots: GateConfigSnapshot[]
  /** Buckets P0% por minuto del turno — necesario para calcular verdicts antes/después de cada cambio */
  timelineBuckets?: TimelineBucket[]
  /** Callback tras guardar un nuevo cambio — el caller refresca snapshots */
  onChange?: () => void
  /** Si false, deshabilita el botón de registro (turno ya cerrado) */
  allowEdit?: boolean
}

const FIELD_LABELS: Record<ConfigDiff['field'], string> = {
  assignedCalibre:      'calibre',
  assignedQuality:      'calidad',
  assignedConservation: 'conservación',
  assignedProduct:      'producto',
  active:               'activa',
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
  verdict?: SegmentVerdict
}

/** Mini badge debajo del diff con el resultado del cambio (Fase C). */
function VerdictBadge({ v }: { v: SegmentVerdict }) {
  if (v.status === 'insufficient-data') {
    return (
      <div className="inline-flex items-center gap-1.5 text-caption text-muted-foreground bg-muted rounded-ctl px-2 py-1 mt-1">
        <Hourglass className="w-3 h-3" />
        Esperando más datos
        {v.afterPieces > 0 && (
          <span className="text-muted-foreground/70">
            ({v.afterPieces} pzas hasta ahora — esperá ≥30)
          </span>
        )}
      </div>
    )
  }

  // Iconos y bg/border son específicos de este componente (otros lugares usan
  // arrows unicode), pero el COLOR de texto y el LABEL vienen de helpers
  // compartidos en graderP0Segmentation.ts (consistencia entre componentes).
  const visualByStatus = {
    improved: { Icon: TrendingDown, bg: 'bg-emerald-500/[0.15]', border: 'border-emerald-500/[0.25]' },
    worsened: { Icon: TrendingUp,   bg: 'bg-cat-5-tint/[0.15]',    border: 'border-cat-5-tint/[0.25]'    },
    neutral:  { Icon: Minus,        bg: 'bg-muted-foreground/[0.10]',    border: 'border-muted-foreground/[0.10]'    },
  }[v.status]

  const color = verdictColor(v.status)
  const label = verdictLabel(v.status)
  const sign = v.delta > 0 ? '+' : ''
  return (
    <div
      className={cn('inline-flex items-center gap-1.5 text-caption rounded-ctl px-2 py-1 mt-1 border', visualByStatus.bg, visualByStatus.border)}
      title={`Antes ${v.beforePct.toFixed(2)}% → Después ${v.afterPct.toFixed(2)}% (${v.afterPieces.toLocaleString('es-CL')} piezas en ${v.afterMinutes} min)`}
    >
      <visualByStatus.Icon className={cn('w-3 h-3', color)} />
      <span className={cn('font-medium', color)}>{label}</span>
      <span className={color}>
        {sign}{v.delta.toFixed(2)}pts
      </span>
      <span className="text-muted-foreground/80">
        en {v.afterMinutes} min · {v.afterPieces.toLocaleString('es-CL')} pzas
      </span>
    </div>
  )
}

function ConfigChangeRow({ snap, isFirst, verdict }: RowProps) {
  const grouped = useMemo(() => groupChangesByGate(snap.changes), [snap.changes])
  const isSynthetic = snap.synthetic === true

  // Para snapshots synthetic la hora exacta no es la hora real del cambio
  // (es cuando corrió el reclassify). Mostramos guion + tooltip explicativo.
  const timeDisplay = isSynthetic ? '—' : fmtTime(snap.at)
  const timeTitle   = isSynthetic
    ? 'Snapshot inferido — la hora exacta del cambio no se conoce, se aplicó retroactivamente al inicio del turno'
    : `Cambio registrado a las ${fmtTime(snap.at)}`

  // Label principal según tipo
  const titleLabel = isSynthetic
    ? 'Config inicial inferida (reclassify)'
    : isFirst
      ? 'Config inicial del turno'
      : `${grouped.size} ${grouped.size === 1 ? 'gate cambiada' : 'gates cambiadas'}`

  // Para snapshots synthetic: si el reason indica N ventanas detectadas (N>=2),
  // significa que el sistema infirió múltiples cambios intra-turno que el operador
  // no registró en su momento. Mostramos badge sutil que invita a revisar.
  const undetectedChanges = useMemo(() => {
    if (!isSynthetic || !snap.reason) return 0
    const m = snap.reason.match(/\((\d+)\s*ventanas?\s+detectadas/i)
    if (!m || !m[1]) return 0
    const n = parseInt(m[1], 10)
    return n >= 2 ? n - 1 : 0  // N ventanas → N-1 transiciones (cambios)
  }, [isSynthetic, snap.reason])

  return (
    <li className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-b-0">
      {/* Indicador timeline lateral */}
      <div className="flex flex-col items-center pt-1" title={isSynthetic ? 'Inferido' : 'Registrado manualmente'}>
        {isSynthetic
          ? <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          : <Wrench className="w-3.5 h-3.5 text-amber-500" />}
      </div>

      {/* Hora */}
      <div
        className={cn(
          'text-xs font-mono tabular-nums shrink-0 w-12 pt-0.5',
          isSynthetic ? 'text-muted-foreground/50 italic' : 'text-muted-foreground',
        )}
        title={timeTitle}
      >
        {timeDisplay}
      </div>

      {/* Contenido principal */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn('text-sm font-medium', isSynthetic && 'text-muted-foreground')}>
            {titleLabel}
          </span>
          {snap.changedBy?.name && !isSynthetic && (
            <span className="text-caption text-muted-foreground inline-flex items-center gap-1">
              <User className="w-2.5 h-2.5" />
              {snap.changedBy.name}
            </span>
          )}
          {undetectedChanges > 0 && (
            <span
              className="inline-flex items-center gap-1 text-caption px-1.5 py-0.5 rounded-full bg-amber-500/[0.15] text-amber-400 border border-amber-500/[0.25] font-medium"
              title={`El sistema detectó ~${undetectedChanges} transiciones de configuración durante el turno que no fueron registradas en tiempo real. Si recordás los cambios reales (qué gate, qué hora), registralos manualmente con el botón "Cambiar gate" para que el análisis segmentado los reconozca.`}
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              ~{undetectedChanges} {undetectedChanges === 1 ? 'cambio' : 'cambios'} no registrados
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
          <div className="text-caption italic text-muted-foreground/80">
            "{snap.reason}"
          </div>
        )}

        {/* Verdict del cambio (Fase C) — solo para snapshots manuales */}
        {verdict && !isSynthetic && (
          <div><VerdictBadge v={verdict} /></div>
        )}
      </div>
    </li>
  )
}

export function ConfigChangeHistory({ shiftDocId, snapshots, timelineBuckets, onChange, allowEdit = true }: Props) {
  // Filtrar snapshots "ruido": manuales sin cambios reales (changes=0 && !synthetic)
  // suelen quedar al abrir el wizard de config sin tocar nada — no aportan info.
  // Synthetic con changes=0 SÍ se muestran (representan la config inicial inferida).
  const sorted = useMemo(
    () => snapshots
      .filter(s => s.synthetic === true || (s.changes?.length ?? 0) > 0)
      .sort((a, b) => a.at.localeCompare(b.at)),
    [snapshots],
  )

  // Calcular verdict de cada cambio manual (P0% antes vs después)
  const verdicts = useMemo(
    () => timelineBuckets && timelineBuckets.length > 0
      ? computeSegmentVerdicts(snapshots, timelineBuckets)
      : new Map(),
    [snapshots, timelineBuckets],
  )

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="w-4 h-4 text-amber-500" />
          Historial de configuración
          {sorted.length > 0 && (
            <Badge variant="outline" className="text-caption font-normal">
              {sorted.length} {sorted.length === 1 ? 'snapshot' : 'snapshots'}
            </Badge>
          )}
        </CardTitle>
        <GateChangeTrigger
          shiftDocId={shiftDocId}
          configSnapshots={snapshots}
          variant="compact"
          onSaved={onChange}
          allowEdit={allowEdit}
        />
      </CardHeader>

      <CardContent className={cn('pt-1', sorted.length === 0 && 'py-4')}>
        {sorted.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center flex flex-col items-center gap-2 py-4">
            <Clock className="w-5 h-5 text-muted-foreground/50" />
            <p>Sin cambios registrados todavía.</p>
            <p className="text-caption text-muted-foreground/70 max-w-sm">
              Cuando control de producción cambie un gate, registralo con el botón de arriba —
              quedará en el timeline y se usará para clasificar las piezas posteriores.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {sorted.map((snap, i) => (
              <ConfigChangeRow
                key={snap.id}
                snap={snap}
                isFirst={i === 0}
                verdict={verdicts.get(snap.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
