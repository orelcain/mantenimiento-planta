/**
 * Vista unificada de turno — reemplaza AnalisisGraderDetallePage.
 * Soporta modo live y closed. Ruta: /analisis-grader/turno/:shiftId
 *
 * shiftId format en URL: `YYYY-MM-DD__Turno%20d%C3%ADa`
 * (React Router decodifica automáticamente → `YYYY-MM-DD__Turno día`)
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { logger } from '@/lib/logger'
import { Button, Card, CardContent, Spinner, Badge } from '@/components/ui'
import { ArrowLeft, Settings2, AlertCircle, Upload, Activity, Sparkles, Loader2, ChevronLeft, ChevronRight, Share2, Copy, Check, QrCode, Download, Tag, FileText, WifiOff, ChevronDown, RefreshCw, Zap, Scale, Sun, Sunset, Moon, Sunrise, Globe2, Radio, Image as ImageIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { usePermissionsStore } from '@/store'
import { useAuthStore, useIsAdmin, useIsSupervisor } from '@/store/authStore'
import { getDailySummary, buildDailySummaryId, loadTimelineAggregates, subscribePausesAggregates, listDailySummariesByRange, listGate0PieceRecords, type FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'
import { createPublicToken, revokePublicToken } from '@/services/grader/graderPublicToken.service'
import { createPublicShiftMonitor, revokePublicShiftMonitor, MONITOR_TTL_CHOICES, type MonitorTtlHours, type MonitorMode } from '@/services/shoplogix/publicShiftMonitor.service'
import type { Pause, MicroDetentionsSummary } from '@/services/grader/types'
import { getModuleRanges, saveModuleShiftSchedule } from '@/services/grader/graderModuleConfig.service'
import { listSnapshots, saveConfigSnapshot, type GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { getShiftDoc } from '@/services/grader/graderShifts.service'
import { computeShiftTimeWindow, nowAsWallClockUTC } from '@/services/grader/graderShiftStatus'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import { DEFAULT_SHIFT_SCHEDULE, normalizeShiftSchedule } from '@/services/grader/graderShiftSchedule'
import { getShiftDisplayDateKey, getShiftMeta, SLX_NOISE_THRESHOLD } from '@/services/grader/graderShiftDisplay'
import { parseMatrixErrorString } from '@/services/grader/graderMatrixP0Causes'
import { HeroScorecard } from '@/components/grader/HeroScorecard'
import { TurnoOficialChip } from '@/components/grader/TurnoOficialChip'
import { TurnoVentanaAviso } from '@/components/grader/TurnoVentanaAviso'
import { resolveShiftWindow } from '@/services/grader/graderShiftWindow'
import { ShoplogixOnlyScorecard } from '@/components/grader/ShoplogixOnlyScorecard'
import { P0CausesPanel } from '@/components/grader/P0CausesPanel'
import { ConfigDriftBanner } from '@/components/grader/ConfigDriftBanner'
import { detectConfigDrift } from '@/services/grader/graderConfigDrift'
import { recomputeShiftP0Causes } from '@/services/grader/graderGate0Store'
import { GraderCoverageBar } from '@/components/grader/GraderCoverageBar'
import { TurnoTiemposLine } from '@/components/grader/TurnoTiemposLine'
import { ShiftTimelineView } from '@/components/grader/ShiftTimelineView'
import { resolveAxisWindow, computeProductionWindow, resolveFraming, type FramingOverride } from '@/components/grader/shiftTimelineHelpers'
import { TimelineSyncProvider } from '@/components/grader/TimelineSyncContext'
import { ShiftBreakdownsCard } from '@/components/grader/ShiftBreakdownsCard'
import { GateBreakdownCard } from '@/components/grader/GateBreakdownCard'
import { GateEvolutionChart } from '@/components/grader/GateEvolutionChart'
import { GateChangeImpactCard } from '@/components/grader/GateChangeImpactCard'
import { GateChangeModal } from '@/components/grader/modals/GateChangeModal'
import { BeltRpmModal } from '@/components/grader/modals/BeltRpmModal'
import type { ActionTrigger } from '@/services/grader/actionPlanSuggestions'
import { ConfigChangeHistory } from '@/components/grader/ConfigChangeHistory'
import { ShiftConfigPanel } from '@/components/grader/ShiftConfigPanel'
import { ShiftQuotaCard } from '@/components/grader/ShiftQuotaCard'
import { PauseAnnotationDialog } from '@/components/grader/PauseAnnotationDialog'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'
import { exportTurnToPDF } from '@/services/grader/graderTurnToPDF'
import { buildExecutiveSummary } from '@/services/grader/graderExecutiveSummary'
import { exportExecutiveSummaryPng } from '@/services/grader/graderExecutiveSummaryPng'
import { computeMaintenanceReliability } from '@/services/grader/graderReliability'
import { displayShiftName } from '@/services/grader/graderShiftDisplay'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncAge } from '@/hooks/useSyncAge'
import { usePauseTags } from '@/hooks/usePauseTags'
import { useToast } from '@/hooks/useToast'
import { ActionPlanPanel } from '@/components/grader/ActionPlanPanel'
import { deriveSuggestions } from '@/services/grader/actionPlanSuggestions'
import { deriveYalSuggestions } from '@/services/grader/graderInsightsYal'
import { correlatePausesWithUpstream, summarizeCorrelations } from '@/services/shoplogix/shoplogixCorrelation'
import { listShiftInfosForDay } from '@/services/shoplogix/shoplogixShift.service'
import { effectiveProductionWindow, shouldFrameOnProduction } from '@/services/shoplogix/shoplogixNormalizer'
import { buildScatterData, scatterSlopeMagnitude } from '@/components/grader/shiftTimelineHelpers'
import { DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import { PieceScatterChart } from '@/components/grader/PieceScatterChart'
import { UpstreamMachinesPanel } from '@/components/grader/UpstreamMachinesPanel'
import { SensorStopsCausePanel } from '@/components/grader/SensorStopsCausePanel'
import { UpstreamCorrelationCard } from '@/components/grader/UpstreamCorrelationCard'
import { UpstreamScatterCard } from '@/components/grader/UpstreamScatterCard'
import { useUpstreamLineSnapshot } from '@/hooks/useUpstreamLineSnapshot'
import { getPlantLineConfig, DEFAULT_PLANT_LINE_ID } from '@/config/plantLines'
import { findTriggeredRunbooks } from '@/services/grader/graderRunbooks'
import { analyzeGraderFromSummary } from '@/services/grader/graderSummaryAI'
import { loadSeasonBenchmark, type SeasonBenchmark } from '@/services/grader/graderBenchmarks'
import { AIOutputPanel } from '@/components/grader/GraderInlinePanels'
import type { GraderDailySummary, MatrixP0Cause, PointZeroClassification, TimelineBucket, GraderAnalysisConfig, GateAssignment, CalibreWeightRange, GraderShiftSchedule, ShiftQuota } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { AIGraderOutput } from '@/services/grader/types'
import { AnalisisGraderGatesConfigPage } from './AnalisisGraderGatesConfigPage'

/**
 * ¿El dataURL corresponde a un gráfico ya pintado?
 * Un canvas de ECharts sin renderizar devuelve null o un PNG casi vacío; el
 * timeline real pesa cientos de KB en base64.
 */
function isRenderedChart(dataUrl: string | null): boolean {
  return !!dataUrl && dataUrl.startsWith('data:image/png') && dataUrl.length > 20_000
}

/** Espera a que `check()` sea true, sondeando cada 60 ms hasta `timeoutMs`. */
async function waitUntil(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise(r => setTimeout(r, 60))
  }
  return check()
}

/** Parsea `YYYY-MM-DD__Turno día` → [dateKey, shiftLabel] */
function parseShiftId(raw: string | undefined): [string, string] {
  if (!raw) return ['', '']
  const idx = raw.indexOf('__')
  if (idx === -1) return [raw, '']
  return [raw.slice(0, idx), raw.slice(idx + 2)]
}

/**
 * Vistas del detalle de turno.
 *
 * Antes esto era un scroll único de ~20 bloques: el supervisor que venía a ver
 * un cambio de compuerta pasaba por el timeline, la línea upstream y la
 * composición del turno antes de llegar. Agrupadas por lo que se viene a hacer,
 * y montando solo la vista abierta (los charts pesados dejan de renderizarse
 * todos de una).
 */
const ALL_TURNO_VIEWS = ['resumen', 'timeline', 'gates', 'linea'] as const
type TurnoView = (typeof ALL_TURNO_VIEWS)[number]

const TURNO_VIEW_LABEL: Record<TurnoView, string> = {
  resumen:  'Resumen',
  timeline: 'Timeline',
  gates:    'Gates',
  linea:    'Línea',
}

