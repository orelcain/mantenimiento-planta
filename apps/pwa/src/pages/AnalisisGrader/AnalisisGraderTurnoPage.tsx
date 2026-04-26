/**
 * Vista unificada de turno — reemplaza AnalisisGraderDetallePage.
 * Soporta modo live y closed. Ruta: /analisis-grader/turno/:shiftId
 *
 * shiftId format en URL: `YYYY-MM-DD__Turno%20d%C3%ADa`
 * (React Router decodifica automáticamente → `YYYY-MM-DD__Turno día`)
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Button, Card, CardContent, Spinner, Badge } from '@/components/ui'
import { ArrowLeft, Settings2, AlertCircle, Upload, Activity, Sparkles, Loader2, ChevronLeft, ChevronRight, Share2, Copy, Check, QrCode, Download, Tag, FileText, WifiOff } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { usePermissionsStore } from '@/store'
import { useAuthStore, useIsAdmin } from '@/store/authStore'
import { getDailySummary, loadTimelineAggregates, subscribePausesAggregates, listDailySummariesByRange, listGate0PieceRecords, type FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'
import { createPublicToken } from '@/services/grader/graderPublicToken.service'
import type { Pause, MicroDetentionsSummary } from '@/services/grader/types'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { listSnapshots, type GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { getShiftDoc } from '@/services/grader/graderShifts.service'
import { computeShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import { DEFAULT_SHIFT_SCHEDULE } from '@/services/grader/graderShiftSchedule'
import { parseMatrixErrorString } from '@/services/grader/graderMatrixP0Causes'
import { HeroScorecard } from '@/components/grader/HeroScorecard'
import { P0CausesPanel } from '@/components/grader/P0CausesPanel'
import { ShiftTimelineView } from '@/components/grader/ShiftTimelineView'
import { resolveAxisWindow, computeProductionWindow } from '@/components/grader/shiftTimelineHelpers'
import { TimelineSyncProvider } from '@/components/grader/TimelineSyncContext'
import { ShiftBreakdownsCard } from '@/components/grader/ShiftBreakdownsCard'
import { GateBreakdownCard } from '@/components/grader/GateBreakdownCard'
import { ConfigChangeHistory } from '@/components/grader/ConfigChangeHistory'
import { CurrentGateConfigPanel } from '@/components/grader/CurrentGateConfigPanel'
import { ShiftGatesConfigAccordion } from '@/components/grader/ShiftGatesConfigAccordion'
import { PauseAnnotationDialog } from '@/components/grader/PauseAnnotationDialog'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'
import { exportTurnToPDF } from '@/services/grader/graderTurnToPDF'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePauseTags } from '@/hooks/usePauseTags'
import { useToast } from '@/hooks/useToast'
import { ActionPlanPanel } from '@/components/grader/ActionPlanPanel'
import { deriveSuggestions } from '@/services/grader/actionPlanSuggestions'
import { correlatePausesWithUpstream, summarizeCorrelations } from '@/services/shoplogix/shoplogixCorrelation'
import { buildScatterData, scatterSlopeMagnitude } from '@/components/grader/shiftTimelineHelpers'
import { DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import { UpstreamMachinesPanel } from '@/components/grader/UpstreamMachinesPanel'
import { UpstreamCorrelationCard } from '@/components/grader/UpstreamCorrelationCard'
import { UpstreamScatterCard } from '@/components/grader/UpstreamScatterCard'
import { useUpstreamLineSnapshot } from '@/hooks/useUpstreamLineSnapshot'
import { findTriggeredRunbooks } from '@/services/grader/graderRunbooks'
import { analyzeGraderFromSummary } from '@/services/grader/graderSummaryAI'
import { loadSeasonBenchmark, type SeasonBenchmark } from '@/services/grader/graderBenchmarks'
import { AIOutputPanel } from '@/components/grader/GraderInlinePanels'
import type { GraderDailySummary, MatrixP0Cause, PointZeroClassification, TimelineBucket } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { AIGraderOutput } from '@/services/grader/types'

/** Parsea `YYYY-MM-DD__Turno día` → [dateKey, shiftLabel] */
function parseShiftId(raw: string | undefined): [string, string] {
  if (!raw) return ['', '']
  const idx = raw.indexOf('__')
  if (idx === -1) return [raw, '']
  return [raw.slice(0, idx), raw.slice(idx + 2)]
}

/**
 * Deriva byMatrixCause desde topP0Causes del summary histórico.
 * Fallback cuando no hay datos de Excel P0 en sesión.
 */
function deriveByMatrixCause(
  topP0Causes: GraderDailySummary['topP0Causes'],
  totalP0Pieces: number,
): PointZeroClassification['byMatrixCause'] {
  // 9 causas Matrix (4 oficiales + 5 derivadas)
  const ALL: MatrixP0Cause[] = [
    'fuera_de_limites', 'no_leido_fotocelula', 'too_close_too_long', 'puerta_no_preparada',
    'fuera_de_calibre', 'fuera_de_calidad', 'fuera_de_conservacion', 'fuera_de_producto',
    'otro',
  ]
  const acc = Object.fromEntries(ALL.map(mc => [mc, { pieces: 0, pct: 0, subCauses: [] as PointZeroClassification['byMatrixCause'][MatrixP0Cause]['subCauses'] }])) as PointZeroClassification['byMatrixCause']

  for (const c of topP0Causes ?? []) {
    const mc = labelToMatrixCause(c.error)
    acc[mc].pieces += c.pieces
  }

  for (const mc of ALL) {
    acc[mc].pct = totalP0Pieces > 0 ? (acc[mc].pieces / totalP0Pieces) * 100 : 0
  }

  return acc
}

