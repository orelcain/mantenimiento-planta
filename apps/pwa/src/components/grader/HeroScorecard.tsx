import { cn } from '@/lib/utils'
import { Badge, Card, CardContent } from '@/components/ui'
import { Activity, Clock, Radio, FileSpreadsheet, Sun, Sunset, Moon, Sunrise } from 'lucide-react'
import { getShiftMeta } from '@/services/grader/graderShiftDisplay'
import { verdictFromP0Pct } from '@/services/grader/graderThresholds'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GraderDailySummary } from '@/services/grader/types'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import { deriveBaaderRejection, type MarelHgCapture } from '@/services/grader/graderMarelHg.service'

/** Formatea diferencia de tiempo en relativo corto: "hace 58s" / "hace 1h 12m". */
function fmtSyncRelative(at: Date | null | undefined): string {
  if (!at) return '—'
  // Guard: Invalid Date → getTime() retorna NaN → strings tipo "hace NaNh"
  const ts = at.getTime()
  if (!Number.isFinite(ts)) return '—'
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 60) return `hace ${diffSec}s`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  const remM = min % 60
  return remM > 0 ? `hace ${h}h ${remM}m` : `hace ${h}h`
}

const VERDICT_STYLE = {
  ok: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-500/15',
    numColor: 'text-emerald-400',
    label: 'Turno en rango',
  },
  warn: {
    border: 'border-amber-500',
    bg: 'bg-amber-500/15',
    numColor: 'text-amber-400',
    label: 'Turno con oportunidades',
  },
  critical: {
    border: 'border-red-500',
    bg: 'bg-red-500/15',
    numColor: 'text-red-400',
    label: 'Turno fuera de rango',
  },
}

interface HeroScorecardProps {
  summary: GraderDailySummary
  shiftWindow: ShiftTimeWindow
  upstreamSnapshot?: UpstreamLineSnapshot | null
  /**
   * Captura manual Marel HG. Si está, se calcula rechazo Baader puro.
   * Si no, se cae a estimación bruta (rechazos + no-controladas Marel mezclados).
   */
  marelHgCapture?: MarelHgCapture | null
  /** Timestamp del último sync Shoplogix (para el badge "hace Xs"). */
  upstreamSyncedAt?: Date | null
}

