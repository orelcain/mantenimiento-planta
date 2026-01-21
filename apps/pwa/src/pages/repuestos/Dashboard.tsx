import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus, FileSpreadsheet, FileText, Upload } from 'lucide-react'
import { RepuestosTable } from '@/components/repuestos/RepuestosTable'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { RepuestosFilters } from '@/components/repuestos/RepuestosFilters'
import { RepuestosPagination } from '@/components/repuestos/RepuestosPagination'
import { EmptyState } from '@/components/repuestos/EmptyState'
import { CategorySelector } from '@/components/repuestos/CategorySelector'
import { MachineSelector } from '@/components/repuestos/MachineSelector'
import { RepuestoPhotosModal } from '@/components/repuestos/RepuestoPhotosModal'
import { RepuestoManualModal } from '@/components/repuestos/RepuestoManualModal'
import { RepuestoHistoryModal } from '@/components/repuestos/RepuestoHistoryModal'
import { useRepuestos } from '@/hooks/repuestos/useRepuestos'
import { useTags } from '@/hooks/repuestos/useTags'
import { useToast } from '@/hooks/useToast'
import { useMachineContext, useCurrentMachine } from '@/contexts/MachineContext'
import type { Repuesto, RepuestoFormData } from '@/types/repuestos'
import { isTagAsignado, getTagNombre } from '@/types/tags'
import { ImportRepuestosModal } from './ImportRepuestosModal'
import {
  exportRepuestosToExcel,
  exportRepuestosToPDF,
} from '@/utils/repuestos'
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
  const { machines, loading: machinesLoading } = useMachineContext()
  const currentMachine = useCurrentMachine()
  const { toast } = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Repuesto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Repuesto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [photoModal, setPhotoModal] = useState<Repuesto | null>(null)
  const [manualModal, setManualModal] = useState<Repuesto | null>(null)
  const [historyModal, setHistoryModal] = useState<Repuesto | null>(null)

  // Filtro de categorías
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>('maquinas-principales')

  // Filtros y paginación
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [stockFilter, setStockFilter] = useState<'all' | 'with-stock' | 'without-stock' | 'low-stock'>('all')
  const [solicitudFilter, setSolicitudFilter] = useState<'all' | 'with-solicitud' | 'without-solicitud'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const {
    repuestos,
    loading: repuestosLoading,
    error: repuestosError,
    createRepuesto,
    updateRepuesto,
    deleteRepuesto,
    importCatalogoDesdeExcel,
    importCantidadesPorTag,
  } = useRepuestos(currentMachine?.id || 'baader-200')

  const { tags, loading: tagsLoading, error: tagsError } = useTags(repuestos, currentMachine?.id || 'baader-200')

  // Calcular conteos de máquinas por categoría
  const machineCountsByCategory = useMemo(() => {
    const counts: Record<string, number> = {}
    machines.forEach((machine) => {
      if (machine.activa) {
        const categoryId = machine.categoryId || 'maquinas-principales'
        counts[categoryId] = (counts[categoryId] || 0) + 1
      }
    })
    return counts
  }, [machines])

  // Filtrar repuestos
  const filteredRepuestos = useMemo(() => {
    let filtered = [...repuestos]

    // Búsqueda por texto
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((r) => {
        return (
          r.codigoSAP?.toLowerCase().includes(query) ||
          r.textoBreve?.toLowerCase().includes(query) ||
          r.descripcion?.toLowerCase().includes(query)
        )
      })
    }

    // Filtrar por tags
    if (selectedTags.length > 0) {
      filtered = filtered.filter((r) => {
        if (!Array.isArray(r.tags)) return false
        const repuestoTagNames = r.tags.map((t) => getTagNombre(t))
        return selectedTags.some((tagName) => repuestoTagNames.includes(tagName))
      })
    }

    // Filtrar por stock
    if (stockFilter === 'with-stock') {
      filtered = filtered.filter((r) => getStockTotal(r) > 0)
    } else if (stockFilter === 'without-stock') {
      filtered = filtered.filter((r) => getStockTotal(r) === 0)
    } else if (stockFilter === 'low-stock') {
      filtered = filtered.filter((r) => {
        const stock = getStockTotal(r)
        return stock > 0 && stock < 5
      })
    }

    // Filtrar por solicitud
    if (solicitudFilter === 'with-solicitud') {
      filtered = filtered.filter((r) => getSolicitudTotal(r) > 0)
    } else if (solicitudFilter === 'without-solicitud') {
      filtered = filtered.filter((r) => getSolicitudTotal(r) === 0)
    }

    return filtered
  }, [repuestos, searchQuery, selectedTags, stockFilter, solicitudFilter])

  // Paginar repuestos
  const paginatedRepuestos = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return filteredRepuestos.slice(startIndex, endIndex)
  }, [filteredRepuestos, currentPage, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredRepuestos.length / pageSize))

  // Reset a página 1 cuando cambien los filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedTags, stockFilter, solicitudFilter, pageSize])

  const stats = useMemo(() => {
    const total = repuestos.length
    const withStock = repuestos.filter((r) => getStockTotal(r) > 0).length
    const withSolicitud = repuestos.filter((r) => getSolicitudTotal(r) > 0).length
    const valorStock = repuestos.reduce((sum, r) => sum + getStockTotal(r) * (r.valorUnitario || 0), 0)
    return { total, withStock, withSolicitud, valorStock }
  }, [repuestos])

  // Contar repuestos por máquina para el MachineSelector
  const repuestosCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    machines.forEach(m => {
      counts[m.id] = m.id === currentMachine?.id ? repuestos.length : 0
    })
    return counts
  }, [machines, currentMachine, repuestos])

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedTags([])
    setStockFilter('all')
    setSolicitudFilter('all')
  }

  const handleExportExcel = async () => {
    try {
      await exportRepuestosToExcel(filteredRepuestos, {
        machineName: currentMachine?.nombre || 'Repuestos',
        includeTags: true,
        includeImages: true,
      })
      toast({
        title: 'Exportación exitosa',
        description: 'El archivo Excel ha sido descargado.',
        variant: 'success',
      })
    } catch (err) {
      toast({
        title: 'Error al exportar',
        description: err instanceof Error ? err.message : 'No se pudo exportar a Excel.',
        variant: 'destructive',
      })
    }
  }

  const handleExportPDF = async () => {
    try {
      await exportRepuestosToPDF(filteredRepuestos, {
        machineName: currentMachine?.nombre || 'Repuestos',
        includeStats: true,
        includeTagsDetail: true,
      })
      toast({
        title: 'Exportación exitosa',
        description: 'El archivo PDF ha sido descargado.',
        variant: 'success',
      })
    } catch (err) {
      toast({
        title: 'Error al exportar',
        description: err instanceof Error ? err.message : 'No se pudo exportar a PDF.',
        variant: 'destructive',
      })
    }
  }

  const handleImportSuccess = (message: string) => {
    toast({ title: 'Importación exitosa', description: message, variant: 'success' })
    setImportOpen(false)
  }

  const handleImportError = (message: string) => {
    toast({ title: 'Error al importar', description: message, variant: 'destructive' })
  }

  const handleCreate = async (payload: RepuestoFormData) => {
    if (!currentMachine?.id) return
    setSaving(true)
    try {
      await createRepuesto(payload)
      toast({
        title: 'Repuesto creado',
        description: 'El repuesto ha sido creado exitosamente.',
        variant: 'success',
      })
      setCreateOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el repuesto.'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (payload: RepuestoFormData) => {
    if (!editTarget) return
    setSaving(true)
    try {
      await updateRepuesto(editTarget.id, { ...payload, tags: payload.tags }, editTarget)
      toast({
        title: 'Repuesto actualizado',
        description: 'Los cambios han sido guardados exitosamente.',
        variant: 'success',
      })
      setEditTarget(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el repuesto.'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    try {
      await deleteRepuesto(confirmDelete.id)
      toast({
        title: 'Repuesto eliminado',
        description: 'El repuesto ha sido eliminado exitosamente.',
        variant: 'success',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar el repuesto.'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setConfirmDelete(null)
      setDeletingId(null)
    }
  }

  if (machinesLoading) return <LoadingScreen />

  if (!currentMachine) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Repuestos</h1>
        <p className="text-muted-foreground">No hay máquinas configuradas aún.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category Selector Tabs */}
      <CategorySelector
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        machineCountsByCategory={machineCountsByCategory}
      />

      {/* Machine Selector Tabs */}
      <MachineSelector
        repuestosCounts={repuestosCounts}
        selectedCategoryId={selectedCategoryId}
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">
            Repuestos - {currentMachine.nombre}
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2" title="Importar desde Excel">
              <Upload className="h-4 w-4" />
              Importar
            </Button>
            {/* Botones de exportación */}
            <Button variant="outline" onClick={handleExportExcel} className="gap-2" title="Exportar a Excel">
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" onClick={handleExportPDF} className="gap-2" title="Exportar catálogo a PDF">
              <FileText className="h-4 w-4" />
              PDF
            </Button>
            
            {/* Botón nuevo repuesto */}
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo repuesto
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="Repuestos" value={stats.total.toLocaleString('es-CL')} subtle={currentMachine.nombre} />
          <StatCard label="Con stock" value={stats.withStock.toLocaleString('es-CL')} />
          <StatCard label="Con solicitudes" value={stats.withSolicitud.toLocaleString('es-CL')} />
          <StatCard label="Valor de stock" value={`$${stats.valorStock.toLocaleString('es-CL')}`} />
        </div>

        {/* Error Display */}
        {(repuestosError || tagsError) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {repuestosError || tagsError}
          </div>
        )}

        {/* Content Area */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">Listado de repuestos</span>
              <span className="text-xs text-muted-foreground">
                {filteredRepuestos.length} de {repuestos.length} elementos — Tags {tagsLoading ? 'cargando...' : `${tags.length}`} disponibles.
              </span>
            </div>
          </div>

          <RepuestosFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            stockFilter={stockFilter}
            onStockFilterChange={setStockFilter}
            solicitudFilter={solicitudFilter}
            onSolicitudFilterChange={setSolicitudFilter}
            availableTags={tags}
            onClearFilters={handleClearFilters}
          />

          {filteredRepuestos.length === 0 ? (
            <EmptyState
              hasFilters={searchQuery !== '' || selectedTags.length > 0 || stockFilter !== 'all' || solicitudFilter !== 'all'}
              onClearFilters={handleClearFilters}
            />
          ) : (
            <>
              <RepuestosTable
                repuestos={paginatedRepuestos}
                loading={repuestosLoading}
                machineId={currentMachine?.id}
                onEdit={(rep) => setEditTarget(rep)}
                onDelete={(rep) => setConfirmDelete(rep)}
                onViewPhotos={(rep) => setPhotoModal(rep)}
                onViewManual={(rep) => setManualModal(rep)}
                onViewHistory={(rep) => setHistoryModal(rep)}
              />

              <RepuestosPagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredRepuestos.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <RepuestoFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        machineName={currentMachine.nombre}
        availableTags={tags}
        onSubmit={handleCreate}
        loading={saving}
      />

      {/* Edit Modal */}
      <RepuestoFormModal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        mode="edit"
        machineName={currentMachine.nombre}
        availableTags={tags}
        initialData={editTarget || undefined}
        onSubmit={handleUpdate}
        loading={saving}
      />

      {/* Delete Confirmation Dialog */}
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

      <ImportRepuestosModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={handleImportSuccess}
        onError={handleImportError}
        machineName={currentMachine.nombre}
        importCatalogoDesdeExcel={importCatalogoDesdeExcel}
        importCantidadesPorTag={importCantidadesPorTag}
      />

      {/* Modales de vista adicional */}
      {photoModal && (
        <RepuestoPhotosModal
          open={true}
          onOpenChange={(open) => !open && setPhotoModal(null)}
          fotosReales={photoModal.fotosReales || []}
          imagenesManual={photoModal.imagenesManual || []}
          repuestoName={photoModal.textoBreve || photoModal.codigoSAP || 'Repuesto'}
        />
      )}

      {manualModal && (
        <RepuestoManualModal
          open={true}
          onOpenChange={(open) => !open && setManualModal(null)}
          repuesto={manualModal}
        />
      )}

      {historyModal && (
        <RepuestoHistoryModal
          open={true}
          onOpenChange={(open) => !open && setHistoryModal(null)}
          repuesto={historyModal}
          machineId={currentMachine?.id}
        />
      )}
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
