import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ScanLine, Boxes, AlertTriangle } from 'lucide-react'
import type { Repuesto, RepuestoFormData, MaterialClase } from '@/types/repuestos'
import { CLASE_LABEL } from '@/types/repuestos'
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
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
  /** El material no pertenece a ningún equipo (insumo/herramienta transversal). */
  transversal?: boolean
  /** Clase inicial al crear (transversal → 'insumo'; equipo-bound → 'repuesto'). */
  defaultClase?: MaterialClase
  /** Detecta si ya existe un material con el SAP o nombre tecleado (aviso de duplicado). */
  onCheckDuplicate?: (args: { codigoSAP: string; textoBreve: string }) => { id: string; textoBreve: string; codigoSAP: string } | null
  /** Cambiar el equipo/destino (reabre el picker). Muestra el enlace "Cambiar". */
  onChangeTarget?: () => void
  loading?: boolean
}

const CLASE_OPTIONS: MaterialClase[] = ['repuesto', 'insumo', 'herramienta', 'quimico', 'lubricante', 'refrigeracion']

const defaultForm: RepuestoFormData = {
  codigoSAP: '',
  codigoFabricante: '',
  textoBreve: '',
  descripcion: '',
  clase: 'repuesto',
  valorUnitario: 0,
  cantidadPorMaquina: 0,
  ubicacionEnPlanta: '',
  observaciones: '',
  stockInicial: 0,
  stockMinimo: 0,
  ubicacionBodega: '',
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
  transversal = false,
  defaultClase,
  onCheckDuplicate,
  onChangeTarget,
  loading = false,
}: RepuestoFormModalProps) {
  const [form, setForm] = useState<RepuestoFormData>(defaultForm)
  const [error, setError] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [target, setTarget] = useState<'own' | 'shared'>('own')
  const [selectedSiblings, setSelectedSiblings] = useState<Set<string>>(new Set())

  // Aviso de duplicado: ¿ya existe un material con este SAP o nombre? (solo al crear)
  const duplicate = useMemo(() => {
    if (mode !== 'create' || !onCheckDuplicate) return null
    return onCheckDuplicate({ codigoSAP: form.codigoSAP, textoBreve: form.textoBreve })
  }, [mode, onCheckDuplicate, form.codigoSAP, form.textoBreve])

  useEffect(() => {
    if (open) {
      setError(null)
      if (initialData) {
        setForm({
          codigoSAP: initialData.codigoSAP || '',
          codigoFabricante: initialData.codigoFabricante || '',
          textoBreve: initialData.textoBreve || '',
          descripcion: initialData.descripcion || '',
          clase: initialData.clase || 'repuesto',
          valorUnitario: initialData.valorUnitario || 0,
          cantidadPorMaquina: initialData.cantidadPorMaquina || 0,
          ubicacionEnPlanta: initialData.ubicacionEnPlanta || '',
          observaciones: initialData.observaciones || '',
        })
      } else {
        setForm({ ...defaultForm, clase: defaultClase || (transversal ? 'insumo' : 'repuesto') })
      }
    }
  }, [open, initialData, defaultClase, transversal])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    try {
      const payload: RepuestoFormData = {
        codigoSAP: form.codigoSAP.trim(),
        codigoFabricante: form.codigoFabricante.trim(),
        textoBreve: form.textoBreve.trim(),
        descripcion: form.descripcion?.trim() || '',
        clase: form.clase || (transversal ? 'insumo' : 'repuesto'),
        valorUnitario: Number(form.valorUnitario) || 0,
        cantidadPorMaquina: Number(form.cantidadPorMaquina) || 0,
        ubicacionEnPlanta: form.ubicacionEnPlanta?.trim() || '',
        observaciones: form.observaciones?.trim() || '',
        stockInicial: Number(form.stockInicial) || 0,
        stockMinimo: Number(form.stockMinimo) || 0,
        ubicacionBodega: form.ubicacionBodega?.trim() || '',
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
            {mode === 'create' ? (transversal ? 'Nuevo material transversal' : 'Nuevo repuesto') : 'Editar repuesto'}
          </DialogTitle>
          {transversal ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Boxes className="h-4 w-4 text-primary" />
              Insumo/herramienta · no pertenece a ningún equipo
            </p>
          ) : machineName ? (
            <p className="text-sm text-muted-foreground mt-1">
              Asociado a: <span className="font-medium text-foreground">{machineName}</span>
              {onChangeTarget && (
                <button type="button" onClick={onChangeTarget} className="ml-2 text-xs font-medium text-primary underline-offset-2 hover:underline">
                  Cambiar
                </button>
              )}
            </p>
          ) : null}
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

          {/* Aviso de duplicado (no bloquea: solo advierte) */}
          {duplicate && (
            <div className="flex items-start gap-2 rounded-card border border-amber-500/[0.25] bg-amber-500/[0.15] px-3 py-2 text-xs text-ink-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Ya existe un material parecido: <span className="font-semibold">{duplicate.textoBreve}</span>
                {duplicate.codigoSAP ? <> (SAP {duplicate.codigoSAP})</> : null}. Revísalo antes de crear un duplicado.
              </span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="clase">Clase de material</Label>
              <Select value={form.clase || 'repuesto'} onValueChange={(v) => setForm({ ...form, clase: v as MaterialClase })}>
                <SelectTrigger id="clase"><SelectValue placeholder="Clase" /></SelectTrigger>
                <SelectContent>
                  {CLASE_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{CLASE_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="textoBreve">Texto breve</Label>
              <Input
                id="textoBreve"
                value={form.textoBreve}
                onChange={(e) => setForm({ ...form, textoBreve: e.target.value })}
                required
                placeholder={transversal ? 'Ej: GUANTE DESECHABLE NITRILO - TALLA XL' : 'Nombre del repuesto'}
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
            {!transversal && (
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
            )}
          </div>

          {!transversal && (
            <div className="space-y-2">
              <Label htmlFor="ubicacionEnPlanta">Ubicación en planta</Label>
              <Input
                id="ubicacionEnPlanta"
                value={form.ubicacionEnPlanta || ''}
                onChange={(e) => setForm({ ...form, ubicacionEnPlanta: e.target.value })}
                placeholder="Dónde se encuentra dentro de la máquina"
              />
            </div>
          )}

          {/* Stock en bodega — solo con SAP (el stock vive en `bodega` por SAP) */}
          {form.codigoSAP.trim() ? (
            <div className="space-y-3 rounded-card border border-border bg-muted p-3">
              <Label className="text-xs font-semibold text-muted-foreground">
                Stock en bodega <span className="font-normal">· se guarda por SAP</span>
              </Label>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="stockInicial" className="text-xs">Stock inicial</Label>
                  <Input id="stockInicial" type="number" min="0" value={form.stockInicial ?? 0}
                    onChange={(e) => setForm({ ...form, stockInicial: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stockMinimo" className="text-xs">Stock mínimo</Label>
                  <Input id="stockMinimo" type="number" min="0" value={form.stockMinimo ?? 0}
                    onChange={(e) => setForm({ ...form, stockMinimo: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ubicacionBodega" className="text-xs">Ubicación</Label>
                  <Input id="ubicacionBodega" value={form.ubicacionBodega || ''}
                    onChange={(e) => setForm({ ...form, ubicacionBodega: e.target.value })} placeholder="Ej: C-31" />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Agrega un código SAP para registrar stock y ubicación de bodega.</p>
          )}

          {/* Destino y multi-equipo (solo en crear) */}
          {mode === 'create' && (
            <div className="space-y-3 rounded-card border border-border p-3 bg-muted">
              {/* Toggle: propio vs compartido */}
              {hasLinkedMachine && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Destino</Label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setTarget('own')}
                      className={`flex-1 px-3 py-2 rounded-card text-xs font-medium border transition-all ${target === 'own' ? 'border-emerald-500/[0.25] bg-emerald-500/[0.15] text-emerald-400' : 'border-border bg-card text-muted-foreground hover:bg-muted/20'}`}>
                      Propio de {equipmentName || 'este equipo'}
                    </button>
                    <button type="button" onClick={() => setTarget('shared')}
                      className={`flex-1 px-3 py-2 rounded-card text-xs font-medium border transition-all ${target === 'shared' ? 'border-primary/[0.25] bg-primary/[0.15] text-blue-400' : 'border-border bg-card text-muted-foreground hover:bg-muted/20'}`}>
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
                          className={`px-2 py-1 rounded-ctl text-[11px] font-medium border transition-all ${checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted/20'}`}>
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
