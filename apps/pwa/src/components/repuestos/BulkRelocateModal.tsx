/**
 * BulkRelocateModal v2.48.92
 *
 * Modal para reubicar MÚLTIPLES repuestos de su máquina actual
 * a otra máquina, con selección por checkboxes, filtro de búsqueda
 * y barra de progreso. Solo visible para admins.
 */

import { useState, useMemo } from 'react'
import {
  ArrowRightLeft, Loader2, AlertTriangle, CheckCircle2,
  Search, Package, Check,
} from 'lucide-react'
import type { Repuesto, Machine } from '@/types/repuestos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Checkbox,
} from '@/components/ui'

interface BulkRelocateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repuestos: Repuesto[]
  currentMachine: Machine
  machines: Machine[]
  onBulkRelocate: (repuestoIds: string[], targetMachineId: string) => Promise<number>
  onSuccess?: () => void
}

export function BulkRelocateModal({
  open,
  onOpenChange,
  repuestos,
  currentMachine,
  machines,
  onBulkRelocate,
  onSuccess,
}: BulkRelocateModalProps) {
  const [step, setStep] = useState<'select' | 'confirm' | 'done'>('select')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [targetMachineId, setTargetMachineId] = useState<string | null>(null)
  const [relocating, setRelocating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [movedCount, setMovedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const availableMachines = machines.filter(m => m.id !== currentMachine.id && m.activa)
  const targetMachine = availableMachines.find(m => m.id === targetMachineId) ?? null

  // Filter repuestos by search
  const filteredRepuestos = useMemo(() => {
    if (!searchQuery.trim()) return repuestos
    const q = searchQuery.toLowerCase()
    return repuestos.filter(r =>
      r.textoBreve?.toLowerCase().includes(q) ||
      r.codigoSAP?.toLowerCase().includes(q) ||
      r.codigoFabricante?.toLowerCase().includes(q) ||
      r.descripcion?.toLowerCase().includes(q)
    )
  }, [repuestos, searchQuery])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredRepuestos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredRepuestos.map(r => r.id)))
    }
  }

  const handleRelocate = async () => {
    if (!targetMachineId || selectedIds.size === 0) return
    setRelocating(true)
    setError(null)
    setProgress(0)

    try {
      const ids = Array.from(selectedIds)
      let moved = 0
      for (const id of ids) {
        await onBulkRelocate([id], targetMachineId)
        moved++
        setProgress(Math.round((moved / ids.length) * 100))
      }
      setMovedCount(moved)
      setStep('done')
      setTimeout(() => {
        onSuccess?.()
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reubicar')
    } finally {
      setRelocating(false)
    }
  }

  const handleClose = (o: boolean) => {
    if (relocating) return
    if (!o) {
      setStep('select')
      setSelectedIds(new Set())
      setTargetMachineId(null)
      setError(null)
      setProgress(0)
      setMovedCount(0)
      setSearchQuery('')
    }
    onOpenChange(o)
  }

  const selectedRepuestos = repuestos.filter(r => selectedIds.has(r.id))

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-amber-500" />
            Reubicar Repuestos Masivamente
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Selecciona los repuestos a reubicar y la máquina destino.'}
            {step === 'confirm' && `Confirma la reubicación de ${selectedIds.size} repuesto(s).`}
            {step === 'done' && '¡Reubicación completada!'}
          </DialogDescription>
        </DialogHeader>

        {step === 'done' ? (
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <p className="text-lg font-medium text-foreground">{movedCount} repuesto(s) reubicados</p>
            <p className="text-sm text-muted-foreground">
              Movidos a <span className="font-semibold text-foreground">{targetMachine?.nombre}</span>
            </p>
          </div>
        ) : step === 'confirm' ? (
          <div className="space-y-4 py-2 overflow-auto flex-1 min-h-0">
            {/* Summary */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-red-500/10 rounded-lg p-2.5 border border-red-500/20">
                <div className="text-[10px] text-red-400 uppercase tracking-wider font-medium">Origen</div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: currentMachine.color }} />
                  {currentMachine.nombre}
                </div>
              </div>
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 bg-green-500/10 rounded-lg p-2.5 border border-green-500/20">
                <div className="text-[10px] text-green-400 uppercase tracking-wider font-medium">Destino</div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: targetMachine?.color ?? '#888' }} />
                  {targetMachine?.nombre}
                </div>
              </div>
            </div>

            <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Se moverán <span className="font-bold">{selectedIds.size}</span> repuesto(s) de{' '}
                <span className="font-bold">{currentMachine.nombre}</span> a{' '}
                <span className="font-bold">{targetMachine?.nombre}</span>. Esta acción no se puede deshacer fácilmente.
              </span>
            </div>

            {/* Selected list */}
            <div className="max-h-40 overflow-auto rounded-lg border border-border bg-muted/10 divide-y divide-border/50">
              {selectedRepuestos.map(r => (
                <div key={r.id} className="px-3 py-1.5 text-xs flex items-center gap-2">
                  <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono text-muted-foreground w-20 truncate">{r.codigoSAP || '—'}</span>
                  <span className="truncate text-foreground">{r.textoBreve || 'Sin nombre'}</span>
                </div>
              ))}
            </div>

            {/* Progress bar when relocating */}
            {relocating && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Reubicando…</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-2.5 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        ) : (
          /* step === 'select' */
          <div className="space-y-3 flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Machine destination selector */}
            <div className="space-y-1.5 shrink-0">
              <label className="text-xs font-medium text-foreground">Máquina destino:</label>
              <div className="max-h-32 overflow-auto rounded-lg border border-border bg-muted/10 divide-y divide-border/50">
                {availableMachines.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setTargetMachineId(m.id)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-all flex items-center gap-2 ${
                      targetMachineId === m.id
                        ? 'bg-primary/10 text-foreground ring-1 ring-primary/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <span className="truncate">{m.nombre}</span>
                    {targetMachineId === m.id && (
                      <Check className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder="Buscar repuestos…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Select all */}
            <div className="flex items-center gap-2 shrink-0">
              <Checkbox
                checked={filteredRepuestos.length > 0 && selectedIds.size === filteredRepuestos.length}
                onCheckedChange={toggleAll}
              />
              <span className="text-xs text-muted-foreground">
                Seleccionar todos ({filteredRepuestos.length})
                {selectedIds.size > 0 && (
                  <span className="ml-1 text-primary font-medium">· {selectedIds.size} seleccionados</span>
                )}
              </span>
            </div>

            {/* Repuestos list with checkboxes */}
            <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-muted/10 divide-y divide-border/50">
              {filteredRepuestos.map(r => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors text-sm ${
                    selectedIds.has(r.id) ? 'bg-primary/5' : 'hover:bg-muted/30'
                  }`}
                >
                  <Checkbox
                    checked={selectedIds.has(r.id)}
                    onCheckedChange={() => toggleSelect(r.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground truncate">{r.textoBreve || 'Sin nombre'}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {r.codigoSAP || '—'}
                      {r.codigoFabricante && <span className="ml-2">Fab: {r.codigoFabricante}</span>}
                    </div>
                  </div>
                  {r.cantidadPorMaquina > 0 && (
                    <span className="text-[10px] text-muted-foreground shrink-0">×{r.cantidadPorMaquina}</span>
                  )}
                </label>
              ))}
              {filteredRepuestos.length === 0 && (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                  <Package className="h-4 w-4" />
                  Sin resultados
                </div>
              )}
            </div>
          </div>
        )}

        {step !== 'done' && (
          <DialogFooter className="shrink-0">
            {step === 'confirm' ? (
              <>
                <Button variant="ghost" onClick={() => setStep('select')} disabled={relocating}>
                  Volver
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRelocate}
                  disabled={relocating}
                  className="gap-2"
                >
                  {relocating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Reubicando {progress}%</>
                  ) : (
                    <><ArrowRightLeft className="h-4 w-4" /> Confirmar Reubicación</>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => handleClose(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => setStep('confirm')}
                  disabled={selectedIds.size === 0 || !targetMachineId}
                  className="gap-2"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Continuar ({selectedIds.size})
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
