/**
 * ShiftGatesConfigAccordion — tabla editable de los 12 gates en la página de turno.
 *
 * Colapsado por defecto. El estado inicial viene del último configSnapshot.
 * Al guardar, crea un nuevo snapshot en Firestore y notifica al padre.
 * Coexiste con CurrentGateConfigPanel (read-only) y ConfigChangeHistory.
 */

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Button, Input, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Badge, Switch,
} from '@/components/ui'
import { ChevronDown, ChevronUp, SlidersHorizontal, Save, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'
import { saveConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { CALIBRE_WEIGHT_RANGES } from '@/services/grader/graderAnalytics'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type {
  GateAssignment, GraderQuality, GraderConservation, GraderProduct,
  CalibreRange, CalibreWeightRange,
} from '@/services/grader/types'

const QUALITIES: GraderQuality[] = ['Premium', 'Grado', 'Industrial', 'D', 'Unknown']
const DEFAULT_CALIBRES: CalibreRange[] = [
  '0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', 'Other',
]

const DEFAULT_GATES: GateAssignment[] = Array.from({ length: 12 }, (_, i) => ({
  gateNumber: i + 1,
  assignedCalibre: '4-6 lb' as CalibreRange,
  assignedQuality: 'Grado' as GraderQuality,
  active: true,
}))

function weightRangeLabel(calibre: string, ranges: CalibreWeightRange[]): string {
  const r = ranges.find(w => w.calibre === calibre)
  if (!r) return '—'
  return `${r.minGrams.toLocaleString('es-CL')}–${r.maxGrams.toLocaleString('es-CL')} g`
}

interface Props {
  shiftDocId: string
  configSnapshots: GateConfigSnapshot[]
  onSaved: () => void
  /** Cuando false, los selects y el botón de guardar quedan deshabilitados */
  allowEdit?: boolean
  plantLineId?: string
}

export function ShiftGatesConfigAccordion({ shiftDocId, configSnapshots, onSaved, allowEdit = true, plantLineId }: Props) {
  const user = useAuthStore(s => s.user)
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState('')
  const [weightRanges, setWeightRanges] = useState<CalibreWeightRange[]>(CALIBRE_WEIGHT_RANGES)

  // Gates iniciales: último snapshot o 12 defaults
  const initialGates = useMemo<GateAssignment[]>(() => {
    if (configSnapshots.length === 0) return DEFAULT_GATES
    const last = configSnapshots[configSnapshots.length - 1]!
    return [...last.gates].sort((a, b) => a.gateNumber - b.gateNumber)
  }, [configSnapshots])

  const [gates, setGates] = useState<GateAssignment[]>(initialGates)

  // Sincronizar cuando cambian los snapshots (ej. al guardar desde QuickGateChangeButton)
  useEffect(() => {
    setGates(initialGates)
  }, [initialGates])

  useEffect(() => {
    getModuleRanges(plantLineId)
      .then(cfg => {
        if (cfg?.customWeightRanges && cfg.customWeightRanges.length > 0) {
          setWeightRanges(cfg.customWeightRanges)
        }
      })
      .catch(() => {})
  }, [plantLineId])

  const availableCalibres = useMemo<CalibreRange[]>(() => {
    const fromRanges = weightRanges.map(r => r.calibre).filter(Boolean) as CalibreRange[]
    return Array.from(new Set([...fromRanges, ...DEFAULT_CALIBRES]))
  }, [weightRanges])

  function updateGate(idx: number, patch: Partial<GateAssignment>) {
    setGates(prev => prev.map((g, i) => i === idx ? { ...g, ...patch } : g))
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      const userName = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.email
      const result = await saveConfigSnapshot(
        shiftDocId,
        gates,
        { uid: user.id, name: userName },
        reason.trim() || undefined,
      )
      if (result === null) {
        toast({ title: 'Sin cambios detectados', description: 'La configuración es idéntica al snapshot anterior.' })
      } else {
        toast({ title: 'Configuración registrada', description: 'El snapshot de gates fue guardado correctamente.' })
        setReason('')
        setOpen(false)
        onSaved()
      }
    } catch (err) {
      toast({
        title: 'Error al guardar',
        description: err instanceof Error ? err.message : 'Reintentar',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const activeCount = gates.filter(g => g.active).length
  const allActive = activeCount === gates.length
  const allInactive = activeCount === 0

  // Helpers para selección bulk: más rápido que marcar/desmarcar 1 a 1.
  const setAllActive = (active: boolean) => {
    setGates(prev => prev.map(g => ({ ...g, active })))
  }

  return (
    <Card>
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          Editar configuración de gates
          <span className="text-[11px] font-normal text-muted-foreground ml-1">
            {activeCount} de 12 activas
          </span>
          {!allowEdit && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border/40 ml-1">
              solo lectura
            </span>
          )}
          {open && allowEdit && (
            <div className="flex items-center gap-1 ml-1" role="group" aria-label="Selección masiva">
              <button
                type="button"
                onClick={() => setAllActive(false)}
                disabled={allInactive}
                className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Desactivar todas las gates — útil para limpiar y elegir una a una"
              >
                Desactivar todas
              </button>
              <button
                type="button"
                onClick={() => setAllActive(true)}
                disabled={allActive}
                className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Activar todas las gates"
              >
                Activar todas
              </button>
            </div>
          )}
          <button
            onClick={() => setOpen(v => !v)}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? (
              <><ChevronUp className="w-3.5 h-3.5" /> Colapsar</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /> Expandir</>
            )}
          </button>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="pt-3 pb-4 space-y-3">
          {/* Tabla gates */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 px-2 w-12">Gate</th>
                  <th className="py-2 px-2">Calibre</th>
                  <th className="py-2 px-2 hidden sm:table-cell">Rango (g)</th>
                  <th className="py-2 px-2">Calidad</th>
                  <th className="py-2 px-2 hidden md:table-cell">Conserv.</th>
                  <th className="py-2 px-2 hidden md:table-cell">Producto</th>
                  <th className="py-2 px-2 w-16 text-center">Activo</th>
                </tr>
              </thead>
              <tbody>
                {gates.map((gate, idx) => (
                  <tr
                    key={gate.gateNumber}
                    className={`border-b border-border/30 transition-colors ${
                      idx % 2 === 1 ? 'bg-muted/10' : ''
                    } ${!gate.active ? 'opacity-50' : ''}`}
                  >
                    <td className="py-1.5 px-2 font-medium text-center">
                      <Badge variant="outline" className="text-[10px]">{gate.gateNumber}</Badge>
                    </td>
                    <td className="py-1.5 px-2">
                      <Select
                        value={gate.assignedCalibre}
                        onValueChange={v => updateGate(idx, { assignedCalibre: v as CalibreRange })}
                        disabled={!allowEdit}
                      >
                        <SelectTrigger className="h-7 text-xs w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCalibres.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2 hidden sm:table-cell">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {weightRangeLabel(gate.assignedCalibre, weightRanges)}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <Select
                        value={gate.assignedQuality}
                        onValueChange={v => updateGate(idx, { assignedQuality: v as GraderQuality })}
                        disabled={!allowEdit}
                      >
                        <SelectTrigger className="h-7 text-xs w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUALITIES.map(q => (
                            <SelectItem key={q} value={q}>{q}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2 hidden md:table-cell">
                      <Select
                        value={gate.assignedConservation ?? '__any'}
                        onValueChange={v => updateGate(idx, {
                          assignedConservation: v === '__any' ? undefined : v as GraderConservation,
                        })}
                        disabled={!allowEdit}
                      >
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any">Cualquiera</SelectItem>
                          <SelectItem value="CONGELADO">Congelado</SelectItem>
                          <SelectItem value="FRESCO">Fresco</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2 hidden md:table-cell">
                      <Select
                        value={gate.assignedProduct ?? '__any'}
                        onValueChange={v => updateGate(idx, {
                          assignedProduct: v === '__any' ? undefined : v as GraderProduct,
                        })}
                        disabled={!allowEdit}
                      >
                        <SelectTrigger className="h-7 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any">Cualquiera</SelectItem>
                          <SelectItem value="HG">HG</SelectItem>
                          <SelectItem value="DESTINO FILETE">Destino Filete</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <Switch
                        checked={gate.active}
                        onCheckedChange={v => updateGate(idx, { active: v })}
                        disabled={!allowEdit}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer: motivo + guardar */}
          {allowEdit && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pt-1 border-t border-border/40">
              <Input
                placeholder="Motivo del cambio (opcional)"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="h-8 text-xs flex-1"
                disabled={saving}
              />
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving}
                className="shrink-0 gap-1.5"
              >
                {saving
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Guardando…</>
                  : <><Save className="w-3.5 h-3.5" />Registrar configuración</>}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
