/**
 * Modal para registrar mediciones slow-mo (iPhone 240fps) del reset mecánico del flipper.
 *
 * Procedimiento en planta:
 *   1. Menú Z2 → Servicio → Probar salidas → activar gate N [8620]
 *   2. Abrir iPhone → Cámara → modo Slo-mo (240fps)
 *   3. Grabar el ciclo completo del flipper
 *   4. En la app de Fotos, contar frames entre:
 *         - "flipper empieza a cerrar" → "flipper listo para siguiente pez"
 *      o la fase que se quiera medir (openToReady / closeToOpen / fullCycle)
 *   5. Ingresar aquí: frames + fps (240 por defecto)
 *
 * El modal calcula segundos = frames / fps y guarda en `flipperTimingMeasurements`.
 * Opcionalmente aplica el valor como `flipperMechanicalResetS` de la physicalConfig.
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button, Input, Label, Badge } from '@/components/ui'
import { Camera, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { saveFlipperTimingMeasurement } from '@/services/grader/graderMeasurements.service'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Gate que se está midiendo (1..12). Si null, no se renderiza. */
  gateNumber: number
  /** Valor actual de flipperMechanicalResetS (si existe) para comparar */
  currentResetSec?: number
  /** Callback cuando el operador elige aplicar la medición como nuevo reset */
  onApply?: (seconds: number, measuredAtMs: number) => void
}

export function SlowMoMeasurementModal({
  open,
  onOpenChange,
  gateNumber,
  currentResetSec,
  onApply,
}: Props) {
  const user = useAuthStore((s) => s.user)
  const [frames, setFrames] = useState('')
  const [fps, setFps] = useState('240')
  const [phase, setPhase] = useState<'openToReady' | 'closeToOpen' | 'fullCycle'>('fullCycle')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [applyToConfig, setApplyToConfig] = useState(true)

  const nFrames = Number(frames)
  const nFps = Number(fps)
  const validInputs = isFinite(nFrames) && nFrames > 0 && isFinite(nFps) && nFps > 0
  const seconds = validInputs ? nFrames / nFps : 0

  const canSave = validInputs && !saving

  const delta = currentResetSec !== undefined ? seconds - currentResetSec : null
  const deltaMs = delta !== null ? delta * 1000 : null

  async function handleSave() {
    if (!canSave || !user) return
    setSaving(true)
    try {
      const nowMs = Date.now()
      await saveFlipperTimingMeasurement({
        gateNumber,
        frames: nFrames,
        fps: nFps,
        phase,
        notes: notes.trim() || undefined,
        measuredBy: user.id,
      })

      if (applyToConfig && onApply && phase === 'fullCycle') {
        onApply(seconds, nowMs)
      }

      setSavedOk(true)
      setTimeout(() => {
        onOpenChange(false)
        setSavedOk(false)
        setFrames('')
        setNotes('')
      }, 900)
    } catch (err) {
      console.error('Error guardando slow-mo:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Medición slow-mo — Gate {gateNumber}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Graba con iPhone @ 240fps y cuenta frames del ciclo.
            {currentResetSec !== undefined && (
              <> Actual: <span className="font-mono">{currentResetSec.toFixed(3)}s</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Guía breve del procedimiento */}
        <div className="bg-muted/30 rounded p-2 text-[11px] text-muted-foreground space-y-0.5">
          <div className="font-medium text-foreground">Procedimiento:</div>
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li>Z2 → Servicio → Probar salidas → gate {gateNumber} [<span className="font-mono">8620</span>]</li>
            <li>iPhone → Cámara → Slo-mo (240fps)</li>
            <li>Grabar el ciclo completo del flipper</li>
            <li>Contar frames en Fotos → ingresar abajo</li>
          </ol>
        </div>

        <div className="space-y-3">
          {/* Fase medida */}
          <div>
            <Label className="text-xs mb-1.5 block">Fase medida</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'fullCycle',   label: 'Ciclo completo', hint: 'inicio→listo' },
                { v: 'openToReady', label: 'Abrir→listo',    hint: 'reset solo' },
                { v: 'closeToOpen', label: 'Cerrar→abrir',   hint: 'actuación' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setPhase(opt.v)}
                  className={cn(
                    'rounded border text-[10px] px-1.5 py-1 text-left',
                    phase === opt.v ? 'border-primary bg-primary/5 text-primary' : 'border-muted hover:bg-muted/30',
                  )}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-muted-foreground">{opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Frames + FPS */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Frames contados</Label>
              <Input
                type="number"
                step="1"
                min="1"
                value={frames}
                onChange={(e) => setFrames(e.target.value)}
                placeholder="ej: 108"
                className="font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">FPS del video</Label>
              <Input
                type="number"
                step="1"
                min="30"
                value={fps}
                onChange={(e) => setFps(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {/* Resultado */}
          {validInputs && (
            <div className="bg-primary/5 border border-primary/20 rounded p-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono">{nFrames} / {nFps} fps =</span>
                <span className="font-mono font-semibold text-primary">{seconds.toFixed(3)} s</span>
              </div>
              {deltaMs !== null && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Δ vs actual:</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-mono',
                      Math.abs(deltaMs) < 50 ? 'border-green-500/40 text-green-700 dark:text-green-400' :
                      Math.abs(deltaMs) < 150 ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' :
                      'border-red-500/40 text-red-700 dark:text-red-400',
                    )}
                  >
                    {deltaMs >= 0 ? '+' : ''}{deltaMs.toFixed(0)} ms
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Notas */}
          <div>
            <Label className="text-xs">Notas (opcional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="fuga aire, sello gastado, etc."
            />
          </div>

          {/* Aplicar — solo si fullCycle */}
          {phase === 'fullCycle' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={applyToConfig}
                onChange={(e) => setApplyToConfig(e.target.checked)}
                className="rounded"
              />
              Aplicar como <code className="font-mono text-[10px]">flipperMechanicalResetS</code>
            </label>
          )}
          {phase !== 'fullCycle' && (
            <p className="text-[10px] text-muted-foreground italic">
              Sólo el ciclo completo se puede aplicar como reset mecánico. Fases parciales quedan guardadas como referencia histórica.
            </p>
          )}
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
