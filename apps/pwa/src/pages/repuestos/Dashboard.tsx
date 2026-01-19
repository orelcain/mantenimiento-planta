import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { RepuestosTable } from '@/components/repuestos/RepuestosTable'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { useMachines } from '@/hooks/repuestos/useMachines'
import { useRepuestos } from '@/hooks/repuestos/useRepuestos'
import { useTags } from '@/hooks/repuestos/useTags'
import type { Machine, Repuesto, RepuestoFormData } from '@/types/repuestos'
import { isTagAsignado } from '@/types/repuestos'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingScreen,
} from '@/components/ui'

const getStockTotal = (repuesto: Repuesto) => {
  const stockFromTags = Array.isArray(repuesto.tags)
    ? repuesto.tags.reduce((sum, tag) => {
        if (isTagAsignado(tag) && tag.tipo === 'stock') return sum + (tag.cantidad || 0)
        return sum
      }, 0)
    : 0
  return stockFromTags > 0 ? stockFromTags : repuesto.cantidadStockBodega || 0
}

const getSolicitudTotal = (repuesto: Repuesto) => {
  const solicitudFromTags = Array.isArray(repuesto.tags)
    ? repuesto.tags.reduce((sum, tag) => {
        if (isTagAsignado(tag) && tag.tipo === 'solicitud') return sum + (tag.cantidad || 0)
        return sum
      }, 0)
    : 0
  return solicitudFromTags > 0 ? solicitudFromTags : repuesto.cantidadSolicitada || 0
}

export function RepuestosDashboard() {
  const { machines, loading: machinesLoading, error: machinesError } = useMachines()
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Repuesto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Repuesto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (selectedMachineId) return
    if (machines.length === 0) return
    const active = machines.find((m) => m.activa)
    setSelectedMachineId((active || machines[0]).id)
  }, [machines, selectedMachineId])

  const selectedMachine: Machine | null = useMemo(
    () => machines.find((m) => m.id === selectedMachineId) || null,
    [machines, selectedMachineId]
  )

  const {
    repuestos,
    loading: repuestosLoading,
    error: repuestosError,
    createRepuesto,
    updateRepuesto,
    deleteRepuesto,
  } = useRepuestos(selectedMachineId)

  const { tags, loading: tagsLoading, error: tagsError } = useTags(repuestos, selectedMachineId)

  const stats = useMemo(() => {
    const total = repuestos.length
    const withStock = repuestos.filter((r) => getStockTotal(r) > 0).length
    const withSolicitud = repuestos.filter((r) => getSolicitudTotal(r) > 0).length
    const valorStock = repuestos.reduce((sum, r) => sum + getStockTotal(r) * (r.valorUnitario || 0), 0)
    return { total, withStock, withSolicitud, valorStock }
  }, [repuestos])

  const handleCreate = async (payload: RepuestoFormData) => {
    if (!selectedMachineId) return
    setSaving(true)
    setActionError(null)
    try {
      await createRepuesto(payload)
      setCreateOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el repuesto.'
      setActionError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (payload: RepuestoFormData) => {
    if (!editTarget) return
    setSaving(true)
    setActionError(null)
    try {
      await updateRepuesto(editTarget.id, { ...payload, tags: payload.tags }, editTarget)
      setEditTarget(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el repuesto.'
      setActionError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    setActionError(null)
    try {
      await deleteRepuesto(confirmDelete.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar el repuesto.'
      setActionError(message)
    } finally {
      setConfirmDelete(null)
      setDeletingId(null)
    }
  }

  if (machinesLoading) return <LoadingScreen />

  if (!selectedMachineId) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Repuestos</h1>
        <p className="text-muted-foreground">No hay máquinas configuradas aún.</p>
        {machinesError ? <p className="text-sm text-destructive">{machinesError}</p> : null}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Repuestos</h1>
          <p className="text-muted-foreground">
            Catálogo por máquina con inventario, tags y visibilidad en tiempo real.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="machine-select">
              Máquina
            </label>
            <select
              id="machine-select"
              className="min-w-[220px] rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={selectedMachineId || ''}
              onChange={(e) => setSelectedMachineId(e.target.value)}
            >
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.nombre}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="w-full md:w-auto">
            <Plus className="h-4 w-4" />
            Nuevo repuesto
          </Button>
        </div>
      </div>

      {selectedMachine ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Repuestos" value={stats.total.toLocaleString('es-CL')} subtle={selectedMachine.nombre} />
          <StatCard label="Con stock" value={stats.withStock.toLocaleString('es-CL')} />
          <StatCard label="Con solicitudes" value={stats.withSolicitud.toLocaleString('es-CL')} />
          <StatCard label="Valor de stock" value={`$${stats.valorStock.toLocaleString('es-CL')}`} />
        </div>
      ) : null}

      {(machinesError || repuestosError || tagsError || actionError) && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {machinesError || repuestosError || tagsError || actionError}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">Listado de repuestos</span>
            <span className="text-xs text-muted-foreground">
              {repuestos.length} elementos — ordenados por código SAP. Tags {tagsLoading ? 'cargando...' : `${tags.length}`} disponibles.
            </span>
          </div>
        </div>
        <RepuestosTable
          repuestos={repuestos}
          loading={repuestosLoading}
          onEdit={(rep) => setEditTarget(rep)}
          onDelete={(rep) => setConfirmDelete(rep)}
        />
      </div>

      <RepuestoFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        machineName={selectedMachine?.nombre}
        availableTags={tags}
        onSubmit={handleCreate}
        loading={saving}
      />

      <RepuestoFormModal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        mode="edit"
        machineName={selectedMachine?.nombre}
        availableTags={tags}
        initialData={editTarget || undefined}
        onSubmit={handleUpdate}
        loading={saving}
      />

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => (!open ? setConfirmDelete(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar repuesto</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará el repuesto y su historial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-foreground">
              ¿Seguro que deseas eliminar
              {confirmDelete ? ` "${confirmDelete.textoBreve || confirmDelete.codigoSAP}"` : ''}?
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deletingId !== null}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingId !== null}>
              {deletingId ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ label, value, subtle }: { label: string; value: string | number; subtle?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      {subtle ? <div className="text-xs text-muted-foreground">{subtle}</div> : null}
    </div>
  )
}
