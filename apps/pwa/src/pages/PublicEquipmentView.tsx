import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Package, MapPin, AlertCircle, CheckCircle2, Settings, XCircle, Image as ImageIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { getEquipments } from '@/services/equipment'
import type { Equipment } from '@/types'
import { logger } from '@/lib/logger'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      } catch (err) {
        logger.error('Error loading public equipment:', err instanceof Error ? err : new Error(String(err)))
        setError('Error al cargar la información de los equipos')
      } finally {
        setLoading(false)
      }
    }

    loadEquipments()
  }, [id])

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
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">
                {equipments.length === 1 ? 'Información de Equipo' : `${equipments.length} Equipos`}
              </h1>
              <p className="text-sm text-muted-foreground">
                Vista pública - Solo lectura
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {equipments.map((equipment) => {
            const StatusIcon = STATUS_CONFIG[equipment.estado].icon
            
            return (
              <Card key={equipment.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{equipment.nombre}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{equipment.codigo}</p>
                    </div>
                    <StatusIcon className={`h-5 w-5 shrink-0 ${STATUS_CONFIG[equipment.estado].className}`} />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Estado y Criticidad */}
                  <div className="flex gap-2">
                    <Badge className={STATUS_CONFIG[equipment.estado].className}>
                      {STATUS_CONFIG[equipment.estado].label}
                    </Badge>
                    <Badge className={CRITICIDAD_CONFIG[equipment.criticidad].className}>
                      {CRITICIDAD_CONFIG[equipment.criticidad].label}
                    </Badge>
                  </div>

                  {/* Ubicación */}
                  {equipment.hierarchyPath && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">{equipment.hierarchyPath}</span>
                    </div>
                  )}

                  {/* Datos técnicos */}
                  {(equipment.marca || equipment.modelo || equipment.numeroSerie) && (
                    <div className="space-y-1 text-sm">
                      {equipment.marca && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Marca:</span>
                          <span className="font-medium">{equipment.marca}</span>
                        </div>
                      )}
                      {equipment.modelo && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Modelo:</span>
                          <span className="font-medium">{equipment.modelo}</span>
                        </div>
                      )}
                      {equipment.numeroSerie && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Serie:</span>
                          <span className="font-medium">{equipment.numeroSerie}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fotos */}
                  {equipment.photos && equipment.photos.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ImageIcon className="h-4 w-4" />
                        <span>{equipment.photos.length} {equipment.photos.length === 1 ? 'foto' : 'fotos'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {equipment.photos.slice(0, 3).map((photo, idx) => (
                          <img
                            key={idx}
                            src={photo}
                            alt={`Foto ${idx + 1}`}
                            className="w-full h-20 object-cover rounded border"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* QR Code */}
                  <div className="flex justify-center pt-2">
                    <div className="bg-white p-2 rounded border">
                      <QRCodeSVG
                        value={`${window.location.origin}/public/equipment/${equipment.id}`}
                        size={80}
                        level="M"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Esta es una vista pública de solo lectura.</p>
          <p>Para acceder a funciones completas, inicia sesión en la aplicación.</p>
        </div>
      </div>
    </div>
  )
}
