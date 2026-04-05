import { useEffect, useMemo, useState, useRef } from 'react'
import { AlertTriangle, Plus, FileText, Upload, Package, Wrench, ArrowRightLeft, Copy as CopyDuplicateIcon, Globe, ExternalLink, Search, X, WifiOff, Star } from 'lucide-react'
import { RepuestosTable } from '@/components/repuestos/RepuestosTable'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { RepuestosPagination } from '@/components/repuestos/RepuestosPagination'
import { EmptyState } from '@/components/repuestos/EmptyState'
import { EquipmentNavigator, type SelectedEquipmentInfo } from '@/components/repuestos/EquipmentNavigator'
import { RepuestoPhotosModal } from '@/components/repuestos/RepuestoPhotosModal'
import { RepuestoManualModal } from '@/components/repuestos/RepuestoManualModal'
import { TechnicalSpecsModal } from '@/components/repuestos/TechnicalSpecsModal'
import { RepuestoGalleryModal } from '@/components/repuestos/RepuestoGalleryModal'
import { RepuestoDetailModal } from '@/components/repuestos/RepuestoDetailModal'

import { ManualSearchModal } from '@/components/repuestos/ManualSearchModal'
import { MachineManualPanel } from '@/components/repuestos/MachineManualPanel'
import { useRepuestos } from '@/hooks/repuestos/useRepuestos'
import { useRepuestosCounts } from '@/hooks/repuestos/useRepuestosCounts'
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories'
import { useToast } from '@/hooks/useToast'
import { useMachineContext, useCurrentMachine } from '@/contexts/MachineContext'
import { useAuthStore, useIsAdmin } from '@/store/authStore'
import type { Repuesto, RepuestoFormData, TechnicalSpecs, MachineImage } from '@/types/repuestos'
// CategoryManager ahora se renderiza dentro de EquipmentNavigator
import { ImportRepuestosModal } from './ImportRepuestosModal'
import { ExportReportModal } from '@/components/repuestos/ExportReportModal'
import { RelocateRepuestoModal } from '@/components/repuestos/RelocateRepuestoModal'
import { BulkRelocateModal } from '@/components/repuestos/BulkRelocateModal'
import { DuplicatesModal } from '@/components/repuestos/DuplicatesModal'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
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

interface RepuestosDashboardProps {
  /** ID de máquina a auto-seleccionar al montar (viene desde BuscadorGlobal → "Ver en equipo") */
  jumpMachineId?: string | null
  /** Llamado una vez que el jumpMachineId fue consumido, para limpiar el dot indicator */
  onJumpConsumed?: () => void
  /** Llamado cuando el usuario quiere buscar en todas las máquinas con una query */
  onSearchSimilar?: (query: string) => void
}

