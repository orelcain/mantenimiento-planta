/**
 * LinkMachineModal — Modal para vincular una máquina manual con un equipo SAP.
 *
 * Flujo:
 *  1. Mostrar lista de máquinas manuales con buscador
 *  2. Al seleccionar → vincular (linkedMachineId en hierarchy/)
 *  3. Contar repuestos de la máquina
 *  4. Confirmar soft-delete de la máquina manual (activa: false)
 */

import { useState, useMemo } from 'react'
import { Search, X, Link2, Loader2, AlertTriangle, CheckCircle2, Package, Trash2 } from 'lucide-react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Machine } from '@/types/repuestos'

type ModalStep = 'select' | 'confirming' | 'done'

interface LinkMachineModalProps {
  open: boolean
  onClose: () => void
  sapNodeId: string
  sapNodeName: string
  machines: Machine[]
  onLink: (sapNodeId: string, machineId: string) => Promise<void>
  onDeleteMachine: (machineId: string) => Promise<void>
}

export function LinkMachineModal({
  open,
  onClose,
  sapNodeId,
  sapNodeName,
  machines,
  onLink,
  onDeleteMachine,
}: LinkMachineModalProps) {
  const [search, setSearch] = useState('')
  const [step, setStep] = useState<ModalStep>('select')
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null)
  const [repuestosCount, setRepuestosCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return machines
    const q = search.toLowerCase()
    return machines.filter(m =>
      m.nombre.toLowerCase().includes(q) ||
      m.marca?.toLowerCase().includes(q) ||
      m.modelo?.toLowerCase().includes(q),
    )
  }, [machines, search])

  const reset = () => {
    setSearch('')
    setStep('select')
    setSelectedMachine(null)
    setRepuestosCount(0)
    setLoading(false)
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSelect = async (machine: Machine) => {
    setLoading(true)
    setError(null)
    setSelectedMachine(machine)

    try {
      // 1. Vincular
      await onLink(sapNodeId, machine.id)

      // 2. Contar repuestos
      const repSnap = await getDocs(collection(db, `machines/${machine.id}/repuestos`))
      setRepuestosCount(repSnap.size)

      // 3. Verificar cuántos nodos usan esta máquina (si >1, no ofrecer eliminar)
      const linkedNodesSnap = await getDocs(
        query(collection(db, 'hierarchy'), where('linkedMachineId', '==', machine.id))
      )
      if (linkedNodesSnap.size > 1) {
        // Máquina compartida por múltiples equipos SAP → directo a done
        setStep('done')
      } else {
        setStep('confirming')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al vincular')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!selectedMachine) return
    setLoading(true)
    setError(null)

    try {
      await onDeleteMachine(selectedMachine.id)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setLoading(false)
    }
  }

  const handleSkipDelete = () => {
    setStep('done')
  }

  const handleDirectDelete = async (e: React.MouseEvent, machine: Machine) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar "${machine.nombre}" de la lista de máquinas manuales?`)) return
    setDeletingId(machine.id)
    try {
      await onDeleteMachine(machine.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Vincular máquina</h3>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
              Equipo SAP: {sapNodeName}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Step: Select */}
        {step === 'select' && (
          <>
            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar máquina por nombre, marca..."
                  className="w-full h-8 pl-8 pr-8 text-xs rounded-lg border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {filtered.length} máquina{filtered.length !== 1 ? 's' : ''} disponible{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Machine list */}
            <div className="flex-1 overflow-y-auto px-2 pb-3 min-h-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Package className="h-6 w-6 mb-2 opacity-30" />
                  <p className="text-xs">Sin resultados</p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filtered.map(m => (
                    <div key={m.id} className="flex items-center gap-0.5 group">
                      <button
                        onClick={() => handleSelect(m)}
                        disabled={loading || deletingId === m.id}
                        className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-primary/8 transition-colors disabled:opacity-50"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: m.color || '#3b82f6' }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="block text-[11px] font-medium text-foreground group-hover:text-primary truncate">
                            {m.nombre}
                          </span>
                          {(m.marca || m.modelo) && (
                            <span className="block text-[9.5px] text-muted-foreground/70 truncate">
                              {[m.marca, m.modelo].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary/50 shrink-0" />
                      </button>
                      <button
                        onClick={(e) => handleDirectDelete(e, m)}
                        disabled={deletingId === m.id}
                        title={`Eliminar ${m.nombre}`}
                        className="flex items-center justify-center w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                      >
                        {deletingId === m.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 bg-card/80 flex items-center justify-center rounded-xl">
                <div className="flex items-center gap-2 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm font-medium">Vinculando...</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step: Confirm delete */}
        {step === 'confirming' && selectedMachine && (
          <div className="px-4 py-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Vinculación exitosa</p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-semibold text-primary">{selectedMachine.nombre}</span> vinculada a{' '}
                  <span className="font-semibold">{sapNodeName}</span>
                </p>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50">
              <p className="text-xs text-foreground font-medium">
                {repuestosCount > 0
                  ? `Se encontraron ${repuestosCount} repuesto${repuestosCount !== 1 ? 's' : ''} en la máquina manual.`
                  : 'La máquina manual no tiene repuestos cargados.'
                }
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {repuestosCount > 0
                  ? 'Los repuestos seguirán accesibles a través del equipo SAP vinculado.'
                  : ''
                }
              </p>
            </div>

            <div className="bg-amber-500/5 rounded-lg px-3 py-2.5 border border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-300">¿Eliminar la máquina manual?</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    "{selectedMachine.nombre}" ya no aparecerá como equipo manual independiente.
                    {repuestosCount > 0 && ' Sus repuestos se mantendrán vinculados al equipo SAP.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleSkipDelete}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Mantener máquina
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Eliminar máquina manual
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && selectedMachine && (
          <div className="px-4 py-5 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Listo</p>
              <p className="text-xs text-muted-foreground mt-1">
                {sapNodeName} vinculado con los repuestos de {selectedMachine.nombre}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="mt-2 px-4 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
