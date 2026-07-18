/**
 * GateChangeImpactCard — P0% antes/después de cada cambio de gate.
 *
 * Ventana fija de 10 min a cada lado del cambio.
 * Solo muestra si hay ≥1 cambio non-synthetic con datos de buckets.
 * "en curso" cuando la ventana posterior aún no tiene suficientes datos.
 */
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { TrendingDown, TrendingUp, Minus, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import type { TimelineBucket } from '@/services/grader/types'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'

const WINDOW_MIN = 10
const MIN_AFTER_BUCKETS = 5

function shiftIso(iso: string, deltaMin: number): string {
  return new Date(new Date(iso).getTime() + deltaMin * 60_000).toISOString()
}

function p0PctInWindow(
  buckets: TimelineBucket[],
  fromIso: string,
  toIso: string,
): number | null {
  const slice = buckets.filter(b => b.tsMin >= fromIso && b.tsMin < toIso)
  const total = slice.reduce((s, b) => s + b.pieces, 0)
  if (total === 0) return null
  return (slice.reduce((s, b) => s + b.p0Pieces, 0) / total) * 100
}

function countBucketsAfter(buckets: TimelineBucket[], fromIso: string, toIso: string): number {
  return buckets.filter(b => b.tsMin >= fromIso && b.tsMin < toIso).length
}

interface ChangeSegment {
  snapshotAt: string
  label: string
  p0Before: number | null
  p0After: number | null
  afterBuckets: number
  changedBy?: string
}

interface GateChangeImpactCardProps {
  timelineBuckets: TimelineBucket[]
  configSnapshots: GateConfigSnapshot[]
}

export function GateChangeImpactCard({
  timelineBuckets,
  configSnapshots,
}: GateChangeImpactCardProps) {
  const [open, setOpen] = useState(false)

  const segments = useMemo<ChangeSegment[]>(() => {
    const changes = configSnapshots.filter(s => !s.synthetic && s.changes.length > 0)

    return changes.map(snap => {
      const at = snap.at
      const windowStart = shiftIso(at, -WINDOW_MIN)
      const windowEnd   = shiftIso(at, +WINDOW_MIN)

      const firstChange   = snap.changes[0]
      const gateNum       = firstChange?.gateNumber
      const calibreChange = snap.changes.find(c => c.field === 'assignedCalibre')
      const qualityChange = snap.changes.find(c => c.field === 'assignedQuality')

      let label = gateNum ? `G${gateNum}` : 'cambio'
      if (calibreChange)                label += ` → ${String(calibreChange.after)}`
      else if (qualityChange)           label += ` → ${String(qualityChange.after)}`
      if (snap.changes.length > 1)      label += ` +${snap.changes.length - 1}`

      return {
        snapshotAt:  at,
        label,
        p0Before:    p0PctInWindow(timelineBuckets, windowStart, at),
        p0After:     p0PctInWindow(timelineBuckets, at, windowEnd),
        afterBuckets: countBucketsAfter(timelineBuckets, at, windowEnd),
        changedBy:   snap.changedBy?.name,
      }
    })
  }, [timelineBuckets, configSnapshots])

  if (segments.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" />
          Impacto de cambios
          <span className="text-[11px] font-normal text-muted-foreground">
            P0% ±{WINDOW_MIN} min
          </span>
          <span className="text-[10px] text-muted-foreground/50 font-normal">
            {segments.length} cambio{segments.length > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setOpen(v => !v)}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="pt-3 pb-3">
          <div className="space-y-0">
            {segments.map((seg, i) => {
              const delta = seg.p0Before !== null && seg.p0After !== null
                ? seg.p0After - seg.p0Before
                : null
              const inProgress = seg.afterBuckets < MIN_AFTER_BUCKETS
              const improved   = delta !== null && delta < -0.5
              const worsened   = delta !== null && delta > 0.5

              return (
                <div
                  key={i}
                  className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0 flex-wrap"
                >
                  {/* Hora + label */}
                  <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 w-10">
                    {fmtTime(seg.snapshotAt)}
                  </span>
                  <span className="text-xs font-medium flex-1 min-w-0 truncate">{seg.label}</span>
                  {seg.changedBy && (
                    <span className="text-[10px] text-muted-foreground/40 truncate hidden sm:block max-w-[6rem]">
                      {seg.changedBy}
                    </span>
                  )}

                  {/* Antes */}
                  <span className={cn(
                    'text-[11px] tabular-nums shrink-0 w-12 text-right',
                    seg.p0Before === null
                      ? 'text-muted-foreground/30'
                      : seg.p0Before > 5 ? 'text-red-400' : 'text-muted-foreground',
                  )}>
                    {seg.p0Before !== null ? `${seg.p0Before.toFixed(1)}%` : '—'}
                  </span>

                  <span className="text-muted-foreground/30 text-xs shrink-0">→</span>

                  {/* Después */}
                  <span className={cn(
                    'text-[11px] tabular-nums shrink-0 w-14 text-right',
                    inProgress
                      ? 'text-amber-400/70 italic text-[10px]'
                      : seg.p0After === null
                        ? 'text-muted-foreground/30'
                        : improved ? 'text-emerald-400'
                          : worsened ? 'text-red-400'
                            : 'text-muted-foreground',
                  )}>
                    {inProgress
                      ? 'en curso'
                      : seg.p0After !== null ? `${seg.p0After.toFixed(1)}%` : '—'}
                  </span>

                  {/* Delta badge */}
                  {!inProgress && delta !== null && (
                    <span className={cn(
                      'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0',
                      improved  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : worsened ? 'bg-red-500/20 text-red-700 dark:text-red-400'
                          : 'bg-muted text-muted-foreground',
                    )}>
                      {improved  ? <TrendingDown className="w-2.5 h-2.5" />
                        : worsened ? <TrendingUp   className="w-2.5 h-2.5" />
                          : <Minus className="w-2.5 h-2.5" />}
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-muted-foreground/40 mt-2.5">
            Ventana de {WINDOW_MIN} min antes/después de cada cambio · solo piezas clasificadas
          </p>
        </CardContent>
      )}
    </Card>
  )
}
