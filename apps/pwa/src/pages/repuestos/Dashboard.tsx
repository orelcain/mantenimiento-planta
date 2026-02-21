import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus, FileText, Upload, FolderTree, Package, ClipboardList, ImageIcon, DollarSign, Wrench } from 'lucide-react'
import { RepuestosTable } from '@/components/repuestos/RepuestosTable'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { RepuestosFilters } from '@/components/repuestos/RepuestosFilters'
import { RepuestosPagination } from '@/components/repuestos/RepuestosPagination'
import { EmptyState } from '@/components/repuestos/EmptyState'
import { MachineAccordionNav } from '@/components/repuestos/MachineAccordionNav'
import { MachineHierarchySelector } from '@/components/repuestos/MachineHierarchySelector'
import { RepuestoPhotosModal } from '@/components/repuestos/RepuestoPhotosModal'
import { RepuestoManualModal } from '@/components/repuestos/RepuestoManualModal'
import { TechnicalSpecsModal } from '@/components/repuestos/TechnicalSpecsModal'
import { useRepuestos } from '@/hooks/repuestos/useRepuestos'
import { useRepuestosCounts } from '@/hooks/repuestos/useRepuestosCounts'
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories'
import { useToast } from '@/hooks/useToast'
import { useMachineContext, useCurrentMachine } from '@/contexts/MachineContext'
import { useIsAdmin } from '@/store/authStore'
import type { Repuesto, RepuestoFormData, TechnicalSpecs, MachineImage } from '@/types/repuestos'
import { CategoryManager } from '@/components/repuestos/CategoryManager'
import { ImportRepuestosModal } from './ImportRepuestosModal'
import { ExportReportModal } from '@/components/repuestos/ExportReportModal'
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

