/**
 * Modal para registrar mediciones con tachómetro SKF sobre una cinta.
 *
 * Dos modos:
 *   - shaft  → tacómetro óptico sobre el eje + cinta reflectante
 *             El cálculo deriva m/s = RPM × effectiveMpsPerRpm
 *   - linear → tacómetro de contacto con rueda sobre la cinta
 *             Lectura directa en m/s
 *
 * Al guardar:
 *   1. Crea documento en `beltSpeedMeasurements`
 *   2. Opcionalmente aplica el valor como `speedMps` de la cinta y marca
 *      calibrationStatus='verified' + vfd.measuredAt/measuredBeltMps
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button, Input, Label, Badge } from '@/components/ui'
import { Gauge, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { saveBeltSpeedMeasurement } from '@/services/grader/graderMeasurements.service'
import type { GraderBeltId } from '@/services/grader/graderBeltHelpers'
import { getBeltLabel } from '@/services/grader/graderBeltHelpers'
import type { GraderPhysicalConfig } from '@/services/grader/types'
import { logger } from '@/lib/logger'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  beltId: GraderBeltId
  /** Valor actual de speedMps (para mostrar y comparar) */
  currentSpeedMps: number
  /** effectiveMpsPerRpm de la cinta (si se usa modo shaft) */
  effectiveMpsPerRpm?: number
  /** Callback que aplica la medición a la physicalConfig si el operador elige hacerlo */
  onApply?: (patch: Partial<GraderPhysicalConfig>) => void
  /** BeltId usado para construir el patch; se pasa para que el caller sepa cuál actualizar */
  applyPatchBuilder?: (beltMps: number, measuredAt: string) => Partial<GraderPhysicalConfig>
}

export function TachMeasurementModal({
  open,
  onOpenChange,
  beltId,
  currentSpeedMps,
  effectiveMpsPerRpm,
  onApply,
  applyPatchBuilder,
}: Props) {
  const user = useAuthStore((s) => s.user)
  const [method, setMethod] = useState<'shaft' | 'linear'>('linear')
  const [measuredValue, setMeasuredValue] = useState('')
  const [vfdRpm, setVfdRpm] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [applyToConfig, setApplyToConfig] = useState(true)

  const numValue = Number(measuredValue)
  const validNum = isFinite(numValue) && numValue > 0

  // Cálculo m/s según método
  const beltMps =
    method === 'linear'
      ? numValue
      : effectiveMpsPerRpm
        ? numValue * effectiveMpsPerRpm
        : 0

  const delta = beltMps - currentSpeedMps
  const deltaPct = currentSpeedMps > 0 ? (delta / currentSpeedMps) * 100 : 0

  const canSave = validNum && !saving && (method === 'linear' || (method === 'shaft' && effectiveMpsPerRpm))

  async function handleSave() {
    if (!canSave || !user) return
    setSaving(true)
    try {
      const measuredAt = new Date().toISOString()
      await saveBeltSpeedMeasurement({
        beltId,
        method,
        measuredValue: numValue,
        beltMps,
        vfdRpm: vfdRpm ? Number(vfdRpm) : undefined,
        notes: notes.trim() || undefined,
        measuredBy: user.id,
      })

      if (applyToConfig && onApply && applyPatchBuilder) {
        onApply(applyPatchBuilder(beltMps, measuredAt))
      }

      setSavedOk(true)
      setTimeout(() => {
        onOpenChange(false)
        setSavedOk(false)
        setMeasuredValue('')
        setVfdRpm('')
        setNotes('')
      }, 900)
    } catch (err) {
      logger.error('Error guardando medición tach', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            Tachómetro SKF — {getBeltLabel(beltId)}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Actual: <span className="font-mono font-medium">{currentSpeedMps.toFixed(3)} m/s</span>.
            Medi con SKF TMRT/TMRP y registra para calibrar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Método */}
          <div>
            <Label className="text-xs mb-1.5 block">Método de medición</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod('linear')}
                className={cn(
                  'rounded border text-xs px-2 py-1.5 text-left',
                  method === 'linear' ? 'border-primary bg-primary/15 text-primary' : 'border-muted hover:bg-muted/30',
                )}
              >
                <div className="font-medium">Rueda sobre cinta</div>
                <div className="text-muted-foreground text-[10px]">Lectura directa m/s</div>
              </button>
              <button
                type="button"
                onClick={() => setMethod('shaft')}
                disabled={!effectiveMpsPerRpm}
                className={cn(
                  'rounded border text-xs px-2 py-1.5 text-left',
                  method === 'shaft' ? 'border-primary bg-primary/15 text-primary' : 'border-muted hover:bg-muted/30',
                  !effectiveMpsPerRpm && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="font-medium">Óptico en eje</div>
                <div className="text-muted-foreground text-[10px]">
                  {effectiveMpsPerRpm ? 'RPM → m/s con factor' : 'Falta effectiveMpsPerRpm'}
                </div>
              </button>
            </div>
          </div>

          {/* Valor medido */}
          <div>
            <Label className="text-xs">
              {method === 'linear' ? 'Velocidad medida (m/s)' : 'RPM del eje medidos'}
            </Label>
            <Input
              type="number"
              step={method === 'linear' ? '0.01' : '1'}
              min="0"
              value={measuredValue}
              onChange={(e) => setMeasuredValue(e.target.value)}
              placeholder={method === 'linear' ? 'ej: 0.71' : 'ej: 1470'}
              className="font-mono"
            />
            {method === 'shaft' && effectiveMpsPerRpm && validNum && (
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                {numValue} RPM × {effectiveMpsPerRpm.toFixed(6)} m/s/RPM = {beltMps.toFixed(3)} m/s
              </p>
            )}
          </div>

          {/* VFD RPM cross-check (opcional) */}
          <div>
            <Label className="text-xs">RPM del VFD (opcional, display Danfoss)</Label>
            <Input
              type="number"
              step="10"
              min="0"
              value={vfdRpm}
              onChange={(e) => setVfdRpm(e.target.value)}
              placeholder="para cross-check"
              className="font-mono"
            />
          </div>

          {/* Notas */}
          <div>
            <Label className="text-xs">Notas (opcional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ruido en reductor, fluctuación, etc."
            />
          </div>

          {/* Comparación con actual */}
          {validNum && beltMps > 0 && (
            <div className="bg-muted rounded p-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Medido:</span>
                <span className="font-mono font-medium">{beltMps.toFixed(3)} m/s</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Δ vs actual:</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-mono',
                    Math.abs(deltaPct) < 3 ? 'border-green-500/40 text-green-700 dark:text-green-400' :
                    Math.abs(deltaPct) < 10 ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' :
                    'border-red-500/40 text-red-700 dark:text-red-400',
                  )}
                >
                  {delta >= 0 ? '+' : ''}{delta.toFixed(3)} m/s ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                </Badge>
              </div>
            </div>
          )}

          {/* Aplicar a config */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={applyToConfig}
              onChange={(e) => setApplyToConfig(e.target.checked)}
              className="rounded"
            />
            Aplicar como velocidad actual (marca como <strong>verificada</strong>)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : savedOk ? <Check className="w-4 h-4 mr-2" /> : null}
            {savedOk ? 'Guardado' : 'Guardar medición'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
