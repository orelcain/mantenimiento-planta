/**
 * Tarjeta de resumen del turno CON Excel del Grader.
 *
 * Se agrupa por PREGUNTA, no por fuente de datos: a la izquierda *cuánto salió*
 * (proceso), a la derecha *dónde estuvo la limitación* (máquina). La mitad
 * derecha es exactamente la misma que ve un turno SIN Excel
 * (`ShiftMachinesHalf`), así que cargar el Grader completa la tarjeta en vez de
 * cambiar de pantalla.
 *
 * Antes eran 3 columnas tituladas "Shoplogix" y "Grader" — 12 números agrupados
 * por su procedencia, que es lo que a nadie le sirve para decidir. Orel lo
 * describió como "todo desordenado" (11-ago-2026); el rediseño salió de un
 * mockup con tres opciones y él eligió esta.
 */
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui'
import { verdictFromP0Pct } from '@/services/grader/graderThresholds'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GraderDailySummary } from '@/services/grader/types'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import {
  estimateManualLine,
  MANUAL_LINE_LABEL,
  MANUAL_LINE_TOOLTIP,
} from '@/services/grader/graderManualLine'
import { ShiftMachinesHalf } from './ShiftMachinesHalf'

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

/** Chip del P0: el estado va en el chip, NO en un fondo tintado de toda la
 *  tarjeta (regla del design system: el semántico nunca como bloque grande). */
const P0_CHIP = {
  ok:       { text: 'text-ink-ok',   dot: 'bg-ink-ok',   ring: 'bg-emerald-500/[0.15] border-ink-ok/[0.45]' },
  warn:     { text: 'text-ink-warn', dot: 'bg-ink-warn', ring: 'bg-amber-500/[0.15] border-ink-warn/[0.45]' },
  critical: { text: 'text-ink-crit', dot: 'bg-ink-crit', ring: 'bg-red-500/[0.15] border-ink-crit/[0.45]' },
}

interface HeroScorecardProps {
  summary: GraderDailySummary
  shiftWindow: ShiftTimeWindow
  upstreamSnapshot?: UpstreamLineSnapshot | null
  /** Timestamp del último sync Shoplogix (para el badge "hace Xs"). */
  upstreamSyncedAt?: Date | null
}