/**
 * Clasifica strings de causa (tanto del Excel Matrix como los internos
 * normalizados en `topP0Causes`). Fallback: si el string contiene "rango"
 * se mapea a fuera_de_calibre (causa derivada más común) por compat con
 * summaries históricos pre-schema-change.
 */
function labelToMatrixCause(label: string): MatrixP0Cause {
  // Claves canónicas almacenadas por el segmenter (post-FASE 30) — reconocimiento directo
  const ALL_CAUSES: MatrixP0Cause[] = [
    'fuera_de_limites', 'no_leido_fotocelula', 'too_close_too_long', 'puerta_no_preparada',
    'fuera_de_calibre', 'fuera_de_calidad', 'fuera_de_conservacion', 'fuera_de_producto', 'otro',
  ]
  if (ALL_CAUSES.includes(label as MatrixP0Cause)) return label as MatrixP0Cause
  // Compat con summaries históricos que almacenan strings crudos del Excel Matrix
  const s = (label ?? '').toLowerCase()
  const fromMatrix = parseMatrixErrorString(label)
  if (fromMatrix !== 'otro') return fromMatrix
  if (s.includes('rango')) return 'fuera_de_calibre'
  if (s.includes('close') || s.includes('long')) return 'too_close_too_long'
  return 'otro'
}

/** Causa Matrix dominante desde byMatrixCause */
function dominantCause(
  byMatrixCause: PointZeroClassification['byMatrixCause'] | null,
): MatrixP0Cause | null {
  if (!byMatrixCause) return null
  let top: MatrixP0Cause | null = null
  let max = 0
  for (const [mc, v] of Object.entries(byMatrixCause) as [MatrixP0Cause, { pieces: number }][]) {
    if (v.pieces > max) { max = v.pieces; top = mc }
  }
  return top
}

// ── M2: Helpers de export CSV ─────────────────────────────────────────────────

