/**
 * GatesHistoryHintCard — ¿esta config aguanta lo que suele venir?
 *
 * La misma pregunta que `GateBreakdownCard`, corrida al ANTES: aquella necesita
 * el Excel del turno y por lo tanto contesta cuando el turno ya cerró; ésta usa
 * el reparto de calibres de los turnos anteriores y contesta al empezar, que es
 * cuando la respuesta todavía sirve para algo.
 *
 * Se monta en la pestaña Gates con Excel y sin él — sin Excel es lo único que
 * hay para decidir.
 *
 * ⚠ No filtra por lote: `lotsInShift` viene vacío en casi todos los resúmenes
 * reales. Por eso la tarjeta DICE qué turnos miró y en qué fechas — quien
 * decide tiene que poder descartar el período si no representa lo que está
 * entrando hoy. Un promedio sin su procedencia es una opinión disfrazada.
 */

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge, InfoTooltip } from '@/components/ui'
import { History, ArrowRight, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { listDailySummariesByRange } from '@/services/grader/graderDailySummary.service'
import { listGatesTemplates } from '@/services/grader/graderSession.service'
import {
  aggregateCalibreHistory,
  compareGatesVsHistory,
  suggestGateMoves,
  piecesAtRisk,
  DEFAULT_HISTORY_SHIFTS,
  MIN_HISTORY_SHIFTS,
  type CalibreHistory,
  type CalibreFit,
  type GateMove,
} from '@/services/grader/graderCalibreHistory'
import { GateChangeTrigger } from './GateChangeTrigger'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { GateAssignment } from '@/services/grader/types'
import type { PlantLineId } from '@/config/plantLines'

/** Días hacia atrás que se piden a Firestore para juntar los turnos. */
const LOOKBACK_DAYS = 45

interface Props {
  /**
   * Gates del snapshot del turno. Puede venir VACÍO —un turno recién abierto no
   * tiene `configHistory` todavía—, y ahí la tarjeta cae a la plantilla igual
   * que el editor. Sin ese fallback no diría nada justo cuando más sirve: al
   * empezar el turno.
   */
  gates: GateAssignment[]
  dateKey: string
  plantLineId: PlantLineId
  shiftDocId: string
  configSnapshots?: GateConfigSnapshot[]
  onSaved?: () => void
}

function fmtRatio(r: number): string {
  return Number.isFinite(r) ? `${r.toFixed(1)}×` : 'sin gate'
}

function shiftDaysBack(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

const STATUS_STYLE: Record<CalibreFit['status'], { bar: string; text: string; label: string }> = {
  saturado:           { bar: 'bg-destructive', text: 'text-ink-crit', label: 'saturado' },
  optimo:             { bar: 'bg-success',     text: 'text-ink-ok',   label: 'equilibrado' },
  sobredimensionado:  { bar: 'bg-warning',     text: 'text-ink-warn', label: 'de sobra' },
}

export function GatesHistoryHintCard({
  gates, dateKey, plantLineId, shiftDocId, configSnapshots, onSaved,
}: Props) {
  const [history, setHistory] = useState<CalibreHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState<{ name: string; gates: GateAssignment[] } | null>(null)

  /*
   * Fallback a la plantilla, con la MISMA regla que usa el editor de gates
   * ("Plantilla 1" o la primera de la lista). Si las dos eligieran distinto, la
   * tarjeta estaría juzgando una config que el editor no muestra.
   */
  useEffect(() => {
    if (gates.length > 0) return
    let cancelled = false
    listGatesTemplates()
      .then((list) => {
        const t = list.find((x) => x.name === 'Plantilla 1') ?? list[0]
        if (!cancelled && t) setTemplate({ name: t.name, gates: t.gates })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [gates.length])

  // useMemo y no una expresión suelta: es dependencia de los tres cálculos de
  // abajo, y un array nuevo en cada render los rehace todos sin motivo.
  const effectiveGates = useMemo(
    () => (gates.length > 0 ? gates : (template?.gates ?? [])),
    [gates, template],
  )
  const origen = gates.length > 0 ? 'config del turno' : template ? `plantilla «${template.name}»` : null

  useEffect(() => {
    if (!dateKey) return
    let cancelled = false
    setLoading(true)
    /*
     * Se pide hasta el día ANTERIOR al turno: incluir el propio turno haría que
     * la tarjeta se comparara consigo misma y siempre diera "equilibrado".
     */
    listDailySummariesByRange(shiftDaysBack(dateKey, LOOKBACK_DAYS), shiftDaysBack(dateKey, 1), plantLineId)
      .then((rows) => { if (!cancelled) setHistory(aggregateCalibreHistory(rows, DEFAULT_HISTORY_SHIFTS)) })
      .catch((e) => {
        logger.error('[GatesHistoryHintCard] no se pudo leer el historial', e instanceof Error ? e : new Error(String(e)))
        if (!cancelled) setHistory(null)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dateKey, plantLineId])

  const activeCount = useMemo(() => effectiveGates.filter((g) => g.active).length, [effectiveGates])

  const fits = useMemo<CalibreFit[]>(
    () => (history ? compareGatesVsHistory(effectiveGates, history) : []),
    [effectiveGates, history],
  )

  const moves = useMemo<GateMove[]>(
    () => suggestGateMoves(fits, activeCount),
    [fits, activeCount],
  )

  const enRiesgo = useMemo(
    () => (history ? piecesAtRisk(fits, history) : 0),
    [fits, history],
  )

  // Sin config o sin historial suficiente no hay nada honesto que decir.
  if (loading || !history || activeCount === 0 || fits.length === 0) return null

  const saturados = fits.filter((f) => f.status === 'saturado')
  const maxPct = Math.max(...fits.map((f) => Math.max(f.productionPct, f.gatesPct)), 1)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            ¿Esta config aguanta lo que suele venir?
            <InfoTooltip
              text={`Compara las gates asignadas con el reparto real de calibres de los ${history.shiftIds.length} turnos anteriores (${history.fromDateKey} → ${history.toDateKey}, ${history.totalPieces.toLocaleString('es-CL')} piezas), ponderado por producción.\n\nNo filtra por lote: los resúmenes de turno casi nunca traen el lote. Si el período no representa lo que está entrando hoy, ignorá la sugerencia.`}
            />
          </CardTitle>
          {saturados.length > 0 ? (
            <Badge variant="outline" className="border-destructive/[0.35] text-ink-crit shrink-0">
              {saturados.length === 1 ? '1 calibre apretado' : `${saturados.length} calibres apretados`}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-success/[0.35] text-ink-ok shrink-0">
              equilibrada
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {history.shiftIds.length} turnos anteriores ·{' '}
          <span className="tabular-nums">{history.fromDateKey}</span> →{' '}
          <span className="tabular-nums">{history.toDateKey}</span> ·{' '}
          <span className="tabular-nums">{history.totalPieces.toLocaleString('es-CL')}</span> piezas
          {/* De qué config se está hablando: sin esto, con la plantilla como
              fallback, uno no sabe qué le están juzgando. */}
          {origen && <> · gates según <span className="text-foreground">{origen}</span></>}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Producción histórica vs gates asignadas, calibre por calibre. Las dos
            barras juntas son el argumento: cuando la de arriba es mucho más
            larga que la de abajo, ese calibre está apretado. */}
        <div className="space-y-2.5">
          {fits.map((f) => {
            const st = STATUS_STYLE[f.status]
            return (
              <div key={f.key} className="grid grid-cols-[7rem_1fr_5.5rem] gap-2.5 items-center text-xs">
                <span className="truncate text-muted-foreground" title={f.label}>{f.label}</span>
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-muted-foreground/[0.12] overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', st.bar)}
                      style={{ width: `${(f.productionPct / maxPct) * 100}%` }}
                      title={`${f.productionPct.toFixed(1)}% de la producción`}
                    />
                  </div>
                  <div className="h-2 rounded-full bg-muted-foreground/[0.12] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-muted-foreground/[0.45]"
                      style={{ width: `${(f.gatesPct / maxPct) * 100}%` }}
                      title={`${f.gates.length} de ${activeCount} gates`}
                    />
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className={cn('font-medium', st.text)}>{fmtRatio(f.ratio)}</div>
                  <div className="text-muted-foreground/70 text-caption">
                    {f.gates.length === 0 ? 'sin gate' : `${f.gates.length} gate${f.gates.length > 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* La leyenda tiene que decir DOS cosas: qué barra es cuál y qué
            significa el color. Con un solo swatch verde para "producción" se
            leía que el verde era la producción y el rojo otra cosa. */}
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-caption text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-1.5 rounded-full bg-muted-foreground/[0.45]" /> arriba: producción histórica
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-1.5 rounded-full bg-muted-foreground/[0.45]" /> abajo: gates asignadas
          </span>
          <span className="flex items-center gap-1.5">
            color:
            <span className="text-ink-crit">apretado</span>
            <span className="text-ink-ok">equilibrado</span>
            <span className="text-ink-warn">de sobra</span>
          </span>
        </div>

        {/* Qué hacer al respecto */}
        {moves.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-border">
            <p className="text-xs text-muted-foreground pt-2">
              {enRiesgo > 0 && (
                <>
                  <span className="tabular-nums font-medium text-foreground">{enRiesgo.toLocaleString('es-CL')}</span>
                  {' piezas de esos turnos pasaron por los calibres apretados. '}
                </>
              )}
              Para dejarla pareja:
            </p>
            {moves.map((m, i) => (
              <div
                key={`${m.fromKey}->${m.toKey}-${i}`}
                className="flex items-start gap-2.5 flex-wrap p-2.5 rounded-ctl bg-primary/[0.12] border border-primary/[0.25]"
              >
                <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-[14rem] text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-foreground">
                      Mover 1 gate de {m.fromLabel}
                    </span>
                    <ArrowRight className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-medium text-foreground">{m.toLabel}</span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 tabular-nums">
                    Candidatas: {m.fromGates.map((g) => `G${g}`).join(', ')}
                    {' · '}
                    {m.toLabel} pasa de {fmtRatio(m.beforeRatio)} a {fmtRatio(m.afterRatio)}
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
                  initialReason={`Historial ${history.fromDateKey}→${history.toDateKey}: ${m.toLabel} es el ${fits.find((f) => f.key === m.toKey)?.productionPct.toFixed(1)}% de la producción`}
                  triggerLabel="Cambiar →"
                  onSaved={onSaved}
                />
              </div>
            ))}
          </div>
        )}

        {moves.length === 0 && saturados.length > 0 && (
          <p className="text-xs text-muted-foreground pt-1 border-t border-border">
            No hay una gate que se pueda ceder sin dejar otro calibre sin salida.
            Para descomprimir el {saturados[0]!.label} habría que activar una gate más
            o revisar los rangos de peso.
          </p>
        )}

        {history.shiftIds.length < DEFAULT_HISTORY_SHIFTS && (
          <p className="text-caption text-muted-foreground/70">
            Solo {history.shiftIds.length} turnos con datos en los últimos {LOOKBACK_DAYS} días
            (el mínimo para mostrar esto es {MIN_HISTORY_SHIFTS}) — poca muestra, tomalo como referencia.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
