/**
 * Página principal de Análisis Grader — flujo simplificado.
 *
 * Página única (sin stepper):
 *  1. Upload de archivos (siempre visible)
 *  2. Configuración de gates (colapsable)
 *  3. Alertas + Dashboard (aparecen automáticamente al cargar archivos)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, Button, Badge } from '@/components/ui'
import { Settings2, BarChart3, Loader2, CheckCircle2, Calendar, BookOpen } from 'lucide-react'
import { useAuthStore, usePermissionsStore } from '@/store'
import { AnalisisGraderUploadPage, type FileParsed } from './AnalisisGraderUploadPage'
import { GraderHistoricalCalendar } from '@/components/grader/GraderHistoricalCalendar'
import { AnalisisGraderGatesConfigPage } from './AnalisisGraderGatesConfigPage'
import { AnalisisGraderDashboardPage } from './AnalisisGraderDashboardPage'
import { GraderResumenRapido } from './GraderResumenRapido'
import { getLatestGraderAutosaveDraft, saveGraderAutosaveDraft } from '@/services/grader/graderSession.service'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { getShiftDoc, buildShiftDocId } from '@/services/grader/graderShifts.service'
import type { CalibreWeightRange } from '@/services/grader/types'
import { computeAnalytics, DEFAULT_PHYSICAL_CONFIG } from '@/services/grader/graderAnalytics'
import { computeDeterministicInsights } from '@/services/grader/graderInsights'
import {
  segmentByDayAndShift,
  computeShiftSummary,
  computeTimelineAggregates,
  sortedSegmentEntries,
  dedupePieceRecords,
  dedupeGate0Records,
} from '@/services/grader/graderSegmenter'
import {
  saveDailySummaryBatch,
  fetchExistingSummaryIds,
  savePieceRecordsBatch,
  buildDedupeKey,
  saveTimelineAggregates,
  savePausesAggregates,
  loadPausesAggregates,
  mergeAnnotationsIntoPauses,
  type FirestorePieceRecord,
} from '@/services/grader/graderDailySummary.service'
import { detectPauses, collectSortedTimestamps, type PauseDetectionResult } from '@/services/grader/graderPauseDetector'
import { DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import type { ParsedMatrixData, GateAssignment, GraderAnalysisConfig } from '@/services/grader/types'

const GRADER_WIZARD_DRAFT_KEY = 'grader_wizard_draft_v1'

// Autosave conservador — el usuario no necesita controlar esto
const AUTOSAVE_POLICY = {
  debounceMs: 8_000,
  minIntervalMs: 45_000,
  configIdleMs: 30_000,
}

export function AnalisisGraderWizardPage() {
  const { canSee } = usePermissionsStore()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [parsedData, setParsedData] = useState<ParsedMatrixData | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<FileParsed[]>([])
  const [gates, setGates] = useState<GateAssignment[]>(getDefaultGates())
  const [config, setConfig] = useState<GraderAnalysisConfig>({
    intervalMinutes: 15,
    errorThresholds: {
      photocellPctWarn: 1,
      outOfLimitsPctWarn: 3,
      pointZeroPctWarn: DEFAULT_P0_ALERT_PCT,
      pointZeroPctCritical: DEFAULT_P0_CRITICAL_PCT,
    },
  })
  const [autosaveState, setAutosaveState] = useState<'idle' | 'queued' | 'saving' | 'saved' | 'error'>('idle')
  const [autosaveUpdatedAt, setAutosaveUpdatedAt] = useState<string | null>(null)
  // Velocidades de las 4 cintas — editables inline desde el resumen rápido
  // Se inicializan con los defaults y se sincronizan cuando se guarda la config física
  const [effectiveSpeeds, setEffectiveSpeeds] = useState<Record<string, number>>(() =>
    Object.fromEntries(DEFAULT_PHYSICAL_CONFIG.belts.map((b) => [b.beltId, b.speedMps])),
  )

  const [savingToCalendar, setSavingToCalendar] = useState(false)
  const [savedToCalendar, setSavedToCalendar] = useState(false)
  // IDs de turnos del banner multi-día que ya existen en Firestore
  const [multiDayExistingIds, setMultiDayExistingIds] = useState<Set<string>>(new Set())

  // Contexto de turno — si viene ?dateKey=&shiftId= en la URL, carga el override de rangos del turno
  const shiftDocId = useMemo(() => {
    const dk = searchParams.get('dateKey')
    const si = searchParams.get('shiftId')
    return dk && si ? buildShiftDocId(dk, si) : undefined
  }, [searchParams])
  const [shiftCalibreOverride, setShiftCalibreOverride] = useState<CalibreWeightRange[] | null>(null)
  const [shiftThresholdsOverride, setShiftThresholdsOverride] = useState<{ photocellPctWarn: number; outOfLimitsPctWarn: number; pointZeroPctWarn: number; pointZeroPctCritical: number } | null>(null)

  useEffect(() => {
    if (!shiftDocId) {
      setShiftCalibreOverride(null)
      setShiftThresholdsOverride(null)
      return
    }
    const [dk, si] = shiftDocId.split('__')
    if (!dk || !si) return
    getShiftDoc(dk, si)
      .then(doc => {
        setShiftCalibreOverride(doc?.calibreRangeOverride ?? null)
        setShiftThresholdsOverride(doc?.thresholdsOverride ?? null)
      })
      .catch(() => {})
  }, [shiftDocId])

  const dashboardRef = useRef<HTMLDivElement>(null)
  const localDraftLoadedRef = useRef(false)
  const cloudDraftHydratedRef = useRef(false)
  const lastCloudSaveAtRef = useRef<number>(0)
  const lastCloudFingerprintRef = useRef<string>('')
  const lastConfigMutationAtRef = useRef<number>(Date.now())

  // Analytics completo con physicalConfig efectivo (incluye velocidad cinta editable)
  const analyticsResult = useMemo(() => {
    if (!parsedData || parsedData.pieceRecords.length === 0) return null
    try {
      const basePhysical = config.physicalConfig ?? DEFAULT_PHYSICAL_CONFIG
      const effectiveConfig: GraderAnalysisConfig = {
        ...config,
        physicalConfig: {
          ...basePhysical,
          belts: basePhysical.belts.map((b) => ({
            ...b,
            speedMps: effectiveSpeeds[b.beltId] ?? b.speedMps,
          })),
        },
      }
      return computeAnalytics(parsedData, effectiveConfig, gates)
    } catch {
      return null
    }
  }, [parsedData, config, gates, effectiveSpeeds])

  // Insights derivados del analytics (usados tanto por ResumenRapido como para el badge del header)
  const alertInsights = useMemo(() => {
    if (!analyticsResult) return []
    try {
      return computeDeterministicInsights(analyticsResult)
    } catch {
      return []
    }
  }, [analyticsResult])

  // Detectar si el archivo cargado cubre múltiples días → mostrar banner "Guardar en Calendario"
  // También aplica a archivos P0-solo (gate0Records sin pieceRecords)
  const multiDayInfo = useMemo(() => {
    if (!parsedData) return null
    const totalRecords = parsedData.pieceRecords.length + parsedData.gate0Records.length
    if (totalRecords === 0) return null
    // Dedupe por si el archivo viene con registros repetidos internamente
    const pieceUnique = dedupePieceRecords(parsedData.pieceRecords).unique
    const gate0Unique = dedupeGate0Records(parsedData.gate0Records).unique
    const segmentMap = segmentByDayAndShift(pieceUnique, gate0Unique)
    const entries = sortedSegmentEntries(segmentMap)
    const uniqueDays = new Set(entries.map(([, s]) => s.sessionDate)).size
    if (uniqueDays <= 1) return null
    const isP0Only = parsedData.pieceRecords.length === 0
    return { entries, uniqueDays, totalSegments: entries.length, isP0Only }
  }, [parsedData])

  // Consultar Firestore: cuántos de los turnos detectados ya existen
  useEffect(() => {
    setMultiDayExistingIds(new Set())
    if (!multiDayInfo) return
    let cancelled = false
    const ids = multiDayInfo.entries.map(([, seg]) => `${seg.sessionDate}__${seg.shiftId}`)
    fetchExistingSummaryIds(ids)
      .then((set) => { if (!cancelled) setMultiDayExistingIds(set) })
      .catch(() => { /* silencioso — no bloqueamos el banner */ })
    return () => { cancelled = true }
  }, [multiDayInfo])

  const multiDayCounts = useMemo(() => {
    if (!multiDayInfo) return null
    const replaceCount = multiDayInfo.entries.filter(
      ([, seg]) => multiDayExistingIds.has(`${seg.sessionDate}__${seg.shiftId}`),
    ).length
    return {
      replace: replaceCount,
      new: multiDayInfo.totalSegments - replaceCount,
    }
  }, [multiDayInfo, multiDayExistingIds])

  // Cargar physicalConfig guardado desde Firestore al iniciar
  // → así el widget de velocidad arranca con el valor real guardado, no con el default
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await getModuleRanges()
        if (cancelled || !cfg?.physicalConfig) return
        // Sincronizar velocidades de todas las cintas desde el config guardado
        setEffectiveSpeeds((prev) => {
          const updated = { ...prev }
          for (const b of cfg.physicalConfig!.belts) {
            if (b.speedMps > 0) updated[b.beltId] = b.speedMps
          }
          return updated
        })
        // Incorporar el physicalConfig completo al state de config (para insights físicos)
        setConfig((prev) => ({ ...prev, physicalConfig: cfg.physicalConfig }))
      } catch { /* fallback silencioso: usa DEFAULT_PHYSICAL_CONFIG */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Restaurar draft local
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GRADER_WIZARD_DRAFT_KEY)
      if (!raw) return
      localDraftLoadedRef.current = true
      const saved = JSON.parse(raw) as { gates?: GateAssignment[]; config?: GraderAnalysisConfig }
      if (Array.isArray(saved.gates) && saved.gates.length > 0) setGates(saved.gates)
      if (saved.config && typeof saved.config === 'object') {
        const c = saved.config
        setConfig((prev) => ({
          ...prev,
          ...c,
          errorThresholds: {
            photocellPctWarn: c.errorThresholds?.photocellPctWarn ?? prev.errorThresholds?.photocellPctWarn ?? 1,
            outOfLimitsPctWarn: c.errorThresholds?.outOfLimitsPctWarn ?? prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
            pointZeroPctWarn: c.errorThresholds?.pointZeroPctWarn ?? prev.errorThresholds?.pointZeroPctWarn ?? DEFAULT_P0_ALERT_PCT,
            pointZeroPctCritical: c.errorThresholds?.pointZeroPctCritical ?? prev.errorThresholds?.pointZeroPctCritical ?? DEFAULT_P0_CRITICAL_PCT,
          },
        }))
      }
    } catch { /* localStorage no disponible */ }
  }, [])

  // Persistir draft local
  useEffect(() => {
    try {
      localStorage.setItem(GRADER_WIZARD_DRAFT_KEY, JSON.stringify({ gates, config, updatedAt: new Date().toISOString() }))
    } catch { /* localStorage no disponible */ }
  }, [config, gates])

  // Seguimiento de mutaciones para autosave
  useEffect(() => {
    lastConfigMutationAtRef.current = Date.now()
  }, [config, gates])

  // Restaurar draft desde cloud
  useEffect(() => {
    if (!user?.id || localDraftLoadedRef.current || cloudDraftHydratedRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const draft = await getLatestGraderAutosaveDraft(user.id)
        if (!draft || cancelled) return
        if (Array.isArray(draft.gatesConfigSnapshot) && draft.gatesConfigSnapshot.length > 0) setGates(draft.gatesConfigSnapshot)
        if (draft.config && typeof draft.config === 'object') {
          const c = draft.config
          setConfig((prev) => ({
            ...prev,
            ...c,
            errorThresholds: {
              photocellPctWarn: c.errorThresholds?.photocellPctWarn ?? prev.errorThresholds?.photocellPctWarn ?? 1,
              outOfLimitsPctWarn: c.errorThresholds?.outOfLimitsPctWarn ?? prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
              pointZeroPctWarn: c.errorThresholds?.pointZeroPctWarn ?? prev.errorThresholds?.pointZeroPctWarn ?? 2,
              pointZeroPctCritical: c.errorThresholds?.pointZeroPctCritical ?? prev.errorThresholds?.pointZeroPctCritical ?? 3.5,
            },
          }))
        }
        setAutosaveUpdatedAt(draft.updatedAt || null)
        setAutosaveState('saved')
      } catch { /* fallback silencioso */ }
      finally { cloudDraftHydratedRef.current = true }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // Autosave cloud
  useEffect(() => {
    if (!user?.id) return
    const sessionDate = config.startAt?.slice(0, 10)
    const hasMeaningfulContext = Boolean(config.deviceId || config.shiftId || config.startAt || parsedData?.files.length)
    if (!hasMeaningfulContext) { setAutosaveState('idle'); return }

    const fingerprint = JSON.stringify({ config, gates, sessionDate })
    if (fingerprint === lastCloudFingerprintRef.current) return

    const elapsed = Date.now() - lastCloudSaveAtRef.current
    const throttleWait = Math.max(0, AUTOSAVE_POLICY.minIntervalMs - elapsed)
    const configIdleElapsed = Date.now() - lastConfigMutationAtRef.current
    const configIdleWait = Math.max(0, AUTOSAVE_POLICY.configIdleMs - configIdleElapsed)
    const waitMs = Math.max(AUTOSAVE_POLICY.debounceMs, throttleWait, configIdleWait)

    setAutosaveState('queued')
    const timer = window.setTimeout(() => {
      setAutosaveState('saving')
      saveGraderAutosaveDraft({
        createdBy: user.id,
        deviceId: config.deviceId,
        shiftId: config.shiftId,
        sessionDate,
        config,
        gatesConfigSnapshot: gates,
        currentStep: 'config',
      })
        .then((draft) => {
          lastCloudSaveAtRef.current = Date.now()
          lastCloudFingerprintRef.current = fingerprint
          setAutosaveUpdatedAt(draft.updatedAt)
          setAutosaveState('saved')
        })
        .catch(() => setAutosaveState('error'))
    }, waitMs)
    return () => window.clearTimeout(timer)
  }, [config, gates, parsedData?.files.length, user?.id])

  // Restaurar último turno desde localStorage (skip si venimos con ?goto=)
  useEffect(() => {
    if (searchParams.get('date') || searchParams.get('autoload') || searchParams.get('goto')) return
    try {
      const saved = localStorage.getItem('grader_last_session')
      if (saved) {
        const { date, shiftId } = JSON.parse(saved)
        if (date && shiftId) {
          const newParams = new URLSearchParams(searchParams)
          newParams.set('date', date)
          newParams.set('shift', shiftId)
          newParams.set('autoload', '1')
          navigate(`?${newParams.toString()}`, { replace: true })
        }
      }
    } catch { /* localStorage no disponible */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll automático al calendario cuando llegamos con ?goto=
  useEffect(() => {
    if (!searchParams.get('goto')) return
    // Esperar un render para que el calendario ya esté montado
    const t = window.setTimeout(() => {
      const calEl = document.querySelector('[data-grader-calendar]')
      if (calEl) calEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)
    return () => window.clearTimeout(t)
  }, [searchParams])

  const fallbackParsedData: ParsedMatrixData = parsedData || {
    files: [], pieceRecords: [], gate0Records: [], folioRecords: [], qualitySummary: [], productionSummary: [], inferred: {},
  }

  const handleUploadComplete = useCallback((data: ParsedMatrixData) => {
    setParsedData(data)
    setConfig((prev) => ({
      ...prev,
      startAt: data.inferred.startAt || prev.startAt,
      endAt: data.inferred.endAt || prev.endAt,
    }))
  }, [])

  const handleGatesApply = useCallback((updatedGates: GateAssignment[], updatedConfig: GraderAnalysisConfig) => {
    setGates(updatedGates)
    setConfig(updatedConfig)
    // Sincronizar velocidades de todas las cintas si el usuario cambió la config física
    if (updatedConfig.physicalConfig) {
      setEffectiveSpeeds((prev) => {
        const updated = { ...prev }
        for (const b of updatedConfig.physicalConfig!.belts) {
          if (b.speedMps > 0) updated[b.beltId] = b.speedMps
        }
        return updated
      })
    }
  }, [])

  const handleApplyGateSuggestion = useCallback((payload: { gateNumber: number; calibre: string; quality: string }) => {
    setGates((prev) => prev.map((gate) => {
      if (gate.gateNumber !== payload.gateNumber) return gate
      return { ...gate, assignedCalibre: payload.calibre, assignedQuality: payload.quality as GateAssignment['assignedQuality'] }
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleUpdatePointZeroWarnThreshold = useCallback((value: number) => {
    setConfig((prev) => ({
      ...prev,
      errorThresholds: {
        photocellPctWarn: prev.errorThresholds?.photocellPctWarn ?? 1,
        outOfLimitsPctWarn: prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
        pointZeroPctWarn: value,
        pointZeroPctCritical: prev.errorThresholds?.pointZeroPctCritical ?? Math.max(value + 0.5, value * 1.5),
      },
    }))
  }, [])

  const handleUpdatePointZeroCriticalThreshold = useCallback((value: number) => {
    setConfig((prev) => ({
      ...prev,
      errorThresholds: {
        photocellPctWarn: prev.errorThresholds?.photocellPctWarn ?? 1,
        outOfLimitsPctWarn: prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
        pointZeroPctWarn: prev.errorThresholds?.pointZeroPctWarn ?? 2,
        pointZeroPctCritical: value,
      },
    }))
  }, [])

  const handleSaveToCalendar = useCallback(async () => {
    if (!multiDayInfo || !user?.id) return
    setSavingToCalendar(true)
    try {
      const batchId = crypto.randomUUID()
      const sourceNames = parsedData?.files.map((f) => f.name) ?? []

      // Cargar PauseDetectorConfig guardada por el admin (M16) para re-detección consistente.
      const moduleCfg = await getModuleRanges().catch(() => null)
      const pauseDetectorCfg = moduleCfg?.pauseDetectorConfig

      // Calcular summaries + detectar pausas en el mismo pase.
      // Los agregados de pausas (totales) se embeben en el summary para
      // KPIs rápidos; el detalle se guarda en meta/pauses dentro del loop.
      const detectionByKey = new Map<string, PauseDetectionResult>()
      const summaries = multiDayInfo.entries.map(([key, segment]) => {
        const raw = computeShiftSummary(segment, batchId, sourceNames, user.id, gates)
        const tsSorted = collectSortedTimestamps(segment.pieceRecords, segment.gate0Records)
        // Extraer timestamps de cambios de lote para auto-tag 'cambio_lote' (M10)
        const loteChangeTsMs: number[] = []
        let prevLot: string | undefined
        for (const r of segment.pieceRecords) {
          if (r.lot && r.lot !== prevLot && prevLot !== undefined) {
            loteChangeTsMs.push(Date.parse(r.ts))
          }
          if (r.lot) prevLot = r.lot
        }
        const det = detectPauses(tsSorted, raw.shiftId, loteChangeTsMs, pauseDetectorCfg)
        detectionByKey.set(key, det)
        return {
          ...raw,
          totalDeadTimeSec: det.totalDeadTimeSec,
          microDetentionsCount: det.microDetentions.count,
          microDetentionsTotalSec: det.microDetentions.totalSec,
          pausesCount: det.pauses.length,
        }
      })
      await saveDailySummaryBatch(summaries)

      // Guardar pieceRecords en subcollection (dedup automática) + timeline
      // aggregates en sub-collection `meta/timeline` para que el timeline chart
      // se pinte al instante al abrir el turno sin bajar los records crudos.
      // Además guarda el detalle de pausas en `meta/pauses` preservando
      // anotaciones manuales previas (merge por id estable).
      for (const [key, segment] of multiDayInfo.entries) {
        const [dateKey, shiftId] = key.split('|')
        if (!dateKey || !shiftId) continue
        const summaryId = `${dateKey}__${shiftId}`
        const allRecs = [...segment.pieceRecords, ...segment.gate0Records]
        if (allRecs.length === 0) continue
        const firestoreRecs: FirestorePieceRecord[] = allRecs.map((r) => ({
          ts: r.ts,
          gate: r.gate,
          pieces: r.pieces,
          ...(r.weightKg != null && { weightKg: r.weightKg }),
          ...(r.weightPerPieceGrams != null && { weightPerPieceGrams: r.weightPerPieceGrams }),
          ...(r.quality && { quality: r.quality }),
          ...(r.calibre && { calibre: r.calibre }),
          ...('error' in r && r.error && { error: r.error }),
          ...(r.lot && { lot: r.lot }),
          dedupeKey: buildDedupeKey(r),
        }))
        await savePieceRecordsBatch(summaryId, firestoreRecs)

        // Pre-computar aggregates por minuto y guardar en sub-collection.
        // Idempotente: se sobrescribe en cada re-upload del mismo turno.
        const aggregates = computeTimelineAggregates(segment.pieceRecords, segment.gate0Records)
        if (aggregates.length > 0) {
          await saveTimelineAggregates(summaryId, aggregates)
        }

        // Detalle de pausas (≥5min) + microDetentions.byHour.
        // Merge preserva tag/note/annotatedBy/annotatedAt de anotaciones
        // manuales previas antes de sobrescribir.
        const det = detectionByKey.get(key)
        if (det && (det.pauses.length > 0 || det.microDetentions.count > 0)) {
          const prev = await loadPausesAggregates(summaryId)
          const mergedPauses = prev
            ? mergeAnnotationsIntoPauses(det.pauses, prev.pauses)
            : det.pauses
          await savePausesAggregates(summaryId, mergedPauses, det.microDetentions)
        }
      }

      setSavedToCalendar(true)
      // El calendario embebido abajo se actualiza solo en el siguiente render.
      // No necesitamos navegar a otra página (ya no hay /analisis-grader/calendario).
    } catch {
      setSavingToCalendar(false)
    }
  }, [multiDayInfo, parsedData, user?.id, gates])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  const hasData = Boolean(parsedData && parsedData.pieceRecords.length > 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border/50">
        <div className="flex items-center gap-4 flex-wrap min-w-0">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 lg:h-6 lg:w-6 text-primary" />
              Análisis de Turno
            </h1>
            <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
              Línea completa Grader + Baaders — carga de Excel del Grader
            </p>
          </div>
          {/* [2] Carga de archivos — compacto en el header */}
          <AnalisisGraderUploadPage
            compact
            onComplete={handleUploadComplete}
            initialFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {autosaveState !== 'idle' && (
            <Badge
              variant="outline"
              className={
                autosaveState === 'saved' ? 'text-emerald-600 border-emerald-500/40' :
                autosaveState === 'saving' ? 'text-sky-600 border-sky-500/40' :
                autosaveState === 'error' ? 'text-amber-600 border-amber-500/40' :
                'text-muted-foreground border-muted'
              }
            >
              {autosaveState === 'saving' && <><Loader2 className="h-3 w-3 animate-spin mr-1" />Guardando…</>}
              {autosaveState === 'saved' && <>Guardado {autosaveUpdatedAt ? new Date(autosaveUpdatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</>}
              {autosaveState === 'error' && <>Error al guardar (respaldo local activo)</>}
              {autosaveState === 'queued' && <>Guardado pendiente</>}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader/periodo')} className="border-primary/30 text-primary hover:bg-primary/10">
            <BarChart3 className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Análisis </span>período
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader/ayuda')} className="border-muted-foreground/30 hover:bg-muted/50">
            <BookOpen className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Manual &amp; </span>runbooks
          </Button>
        </div>
      </div>

      {/* ═══ Cuerpo: calendario full-width (config vive dentro de cada turno) ═══ */}
      <div className={shiftDocId ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'grid grid-cols-1 gap-6'}>
        {/* Calendario — toma todo el ancho si no hay contexto de turno */}
        <GraderHistoricalCalendar stacked />

        {/* Configuraciones — solo visible cuando se llega desde un turno específico */}
        {shiftDocId && (
          <Card className="border-l-4 border-l-emerald-500/40 h-fit">
            <div className="px-4 pt-3 pb-1 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold">Configuraciones</span>
              <Badge variant="outline" className="text-xs font-normal ml-auto">
                {gates.filter((g) => g.active).length} gates activas
              </Badge>
            </div>
            <CardContent className="pt-2 pb-4">
              <AnalisisGraderGatesConfigPage
                tabbed
                gates={gates}
                config={config}
                parsedData={fallbackParsedData}
                onComplete={handleGatesApply}
                shiftDocId={shiftDocId}
                shiftCalibreOverride={shiftCalibreOverride}
                onShiftRangesSaved={setShiftCalibreOverride}
                shiftThresholdsOverride={shiftThresholdsOverride}
                onShiftThresholdsSaved={setShiftThresholdsOverride}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Banners multi-día */}
      {multiDayInfo && !savedToCalendar && (
        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-sky-500 shrink-0" />
              <div className="text-sm min-w-0">
                <p>
                  <span className="font-medium">
                    {multiDayInfo.isP0Only ? 'Archivo P0 multi-día' : 'Archivo multi-día detectado'}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    {multiDayInfo.uniqueDays} días · {multiDayInfo.totalSegments} turnos
                    {multiDayInfo.isP0Only && ' — actualizará causas P0 sin borrar datos PP'}
                  </span>
                </p>
                {multiDayCounts && multiDayCounts.replace > 0 && (
                  <p className="text-xs mt-0.5">
                    <span className="text-emerald-600 font-medium">{multiDayCounts.new} nuevos</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-amber-600 font-medium">{multiDayCounts.replace} reemplazos</span>
                    <span className="text-muted-foreground"> (se sobrescribirán)</span>
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              disabled={savingToCalendar}
              onClick={handleSaveToCalendar}
              className="bg-sky-600 hover:bg-sky-700 text-white shrink-0"
            >
              {savingToCalendar
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Guardando…</>
                : <><Calendar className="h-3.5 w-3.5 mr-1.5" />Guardar en Calendario</>
              }
            </Button>
          </CardContent>
        </Card>
      )}
      {multiDayInfo && savedToCalendar && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              {multiDayInfo.totalSegments} turnos guardados — redirigiendo al calendario…
            </p>
          </CardContent>
        </Card>
      )}

      {/* ═══ PANTALLA 2: Dashboard de análisis (full width) ═══ */}
      {hasData && analyticsResult && (
        <GraderResumenRapido
          analytics={analyticsResult}
          insights={alertInsights}
          effectiveSpeeds={effectiveSpeeds}
          onChangeEffectiveSpeeds={(beltId, mps) =>
            setEffectiveSpeeds((prev) => ({ ...prev, [beltId]: mps }))
          }
          onScrollToDashboard={() =>
            dashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      )}

      {hasData && (
        <div ref={dashboardRef}>
          <AnalisisGraderDashboardPage
            parsedData={fallbackParsedData}
            gates={gates}
            config={config}
            onApplyGateSuggestion={handleApplyGateSuggestion}
            onUpdatePointZeroWarnThreshold={handleUpdatePointZeroWarnThreshold}
            onUpdatePointZeroCriticalThreshold={handleUpdatePointZeroCriticalThreshold}
          />
        </div>
      )}
    </div>
  )
}

function getDefaultGates(): GateAssignment[] {
  const calibres: Array<{ calibre: import('@/services/grader/types').CalibreRange; quality: import('@/services/grader/types').GraderQuality }> = [
    { calibre: '2-4 lb', quality: 'Grado' },
    { calibre: '4-6 lb', quality: 'Grado' },
    { calibre: '4-6 lb', quality: 'Premium' },
    { calibre: '6-8 lb', quality: 'Grado' },
    { calibre: '6-8 lb', quality: 'Premium' },
    { calibre: '6-8 lb', quality: 'Industrial' },
    { calibre: '8-10 lb', quality: 'Grado' },
    { calibre: '8-10 lb', quality: 'Premium' },
    { calibre: '8-10 lb', quality: 'Industrial' },
    { calibre: '10-12 lb', quality: 'Grado' },
    { calibre: '10-12 lb', quality: 'Premium' },
    { calibre: '10-12 lb', quality: 'D' },
  ]

  return calibres.map((c, i) => ({
    gateNumber: i + 1,
    assignedCalibre: c.calibre,
    assignedQuality: c.quality,
    active: true,
  }))
}
