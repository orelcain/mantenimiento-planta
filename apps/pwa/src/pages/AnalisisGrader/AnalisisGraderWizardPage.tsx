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
import { BarChart3, Loader2, CheckCircle2, Calendar, Upload, AlertCircle, ChevronDown } from 'lucide-react'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useAuthStore, usePermissionsStore } from '@/store'
import { AnalisisGraderUploadPage, type FileParsed } from './AnalisisGraderUploadPage'
import type { SlxMonthlyStats } from '@/services/grader/graderPeriodMonthlyStats'
import { GraderShiftPeriodContainer } from '@/components/grader/GraderShiftPeriodContainer'
import { GraderMonthlyStatsPanel } from '@/components/grader/GraderMonthlyStatsPanel'
import { PlantLineTabs } from '@/components/grader/PlantLineTabs'
import { QuickInterventionCapture } from '@/components/grader/QuickInterventionCapture'
import { ParoEtapaCapture } from '@/components/grader/ParoEtapaCapture'
import { LineOeeCard } from '@/components/grader/LineOeeCard'
import { CurrentShiftChip } from '@/components/grader/CurrentShiftChip'
import { PlantKPIBoard } from '@/components/grader/PlantKPIBoard'
import { DayTimeSummaryBar } from '@/components/grader/DayTimeSummaryBar'
import { getPlantLineConfig, getAreaDisplayLabel, DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'
import { AnalisisGraderDashboardPage } from './AnalisisGraderDashboardPage'
import { GraderResumenRapido } from './GraderResumenRapido'
import { getLatestGraderAutosaveDraft, saveGraderAutosaveDraft } from '@/services/grader/graderSession.service'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { computeAnalytics, DEFAULT_PHYSICAL_CONFIG } from '@/services/grader/graderAnalytics'
import { computeDeterministicInsights } from '@/services/grader/graderInsights'
import {
  segmentByDayAndShift,
  computeShiftSummary,
  computeTimelineAggregates,
  sortedSegmentEntries,
  dedupePieceRecords,
  dedupeGate0Records,
  type ShoplogixShiftWindow,
} from '@/services/grader/graderSegmenter'
import { loadShoplogixShiftWindows } from '@/services/grader/graderShoplogixWindows'
import { normalizeShiftSchedule, DEFAULT_SHIFT_SCHEDULE } from '@/services/grader/graderShiftSchedule'
import {
  saveDailySummaryBatch,
  fetchExistingSummaryIds,
  savePieceRecordsBatch,
  buildDedupeKey,
  buildDailySummaryId,
  saveTimelineAggregates,
  savePausesAggregates,
  loadPausesAggregates,
  mergeAnnotationsIntoPauses,
  updateDailySummary,
  type FirestorePieceRecord,
} from '@/services/grader/graderDailySummary.service'
import { saveGate0Records } from '@/services/grader/graderGate0Store'
import { detectPauses, collectSortedTimestamps, type PauseDetectionResult } from '@/services/grader/graderPauseDetector'
import { DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import type { ParsedMatrixData, GateAssignment, GraderAnalysisConfig, GraderDailySummary, Gate0Record } from '@/services/grader/types'

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
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Línea/planta activa — persiste en ?linea= ──
  const lineId = (searchParams.get('linea') as PlantLineId | null) ?? DEFAULT_PLANT_LINE_ID
  const lineConfig = getPlantLineConfig(lineId)
  const handleLineSelect = (id: PlantLineId) => {
    // Guard: no hacer nada si ya está seleccionada (evita re-render innecesario
    // que se percibe como "refresh" al re-clickear la tab activa).
    if (id === lineId) return
    // Usar nuevo URLSearchParams en lugar de mutar prev (mutación in-place no
    // dispara correctamente el cambio en React Router en algunos casos y puede
    // causar re-mounts duros que parecen refrescos).
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('linea', id)
      return next
    }, { replace: true })
  }

  const [parsedData, setParsedData] = useState<ParsedMatrixData | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<FileParsed[]>([])
  // Turnos REALES de Shoplogix para los días que toca el Excel. Shoplogix manda
  // sobre el horario y sobre el día del turno; el schedule declarado de la
  // planta queda como fallback para días sin sincronizar.
  const [slxWindows, setSlxWindows] = useState<ShoplogixShiftWindow[]>([])
  const [shiftSchedule, setShiftSchedule] = useState(
    lineConfig.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE,
  )
  // Panel "Cargar Excel del Grader" — colapsable. Por defecto cerrado en mobile
  // si ya hay summaries (no es la acción primaria), abierto si está vacío.
  const [uploadPanelExpanded, setUploadPanelExpanded] = useState(true)
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
  // Mensaje de error específico cuando el save a Firestore falla. Antes el
  // catch era silencioso y el banner se quedaba en "guardando…" sin avisar.
  const [saveError, setSaveError] = useState<string | null>(null)
  // IDs de turnos del banner multi-día que ya existen en Firestore
  const [multiDayExistingIds, setMultiDayExistingIds] = useState<Set<string>>(new Set())

  // Estado del panel de resumen mensual — se sincroniza con el calendario embebido
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date())
  const [calendarSummaries, setCalendarSummaries] = useState<GraderDailySummary[]>([])
  // Las emite ahora la vista de período (`computePeriodMonthlyStats`); antes
  // las calculaba el calendario mensual, ya retirado.
  const [calendarSlxStats, setCalendarSlxStats] = useState<SlxMonthlyStats | null>(null)
  // Día seleccionado en el calendario (para el KPI board)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  /* Día por defecto de la barra de tiempos: hoy, hasta que se elija un turno en
     la matriz. En hora local — la planta razona en días de calendario chilenos,
     no en UTC. */
  const todayDateKey = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  // Se incrementa al registrar/borrar un paro de etapa: el OEE del área los
  // suma y vive en otra card, así que necesita releerlos.
  const [parosVersion, setParosVersion] = useState(0)

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

  // Info del Excel cargado: segmentos detectados (día × turno) por timestamp.
  // Antes solo se exponía cuando había MÁS de 1 día (banner "multi-día"). Eso
  // dejaba a los Excels de un solo turno SIN forma de guardar — el wizard
  // mostraba el dashboard pero nunca persistía nada en Firestore. Ahora
  // exponemos siempre que haya ≥1 segmento, y el banner se adapta al copy.
  // Fallback de horarios: el schedule declarado de la planta (o el guardado en
  // Firestore). Solo se usa para registros que no caen en ningún turno
  // sincronizado de Shoplogix.
  useEffect(() => {
    let cancelled = false
    const base = lineConfig.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE
    getModuleRanges(lineId)
      .then((cfg) => {
        if (cancelled) return
        setShiftSchedule(normalizeShiftSchedule(cfg?.shiftSchedule, base))
      })
      .catch(() => { if (!cancelled) setShiftSchedule(base) })
    return () => { cancelled = true }
  }, [lineId, lineConfig.defaultShiftSchedule])

  // Traer los turnos reales de Shoplogix para los días que cubre el Excel.
  useEffect(() => {
    if (!parsedData) { setSlxWindows([]); return }
    const dateKeys = new Set<string>()
    for (const r of parsedData.pieceRecords) if (r.ts) dateKeys.add(r.ts.slice(0, 10))
    for (const r of parsedData.gate0Records) if (r.ts) dateKeys.add(r.ts.slice(0, 10))
    if (dateKeys.size === 0) { setSlxWindows([]); return }

    let cancelled = false
    loadShoplogixShiftWindows(Array.from(dateKeys), lineConfig.plantSlug)
      .then((w) => { if (!cancelled) setSlxWindows(w) })
      .catch(() => { if (!cancelled) setSlxWindows([]) })
    return () => { cancelled = true }
  }, [parsedData, lineConfig.plantSlug])

  const multiDayInfo = useMemo(() => {
    if (!parsedData) return null
    const totalRecords = parsedData.pieceRecords.length + parsedData.gate0Records.length
    if (totalRecords === 0) return null
    // Dedupe por si el archivo viene con registros repetidos internamente
    const pieceUnique = dedupePieceRecords(parsedData.pieceRecords).unique
    const gate0Unique = dedupeGate0Records(parsedData.gate0Records).unique
    // Antes esto se llamaba SIN horario: siempre cortaba con día 07-19 /
    // noche 19-07, ignorando la config de la planta y a Shoplogix, así que un
    // turno real (T1 21:30-05:45) nunca calzaba con su tarjeta.
    const segmentMap = segmentByDayAndShift(pieceUnique, gate0Unique, shiftSchedule, slxWindows)
    const entries = sortedSegmentEntries(segmentMap)
    if (entries.length === 0) return null
    const uniqueDays = new Set(entries.map(([, s]) => s.sessionDate)).size
    const isP0Only = parsedData.pieceRecords.length === 0
    return { entries, uniqueDays, totalSegments: entries.length, isP0Only }
  }, [parsedData, shiftSchedule, slxWindows])

  // Consultar Firestore: cuántos de los turnos detectados ya existen
  useEffect(() => {
    setMultiDayExistingIds(new Set())
    if (!multiDayInfo) return
    let cancelled = false
    const effectivePlantLineId = lineId !== DEFAULT_PLANT_LINE_ID ? lineId : undefined
    const ids = multiDayInfo.entries.map(([, seg]) =>
      buildDailySummaryId(seg.sessionDate, seg.shiftId, effectivePlantLineId),
    )
    fetchExistingSummaryIds(ids)
      .then((set) => { if (!cancelled) setMultiDayExistingIds(set) })
      .catch(() => { /* silencioso — no bloqueamos el banner */ })
    return () => { cancelled = true }
  }, [multiDayInfo, lineId])

  const multiDayCounts = useMemo(() => {
    if (!multiDayInfo) return null
    const effectivePlantLineId = lineId !== DEFAULT_PLANT_LINE_ID ? lineId : undefined
    const replaceCount = multiDayInfo.entries.filter(
      ([, seg]) => multiDayExistingIds.has(
        buildDailySummaryId(seg.sessionDate, seg.shiftId, effectivePlantLineId),
      ),
    ).length
    return {
      replace: replaceCount,
      new: multiDayInfo.totalSegments - replaceCount,
    }
  }, [multiDayInfo, multiDayExistingIds, lineId])

  // Cargar physicalConfig guardado desde Firestore al iniciar
  // → así el widget de velocidad arranca con el valor real guardado, no con el default
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await getModuleRanges(lineId)
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
  }, [lineId])

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

  // Auto-collapse del panel "Cargar Excel" cuando ya hay summaries del mes.
  // Solo dispara una vez (cuando aparecen) — el usuario puede expandirlo manual.
  const calendarHasSummariesRef = useRef(false)
  useEffect(() => {
    const hasNow = calendarSummaries.length > 0
    if (hasNow && !calendarHasSummariesRef.current) {
      setUploadPanelExpanded(false)
      calendarHasSummariesRef.current = true
    } else if (!hasNow && calendarHasSummariesRef.current) {
      // Mes sin summaries → re-abrir para invitar a cargar
      setUploadPanelExpanded(true)
      calendarHasSummariesRef.current = false
    }
  }, [calendarSummaries.length])

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
    // Si el usuario subió otro Excel después de uno ya guardado, ocultar el
    // banner verde "Guardado correctamente" — ahora hay un upload nuevo que
    // todavía no fue persistido. El banner azul "listo para guardar" toma su
    // lugar.
    setSavedToCalendar(false)
    setConfig((prev) => ({
      ...prev,
      startAt: data.inferred.startAt || prev.startAt,
      endAt: data.inferred.endAt || prev.endAt,
    }))
  }, [])

  // Cuando el usuario cancela los archivos en cola desde el botón X del
  // UploadPage compact, `uploadedFiles` queda vacío. Reseteamos parsedData
  // para que el banner "turnos detectados" desaparezca y la pantalla vuelva
  // al estado limpio. Sin esto, el parsedData previo seguía vivo y el banner
  // mostraba turnos de un upload que el usuario ya canceló.
  useEffect(() => {
    if (uploadedFiles.length === 0 && parsedData) {
      setParsedData(null)
      setSavedToCalendar(false)
    }
  }, [uploadedFiles.length, parsedData])

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
    setSaveError(null)
    try {
      const batchId = crypto.randomUUID()
      const sourceNames = parsedData?.files.map((f) => f.name) ?? []

      // Cargar PauseDetectorConfig guardada por el admin (M16) para re-detección consistente.
      const moduleCfg = await getModuleRanges(lineId).catch(() => null)
      const pauseDetectorCfg = moduleCfg?.pauseDetectorConfig

      // Calcular summaries + detectar pausas en el mismo pase.
      // Los agregados de pausas (totales) se embeben en el summary para
      // KPIs rápidos; el detalle se guarda en meta/pauses dentro del loop.
      // Para líneas no-default (ej: Yal), los docs se guardan con prefix de plantLineId
      const effectivePlantLineId = lineId !== DEFAULT_PLANT_LINE_ID ? lineId : undefined

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
        // Sobrescribir id para líneas no-Chonchi (buildDailySummaryId agrega prefix)
        const overrideId = buildDailySummaryId(raw.dateKey, raw.shiftId, effectivePlantLineId)
        return {
          ...raw,
          id: overrideId,
          ...(effectivePlantLineId ? { plantLineId: effectivePlantLineId } : {}),
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
        const summaryId = buildDailySummaryId(dateKey, shiftId, effectivePlantLineId)
        // pieceRecords YA incluye gate=0 (ver mergeParsedData). No concatenar
        // gate0Records — eso causaba duplicación: cada pieza gate=0 quedaba
        // guardada 2 veces en Firestore (manifestado en Yal: 7 piezas reales,
        // 14 docs en pieceRecords subcollection).
        const allRecs = segment.pieceRecords
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

        // Guardar el input de Puerta 0 EXACTO que usó computeShiftSummary para
        // clasificar (el Excel P0 si vino, si no los gate=0 del pieza-a-pieza).
        // Sin esto no se puede recalcular el desglose al cambiar las gates: la
        // columna Error solo existe en el Excel P0 y los pieceRecords no la
        // traen. Ver graderGate0Store.ts.
        const p0Input: Gate0Record[] = segment.gate0Records.length > 0
          ? segment.gate0Records
          : segment.pieceRecords
            .filter((r) => r.gate === 0)
            .map((r) => ({ ...r, gate: 0 as const, error: ('error' in r && r.error) || '' }))
        try {
          await saveGate0Records(summaryId, p0Input)
          await updateDailySummary(summaryId, { gate0RecordsStored: true })
        } catch (err) {
          // No es fatal: el turno queda guardado igual, solo sin recálculo
          // automático (el aviso de config desfasada lo dirá).
          logger.warn('No se pudieron guardar los registros de Puerta 0', { err: String(err) })
        }

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

      // Limpiar el state del upload: banner azul "listo para guardar", botón
      // Cancelar y badge "Cargar Excel N" desaparecen. parsedData=null hace
      // que multiDayInfo se vuelva null y el banner se cierre solo. El banner
      // verde "guardado" usa una flag separada (savedToCalendar).
      setUploadedFiles([])
      setParsedData(null)

      // Si fue un solo turno, llevar directo al detalle del turno guardado
      // para que el usuario vea el resultado de inmediato. Para multi-día,
      // quedarse en el wizard con el calendario actualizado abajo (el usuario
      // elige qué turno revisar primero).
      if (multiDayInfo.totalSegments === 1) {
        const [, segment] = multiDayInfo.entries[0]!
        const shiftDocId = `${segment.sessionDate}__${segment.shiftId}`
        const lineaParam = lineId !== DEFAULT_PLANT_LINE_ID ? `?linea=${lineId}` : ''
        // Pequeño delay para que se vea el banner verde "guardado" antes de navegar
        setTimeout(() => {
          navigate(`/analisis-grader/turno/${encodeURIComponent(shiftDocId)}${lineaParam}`)
        }, 1200)
      }
    } catch (err) {
      // En error: quedar en el wizard con los archivos aún cargados para que
      // el usuario pueda reintentar sin volver a subir. Loggear el error real
      // (antes el catch era silencioso → si Firestore rechazaba por reglas o
      // tipos, el banner se quedaba en "redirigiendo" para siempre y el usuario
      // no sabía qué pasó).
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[grader] Error guardando turno en calendario', err instanceof Error ? err : new Error(message))
      setSaveError(message)
    } finally {
      setSavingToCalendar(false)
    }
  }, [multiDayInfo, parsedData, user?.id, gates, lineId, navigate])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  const hasData = Boolean(parsedData && parsedData.pieceRecords.length > 0)
  // Líneas sin Grader/Shoplogix (Acopio/Riles): solo Captura Rápida de Intervención.
  const isManual = lineConfig.manualCapture === true

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
              {lineConfig.hasGraderData
                ? lineConfig.isClassificationPlant === false
                  ? `${lineConfig.label} · eviscerado simplificado — Excel del Marelec`
                  : 'Línea completa Grader + Baaders — carga de Excel del Grader'
                : lineConfig.manualCapture
                  ? `${lineConfig.description} · voz → IA → historial de Mantención`
                  : `${lineConfig.description} · datos Shoplogix`}
            </p>
          </div>
          {/* El botón "Cargar Excel" se movió al lado de las pestañas de
              planta para que quede claro a qué planta se está cargando. */}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lineConfig.hasGraderData && autosaveState !== 'idle' && (
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
        </div>
      </div>

      {/* Banner: turnos detectados — listo para guardar.
          Posicionado ARRIBA (después del header, antes del Grid de pestañas)
          para que sea visible al instante después de soltar un Excel. Antes
          vivía al fondo de la página (bajo el calendario) y el usuario no lo
          veía → daba la impresión de que "no pasaba nada". */}
      {multiDayInfo && !savedToCalendar && (
        <Card className="border-sky-500/40 bg-sky-500/10 shadow-md ring-1 ring-sky-500/20">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Upload className="h-4 w-4 text-sky-400 shrink-0 animate-pulse" />
              <div className="text-sm min-w-0">
                <p>
                  <span className="font-semibold text-sky-900 dark:text-sky-100">
                    {multiDayInfo.isP0Only
                      ? `Archivo P0 — ${multiDayInfo.totalSegments} turno${multiDayInfo.totalSegments > 1 ? 's' : ''}`
                      : multiDayInfo.uniqueDays > 1
                        ? 'Archivo multi-día detectado'
                        : `${multiDayInfo.totalSegments} turno${multiDayInfo.totalSegments > 1 ? 's' : ''} detectado${multiDayInfo.totalSegments > 1 ? 's' : ''} — listo para guardar`}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    {multiDayInfo.uniqueDays > 1 && `${multiDayInfo.uniqueDays} días · `}
                    {multiDayInfo.entries.map(([, s]) => `${s.sessionDate} · ${s.shiftId}`).slice(0, 3).join(' / ')}
                    {multiDayInfo.entries.length > 3 && ` …+${multiDayInfo.entries.length - 3}`}
                    {multiDayInfo.isP0Only && ' — actualizará causas P0 sin borrar datos PP'}
                  </span>
                </p>
                <p className="text-[11px] text-sky-800/90 dark:text-sky-300/70 mt-0.5">
                  Se guardará en <b>{lineConfig.label}</b>
                  {multiDayCounts && multiDayCounts.replace > 0 && (
                    <>
                      {' · '}
                      <span className="text-emerald-400 font-medium">{multiDayCounts.new} nuevo{multiDayCounts.new !== 1 ? 's' : ''}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-amber-400 font-medium">{multiDayCounts.replace} reemplazo{multiDayCounts.replace !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              disabled={savingToCalendar}
              onClick={handleSaveToCalendar}
              className="bg-sky-600 hover:bg-sky-700 text-white shrink-0 shadow-sm"
            >
              {savingToCalendar
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Guardando…</>
                : <><Calendar className="h-3.5 w-3.5 mr-1.5" />Guardar en Calendario</>
              }
            </Button>
          </CardContent>
        </Card>
      )}
      {savedToCalendar && (
        <Card className="border-emerald-500/40 bg-emerald-500/10">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
              Guardado correctamente en <b>{lineConfig.label}</b> · revisá el calendario abajo o cargá otro Excel.
            </p>
          </CardContent>
        </Card>
      )}
      {saveError && (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-800 dark:text-red-300 font-medium">No se pudo guardar el turno</p>
              <p className="text-xs text-red-700/90 dark:text-red-200/80 mt-0.5 break-words">{saveError}</p>
              <p className="text-[11px] text-red-700/70 dark:text-red-200/60 mt-1">
                El Excel sigue cargado en cola — podés volver a presionar "Guardar en Calendario" para reintentar.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-700 dark:text-red-300 hover:bg-red-500/20 shrink-0"
              onClick={() => setSaveError(null)}
            >
              Cerrar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Líneas de captura manual (Acopio/Riles): sin Grader/Shoplogix →
          pestañas + panel de Captura Rápida de Intervención (Fase 3). */}
      {isManual && (
        <div className="space-y-4">
          <PlantLineTabs selected={lineId} onSelect={handleLineSelect} className="w-full" />
          <QuickInterventionCapture
            plantLineId={lineId}
            areaNodeId={lineConfig.areaNodeId}
            areaLabel={getAreaDisplayLabel(lineId)}
          />
        </div>
      )}

      {/* ═══ Grid 2-col que arranca en las pestañas de planta ═══ */}
      {!isManual && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Col izquierda: pestañas + KPI */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <PlantLineTabs selected={lineId} onSelect={handleLineSelect} className="w-full" />
            <CurrentShiftChip plantLineId={lineId} />
          </div>
          {/* Botón "Cargar Excel" contextual a la pestaña seleccionada.
              Antes vivía en el header global → era ambiguo a qué planta
              estabas cargando. Ahora queda DEBAJO de las pestañas: el
              `lineId` de la pestaña activa se propaga al guardar el doc
              con el prefix correcto (`yal-eviscerado__...` cuando aplica). */}
          {lineConfig.hasGraderData && (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10">
              <button
                type="button"
                onClick={() => setUploadPanelExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-blue-700/90 dark:text-blue-300/80 hover:bg-blue-500/15 transition-colors rounded-lg"
                title={uploadPanelExpanded ? 'Ocultar el panel de carga' : 'Mostrar el panel de carga'}
              >
                <Upload className="h-3 w-3 shrink-0" />
                <span className="flex-1 text-left">
                  Cargar Excel del Grader · <b className="text-blue-800 dark:text-blue-200">{lineConfig.label}</b>
                </span>
                {!uploadPanelExpanded && uploadedFiles.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-800 dark:text-blue-200 font-medium">
                    {uploadedFiles.length} archivo{uploadedFiles.length === 1 ? '' : 's'}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-transform text-blue-700/60 dark:text-blue-300/60',
                    uploadPanelExpanded && 'rotate-180',
                  )}
                />
              </button>
              {uploadPanelExpanded && (
                <div className="px-2.5 pb-2.5 pt-0">
                  <AnalisisGraderUploadPage
                    compact
                    onComplete={handleUploadComplete}
                    initialFiles={uploadedFiles}
                    onFilesChange={setUploadedFiles}
                  />
                </div>
              )}
            </div>
          )}
          <PlantKPIBoard
            plantSlug={lineConfig.plantSlug}
            plantLineId={lineId}
            graderSummaries={calendarSummaries}
            enabled={lineConfig.shoplogixEnabled && !lineConfig.comingSoon}
            selectedDateKey={selectedDateKey}
            currentMonth={calendarMonth}
          />
          {/* Tiempos del DÍA completo (todos sus turnos). Vive acá, junto al
              board que ya tiene el día como unidad, y no en el detalle de un
              turno: ahí sumaba las horas de todos los turnos del día contra un
              turno de 8 h, y quedaban dos escalas distintas en la misma
              pantalla ("55 h detenidas" en un turno de 8 h). */}
          <DayTimeSummaryBar
            dateKey={selectedDateKey ?? todayDateKey}
            plantSlug={lineConfig.plantSlug}
            enabled={lineConfig.shoplogixEnabled && !lineConfig.comingSoon}
          />
        </div>

        {/* Col derecha: Resumen del mes — arranca a la altura de las pestañas */}
        <GraderMonthlyStatsPanel
          currentMonth={calendarMonth}
          summaries={calendarSummaries}
          slxStats={calendarSlxStats}
          isClassificationPlant={lineConfig.isClassificationPlant !== false}
        />
      </div>

      {/* Vista de período por TURNO (matriz / lista) — reemplaza al calendario
          mensual: acá un turno que cruza medianoche ocupa UNA celda en vez de
          partirse en dos fragmentos (`salida` + `madrugada`). Provee también la
          navegación de mes y los summaries que el calendario emitía. */}
      <GraderShiftPeriodContainer
        plantLineId={lineId}
        month={calendarMonth}
        onMonthChange={setCalendarMonth}
        onSummariesLoaded={setCalendarSummaries}
        onMonthStatsLoaded={setCalendarSlxStats}
        onSelectShift={(s) => setSelectedDateKey(s.dateKey)}
        onOpenShift={(s) => {
          // Ruta CANÓNICA del detalle de turno. Antes apuntaba a
          // `/analisis-grader?date=…&autoload=1`, que no hacía nada: ya
          // estamos en esa ruta, así que React Router no remontaba nada.
          const linea = lineId !== DEFAULT_PLANT_LINE_ID ? `?linea=${encodeURIComponent(lineId)}` : ''
          navigate(`/analisis-grader/turno/${s.dateKey}__${encodeURIComponent(s.shiftId)}${linea}`)
        }}
      />
      </>
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

      {/* OEE del ÁREA estimado (Fase C) — combina la máquina instrumentada
          (Shoplogix) + los paros de las etapas sin sensor (manual) + calidad del
          Grader donde existe. Aplica a toda línea con datos Shoplogix: en Filete
          es justamente donde hace falta, porque la GEA no está integrada. */}
      {lineConfig.shoplogixEnabled && !lineConfig.comingSoon && (
        <LineOeeCard
          plantLineId={lineId}
          plantSlug={lineConfig.plantSlug}
          graderSummaries={calendarSummaries}
          currentMonth={calendarMonth}
          areaLabel={getAreaDisplayLabel(lineId)}
          refreshKey={parosVersion}
        />
      )}

      {/* Paros de etapa de la línea (Fase B OEE de área) — captura manual de
          detenciones de etapas no instrumentadas. Disponible en cualquier línea activa. */}
      {!lineConfig.comingSoon && (
        <ParoEtapaCapture
          plantLineId={lineId}
          onChanged={() => setParosVersion((v) => v + 1)}
          areaLabel={getAreaDisplayLabel(lineId)}
        />
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
