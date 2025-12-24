import { useState, useRef } from 'react'
import { Camera, X, MapPin, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui'
import { useAuthStore, useAppStore } from '@/store'
import { createIncident } from '@/services/incidents'
import { uploadIncidentPhoto, compressImage } from '@/services/storage'
import type { IncidentPriority } from '@/types'

interface IncidentFormProps {
  onClose: () => void
  onSuccess: () => void
}

export function IncidentForm({ onClose, onSuccess }: IncidentFormProps) {
  const user = useAuthStore((state) => state.user)
  const { zones } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreview, setPhotoPreview] = useState<string[]>([])

  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    zoneId: '',
    prioridad: 'media' as IncidentPriority,
    sintomas: '',
  })

  // Manejar selección de fotos
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    
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

    try {
      // Crear incidencia primero para obtener ID
      const incident = await createIncident({
        tipo: 'correctivo',
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        zoneId: formData.zoneId,
        prioridad: formData.prioridad,
        status: 'pendiente',
        sintomas: formData.sintomas
          ? formData.sintomas.split(',').map((s) => s.trim())
          : undefined,
        fotos: [],
        reportadoPor: user.id,
        requiresValidation: true, // TODO: leer de configuración
      })

      // Subir fotos
      if (photos.length > 0) {
        await Promise.all(
          photos.map((photo) => uploadIncidentPhoto(incident.id, photo))
        )
      }

      onSuccess()
    } catch (error) {
      console.error('Error creating incident:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reportar Incidencia</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={formData.titulo}
              onChange={(e) =>
                setFormData({ ...formData, titulo: e.target.value })
              }
              placeholder="Ej: Fuga de aceite en bomba principal"
              required
            />
          </div>

          {/* Zona */}
          <div className="space-y-2">
            <Label htmlFor="zoneId">Zona *</Label>
            <Select
              value={formData.zoneId}
              onValueChange={(value) =>
                setFormData({ ...formData, zoneId: value })
              }
            >
              <SelectTrigger>
                <MapPin className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Seleccionar zona" />
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: zone.color || '#2196f3' }}
                      />
                      {zone.nombre}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Prioridad */}
          <div className="space-y-2">
            <Label htmlFor="prioridad">Prioridad *</Label>
            <Select
              value={formData.prioridad}
              onValueChange={(value: IncidentPriority) =>
                setFormData({ ...formData, prioridad: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critica">
                  <span className="text-destructive font-medium">Crítica</span>
                  <span className="text-muted-foreground ml-2">
                    - Detiene producción
                  </span>
                </SelectItem>
                <SelectItem value="alta">
                  <span className="text-warning font-medium">Alta</span>
                  <span className="text-muted-foreground ml-2">
                    - Afecta operación
                  </span>
                </SelectItem>
                <SelectItem value="media">
                  <span className="text-primary font-medium">Media</span>
                  <span className="text-muted-foreground ml-2">
                    - Requiere atención
                  </span>
                </SelectItem>
                <SelectItem value="baja">
                  <span className="font-medium">Baja</span>
                  <span className="text-muted-foreground ml-2">
                    - Puede esperar
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción *</Label>
            <Textarea
              id="descripcion"
              value={formData.descripcion}
              onChange={(e) =>
                setFormData({ ...formData, descripcion: e.target.value })
              }
              placeholder="Describe el problema con el mayor detalle posible..."
              rows={3}
              required
            />
          </div>

          {/* Síntomas */}
          <div className="space-y-2">
            <Label htmlFor="sintomas">Síntomas observados</Label>
            <Input
              id="sintomas"
              value={formData.sintomas}
              onChange={(e) =>
                setFormData({ ...formData, sintomas: e.target.value })
              }
              placeholder="Ej: Vibración, ruido, calentamiento (separar con comas)"
            />
          </div>

          {/* Fotos */}
          <div className="space-y-2">
            <Label>Fotos (máx. 5)</Label>
            <div className="grid grid-cols-5 gap-2">
              {photoPreview.map((preview, index) => (
                <div key={index} className="relative aspect-square">
                  <img
                    src={preview}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-full object-cover rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              
              {photos.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square border-2 border-dashed border-muted rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-xs mt-1">Agregar</span>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !formData.zoneId}>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
