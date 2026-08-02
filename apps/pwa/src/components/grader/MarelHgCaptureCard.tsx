/**
 * Card de captura manual de datos Marel HG (corta-cabeza).
 *
 * Marel HG es la primera estación del pipeline (antes de las 3 Baader).
 * Su data NO está automatizada — el operador la captura desde la pantalla
 * Marel HG.
 *
 * Antes esta card prometía "deducir el rechazo Baader puro". Ese cálculo se
 * retiró: desde 2026 la línea manual PRODUCE, así que Grader − Baader mezcla
 * dos incógnitas (manual y rechazo) y no se pueden separar — ver
 * `graderManualLine.ts`. Lo que la captura sí aporta son las piezas NO
 * CONTROLADAS del Marel HG, que hoy no se miden en ningún otro lado y son uno
 * de los dos datos que permitirían despejar el rechazo más adelante.
 *
 * RESET EN COLACIÓN:
 *   Al entrar en modo contrastación, el contador se resetea. Por eso el
 *   formulario soporta 2 períodos (pre y post colación) que se suman para
 *   obtener el total del turno. Si no hubo reset, se captura un solo valor.
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
import { ClipboardList, Loader2, Plus } from 'lucide-react'
import { useAuthStore } from '@/store'
import {
  saveMarelHgCapture,
  type MarelHgCapture,
  type MarelHgSegment,
} from '@/services/grader/graderMarelHg.service'

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

  const hasTwoSegments = (capture?.segments?.length ?? 0) >= 2
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
          Captura manual desde la pantalla Marel — mide las piezas no controladas del corta-cabeza
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {capture ? (
          <>
            {/* Totales del turno */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Entrada total</div>
                <div className="text-lg font-semibold tabular-nums">
                  {capture.totalInput.toLocaleString('es-CL')}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {hasTwoSegments ? 'suma 2 períodos' : 'piezas con cabeza'}
                </div>
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

            {/* Desglose por segmento si hubo reset en colación */}
            {hasTwoSegments && (
              <div className="border border-border rounded-md overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-border/40">
                  {capture.segments!.map((seg) => {
                    const segPct = seg.totalInput > 0
                      ? ((seg.uncontrolled / seg.totalInput) * 100).toFixed(1)
                      : '—'
                    return (
                      <div key={seg.label} className="px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                          {seg.label}
                        </div>
                        <div className="text-xs tabular-nums">
                          <span className="font-medium">{seg.totalInput.toLocaleString('es-CL')}</span>
                          <span className="text-muted-foreground"> entrada</span>
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {seg.uncontrolled.toLocaleString('es-CL')} no ctrl ({segPct}%)
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {capture.notes && (
              <div className="text-xs bg-muted rounded-md p-2">
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
              Sin captura — las piezas no controladas del Marel HG no se miden en ningún otro lado.
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

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summaryId: string
  initial: MarelHgCapture | null
  onSaved?: () => void
}

interface SegmentFields {
  totalInput: string
  uncontrolled: string
}

const EMPTY_SEG: SegmentFields = { totalInput: '', uncontrolled: '' }

function MarelHgCaptureDialog({ open, onOpenChange, summaryId, initial, onSaved }: DialogProps) {
  const user = useAuthStore(s => s.user)

  // Modo de captura: false = un solo período, true = dos períodos (pre/post colación)
  const [twoSegments, setTwoSegments] = useState(false)
  const [p1, setP1] = useState<SegmentFields>(EMPTY_SEG)
  const [p2, setP2] = useState<SegmentFields>(EMPTY_SEG)
  const [avgWeight, setAvgWeight] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const hasSeg = (initial?.segments?.length ?? 0) >= 2
    setTwoSegments(hasSeg)
    if (hasSeg && initial?.segments) {
      const seg0 = initial.segments[0]
      const seg1 = initial.segments[1]
      setP1({ totalInput: (seg0?.totalInput ?? 0).toString(), uncontrolled: (seg0?.uncontrolled ?? 0).toString() })
      setP2({ totalInput: (seg1?.totalInput ?? 0).toString(), uncontrolled: (seg1?.uncontrolled ?? 0).toString() })
    } else {
      setP1({ totalInput: initial?.totalInput?.toString() ?? '', uncontrolled: initial?.uncontrolled?.toString() ?? '' })
      setP2(EMPTY_SEG)
    }
    setAvgWeight(initial?.avgWeightHeadGrams?.toString() ?? '')
    setNotes(initial?.notes ?? '')
    setError(null)
  }, [open, initial])

  const p1Total = Number(p1.totalInput)
  const p1Unct = Number(p1.uncontrolled)
  const p2Total = twoSegments ? Number(p2.totalInput) : 0
  const p2Unct = twoSegments ? Number(p2.uncontrolled) : 0
  const combinedTotal = p1Total + p2Total
  const combinedUnct = p1Unct + p2Unct
  const weightNum = Number(avgWeight)

  const p1UnctPct = p1Total > 0 && p1Unct >= 0 ? ((p1Unct / p1Total) * 100).toFixed(1) : null
  const p2UnctPct = p2Total > 0 && p2Unct >= 0 ? ((p2Unct / p2Total) * 100).toFixed(1) : null
  const combinedUnctPct = combinedTotal > 0 && combinedUnct >= 0
    ? ((combinedUnct / combinedTotal) * 100).toFixed(1)
    : null

  const validationErrors: string[] = []
  if (!Number.isFinite(p1Total) || p1Total <= 0) validationErrors.push('Período 1 — Total entrada debe ser > 0')
  if (!Number.isFinite(p1Unct) || p1Unct < 0) validationErrors.push('Período 1 — No controladas debe ser ≥ 0')
  if (p1Unct > p1Total) validationErrors.push('Período 1 — No controladas no puede exceder Total')
  if (twoSegments) {
    if (!Number.isFinite(p2Total) || p2Total <= 0) validationErrors.push('Período 2 — Total entrada debe ser > 0')
    if (!Number.isFinite(p2Unct) || p2Unct < 0) validationErrors.push('Período 2 — No controladas debe ser ≥ 0')
    if (p2Unct > p2Total) validationErrors.push('Período 2 — No controladas no puede exceder Total')
  }
  if (!Number.isFinite(weightNum) || weightNum < 100 || weightNum > 15000) {
    validationErrors.push('Peso fuera de rango (100-15000g)')
  }
  const isValid = validationErrors.length === 0

  const handleSave = useCallback(async () => {
    if (!user || !isValid) return
    setSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const segments: MarelHgSegment[] | undefined = twoSegments
        ? [
            { label: 'pre-colación', totalInput: p1Total, uncontrolled: p1Unct, capturedAt: now },
            { label: 'post-colación', totalInput: p2Total, uncontrolled: p2Unct, capturedAt: now },
          ]
        : undefined

      await saveMarelHgCapture(summaryId, {
        totalInput: combinedTotal,
        uncontrolled: combinedUnct,
        avgWeightHeadGrams: weightNum,
        notes: notes.trim() || undefined,
        capturedBy: user.id,
        capturedByName: `${user.nombre} ${user.apellido}`,
        segments,
      })
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [user, isValid, summaryId, twoSegments, combinedTotal, combinedUnct, p1Total, p1Unct, p2Total, p2Unct, weightNum, notes, onSaved, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar' : 'Capturar'} datos Marel HG</DialogTitle>
          <DialogDescription>
            Lee los valores en la pantalla Marel HG.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Toggle dos períodos */}
          <div className="flex items-start gap-3 rounded-md border border-border p-3 bg-muted">
            <input
              id="two-segments"
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer"
              checked={twoSegments}
              onChange={(e) => {
                setTwoSegments(e.target.checked)
                if (!e.target.checked) setP2(EMPTY_SEG)
              }}
            />
            <div>
              <label htmlFor="two-segments" className="text-sm font-medium cursor-pointer">
                Marel HG reseteó en colación
              </label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                La pantalla entra en modo contrastación y el contador vuelve a cero. Ingresá el conteo de cada período por separado y se sumarán automáticamente.
              </p>
            </div>
          </div>

          {/* Período 1 */}
          <SegmentInputs
            label={twoSegments ? 'Período 1 — Pre-colación' : undefined}
            fields={p1}
            onChange={setP1}
            unctPct={p1UnctPct}
            idPrefix="p1"
          />

          {/* Período 2 — solo si hubo reset */}
          {twoSegments && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex-1 h-px bg-border" />
                <Plus className="w-3 h-3" />
                <div className="flex-1 h-px bg-border" />
              </div>
              <SegmentInputs
                label="Período 2 — Post-colación"
                fields={p2}
                onChange={setP2}
                unctPct={p2UnctPct}
                idPrefix="p2"
              />

              {/* Resumen combinado */}
              {combinedTotal > 0 && (
                <div className="rounded-md bg-muted px-3 py-2 text-xs space-y-0.5">
                  <div className="font-medium text-foreground">Total combinado del turno</div>
                  <div className="tabular-nums text-muted-foreground">
                    Entrada: <b className="text-foreground">{combinedTotal.toLocaleString('es-CL')}</b>
                    {' · '}
                    No ctrl: <b className="text-foreground">{combinedUnct.toLocaleString('es-CL')}</b>
                    {combinedUnctPct && <span> ({combinedUnctPct}%)</span>}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Peso promedio */}
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
              Sirve para validar coherencia con el peso Grader sin cabeza (ratio cabeza ~25-35%).
            </p>
          </div>

          {/* Notas */}
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

// ─── Sub-componente para un par de inputs de segmento ────────────────────────

interface SegmentInputsProps {
  label?: string
  fields: SegmentFields
  onChange: (f: SegmentFields) => void
  unctPct: string | null
  idPrefix: string
}

function SegmentInputs({ label, fields, onChange, unctPct, idPrefix }: SegmentInputsProps) {
  return (
    <div className="space-y-3">
      {label && (
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-total`}>Total entrada (con cabeza)</Label>
          <Input
            id={`${idPrefix}-total`}
            type="number"
            inputMode="numeric"
            min="1"
            value={fields.totalInput}
            onChange={(e) => onChange({ ...fields, totalInput: e.target.value })}
            placeholder="ej. 8500"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-uncontrolled`}>
            No controladas
            {unctPct != null && (
              <span className="ml-1 font-normal text-muted-foreground">({unctPct}%)</span>
            )}
          </Label>
          <Input
            id={`${idPrefix}-uncontrolled`}
            type="number"
            inputMode="numeric"
            min="0"
            value={fields.uncontrolled}
            onChange={(e) => onChange({ ...fields, uncontrolled: e.target.value })}
            placeholder="ej. 160"
          />
        </div>
      </div>
    </div>
  )
}
