import { FormEvent, useEffect, useState } from 'react'
import { ScanLine } from 'lucide-react'
import type { Repuesto, RepuestoFormData } from '@/types/repuestos'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@/components/ui'
import { BarcodeScannerModal } from './BarcodeScannerModal'

export type RepuestoFormMode = 'create' | 'edit'

interface SiblingNode {
  id: string
  nombre: string
}

interface RepuestoFormModalProps {
  open: boolean
  mode: RepuestoFormMode
  machineName?: string
  initialData?: Repuesto | null
  onClose: () => void
  onSubmit: (payload: RepuestoFormData, target?: 'own' | 'shared') => Promise<void>
  /** Para crear en múltiples equipos hermanos */
  onSubmitMultiple?: (payload: RepuestoFormData, nodeIds: string[]) => Promise<void>
  /** Si hay máquina vinculada, permite toggle compartir */
  hasLinkedMachine?: boolean
  /** Nodos hermanos SAP (para checkbox "Agregar a...") */
  siblingNodes?: SiblingNode[]
  /** Nombre del equipo actual (nodo SAP) */
  equipmentName?: string
  loading?: boolean
}

const defaultForm: RepuestoFormData = {
  codigoSAP: '',
  codigoFabricante: '',
  textoBreve: '',
  descripcion: '',
  valorUnitario: 0,
  cantidadPorMaquina: 0,
  ubicacionEnPlanta: '',
  observaciones: '',
}

export function RepuestoFormModal({
  open,
  mode,
  machineName,
  initialData,
  onClose,
  onSubmit,
  onSubmitMultiple,
  hasLinkedMachine,
  siblingNodes,
  equipmentName,
  loading = false,
}: RepuestoFormModalProps) {
  const [form, setForm] = useState<RepuestoFormData>(defaultForm)
  const [error, setError] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [target, setTarget] = useState<'own' | 'shared'>('own')
  const [selectedSiblings, setSelectedSiblings] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      setError(null)
      if (initialData) {
        setForm({
          codigoSAP: initialData.codigoSAP || '',
          codigoFabricante: initialData.codigoFabricante || '',
          textoBreve: initialData.textoBreve || '',
          descripcion: initialData.descripcion || '',
          valorUnitario: initialData.valorUnitario || 0,
          cantidadPorMaquina: initialData.cantidadPorMaquina || 0,
          ubicacionEnPlanta: initialData.ubicacionEnPlanta || '',
          observaciones: initialData.observaciones || '',
        })
      } else {
        setForm(defaultForm)
      }
    }
  }, [open, initialData])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    try {
      const payload: RepuestoFormData = {
        codigoSAP: form.codigoSAP.trim(),
        codigoFabricante: form.codigoFabricante.trim(),
        textoBreve: form.textoBreve.trim(),
        descripcion: form.descripcion?.trim() || '',
        valorUnitario: Number(form.valorUnitario) || 0,
        cantidadPorMaquina: Number(form.cantidadPorMaquina) || 0,
        ubicacionEnPlanta: form.ubicacionEnPlanta?.trim() || '',
        observaciones: form.observaciones?.trim() || '',
      }

      if (!payload.textoBreve) {
        setError('El texto breve es obligatorio.')
        return
      }

      await onSubmit(payload, target)

      // Crear en hermanos seleccionados
      if (mode === 'create' && selectedSiblings.size > 0 && onSubmitMultiple) {
        await onSubmitMultiple(payload, [...selectedSiblings])
      }

      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el repuesto.'
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nuevo repuesto' : 'Editar repuesto'}
          </DialogTitle>
          {machineName && (
            <p className="text-sm text-muted-foreground mt-1">
              Asociado a: <span className="font-medium text-foreground">{machineName}</span>
            </p>
          )}
        </DialogHeader>

        <form className="space-y-5 py-2" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="codigoSAP">Código SAP</Label>
              <div className="flex gap-2">
                <Input
                  id="codigoSAP"
                  value={form.codigoSAP}
                  onChange={(e) => setForm({ ...form, codigoSAP: e.target.value })}
                  placeholder="Ej: 123-456"
                  className="flex-1"
                />
                {/* Escanear código de barras / QR */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setScannerOpen(true)}
                  title="Escanear código de barras o QR"
                >
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigoFabricante">Código Fabricante</Label>
              <Input
                id="codigoFabricante"
                value={form.codigoFabricante}
                onChange={(e) => setForm({ ...form, codigoFabricante: e.target.value })}
                placeholder="Ej: BA-200"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="textoBreve">Texto breve</Label>
              <Input
                id="textoBreve"
                value={form.textoBreve}
                onChange={(e) => setForm({ ...form, textoBreve: e.target.value })}
                required
                placeholder="Nombre del repuesto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorUnitario">Valor unitario (USD)</Label>
              <Input
                id="valorUnitario"
                type="number"
                min="0"
                step="0.01"
                value={form.valorUnitario}
                onChange={(e) => setForm({ ...form, valorUnitario: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Detalles, proveedor, especificaciones..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              placeholder="Notas adicionales, estado, condiciones especiales..."
              rows={2}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cantidadPorMaquina">Cantidad por máquina</Label>
              <Input
                id="cantidadPorMaquina"
                type="number"
                min="0"
                value={form.cantidadPorMaquina}
                onChange={(e) => setForm({ ...form, cantidadPorMaquina: Number(e.target.value) })}
                placeholder="Cuántas unidades usa la máquina"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ubicacionEnPlanta">Ubicación en planta</Label>
              <Input
                id="ubicacionEnPlanta"
                value={form.ubicacionEnPlanta || ''}
                onChange={(e) => setForm({ ...form, ubicacionEnPlanta: e.target.value })}
                placeholder="Dónde se encuentra dentro de la máquina"
              />
            </div>
          </div>

          {/* Destino y multi-equipo (solo en crear) */}
          {mode === 'create' && (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/10">
              {/* Toggle: propio vs compartido */}
              {hasLinkedMachine && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Destino</Label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setTarget('own')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${target === 'own' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-border bg-card text-muted-foreground hover:bg-muted/20'}`}>
                      Propio de {equipmentName || 'este equipo'}
                    </button>
                    <button type="button" onClick={() => setTarget('shared')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${target === 'shared' ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' : 'border-border bg-card text-muted-foreground hover:bg-muted/20'}`}>
                      Compartido ({machineName || 'máquina'})
                    </button>
                  </div>
                </div>
              )}

              {/* Agregar a hermanos */}
              {siblingNodes && siblingNodes.length > 0 && target === 'own' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Agregar también a:</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {siblingNodes.map(s => {
                      const checked = selectedSiblings.has(s.id)
                      return (
                        <button key={s.id} type="button"
                          onClick={() => setSelectedSiblings(prev => {
                            const next = new Set(prev)
                            if (checked) next.delete(s.id); else next.add(s.id)
                            return next
                          })}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted/20'}`}>
                          {s.nombre}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {mode === 'create' ? 'Crear repuesto' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {/* Modal de escaneo de código de barras / QR */}
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => setForm({ ...form, codigoSAP: value })}
        hint="Apunta la cámara al código SAP del repuesto"
      />
    </Dialog>
  )
}
