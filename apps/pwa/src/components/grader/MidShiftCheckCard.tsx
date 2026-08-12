/**
 * MidShiftCheckCard — el corte de control a mitad de turno.
 *
 * Aparece solo con el turno EN CURSO y un Excel del Grader cargado (aunque
 * cubra un tramo nomás). Dice tres cosas, en este orden:
 *
 *   1. hasta cuándo llega el Excel — si está viejo, todo lo demás describe un
 *      turno de hace horas y hay que exportar de nuevo antes de decidir;
 *   2. qué calibre viene apretado CON LO QUE VA;
 *   3. cuántas piezas de ese calibre quedan por pasar, y qué gate mover.
 *
 * La proyección se muestra como estimación explícita: es ritmo medido × tiempo
 * que falta. No se promete "piezas mejor clasificadas" — a dónde caen las que
 * desbordan el Excel no lo dice.
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, InfoTooltip } from '@/components/ui'
import { Radio, ArrowRight, Upload, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildMidShiftCheck, excelGapMinutes } from '@/services/grader/graderMidShiftCheck'
import { nowAsWallClockUTC } from '@/services/grader/graderShiftStatus'
import { fmtDurationMin, fmtTime } from '@/services/grader/graderTimeFormat'
import { GateChangeTrigger } from './GateChangeTrigger'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { GateAssignment, GraderDailySummary } from '@/services/grader/types'

/** A partir de acá el Excel describe un turno que ya cambió. */
const EXCEL_VIEJO_MIN = 90

interface Props {
  summary: GraderDailySummary | null
  gates: GateAssignment[]
  /** Minutos que le quedan al turno. null = ya cerró → la tarjeta no aplica. */
  remainingMin: number | null
  shiftDocId: string
  plantLineId: string
  configSnapshots?: GateConfigSnapshot[]
  onSaved?: () => void
  /** Abre el wizard de carga del Excel. */
  onLoadExcel: () => void
}

export function MidShiftCheckCard({
  summary, gates, remainingMin, shiftDocId, plantLineId, configSnapshots, onSaved, onLoadExcel,
}: Props) {
  const check = useMemo(
    () => buildMidShiftCheck({ summary, gates, remainingMin }),
    [summary, gates, remainingMin],
  )

  const gap = useMemo(() => excelGapMinutes(summary, nowAsWallClockUTC()), [summary])

  if (!check) return null

  const { soFar, saturated, moves, estRemainingPieces, estPiecesOnSaturated } = check
  const excelViejo = gap != null && gap >= EXCEL_VIEJO_MIN
  const todoBien = saturated.length === 0

  return (
    <Card className={cn(!todoBien && 'border-primary/[0.35]')}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary animate-pulse" />
            Corte de control · con lo que va del turno
            <InfoTooltip
              text={'Mira el reparto de calibres del Excel ya cargado —aunque cubra solo un tramo— y lo compara con las gates asignadas, igual que el análisis de cierre.\n\nLa estimación de piezas que faltan es ritmo medido × tiempo que queda: sirve para dimensionar, no es una promesa.'}
            />
          </CardTitle>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            quedan {fmtDurationMin(check.remainingMin)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {soFar.totalPieces.toLocaleString('es-CL')} piezas clasificadas
          {summary?.endAt && <> · Excel hasta {fmtTime(summary.endAt)}</>}
          {gap != null && gap > 0 && <> · hace {fmtDurationMin(gap)}</>}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Lo primero, porque invalida todo lo demás. */}
        {excelViejo && (
          <div className="flex items-start gap-2.5 flex-wrap p-2.5 rounded-ctl bg-warning/[0.15] border border-warning/[0.3]">
            <Upload className="w-4 h-4 text-ink-warn shrink-0 mt-0.5" />
            <p className="flex-1 min-w-[14rem] text-xs text-muted-foreground">
              El Excel llega hasta {summary?.endAt ? fmtTime(summary.endAt) : '—'} y la línea siguió
              produciendo. <span className="text-foreground font-medium">Exportá de Matrix otra vez</span>{' '}
              antes de mover una gate con esto.
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={onLoadExcel}>
              <Upload className="w-3 h-3" /> Cargar Excel
            </Button>
          </div>
        )}

        {todoBien && (
          <p className="text-sm text-muted-foreground">
            Ningún calibre viene apretado. Las gates aguantan el reparto de lo que va del turno.
          </p>
        )}

        {!todoBien && (
          <>
            <p className="text-sm">
              {saturated.map((f, i) => (
                <span key={f.key}>
                  {i > 0 && ' · '}
                  <span className="font-medium text-foreground">{f.label}</span> se lleva el{' '}
                  <span className="tabular-nums font-medium text-ink-crit">{f.productionPct.toFixed(1)}%</span>
                  {' con '}
                  <span className="tabular-nums">
                    {f.gates.length === 0 ? 'ninguna gate' : `${f.gates.length} gate${f.gates.length > 1 ? 's' : ''}`}
                  </span>
                </span>
              ))}
            </p>

            {estRemainingPieces != null && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Al ritmo medido quedan ≈{estRemainingPieces.toLocaleString('es-CL')} piezas por pasar
                {estPiecesOnSaturated != null && (
                  <>
                    {', de las cuales '}
                    <span className="font-medium text-foreground">
                      ≈{estPiecesOnSaturated.toLocaleString('es-CL')}
                    </span>
                    {' serían de ese calibre.'}
                  </>
                )}
              </p>
            )}

            {moves.map((m, i) => (
              <div
                key={`${m.fromKey}->${m.toKey}-${i}`}
                className="flex items-start gap-2.5 flex-wrap p-2.5 rounded-ctl bg-primary/[0.12] border border-primary/[0.25]"
              >
                <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-[14rem] text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-foreground">Mover 1 gate de {m.fromLabel}</span>
                    <ArrowRight className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-medium text-foreground">{m.toLabel}</span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 tabular-nums">
                    Candidatas: {m.fromGates.map((g) => `G${g}`).join(', ')}
                    {' · '}
                    {m.toLabel} pasa de {m.beforeRatio.toFixed(1)}× a{' '}
                    {Number.isFinite(m.afterRatio) ? `${m.afterRatio.toFixed(1)}×` : '—'}
                    {m.afterStatus === 'optimo' && <span className="text-ink-ok"> (equilibrado)</span>}
                    {m.afterStatus === 'saturado' && <span className="text-ink-warn"> (sigue apretado)</span>}
                  </div>
                </div>
                <GateChangeTrigger
                  shiftDocId={shiftDocId}
                  configSnapshots={configSnapshots}
                  plantLineId={plantLineId}
                  variant="compact"
                  initialGate={m.fromGates[0]}
                  initialCalibre={m.toLabel}
                  initialReason={`Corte de control: ${m.toLabel} se lleva el ${check.fits.find((f) => f.key === m.toKey)?.productionPct.toFixed(1)}% de lo que va del turno`}
                  triggerLabel="Cambiar →"
                  onSaved={onSaved}
                />
              </div>
            ))}

            {moves.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay una gate que se pueda ceder sin dejar otro calibre sin salida. Para
                descomprimir habría que activar una gate más o revisar los rangos de peso.
              </p>
            )}
          </>
        )}

        {/* El cambio queda con hora: lo que pase después se clasifica con la
            config nueva. Es lo que después permite decir "sin la corrección de
            las 01:10 el turno habría cerrado peor". */}
        <p className="text-caption text-muted-foreground/70">
          El cambio se registra con hora: las piezas posteriores se clasifican con la config nueva
          y el turno queda partido en tramos, no reescrito.
        </p>
      </CardContent>
    </Card>
  )
}
