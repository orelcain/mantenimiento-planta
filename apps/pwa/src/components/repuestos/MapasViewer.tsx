import { useState, useMemo } from 'react'
import { MapPin, Plus, X, Check } from 'lucide-react'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Input, Label, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui'
import type { PlantMap, PlantMarker, PlantAsset } from '@/types/repuestos'

interface MapasViewerProps {
  maps: PlantMap[]
  assets: PlantAsset[]
  loading: boolean
  onMarkerClick?: (marker: PlantMarker, map: PlantMap) => void
  onCreateMarker?: (assetId: string, mapId: string, x: number, y: number, label?: string) => Promise<void>
  onDeleteMarker?: (assetId: string, markerId: string) => Promise<void>
  selectedAssetId?: string | null
}

export function MapasViewer({ maps, assets, loading, onMarkerClick, onCreateMarker, onDeleteMarker, selectedAssetId }: MapasViewerProps) {
  const [selectedMap, setSelectedMap] = useState<PlantMap | null>(maps[0] || null)
  const [showAddMarker, setShowAddMarker] = useState(false)
  const [markerPosition, setMarkerPosition] = useState<{ x: number; y: number } | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newMarkerAssetId, setNewMarkerAssetId] = useState<string>('')
  const [newMarkerLabel, setNewMarkerLabel] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null)

  // Obtener marcadores del asset para este mapa
  const mapMarkers = useMemo(() => {
    if (!selectedMap) return []
    const markers: Array<{ marker: PlantMarker; asset: PlantAsset }> = []
    for (const asset of assets) {
      for (const marker of asset.marcadores || []) {
        if (marker.mapId === selectedMap.id) {
          markers.push({ marker, asset })
        }
      }
    }
    return markers
  }, [selectedMap, assets])

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showAddMarker) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    const position = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
    setMarkerPosition(position)
    setNewMarkerAssetId(selectedAssetId || '')
    setShowCreateDialog(true)
  }

  const handleCreateMarker = async () => {
    if (!markerPosition || !selectedMap || !newMarkerAssetId || !onCreateMarker) return
    
    setIsCreating(true)
    try {
      await onCreateMarker(
        newMarkerAssetId,
        selectedMap.id,
        markerPosition.x,
        markerPosition.y,
        newMarkerLabel.trim() || undefined
      )
      setShowCreateDialog(false)
      setMarkerPosition(null)
      setNewMarkerLabel('')
      setShowAddMarker(false)
    } catch (err) {
      console.error('Error creando marcador:', err)
      alert(err instanceof Error ? err.message : 'Error al crear marcador')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteMarker = async (asset: PlantAsset, markerId: string) => {
    if (!onDeleteMarker || !confirm('¿Eliminar este marcador?')) return
    
    setIsDeletingId(markerId)
    try {
      await onDeleteMarker(asset.id, markerId)
    } catch (err) {
      console.error('Error eliminando marcador:', err)
      alert(err instanceof Error ? err.message : 'Error al eliminar marcador')
    } finally {
      setIsDeletingId(null)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando mapas...</div>
  }

  if (!selectedMap) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No hay mapas disponibles</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Selector de mapas */}
      {maps.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {maps.map((map) => (
            <button
              key={map.id}
              onClick={() => setSelectedMap(map)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${
                selectedMap.id === map.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {map.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Visor de mapa */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{selectedMap.nombre}</h3>
          <Button
            variant={showAddMarker ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => {
              setShowAddMarker(!showAddMarker)
              setMarkerPosition(null)
            }}
          >
            {showAddMarker ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Agregar marcador
              </>
            )}
          </Button>
        </div>

        <div
          onClick={handleMapClick}
          className={`relative w-full aspect-video rounded-lg border bg-muted overflow-hidden ${
            showAddMarker ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          {/* Imagen del mapa */}
          <img
            src={selectedMap.imageUrl}
            alt={selectedMap.nombre}
            className="w-full h-full object-cover"
          />

          {/* Marcadores */}
          {mapMarkers.map(({ marker, asset }) => {
            const isSelected = selectedAssetId === asset.id
            const isDeleting = isDeletingId === marker.id
            return (
              <div
                key={marker.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{
                  left: `${marker.x * 100}%`,
                  top: `${marker.y * 100}%`,
                }}
              >
                <button
                  onClick={() => onMarkerClick?.(marker, selectedMap)}
                  className="relative"
                  title={`${asset.equipo} - ${marker.label || 'Sin etiqueta'}`}
                  disabled={isDeleting}
                >
                  <div className="relative">
                    <div className={`w-6 h-6 rounded-full border-2 shadow-lg cursor-pointer hover:scale-125 transition-transform ${
                      isSelected ? 'bg-yellow-500 border-yellow-300 ring-2 ring-yellow-300' : 'bg-blue-500 border-white'
                    } ${isDeleting ? 'opacity-50' : ''}`} />
                    <div className="absolute left-full ml-2 top-0 bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="font-medium">{asset.equipo}</div>
                      <div className="text-muted-foreground">{marker.label}</div>
                    </div>
                  </div>
                </button>
                {onDeleteMarker && (
                  <button
                    onClick={() => handleDeleteMarker(asset, marker.id)}
                    disabled={isDeleting}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600 disabled:opacity-50"
                    title="Eliminar marcador"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                )}
              </div>
            )
          })}

          {/* Posición del nuevo marcador */}
          {markerPosition && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${markerPosition.x * 100}%`,
                top: `${markerPosition.y * 100}%`,
              }}
            >
              <div className="w-6 h-6 bg-yellow-400 rounded-full border-2 border-white shadow-lg ring-2 ring-yellow-300 animate-pulse" />
            </div>
          )}
        </div>

        {/* Info de marcadores */}
        <div className="text-xs text-muted-foreground">
          {mapMarkers.length} marcadores {showAddMarker && !markerPosition && '→ haz clic en el mapa para ubicar'}
        </div>
      </div>

      {/* Dialog para crear marcador */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo marcador en {selectedMap?.nombre}</DialogTitle>
            <DialogDescription>
              Selecciona el motor/bomba y opcionalmente una etiqueta para el marcador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="asset">Motor/Bomba *</Label>
              <Select value={newMarkerAssetId} onValueChange={setNewMarkerAssetId}>
                <SelectTrigger id="asset">
                  <SelectValue placeholder="Selecciona equipo" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.equipo} ({asset.area})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Etiqueta (opcional)</Label>
              <Input
                id="label"
                placeholder="Ej: Entrada, Salida, Principal..."
                value={newMarkerLabel}
                onChange={(e) => setNewMarkerLabel(e.target.value)}
                maxLength={50}
              />
            </div>
            {markerPosition && (
              <div className="text-xs text-muted-foreground">
                Posición: {Math.round(markerPosition.x * 100)}%, {Math.round(markerPosition.y * 100)}%
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false)
                setMarkerPosition(null)
              }}
              disabled={isCreating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateMarker}
              disabled={!newMarkerAssetId || isCreating}
            >
              {isCreating ? (
                'Guardando...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Crear
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lista de marcadores en este mapa */}
      {mapMarkers.length > 0 && (
        <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
          <div className="text-sm font-medium">Motores/Bombas en este mapa:</div>
          <div className="space-y-1">
            {mapMarkers.map(({ marker, asset }) => (
              <div key={marker.id} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                <span className="font-medium">{asset.equipo}</span>
                {marker.label && <span className="text-muted-foreground">({marker.label})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
