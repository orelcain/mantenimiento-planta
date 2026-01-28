/**
 * MapViewPage - Visualización de Mapas con Marcadores
 * 
 * Muestra un mapa interactivo con todos los marcadores de incidencias
 * e inspecciones. Permite filtrar por fecha, inspección y tipo.
 */

import { useState, useEffect, useMemo } from 'react'
import { 
  MapPin, 
  Filter, 
  List,
  X,
  FileText,
  Download
} from 'lucide-react'
import { 
  Button, 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  Badge,
  Spinner,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Label
} from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { 
  getMapLocations,
  getLatestMapVersion,
  getMarkersByLocation,
  getAllInspections,
  getInspectionItems
} from '@/services/maps'
import { MapViewer } from '@/components/maps'
import { exportMapViewToPDF } from '@/utils/maps'
import { formatDate } from '@/lib/utils'
import type { 
  MapLocation, 
  MapVersion,
  MapMarker,
  Inspection,
  InspectionItem
} from '@/types/maps'

// Marcador extendido con info para visualización
interface ExtendedMarker {
  id: string
  position: { x: number; y: number }
  title?: string
  label?: string
  inspectionIndex?: number
  type: 'incidencia' | 'inspeccion'
  inspectionId?: string
  inspectionName?: string
  itemTitle?: string
  itemDescription?: string
  createdAt: Date
}

