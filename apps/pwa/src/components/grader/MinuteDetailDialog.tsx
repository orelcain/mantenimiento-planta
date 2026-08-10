/**
 * Diálogo de "detalle del minuto" (Fase 4a).
 *
 * Al clickear una barra del Timeline, se abre este diálogo con:
 *   1. Resumen del minuto (total pzs, OK, P0, %P0)
 *   2. Breakdown por gate (cuántas piezas fueron a cada gate, peso promedio,
 *      config asignada del gate para trazabilidad)
 *   3. Tabla de piezas individuales con ver-más (primeras 20, expandible al
 *      total — max histórico 80 pzs/min).
 *
 * Performance: query a Firestore sólo del minuto específico via
 * `listPieceRecordsByMinute` — típicamente 20-60 docs, cargados lazy.
 *
 * Uso típico: el analista ve un spike P0 en un minuto particular, clickea
 * esa barra, y confirma qué piezas fallaron, su peso, y a qué gate iban.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Info, Siren } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Button,
  Spinner,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  listPieceRecordsByMinute,
  type FirestorePieceRecord,
} from '@/services/grader/graderDailySummary.service'
import type { GateAssignment, TimelineBucket } from '@/services/grader/types'
import { CALIBRE_WEIGHT_RANGES, classifyRecordToMatrix } from '@/services/grader/graderAnalytics'
import { MATRIX_P0_CAUSES, getCauseLabel } from '@/services/grader/graderMatrixP0Causes'
import { fmtTime, fmtTimeWithSec } from '@/services/grader/graderTimeFormat'
import {
  DEFAULT_P0_THRESHOLDS,
  p0StatusFromPct,
  p0StatusColor,
  p0StatusLabel,
  type P0Status,
} from '@/services/grader/graderP0Thresholds'
import type { MatrixP0Cause } from '@/services/grader/types'

interface MinuteDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** ID del summary al que pertenece el minuto. */
  summaryId: string
  /** Timestamp ISO del minuto (`YYYY-MM-DDTHH:MM:00.000Z`). null cierra. */
  tsMin: string | null
  /**
   * Config de gates activa (la más reciente con `at <= tsMin` — se resuelve
   * en el parent). Opcional: sin ella, las gates muestran solo el número
   * sin calibre/calidad asignados.
   */
  activeGates?: GateAssignment[]
  /**
   * Bucket del minuto desde `timelineBuckets` (fuente de data agregada).
   * Se usa como fallback para mostrar el breakdown por gate cuando los
   * pieceRecords completos no están en Firestore — el bulk upload histórico
   * solo subió las P0, no las productivas. El bucket SIEMPRE tiene
   * `gateCounts` con el total por gate, así el analista puede ver la
   * distribución aunque el detalle individual de las productivas no exista.
   */
  bucket?: TimelineBucket
  /**
   * Umbrales operacionales de P0% para clasificar el minuto como ok / alert
   * / critical. Default: DEFAULT_P0_THRESHOLDS (alert=2%, critical=3.5%).
   * Pasar la config del usuario (Firestore `system/graderConfig`) cuando
   * esté disponible para que el banner respete las preferencias del cliente.
   */
  thresholds?: { alert: number; critical: number }
}

/**
 * Sugerencia operacional accionable según la causa Matrix dominante de un
 * minuto. Mapea cada causa a una hipótesis de "qué revisar" — el analista
 * decide si tomar acción, pero el sistema le baja el costo de pensar el
 * primer paso.
 */
const SUGGESTION_BY_CAUSE: Record<MatrixP0Cause, string> = {
  fuera_de_limites:      'Pieza fuera del rango operativo del Marelec — verificar setup de fotocélulas y rango de pesos.',
  no_leido_fotocelula:   'Lectura de fotocélula falló — revisar limpieza de lentes, suciedad o roces en banda.',
  too_close_too_long:    'Piezas demasiado cerca o sostenidas demasiado tiempo — ajustar separación o velocidad de carga.',
  puerta_no_preparada:   'Puerta del gate no preparó a tiempo — revisar mecánica del gate y aire comprimido.',
  fuera_de_calibre:      'Peso real de la pieza no calza con ningún gate activo — revisar gates configurados (¿faltan calibres?).',
  fuera_de_calidad:      'Calidad asignada por el grader no calza con ningún gate activo — revisar config (¿faltan calidades?).',
  fuera_de_conservacion: 'Conservación detectada no calza con ningún gate — revisar criterios fresco/frozen del turno.',
  fuera_de_producto:     'Producto detectado no calza con ningún gate — verificar que el lote sea el correcto.',
  otro:                  'Causa no clasificada — revisar la columna "Error" en la tabla detalle.',
}

