/**
 * Card de captura manual de datos Marel HG (corta-cabeza).
 *
 * Marel HG es la primera estación del pipeline (antes de las 3 Baader).
 * Su data NO está automatizada — el operador la captura desde la pantalla
 * Marel HG una vez por turno. Con esos 3 valores podemos deducir el rechazo
 * Baader puro (ver `graderMarelHg.service`).
 *
 * Estados:
 *   - Sin captura → botón único "Capturar datos Marel HG"
 *   - Con captura → tarjeta compacta con valores + botón "Editar"
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
  Button, Input, Label, Textarea,
} from '@/components/ui'
import { ClipboardList, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store'
import { saveMarelHgCapture, type MarelHgCapture } from '@/services/grader/graderMarelHg.service'

interface MarelHgCaptureCardProps {
  /** ID del summary del turno (formato `${dateKey}__${shiftId}`). */
  summaryId: string
  /** Captura actual (null si todavía no se capturó). */
  capture: MarelHgCapture | null
  /** Si el usuario tiene permiso de escritura (supervisor+). */
  canEdit: boolean
  /** Callback opcional cuando se guarda — el parent re-carga si quiere. */
  onSaved?: () => void
}

export function MarelHgCaptureCard({ summaryId, capture, canEdit, onSaved }: MarelHgCaptureCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const uncontrolledPct = capture && capture.totalInput > 0
    ? ((capture.uncontrolled / capture.totalInput) * 100).toFixed(1)
    : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Marel HG (corta-cabeza)
        </CardTitle>
        <CardDescription className="text-xs">
          Captura manual desde la pantalla Marel — necesaria para deducir rechazo Baader puro
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {capture ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Entrada total</div>
                <div className="text-lg font-semibold tabular-nums">
                  {capture.totalInput.toLocaleString('es-CL')}
                </div>
                <div className="text-[10px] text-muted-foreground">piezas con cabeza</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">No controladas</div>
                <div className="text-lg font-semibold tabular-nums">
                  {capture.uncontrolled.toLocaleString('es-CL')}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {uncontrolledPct ? `${uncontrolledPct}% del total` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Peso prom.</div>
                <div className="text-lg font-semibold tabular-nums">
                  {capture.avgWeightHeadGrams.toLocaleString('es-CL')} g
                </div>
                <div className="text-[10px] text-muted-foreground">con cabeza</div>
              </div>
            </div>
            {capture.notes && (
              <div className="text-xs bg-muted/30 rounded-md p-2">
                <span className="text-muted-foreground">Nota: </span>
                {capture.notes}
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Capturado por <b>{capture.capturedByName || '—'}</b>
                {capture.capturedAt && (
                  <span className="ml-1">
                    · {new Date(capture.capturedAt).toLocaleString('es-CL', {
                      day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                )}
              </span>
              {canEdit && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setDialogOpen(true)}>
                  Editar
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground mb-3">
              Sin captura — al ingresar los 3 datos se deducirá el rechazo Baader puro.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
              disabled={!canEdit}
              title={canEdit ? 'Capturar datos Marel HG' : 'Necesitás permisos de supervisor'}
            >
              Capturar datos Marel HG
            </Button>
          </div>
        )}
      </CardContent>

      {canEdit && (
        <MarelHgCaptureDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          summaryId={summaryId}
          initial={capture}
          onSaved={onSaved}
        />
      )}
    </Card>
  )
}

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summaryId: string
  initial: MarelHgCapture | null
  onSaved?: () => void
}

function MarelHgCaptureDialog({ open, onOpenChange, summaryId, initial, onSaved }: DialogProps) {
  const user = useAuthStore(s => s.user)
  const [totalInput, setTotalInput] = useState<string>('')
  const [uncontrolled, setUncontrolled] = useState<string>('')
  const [avgWeight, setAvgWeight] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hidratar campos cuando se abre el diálogo
  useEffect(() => {
    if (!open) return
    setTotalInput(initial?.totalInput?.toString() ?? '')
    setUncontrolled(initial?.uncontrolled?.toString() ?? '')
    setAvgWeight(initial?.avgWeightHeadGrams?.toString() ?? '')
    setNotes(initial?.notes ?? '')
    setError(null)
  }, [open, initial])

  const totalNum = Number(totalInput)
  const uncontrolledNum = Number(uncontrolled)
  const weightNum = Number(avgWeight)
  const uncontrolledPct = totalNum > 0 && uncontrolledNum >= 0
    ? ((uncontrolledNum / totalNum) * 100).toFixed(1)
    : null

  const validationErrors: string[] = []
  if (!Number.isFinite(totalNum) || totalNum <= 0) validationErrors.push('Total entrada debe ser > 0')
  if (!Number.isFinite(uncontrolledNum) || uncontrolledNum < 0) validationErrors.push('No controladas debe ser ≥ 0')
  if (uncontrolledNum > totalNum) validationErrors.push('No controladas no puede exceder Total')
  if (!Number.isFinite(weightNum) || weightNum < 100 || weightNum > 15000) {
    validationErrors.push('Peso fuera de rango (100-15000g)')
  }
  const isValid = validationErrors.length === 0

  const handleSave = useCallback(async () => {
    if (!user || !isValid) return
    setSaving(true)
    setError(null)
    try {
      await saveMarelHgCapture(summaryId, {
        totalInput: totalNum,
        uncontrolled: uncontrolledNum,
        avgWeightHeadGrams: weightNum,
        notes: notes.trim() || undefined,
        capturedBy: user.id,
        capturedByName: `${user.nombre} ${user.apellido}`,
      })
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [user, isValid, summaryId, totalNum, uncontrolledNum, weightNum, notes, onSaved, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar' : 'Capturar'} datos Marel HG</DialogTitle>
          <DialogDescription>
            Lee los 3 valores en la pantalla Marel HG al cierre del turno.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="marelhg-total">Total entrada (con cabeza)</Label>
            <Input
              id="marelhg-total"
              type="number"
              inputMode="numeric"
              min="1"
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              placeholder="ej. 16200"
            />
            <p className="text-[11px] text-muted-foreground">
              Total de salmones que ingresaron a Marel HG en el turno.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="marelhg-uncontrolled">No controladas</Label>
            <Input
              id="marelhg-uncontrolled"
              type="number"
              inputMode="numeric"
              min="0"
              value={uncontrolled}
              onChange={(e) => setUncontrolled(e.target.value)}
              placeholder="ej. 320"
            />
            <p className="text-[11px] text-muted-foreground">
              Piezas que escaparon al pesaje. Típico: 1-7% del total.
              {uncontrolledPct != null && (
                <span className="ml-1">
                  Calculado: <b>{uncontrolledPct}%</b>
                </span>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="marelhg-weight">Peso promedio con cabeza (g)</Label>
            <Input
              id="marelhg-weight"
              type="number"
              inputMode="decimal"
              min="100"
              max="15000"
              step="1"
              value={avgWeight}
              onChange={(e) => setAvgWeight(e.target.value)}
              placeholder="ej. 4500"
            />
            <p className="text-[11px] text-muted-foreground">
              Sirve para validar que el peso Grader (sin cabeza) sea coherente
              (ratio cabeza ~25-35% del peso entero).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="marelhg-notes">Notas (opcional)</Label>
            <Textarea
              id="marelhg-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ej. Marel detenida 30min por aseo. Cambio de calibre 14:00."
              rows={2}
            />
          </div>

          {validationErrors.length > 0 && (
            <ul className="text-xs text-amber-400 list-disc list-inside space-y-0.5">
              {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!isValid || saving || !user}>
            {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
