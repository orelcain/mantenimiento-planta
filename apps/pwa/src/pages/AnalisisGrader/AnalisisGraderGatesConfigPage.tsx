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
import { Save, FolderOpen, ChevronRight, Trash2, ChevronDown, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore, useIsAdmin } from '@/store'
import {
  saveGatesTemplate,
  listGatesTemplates,
  deleteGatesTemplate,
  type GatesTemplate,
} from '@/services/grader/graderSession.service'
import { getModuleRanges, saveModulePhysicalConfig, saveModuleShiftSchedule } from '@/services/grader/graderModuleConfig.service'
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
import type { GraderBeltId } from '@/services/grader/graderBeltHelpers'
import { GlobalSettingsModal } from '@/components/grader/GlobalSettingsModal'
import { TachMeasurementModal } from '@/components/grader/modals/TachMeasurementModal'
import { SlowMoMeasurementModal } from '@/components/grader/modals/SlowMoMeasurementModal'
import { Z2CaptureModal } from '@/components/grader/modals/Z2CaptureModal'
import { useConfigChangeLogger } from '@/services/grader/useConfigChangeLogger'
import { listRecentConfigChanges, type ConfigChangeEntry } from '@/services/grader/graderConfigChangeLog.service'
import { InfoTooltip } from '@/components/ui'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { ProductoTab } from '@/components/grader/tabs/gatesConfig/ProductoTab'
import { CintasTab } from '@/components/grader/tabs/gatesConfig/CintasTab'
import { DistanciasTab } from '@/components/grader/tabs/gatesConfig/DistanciasTab'
import { DanfossTab } from '@/components/grader/tabs/gatesConfig/DanfossTab'
import { NeumaticaTab } from '@/components/grader/tabs/gatesConfig/NeumaticaTab'
import { VerificacionTab } from '@/components/grader/tabs/gatesConfig/VerificacionTab'
import { SPECIES_ALLOMETRY, type BatchStats } from '@/components/grader/tabs/gatesConfig/GatesConfigShared'


interface Props {
  gates: GateAssignment[]
  config: GraderAnalysisConfig
  parsedData: ParsedMatrixData
  onComplete: (gates: GateAssignment[], config: GraderAnalysisConfig) => void
  /** Si true, muestra navegación por pestañas en lugar de cards apiladas */
  tabbed?: boolean
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
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 dark:text-amber-400 font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        Guardando…
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Guardado
    </span>
  )
}

const VALID_TABS = ['analisis', 'gates', 'rangos', 'fisica'] as const
type ConfigTab = (typeof VALID_TABS)[number]