export function MapViewPage() {
  const { toast } = useToast()
  
  // Estados principales
  const [locations, setLocations] = useState<MapLocation[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [currentMapVersion, setCurrentMapVersion] = useState<MapVersion | null>(null)
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [inspectionItemsMap, setInspectionItemsMap] = useState<Record<string, InspectionItem[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  
  // Filtros
  const [showFilters, setShowFilters] = useState(false)
  const [filterInspectionId, setFilterInspectionId] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('all')
  
  // Marcador seleccionado para popup
  const [selectedMarker, setSelectedMarker] = useState<ExtendedMarker | null>(null)
  
  // Cargar ubicaciones al montar
  useEffect(() => {
    loadLocations()
  }, [])
  
  // Cargar datos cuando se selecciona una ubicación
  useEffect(() => {
    if (selectedLocationId) {
      loadLocationData(selectedLocationId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId])
  
  const loadLocations = async () => {
    try {
      const data = await getMapLocations()
      setLocations(data)
      // Seleccionar primera ubicación automáticamente
      if (data.length > 0 && data[0]) {
        setSelectedLocationId(data[0].id)
      }
    } catch (error) {
      console.error('Error loading locations:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las ubicaciones',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  const loadLocationData = async (locationId: string) => {
    setIsLoading(true)
    try {
      // Cargar mapa, marcadores e inspecciones en paralelo
      const [mapVersion, markersData, inspectionsData] = await Promise.all([
        getLatestMapVersion(locationId),
        getMarkersByLocation(locationId),
        getAllInspections()
      ])
      
      setCurrentMapVersion(mapVersion)
      setMarkers(markersData)
      
      // Filtrar inspecciones por esta ubicación
      const locationInspections = inspectionsData.filter(i => i.locationId === locationId)
      setInspections(locationInspections)
      
      // Cargar items de cada inspección
      const itemsMap: Record<string, InspectionItem[]> = {}
      for (const inspection of locationInspections) {
        const items = await getInspectionItems(inspection.id)
        itemsMap[inspection.id] = items
      }
      setInspectionItemsMap(itemsMap)
      
    } catch (error) {
      console.error('Error loading location data:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del mapa',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  // Convertir marcadores a formato extendido con info de inspección
  const extendedMarkers = useMemo((): ExtendedMarker[] => {
    const result: ExtendedMarker[] = []
    
    // Procesar marcadores de inspecciones
    for (const [inspectionId, items] of Object.entries(inspectionItemsMap)) {
      const inspection = inspections.find(i => i.id === inspectionId)
      
      for (const item of items) {
        result.push({
          id: item.id,
          position: item.position,
          title: item.title,
          label: `${item.order}`,
          inspectionIndex: item.order,
          type: 'inspeccion',
          inspectionId,
          inspectionName: inspection?.nombre,
          itemTitle: item.title,
          itemDescription: item.description,
          createdAt: item.createdAt
        })
      }
    }
    
    // Procesar marcadores individuales (incidencias sin inspección)
    for (const marker of markers) {
      // Saltar si ya está incluido como item de inspección
      if (marker.inspectionId) continue
      
      result.push({
        id: marker.id,
        position: marker.position,
        label: marker.label,
        type: 'incidencia',
        createdAt: marker.createdAt
      })
    }
    
    return result
  }, [markers, inspections, inspectionItemsMap])
  
  // Aplicar filtros
  const filteredMarkers = useMemo((): ExtendedMarker[] => {
    let result = [...extendedMarkers]
    
    // Filtrar por tipo
    if (filterType !== 'all') {
      result = result.filter(m => m.type === filterType)
    }
    
    // Filtrar por inspección
    if (filterInspectionId !== 'all') {
      result = result.filter(m => m.inspectionId === filterInspectionId)
    }
    
    // Filtrar por fecha desde
    if (filterDateFrom) {
      const from = new Date(filterDateFrom)
      from.setHours(0, 0, 0, 0)
      result = result.filter(m => m.createdAt >= from)
    }
    
    // Filtrar por fecha hasta
    if (filterDateTo) {
      const to = new Date(filterDateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(m => m.createdAt <= to)
    }
    
    return result
  }, [extendedMarkers, filterType, filterInspectionId, filterDateFrom, filterDateTo])
  
  // Limpiar filtros
  const clearFilters = () => {
    setFilterType('all')
    setFilterInspectionId('all')
    setFilterDateFrom('')
    setFilterDateTo('')
  }
  
  const hasActiveFilters = filterType !== 'all' || filterInspectionId !== 'all' || filterDateFrom || filterDateTo
  
  // Manejar click en marcador
  const handleMarkerClick = (marker: ExtendedMarker) => {
    setSelectedMarker(marker)
  }
  
  // Exportar PDF
  const handleExportPDF = async () => {
    if (!currentMapVersion || !selectedLocation) return
    
    try {
      toast({
        title: 'Generando PDF...',
        description: 'Por favor espera un momento'
      })
      
      // Preparar marcadores para exportación
      const markersForExport = filteredMarkers.map((m, idx) => ({
        order: idx + 1,
        position: m.position,
        title: m.itemTitle || m.title || 'Sin título',
        description: m.itemDescription,
        type: m.type,
        inspectionName: m.inspectionName,
        createdAt: m.createdAt
      }))
      
      await exportMapViewToPDF(
        selectedLocation.nombre,
        currentMapVersion,
        markersForExport
      )
      
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
  
  const selectedLocation = locations.find(l => l.id === selectedLocationId)
  
  if (isLoading && locations.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  
  if (locations.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sin ubicaciones</h2>
            <p className="text-muted-foreground text-center max-w-md">
              No hay ubicaciones con mapas configurados. 
              Un administrador debe subir mapas desde la sección de administración.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" />
            Vista de Mapa
          </h1>
          <p className="text-muted-foreground">
            Visualiza todos los marcadores de incidencias e inspecciones
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportPDF}
            disabled={!currentMapVersion || filteredMarkers.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
            className="relative"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-primary rounded-full" />
            )}
          </Button>
        </div>
      </div>
      
      {/* Selector de ubicación */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {locations.map(location => (
              <Button
                key={location.id}
                variant={selectedLocationId === location.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedLocationId(location.id)}
              >
                <MapPin className="h-4 w-4 mr-1" />
                {location.nombre}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Panel de filtros */}
      {showFilters && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Filtros</CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="inspeccion">Inspecciones</SelectItem>
                  <SelectItem value="incidencia">Incidencias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Inspección */}
            <div className="space-y-2">
              <Label>Inspección</Label>
              <Select value={filterInspectionId} onValueChange={setFilterInspectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las inspecciones</SelectItem>
                  {inspections.map(insp => (
                    <SelectItem key={insp.id} value={insp.id}>
                      {insp.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Fecha desde */}
            <div className="space-y-2">
              <Label>Desde</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
              />
            </div>
            
            {/* Fecha hasta */}
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{filteredMarkers.length}</div>
            <div className="text-xs text-muted-foreground">Marcadores</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">
              {filteredMarkers.filter(m => m.type === 'inspeccion').length}
            </div>
            <div className="text-xs text-muted-foreground">De inspecciones</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">
              {filteredMarkers.filter(m => m.type === 'incidencia').length}
            </div>
            <div className="text-xs text-muted-foreground">Incidencias</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{inspections.length}</div>
            <div className="text-xs text-muted-foreground">Inspecciones</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Mapa principal */}
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-[500px]">
              <Spinner className="h-8 w-8" />
            </div>
          ) : !currentMapVersion ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                No hay mapas disponibles para {selectedLocation?.nombre || 'esta ubicación'}
              </p>
            </div>
          ) : (
            <MapViewer
              imageUrl={currentMapVersion.imageUrl}
              markers={filteredMarkers.map(m => ({
                id: m.id,
                position: m.position,
                title: m.title || m.itemTitle,
                label: m.label,
                inspectionIndex: m.inspectionIndex
              }))}
              onMarkerClick={(marker) => {
                const extended = filteredMarkers.find(m => m.id === marker.id)
                if (extended) handleMarkerClick(extended)
              }}
              selectedMarkerId={selectedMarker?.id}
              className="h-[500px] sm:h-[600px]"
              showControls
            />
          )}
        </CardContent>
      </Card>
      
      {/* Lista de marcadores (opcional, colapsable) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <List className="h-4 w-4" />
            Lista de puntos ({filteredMarkers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredMarkers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay marcadores que coincidan con los filtros
            </p>
          ) : (
            <div className="divide-y max-h-[300px] overflow-y-auto">
              {filteredMarkers.map(marker => (
                <div
                  key={marker.id}
                  className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedMarker?.id === marker.id ? 'bg-primary/10' : ''
                  }`}
                  onClick={() => handleMarkerClick(marker)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div 
                        className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-medium ${
                          marker.type === 'inspeccion' ? 'bg-blue-500' : 'bg-red-500'
                        }`}
                      >
                        {marker.label || <MapPin className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {marker.itemTitle || marker.title || 'Sin título'}
                        </p>
                        {marker.inspectionName && (
                          <p className="text-xs text-muted-foreground">
                            {marker.inspectionName}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatDate(marker.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={marker.type === 'inspeccion' ? 'default' : 'destructive'}>
                      {marker.type === 'inspeccion' ? 'Inspección' : 'Incidencia'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Modal de detalle del marcador */}
      <Dialog open={!!selectedMarker} onOpenChange={(open) => !open && setSelectedMarker(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div 
                className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-medium ${
                  selectedMarker?.type === 'inspeccion' ? 'bg-blue-500' : 'bg-red-500'
                }`}
              >
                {selectedMarker?.label || <MapPin className="h-4 w-4" />}
              </div>
              {selectedMarker?.itemTitle || selectedMarker?.title || 'Detalle del punto'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedMarker && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={selectedMarker.type === 'inspeccion' ? 'default' : 'destructive'}>
                  {selectedMarker.type === 'inspeccion' ? 'Inspección' : 'Incidencia'}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatDate(selectedMarker.createdAt)}
                </span>
              </div>
              
              {selectedMarker.inspectionName && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>Parte de: <strong>{selectedMarker.inspectionName}</strong></span>
                </div>
              )}
              
              {selectedMarker.itemDescription && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm">{selectedMarker.itemDescription}</p>
                </div>
              )}
              
              <div className="text-xs text-muted-foreground">
                Posición: ({(selectedMarker.position.x * 100).toFixed(1)}%, {(selectedMarker.position.y * 100).toFixed(1)}%)
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
