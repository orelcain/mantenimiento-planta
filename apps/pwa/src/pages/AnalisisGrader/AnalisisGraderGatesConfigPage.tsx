/**
 * P2) Configuración de Gates (12 compuertas)
 *
 * Tabla editable, guardar/cargar plantillas, configuración del análisis.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSuggestionEngine } from '@/services/grader/suggestions/useSuggestionEngine'
import { fmt } from '@/lib/format'
import { logger } from '@/lib/logger'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Label } from '@/components/ui'
import { Save, FolderOpen, Trash2, ChevronDown, Settings2, RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore, useIsAdmin } from '@/store'
import {
  saveGatesTemplate,
  listGatesTemplates,
  deleteGatesTemplate,
  type GatesTemplate,
} from '@/services/grader/graderSession.service'
import { getModuleRanges, saveModulePhysicalConfig, saveModuleShiftSchedule } from '@/services/grader/graderModuleConfig.service'
import { getPlantLineConfig, DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'
import { saveShiftCalibreRanges, saveShiftThresholds } from '@/services/grader/graderShifts.service'
import { saveConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { listDailySummariesByRange } from '@/services/grader/graderDailySummary.service'
import { useGraderSelectionStore } from '@/store/graderSelectionStore'
import type { GraderDailySummary } from '@/services/grader/types'
import { DEFAULT_SHIFT_SCHEDULE, formatShiftTime, normalizeShiftSchedule, parseShiftTime } from '@/services/grader/graderShiftSchedule'
import type {
  GateAssignment,
  GraderAnalysisConfig,
  GraderPhysicalConfig,
  ParsedMatrixData,
  GraderQuality,
  GraderConservation,
  GraderProduct,
  CalibreRange,
  CalibreWeightRange,
} from '@/services/grader/types'
import { CALIBRE_WEIGHT_RANGES, DEFAULT_PHYSICAL_CONFIG } from '@/services/grader/graderAnalytics'
import { getGradingBelt, GRADING_BELT_DEFAULT_MPS } from '@/services/grader/graderBeltHelpers'
import { GlobalSettingsModal } from '@/components/grader/GlobalSettingsModal'
import { useConfigChangeLogger } from '@/services/grader/useConfigChangeLogger'
import { InfoTooltip } from '@/components/ui'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { SPECIES_ALLOMETRY, type BatchStats } from '@/components/grader/tabs/gatesConfig/GatesConfigShared'


interface Props {
  gates: GateAssignment[]
  config: GraderAnalysisConfig
  parsedData: ParsedMatrixData
  onComplete: (gates: GateAssignment[], config: GraderAnalysisConfig) => void
  /** Si true, muestra navegación por pestañas en lugar de cards apiladas */
  tabbed?: boolean
  /** ID del turno activo — habilita override de rangos + umbrales por turno */
  shiftDocId?: string
  /** Rangos override ya cargados desde el turno (para no re-fetchear) */
  shiftCalibreOverride?: CalibreWeightRange[] | null
  /** Callback al guardar override de rangos por turno */
  onShiftRangesSaved?: (ranges: CalibreWeightRange[] | null) => void
  /** Umbrales override ya cargados desde el turno */
  shiftThresholdsOverride?: { photocellPctWarn: number; outOfLimitsPctWarn: number; pointZeroPctWarn: number; pointZeroPctCritical: number } | null
  /** Callback al guardar/quitar override de umbrales por turno */
  onShiftThresholdsSaved?: (t: { photocellPctWarn: number; outOfLimitsPctWarn: number; pointZeroPctWarn: number; pointZeroPctCritical: number } | null) => void
}

const QUALITIES: GraderQuality[] = ['Premium', 'Grado', 'Industrial', 'D', 'Unknown']
const DEFAULT_CALIBRES: CalibreRange[] = ['0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', 'Other']


function buildRangeLabel(calibre: string, minGrams: number, maxGrams: number): string {
  return `${calibre} (${fmt(minGrams)}-${fmt(maxGrams)} g)`
}

/** Lookup rango peso por calibre — usa custom ranges si existen */
function calibreRangeLookup(calibre: string, ranges: CalibreWeightRange[]): string {
  const r = ranges.find((w) => w.calibre === calibre)
  if (!r) return '—'
  return r.label || buildRangeLabel(r.calibre, r.minGrams, r.maxGrams)
}

/** Indicador global de estado de auto-guardado. */
function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' }) {
  if (status === 'idle') return null
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-ink-warn font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        Guardando…
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-caption text-ink-ok font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Guardado
    </span>
  )
}

const VALID_TABS = ['analisis', 'gates', 'rangos'] as const
type ConfigTab = (typeof VALID_TABS)[number]

