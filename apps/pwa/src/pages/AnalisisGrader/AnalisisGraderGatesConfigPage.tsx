/**
 * P2) Configuración de Gates (12 compuertas)
 *
 * Tabla editable, guardar/cargar plantillas, configuración del análisis.
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Label } from '@/components/ui'
import { Settings2, Save, FolderOpen, ChevronRight, ChevronLeft, Trash2, ChevronDown, RotateCcw, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore, useIsAdmin } from '@/store'
import {
  saveGatesTemplate,
  listGatesTemplates,
  deleteGatesTemplate,
  type GatesTemplate,
} from '@/services/grader/graderSession.service'
import { getModuleRanges, saveModuleRanges, saveModuleShiftSchedule, saveModulePhysicalConfig } from '@/services/grader/graderModuleConfig.service'
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
import { CALIBRE_WEIGHT_RANGES, DEFAULT_PHYSICAL_CONFIG, computeZetaBeltSpeedMps, estimateZetaThroughput } from '@/services/grader/graderAnalytics'

interface Props {
  gates: GateAssignment[]
  config: GraderAnalysisConfig
  parsedData: ParsedMatrixData
  onComplete: (gates: GateAssignment[], config: GraderAnalysisConfig) => void
  onBack?: () => void
}

const QUALITIES: GraderQuality[] = ['Premium', 'Grado', 'Industrial', 'D', 'Unknown']
const DEFAULT_CALIBRES: CalibreRange[] = ['0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', 'Other']
const SHIFT_OPTIONS = ['Turno día', 'Turno noche'] as const

function buildRangeLabel(calibre: string, minGrams: number, maxGrams: number): string {
  return `${calibre} (${minGrams.toLocaleString()}-${maxGrams.toLocaleString()} g)`
}

/** Lookup rango peso por calibre — usa custom ranges si existen */
function calibreRangeLookup(calibre: string, ranges: CalibreWeightRange[]): string {
  const r = ranges.find((w) => w.calibre === calibre)
  if (!r) return '—'
  return r.label || buildRangeLabel(r.calibre, r.minGrams, r.maxGrams)
}

/** Badge de estado de calibración para parámetros físicos */
function CalibBadge({ status }: { status: CalibrationStatus | undefined }) {
  if (status === 'verified')
    return <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 whitespace-nowrap">✓ Verificado</Badge>
  if (status === 'estimated')
    return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">⚠ Estimado</Badge>
  return <Badge className="text-[10px] bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 whitespace-nowrap">? Falta</Badge>
}

