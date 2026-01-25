import { useState, useRef, useEffect } from 'react'
import { Camera, X, Upload, AlertTriangle, Image as ImageIcon, Sparkles, Wand2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Textarea,
  SpeechTextarea,
  Spinner,
} from '@/components/ui'
import { useAuthStore, useAppStore } from '@/store'
import { createIncident, updateIncident } from '@/services/incidents'
import { uploadIncidentPhoto, compressImage } from '@/services/storage'
import { generateSymptoms, refineText, extractSymptomsFromDescription, isAIConfigured } from '@/services/ai'
import type { IncidentPriority, Incident, Equipment } from '@/types'
import { HierarchyLevel } from '@/types/hierarchy'
import { cn } from '@/lib/utils'
import { createIncidentSchema, validateFileList } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { HierarchySelector } from '../hierarchy/HierarchySelector'
import { useToast } from '@/hooks/useToast'

interface IncidentFormProps {
  onClose: () => void
  onSuccess: () => void
  preselectedZoneId?: string
  incident?: Incident // Para modo edición
}

const PRIORITY_OPTIONS = [
  { value: 'critica', label: '🔴 Crítica', desc: 'Detiene producción', color: 'bg-red-500' },
  { value: 'alta', label: '🟠 Alta', desc: 'Afecta operación', color: 'bg-orange-500' },
  { value: 'media', label: '🔵 Media', desc: 'Requiere atención', color: 'bg-blue-500' },
  { value: 'baja', label: '⚪ Baja', desc: 'Puede esperar', color: 'bg-gray-400' },
]