/** Barra de vistas del turno. */
function TurnoViewTabs({
  views,
  active,
  onChange,
  gatesBadge,
}: {
  views: TurnoView[]
  active: TurnoView
  onChange: (v: TurnoView) => void
  gatesBadge?: number
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" data-no-swipe>
      {views.map(view => {
        const isActive = view === active
        return (
          <button
            key={view}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(view)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 -mb-px text-sm border-b-2 transition-colors ${
              isActive
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TURNO_VIEW_LABEL[view]}
            {view === 'gates' && !!gatesBadge && (
              <span className={`text-caption tabular-nums px-1.5 rounded-full ${
                isActive ? 'bg-primary/20 text-primary' : 'bg-muted-foreground/15'
              }`}>
                {gatesBadge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
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
        fmtTime(p.startAt),
        fmtTime(p.endAt),
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
  const isSupervisor = useIsSupervisor()
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
  const [searchParams] = useSearchParams()

  const [dateKey, shiftLabel] = useMemo(() => parseShiftId(rawShiftId), [rawShiftId])

  // Planta activa — viene del parámetro ?linea= (preservado desde el calendario)
  const plantLineCfg = useMemo(
    () => getPlantLineConfig(searchParams.get('linea') ?? ''),
    [searchParams],
  )

  /**
   * ID del documento Firestore para este turno en `graderDailySummaries`.
   * - Chonchi (default):   `${dateKey}__${shiftLabel}`
   * - Yal y otras líneas:  `${plantLineId}__${dateKey}__${shiftLabel}`
   * Usar este ID (no el literal) en todas las operaciones sobre graderDailySummaries
   * y sus sub-colecciones (timeline, pauses, pieceRecords).
   * Las operaciones sobre graderShifts siguen usando shiftDocId (sin prefix).
   */
  const effectiveSummaryId = useMemo(
    () => (dateKey && shiftLabel) ? buildDailySummaryId(dateKey, shiftLabel, plantLineCfg.id) : '',
    [dateKey, shiftLabel, plantLineCfg.id],
  )

  // Línea upstream (Shoplogix) — usa el plantSlug correcto según la pestaña activa
  const upstreamLine = useUpstreamLineSnapshot(dateKey || null, shiftLabel || null, plantLineCfg.plantSlug)

  // URL al wizard preservando el `?linea=` actual. Sin esto, cargar Excel
  // desde un turno de Yal envía al wizard sin planta → guarda el doc en la
  // línea default (chonchi) y el turno de Yal nunca lo encuentra.
  const wizardUrl = plantLineCfg.id !== DEFAULT_PLANT_LINE_ID
    ? `/analisis-grader/wizard?linea=${plantLineCfg.id}`
    : '/analisis-grader/wizard'

  // URL al wizard pre-cargada con el contexto del turno actual: date+shift
  // sirven para que el upload asocie automáticamente el doc al mismo turno
  // (sin importar el timestamp del Excel). Tras guardar, el wizard auto-vuelve
  // a la página del turno (totalSegments=1 → navigate). Permite cargas
  // parciales múltiples durante un turno en curso sin elegir manualmente.
  const wizardUrlForTurno = useMemo(() => {
    if (!dateKey || !shiftLabel) return wizardUrl
    const params = new URLSearchParams()
    if (plantLineCfg.id !== DEFAULT_PLANT_LINE_ID) params.set('linea', plantLineCfg.id)
    params.set('date', dateKey)
    params.set('shift', shiftLabel)
    return `/analisis-grader/wizard?${params.toString()}`
  }, [wizardUrl, plantLineCfg.id, dateKey, shiftLabel])

  // Plantas con clasificación (Chonchi MS4/12) muestran 12 gates, sugerencias
  // IA Marelec-specific (fotocélula, eye-sync, velocidad cinta), y análisis
  // por gate. Plantas de eviscerado simplificado (Yal) ocultan todo eso —
  // su Excel viene del Marelec pero las "gates" son solo las que alimentan
  // las 3 Baaders y no hay clasificación por calidad.
  const isClassificationPlant = plantLineCfg.isClassificationPlant !== false

  const availableViews = useMemo<TurnoView[]>(
    // Yal no clasifica: sus gates físicas no tienen calibre+calidad y todos
    // los bloques de la pestaña serían tarjetas vacías.
    () => (isClassificationPlant ? [...ALL_TURNO_VIEWS] : ALL_TURNO_VIEWS.filter(v => v !== 'gates')),
    [isClassificationPlant],
  )

  /**
   * Vista activa del detalle.
   *
   * Es estado LOCAL, no `setSearchParams`, por una razón medida: `MainLayout`
   * monta el `<Outlet/>` dentro de un `<Suspense key={location.key}>`, y
   * `location.key` cambia con cualquier navegación — también con una que solo
   * toca el query string. Cambiar la vista vía router remontaba la página
   * entera en cada clic (verificado: 1 → 3 → 5 montajes), lo que rehace todas
   * las lecturas de Firestore y, de paso, dejaba el `chartImageRef` del PDF
   * apuntando a una instancia muerta.
   *
   * Se lee `?vista=` al montar para que un link directo caiga donde toca, y se
   * refleja con `history.replaceState` — actualiza la barra de direcciones sin
   * generar navegación, así que no dispara el remonte.
   *
   * El parámetro se llama `vista` y NO `tab`: `AnalisisGraderGatesConfigPage`
   * (montada dentro de la pestaña Gates) ya usa `?tab=` para sus sub-pestañas.
   */
  const [activeView, setActiveViewState] = useState<TurnoView>(() => {
    const v = searchParams.get('vista')
    return (ALL_TURNO_VIEWS as readonly string[]).includes(v ?? '') ? (v as TurnoView) : 'resumen'
  })

  // Si la planta no ofrece la vista (Yal no tiene Gates), caer a Resumen.
  useEffect(() => {
    if (!availableViews.includes(activeView)) setActiveViewState('resumen')
  }, [availableViews, activeView])

  const setActiveView = useCallback((view: TurnoView) => {
    setActiveViewState(view)
    const url = new URL(window.location.href)
    if (view === 'resumen') url.searchParams.delete('vista')
    else url.searchParams.set('vista', view)
    window.history.replaceState(window.history.state, '', url)
  }, [])

  // Schedule efectivo de la planta — FALLBACK cuando aún no hay datos Shoplogix
  // del turno. La fuente de verdad de horarios son los scheduledStart/End del
  // doc sincronizado (ver realShiftBounds abajo): los horarios los define
  // Shoplogix y CAMBIAN (decisión PR #157).
  const plantSchedule = plantLineCfg.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE

  // Bounds REALES del turno según Shoplogix. Cuando el snapshot trae
  // scheduledStart/End derivados de intervals (scheduleSource='intervals'),
  // mandan sobre el schedule configurado — así el estado live/closed y el
  // progreso reflejan el horario real aunque la planta cambie sus turnos.
  const MIN_VALID_BOUND_MS = 86_400_000  // > epoch+1día = timestamp real
  const realShiftBounds = useMemo(() => {
    for (const x of upstreamLine.snapshot?.machines ?? []) {
      if (x.scheduleSource !== 'intervals') continue
      // El snapshot puede venir de un candidato con otro nombre (mapeo
      // día/noche→Turno 1/2), pero SIEMPRE debe ser del día consultado —
      // descarta snapshots obsoletos del turno anterior en transición de URL.
      if (dateKey && x.dateKey && x.dateKey !== dateKey) continue
      if (!x.scheduledStart || !x.scheduledEnd) continue
      if (x.scheduledStart.getTime() <= MIN_VALID_BOUND_MS) continue
      if (x.scheduledEnd.getTime() <= x.scheduledStart.getTime()) continue
      return { startAt: x.scheduledStart, endAt: x.scheduledEnd }
    }
    return null
  }, [upstreamLine.snapshot, dateKey, MIN_VALID_BOUND_MS])

  /**
   * Ventana REAL del turno: lo que declara Shoplogix (`officialSchedule`, la
   * misma ventana que se ve en su pantalla) unido a lo observado en los
   * intervals, descartando lo que viene recortado por el borde de la consulta
   * del sync. Ver `graderShiftWindow` para el porqué de cada regla.
   *
   * El horario configurado de la planta ya NO compite acá: quedó como último
   * recurso dentro de `computeEffectiveWindow`. Mientras la tabla decía
   * 09:00-17:15 y le ganaba a Shoplogix, el análisis mostraba un turno que
   * llevaba días corriendo 07:15-15:00.
   */
  const resolvedWindow = useMemo(() => resolveShiftWindow({
    declaredStart: upstreamLine.officialRollup?.officialSchedule?.start ?? null,
    declaredEnd: upstreamLine.officialRollup?.officialSchedule?.end ?? null,
    observedStart: realShiftBounds?.startAt ?? null,
    observedEnd: realShiftBounds?.endAt ?? null,
  }), [upstreamLine.officialRollup, realShiftBounds])

  // Ventana efectiva del turno.
  //
  // Con ventana declarada por Shoplogix el fin es el PLANEADO y sirve tal cual
  // para progreso y restante. Sin ella queda el viejo cuidado con los turnos EN
  // CURSO: el fin observado crece con cada sync (se deriva del último interval),
  // así que usarlo crudo marcaría "cerrado" un turno vivo.
  const computeEffectiveWindow = useCallback((): ShiftTimeWindow | null => {
    if (!dateKey || !shiftLabel) return null
    const schedTw = computeShiftTimeWindow(dateKey, shiftLabel, plantSchedule)
    if (!resolvedWindow.start || !resolvedWindow.end) return schedTw

    const bounds = { startAt: resolvedWindow.start, endAt: resolvedWindow.end }

    // El fin viene del whiteboard: es la hora a la que el turno TERMINA, no la
    // del último dato recibido. Se usa directo.
    if (resolvedWindow.origin !== 'observado') {
      return computeShiftTimeWindow(dateKey, shiftLabel, plantSchedule, undefined, bounds)
    }

    const nowMs = nowAsWallClockUTC().getTime()
    const startMs = bounds.startAt.getTime()
    const endMs = bounds.endAt.getTime()
    const SYNC_LAG_MS = 30 * 60_000

    const probablyOngoing = startMs <= nowMs && nowMs <= endMs + SYNC_LAG_MS
    if (probablyOngoing) {
      if (schedTw.status === 'live') return schedTw
      const tw = computeShiftTimeWindow(dateKey, shiftLabel, plantSchedule, undefined, {
        startAt: bounds.startAt,
        endAt: new Date(Math.max(endMs, nowMs)),
      })
      // Fin extendido hasta `now` = fin PLANEADO desconocido → progreso y
      // restante no significan nada (darían 100%/0 todo el turno). elapsed sí vale.
      return endMs < nowMs ? { ...tw, progressPct: null, remainingMin: null } : tw
    }
    return computeShiftTimeWindow(dateKey, shiftLabel, plantSchedule, undefined, bounds)
  }, [dateKey, shiftLabel, plantSchedule, resolvedWindow])

  // Nota: estas llamadas omiten `now` a propósito — el default de
  // computeShiftTimeWindow ya es `nowAsWallClockUTC()`, así la detección de
  // turno vivo es correcta fuera de UTC (no hace falta convertir aquí).
  const [shiftWindow, setShiftWindow] = useState<ShiftTimeWindow | null>(
    () => dateKey && shiftLabel
      ? computeShiftTimeWindow(dateKey, shiftLabel, plantSchedule)
      : null,
  )

  // Sincronizar cuando cambia la URL o llegan los bounds reales de Shoplogix
  useEffect(() => {
    setShiftWindow(computeEffectiveWindow())
  }, [computeEffectiveWindow])

  // Cuota del turno actual — leída del shiftSchedule guardado en Firestore.
  // Editable inline desde la propia ShiftQuotaCard en el detalle del turno.
  // Falla silenciosamente si Firestore no responde — la cuota es opcional.
  const [currentShiftQuota, setCurrentShiftQuota] = useState<GraderShiftSchedule['quota']>(undefined)
  useEffect(() => {
    if (!shiftLabel) {
      setCurrentShiftQuota(undefined)
      return
    }
    let cancelled = false
    getModuleRanges(plantLineCfg.id)
      .then((cfg) => {
        if (cancelled) return
        const normalized = normalizeShiftSchedule(cfg?.shiftSchedule, plantLineCfg.defaultShiftSchedule)
        const entry = normalized.find((s) => s.shiftId === shiftLabel)
        setCurrentShiftQuota(entry?.quota)
      })
      .catch(() => {
        if (!cancelled) setCurrentShiftQuota(undefined)
      })
    return () => { cancelled = true }
  }, [shiftLabel, plantLineCfg.id, plantLineCfg.defaultShiftSchedule])

  const handleSaveShiftQuota = useCallback(async (next: ShiftQuota | null) => {
    if (!shiftLabel || !user) return
    const cfg = await getModuleRanges(plantLineCfg.id)
    const current = normalizeShiftSchedule(cfg?.shiftSchedule, plantLineCfg.defaultShiftSchedule)
    const updated: GraderShiftSchedule[] = current.map((s) => {
      if (s.shiftId !== shiftLabel) return s
      if (next == null) {
        const { quota: _omit, ...rest } = s
        return rest
      }
      return { ...s, quota: next }
    })
    await saveModuleShiftSchedule({ schedule: updated, updatedBy: user.id, plantLineId: plantLineCfg.id })
    setCurrentShiftQuota(next ?? undefined)
  }, [shiftLabel, user, plantLineCfg.id, plantLineCfg.defaultShiftSchedule])

  // P1-2 — Toast al reconectar (false → true)
  useEffect(() => {
    if (!prevIsOnline.current && isOnline) {
      toast({ title: 'Conexión restablecida', description: 'Cambios sincronizados.' })
    }
    prevIsOnline.current = isOnline
  }, [isOnline, toast])

  // Auto-refresh cada minuto si el turno está en vivo.
  // Depende solo de `shiftWindow?.status` para evitar resetear el interval
  // en cada tick (el callback re-lee dateKey/shiftLabel via closure estable).
  useEffect(() => {
    if (shiftWindow?.status !== 'live') return
    const id = setInterval(() => {
      setShiftWindow(computeEffectiveWindow())
    }, 60_000)
    return () => clearInterval(id)
  }, [shiftWindow?.status, computeEffectiveWindow])

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
  // Config inline del turno — override por turno
  const [showConfigPanel, setShowConfigPanel] = useState(false)
  const [calibreOverride, setCalibrerOverride] = useState<CalibreWeightRange[] | null>(null)
  const [turnoThresholdsOverride, setTurnoThresholdsOverride] = useState<{ photocellPctWarn: number; outOfLimitsPctWarn: number; pointZeroPctWarn: number; pointZeroPctCritical: number } | null>(null)

  // ── Shoplogix staleness counter + manual refresh ──────────────────────────
  const [slxSyncing, setSlxSyncing] = useState(false)
  const [slxLastManualSync, setSlxLastManualSync] = useState<Date | null>(null)
  // syncAge usa upstreamLine.syncedAt (Firestore) o el último manual sync si es más reciente
  const slxBestSyncedAt = slxLastManualSync && upstreamLine.syncedAt
    ? (slxLastManualSync > upstreamLine.syncedAt ? slxLastManualSync : upstreamLine.syncedAt)
    : (slxLastManualSync ?? upstreamLine.syncedAt)
  const syncAge = useSyncAge(slxBestSyncedAt)

  // ── Share (token público) — estado; handlers después de enrichedTimelineBuckets ──
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)

  // ── Monitor público en vivo (link/QR para Control de Producción) ──────────
  // Distinto del "Compartir turno" de arriba: aquel congela un snapshot del
  // Grader; este publica el avance del turno y se refresca solo con cada sync.
  const [monitorUrl, setMonitorUrl] = useState<string | null>(null)
  const [monitorToken, setMonitorToken] = useState<string | null>(null)
  const [monitorMode, setMonitorMode] = useState<MonitorMode>('line')
  const [monitorTtl, setMonitorTtl] = useState<MonitorTtlHours>(720)
  const [monitorBusy, setMonitorBusy] = useState(false)
  const [monitorCopied, setMonitorCopied] = useState(false)
  const [monitorError, setMonitorError] = useState<string | null>(null)

  // ── IA (FASE 16) ─────────────────────────────────────────────────────────
  const [aiOutput, setAiOutput] = useState<AIGraderOutput | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [benchmark, setBenchmark] = useState<SeasonBenchmark | null>(null)

  useEffect(() => {
    loadSeasonBenchmark('2025-2026').then(setBenchmark).catch(() => setBenchmark(null))
  }, [])

  useEffect(() => {
    getModuleRanges(plantLineCfg.id).then(cfg => {
      if (cfg?.alertThreshold) setAlertThreshold(cfg.alertThreshold)
      if (cfg?.criticalThreshold) setCriticalThreshold(cfg.criticalThreshold)
    }).catch(() => {})
  }, [plantLineCfg.id])

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

  // Carga shifts del rango ±20 días (Excel) + ±10 días (Shoplogix) para
  // construir UNA cadena cronológica unificada. Esto permite saltar entre
  // turnos del mismo día Y entre días, incluso si los días adyacentes solo
  // tienen Shoplogix (sin Excel cargado) — caso típico Yal.
  //
  // Reglas de merge para evitar duplicar el mismo período:
  //   • Excel "Turno día"   ≡ SLX "Turno 1" + "Turno 2" del mismo día
  //   • Excel "Turno noche" ≡ SLX "Turno 3"             del mismo día
  // Cuando hay Excel para el lado, se omiten sus equivalentes SLX.
  const [adjacentShifts, setAdjacentShifts] = useState<{ prev: { dateKey: string; shiftId: string } | null; next: { dateKey: string; shiftId: string } | null }>({ prev: null, next: null })

  useEffect(() => {
    if (!dateKey || !shiftLabel) return
    let cancelled = false

    const fromDate = new Date(`${dateKey}T12:00:00Z`)
    fromDate.setUTCDate(fromDate.getUTCDate() - 20)
    const toDate = new Date(`${dateKey}T12:00:00Z`)
    toDate.setUTCDate(toDate.getUTCDate() + 20)

    const SLX_NEARBY_DAYS = 10  // ±10 días alrededor del actual para SLX
    const isSlxAware = plantLineCfg.isClassificationPlant === false

    ;(async () => {
      // 1. Excel summaries en ±20 días
      const excelList = await listDailySummariesByRange(
        fromDate.toISOString().slice(0, 10),
        toDate.toISOString().slice(0, 10),
        plantLineCfg.id,
      ).catch(() => [] as Array<{ dateKey: string; shiftId: string }>)
      if (cancelled) return

      // 2. Shoplogix ±10 días en paralelo (solo plantas SLX-aware como Yal).
      // Descubrimiento dinámico: trae CUALQUIER nombre de turno que Shoplogix
      // haya emitido (incl. variantes nuevas tipo "Turno 1 Lunes") con su
      // horario REAL (scheduledStart) y ciclos.
      type SlxNavInfo = { shiftId: string; scheduledStart?: Date | null; totalCycles?: number | null }
      const slxByDay = new Map<string, SlxNavInfo[]>()
      if (isSlxAware) {
        const baseTs = new Date(`${dateKey}T12:00:00Z`).getTime()
        const queries: Array<Promise<{ dk: string; infos: SlxNavInfo[] }>> = []
        for (let d = -SLX_NEARBY_DAYS; d <= SLX_NEARBY_DAYS; d++) {
          const dk = new Date(baseTs + d * 86_400_000).toISOString().slice(0, 10)
          queries.push(
            listShiftInfosForDay(dk, plantLineCfg.plantSlug)
              .then(infos => ({ dk, infos: infos as SlxNavInfo[] }))
              .catch(() => ({ dk, infos: [] as SlxNavInfo[] })),
          )
        }
        const results = await Promise.all(queries)
        if (cancelled) return
        for (const { dk, infos } of results) {
          // "Unscheduled" = producción SIN turno configurado en Shoplogix.
          // Se muestra en el carrusel SOLO si tiene producción significativa
          // (caso real Yal 2026-07-05: 11.6k ciclos nocturnos sin turno) — el
          // Unscheduled vacío/ruido sigue fuera para no saltar a vistas vacías.
          const kept = infos.filter(i => i.shiftId !== 'Unscheduled'
            || (i.totalCycles ?? 0) >= SLX_NOISE_THRESHOLD
            || (dk === dateKey && shiftLabel === 'Unscheduled'))
          slxByDay.set(dk, kept)
        }
      }

      // 3. Posición cronológica dentro del día = minutos del inicio REAL
      //    (scheduledStart de Shoplogix). Para entradas sin horario (Excel,
      //    docs legacy sin doc padre) se estima por nombre con los horarios
      //    vigentes: T3/T1L madrugada 00:00 · día 07:00 · T1 07:45 · T2 14:45.
      //    OJO: post 2026-05 el T3 es la MADRUGADA de su propio dateKey → va
      //    PRIMERO en el día, no al final (antes shiftRank lo ponía último y
      //    las flechas prev/next quedaban invertidas en Yal).
      const fallbackStartMin = (id: string): number => {
        if (/^Turno 3/.test(id)) return 0
        if (id === 'Turno 1 Lunes') return 1
        if (id === 'Turno día') return 7 * 60
        if (/^Turno 1/.test(id)) return 7 * 60 + 45
        if (/^Turno 2/.test(id)) return 14 * 60 + 45
        if (id === 'Turno noche') return 14 * 60 + 46
        if (id === 'Unscheduled') return 24 * 60
        return 12 * 60
      }
      const startMinOf = (e: SlxNavInfo): number =>
        e.scheduledStart
          ? e.scheduledStart.getUTCHours() * 60 + e.scheduledStart.getUTCMinutes()
          : fallbackStartMin(e.shiftId)

      // 4. Agrupar Excel por día
      const excelByDay = new Map<string, string[]>()
      for (const s of excelList) {
        if (!excelByDay.has(s.dateKey)) excelByDay.set(s.dateKey, [])
        excelByDay.get(s.dateKey)!.push(s.shiftId)
      }

      // 5. Merge por día: Excel manda; un turno SLX cuyo inicio real cae
      //    DENTRO de la ventana horaria de un label Excel presente es el
      //    MISMO período → se omite (dedup por solapamiento horario, no por
      //    nombre — los nombres/horarios de Shoplogix cambian). El turno
      //    actualmente abierto nunca se dropea (la cadena debe contenerlo
      //    para que las flechas funcionen).
      const excelWindowOf = (label: string): { start: number; end: number } | null => {
        const entry = plantSchedule.find(p => p.shiftId === label)
        if (!entry) return null
        return {
          start: entry.startHour * 60 + entry.startMinute,
          end: entry.endHour * 60 + entry.endMinute,
        }
      }
      const inWindow = (m: number, w: { start: number; end: number }): boolean => {
        if (w.start === w.end) return false
        return w.start < w.end ? (m >= w.start && m < w.end) : (m >= w.start || m < w.end)
      }

      const allDays = new Set<string>([...excelByDay.keys(), ...slxByDay.keys()])
      const sortedDays = [...allDays].sort()
      const seen = new Set<string>()
      const flat: Array<{ dateKey: string; shiftId: string }> = []

      for (const dk of sortedDays) {
        const excelShifts = excelByDay.get(dk) ?? []
        const excelWindows = excelShifts
          .map(excelWindowOf)
          .filter((w): w is { start: number; end: number } => w !== null)

        const entries: SlxNavInfo[] = excelShifts.map(s => ({ shiftId: s }))
        for (const info of slxByDay.get(dk) ?? []) {
          if (entries.some(e => e.shiftId === info.shiftId)) continue
          const isCurrent = dk === dateKey && info.shiftId === shiftLabel
          if (!isCurrent && excelWindows.length > 0
              && excelWindows.some(w => inWindow(startMinOf(info), w))) {
            continue
          }
          entries.push(info)
        }
        entries.sort((a, b) => startMinOf(a) - startMinOf(b))

        for (const e of entries) {
          const key = `${dk}__${e.shiftId}`
          if (seen.has(key)) continue
          seen.add(key)
          flat.push({ dateKey: dk, shiftId: e.shiftId })
        }
      }

      if (cancelled) return
      const idx = flat.findIndex(e => e.dateKey === dateKey && e.shiftId === shiftLabel)
      setAdjacentShifts(idx === -1
        ? { prev: null, next: null }
        : {
            prev: idx > 0                  ? flat[idx - 1]! : null,
            next: idx < flat.length - 1    ? flat[idx + 1]! : null,
          },
      )
    })().catch(() => {
      if (!cancelled) setAdjacentShifts({ prev: null, next: null })
    })

    return () => { cancelled = true }
  }, [dateKey, shiftLabel, plantLineCfg.id, plantLineCfg.plantSlug, plantLineCfg.isClassificationPlant, plantSchedule])

  const goToShift = useCallback((target: { dateKey: string; shiftId: string }) => {
    // BUGFIX: preservar ?linea= para mantener la planta activa al navegar
    const linea = searchParams.get('linea')
    const qs = linea ? `?linea=${encodeURIComponent(linea)}` : ''
    navigate(`/analisis-grader/turno/${target.dateKey}__${encodeURIComponent(target.shiftId)}${qs}`)
  }, [navigate, searchParams])

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
      getDailySummary(dateKey, shiftLabel, plantLineCfg.id),
      getShiftDoc(dateKey, shiftLabel).catch(() => null),
    ])
      .then(([s, sd]) => {
        if (!s) {
          const win = computeShiftTimeWindow(dateKey, shiftLabel, plantSchedule)
          if (win.status !== 'live') {
            setError(`Turno ${shiftLabel} del ${dateKey} no encontrado en el historial.`)
          }
          // Si es live: summary=null + error=null → renderiza empty-state con CTA de upload
        } else {
          setSummary(s)
        }
        setShiftDoc(sd)
        setCalibrerOverride(sd?.calibreRangeOverride ?? null)
        setTurnoThresholdsOverride(sd?.thresholdsOverride ?? null)
        // Override de umbrales por turno: prioridad sobre los globales de planta
        if (sd?.thresholdsOverride) {
          setAlertThreshold(sd.thresholdsOverride.pointZeroPctWarn)
          setCriticalThreshold(sd.thresholdsOverride.pointZeroPctCritical)
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error al cargar el turno.'))
      .finally(() => setLoading(false))
  }, [dateKey, shiftLabel])

  // Carga timeline sub-collection (graderDailySummaries/{effectiveSummaryId}/meta/timeline)
  useEffect(() => {
    if (!effectiveSummaryId) return
    loadTimelineAggregates(effectiveSummaryId)
      .then(buckets => setTimelineBuckets(buckets ?? []))
      .catch(() => {})
  }, [effectiveSummaryId])

  // Suscripción en tiempo real a `meta/pauses` — M8.
  // onSnapshot propaga cambios de otros admins al instante (sin reload manual).
  // reloadPauses se mantiene como no-op para compatibilidad con la prop
  // onPauseUpdated de ShiftTimelineView.
  const reloadPauses = useCallback(() => {}, [])

  useEffect(() => {
    if (!effectiveSummaryId) return
    setPauses([])
    setMicroDetentions(null)
    const unsub = subscribePausesAggregates(effectiveSummaryId, (data) => {
      if (!data) { setPauses([]); setMicroDetentions(null); return }
      setPauses(data.pauses)
      setMicroDetentions(data.microDetentions)
    })
    return unsub
  }, [effectiveSummaryId])


  // Carga pieceRecords gate=0 para drill-down en timeline
  useEffect(() => {
    if (!effectiveSummaryId) return
    setSelectedCauses(new Set())  // reset al cambiar de turno
    listGate0PieceRecords(effectiveSummaryId)
      .then(setGate0Pieces)
      .catch(() => setGate0Pieces([]))
  }, [effectiveSummaryId])

  // Carga historial de config de gates (FASE 27)
  // Extraído como callback para poder refrescarse tras un nuevo cambio
  const reloadConfigSnapshots = useCallback(() => {
    if (!dateKey || !shiftLabel) return
    listSnapshots(`${dateKey}__${shiftLabel}`)
      .then(setConfigSnapshots)
      .catch(() => setConfigSnapshots([]))
  }, [dateKey, shiftLabel])

  useEffect(() => { reloadConfigSnapshots() }, [reloadConfigSnapshots])

  // Config inline del turno — gates + config derivados.
  // `listSnapshots` viene ordenado ascendente: la config VIGENTE es el último,
  // no el primero (antes se mostraba la config original del turno aunque el
  // supervisor la hubiera editado después).
  const latestConfigSnapshot = useMemo(
    () => (configSnapshots.length > 0 ? configSnapshots[configSnapshots.length - 1] : undefined),
    [configSnapshots],
  )
  const turnoGates = useMemo<GateAssignment[]>(() => latestConfigSnapshot?.gates ?? [], [latestConfigSnapshot])

  // ¿El desglose P0 guardado corresponde a estas gates? El análisis se congela al
  // guardar el turno y editar la config después no lo recalcula.
  const configDrift = useMemo(() => {
    if (!summary || !isClassificationPlant || turnoGates.length === 0) return null
    return detectConfigDrift({
      gatesUsed: summary.gatesUsed,
      currentGates: turnoGates,
      gate0Records: gate0Pieces,
      savedCauses: summary.topP0Causes,
    })
  }, [summary, isClassificationPlant, turnoGates, gate0Pieces])

  // Recálculo automático: si el desglose no corresponde a las gates vigentes y el
  // turno guardó su input de Puerta 0, se reclasifica y se persiste sin pedir nada.
  // Cubre todas las vías de cambio de config (panel inline, modal de cambio rápido,
  // o una edición hecha desde otra sesión) porque depende del resultado, no de
  // interceptar cada botón. Idempotente: al terminar ya no hay desfase, así que no
  // vuelve a dispararse. Los turnos sin input guardado siguen mostrando el aviso.
  const [recomputing, setRecomputing] = useState(false)
  const recomputeAttemptRef = useRef<string | null>(null)

  const runRecompute = useCallback(async () => {
    if (!summary || !effectiveSummaryId || turnoGates.length === 0) return
    setRecomputing(true)
    try {
      const res = await recomputeShiftP0Causes(effectiveSummaryId, turnoGates, summary.pointZeroPieces)
      if (res.ok && res.causes) {
        // Actualiza en memoria lo que acaba de persistirse — evita releer el doc.
        setSummary((prev) => (prev
          ? { ...prev, topP0Causes: res.causes, gatesUsed: turnoGates.filter((g) => g.active) }
          : prev))
      }
    } catch (err) {
      logger.warn('No se pudo recalcular el desglose P0 del turno', { err: String(err) })
    } finally {
      setRecomputing(false)
    }
  }, [summary, effectiveSummaryId, turnoGates])

  useEffect(() => {
    if (!configDrift?.stale || !summary?.gate0RecordsStored || !effectiveSummaryId) return
    // Solo quien puede escribir el turno lo recalcula (firestore.rules exige
    // supervisor). Para el resto queda el aviso, sin intentar una escritura que
    // la regla va a rechazar en cada visita.
    if (!isSupervisor && !isAdmin) return
    // Una sola tentativa por (turno × config): si el recálculo falla o no cierra
    // el desfase, no reintentar en loop.
    const attemptKey = `${effectiveSummaryId}|${JSON.stringify(turnoGates)}`
    if (recomputeAttemptRef.current === attemptKey) return
    recomputeAttemptRef.current = attemptKey
    void runRecompute()
  }, [configDrift?.stale, summary?.gate0RecordsStored, effectiveSummaryId, turnoGates, runRecompute, isSupervisor, isAdmin])

  const turnoConfig = useMemo<GraderAnalysisConfig>(() => ({
    errorThresholds: {
      photocellPctWarn: turnoThresholdsOverride?.photocellPctWarn ?? 1,
      outOfLimitsPctWarn: turnoThresholdsOverride?.outOfLimitsPctWarn ?? 3,
      pointZeroPctWarn: alertThreshold,
      pointZeroPctCritical: criticalThreshold,
    },
  }), [turnoThresholdsOverride, alertThreshold, criticalThreshold])
  const EMPTY_PARSED_DATA = useMemo(() => ({
    files: [], pieceRecords: [], gate0Records: [], folioRecords: [],
    qualitySummary: [], productionSummary: [], inferred: {},
  }), [])
  const handleTurnoConfigApply = useCallback((updatedGates: GateAssignment[]) => {
    if (!user?.id || !dateKey || !shiftLabel) return
    const docId = `${dateKey}__${shiftLabel}`
    const userName = `${(user as unknown as Record<string, string>).nombre ?? ''} ${(user as unknown as Record<string, string>).apellido ?? ''}`.trim() || user.email || 'Supervisor'
    saveConfigSnapshot(docId, updatedGates, { uid: user.id, name: userName })
      .then(() => reloadConfigSnapshots())
      .catch(() => {})
  }, [dateKey, shiftLabel, user, reloadConfigSnapshots])

  // M3 — Siguiente pausa sin clasificar
  const [nextPauseOpen, setNextPauseOpen] = useState(false)

  // Modales lanzados desde ActionPlanPanel (botones "Ejecutar")
  const [planGateModalOpen, setPlanGateModalOpen] = useState(false)
  const [planRpmModalOpen, setPlanRpmModalOpen] = useState(false)

  function handleActionTrigger(trigger: ActionTrigger) {
    if (trigger === 'belt-rpm') setPlanRpmModalOpen(true)
    if (trigger === 'gate-change') setPlanGateModalOpen(true)
  }

  // M17 — Export PDF
  const [pdfExporting, setPdfExporting] = useState(false)
  const chartImageRef = useRef<(() => string | null) | null>(null)

  // El rango del zoom ahora vive en TimelineSyncContext (centralizado),
  // no en este componente. Los hijos lo leen/escriben via useTimelineSync.
  // Aquí solo computamos el rango BASE (full) que el panel usará cuando
  // no hay zoom activo — sirve de fallback cuando context.range es null.
  /**
   * Encuadre del eje temporal.
   *
   *   'auto'       — decide la heurística: acotar solo si la operación ocupa
   *                  menos del 75% del turno (caso Filete: 6 h dentro de 24 h).
   *   'produccion' — el usuario pidió ver solo las horas con proceso.
   *   'turno'      — el usuario pidió ver el turno completo.
   *
   * Antes esto era un booleano "ver turno completo" y el encuadre dependía
   * SIEMPRE de la heurística. Resultado: en las líneas donde la heurística dice
   * que no hace falta acotar (Yal, Chonchi — su turno sí está acotado), el botón
   * no podía forzar el encuadre y no hacía nada. Con el override explícito el
   * control funciona en todas.
   */
  const [framingOverride, setFramingOverride] = useState<FramingOverride>('auto')

  const baseAxisWindow = useMemo<{ startAt: string; endAt: string } | null>(() => {
    if (chartAxisWindow) return chartAxisWindow

    // Si tenemos shiftWindow del schedule de la planta, es la fuente más confiable.
    // Antes priorizábamos los bounds del doc Firestore (machine.scheduledStart/End)
    // pero eso falla cuando la suscripción cae al fallback "Unscheduled" cuyos
    // bounds cubren todo el día (08:00→08:00 = 18h+ de eje vacío para un turno
    // noche real de 23:00-07:45). El schedule define la ventana real del turno.
    if (shiftWindow) return { startAt: shiftWindow.startAt, endAt: shiftWindow.endAt }

    // Sin shiftWindow (turno desconocido) — usar bounds del doc como fallback.
    const slxMachine = upstreamLine.snapshot?.machines[0]
    if (slxMachine?.scheduledStart && slxMachine?.scheduledEnd
        && slxMachine.scheduleSource === 'intervals') {
      return {
        startAt: slxMachine.scheduledStart.toISOString(),
        endAt:   slxMachine.scheduledEnd.toISOString(),
      }
    }

    return null
  }, [chartAxisWindow, shiftWindow, upstreamLine.snapshot])

  /**
   * Ventana efectiva de producción y si conviene encuadrar el eje en ella. Se
   * calcula sobre las MÁQUINAS (no sobre el doc padre) para que valga también
   * cuando el snapshot viene del fallback en vivo.
   */
  const slxProductionWindow = useMemo(
    () => (upstreamLine.snapshot ? effectiveProductionWindow(upstreamLine.snapshot.machines) : null),
    [upstreamLine.snapshot],
  )
  const framedOnProduction = useMemo(() => {
    const sw = baseAxisWindow
      ? { start: new Date(baseAxisWindow.startAt), end: new Date(baseAxisWindow.endAt) }
      : null
    return resolveFraming({
      override: framingOverride,
      hasProductionWindow: slxProductionWindow != null,
      autoDecision: shouldFrameOnProduction(sw, slxProductionWindow),
    })
  }, [framingOverride, slxProductionWindow, baseAxisWindow])

  /**
   * Eje que reciben el Gantt y el gráfico de tasa. Es el MISMO para los dos: van
   * sincronizados (hover y zoom cruzados), así que acotar solo uno los
   * desalinearía. Se agregan 10 min de margen a cada lado para que el primer y
   * el último tramo no queden pegados al borde.
   */
  const axisWindow = useMemo<{ startAt: string; endAt: string } | null>(() => {
    if (!framedOnProduction || !slxProductionWindow) return baseAxisWindow
    const PAD_MS = 10 * 60_000
    return {
      startAt: new Date(slxProductionWindow.start.getTime() - PAD_MS).toISOString(),
      endAt:   new Date(slxProductionWindow.end.getTime() + PAD_MS).toISOString(),
    }
  }, [framedOnProduction, slxProductionWindow, baseAxisWindow])
  const toDateOrNull = (v: string | Date | null | undefined): Date | null => {
    if (!v) return null
    const d = v instanceof Date ? v : new Date(v)
    return isNaN(d.getTime()) ? null : d
  }

  /**
   * Resumen ejecutivo como PNG — el archivo que se manda por Telegram y se
   * entiende sin abrir nada.
   *
   * Usa el MISMO modelo que la pagina 1 del PDF (`buildExecutiveSummary`), asi
   * que ambos cuentan lo mismo del turno. A diferencia del PDF, no necesita el
   * grafico de ECharts: se dibuja entero en canvas, por eso no hay que esperar
   * a que ninguna pestana renderice.
   */
  const handleExportPng = useCallback(() => {
    if (!summary) return
    const reliability = computeMaintenanceReliability([summary], [{ summary, pauses }])
    const executive = buildExecutiveSummary({
      summary,
      upstream: upstreamLine.snapshot,
      shiftLabel: displayShiftName(summary.shiftId),
      // `shiftWindow` trae ISO strings; el resumen espera Date. La ventana del
      // turno manda sobre la del Excel: es la real de Shoplogix.
      start: toDateOrNull(shiftWindow?.startAt ?? summary.startAt),
      end:   toDateOrNull(shiftWindow?.endAt   ?? summary.endAt),
      reliability: {
        mttrMacroSec: reliability.mttrMacroSec,
        mtbfSec:      reliability.mtbfSec,
        macroCount:   reliability.eventsCount,
        microCount:   reliability.microCount,
        microSec:     reliability.microSec,
      },
      uptimePct: upstreamLine.snapshot ? upstreamLine.snapshot.lineAvailability * 100 : null,
    })
    exportExecutiveSummaryPng({
      summary: executive,
      filenameSuffix: `${summary.dateKey}_${displayShiftName(summary.shiftId).replace(/\s+/g, '-')}`,
    })
  }, [summary, pauses, upstreamLine.snapshot, shiftWindow])

  const handleExportPdf = useCallback(async () => {
    if (!summary || pdfExporting) return
    setPdfExporting(true)
    const viewBefore = activeView
    try {
      /*
       * El gráfico del PDF lo publica ShiftTimelineView en `chartImageRef` — y
       * lo borra al desmontarse. Con el detalle en pestañas, pedir el PDF desde
       * Resumen dejaba el ref en null y el PDF salía sin timeline, en silencio.
       * Saltamos un instante a la vista Timeline para montarlo.
       *
       * Ojo con la condición de espera: el ref se registra en el PRIMER render
       * de ShiftTimelineView, cuando ECharts todavía no tiene instancia y
       * getDataURL devuelve null. Esperar "a que el ref exista" daba por listo
       * un gráfico sin pintar → PDF de 32 KB sin imagen. Hay que sondear el
       * dataURL real hasta que venga con contenido.
       */
      let chartImageDataUrl = chartImageRef.current?.() ?? null
      if (!isRenderedChart(chartImageDataUrl)) {
        setActiveView('timeline')
        await waitUntil(() => {
          chartImageDataUrl = chartImageRef.current?.() ?? null
          return isRenderedChart(chartImageDataUrl)
        }, 6000)
      }
      if (!isRenderedChart(chartImageDataUrl)) {
        logger.warn('M17: PDF sin gráfico — el timeline no alcanzó a renderizar')
        chartImageDataUrl = null
      }
      await exportTurnToPDF({ summary, pauses, tagLabels, chartImageDataUrl, upstreamSnapshot: upstreamLine.snapshot })
    } catch (err) {
      logger.error('M17: PDF export error', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setPdfExporting(false)
      if (viewBefore !== 'timeline') setActiveView(viewBefore)
    }
  }, [summary, pauses, pdfExporting, tagLabels, upstreamLine.snapshot, activeView, setActiveView])

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

  /**
   * Sugerencias específicas para plantas sin clasificación (Yal). Las reglas
   * de Chonchi (limpiar fotocélula, ajustar eye-sync, cambiar gates) no
   * aplican porque Yal solo eviscera. Aquí se generan acciones basadas en
   * peso bajo, proximidad, throughput y uptime Baader.
   */
  const yalSuggestions = useMemo(() => {
    if (isClassificationPlant) return []
    if (!summary) return []
    // Duración productiva: preferir `durationMinutes` (calculado por el
    // segmenter desde minutos activos reales — misma fuente que el card de
    // KPIs del hero). Fallback a productionWindow si no estuviera.
    let shiftMinutes = summary.durationMinutes ?? 0
    if (shiftMinutes === 0) {
      const productionWindow = computeProductionWindow(enrichedTimelineBuckets)
      if (productionWindow) {
        shiftMinutes = (productionWindow.endMs - productionWindow.startMs) / 60_000
      } else if (shiftWindow) {
        shiftMinutes = (Date.parse(shiftWindow.endAt) - Date.parse(shiftWindow.startAt)) / 60_000
      }
    }
    return deriveYalSuggestions({
      p0Pct: summary.pointZeroPct ?? 0,
      totalPieces: summary.totalPieces ?? 0,
      byMatrixCause,
      shiftMinutes,
      upstreamSnapshot: upstreamLine.snapshot,
    })
  }, [isClassificationPlant, summary, byMatrixCause, enrichedTimelineBuckets, shiftWindow, upstreamLine.snapshot])

  const triggeredRunbooks = useMemo(
    () => findTriggeredRunbooks(dominant, summary?.pointZeroPct ?? 0),
    [dominant, summary],
  )

  const shiftDocId = `${dateKey}__${shiftLabel}`

  // Fecha legible para el header ("vie 27 feb")
  // IMPORTANTE: todos los hooks ANTES del early return (rules-of-hooks)
  // Usa getShiftDisplayDateKey para alinear con la convención calendárica de
  // Shoplogix (Turno 3 → display = dateKey CF + 1 día).
  const dateLabel = useMemo(() => {
    if (!dateKey) return ''
    const displayKey = getShiftDisplayDateKey(dateKey, shiftLabel)
    const d = new Date(`${displayKey}T12:00:00`)
    const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')
    const dayNum = d.getDate()
    const monthName = d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
    return `${dayName} ${dayNum} ${monthName}`
  }, [dateKey, shiftLabel])

  // Metadata canónica del turno (label, shortLabel, ícono, color, schedule).
  // Single source of truth — todos los componentes que muestren este turno
  // deben usar getShiftMeta para evitar mezclar denominaciones.
  // Se pasa el horario REAL (summary/shiftWindow) para que el período/ícono se
  // deriven de la HORA y no del nombre — Shoplogix reusa "Turno 1" para la
  // madrugada de Yal, que sin esto se pintaba "mañana ☀" siendo 00:00–06:45.
  const shiftMeta = useMemo(
    () => getShiftMeta(shiftLabel ?? '', summary?.startAt ?? shiftWindow?.startAt),
    [shiftLabel, summary?.startAt, shiftWindow?.startAt],
  )

  // Horario start–end real del turno (HH:mm → HH:mm). Fuente preferida:
  //   1. summary.startAt / endAt (cuando hay Excel cargado)
  //   2. shiftWindow del schedule de la planta (sin Excel)
  //   3. shiftMeta.scheduleHint (fallback estático "07:45–14:45" según T1/T2/T3)
  const shiftScheduleInfo = useMemo<{
    startTime: string
    endTime: string
  } | null>(() => {
    const startIso = summary?.startAt ?? shiftWindow?.startAt
    const endIso = summary?.endAt ?? shiftWindow?.endAt
    if (startIso && endIso) {
      return { startTime: startIso.slice(11, 16), endTime: endIso.slice(11, 16) }
    }
    // Fallback al hint del shiftMeta (07:45–14:45 etc) parseado
    if (shiftMeta.scheduleHint) {
      const [s, e] = shiftMeta.scheduleHint.split('–')
      if (s && e) return { startTime: s, endTime: e }
    }
    return null
  }, [summary?.startAt, summary?.endAt, shiftWindow?.startAt, shiftWindow?.endAt, shiftMeta.scheduleHint])

  // Ícono lucide según el período del shift (resuelto por getShiftMeta).
  const ShiftPeriodIcon = useMemo(() => {
    switch (shiftMeta.iconName) {
      case 'Sun':     return Sun
      case 'Sunset':  return Sunset
      case 'Moon':    return Moon
      case 'Sunrise': return Sunrise
      default:        return null
    }
  }, [shiftMeta.iconName])

  // ── Shoplogix manual refresh ─────────────────────────────────────────────
  const handleSlxRefresh = useCallback(async () => {
    if (slxSyncing) return
    setSlxSyncing(true)
    try {
      const { httpsCallable, getFunctions } = await import('firebase/functions')
      const functions = getFunctions((await import('@/services/firebase')).default)
      const syncNow = httpsCallable(functions, 'shoplogixSyncNow')
      await syncNow({
        dateKey:   dateKey   || undefined,
        shiftId:   shiftLabel || undefined,
        plantSlug: plantLineCfg.plantSlug,
      })
      setSlxLastManualSync(new Date())
      // El onSnapshot de useUpstreamLineSnapshot actualiza el snapshot automáticamente
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({ title: 'Sin datos Shoplogix', description: msg, variant: 'destructive' })
    } finally {
      setSlxSyncing(false)
    }
  }, [slxSyncing, dateKey, shiftLabel, plantLineCfg.plantSlug, toast])

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
      setShareToken(token)
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

  // ── Monitor público en vivo ───────────────────────────────────────────────
  // Se manda el dateKey/shiftId del snapshot GANADOR, no los de la URL: el
  // Grader etiqueta "Turno día" y Shoplogix puede haber escrito "Turno 2".
  // Con la etiqueta de la URL el backend buscaría un doc que no existe.
  const handleCreateMonitor = useCallback(async () => {
    const slx = upstreamLine.snapshot
    if (!slx || upstreamLine.source !== 'firestore') return
    setMonitorBusy(true)
    setMonitorError(null)
    try {
      const { token } = await createPublicShiftMonitor({
        mode:            monitorMode,
        plantSlug:       plantLineCfg.plantSlug,
        // En modo línea el backend ignora estos dos y resuelve el turno vigente.
        dateKey:         slx.dateKey,
        shiftId:         slx.shiftId,
        plantLineId:     plantLineCfg.id,
        areaLabel:       plantLineCfg.areaLabel,
        lineLabel:       plantLineCfg.label,
        machineKindLong: plantLineCfg.machineKind?.long,
        targetPieces:    plantLineCfg.shiftTargetPieces,
        ttlHours:        monitorTtl,
      })
      const base = `${window.location.origin}${import.meta.env.BASE_URL}`
      setMonitorToken(token)
      setMonitorUrl(`${base}monitor/${token}`)
    } catch (err) {
      setMonitorError(err instanceof Error ? err.message : 'No se pudo generar el link')
    } finally {
      setMonitorBusy(false)
    }
  }, [upstreamLine.snapshot, upstreamLine.source, plantLineCfg, monitorTtl, monitorMode])

  const handleRevokeMonitor = useCallback(async () => {
    if (!monitorToken) return
    setMonitorBusy(true)
    try {
      await revokePublicShiftMonitor(monitorToken)
    } catch { /* si falla la red igual se limpia la UI: el link vence solo */ }
    setMonitorToken(null)
    setMonitorUrl(null)
    setMonitorCopied(false)
    setMonitorBusy(false)
  }, [monitorToken])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  // groupId único por turno: garantiza que múltiples instancias del provider
  // (ej. al cambiar de turno con HMR) no se mezclen en el registro global
  // de echarts.connect.
  const timelineGroupId = `timeline-${shiftDocId || 'default'}`

  return (
    <TimelineSyncProvider key={shiftDocId ?? 'default'} groupId={timelineGroupId}>
    <div className="container mx-auto p-3 sm:p-4 space-y-4 max-w-screen-xl">
      {/* M18 — Banner offline */}
      {!isOnline && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-ctl bg-amber-500/[0.15] border border-amber-500/[0.25] text-amber-400 text-sm">
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-x-2 gap-y-0 min-w-0 flex-1">
              {/* Mobile: stack vertical (fecha primero, turno+horario+ícono debajo).
                  Desktop: una línea con separador y todos los elementos inline. */}
              <span className="text-sm text-muted-foreground truncate order-1 sm:order-3 font-medium sm:font-normal text-foreground sm:text-muted-foreground">
                {dateLabel}
              </span>
              <span className="text-sm text-muted-foreground hidden sm:inline order-2">·</span>
              <div className="flex items-center gap-1.5 order-2 sm:order-1 min-w-0 flex-wrap">
                {ShiftPeriodIcon && (
                  <ShiftPeriodIcon
                    className={`w-3.5 h-3.5 shrink-0 ${shiftMeta.textColorClass}`}
                    aria-label={shiftMeta.period}
                  />
                )}
                <span className="text-sm font-medium shrink-0" title={shiftMeta.label}>
                  {shiftMeta.label}
                </span>
                {shiftScheduleInfo && (
                  <span
                    className="text-caption tabular-nums text-muted-foreground shrink-0"
                    title={`Horario del turno: ${shiftScheduleInfo.startTime} → ${shiftScheduleInfo.endTime} (${shiftMeta.period})`}
                  >
                    {shiftScheduleInfo.startTime}–{shiftScheduleInfo.endTime}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 order-3 sm:order-4 shrink-0">
                {summary?.turnoLabel && (
                  <Badge
                    variant="outline"
                    className="text-caption px-1.5 py-0 shrink-0 border-cat-6-tint/[0.25] text-cat-6-ink"
                    title="Turno de producción (columna Turno del Excel)"
                  >
                    Turno {summary.turnoLabel}
                  </Badge>
                )}
                {shiftWindow && (
                  <Badge
                    variant="outline"
                    className={`text-caption px-1.5 py-0 shrink-0 ${
                      shiftWindow.status === 'live'
                        ? 'border-red-500/[0.25] text-red-400'
                        : 'border-muted-foreground/30 text-muted-foreground'
                    }`}
                  >
                    {shiftWindow.status === 'live' ? 'EN VIVO' : 'CERRADO'}
                  </Badge>
                )}
              </div>
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
              className="gap-1.5 text-ink-warn border-amber-500/[0.25] hover:bg-amber-500/[0.15]"
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
          {/* Resumen ejecutivo como imagen — para mandar por Telegram sin
              que el receptor tenga que abrir un PDF de varias paginas. */}
          {summary && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPng}
              title="Descargar resumen ejecutivo del turno (PNG)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
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
            title={adjacentShifts.prev
              ? `Turno anterior (←) · ${adjacentShifts.prev.dateKey === dateKey
                  ? `mismo día · ${adjacentShifts.prev.shiftId}`
                  : `${adjacentShifts.prev.dateKey} · ${adjacentShifts.prev.shiftId}`}`
              : 'Sin turno anterior'}
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
            title={adjacentShifts.next
              ? `Turno siguiente (→) · ${adjacentShifts.next.dateKey === dateKey
                  ? `mismo día · ${adjacentShifts.next.shiftId}`
                  : `${adjacentShifts.next.dateKey} · ${adjacentShifts.next.shiftId}`}`
              : 'Sin turno siguiente'}
          >
            <span className="hidden md:inline text-xs">Siguiente</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Todos los tiempos del turno en UNA línea etiquetada.
          Reemplaza al banner "Turno de madrugada…", al rango repetido en el
          encabezado de la tarjeta y a los "131 min" sueltos: eran seis medidas
          de tiempo repartidas por la pantalla, sin decir contra qué se medía
          cada una — y dos de ellas casi iguales con números distintos. */}
      <TurnoTiemposLine
        programadoStart={shiftWindow?.startAt}
        programadoEnd={shiftWindow?.endAt}
        produjoStart={summary?.startAt}
        produjoEnd={summary?.endAt}
        minutosActivos={summary?.durationMinutes ?? null}
      />

      {/* Dos avisos distintos sobre la ventana: minutos de arranque SIN datos
          (problema: el total del turno está incompleto) y arranque anticipado
          real (información: produjo antes de lo declarado, y está contado). */}
      <TurnoVentanaAviso
        missingHeadMin={resolvedWindow.missingHeadMin}
        earlyStartMin={resolvedWindow.earlyStartMin}
        realStart={resolvedWindow.start}
        dataStart={realShiftBounds?.startAt ?? null}
        className="mx-1"
      />

      {/* Chip rollup oficial de Shoplogix (horario/especie/% target) — solo
          existe para el turno VIGENTE, degrada a nada en históricos. */}
      {upstreamLine.officialRollup && (
        <TurnoOficialChip
          rollup={upstreamLine.officialRollup}
          machines={upstreamLine.snapshot?.machines.map(m => ({
            machineid: m.machineid,
            totalCycles: m.totalCycles ?? 0,
          })) ?? []}
          className="mx-1"
        />
      )}

      {/* Los tiempos del DÍA completo (todos sus turnos) se movieron al landing,
          junto al board de KPIs que ya usa el día como unidad: acá sumaban las
          horas de todos los turnos contra un turno de 8 h y convivían dos
          escalas distintas en la misma pantalla. */}

      {/* Estados */}
      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground">
          <Spinner className="w-5 h-5" />
          Cargando turno…
        </div>
      )}

      {/* Error real: turno no encontrado y sin datos Shoplogix disponibles */}
      {error && !upstreamLine.loading && !upstreamLine.snapshot && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex items-center gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Vista Shoplogix-only: sin Excel Grader pero con datos de máquinas (Yal u otras líneas) */}
      {!summary && !loading && upstreamLine.snapshot && (
        <div className="space-y-4">
          {/* Scorecard principal — mismo patrón visual que HeroScorecard */}
          <ShoplogixOnlyScorecard
            snapshot={upstreamLine.snapshot}
            plannedTargetPieces={plantLineCfg.shiftTargetPieces}
            shiftWindow={shiftWindow}
            shiftLabel={shiftLabel}
            dateKey={dateKey}
          />

          {/* Banner informativo con acción de carga + refresh.
              Mobile: texto en línea propia (basis-full) para evitar comprimirse
              en una columna vertical de 1 palabra cuando los botones le roban
              ancho. Desktop: una sola línea con todos los elementos. */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-ctl bg-primary/[0.15] border border-primary/[0.25] text-primary text-sm">
            <div className="flex items-center gap-2 basis-full sm:basis-auto sm:flex-1 min-w-0">
              <Activity className="w-4 h-4 shrink-0" />
              <span className="flex-1 min-w-0">
                {shiftWindow?.status === 'live'
                  ? 'Turno en curso · Sin datos Grader aún — vista basada en Shoplogix'
                  : 'Sin Excel del Grader · mostrando datos Shoplogix'}
              </span>
            </div>

            {/* Contador de tiempo desde último sync */}
            {slxBestSyncedAt && (
              <span className={`flex items-center gap-1 text-caption font-medium tabular-nums shrink-0 px-2 py-0.5 rounded-full border ${syncAge.colorClass} ${syncAge.bgClass} border-current/20`}>
                <span className={`w-1.5 h-1.5 rounded-full ${syncAge.isStale ? 'bg-red-400 animate-pulse' : 'bg-current'}`} />
                {slxSyncing ? 'sincronizando…' : syncAge.label}
              </span>
            )}

            {/* Botón actualizar ahora */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-primary/[0.25] text-primary hover:bg-primary/[0.15] shrink-0"
              onClick={handleSlxRefresh}
              disabled={slxSyncing}
              title={`Último sync: ${slxBestSyncedAt?.toLocaleTimeString('es-CL') ?? 'nunca'}`}
            >
              <RefreshCw className={`w-3 h-3 mr-1.5 ${slxSyncing ? 'animate-spin' : ''}`} />
              {slxSyncing ? 'Actualizando…' : 'Actualizar ahora'}
            </Button>

            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-primary/[0.25] text-primary hover:bg-primary/[0.15] shrink-0"
                onClick={() => navigate(wizardUrl)}
              >
                <Upload className="w-3 h-3 mr-1.5" />
                Cargar Excel
              </Button>
            )}
          </div>

          {/* Panel de máquinas con timeline y Gantts */}
          <UpstreamMachinesPanel
            snapshot={upstreamLine.snapshot}
            loading={upstreamLine.loading}
            error={upstreamLine.error}
            syncedAt={upstreamLine.syncedAt}
            shiftWindow={axisWindow}
            pauses={[]}
            plantSlug={plantLineCfg.plantSlug}
            dataSource={upstreamLine.source}
            // Esta rama se renderiza SIN Excel del Grader: no hay total con el
            // que descontar la línea manual, así que la cascada informa la
            // pérdida bruta.
            graderTotalPieces={null}
            framedOnProduction={framedOnProduction}
            onToggleFraming={slxProductionWindow ? () => setFramingOverride(framedOnProduction ? 'turno' : 'produccion') : undefined}
          />

          {/* Causa de cada paro que el sensor midió: el "por qué" no lo trae
              Shoplogix. Se monta junto al panel de máquinas para que el paro y
              su explicación se vean en el mismo lugar. */}
          {upstreamLine.snapshot && (
            <SensorStopsCausePanel
              snapshot={upstreamLine.snapshot}
              plantLineId={plantLineCfg.id}
              plantSlug={plantLineCfg.plantSlug}
              dateKey={upstreamLine.snapshot.dateKey || dateKey}
              shiftId={upstreamLine.snapshot.shiftId}
            />
          )}
        </div>
      )}

      {/* Turno en vivo sin datos Grader NI Shoplogix */}
      {!loading && !summary && shiftWindow?.status === 'live' && !upstreamLine.snapshot && !upstreamLine.loading && (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <Activity className="w-8 h-8 text-red-400 animate-pulse" />
            <p className="font-medium">Turno en curso — sin datos cargados aún</p>
            <p className="text-sm text-muted-foreground">
              Cargá el primer Excel de Matrix para ver el estado del proceso.
            </p>
            <Button onClick={() => navigate(wizardUrl)} className="gap-2 mt-1">
              <Upload className="w-4 h-4" />
              Cargar Excel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Turno sin datos — estado "listo para recibir data"
          Aparece cuando: no hay summary (sin Excel Grader), no hay datos SLX reales,
          y el turno NO está live (ese caso ya tiene su propio card arriba).
          Comunica claramente los 3 canales de ingreso de datos. */}
      {!loading && !summary && !upstreamLine.loading
        && shiftWindow?.status !== 'live'
        && upstreamLine.source !== 'firestore' && (
        <Card className="border-muted-foreground/[0.10]">
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">
              Sin datos registrados para este turno
            </p>

            {/* Shoplogix — automático */}
            <div className="flex items-start gap-3 p-3 rounded-card bg-cat-6-tint/[0.15] border border-cat-6-tint/[0.25] dark:bg-cat-6-tint/[0.15] dark:border-cat-6-tint/[0.25]">
              <Zap className="w-4 h-4 text-cat-6-ink mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cat-6-ink">Shoplogix — Evisceradoras Baader 142</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Se sincroniza automáticamente cada 5 min cuando las máquinas están en operación.
                  No requiere acción manual.
                </p>
              </div>
              <Badge variant="outline" className="text-caption border-cat-6-tint/[0.25] text-cat-6-ink shrink-0 mt-0.5">
                automático
              </Badge>
            </div>

            {/* Grader — manual */}
            <div className="flex items-start gap-3 p-3 rounded-card bg-primary/[0.15] border border-primary/[0.25]">
              <Upload className="w-4 h-4 text-ink-info mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary">Grader Matrix — Informe de turno</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Exportar Excel de Matrix al cierre del turno y cargarlo para ver P0%, causas y timeline.
                </p>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-primary/[0.25] text-ink-info hover:bg-blue-500/[0.15] shrink-0 mt-0.5"
                  onClick={() => navigate(wizardUrl)}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Cargar Excel
                </Button>
              )}
            </div>

            {/* Marel HG (corta-cabeza) — solo Chonchi. Yal no tiene
                corta-cabeza, los salmones salen evisecerados con cabeza. */}
            {isClassificationPlant && (
              <div className="flex items-start gap-3 p-3 rounded-card bg-amber-500/[0.15] border border-amber-500/[0.25] dark:bg-amber-500/[0.15] dark:border-amber-500/[0.25]">
                <Scale className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-warn">Marel HG — Corta-cabeza</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ingreso manual de captura de la pantalla Marel. Disponible al cargar el Excel Grader.
                  </p>
                </div>
                <Badge variant="outline" className="text-caption border-amber-500/[0.25] text-amber-400 shrink-0 mt-0.5">
                  requiere Grader
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contenido principal
          Mobile (stack vertical): Scorecard → Acciones → Causas (acciones arriba del todo)
          Desktop (grid 3-col 2 filas): Scorecard + Causas izq (2 cols apilados), Acciones der (col 3 × 2 filas) */}
      {summary && shiftWindow && (
        <>
          <TurnoViewTabs
            views={availableViews}
            active={activeView}
            onChange={setActiveView}
            gatesBadge={configSnapshots.length}
          />

          {/* ════════ RESUMEN ════════ */}
          {activeView === 'resumen' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Scorecard + Marel HG capture — mobile row 1 */}
            <div className="lg:col-span-2 lg:row-start-1 space-y-4">
              <HeroScorecard
                summary={summary}
                shiftWindow={shiftWindow}
                upstreamSnapshot={upstreamLine.snapshot}
                upstreamSyncedAt={upstreamLine.syncedAt}
              />
              {/* Zona 2 del orden: qué tan completo está el dato. Va acá
                  arriba y no enterrada sobre el timeline porque condiciona
                  cómo leer todo lo que viene después — si el Excel cubre el
                  44% del turno, el resto de la pantalla se lee distinto. */}
              <GraderCoverageBar
                shiftStartAt={shiftWindow?.startAt ?? summary.startAt}
                shiftEndAt={shiftWindow?.endAt ?? summary.endAt}
                produccionReal={slxProductionWindow}
                buckets={enrichedTimelineBuckets}
              />
              <ShiftQuotaCard
                quota={currentShiftQuota}
                summary={summary}
                shiftWindow={shiftWindow}
                shoplogixCycles={upstreamLine.snapshot?.machines.reduce((s, m) => s + (m.totalCycles ?? 0), 0) ?? null}
                allowEdit={isAdmin || isSupervisor}
                onSave={handleSaveShiftQuota}
              />
            </div>

            {/* Acciones — mobile row 2 (protagonismo), desktop derecha full-height.
                Chonchi: deriveSuggestions con reglas Marelec MS4/12 (fotocélula,
                eye-sync, gates). Yal: deriveYalSuggestions con reglas eviscerado
                (peso bajo, proximidad, throughput Baader, uptime upstream). */}
            <div className="lg:col-start-3 lg:row-span-2 space-y-4" data-no-swipe>
              {isClassificationPlant && (
                <ActionPlanPanel
                  shiftDocId={shiftDocId}
                  suggestions={suggestions}
                  status={shiftWindow.status}
                  relatedRunbooks={triggeredRunbooks}
                  onActionTrigger={handleActionTrigger}
                />
              )}
              {!isClassificationPlant && (
                <ActionPlanPanel
                  shiftDocId={shiftDocId}
                  suggestions={yalSuggestions}
                  status={shiftWindow.status}
                  rulesDescriptor="Reglas: P0 vs típico Yal · peso bajo · proximidad · throughput vs target Baader · uptime upstream"
                />
              )}

              {/* Modales lanzados desde ActionPlanPanel */}
              <GateChangeModal
                open={planGateModalOpen}
                onOpenChange={setPlanGateModalOpen}
                shiftDocId={shiftDocId}
                configSnapshots={configSnapshots}
                onSaved={() => { setPlanGateModalOpen(false); void reloadConfigSnapshots() }}
                plantLineId={plantLineCfg.id}
              />
              <BeltRpmModal
                open={planRpmModalOpen}
                onOpenChange={setPlanRpmModalOpen}
                shiftDocId={shiftDocId}
                shiftDoc={shiftDoc}
                plantLineId={plantLineCfg.id}
              />
            </div>

            {/* Causas — mobile row 3 (contexto), desktop izquierda abajo */}
            <div className="lg:col-span-2 lg:row-start-2 space-y-3">
              {configDrift && (
                <ConfigDriftBanner
                  drift={configDrift}
                  analyzedAt={summary.updatedAt}
                  lastConfigChangeAt={latestConfigSnapshot?.at}
                  lastConfigChangeBy={latestConfigSnapshot?.changedBy?.name}
                  recomputing={recomputing}
                />
              )}
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
                isClassificationPlant={isClassificationPlant}
              />
            </div>
          </div>
          )}

          {/* ════════ GATES ════════
              Los seis bloques de compuertas quedan juntos y en orden narrativo:
              config vigente → distribución → impacto del cambio → evolución →
              historial → ajustes del turno. Antes estaban repartidos a lo largo
              de toda la página, separados por diez bloques de otra cosa. */}
          {activeView === 'gates' && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-ctl bg-primary/[0.15] border border-primary/[0.25] text-sm">
              <Globe2 className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
              <p className="text-muted-foreground flex-1">
                Acá se ajusta <span className="font-medium text-foreground">este turno</span>. La
                línea física, los umbrales base y los rangos de calibre valen para todos los turnos
                y se editan en{' '}
                <button
                  onClick={() => navigate(`/analisis-grader/config?linea=${plantLineCfg.id}`)}
                  className="font-medium text-primary underline underline-offset-2 hover:text-ink-info"
                >
                  Configuración del Grader
                </button>.
              </p>
            </div>
          )}

          {/* Config de gates vigente en el turno. Solo en plantas que clasifican
              (Chonchi). Yal no clasifica → las gates del Excel son solo las que
              alimentan las 3 Baaders. */}
          {activeView === 'gates' && isClassificationPlant && configSnapshots.length > 0 && (
            <ShiftConfigPanel
              shiftDocId={shiftDocId}
              shiftDoc={shiftDoc}
              configSnapshots={configSnapshots}
              onSaved={reloadConfigSnapshots}
              allowEdit={shiftWindow?.status === 'live'}
              summary={summary}
              plantLineId={plantLineCfg.id}
            />
          )}

          {/* ════════ TIMELINE ════════ */}
          {activeView === 'timeline' && (
          <ShiftTimelineView
            timelineBuckets={enrichedTimelineBuckets}
            shiftDoc={shiftDoc}
            shiftWindow={shiftWindow}
            configSnapshots={configSnapshots}
            gate0Pieces={gate0Pieces}
            pauses={pauses}
            microDetentions={microDetentions}
            summaryId={effectiveSummaryId}
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
            onUploadClick={isAdmin ? () => navigate(wizardUrlForTurno) : undefined}
          />
          )}

          {/* Dispersión segundo a segundo de piezas P0 (drill-down del timeline) */}
          {activeView === 'timeline' && gate0Pieces.length >= 5 && (
            <PieceScatterChart gate0Pieces={gate0Pieces} />
          )}

          {/* ════════ LÍNEA (upstream Shoplogix) ════════
              Evisceradoras Baader 142: lo que alimenta al Grader. Junto con su
              correlación contra las pausas del Grader y el scatter. */}
          {/* Barra Shoplogix: contador de staleness + botón refresh */}
          {activeView === 'linea' && (upstreamLine.snapshot || upstreamLine.loading) && (
            <div className="flex items-center justify-between gap-2 -mb-1 px-1">
              <span
                className="text-caption text-muted-foreground cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4"
                title="Línea upstream = el proceso aguas arriba del Grader. En esta planta son las 3 Baader 142 (Evisceradoras) que reciben los salmones, los evisceran y los pasan al Grader. Su uptime / paros afectan directamente al throughput del Grader."
              >
                Línea upstream · Baader 142
              </span>
              <div className="flex items-center gap-2">
                {slxBestSyncedAt && (
                  <span className={`flex items-center gap-1 text-caption font-medium tabular-nums px-2 py-0.5 rounded-full border ${syncAge.colorClass} ${syncAge.bgClass} border-current/20`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${syncAge.isStale ? 'bg-red-400 animate-pulse' : 'bg-current'}`} />
                    {slxSyncing ? 'sincronizando…' : syncAge.label}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-caption text-muted-foreground hover:text-ink-info px-2"
                  onClick={handleSlxRefresh}
                  disabled={slxSyncing}
                  title={`Último sync: ${slxBestSyncedAt?.toLocaleTimeString('es-CL') ?? 'nunca'}`}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${slxSyncing ? 'animate-spin' : ''}`} />
                  {slxSyncing ? 'Actualizando…' : 'Actualizar'}
                </Button>
              </div>
            </div>
          )}
          {activeView === 'linea' && (<>
          <UpstreamMachinesPanel
            snapshot={upstreamLine.snapshot}
            loading={upstreamLine.loading}
            error={upstreamLine.error}
            syncedAt={upstreamLine.syncedAt}
            shiftWindow={axisWindow}
            pauses={pauses}
            plantSlug={plantLineCfg.plantSlug}
            dataSource={upstreamLine.source}
            graderTotalPieces={summary?.totalPieces ?? null}
            framedOnProduction={framedOnProduction}
            onToggleFraming={slxProductionWindow ? () => setFramingOverride(framedOnProduction ? 'turno' : 'produccion') : undefined}
          />

          {/* Causa de cada paro que el sensor midió: el "por qué" no lo trae
              Shoplogix. Se monta junto al panel de máquinas para que el paro y
              su explicación se vean en el mismo lugar. */}
          {upstreamLine.snapshot && (
            <SensorStopsCausePanel
              snapshot={upstreamLine.snapshot}
              plantLineId={plantLineCfg.id}
              plantSlug={plantLineCfg.plantSlug}
              dateKey={upstreamLine.snapshot.dateKey || dateKey}
              shiftId={upstreamLine.snapshot.shiftId}
            />
          )}

          {/* Correlación automática Grader↔Baader y scatter — solo aplican
              en plantas donde el Grader Marelec MS4/12 procesa downstream de
              las Baader. Yal evisera y va directo a camión, sin Grader → no
              hay correlación posible. */}
          {isClassificationPlant && (
            <UpstreamCorrelationCard
              pauses={pauses}
              snapshot={upstreamLine.snapshot}
            />
          )}

          {isClassificationPlant && (
            <UpstreamScatterCard
              snapshot={upstreamLine.snapshot}
              timelineBuckets={enrichedTimelineBuckets}
              criticalThreshold={criticalThreshold}
            />
          )}
          </>)}

          {/* Distribución por gate, impacto de cambios mid-turno y evolución.
              Yal no aplica — sus 3-4 gates físicas no clasifican y los charts
              asumen 12 gates con calibre+calidad asignados. */}
          {activeView === 'gates' && isClassificationPlant && summary.gateDistribution && summary.gateDistribution.length > 0 && (
            <GateBreakdownCard
              gateDistribution={summary.gateDistribution}
              configSnapshots={configSnapshots}
              totalPieces={summary.totalPieces}
              pointZeroPieces={summary.pointZeroPieces}
              pointZeroPct={summary.pointZeroPct}
              shiftDocId={shiftDocId}
              onSaved={reloadConfigSnapshots}
            />
          )}

          {activeView === 'gates' && isClassificationPlant && enrichedTimelineBuckets.length > 0 && configSnapshots.length > 0 && (
            <GateChangeImpactCard
              timelineBuckets={enrichedTimelineBuckets}
              configSnapshots={configSnapshots}
            />
          )}

          {activeView === 'gates' && isClassificationPlant && enrichedTimelineBuckets.length > 0 && configSnapshots.length > 0 && (
            <GateEvolutionChart
              timelineBuckets={enrichedTimelineBuckets}
              configSnapshots={configSnapshots}
            />
          )}

          {/* Composición del turno (lotes + calidad + producto + conservación).
              Va en Resumen, bajo los KPI: es el "de qué estuvo hecho el turno". */}
          {activeView === 'resumen' && (
          <ShiftBreakdownsCard
            lotsInShift={summary.lotsInShift}
            calidadBreakdown={summary.calidadBreakdown}
            productoBreakdown={summary.productoBreakdown}
            conservacionBreakdown={summary.conservacionBreakdown}
          />
          )}

          {/* Historial de cambios de configuración del turno — solo Chonchi
              (gates con calibre+calidad). Yal no clasifica → no aplica. */}
          {activeView === 'gates' && isClassificationPlant && (
            <ConfigChangeHistory
              shiftDocId={shiftDocId}
              snapshots={configSnapshots}
              timelineBuckets={enrichedTimelineBuckets}
              onChange={reloadConfigSnapshots}
              allowEdit={shiftWindow?.status === 'live'}
            />
          )}

          {/* Sección IA — solo Chonchi. El generador asume gates de
              clasificación, calibres, asignación calidad — todos conceptos
              que no aplican a Yal. La IA Yal-específica está pendiente
              (banner amber arriba avisa al usuario). */}
          {activeView === 'resumen' && isClassificationPlant && (
            <Card>
              <CardContent className="py-3 px-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cat-6-ink" />
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
          )}
          {activeView === 'resumen' && isClassificationPlant && aiOutput && <AIOutputPanel output={aiOutput} />}

          {/* Nota: el contador de cambios de config (FASE 27) ya vive en
              el badge del panel ConfigChangeHistory de arriba — eliminado
              para evitar duplicación con conteos divergentes. */}

          {/* Compartir turno — solo supervisores/admins cuando hay summary */}
          {activeView === 'resumen' && summary && isAdmin && (
            <div className="rounded-card border border-border bg-muted p-3 space-y-2">
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
                    <code className="flex-1 truncate rounded-ctl bg-muted px-2 py-1 text-caption text-muted-foreground">
                      {shareUrl}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="shrink-0 flex items-center gap-1 rounded-ctl bg-amber-500/[0.15] hover:bg-amber-500 text-white text-caption px-2 py-1 transition-colors"
                      title="Copiar link"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      onClick={async () => {
                        if (!shareToken) return
                        setRevoking(true)
                        try { await revokePublicToken(shareToken) } catch { /* ignorar error de red */ }
                        setShareUrl(null)
                        setShareToken(null)
                        setCopied(false)
                        setRevoking(false)
                      }}
                      disabled={revoking}
                      className="shrink-0 text-caption text-destructive/60 hover:text-destructive px-1 disabled:opacity-40"
                      title="Revocar link (lo invalida para quien lo tenga)"
                    >
                      {revoking ? '…' : 'Revocar'}
                    </button>
                  </div>
                  {/* QR code para escanear desde celular */}
                  <div className="flex items-start gap-3 pt-1">
                    <div className="rounded-card border border-border/40 bg-white p-1.5">
                      <QRCodeSVG value={shareUrl} size={100} level="M" includeMargin={false} />
                    </div>
                    <div className="flex flex-col justify-center gap-1 pt-1">
                      <div className="flex items-center gap-1 text-caption text-muted-foreground">
                        <QrCode className="w-3 h-3" />
                        Escanear con el celular
                      </div>
                      <p className="text-caption text-muted-foreground/50">
                        Abre la vista de turno sin necesidad de login
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-caption text-muted-foreground/40">
                Link válido 24 horas · sin login · solo lectura
              </p>
            </div>
          )}

          {/* Ajustes de ESTE turno — solo Chonchi (12 gates clasificadoras con
              calibre+calidad, rangos por calibre override, umbrales P0 del
              turno). Escribe con shiftDocId: nada de acá sale del turno. Lo
              global vive en /analisis-grader/config. Yal no clasifica → no aplica. */}
          {activeView === 'gates' && isClassificationPlant && (
            <Card className="overflow-hidden">
              <button
                onClick={() => setShowConfigPanel(v => !v)}
                className="w-full px-4 py-3 flex items-center justify-between text-sm hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Ajustes de este turno</span>
                  {turnoGates.filter(g => g.active).length > 0 && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {turnoGates.filter(g => g.active).length} gates activas
                    </Badge>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${showConfigPanel ? 'rotate-180' : ''}`} />
              </button>
              {showConfigPanel && (
                <div className="border-t">
                  <AnalisisGraderGatesConfigPage
                    tabbed
                    gates={turnoGates}
                    config={turnoConfig}
                    parsedData={EMPTY_PARSED_DATA as Parameters<typeof AnalisisGraderGatesConfigPage>[0]['parsedData']}
                    onComplete={handleTurnoConfigApply}
                    shiftDocId={shiftDocId}
                    shiftCalibreOverride={calibreOverride}
                    onShiftRangesSaved={setCalibrerOverride}
                    shiftThresholdsOverride={turnoThresholdsOverride}
                    onShiftThresholdsSaved={(t) => {
                      setTurnoThresholdsOverride(t)
                      if (t) {
                        setAlertThreshold(t.pointZeroPctWarn)
                        setCriticalThreshold(t.pointZeroPctCritical)
                      }
                    }}
                  />
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Monitor en vivo — link/QR sin sesión para Control de Producción.
          ⚠ VA FUERA del bloque `{summary && shiftWindow && ...}` a propósito: ese
          `summary` es el del Excel del Grader, y Filete no tiene Grader. Estando
          dentro, la tarjeta no aparecía justo en la línea para la que se hizo.
          La fuente de datos es el turno de Shoplogix, no el Grader. */}
      {activeView === 'resumen' && isSupervisor && plantLineCfg.shoplogixEnabled
        && upstreamLine.source === 'firestore' && upstreamLine.snapshot && (
        <div className="rounded-card border border-border bg-muted p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-sky-500" />
            <span className="text-sm font-medium">Monitor en vivo (link / QR)</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Comparte el avance de piezas de {plantLineCfg.machineKind?.long ?? 'la línea'} con
            Control de Producción: piezas del turno, pz/min, pz/hora, horario y detenciones.
            Sin login y solo lectura — se actualiza solo con cada sync.
            {monitorMode === 'line'
              ? ' El link sigue el turno que esté corriendo: el mismo QR sirve mañana.'
              : ' El link queda fijo en este turno.'}
          </p>

          {!monitorUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-muted-foreground" htmlFor="monitor-mode">
                Qué sigue
              </label>
              <select
                id="monitor-mode"
                value={monitorMode}
                onChange={(e) => {
                  const m = e.target.value as MonitorMode
                  setMonitorMode(m)
                  // El sentido del link de línea es no regenerarlo: nace con
                  // la vigencia larga. El de un turno puntual, con 1 día.
                  setMonitorTtl(m === 'line' ? 720 : 24)
                }}
                className="h-7 rounded border border-border bg-background px-2 text-xs"
              >
                <option value="line">El turno vigente (no hay que regenerarlo)</option>
                <option value="shift">Solo este turno</option>
              </select>
              <label className="text-[11px] text-muted-foreground" htmlFor="monitor-ttl">
                Vigencia
              </label>
              <select
                id="monitor-ttl"
                value={monitorTtl}
                onChange={(e) => setMonitorTtl(Number(e.target.value) as MonitorTtlHours)}
                className="h-7 rounded border border-border bg-background px-2 text-xs"
              >
                {MONITOR_TTL_CHOICES.map(h => (
                  <option key={h} value={h}>
                    {h < 24 ? `${h} horas` : h === 24 ? '1 día' : `${h / 24} días`}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs"
                onClick={() => void handleCreateMonitor()}
                disabled={monitorBusy}
              >
                {monitorBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Generar link'}
              </Button>
            </div>
          )}

          {monitorError && <p className="text-[11px] text-destructive">{monitorError}</p>}

          {monitorUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-[11px] text-muted-foreground">
                  {monitorUrl}
                </code>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(monitorUrl).then(() => {
                      setMonitorCopied(true)
                      setTimeout(() => setMonitorCopied(false), 2000)
                    })
                  }}
                  className="shrink-0 flex items-center gap-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] px-2 py-1 transition-colors"
                  title="Copiar link"
                >
                  {monitorCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {monitorCopied ? 'Copiado' : 'Copiar'}
                </button>
                <button
                  onClick={() => void handleRevokeMonitor()}
                  disabled={monitorBusy}
                  className="shrink-0 text-[11px] text-destructive/60 hover:text-destructive px-1 disabled:opacity-40"
                  title="Revocar el link (deja de funcionar para todos)"
                >
                  {monitorBusy ? '…' : 'Revocar'}
                </button>
              </div>
              <div className="flex items-start gap-3 pt-1">
                <div className="rounded-card border border-border/40 bg-white p-1.5">
                  <QRCodeSVG value={monitorUrl} size={116} level="M" includeMargin={false} />
                </div>
                <div className="flex flex-col justify-center gap-1 pt-1">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <QrCode className="w-3 h-3" />
                    Escanear con el celular
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">
                    {monitorMode === 'line' ? 'Sigue el turno vigente · vence en ' : 'Este turno · vence en '}
                    {monitorTtl < 24 ? `${monitorTtl} horas` : monitorTtl === 24 ? '1 día' : `${monitorTtl / 24} días`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* M3: Diálogo "siguiente pausa sin clasificar" */}
      <PauseAnnotationDialog
        open={nextPauseOpen}
        onOpenChange={setNextPauseOpen}
        pause={untaggedPauses[0] ?? null}
        summaryId={effectiveSummaryId}
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
