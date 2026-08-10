import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { 
  Package, 
  MapPin, 
  AlertCircle, 
  CheckCircle2, 
  Settings, 
  XCircle, 
  Image as ImageIcon, 
  X, 
  Share2, 
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui'
import { getEquipments } from '@/services/equipment'
import { getIncidents } from '@/services/incidents'
import type { Equipment, Incident } from '@/types'
import { logger } from '@/lib/logger'

type EquipmentNote = {
  id: string
  text: string
  createdAt: string
}

type EquipmentNotesById = Record<string, EquipmentNote[]>

const safeParseJson = <T,>(raw: string | null): T | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Vista pública de equipos (sin autenticación)
 * Accesible vía QR codes para mostrar info básica de equipos
 * URL: /public/equipment/:id o /public/equipment?ids=id1,id2,id3
 */

const STATUS_CONFIG: Record<Equipment['estado'], { label: string; icon: any; className: string }> = {
  operativo: {
    label: 'Operativo',
    icon: CheckCircle2,
    className: 'text-success',
  },
  en_mantenimiento: {
    label: 'En Mantenimiento',
    icon: Settings,
    className: 'text-warning',
  },
  fuera_servicio: {
    label: 'Fuera de Servicio',
    icon: XCircle,
    className: 'text-destructive',
  },
}

const CRITICIDAD_CONFIG: Record<Equipment['criticidad'], { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'bg-destructive text-destructive-foreground' },
  media: { label: 'Media', className: 'bg-warning text-warning-foreground' },
  baja: { label: 'Baja', className: 'bg-muted text-muted-foreground' },
}

