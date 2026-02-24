/**
 * RelocateRepuestoModal v2.48.92
 *
 * Modal para reubicar UN repuesto de su máquina actual a otra máquina.
 * Solo visible para admins. Muestra selector de máquina destino con
 * preview del repuesto que se va a mover.
 */

import { useState } from 'react'
import { ArrowRightLeft, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { Repuesto, Machine } from '@/types/repuestos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@/components/ui'

interface RelocateRepuestoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repuesto: Repuesto
  currentMachine: Machine
  machines: Machine[]
  onRelocate: (repuestoId: string, targetMachineId: string) => Promise<string>
  onSuccess?: () => void
}

export function RelocateRepuestoModal({
  open,
  onOpenChange,
  repuesto,
  currentMachine,
  machines,
  onRelocate,
  onSuccess,
}: RelocateRepuestoModalProps) {
  const [targetMachineId, setTargetMachineId] = useState<string | null>(null)
  const [relocating, setRelocating] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Máquinas disponibles (excluir la actual)
  const availableMachines = machines.filter(m => m.id !== currentMachine.id && m.activa)

  const targetMachine = availableMachines.find(m => m.id === targetMachineId) ?? null

  const handleRelocate = async () => {
    if (!targetMachineId) return
    setRelocating(true)
    setError(null)
    try {
      await onRelocate(repuesto.id, targetMachineId)
      setDone(true)
      setTimeout(() => {
        onOpenChange(false)
        onSuccess?.()
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reubicar')
    } finally {
      setRelocating(false)
    }
  }

  const handleClose = (o: boolean) => {
    if (relocating) return
    if (!o) {
      setTargetMachineId(null)
      setDone(false)
      setError(null)
    }
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-amber-500" />
            Reubicar Repuesto
          </DialogTitle>
          <DialogDescription>
            Mover este repuesto a otra máquina. Los vínculos al manual se mantendrán.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-sm font-medium text-foreground">¡Repuesto reubicado!</p>
            <p className="text-xs text-muted-foreground">
              Movido a <span className="font-semibold text-foreground">{targetMachine?.nombre}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Repuesto info */}
            <div className="bg-muted/30 rounded-lg p-3 border border-border space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Repuesto</div>
              <div className="font-medium text-foreground text-sm">{repuesto.textoBreve || repuesto.codigoSAP || 'Sin nombre'}</div>
              {repuesto.codigoSAP && (
                <div className="text-xs text-muted-foreground font-mono">SAP: {repuesto.codigoSAP}</div>
              )}
              {repuesto.codigoFabricante && (
                <div className="text-xs text-muted-foreground font-mono">Fab: {repuesto.codigoFabricante}</div>
              )}
            </div>

            {/* Current machine */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-red-500/10 rounded-lg p-2.5 border border-red-500/20">
                <div className="text-[10px] text-red-400 uppercase tracking-wider font-medium">Máquina actual</div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: currentMachine.color }} />
                  {currentMachine.nombre}
                </div>
              </div>
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 bg-green-500/10 rounded-lg p-2.5 border border-green-500/20">
                <div className="text-[10px] text-green-400 uppercase tracking-wider font-medium">Máquina destino</div>
                {targetMachine ? (
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: targetMachine.color }} />
                    {targetMachine.nombre}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Selecciona abajo…</div>
                )}
              </div>
            </div>

            {/* Machine selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Selecciona la máquina destino:</label>
              <div className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/10 divide-y divide-border/50">
                {availableMachines.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setTargetMachineId(m.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition-all flex items-center gap-2 ${
                      targetMachineId === m.id
                        ? 'bg-primary/10 text-foreground ring-1 ring-primary/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <span className="truncate">{m.nombre}</span>
                    {targetMachineId === m.id && (
                      <span className="ml-auto text-[10px] text-primary font-medium shrink-0">Seleccionada</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-2.5 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {!done && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleClose(false)} disabled={relocating}>
              Cancelar
            </Button>
            <Button
              onClick={handleRelocate}
              disabled={!targetMachineId || relocating}
              className="gap-2"
            >
              {relocating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Reubicando…</>
              ) : (
                <><ArrowRightLeft className="h-4 w-4" /> Reubicar</>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
