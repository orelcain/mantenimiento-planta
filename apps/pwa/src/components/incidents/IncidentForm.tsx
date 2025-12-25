import { useState, useRef, useEffect } from 'react'
import { Camera, X, Upload, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Textarea,
  Spinner,
} from '@/components/ui'
import { useAuthStore, useAppStore } from '@/store'
import { createIncident } from '@/services/incidents'
import { uploadIncidentPhoto, compressImage } from '@/services/storage'
import type { IncidentPriority, Incident } from '@/types'
import { cn } from '@/lib/utils'
import { createIncidentSchema, validateFileList } from '@/lib/validation'
import { logger } from '@/lib/logger'

interface IncidentFormProps {
  onClose: () => void
  onSuccess: () => void
  preselectedZoneId?: string
}

const PRIORITY_OPTIONS = [
  { value: 'critica', label: '🔴 Crítica', desc: 'Detiene producción', color: 'bg-red-500' },
  { value: 'alta', label: '🟠 Alta', desc: 'Afecta operación', color: 'bg-orange-500' },
  { value: 'media', label: '🔵 Media', desc: 'Requiere atención', color: 'bg-blue-500' },
  { value: 'baja', label: '⚪ Baja', desc: 'Puede esperar', color: 'bg-gray-400' },
]

const COMMON_SYMPTOMS = [
  'Vibración', 'Ruido anormal', 'Calentamiento', 'Fuga de aceite', 
  'Fuga de agua', 'Humo', 'Olor extraño', 'No enciende', 'Se detiene solo'
]

export function IncidentForm({ onClose, onSuccess, preselectedZoneId }: IncidentFormProps) {
  const user = useAuthStore((state) => state.user)
  const { zones } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreview, setPhotoPreview] = useState<string[]>([])
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    zoneId: preselectedZoneId || '',
    prioridad: 'media' as IncidentPriority,
  })

  // Si hay zona preseleccionada, establecerla
  useEffect(() => {
    if (preselectedZoneId) {
      setFormData(prev => ({ ...prev, zoneId: preselectedZoneId }))
    }
  }, [preselectedZoneId])

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
        prioridad: formData.prioridad,
        status: 'pendiente' as const,
        fotos: [],
        reportadoPor: user.id,
        requiresValidation: true,
        ...(selectedSymptoms.length > 0 && { sintomas: selectedSymptoms }),
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
        prioridad: formData.prioridad,
        status: 'pendiente',
        fotos: [],
        reportadoPor: user.id,
        requiresValidation: true,
      }
      
      // Solo agregar sintomas si hay seleccionados
      if (selectedSymptoms.length > 0) {
        incidentData.sintomas = selectedSymptoms
      }

      const incident = await createIncident(incidentData)
      logger.info('Incident created successfully', { incidentId: incident.id })

      // Subir fotos
      if (photos.length > 0) {
        logger.info('Uploading photos', { count: photos.length })
        await Promise.all(
          photos.map((photo) => uploadIncidentPhoto(incident.id, photo))
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Reportar Incidencia
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Zona - Más prominente */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">📍 Ubicación *</Label>
            {zones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay zonas configuradas</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {zones.map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, zoneId: zone.id })}
                    className={cn(
                      'p-3 rounded-lg border-2 text-left transition-all',
                      formData.zoneId === zone.id 
                        ? 'border-primary bg-primary/10' 
                        : 'border-muted hover:border-primary/50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: zone.color || '#2196f3' }}
                      />
                      <span className="font-medium text-sm truncate">{zone.nombre}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {validationErrors.zoneId && (
              <p className="text-sm text-destructive mt-1">{validationErrors.zoneId}</p>
            )}
          </div>

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
                    <div className={cn('w-3 h-3 rounded-full', opt.color)} />
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
            <Label htmlFor="descripcion" className="text-sm font-medium">📋 Descripción *</Label>
            <Textarea
              id="descripcion"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Describe el problema con detalle..."
              rows={3}
              className="text-base"
              required
            />
            {validationErrors.descripcion && (
              <p className="text-sm text-destructive mt-1">{validationErrors.descripcion}</p>
            )}
          </div>

          {/* Síntomas - Chips seleccionables */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">🔍 Síntomas (opcional)</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_SYMPTOMS.map((symptom) => (
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
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    selectedSymptoms.includes(symptom)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 border-muted hover:border-primary/50'
                  )}
                >
                  {symptom}
                </button>
              ))}
            </div>
          </div>

          {/* Fotos - Botón grande para cámara */}
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square border-2 border-dashed border-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/30"
                >
                  <Camera className="h-8 w-8" />
                  <span className="text-xs mt-1">Tomar foto</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
              capture="environment"
            />
          </div>

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
                disabled={isLoading || !formData.zoneId || !formData.titulo}
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
