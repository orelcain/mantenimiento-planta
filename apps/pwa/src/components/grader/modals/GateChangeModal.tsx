/**
 * GateChangeModal — registro rápido de un cambio de gate mid-turno.
 *
 * Flujo: seleccionar gate → editar calibre/calidad → guardar snapshot.
 * Diseñado para uso en planta desde celular: pasos lineales, inputs grandes.
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button, Input } from '@/components/ui'
import { Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'
import { saveConfigSnapshot, getLatestSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { listGatesTemplates } from '@/services/grader/graderSession.service'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { qualityColorTextClass } from '@/services/grader/graderQualityColors'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { GateAssignment, GraderQuality, CalibreRange, CalibreWeightRange, GraderConservation, GraderProduct } from '@/services/grader/types'

const QUALITIES: GraderQuality[] = ['Premium', 'Grado', 'Industrial', 'D', 'Unknown']
const FALLBACK_CALIBRES: CalibreRange[] = [
  '0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', 'Other',
]
const CONSERVATIONS: GraderConservation[] = ['CONGELADO', 'FRESCO', 'OTRO']
const PRODUCTS: GraderProduct[] = ['HG', 'DESTINO FILETE', 'OTRO']

interface GateChangeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shiftDocId: string
  /**
   * Snapshots ya cargados por el contenedor. Si no vienen (o vienen vacíos) el
   * modal carga el último por su cuenta: hay puntos de entrada que no tienen la
   * lista a mano y antes obligaban a usar un segundo formulario aparte.
   */
  configSnapshots?: GateConfigSnapshot[]
  onSaved: () => void
  plantLineId?: string
  /** Pre-relleno al abrir (ej. desde una sugerencia de swap de calibres). */
  initialGate?: number
  initialCalibre?: string
  initialQuality?: string
  initialReason?: string
}

