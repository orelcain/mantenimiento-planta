import { useState, useRef, useEffect } from 'react'
import { Camera, X, Upload, AlertTriangle, Image as ImageIcon, Sparkles, Wand2, MapPin } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Checkbox,
  SpeechTextarea,
  Spinner,
} from '@/components/ui'
import { useAuthStore, useAppStore } from '@/store'
import { createIncident, updateIncident } from '@/services/incidents'
import { uploadIncidentPhoto, compressImage } from '@/services/storage'
import { refineText, extractSymptomsFromDescription, isAIConfigured } from '@/services/ai'
import type { IncidentPriority, Incident, Equipment } from '@/types'
import { HierarchyLevel } from '@/types/hierarchy'
import { cn } from '@/lib/utils'
import { createIncidentSchema, validateFileList } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { HierarchySelector } from '../hierarchy/HierarchySelector'
import { useToast } from '@/hooks/useToast'
import { MapLocationSelector } from '../maps/MapLocationSelector'

interface IncidentFormProps {
  onClose: () => void
  onSuccess: () => void
  preselectedZoneId?: string
  incident?: Incident // Para modo edición
}

const PRIORITY_OPTIONS = [
  { value: 'critica', label: 'Crítica', desc: 'Detiene prod.', color: 'bg-red-500', border: 'border-red-500' },
  { value: 'alta', label: 'Alta', desc: 'Afecta op.', color: 'bg-orange-500', border: 'border-orange-500' },
  { value: 'media', label: 'Media', desc: 'Atención', color: 'bg-blue-500', border: 'border-blue-500' },
  { value: 'baja', label: 'Baja', desc: 'Puede esperar', color: 'bg-zinc-500', border: 'border-zinc-500' },
]

const COMMON_SYMPTOMS = [
  'Vibración', 'Ruido anormal', 'Calentamiento', 'Fuga de aceite', 
  'Fuga de agua', 'Humo', 'Olor extraño', 'No enciende', 'Se detiene solo'
]

