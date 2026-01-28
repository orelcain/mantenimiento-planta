/**
 * MapLocationSelector - Modal para seleccionar ubicación y colocar marcador
 * 
 * Flujo:
 * 1. Seleccionar ubicación (Planta Principal, etc.)
 * 2. Ver mapa de la ubicación
 * 3. Colocar marcador
 * 4. Confirmar posición
 */

import { useState, useEffect } from 'react'
import { MapPin, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MapViewer } from './MapViewer'
import { getMapLocations, getLatestMapVersion } from '@/services/maps'
import type { MapLocation, MapVersion } from '@/types/maps'
import { cn } from '@/lib/utils'

interface MapLocationSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (data: {
    locationId: string
    locationName: string
    mapVersionId: string
    position: { x: number; y: number }
  }) => void
  title?: string
}

type Step = 'select-location' | 'place-marker'

export function MapLocationSelector({
  open,
  onOpenChange,
  onConfirm,
  title = 'Seleccionar Ubicación en Mapa',
}: MapLocationSelectorProps) {
  const [step, setStep] = useState<Step>('select-location')
  const [locations, setLocations] = useState<MapLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null)
  const [mapVersion, setMapVersion] = useState<MapVersion | null>(null)
  const [loadingMap, setLoadingMap] = useState(false)

  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null)

  // Cargar ubicaciones al abrir
  useEffect(() => {
    if (open) {
      loadLocations()
    } else {
      // Reset state al cerrar
      setStep('select-location')
      setSelectedLocation(null)
      setMapVersion(null)
      setPendingPosition(null)
    }
  }, [open])

  const loadLocations = async () => {
    setLoading(true)
    setError(null)
    try {
      const locs = await getMapLocations()
      setLocations(locs)
    } catch (e) {
      setError('Error al cargar ubicaciones')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectLocation = async (location: MapLocation) => {
    setSelectedLocation(location)
    setLoadingMap(true)
    setError(null)

    try {
      const version = await getLatestMapVersion(location.id)
      if (!version) {
        setError(`No hay mapas cargados para "${location.nombre}"`)
        setLoadingMap(false)
        return
      }
      setMapVersion(version)
      setStep('place-marker')
    } catch (e) {
      setError('Error al cargar el mapa')
      console.error(e)
    } finally {
      setLoadingMap(false)
    }
  }

  const handlePositionSelect = (position: { x: number; y: number }) => {
    setPendingPosition(position)
  }

  const handlePositionConfirm = () => {
    if (!selectedLocation || !mapVersion || !pendingPosition) return

    onConfirm({
      locationId: selectedLocation.id,
      locationName: selectedLocation.nombre,
      mapVersionId: mapVersion.id,
      position: pendingPosition,
    })
    onOpenChange(false)
  }

  const handleBack = () => {
    setStep('select-location')
    setMapVersion(null)
    setPendingPosition(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Paso 1: Seleccionar ubicación */}
          {step === 'select-location' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <p className="text-sm text-muted-foreground mb-4">
                Selecciona la ubicación donde se encuentra el problema:
              </p>

              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg">
                  <AlertCircle className="h-5 w-5" />
                  {error}
                </div>
              )}

              {!loading && locations.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay ubicaciones configuradas</p>
                  <p className="text-sm">Un administrador debe cargar mapas primero</p>
                </div>
              )}

              {!loading && locations.length > 0 && (
                <div className="grid gap-2">
                  {locations.map((location) => (
                    <button
                      key={location.id}
                      onClick={() => handleSelectLocation(location)}
                      disabled={loadingMap}
                      className={cn(
                        'w-full p-4 text-left border rounded-lg transition-all',
                        'hover:border-primary hover:bg-primary/5',
                        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        selectedLocation?.id === location.id && loadingMap && 'border-primary bg-primary/5'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{location.nombre}</div>
                          {location.descripcion && (
                            <div className="text-sm text-muted-foreground">{location.descripcion}</div>
                          )}
                        </div>
                        {selectedLocation?.id === location.id && loadingMap ? (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Paso 2: Colocar marcador */}
          {step === 'place-marker' && mapVersion && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleBack}>
                    ← Cambiar
                  </Button>
                  <span className="text-sm font-medium">{selectedLocation?.nombre}</span>
                  <span className="text-xs text-muted-foreground">(v{mapVersion.version})</span>
                </div>
              </div>

              <div className="flex-1 p-2">
                <MapViewer
                  mapVersion={mapVersion}
                  editable
                  pendingPosition={pendingPosition}
                  onPositionSelect={handlePositionSelect}
                  onPositionConfirm={handlePositionConfirm}
                  onPositionCancel={() => setPendingPosition(null)}
                  className="h-full"
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
