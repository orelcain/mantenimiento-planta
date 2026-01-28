/**
 * InspectionsPage - Gestión de Rutas de Inspección
 * 
 * Permite crear y gestionar inspecciones con múltiples marcadores en un mapa.
 * Ideal para levantamientos masivos de incidencias en una sola sesión.
 */

import { useState, useEffect } from 'react'
import { 
  MapPin, 
  Plus, 
  Calendar, 
  FileText, 
  Trash2,
  AlertTriangle,
  Camera,
  Download,
  CheckCircle2
} from 'lucide-react'
import { 
  Button, 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  SpeechTextarea,
  Spinner,
  Badge
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import { 
  getInspectionsByUser, 
  createInspection, 
  addInspectionItem,
  deleteInspectionItem,
  finalizeInspection,
  getInspectionItems,
  getMapLocations,
  getLatestMapVersion
} from '@/services/maps'
import { MapViewer } from '@/components/maps'
import type { 
  Inspection, 
  InspectionItem, 
  MapLocation, 
  MapVersion,
  CreateInspectionDTO,
  CreateInspectionItemDTO
} from '@/types/maps'

export function InspectionsPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()
  
  // Estados principales
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [locations, setLocations] = useState<MapLocation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Modal de nueva inspección
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newInspectionName, setNewInspectionName] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [isCreating, setIsCreating] = useState(false)
  
  // Inspección activa (para agregar items)
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null)
  const [activeMapVersion, setActiveMapVersion] = useState<MapVersion | null>(null)
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>([])
  
  // Modal para agregar item
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false)
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemDescription, setNewItemDescription] = useState('')
  const [isAddingItem, setIsAddingItem] = useState(false)
  
  // Cargar inspecciones y ubicaciones al montar
  useEffect(() => {
    if (user) {
      loadData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])
  
  const loadData = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const [inspectionsData, locationsData] = await Promise.all([
        getInspectionsByUser(user.id),
        getMapLocations()
      ])
      setInspections(inspectionsData)
      setLocations(locationsData)
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los datos'
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  // Crear nueva inspección
  const handleCreateInspection = async () => {
    if (!user || !newInspectionName.trim() || !selectedLocationId) return
    
    setIsCreating(true)
    try {
      const location = locations.find(l => l.id === selectedLocationId)
      const mapVersion = await getLatestMapVersion(selectedLocationId)
      
      if (!mapVersion) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Esta ubicación no tiene mapas cargados'
        })
        return
      }
      
      const data: CreateInspectionDTO = {
        nombre: newInspectionName.trim(),
        locationId: selectedLocationId,
        locationName: location?.nombre || '',
        mapVersionId: mapVersion.id,
        createdBy: user.id,
        createdByName: user.nombre || user.email
      }
      
      const inspection = await createInspection(data)
      setInspections(prev => [inspection, ...prev])
      setIsCreateModalOpen(false)
      setNewInspectionName('')
      setSelectedLocationId('')
      
      // Abrir la inspección recién creada
      handleOpenInspection(inspection)
      
      toast({
        title: 'Inspección creada',
        description: 'Ahora puedes agregar marcadores en el mapa'
      })
    } catch (error) {
      console.error('Error creating inspection:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo crear la inspección'
      })
    } finally {
      setIsCreating(false)
    }
  }
  
  // Abrir inspección para agregar items
  const handleOpenInspection = async (inspection: Inspection) => {
    try {
      const [items, mapVersion] = await Promise.all([
        getInspectionItems(inspection.id),
        getLatestMapVersion(inspection.locationId)
      ])
      
      setActiveInspection(inspection)
      setActiveMapVersion(mapVersion)
      setInspectionItems(items)
    } catch (error) {
      console.error('Error opening inspection:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo abrir la inspección'
      })
    }
  }
  
  // Cuando se hace clic en el mapa
  const handleMapClick = (position: { x: number; y: number }) => {
    if (!activeInspection || activeInspection.status === 'finalizado') return
    
    setPendingPosition(position)
    setIsAddItemModalOpen(true)
  }
  
  // Agregar item a la inspección
  const handleAddItem = async () => {
    if (!activeInspection || !pendingPosition || !newItemTitle.trim()) return
    
    setIsAddingItem(true)
    try {
      const data: CreateInspectionItemDTO = {
        inspectionId: activeInspection.id,
        title: newItemTitle.trim(),
        description: newItemDescription.trim(),
        position: pendingPosition,
        order: inspectionItems.length + 1
      }
      
      const item = await addInspectionItem(data)
      setInspectionItems(prev => [...prev, item])
      
      // Resetear modal
      setIsAddItemModalOpen(false)
      setPendingPosition(null)
      setNewItemTitle('')
      setNewItemDescription('')
      
      toast({
        title: `Punto #${item.order} agregado`,
        description: newItemTitle.trim()
      })
    } catch (error) {
      console.error('Error adding item:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo agregar el punto'
      })
    } finally {
      setIsAddingItem(false)
    }
  }
  
  // Eliminar item
  const handleDeleteItem = async (itemId: string) => {
    if (!activeInspection) return
    
    try {
      await deleteInspectionItem(activeInspection.id, itemId)
      setInspectionItems(prev => prev.filter(i => i.id !== itemId))
      toast({
        title: 'Punto eliminado'
      })
    } catch (error) {
      console.error('Error deleting item:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el punto'
      })
    }
  }
  
  // Finalizar inspección
  const handleFinalizeInspection = async () => {
    if (!activeInspection || inspectionItems.length === 0) return
    
    try {
      await finalizeInspection(activeInspection.id, inspectionItems.length)
      
      // Actualizar estado local
      setActiveInspection(prev => prev ? { ...prev, status: 'finalizado' } : null)
      setInspections(prev => 
        prev.map(i => i.id === activeInspection.id ? { ...i, status: 'finalizado' as const, totalItems: inspectionItems.length } : i)
      )
      
      toast({
        title: 'Inspección finalizada',
        description: `${inspectionItems.length} puntos registrados`
      })
    } catch (error) {
      console.error('Error finalizing inspection:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo finalizar la inspección'
      })
    }
  }
  
  // Cerrar panel de inspección activa
  const handleCloseInspection = () => {
    setActiveInspection(null)
    setActiveMapVersion(null)
    setInspectionItems([])
    loadData() // Recargar lista
  }
  
  // Exportar a PDF (placeholder - se implementará con jsPDF)
  const handleExportPDF = () => {
    toast({
      title: 'Exportando PDF...',
      description: 'Esta función estará disponible próximamente'
    })
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  
  // Vista de inspección activa
  if (activeInspection && activeMapVersion) {
    return (
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {activeInspection.nombre}
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeInspection.locationName} • {inspectionItems.length} puntos
            </p>
          </div>
          <div className="flex gap-2">
            {activeInspection.status === 'en_progreso' && (
              <Button
                variant="outline"
                onClick={handleFinalizeInspection}
                disabled={inspectionItems.length === 0}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Finalizar
              </Button>
            )}
            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button variant="ghost" onClick={handleCloseInspection}>
              Cerrar
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Mapa */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {activeInspection.status === 'en_progreso' ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Click en el mapa para agregar puntos
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Inspección finalizada
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <MapViewer
                  imageUrl={activeMapVersion.imageUrl}
                  markers={inspectionItems.map(item => ({
                    id: item.id,
                    position: item.position,
                    title: item.title,
                    inspectionIndex: item.order
                  }))}
                  editable={activeInspection.status === 'en_progreso'}
                  onPositionSelect={handleMapClick}
                  className="h-[500px] rounded-b-lg"
                />
              </CardContent>
            </Card>
          </div>
          
          {/* Lista de items */}
          <div>
            <Card className="h-[550px] flex flex-col">
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-sm">Puntos de Inspección</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-2">
                {inspectionItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MapPin className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Sin puntos aún</p>
                    <p className="text-xs">Click en el mapa para agregar</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {inspectionItems.map((item) => (
                      <div 
                        key={item.id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                            {item.order}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.title}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                            )}
                          </div>
                          {activeInspection.status === 'en_progreso' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Modal para agregar item */}
        <Dialog open={isAddItemModalOpen} onOpenChange={setIsAddItemModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {inspectionItems.length + 1}
                </div>
                Nuevo Punto de Inspección
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="Ej: Piso dañado, Tubería con fuga..."
                  autoFocus
                />
              </div>
              
              <div className="space-y-2">
                <Label>Descripción (opcional)</Label>
                <SpeechTextarea
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  placeholder="Detalles adicionales..."
                  rows={3}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddItemModalOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleAddItem}
                disabled={!newItemTitle.trim() || isAddingItem}
              >
                {isAddingItem && <Spinner className="h-4 w-4 mr-2" />}
                Agregar Punto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
  
  // Vista principal - Lista de inspecciones
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Rutas de Inspección
          </h1>
          <p className="text-muted-foreground">
            Registra múltiples incidencias en una sola sesión de inspección
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} disabled={locations.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Inspección
        </Button>
      </div>
      
      {/* Alerta si no hay ubicaciones */}
      {locations.length === 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="font-medium">No hay mapas configurados</p>
              <p className="text-sm text-muted-foreground">
                Un administrador debe cargar mapas antes de crear inspecciones
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Lista de inspecciones */}
      {inspections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Sin inspecciones</p>
            <p className="text-sm">Crea tu primera ruta de inspección</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {inspections.map((inspection) => (
            <Card 
              key={inspection.id} 
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => handleOpenInspection(inspection)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{inspection.nombre}</CardTitle>
                  <Badge variant={inspection.status === 'finalizado' ? 'default' : 'secondary'}>
                    {inspection.status === 'finalizado' ? 'Completada' : 'En Progreso'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {inspection.locationName}
                  </div>
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    {inspection.totalItems || 0} puntos
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {inspection.createdAt.toLocaleDateString('es-CL')}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Modal para crear inspección */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Ruta de Inspección</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de la Inspección *</Label>
              <Input
                value={newInspectionName}
                onChange={(e) => setNewInspectionName(e.target.value)}
                placeholder="Ej: Inspección Planta - Turno Mañana"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Ubicación / Mapa *</Label>
              <div className="grid gap-2">
                {locations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => setSelectedLocationId(location.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedLocationId === location.id 
                        ? 'border-primary bg-primary/10' 
                        : 'border-muted hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium">{location.nombre}</div>
                    {location.descripcion && (
                      <div className="text-xs text-muted-foreground">{location.descripcion}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateInspection}
              disabled={!newInspectionName.trim() || !selectedLocationId || isCreating}
            >
              {isCreating && <Spinner className="h-4 w-4 mr-2" />}
              Crear Inspección
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default InspectionsPage
