/**
 * LineStatusWidget — strip de estado de la línea completa durante turno vivo.
 *
 * Solo se monta cuando hay un turno en curso. Muestra 3 señales:
 *   · Grader: P0% del turno actual (desde el summary si fue cargado)
 *   · Marel HG: piezas totales de la última captura + hora
 *   · Baader: link directo al análisis del turno (datos Shoplogix allí)
 *
 * No bloquea el render: cada señal puede estar en "sin datos" sin romper el widget.
 */
import { useNavigate } from 'react-router-dom'
import { Activity, Zap, ArrowRight, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import { verdictFromP0Pct } from '@/services/grader/graderThresholds'
import type { GraderDailySummary } from '@/services/grader/types'

const P0_COLOR: Record<ReturnType<typeof verdictFromP0Pct>, string> = {
  ok:       'text-emerald-400',
  warn:     'text-amber-400',
  critical: 'text-red-400',
}

interface LineStatusWidgetProps {
  shiftDocId: string          // "YYYY-MM-DD__Turno día"
  shiftId: string             // "Turno día" | "Turno noche"
  shiftStart: string | null   // ISO timestamp inicio
  todaySummary: GraderDailySummary | null   // summary del turno vivo (puede ser null si aún no se cargó Excel)
}

function ShiftStartLabel({ iso }: { iso: string | null }) {
  if (!iso) return null
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
      <Clock className="w-2.5 h-2.5" />
      desde {fmtTime(iso)}
    </span>
  )
}

export function LineStatusWidget({
  shiftDocId,
  shiftId,
  shiftStart,
  todaySummary,
}: LineStatusWidgetProps) {
  const navigate = useNavigate()

  const shortShift = shiftId.includes('día') ? 'Turno día' : 'Turno noche'

  // P0 del turno vivo
  const p0Pct = todaySummary?.pointZeroPct ?? null
  const verdict = p0Pct !== null ? verdictFromP0Pct(p0Pct) : 'ok'

  return (
    <div
      className="rounded-lg border border-red-500/20 bg-red-500/15 px-3 py-2.5 cursor-pointer hover:bg-red-500/20 transition-colors"
      onClick={() => navigate(`/analisis-grader/turno/${shiftDocId}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(`/analisis-grader/turno/${shiftDocId}`)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3.5 h-3.5 text-red-400 animate-pulse shrink-0" />
        <span className="text-xs font-semibold text-red-400">{shortShift} en curso</span>
        <ShiftStartLabel iso={shiftStart} />
        <span className="ml-auto text-[10px] text-muted-foreground/50 flex items-center gap-1">
          Ver turno <ArrowRight className="w-3 h-3" />
        </span>
      </div>

      {/* 3 señales */}
      <div className="grid grid-cols-3 gap-2 divide-x divide-border/30">

        {/* Grader P0% */}
        <div className="flex flex-col gap-0.5 pr-2">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Grader</span>
          {p0Pct !== null ? (
            <>
              <span className={cn('text-lg font-bold tabular-nums leading-tight', P0_COLOR[verdict])}>
                {p0Pct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-muted-foreground/50">P0 del turno</span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-muted-foreground/40">—</span>
              <span className="text-[10px] text-muted-foreground/40">Sin Excel cargado</span>
            </>
          )}
        </div>


        {/* Producción Grader */}
        <div className="flex flex-col gap-0.5 pl-2">
          <div className="flex items-center gap-1">
            <Zap className="w-2.5 h-2.5 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Producción</span>
          </div>
          {todaySummary?.totalPieces != null && todaySummary.totalPieces > 0 ? (
            <>
              <span className="text-lg font-bold tabular-nums leading-tight text-foreground/80">
                {todaySummary.totalPieces.toLocaleString('es-CL')}
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                piezas
                {todaySummary.productionRatePerHour
                  ? ` · ${Math.round(todaySummary.productionRatePerHour)}/h`
                  : ''}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-muted-foreground/40">—</span>
              <span className="text-[10px] text-muted-foreground/40">Sin datos aún</span>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
