/**
 * P2) Configuración de Gates (12 compuertas)
 *
 * Tabla editable, guardar/cargar plantillas, configuración del análisis.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Label } from '@/components/ui'
import { Save, FolderOpen, ChevronRight, Trash2, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore, useIsAdmin } from '@/store'
import {
  saveGatesTemplate,
  listGatesTemplates,
  deleteGatesTemplate,
  type GatesTemplate,
} from '@/services/grader/graderSession.service'
import { getModuleRanges, saveModuleRanges, saveModulePhysicalConfig, saveModuleShiftSchedule } from '@/services/grader/graderModuleConfig.service'
import { DEFAULT_SHIFT_SCHEDULE, formatShiftTime, normalizeShiftSchedule, parseShiftTime } from '@/services/grader/graderShiftSchedule'
import type {
  GateAssignment,
  GraderAnalysisConfig,
  GraderPhysicalConfig,
  ParsedMatrixData,
  GraderQuality,
  CalibreRange,
  CalibreWeightRange,
  CalibrationStatus,
} from '@/services/grader/types'
import { CALIBRE_WEIGHT_RANGES, DEFAULT_PHYSICAL_CONFIG, computeZetaBeltSpeedMps, computeBeltSpeedFromVfd, estimateZetaThroughput } from '@/services/grader/graderAnalytics'
import { DEFAULT_PNEUMATIC_CONFIG, computeLinePressureDrop, computeLineChargeTime, computeCylinderStrokeTime } from '@/services/grader/graderGateTiming'
import { InfoTooltip } from '@/components/ui'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import type { PneumaticConfig } from '@/services/grader/types'

/** Default para inicializar pneumaticConfig cuando no existe */
const DEFAULT_PNEUMATIC_INIT: PneumaticConfig = { ...DEFAULT_PNEUMATIC_CONFIG }

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

// Coeficientes alométricos W(g) = a × L(cm)^b — fuente FishBase + literatura acuicultura
const SPECIES_ALLOMETRY = {
  salar: { label: 'Salmón Atlántico (Salar)', a: 0.0096, b: 3.0, widthRatio: 0.22 },
  coho:  { label: 'Salmón Coho',              a: 0.0077, b: 3.05, widthRatio: 0.19 },
} as const

