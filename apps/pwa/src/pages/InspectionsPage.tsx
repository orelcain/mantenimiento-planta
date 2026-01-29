/**
 * InspectionsPage - Gestión de Rutas de Inspección
 * 
 * Permite crear y gestionar inspecciones con múltiples marcadores en un mapa.
 * Ideal para levantamientos masivos de incidencias en una sola sesión.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  MapPin, 
  Plus, 
  Calendar, 
  FileText, 
  Trash2,
  AlertTriangle,
  Camera,
  Download,
  CheckCircle2,
  Image,
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  RotateCcw
} from 'lucide-react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
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
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
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
  getLatestMapVersion,
  getMapVersionById,
  uploadInspectionItemPhotos,
  updateInspectionItem
} from '@/services/maps'
import { MapViewer } from '@/components/maps'
import { exportInspectionToPDF } from '@/utils/maps'
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
  const [newItemPhotos, setNewItemPhotos] = useState<File[]>([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])
  const [isAddingItem, setIsAddingItem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Modal de opciones PDF
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false)
  const [pdfLayout, setPdfLayout] = useState<'portrait' | 'landscape-full'>('portrait')
  
  // Modal de edición de fotos de un item existente
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemPhotos, setEditingItemPhotos] = useState<string[]>([])
  const [newPhotosForEdit, setNewPhotosForEdit] = useState<File[]>([])
  const [newPhotosPreview, setNewPhotosPreview] = useState<string[]>([])
  const [isSavingPhotos, setIsSavingPhotos] = useState(false)
  
  // Modal de imagen grande con zoom/pan
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [viewingImageIndex, setViewingImageIndex] = useState(0)
  const [viewingImageList, setViewingImageList] = useState<string[]>([])
  
  // Popup de información del marcador en el mapa
  const [selectedMarker, setSelectedMarker] = useState<InspectionItem | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  
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
  
  // Manejar selección de fotos
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    // Limitar a 5 fotos
    const newPhotos = [...newItemPhotos, ...files].slice(0, 5)
    setNewItemPhotos(newPhotos)
    
    // Crear previews
    const urls = newPhotos.map(f => URL.createObjectURL(f))
    // Revocar URLs anteriores
    photoPreviewUrls.forEach(url => URL.revokeObjectURL(url))
    setPhotoPreviewUrls(urls)
  }
  
  // Eliminar foto seleccionada
  const handleRemovePhoto = (index: number) => {
    const newPhotos = newItemPhotos.filter((_, i) => i !== index)
    setNewItemPhotos(newPhotos)
    
    URL.revokeObjectURL(photoPreviewUrls[index])
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index))
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
      
      let item = await addInspectionItem(data)
      
      // Subir fotos si hay
      if (newItemPhotos.length > 0) {
        const photoUrls = await uploadInspectionItemPhotos(
          activeInspection.id,
          item.id,
          newItemPhotos
        )
        item = { ...item, fotos: photoUrls }
      }
      
      setInspectionItems(prev => [...prev, item])
      
      // Resetear modal
      setIsAddItemModalOpen(false)
      setPendingPosition(null)
      setNewItemTitle('')
      setNewItemDescription('')
      setNewItemPhotos([])
      photoPreviewUrls.forEach(url => URL.revokeObjectURL(url))
      setPhotoPreviewUrls([])
      
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
  
  // Abrir modal de edición de fotos para un item existente
  const handleOpenEditPhotos = (item: InspectionItem) => {
    setEditingItemId(item.id)
    setEditingItemPhotos([...item.fotos])
    setNewPhotosForEdit([])
    setNewPhotosPreview([])
  }
  
  // Agregar nuevas fotos al item existente
  const handleAddPhotosToExisting = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    // Limitar total a 5
    const currentTotal = editingItemPhotos.length + newPhotosForEdit.length
    const maxNew = 5 - currentTotal
    const filesToAdd = files.slice(0, maxNew)
    
    setNewPhotosForEdit(prev => [...prev, ...filesToAdd])
    const urls = filesToAdd.map(f => URL.createObjectURL(f))
    setNewPhotosPreview(prev => [...prev, ...urls])
  }
  
  // Eliminar foto existente
  const handleRemoveExistingPhoto = (index: number) => {
    setEditingItemPhotos(prev => prev.filter((_, i) => i !== index))
  }
  
  // Eliminar foto nueva (no guardada)
  const handleRemoveNewPhoto = (index: number) => {
    URL.revokeObjectURL(newPhotosPreview[index])
    setNewPhotosForEdit(prev => prev.filter((_, i) => i !== index))
    setNewPhotosPreview(prev => prev.filter((_, i) => i !== index))
  }
  
  // Guardar cambios de fotos
  const handleSavePhotos = async () => {
    if (!activeInspection || !editingItemId) return
    
    setIsSavingPhotos(true)
    try {
      let finalPhotos = [...editingItemPhotos]
      
      // Subir nuevas fotos si hay
      if (newPhotosForEdit.length > 0) {
        const uploadedUrls = await uploadInspectionItemPhotos(
          activeInspection.id,
          editingItemId,
          newPhotosForEdit
        )
        finalPhotos = [...finalPhotos, ...uploadedUrls]
      }
      
      // Actualizar item en Firestore
      await updateInspectionItem(editingItemId, { fotos: finalPhotos })
      
      // Actualizar estado local
      setInspectionItems(prev => 
        prev.map(i => i.id === editingItemId ? { ...i, fotos: finalPhotos } : i)
      )
      
      // Cerrar modal
      setEditingItemId(null)
      newPhotosPreview.forEach(url => URL.revokeObjectURL(url))
      setNewPhotosPreview([])
      setNewPhotosForEdit([])
      
      toast({ title: 'Fotos actualizadas' })
    } catch (error) {
      console.error('Error saving photos:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron guardar las fotos'
      })
    } finally {
      setIsSavingPhotos(false)
    }
  }
  
  // Abrir visor de imagen grande con zoom/pan
  const handleViewImage = (images: string[], index: number) => {
    setViewingImageList(images)
    setViewingImageIndex(index)
    setViewingImage(images[index] || null)
  }
  
  // Navegar entre imágenes
  const handlePrevImage = () => {
    const newIndex = viewingImageIndex > 0 ? viewingImageIndex - 1 : viewingImageList.length - 1
    setViewingImageIndex(newIndex)
    setViewingImage(viewingImageList[newIndex] || null)
  }
  
  const handleNextImage = () => {
    const newIndex = viewingImageIndex < viewingImageList.length - 1 ? viewingImageIndex + 1 : 0
    setViewingImageIndex(newIndex)
    setViewingImage(viewingImageList[newIndex] || null)
  }
  
  // Handler para click en marcador del mapa
  const handleMarkerClick = useCallback((marker: { id: string }) => {
    const item = inspectionItems.find(i => i.id === marker.id)
    if (item) {
      setSelectedMarker(item)
    }
  }, [inspectionItems])
  
  // Cerrar popup al hacer click fuera
  const handleMapContainerClick = useCallback((e: React.MouseEvent) => {
    // Solo cerrar si el click es directamente en el contenedor, no en el popup
    if (selectedMarker && e.target === e.currentTarget) {
      setSelectedMarker(null)
    }
  }, [selectedMarker])
  
  // Abrir foto del popup en visor con zoom
  const handlePopupPhotoClick = (item: InspectionItem, photoIndex: number) => {
    handleViewImage(item.fotos, photoIndex)
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
  
  // Abrir modal de opciones PDF
  const handleOpenPdfOptions = () => {
    setIsPdfModalOpen(true)
  }
  
  // Exportar a PDF
  const handleExportPDF = async () => {
    if (!activeInspection || !activeMapVersion) return
    
    setIsPdfModalOpen(false)
    
    try {
      toast({
        title: 'Generando PDF...',
        description: 'Por favor espera un momento'
      })
      
      await exportInspectionToPDF({
        inspection: activeInspection,
        items: inspectionItems,
        mapVersion: activeMapVersion,
        includePhotos: inspectionItems.some(i => i.fotos.length > 0),
        includeStats: true,
        layout: pdfLayout
      })
      
      toast({
        title: 'PDF generado',
        description: 'El archivo se ha descargado'
      })
    } catch (error) {
      console.error('Error exporting PDF:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo generar el PDF'
      })
    }
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
            <Button variant="outline" onClick={handleOpenPdfOptions}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button variant="ghost" onClick={handleCloseInspection}>
              Cerrar
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Mapa con popup de marcador */}
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
              <CardContent className="p-0 relative" ref={mapContainerRef} onClick={handleMapContainerClick}>
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
                  onMarkerClick={handleMarkerClick}
                  selectedMarkerId={selectedMarker?.id}
                  className="h-[500px] rounded-b-lg"
                />
                
                {/* Popup de información del marcador */}
                {selectedMarker && (
                  <div 
                    className="absolute z-20 bg-background border rounded-lg shadow-xl p-3 max-w-xs animate-in fade-in zoom-in-95 duration-200"
                    style={{ 
                      left: '50%', 
                      top: '50%', 
                      transform: 'translate(-50%, -50%)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header del popup */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                          {selectedMarker.order}
                        </div>
                        <h3 className="font-semibold text-sm line-clamp-2">{selectedMarker.title}</h3>
                      </div>
                      <button 
                        onClick={() => setSelectedMarker(null)}
                        className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {/* Descripción */}
                    {selectedMarker.description && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-3">
                        {selectedMarker.description}
                      </p>
                    )}
                    
                    {/* Fotos del marcador */}
                    {selectedMarker.fotos.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Camera className="h-3 w-3" />
                          {selectedMarker.fotos.length} foto{selectedMarker.fotos.length > 1 ? 's' : ''} - Click para ampliar
                        </p>
                        <div className="grid grid-cols-3 gap-1">
                          {selectedMarker.fotos.slice(0, 6).map((foto, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handlePopupPhotoClick(selectedMarker, idx)}
                              className="aspect-square rounded overflow-hidden border hover:ring-2 ring-primary transition-all"
                            >
                              <img 
                                src={foto} 
                                alt={`Foto ${idx + 1}`} 
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Sin fotos adjuntas</p>
                    )}
                  </div>
                )}
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
                            
                            {/* Thumbnails de fotos */}
                            {item.fotos.length > 0 && (
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {item.fotos.slice(0, 3).map((foto, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleViewImage(item.fotos, idx)}
                                    className="w-10 h-10 rounded border overflow-hidden hover:ring-2 ring-primary transition-all"
                                  >
                                    <img src={foto} alt="" className="w-full h-full object-cover" />
                                  </button>
                                ))}
                                {item.fotos.length > 3 && (
                                  <div className="w-10 h-10 rounded border flex items-center justify-center bg-muted text-xs font-medium">
                                    +{item.fotos.length - 3}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Botón de agregar/editar fotos */}
                            {activeInspection.status === 'en_progreso' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 mt-1 text-xs"
                                onClick={() => handleOpenEditPhotos(item)}
                              >
                                <Camera className="h-3 w-3 mr-1" />
                                {item.fotos.length > 0 ? `${item.fotos.length} fotos` : 'Agregar fotos'}
                              </Button>
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
              
              {/* Fotos */}
              <div className="space-y-2">
                <Label>Fotos (máx. 5)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                
                <div className="flex flex-wrap gap-2">
                  {photoPreviewUrls.map((url, index) => (
                    <div key={index} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                      <img src={url} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(index)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  
                  {newItemPhotos.length < 5 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      <Camera className="h-5 w-5" />
                      <span className="text-[10px]">Agregar</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddItemModalOpen(false)
                setNewItemPhotos([])
                photoPreviewUrls.forEach(url => URL.revokeObjectURL(url))
                setPhotoPreviewUrls([])
              }}>
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
        
        {/* Modal de opciones PDF */}
        <Dialog open={isPdfModalOpen} onOpenChange={setIsPdfModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Opciones de Exportación PDF</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Diseño del PDF</Label>
                <Select value={pdfLayout} onValueChange={(v) => setPdfLayout(v as typeof pdfLayout)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Estándar (Vertical)</div>
                          <div className="text-xs text-muted-foreground">Mapa + tabla de puntos</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="landscape-full">
                      <div className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Mapa Grande (Horizontal)</div>
                          <div className="text-xs text-muted-foreground">Mapa ocupa página completa</div>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                {pdfLayout === 'portrait' ? (
                  <p>El informe incluirá el mapa con marcadores, estadísticas y una tabla detallada de todos los puntos.</p>
                ) : (
                  <p>El mapa con marcadores se mostrará en una página completa horizontal para mejor visualización. La tabla de puntos estará en páginas adicionales.</p>
                )}
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPdfModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleExportPDF}>
                <Download className="h-4 w-4 mr-2" />
                Generar PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Modal de edición de fotos */}
        <Dialog 
          open={!!editingItemId} 
          onOpenChange={(open) => {
            if (!open) {
              setEditingItemId(null)
              setEditingItemPhotos([])
              setNewPhotosForEdit([])
              newPhotosPreview.forEach(url => URL.revokeObjectURL(url))
              setNewPhotosPreview([])
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Editar Fotos
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Fotos existentes */}
              {editingItemPhotos.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Fotos actuales</Label>
                  <div className="flex flex-wrap gap-2">
                    {editingItemPhotos.map((url, index) => (
                      <div key={`existing-${index}`} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                        <img 
                          src={url} 
                          alt={`Foto ${index + 1}`} 
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => handleViewImage(editingItemPhotos, index)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingPhoto(index)}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Nuevas fotos */}
              {newPhotosPreview.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Nuevas fotos</Label>
                  <div className="flex flex-wrap gap-2">
                    {newPhotosPreview.map((url, index) => (
                      <div key={`new-${index}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-primary">
                        <img 
                          src={url} 
                          alt={`Nueva foto ${index + 1}`} 
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveNewPhoto(index)}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Botón agregar más */}
              <input
                id="edit-photos-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handleAddPhotosToExisting}
                className="hidden"
              />
              
              {(editingItemPhotos.length + newPhotosForEdit.length) < 5 && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => document.getElementById('edit-photos-input')?.click()}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar fotos ({5 - editingItemPhotos.length - newPhotosForEdit.length} disponibles)
                </Button>
              )}
              
              {editingItemPhotos.length === 0 && newPhotosForEdit.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Camera className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Sin fotos</p>
                  <p className="text-xs">Haz clic en el botón para agregar</p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setEditingItemId(null)
                  setEditingItemPhotos([])
                  setNewPhotosForEdit([])
                  newPhotosPreview.forEach(url => URL.revokeObjectURL(url))
                  setNewPhotosPreview([])
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleSavePhotos}
                disabled={isSavingPhotos}
              >
                {isSavingPhotos && <Spinner className="h-4 w-4 mr-2" />}
                Guardar Cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Visor de imagen grande con zoom/pan */}
        <Dialog 
          open={!!viewingImage} 
          onOpenChange={(open) => {
            if (!open) {
              setViewingImage(null)
              setViewingImageIndex(0)
              setViewingImageList([])
            }
          }}
        >
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95">
            <div className="relative h-[85vh] flex flex-col">
              {/* Controles superiores */}
              <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-black/50 text-white hover:bg-black/70"
                  onClick={() => {
                    setViewingImage(null)
                    setViewingImageIndex(0)
                    setViewingImageList([])
                  }}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Área de imagen con zoom/pan */}
              {viewingImage && (
                <TransformWrapper
                  key={viewingImage} // Reset al cambiar de imagen
                  initialScale={1}
                  minScale={0.5}
                  maxScale={5}
                  wheel={{ step: 0.1 }}
                  pinch={{ step: 5 }}
                  doubleClick={{ mode: 'toggle' }}
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                      {/* Controles de zoom */}
                      <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-black/50 rounded-lg p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white hover:bg-black/50"
                          onClick={() => zoomIn()}
                          title="Acercar"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white hover:bg-black/50"
                          onClick={() => zoomOut()}
                          title="Alejar"
                        >
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white hover:bg-black/50"
                          onClick={() => resetTransform()}
                          title="Restablecer"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Contenedor de la imagen */}
                      <TransformComponent
                        wrapperStyle={{ 
                          width: '100%', 
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        contentStyle={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <img 
                          src={viewingImage} 
                          alt="Foto ampliada" 
                          className="max-w-full max-h-[80vh] object-contain select-none"
                          draggable={false}
                        />
                      </TransformComponent>
                    </>
                  )}
                </TransformWrapper>
              )}
              
              {/* Navegación entre imágenes */}
              {viewingImageList.length > 1 && (
                <>
                  <button
                    onClick={handlePrevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 text-white rounded-full p-3 hover:bg-black/70 transition-colors"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 text-white rounded-full p-3 hover:bg-black/70 transition-colors"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                  
                  {/* Indicador de posición */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
                    {viewingImageIndex + 1} / {viewingImageList.length}
                  </div>
                </>
              )}
              
              {/* Instrucciones */}
              <div className="absolute bottom-4 right-4 z-20 text-white/60 text-xs hidden sm:block">
                Scroll o pellizcar para zoom • Arrastrar para mover • Doble click para alternar
              </div>
            </div>
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
