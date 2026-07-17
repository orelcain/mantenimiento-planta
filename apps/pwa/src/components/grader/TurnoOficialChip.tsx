/**
 * TurnoOficialChip — horario oficial, especie en curso y % cumplimiento vs
 * target oficial del turno, tomados del rollup de Shoplogix
 * (`officialSchedule`/`currentJob`/`officialTargetsByMachineId`).
 *
 * Solo existe para el turno VIGENTE (el rollup nunca se captura en backfill,
 * ver `fetchOfficialRollup` en functions/shoplogix/sync.js) — en turnos
 * históricos `rollup` llega `null` y este componente no renderiza nada.
 *
 * El % de cumplimiento usa la MISMA fórmula que el brief de fin de turno de
 * Telegram (`componerBriefFinTurno`, umbrales 95/75) vía
 * `computeOfficialCompliance` — mismo número en ambos lados.
 */
import { Badge } from '@/components/ui'
import { Clock, Fish, Target } from 'lucide-react'
import type { ShoplogixOfficialRollup } from '@/services/shoplogix/shoplogixShift.service'
import { computeOfficialCompliance, type MachineKPI } from '@/services/grader/plantKpiCompute'

interface TurnoOficialChipProps {
  rollup: ShoplogixOfficialRollup | null
  /** Máquinas del turno con sus piezas producidas, para el % de cumplimiento. */
  machines: Pick<MachineKPI, 'machineid' | 'totalCycles'>[]
  className?: string
}

/** Igual convención que `fmtHora` en functions/shoplogix/turnoBrief.js: las
 *  horas de Shoplogix se guardan wall-clock-as-UTC, así que se leen con
 *  getUTCHours/Minutes — NUNCA con la zona horaria del navegador. */
function fmtHoraUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

const LEVEL_STYLES: Record<'ok' | 'warn' | 'critical', string> = {
  ok:       'border-emerald-500/40 text-emerald-400',
  warn:     'border-amber-500/40 text-amber-400',
  critical: 'border-red-500/40 text-red-400',
}

export function TurnoOficialChip({ rollup, machines, className }: TurnoOficialChipProps) {
  if (!rollup) return null
  const { officialSchedule, currentJob, officialTargetsByMachineId } = rollup
  const compliance = computeOfficialCompliance(machines, officialTargetsByMachineId)

  if (!officialSchedule && !currentJob?.name && !compliance) return null

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      {officialSchedule && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 gap-1 border-sky-500/40 text-sky-400"
          title="Horario oficial del turno (rollup de Shoplogix)"
        >
          <Clock className="w-3 h-3" />
          {fmtHoraUTC(officialSchedule.start)}–{fmtHoraUTC(officialSchedule.end)}
        </Badge>
      )}
      {currentJob?.name && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 gap-1 border-cyan-500/40 text-cyan-400"
          title={currentJob.jobMaxRunRate ? `Máx ${currentJob.jobMaxRunRate} pph` : 'Especie en curso'}
        >
          <Fish className="w-3 h-3" />
          {currentJob.name}
        </Badge>
      )}
      {compliance && (
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 gap-1 tabular-nums ${LEVEL_STYLES[compliance.level]}`}
          title={`Target oficial: ${Math.round(compliance.targetTotal).toLocaleString('es-CL')} piezas · ${Math.round(compliance.totalCycles).toLocaleString('es-CL')} producidas`}
        >
          <Target className="w-3 h-3" />
          {(compliance.pct * 100).toFixed(0)}% del target oficial
        </Badge>
      )}
    </div>
  )
}