const INITIAL_ROWS = 20

/**
 * Infiere el calibre REAL de una pieza desde su peso.
 *
 * Importante para piezas P0: Marelec asigna calibre default "0-2 lb" cuando
 * rechaza una pieza ("Fuera de límites" o "No leído por fotocélula"),
 * independientemente del peso real medido. El analista necesita ver el
 * calibre que CORRESPONDE al peso, no el default de rechazo.
 *
 * Para piezas productivas (gates 1-12), el calibre Marelec coincide con el
 * peso — pero devolvemos el inferido igual por consistencia.
 */
function inferCalibreFromWeight(weightKg: number | null | undefined): string | undefined {
  if (weightKg == null || weightKg <= 0) return undefined
  const grams = weightKg * 1000
  for (const range of CALIBRE_WEIGHT_RANGES) {
    if (grams >= range.minGrams && grams < range.maxGrams) return range.calibre
  }
  return undefined
}

/**
 * Normaliza un calibre a lowercase para comparación.
 * El Excel Marelec a veces usa "0 - 2 LB" (espacios + mayúsculas), otras
 * "0-2 lb". Normalizamos para comparar sin fricción.
 */
function normCalibre(c: string | undefined | null): string {
  return (c ?? '').toLowerCase().replace(/\s+/g, '').trim()
}

/**
 * Resuelve la descripción oficial Matrix de una causa P0 a partir de su label.
 * Ayuda a poner tooltips explicativos en el UI sin necesidad de que el analista
 * conozca de memoria qué significa cada sub-causa.
 */
function getMatrixDescription(label: string): string | undefined {
  for (const cause of Object.values(MATRIX_P0_CAUSES)) {
    if (cause.label === label) return cause.description
  }
  return undefined
}