export function AnalisisGraderGatesConfigPage({
  gates: initialGates,
  config: initialConfig,
  parsedData,
  onComplete,
  tabbed = false,
  shiftDocId,
  shiftCalibreOverride,
  onShiftRangesSaved,
  shiftThresholdsOverride,
  onShiftThresholdsSaved,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  // Planta activa desde URL ?linea= (mismo param que LandingPage)
  const plantLineId: PlantLineId = (searchParams.get('linea') as PlantLineId | null) ?? DEFAULT_PLANT_LINE_ID
  const plantLineConfig = getPlantLineConfig(plantLineId)
  const [gates, setGates] = useState<GateAssignment[]>(initialGates)
  const [config, setConfig] = useState<GraderAnalysisConfig>(initialConfig)
  // Tab inicial: lee ?tab= de la URL si está presente y es válido, sino 'analisis'
  const initialTabFromUrl = useMemo<ConfigTab>(() => {
    const t = searchParams.get('tab')
    return (VALID_TABS as readonly string[]).includes(t ?? '') ? (t as ConfigTab) : 'analisis'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // solo al montar
  const [activeTab, setActiveTab] = useState<ConfigTab>(initialTabFromUrl)

  // Sync URL ← state cuando user cambia tab manualmente (solo en modo tabbed)
  useEffect(() => {
    if (!tabbed) return
    const current = searchParams.get('tab')
    if (activeTab !== 'analisis' && current !== activeTab) {
      const next = new URLSearchParams(searchParams)
      next.set('tab', activeTab)
      setSearchParams(next, { replace: true })
    } else if (activeTab === 'analisis' && current) {
      const next = new URLSearchParams(searchParams)
      next.delete('tab')
      setSearchParams(next, { replace: true })
    }
  }, [activeTab, tabbed, searchParams, setSearchParams])
  // ── Rangos por turno ────────────────────────────────────────────────────
  const [editingShiftRanges, setEditingShiftRanges] = useState(false)
  const [shiftRangesDraft, setShiftRangesDraft] = useState<CalibreWeightRange[]>([])
  const [savingShiftRanges, setSavingShiftRanges] = useState(false)

  // ── Umbrales por turno ──────────────────────────────────────────────────
  const [savingShiftThresholds, setSavingShiftThresholds] = useState(false)
  const hasShiftThresholdsOverride = !!(shiftThresholdsOverride)
  // Valores efectivos: override turno > global
  const effectiveThresholds = shiftThresholdsOverride ?? config.errorThresholds

  const [templates, setTemplates] = useState<GatesTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showWeightRanges, setShowWeightRanges] = useState(true)
  const [shiftSchedule, setShiftSchedule] = useState(() => plantLineConfig.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE)
  // Guard: autosave no dispara hasta que la carga inicial desde Firestore complete.
  // Previene sobreescribir datos reales con DEFAULTs si la red es lenta.
  const moduleConfigLoadedRef = useRef(false)
  const [physicalConfig, _setPhysicalConfigRaw] = useState<GraderPhysicalConfig>(DEFAULT_PHYSICAL_CONFIG)
  // FASE 6 — logger de cambios: cada setPhysicalConfig persiste diff en Firestore
  const setPhysicalConfig = useConfigChangeLogger(physicalConfig, _setPhysicalConfigRaw, { enabledRef: moduleConfigLoadedRef })
  const [loadedSchedule, setLoadedSchedule] = useState(() => plantLineConfig.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE)
  const user = useAuthStore((s) => s.user)
  const isAdmin = useIsAdmin()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const sortRanges = (ranges: CalibreWeightRange[]) =>
    [...ranges].sort((a, b) => a.minGrams - b.minGrams)

  // Active weight ranges: turno override > global custom > hardcoded defaults
  const activeRanges = useMemo<CalibreWeightRange[]>(() => {
    if (shiftCalibreOverride && shiftCalibreOverride.length > 0) return sortRanges(shiftCalibreOverride)
    const base = config.customWeightRanges && config.customWeightRanges.length > 0
      ? config.customWeightRanges
      : CALIBRE_WEIGHT_RANGES
    return sortRanges(base)
  }, [shiftCalibreOverride, config.customWeightRanges])

  const availableCalibres = useMemo<CalibreRange[]>(() => {
    const fromRanges = activeRanges.map((r) => r.calibre).filter(Boolean)
    const merged = [...fromRanges, ...DEFAULT_CALIBRES]
    return Array.from(new Set(merged))
  }, [activeRanges])

  const hasShiftOverride = !!(shiftCalibreOverride && shiftCalibreOverride.length > 0)
  const isCustomRanges = hasShiftOverride || !!(config.customWeightRanges && config.customWeightRanges.length > 0)

  // Peso mediano del lote actual (gramos) — desde pieceRecords del Excel cargado
  const medianWeightG = useMemo(() => {
    const weights = parsedData.pieceRecords
      .map((r) => r.weightPerPieceGrams ?? (r.weightKg != null ? r.weightKg * 1000 : null))
      .filter((w): w is number => w != null && w > 50 && w < 15000)
    if (weights.length < 10) return null
    weights.sort((a, b) => a - b)
    return weights[Math.floor(weights.length / 2)]
  }, [parsedData.pieceRecords])

  // Summary histórico seleccionado en el calendario (store compartido).
  // Fallback: si nada seleccionado, usa el summary más reciente de los últimos 60 días.
  const selectedFromCalendar = useGraderSelectionStore((s) => s.selectedHistorical)
  const [fallbackSummaries, setFallbackSummaries] = useState<GraderDailySummary[]>([])

  useEffect(() => {
    const today = new Date()
    const end = today.toISOString().slice(0, 10)
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 60)
    const start = startDate.toISOString().slice(0, 10)
    listDailySummariesByRange(start, end)
      .then((summaries) => {
        const withWeight = summaries.filter(
          (s) => typeof s.avgWeightGrams === 'number' && s.avgWeightGrams > 50 && s.avgWeightGrams < 15000,
        )
        withWeight.sort((a, b) => {
          const byDate = b.dateKey.localeCompare(a.dateKey)
          if (byDate !== 0) return byDate
          const order: Record<string, number> = { 'Turno día': 0, 'Turno noche': 1 }
          return (order[a.shiftId] ?? 9) - (order[b.shiftId] ?? 9)
        })
        setFallbackSummaries(withWeight)
      })
      .catch(() => {})
  }, [])

  // Summary efectivamente usado: prioriza el del calendario, cae al más reciente
  const historicalMedianG = useMemo(() => {
    const chosen = selectedFromCalendar ?? fallbackSummaries[0] ?? null
    if (!chosen || !chosen.avgWeightGrams) return null
    return {
      value: Math.round(chosen.avgWeightGrams),
      dateKey: chosen.dateKey,
      shiftId: chosen.shiftId,
      id: chosen.id,
      totalPieces: chosen.totalPieces,
      totalWeightKg: chosen.totalWeightKg,
      durationMinutes: chosen.durationMinutes,
      productionRatePerHour: chosen.productionRatePerHour,
      fromCalendar: selectedFromCalendar !== null,
    }
  }, [selectedFromCalendar, fallbackSummaries])

  // Peso efectivo para el cálculo alométrico: prioriza Excel, luego manual, luego histórico
  const effectiveMedianG = medianWeightG ?? historicalMedianG?.value ?? null
  const medianSource: 'excel' | 'manual' | 'historical' | null =
    medianWeightG != null ? 'excel'
    : historicalMedianG != null ? 'historical'
    : null

  // Dimensiones sugeridas por alometría según especie y peso mediano
  const suggestedDimensions = useMemo(() => {
    if (!effectiveMedianG || !physicalConfig.species) return null
    const { a, b, widthRatio } = SPECIES_ALLOMETRY[physicalConfig.species]
    const lengthCm = Math.round((effectiveMedianG / a) ** (1 / b))
    const widthCm = Math.round(lengthCm * widthRatio)
    return { lengthCm, widthCm, medianWeightG: effectiveMedianG }
  }, [effectiveMedianG, physicalConfig.species])

  // Estadísticas del lote: percentiles, CV, calibre dominante, throughput
  const batchStats = useMemo((): BatchStats | null => {
    const records = parsedData.pieceRecords
    if (records.length === 0) return null
    const weights = records
      .map((r) => r.weightPerPieceGrams ?? (r.weightKg != null ? r.weightKg * 1000 : null))
      .filter((w): w is number => w != null && w > 50 && w < 15000)
    if (weights.length < 2) return null
    weights.sort((a, b) => a - b)
    const n = weights.length
    const p10 = weights[Math.floor(n * 0.1)]! / 1000
    const p50 = weights[Math.floor(n * 0.5)]! / 1000
    const p90 = weights[Math.floor(n * 0.9)]! / 1000
    const mean = weights.reduce((s, v) => s + v, 0) / n
    const variance = weights.reduce((s, v) => s + (v - mean) ** 2, 0) / n
    const cv = (Math.sqrt(variance) / mean) * 100
    const calibreCounts: Record<string, number> = {}
    for (const r of records) {
      if (r.calibre) calibreCounts[r.calibre] = (calibreCounts[r.calibre] ?? 0) + 1
    }
    const dominantCalibre = Object.entries(calibreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    const timestamps = records
      .map((r) => new Date(r.ts).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b)
    let throughputPzPerMin: number | null = null
    let windowMinutes: number | null = null
    let peakPzPerMin: number | null = null
    if (timestamps.length >= 2) {
      const spanMs = timestamps[timestamps.length - 1]! - timestamps[0]!
      windowMinutes = spanMs / 60000
      if (windowMinutes > 0) throughputPzPerMin = records.length / windowMinutes
      // Pico: máximo N piezas en cualquier ventana rodante de 60s
      const minuteBuckets: Record<number, number> = {}
      for (const ts of timestamps) {
        const minuteKey = Math.floor(ts / 60000)
        minuteBuckets[minuteKey] = (minuteBuckets[minuteKey] ?? 0) + 1
      }
      const counts = Object.values(minuteBuckets)
      if (counts.length > 0) peakPzPerMin = Math.max(...counts)
    }
    return { n: records.length, p10, p50, p90, cv, dominantCalibre, throughputPzPerMin, peakPzPerMin, windowMinutes }
  }, [parsedData.pieceRecords])

  // Cálculos de cadencia/ratio para el motor de sugerencias (misma lógica que tab Producto)
  const _sgBelt = getGradingBelt(physicalConfig)
  const _sgSpeed = _sgBelt?.speedMps ?? GRADING_BELT_DEFAULT_MPS
  const _sgLengthM = physicalConfig.avgSalmonLengthCm / 100
  const _sgCadenceHistorical = historicalMedianG?.productionRatePerHour
    ? historicalMedianG.productionRatePerHour / 60
    : historicalMedianG?.durationMinutes && historicalMedianG.durationMinutes > 0
      ? historicalMedianG.totalPieces / historicalMedianG.durationMinutes
      : null
  const _sgCadence = batchStats?.throughputPzPerMin
    ?? _sgCadenceHistorical
    ?? (physicalConfig.pocketCount * 60) / 3.0
  const _sgSpacing = _sgSpeed * (60 / _sgCadence)
  const _sgRatio = _sgLengthM / _sgSpacing
  const _sgCadenceSource: 'excel' | 'historical' | 'theoretical' =
    batchStats?.throughputPzPerMin ? 'excel'
    : _sgCadenceHistorical ? 'historical'
    : 'theoretical'

  // El engine se mantiene por sus efectos sobre physicalConfig; su salida
  // la consumía el sub-tab "Sugerencias" de la config física, ya retirado.
  useSuggestionEngine({
    physicalConfig,
    setPhysicalConfig,
    medianWeightG: effectiveMedianG,
    medianSource,
    lengthToSpacingRatio: _sgRatio,
    overlapping: _sgRatio >= 1,
    cadencePiecesPerMin: _sgCadence,
    cadenceSource: _sgCadenceSource,
    historicalSummaries: fallbackSummaries,
  })

  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false)

  function handleGlobalSettingsClose(open: boolean) {
    setGlobalSettingsOpen(open)
    if (!open) {
      getModuleRanges(plantLineId).then((cfg) => {
        if (cfg?.customWeightRanges && cfg.customWeightRanges.length > 0) {
          setConfig((c) => ({ ...c, customWeightRanges: cfg.customWeightRanges }))
        } else {
          setConfig((c) => ({ ...c, customWeightRanges: [] }))
        }
      }).catch(() => {})
    }
  }

  const updateShiftSchedule = (idx: number, patch: Partial<typeof shiftSchedule[number]>) => {
    setShiftSchedule((prev) => {
      const next = [...prev]
      const current = next[idx]
      if (!current) return prev
      next[idx] = { ...current, ...patch }
      return next
    })
  }

  const isScheduleDirty = JSON.stringify(shiftSchedule) !== JSON.stringify(loadedSchedule)

  const shiftGapMinutes = useMemo(() => {
    const toMin = (h: number, m: number) => h * 60 + m
    const covered = shiftSchedule.reduce((sum, s) => {
      const start = toMin(s.startHour, s.startMinute)
      const end = toMin(s.endHour, s.endMinute)
      const dur = end <= start ? 1440 - start + end : end - start
      return sum + dur
    }, 0)
    return Math.max(0, 1440 - covered)
  }, [shiftSchedule])

  useEffect(() => {
    listGatesTemplates().then((list) => {
      setTemplates(list)
      // Auto-cargar "Plantilla 1" como base por defecto
      const plantilla1 = list.find((t) => t.name === 'Plantilla 1') || list[0]
      if (plantilla1 && !activeTemplateName) {
        setGates(plantilla1.gates)
        if (plantilla1.deviceId) setConfig((c) => ({ ...c, deviceId: plantilla1.deviceId }))
        setActiveTemplateName(plantilla1.name)
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar rangos globales del modulo (por planta)
  useEffect(() => {
    getModuleRanges(plantLineId)
      .then((cfg) => {
        if (cfg?.customWeightRanges && cfg.customWeightRanges.length > 0) {
          setConfig((c) => ({ ...c, customWeightRanges: cfg.customWeightRanges }))
        }
        const normalized = normalizeShiftSchedule(cfg?.shiftSchedule, plantLineConfig.defaultShiftSchedule)
        setShiftSchedule(normalized)
        setLoadedSchedule(normalized)
        if (cfg?.physicalConfig) {
          setPhysicalConfig(cfg.physicalConfig)
          setConfig((c) => ({ ...c, physicalConfig: cfg.physicalConfig }))
        }
      })
      .catch(() => {})
      .finally(() => {
        moduleConfigLoadedRef.current = true
      })
  // plantLineId no puede cambiar en esta página sin recargar → solo al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPhysicalConfig])

  // Autosave physicalConfig (debounce)
  useEffect(() => {
    if (!user || !moduleConfigLoadedRef.current) return
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      saveModulePhysicalConfig({ physicalConfig, updatedBy: user.id, plantLineId })
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('idle'))
    }, 1000)
    return () => clearTimeout(timer)
  }, [physicalConfig, user, plantLineId])

  // Autosave shiftSchedule (debounce)
  useEffect(() => {
    if (!user || !moduleConfigLoadedRef.current) return
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      saveModuleShiftSchedule({ schedule: shiftSchedule, updatedBy: user.id, plantLineId })
        .then(() => {
          setLoadedSchedule(shiftSchedule)
          setSaveStatus('saved')
        })
        .catch(() => setSaveStatus('idle'))
    }, 1000)
    return () => clearTimeout(timer)
  }, [shiftSchedule, user, plantLineId])

  // Auto-clear: 'saved' vuelve a 'idle' tras 2s para que el indicador se oculte
  useEffect(() => {
    if (saveStatus !== 'saved') return
    const timer = setTimeout(() => setSaveStatus('idle'), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // Sync auto-sugeridas: aplicar suggestedDimensions al physicalConfig cuando:
  //   a) suggestedDimensions cambia (especie o peso mediano)
  //   b) el usuario toggle Auto ON (autoSuggestions.* → true)
  //   c) physicalConfig se carga de Firestore con autoSuggestions=true y ya hay datos
  // Sin loop: si el valor ya está sincronizado, setPhysicalConfig retorna el mismo objeto.
  useEffect(() => {
    if (!suggestedDimensions) return
    setPhysicalConfig((p) => {
      let changed = false
      const next = { ...p }
      if (p.autoSuggestions?.avgSalmonLengthCm && p.avgSalmonLengthCm !== suggestedDimensions.lengthCm) {
        next.avgSalmonLengthCm = suggestedDimensions.lengthCm
        changed = true
      }
      if (p.autoSuggestions?.avgSalmonWidthCm && p.avgSalmonWidthCm !== suggestedDimensions.widthCm) {
        next.avgSalmonWidthCm = suggestedDimensions.widthCm
        changed = true
      }
      return changed ? next : p
    })
  }, [suggestedDimensions, physicalConfig.autoSuggestions?.avgSalmonLengthCm, physicalConfig.autoSuggestions?.avgSalmonWidthCm, setPhysicalConfig])

  // Propagar cambios al parent (debounce) — reemplaza al antiguo botón "Aplicar configuración".
  // El parent (Wizard) necesita gates + config + physicalConfig actualizados para que el
  // Dashboard y analyticsResult reflejen los cambios del usuario en la sesión actual.
  useEffect(() => {
    if (!moduleConfigLoadedRef.current) return
    const timer = setTimeout(() => {
      onComplete(gates, { ...config, physicalConfig })
      // Snapshot cronológico: solo si hay turno histórico activo (FASE 27)
      if (selectedFromCalendar && user) {
        saveConfigSnapshot(
          selectedFromCalendar.id,
          gates,
          { uid: user.id, name: `${user.nombre} ${user.apellido}`.trim() },
        ).catch(_err => logger.warn('FASE 27: snapshot gates falló, continuando'))
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [gates, config, physicalConfig, onComplete, selectedFromCalendar, user])

  const updateGate = (idx: number, patch: Partial<GateAssignment>) => {
    setGates((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)))
  }

  // Genera nombre de plantilla basado en fecha y turno con auto-versionado
  const autoTemplateName = useMemo(() => {
    const dateStr = parsedData.inferred.startAt
      ? new Date(parsedData.inferred.startAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    const shift = config.shiftId || 'Turno noche'
    const base = `${dateStr}_${shift}`
    // Contar versiones existentes con el mismo base
    const existing = templates.filter((t) => t.name.startsWith(base))
    if (existing.length === 0) return base
    return `${base}_v${existing.length + 1}`
  }, [parsedData.inferred.startAt, config.shiftId, templates])

  const handleSaveTemplate = async () => {
    const name = templateName.trim() || autoTemplateName
    if (!name || !user) return
    const tmpl = await saveGatesTemplate({
      name,
      deviceId: config.deviceId,
      gates,
      createdBy: user.id,
    })
    setTemplates((prev) => [tmpl, ...prev])
    setTemplateName('')
    setActiveTemplateName(name)
    // Guardar referencia como última plantilla usada
    try {
      localStorage.setItem('grader_last_template', JSON.stringify({
        templateId: tmpl.id,
        templateName: name,
        date: parsedData.inferred.startAt ? new Date(parsedData.inferred.startAt).toISOString().slice(0, 10) : null,
        shiftId: config.shiftId,
      }))
    } catch { /* localStorage no disponible */ }
  }

  const handleLoadTemplate = (tmpl: GatesTemplate) => {
    setGates(tmpl.gates)
    if (tmpl.deviceId) setConfig((c) => ({ ...c, deviceId: tmpl.deviceId }))
    setActiveTemplateName(tmpl.name)
    setShowTemplates(false)
  }

  const handleDeleteTemplate = async (id: string) => {
    await deleteGatesTemplate(id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  const TABS = [
    { id: 'analisis', label: 'Análisis' },
    { id: 'gates',   label: '12 Gates' },
    { id: 'rangos',  label: 'Rangos' },
  ] as const

  return (
    <div className="space-y-4">
      {/* Tab bar — solo en modo tabbed */}
      {tabbed && (
        <div className="flex items-center border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.id
                  ? 'border-emerald-500 text-ink-ok'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
              )}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto pr-2">
            <SaveIndicator status={saveStatus} />
          </div>
        </div>
      )}

      {/* 3.1 Configuración del Análisis */}
      {(!tabbed || activeTab === 'analisis') && (
      <Card className="relative">
        <CardHeader>
          <CardTitle className="text-base">
            Configuración del Análisis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">Umbrales de alerta</h3>
            {shiftDocId && (
              <div className="flex items-center gap-2">
                {hasShiftThresholdsOverride ? (
                  <Badge className="text-caption bg-primary/[0.15] text-blue-400 border-primary/[0.25]">Override de este turno</Badge>
                ) : (
                  <Badge variant="outline" className="text-caption text-muted-foreground">Global de planta</Badge>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Umbral Fotocélula (%)</Label>
                <InfoTooltip {...getTooltipProps('cfg.photocellWarn')} iconSize={11} />
              </div>
              <Input
                type="number"
                min={0} max={100} step={0.5}
                value={effectiveThresholds?.photocellPctWarn ?? 1}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, photocellPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
              <p className="text-caption text-muted-foreground mt-1">Típico: 1–3%</p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Fuera de Límites (%)</Label>
                <InfoTooltip {...getTooltipProps('cfg.outOfLimitsWarn')} iconSize={11} />
              </div>
              <Input
                type="number"
                min={0} max={100} step={0.5}
                value={effectiveThresholds?.outOfLimitsPctWarn ?? 3}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, outOfLimitsPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
              <p className="text-caption text-muted-foreground mt-1">Típico: 3–5%</p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Punto Cero — Alerta (%)</Label>
                <InfoTooltip {...getTooltipProps('cfg.pointZeroWarn')} iconSize={11} />
              </div>
              <Input
                type="number"
                min={0} max={100} step={0.5}
                value={effectiveThresholds?.pointZeroPctWarn ?? 2}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, pointZeroPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
              <p className="text-caption text-muted-foreground mt-1">Meta: &lt;2%</p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Punto Cero — Crítico (%)</Label>
                <InfoTooltip {...getTooltipProps('cfg.pointZeroCritical')} iconSize={11} />
              </div>
              <Input
                type="number"
                min={0} max={100} step={0.5}
                value={effectiveThresholds?.pointZeroPctCritical ?? Math.max((effectiveThresholds?.pointZeroPctWarn ?? 2) + 0.5, (effectiveThresholds?.pointZeroPctWarn ?? 2) * 1.5)}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, pointZeroPctCritical: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
              <p className="text-caption text-muted-foreground mt-1">Debe ser &gt; alerta</p>
            </div>
          </div>

          {/* Botones override por turno — solo cuando hay contexto de turno */}
          {shiftDocId && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                disabled={savingShiftThresholds}
                onClick={async () => {
                  if (!shiftDocId) return
                  setSavingShiftThresholds(true)
                  try {
                    const t = {
                      photocellPctWarn: config.errorThresholds?.photocellPctWarn ?? 1,
                      outOfLimitsPctWarn: config.errorThresholds?.outOfLimitsPctWarn ?? 3,
                      pointZeroPctWarn: config.errorThresholds?.pointZeroPctWarn ?? 2,
                      pointZeroPctCritical: config.errorThresholds?.pointZeroPctCritical ?? 3.5,
                    }
                    await saveShiftThresholds(shiftDocId, t)
                    onShiftThresholdsSaved?.(t)
                  } finally {
                    setSavingShiftThresholds(false)
                  }
                }}
                className="text-xs h-7 border-primary/[0.25] text-primary hover:bg-primary/[0.15]"
              >
                {savingShiftThresholds && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                {hasShiftThresholdsOverride ? 'Actualizar override de este turno' : 'Guardar solo para este turno'}
              </Button>
              {hasShiftThresholdsOverride && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={savingShiftThresholds}
                  onClick={async () => {
                    if (!shiftDocId) return
                    setSavingShiftThresholds(true)
                    try {
                      await saveShiftThresholds(shiftDocId, null)
                      onShiftThresholdsSaved?.(null)
                    } finally {
                      setSavingShiftThresholds(false)
                    }
                  }}
                  className="text-xs h-7 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Volver a global
                </Button>
              )}
            </div>
          )}

          <div className="border-t border-zinc-800 my-5" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">Horarios de turnos</h3>
              {isScheduleDirty && (
                <span className="text-caption text-amber-400 font-medium">● sin guardar</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Formato HH:MM. El turno noche puede cruzar medianoche (fin menor que inicio).
              <span className="block mt-0.5">La cuota objetivo de cada turno se define desde el detalle del turno (Análisis de Turno).</span>
            </p>
            <div className="mt-3 grid gap-2">
              {shiftSchedule.map((shift, idx) => (
                <div key={shift.shiftId} className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="text-xs bg-muted ring-1 ring-border dark:bg-zinc-800 dark:ring-zinc-700 whitespace-nowrap">{shift.shiftId}</Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Inicio</span>
                    <Input
                      type="time"
                      value={formatShiftTime(shift.startHour, shift.startMinute)}
                      onChange={(e) => {
                        const { hour, minute } = parseShiftTime(e.target.value)
                        updateShiftSchedule(idx, { startHour: hour, startMinute: minute })
                      }}
                      className="h-8 w-28 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Fin</span>
                    <Input
                      type="time"
                      value={formatShiftTime(shift.endHour, shift.endMinute)}
                      onChange={(e) => {
                        const { hour, minute } = parseShiftTime(e.target.value)
                        updateShiftSchedule(idx, { endHour: hour, endMinute: minute })
                      }}
                      className="h-8 w-28 text-xs"
                    />
                  </div>
                  {shift.quota && shift.quota.value > 0 && (
                    <span className="text-caption px-1.5 py-0.5 rounded-ctl bg-primary/5 text-primary/80 border border-primary/20 tabular-nums" title="Cuota actual (editable desde el detalle del turno)">
                      Cuota: {shift.quota.value.toLocaleString('es-CL')} {shift.quota.unit === 'kg' ? 'kg' : 'pz'}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {shiftGapMinutes > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-ctl bg-amber-500/[0.15] border border-amber-500/[0.25] px-3 py-2">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-amber-400" />
                <p className="text-xs text-ink-warn">
                  Hay <strong>{Math.floor(shiftGapMinutes / 60)}h {shiftGapMinutes % 60}min</strong> sin turno asignado en el día.
                  Revisa que los horarios cubran el período operativo completo.
                </p>
              </div>
            )}
          </div>

          {/* Period inferred */}
          {parsedData.inferred.startAt && (
            <div className="mt-3 text-xs text-muted-foreground">
              Periodo detectado: {new Date(parsedData.inferred.startAt).toLocaleString('es-CL')} →{' '}
              {parsedData.inferred.endAt ? new Date(parsedData.inferred.endAt).toLocaleString('es-CL') : '?'}
            </div>
          )}
        </CardContent>
      </Card>
      )} {/* /3.1 */}


      {/* 3.2 Configuración de 12 Gates */}
      {(!tabbed || activeTab === 'gates') && (
      <Card className="relative">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">
              Configuración de 12 Gates
            </CardTitle>
            {activeTemplateName && (
              <Badge variant="outline" className="text-caption">
                {activeTemplateName}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTemplates(!showTemplates)}>
              <FolderOpen className="h-4 w-4 mr-1" />
              Plantillas
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Templates panel */}
          {showTemplates && (
            <div className="mb-4 p-3 rounded-card bg-muted/50 space-y-2">
              <p className="text-sm font-medium">Plantillas guardadas</p>
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay plantillas guardadas.</p>
              )}
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-ctl bg-background',
                    activeTemplateName === t.name && 'ring-2 ring-primary/50',
                  )}
                >
                  <div>
                    <span className="text-sm font-medium">{t.name}</span>
                    {activeTemplateName === t.name && (
                      <Badge className="ml-2 text-caption bg-green-500/[0.15] text-ink-ok">
                        Activa
                      </Badge>
                    )}
                    {t.deviceId && (
                      <Badge variant="outline" className="ml-2 text-caption">
                        {t.deviceId}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleLoadTemplate(t)}>
                      Cargar
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {isAdmin && (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder={autoTemplateName}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={handleSaveTemplate}>
                    <Save className="h-4 w-4 mr-1" />
                    Guardar
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Gates table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs tracking-wider text-muted-foreground">
                  <th className="py-2.5 px-2 w-16">Gate</th>
                  <th className="py-2.5 px-2">Calibre</th>
                  <th className="py-2.5 px-2 text-center">Rango (g)</th>
                  <th className="py-2.5 px-2">Calidad</th>
                  <th className="py-2.5 px-2">Conservación</th>
                  <th className="py-2.5 px-2">Producto</th>
                  <th className="py-2.5 px-2 w-20 text-center">Activo</th>
                </tr>
              </thead>
              <tbody>
                {gates.map((gate, idx) => (
                  <tr key={gate.gateNumber} className={`border-b border-border/30 hover:bg-muted/40 transition-colors ${idx % 2 === 1 ? 'bg-muted/40' : ''}`}>
                    <td className="py-2 px-2 font-medium text-center">
                      <Badge variant="outline">{gate.gateNumber}</Badge>
                    </td>
                    <td className="py-2 px-2">
                      <Select
                        value={gate.assignedCalibre}
                        onValueChange={(v) => updateGate(idx, { assignedCalibre: v as CalibreRange })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCalibres.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className="text-xs text-muted-foreground font-mono">
                        {calibreRangeLookup(gate.assignedCalibre, activeRanges)}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <Select
                        value={gate.assignedQuality}
                        onValueChange={(v) => updateGate(idx, { assignedQuality: v as GraderQuality })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUALITIES.map((q) => (
                            <SelectItem key={q} value={q}>{q}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Select
                        value={gate.assignedConservation ?? '__any'}
                        onValueChange={(v) => updateGate(idx, { assignedConservation: v === '__any' ? undefined : v as GraderConservation })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any">Cualquiera</SelectItem>
                          <SelectItem value="CONGELADO">Congelado</SelectItem>
                          <SelectItem value="FRESCO">Fresco</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Select
                        value={gate.assignedProduct ?? '__any'}
                        onValueChange={(v) => updateGate(idx, { assignedProduct: v === '__any' ? undefined : v as GraderProduct })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any">Cualquiera</SelectItem>
                          <SelectItem value="HG">HG</SelectItem>
                          <SelectItem value="DESTINO FILETE">Destino Filete</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <Switch
                        checked={gate.active}
                        onCheckedChange={(v) => updateGate(idx, { active: v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )} {/* /3.2 */}

      {/* 3.3 Rangos de Peso */}
      {(!tabbed || activeTab === 'rangos') && (
      <Card className="relative">
        <CardHeader
          className={tabbed ? '' : 'cursor-pointer select-none'}
          onClick={tabbed ? undefined : () => setShowWeightRanges(!showWeightRanges)}
        >
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {!tabbed && <ChevronDown className={`h-4 w-4 transition-transform ${showWeightRanges ? '' : '-rotate-90'}`} />}
            Rangos de Peso por Calibre
            {hasShiftOverride && (
              <Badge className="text-caption bg-primary/[0.15] text-primary">
                Override de este turno
              </Badge>
            )}
            {!hasShiftOverride && isCustomRanges && (
              <Badge className="text-caption bg-amber-500/[0.15] text-ink-warn">
                Global personalizado
              </Badge>
            )}
            {!hasShiftOverride && !isCustomRanges && (
              <Badge variant="outline" className="text-caption text-muted-foreground">
                Global planta
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        {(tabbed || showWeightRanges) && (
          <CardContent className="space-y-4">
            {/* Fuente actual */}
            <p className="text-xs text-muted-foreground">
              {hasShiftOverride
                ? 'Rangos específicos de este turno. Tienen prioridad sobre los rangos globales de planta.'
                : 'Rangos globales de planta — se aplican a todos los turnos que no tengan un override propio.'}
            </p>

            {/* Tabla de rangos activos */}
            {!editingShiftRanges && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 px-2">Calibre</th>
                      <th className="py-1.5 px-2">Mín (g)</th>
                      <th className="py-1.5 px-2">Máx (g)</th>
                      <th className="py-1.5 px-2">Rango</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRanges.map((r, idx) => (
                      <tr key={idx} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-1.5 px-2 font-mono text-xs">{r.calibre}</td>
                        <td className="py-1.5 px-2 text-xs tabular-nums">{r.minGrams.toLocaleString('es-CL')}</td>
                        <td className="py-1.5 px-2 text-xs tabular-nums">{r.maxGrams.toLocaleString('es-CL')}</td>
                        <td className="py-1.5 px-2 text-xs text-muted-foreground">
                          {r.label || buildRangeLabel(r.calibre, r.minGrams, r.maxGrams)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Editor inline del override por turno */}
            {editingShiftRanges && (
              <div className="space-y-2">
                <p className="text-caption text-blue-400 font-medium">Editando override de este turno — los cambios NO afectan otros turnos</p>
                <div className="space-y-1.5">
                  {shiftRangesDraft.map((r, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_100px_100px_auto] gap-1.5 items-center">
                      <span className="text-xs font-mono px-2 py-1.5 bg-muted rounded-ctl truncate">{r.calibre}</span>
                      <Input
                        type="number"
                        value={r.minGrams}
                        min={0}
                        step={1}
                        className="h-7 text-xs tabular-nums"
                        onChange={e => setShiftRangesDraft(prev => prev.map((x, i) => i === idx ? { ...x, minGrams: Number(e.target.value) } : x))}
                      />
                      <Input
                        type="number"
                        value={r.maxGrams}
                        min={0}
                        step={1}
                        className="h-7 text-xs tabular-nums"
                        onChange={e => setShiftRangesDraft(prev => prev.map((x, i) => i === idx ? { ...x, maxGrams: Number(e.target.value) } : x))}
                      />
                      <span className="text-caption text-muted-foreground/50 tabular-nums whitespace-nowrap">
                        {buildRangeLabel(r.calibre, r.minGrams, r.maxGrams)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1 flex-wrap">
                  <Button
                    size="sm"
                    disabled={savingShiftRanges || !shiftDocId}
                    onClick={async () => {
                      if (!shiftDocId) return
                      setSavingShiftRanges(true)
                      try {
                        await saveShiftCalibreRanges(shiftDocId, shiftRangesDraft)
                        onShiftRangesSaved?.(shiftRangesDraft)
                        setEditingShiftRanges(false)
                      } finally {
                        setSavingShiftRanges(false)
                      }
                    }}
                  >
                    {savingShiftRanges && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                    Guardar override de este turno
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingShiftRanges(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Botones de acción */}
            {!editingShiftRanges && (
              <div className="flex gap-2 flex-wrap">
                {shiftDocId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShiftRangesDraft(sortRanges(activeRanges))
                      setEditingShiftRanges(true)
                    }}
                  >
                    <Save className="h-3 w-3 mr-1.5" />
                    {hasShiftOverride ? 'Editar override de este turno' : 'Crear override para este turno'}
                  </Button>
                )}
                {hasShiftOverride && shiftDocId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={savingShiftRanges}
                    onClick={async () => {
                      setSavingShiftRanges(true)
                      try {
                        await saveShiftCalibreRanges(shiftDocId, null)
                        onShiftRangesSaved?.(null)
                      } finally {
                        setSavingShiftRanges(false)
                      }
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1.5" />
                    Quitar override (volver a global)
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setGlobalSettingsOpen(true)}>
                  <Settings2 className="h-3 w-3 mr-1.5" />
                  Editar rangos globales (planta)
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>
      )} {/* /3.3 */}


      <GlobalSettingsModal open={globalSettingsOpen} onOpenChange={handleGlobalSettingsClose} plantLineId={plantLineId} />
    </div>
  )
}
