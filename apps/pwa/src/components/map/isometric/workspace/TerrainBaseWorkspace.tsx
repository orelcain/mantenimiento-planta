import { Card, CardContent } from '@/components/ui'
import type { IsometricMap } from '@/types/isometricMap'
import { TerrainImportPanel } from './TerrainImportPanel'
import type { TerrainImportPreview, TerrainImportProgress } from '@/lib/terrainImport'
import { TerrainGeoPreview } from './TerrainGeoPreview'
import { useState } from 'react'

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
  const [panelVisible, setPanelVisible] = useState(false)

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Base georreferenciada</h2>
            <p className="text-xs text-muted-foreground">Enfoquemos esta etapa solo en las 4 coordenadas y la vista real que vamos a usar.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPanelVisible((v) => !v)}
              className="rounded-md border bg-muted/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {panelVisible ? 'Ocultar coordenadas' : 'Editar coordenadas'}
            </button>
            <div className="text-[11px] text-muted-foreground">
              {terrainTileCount > 0
                ? 'Base cargada.'
                : 'Define el rectángulo real antes de pasar al editor.'}
            </div>
          </div>
        </div>

        <div className={panelVisible ? 'grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start' : ''}>
          {panelVisible && (
            <div className="w-full xl:sticky xl:top-4">
            <TerrainImportPanel
              title="4 coordenadas del terreno"
              description="Usa exactamente 4 líneas en formato lat, lon. Este es el bloque principal para definir la base real antes de importarla."
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
              coordinateRows={terrainTileCount > 0 ? 8 : 9}
            />
          </div>
          )}

          <TerrainGeoPreview
            coordinatesText={terrainImportCoordinatesText}
            preview={terrainImportPreview}
            previewError={terrainImportPreviewError}
            statusMessage={realTerrainImportMessage}
            isImporting={isImportingRealTerrain}
            mapHeightClassName="h-[520px] md:h-[620px] xl:h-[700px]"
          />
        </div>
      </CardContent>
    </Card>
  )
}