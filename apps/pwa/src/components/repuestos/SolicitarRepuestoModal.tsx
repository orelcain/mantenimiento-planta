/**
 * SolicitarRepuestoModal — Alta de una solicitud de repuesto (Fase 6).
 *
 * Dos modos:
 *  - con `repuesto` preseleccionado (desde la fila / panel de detalle) → muestra el repuesto fijo.
 *  - sin preselección (desde el topbar) → selector acotado a los repuestos del área (`options`).
 */
import { useState, useEffect, useMemo } from 'react'
import { Loader2, Package } from 'lucide-react'
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui'
import type { NuevaSolicitud } from '@/hooks/repuestos/useSolicitudes'

export interface RepuestoLite {
  codigoSAP: string
  textoBreve: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Repuesto preseleccionado (fila/panel). Si es null, se usa el selector con `options`. */
  repuesto?: RepuestoLite | null
  /** Repuestos del área para el selector (cuando no hay preselección). */
  options?: RepuestoLite[]
  onSubmit: (data: NuevaSolicitud) => Promise<void>
}

export function SolicitarRepuestoModal({ open, onOpenChange, repuesto, options = [], onSubmit }: Props) {
  const [sap, setSap] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [observaciones, setObservaciones] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset al abrir / cambiar de repuesto preseleccionado
  useEffect(() => {
    if (open) {
      setSap(repuesto?.codigoSAP ?? '')
      setCantidad(1)
      setObservaciones('')
      setError(null)
      setSaving(false)
    }
  }, [open, repuesto])

  const optionsWithSap = useMemo(
    () => options.filter((o) => o.codigoSAP?.trim()).sort((a, b) => a.textoBreve.localeCompare(b.textoBreve, 'es')),
    [options],
  )

  const selected: RepuestoLite | null = useMemo(() => {
    if (repuesto) return repuesto
    return optionsWithSap.find((o) => o.codigoSAP === sap) ?? null
  }, [repuesto, optionsWithSap, sap])

  const submit = async () => {
    if (!selected) { setError('Selecciona un repuesto.'); return }
    if (cantidad < 1) { setError('La cantidad debe ser al menos 1.'); return }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        codigoSAP: selected.codigoSAP,
        textoBreve: selected.textoBreve,
        cantidad,
        observaciones,
      })
      onOpenChange(false)
    } catch {
      setError('No se pudo crear la solicitud. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Solicitar repuesto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Repuesto: fijo (preseleccionado) o selector */}
          {repuesto ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="text-sm font-medium text-foreground">{repuesto.textoBreve || '(sin nombre)'}</div>
              <div className="font-mono text-xs text-muted-foreground">SAP {repuesto.codigoSAP}</div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Repuesto</label>
              <Select value={sap} onValueChange={setSap}>
                <SelectTrigger><SelectValue placeholder="Selecciona un repuesto del área…" /></SelectTrigger>
                <SelectContent>
                  {optionsWithSap.map((o) => (
                    <SelectItem key={o.codigoSAP} value={o.codigoSAP}>
                      {o.textoBreve || o.codigoSAP} · {o.codigoSAP}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Cantidad */}
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Cantidad</label>
            <Input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="w-32"
            />
          </div>

          {/* Observaciones */}
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Observaciones (opcional)</label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Urgencia, motivo, equipo destino…"
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !selected} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
