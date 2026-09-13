/**
 * TechnicalSpecsModal v2.48.94
 *
 * Modal de Ficha Técnica rediseñado:
 *  - Separado de Galería (ahora es modal independiente)
 *  - 11 tipos de componente con campos específicos expandidos
 *  - Campos comunes para todos los tipos (Fabricante, Modelo, Serie, etc.)
 *  - Campos personalizados ilimitados
 *  - Exportación PDF
 *  - Backward compatible con datos existentes (pump→bomba, conveyor→cinta)
 */

import { useState, useEffect } from 'react'
import {
  ClipboardList, Trash2, Plus, Save, Loader2, FileDown,
  Zap, Droplets, Cog, ArrowRightLeft, GitBranch, Gauge,
  Wind, Thermometer, Filter, Package, CircleDot,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogTitle, Button, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Textarea, Badge,
} from '@/components/ui'
import type { Repuesto, TechnicalSpecs, MachineImage, TechnicalDataType } from '@/types/repuestos'
import { PLANTILLAS_FICHA, CAMPOS_COMUNES, normalizarTipoFicha } from '@/utils/repuestos/plantillasFichaTecnica'
import { exportTechnicalSheetToPDF } from '@/utils/repuestos/exportTechnicalSheet'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'

// ─── Templates ──────────────────────────────────────────────

/** Campos comunes que aplican a TODOS los tipos — compartidos con el PDF. */
const COMMON_FIELDS = CAMPOS_COMUNES

/** Lo que la UI agrega sobre la plantilla compartida: icono y color del tipo. */
const ADORNO: Record<string, { icon: typeof Zap; color: string }> = {
  motor: { icon: Zap, color: 'text-ink-warn' },
  bomba: { icon: Droplets, color: 'text-blue-400' },
  reductor: { icon: Cog, color: 'text-muted-foreground' },
  cinta: { icon: ArrowRightLeft, color: 'text-green-400' },
  valvula: { icon: GitBranch, color: 'text-red-400' },
  sensor: { icon: Gauge, color: 'text-cat-6-ink' },
  cilindro: { icon: CircleDot, color: 'text-cat-4-ink' },
  compresor: { icon: Wind, color: 'text-cat-7-ink' },
  intercambiador: { icon: Thermometer, color: 'text-cat-5-ink' },
  filtro: { icon: Filter, color: 'text-emerald-400' },
  general: { icon: Package, color: 'text-muted-foreground' },
}

/**
 * Las etiquetas y los campos salen de `plantillasFichaTecnica.ts` — los MISMOS que imprime el
 * PDF. Estaban duplicados acá y el PDF, que no los conocía, imprimía la clave en mayúscula.
 */
const TEMPLATES: Record<string, { label: string; fields: Record<string, string>; icon: typeof Zap; color: string }> =
  Object.fromEntries(
    Object.entries(PLANTILLAS_FICHA).map(([k, tpl]) => [
      k,
      { ...tpl, ...(ADORNO[k] ?? ADORNO['general']!) },
    ]),
  )


// ─── Props ──────────────────────────────────────────────────

interface TechnicalSpecsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repuesto: Repuesto | null
  machineId?: string
  initialTab?: 'specs' | 'gallery' // kept for backward compat, ignored
  readOnly?: boolean
  onSave?: (repuestoId: string, specs: TechnicalSpecs, gallery: MachineImage[]) => Promise<void>
}

// ─── Component ──────────────────────────────────────────────