export function RepuestosDashboard({
  jumpMachineId,
  onJumpConsumed,
  onSearchSimilar,
}: RepuestosDashboardProps = {}) {
  const { machines, loading: machinesLoading, setCurrentMachine } = useMachineContext()
  const currentMachine = useCurrentMachine()
  const currentUser = useAuthStore((state) => state.user)
  const isAdmin = useIsAdmin()
  const { categories } = useMachineCategories()
  const { toast } = useToast()
  const isOnline = useOnlineStatus()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Repuesto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Repuesto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [photoModal, setPhotoModal] = useState<Repuesto | null>(null)
  const [manualModal, setManualModal] = useState<Repuesto | null>(null)
  const [specsTarget, setSpecsTarget] = useState<Repuesto | null>(null)
  const [galleryTarget, setGalleryTarget] = useState<Repuesto | null>(null)
  const [exportReportOpen, setExportReportOpen] = useState(false)
  const [manualSearchTarget, setManualSearchTarget] = useState<Repuesto | null>(null)
  const [viewInManualTarget, setViewInManualTarget] = useState<Repuesto | null>(null)
  const [relocateTarget, setRelocateTarget] = useState<Repuesto | null>(null)
  const [bulkRelocateOpen, setBulkRelocateOpen] = useState(false)
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<Repuesto | null>(null)
  const [highlightedRepuestoId, setHighlightedRepuestoId] = useState<string | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingHighlightRef = useRef<string | null>(null)
  const hasHydratedPrefsRef = useRef(false)
  const [, setSelectedCategoryId] = useState<string | null>('maquinas-principales')
  const [selectedEquipmentInfo, setSelectedEquipmentInfo] = useState<SelectedEquipmentInfo | null>(null)
  const equipmentDetailRef = useRef<HTMLDivElement | null>(null)
  const [favMachines, setFavMachines] = useState<Map<string, { nombre: string; equipmentId: string }>>(new Map())

  // Scroll al detalle del equipo cuando se selecciona
  useEffect(() => {
    if (selectedEquipmentInfo && equipmentDetailRef.current) {
      setTimeout(() => {
        equipmentDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [selectedEquipmentInfo])

  // Filtros, ordenamiento y paginación
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTipo, setFilterTipo] = useState<string | null>(null)
  const [kpiFilter, setKpiFilter] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const {
    repuestos,
    loading: repuestosLoading,
    error: repuestosError,
    createRepuesto,
    updateRepuesto,
    deleteRepuesto,
    importCatalogoDesdeExcel,
    relocateRepuesto,
    bulkRelocateRepuestos,
  } = useRepuestos(currentMachine?.id || null)

  const handleSaveSpecs = async (repuestoId: string, specs: TechnicalSpecs, _gallery: MachineImage[]) => {
    try {
      await updateRepuesto(repuestoId, { technicalSpecs: specs });
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

  const handleSaveGallery = async (repuestoId: string, gallery: MachineImage[]) => {
    try {
      await updateRepuesto(repuestoId, { gallery });
      toast({
        title: 'Galería actualizada',
        description: 'Las imágenes se han guardado correctamente.',
      });
    } catch (err) {
      console.error('Error saving gallery:', err);
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: 'No se pudieron guardar los cambios en la galería.',
      });
      throw err;
    }
  }

  // Calcular conteos de repuestos por máquina para el navegador
  // Usa getCountFromServer (aggregation) para obtener conteos reales de todas las máquinas
  const { counts: repuestosCounts } = useRepuestosCounts(machines)

  const dashboardPrefsKey = useMemo(
    () => `repuestos-dashboard-prefs:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id]
  )

  // Hidratar preferencias locales por usuario
  useEffect(() => {
    try {
      const raw = localStorage.getItem(dashboardPrefsKey)
      if (!raw) {
        hasHydratedPrefsRef.current = true
        return
      }

      const prefs = JSON.parse(raw) as {
        searchQuery?: string
        filterTipo?: string | null
        pageSize?: number
      }

      if (typeof prefs.searchQuery === 'string') setSearchQuery(prefs.searchQuery)
      if (prefs.filterTipo !== undefined) setFilterTipo(prefs.filterTipo ?? null)
      if (typeof prefs.pageSize === 'number' && Number.isFinite(prefs.pageSize)) setPageSize(prefs.pageSize)
    } catch (err) {
      console.warn('No se pudieron restaurar preferencias del dashboard:', err)
    } finally {
      hasHydratedPrefsRef.current = true
    }
  }, [dashboardPrefsKey])

  // Persistir preferencias de uso
  useEffect(() => {
    if (!hasHydratedPrefsRef.current) return
    const payload = {
      searchQuery,
      filterTipo,
      pageSize,
      updatedAt: Date.now(),
    }
    localStorage.setItem(dashboardPrefsKey, JSON.stringify(payload))
  }, [dashboardPrefsKey, searchQuery, filterTipo, pageSize])

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
          r.codigoFabricante?.toLowerCase().includes(query) ||
          r.ubicacionEnPlanta?.toLowerCase().includes(query)
        )
      })
    }

    if (filterTipo) {
      filtered = filtered.filter(r => r.tipo === filterTipo)
    }

    if (kpiFilter === 'conSAP') {
      filtered = filtered.filter(r => !!r.codigoSAP)
    } else if (kpiFilter === 'sinSAP') {
      filtered = filtered.filter(r => !r.codigoSAP)
    } else if (kpiFilter === 'conStock') {
      filtered = filtered.filter(r => (r.cantidadPorMaquina || 0) > 0)
    } else if (kpiFilter === 'conFicha') {
      filtered = filtered.filter(r => r.technicalSpecs)
    } else if (kpiFilter === 'conFoto') {
      filtered = filtered.filter(r => (r.fotosReales?.length || 0) + (r.imagenesManual?.length || 0) + (r.gallery?.length || 0) > 0)
    }

    return filtered
  }, [repuestos, searchQuery, filterTipo, kpiFilter])

  // Tipos únicos ordenados por frecuencia (sobre todos los repuestos, no el filtrado)
  const tiposDisponibles = useMemo(() => {
    const freq: Record<string, number> = {}
    for (const r of repuestos) {
      if (r.tipo) {
        freq[r.tipo] = (freq[r.tipo] || 0) + 1
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo]) => tipo)
  }, [repuestos])

  // Ordenar repuestos
  const sortedRepuestos = useMemo(() => {
    if (!sortColumn) return filteredRepuestos
    const sorted = [...filteredRepuestos]
    const dir = sortDirection === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      let va: string | number = ''
      let vb: string | number = ''
      switch (sortColumn) {
        case 'codigoSAP':
          va = a.codigoSAP || ''
          vb = b.codigoSAP || ''
          break
        case 'textoBreve':
          va = a.textoBreve || ''
          vb = b.textoBreve || ''
          break
        case 'codigoFabricante':
          va = a.codigoFabricante || ''
          vb = b.codigoFabricante || ''
          break
        case 'cantidadPorMaquina':
          va = a.cantidadPorMaquina || 0
          vb = b.cantidadPorMaquina || 0
          break
        case 'valorUnitario':
          va = a.valorUnitario || 0
          vb = b.valorUnitario || 0
          break
        case 'ubicacionEnPlanta':
          va = a.ubicacionEnPlanta || ''
          vb = b.ubicacionEnPlanta || ''
          break
        case 'observaciones':
          va = a.observaciones || ''
          vb = b.observaciones || ''
          break
        default:
          return 0
      }
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb, 'es') * dir
      }
      return ((va as number) - (vb as number)) * dir
    })
    return sorted
  }, [filteredRepuestos, sortColumn, sortDirection])

  const handleToggleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else {
        // Third click: clear sort
        setSortColumn(null)
        setSortDirection('asc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  // Paginar repuestos
  const paginatedRepuestos = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return sortedRepuestos.slice(startIndex, endIndex)
  }, [sortedRepuestos, currentPage, pageSize])

  const totalPages = Math.max(1, Math.ceil(sortedRepuestos.length / pageSize))

  // Reset a página 1 cuando cambien los filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterTipo, pageSize])

  const handleClearFilters = () => {
    setSearchQuery('')
    setFilterTipo(null)
    setKpiFilter(null)
  }

  /** Scroll al repuesto y resaltarlo */
  const scrollToAndHighlight = (repuestoId: string) => {
    // Primero: encontrar en qué página está el repuesto (sin filtros ni sort activos)
    const idx = repuestos.findIndex(r => r.id === repuestoId)
    if (idx >= 0) {
      const targetPage = Math.floor(idx / pageSize) + 1
      setCurrentPage(targetPage)
    }

    // Resaltar y hacer scroll (con delay para que React renderice la página correcta)
    setTimeout(() => {
      setHighlightedRepuestoId(repuestoId)
      const el = document.getElementById(`repuesto-${repuestoId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      // Limpiar highlight después de 1 minuto
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedRepuestoId(null)
      }, 60000)
    }, 150)
  }

  // ─── Efecto: cuando los repuestos terminen de cargar y haya un highlight pendiente ───
  useEffect(() => {
    if (!repuestosLoading && pendingHighlightRef.current && repuestos.length > 0) {
      const repuestoId = pendingHighlightRef.current
      pendingHighlightRef.current = null
      scrollToAndHighlight(repuestoId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repuestosLoading, repuestos])

  // ── Consumir jumpMachineId: la máquina ya fue pre-seleccionada en MachineContext
  //    Solo notificamos a RepuestosPage para que limpie el dot indicator del tab ──
  useEffect(() => {
    if (!jumpMachineId) return
    // Si por algún motivo el contexto no tiene la máquina correcta, aseguramos el cambio
    if (jumpMachineId && machines.some(m => m.id === jumpMachineId)) {
      setCurrentMachine(jumpMachineId).then(() => {
        onJumpConsumed?.()
      }).catch(() => {
        onJumpConsumed?.()
      })
    } else {
      onJumpConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpMachineId])

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

  // Rename repuesto inline (solo nombre/textoBreve)
  const handleRenameRepuesto = async (repuestoId: string, newName: string) => {
    const original = repuestos.find(r => r.id === repuestoId)
    await updateRepuesto(repuestoId, { textoBreve: newName }, original)
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

  if (machines.length === 0) {
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
        {/* Page title */}
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">Catálogo de Repuestos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Selecciona un equipo para ver su listado</p>
        </div>

        {/* Banner offline — visible solo sin conexión */}
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              Sin conexión. Los cambios se guardarán localmente y se sincronizarán cuando vuelva la red.
            </span>
          </div>
        )}

        {/* Equipment Navigator: Categoría → Subcategoría → Máquina + Admin */}
        <EquipmentNavigator
          repuestosCounts={repuestosCounts}
          onCategoryChange={setSelectedCategoryId}
          onEquipmentSelect={setSelectedEquipmentInfo}
          onFavoriteMachinesChange={setFavMachines}
        />

        {/* ═══ Chips de equipos favoritos ═══ */}
        {favMachines.size > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap border-t border-border/30 pt-3 mt-1">
            <Star className="h-3.5 w-3.5 text-yellow-400/60 shrink-0" />
            {[...favMachines.entries()].map(([machineId, info]) => {
              const isActive = currentMachine?.id === machineId
              return (
                <button
                  key={machineId}
                  onClick={() => {
                    setCurrentMachine(machineId)
                    setSelectedEquipmentInfo({ id: info.equipmentId, nombre: info.nombre, codigo: '', alias: undefined })
                  }}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-all ${
                    isActive
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/20 border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}
                >
                  {info.nombre}
                </button>
              )
            })}
          </div>
        )}

        {/* ═══ Detalle de la máquina seleccionada ═══ */}
        {!currentMachine && !selectedEquipmentInfo ? (
          <div className="border-t border-border/40 pt-8 flex flex-col items-center justify-center text-center gap-3 py-12">
            <div className="p-4 rounded-full bg-muted/50">
              <Package className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ningún equipo seleccionado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Selecciona un equipo del panel superior para ver sus repuestos</p>
            </div>
          </div>
        ) : (
        <div ref={equipmentDetailRef} className="border-t border-border/40 pt-4">
        {/* Machine Header — KPIs estilo Excel */}
        {(() => {
          const equipName = selectedEquipmentInfo
            ? (selectedEquipmentInfo.alias || selectedEquipmentInfo.nombre)
            : currentMachine?.nombre || ''
          const totalCatalogo = repuestos.length
          const conSAP = repuestos.filter(r => r.codigoSAP).length
          const conStock = repuestos.filter(r => (r.cantidadPorMaquina || 0) > 0).length
          const valorTotal = repuestos.reduce((s, r) => s + (r.valorUnitario || 0) * (r.cantidadPorMaquina || 0), 0)
          const isFav = !!currentMachine && favMachines.has(currentMachine.id)

          return (
            <div className="mb-4">
              {/* Nombre + favorito */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (currentMachine?.color || '#3b82f6') + '20' }}>
                    <Wrench className="h-5 w-5" style={{ color: currentMachine?.color || '#3b82f6' }} />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-foreground leading-tight">{equipName}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedEquipmentInfo ? (
                        <>
                          <span className="font-mono text-muted-foreground/60">{selectedEquipmentInfo.codigo}</span>
                          {selectedEquipmentInfo.alias && <span className="ml-1.5">{selectedEquipmentInfo.nombre}</span>}
                        </>
                      ) : (
                        [currentMachine?.marca, currentMachine?.modelo].filter(Boolean).join(' · ') || 'Catálogo de repuestos'
                      )}
                    </p>
                  </div>
                </div>
                {isFav && <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 shrink-0" />}
              </div>

              {/* KPI strip — interactivo (click filtra + panel desglose) */}
              {totalCatalogo > 0 && (() => {
                const sinSAP = totalCatalogo - conSAP
                const conFicha = repuestos.filter(r => r.technicalSpecs).length
                const conFoto = repuestos.filter(r => (r.fotosReales?.length || 0) + (r.imagenesManual?.length || 0) + (r.gallery?.length || 0) > 0).length
                const tiposUnicos = new Set(repuestos.map(r => r.tipo).filter(Boolean)).size
                const coberturaPct = totalCatalogo > 0 ? Math.round((conSAP / totalCatalogo) * 100) : 0

                const kpis: { key: string | null; label: string; value: string | number; color: string; accent: string }[] = [
                  { key: null, label: 'Total', value: totalCatalogo, color: 'text-foreground', accent: 'border-border/40' },
                  { key: 'conSAP', label: 'Con SAP', value: conSAP, color: 'text-blue-400', accent: 'border-blue-500/40' },
                  { key: 'sinSAP', label: 'Sin SAP', value: sinSAP, color: 'text-orange-400', accent: 'border-orange-500/40' },
                  { key: 'conStock', label: 'Con stock', value: conStock, color: 'text-emerald-400', accent: 'border-emerald-500/40' },
                  { key: 'conFicha', label: 'Con ficha', value: conFicha, color: 'text-cyan-400', accent: 'border-cyan-500/40' },
                  { key: 'conFoto', label: 'Con foto', value: conFoto, color: 'text-amber-400', accent: 'border-amber-500/40' },
                  { key: null, label: 'Tipos', value: tiposUnicos, color: 'text-indigo-400', accent: 'border-border/40' },
                  { key: null, label: 'Valor ref.', value: `$${valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, color: 'text-violet-400', accent: 'border-border/40' },
                ]

                // Desglose por tipo para el panel expandido
                const tipoFreq: Record<string, number> = {}
                const sourceItems = kpiFilter ? filteredRepuestos : repuestos
                for (const r of sourceItems) { tipoFreq[r.tipo || 'SIN TIPO'] = (tipoFreq[r.tipo || 'SIN TIPO'] || 0) + 1 }
                const tipoEntries = Object.entries(tipoFreq).sort((a, b) => b[1] - a[1])

                return (
                  <>
                    {/* Barra cobertura SAP */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[9px] text-muted-foreground uppercase shrink-0">Cobertura SAP</span>
                      <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${coberturaPct >= 50 ? 'bg-emerald-500' : coberturaPct >= 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${coberturaPct}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${coberturaPct >= 50 ? 'text-emerald-400' : coberturaPct >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
                        {coberturaPct}%
                      </span>
                    </div>

                    {/* KPIs grid */}
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                      {kpis.map(k => {
                        const isActive = k.key !== null && kpiFilter === k.key
                        const isClickable = k.key !== null
                        return (
                          <button
                            key={k.label}
                            onClick={() => isClickable ? setKpiFilter(kpiFilter === k.key ? null : k.key) : undefined}
                            className={[
                              'rounded-lg px-2 py-1.5 text-left transition-all',
                              isActive ? `bg-primary/10 border-2 ${k.accent} ring-1 ring-primary/20` : 'bg-muted/15 border border-border/40',
                              isClickable ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default',
                            ].join(' ')}
                          >
                            <p className={`text-sm sm:text-base font-bold tabular-nums leading-tight ${isActive ? 'text-primary' : k.color}`}>{k.value}</p>
                            <p className="text-[7px] sm:text-[8px] text-muted-foreground uppercase leading-tight">{k.label}</p>
                          </button>
                        )
                      })}
                    </div>

                    {/* Panel desglose — visible cuando hay filtro KPI activo */}
                    {kpiFilter && (
                      <div className="mt-2 bg-muted/10 border border-border/40 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                            Desglose: {kpis.find(k => k.key === kpiFilter)?.label} ({filteredRepuestos.length} de {totalCatalogo})
                          </p>
                          <button onClick={() => setKpiFilter(null)} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/30">
                            Cerrar
                          </button>
                        </div>
                        {tipoEntries.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {tipoEntries.slice(0, 15).map(([tipo, count]) => (
                              <span key={tipo} className="text-[9px] px-2 py-0.5 rounded-full bg-muted/30 border border-border/30 text-muted-foreground tabular-nums">
                                {tipo} <strong className="text-foreground">{count}</strong>
                              </span>
                            ))}
                            {tipoEntries.length > 15 && (
                              <span className="text-[9px] text-muted-foreground/50 px-1 py-0.5">+{tipoEntries.length - 15} más</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )
        })()}

        <div className="flex flex-wrap items-center gap-2 mb-4">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5" title="Importar">
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Importar</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleOpenExportReport} className="gap-1.5" title="Exportar / Reportes">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Exportar</span>
            </Button>
            {isAdmin && repuestos.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setBulkRelocateOpen(true)} className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300" title="Reubicar repuestos masivamente">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Reubicar</span>
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setDuplicatesOpen(true)} className="gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300" title="Detectar y fusionar duplicados">
                <CopyDuplicateIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Duplicados</span>
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                <span className="text-xs">Repuesto</span>
              </Button>
            )}
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={`Buscar en ${selectedEquipmentInfo ? (selectedEquipmentInfo.alias || selectedEquipmentInfo.nombre) : currentMachine?.nombre || 'equipo'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title="Limpiar búsqueda local"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* "Buscar en todas" — sólo cuando hay query y el módulo tiene BuscadorGlobal vinculado */}
            {searchQuery.trim() && onSearchSimilar && (
              <button
                onClick={() => onSearchSimilar(searchQuery.trim())}
                title="Buscar esta pieza en todas las máquinas"
                className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/15 transition-colors whitespace-nowrap"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Buscar en todas</span>
                <ExternalLink className="h-3 w-3 sm:hidden" />
              </button>
            )}
          </div>

          {/* Chips de filtro por tipo */}
          {tiposDisponibles.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-nowrap">
              <button
                onClick={() => setFilterTipo(null)}
                className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
                  filterTipo === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                Todos
              </button>
              {tiposDisponibles.slice(0, 12).map((tipo) => (
                <button
                  key={tipo}
                  onClick={() => setFilterTipo(filterTipo === tipo ? null : tipo)}
                  className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
                    filterTipo === tipo
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
          )}

          {(searchQuery || filterTipo || kpiFilter) && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="text-xs gap-1.5">
                <X className="h-3.5 w-3.5" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>

        {/* KPIs eliminados — unificados en el header de equipo arriba */}

        {/* Machine Manuals Panel — only admins */}
        {isAdmin && currentMachine && (
          <MachineManualPanel machine={currentMachine} className="mt-3" />
        )}
        {isAdmin && !currentMachine && selectedEquipmentInfo && (
          <MachineManualPanel
            storageId={selectedEquipmentInfo.id}
            displayName={selectedEquipmentInfo.alias || selectedEquipmentInfo.nombre}
            className="mt-3"
          />
        )}

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

          {filteredRepuestos.length === 0 ? (
            <EmptyState
              hasFilters={searchQuery !== '' || filterTipo !== null || kpiFilter !== null}
              onClearFilters={handleClearFilters}
            />
          ) : (
            <>
              <RepuestosTable
                repuestos={paginatedRepuestos}
                loading={repuestosLoading}
                machineId={currentMachine?.id}
                isAdmin={isAdmin}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggleSort={handleToggleSort}
                onEdit={isAdmin ? (rep) => setEditTarget(rep) : undefined}
                onDelete={isAdmin ? (rep) => setConfirmDelete(rep) : undefined}
                onViewPhotos={(rep) => setPhotoModal(rep)}
                onViewManual={(rep) => setManualModal(rep)}
                onViewSpecs={(rep) => setSpecsTarget(rep)}
                onViewGallery={(rep) => setGalleryTarget(rep)}
                onRenameRepuesto={isAdmin ? handleRenameRepuesto : undefined}
                onSearchInManual={currentMachine ? (rep) => setManualSearchTarget(rep) : undefined}
                onViewInManual={currentMachine ? (rep) => setViewInManualTarget(rep) : undefined}
                onEditAnnotation={isAdmin && currentMachine ? (rep) => setViewInManualTarget(rep) : undefined}
                onRelocate={isAdmin && currentMachine ? (rep) => setRelocateTarget(rep) : undefined}
                onViewDetail={(rep) => setDetailTarget(rep)}
                highlightedRepuestoId={highlightedRepuestoId}
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
        )}
      </div>

      {/* Create Modal */}
      <RepuestoFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        machineName={currentMachine?.nombre ?? ''}
        onSubmit={handleCreate}
        loading={saving}
      />

      {/* Edit Modal */}
      <RepuestoFormModal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        mode="edit"
        machineName={currentMachine?.nombre ?? ''}
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
        machineName={currentMachine?.nombre ?? ''}
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
          repuesto={specsTarget}
          machineId={currentMachine?.id}
          onSave={handleSaveSpecs}
          readOnly={!isAdmin}
        />
      )}

      {/* Modal de Galería */}
      {galleryTarget && (
        <RepuestoGalleryModal
          open={!!galleryTarget}
          onOpenChange={(open) => !open && setGalleryTarget(null)}
          repuesto={galleryTarget}
          machineId={currentMachine?.id}
          onSave={handleSaveGallery}
          readOnly={!isAdmin}
        />
      )}
      
      {/* Modal de Búsqueda en Manual */}
      {manualSearchTarget && currentMachine && (
        <ManualSearchModal
          open={!!manualSearchTarget}
          onOpenChange={(open) => !open && setManualSearchTarget(null)}
          machine={currentMachine}
          repuesto={manualSearchTarget}
          isAdmin={isAdmin}
        />
      )}

      {/* Modal de Ver en Manual (con vínculo guardado) */}
      {viewInManualTarget && currentMachine && (
        <ManualSearchModal
          open={!!viewInManualTarget}
          onOpenChange={(open) => !open && setViewInManualTarget(null)}
          machine={currentMachine}
          repuesto={viewInManualTarget}
          initialVinculo={viewInManualTarget.vinculosManual?.find(v => v.machineId === currentMachine?.id) ?? viewInManualTarget.vinculosManual?.[0]}
          isAdmin={isAdmin}
        />
      )}

      <ExportReportModal 
        isOpen={exportReportOpen}
        onClose={() => setExportReportOpen(false)}
        repuestos={repuestos}
        filteredRepuestos={filteredRepuestos}
        categories={categories}
        machineName={currentMachine?.nombre}
      />

      {/* Modal Reubicar Individual */}
      {relocateTarget && currentMachine && (
        <RelocateRepuestoModal
          open={!!relocateTarget}
          onOpenChange={(o) => !o && setRelocateTarget(null)}
          repuesto={relocateTarget}
          currentMachine={currentMachine}
          machines={machines}
          onRelocate={relocateRepuesto}
          onSuccess={() => {
            setRelocateTarget(null)
            toast({ title: 'Repuesto reubicado', description: 'El repuesto fue movido a la nueva máquina.' })
          }}
        />
      )}

      {/* Modal Reubicar Masivo */}
      {bulkRelocateOpen && currentMachine && (
        <BulkRelocateModal
          open={bulkRelocateOpen}
          onOpenChange={setBulkRelocateOpen}
          repuestos={repuestos}
          currentMachine={currentMachine}
          machines={machines}
          onBulkRelocate={bulkRelocateRepuestos}
          onSuccess={() => {
            setBulkRelocateOpen(false)
            toast({ title: 'Reubicación masiva completada', description: 'Los repuestos fueron movidos a la nueva máquina.' })
          }}
        />
      )}

      {/* Modal Duplicados */}
      <DuplicatesModal
        open={duplicatesOpen}
        onOpenChange={setDuplicatesOpen}
        machines={machines}
        onDone={() => {
          toast({ title: 'Duplicados gestionados', description: 'Los repuestos duplicados fueron fusionados exitosamente.' })
        }}
      />

      {/* Modal Ficha completa de repuesto */}
      {detailTarget && (
        <RepuestoDetailModal
          open={!!detailTarget}
          onOpenChange={(open) => !open && setDetailTarget(null)}
          repuesto={detailTarget}
          machineName={currentMachine?.nombre}
        />
      )}
    </div>
  )
}
