/**
 * Página principal de Análisis Grader — flujo simplificado.
 *
 * Página única (sin stepper):
 *  1. Upload de archivos (siempre visible)
 *  2. Configuración de gates (colapsable)
 *  3. Alertas + Dashboard (aparecen automáticamente al cargar archivos)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { avisoDeTurnosSinPiezas } from '@/services/grader/graderTurnosSinPiezas'

import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, Button, Badge } from '@/components/ui'
import { BarChart3, Loader2, CheckCircle2, Calendar, Upload, AlertCircle, ChevronDown } from 'lucide-react'
import { logger } from '@/lib/logger'
import { registrarVista } from '@/services/telemetria/registrarVista'
import { cn } from '@/lib/utils'
import { useAuthStore, usePermissionsStore } from '@/store'
import { AnalisisGraderUploadPage, type FileParsed } from './AnalisisGraderUploadPage'
import type { SlxMonthlyStats } from '@/services/grader/graderPeriodMonthlyStats'
import { GraderShiftPeriodContainer } from '@/components/grader/GraderShiftPeriodContainer'
import { ultimaCargaDateKey, dateKeyDdMm } from '@/services/grader/graderUltimaCarga'
import { GraderMonthlyStatsPanel } from '@/components/grader/GraderMonthlyStatsPanel'
import { PlantLineTabs } from '@/components/grader/PlantLineTabs'
import { BotonMonitorLinea } from '@/components/grader/BotonMonitorLinea'
import { CargaAutomaticaAviso, EtiquetaCargaAutomatica } from '@/components/grader/CargaAutomaticaAviso'
import { GraderDelDiaBloque } from '@/components/grader/GraderDelDiaBloque'
import { DatosGraderHasta } from '@/components/grader/DatosGraderHasta'
import { useDatosGraderHasta } from '@/services/grader/graderDatosHasta'
import { ddmmHhmm } from '@/services/grader/graderCobertura'
import { QuickInterventionCapture } from '@/components/grader/QuickInterventionCapture'
import { ParoEtapaCapture } from '@/components/grader/ParoEtapaCapture'
import { PeriodoNavegador } from '@/components/grader/PeriodoNavegador'
import type { KpiPeriod } from '@/hooks/usePlantKPIs'
import { desplazarPeriodo, fechaDeClave, claveDeFecha } from '@/services/grader/periodoNavegacion'
import { LineOeeCard } from '@/components/grader/LineOeeCard'
import { CurrentShiftChip } from '@/components/grader/CurrentShiftChip'
import { PlantKPIBoard } from '@/components/grader/PlantKPIBoard'
import { DayTimeSummaryBar } from '@/components/grader/DayTimeSummaryBar'
import { usePielApple } from '@/hooks/usePielApple'
import { getPlantLineConfig, getAreaDisplayLabel, DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'
import { AnalisisGraderDashboardPage } from './AnalisisGraderDashboardPage'
import { GraderResumenRapido } from './GraderResumenRapido'
import { getLatestGraderAutosaveDraft, saveGraderAutosaveDraft } from '@/services/grader/graderSession.service'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { computeAnalytics, DEFAULT_PHYSICAL_CONFIG } from '@/services/grader/graderAnalytics'
import { computeDeterministicInsights } from '@/services/grader/graderInsights'
import {
  type ShoplogixShiftWindow,
} from '@/services/grader/graderSegmenter'
import { loadShoplogixShiftWindows } from '@/services/grader/graderShoplogixWindows'
import { normalizeShiftSchedule, DEFAULT_SHIFT_SCHEDULE } from '@/services/grader/graderShiftSchedule'
import {
  fetchExistingSummaryIds,
  buildDailySummaryId,
} from '@/services/grader/graderDailySummary.service'
import { DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import type { ParsedMatrixData, GateAssignment, GraderAnalysisConfig, GraderDailySummary } from '@/services/grader/types'
import { getDefaultGates, derivarSegmentosTurno, guardarSegmentosTurno } from '@/services/grader/guardarTurnoGrader'

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
  const apple = usePielApple()

  // ── Línea/planta activa — persiste en ?linea= ──
  const lineId = (searchParams.get('linea') as PlantLineId | null) ?? DEFAULT_PLANT_LINE_ID
  const lineConfig = getPlantLineConfig(lineId)

  // Telemetría de uso (25-10-2026): al montar y al cambiar de línea.
  useEffect(() => {
    void registrarVista('periodo', lineId)
  }, [lineId])
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
  const [uploadPanelExpanded, setUploadPanelExpanded] = useState(false)
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
  // Guardado que no avanza: el 08-09 el botón quedó en "Guardando…" para
  // siempre sin que llegara UNA escritura al servidor (pestaña con la conexión
  // de Firestore rota). Sin este aviso el spinner miente.
  const [saveSlow, setSaveSlow] = useState(false)
  useEffect(() => {
    if (!savingToCalendar) { setSaveSlow(false); return }
    const t = window.setTimeout(() => setSaveSlow(true), 60_000)
    return () => window.clearTimeout(t)
  }, [savingToCalendar])
  const [savedToCalendar, setSavedToCalendar] = useState(false)
  // Turnos del último guardado: el banner verde ofrece "Ver turno" por cada
  // uno, sin depender de que la matriz de abajo ya los muestre.
  const [savedShifts, setSavedShifts] = useState<Array<{ dateKey: string; shiftId: string }>>([])
  // Se incrementa al guardar para que la matriz del período se recargue con
  // el Excel recién cargado (antes seguía con el estado previo).
  const [periodVersion, setPeriodVersion] = useState(0)
  // Mensaje de error específico cuando el save a Firestore falla. Antes el
  // catch era silencioso y el banner se quedaba en "guardando…" sin avisar.
  const [saveError, setSaveError] = useState<string | null>(null)
  // IDs de turnos del banner multi-día que ya existen en Firestore
  const [multiDayExistingIds, setMultiDayExistingIds] = useState<Set<string>>(new Set())

  // Estado del panel de resumen mensual — se sincroniza con el calendario embebido
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date())
  const [calendarSummaries, setCalendarSummaries] = useState<GraderDailySummary[]>([])
  const ultimaCarga = useMemo(() => ultimaCargaDateKey(calendarSummaries), [calendarSummaries])
  /* Etapa 0: hasta cuándo hay datos, GLOBAL (Firestore), igual en cualquier PC. Si aún no
     llega, la fila de carga cae al último día con Excel del mes visible. */
  const datosHasta = useDatosGraderHasta(lineConfig.hasGraderData ? lineId : null)
  const textoUltimaCarga = datosHasta.estado === 'listo' && datosHasta.valor
    ? `datos hasta ${ddmmHhmm(datosHasta.valor)}`
    : ultimaCarga ? `último turno con Excel: ${dateKeyDdMm(ultimaCarga)}` : null
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

  // Período único (piel Apple): una sola referencia, el día elegido (o hoy). Día,
  // semana y mes salen de ahí; la matriz toma el mes de esa misma fecha. Mover el
  // período mueve `selectedDateKey` y `calendarMonth`: no hay una segunda fuente.
  const [kpiPeriodo, setKpiPeriodo] = useState<KpiPeriod>('day')
  const referenciaPeriodo = useMemo(
    () => fechaDeClave(selectedDateKey ?? todayDateKey),
    [selectedDateKey, todayDateKey],
  )
  const moverPeriodo = useCallback((dir: -1 | 1) => {
    const nueva = desplazarPeriodo(referenciaPeriodo, kpiPeriodo, dir)
    setSelectedDateKey(claveDeFecha(nueva))
    setCalendarMonth(new Date(nueva.getFullYear(), nueva.getMonth(), 1))
  }, [referenciaPeriodo, kpiPeriodo])

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

  const multiDayInfo = useMemo(
    () => derivarSegmentosTurno(parsedData, shiftSchedule, slxWindows),
    [parsedData, shiftSchedule, slxWindows],
  )

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

  // Si el usuario tocó las gates en esta sesión del wizard, ese seteo manda
  // sobre el "último conocido" al registrar el snapshot inicial de un turno.
  const gatesEditadasRef = useRef(false)

  const handleApplyGateSuggestion = useCallback((payload: { gateNumber: number; calibre: string; quality: string }) => {
    gatesEditadasRef.current = true
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
      await guardarSegmentosTurno({
        multiDayInfo,
        parsedData,
        user,
        gates,
        gatesEditadas: gatesEditadasRef.current,
        lineId,
        isClassificationPlant: lineConfig.isClassificationPlant,
      })
      setSavedToCalendar(true)
      setSavedShifts(multiDayInfo.entries.map(([, s]) => ({ dateKey: s.sessionDate, shiftId: s.shiftId })))
      setPeriodVersion((v) => v + 1)

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
  }, [multiDayInfo, parsedData, user, gates, lineId, lineConfig.isClassificationPlant, navigate])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  const hasData = Boolean(parsedData && parsedData.pieceRecords.length > 0)
  // Líneas sin Grader/Shoplogix (Acopio/Riles): solo Captura Rápida de Intervención.
  const isManual = lineConfig.manualCapture === true

  return (
    // `gap-6` en vez de `space-y-4`: el aire entre secciones es la mitad de lo
    // que hace que una pantalla se lea como Apple y no como panel denso.
    // El mismo tope que el detalle del turno: sin esto el listado llegaba a
    // 1.869 px a 1920 y abrir un turno ENCOGÍA la página 590 px.
    <div className="flex flex-col gap-6 mx-auto w-full max-w-[1760px]">
      {/*
        Encabezado con TÍTULO GRANDE (rol `display`, §2). Antes era `text-xl` con
        un ícono al lado y una regla dura debajo — tres cosas que aplastaban la
        jerarquía: el título competía con los subtítulos de las tarjetas, el
        ícono delante del H1 no es un patrón de Apple (el título va solo), y la
        línea divisoria hacía de "techo" pegando el contenido al encabezado.
        Ahora la separación la da el espacio.
      */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="min-w-0">
            {/* Piel Apple (modo lectura): el titular de la pantalla lo pone el tablero
                («La Baader 2 es la que más pierde…»); el nombre del módulo ya está en el menú. */}
            {(!apple || isManual) && (
              <h1 className={apple ? 'text-display' : 'text-[1.9rem] font-bold leading-none tracking-[-0.028em] lg:text-[2.15rem]'}>
                Análisis de turno
              </h1>
            )}
            {lineConfig.hasGraderData && <DatosGraderHasta lineId={lineId} className="mt-2" />}
            {lineId === DEFAULT_PLANT_LINE_ID && <div className="mt-2"><CargaAutomaticaAviso /></div>}
            {/* Piel Apple: el subtítulo «Línea completa Grader + Baaders» sale; las otras dos líneas lo mantienen. */}
            {!(apple && lineConfig.hasGraderData && lineConfig.isClassificationPlant !== false) && (
            <p className="mt-2 text-[0.85rem] text-muted-foreground">
              {lineConfig.hasGraderData
                ? lineConfig.isClassificationPlant === false
                  ? `${lineConfig.label} · eviscerado simplificado — Excel del Marelec`
                  : 'Línea completa Grader + Baaders — carga de Excel del Grader'
                : lineConfig.manualCapture
                  ? `${lineConfig.description} · voz → IA → historial de Mantención`
                  : `${lineConfig.description} · datos Shoplogix`}
            </p>
            )}
          </div>
          {/* El botón "Cargar Excel" se movió al lado de las pestañas de
              planta para que quede claro a qué planta se está cargando. */}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lineConfig.hasGraderData && autosaveState !== 'idle' && (
            <Badge
              variant="outline"
              className={
                autosaveState === 'saved' ? 'text-ink-ok border-success/[0.25]' :
                autosaveState === 'saving' ? 'text-ink-info border-primary/[0.25]' :
                autosaveState === 'error' ? 'text-ink-warn border-warning/[0.25]' :
                'text-muted-foreground border-muted'
              }
            >
              {autosaveState === 'saving' && <><Loader2 className="h-3 w-3 animate-spin mr-1" />Guardando…</>}
              {autosaveState === 'saved' && <>Guardado {autosaveUpdatedAt ? new Date(autosaveUpdatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</>}
              {autosaveState === 'error' && <>Error al guardar (respaldo local activo)</>}
              {autosaveState === 'queued' && <>Guardado pendiente</>}
            </Badge>
          )}
          <Button variant="outline" onClick={() => navigate('/analisis-grader/periodo')} className="border-transparent text-brand-ink hover:bg-primary/10">
            <BarChart3 className="h-4 w-4 mr-1.5" />
            {apple ? 'Análisis del período' : <><span className="hidden sm:inline">Análisis </span>período</>}
          </Button>
        </div>
      </div>

      {/* Banner: turnos detectados — listo para guardar.
          Posicionado ARRIBA (después del header, antes del Grid de pestañas)
          para que sea visible al instante después de soltar un Excel. Antes
          vivía al fondo de la página (bajo el calendario) y el usuario no lo
          veía → daba la impresión de que "no pasaba nada". */}
      {multiDayInfo && !savedToCalendar && (
        <Card className="bg-card shadow-md">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Upload className="h-4 w-4 text-ink-info shrink-0 animate-pulse" />
              <div className="text-sm min-w-0">
                <p>
                  <span className="font-semibold text-primary">
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
                <p className="text-caption text-ink-info mt-0.5">
                  Se guardará en <b>{lineConfig.label}</b>
                  {multiDayCounts && multiDayCounts.replace > 0 && (
                    <>
                      {' · '}
                      <span className="text-ink-ok font-medium">{multiDayCounts.new} nuevo{multiDayCounts.new !== 1 ? 's' : ''}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-ink-warn font-medium">{multiDayCounts.replace} reemplazo{multiDayCounts.replace !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </p>
                {avisoDeTurnosSinPiezas(multiDayInfo.segmentosConPiezas, multiDayInfo.segmentosSoloP0) && (
                  <p className="text-caption text-ink-warn mt-1" data-testid="wizard-turnos-sin-piezas">
                    {avisoDeTurnosSinPiezas(multiDayInfo.segmentosConPiezas, multiDayInfo.segmentosSoloP0)}
                  </p>
                )}
                {parsedData?.inferred?.p0CoverageWarning && (
                  <p className="text-caption text-ink-warn mt-1" data-testid="wizard-p0-cobertura">{parsedData.inferred.p0CoverageWarning}</p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              disabled={savingToCalendar}
              onClick={handleSaveToCalendar}
              className="bg-primary/[0.12] hover:bg-primary/[0.12] text-brand-ink shrink-0 shadow-sm"
            >
              {savingToCalendar
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Guardando…</>
                : <><Calendar className="h-3.5 w-3.5 mr-1.5" />Guardar en Calendario</>
              }
            </Button>
          </CardContent>
          {saveSlow && (
            <CardContent className="pt-0 pb-3 px-4" data-testid="wizard-save-slow">
              <p className="text-footnote text-ink-warn">
                Lleva más de un minuto y no llegó nada al servidor. Casi siempre es una pestaña con la
                conexión caída: cierra <span className="font-medium">todas</span> las pestañas de la app
                (incluida la del monitor), ábrela de nuevo y vuelve a guardar. El Excel no se pierde.
              </p>
            </CardContent>
          )}
        </Card>
      )}
      {savedToCalendar && (
        <Card className="border-transparent bg-success/[0.15]">
          <CardContent className="py-3 px-4 flex items-center gap-2 flex-wrap">
            <CheckCircle2 className="h-4 w-4 text-ink-ok shrink-0" />
            <p className="text-sm text-ink-ok font-medium flex-1 min-w-[16rem]">
              Guardado correctamente en <b>{lineConfig.label}</b>
              {savedShifts.length > 1 ? ' · elige qué turno abrir, o carga otro Excel.' : ' · abriendo el turno…'}
            </p>
            {/* Salida directa al detalle de cada turno guardado. La matriz de
                abajo no siempre lo ofrece: un turno en curso sin celda no se
                puede tocar, y el usuario quedaba sin "Ver turno". */}
            {savedShifts.map((s) => (
              <Button
                key={`${s.dateKey}__${s.shiftId}`}
                size="sm"
                variant="outline"
                className="text-ink-ok shrink-0"
                onClick={() => {
                  const linea = lineId !== DEFAULT_PLANT_LINE_ID ? `?linea=${encodeURIComponent(lineId)}` : ''
                  navigate(`/analisis-grader/turno/${s.dateKey}__${encodeURIComponent(s.shiftId)}${linea}`)
                }}
              >
                Ver turno {s.dateKey.slice(8, 10)}/{s.dateKey.slice(5, 7)} · {s.shiftId} →
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
      {saveError && (
        <Card className="border-transparent bg-destructive/[0.15]">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-ink-crit shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink-crit font-medium">No se pudo guardar el turno</p>
              <p className="text-xs text-ink-crit/90 dark:text-ink-crit/80 mt-0.5 break-words">{saveError}</p>
              <p className="text-caption text-ink-crit/70 dark:text-ink-crit/60 mt-1">
                El Excel sigue cargado en cola — puedes volver a presionar "Guardar en Calendario" para reintentar.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-ink-crit hover:bg-destructive/[0.15] shrink-0"
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

      {/* Piel Apple: el período único (Día/Semana/Mes y «‹ 7 nov ›») gobierna el tablero y la matriz. */}
      {apple && !isManual && (
        <PeriodoNavegador
          period={kpiPeriodo}
          onPeriodChange={setKpiPeriodo}
          referencia={referenciaPeriodo}
          onStep={moverPeriodo}
        />
      )}

      {/* ═══ Indicadores del período ═══ */}
      {!isManual && (
      <>
      {apple ? (
        /* Piel Apple, modo lectura (opción A, «secciones pareadas»): el titular cruza
           las dos columnas y debajo van pares con filete, 7/5 en PC: «Por máquina» con
           «Cómo se usó el día» y «Por qué se detuvo» con el mes. En el celular, una
           columna: máquinas, por qué, el día y el mes (`max-lg:order-*` los deja al final). */
        <>
          <div className="flex items-start gap-2">
            <PlantLineTabs selected={lineId} onSelect={handleLineSelect} className="min-w-0 flex-1" />
            <BotonMonitorLinea linea={lineConfig} />
          </div>
          <div className="grid grid-cols-1 items-start gap-y-[26px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-12" data-testid="periodo-lectura">
            <PlantKPIBoard
              period={kpiPeriodo}
              onPeriodChange={setKpiPeriodo}
              plantSlug={lineConfig.plantSlug}
              plantLineId={lineId}
              graderSummaries={calendarSummaries}
              enabled={lineConfig.shoplogixEnabled && !lineConfig.comingSoon}
              selectedDateKey={selectedDateKey}
              currentMonth={calendarMonth}
              ranuras={{
                cabecera: <CurrentShiftChip plantLineId={lineId} lectura />,
                titular: 'lg:col-span-2 lg:row-start-1',
                maquinas: 'lg:col-start-1 lg:row-start-2',
              }}
            />
            <div className="flex flex-col gap-[26px] max-lg:order-1 lg:col-start-2 lg:row-start-2">
              <DayTimeSummaryBar
                dateKey={selectedDateKey ?? todayDateKey}
                plantSlug={lineConfig.plantSlug}
                enabled={lineConfig.shoplogixEnabled && !lineConfig.comingSoon}
              />
              {/* El grader es un extra de Shoplogix con lugar FIJO: sin exporte del
                  día deja su hueco en vez de desaparecer (mockup `analisis.html`). */}
              {lineConfig.hasGraderData && (
                <GraderDelDiaBloque
                  summaries={calendarSummaries}
                  dateKey={selectedDateKey ?? todayDateKey}
                  onSubirExporte={() => {
                    setUploadPanelExpanded(true)
                    document.getElementById('cargar-excel-grader')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                />
              )}
            </div>
            <GraderMonthlyStatsPanel
              currentMonth={calendarMonth}
              summaries={calendarSummaries}
              slxStats={calendarSlxStats}
              isClassificationPlant={lineConfig.isClassificationPlant !== false}
              tieneGrader={lineConfig.hasGraderData !== false}
              plantSlug={lineConfig.shoplogixEnabled && !lineConfig.comingSoon ? lineConfig.plantSlug : null}
              ranuras={{
                porQue: 'lg:col-start-1 lg:row-start-3',
                mes: 'max-lg:order-2 lg:col-start-2 lg:row-start-3',
              }}
            />
          </div>
        </>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Col izquierda: pestañas + KPI */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <PlantLineTabs selected={lineId} onSelect={handleLineSelect} className="w-full" />
            <CurrentShiftChip plantLineId={lineId} />
          </div>
          <PlantKPIBoard
            period={kpiPeriodo}
            onPeriodChange={setKpiPeriodo}
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
          tieneGrader={lineConfig.hasGraderData !== false}
          plantSlug={lineConfig.shoplogixEnabled && !lineConfig.comingSoon ? lineConfig.plantSlug : null}
        />
      </div>
      )}

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
        refreshKey={periodVersion}
        onSelectShift={(s) => setSelectedDateKey(s.dateKey)}
        onOpenShift={(s) => {
          // Ruta CANÓNICA del detalle de turno. Antes apuntaba a
          // `/analisis-grader?date=…&autoload=1`, que no hacía nada: ya
          // estamos en esa ruta, así que React Router no remontaba nada.
          const linea = lineId !== DEFAULT_PLANT_LINE_ID ? `?linea=${encodeURIComponent(lineId)}` : ''
          navigate(`/analisis-grader/turno/${s.dateKey}__${encodeURIComponent(s.shiftId)}${linea}`)
        }}
      />

      {/* «Cargar Excel del Grader»: fila delgada al final. Los indicadores van
          primero; la carga es poco frecuente pero sigue a un toque. Mismo
          cargador de siempre. La fecha sale de los resúmenes del mes visible
          (0 lecturas extra); si el mes no tiene ninguno, lo dice. */}
      {lineConfig.hasGraderData && (
        <div id="cargar-excel-grader" className="scroll-mt-4">
          <button
            type="button"
            onClick={() => setUploadPanelExpanded((v) => !v)}
            aria-expanded={uploadPanelExpanded}
            className="w-full flex min-h-[44px] items-center gap-2 rounded-full bg-muted/50 px-4 text-footnote text-muted-foreground hover:text-foreground transition-colors"
            title={uploadPanelExpanded ? 'Ocultar el panel de carga' : 'Mostrar el panel de carga'}
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            {apple ? (
              // Piel Apple: el rótulo solo, y la situación del mes en su propia línea de 13 px (sin truncar).
              <span className="flex-1 text-left min-w-0">
                <span className="block text-subhead text-foreground">Cargar Excel del Grader</span>
                <span className="block text-footnote text-muted-foreground tabular-nums">
                  {textoUltimaCarga ?? 'Sin Excel este mes'}
                </span>
              </span>
            ) : (
            <span className="flex-1 text-left min-w-0 truncate">
              Cargar Excel del Grader
              <span className="text-muted-foreground/70 tabular-nums">
                {' · '}
                {textoUltimaCarga ?? 'sin Excel en este mes'}
              </span>
            </span>
            )}
            {lineId === DEFAULT_PLANT_LINE_ID && <EtiquetaCargaAutomatica />}
            {!uploadPanelExpanded && uploadedFiles.length > 0 && (
              <span className="text-caption px-1.5 rounded-ctl bg-primary/[0.15] text-brand-ink font-medium shrink-0">
                {uploadedFiles.length} archivo{uploadedFiles.length === 1 ? '' : 's'}
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-transform',
                uploadPanelExpanded && 'rotate-180',
              )}
            />
          </button>
          {uploadPanelExpanded && (
            <div className="pt-2">
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