export function AnalisisGraderGatesConfigPage({ gates: initialGates, config: initialConfig, parsedData, onComplete, tabbed = false }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [templates, setTemplates] = useState<GatesTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showWeightRanges, setShowWeightRanges] = useState(true)
  const [shiftSchedule, setShiftSchedule] = useState(DEFAULT_SHIFT_SCHEDULE)
  const [showPhysicalConfig, setShowPhysicalConfig] = useState(false)
  const [fisicaSubTab, setFisicaSubTab] = useState<'producto' | 'cintas' | 'distancias' | 'calibracion'>('producto')
  const [calibracionSubTab, setCalibracionSubTab] = useState<'danfoss' | 'neumatica' | 'verificacion'>('danfoss')
  const [productoSubTab, setProductoSubTab] = useState<'resumen' | 'flipper' | 'analisis' | 'sugerencias' | 'historial'>('resumen')
  // Guard: autosave no dispara hasta que la carga inicial desde Firestore complete.
  // Previene sobreescribir datos reales con DEFAULTs si la red es lenta.
  const moduleConfigLoadedRef = useRef(false)
  const [physicalConfig, _setPhysicalConfigRaw] = useState<GraderPhysicalConfig>(DEFAULT_PHYSICAL_CONFIG)
  // FASE 6 — logger de cambios: cada setPhysicalConfig persiste diff en Firestore
  const setPhysicalConfig = useConfigChangeLogger(physicalConfig, _setPhysicalConfigRaw, { enabledRef: moduleConfigLoadedRef })
  const [loadedSchedule, setLoadedSchedule] = useState(DEFAULT_SHIFT_SCHEDULE)
  // FASE 5 — Modales de medición
  const [tachModalBelt, setTachModalBelt] = useState<GraderBeltId | null>(null)
  const [slowMoModalGate, setSlowMoModalGate] = useState<number | null>(null)
  const [z2CaptureOpen, setZ2CaptureOpen] = useState(false)
  // FASE 6 — historial de cambios (últimos 10)
  const [changeLog, setChangeLog] = useState<ConfigChangeEntry[]>([])
  const [changeLogLoading, setChangeLogLoading] = useState(false)
  const user = useAuthStore((s) => s.user)
  const isAdmin = useIsAdmin()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // FASE 6 — recargar historial al entrar al sub-tab Historial (lazy)
  useEffect(() => {
    if (fisicaSubTab !== 'producto' || productoSubTab !== 'historial') return
    let cancelled = false
    setChangeLogLoading(true)
    listRecentConfigChanges(10)
      .then((entries) => { if (!cancelled) setChangeLog(entries) })
      .catch(() => logger.warn('changeLog: error cargando'))
      .finally(() => { if (!cancelled) setChangeLogLoading(false) })
    return () => { cancelled = true }
  }, [fisicaSubTab, productoSubTab])

  const sortRanges = (ranges: CalibreWeightRange[]) =>
    [...ranges].sort((a, b) => a.minGrams - b.minGrams)

  // Active weight ranges: custom or default
  const activeRanges = useMemo<CalibreWeightRange[]>(() => {
    const base = config.customWeightRanges && config.customWeightRanges.length > 0
      ? config.customWeightRanges
      : CALIBRE_WEIGHT_RANGES
    return sortRanges(base)
  }, [config.customWeightRanges])

  const availableCalibres = useMemo<CalibreRange[]>(() => {
    const fromRanges = activeRanges.map((r) => r.calibre).filter(Boolean)
    const merged = [...fromRanges, ...DEFAULT_CALIBRES]
    return Array.from(new Set(merged))
  }, [activeRanges])

  const isCustomRanges = !!(config.customWeightRanges && config.customWeightRanges.length > 0)

  // Peso mediano del lote actual (gramos) — desde pieceRecords del Excel cargado
  const medianWeightG = useMemo(() => {
    const weights = parsedData.pieceRecords
      .map((r) => r.weightPerPieceGrams ?? (r.weightKg != null ? r.weightKg * 1000 : null))
      .filter((w): w is number => w != null && w > 50 && w < 15000)
    if (weights.length < 10) return null
    weights.sort((a, b) => a - b)
    return weights[Math.floor(weights.length / 2)]
  }, [parsedData.pieceRecords])

  // Peso mediano manual (gramos) — cuando no hay Excel, el usuario puede ingresarlo
  const [manualMedianG, setManualMedianG] = useState<number | undefined>(undefined)

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
  const effectiveMedianG = medianWeightG ?? manualMedianG ?? historicalMedianG?.value ?? null
  const medianSource: 'excel' | 'manual' | 'historical' | null =
    medianWeightG != null ? 'excel'
    : manualMedianG != null ? 'manual'
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

  const { suggestions } = useSuggestionEngine({
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
      getModuleRanges().then((cfg) => {
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

  // Cargar rangos globales del modulo
  useEffect(() => {
    getModuleRanges()
      .then((cfg) => {
        if (cfg?.customWeightRanges && cfg.customWeightRanges.length > 0) {
          setConfig((c) => ({ ...c, customWeightRanges: cfg.customWeightRanges }))
        }
        const normalized = normalizeShiftSchedule(cfg?.shiftSchedule)
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
  }, [setPhysicalConfig])

  // Autosave physicalConfig (debounce)
  useEffect(() => {
    if (!user || !moduleConfigLoadedRef.current) return
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      saveModulePhysicalConfig({ physicalConfig, updatedBy: user.id })
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('idle'))
    }, 1000)
    return () => clearTimeout(timer)
  }, [physicalConfig, user])

  // Autosave shiftSchedule (debounce)
  useEffect(() => {
    if (!user || !moduleConfigLoadedRef.current) return
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      saveModuleShiftSchedule({ schedule: shiftSchedule, updatedBy: user.id })
        .then(() => {
          setLoadedSchedule(shiftSchedule)
          setSaveStatus('saved')
        })
        .catch(() => setSaveStatus('idle'))
    }, 1000)
    return () => clearTimeout(timer)
  }, [shiftSchedule, user])

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

  const updateFlipperDistance = (gateNumber: number, distanceMeters: number) => {
    setPhysicalConfig((prev) => ({
      ...prev,
      flipperPositions: prev.flipperPositions.map((fp) =>
        fp.gateNumber === gateNumber ? { ...fp, distanceFromSensorMeters: distanceMeters } : fp,
      ),
    }))
  }

  const updateBeltSpeed = (beltId: string, speedMps: number) => {
    setPhysicalConfig((prev) => ({
      ...prev,
      belts: prev.belts.map((b) => b.beltId === beltId ? { ...b, speedMps } : b),
    }))
  }

  const updateBeltLength = (beltId: string, lengthMeters: number) => {
    setPhysicalConfig((prev) => ({
      ...prev,
      belts: prev.belts.map((b) => b.beltId === beltId ? { ...b, lengthMeters } : b),
    }))
  }

  const TABS = [
    { id: 'analisis', label: 'Análisis' },
    { id: 'gates',   label: '12 Gates' },
    { id: 'rangos',  label: 'Rangos' },
    { id: 'fisica',  label: 'Física' },
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
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
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
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Umbrales de alerta</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Umbral Fotocélula (%)</Label>
                <InfoTooltip {...getTooltipProps('cfg.photocellWarn')} iconSize={11} />
              </div>
              <Input
                type="number"
                min={0} max={100} step={0.5}
                value={config.errorThresholds?.photocellPctWarn ?? 1}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, photocellPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Típico: 1–3%</p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Fuera de Límites (%)</Label>
                <InfoTooltip {...getTooltipProps('cfg.outOfLimitsWarn')} iconSize={11} />
              </div>
              <Input
                type="number"
                min={0} max={100} step={0.5}
                value={config.errorThresholds?.outOfLimitsPctWarn ?? 3}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, outOfLimitsPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Típico: 3–5%</p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Punto Cero — Alerta (%)</Label>
                <InfoTooltip {...getTooltipProps('cfg.pointZeroWarn')} iconSize={11} />
              </div>
              <Input
                type="number"
                min={0} max={100} step={0.5}
                value={config.errorThresholds?.pointZeroPctWarn ?? 2}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, pointZeroPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Meta: &lt;2%</p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Punto Cero — Crítico (%)</Label>
                <InfoTooltip {...getTooltipProps('cfg.pointZeroCritical')} iconSize={11} />
              </div>
              <Input
                type="number"
                min={0} max={100} step={0.5}
                value={config.errorThresholds?.pointZeroPctCritical ?? Math.max((config.errorThresholds?.pointZeroPctWarn ?? 2) + 0.5, (config.errorThresholds?.pointZeroPctWarn ?? 2) * 1.5)}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, pointZeroPctCritical: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Debe ser &gt; alerta</p>
            </div>
          </div>

          <div className="border-t border-zinc-800 my-5" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Horarios de turnos</h3>
              {isScheduleDirty && (
                <span className="text-[10px] text-amber-400 font-medium">● sin guardar</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Formato HH:MM. El turno noche puede cruzar medianoche (fin menor que inicio).
            </p>
            <div className="mt-3 grid gap-2">
              {shiftSchedule.map((shift, idx) => (
                <div key={shift.shiftId} className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="text-xs bg-zinc-800 ring-1 ring-zinc-700 whitespace-nowrap">{shift.shiftId}</Badge>
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
                </div>
              ))}
            </div>
            {shiftGapMinutes > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                <span className="text-amber-400 mt-px">⚠</span>
                <p className="text-xs text-amber-300">
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

      {/* Quick navigation visible — solo en modo no-tabbed */}
      {!tabbed && (
      <div className="sticky top-14 z-20">
        <Card className="border-primary/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <CardContent className="py-2.5 px-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <p className="text-xs text-muted-foreground hidden sm:block">Datos cargados — puede ir al dashboard en cualquier momento</p>
              <p className="text-xs text-muted-foreground sm:hidden">Datos listos</p>
              <SaveIndicator status={saveStatus} />
            </div>
            <Button size="sm" onClick={() => onComplete(gates, config)} className="bg-primary hover:bg-primary/90 shadow-sm">
              Ver Dashboard
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>
      )} {/* /Quick nav */}

      {/* 3.2 Configuración de 12 Gates */}
      {(!tabbed || activeTab === 'gates') && (
      <Card className="relative">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">
              Configuración de 12 Gates
            </CardTitle>
            {activeTemplateName && (
              <Badge variant="outline" className="text-[10px]">
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
            <div className="mb-4 p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="text-sm font-medium">Plantillas guardadas</p>
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay plantillas guardadas.</p>
              )}
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded bg-background',
                    activeTemplateName === t.name && 'ring-2 ring-primary/50',
                  )}
                >
                  <div>
                    <span className="text-sm font-medium">{t.name}</span>
                    {activeTemplateName === t.name && (
                      <Badge className="ml-2 text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Activa
                      </Badge>
                    )}
                    {t.deviceId && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
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
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
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
                  <tr key={gate.gateNumber} className={`border-b border-border/30 hover:bg-muted/40 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
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
          <CardTitle className="text-base flex items-center gap-2">
            {!tabbed && <ChevronDown className={`h-4 w-4 transition-transform ${showWeightRanges ? '' : '-rotate-90'}`} />}
            Rangos de Peso por Calibre
            {isCustomRanges && (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Personalizado
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        {(tabbed || showWeightRanges) && (
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Rangos de política de planta — se aplican a todos los turnos. Para editar, usá la configuración global.
            </p>
            <div className="overflow-x-auto mb-3">
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
            <Button variant="outline" size="sm" onClick={() => setGlobalSettingsOpen(true)}>
              <Settings2 className="h-3 w-3 mr-1.5" />
              Editar rangos en configuración global
            </Button>
          </CardContent>
        )}
      </Card>
      )} {/* /3.3 */}

      {/* 3.4 Configuración Física de la Máquina */}
      {(!tabbed || activeTab === 'fisica') && (
      <Card className="relative">
        {!tabbed && (
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setShowPhysicalConfig(!showPhysicalConfig)}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <ChevronDown className={`h-4 w-4 transition-transform ${showPhysicalConfig ? '' : '-rotate-90'}`} />
            Configuración Física de la Máquina
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              Mejora las recomendaciones de IA
            </Badge>
          </CardTitle>
        </CardHeader>
        )}
        {(tabbed || showPhysicalConfig) && (
          <CardContent className="space-y-6">
            {/* Sub-tabs Física */}
            <div className="flex gap-0 border-b border-border/50">
              {([
                { id: 'producto',     label: 'Producto' },
                { id: 'cintas',       label: 'Cintas' },
                { id: 'distancias',   label: 'Distancias' },
                { id: 'calibracion',  label: 'Calibración' },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFisicaSubTab(id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                    fisicaSubTab === id
                      ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sub-tabs Calibración */}
            {fisicaSubTab === 'calibracion' && (
              <div className="flex gap-0 border-b border-border/30 -mt-2">
                {([
                  { id: 'danfoss',      label: 'Danfoss VFD' },
                  { id: 'neumatica',    label: 'Neumática' },
                  { id: 'verificacion', label: 'Verificación' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCalibracionSubTab(id)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                      calibracionSubTab === id
                        ? 'border-sky-400 text-sky-500 dark:text-sky-400'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Sub-tabs Producto */}
            {fisicaSubTab === 'producto' && (
              <div className="flex gap-0 border-b border-border/30 -mt-2">
                {([
                  { id: 'resumen',     label: 'Resumen' },
                  { id: 'flipper',     label: 'Flipper' },
                  { id: 'analisis',    label: 'Análisis' },
                  { id: 'sugerencias', label: 'Sugerencias' },
                  { id: 'historial',   label: 'Historial' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setProductoSubTab(id)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                      productoSubTab === id
                        ? 'border-sky-400 text-sky-500 dark:text-sky-400'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* ── TAB PRODUCTO ── */}
            {fisicaSubTab === 'producto' && (
              <ProductoTab
                physicalConfig={physicalConfig}
                setPhysicalConfig={setPhysicalConfig}
                batchStats={batchStats}
                historicalMedianG={historicalMedianG}
                medianWeightG={medianWeightG ?? null}
                manualMedianG={manualMedianG}
                setManualMedianG={setManualMedianG}
                medianSource={medianSource}
                suggestedDimensions={suggestedDimensions}
                suggestions={suggestions}
                changeLog={changeLog}
                changeLogLoading={changeLogLoading}
                productoSubTab={productoSubTab}
                onOpenZ2Capture={() => setZ2CaptureOpen(true)}
              />

            )}

            {/* Cintas — 4 cards individuales en orden de flujo */}
            {fisicaSubTab === 'cintas' && (
              <CintasTab
                physicalConfig={physicalConfig}
                updateBeltLength={updateBeltLength}
                updateBeltSpeed={updateBeltSpeed}
                setTachModalBelt={setTachModalBelt}
              />
            )}

            {/* Z-Belt variador Danfoss */}
            {fisicaSubTab === 'calibracion' && calibracionSubTab === 'danfoss' && (
              <DanfossTab
                physicalConfig={physicalConfig}
                setPhysicalConfig={setPhysicalConfig}
              />
            )}

            {/* Distancias de flippers — 12 cards */}
            {fisicaSubTab === 'distancias' && (
              <DistanciasTab
                physicalConfig={physicalConfig}
                setPhysicalConfig={setPhysicalConfig}
                updateFlipperDistance={updateFlipperDistance}
                setSlowMoModalGate={setSlowMoModalGate}
              />
            )}

            {/* ── Configuración Neumática ──────────────────────────────────── */}
            {fisicaSubTab === 'calibracion' && calibracionSubTab === 'neumatica' && (
              <NeumaticaTab
                physicalConfig={physicalConfig}
                setPhysicalConfig={setPhysicalConfig}
              />
            )}


            {/* Verificación multi-fuente de velocidades */}
            {fisicaSubTab === 'calibracion' && calibracionSubTab === 'verificacion' && (
              <VerificacionTab
                physicalConfig={physicalConfig}
                setPhysicalConfig={setPhysicalConfig}
              />
            )}

          </CardContent>
        )}
      </Card>
      )} {/* /3.4 */}

      {/* ── FASE 5: Modales de medición ── */}
      {tachModalBelt && (
        <TachMeasurementModal
          open={!!tachModalBelt}
          onOpenChange={(open) => { if (!open) setTachModalBelt(null) }}
          beltId={tachModalBelt}
          currentSpeedMps={physicalConfig.belts.find((b) => b.beltId === tachModalBelt)?.speedMps ?? 0}
          effectiveMpsPerRpm={physicalConfig.belts.find((b) => b.beltId === tachModalBelt)?.vfd?.effectiveMpsPerRpm}
          onApply={(patch) => setPhysicalConfig((p) => ({ ...p, ...patch }))}
          applyPatchBuilder={(beltMps, measuredAt) => ({
            belts: physicalConfig.belts.map((b) =>
              b.beltId === tachModalBelt
                ? {
                    ...b,
                    speedMps: Math.round(beltMps * 1000) / 1000,
                    calibrationStatus: 'verified' as const,
                    vfd: {
                      ...(b.vfd ?? {}),
                      measuredBeltMps: Math.round(beltMps * 1000) / 1000,
                      measuredAt,
                      truthSource: 'tachLinear' as const,
                    },
                  }
                : b,
            ),
          })}
        />
      )}
      {slowMoModalGate !== null && (
        <SlowMoMeasurementModal
          open={slowMoModalGate !== null}
          onOpenChange={(open) => { if (!open) setSlowMoModalGate(null) }}
          gateNumber={slowMoModalGate}
          currentResetSec={physicalConfig.flipperMechanicalResetS}
          onApply={(seconds, measuredAtMs) => setPhysicalConfig((p) => ({
            ...p,
            flipperMechanicalResetS: Math.round(seconds * 1000) / 1000,
            flipperMechanicalMeasuredAt: measuredAtMs,
          }))}
        />
      )}
      <Z2CaptureModal
        open={z2CaptureOpen}
        onOpenChange={setZ2CaptureOpen}
        currentValues={{
          delayFlipperOpenMs:   physicalConfig.flipperDelayOpenMs   ?? 150,
          minFlipperOpenTimeMs: physicalConfig.flipperMinOpenTimeMs ?? 350,
          delayFlipperCloseMs:  physicalConfig.flipperDelayCloseMs  ?? 150,
        }}
        onApply={(values) => setPhysicalConfig((p) => ({
          ...p,
          flipperDelayOpenMs:   values.delayFlipperOpenMs,
          flipperMinOpenTimeMs: values.minFlipperOpenTimeMs,
          flipperDelayCloseMs:  values.delayFlipperCloseMs,
        }))}
      />
      <GlobalSettingsModal open={globalSettingsOpen} onOpenChange={handleGlobalSettingsClose} />
    </div>
  )
}