export function MinuteDetailDialog({
  open,
  onOpenChange,
  summaryId,
  tsMin,
  activeGates,
  bucket,
  thresholds = DEFAULT_P0_THRESHOLDS,
}: MinuteDetailDialogProps) {
  const [records, setRecords] = useState<FirestorePieceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !tsMin) return
    setShowAll(false)
    setLoading(true)
    setError(null)
    listPieceRecordsByMinute(summaryId, tsMin)
      .then((recs) => setRecords(recs))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar piezas')
        setRecords([])
      })
      .finally(() => setLoading(false))
  }, [open, summaryId, tsMin])

  const gateConfigMap = useMemo(() => {
    const m = new Map<number, GateAssignment>()
    for (const g of activeGates ?? []) m.set(g.gateNumber, g)
    return m
  }, [activeGates])

  const breakdown = useMemo(() => {
    // FUENTES DE DATA:
    //   1. `records`: pieceRecords individuales traídos de Firestore para el
    //      minuto. Tienen peso, error, timestamp exacto. Pueden estar
    //      INCOMPLETOS (el bulk upload histórico solo subió P0 para algunos
    //      turnos — las productivas faltan).
    //   2. `bucket`: TimelineBucket pre-agregado con `gateCounts` (total por
    //      gate del minuto, incluyendo productivas). SIEMPRE está completo.
    //
    // ESTRATEGIA:
    //   - Para TOTALES y breakdown por gate → usar `bucket` como verdad
    //     (completo y rápido).
    //   - Para detalle pieza por pieza → usar `records` (solo las que están).
    //   - Marcar gates que solo tienen count agregado (sin peso/detalle
    //     individual) con flag `detailOnly: false`.

    // Agregar desde records primero (gates con detalle completo). Para gate=0
    // (P0), re-clasificamos cada pieza con `classifyRecordToMatrix` usando la
    // config de gates activa → obtenemos la sub-causa Matrix real (ej. "Fuera
    // de calibre" en vez del crudo "Fuera de límites").
    const byGateFromRecords = new Map<number, { pieces: number; weightKg: number; weightCount: number; errors: Map<string, number> }>()
    for (const r of records) {
      const entry = byGateFromRecords.get(r.gate) ?? { pieces: 0, weightKg: 0, weightCount: 0, errors: new Map() }
      entry.pieces += r.pieces
      if (r.weightKg != null && r.weightKg > 0) {
        entry.weightKg += r.weightKg
        entry.weightCount += 1
      }
      if (r.gate === 0) {
        const matrixCause = classifyRecordToMatrix(
          {
            ts: r.ts,
            pieces: r.pieces,
            weightKg: r.weightKg,
            weightPerPieceGrams: r.weightPerPieceGrams,
            quality: r.quality,
            calibre: r.calibre,
            error: r.error ?? '',
          } as Parameters<typeof classifyRecordToMatrix>[0],
          activeGates ?? [],
          CALIBRE_WEIGHT_RANGES,
        )
        const label = getCauseLabel(r.error ?? '', matrixCause)
        entry.errors.set(label, (entry.errors.get(label) ?? 0) + r.pieces)
      } else if (r.error) {
        entry.errors.set(r.error, (entry.errors.get(r.error) ?? 0) + r.pieces)
      }
      byGateFromRecords.set(r.gate, entry)
    }

    // Construir rows finales combinando bucket (counts completos) + records
    // (detalle si disponible). Los gates productivos viven típicamente en
    // bucket.gateCounts; P0 suele tener también detalle en records.
    const rows: Array<{
      gate: number
      pieces: number
      avgWeightG: number | null
      errors: Array<[string, number]>
      hasDetail: boolean
    }> = []
    const gatesSeen = new Set<number>()

    // 1) Desde bucket.gateCounts — gates productivos (1-12)
    if (bucket?.gateCounts) {
      for (const [gateStr, count] of Object.entries(bucket.gateCounts)) {
        const gate = Number(gateStr)
        const fromRecs = byGateFromRecords.get(gate)
        rows.push({
          gate,
          pieces: count,
          avgWeightG: fromRecs && fromRecs.weightCount > 0
            ? Math.round((fromRecs.weightKg / fromRecs.weightCount) * 1000)
            : null,
          errors: fromRecs ? [...fromRecs.errors.entries()].sort((a, b) => b[1] - a[1]) : [],
          hasDetail: !!fromRecs && fromRecs.pieces >= count,
        })
        gatesSeen.add(gate)
      }
    }

    // 2) Gate 0 (P0) — puede venir de records y/o bucket.p0Pieces
    if (!gatesSeen.has(0)) {
      const fromRecs = byGateFromRecords.get(0)
      const p0Count = bucket?.p0Pieces ?? (fromRecs?.pieces ?? 0)
      if (p0Count > 0) {
        rows.push({
          gate: 0,
          pieces: p0Count,
          avgWeightG: fromRecs && fromRecs.weightCount > 0
            ? Math.round((fromRecs.weightKg / fromRecs.weightCount) * 1000)
            : null,
          errors: fromRecs ? [...fromRecs.errors.entries()].sort((a, b) => b[1] - a[1]) : [],
          hasDetail: !!fromRecs && fromRecs.pieces >= p0Count,
        })
      }
    }

    // 3) Gates que solo aparecen en records (no en bucket) — edge case
    for (const [gate, data] of byGateFromRecords) {
      if (gatesSeen.has(gate) || gate === 0) continue
      rows.push({
        gate,
        pieces: data.pieces,
        avgWeightG: data.weightCount > 0 ? Math.round((data.weightKg / data.weightCount) * 1000) : null,
        errors: [...data.errors.entries()].sort((a, b) => b[1] - a[1]),
        hasDetail: true,
      })
    }

    rows.sort((a, b) => b.pieces - a.pieces)

    // Totales desde bucket (fuente de verdad); fallback a records si no hay bucket
    const total = bucket?.pieces ?? records.reduce((s, r) => s + r.pieces, 0)
    const p0 = bucket?.p0Pieces ?? records.filter((r) => r.gate === 0).reduce((s, r) => s + r.pieces, 0)
    const p0Pct = total > 0 ? (p0 / total) * 100 : 0

    // Detectar si faltan detalles productivos (para banner informativo)
    const missingProductiveDetail = rows.some((r) => r.gate !== 0 && !r.hasDetail && r.pieces > 0)

    // Causa Matrix dominante del minuto — re-clasificamos cada record P0 con
    // la config de gates activa, agrupamos por cause id y devolvemos el top.
    // Útil para el banner accionable: "Causa dominante: X (Y piezas, Z%)".
    let topP0Cause: { id: MatrixP0Cause; label: string; pieces: number; pctOfP0: number } | null = null
    if (p0 > 0 && records.length > 0) {
      const causeCounter = new Map<MatrixP0Cause, number>()
      for (const r of records) {
        if (r.gate !== 0) continue
        const matrixCause = classifyRecordToMatrix(
          {
            ts: r.ts,
            pieces: r.pieces,
            weightKg: r.weightKg,
            weightPerPieceGrams: r.weightPerPieceGrams,
            quality: r.quality,
            calibre: r.calibre,
            error: r.error ?? '',
          } as Parameters<typeof classifyRecordToMatrix>[0],
          activeGates ?? [],
          CALIBRE_WEIGHT_RANGES,
        )
        causeCounter.set(matrixCause, (causeCounter.get(matrixCause) ?? 0) + r.pieces)
      }
      let topId: MatrixP0Cause | null = null
      let topPieces = 0
      for (const [id, n] of causeCounter) {
        if (n > topPieces) { topId = id; topPieces = n }
      }
      if (topId) {
        topP0Cause = {
          id: topId,
          label: MATRIX_P0_CAUSES[topId].label,
          pieces: topPieces,
          pctOfP0: (topPieces / p0) * 100,
        }
      }
    }

    const p0Status: P0Status = p0StatusFromPct(p0Pct, thresholds)

    return { gateRows: rows, total, p0, p0Pct, missingProductiveDetail, topP0Cause, p0Status }
  }, [records, bucket, activeGates, thresholds])

  if (!tsMin) return null

  const visibleRecords = showAll ? records : records.slice(0, INITIAL_ROWS)
  const hiddenCount = records.length - visibleRecords.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalle del minuto {fmtTime(tsMin)}</DialogTitle>
          <DialogDescription>
            {loading ? (
              <span className="text-muted-foreground">Cargando piezas…</span>
            ) : error ? (
              <span className="text-red-400">{error}</span>
            ) : (
              <span>
                <span className="font-medium text-foreground">{breakdown.total} {breakdown.total === 1 ? 'pieza' : 'piezas'}</span>
                {breakdown.total > 0 && (
                  <>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-emerald-400">{breakdown.total - breakdown.p0} OK</span>
                    <span className="text-muted-foreground"> + </span>
                    <span className={cn(breakdown.p0 > 0 ? 'text-orange-400' : 'text-muted-foreground')}>
                      {breakdown.p0} P0
                    </span>
                    <span className="text-muted-foreground"> ({breakdown.p0Pct.toFixed(1)}%)</span>
                    {bucket?.dominantCalibre && (
                      <>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-muted-foreground/80">Calibre: {bucket.dominantCalibre}</span>
                      </>
                    )}
                  </>
                )}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        )}

        {!loading && !error && breakdown.total > 0 && (
          <div className="overflow-y-auto flex-1 pr-1 space-y-4">
            {/* Minuto sin rechazos — mensaje positivo cuando todo llegó a destino. */}
            {breakdown.total > 0 && breakdown.p0 === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-ctl border border-emerald-500/[0.25] bg-emerald-500/[0.15] text-xs text-ink-ok">
                <span className="text-base leading-none">✓</span>
                <span>Sin rechazos este minuto — las {breakdown.total} piezas llegaron a destino.</span>
              </div>
            )}
            {/* Banner accionable según P0% del minuto y causa dominante.
                Solo aparece cuando hay P0 — si el minuto está perfecto, no ruido visual. */}
            {breakdown.p0 > 0 && breakdown.topP0Cause && (
              <div
                className={cn(
                  'flex items-start gap-2 px-3 py-2 rounded-ctl border text-xs',
                  breakdown.p0Status === 'critical' && 'border-cat-5-tint/[0.25] bg-cat-5-tint/[0.15]',
                  breakdown.p0Status === 'alert'    && 'border-amber-500/[0.25] bg-amber-500/[0.15]',
                  breakdown.p0Status === 'ok'       && 'border-emerald-500/[0.25] bg-emerald-500/[0.15]',
                )}
                title={MATRIX_P0_CAUSES[breakdown.topP0Cause.id].description}
              >
                <span className="text-base leading-none">
                  {breakdown.p0Status === 'critical' ? <Siren className="inline h-4 w-4" aria-label="Crítico" /> : breakdown.p0Status === 'alert' ? <AlertTriangle className="inline h-4 w-4" aria-label="Alerta" /> : <Check className="inline h-4 w-4" aria-label="OK" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={cn('font-medium flex items-center gap-1.5 flex-wrap', p0StatusColor(breakdown.p0Status))}>
                    <span>P0% {breakdown.p0Pct.toFixed(1)}%</span>
                    <span className="text-caption tracking-wide opacity-70">{p0StatusLabel(breakdown.p0Status)}</span>
                    <span className="text-muted-foreground/60 font-normal">·</span>
                    <span className="font-normal text-foreground">
                      Causa dominante: <span className="font-medium">{breakdown.topP0Cause.label}</span>
                      <span className="text-muted-foreground"> ({breakdown.topP0Cause.pieces} {breakdown.topP0Cause.pieces === 1 ? 'pza' : 'pzas'}, {breakdown.topP0Cause.pctOfP0.toFixed(0)}% de las P0)</span>
                    </span>
                  </div>
                  <div className="text-muted-foreground/90 mt-0.5">
                    {SUGGESTION_BY_CAUSE[breakdown.topP0Cause.id]}
                  </div>
                </div>
              </div>
            )}
            {/* Banner de cobertura de data */}
            {breakdown.missingProductiveDetail && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-ctl border border-amber-500/[0.25] bg-amber-500/[0.15] text-xs text-ink-warn">
                <Info className="h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <div className="font-medium">Detalle individual parcial</div>
                  <div className="text-amber-800/90 dark:text-amber-200/80 mt-0.5">
                    Las piezas productivas (gates 1-12) se muestran agregadas por gate.
                    El detalle pieza-por-pieza solo está disponible para las P0 en turnos
                    históricos (bulk upload antiguo no subió las productivas).
                  </div>
                </div>
              </div>
            )}
            {/* Breakdown por gate */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground tracking-wider mb-2">
                Desglose por gate
              </h3>
              <div className="space-y-1">
                {breakdown.gateRows.map(({ gate, pieces, avgWeightG, hasDetail }) => {
                  const cfg = gateConfigMap.get(gate)
                  const isP0 = gate === 0
                  return (
                    <div
                      key={gate}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-ctl text-sm border',
                        isP0
                          ? 'border-cat-4-tint/[0.25] bg-cat-4-tint/[0.15]'
                          : 'border-border bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-12 h-6 rounded-ctl text-xs font-semibold shrink-0',
                          isP0 ? 'bg-cat-4-tint/[0.15] text-cat-4-ink' : 'bg-emerald-500/[0.15] text-ink-ok',
                        )}
                      >
                        {isP0 ? 'P0' : `G${gate}`}
                      </span>
                      <span
                        className="flex-1 min-w-0 truncate text-muted-foreground text-xs"
                        title={isP0
                          ? 'Rechazo (fuera de rango)'
                          : cfg
                            ? `${cfg.assignedCalibre} · ${cfg.assignedQuality}`
                            : 'Sin config'}
                      >
                        {isP0
                          ? 'Rechazo (fuera de rango)'
                          : cfg
                            ? `${cfg.assignedCalibre} · ${cfg.assignedQuality}`
                            : 'Sin config'}
                      </span>
                      <span className="font-medium tabular-nums">
                        {pieces} {pieces === 1 ? 'pz' : 'pzs'}
                      </span>
                      {avgWeightG != null ? (
                        <span className="text-muted-foreground text-xs tabular-nums w-20 text-right">
                          {avgWeightG}g prom
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs italic w-20 text-right" title="Detalle individual no disponible en Firestore">
                          {hasDetail ? '—' : 'agregado'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Top errores del minuto (si la fila P0 tiene detalles).
                   Cada error lleva un tooltip con la descripción oficial de
                   la causa Matrix — útil para analistas que no tienen de
                   memoria qué significa "fuera de conservación" vs "fuera
                   de producto" etc. */}
              {(() => {
                const p0Row = breakdown.gateRows.find((r) => r.gate === 0)
                if (!p0Row || p0Row.errors.length === 0) return null
                return (
                  <div className="mt-2 pl-14 text-xs text-muted-foreground space-y-0.5">
                    {p0Row.errors.map(([err, n]) => {
                      const desc = getMatrixDescription(err)
                      return (
                        <div key={err}>
                          <span className="text-orange-700/90 dark:text-orange-300/80">●</span>{' '}
                          <span
                            className={cn(desc && 'underline decoration-dotted underline-offset-2 decoration-muted-foreground/50 cursor-help')}
                            title={desc}
                          >
                            {err}
                          </span>
                          : {n}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </section>

            {/* Tabla detalle */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground tracking-wider mb-2">
                Piezas ({records.length})
              </h3>
              <div className="border border-border rounded-ctl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr className="text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium">Hora</th>
                      <th className="px-2 py-1.5 text-left font-medium">Gate</th>
                      <th className="px-2 py-1.5 text-right font-medium">Peso</th>
                      <th className="px-2 py-1.5 text-left font-medium">Calibre</th>
                      <th className="px-2 py-1.5 text-left font-medium">Calidad</th>
                      <th className="px-2 py-1.5 text-left font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecords.map((r, i) => {
                      // Calibre inferido desde peso. Crítico para P0: Marelec
                      // asigna "0-2 lb" como default de rechazo, no es el
                      // calibre real. El inferido muestra el calibre que
                      // CORRESPONDERÍA al peso medido.
                      const inferredCalibre = inferCalibreFromWeight(r.weightKg)
                      const marelecCalibreNorm = normCalibre(r.calibre)
                      const inferredNorm = normCalibre(inferredCalibre)
                      const calibreDiffers =
                        r.gate === 0 &&
                        inferredCalibre &&
                        marelecCalibreNorm &&
                        inferredNorm !== marelecCalibreNorm
                      // Error enriquecido: reclasificado con Matrix para P0
                      let errorDisplay: string | null = r.error ?? null
                      if (r.gate === 0 && errorDisplay) {
                        const matrixCause = classifyRecordToMatrix(
                          {
                            ts: r.ts,
                            pieces: r.pieces,
                            weightKg: r.weightKg,
                            weightPerPieceGrams: r.weightPerPieceGrams,
                            quality: r.quality,
                            calibre: r.calibre,
                            error: errorDisplay,
                          } as Parameters<typeof classifyRecordToMatrix>[0],
                          activeGates ?? [],
                          CALIBRE_WEIGHT_RANGES,
                        )
                        errorDisplay = getCauseLabel(errorDisplay, matrixCause)
                      }
                      return (
                        <tr
                          key={`${r.ts}-${i}`}
                          className={cn(
                            'border-t border-border/40 hover:bg-muted/20',
                            r.gate === 0 && 'bg-cat-4-tint/[0.15]',
                          )}
                        >
                          <td className="px-2 py-1 tabular-nums text-muted-foreground">{fmtTimeWithSec(r.ts)}</td>
                          <td className="px-2 py-1 font-medium tabular-nums">
                            {r.gate === 0 ? <span className="text-orange-400">P0</span> : r.gate}
                          </td>
                          <td className="px-2 py-1 tabular-nums text-right">
                            {r.weightKg != null ? `${r.weightKg.toFixed(2)} kg` : '—'}
                          </td>
                          <td className="px-2 py-1 text-muted-foreground">
                            {calibreDiffers ? (
                              <span title={`Marelec reportó "${r.calibre}" (default de rechazo)`}>
                                <span className="text-foreground">{inferredCalibre}</span>
                                <span className="text-muted-foreground/60 text-caption ml-1">real</span>
                              </span>
                            ) : (
                              r.calibre ?? inferredCalibre ?? '—'
                            )}
                          </td>
                          <td className="px-2 py-1 text-muted-foreground">{r.quality ?? '—'}</td>
                          <td className="px-2 py-1 text-muted-foreground">
                            {errorDisplay ? (() => {
                              const desc = getMatrixDescription(errorDisplay)
                              return (
                                <span
                                  className={cn('text-orange-700/90 dark:text-orange-300/80', desc && 'underline decoration-dotted underline-offset-2 decoration-orange-300/40 cursor-help')}
                                  title={desc}
                                >
                                  {errorDisplay}
                                </span>
                              )
                            })() : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {hiddenCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs w-full"
                  onClick={() => setShowAll(true)}
                >
                  Ver {hiddenCount} {hiddenCount === 1 ? 'pieza' : 'piezas'} más
                </Button>
              )}
            </section>
          </div>
        )}

        {!loading && !error && breakdown.total === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Sin piezas registradas en este minuto.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
