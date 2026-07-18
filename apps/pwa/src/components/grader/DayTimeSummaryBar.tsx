/**
 * DayTimeSummaryBar — tiempos TOTALES DEL DÍA (todos los turnos + Unscheduled).
 *
 * El operador pedía "tiempos del día", no solo del turno abierto — hasta ahora
 * la página solo mostraba tiempos de UN turno a la vez. Descubre los turnos
 * reales del día (`listShiftInfosForDay`, misma fuente de verdad que el resto
 * del módulo: Shoplogix define los turnos) y suma uptime/paro/break de las 3
 * Baaders a través de TODOS ellos.
 */
import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  listShiftInfosForDay,
  loadShoplogixShift,
} from '@/services/shoplogix/shoplogixShift.service'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import { fmtDurationSec } from '@/services/grader/graderTimeFormat'
import { getShiftMeta, SLX_NOISE_THRESHOLD } from '@/services/grader/graderShiftDisplay'

interface DayTotals {
  uptimeSec: number
  downtimeSec: number
  breakSec: number
  turnos: Array<{ shiftId: string; downtimeSec: number; cycles: number }>
}

async function computeDayTotals(dateKey: string, plantSlug: PlantSlug): Promise<DayTotals | null> {
  const infos = await listShiftInfosForDay(dateKey, plantSlug)
  const significant = infos.filter(i => (i.totalCycles ?? 0) >= SLX_NOISE_THRESHOLD || i.shiftId !== 'Unscheduled')
  if (significant.length === 0) return null

  const snapshots = await Promise.all(
    significant.map(i => loadShoplogixShift(dateKey, i.shiftId, plantSlug, true).catch(() => null)),
  )

  const totals: DayTotals = { uptimeSec: 0, downtimeSec: 0, breakSec: 0, turnos: [] }
  let any = false
  significant.forEach((info, idx) => {
    const snap = snapshots[idx]?.snapshot
    if (!snap) return
    let shiftDowntime = 0
    let shiftCycles = 0
    for (const m of snap.machines) {
      const bd = m.shiftRuntimeBreakdown
      if (bd) {
        totals.uptimeSec   += bd.uptimeSec   || 0
        totals.downtimeSec += bd.downtimeSec || 0
        totals.breakSec    += bd.breakSec    || 0
        shiftDowntime      += bd.downtimeSec || 0
      }
      shiftCycles += m.totalCycles || 0
    }
    if (shiftCycles > 0) any = true
    totals.turnos.push({ shiftId: info.shiftId, downtimeSec: shiftDowntime, cycles: shiftCycles })
  })
  return any ? totals : null
}

interface Props {
  dateKey: string | null | undefined
  plantSlug: PlantSlug
  enabled: boolean
  className?: string
}

export function DayTimeSummaryBar({ dateKey, plantSlug, enabled, className }: Props) {
  const [totals, setTotals] = useState<DayTotals | null>(null)

  useEffect(() => {
    if (!enabled || !dateKey) { setTotals(null); return }
    let cancelled = false
    computeDayTotals(dateKey, plantSlug)
      .then(t => { if (!cancelled) setTotals(t) })
      .catch(() => { if (!cancelled) setTotals(null) })
    return () => { cancelled = true }
  }, [dateKey, plantSlug, enabled])

  if (!enabled || !totals) return null

  return (
    <div className={cn(
      'flex items-center gap-3 flex-wrap px-3 py-1.5 rounded-md border border-border bg-muted text-xs',
      className,
    )}>
      <span className="flex items-center gap-1.5 text-muted-foreground font-medium shrink-0">
        <Clock className="w-3.5 h-3.5" />
        Tiempos del día {dateKey}:
      </span>
      <span className="text-emerald-400 tabular-nums" title="Tiempo total procesando (suma de las 3 Baaders, todos los turnos)">
        ▲ {fmtDurationSec(totals.uptimeSec)} uptime
      </span>
      <span className="text-rose-400 tabular-nums" title="Tiempo total de detención/paro (suma de las 3 Baaders, todos los turnos)">
        ⏸ {fmtDurationSec(totals.downtimeSec)} paro
      </span>
      {totals.breakSec > 0 && (
        <span className="text-amber-400 tabular-nums" title="Pausas programadas (colación/reunión), todos los turnos">
          ☕ {fmtDurationSec(totals.breakSec)}
        </span>
      )}
      <span className="text-muted-foreground/70 flex items-center gap-1.5 flex-wrap">
        {totals.turnos.filter(t => t.cycles > 0).map(t => (
          <span key={t.shiftId} title={`${getShiftMeta(t.shiftId).label}: ${fmtDurationSec(t.downtimeSec)} de detención`}>
            {getShiftMeta(t.shiftId).shortLabel} {fmtDurationSec(t.downtimeSec)}
          </span>
        ))}
      </span>
    </div>
  )
}