const COMMON_SYMPTOMS = [
  'Vibración', 'Ruido anormal', 'Calentamiento', 'Fuga de aceite', 
  'Fuga de agua', 'Humo', 'Olor extraño', 'No enciende', 'Se detiene solo', 'Otro'
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
    
    if (equipment) {
      setSelectedEquipment(equipment)
      setIsGeneratingSymptoms(true)
      try {
        const symptoms = await generateSymptoms(equipment)
        setAiSymptoms(symptoms)
        logger.info('Síntomas generados con IA', { equipmentId: equipment.id, count: symptoms.length })
      } catch (error) {
        logger.error('Error generando síntomas con IA', error instanceof Error ? error : new Error(String(error)))
        setAiSymptoms(COMMON_SYMPTOMS) // Fallback a síntomas estáticos
      } finally {
        setIsGeneratingSymptoms(false)
      }
    } else {
      setAiSymptoms(COMMON_SYMPTOMS)
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
      console.error('Magic Button: GROQ_API_KEY no encontrada.')
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
         console.warn('Magic Button: El texto no cambió (posible error API o texto muy corto)')
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
      
      // Comprimir imagen
      const compressed = await compressImage(file, 1920, 0.8)
      setPhotos((prev) => [...prev, compressed])
      
      // Crear preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoPreview((prev) => [...prev, reader.result as string])
      }
      reader.readAsDataURL(compressed)
    }
  }

  // Eliminar foto
  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
    setPhotoPreview((prev) => prev.filter((_, i) => i !== index))
  }

  // Enviar formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('🔍 handleSubmit llamado')
    console.log('📝 formData:', formData)
    console.log('👤 user:', user)
    console.log('✅ disabled condition:', {
      isLoading,
      noLocation: !formData.hierarchyNodeId && !formData.zoneId,
      noTitle: !formData.titulo,
      shouldBeDisabled: isLoading || (!formData.hierarchyNodeId && !formData.zoneId) || !formData.titulo
    })
    
    if (!user) {
      console.log('❌ No user, aborting')
      return
    }

    console.log('⏳ Setting loading state...')
    setIsLoading(true)
    setValidationErrors({})

    try {
      console.log('📋 Preparando datos para validación...')
      // Validar datos con Zod antes de enviar
      const dataToValidate = {
        tipo: 'correctivo' as const,
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        zoneId: formData.zoneId,
        hierarchyNodeId: formData.hierarchyNodeId,
        prioridad: formData.prioridad,
        status: 'pendiente' as const,
        fotos: [],
        reportadoPor: user.id,
        requiresValidation: true,
        ...(selectedSymptoms.length > 0 && { sintomas: selectedSymptoms }),
      }

      console.log('🔒 Validando con Zod...', dataToValidate)
      // Validar con el schema de Zod
      const validation = createIncidentSchema.safeParse(dataToValidate)
      
      if (!validation.success) {
        console.log('❌ Validación Zod falló:', validation.error.issues)
        const errors: Record<string, string> = {}
        validation.error.issues.forEach((err) => {
          const path = err.path.join('.')
          errors[path] = err.message
        })
        setValidationErrors(errors)
        logger.warn('Validation errors', { errors })
        return
      }

      console.log('✅ Validación Zod exitosa')
      logger.info('Creating incident', { titulo: formData.titulo, prioridad: formData.prioridad })
      
      // Construir objeto de incidencia sin campos undefined
      const incidentData: Omit<Incident, 'id' | 'createdAt' | 'updatedAt'> = {
        tipo: 'correctivo',
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        zoneId: formData.zoneId,
        hierarchyNodeId: formData.hierarchyNodeId || undefined,
        prioridad: formData.prioridad,
        status: 'pendiente',
        fotos: [],
        reportadoPor: user.id,
        creadoPor: user.id,
        requiresValidation: true,
      }
      
      // Solo agregar sintomas si hay seleccionados
      if (selectedSymptoms.length > 0) {
        incidentData.sintomas = selectedSymptoms
      }

      console.log('💾 Creando incidencia en Firestore...', incidentData)
      const createdIncident = await createIncident(incidentData)
      console.log('✅ Incidencia creada:', createdIncident.id)
      logger.info('Incident created successfully', { incidentId: createdIncident.id })

      // Subir fotos
      if (photos.length > 0) {
        console.log('📸 Subiendo fotos:', photos.length)
        logger.info('Uploading photos', { count: photos.length })
        await Promise.all(
          photos.map((photo) => uploadIncidentPhoto(createdIncident.id, photo))
        )
        console.log('✅ Fotos subidas')
      }

      console.log('🎉 Todo completo, llamando onSuccess()')
      onSuccess()
    } catch (error: unknown) {
      console.log('❌ ERROR CAPTURADO:', error)
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
            <div className="space-y-2">
              <Label className="text-sm font-medium">📍 Ubicación *</Label>
              <div className="border rounded-lg p-3 bg-muted/30">
                <HierarchySelector
                  value={formData.hierarchyNodeId}
                  onChange={(nodeId: string | null) => {
                    console.log('🔄 HierarchySelector onChange:', nodeId)
                    handleHierarchyChange(nodeId || undefined, undefined)
                  }}
                  minLevel={HierarchyLevel.SUB_AREA}
                  maxLevel={HierarchyLevel.ELEMENTO}
                  error={validationErrors.hierarchyNodeId}
                />
              </div>
              {validationErrors.hierarchyNodeId && (
                <p className="text-sm text-destructive mt-1">{validationErrors.hierarchyNodeId}</p>
              )}
              
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
                        <span className="truncate">{zone.nombre}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </details>
            )}
            </div>
          )}

          {/* Prioridad - Botones grandes para móvil */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">⚠️ Prioridad *</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, prioridad: opt.value as IncidentPriority })}
                  className={cn(
                    'p-3 rounded-lg border-2 text-left transition-all',
                    formData.prioridad === opt.value 
                      ? 'border-primary bg-primary/10' 
                      : 'border-muted hover:border-primary/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="titulo" className="text-sm font-medium">📝 Título *</Label>
            <Input
              id="titulo"
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              placeholder="Ej: Fuga de aceite en bomba principal"
              className="text-base" // Más grande en móvil
              required
            />
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
                      'px-3 py-1.5 rounded-full text-sm border transition-colors',
                      selectedSymptoms.includes(symptom)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 border-muted hover:border-primary/50',
                      isGeneratingSymptoms && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {symptom}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fotos - Solo en modo creación */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">📷 Fotos (máx. 5)</Label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {photoPreview.map((preview, index) => (
                  <div key={index} className="relative aspect-square">
                    <img
                      src={preview}
                      alt={`Foto ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg"
                    >
                      <X className="h-3 w-3" />
                    </button>
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