export function IncidentForm({ onClose, onSuccess, preselectedZoneId, incident }: IncidentFormProps) {
  const user = useAuthStore((state) => state.user)
  const { zones } = useAppStore()
  const { toast } = useToast()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreview, setPhotoPreview] = useState<string[]>([])
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [aiSymptoms, setAiSymptoms] = useState<string[]>(COMMON_SYMPTOMS)
  const [isGeneratingSymptoms, setIsGeneratingSymptoms] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [isRefining, setIsRefining] = useState(false)
  const [isRefiningTitle, setIsRefiningTitle] = useState(false)
  const [assignToSelf, setAssignToSelf] = useState(false)
  
  // Debounce ref para autogeneración de síntomas
  const symptomsDebounceRef = useRef<NodeJS.Timeout | null>(null)
  
  // Estados para "Otro" síntoma
  const [isAddingSymptom, setIsAddingSymptom] = useState(false)
  const [customSymptom, setCustomSymptom] = useState('')
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false)
  
  // Metadatos de fotos
  const [photoMeta, setPhotoMeta] = useState<{original: string, compressed: string, dim: string, format: string}[]>([])

  // Estados para ubicación en mapa físico
  const [isMapSelectorOpen, setIsMapSelectorOpen] = useState(false)
  const [mapLocation, setMapLocation] = useState<{
    locationId: string
    locationName: string
    mapVersionId: string
    position: { x: number; y: number }
    mapImageUrl?: string
  } | null>(null)

  const isEditMode = !!incident

  const [formData, setFormData] = useState({
    titulo: incident?.titulo || '',
    descripcion: incident?.descripcion || '',
    zoneId: incident?.zoneId || preselectedZoneId || '',
    hierarchyNodeId: incident?.hierarchyNodeId as string | undefined,
    prioridad: (incident?.prioridad || 'media') as IncidentPriority,
  })

  // Inicializar datos de edición
  useEffect(() => {
    if (incident) {
      setSelectedSymptoms(incident.sintomas || [])
      if (incident.fotos?.length) {
        setPhotoPreview(incident.fotos)
      }
    }
  }, [incident])

  // Si hay zona preseleccionada, establecerla
  useEffect(() => {
    if (preselectedZoneId && !isEditMode) {
      setFormData(prev => ({ ...prev, zoneId: preselectedZoneId }))
    }
  }, [preselectedZoneId, isEditMode])

  // Generar síntomas con IA cuando se selecciona nodo de jerarquía
  const handleHierarchyChange = async (nodeId: string | undefined, equipment?: Equipment) => {
    setFormData(prev => ({ ...prev, hierarchyNodeId: nodeId }))
    if (equipment) setSelectedEquipment(equipment)
     // Nota: El useEffect se encargará de regenerar síntomas
  }
  useEffect(() => {
     // Solo si hay algo de texto relevante
     if (!formData.titulo && !formData.descripcion) return
     if (!isAIConfigured()) return

     if (symptomsDebounceRef.current) clearTimeout(symptomsDebounceRef.current)

     symptomsDebounceRef.current = setTimeout(async () => {
        // Validar condiciones mínimas para no saturar API
        if (formData.titulo.length < 3 && formData.descripcion.length < 3) return

        setIsGeneratingSymptoms(true)
        try {
            const context = {
                title: formData.titulo,
                priority: formData.prioridad,
                equipmentName: selectedEquipment?.nombre,
                // Si no hay equipo seleccionado, usa el ID de jerarquía como referencia
                locationName: formData.hierarchyNodeId 
            }
            
            // Usamos description o titulo como base
            const textBase = formData.descripcion.length > formData.titulo.length ? formData.descripcion : formData.titulo
            
            const newSymptoms = await extractSymptomsFromDescription(textBase, aiSymptoms, context)
            
            if (newSymptoms.length > 0) {
                 // Combinamos evitando duplicados
                 setAiSymptoms(prev => {
                     const combined = new Set([...prev, ...newSymptoms])
                     return Array.from(combined)
                 })
            }
        } catch (e) {
            logger.error('Error generating symptoms', e instanceof Error ? e : new Error(String(e)))
        } finally {
            setIsGeneratingSymptoms(false)
        }
     }, 2000) // 2 segundos de inactividad para disparar

     return () => {
         if (symptomsDebounceRef.current) clearTimeout(symptomsDebounceRef.current)
     }
  }, [formData.titulo, formData.descripcion, formData.prioridad, selectedEquipment, formData.hierarchyNodeId, aiSymptoms])


  // Refinar título con IA (Corrección y Resumen)
  const handleRefineTitle = async () => {
    if (!formData.titulo || formData.titulo.length < 3) return
    if (!isAIConfigured()) return

    setIsRefiningTitle(true)
    try {
      // Usamos el flag isTranscriptionCleanup = false, pero dentro de refineText
      // hemos ajustado el prompt para que sea "EXTREMADAMENTE CONCISO" para títulos.
      // Ojo: Si el titulo vino de voz, puede que queramos limpiarlo primero.
      // Vamos a asumir que el usuario quiere 'Tecnificar' el título.
      const refined = await refineText(formData.titulo, false)
      setFormData(prev => ({ ...prev, titulo: refined.replace(/\.$/, '') })) 
    } catch(e) {
      logger.error('Error refining title', e instanceof Error ? e : new Error(String(e)))
    } finally {
      setIsRefiningTitle(false)
    }
  }

  // Refinar descripción con IA
  const handleRefineDescription = async () => {
    if (!formData.descripcion || formData.descripcion.length < 5) return

    if (!isAIConfigured()) {
      toast({
        variant: "destructive",
        title: "Error de configuración",
        description: "No se detectó la API Key de IA. Revisa la consola o el archivo .env.local",
      })
      logger.error('Magic Button: GROQ_API_KEY no encontrada', new Error('GROQ_API_KEY missing'))
      return
    }
    
    setIsRefining(true)
    toast({
      title: "Mejorando redacción...",
      description: "La IA está procesando tu descripción.",
    })

    try {
      // 1. Refinar texto
      const refined = await refineText(formData.descripcion)
      
      if (refined === formData.descripcion) {
         logger.warn('Magic Button: El texto no cambió (posible error API o texto muy corto)')
      }

      setFormData(prev => ({ ...prev, descripcion: refined }))
      
      // 2. Extraer síntomas con mayor contexto
      const context = {
        title: formData.titulo,
        priority: formData.prioridad,
        equipmentName: selectedEquipment?.nombre
      }
      
      const symptoms = await extractSymptomsFromDescription(refined, aiSymptoms, context)
      
      if (symptoms.length > 0) {
        // Actualizar la lista de síntomas disponibles:
        // Mantenemos los nuevos detectados + los que el usuario ya tenía seleccionados manually.
        // Esto "oculta" los anteriores que no son relevantes ni están seleccionados.
        setAiSymptoms(Array.from(new Set([...symptoms, ...selectedSymptoms])))
        
        // Seleccionarlos automáticamente (merge con los existentes)
        setSelectedSymptoms(prev => Array.from(new Set([...prev, ...symptoms])))
        
        logger.info('Síntomas extraídos automáticamente', { count: symptoms.length })
        
        toast({
          title: "¡Listo!",
          description: `Texto mejorado y ${symptoms.length} síntomas detectados.`,
        })
      } else {
         toast({
          title: "¡Listo!",
          description: "Texto mejorado correctamente.",
        })
      }
    } catch (error) {
      logger.error('Error refinando descripción', error instanceof Error ? error : new Error(String(error)))
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo conectar con el servicio de IA.",
      })
    } finally {
      setIsRefining(false)
    }
  }

  // Manejar selección de fotos
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    
    // Validar archivos con Zod
    const filesValidation = validateFileList(files)
    if (!filesValidation.valid) {
      logger.warn('File validation failed', { error: filesValidation.error })
      setValidationErrors({ fotos: filesValidation.error || 'Archivos inválidos' })
      return
    }
    
    // Limpiar error previo
    setValidationErrors((prev) => ({ ...prev, fotos: '' }))
    
    for (const file of files) {
      if (photos.length >= 5) break
      
      // Comprimir imagen (ya usa WebP por defecto en storage.ts)
      const compressed = await compressImage(file, 1920, 0.8)
      setPhotos((prev) => [...prev, compressed])
      
      // Crear preview y obtener metadatos
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setPhotoPreview((prev) => [...prev, result])
        
        // Obtener dimensiones
        const img = new Image()
        img.src = result
        img.onload = () => {
           const typeParts = compressed.type.split('/')
           setPhotoMeta(prev => [...prev, {
             original: (file.size / 1024).toFixed(0) + 'KB',
             compressed: (compressed.size / 1024).toFixed(0) + 'KB',
             format: (typeParts[1] || 'image').toUpperCase(),
             dim: `${img.width}x${img.height}`
           }])
        }
      }
      reader.readAsDataURL(compressed)
    }
  }

  // Eliminar foto
  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
    setPhotoPreview((prev) => prev.filter((_, i) => i !== index))
    setPhotoMeta((prev) => prev.filter((_, i) => i !== index))
  }

  // Enviar formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setIsLoading(true)
    setValidationErrors({})

    try {
      // Validar datos con Zod antes de enviar
      const dataToValidate = {
        tipo: 'correctivo' as const,
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        zoneId: formData.zoneId,
        hierarchyNodeId: formData.hierarchyNodeId,
        prioridad: formData.prioridad,
        status: assignToSelf ? 'en_proceso' as const : 'pendiente' as const,
        fotos: [],
        reportadoPor: user.id,
        ...(assignToSelf && { asignadoA: user.id }),
        requiresValidation: true,
        ...(selectedSymptoms.length > 0 && { sintomas: selectedSymptoms }),
      }

      if (mapLocation && (!mapLocation.locationId || !mapLocation.mapVersionId || !mapLocation.position)) {
        setValidationErrors({
          ...validationErrors,
          mapLocation: 'Selecciona una ubicación válida en el mapa.'
        })
        return
      }

      // Validar con el schema de Zod
      const validation = createIncidentSchema.safeParse(dataToValidate)
      
      if (!validation.success) {
        const errors: Record<string, string> = {}
        validation.error.issues.forEach((err) => {
          const path = err.path.join('.')
          errors[path] = err.message
        })
        setValidationErrors(errors)
        logger.warn('Validation errors', { errors })
        return
      }

      logger.info('Creating incident', { titulo: formData.titulo, prioridad: formData.prioridad })
      
      // Construir objeto de incidencia sin campos undefined
      const incidentData: Omit<Incident, 'id' | 'createdAt' | 'updatedAt'> = {
        tipo: 'correctivo',
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        zoneId: formData.zoneId,
        hierarchyNodeId: formData.hierarchyNodeId || undefined,
        prioridad: formData.prioridad,
        status: assignToSelf ? 'en_proceso' : 'pendiente',
        fotos: [],
        reportadoPor: user.id,
        creadoPor: user.id,
        ...(assignToSelf && { asignadoA: user.id, assignedBy: user.id }),
        requiresValidation: true,
        // Datos de ubicación en mapa físico
        ...(mapLocation && {
          mapLocationId: mapLocation.locationId,
          mapVersionId: mapLocation.mapVersionId,
          mapPosition: mapLocation.position
        })
      }
      
      // Solo agregar sintomas si hay seleccionados
      if (selectedSymptoms.length > 0) {
        incidentData.sintomas = selectedSymptoms
      }

      const createdIncident = await createIncident(incidentData)
      logger.info('Incident created successfully', { incidentId: createdIncident.id })

      // Subir fotos
      if (photos.length > 0) {
        logger.info('Uploading photos', { count: photos.length })
        await Promise.all(
          photos.map((photo) => uploadIncidentPhoto(createdIncident.id, photo))
        )
      }

      onSuccess()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error : new Error('Error al crear la incidencia')
      logger.error('Error creating incident', errorMessage)
      setValidationErrors({ general: 'Error al crear la incidencia. Por favor intenta de nuevo.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!incident || !user) return

    if (!formData.titulo.trim() || !formData.descripcion.trim()) {
      setValidationErrors({ general: 'Título y descripción son requeridos' })
      return
    }

    setIsLoading(true)
    setValidationErrors({})

    try {
      logger.info('Updating incident', { incidentId: incident.id })

      const updateData = {
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        prioridad: formData.prioridad,
        ...(selectedSymptoms.length > 0 && { sintomas: selectedSymptoms }),
      }

      await updateIncident(incident.id, updateData)
      logger.info('Incident updated successfully', { incidentId: incident.id })
      onSuccess()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error al actualizar la incidencia')
      logger.error('Error updating incident', err)
      setValidationErrors({ general: 'Error al actualizar. Por favor intenta de nuevo.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {isEditMode ? 'Editar Incidencia' : 'Reportar Incidencia'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={isEditMode ? handleEditSubmit : handleSubmit} className="space-y-4">
          {/* Ubicación jerárquica - Solo en modo creación */}
          {!isEditMode && (
            <div className="space-y-1">
              <Label className="text-sm font-medium">📍 Ubicación *</Label>
              
              <div 
                className="border rounded-lg p-3 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors flex items-center justify-between group"
                onClick={() => setIsLocationModalOpen(true)}
              >
                  <div className="flex flex-col gap-1 overflow-hidden">
                      {formData.hierarchyNodeId ? (
                        <div className="flex flex-col">
                             <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Ubicación Seleccionada</span>
                             <div className="text-sm font-medium text-primary flex items-center gap-1.5 truncate">
                                {/* Componente de visualización de ID o fetch del nombre */}
                                {/* Dado que solo tenemos el ID aquí, mostraremos algo genérico o el ID 
                                    (Idealmente el HierarchySelector debería pasar el objeto seleccionado o nombre) */}
                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                <span className="truncate">Confirmada (Click para cambiar)</span>
                             </div>
                        </div>
                      ) : (
                          <div className="flex items-center gap-2 text-muted-foreground group-hover:text-foreground">
                             <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <Sparkles className="h-4 w-4" />
                             </div>
                             <span className="text-sm">Tocar para seleccionar ubicación...</span>
                          </div>
                      )}
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="shrink-0">
                      Cambiar
                  </Button>
              </div>

              {validationErrors.hierarchyNodeId && (
                <p className="text-sm text-destructive mt-1">{validationErrors.hierarchyNodeId}</p>
              )}
              
              <Dialog open={isLocationModalOpen} onOpenChange={setIsLocationModalOpen}>
                  <DialogContent className="max-w-md h-[80vh] flex flex-col p-0 gap-0 z-[55]" overlayClassName="z-[55] bg-black/60">
                      <DialogHeader className="p-4 pb-2 border-b">
                          <DialogTitle>Seleccionar Ubicación</DialogTitle>
                      </DialogHeader>
                      <div className="flex-1 overflow-y-auto p-4">
                        <HierarchySelector
                            value={formData.hierarchyNodeId}
                            onChange={(nodeId: string | null) => {
                                handleHierarchyChange(nodeId || undefined, undefined)
                                // No cerramos automáticamente para permitir correcciones, el usuario cierra manual
                            }}
                            minLevel={HierarchyLevel.SUB_AREA}
                            maxLevel={HierarchyLevel.ELEMENTO}
                            error={validationErrors.hierarchyNodeId}
                        />
                      </div>
                      <div className="p-4 border-t bg-muted/20 flex justify-end">
                          <Button onClick={() => setIsLocationModalOpen(false)}>
                              Confirmar Ubicación
                          </Button>
                      </div>
                  </DialogContent>
              </Dialog>

              {/* Zonas legacy (fallback) */}
              {zones.length > 0 && !formData.hierarchyNodeId && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    O seleccionar zona legacy
                  </summary>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                  {zones.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, zoneId: zone.id })}
                      className={cn(
                        'p-2 rounded-lg border text-left transition-all text-xs',
                        formData.zoneId === zone.id 
                          ? 'border-primary bg-primary/10' 
                          : 'border-muted hover:border-primary/50'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: zone.color || '#2196f3' }}
                        />
                        <span className="truncate" title={zone.nombre}>{zone.nombre}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </details>
            )}
            </div>
          )}

          {/* Ubicación en Mapa Físico (opcional) - Solo en modo creación */}
          {!isEditMode && (
            <div className="space-y-1">
              <Label className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Marcar en Mapa (opcional)
              </Label>
              
              {mapLocation ? (
                <div className="border rounded-lg p-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <MapPin className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{mapLocation.locationName}</p>
                        <p className="text-xs text-muted-foreground">
                          Posición: ({(mapLocation.position.x * 100).toFixed(0)}%, {(mapLocation.position.y * 100).toFixed(0)}%)
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setIsMapSelectorOpen(true)}
                      >
                        Cambiar
                      </Button>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setMapLocation(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setIsMapSelectorOpen(true)}
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Seleccionar ubicación en mapa...
                </Button>
              )}
              
              <MapLocationSelector
                open={isMapSelectorOpen}
                onOpenChange={setIsMapSelectorOpen}
                onConfirm={(data) => {
                  setMapLocation(data)
                  setIsMapSelectorOpen(false)
                }}
              />
              {validationErrors.mapLocation && (
                <p className="text-sm text-destructive mt-1">{validationErrors.mapLocation}</p>
              )}
            </div>
          )}

          {/* Prioridad - Botones compactos */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">⚠️ Prioridad *</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, prioridad: opt.value as IncidentPriority })}
                  className={cn(
                    'p-2 rounded-lg border text-center transition-all flex flex-col items-center justify-center h-20 shadow-sm relative overflow-hidden',
                    formData.prioridad === opt.value 
                      ? `${opt.color} text-white border-transparent ring-2 ring-offset-1 ring-offset-background`
                      : 'bg-card border-muted hover:border-sidebar-accent hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground'
                  )}
                > 
                  {/* Highlight Glow Effect */}
                  {formData.prioridad === opt.value && (
                      <div className="absolute inset-0 bg-white/20" />
                  )}
                  
                  <div className={cn(
                      "w-3 h-3 rounded-full mb-1 transition-colors", 
                      formData.prioridad === opt.value ? "bg-white shadow-sm" : opt.color
                  )} />
                  <span className="font-semibold text-xs relative z-10">{opt.label}</span>
                  <span className={cn(
                      "text-[10px] leading-tight mt-1 relative z-10",
                      formData.prioridad === opt.value ? "text-white/90" : "text-muted-foreground"
                  )}>{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {!isEditMode && user && (
            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="assign-to-self"
                checked={assignToSelf}
                onCheckedChange={(checked) => setAssignToSelf(checked === true)}
              />
              <Label htmlFor="assign-to-self" className="text-sm">
                Asignarme esta incidencia
              </Label>
            </div>
          )}

          {/* Título con Mic y Magia */}
          <div className="space-y-2">
            <Label htmlFor="titulo" className="text-sm font-medium">📝 Título *</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <SpeechTextarea
                  id="titulo"
                  name="titulo"
                  value={formData.titulo}
                  onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Ej: Fuga de aceite..."
                  className="pr-24 resize-none overflow-hidden min-h-[40px] leading-relaxed"
                  rows={1}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRefineTitle}
                  disabled={isRefiningTitle || !formData.titulo}
                  className="absolute right-12 top-1 h-8 w-8 p-0 text-muted-foreground hover:text-primary z-10"
                  title="Mejorar título"
                >
                  {isRefiningTitle ? <Spinner size="sm" /> : <Wand2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {validationErrors.titulo && (
              <p className="text-sm text-destructive mt-1">{validationErrors.titulo}</p>
            )}
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="descripcion" className="text-sm font-medium">📋 Descripción *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRefineDescription}
                disabled={isRefining || !formData.descripcion || formData.descripcion.length < 5}
                className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
              >
                {isRefining ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Mejorando...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3 w-3 mr-1" />
                    <span>Mejorar redacción</span>
                  </>
                )}
              </Button>
            </div>
            <SpeechTextarea
              id="descripcion"
              name="descripcion"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Describe el problema con detalle... (o usa el micrófono 🎤)"
              rows={3}
              className="text-base"
              required
            />
            {validationErrors.descripcion && (
              <p className="text-sm text-destructive mt-1">{validationErrors.descripcion}</p>
            )}
          </div>

          {/* Síntomas - Solo en modo creación */}
          {!isEditMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">🔍 Síntomas (opcional)</Label>
                <div className="flex items-center gap-2">
                   {/* Botón Mágico para Síntomas */}
                   <Button
                      type="button"
                      variant="ghost" 
                      size="sm"
                      onClick={async () => {
                          setIsGeneratingSymptoms(true)
                          try {
                             const context = {
                                title: formData.titulo,
                                priority: formData.prioridad,
                                equipmentName: selectedEquipment?.nombre,
                                locationName: formData.hierarchyNodeId 
                             }
                             const textBase = formData.descripcion || formData.titulo || "Falla general"
                             const newSymptoms = await extractSymptomsFromDescription(textBase, aiSymptoms, context)
                             
                             if (newSymptoms.length > 0) {
                                setAiSymptoms(prev => Array.from(new Set([...prev, ...newSymptoms])))
                                toast({ title: "Síntomas actualizados", description: `Se detectaron ${newSymptoms.length} variantes.`})
                             } else {
                                toast({ title: "Sin novedades", description: "La IA no detectó síntomas adicionales."})
                             }
                          } finally {
                              setIsGeneratingSymptoms(false)
                          }
                      }}
                      className="h-6 px-2 text-primary hover:bg-primary/10"
                      title="Proponer variantes de síntomas"
                   >
                       <Sparkles className="h-3 w-3 mr-1" />
                       <span className="text-[10px]">Sugerir</span>
                   </Button>

                   {selectedEquipment && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {isGeneratingSymptoms ? (
                      <>
                        <Spinner size="sm" />
                        <span>Generando con IA...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span>Sugerencias IA</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
              <div className="flex flex-wrap gap-2">
                {aiSymptoms.map((symptom) => (
                  <button
                    key={symptom}
                    type="button"
                    onClick={() => {
                       setSelectedSymptoms(prev => 
                          prev.includes(symptom) 
                            ? prev.filter(s => s !== symptom)
                            : [...prev, symptom]
                        )
                    }}
                    disabled={isGeneratingSymptoms}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs border transition-colors',
                      selectedSymptoms.includes(symptom)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 border-muted hover:border-primary/50'
                    )}
                  >
                    {symptom}
                  </button>
                ))}

                {/* Síntoma "Otro" siempre disponible al final */}
                <button
                    type="button"
                    onClick={() => setIsAddingSymptom(true)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs border border-dashed transition-colors',
                       'bg-muted/30 border-muted hover:border-primary/50 text-muted-foreground'
                    )}
                >
                    Otro...
                </button>
                
                {isAddingSymptom && (
                  <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200">
                    <Input
                      autoFocus
                      value={customSymptom}
                      onChange={(e) => setCustomSymptom(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (customSymptom.trim()) {
                            setSelectedSymptoms(prev => [...prev, customSymptom.trim()])
                            setAiSymptoms(prev => [...prev, customSymptom.trim()])
                            setCustomSymptom('')
                            setIsAddingSymptom(false)
                          }
                        } else if (e.key === 'Escape') {
                           setIsAddingSymptom(false)
                        }
                      }}
                      onBlur={() => {
                         if (customSymptom.trim()) {
                            setSelectedSymptoms(prev => [...prev, customSymptom.trim()])
                            setAiSymptoms(prev => [...prev, customSymptom.trim()])
                         }
                         setCustomSymptom('')
                         setIsAddingSymptom(false)
                      }}
                      placeholder="Escribe síntoma..."
                      className="h-8 text-xs w-40"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fotos - Solo en modo creación */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">📷 Fotos (máx. 5)</Label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {photoPreview.map((preview, index) => (
                  <div key={index} className="relative aspect-square group">
                    <img
                      src={preview}
                      alt={`Foto ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg border"
                      loading="lazy"
                    />
                    {/* Botón eliminar */}
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg transform scale-75 group-hover:scale-100 transition-transform"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {/* Metadatos (overlay en hover o siempre visible pequeño) */}
                    {photoMeta[index] && (
                       <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white p-1 text-center truncate rounded-b-lg backdrop-blur-[2px] leading-tight">
                         <div className="font-semibold text-yellow-300">{photoMeta[index].compressed} ({photoMeta[index].format})</div>
                         <div className="opacity-75">{photoMeta[index].dim}</div>
                         <div className="scale-[0.8] opacity-50 line-through">{photoMeta[index].original}</div>
                       </div>
                    )}
                  </div>
                ))}
              
              {photos.length < 5 && (
                <>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/30"
                  >
                    <Camera className="h-8 w-8" />
                    <span className="text-xs mt-1">Cámara</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/30"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs mt-1">Galería</span>
                  </button>
                </>
              )}
            </div>
            
            {/* Input para cámara */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
              capture="environment"
            />
            
            {/* Input para galería */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
            />
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col gap-2 pt-4 border-t">
            {validationErrors.general && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {validationErrors.general}
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading || (!isEditMode && (!formData.hierarchyNodeId && !formData.zoneId)) || !formData.titulo}
                className="w-full sm:w-auto sm:flex-1"
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Reportar Incidencia
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
