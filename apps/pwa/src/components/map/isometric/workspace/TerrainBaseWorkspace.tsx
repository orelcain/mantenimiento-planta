import { Card, CardContent } from '@/components/ui'
import type { IsometricMap } from '@/types/isometricMap'
import { TerrainImportPanel } from './TerrainImportPanel'
import type { TerrainImportPreview, TerrainImportProgress } from '@/lib/terrainImport'

interface TerrainBaseWorkspaceProps {
  currentMapId: string
  savedMaps: IsometricMap[]
  isLoadingMaps: boolean
  onLoadMap: (mapId: string) => void
  mapName: string
  onMapNameChange: (value: string) => void
  mapDescription: string
  onMapDescriptionChange: (value: string) => void
  mapWidth: number
  mapDepth: number
  terrainTileCount: number
  currentFloorLabel: string
  mapStatusText: string
  realTerrainImportMessage?: string | null
  onCreateBlankMap: () => void
  onFitMapComplete: () => void
  onImportRealTerrain: () => void
  onSave: () => void
  onSaveAsNew: () => void
  isImportingRealTerrain: boolean
  isSaving: boolean
  terrainImportCoordinatesText: string
  onTerrainImportCoordinatesTextChange: (value: string) => void
  terrainImportSampleStep: number
  onTerrainImportSampleStepChange: (value: number) => void
  terrainImportPreview?: TerrainImportPreview | null
  terrainImportPreviewError?: string | null
  terrainImportProgress?: TerrainImportProgress | null
}

export function TerrainBaseWorkspace({
  currentMapId: _currentMapId,
  savedMaps: _savedMaps,
  isLoadingMaps: _isLoadingMaps,
  onLoadMap: _onLoadMap,
  mapName: _mapName,
  onMapNameChange: _onMapNameChange,
  mapDescription: _mapDescription,
  onMapDescriptionChange: _onMapDescriptionChange,
  mapWidth: _mapWidth,
  mapDepth: _mapDepth,
  terrainTileCount: _terrainTileCount,
  currentFloorLabel: _currentFloorLabel,
  mapStatusText: _mapStatusText,
  realTerrainImportMessage,
  onCreateBlankMap: _onCreateBlankMap,
  onFitMapComplete: _onFitMapComplete,
  onImportRealTerrain,
  onSave: _onSave,
  onSaveAsNew: _onSaveAsNew,
  isImportingRealTerrain,
  isSaving: _isSaving,
  terrainImportCoordinatesText,
  onTerrainImportCoordinatesTextChange,
  terrainImportSampleStep,
  onTerrainImportSampleStepChange,
  terrainImportPreview,
  terrainImportPreviewError,
  terrainImportProgress,
}: TerrainBaseWorkspaceProps) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">Importación del mapa base</h2>
          <p className="text-xs text-muted-foreground">
            Dejamos esta etapa en modo mínimo: importar terreno desde 4 coordenadas, revisar el resultado en el canvas y seguir construyendo desde ahí.
          </p>
        </div>

        <div className="mx-auto w-full max-w-[420px]">
          <TerrainImportPanel
            title="Coordenadas del terreno"
            description="Usa exactamente 4 lineas en formato lat, lon. Por ahora ocultamos el resto del flujo para concentrarnos solo en importar bien la base."
            importLabel="Aplicar importacion"
            importBusyLabel="Importando..."
            isImporting={isImportingRealTerrain}
            onImport={onImportRealTerrain}
            coordinatesText={terrainImportCoordinatesText}
            onCoordinatesTextChange={onTerrainImportCoordinatesTextChange}
            sampleStep={terrainImportSampleStep}
            onSampleStepChange={onTerrainImportSampleStepChange}
            statusMessage={realTerrainImportMessage}
            preview={terrainImportPreview}
            previewError={terrainImportPreviewError}
            progress={terrainImportProgress}
            coordinateRows={6}
          />
        </div>

        <p className="text-[11px] text-muted-foreground">
          {realTerrainImportMessage ?? 'Todavía no has importado terreno en esta sesión.'}
        </p>
      </CardContent>
    </Card>
  )
}