export function PublicEquipmentView() {
  const { id } = useParams<{ id: string }>()
  const [equipments, setEquipments] = useState<Equipment[]>([])
  const [incidents, setIncidents] = useState<Record<string, Incident[]>>({})
  const [notesById, setNotesById] = useState<EquipmentNotesById>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; index: number; total: number } | null>(null)

  useEffect(() => {
    const loadEquipments = async () => {
      try {
        setLoading(true)
        setError(null)

        // Obtener IDs desde URL (id único o múltiples desde query param)
        const urlParams = new URLSearchParams(window.location.search)
        const idsParam = urlParams.get('ids')
        
        let targetIds: string[] = []
        if (id) {
          targetIds = [id]
        } else if (idsParam) {
          targetIds = idsParam.split(',').filter(Boolean)
        }

        if (targetIds.length === 0) {
          setError('No se especificaron equipos para mostrar')
          return
        }

        // Cargar todos los equipos y filtrar
        const allEquipments = await getEquipments()
        const filtered = allEquipments.filter(eq => targetIds.includes(eq.id) && !eq.deleted)

        if (filtered.length === 0) {
          setError('No se encontraron los equipos especificados')
          return
        }

        setEquipments(filtered)
        
        // Cargar notas desde localStorage
        const allNotes: EquipmentNotesById = {}
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('equipment_notes_')) {
            const notesData = safeParseJson<EquipmentNotesById>(localStorage.getItem(key))
            if (notesData) {
              Object.keys(notesData).forEach(equipId => {
                if (!allNotes[equipId]) allNotes[equipId] = []
                const notes = notesData[equipId]
                if (notes && Array.isArray(notes)) {
                  allNotes[equipId].push(...notes)
                }
              })
            }
          }
        }
        setNotesById(allNotes)
        
        // Cargar últimas incidencias para cada equipo
        const incidentsData: Record<string, Incident[]> = {}
        for (const eq of filtered) {
          try {
            const eqIncidents = await getIncidents({ equipmentId: eq.id, limit: 5 })
            incidentsData[eq.id] = eqIncidents
          } catch {
            incidentsData[eq.id] = []
          }
        }
        setIncidents(incidentsData)
      } catch (err) {
        logger.error('Error loading public equipment:', err instanceof Error ? err : new Error(String(err)))
        setError('Error al cargar la información de los equipos')
      } finally {
        setLoading(false)
      }
    }

    loadEquipments()
  }, [id])

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: equipments.length === 1 ? (equipments[0]?.nombre || 'Equipo') : 'Equipos',
          text: 'Información de equipos',
          url,
        })
      } catch (_err) {
        // User cancelled or error
      }
    } else {
      // Fallback: copiar al portapapeles
      await navigator.clipboard.writeText(url)
      alert('Enlace copiado al portapapeles')
    }
  }

  const openLightbox = (photoUrl: string, index: number, total: number) => {
    setLightboxPhoto({ url: photoUrl, index, total })
  }

  const closeLightbox = () => {
    setLightboxPhoto(null)
  }

  const navigatePhoto = (direction: 'prev' | 'next', allPhotos: string[]) => {
    if (!lightboxPhoto) return
    const newIndex = direction === 'prev' 
      ? Math.max(0, lightboxPhoto.index - 1)
      : Math.min(allPhotos.length - 1, lightboxPhoto.index + 1)
    const newUrl = allPhotos[newIndex]
    if (newUrl) {
      setLightboxPhoto({
        url: newUrl,
        index: newIndex,
        total: allPhotos.length
      })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="h-12 w-12 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Cargando información...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Error</h2>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl md:text-2xl font-bold">
                  {equipments.length === 1 ? (equipments[0]?.nombre || 'Equipo') : `${equipments.length} Equipos`}
                </h1>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Vista pública - Solo lectura
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Compartir</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="space-y-6">
          {equipments.map((equipment) => {
            const StatusIcon = STATUS_CONFIG[equipment.estado].icon
            const equipmentIncidents = incidents[equipment.id] || []
            const equipmentNotes = notesById[equipment.id] || []
            
            return (
              <Card key={equipment.id} className="overflow-hidden">
                <CardHeader className="pb-3 bg-muted/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-xl md:text-2xl">{equipment.nombre}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1 font-mono">{equipment.codigo}</p>
                    </div>
                    <StatusIcon className={`h-6 w-6 shrink-0 ${STATUS_CONFIG[equipment.estado].className}`} />
                  </div>
                  
                  {/* Estado y Criticidad */}
                  <div className="flex gap-2 mt-3">
                    <Badge className={STATUS_CONFIG[equipment.estado].className}>
                      {STATUS_CONFIG[equipment.estado].label}
                    </Badge>
                    <Badge className={CRITICIDAD_CONFIG[equipment.criticidad].className}>
                      Criticidad: {CRITICIDAD_CONFIG[equipment.criticidad].label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 pt-6">
                  {/* Ubicación */}
                  {equipment.hierarchyPath && (
                    <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-card">
                      <MapPin className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Ubicación</p>
                        <p className="text-sm">{equipment.hierarchyPath}</p>
                      </div>
                    </div>
                  )}

                  {/* Datos técnicos */}
                  {(equipment.marca || equipment.modelo || equipment.numeroSerie) && (
                    <div>
                      <h3 className="font-semibold mb-3 text-sm text-muted-foreground tracking-wide">
                        Datos Técnicos
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {equipment.marca && (
                          <div className="p-3 bg-muted/20 rounded-card">
                            <p className="text-xs text-muted-foreground mb-1">Marca</p>
                            <p className="font-medium">{equipment.marca}</p>
                          </div>
                        )}
                        {equipment.modelo && (
                          <div className="p-3 bg-muted/20 rounded-card">
                            <p className="text-xs text-muted-foreground mb-1">Modelo</p>
                            <p className="font-medium">{equipment.modelo}</p>
                          </div>
                        )}
                        {equipment.numeroSerie && (
                          <div className="p-3 bg-muted/20 rounded-card">
                            <p className="text-xs text-muted-foreground mb-1">Número de Serie</p>
                            <p className="font-medium font-mono text-sm">{equipment.numeroSerie}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fotos con Lightbox */}
                  {equipment.photos && equipment.photos.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3 text-sm text-muted-foreground tracking-wide flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        Fotos ({equipment.photos.length})
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {equipment.photos.map((photo, idx) => (
                          <button
                            key={idx}
                            onClick={() => openLightbox(photo, idx, equipment.photos?.length || 0)}
                            className="relative group overflow-hidden rounded-card border-2 border-transparent hover:border-primary transition-all aspect-square"
                          >
                            <img
                              src={photo}
                              alt={`Foto ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                              <div className="bg-white/90 px-2 py-1 rounded-ctl text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                Ver ampliada
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notas */}
                  {equipmentNotes.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3 text-sm text-muted-foreground tracking-wide flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Notas ({equipmentNotes.length})
                      </h3>
                      <div className="space-y-2">
                        {equipmentNotes.map((note) => (
                          <div key={note.id} className="p-3 bg-muted/20 rounded-card border">
                            <p className="text-sm">{note.text}</p>
                            <p className="text-xs text-muted-foreground mt-1">{note.createdAt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Últimas Incidencias */}
                  {equipmentIncidents.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3 text-sm text-muted-foreground tracking-wide flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Últimas Incidencias ({equipmentIncidents.length})
                      </h3>
                      <div className="space-y-2">
                        {equipmentIncidents.slice(0, 3).map((incident) => (
                          <div key={incident.id} className="p-3 bg-muted/20 rounded-card border">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-medium text-sm">{incident.titulo}</p>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {incident.prioridad}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(incident.createdAt).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })} • {incident.status}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-3 p-4 bg-muted/20 rounded-card">
                    <div className="bg-white p-3 rounded-card shadow-sm">
                      <QRCodeSVG
                        value={`${window.location.origin}/mantenimiento-planta/public/equipment/${equipment.id}`}
                        size={120}
                        level="H"
                        includeMargin
                      />
                    </div>
                    <p className="text-xs text-center text-muted-foreground max-w-xs">
                      Escanea este código para acceder a la información del equipo desde tu móvil
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Footer info */}
        <div className="mt-8 p-6 text-center border-t bg-muted/20 rounded-card">
          <Package className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">Vista pública de solo lectura</p>
          <p className="text-xs text-muted-foreground">
            Para acceder a funciones completas como edición, historial detallado y más,<br className="hidden md:inline" /> 
            inicia sesión en la aplicación de mantenimiento.
          </p>
        </div>
      </div>

      {/* Lightbox para fotos */}
      {lightboxPhoto && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </button>
          
          <div className="relative max-w-6xl max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* Navegación */}
            {lightboxPhoto.index > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const currentEquipment = equipments.find(eq => eq.photos?.includes(lightboxPhoto.url))
                  if (currentEquipment?.photos) navigatePhoto('prev', currentEquipment.photos)
                }}
                className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <ChevronLeft className="h-6 w-6 text-white" />
              </button>
            )}
            
            <img
              src={lightboxPhoto.url}
              alt={`Foto ${lightboxPhoto.index + 1} de ${lightboxPhoto.total}`}
              className="max-w-full max-h-[85vh] object-contain rounded-card"
            />
            
            {lightboxPhoto.index < lightboxPhoto.total - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const currentEquipment = equipments.find(eq => eq.photos?.includes(lightboxPhoto.url))
                  if (currentEquipment?.photos) navigatePhoto('next', currentEquipment.photos)
                }}
                className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <ChevronRight className="h-6 w-6 text-white" />
              </button>
            )}
            
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 rounded-full text-white text-sm font-medium">
              {lightboxPhoto.index + 1} / {lightboxPhoto.total}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
