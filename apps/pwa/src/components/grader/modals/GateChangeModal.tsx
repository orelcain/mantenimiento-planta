/**
 * GateChangeModal — registro rápido de un cambio de gate mid-turno.
 *
 * Flujo: seleccionar gate → editar calibre/calidad → guardar snapshot.
 * Diseñado para uso en planta desde celular: pasos lineales, inputs grandes.
 */
import { useState, useMemo, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button, Input } from '@/components/ui'
import { Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'
import { saveConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { qualityColorTextClass } from '@/services/grader/graderQualityColors'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { GateAssignment, GraderQuality, CalibreRange, CalibreWeightRange } from '@/services/grader/types'

const QUALITIES: GraderQuality[] = ['Premium', 'Grado', 'Industrial', 'D', 'Unknown']
const FALLBACK_CALIBRES: CalibreRange[] = [
  '0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', 'Other',
]

interface GateChangeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shiftDocId: string
  configSnapshots: GateConfigSnapshot[]
  onSaved: () => void
  plantLineId?: string
}

export function GateChangeModal({
  open,
  onOpenChange,
  shiftDocId,
  configSnapshots,
  onSaved,
  plantLineId,
}: GateChangeModalProps) {
  const user = useAuthStore(s => s.user)
  const { toast } = useToast()

  const [selectedGate, setSelectedGate] = useState<number | null>(null)
  const [newCalibre, setNewCalibre] = useState<CalibreRange | ''>('')
  const [newQuality, setNewQuality] = useState<GraderQuality | ''>('')
  const [newActive, setNewActive] = useState<boolean>(true)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [availableCalibres, setAvailableCalibres] = useState<CalibreRange[]>(FALLBACK_CALIBRES)

  // Cargar calibres configurados
  useEffect(() => {
    if (!open) return
    getModuleRanges(plantLineId)
      .then(cfg => {
        if (cfg?.customWeightRanges && cfg.customWeightRanges.length > 0) {
          const fromRanges = cfg.customWeightRanges.map((r: CalibreWeightRange) => r.calibre).filter(Boolean) as CalibreRange[]
          setAvailableCalibres(Array.from(new Set([...fromRanges, ...FALLBACK_CALIBRES])))
        }
      })
      .catch(() => {})
  }, [open, plantLineId])

  // Gates del último snapshot, ordenados
  const currentGates = useMemo<GateAssignment[]>(() => {
    if (configSnapshots.length === 0) return []
    const last = configSnapshots[configSnapshots.length - 1]!
    return [...last.gates].sort((a, b) => a.gateNumber - b.gateNumber)
  }, [configSnapshots])

  // Cuando se selecciona un gate, pre-rellenar con valores actuales
  function selectGate(gateNumber: number) {
    const gate = currentGates.find(g => g.gateNumber === gateNumber)
    if (!gate) return
    setSelectedGate(gateNumber)
    setNewCalibre(gate.assignedCalibre)
    setNewQuality(gate.assignedQuality)
    setNewActive(gate.active)
  }

  function reset() {
    setSelectedGate(null)
    setNewCalibre('')
    setNewQuality('')
    setNewActive(true)
    setReason('')
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  const selectedGateData = selectedGate
    ? currentGates.find(g => g.gateNumber === selectedGate)
    : null

  const hasChanges = selectedGateData && (
    newCalibre !== selectedGateData.assignedCalibre ||
    newQuality !== selectedGateData.assignedQuality ||
    newActive !== selectedGateData.active
  )

  async function handleSave() {
    if (!user || !selectedGate || !newCalibre || !newQuality) return
    setSaving(true)
    try {
      const updatedGates = currentGates.map(g =>
        g.gateNumber === selectedGate
          ? { ...g, assignedCalibre: newCalibre as CalibreRange, assignedQuality: newQuality as GraderQuality, active: newActive }
          : g,
      )
      const userName = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.email
      const result = await saveConfigSnapshot(
        shiftDocId,
        updatedGates,
        { uid: user.id, name: userName },
        reason.trim() || `Gate ${selectedGate}: ${selectedGateData?.assignedCalibre} → ${newCalibre}`,
      )
      if (result === null) {
        toast({ title: 'Sin cambios detectados', description: 'La configuración es idéntica al snapshot anterior.' })
      } else {
        const now = fmtTime(result.at)
        toast({
          title: `Gate ${selectedGate} registrado`,
          description: `${newCalibre} · ${newQuality} · Nuevo segmento desde ${now}`,
        })
        onSaved()
        handleClose()
      }
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Cambio de gate mid-turno</DialogTitle>
        </DialogHeader>

        {/* Paso 1 — Seleccionar gate */}
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-2">¿Cuál gate cambió?</p>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => {
                const gate = currentGates.find(g => g.gateNumber === n)
                const isActive = gate?.active ?? true
                const isSelected = selectedGate === n
                return (
                  <button
                    key={n}
                    onClick={() => selectGate(n)}
                    className={cn(
                      'relative rounded-md py-2 text-xs font-semibold transition-colors border',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : isActive
                          ? 'bg-muted/40 border-border hover:bg-muted text-foreground'
                          : 'bg-transparent border-border/30 text-muted-foreground/40 hover:bg-muted/20',
                    )}
                  >
                    {n}
                    {!isActive && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] leading-none text-muted-foreground/30">
                        off
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Paso 2 — Editar gate seleccionado */}
          {selectedGate && selectedGateData && (
            <div className="space-y-3 pt-1 border-t border-border/40">
              {/* Preview actual → nuevo */}
              <div className="flex items-center gap-2 text-xs bg-muted/30 rounded-md px-3 py-2">
                <span className="text-muted-foreground">G{selectedGate} actual:</span>
                <span className="font-medium">{selectedGateData.assignedCalibre}</span>
                <span className={cn('font-medium', qualityColorTextClass(selectedGateData.assignedQuality))}>
                  {selectedGateData.assignedQuality}
                </span>
                {hasChanges && (
                  <>
                    <ArrowRight className="w-3 h-3 text-muted-foreground mx-1" />
                    <span className="font-medium text-primary">{newCalibre}</span>
                    <span className={cn('font-medium', qualityColorTextClass(newQuality as GraderQuality))}>
                      {newQuality}
                    </span>
                  </>
                )}
              </div>

              {/* Calibre */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Nuevo calibre</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableCalibres.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewCalibre(c)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-md border transition-colors',
                        newCalibre === c
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border bg-muted/30 hover:bg-muted text-foreground',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calidad */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Calidad</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUALITIES.map(q => (
                    <button
                      key={q}
                      onClick={() => setNewQuality(q)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-md border transition-colors',
                        newQuality === q
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border bg-muted/30 hover:bg-muted',
                        newQuality !== q && qualityColorTextClass(q),
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Activo */}
              {!selectedGateData.active && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNewActive(v => !v)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-md border transition-colors',
                      newActive ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {newActive ? '✓ Activar gate' : 'Mantener inactivo'}
                  </button>
                </div>
              )}

              {/* Motivo */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Motivo (opcional)</p>
                <Input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="ej. Temperatura subió, ajuste por lote nuevo…"
                  className="text-xs h-8"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!selectedGate || !newCalibre || !newQuality || !hasChanges || saving}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Registrar cambio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
