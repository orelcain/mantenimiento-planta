import { useState, useEffect } from 'react'
import {
  Plus,
  Camera,
  Search,
  Grid,
  CheckCircle,
  Clock,
  AlertCircle,
  FileDown,
} from 'lucide-react'
import { Button, Input, Tabs, TabsList, TabsTrigger, Spinner } from '@/components/ui'
import {
  PhotoEvidenceCard,
  PhotoEvidenceForm,
  PhotoEvidenceDetail,
} from '@/components/photoEvidence'
import {
  subscribeToPhotoEvidences,
  getPhotoEvidenceStats,
} from '@/services/photoEvidence'
import { getUserDisplayNameMap } from '@/services/userDisplay'
import { exportPhotoEvidenceTechnicalReportToPDF } from '@/lib/pdfExport'
import type { PhotoEvidence, PhotoEvidenceStatus } from '@/types'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

type FilterStatus = 'todos' | PhotoEvidenceStatus

const STATUS_TABS: { value: FilterStatus; label: string; icon: React.ElementType }[] = [
  { value: 'todos', label: 'Todos', icon: Grid },
  { value: 'pendiente', label: 'Pendientes', icon: Clock },
  { value: 'en_proceso', label: 'En Proceso', icon: AlertCircle },
  { value: 'corregida', label: 'Corregidas', icon: CheckCircle },
  { value: 'verificada', label: 'Verificadas', icon: CheckCircle },
]