export function GateChangeModal({
  open,
  onOpenChange,
  shiftDocId,
  configSnapshots,
  onSaved,
  plantLineId,
  initialGate,
  initialCalibre,
  initialQuality,
  initialReason,
}: GateChangeModalProps) {
  const user = useAuthStore(s => s.user)
  const { toast } = useToast()

  const [selectedGate, setSelectedGate] = useState<number | null>(null)
  const [newCalibre, setNewCalibre] = useState<CalibreRange | ''>('')
  const [newQuality, setNewQuality] = useState<GraderQuality | ''>('')
  const [newActive, setNewActive] = useState<boolean>(true)
  const [newConservation, setNewConservation] = useState<GraderConservation | ''>('')
  const [newProduct, setNewProduct] = useState<GraderProduct | ''>('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [availableCalibres, setAvailableCalibres] = useState<CalibreRange[]>(FALLBACK_CALIBRES)
  const [loadedSnapshot, setLoadedSnapshot] = useState<GateConfigSnapshot | null>(null)
  const [templateGates, setTemplateGates] = useState<GateAssignment[] | null>(null)

  /*
   * De dónde salen las gates que se van a editar, en orden:
   *   1. las que pasó el contenedor
   *   2. el último snapshot del turno
   *   3. la plantilla de gates
   *
   * El paso 3 no es un adorno: en producción la MAYORÍA de los turnos no tiene
   * `configHistory` —la config se guarda como plantilla y se reusa—, así que
   * sin él el modal abría con el selector de gates y ningún campo abajo. El
   * botón "Cambiar gate" quedaba muerto justo en el turno donde todavía se
   * podía cambiar algo. Es la misma regla de elección que usa el editor
   * (`AnalisisGraderGatesConfigPage`): "Plantilla 1" o la primera.
   */
  useEffect(() => {
    if (!open || (configSnapshots && configSnapshots.length > 0)) return
    let cancelled = false
    getLatestSnapshot(shiftDocId)
      .then(async (s) => {
        if (cancelled) return
        if (s) { setLoadedSnapshot(s); return }
        const list = await listGatesTemplates()
        const t = list.find((x) => x.name === 'Plantilla 1') ?? list[0]
        if (!cancelled && t) setTemplateGates(t.gates)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, configSnapshots, shiftDocId])

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
    const last = (configSnapshots && configSnapshots.length > 0)
      ? configSnapshots[configSnapshots.length - 1]!
      : loadedSnapshot
    const base = last?.gates ?? templateGates
    if (!base) return []
    return [...base].sort((a, b) => a.gateNumber - b.gateNumber)
  }, [configSnapshots, loadedSnapshot, templateGates])

  // Cuando se selecciona un gate, pre-rellenar con valores actuales
  const selectGate = useCallback((gateNumber: number) => {
    const gate = currentGates.find(g => g.gateNumber === gateNumber)
    if (!gate) return
    setSelectedGate(gateNumber)
    setNewCalibre(gate.assignedCalibre)
    setNewQuality(gate.assignedQuality)
    setNewActive(gate.active)
    setNewConservation(gate.assignedConservation ?? '')
    setNewProduct(gate.assignedProduct ?? '')
  }, [currentGates])

  /*
   * Pre-relleno desde una sugerencia. Corre cuando ya hay gates cargados: si se
   * aplicara antes, `selectGate` no encontraría el gate y se perdería.
   */
  useEffect(() => {
    if (!open || currentGates.length === 0 || initialGate == null) return
    selectGate(initialGate)
    if (initialCalibre) setNewCalibre(initialCalibre as CalibreRange)
    if (initialQuality) setNewQuality(initialQuality as GraderQuality)
    if (initialReason) setReason(initialReason)
    // Solo al abrir: después manda lo que elija el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentGates.length])

  function reset() {
    setSelectedGate(null)
    setNewCalibre('')
    setNewQuality('')
    setNewActive(true)
    setNewConservation('')
    setNewProduct('')
    setReason('')
    setLoadedSnapshot(null)
    setTemplateGates(null)
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
    newActive !== selectedGateData.active ||
    newConservation !== (selectedGateData.assignedConservation ?? '') ||
    newProduct !== (selectedGateData.assignedProduct ?? '')
  )

  async function handleSave() {
    if (!user || !selectedGate || !newCalibre || !newQuality) return
    setSaving(true)
    try {
      const updatedGates = currentGates.map(g =>
        g.gateNumber === selectedGate
          ? {
              ...g,
              assignedCalibre: newCalibre as CalibreRange,
              assignedQuality: newQuality as GraderQuality,
              active: newActive,
              ...(newConservation ? { assignedConservation: newConservation } : {}),
              ...(newProduct ? { assignedProduct: newProduct } : {}),
            }
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
                      'relative rounded-ctl py-2 text-xs font-semibold transition-colors border',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : isActive
                          ? 'bg-muted border-border hover:bg-accent text-foreground'
                          : 'bg-transparent border-border/30 text-muted-foreground/40 hover:bg-muted/20',
                    )}
                  >
                    {n}
                    {!isActive && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-caption leading-none text-muted-foreground/30">
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
              <div className="flex items-center gap-2 text-xs bg-muted rounded-ctl px-3 py-2">
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
                        'text-xs px-2.5 py-1 rounded-ctl border transition-colors',
                        newCalibre === c
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border bg-muted hover:bg-accent text-foreground',
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
                        'text-xs px-2.5 py-1 rounded-ctl border transition-colors',
                        newQuality === q
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border bg-muted hover:bg-accent',
                        newQuality !== q && qualityColorTextClass(q),
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conservación y producto — opcionales: casi nunca cambian con
                  el calibre, así que van en una línea secundaria para no
                  estorbar el flujo rápido desde el celular en planta. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Conservación</p>
                  <div className="flex flex-wrap gap-1">
                    {CONSERVATIONS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewConservation(newConservation === c ? '' : c)}
                        className={cn(
                          'text-caption px-2 py-0.5 rounded-ctl border transition-colors',
                          newConservation === c
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border bg-muted hover:bg-accent text-muted-foreground',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Producto</p>
                  <div className="flex flex-wrap gap-1">
                    {PRODUCTS.map(p => (
                      <button
                        key={p}
                        onClick={() => setNewProduct(newProduct === p ? '' : p)}
                        className={cn(
                          'text-caption px-2 py-0.5 rounded-ctl border transition-colors',
                          newProduct === p
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border bg-muted hover:bg-accent text-muted-foreground',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Activo */}
              {!selectedGateData.active && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNewActive(v => !v)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-ctl border transition-colors',
                      newActive ? 'bg-green-500/[0.15] text-ink-ok border-green-500/[0.25]' : 'border-border text-muted-foreground hover:bg-muted',
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