function buildRangeLabel(calibre: string, minGrams: number, maxGrams: number): string {
  return `${calibre} (${minGrams.toLocaleString()}-${maxGrams.toLocaleString()} g)`
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

/** Badge de estado de calibración para parámetros físicos */
function CalibBadge({ status }: { status: CalibrationStatus | undefined }) {
  if (status === 'verified')
    return <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 whitespace-nowrap">✓ Verificado</Badge>
  if (status === 'estimated')
    return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">⚠ Estimado</Badge>
  return <Badge className="text-[10px] bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 whitespace-nowrap">? Falta</Badge>
}

export function AnalisisGraderGatesConfigPage({ gates: initialGates, config: initialConfig, parsedData, onComplete, tabbed = false }: Props) {
  const [gates, setGates] = useState<GateAssignment[]>(initialGates)
  const [config, setConfig] = useState<GraderAnalysisConfig>(initialConfig)
  const [activeTab, setActiveTab] = useState<'analisis' | 'gates' | 'rangos' | 'fisica'>('analisis')
  const [templates, setTemplates] = useState<GatesTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showWeightRanges, setShowWeightRanges] = useState(true)
  const [shiftSchedule, setShiftSchedule] = useState(DEFAULT_SHIFT_SCHEDULE)
  const [showPhysicalConfig, setShowPhysicalConfig] = useState(false)
  const [fisicaSubTab, setFisicaSubTab] = useState<'producto' | 'cintas' | 'distancias' | 'calibracion'>('producto')
  const [calibracionSubTab, setCalibracionSubTab] = useState<'danfoss' | 'neumatica' | 'verificacion'>('danfoss')
  const [physicalConfig, setPhysicalConfig] = useState<GraderPhysicalConfig>(DEFAULT_PHYSICAL_CONFIG)
  const [loadedSchedule, setLoadedSchedule] = useState(DEFAULT_SHIFT_SCHEDULE)
  const user = useAuthStore((s) => s.user)
  const isAdmin = useIsAdmin()
  // Guard: autosave no dispara hasta que la carga inicial desde Firestore complete.
  // Previene sobreescribir datos reales con DEFAULTs si la red es lenta.
  const moduleConfigLoadedRef = useRef(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

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

  // Dimensiones sugeridas por alometría según especie y peso mediano
  const suggestedDimensions = useMemo(() => {
    if (!medianWeightG || !physicalConfig.species) return null
    const { a, b, widthRatio } = SPECIES_ALLOMETRY[physicalConfig.species]
    const lengthCm = Math.round((medianWeightG / a) ** (1 / b))
    const widthCm = Math.round(lengthCm * widthRatio)
    return { lengthCm, widthCm, medianWeightG }
  }, [medianWeightG, physicalConfig.species])

  const updateWeightRange = (idx: number, patch: Partial<CalibreWeightRange>) => {
    const ranges: CalibreWeightRange[] = activeRanges.map((r, i) => {
      if (i !== idx) return r
      const next = { ...r, ...patch }
      return {
        ...next,
        label: buildRangeLabel(next.calibre, next.minGrams, next.maxGrams),
      }
    })
    setConfig((c) => ({ ...c, customWeightRanges: sortRanges(ranges) }))
  }

  const addWeightRange = () => {
    const newRange: CalibreWeightRange = {
      calibre: 'Nuevo calibre',
      label: buildRangeLabel('Nuevo calibre', 0, 0),
      minGrams: 0,
      maxGrams: 0,
    }
    const ranges = sortRanges([...activeRanges, newRange])
    setConfig((c) => ({ ...c, customWeightRanges: ranges }))
  }

  const removeWeightRange = (idx: number) => {
    const ranges = activeRanges.filter((_, i) => i !== idx)
    setConfig((c) => ({ ...c, customWeightRanges: ranges }))
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
  }, [])

  // Autosave rangos globales (debounce)
  useEffect(() => {
    if (!user || !moduleConfigLoadedRef.current) return
    if (!config.customWeightRanges || config.customWeightRanges.length === 0) return
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      saveModuleRanges({ ranges: config.customWeightRanges || [], updatedBy: user.id })
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('idle'))
    }, 800)
    return () => clearTimeout(timer)
  }, [config.customWeightRanges, user])

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

  // Propagar cambios al parent (debounce) — reemplaza al antiguo botón "Aplicar configuración".
  // El parent (Wizard) necesita gates + config + physicalConfig actualizados para que el
  // Dashboard y analyticsResult reflejen los cambios del usuario en la sesión actual.
  useEffect(() => {
    if (!moduleConfigLoadedRef.current) return
    const timer = setTimeout(() => {
      onComplete(gates, { ...config, physicalConfig })
    }, 500)
    return () => clearTimeout(timer)
  }, [gates, config, physicalConfig, onComplete])

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
              Periodo detectado: {new Date(parsedData.inferred.startAt).toLocaleString()} →{' '}
              {parsedData.inferred.endAt ? new Date(parsedData.inferred.endAt).toLocaleString() : '?'}
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
              Define los rangos de peso (en gramos) para cada calibre.
              El análisis usará estos valores para clasificar piezas.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-2">Calibre</th>
                    <th className="py-2 px-2">Mín (g)</th>
                    <th className="py-2 px-2">Máx (g)</th>
                    <th className="py-2 px-2">Vista</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {activeRanges.map((r, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2">
                        <Input
                          value={r.calibre}
                          onChange={(e) => updateWeightRange(idx, { calibre: e.target.value })}
                          className="h-8 text-xs w-28"
                          placeholder="0-2 lb"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={r.minGrams}
                          onChange={(e) => updateWeightRange(idx, { minGrams: Number(e.target.value) })}
                          className="h-8 text-xs w-24 font-mono"
                          step="1"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={r.maxGrams}
                          onChange={(e) => updateWeightRange(idx, { maxGrams: Number(e.target.value) })}
                          className="h-8 text-xs w-24 font-mono"
                          step="1"
                        />
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {r.label || buildRangeLabel(r.calibre, r.minGrams, r.maxGrams)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeWeightRange(idx)}
                          title="Eliminar calibre"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addWeightRange}>
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar calibre
                </Button>
              </div>
            </div>
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

            {/* Dimensiones del salmón, flipper y pockets */}
            {fisicaSubTab === 'producto' && (
            <div>
              <p className="text-sm font-medium mb-3">Producto y flipper</p>

              {/* Selector de especie */}
              <div className="mb-4 flex items-center gap-3">
                <Label className="text-xs whitespace-nowrap">Especie</Label>
                <Select
                  value={physicalConfig.species ?? ''}
                  onValueChange={(v) => setPhysicalConfig((p) => ({ ...p, species: v as 'salar' | 'coho' }))}
                >
                  <SelectTrigger className="h-8 text-xs w-56">
                    <SelectValue placeholder="Seleccionar especie…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SPECIES_ALLOMETRY) as [keyof typeof SPECIES_ALLOMETRY, typeof SPECIES_ALLOMETRY[keyof typeof SPECIES_ALLOMETRY]][]).map(([key, s]) => (
                      <SelectItem key={key} value={key} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {suggestedDimensions && (
                  <span className="text-[10px] text-muted-foreground">
                    Peso mediano lote: <span className="font-mono">{(suggestedDimensions.medianWeightG / 1000).toFixed(2)} kg</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs">Largo prom. salmón (cm)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="20"
                    max="120"
                    value={physicalConfig.avgSalmonLengthCm}
                    onChange={(e) => setPhysicalConfig((p) => ({ ...p, avgSalmonLengthCm: Number(e.target.value) }))}
                    className="mt-1 font-mono"
                  />
                  {suggestedDimensions ? (
                    <p className="text-[10px] mt-1 flex items-center gap-1">
                      <span className="text-sky-500">Sugerido: ~{suggestedDimensions.lengthCm} cm</span>
                      {physicalConfig.avgSalmonLengthCm !== suggestedDimensions.lengthCm && (
                        <button
                          type="button"
                          onClick={() => setPhysicalConfig((p) => ({ ...p, avgSalmonLengthCm: suggestedDimensions.lengthCm }))}
                          className="underline text-sky-400 hover:text-sky-300"
                        >Aplicar</button>
                      )}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-1">Máx. admitido: 110 cm</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Ancho prom. salmón (cm)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="5"
                    max="40"
                    value={physicalConfig.avgSalmonWidthCm ?? ''}
                    onChange={(e) => setPhysicalConfig((p) => ({ ...p, avgSalmonWidthCm: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="—"
                    className="mt-1 font-mono"
                  />
                  {suggestedDimensions ? (
                    <p className="text-[10px] mt-1 flex items-center gap-1">
                      <span className="text-sky-500">Sugerido: ~{suggestedDimensions.widthCm} cm</span>
                      {(physicalConfig.avgSalmonWidthCm ?? 0) !== suggestedDimensions.widthCm && (
                        <button
                          type="button"
                          onClick={() => setPhysicalConfig((p) => ({ ...p, avgSalmonWidthCm: suggestedDimensions.widthCm }))}
                          className="underline text-sky-400 hover:text-sky-300"
                        >Aplicar</button>
                      )}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-1">Máx. admitido: 29 cm</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Largo paleta flipper (mm)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="50"
                    max="500"
                    value={physicalConfig.flipperPaddleLengthMm ?? ''}
                    onChange={(e) => setPhysicalConfig((p) => ({ ...p, flipperPaddleLengthMm: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="Medir en terreno"
                    className="mt-1 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Desde eje hasta extremo. Medido: 475 mm.</p>
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Reset flipper (s)</Label>
                    <CalibBadge status={physicalConfig.flipperResetTimeSec !== undefined && physicalConfig.flipperResetTimeSec !== 0.45 ? 'verified' : 'estimated'} />
                  </div>
                  <Input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="2.0"
                    value={physicalConfig.flipperResetTimeSec ?? 0.45}
                    onChange={(e) => setPhysicalConfig((p) => ({ ...p, flipperResetTimeSec: Number(e.target.value) }))}
                    className="mt-1 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Tiempo reset cilindro neumático. Cronometrar en planta.</p>
                </div>
                <div>
                  <Label className="text-xs">Cantidad de Pockets</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    max="8"
                    value={physicalConfig.pocketCount}
                    onChange={(e) => setPhysicalConfig((p) => ({ ...p, pocketCount: Number(e.target.value) }))}
                    className="mt-1 font-mono"
                  />
                </div>
              </div>
              {physicalConfig.flipperPaddleLengthMm && (() => {
                const mainBelt = physicalConfig.belts.find((b) => b.beltId === 'main')
                const speedMps = mainBelt?.speedMps ?? 0.7
                const minOpenTimeSec = (physicalConfig.flipperPaddleLengthMm / 1000) / speedMps
                const salmonPassTimeSec = physicalConfig.avgSalmonLengthCm / 100 / speedMps
                return (
                  <div className="mt-3 p-3 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs space-y-1">
                    <p className="font-medium text-sky-700 dark:text-sky-300">Timing calculado con datos actuales</p>
                    <p className="text-muted-foreground">
                      Tiempo mínimo que el flipper debe estar abierto (paleta pasa): <span className="font-mono font-medium text-foreground">{minOpenTimeSec.toFixed(3)} s</span>
                    </p>
                    <p className="text-muted-foreground">
                      Tiempo que un salmón de {physicalConfig.avgSalmonLengthCm} cm tarda en pasar el flipper: <span className="font-mono font-medium text-foreground">{salmonPassTimeSec.toFixed(3)} s</span>
                    </p>
                    <p className="text-muted-foreground">
                      Ventana de cierre mínima después que el salmón pasó: <span className="font-mono font-medium text-foreground">{Math.max(0, salmonPassTimeSec - minOpenTimeSec).toFixed(3)} s</span>
                    </p>
                  </div>
                )
              })()}
            </div>
            )}

            {/* Cintas */}
            {fisicaSubTab === 'cintas' && (
            <div>
              <p className="text-sm font-medium mb-3">Cintas transportadoras</p>
              <p className="text-xs text-muted-foreground mb-2">
                Flujo MS4/12: Static Weighing ❶ (pockets) → Z-Conveyor ❷ → Accel Belt 1 ❸ → Accel Belt 2 ❸
                <span className="text-primary font-medium"> [fotocélula]</span> → Grading Belt ❹
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-2">Cinta</th>
                      <th className="py-2 px-2 text-right">Largo (m)</th>
                      <th className="py-2 px-2 text-right">Velocidad (m/s)</th>
                      <th className="py-2 px-2 text-right text-muted-foreground text-xs">Tránsito</th>
                      <th className="py-2 px-2 text-right text-muted-foreground text-xs">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {physicalConfig.belts.map((belt) => {
                      const transitSec = belt.speedMps > 0 ? belt.lengthMeters / belt.speedMps : 0
                      return (
                        <tr key={belt.beltId} className={cn('border-b hover:bg-muted/30', belt.beltId === 'main' && 'bg-primary/5')}>
                          <td className="py-2 px-2 text-xs font-medium">
                            {belt.label}
                            {belt.beltId === 'main' && (
                              <Badge className="ml-2 text-[10px] bg-primary/10 text-primary border-primary/30">Principal</Badge>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <Input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={belt.lengthMeters}
                              onChange={(e) => updateBeltLength(belt.beltId, Number(e.target.value))}
                              className="h-8 text-xs w-20 font-mono ml-auto"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={belt.speedMps}
                              onChange={(e) => updateBeltSpeed(belt.beltId, Number(e.target.value))}
                              className="h-8 text-xs w-24 font-mono ml-auto"
                            />
                          </td>
                          <td className="py-2 px-2 text-right text-xs text-muted-foreground font-mono">
                            {transitSec.toFixed(1)} s
                          </td>
                          <td className="py-2 px-2 text-right">
                            <CalibBadge status={belt.calibrationStatus} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-amber-600 font-medium">⚠ Estimado</span> = derivado de unidades Z2 × factor k (pendiente verificar con tachómetro). Ver sección "Calibración".
              </p>
            </div>
            )}

            {/* Z-Belt variador Danfoss */}
            {fisicaSubTab === 'calibracion' && calibracionSubTab === 'danfoss' && physicalConfig.zetaDrive && (() => {
              const drive = physicalConfig.zetaDrive!
              const computed = computeZetaBeltSpeedMps(drive)
              const throughput = estimateZetaThroughput(computed ?? 0, physicalConfig.avgFishSpacingOnZetaBeltM)
              return (
                <div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Calcula velocidad real desde el setpoint RPM del variador.
                    Formula: v = (RPM / {drive.gearRatio} / 60) × π × (sprocket_mm / 1000)
                  </p>
                  <div className="space-y-3">
                    {/* Datos fijos del motor */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-muted/30 rounded p-2">
                        <p className="text-muted-foreground">Motor</p>
                        <p className="font-mono font-medium">{drive.motorKw} kW · {drive.motorNominalRpm} RPM</p>
                        <CalibBadge status="verified" />
                      </div>
                      <div className="bg-muted/30 rounded p-2">
                        <p className="text-muted-foreground">Reducción</p>
                        <p className="font-mono font-medium">i = {drive.gearRatio}:1</p>
                        <CalibBadge status="verified" />
                      </div>
                      <div className="bg-muted/30 rounded p-2">
                        <p className="text-muted-foreground">Rango VFD</p>
                        <p className="font-mono font-medium">{drive.vfdMinRpm}–{drive.vfdMaxRpm} RPM</p>
                        <CalibBadge status="estimated" />
                      </div>
                    </div>
                    {/* Campos a ingresar */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="text-xs w-44 shrink-0">
                          Diámetro sprocket (mm)
                          <span className="block text-muted-foreground">MEDIR con calibre en polea motriz</span>
                        </label>
                        <Input
                          type="number" step="1" min="50" max="300"
                          value={drive.sprocketDiameterMm ?? ''}
                          placeholder="~120 (derivado teórico)"
                          onChange={(e) => setPhysicalConfig((p) => ({
                            ...p,
                            zetaDrive: { ...(p.zetaDrive ?? drive), sprocketDiameterMm: e.target.value ? Number(e.target.value) : undefined },
                          }))}
                          className="h-8 text-xs w-32 font-mono"
                        />
                        <CalibBadge status={drive.sprocketDiameterMm ? 'verified' : 'unknown'} />
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="text-xs w-44 shrink-0">
                          Setpoint variador (RPM)
                          <span className="block text-muted-foreground">Leer del display Danfoss al inicio turno</span>
                        </label>
                        <Input
                          type="number" step="10"
                          min={drive.vfdMinRpm ?? 1000} max={drive.vfdMaxRpm ?? 2000}
                          value={drive.vfdCurrentRpm ?? ''}
                          placeholder={`ref: ${drive.motorNominalRpm}`}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : undefined
                            setPhysicalConfig((p) => ({
                              ...p,
                              zetaDrive: { ...(p.zetaDrive ?? drive), vfdCurrentRpm: v },
                            }))
                          }}
                          className="h-8 text-xs w-32 font-mono"
                        />
                        <span className="text-xs text-muted-foreground">rango {drive.vfdMinRpm}–{drive.vfdMaxRpm} RPM</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="text-xs w-44 shrink-0">
                          Espaciado peces en Z-Belt (m)
                          <span className="block text-muted-foreground">MEDIR: distancia centro a centro</span>
                        </label>
                        <Input
                          type="number" step="0.05" min="0.1"
                          value={physicalConfig.avgFishSpacingOnZetaBeltM ?? ''}
                          placeholder="ej: 1.0"
                          onChange={(e) => setPhysicalConfig((p) => ({
                            ...p,
                            avgFishSpacingOnZetaBeltM: e.target.value ? Number(e.target.value) : undefined,
                          }))}
                          className="h-8 text-xs w-32 font-mono"
                        />
                        <CalibBadge status={physicalConfig.avgFishSpacingOnZetaBeltM ? 'verified' : 'unknown'} />
                      </div>
                    </div>
                    {/* Resultado calculado */}
                    {computed !== null ? (
                      <div className="bg-primary/5 border border-primary/20 rounded p-3 text-sm space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-muted-foreground">@ {drive.vfdCurrentRpm ?? drive.motorNominalRpm} RPM →</span>
                          <span className="font-mono font-semibold text-primary">{computed.toFixed(3)} m/s</span>
                          {throughput !== null && (
                            <span className="text-xs text-muted-foreground">· ~{throughput.toFixed(0)} pz/min</span>
                          )}
                        </div>
                        <Button
                          size="sm" variant="outline" className="text-xs h-7"
                          onClick={() => setPhysicalConfig((p) => ({
                            ...p,
                            belts: p.belts.map((b) =>
                              b.beltId === 'zeta' ? { ...b, speedMps: Math.round(computed * 1000) / 1000, calibrationStatus: 'verified' as const } : b,
                            ),
                          }))}
                        >
                          Aplicar como velocidad Z-Belt ✓
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Ingresa el diámetro del sprocket para calcular velocidad desde RPM.
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Distancias de flippers */}
            {fisicaSubTab === 'distancias' && (
            <div>
              <p className="text-sm font-medium mb-1">Distancias de flippers desde fotocélula</p>
              <p className="text-xs text-muted-foreground mb-3">
                Distancia física en metros desde el sensor fotocélula (final de Aceleración 2) hasta cada flipper en la cinta clasificadora.
              </p>
              {(() => {
                const mainBelt = physicalConfig.belts.find((b) => b.beltId === 'main')
                const speedMps = mainBelt?.speedMps ?? 0.7
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 px-2 w-16">Gate</th>
                          <th className="py-2 px-2">Distancia desde sensor (m)</th>
                          <th className="py-2 px-2 text-right text-muted-foreground text-xs">Tiempo de reacción</th>
                          <th className="py-2 px-2 text-right text-muted-foreground text-xs">Alerta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {physicalConfig.flipperPositions
                          .slice()
                          .sort((a, b) => a.gateNumber - b.gateNumber)
                          .map((fp) => {
                            const timeSec = speedMps > 0 ? fp.distanceFromSensorMeters / speedMps : 0
                            const isCritical = timeSec < 0.8
                            const isWarning = timeSec >= 0.8 && timeSec < 1.2
                            return (
                              <tr key={fp.gateNumber} className={cn('border-b hover:bg-muted/30', isCritical && 'bg-red-500/5')}>
                                <td className="py-2 px-2 text-center">
                                  <Badge variant="outline" className="text-xs">{fp.gateNumber}</Badge>
                                </td>
                                <td className="py-2 px-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.1"
                                    value={fp.distanceFromSensorMeters}
                                    onChange={(e) => updateFlipperDistance(fp.gateNumber, Number(e.target.value))}
                                    className="h-8 text-xs w-28 font-mono"
                                  />
                                </td>
                                <td className="py-2 px-2 text-right font-mono text-xs">
                                  {timeSec.toFixed(2)} s
                                </td>
                                <td className="py-2 px-2 text-right">
                                  {isCritical && (
                                    <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Crítico</Badge>
                                  )}
                                  {isWarning && (
                                    <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Ajustado</Badge>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
            )}

            {/* ── Configuración Neumática ──────────────────────────────── */}
            {fisicaSubTab === 'calibracion' && calibracionSubTab === 'neumatica' && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                Parámetros del sistema neumático para calcular el tiempo de respuesta real de cada flipper.
                Sin estos datos se usa un valor plano de {(physicalConfig.flipperResetTimeSec ?? 0.45).toFixed(2)}s para todos los gates.
              </p>

              {/* Parámetros del sistema (grid 2×3) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Presión FRL (bar)</Label>
                    <InfoTooltip {...getTooltipProps('pneum.supplyPressure')} iconSize={11} />
                    <CalibBadge status={physicalConfig.pneumaticConfig?.supplyPressureBar ? 'verified' : 'estimated'} />
                  </div>
                  <Input type="number" step="0.5" min="2" max="10"
                    value={physicalConfig.pneumaticConfig?.supplyPressureBar ?? 6.0}
                    onChange={(e) => setPhysicalConfig((p) => ({
                      ...p,
                      pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), supplyPressureBar: Number(e.target.value) },
                    }))}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Solenoide (ms)</Label>
                    <InfoTooltip {...getTooltipProps('pneum.valveSwitch')} iconSize={11} />
                    <CalibBadge status={physicalConfig.pneumaticConfig?.valveSwitchTimeSec ? 'verified' : 'estimated'} />
                  </div>
                  <Input type="number" step="5" min="5" max="100"
                    value={Math.round((physicalConfig.pneumaticConfig?.valveSwitchTimeSec ?? 0.035) * 1000)}
                    onChange={(e) => setPhysicalConfig((p) => ({
                      ...p,
                      pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), valveSwitchTimeSec: Number(e.target.value) / 1000 },
                    }))}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Tubo ID (mm)</Label>
                    <InfoTooltip {...getTooltipProps('pneum.tubeDiameter')} iconSize={11} />
                    <CalibBadge status={physicalConfig.pneumaticConfig?.tubeInnerDiameterMm ? 'verified' : 'estimated'} />
                  </div>
                  <Input type="number" step="0.5" min="2" max="12"
                    value={physicalConfig.pneumaticConfig?.tubeInnerDiameterMm ?? 4}
                    onChange={(e) => setPhysicalConfig((p) => ({
                      ...p,
                      pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), tubeInnerDiameterMm: Number(e.target.value) },
                    }))}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Bore cilindro (mm)</Label>
                    <InfoTooltip {...getTooltipProps('pneum.cylinderBore')} iconSize={11} />
                  </div>
                  <Input type="number" step="1" min="10" max="100"
                    value={physicalConfig.pneumaticConfig?.cylinderBoreMm ?? 32}
                    onChange={(e) => setPhysicalConfig((p) => ({
                      ...p,
                      pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), cylinderBoreMm: Number(e.target.value) },
                    }))}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Carrera (mm)</Label>
                    <InfoTooltip {...getTooltipProps('pneum.cylinderStrokeMm')} iconSize={11} />
                  </div>
                  <Input type="number" step="5" min="10" max="200"
                    value={physicalConfig.pneumaticConfig?.cylinderStrokeMm ?? 50}
                    onChange={(e) => setPhysicalConfig((p) => ({
                      ...p,
                      pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), cylinderStrokeMm: Number(e.target.value) },
                    }))}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Cv válvula</Label>
                    <InfoTooltip {...getTooltipProps('pneum.valveCv')} iconSize={11} />
                  </div>
                  <Input type="number" step="0.1" min="0.1" max="3"
                    value={physicalConfig.pneumaticConfig?.valveCv ?? 0.7}
                    onChange={(e) => setPhysicalConfig((p) => ({
                      ...p,
                      pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), valveCv: Number(e.target.value) },
                    }))}
                    className="mt-1 font-mono"
                  />
                </div>
              </div>

              {/* Longitudes de línea por gate */}
              <p className="text-xs font-medium mb-2 flex items-center gap-1">
                Largo de línea neumática por gate
                <InfoTooltip {...getTooltipProps('pneum.lineLengthM')} iconSize={11} />
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1 px-2 w-14">Gate</th>
                      <th className="py-1 px-2">Línea (m)</th>
                      <th className="py-1 px-2 text-right text-muted-foreground text-xs">t_respuesta</th>
                      <th className="py-1 px-2 text-right text-muted-foreground text-xs">P_eff (bar)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((gateNum) => {
                      const pneumCfg = physicalConfig.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT
                      const lineLen = pneumCfg.gateLineLengthsM[gateNum] ?? (1.5 + gateNum * 1.5)
                      // Quick preview calculation
                      const pDrop = computeLinePressureDrop(lineLen, pneumCfg.tubeInnerDiameterMm, pneumCfg.supplyPressureBar)
                      const pEff = Math.max(pneumCfg.supplyPressureBar - pDrop, 1.0)
                      const tLine = computeLineChargeTime(lineLen, pneumCfg.tubeInnerDiameterMm, pneumCfg.supplyPressureBar, pneumCfg.valveCv)
                      const tCyl = computeCylinderStrokeTime(pneumCfg.cylinderBoreMm, pneumCfg.cylinderStrokeMm, pEff, pneumCfg.valveCv, pneumCfg.cylinderEfficiency ?? 0.85)
                      const tTotal = pneumCfg.valveSwitchTimeSec + tLine + tCyl
                      return (
                        <tr key={gateNum} className="border-b hover:bg-muted/30">
                          <td className="py-1 px-2 text-center">
                            <Badge variant="outline" className="text-xs">{gateNum}</Badge>
                          </td>
                          <td className="py-1 px-2">
                            <Input type="number" step="0.5" min="0.5" max="30"
                              value={pneumCfg.gateLineLengthsM[gateNum] ?? (1.5 + gateNum * 1.5)}
                              onChange={(e) => {
                                const val = Number(e.target.value)
                                setPhysicalConfig((p) => ({
                                  ...p,
                                  pneumaticConfig: {
                                    ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT),
                                    gateLineLengthsM: {
                                      ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT).gateLineLengthsM,
                                      [gateNum]: val,
                                    },
                                  },
                                }))
                              }}
                              className="h-7 font-mono text-xs"
                            />
                          </td>
                          <td className="py-1 px-2 text-right tabular-nums text-muted-foreground font-mono text-xs">
                            {(tTotal * 1000).toFixed(0)}ms
                          </td>
                          <td className={cn('py-1 px-2 text-right tabular-nums font-mono text-xs',
                            pEff >= 5 ? 'text-emerald-600' : pEff >= 3 ? 'text-amber-600' : 'text-red-600',
                          )}>
                            {pEff.toFixed(1)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                Medir largo de tubo real desde manifold (bloque de electroválvulas) siguiendo el recorrido del tubo hasta cada flipper.
                Default: estimación lineal (1.5m base + 1.5m × gate).
              </p>
            </div>
            )}

            {/* Valores Z2 — dis1..dis12 */}
            {fisicaSubTab === 'distancias' && (
            <div>
              <p className="text-sm font-medium mb-1">Distancias Z2 programadas (dis1–dis12)</p>
              <p className="text-xs text-muted-foreground mb-3">
                Valores leídos desde el controlador Z2 en <span className="font-medium text-foreground">Cambiar Parámetros → dis1..dis12</span>.
                El Z2 dispara el solenoide cuando la cinta avanza esta distancia (en mm) desde el pesaje.
                Bajar = abre antes. Subir = abre después. Estos valores incluyen compensación neumática.
              </p>
              {(() => {
                const z2Vals = physicalConfig.z2ProgrammedDistancesMm ?? []
                const mainBelt = physicalConfig.belts.find((b) => b.beltId === 'main')
                const speedMps = mainBelt?.speedMps ?? 0.7
                const physPos = physicalConfig.flipperPositions.slice().sort((a, b) => a.gateNumber - b.gateNumber)
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 px-2 w-14">Gate</th>
                          <th className="py-2 px-2">Dist. Z2 (mm)</th>
                          <th className="py-2 px-2 text-right text-muted-foreground text-xs">Timing Z2</th>
                          <th className="py-2 px-2 text-right text-muted-foreground text-xs">Físico</th>
                          <th className="py-2 px-2 text-right text-muted-foreground text-xs">Δ anticipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 12 }, (_, i) => {
                          const gateNum = i + 1
                          const z2Val = z2Vals[i] ?? null
                          const physDist = physPos.find((fp) => fp.gateNumber === gateNum)?.distanceFromSensorMeters ?? null
                          const z2TimeSec = z2Val != null && speedMps > 0 ? z2Val / 1000 / speedMps : null
                          const physTimeSec = physDist != null && speedMps > 0 ? physDist / speedMps : null
                          const deltaMm = z2Val != null && physDist != null ? z2Val - physDist * 1000 : null
                          return (
                            <tr key={gateNum} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-2 text-center">
                                <Badge variant="outline" className="text-xs">{gateNum}</Badge>
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  type="number"
                                  step="25"
                                  min="100"
                                  value={z2Val ?? ''}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const newVals = [...(physicalConfig.z2ProgrammedDistancesMm ?? Array(12).fill(null))]
                                    newVals[i] = e.target.value ? Number(e.target.value) : 0
                                    setPhysicalConfig((p) => ({ ...p, z2ProgrammedDistancesMm: newVals as number[] }))
                                  }}
                                  className="h-8 text-xs w-28 font-mono"
                                />
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-xs text-muted-foreground">
                                {z2TimeSec != null ? `${z2TimeSec.toFixed(2)} s` : '—'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-xs text-muted-foreground">
                                {physTimeSec != null ? `${physTimeSec.toFixed(2)} s` : '—'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-xs">
                                {deltaMm != null ? (
                                  <span className={cn(deltaMm < 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                                    {deltaMm > 0 ? '+' : ''}{deltaMm.toFixed(0)} mm
                                  </span>
                                ) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
              <p className="text-xs text-muted-foreground mt-2">
                Δ negativo = Z2 dispara antes que la posición física del pivot (compensación neumática normal).
              </p>
            </div>
            )}

            {/* Verificación multi-fuente de velocidades */}
            {fisicaSubTab === 'calibracion' && calibracionSubTab === 'verificacion' && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                Cada cinta tiene 4 fuentes posibles. Ingresar mediciones directas (tachómetro) para verificar.
                Diferencia &gt;5% entre fuentes indica drift o error de calibración.
                Seleccionar la fuente más confiable como "verdad" para los cálculos.
              </p>
              {/* Factor k configurable */}
              <div className="flex items-center gap-3 mb-4 p-2.5 rounded-md bg-muted/40 border border-border">
                <label className="text-xs text-muted-foreground whitespace-nowrap">
                  Factor k (unidades Z2 → m/s)
                </label>
                <input
                  type="number"
                  step="0.000001"
                  min="0.0001"
                  max="0.01"
                  value={physicalConfig.kFactor ?? 0.000786}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v) && v > 0) {
                      setPhysicalConfig((p) => ({ ...p, kFactor: v }))
                    }
                  }}
                  className="w-28 h-7 rounded border border-input bg-background px-2 text-xs font-mono text-right"
                />
                <span className="text-[10px] text-muted-foreground">
                  Default: 0.000786 · Ajustar hasta que Z2 coincida con tachómetro
                </span>
                {(physicalConfig.kFactor ?? 0.000786) !== 0.000786 && (
                  <button
                    type="button"
                    onClick={() => setPhysicalConfig((p) => { const { kFactor: _, ...rest } = p; return rest as typeof p })}
                    className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    Restaurar default
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {physicalConfig.belts.map((belt) => {
                  const k = physicalConfig.kFactor ?? 0.000786
                  const z2Units = belt.z2Units
                  const speedFromZ2 = z2Units ? z2Units * k : null
                  const speedFromVfd = belt.vfd ? computeBeltSpeedFromVfd(belt.vfd) : null
                  const speedFromTachShaft = (belt.vfd?.measuredShaftRpm && belt.vfd?.effectiveMpsPerRpm)
                    ? belt.vfd.measuredShaftRpm * belt.vfd.effectiveMpsPerRpm : null
                  const speedFromTachLinear = belt.vfd?.measuredBeltMps ?? null
                  const truthSource = belt.vfd?.truthSource ?? 'z2'

                  // Detectar discrepancias > 5%
                  const allSpeeds = [speedFromZ2, speedFromVfd, speedFromTachShaft, speedFromTachLinear]
                    .filter((s): s is number => s !== null)
                  const maxSpeed = Math.max(...allSpeeds)
                  const minSpeed = Math.min(...allSpeeds)
                  const discrepancyPct = allSpeeds.length >= 2 ? ((maxSpeed - minSpeed) / minSpeed) * 100 : 0
                  const hasDiscrepancy = discrepancyPct > 5

                  const applyTruth = (source: typeof truthSource, mps: number | null) => {
                    if (!mps) return
                    setPhysicalConfig((p) => ({
                      ...p,
                      belts: p.belts.map((b) => b.beltId === belt.beltId
                        ? { ...b, speedMps: Math.round(mps * 1000) / 1000, calibrationStatus: (source === 'tachShaft' || source === 'tachLinear') ? 'verified' as const : 'estimated' as const,
                            vfd: b.vfd ? { ...b.vfd, truthSource: source } : b.vfd }
                        : b),
                    }))
                  }

                  return (
                    <div key={belt.beltId} className={cn('rounded-lg border p-3 text-xs', hasDiscrepancy && 'border-amber-400 bg-amber-50 dark:bg-amber-950/20')}>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-medium text-sm">{belt.label}</span>
                        {belt.vfd?.label && (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">VFD: {belt.vfd.label}</Badge>
                            <Select
                              value={belt.vfd.assignedBeltId ?? belt.beltId}
                              onValueChange={(v) => setPhysicalConfig((p) => ({
                                ...p,
                                belts: p.belts.map((b) => b.beltId === belt.beltId
                                  ? { ...b, vfd: b.vfd ? { ...b.vfd, assignedBeltId: v as 'zeta' | 'accel1' | 'accel2' | 'main' } : b.vfd }
                                  : b),
                              }))}>
                              <SelectTrigger className="h-5 text-[10px] w-36 px-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="zeta">Z-Belt (elevadora)</SelectItem>
                                <SelectItem value="accel1">Accel Belt 1</SelectItem>
                                <SelectItem value="accel2">Accel Belt 2</SelectItem>
                                <SelectItem value="main">Grading Belt</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {hasDiscrepancy && <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">⚠ Discrepancia {discrepancyPct.toFixed(0)}%</Badge>}
                        <span className="ml-auto font-mono font-semibold">{belt.speedMps.toFixed(3)} m/s actual</span>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="py-1 px-2 text-left font-normal">Fuente</th>
                            <th className="py-1 px-2 text-left font-normal">Entrada</th>
                            <th className="py-1 px-2 text-right font-normal">Vel. (m/s)</th>
                            <th className="py-1 px-2 text-right font-normal">Estado</th>
                            <th className="py-1 px-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Fuente 1: Z2 units */}
                          <tr className={cn('border-b', truthSource === 'z2' && 'bg-green-500/5')}>
                            <td className="py-1 px-2">Z2 controller</td>
                            <td className="py-1 px-2 font-mono">{z2Units ?? '—'} units × {k.toFixed(6)}</td>
                            <td className="py-1 px-2 text-right font-mono">{speedFromZ2?.toFixed(3) ?? '—'}</td>
                            <td className="py-1 px-2 text-right"><CalibBadge status="estimated" /></td>
                            <td className="py-1 px-2 text-right">
                              <Button size="sm" variant={truthSource === 'z2' ? 'default' : 'outline'} className="h-6 text-[10px] px-2"
                                onClick={() => applyTruth('z2', speedFromZ2)}>
                                {truthSource === 'z2' ? '✓ Activo' : 'Usar'}
                              </Button>
                            </td>
                          </tr>
                          {/* Fuente 2: VFD RPM */}
                          <tr className={cn('border-b', truthSource === 'vfd' && 'bg-green-500/5')}>
                            <td className="py-1 px-2">VFD Danfoss</td>
                            <td className="py-1 px-2">
                              <div className="flex items-center gap-1">
                                <Input type="number" step="10" min="0" max="3000"
                                  value={belt.vfd?.vfdCurrentRpm ?? ''}
                                  placeholder="RPM"
                                  onChange={(e) => setPhysicalConfig((p) => ({
                                    ...p,
                                    belts: p.belts.map((b) => b.beltId === belt.beltId
                                      ? { ...b, vfd: b.vfd ? { ...b.vfd, vfdCurrentRpm: e.target.value ? Number(e.target.value) : undefined } : b.vfd }
                                      : b),
                                  }))}
                                  className="h-6 text-[10px] w-20 font-mono" />
                                <span className="text-muted-foreground">RPM</span>
                              </div>
                            </td>
                            <td className="py-1 px-2 text-right font-mono">{speedFromVfd?.toFixed(3) ?? '—'}</td>
                            <td className="py-1 px-2 text-right"><CalibBadge status={belt.vfd?.effectiveStatus} /></td>
                            <td className="py-1 px-2 text-right">
                              <Button size="sm" variant={truthSource === 'vfd' ? 'default' : 'outline'} className="h-6 text-[10px] px-2"
                                disabled={speedFromVfd === null}
                                onClick={() => applyTruth('vfd', speedFromVfd)}>
                                {truthSource === 'vfd' ? '✓ Activo' : 'Usar'}
                              </Button>
                            </td>
                          </tr>
                          {/* Fuente 3: Tachómetro en eje */}
                          <tr className={cn('border-b', truthSource === 'tachShaft' && 'bg-green-500/5')}>
                            <td className="py-1 px-2">Tacómetro eje</td>
                            <td className="py-1 px-2">
                              <div className="flex items-center gap-1">
                                <Input type="number" step="1" min="0"
                                  value={belt.vfd?.measuredShaftRpm ?? ''}
                                  placeholder="RPM eje"
                                  onChange={(e) => setPhysicalConfig((p) => ({
                                    ...p,
                                    belts: p.belts.map((b) => b.beltId === belt.beltId
                                      ? { ...b, vfd: b.vfd ? { ...b.vfd, measuredShaftRpm: e.target.value ? Number(e.target.value) : undefined } : b.vfd }
                                      : b),
                                  }))}
                                  className="h-6 text-[10px] w-20 font-mono" />
                                <span className="text-muted-foreground">RPM</span>
                              </div>
                            </td>
                            <td className="py-1 px-2 text-right font-mono">{speedFromTachShaft?.toFixed(3) ?? '—'}</td>
                            <td className="py-1 px-2 text-right"><CalibBadge status={belt.vfd?.measuredShaftRpm ? 'verified' : 'unknown'} /></td>
                            <td className="py-1 px-2 text-right">
                              <Button size="sm" variant={truthSource === 'tachShaft' ? 'default' : 'outline'} className="h-6 text-[10px] px-2"
                                disabled={speedFromTachShaft === null}
                                onClick={() => applyTruth('tachShaft', speedFromTachShaft)}>
                                {truthSource === 'tachShaft' ? '✓ Activo' : 'Usar'}
                              </Button>
                            </td>
                          </tr>
                          {/* Fuente 4: Tachómetro lineal directo */}
                          <tr className={cn(truthSource === 'tachLinear' && 'bg-green-500/5')}>
                            <td className="py-1 px-2">Tacómetro lineal</td>
                            <td className="py-1 px-2">
                              <div className="flex items-center gap-1">
                                <Input type="number" step="0.01" min="0" max="3"
                                  value={belt.vfd?.measuredBeltMps ?? ''}
                                  placeholder="m/s"
                                  onChange={(e) => setPhysicalConfig((p) => ({
                                    ...p,
                                    belts: p.belts.map((b) => b.beltId === belt.beltId
                                      ? { ...b, vfd: b.vfd ? { ...b.vfd, measuredBeltMps: e.target.value ? Number(e.target.value) : undefined } : b.vfd }
                                      : b),
                                  }))}
                                  className="h-6 text-[10px] w-20 font-mono" />
                                <span className="text-muted-foreground">m/s</span>
                              </div>
                            </td>
                            <td className="py-1 px-2 text-right font-mono">{speedFromTachLinear?.toFixed(3) ?? '—'}</td>
                            <td className="py-1 px-2 text-right"><CalibBadge status={belt.vfd?.measuredBeltMps ? 'verified' : 'unknown'} /></td>
                            <td className="py-1 px-2 text-right">
                              <Button size="sm" variant={truthSource === 'tachLinear' ? 'default' : 'outline'} className="h-6 text-[10px] px-2"
                                disabled={speedFromTachLinear === null}
                                onClick={() => applyTruth('tachLinear', speedFromTachLinear)}>
                                {truthSource === 'tachLinear' ? '✓ Activo' : 'Usar'}
                              </Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      {/* Cuando hay tacómetro y VFD: derivar el factor effectiveMpsPerRpm */}
                      {belt.vfd?.measuredBeltMps && belt.vfd?.vfdCurrentRpm && (
                        <div className="mt-2 p-2 rounded bg-green-500/5 border border-green-500/20">
                          <span className="text-xs text-green-700 dark:text-green-300 font-medium">
                            Factor calibrado: {(belt.vfd.measuredBeltMps / belt.vfd.vfdCurrentRpm).toFixed(6)} m/(s·RPM)
                          </span>
                          <Button size="sm" variant="outline" className="ml-2 h-6 text-[10px] px-2 text-green-700 border-green-400"
                            onClick={() => setPhysicalConfig((p) => ({
                              ...p,
                              belts: p.belts.map((b) => b.beltId === belt.beltId
                                ? { ...b, vfd: b.vfd && b.vfd.measuredBeltMps && b.vfd.vfdCurrentRpm
                                    ? { ...b.vfd, effectiveMpsPerRpm: b.vfd.measuredBeltMps / b.vfd.vfdCurrentRpm, effectiveStatus: 'verified' as const }
                                    : b.vfd }
                                : b),
                            }))}>
                            Guardar factor ✓
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            )}

          </CardContent>
        )}
      </Card>
      )} {/* /3.4 */}

    </div>
  )
}