export function AnalisisGraderGatesConfigPage({ gates: initialGates, config: initialConfig, parsedData, onComplete, onBack }: Props) {
  const [gates, setGates] = useState<GateAssignment[]>(initialGates)
  const [config, setConfig] = useState<GraderAnalysisConfig>(initialConfig)
  const [templates, setTemplates] = useState<GatesTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showWeightRanges, setShowWeightRanges] = useState(false)
  const [savingRanges, setSavingRanges] = useState(false)
  const [rangesError, setRangesError] = useState<string | null>(null)
  const [shiftSchedule, setShiftSchedule] = useState(DEFAULT_SHIFT_SCHEDULE)
  const [showPhysicalConfig, setShowPhysicalConfig] = useState(false)
  const [physicalConfig, setPhysicalConfig] = useState<GraderPhysicalConfig>(DEFAULT_PHYSICAL_CONFIG)
  const [savingPhysical, setSavingPhysical] = useState(false)
  const [physicalError, setPhysicalError] = useState<string | null>(null)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const user = useAuthStore((s) => s.user)
  const isAdmin = useIsAdmin()

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

  const resetWeightRanges = () => {
    setConfig((c) => ({ ...c, customWeightRanges: undefined }))
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

  const handleSaveShiftSchedule = async () => {
    if (!user) return
    setSavingSchedule(true)
    setScheduleError(null)
    try {
      await saveModuleShiftSchedule({
        schedule: shiftSchedule,
        updatedBy: user.id,
      })
    } catch {
      setScheduleError('No se pudo guardar el horario de turnos.')
    } finally {
      setSavingSchedule(false)
    }
  }

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
        setShiftSchedule(normalizeShiftSchedule(cfg?.shiftSchedule))
        if (cfg?.physicalConfig) {
          setPhysicalConfig(cfg.physicalConfig)
          setConfig((c) => ({ ...c, physicalConfig: cfg.physicalConfig }))
        }
      })
      .catch(() => {})
  }, [])

  // Autosave rangos globales (debounce)
  useEffect(() => {
    if (!user) return
    if (!config.customWeightRanges || config.customWeightRanges.length === 0) return

    const timer = setTimeout(() => {
      saveModuleRanges({
        ranges: config.customWeightRanges || [],
        updatedBy: user.id,
      }).catch(() => {
        setRangesError('No se pudo guardar rangos del modulo.')
      })
    }, 800)

    return () => clearTimeout(timer)
  }, [config.customWeightRanges, user])

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

  const handleSavePhysicalConfig = async () => {
    if (!user) return
    setSavingPhysical(true)
    setPhysicalError(null)
    try {
      await saveModulePhysicalConfig({ physicalConfig, updatedBy: user.id })
      setConfig((c) => ({ ...c, physicalConfig }))
    } catch {
      setPhysicalError('No se pudo guardar la configuración física.')
    } finally {
      setSavingPhysical(false)
    }
  }

  const handleQuickSaveRanges = async () => {
    if (!user) return
    if (!config.customWeightRanges || config.customWeightRanges.length === 0) return
    setSavingRanges(true)
    setRangesError(null)
    try {
      await saveModuleRanges({
        ranges: config.customWeightRanges,
        updatedBy: user.id,
      })
    } catch {
      setRangesError('No se pudo guardar los rangos del modulo.')
    } finally {
      setSavingRanges(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configuración del Análisis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Dispositivo</Label>
              <Input
                value={config.deviceId || ''}
                onChange={(e) => setConfig((c) => ({ ...c, deviceId: e.target.value }))}
                placeholder="STATICGRADER1"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Turno / Shift ID</Label>
              <Select
                value={config.shiftId || 'Turno noche'}
                onValueChange={(v) => setConfig((c) => ({ ...c, shiftId: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Intervalo Serie Temporal</Label>
              <Select
                value={String(config.intervalMinutes ?? 15)}
                onValueChange={(v) => setConfig((c) => ({ ...c, intervalMinutes: Number(v) as 5 | 15 | 60 }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutos</SelectItem>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Timezone</Label>
              <Input
                value={config.timezone || ''}
                onChange={(e) => setConfig((c) => ({ ...c, timezone: e.target.value }))}
                placeholder="America/Santiago"
                className="mt-1"
              />
            </div>
          </div>

          {/* Thresholds */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Umbral Fotocélula (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={config.errorThresholds?.photocellPctWarn ?? 1}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, photocellPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Umbral Fuera de Límites (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={config.errorThresholds?.outOfLimitsPctWarn ?? 3}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, outOfLimitsPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Umbral Punto Cero (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={config.errorThresholds?.pointZeroPctWarn ?? 2}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, pointZeroPctWarn: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Umbral Punto Cero Crítico (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={config.errorThresholds?.pointZeroPctCritical ?? Math.max((config.errorThresholds?.pointZeroPctWarn ?? 2) + 0.5, (config.errorThresholds?.pointZeroPctWarn ?? 2) * 1.5)}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    errorThresholds: { ...c.errorThresholds!, pointZeroPctCritical: Number(e.target.value) },
                  }))
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Label className="text-sm">Horarios de turnos</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveShiftSchedule}
                disabled={savingSchedule || !user}
              >
                <Save className="h-4 w-4 mr-1" />
                {savingSchedule ? 'Guardando...' : 'Guardar horarios'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Formato HH:MM. El turno noche puede cruzar medianoche (fin menor que inicio).
            </p>
            <div className="mt-3 grid gap-2">
              {shiftSchedule.map((shift, idx) => (
                <div key={shift.shiftId} className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="text-xs">{shift.shiftId}</Badge>
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
            {scheduleError && (
              <div className="mt-2 text-xs text-destructive">{scheduleError}</div>
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

      {/* Quick navigation visible */}
      <div className="sticky top-14 z-20">
        <Card className="border-primary/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <CardContent className="py-2 px-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Datos cargados: puede ir al dashboard en cualquier momento.</p>
            <Button size="sm" onClick={() => onComplete(gates, config)}>
              Ver Dashboard
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Gates Table */}
      <Card>
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
                <tr className="border-b text-left">
                  <th className="py-2 px-2 w-16">Gate</th>
                  <th className="py-2 px-2">Calibre</th>
                  <th className="py-2 px-2 text-center">Rango (g)</th>
                  <th className="py-2 px-2">Calidad</th>
                  <th className="py-2 px-2 w-20 text-center">Activo</th>
                  <th className="py-2 px-2">Nota</th>
                </tr>
              </thead>
              <tbody>
                {gates.map((gate, idx) => (
                  <tr key={gate.gateNumber} className="border-b hover:bg-muted/30">
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
                    <td className="py-2 px-2">
                      <Input
                        value={gate.note || ''}
                        onChange={(e) => updateGate(idx, { note: e.target.value })}
                        placeholder="—"
                        className="h-8 text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Editable Weight Ranges */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setShowWeightRanges(!showWeightRanges)}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <ChevronDown className={`h-4 w-4 transition-transform ${showWeightRanges ? '' : '-rotate-90'}`} />
            Rangos de Peso por Calibre
            {isCustomRanges && (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Personalizado
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        {showWeightRanges && (
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleQuickSaveRanges}
                  disabled={!isCustomRanges || savingRanges}
                >
                  <Save className="h-3 w-3 mr-1" />
                  Guardar rangos
                </Button>
              </div>
              {rangesError && (
                <span className="text-xs text-destructive">{rangesError}</span>
              )}
              {isCustomRanges && (
                <Button variant="outline" size="sm" onClick={resetWeightRanges}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restaurar valores originales
                </Button>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Configuración Física de la Máquina */}
      <Card>
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
        {showPhysicalConfig && (
          <CardContent className="space-y-6">
            <p className="text-xs text-muted-foreground">
              Parámetros físicos de la <span className="font-medium text-foreground">Marelec MS4/12</span> (S/N 3943, controlador Z2).
              Usados para calcular separación entre peces, timing de flippers y enriquecer el contexto de la IA.
            </p>

            {/* Dimensiones del salmón, flipper y pockets */}
            <div>
              <p className="text-sm font-medium mb-3">Producto y flipper</p>
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
                  <p className="text-[10px] text-muted-foreground mt-1">Máx. admitido: 110 cm</p>
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
                  <p className="text-[10px] text-muted-foreground mt-1">Máx. admitido: 29 cm</p>
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

            {/* Cintas */}
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

            {/* Z-Belt variador Danfoss */}
            {physicalConfig.zetaDrive && (() => {
              const drive = physicalConfig.zetaDrive!
              const computed = computeZetaBeltSpeedMps(drive)
              const throughput = estimateZetaThroughput(computed ?? 0, physicalConfig.avgFishSpacingOnZetaBeltM)
              return (
                <div>
                  <p className="text-sm font-medium mb-1">Z-Belt — Variador Danfoss (cinta elevadora)</p>
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

            {/* Valores Z2 — dis1..dis12 */}
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

            {/* Velocidad cintas Z2 */}
            <div>
              <p className="text-sm font-medium mb-1">Velocidad cintas Z2 (snapshot de turno)</p>
              <p className="text-xs text-muted-foreground mb-3">
                Registrar los valores que muestra la pantalla Z2 <span className="font-medium text-foreground">"Velocidad cintas"</span> al inicio del turno.
                El sistema los convierte a m/s usando el factor de calibración.
              </p>
              {/* Factor de calibración Z2 → m/s */}
              {(() => {
                const scale = physicalConfig.z2SpeedScale
                const k = scale?.factorMpsPerUnit ?? 0.000786
                return (
                  <div className="mb-3 p-3 rounded-lg bg-muted/30 border text-xs space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">Factor conversión Z2 → m/s:</span>
                      <span className="font-mono bg-background rounded px-2 py-0.5 border">{k.toFixed(6)} m/s/unit</span>
                      <CalibBadge status={scale?.anchorStatus ?? 'estimated'} />
                    </div>
                    <p className="text-muted-foreground">
                      Anclaje actual: {scale?.anchorUnits ?? 1781} units → {scale?.anchorActualMps ?? 1.40} m/s
                      ({scale?.anchorBelt === 'main' ? 'Sorting Belt' : scale?.anchorBelt ?? 'Sorting Belt'}) —
                      derivado de <span className="italic">especificación fabricante</span>.
                    </p>
                    <div className="border-t pt-2 space-y-2">
                      <p className="font-medium text-foreground">Para verificar con tachómetro:</p>
                      <p className="text-muted-foreground">
                        Medir velocidad real de la Sorting Belt mientras el Z2 muestra N unidades.
                        Ingresar aquí → k_real = velocidad_medida / unidades_Z2.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="w-36 shrink-0">Unidades Z2 (leídas):</label>
                        <Input
                          type="number" step="1" min="0"
                          value={scale?.anchorUnits ?? ''}
                          placeholder="ej: 1631"
                          onChange={(e) => {
                            const units = e.target.value ? Number(e.target.value) : undefined
                            setPhysicalConfig((p) => ({
                              ...p,
                              z2SpeedScale: {
                                factorMpsPerUnit: units && p.z2SpeedScale?.anchorActualMps
                                  ? p.z2SpeedScale.anchorActualMps / units
                                  : (p.z2SpeedScale?.factorMpsPerUnit ?? 0.000786),
                                anchorBelt: 'main' as const,
                                anchorUnits: units,
                                anchorActualMps: p.z2SpeedScale?.anchorActualMps,
                                anchorStatus: (units && p.z2SpeedScale?.anchorActualMps) ? 'verified' as const : 'estimated' as const,
                              },
                            }))
                          }}
                          className="h-7 text-xs w-24 font-mono"
                        />
                        <label className="shrink-0">Velocidad medida (m/s):</label>
                        <Input
                          type="number" step="0.01" min="0" max="2"
                          value={scale?.anchorActualMps ?? ''}
                          placeholder="ej: 1.28"
                          onChange={(e) => {
                            const mps = e.target.value ? Number(e.target.value) : undefined
                            setPhysicalConfig((p) => ({
                              ...p,
                              z2SpeedScale: {
                                factorMpsPerUnit: mps && p.z2SpeedScale?.anchorUnits
                                  ? mps / p.z2SpeedScale.anchorUnits
                                  : (p.z2SpeedScale?.factorMpsPerUnit ?? 0.000786),
                                anchorBelt: 'main' as const,
                                anchorUnits: p.z2SpeedScale?.anchorUnits,
                                anchorActualMps: mps,
                                anchorStatus: (mps && p.z2SpeedScale?.anchorUnits) ? 'verified' as const : 'estimated' as const,
                              },
                            }))
                          }}
                          className="h-7 text-xs w-24 font-mono"
                        />
                        {scale?.anchorUnits && scale?.anchorActualMps && (
                          <span className="font-mono text-green-600 font-medium">
                            k = {(scale.anchorActualMps / scale.anchorUnits).toFixed(6)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
              {(() => {
                const k = physicalConfig.z2SpeedScale?.factorMpsPerUnit ?? 0.000786
                type SpeedKey = 'zBeltUnits' | 'accel1Units' | 'accel2Units' | 'sortingUnits'
                const readings = physicalConfig.z2BeltSpeedReadings
                const fields: { key: SpeedKey; label: string; refUnits: number; beltId: string }[] = [
                  { key: 'zBeltUnits',   label: 'Z-Belt (elevadora)',         refUnits: 494,  beltId: 'zeta'   },
                  { key: 'accel1Units',  label: 'Acceleration Belt 1',        refUnits: 1313, beltId: 'accel1' },
                  { key: 'accel2Units',  label: 'Acceleration Belt 2 (foto)', refUnits: 1560, beltId: 'accel2' },
                  { key: 'sortingUnits', label: 'Sorting Belt (cinta larga)', refUnits: 1631, beltId: 'main'   },
                ]
                return (
                  <div className="space-y-2">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2 px-2">Cinta</th>
                            <th className="py-2 px-2">Unidades Z2</th>
                            <th className="py-2 px-2 text-right text-muted-foreground text-xs">Calculado (m/s)</th>
                            <th className="py-2 px-2 text-right text-muted-foreground text-xs">Config actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map(({ key, label, refUnits, beltId }) => {
                            const rawVal: number | undefined = readings?.[key]
                            const units = rawVal ?? refUnits
                            const calcMps = units * k
                            const configBelt = physicalConfig.belts.find((b) => b.beltId === beltId)
                            const configMps = configBelt?.speedMps ?? 0
                            const drift = Math.abs(calcMps - configMps) > 0.05
                            return (
                              <tr key={key} className="border-b hover:bg-muted/30">
                                <td className="py-2 px-2 text-xs">{label}</td>
                                <td className="py-2 px-2">
                                  <Input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={rawVal ?? ''}
                                    placeholder={`ref: ${refUnits}`}
                                    onChange={(e) => {
                                      const v = e.target.value ? Number(e.target.value) : undefined
                                      setPhysicalConfig((p) => ({
                                        ...p,
                                        z2BeltSpeedReadings: { ...(p.z2BeltSpeedReadings ?? {}), [key]: v },
                                      }))
                                    }}
                                    className="h-8 text-xs w-24 font-mono"
                                  />
                                </td>
                                <td className="py-2 px-2 text-right font-mono text-xs">
                                  {calcMps.toFixed(3)} m/s
                                </td>
                                <td className="py-2 px-2 text-right font-mono text-xs">
                                  <span className={cn(drift ? 'text-amber-600 font-medium' : 'text-muted-foreground')}>
                                    {configMps.toFixed(2)} m/s
                                    {drift && <span className="ml-1 text-amber-600">⚠</span>}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        type="text"
                        placeholder="Etiqueta (ej. 12/07/2025 turno día)"
                        value={readings?.readingLabel ?? ''}
                        onChange={(e) => setPhysicalConfig((p) => ({
                          ...p,
                          z2BeltSpeedReadings: { ...(p.z2BeltSpeedReadings ?? {}), readingLabel: e.target.value },
                        }))}
                        className="h-8 text-xs flex-1 min-w-40 max-w-72"
                      />
                      <p className="text-xs text-muted-foreground">
                        Columna "⚠" = diferencia &gt;0.05 m/s entre lectura Z2 y configuración de cinta.
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Guardar */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSavePhysicalConfig}
                  disabled={savingPhysical || !user}
                >
                  <Save className="h-3 w-3 mr-1" />
                  {savingPhysical ? 'Guardando...' : 'Guardar config. física'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPhysicalConfig(DEFAULT_PHYSICAL_CONFIG)}
                  title="Restaurar valores por defecto"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Valores por defecto
                </Button>
              </div>
              {physicalError && (
                <span className="text-xs text-destructive">{physicalError}</span>
              )}
              {!physicalError && !savingPhysical && (
                <p className="text-xs text-muted-foreground">
                  Al guardar, la IA usará estos parámetros en próximas sesiones.
                </p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Navigation */}
      <div className={onBack ? 'flex justify-between' : 'flex justify-end'}>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
        )}
        <Button onClick={() => onComplete(gates, config)}>
          Aplicar configuración
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