export function TechnicalSpecsModal({
  open,
  onOpenChange,
  repuesto,
  machineId,
  readOnly = false,
  onSave,
}: TechnicalSpecsModalProps) {
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { toast } = useToast()

  const [specs, setSpecs] = useState<TechnicalSpecs>({
    type: 'general',
    standardValues: {},
    customFields: [],
    updatedAt: Date.now(),
  })

  useEffect(() => {
    if (open && repuesto) {
      if (repuesto.technicalSpecs) {
        setSpecs({
          ...repuesto.technicalSpecs,
          type: normalizarTipoFicha(repuesto.technicalSpecs.type) as TechnicalDataType,
        })
      } else {
        setSpecs({ type: 'general', standardValues: {}, customFields: [], updatedAt: Date.now() })
      }
    }
  }, [open, repuesto])

   
  const currentTemplate = (TEMPLATES[specs.type] ?? TEMPLATES['general'])!

  const handleStandardChange = (key: string, value: string) => {
    setSpecs(prev => ({
      ...prev,
      standardValues: { ...prev.standardValues, [key]: value },
    }))
  }

  const handleCustomChange = (id: string, field: 'label' | 'value', value: string) => {
    setSpecs(prev => ({
      ...prev,
      customFields: prev.customFields.map(f => (f.id === id ? { ...f, [field]: value } : f)),
    }))
  }

  const addCustomField = () => {
    setSpecs(prev => ({
      ...prev,
      customFields: [
        ...prev.customFields,
        { id: crypto.randomUUID(), label: '', value: '', isCustom: true },
      ],
    }))
  }

  const removeCustomField = (id: string) => {
    setSpecs(prev => ({
      ...prev,
      customFields: prev.customFields.filter(f => f.id !== id),
    }))
  }

  const handleSave = async () => {
    if (!repuesto || !onSave) return
    setSaving(true)
    try {
      await onSave(repuesto.id, { ...specs, updatedAt: Date.now() }, repuesto.gallery || [])
      onOpenChange(false)
    } catch (err) {
      logger.error('Error saving specs', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  const handleExportPDF = async () => {
    if (!repuesto) return
    setExporting(true)
    try {
      await exportTechnicalSheetToPDF({ ...repuesto, technicalSpecs: specs }, machineId)
      toast({ title: 'PDF Exportado', description: 'La ficha técnica se ha descargado.' })
    } catch (err) {
      logger.error('Error al exportar PDF de ficha técnica', err instanceof Error ? err : new Error(String(err)))
      toast({ title: 'Error', description: 'No se pudo generar el PDF', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const filledCommon = Object.keys(COMMON_FIELDS).filter(k => specs.standardValues[k]).length
  const filledSpecific = Object.keys(currentTemplate.fields).filter(k => specs.standardValues[k]).length
  const filledCustom = specs.customFields.filter(f => f.label && f.value).length

  if (!repuesto) return null

  const Icon = currentTemplate.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="p-4 border-b bg-muted flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ClipboardList className="w-4 h-4" />
            <span className="text-xs font-mono uppercase tracking-wider">Ficha Técnica</span>
          </div>
          <DialogTitle className="text-lg font-bold truncate pr-8">
            {repuesto.textoBreve || 'Repuesto sin nombre'}
          </DialogTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span>SAP: {repuesto.codigoSAP || 'N/A'}</span>
            {repuesto.codigoFabricante && <span>Fab: {repuesto.codigoFabricante}</span>}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Tipo de Componente */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground tracking-wider">
                Tipo de Componente
              </span>
              <div className="flex items-center gap-1.5">
                <Icon className={`h-4 w-4 ${currentTemplate.color}`} />
                <span className={`text-xs font-medium ${currentTemplate.color}`}>{currentTemplate.label}</span>
              </div>
            </div>
            <Select
              disabled={readOnly}
              value={specs.type}
              onValueChange={(val) => setSpecs(prev => ({ ...prev, type: val as TechnicalDataType }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATES).map(([key, tpl]) => {
                  const TplIcon = tpl.icon
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <TplIcon className={`h-3.5 w-3.5 ${tpl.color}`} />
                        <span>{tpl.label}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Datos Comunes */}
          <div className="space-y-3 p-3 bg-primary/[0.15] rounded-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Datos Generales</h3>
              </div>
              <Badge variant="outline" className="text-caption px-1.5 py-0">
                {filledCommon}/{Object.keys(COMMON_FIELDS).length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(COMMON_FIELDS).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <label className="text-caption font-medium text-muted-foreground uppercase">{label}</label>
                  <Input
                    disabled={readOnly}
                    value={specs.standardValues[key]?.toString() || ''}
                    onChange={(e) => handleStandardChange(key, e.target.value)}
                    className="bg-background h-8 text-sm"
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Campos Específicos del Tipo */}
          {Object.keys(currentTemplate.fields).length > 0 && (
            <div className="space-y-3 p-3 bg-muted rounded-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 ${currentTemplate.color}`} />
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    Datos {currentTemplate.label}
                  </h3>
                </div>
                <Badge variant="outline" className="text-caption px-1.5 py-0">
                  {filledSpecific}/{Object.keys(currentTemplate.fields).length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(currentTemplate.fields).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-caption font-medium text-muted-foreground uppercase">{label}</label>
                    <Input
                      disabled={readOnly}
                      value={specs.standardValues[key]?.toString() || ''}
                      onChange={(e) => handleStandardChange(key, e.target.value)}
                      className="bg-background h-8 text-sm"
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Campos Personalizados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Campos Adicionales</h3>
                {filledCustom > 0 && (
                  <Badge variant="outline" className="text-caption px-1.5 py-0">{filledCustom}</Badge>
                )}
              </div>
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={addCustomField} className="h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Agregar
                </Button>
              )}
            </div>

            {specs.customFields.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground italic border border-dashed rounded-card">
                No hay campos personalizados
              </div>
            ) : (
              <div className="space-y-2">
                {specs.customFields.map((field) => (
                  <div key={field.id} className="flex gap-2 items-start animate-in fade-in slide-in-from-left-2 duration-200">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        disabled={readOnly}
                        placeholder="Nombre (ej: Marca sello)"
                        value={field.label}
                        onChange={(e) => handleCustomChange(field.id, 'label', e.target.value)}
                        className="h-8 text-xs font-medium"
                      />
                      <Input
                        disabled={readOnly}
                        placeholder="Valor"
                        value={field.value}
                        onChange={(e) => handleCustomChange(field.id, 'value', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeCustomField(field.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div className="space-y-2 pt-2 border-t">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Observaciones</span>
            <Textarea
              disabled={readOnly}
              value={specs.notes || ''}
              onChange={(e) => setSpecs(prev => ({ ...prev, notes: e.target.value }))}
              className="min-h-[80px] bg-background resize-none text-sm"
              placeholder="Información relevante adicional..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-background flex justify-between gap-2">
          <Button variant="outline" onClick={handleExportPDF} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            PDF
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {readOnly ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Guardar Cambios</>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