/** HH:MM de un ISO con convención Z-planta (igual que PauseAnnotationDialog) */
function fmtTimeHHMM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function exportTurnoCsv(
  dateKey: string,
  shiftLabel: string,
  summary: GraderDailySummary,
  pauses: Pause[],
): void {
  const SEP = ';'
  const esc = (v: string | number) => String(v).replace(/;/g, ',').replace(/\n/g, ' ')
  const lines: string[] = []

  // Resumen
  lines.push('=== RESUMEN DEL TURNO ===')
  lines.push(['Turno', 'Fecha', 'P0%', 'Piezas totales', 'Piezas P0', 'Duración min', 'Lotes'].join(SEP))
  lines.push([
    esc(shiftLabel),
    dateKey,
    summary.pointZeroPct.toFixed(2),
    summary.totalPieces,
    summary.pointZeroPieces,
    summary.durationMinutes ?? '',
    esc(summary.lotsInShift?.join(' / ') ?? ''),
  ].join(SEP))

  // Pausas
  lines.push('')
  lines.push('=== PAUSAS DETECTADAS ===')
  if (pauses.length === 0) {
    lines.push('Sin pausas registradas')
  } else {
    lines.push(['Inicio', 'Fin', 'Duración min', 'Tipo', 'Tag', 'Nota', 'Anotado por', 'Ajustado por'].join(SEP))
    for (const p of pauses) {
      const tag = resolveEffectiveTag(p)
      lines.push([
        fmtTimeHHMM(p.startAt),
        fmtTimeHHMM(p.endAt),
        Math.round(p.durationSec / 60),
        p.tier,
        tag ? esc(`${tag.emoji} ${tag.label}`) : '—',
        esc(p.note ?? ''),
        esc(p.annotatedBy ?? ''),
        esc(p.adjustedBy ?? ''),
      ].join(SEP))
    }
  }

  // Distribución por gate
  if (summary.gateDistribution && summary.gateDistribution.length > 0) {
    lines.push('')
    lines.push('=== DISTRIBUCIÓN POR GATE ===')
    lines.push(['Gate', 'Piezas', '%'].join(SEP))
    for (const g of summary.gateDistribution) {
      lines.push([g.gate, g.pieces, g.pct.toFixed(1)].join(SEP))
    }
  }

  // Top causas P0
  if (summary.topP0Causes && summary.topP0Causes.length > 0) {
    lines.push('')
    lines.push('=== TOP CAUSAS P0 ===')
    lines.push(['Causa', 'Piezas', '%'].join(SEP))
    for (const c of summary.topP0Causes) {
      lines.push([esc(c.error), c.pieces, c.pct.toFixed(1)].join(SEP))
    }
  }

  const csv = lines.join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `grader_${dateKey}_${shiftLabel.replace(/\s+/g, '_').toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AnalisisGraderTurnoPage() {
  const { canSee } = usePermissionsStore()
  const user = useAuthStore((s) => s.user)
  const isAdmin = useIsAdmin()
  const isOnline = useOnlineStatus()        // M18 — detección de conectividad
  const { toast } = useToast()
  const prevIsOnline = useRef(isOnline)
  const { tags: pauseTags } = usePauseTags()
  const tagLabels = useMemo(
    () => new Map(pauseTags.map((t) => [t.id, `${t.emoji} ${t.label}`])),
    [pauseTags],
  )
  const navigate = useNavigate()
  const { shiftId: rawShiftId } = useParams<{ shiftId: string }>()

  const [dateKey, shiftLabel] = useMemo(() => parseShiftId(rawShiftId), [rawShiftId])

  // Línea upstream (Shoplogix) — en DEV muestra demo; en prod lee de Firestore (Fase 2)
  const upstreamLine = useUpstreamLineSnapshot(dateKey || null, shiftLabel || null)

  const [shiftWindow, setShiftWindow] = useState<ShiftTimeWindow | null>(
    () => dateKey && shiftLabel
      ? computeShiftTimeWindow(dateKey, shiftLabel, DEFAULT_SHIFT_SCHEDULE)
      : null,
  )

  // Sincronizar cuando cambia la URL
  useEffect(() => {
    setShiftWindow(
      dateKey && shiftLabel
        ? computeShiftTimeWindow(dateKey, shiftLabel, DEFAULT_SHIFT_SCHEDULE)
        : null,
    )
  }, [dateKey, shiftLabel])

  // P1-2 — Toast al reconectar (false → true)
  useEffect(() => {
    if (!prevIsOnline.current && isOnline) {
      toast({ title: '✅ Conexión restablecida', description: 'Cambios sincronizados.' })
    }
    prevIsOnline.current = isOnline
  }, [isOnline, toast])

  // Auto-refresh cada minuto si el turno está en vivo.
  // Depende solo de `shiftWindow?.status` para evitar resetear el interval
  // en cada tick (el callback re-lee dateKey/shiftLabel via closure estable).
  useEffect(() => {
    if (shiftWindow?.status !== 'live') return
    const id = setInterval(() => {
      setShiftWindow(
        dateKey && shiftLabel
          ? computeShiftTimeWindow(dateKey, shiftLabel, DEFAULT_SHIFT_SCHEDULE)
          : null,
      )
    }, 60_000)
    return () => clearInterval(id)
  }, [shiftWindow?.status, dateKey, shiftLabel])

  const [summary, setSummary] = useState<GraderDailySummary | null>(null)
  const [shiftDoc, setShiftDoc] = useState<GraderShiftDoc | null>(null)
  const [timelineBuckets, setTimelineBuckets] = useState<TimelineBucket[]>([])
  const [configSnapshots, setConfigSnapshots] = useState<GateConfigSnapshot[]>([])
  const [gate0Pieces, setGate0Pieces] = useState<FirestorePieceRecord[]>([])
  const [pauses, setPauses] = useState<Pause[]>([])
  const [microDetentions, setMicroDetentions] = useState<MicroDetentionsSummary | null>(null)
  const [selectedCauses, setSelectedCauses] = useState<Set<MatrixP0Cause>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alertThreshold, setAlertThreshold] = useState(DEFAULT_P0_ALERT_PCT)
  const [criticalThreshold, setCriticalThreshold] = useState(DEFAULT_P0_CRITICAL_PCT)

  // ── Share (token público) — estado; handlers después de enrichedTimelineBuckets ──
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // ── IA (FASE 16) ─────────────────────────────────────────────────────────
  const [aiOutput, setAiOutput] = useState<AIGraderOutput | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [benchmark, setBenchmark] = useState<SeasonBenchmark | null>(null)

  useEffect(() => {
    loadSeasonBenchmark('2025-2026').then(setBenchmark).catch(() => setBenchmark(null))
  }, [])

  useEffect(() => {
    getModuleRanges().then(cfg => {
      if (cfg?.alertThreshold) setAlertThreshold(cfg.alertThreshold)
      if (cfg?.criticalThreshold) setCriticalThreshold(cfg.criticalThreshold)
    }).catch(() => {})
  }, [])

  // Merge timelineBuckets con bucketExtrasByMinute (script reclassify) —
  // campos que el segmenter viejo no guardó (lot, dominantCalibre, etc.)
  // se llenan desde el extras object. Campos presentes en el bucket original
  // tienen precedencia.
  const enrichedTimelineBuckets = useMemo(() => {
    const extras = summary?.bucketExtrasByMinute
    if (!extras || timelineBuckets.length === 0) return timelineBuckets
    return timelineBuckets.map(b => {
      const ex = extras[b.tsMin]
      if (!ex) return b
      return {
        ...b,
        lot: b.lot ?? ex.lot,
        dominantCalibre: b.dominantCalibre ?? ex.dominantCalibre,
        weightMinGrams: b.weightMinGrams ?? ex.weightMinGrams,
        weightMaxGrams: b.weightMaxGrams ?? ex.weightMaxGrams,
        weightP50Grams: b.weightP50Grams ?? ex.weightP50Grams,
        gateCounts: b.gateCounts ?? ex.gateCounts,
      }
    })
  }, [timelineBuckets, summary?.bucketExtrasByMinute])

  /**
   * Ventana temporal REAL del eje X del chart Grader (data-driven, no el
   * shiftWindow del schedule). Replica el filtrado interno de
   * `ShiftTimelineView`: `pieces > 0` + dentro de `productionWindow`
   * (excluye pre/post-turno con lotes dummy 1111). Pasamos esta a Baader
   * panel para que su Gantt tenga EXACTAMENTE el mismo rango temporal que
   * el chart Grader — sin esto, la "alineación pixel-perfect" alinea pixels
   * pero no horas.
   */
  const chartAxisWindow = useMemo(() => {
    if (!shiftWindow) return null
    const productionWindow = computeProductionWindow(enrichedTimelineBuckets)
    const inWindow = (tsMin: string): boolean => {
      if (!productionWindow) return true
      const ts = Date.parse(tsMin)
      return ts >= productionWindow.startMs && ts <= productionWindow.endMs
    }
    const filtered = enrichedTimelineBuckets.filter(b => b.pieces > 0 && inWindow(b.tsMin))
    if (filtered.length === 0) return null
    const axis = resolveAxisWindow(filtered, shiftWindow)
    return {
      startAt: new Date(axis.effectiveStartMs).toISOString(),
      endAt:   new Date(axis.effectiveEndMs).toISOString(),
    }
  }, [enrichedTimelineBuckets, shiftWindow])

  // ── Navegación contextual prev/next ─────────────────────────────────────
  // Carga shifts del rango ±20 días para construir cadena de navegación
  const [adjacentShifts, setAdjacentShifts] = useState<{ prev: { dateKey: string; shiftId: string } | null; next: { dateKey: string; shiftId: string } | null }>({ prev: null, next: null })

  useEffect(() => {
    if (!dateKey || !shiftLabel) return
    const fromDate = (() => {
      const d = new Date(`${dateKey}T12:00:00`); d.setDate(d.getDate() - 20)
      return d.toISOString().slice(0, 10)
    })()
    const toDate = (() => {
      const d = new Date(`${dateKey}T12:00:00`); d.setDate(d.getDate() + 20)
      return d.toISOString().slice(0, 10)
    })()
    listDailySummariesByRange(fromDate, toDate)
      .then(list => {
        // Orden cronológico ascendente por dateKey, luego día antes que noche
        const sorted = [...list].sort((a, b) => {
          if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey)
          // 'Turno día' antes que 'Turno noche'
          const aIsDay = a.shiftId.includes('día') ? 0 : 1
          const bIsDay = b.shiftId.includes('día') ? 0 : 1
          return aIsDay - bIsDay
        })
        const idx = sorted.findIndex(s => s.dateKey === dateKey && s.shiftId === shiftLabel)
        if (idx === -1) {
          setAdjacentShifts({ prev: null, next: null })
          return
        }
        const prevEntry = idx > 0 ? sorted[idx - 1] : null
        const nextEntry = idx < sorted.length - 1 ? sorted[idx + 1] : null
        setAdjacentShifts({
          prev: prevEntry ? { dateKey: prevEntry.dateKey, shiftId: prevEntry.shiftId } : null,
          next: nextEntry ? { dateKey: nextEntry.dateKey, shiftId: nextEntry.shiftId } : null,
        })
      })
      .catch(() => setAdjacentShifts({ prev: null, next: null }))
  }, [dateKey, shiftLabel])

  const goToShift = useCallback((target: { dateKey: string; shiftId: string }) => {
    navigate(`/analisis-grader/turno/${target.dateKey}__${encodeURIComponent(target.shiftId)}`)
  }, [navigate])

  // Atajos de teclado: ← / → para navegar entre turnos
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' && adjacentShifts.prev) {
        e.preventDefault()
        goToShift(adjacentShifts.prev)
      } else if (e.key === 'ArrowRight' && adjacentShifts.next) {
        e.preventDefault()
        goToShift(adjacentShifts.next)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [adjacentShifts, goToShift])

  // Swipe horizontal (mobile) — mismo comportamiento que ← / →
  useEffect(() => {
    let startX = 0
    let startY = 0
    let startTarget: EventTarget | null = null
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      startTarget = e.target
    }
    const onTouchEnd = (e: TouchEvent) => {
      // Ignorar swipes que empezaron dentro de elementos scrollables horizontal
      // (charts ECharts, carousels), inputs, o botones.
      if (startTarget instanceof Element) {
        if (startTarget.closest('input, textarea, button, canvas, [data-no-swipe]')) return
      }
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      // Solo swipe claramente horizontal: |dx|>80px y dominante sobre vertical
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0 && adjacentShifts.prev) goToShift(adjacentShifts.prev)
        else if (dx < 0 && adjacentShifts.next) goToShift(adjacentShifts.next)
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [adjacentShifts, goToShift])

  const handleGenerateAI = async () => {
    if (!summary) return
    setAiLoading(true)
    setAiError(null)
    try {
      const benchmarkDelta = benchmark
        ? +(summary.pointZeroPct - benchmark.p0Pct).toFixed(2)
        : undefined
      const result = await analyzeGraderFromSummary(summary, undefined, {
        actions: shiftDoc?.actions,
        benchmarkDelta,
      })
      setAiOutput(result)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al analizar con IA')
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    if (!dateKey || !shiftLabel) {
      setError('URL inválida. Formato esperado: /turno/YYYY-MM-DD__Turno día')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    Promise.all([
      getDailySummary(dateKey, shiftLabel),
      getShiftDoc(dateKey, shiftLabel).catch(() => null),
    ])
      .then(([s, sd]) => {
        if (!s) {
          const win = computeShiftTimeWindow(dateKey, shiftLabel, DEFAULT_SHIFT_SCHEDULE)
          if (win.status !== 'live') {
            setError(`Turno ${shiftLabel} del ${dateKey} no encontrado en el historial.`)
          }
          // Si es live: summary=null + error=null → renderiza empty-state con CTA de upload
        } else {
          setSummary(s)
        }
        setShiftDoc(sd)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error al cargar el turno.'))
      .finally(() => setLoading(false))
  }, [dateKey, shiftLabel])

  // Carga timeline sub-collection (graderDailySummaries/{id}/meta/timeline)
  useEffect(() => {
    if (!dateKey || !shiftLabel) return
    loadTimelineAggregates(`${dateKey}__${shiftLabel}`)
      .then(buckets => setTimelineBuckets(buckets ?? []))
      .catch(() => {})
  }, [dateKey, shiftLabel])

  // Suscripción en tiempo real a `meta/pauses` — M8.
  // onSnapshot propaga cambios de otros admins al instante (sin reload manual).
  // reloadPauses se mantiene como no-op para compatibilidad con la prop
  // onPauseUpdated de ShiftTimelineView.
  const reloadPauses = useCallback(() => {}, [])

  useEffect(() => {
    if (!dateKey || !shiftLabel) return
    setPauses([])
    setMicroDetentions(null)
    const unsub = subscribePausesAggregates(`${dateKey}__${shiftLabel}`, (data) => {
      if (!data) { setPauses([]); setMicroDetentions(null); return }
      setPauses(data.pauses)
      setMicroDetentions(data.microDetentions)
    })
    return unsub
  }, [dateKey, shiftLabel])

  // Carga pieceRecords gate=0 para drill-down en timeline
  useEffect(() => {
    if (!dateKey || !shiftLabel) return
    setSelectedCauses(new Set())  // reset al cambiar de turno
    listGate0PieceRecords(`${dateKey}__${shiftLabel}`)
      .then(setGate0Pieces)
      .catch(() => setGate0Pieces([]))
  }, [dateKey, shiftLabel])

  // Carga historial de config de gates (FASE 27)
  // Extraído como callback para poder refrescarse tras un nuevo cambio
  const reloadConfigSnapshots = useCallback(() => {
    if (!dateKey || !shiftLabel) return
    listSnapshots(`${dateKey}__${shiftLabel}`)
      .then(setConfigSnapshots)
      .catch(() => setConfigSnapshots([]))
  }, [dateKey, shiftLabel])

  useEffect(() => { reloadConfigSnapshots() }, [reloadConfigSnapshots])

  // M3 — Siguiente pausa sin clasificar
  const [nextPauseOpen, setNextPauseOpen] = useState(false)

  // M17 — Export PDF
  const [pdfExporting, setPdfExporting] = useState(false)
  const chartImageRef = useRef<(() => string | null) | null>(null)

  // El rango del zoom ahora vive en TimelineSyncContext (centralizado),
  // no en este componente. Los hijos lo leen/escriben via useTimelineSync.
  // Aquí solo computamos el rango BASE (full) que el panel usará cuando
  // no hay zoom activo — sirve de fallback cuando context.range es null.
  const baseAxisWindow = useMemo<{ startAt: string; endAt: string } | null>(() => {
    if (chartAxisWindow) return chartAxisWindow
    if (shiftWindow) return { startAt: shiftWindow.startAt, endAt: shiftWindow.endAt }
    return null
  }, [chartAxisWindow, shiftWindow])
  const handleExportPdf = useCallback(async () => {
    if (!summary || pdfExporting) return
    setPdfExporting(true)
    try {
      const chartImageDataUrl = chartImageRef.current?.() ?? null
      await exportTurnToPDF({ summary, pauses, tagLabels, chartImageDataUrl, upstreamSnapshot: upstreamLine.snapshot })
    } catch (err) {
      console.error('[M17] PDF export error:', err)
    } finally {
      setPdfExporting(false)
    }
  }, [summary, pauses, pdfExporting, tagLabels])

  const untaggedPauses = useMemo(
    () => pauses.filter(p => !resolveEffectiveTag(p)),
    [pauses],
  )

  const handleNextPauseSaved = useCallback(() => {
    reloadPauses()
    // El diálogo se cierra solo vía onSaved→onOpenChange(false) en PauseAnnotationDialog.
    // Tras reload, untaggedPauses se recomputa y el botón muestra el nuevo conteo.
  }, [reloadPauses])

  // Todos los useMemo ANTES del early return condicional (regla de hooks)
  const byMatrixCause = useMemo(() => {
    if (!summary?.topP0Causes?.length) return null
    return deriveByMatrixCause(summary.topP0Causes, summary.pointZeroPieces)
  }, [summary])

  const dominant = useMemo(() => dominantCause(byMatrixCause), [byMatrixCause])

  // Contexto upstream para enriquecer las sugerencias del plan de acción.
  // Calculamos `byMachine` + `upstreamCausedDurSec` desde el correlation summary,
  // y la magnitud de la pendiente desde el scatter Baader↔P0%.
  // Si no hay snapshot de Shoplogix, este memo retorna {} (no rompe nada).
  const suggestionContext = useMemo(() => {
    const ctx: Parameters<typeof deriveSuggestions>[2] = {}
    if (upstreamLine.snapshot) {
      const correlations = correlatePausesWithUpstream(pauses, upstreamLine.snapshot)
      const corrSummary  = summarizeCorrelations(correlations)
      ctx.upstreamByMachine    = corrSummary.byMachine
      ctx.upstreamCausedDurSec = corrSummary.upstreamCausedDurSec

      const scatterSeries = buildScatterData(upstreamLine.snapshot, enrichedTimelineBuckets)
      const slope = scatterSlopeMagnitude(scatterSeries)
      if (slope) ctx.scatterSlope = slope
    }
    return ctx
  }, [upstreamLine.snapshot, pauses, enrichedTimelineBuckets])

  const suggestions = useMemo(
    () => deriveSuggestions(summary?.pointZeroPct ?? 0, dominant, suggestionContext),
    [summary, dominant, suggestionContext],
  )

  const triggeredRunbooks = useMemo(
    () => findTriggeredRunbooks(dominant, summary?.pointZeroPct ?? 0),
    [dominant, summary],
  )

  const shiftDocId = `${dateKey}__${shiftLabel}`

  // Fecha legible para el header ("vie 27 feb")
  // IMPORTANTE: todos los hooks ANTES del early return (rules-of-hooks)
  const dateLabel = useMemo(() => {
    if (!dateKey) return ''
    const d = new Date(`${dateKey}T12:00:00`)
    const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')
    const dayNum = d.getDate()
    const monthName = d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
    return `${dayName} ${dayNum} ${monthName}`
  }, [dateKey])

  // handlers de share — después de enrichedTimelineBuckets para evitar TDZ
  const handleShare = useCallback(async () => {
    if (!summary || !dateKey || !shiftLabel) return
    setSharing(true)
    try {
      const token = await createPublicToken(shiftDocId, {
        dateKey,
        shiftId: shiftLabel,
        createdBy: user?.nombre
          ? `${user.nombre}${user.apellido ? ' ' + user.apellido : ''}`
          : (user?.email ?? 'admin'),
        summary,
        timelineBuckets: enrichedTimelineBuckets,
        pauses,
      })
      const base = `${window.location.origin}${import.meta.env.BASE_URL}`
      setShareUrl(`${base}view/${token}`)
    } finally {
      setSharing(false)
    }
  }, [summary, dateKey, shiftLabel, shiftDocId, user, enrichedTimelineBuckets, pauses])

  const handleCopy = useCallback(() => {
    if (!shareUrl) return
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [shareUrl])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  // groupId único por turno: garantiza que múltiples instancias del provider
  // (ej. al cambiar de turno con HMR) no se mezclen en el registro global
  // de echarts.connect.
  const timelineGroupId = `timeline-${shiftDocId || 'default'}`

  return (
    <TimelineSyncProvider groupId={timelineGroupId}>
    <div className="container mx-auto p-3 sm:p-4 space-y-4 max-w-screen-xl">
      {/* M18 — Banner offline */}
      {!isOnline && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            Sin conexión — las anotaciones se guardarán localmente y se sincronizarán al reconectarse.
          </span>
        </div>
      )}
      {/* ── Header sticky con navegación contextual ───────────────────── */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 bg-background/85 backdrop-blur-md border-b border-border/40 flex items-center justify-between gap-2 flex-wrap">
        {/* Sub-helper visual: tip de swipe en mobile */}
        {(adjacentShifts.prev || adjacentShifts.next) && (
          <span className="sr-only">Desliza ← → o usa teclado flechas para navegar turnos</span>
        )}
        {/* Izquierda: back + título */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/analisis-grader')}
            className="gap-1.5 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Análisis de Turno</span>
          </Button>
          {dateKey && shiftLabel && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">
                {shiftLabel}
              </span>
              <span className="text-sm text-muted-foreground hidden sm:inline">·</span>
              <span className="text-sm text-muted-foreground truncate">
                {dateLabel}
              </span>
              {summary?.turnoLabel && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 shrink-0 border-violet-500/40 text-violet-400"
                  title="Turno de producción (columna Turno del Excel)"
                >
                  Turno {summary.turnoLabel}
                </Badge>
              )}
              {shiftWindow && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 shrink-0 ${
                    shiftWindow.status === 'live'
                      ? 'border-red-500/50 text-red-400'
                      : 'border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  {shiftWindow.status === 'live' ? 'EN VIVO' : 'CERRADO'}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Derecha: acciones + prev/next navigation */}
        <div className="flex items-center gap-1 shrink-0">
          {/* M3: Siguiente pausa sin clasificar */}
          {isAdmin && summary && untaggedPauses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNextPauseOpen(true)}
              className="gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              title={`${untaggedPauses.length} pausas sin clasificar en este turno`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs tabular-nums">{untaggedPauses.length}</span>
            </Button>
          )}
          {/* M2: Exportar turno a CSV */}
          {summary && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportTurnoCsv(dateKey, shiftLabel, summary, pauses)}
              title="Exportar turno a CSV (pauses + gates + causas P0)"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          )}
          {/* M17: Exportar turno a PDF */}
          {summary && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={pdfExporting}
              title="Exportar resumen de turno a PDF"
            >
              {pdfExporting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => adjacentShifts.prev && goToShift(adjacentShifts.prev)}
            disabled={!adjacentShifts.prev}
            className="gap-1"
            title={adjacentShifts.prev ? `Turno anterior (←)` : 'Sin turno anterior'}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden md:inline text-xs">Anterior</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => adjacentShifts.next && goToShift(adjacentShifts.next)}
            disabled={!adjacentShifts.next}
            className="gap-1"
            title={adjacentShifts.next ? `Turno siguiente (→)` : 'Sin turno siguiente'}
          >
            <span className="hidden md:inline text-xs">Siguiente</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Estados */}
      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground">
          <Spinner className="w-5 h-5" />
          Cargando turno…
        </div>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex items-center gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Turno en vivo sin datos aún */}
      {!loading && !error && !summary && shiftWindow?.status === 'live' && (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <Activity className="w-8 h-8 text-red-400 animate-pulse" />
            <p className="font-medium">Turno en curso — sin datos cargados aún</p>
            <p className="text-sm text-muted-foreground">
              Cargá el primer Excel de Matrix para ver el estado del proceso.
            </p>
            <Button onClick={() => navigate('/analisis-grader/wizard')} className="gap-2 mt-1">
              <Upload className="w-4 h-4" />
              Cargar Excel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Contenido principal
          Mobile (stack vertical): Scorecard → Acciones → Causas (acciones arriba del todo)
          Desktop (grid 3-col 2 filas): Scorecard + Causas izq (2 cols apilados), Acciones der (col 3 × 2 filas) */}
      {summary && shiftWindow && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Scorecard — mobile row 1 */}
            <div className="lg:col-span-2 lg:row-start-1">
              <HeroScorecard summary={summary} shiftWindow={shiftWindow} />
            </div>

            {/* Acciones — mobile row 2 (protagonismo), desktop derecha full-height */}
            <div className="lg:col-start-3 lg:row-span-2 space-y-4" data-no-swipe>
              <ActionPlanPanel
                shiftDocId={shiftDocId}
                suggestions={suggestions}
                status={shiftWindow.status}
                relatedRunbooks={triggeredRunbooks}
              />
            </div>

            {/* Causas — mobile row 3 (contexto), desktop izquierda abajo */}
            <div className="lg:col-span-2 lg:row-start-2">
              <P0CausesPanel
                byMatrixCause={byMatrixCause}
                totalP0Pct={summary.pointZeroPct}
                unsortedPcs={summary.pointZeroPieces}
                selectedCauses={selectedCauses}
                onToggleCause={(cause) => setSelectedCauses(prev => {
                  const next = new Set(prev)
                  if (next.has(cause)) next.delete(cause)
                  else next.add(cause)
                  return next
                })}
              />
            </div>
          </div>

          {/* Timeline — full width */}
          <ShiftTimelineView
            timelineBuckets={enrichedTimelineBuckets}
            shiftDoc={shiftDoc}
            shiftWindow={shiftWindow}
            configSnapshots={configSnapshots}
            gate0Pieces={gate0Pieces}
            pauses={pauses}
            microDetentions={microDetentions}
            summaryId={shiftDocId}
            adminUid={isAdmin ? user?.id : undefined}
            onPauseUpdated={reloadPauses}
            selectedCauses={selectedCauses}
            onClearSelectedCauses={() => setSelectedCauses(new Set())}
            summaryP0Pct={summary.pointZeroPct}
            alertThreshold={alertThreshold}
            criticalThreshold={criticalThreshold}
            isOnline={isOnline}
            chartImageRef={chartImageRef}
            upstreamSnapshot={upstreamLine.snapshot}
          />

          {/* Línea upstream — Evisceradoras Baader 142 (integración Shoplogix) */}
          {/* Va INMEDIATAMENTE después del timeline Grader para máxima cercanía visual */}
          <UpstreamMachinesPanel
            snapshot={upstreamLine.snapshot}
            loading={upstreamLine.loading}
            error={upstreamLine.error}
            syncedAt={upstreamLine.syncedAt}
            shiftWindow={baseAxisWindow}
            pauses={pauses}
          />

          {/* Correlación automática Grader↔Baader (Fase 3 iter 2) — debajo de los 3 gantts */}
          <UpstreamCorrelationCard
            pauses={pauses}
            snapshot={upstreamLine.snapshot}
          />

          {/* Scatter ritmo Baader vs P0% Grader (Fase 3 iter 3) — usa el
              umbral crítico configurado por el usuario, no un hardcoded */}
          <UpstreamScatterCard
            snapshot={upstreamLine.snapshot}
            timelineBuckets={enrichedTimelineBuckets}
            criticalThreshold={criticalThreshold}
          />

          {/* Distribución por gate — balance del turno */}
          {summary.gateDistribution && summary.gateDistribution.length > 0 && (
            <GateBreakdownCard
              gateDistribution={summary.gateDistribution}
              configSnapshots={configSnapshots}
              totalPieces={summary.totalPieces}
              pointZeroPieces={summary.pointZeroPieces}
              pointZeroPct={summary.pointZeroPct}
              shiftDocId={`${dateKey}__${shiftLabel}`}
              onSaved={reloadConfigSnapshots}
            />
          )}

          {/* Composición del turno (lotes + calidad + producto + conservación) */}
          <ShiftBreakdownsCard
            lotsInShift={summary.lotsInShift}
            calidadBreakdown={summary.calidadBreakdown}
            productoBreakdown={summary.productoBreakdown}
            conservacionBreakdown={summary.conservacionBreakdown}
          />

          {/* Config actual del turno — grilla compacta de los 12 gates */}
          {configSnapshots.length > 0 && (
            <CurrentGateConfigPanel configSnapshots={configSnapshots} />
          )}

          {/* Acordeón editable de los 12 gates — colapsado por defecto */}
          <ShiftGatesConfigAccordion
            shiftDocId={shiftDocId}
            configSnapshots={configSnapshots}
            onSaved={reloadConfigSnapshots}
            allowEdit={shiftWindow?.status === 'live'}
          />

          {/* Historial de cambios de configuración del turno */}
          <ConfigChangeHistory
            shiftDocId={`${dateKey}__${shiftLabel}`}
            snapshots={configSnapshots}
            timelineBuckets={enrichedTimelineBuckets}
            onChange={reloadConfigSnapshots}
            allowEdit={shiftWindow?.status === 'live'}
          />

          {/* ── Sección IA ─────────────────────────────────────────────── */}
          <Card>
            <CardContent className="py-3 px-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-medium">Análisis IA</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateAI}
                  disabled={aiLoading || !summary}
                  className="text-xs"
                >
                  {aiLoading
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analizando…</>
                    : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />{aiOutput ? 'Regenerar' : 'Generar análisis'}</>}
                </Button>
              </div>
              {aiError && (
                <p className="text-xs text-destructive">{aiError}</p>
              )}
            </CardContent>
          </Card>
          {aiOutput && <AIOutputPanel output={aiOutput} />}

          {/* Nota: el contador de cambios de config (FASE 27) ya vive en
              el badge del panel ConfigChangeHistory de arriba — eliminado
              para evitar duplicación con conteos divergentes. */}

          {/* Compartir turno — solo supervisores/admins cuando hay summary */}
          {summary && isAdmin && (
            <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Compartir turno</span>
                {!shareUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 text-xs"
                    onClick={() => void handleShare()}
                    disabled={sharing}
                  >
                    {sharing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Generar link'}
                  </Button>
                )}
              </div>
              {shareUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {shareUrl}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="shrink-0 flex items-center gap-1 rounded bg-amber-500/80 hover:bg-amber-500 text-white text-[11px] px-2 py-1 transition-colors"
                      title="Copiar link"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      onClick={() => { setShareUrl(null); setCopied(false) }}
                      className="shrink-0 text-[11px] text-muted-foreground/60 hover:text-muted-foreground px-1"
                      title="Generar nuevo link"
                    >
                      nuevo
                    </button>
                  </div>
                  {/* QR code para escanear desde celular */}
                  <div className="flex items-start gap-3 pt-1">
                    <div className="rounded-lg border border-border/40 bg-white p-1.5">
                      <QRCodeSVG value={shareUrl} size={100} level="M" includeMargin={false} />
                    </div>
                    <div className="flex flex-col justify-center gap-1 pt-1">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <QrCode className="w-3 h-3" />
                        Escanear con el celular
                      </div>
                      <p className="text-[10px] text-muted-foreground/50">
                        Abre la vista de turno sin necesidad de login
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/40">
                Link válido 7 días · sin login · solo lectura
              </p>
            </div>
          )}

          {/* Link a configuración avanzada */}
          <button
            onClick={() => navigate('/analisis-grader/wizard?tab=gates')}
            className="w-full text-left"
          >
            <Card className="border-dashed hover:bg-muted/30 transition-colors">
              <CardContent className="py-3 px-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Settings2 className="w-4 h-4" />
                Abrir configuración física avanzada (12 Gates, Cintas, Distancias…)
              </CardContent>
            </Card>
          </button>
        </>
      )}

      {/* M3: Diálogo "siguiente pausa sin clasificar" */}
      <PauseAnnotationDialog
        open={nextPauseOpen}
        onOpenChange={setNextPauseOpen}
        pause={untaggedPauses[0] ?? null}
        summaryId={shiftDocId}
        adminUid={user?.id ?? ''}
        onSaved={handleNextPauseSaved}
        isOnline={isOnline}
        timelineBuckets={enrichedTimelineBuckets}
        thresholds={{ alert: alertThreshold, critical: criticalThreshold }}
      />
    </div>
    </TimelineSyncProvider>
  )
}