export function PhotoEvidencePage() {
  const [evidences, setEvidences] = useState<PhotoEvidence[]>([])
  const [filteredEvidences, setFilteredEvidences] = useState<PhotoEvidence[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, pendientes: 0, enProceso: 0, corregidas: 0, verificadas: 0 })
  const [userDisplayNameById, setUserDisplayNameById] = useState<Record<string, string>>({})
  
  // UI State
  const [showForm, setShowForm] = useState(false)
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)

  // Suscribirse a cambios en tiempo real
  useEffect(() => {
    setIsLoading(true)
    const unsubscribe = subscribeToPhotoEvidences((data) => {
      setEvidences(data)
      setIsLoading(false)
    })

    // Cargar estadísticas
    loadStats()

    return () => unsubscribe()
  }, [])

  // Filtrar cuando cambia el estado o búsqueda
  useEffect(() => {
    let filtered = evidences

    // Filtrar por estado
    if (filterStatus !== 'todos') {
      filtered = filtered.filter(e => e.status === filterStatus)
    }

    // Filtrar por búsqueda
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(e =>
        e.titulo.toLowerCase().includes(query) ||
        e.descripcion?.toLowerCase().includes(query) ||
        e.hierarchyPath?.toLowerCase().includes(query) ||
        e.tags?.some(t => t.toLowerCase().includes(query))
      )
    }

    setFilteredEvidences(filtered)
  }, [evidences, filterStatus, searchQuery])

  // Resolver nombres legibles (userId -> "Nombre Apellido")
  useEffect(() => {
    const ids = evidences
      .flatMap((e) => [e.reportadoPor, e.corregidoPor, e.verificadoPor])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

    if (ids.length === 0) return

    let cancelled = false
    getUserDisplayNameMap(ids)
      .then((map) => {
        if (cancelled) return
        setUserDisplayNameById((prev) => ({ ...prev, ...map }))
      })
      .catch((error) => {
        logger.error('Error resolving user display names', error instanceof Error ? error : new Error(String(error)))
      })

    return () => {
      cancelled = true
    }
  }, [evidences])

  const loadStats = async () => {
    try {
      const data = await getPhotoEvidenceStats()
      setStats(data)
    } catch (error) {
      logger.error('Error loading stats', error instanceof Error ? error : new Error(String(error)))
    }
  }

  const hasExportablePairs = (evidence: PhotoEvidence): boolean => {
    if (evidence.pairPhotos?.length) {
      for (const pp of evidence.pairPhotos) {
        if ((pp?.before?.length ?? 0) > 0 && (pp?.after?.length ?? 0) > 0) return true
      }
      return false
    }

    const max = Math.max(evidence.fotosBefore.length, evidence.fotosAfter.length)
    for (let i = 0; i < max; i++) {
      if (evidence.fotosBefore[i] && evidence.fotosAfter[i]) return true
    }
    return false
  }

  const handleExportSelected = async () => {
    if (selectedForExport.size === 0) return

    setIsExporting(true)
    try {
      // Obtener evidencias seleccionadas
      const selectedEvidences = evidences.filter(e => selectedForExport.has(e.id))

      const ids = selectedEvidences
        .flatMap((e) => [e.reportadoPor, e.corregidoPor, e.verificadoPor])
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      const nameMap = ids.length ? await getUserDisplayNameMap(ids) : {}

      const hasPairs = selectedEvidences.some(hasExportablePairs)
      if (!hasPairs) {
        alert('Las evidencias seleccionadas no tienen pares ANTES/DESPUÉS para exportar.')
        return
      }

      await exportPhotoEvidenceTechnicalReportToPDF(selectedEvidences, 'Correcciones - Reporte Individual', {
        userDisplayNameById: nameMap,
      })
      
      // Limpiar selección
      setSelectedForExport(new Set())
    } catch (error) {
      logger.error('Error exporting PDF', error instanceof Error ? error : new Error(String(error)))
      alert('Error al exportar PDF. Por favor intenta de nuevo.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportSingle = async (evidence: PhotoEvidence) => {
    setIsExporting(true)
    try {
      if (!hasExportablePairs(evidence)) {
        alert('Esta evidencia no tiene pares ANTES/DESPUÉS para exportar.')
        return
      }

      const ids = [evidence.reportadoPor, evidence.corregidoPor, evidence.verificadoPor]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      const nameMap = ids.length ? await getUserDisplayNameMap(ids) : {}

      await exportPhotoEvidenceTechnicalReportToPDF([evidence], `Correcciones - ${evidence.titulo}`, {
        userDisplayNameById: nameMap,
      })
    } catch (error) {
      logger.error('Error exporting PDF', error instanceof Error ? error : new Error(String(error)))
      alert('Error al exportar PDF. Por favor intenta de nuevo.')
    } finally {
      setIsExporting(false)
    }
  }

  const toggleSelectForExport = (evidenceId: string) => {
    const newSelected = new Set(selectedForExport)
    if (newSelected.has(evidenceId)) {
      newSelected.delete(evidenceId)
    } else {
      newSelected.add(evidenceId)
    }
    setSelectedForExport(newSelected)
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="p-4 space-y-4">
          {/* Título y acciones */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Camera className="w-6 h-6 text-primary" />
                Evidencias Fotográficas
              </h1>
              <p className="text-sm text-muted-foreground">
                Documentación visual antes y después de correcciones
              </p>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva
            </Button>
          </div>

          {/* Estadísticas rápidas */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-2 bg-muted/50 rounded-card text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="p-2 bg-amber-500/[0.15] rounded-card text-center">
              <p className="text-2xl font-bold text-ink-warn">{stats.pendientes}</p>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
            <div className="p-2 bg-green-500/[0.15] rounded-card text-center">
              <p className="text-2xl font-bold text-green-600">{stats.corregidas}</p>
              <p className="text-xs text-muted-foreground">Corregidas</p>
            </div>
            <div className="p-2 bg-cat-6-tint/[0.15] rounded-card text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.verificadas}</p>
              <p className="text-xs text-muted-foreground">Verificadas</p>
            </div>
          </div>

          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por título, ubicación o etiquetas..."
              className="pl-9"
            />
          </div>

          {/* Tabs de filtro */}
          <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
            <TabsList className="w-full grid grid-cols-5">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                  <tab.icon className="w-3.5 h-3.5 mr-1" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Acciones de selección */}
          {selectedForExport.size > 0 && (
            <div className="flex items-center justify-between p-2 bg-primary/10 rounded-card">
              <span className="text-sm font-medium">
                {selectedForExport.size} seleccionada(s)
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedForExport(new Set())}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleExportSelected}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Spinner className="w-4 h-4 mr-2" />
                  ) : (
                    <FileDown className="w-4 h-4 mr-2" />
                  )}
                  Exportar PDF
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="w-8 h-8" />
          </div>
        ) : filteredEvidences.length === 0 ? (
          <div className="text-center py-12">
            <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium text-lg mb-2">No hay evidencias</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {filterStatus !== 'todos'
                ? `No hay evidencias con estado "${filterStatus}"`
                : searchQuery
                ? 'No se encontraron resultados para tu búsqueda'
                : 'Comienza creando una nueva evidencia fotográfica'}
            </p>
            {filterStatus === 'todos' && !searchQuery && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva Evidencia
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvidences.map((evidence) => (
              <div
                key={evidence.id}
                className={cn(
                  'relative',
                  selectedForExport.has(evidence.id) && 'ring-2 ring-primary rounded-card'
                )}
              >
                {/* Checkbox de selección */}
                <button
                  className={cn(
                    'absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors',
                    selectedForExport.has(evidence.id)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-white/80 border-gray-300 hover:border-primary'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelectForExport(evidence.id)
                  }}
                >
                  {selectedForExport.has(evidence.id) && (
                    <CheckCircle className="w-4 h-4" />
                  )}
                </button>
                
                <PhotoEvidenceCard
                  evidence={evidence}
                  userDisplayNameById={userDisplayNameById}
                  onClick={() => setSelectedEvidenceId(evidence.id)}
                  onAddAfterPhotos={() => setSelectedEvidenceId(evidence.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <PhotoEvidenceForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={() => {
          loadStats()
        }}
      />

      <PhotoEvidenceDetail
        evidenceId={selectedEvidenceId}
        open={!!selectedEvidenceId}
        onClose={() => setSelectedEvidenceId(null)}
        onUpdate={() => loadStats()}
        onExportPDF={handleExportSingle}
        userDisplayNameById={userDisplayNameById}
      />
    </div>
  )
}
