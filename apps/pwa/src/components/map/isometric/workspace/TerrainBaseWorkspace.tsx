import { Card, CardContent } from '@/components/ui'
import type { IsometricMap } from '@/types/isometricMap'
import { TerrainImportPanel } from './TerrainImportPanel'
import type { TerrainImportPreview, TerrainImportProgress } from '@/lib/terrainImport'
import { TerrainGeoPreview } from './TerrainGeoPreview'

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
  terrainTileCount,
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
            {terrainTileCount > 0
              ? 'La base ya tiene terreno cargado. Dejamos este panel compacto para reintentar importación o ajustar coordenadas sin ocupar tanto alto.'
              : 'Dejamos esta etapa en modo mínimo: importar terreno desde 4 coordenadas, revisar el resultado en el canvas y seguir construyendo desde ahí.'}
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="w-full">
            <TerrainImportPanel
              title="Coordenadas del terreno"
              description="Usa exactamente 4 lineas en formato lat, lon. Ahora el mapa base ya se puede revisar en georreferencia real antes de importarlo al canvas editable."
              layout="horizontal"
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
              coordinateRows={terrainTileCount > 0 ? 4 : 5}
            />
          </div>

          <TerrainGeoPreview
            coordinatesText={terrainImportCoordinatesText}
            preview={terrainImportPreview}
            previewError={terrainImportPreviewError}
            statusMessage={realTerrainImportMessage}
            isImporting={isImportingRealTerrain}
          />
        </div>

        <p className="text-[11px] text-muted-foreground">
          {realTerrainImportMessage ?? 'Todavía no has importado terreno en esta sesión.'}
        </p>
      </CardContent>
    </Card>
  )
}