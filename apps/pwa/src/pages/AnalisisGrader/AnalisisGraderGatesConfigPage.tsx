/**
 * P2) Configuración de Gates (12 compuertas)
 *
 * Tabla editable, guardar/cargar plantillas, configuración del análisis.
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Label } from '@/components/ui'
import { Settings2, Save, FolderOpen, ChevronRight, ChevronLeft, Trash2, ChevronDown, RotateCcw, Plus } from 'lucide-react'
import { useAuthStore, useIsAdmin } from '@/store'
import {
  saveGatesTemplate,
  listGatesTemplates,
  deleteGatesTemplate,
  type GatesTemplate,
} from '@/services/grader/graderSession.service'
import { getDeviceRanges, saveDeviceRanges } from '@/services/grader/graderDeviceConfig.service'
import type {
  GateAssignment,
  GraderAnalysisConfig,
  ParsedMatrixData,
  GraderQuality,
  CalibreRange,
  CalibreWeightRange,
} from '@/services/grader/types'
import { CALIBRE_WEIGHT_RANGES } from '@/services/grader/graderAnalytics'

interface Props {
  gates: GateAssignment[]
  config: GraderAnalysisConfig
  parsedData: ParsedMatrixData
  onComplete: (gates: GateAssignment[], config: GraderAnalysisConfig) => void
  onBack: () => void
}

const QUALITIES: GraderQuality[] = ['Premium', 'Grado', 'Industrial', 'D', 'Unknown']
const DEFAULT_CALIBRES: CalibreRange[] = ['0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', 'Other']

function buildRangeLabel(calibre: string, minGrams: number, maxGrams: number): string {
  return `${calibre} (${minGrams.toLocaleString()}-${maxGrams.toLocaleString()} g)`
}

/** Lookup rango peso por calibre — usa custom ranges si existen */
function calibreRangeLookup(calibre: string, ranges: CalibreWeightRange[]): string {
  const r = ranges.find((w) => w.calibre === calibre)
  if (!r) return '—'
  return r.label || buildRangeLabel(r.calibre, r.minGrams, r.maxGrams)
}

export function AnalisisGraderGatesConfigPage({ gates: initialGates, config: initialConfig, parsedData, onComplete, onBack }: Props) {
  const [gates, setGates] = useState<GateAssignment[]>(initialGates)
  const [config, setConfig] = useState<GraderAnalysisConfig>(initialConfig)
  const [templates, setTemplates] = useState<GatesTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showWeightRanges, setShowWeightRanges] = useState(false)
  const [savingRanges, setSavingRanges] = useState(false)
  const [rangesError, setRangesError] = useState<string | null>(null)
  const [lastDeviceLoaded, setLastDeviceLoaded] = useState<string | null>(null)
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

  useEffect(() => {
    listGatesTemplates().then(setTemplates).catch(() => {})
  }, [])

  // Cargar rangos por dispositivo
  useEffect(() => {
    const deviceId = config.deviceId?.trim()
    if (!deviceId || deviceId === lastDeviceLoaded) return
    getDeviceRanges(deviceId)
      .then((cfg) => {
        if (cfg?.customWeightRanges && cfg.customWeightRanges.length > 0) {
          setConfig((c) => ({ ...c, customWeightRanges: cfg.customWeightRanges }))
        }
        setLastDeviceLoaded(deviceId)
      })
      .catch(() => {})
  }, [config.deviceId, lastDeviceLoaded])

  // Autosave rangos por dispositivo (debounce)
  useEffect(() => {
    const deviceId = config.deviceId?.trim()
    if (!user || !deviceId) return
    if (!config.customWeightRanges || config.customWeightRanges.length === 0) return

    const timer = setTimeout(() => {
      saveDeviceRanges({
        deviceId,
        ranges: config.customWeightRanges || [],
        updatedBy: user.id,
      }).catch(() => {
        setRangesError('No se pudo guardar rangos por dispositivo.')
      })
    }, 800)

    return () => clearTimeout(timer)
  }, [config.deviceId, config.customWeightRanges, user])

  const updateGate = (idx: number, patch: Partial<GateAssignment>) => {
    setGates((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)))
  }

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !user) return
    const tmpl = await saveGatesTemplate({
      name: templateName.trim(),
      deviceId: config.deviceId,
      gates,
      customWeightRanges: config.customWeightRanges,
      createdBy: user.id,
    })
    setTemplates((prev) => [tmpl, ...prev])
    setTemplateName('')
  }

  const handleLoadTemplate = (tmpl: GatesTemplate) => {
    setGates(tmpl.gates)
    if (tmpl.deviceId) setConfig((c) => ({ ...c, deviceId: tmpl.deviceId }))
    if (tmpl.customWeightRanges) {
      setConfig((c) => ({ ...c, customWeightRanges: tmpl.customWeightRanges }))
    } else {
      setConfig((c) => ({ ...c, customWeightRanges: undefined }))
    }
    setShowTemplates(false)
  }

  const handleDeleteTemplate = async (id: string) => {
    await deleteGatesTemplate(id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  const handleQuickSaveRanges = async () => {
    if (!user) return
    if (!config.customWeightRanges || config.customWeightRanges.length === 0) return
    setSavingRanges(true)
    setRangesError(null)
    try {
      const name = `Rangos ${config.deviceId || 'General'} ${new Date().toLocaleDateString('es-CL')}`
      const tmpl = await saveGatesTemplate({
        name,
        deviceId: config.deviceId,
        gates,
        customWeightRanges: config.customWeightRanges,
        createdBy: user.id,
      })
      setTemplates((prev) => [tmpl, ...prev])
      setShowTemplates(true)
    } catch {
      setRangesError('No se pudo guardar los rangos.')
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
              <Input
                value={config.shiftId || ''}
                onChange={(e) => setConfig((c) => ({ ...c, shiftId: e.target.value }))}
                placeholder="Turno noche"
                className="mt-1"
              />
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
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* Gates Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Configuración de 12 Gates
          </CardTitle>
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
                  className="flex items-center justify-between p-2 rounded bg-background"
                >
                  <div>
                    <span className="text-sm font-medium">{t.name}</span>
                    {t.deviceId && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {t.deviceId}
                      </Badge>
                    )}
                    {t.customWeightRanges && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        Rangos
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
                    placeholder="Nombre de plantilla..."
                    className="text-sm"
                  />
                  <Button size="sm" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
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

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
        <Button onClick={() => onComplete(gates, config)}>
          Ver Dashboard
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