export function HeroScorecard({ summary, shiftWindow, upstreamSnapshot, upstreamSyncedAt }: HeroScorecardProps) {
  const chip = P0_CHIP[verdictFromP0Pct(summary.pointZeroPct)]
  const throughputPerMin = summary.productionRatePerHour
    ? (summary.productionRatePerHour / 60).toFixed(0)
    : null

  const machines = upstreamSnapshot?.machines ?? []
  const baaderTotal = machines.reduce((s, m) => s + (m.totalCycles ?? 0), 0)
  const avgUptime = machines.length > 0
    ? machines.reduce((s, m) => s + (m.shiftRuntime ?? 0), 0) / machines.length
    : null

  // Grader − Baader = piezas que NO pasaron por las evisceradoras.
  //
  // Antes esto se mostraba como "rechazo": el modelo asumía que por la línea
  // manual solo volvían los rechazos de las Baader. Desde 2026 la línea manual
  // PRODUCE, así que el número dejó de significar rechazo — daba 102%, que es
  // imposible. Con dos incógnitas (manual y rechazo) y un solo dato no se
  // pueden separar, así que se informa la línea manual y el rechazo se retiró.
  // Ver `graderManualLine.ts` para el desarrollo completo.
  const manualLine = estimateManualLine({
    graderPieces: summary.totalPieces,
    baaderCycles: baaderTotal,
  })
  const pctBaader = manualLine ? 100 - manualLine.pctOfGrader : null

  return (
    <Card className="overflow-hidden">
      {/* SIN encabezado propio a propósito: nombre del turno, fecha, estado y
          horario ya están en la barra superior de la página. */}
      <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* ── Mitad 1 · Cuánto salió ──────────────────────────────────── */}
        <div className="md:border-r md:border-border md:pr-6 min-w-0">
          <div className="text-caption tracking-wider text-muted-foreground">Cuánto salió</div>

          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className="text-4xl font-bold tabular-nums leading-none cursor-help"
              title="Piezas pesadas por el Marelec en lo cargado del Grader (OK + P0). Fuente: Excel Pieza a Pieza."
            >
              {summary.totalPieces.toLocaleString('es-CL')}
            </span>
            <span className="text-xs text-muted-foreground">piezas clasificadas</span>
          </div>

          <div className="mt-2">
            <span
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold', chip.ring, chip.text)}
              title={`${summary.pointZeroPieces} piezas rechazadas (gate 0), ${summary.pointZeroPct.toFixed(2)}% del total.`}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', chip.dot)} />
              P0 {summary.pointZeroPct.toFixed(1)}% · {summary.pointZeroPieces.toLocaleString('es-CL')} pz rechazadas
            </span>
          </div>

          {/* Composición: de dónde salió cada pieza. Como barra, el reparto se ve
              sin leer un número — y ata los ciclos de Shoplogix con las piezas
              del Grader, para que la diferencia no parezca un descuadre. */}
          {manualLine != null && pctBaader != null && (
            <div className="mt-3 space-y-1.5">
              <div className="flex h-2 rounded-ctl overflow-hidden bg-secondary">
                <div
                  className="h-full bg-primary cursor-help"
                  style={{ width: `${pctBaader}%` }}
                  title={`Procesadas por las Baader: ${manualLine.baaderCycles.toLocaleString('es-CL')} ciclos (Shoplogix).`}
                />
                <div
                  className="h-full bg-cat-6-ink cursor-help"
                  style={{ width: `${manualLine.pctOfGrader}%` }}
                  title={MANUAL_LINE_TOOLTIP}
                />
              </div>
              <div className="space-y-0.5 text-caption">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-[2px] bg-primary shrink-0" />
                  <span className="text-muted-foreground">por las Baader</span>
                  <b className="tabular-nums ml-auto">{manualLine.baaderCycles.toLocaleString('es-CL')}</b>
                  <span className="text-muted-foreground tabular-nums w-12 text-right">{pctBaader.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1.5 cursor-help" title={MANUAL_LINE_TOOLTIP}>
                  <span className="w-2 h-2 rounded-[2px] bg-cat-6-ink shrink-0" />
                  <span className="text-muted-foreground">{MANUAL_LINE_LABEL}</span>
                  <b className="tabular-nums ml-auto">{manualLine.manualPieces.toLocaleString('es-CL')}</b>
                  <span className="text-muted-foreground tabular-nums w-12 text-right">{manualLine.pctOfGrader.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            {summary.totalWeightKg != null && (
              <span title="Peso bruto total registrado por el Marelec.">
                <b className="tabular-nums text-foreground">{Math.round(summary.totalWeightKg).toLocaleString('es-CL')}</b> kg
              </span>
            )}
            {throughputPerMin && (
              <span title="Throughput promedio: piezas ÷ minutos productivos (excluye colación y paros).">
                <b className="tabular-nums text-foreground">{throughputPerMin}</b> pz/min
              </span>
            )}
            {shiftWindow.status === 'live' && shiftWindow.progressPct != null && (
              <span className="ml-auto tabular-nums">{shiftWindow.progressPct.toFixed(0)}% del turno</span>
            )}
          </div>
        </div>

        {/* ── Mitad 2 · Dónde estuvo la limitación (idéntica sin Grader) ── */}
        {machines.length > 0 ? (
          <ShiftMachinesHalf machines={machines} avgUptime={avgUptime} />
        ) : (
          <div className="min-w-0">
            <div className="text-caption tracking-wider text-muted-foreground">Dónde estuvo la limitación</div>
            <p className="text-xs text-muted-foreground mt-2">Sin sync de Shoplogix para este turno.</p>
          </div>
        )}
      </CardContent>

      {/* Pie: de dónde viene cada dato. Antes esto encabezaba las columnas y
          estructuraba la tarjeta; como procedencia va acá, sin robar jerarquía. */}
      <div className="px-4 py-2 border-t border-border bg-muted flex items-center gap-x-3 gap-y-1 flex-wrap text-caption text-muted-foreground">
        <span>Grader {fmtSyncRelative(summary.updatedAt ? new Date(summary.updatedAt) : null)}</span>
        {upstreamSnapshot && <span>· Shoplogix {fmtSyncRelative(upstreamSyncedAt)}</span>}
        {/* El Matrix cuenta REGISTROS y esto son PIEZAS: sin esta línea la
            diferencia parece producción perdida (13.529 vs 13.366 el 11-ago). */}
        {summary.notApplicableRecords ? (
          <span
            className="ml-auto cursor-help"
            title={`El informe del Matrix trae ${(summary.totalPieces + summary.notApplicableRecords).toLocaleString('es-CL')} registros. Estos ${summary.notApplicableRecords.toLocaleString('es-CL')} vienen con cantidad 0 y peso "No aplicable": son eventos del grader sin pieza detrás, así que no suman piezas.`}
          >
            + {summary.notApplicableRecords.toLocaleString('es-CL')} no aplicables · Matrix{' '}
            <span className="tabular-nums">
              {(summary.totalPieces + summary.notApplicableRecords).toLocaleString('es-CL')}
            </span>
          </span>
        ) : null}
      </div>
    </Card>
  )
}
