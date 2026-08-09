/**
 * Modal para transcribir parámetros de timing del flipper desde el HMI Marelec Z2.
 *
 * Ruta en Z2: Cambiar Parámetros → código 8620
 * Parámetros: delayFlipperOpen / minFlipperOpenTime / delayFlipperClose
 *
 * Al guardar:
 *   1. Persiste en colección `flipperZ2Captures` (historial auditable)
 *   2. Opcionalmente aplica los 3 valores a physicalConfig
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button, Input, Label, Badge } from '@/components/ui'
import { MonitorSmartphone, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { saveFlipperZ2Capture } from '@/services/grader/graderMeasurements.service'
import { logger } from '@/lib/logger'

interface CurrentValues {
  delayFlipperOpenMs: number
  minFlipperOpenTimeMs: number
  delayFlipperCloseMs: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentValues: CurrentValues
  onApply?: (values: CurrentValues) => void
}

interface FieldState {
  delayFlipperOpenMs: string
  minFlipperOpenTimeMs: string
  delayFlipperCloseMs: string
}

const FIELDS: Array<{ key: keyof CurrentValues; label: string; z2Param: string; defaultMs: number }> = [
  { key: 'delayFlipperOpenMs',   label: 'Delay apertura',       z2Param: 'delayFlipperOpen',   defaultMs: 150 },
  { key: 'minFlipperOpenTimeMs', label: 'Mín. tiempo abierto',  z2Param: 'minFlipperOpenTime', defaultMs: 350 },
  { key: 'delayFlipperCloseMs',  label: 'Delay cierre',         z2Param: 'delayFlipperClose',  defaultMs: 150 },
]

export function Z2CaptureModal({ open, onOpenChange, currentValues, onApply }: Props) {
  const user = useAuthStore((s) => s.user)

  const [values, setValues] = useState<FieldState>({
    delayFlipperOpenMs:   String(currentValues.delayFlipperOpenMs),
    minFlipperOpenTimeMs: String(currentValues.minFlipperOpenTimeMs),
    delayFlipperCloseMs:  String(currentValues.delayFlipperCloseMs),
  })
  const [notes, setNotes]               = useState('')
  const [applyToConfig, setApplyToConfig] = useState(true)
  const [saving, setSaving]             = useState(false)
  const [savedOk, setSavedOk]           = useState(false)

  const parsed = {
    delayFlipperOpenMs:   Number(values.delayFlipperOpenMs),
    minFlipperOpenTimeMs: Number(values.minFlipperOpenTimeMs),
    delayFlipperCloseMs:  Number(values.delayFlipperCloseMs),
  }

  const allValid = FIELDS.every(({ key }) => {
    const v = parsed[key]
    return isFinite(v) && v >= 0 && v <= 5000
  })

  const cycleTotalMs = parsed.delayFlipperOpenMs + parsed.minFlipperOpenTimeMs + parsed.delayFlipperCloseMs
  const currentCycleMs = currentValues.delayFlipperOpenMs + currentValues.minFlipperOpenTimeMs + currentValues.delayFlipperCloseMs
  const deltaCycleMs = allValid ? cycleTotalMs - currentCycleMs : null

  function setField(key: keyof FieldState, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    if (!allValid || saving || !user) return
    setSaving(true)
    try {
      await saveFlipperZ2Capture({
        delayFlipperOpenMs:   parsed.delayFlipperOpenMs,
        minFlipperOpenTimeMs: parsed.minFlipperOpenTimeMs,
        delayFlipperCloseMs:  parsed.delayFlipperCloseMs,
        notes: notes.trim() || undefined,
        measuredBy: user.id,
      })
      if (applyToConfig && onApply) onApply(parsed)
      setSavedOk(true)
      setTimeout(() => {
        onOpenChange(false)
        setSavedOk(false)
        setNotes('')
      }, 900)
    } catch (err) {
      logger.error('[Z2CaptureModal] error guardando', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="w-5 h-5 text-sky-400" />
            Capturar parámetros desde Z2
          </DialogTitle>
          <DialogDescription className="text-xs">
            Lee los valores de timing del flipper directamente del HMI Marelec y transcríbelos aquí.
          </DialogDescription>
        </DialogHeader>

        {/* Guía de navegación Z2 */}
        <div className="bg-muted rounded-ctl p-2.5 text-[11px] text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-xs">Procedimiento en Z2:</p>
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li>Pantalla principal → <span className="font-mono text-foreground">Cambiar Parámetros</span></li>
            <li>Ingresar código <span className="font-mono text-sky-400 font-bold">8620</span></li>
            <li>Buscar los 3 parámetros de timing del flipper</li>
            <li>Transcribir los valores en ms abajo</li>
          </ol>
        </div>

        {/* Inputs de los 3 parámetros */}
        <div className="space-y-2">
          {FIELDS.map(({ key, label, z2Param }) => {
            const currentVal = currentValues[key]
            const newVal = parsed[key]
            const delta = allValid ? newVal - currentVal : null
            return (
              <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground block mb-0.5">
                    {label}
                    <span className="ml-1 font-mono text-[9px] text-sky-400/70">Z2: {z2Param}</span>
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="10"
                      min="0"
                      max="5000"
                      value={values[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      className="h-7 w-24 text-xs font-mono px-1.5"
                    />
                    <span className="text-[10px] text-muted-foreground">ms</span>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground text-right">
                  <div>actual</div>
                  <div className="font-mono">{currentVal} ms</div>
                </div>
                {delta !== null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-mono shrink-0',
                      Math.abs(delta) === 0 ? 'border-muted text-muted-foreground' :
                      Math.abs(delta) <= 50 ? 'border-amber-500/[0.25] text-amber-600' :
                      'border-red-500/[0.25] text-red-600',
                    )}
                  >
                    {delta >= 0 ? '+' : ''}{delta}
                  </Badge>
                )}
              </div>
            )
          })}
        </div>

        {/* Resumen ciclo total */}
        {allValid && (
          <div className="bg-primary/[0.15] border border-primary/[0.25] rounded-ctl p-2 text-xs flex items-center justify-between gap-3">
            <div>
              <span className="text-muted-foreground">Ciclo total nuevo: </span>
              <span className="font-mono font-semibold text-sky-400">{cycleTotalMs} ms</span>
            </div>
            {deltaCycleMs !== null && deltaCycleMs !== 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-mono',
                  Math.abs(deltaCycleMs) <= 50 ? 'border-amber-500/[0.25] text-amber-600' : 'border-red-500/[0.25] text-red-600',
                )}
              >
                Δ {deltaCycleMs >= 0 ? '+' : ''}{deltaCycleMs} ms vs actual
              </Badge>
            )}
          </div>
        )}

        {/* Notas opcionales */}
        <div>
          <Label className="text-xs">Notas (opcional)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="turno, producto, condición especial…"
            className="mt-1"
          />
        </div>

        {/* Checkbox aplicar */}
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={applyToConfig}
            onChange={(e) => setApplyToConfig(e.target.checked)}
            className="rounded-ctl"
          />
          Aplicar a configuración activa
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!allValid || saving || !user}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : savedOk ? (
              <Check className="w-4 h-4 mr-2 text-green-500" />
            ) : null}
            {savedOk ? 'Guardado' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