export function HeroScorecard({ summary, shiftWindow, upstreamSnapshot, marelHgCapture, upstreamSyncedAt }: HeroScorecardProps) {
  const verdict = verdictFromP0Pct(summary.pointZeroPct)
  const style = VERDICT_STYLE[verdict]
  const throughputPerMin = summary.productionRatePerHour
    ? (summary.productionRatePerHour / 60).toFixed(0)
    : '—'

  const baaderTotal = upstreamSnapshot?.machines.reduce((s, m) => s + (m.totalCycles ?? 0), 0) ?? 0

  // Si hay captura Marel HG → rechazo Baader puro (Grader − Baader − Marel_no_controladas).
  // Si no hay captura → estimación bruta (Grader − Baader, mezcla rechazos + no-controladas).
  const baaderRejectionPure = deriveBaaderRejection({
    graderTotalPieces: summary.totalPieces,
    baaderTotalCycles: baaderTotal,
    marelHgCapture: marelHgCapture ?? null,
  })
  const upstreamDelta = baaderTotal > 0 ? summary.totalPieces - baaderTotal : null
  const rejectedRaw = upstreamDelta != null && upstreamDelta > 0 ? upstreamDelta : null
  const rejectedRawPct = rejectedRaw != null && baaderTotal > 0
    ? ((rejectedRaw / baaderTotal) * 100).toFixed(1)
    : null

  const durationLabel = shiftWindow.status === 'live' && shiftWindow.remainingMin != null
    ? `${Math.round(shiftWindow.elapsedMin)} min · faltan ${Math.round(shiftWindow.remainingMin)} min`
    : summary.durationMinutes
      ? `${summary.durationMinutes} min`
      : '—'

  // Metadata canónica del turno (label, ícono, color) — single source of truth.
  // Horario real (summary/shiftWindow) → período/ícono por HORA, no por nombre.
  const shiftMeta = getShiftMeta(summary.shiftId, summary.startAt ?? shiftWindow.startAt)
  const ShiftIcon = shiftMeta.iconName === 'Sun' ? Sun
    : shiftMeta.iconName === 'Sunset' ? Sunset
    : shiftMeta.iconName === 'Moon' ? Moon
    : shiftMeta.iconName === 'Sunrise' ? Sunrise
    : null

  return (
    <Card className={cn('border-2 overflow-hidden', style.border)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted border-b">
        <div className="flex items-center gap-2 flex-wrap">
          {ShiftIcon && <ShiftIcon className={cn('w-3.5 h-3.5 shrink-0', shiftMeta.textColorClass)} />}
          <span className="font-medium text-sm" title={shiftMeta.label}>{shiftMeta.label}</span>
          <span className="text-muted-foreground text-sm">· {summary.dateKey}</span>
          {shiftWindow.status === 'live' && (
            <Badge className="bg-red-500 text-white animate-pulse text-xs px-2 py-0">
              <Activity className="w-3 h-3 mr-1" />
              EN VIVO
            </Badge>
          )}
          {shiftWindow.status === 'closed' && (
            <Badge
              variant="outline"
              className="text-xs px-2 py-0 border-zinc-600/50 text-zinc-400"
              title={`Turno cerrado · ${new Date(shiftWindow.startAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} → ${new Date(shiftWindow.endAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`}
            >
              CERRADO
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {durationLabel}
        </div>
      </div>

      {/* Hero metric — 3 columnas: verdict P0% · Shoplogix (live) · Grader (manual) */}
      <CardContent className={cn('p-4 grid grid-cols-1 md:grid-cols-[auto_1fr_1fr] gap-4', style.bg)}>
        {/* Columna 1 — P0% grande con verdict */}
        <div className="md:border-r md:pr-4 flex md:flex-col md:items-start items-center gap-3 md:gap-1">
          <div className={cn('text-5xl font-bold tabular-nums leading-none', style.numColor)}>
            {summary.pointZeroPct.toFixed(1)}%
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              P0 · Punto Cero
            </div>
            <div className="text-xs font-medium">{style.label}</div>
            {shiftWindow.status === 'live' && shiftWindow.progressPct != null && (
              <div className="mt-2 w-24">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>Progreso</span>
                  <span className="tabular-nums">{shiftWindow.progressPct.toFixed(0)}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${shiftWindow.progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Columna 2 — Shoplogix EN VIVO (auto) */}
        {upstreamSnapshot && baaderTotal > 0 ? (
          <div className="md:border-r md:pr-4 flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-semibold">Shoplogix</span>
              <span className="text-muted-foreground">· en vivo</span>
              <span className="ml-auto text-muted-foreground/70 normal-case tracking-normal">
                {fmtSyncRelative(upstreamSyncedAt)}
              </span>
            </div>
            <div
              className="flex items-baseline gap-2 cursor-help"
              title="Suma de ciclos procesados por las 3 Baader 142 según Shoplogix (auto-sincronizado cada ~5 min)."
            >
              <span className="text-2xl font-bold tabular-nums">{baaderTotal.toLocaleString('es-CL')}</span>
              <span className="text-xs text-muted-foreground">ciclos · upstream Baader</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {upstreamSnapshot.machines.map((m) => {
                const sharePct = (m.totalCycles / baaderTotal) * 100
                const uptimePct = (m.shiftRuntime * 100).toFixed(0)
                return (
                  <div
                    key={m.machineid}
                    className="text-center cursor-help"
                    title={`${m.machineName} — ${m.totalCycles.toLocaleString('es-CL')} ciclos · ${sharePct.toFixed(0)}% del total · uptime ${uptimePct}%`}
                  >
                    <div className="text-sm font-semibold tabular-nums">
                      {m.totalCycles.toLocaleString('es-CL')}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {m.machineName.replace(/^YAL\s+/, '').replace(/Evisceradora/, 'Ev')}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 tabular-nums">
                      {uptimePct}% uptime
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="md:border-r md:pr-4 flex flex-col gap-2 text-xs text-muted-foreground/70">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
              <Radio className="w-3 h-3" />
              <span>Shoplogix</span>
              <span>· sin datos</span>
            </div>
            <p>Sin sync upstream para este turno.</p>
          </div>
        )}

        {/* Columna 3 — Grader subido (manual) */}
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
            <FileSpreadsheet className="w-3 h-3 text-sky-400" />
            <span className="text-sky-400 font-semibold">Grader</span>
            <span className="text-muted-foreground">· subido</span>
            <span className="ml-auto text-muted-foreground/70 normal-case tracking-normal">
              {fmtSyncRelative(summary.updatedAt ? new Date(summary.updatedAt) : null)}
            </span>
          </div>
          <div
            className="flex items-baseline gap-2 cursor-help"
            title="Total de piezas pesadas por el Marelec en lo cargado del Grader (incluye OK + P0). Fuente: Excel Pieza a Pieza."
          >
            <span className="text-2xl font-bold tabular-nums">{summary.totalPieces.toLocaleString('es-CL')}</span>
            <span className="text-xs text-muted-foreground">piezas · Marelec</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div
              className="text-center cursor-help"
              title="Throughput promedio: piezas ÷ minutos productivos (excluye colación y paros)."
            >
              <div className="text-sm font-semibold tabular-nums">{throughputPerMin}</div>
              <div className="text-[10px] text-muted-foreground">pz/min</div>
            </div>
            <div
              className="text-center cursor-help"
              title="Peso bruto total registrado por el Marelec."
            >
              <div className="text-sm font-semibold tabular-nums">
                {summary.totalWeightKg != null ? Math.round(summary.totalWeightKg).toLocaleString('es-CL') : '—'}
              </div>
              <div className="text-[10px] text-muted-foreground">kg</div>
            </div>
            <div
              className="text-center cursor-help"
              title={`${summary.pointZeroPieces} piezas rechazadas (gate 0). ${summary.pointZeroPct.toFixed(2)}% del total.`}
            >
              <div className="text-sm font-semibold tabular-nums text-amber-400">
                {summary.pointZeroPieces.toLocaleString('es-CL')}
              </div>
              <div className="text-[10px] text-muted-foreground">P0 piezas</div>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Footer — derivado: rechazo Baader (Grader vs Σciclos) cuando ambas fuentes presentes */}
      {baaderTotal > 0 && upstreamSnapshot && (baaderRejectionPure != null || rejectedRaw != null) && (
        <div className="px-4 py-1.5 border-t bg-muted flex items-center gap-2 flex-wrap text-[11px]">
          {baaderRejectionPure != null ? (
            <span
              className="text-amber-400 cursor-help"
              title={`Rechazo Baader puro = Grader_total − ΣBaader_procesadas − Marel_no_controladas (${marelHgCapture!.uncontrolled.toLocaleString('es-CL')}). Asume que rechazos Baader + no-controladas Marel vuelven al Grader vía línea manual.`}
            >
              <span className="text-muted-foreground">Rechazo Baader (puro):</span>{' '}
              <span className="tabular-nums font-semibold">{baaderRejectionPure.rejected.toLocaleString('es-CL')}</span>
              <span className="text-muted-foreground"> ({baaderRejectionPure.rejectedPctOfBaader.toFixed(1)}%)</span>
            </span>
          ) : rejectedRaw != null ? (
            <span
              className="text-amber-400 cursor-help"
              title="Estimación bruta: Grader_total − ΣBaader_procesadas. Incluye rechazos Baader + no-controladas Marel HG (1-7% típico)."
            >
              <span className="text-muted-foreground">Rechazo est. (bruto):</span>{' '}
              <span className="tabular-nums font-semibold">{rejectedRaw.toLocaleString('es-CL')}</span>
              <span className="text-muted-foreground"> ({rejectedRawPct ?? '—'}%)</span>
            </span>
          ) : null}
          <span
            className="ml-auto text-muted-foreground/70 cursor-help"
            title="Diferencia entre piezas Marelec/Grader y ciclos Baader. Al final del turno deberían converger; si la cobertura Grader es parcial, este número aún no es definitivo."
          >
            ⓘ Las cifras Grader y Shoplogix convergen al cerrar el turno
          </span>
        </div>
      )}
    </Card>
  )
}