export function RepuestosDashboard() {
  const { machines, loading: machinesLoading, setCurrentMachineDirect } = useMachineContext()
  const currentMachine = useCurrentMachine()
  const isAdmin = useIsAdmin()
  const { categories } = useMachineCategories()
  const { toast } = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Repuesto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Repuesto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [photoModal, setPhotoModal] = useState<Repuesto | null>(null)
  const [manualModal, setManualModal] = useState<Repuesto | null>(null)
  const [specsTarget, setSpecsTarget] = useState<{repuesto: Repuesto, tab: 'specs' | 'gallery'} | null>(null)
  const [newMachineOpen, setNewMachineOpen] = useState(false)
  const [structureManagerOpen, setStructureManagerOpen] = useState(false)
  const [exportReportOpen, setExportReportOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>('maquinas-principales')

  // Filtros y paginación
  const [searchQuery, setSearchQuery] = useState('')
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
  } = useRepuestos(currentMachine?.id || 'baader-200')

  const handleSaveSpecs = async (repuestoId: string, specs: TechnicalSpecs, gallery: MachineImage[]) => {
    try {
      await updateRepuesto(repuestoId, { technicalSpecs: specs, gallery: gallery });
      toast({
        title: 'Ficha técnica actualizada',
        description: 'Los cambios se han guardado correctamente.',
      });
    } catch (err) {
      console.error('Error saving specs:', err);
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: 'No se pudieron guardar los cambios en la ficha técnica.',
      });
      throw err;
    }
  }

  // Calcular conteos de repuestos por máquina para el navegador
  // Usa getCountFromServer (aggregation) para obtener conteos reales de todas las máquinas
  const { counts: repuestosCounts } = useRepuestosCounts(machines)

  // Filtrar repuestos — Búsqueda mejorada incluye código fabricante
  const filteredRepuestos = useMemo(() => {
    let filtered = [...repuestos]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((r) => {
        return (
          r.codigoSAP?.toLowerCase().includes(query) ||
          r.textoBreve?.toLowerCase().includes(query) ||
          r.descripcion?.toLowerCase().includes(query) ||
          r.codigoBaader?.toLowerCase().includes(query) ||
          r.ubicacionEnPlanta?.toLowerCase().includes(query)
        )
      })
    }

    return filtered
  }, [repuestos, searchQuery])

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
  }, [searchQuery, pageSize])

  const handleClearFilters = () => {
    setSearchQuery('')
  }

  const handleOpenExportReport = () => {
    setExportReportOpen(true)
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
      toast({ title: 'Error', description: message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (payload: RepuestoFormData) => {
    if (!editTarget) return
    setSaving(true)
    try {
      await updateRepuesto(editTarget.id, { ...payload }, editTarget)
      toast({
        title: 'Repuesto actualizado',
        description: 'Los cambios han sido guardados exitosamente.',
        variant: 'success',
      })
      setEditTarget(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el repuesto.'
      toast({ title: 'Error', description: message, variant: 'destructive' })
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
      toast({ title: 'Error', description: message, variant: 'destructive' })
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
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-5 overflow-x-hidden overflow-y-auto">
        {/* Page title + global actions */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground">Catálogo de Repuestos</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Selecciona un equipo para ver su listado</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <Button onClick={() => setStructureManagerOpen(true)} variant="outline" size="sm" className="gap-2 hidden sm:flex">
                  <FolderTree className="h-4 w-4" /> Estructura
                </Button>
                <Button onClick={() => setNewMachineOpen(true)} variant="outline" size="sm" className="gap-2 hidden sm:flex">
                  <Plus className="h-4 w-4" /> Nuevo equipo
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Accordion Navigator: Categoría → Máquina */}
        <MachineAccordionNav
          repuestosCounts={repuestosCounts}
          onCategoryChange={setSelectedCategoryId}
        />
        {/* ═══ Detalle de la máquina seleccionada ═══ */}
        <div className="border-t border-border/40 pt-4">
        {/* Machine Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (currentMachine.color || '#3b82f6') + '20' }}>
              <Wrench className="h-5 w-5" style={{ color: currentMachine.color || '#3b82f6' }} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
                {currentMachine.nombre}
              </h2>
              <p className="text-xs text-muted-foreground">
                {[currentMachine.marca, currentMachine.modelo].filter(Boolean).join(' · ') || 'Catálogo de repuestos'}
                {repuestos.length > 0 && <span className="ml-1.5 text-muted-foreground/70">— {repuestos.length} repuestos</span>}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
             <div className="flex items-center gap-2 w-full sm:w-auto">
                {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none gap-2" title="Importar">
                  <Upload className="h-4 w-4" />
                  <span className="sm:inline">Importar</span>
                </Button>
                )}
                
                <div className="hidden sm:flex gap-2">
                   <Button variant="outline" size="sm" onClick={handleOpenExportReport} className="gap-2" title="Centro de Exportación / Reportes">
                      <FileText className="h-4 w-4" /> Exportar / Reportes
                   </Button>
                </div>

                {isAdmin && (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="flex-1 sm:flex-none gap-2">
                  <Plus className="h-4 w-4" />
                  <span className="truncate">Repuesto</span>
                </Button>
                )}
             </div>
             
             {/* Mobile extra options */}
             <div className="flex flex-col sm:hidden w-full gap-2">
               <div className="flex w-full gap-2">
                  <Button variant="outline" size="sm" onClick={handleOpenExportReport} className="flex-1 gap-1" title="Reportes">
                    <FileText className="h-3 w-3" /> <span className="text-xs">Reportes</span>
                  </Button>
               </div>
               {isAdmin && (
                 <div className="flex w-full gap-2">
                     <Button onClick={() => setStructureManagerOpen(true)} className="flex-1 gap-1" variant="outline" size="sm">
                      <FolderTree className="h-3 w-3" />
                      <span className="text-xs">Estructura</span>
                    </Button>
                     <Button onClick={() => setNewMachineOpen(true)} className="flex-1 gap-1" variant="outline" size="sm">
                      <Plus className="h-3 w-3" />
                      <span className="text-xs">Equipo</span>
                    </Button>
                 </div>
               )}
             </div>
          </div>
        </div>

        {/* KPI Summary Cards — Catálogo puro */}
        {(() => {
          const totalRepuestos = repuestos.length
          const conFicha = repuestos.filter(r => r.technicalSpecs).length
          const conFotoManual = repuestos.filter(r => (r.fotosReales?.length || 0) + (r.imagenesManual?.length || 0) + (r.gallery?.length || 0) > 0).length
          const valorReferencial = repuestos.reduce((sum, r) => sum + ((r.cantidadPorMaquina || 1) * (r.valorUnitario || 0)), 0)
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Total repuestos */}
              <div className="bg-card border rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Total</p>
                  <p className="text-xl font-bold text-foreground">{totalRepuestos}</p>
                </div>
              </div>
              {/* Con ficha técnica */}
              <div className="bg-card border rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <ClipboardList className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Con ficha</p>
                  <p className="text-xl font-bold text-emerald-500">{conFicha}</p>
                </div>
              </div>
              {/* Con foto / manual */}
              <div className="bg-card border rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <ImageIcon className="h-5 w-5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Con foto</p>
                  <p className="text-xl font-bold text-amber-500">{conFotoManual}</p>
                </div>
              </div>
              {/* Valor referencial */}
              <div className="bg-card border rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <DollarSign className="h-5 w-5 text-violet-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Valor ref.</p>
                  <p className="text-lg font-bold text-foreground">${valorReferencial.toLocaleString('es-CL')}</p>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Error Display */}
        {repuestosError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {repuestosError}
          </div>
        )}

        {/* Content Area */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Catálogo de repuestos</span>
              <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                {filteredRepuestos.length === repuestos.length
                  ? `${repuestos.length} items`
                  : `${filteredRepuestos.length} de ${repuestos.length}`}
              </span>
            </div>
          </div>

          <RepuestosFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClearFilters={handleClearFilters}
          />

          {filteredRepuestos.length === 0 ? (
            <EmptyState
              hasFilters={searchQuery !== ''}
              onClearFilters={handleClearFilters}
            />
          ) : (
            <>
              <RepuestosTable
                repuestos={paginatedRepuestos}
                loading={repuestosLoading}
                machineId={currentMachine?.id}
                onEdit={isAdmin ? (rep) => setEditTarget(rep) : undefined}
                onDelete={isAdmin ? (rep) => setConfirmDelete(rep) : undefined}
                onViewPhotos={(rep) => setPhotoModal(rep)}
                onViewManual={(rep) => setManualModal(rep)}
                onViewSpecs={(rep) => setSpecsTarget({ repuesto: rep, tab: 'specs' })}
                onViewGallery={(rep) => setSpecsTarget({ repuesto: rep, tab: 'gallery' })}
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
        </div>{/* cierre border-t detail section */}
      </div>

      {/* Create Modal */}
      <RepuestoFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        machineName={currentMachine.nombre}
        onSubmit={handleCreate}
        loading={saving}
      />

      {/* Edit Modal */}
      <RepuestoFormModal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        mode="edit"
        machineName={currentMachine.nombre}
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
              Esta acción no se puede deshacer. Se eliminará el repuesto del catálogo.
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

      {/* Modal de Ficha Técnica */}
      {specsTarget && (
        <TechnicalSpecsModal
          open={!!specsTarget}
          onOpenChange={(open) => !open && setSpecsTarget(null)}
          repuesto={specsTarget.repuesto}
          machineId={currentMachine?.id}
          initialTab={specsTarget.tab}
          onSave={handleSaveSpecs}
          readOnly={!isAdmin}
        />
      )}

      {/* Modal para crear nuevo equipo o subcategoría */}
      <MachineHierarchySelector
        open={newMachineOpen}
        onOpenChange={setNewMachineOpen}
        categoryId={selectedCategoryId || undefined}
        onMachineCreated={(machine) => {
          setCurrentMachineDirect(machine)
          toast({
            title: 'Equipo creado',
            description: `${machine.nombre} ha sido creado exitosamente.`,
            variant: 'success',
          })
        }}
        onSubcategoryCreated={(category) => {
          toast({
            title: 'Subcategoría creada',
            description: `${category.nombre} ha sido creada. Puedes seguir agregando equipos o más subcategorías.`,
            variant: 'success',
          })
        }}
      />

      <Dialog open={structureManagerOpen} onOpenChange={setStructureManagerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Gestión de Estructura de Planta</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
             <CategoryManager />
          </div>
        </DialogContent>
      </Dialog>
      
      <ExportReportModal 
        isOpen={exportReportOpen}
        onClose={() => setExportReportOpen(false)}
        repuestos={repuestos}
        filteredRepuestos={filteredRepuestos}
        categories={categories}
        machineName={currentMachine?.nombre}
      />
    </div>
  )
}
