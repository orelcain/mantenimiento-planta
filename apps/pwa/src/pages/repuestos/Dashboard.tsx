import { useEffect, useMemo, useState, useRef, type KeyboardEvent } from 'react'
import { AlertTriangle, Plus, FileText, Upload, Package, ClipboardList, ImageIcon, DollarSign, Wrench, ArrowRightLeft, Copy as CopyDuplicateIcon, Globe, Camera, ExternalLink, RotateCw, Search, X, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { RepuestosTable } from '@/components/repuestos/RepuestosTable'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { RepuestosPagination } from '@/components/repuestos/RepuestosPagination'
import { EmptyState } from '@/components/repuestos/EmptyState'
import { EquipmentNavigator } from '@/components/repuestos/EquipmentNavigator'
import { RepuestoPhotosModal } from '@/components/repuestos/RepuestoPhotosModal'
import { RepuestoManualModal } from '@/components/repuestos/RepuestoManualModal'
import { TechnicalSpecsModal } from '@/components/repuestos/TechnicalSpecsModal'
import { RepuestoGalleryModal } from '@/components/repuestos/RepuestoGalleryModal'
import { RepuestoDetailModal } from '@/components/repuestos/RepuestoDetailModal'
import { MachineManualPanel } from '@/components/repuestos/MachineManualPanel'
import { ManualSearchModal } from '@/components/repuestos/ManualSearchModal'
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
import { useGlobalSearch } from '@/hooks/repuestos/useGlobalSearch'
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
  const { machines, loading: machinesLoading, setCurrentMachine } = useMachineContext()
  const currentMachine = useCurrentMachine()
  const currentUser = useAuthStore((state) => state.user)
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
  const [specsTarget, setSpecsTarget] = useState<Repuesto | null>(null)
  const [galleryTarget, setGalleryTarget] = useState<Repuesto | null>(null)
  const [exportReportOpen, setExportReportOpen] = useState(false)
  const [manualSearchTarget, setManualSearchTarget] = useState<Repuesto | null>(null)
  const [viewInManualTarget, setViewInManualTarget] = useState<Repuesto | null>(null)
  const [relocateTarget, setRelocateTarget] = useState<Repuesto | null>(null)
  const [bulkRelocateOpen, setBulkRelocateOpen] = useState(false)
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<Repuesto | null>(null)
  const [globalSearchMode, setGlobalSearchMode] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalIndexedAt, setGlobalIndexedAt] = useState<number | null>(null)
  const [globalIndexNow, setGlobalIndexNow] = useState<number>(Date.now())
  const [manualReindexing, setManualReindexing] = useState(false)
  const [highlightedRepuestoId, setHighlightedRepuestoId] = useState<string | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingHighlightRef = useRef<string | null>(null)
  const globalInputRef = useRef<HTMLInputElement | null>(null)
  const globalResultsRef = useRef<HTMLDivElement | null>(null)
  const [selectedGlobalResultIndex, setSelectedGlobalResultIndex] = useState(-1)
  const [manualsExpanded, setManualsExpanded] = useState(false)
  const hasHydratedPrefsRef = useRef(false)
  const [, setSelectedCategoryId] = useState<string | null>('maquinas-principales')

  // Filtros, ordenamiento y paginación
  const [searchQuery, setSearchQuery] = useState('')
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
  } = useRepuestos(currentMachine?.id || 'baader-200')

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

  // ─── Búsqueda Global cross-machine ───
  const globalSearch = useGlobalSearch(machines)

  // Precargar búsqueda global al entrar al dashboard (sin esperar abrir el panel)
  const { loadAll: globalLoadAll, loaded: globalLoaded, loading: globalLoading } = globalSearch
  useEffect(() => {
    if (machines.length > 0 && !globalLoaded && !globalLoading) {
      globalLoadAll()
    }
  }, [machines.length, globalLoaded, globalLoading, globalLoadAll])

  // Marcar hora de última indexación global exitosa
  useEffect(() => {
    if (globalLoaded && !globalLoading) {
      setGlobalIndexedAt(Date.now())
    }
  }, [globalLoaded, globalLoading, globalSearch.allRepuestos.length])

  const globalIndexedAtLabel = useMemo(() => {
    if (!globalIndexedAt) return null
    return new Date(globalIndexedAt).toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [globalIndexedAt])

  // Refresca el "hace X" cada 30s para mantener el estado vivo
  useEffect(() => {
    const interval = setInterval(() => setGlobalIndexNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

  const globalIndexedAgoLabel = useMemo(() => {
    if (!globalIndexedAt) return null
    const diffMs = Math.max(0, globalIndexNow - globalIndexedAt)
    const seconds = Math.floor(diffMs / 1000)
    if (seconds < 10) return 'justo ahora'
    if (seconds < 60) return `hace ${seconds} segundos`
    const minutes = Math.floor(seconds / 60)
    if (minutes === 1) return 'hace 1 minuto'
    if (minutes < 60) return `hace ${minutes} minutos`
    const hours = Math.floor(minutes / 60)
    if (hours === 1) return 'hace 1 hora'
    return `hace ${hours} horas`
  }, [globalIndexedAt, globalIndexNow])

  const globalResults = useMemo(() => {
    if (!globalQuery.trim()) return []
    return globalSearch.search(globalQuery)
  }, [globalQuery, globalSearch])

  const displayedGlobalResults = useMemo(() => globalResults.slice(0, 50), [globalResults])

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
        globalQuery?: string
        searchQuery?: string
        pageSize?: number
      }

      if (typeof prefs.globalQuery === 'string') setGlobalQuery(prefs.globalQuery)
      if (typeof prefs.searchQuery === 'string') setSearchQuery(prefs.searchQuery)
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
      globalQuery,
      searchQuery,
      pageSize,
      updatedAt: Date.now(),
    }
    localStorage.setItem(dashboardPrefsKey, JSON.stringify(payload))
  }, [dashboardPrefsKey, globalQuery, searchQuery, pageSize])

  // Estado visual del panel global: se muestra solo con query
  useEffect(() => {
    setGlobalSearchMode(globalQuery.trim().length > 0)
  }, [globalQuery])

  // Selección por teclado: reset cuando cambia el set de resultados
  useEffect(() => {
    if (!globalQuery.trim() || displayedGlobalResults.length === 0) {
      setSelectedGlobalResultIndex(-1)
      return
    }
    setSelectedGlobalResultIndex((prev) => {
      if (prev < 0) return 0
      return Math.min(prev, displayedGlobalResults.length - 1)
    })
  }, [globalQuery, displayedGlobalResults])

  // Mantener visible la fila seleccionada con flechas
  useEffect(() => {
    if (selectedGlobalResultIndex < 0) return
    const row = document.getElementById(`global-result-${selectedGlobalResultIndex}`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedGlobalResultIndex])

  const handleGlobalInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setGlobalQuery('')
      return
    }

    if (displayedGlobalResults.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedGlobalResultIndex((prev) => {
        const next = prev < 0 ? 0 : Math.min(prev + 1, displayedGlobalResults.length - 1)
        return next
      })
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedGlobalResultIndex((prev) => {
        if (prev < 0) return 0
        return Math.max(prev - 1, 0)
      })
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const selected = displayedGlobalResults[Math.max(0, selectedGlobalResultIndex)]
      if (selected) {
        handleNavigateToResult(selected.machineId, selected.repuesto.id)
      }
    }
  }

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

    return filtered
  }, [repuestos, searchQuery])

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
  }, [searchQuery, pageSize])

  const handleClearFilters = () => {
    setSearchQuery('')
  }

  const handleManualReindexGlobal = async () => {
    if (globalLoading || manualReindexing) return
    setManualReindexing(true)
    try {
      await globalLoadAll()
      setGlobalIndexedAt(Date.now())
      toast({
        title: 'Índice global actualizado',
        description: 'Se recargaron los repuestos de todas las máquinas.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Error al reindexar',
        description: 'No se pudo recargar el índice global en este momento.',
        variant: 'destructive',
      })
    } finally {
      setManualReindexing(false)
    }
  }

  /** Navegar a la máquina del resultado global y resaltar el repuesto */
  const handleNavigateToResult = async (machineId: string, repuestoId: string) => {
    // Limpiar highlight anterior
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    setHighlightedRepuestoId(null)

    // Guardar el id pendiente — el useEffect se encargará de scroll+highlight cuando carguen los repuestos
    pendingHighlightRef.current = repuestoId

    // Cerrar búsqueda global y limpiar filtros
    setGlobalSearchMode(false)
    setGlobalQuery('')
    setSearchQuery('')
    setSortColumn(null)
    setSortDirection('asc')

    // Cambiar máquina si es diferente
    if (currentMachine?.id !== machineId) {
      await setCurrentMachine(machineId)
    } else {
      // Si ya estamos en la misma máquina, disparar el scroll directamente
      scrollToAndHighlight(repuestoId)
    }
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

        {/* Equipment Navigator: Categoría → Subcategoría → Máquina + Admin */}
        <EquipmentNavigator
          repuestosCounts={repuestosCounts}
          onCategoryChange={setSelectedCategoryId}
        />

        {/* ═══ Detalle de la máquina seleccionada ═══ */}
        {!currentMachine ? (
          <div className="border-t border-border/40 pt-8 flex flex-col items-center justify-center text-center gap-3 py-12">
            <div className="p-4 rounded-full bg-muted/50">
              <Package className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ningún equipo seleccionado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Selecciona una máquina del panel superior para ver sus repuestos</p>
            </div>
          </div>
        ) : (
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
          
          <div className="flex items-center gap-2">
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
        </div>

        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={`Buscar en ${currentMachine.nombre}...`}
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

            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={globalInputRef}
                type="text"
                placeholder="Buscar en todas las máquinas..."
                value={globalQuery}
                onChange={(e) => {
                  setGlobalQuery(e.target.value)
                }}
                onKeyDown={handleGlobalInputKeyDown}
                className="w-full pl-9 pr-9 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={globalSearch.loading}
              />
              {globalQuery && (
                <button
                  onClick={() => setGlobalQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title="Limpiar búsqueda global"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={handleManualReindexGlobal}
              disabled={globalLoading || manualReindexing || machines.length === 0}
              title="Recargar índice global"
            >
              <RotateCw className={`h-3.5 w-3.5 ${(globalLoading || manualReindexing) ? 'animate-spin' : ''}`} />
              {manualReindexing || globalLoading ? 'Reindexando...' : 'Reindexar ahora'}
            </Button>

            {searchQuery && (
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="text-xs gap-1.5">
                <X className="h-3.5 w-3.5" />
                Limpiar búsqueda local
              </Button>
            )}

            {globalLoading ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">
                Indexando repuestos globales...
              </span>
            ) : globalSearch.error ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                Error de índice global
              </span>
            ) : globalLoaded ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Índice listo · {globalSearch.allRepuestos.length} repuestos{globalIndexedAtLabel ? ` · ${globalIndexedAtLabel}` : ''}{globalIndexedAgoLabel ? ` (${globalIndexedAgoLabel})` : ''}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border">
                Índice global pendiente
              </span>
            )}
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

          {globalSearchMode && (
            <div className="space-y-2.5 p-3 bg-card border border-border rounded-xl shadow-sm">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Búsqueda Global — Todas las máquinas
                </span>
                {globalSearch.loaded && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {globalSearch.allRepuestos.length} repuestos cargados
                  </span>
                )}
                {globalIndexedAtLabel && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    Actualizado {globalIndexedAtLabel}{globalIndexedAgoLabel ? ` (${globalIndexedAgoLabel})` : ''}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Atajos: ↑ ↓ para navegar · Enter para abrir resultado · Esc para cerrar
              </p>
              {globalSearch.loading && (
                <p className="text-xs text-muted-foreground animate-pulse">Cargando repuestos de todas las máquinas...</p>
              )}
              {globalSearch.error && (
                <p className="text-xs text-destructive">{globalSearch.error}</p>
              )}
              {globalQuery.trim() && globalResults.length > 0 && (
                <div ref={globalResultsRef} className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                  <span className="text-[10px] text-muted-foreground">{globalResults.length} resultados</span>
                  {displayedGlobalResults.map((r, idx) => (
                    <div
                      id={`global-result-${idx}`}
                      key={`${r.machineId}-${r.repuesto.id}`}
                      className={`flex items-center gap-2 p-2.5 bg-background border rounded-lg hover:bg-muted/40 hover:border-primary/30 transition-colors text-sm group/result cursor-pointer ${selectedGlobalResultIndex === idx ? 'ring-2 ring-primary/40 border-primary/40 bg-primary/5' : ''}`}
                      onMouseEnter={() => setSelectedGlobalResultIndex(idx)}
                      onClick={() => handleNavigateToResult(r.machineId, r.repuesto.id)}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="font-medium truncate">{r.repuesto.textoBreve || r.repuesto.codigoSAP}</span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                          <span>SAP: {r.repuesto.codigoSAP || 'N/A'}</span>
                          {r.repuesto.codigoFabricante && <span>Fab: {r.repuesto.codigoFabricante}</span>}
                          {(r.repuesto.cantidadPorMaquina ?? 0) > 0 && (
                            <span className="text-blue-400">Cant: {r.repuesto.cantidadPorMaquina}</span>
                          )}
                        </div>
                      </div>
                      {/* Acciones rápidas */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/result:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSpecsTarget(r.repuesto) }}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          title="Ficha Técnica"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setGalleryTarget(r.repuesto) }}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-indigo-400/70 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                          title="Galería"
                        >
                          <Camera className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Máquina + flecha */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] bg-muted text-foreground px-2 py-0.5 rounded-full font-medium">
                          {r.machineName}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/50 group-hover/result:text-primary transition-colors" />
                      </div>
                    </div>
                  ))}
                  {globalResults.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Mostrando 50 de {globalResults.length} resultados. Refina tu búsqueda.
                    </p>
                  )}
                </div>
              )}
              {globalQuery.trim() && globalResults.length === 0 && globalSearch.loaded && (
                <p className="text-xs text-muted-foreground text-center py-4">No se encontraron resultados.</p>
              )}
            </div>
          )}

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
          initialVinculo={viewInManualTarget.vinculosManual?.find(v => v.machineId === currentMachine.id) ?? viewInManualTarget.vinculosManual?.[0]}
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
